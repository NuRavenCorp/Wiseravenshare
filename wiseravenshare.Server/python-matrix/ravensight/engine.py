"""
ravensight/engine.py — Core production session orchestrator.

Hot state (roster, scene, cues) lives in per-pod dicts.
Redis pub/sub keeps pods in sync via the shared ConnectionManager.
Postgres stores the audit trail via RavensightStore.

Join flow:
  invited crew  →  auto_join  →  AUTO path  →  in crew immediately
  uninvited     →  auto_join  →  GREEN_ROOM path  →  awaits producer approval
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as aredis

from ravensight.roles import Role, Capability, CrewMember, ROLE_CAPS
from ravensight.session import (
    PodcastSession, SessionState, JoinPolicy, SceneState, Cue,
    ALLOWED_TRANSITIONS, generate_join_code,
)
from ravensight.store import RavensightStore

logger = logging.getLogger("ravensight.engine")


class RavensightEngine:
    """
    In-memory session state per pod. All WS fan-out goes through ConnectionManager
    so cross-pod delivery is handled transparently by Redis pub/sub.
    """

    def __init__(self, store: RavensightStore, ws_manager, redis_client: aredis.Redis) -> None:
        self.store = store
        self.ws    = ws_manager
        self.rc    = redis_client

        self.sessions:      dict[str, PodcastSession] = {}  # session_id → session
        self._by_code:      dict[str, str] = {}              # join_code → session_id
        self._user_session: dict[str, str] = {}              # user_id → session_id
        self._lock = asyncio.Lock()

    # ── session lifecycle ─────────────────────────────────────────────────

    async def create_session(
        self,
        creator_id: str,
        title: str,
        initial_roster: dict[str, Role],
        join_policy: JoinPolicy = JoinPolicy.AUTO_IF_INVITED,
    ) -> PodcastSession:
        """
        Producer creates a session with a pre-assigned role for each invited crew member.
        A unique 6-char join code is generated and de-duplicated in memory.
        """
        async with self._lock:
            # Ensure creator is in the roster with a production role
            if creator_id not in initial_roster:
                initial_roster = {creator_id: Role.PRODUCER, **initial_roster}

            code = generate_join_code()
            while code in self._by_code:
                code = generate_join_code()

            sid = str(uuid.uuid4())
            session = PodcastSession(
                id=sid,
                join_code=code,
                title=title,
                created_by=creator_id,
                created_at=time.time(),
                join_policy=join_policy,
                invited_roles=dict(initial_roster),
            )
            self.sessions[sid] = session
            self._by_code[code] = sid

        await self.store.create_session(
            sid, code, title, creator_id,
            session.state.value, session.join_policy.value,
        )
        logger.info("Session created: %s code=%s", sid, code)

        # Notify each invited user with their personalised role
        for uid, role in initial_roster.items():
            await self.ws.deliver(uid, {
                "type":       "ravensight.session.invited",
                "session_id": sid,
                "title":      title,
                "join_code":  code,
                "your_role":  role.value,
            })

        return session

    async def auto_join(
        self,
        user_id: str,
        join_code: str,
        client_role_hint: Optional[Role] = None,
    ) -> tuple[PodcastSession, str, Optional[Role]]:
        """
        Called when a user opens the studio link.
        Returns (session, path, assigned_role) where path is "auto" | "green_room".
        """
        join_code = join_code.upper().strip()
        async with self._lock:
            sid = self._by_code.get(join_code)
            if not sid:
                raise ValueError("Invalid join code")
            session = self.sessions.get(sid)
            if not session:
                raise ValueError("Session not found")
            if session.state == SessionState.ENDED:
                raise ValueError("Session has ended")
            if user_id in session.crew:
                # Idempotent — already joined
                return session, "auto", session.crew[user_id].role

            invited_role = session.invited_roles.get(user_id)
            role = invited_role or client_role_hint or Role.GUEST

            # Decide join path
            policy = session.join_policy
            if policy == JoinPolicy.OPEN:
                path = "auto"
            elif policy == JoinPolicy.AUTO_IF_INVITED:
                path = "auto" if invited_role else "green_room"
            elif policy == JoinPolicy.AUTO_IF_CREW:
                path = "auto" if invited_role else "green_room"
            else:  # MANUAL_APPROVAL
                path = "green_room"

            display = await self.store.get_display_name(user_id)
            member = CrewMember(
                user_id=user_id,
                display_name=display,
                role=role,
                joined_at=time.time(),
            )

            if path == "green_room":
                session.green_room[user_id] = member
            else:
                session.crew[user_id] = member
                self._user_session[user_id] = sid

        if path == "green_room":
            await self._notify_green_room_pending(session, member)
            await self.ws.deliver(user_id, {
                "type":       "ravensight.green_room.waiting",
                "session_id": session.id,
            })
        else:
            await self.store.record_join(
                session.id, user_id, role.value,
                member.invited_by,
                datetime.fromtimestamp(member.joined_at, tz=timezone.utc),
            )
            await self._announce_join(session, member)

        return session, path, role

    async def approve_green_room(
        self,
        approver_id: str,
        session_id: str,
        target_user_id: str,
        assigned_role: Optional[Role] = None,
    ) -> CrewMember:
        session = self._require(session_id)
        if not session.has_cap(approver_id, Capability.ADMIT_GUEST):
            raise PermissionError("Not permitted to admit guests")
        async with self._lock:
            member = session.green_room.pop(target_user_id, None)
            if not member:
                raise ValueError("User not in green room")
            if assigned_role:
                member.role = assigned_role
            session.crew[target_user_id] = member
            self._user_session[target_user_id] = session_id
        await self.store.record_join(
            session.id, target_user_id, member.role.value,
            member.invited_by,
            datetime.fromtimestamp(member.joined_at, tz=timezone.utc),
        )
        await self._announce_join(session, member)
        await self.ws.deliver(target_user_id, {
            "type":       "ravensight.green_room.admitted",
            "session_id": session_id,
            "role":       member.role.value,
        })
        return member

    async def reject_green_room(
        self, approver_id: str, session_id: str, target_user_id: str,
    ) -> None:
        session = self._require(session_id)
        if not session.has_cap(approver_id, Capability.KICK):
            raise PermissionError("Not permitted")
        async with self._lock:
            session.green_room.pop(target_user_id, None)
        await self.ws.deliver(target_user_id, {
            "type":       "ravensight.green_room.rejected",
            "session_id": session_id,
        })

    async def leave(self, user_id: str, session_id: str) -> None:
        async with self._lock:
            session = self.sessions.get(session_id)
            if not session:
                return
            session.crew.pop(user_id, None)
            session.green_room.pop(user_id, None)
            self._user_session.pop(user_id, None)
        if session:
            await self.store.record_leave(session_id, user_id)
            await self._broadcast_crew(session, {
                "type":       "ravensight.crew.left",
                "session_id": session_id,
                "user_id":    user_id,
            })

    async def end_session(self, user_id: str, session_id: str) -> None:
        session = self._require(session_id)
        if not session.has_cap(user_id, Capability.END_SESSION):
            raise PermissionError("Not permitted to end session")
        async with self._lock:
            session.state = SessionState.ENDED
            session.ended_at = time.time()
            for m in list(session.crew.values()):
                self._user_session.pop(m.user_id, None)
            session.crew.clear()
            session.green_room.clear()
        await self.store.update_state(
            session_id, SessionState.ENDED.value,
            ended_at=datetime.fromtimestamp(session.ended_at, tz=timezone.utc),
        )
        await self._broadcast_crew(session, {
            "type":       "ravensight.session.ended",
            "session_id": session_id,
        })

    # ── production controls ───────────────────────────────────────────────

    async def set_scene(
        self, user_id: str, session_id: str, **changes,
    ) -> SceneState:
        session = self._require(session_id)
        if not session.has_cap(user_id, Capability.SET_SCENE):
            raise PermissionError("Not permitted to change scene")
        for k, v in changes.items():
            if hasattr(session.scene, k):
                setattr(session.scene, k, v)
        await self.store.record_scene_event(session_id, user_id, changes)
        await self._broadcast_crew(session, {
            "type":       "ravensight.scene.updated",
            "session_id": session_id,
            "scene":      session.scene_dict(),
        })
        return session.scene

    async def issue_cue(
        self,
        user_id: str,
        session_id: str,
        message: str,
        target_role: Optional[Role] = None,
        target_user: Optional[str]  = None,
        severity: str = "info",
    ) -> Cue:
        session = self._require(session_id)
        if not session.has_cap(user_id, Capability.CUE_ROLE):
            raise PermissionError("Not permitted to issue cues")
        cue = Cue(
            id=str(uuid.uuid4()),
            issued_by=user_id,
            target_role=target_role,
            target_user=target_user,
            message=message,
            severity=severity,
        )
        session.cues.append(cue)
        if len(session.cues) > 500:
            session.cues = session.cues[-500:]
        await self.store.record_cue(
            cue.id, session_id, user_id,
            target_role.value if target_role else None,
            target_user, message, severity,
        )
        # Determine recipients
        if target_user:
            recipients = [target_user]
        elif target_role:
            recipients = [m.user_id for m in session.crew.values() if m.role == target_role]
        else:
            recipients = [m.user_id for m in session.crew.values() if m.role != Role.OBSERVER]
        await self._broadcast(recipients, {
            "type":       "ravensight.cue",
            "session_id": session_id,
            "cue": {
                "id":          cue.id,
                "issued_by":   cue.issued_by,
                "message":     cue.message,
                "severity":    cue.severity,
                "target_role": cue.target_role.value if cue.target_role else None,
                "target_user": cue.target_user,
                "ts":          cue.created_at,
            },
        })
        return cue

    async def push_script_line(
        self,
        user_id: str,
        session_id: str,
        line_id: str,
        text: str,
        target_role: Role = Role.HOST,
    ) -> dict:
        session = self._require(session_id)
        if not session.has_cap(user_id, Capability.SEND_SCRIPT_LINE):
            raise PermissionError("Not permitted to push script lines")
        line = {
            "id":          line_id,
            "text":        text,
            "target_role": target_role.value,
            "pushed_at":   time.time(),
            "pushed_by":   user_id,
        }
        session.current_script_line = line
        recipients = [m.user_id for m in session.crew.values() if m.role == target_role]
        await self._broadcast(recipients, {
            "type":       "ravensight.script.line",
            "session_id": session_id,
            "line":       line,
        })
        return line

    async def set_recording(
        self, user_id: str, session_id: str, active: bool,
    ) -> dict:
        session = self._require(session_id)
        cap = Capability.START_RECORDING if active else Capability.STOP_RECORDING
        if not session.has_cap(user_id, cap):
            raise PermissionError("Not permitted to control recording")
        session.recording = active
        session.recording_started_at = time.time() if active else None
        # Auto-advance state when recording starts
        if active and session.state == SessionState.LIVE:
            session.state = SessionState.RECORDING
        elif not active and session.state == SessionState.RECORDING:
            session.state = SessionState.LIVE
        await self.store.record_recording_event(session_id, user_id, active)
        await self._broadcast_crew(session, {
            "type":        "ravensight.recording",
            "session_id":  session_id,
            "active":      active,
            "by":          user_id,
            "started_at":  session.recording_started_at,
        })
        return {"recording": active, "started_at": session.recording_started_at}

    async def set_state(
        self, user_id: str, session_id: str, new_state: SessionState,
    ) -> None:
        session = self._require(session_id)
        if not (
            session.has_cap(user_id, Capability.START_SESSION)
            or session.has_cap(user_id, Capability.END_SESSION)
        ):
            raise PermissionError("Not permitted to change session state")
        allowed = ALLOWED_TRANSITIONS.get(session.state, set())
        if new_state not in allowed:
            raise ValueError(
                f"Cannot transition {session.state.value} → {new_state.value}"
            )
        session.state = new_state
        if new_state == SessionState.LIVE and session.went_live_at is None:
            session.went_live_at = time.time()
        went_live = (
            datetime.fromtimestamp(session.went_live_at, tz=timezone.utc)
            if session.went_live_at else None
        )
        await self.store.update_state(session_id, new_state.value, went_live_at=went_live)
        await self._broadcast_crew(session, {
            "type":       "ravensight.session.state",
            "session_id": session_id,
            "state":      new_state.value,
            "by":         user_id,
        })

    async def change_role(
        self, user_id: str, session_id: str,
        target_user_id: str, new_role: Role,
    ) -> None:
        session = self._require(session_id)
        if not session.has_cap(user_id, Capability.CHANGE_ROLE):
            raise PermissionError("Not permitted to change roles")
        member = session.crew.get(target_user_id)
        if not member:
            raise ValueError("User not in session")
        member.role = new_role
        await self._broadcast_crew(session, {
            "type":       "ravensight.crew.role_changed",
            "session_id": session_id,
            "user_id":    target_user_id,
            "role":       new_role.value,
        })

    # ── query helpers ─────────────────────────────────────────────────────

    def get_session_for_user(self, user_id: str) -> Optional[PodcastSession]:
        sid = self._user_session.get(user_id)
        return self.sessions.get(sid) if sid else None

    def get_session(self, session_id: str) -> Optional[PodcastSession]:
        return self.sessions.get(session_id)

    def get_session_by_code(self, code: str) -> Optional[PodcastSession]:
        sid = self._by_code.get(code.upper().strip())
        return self.sessions.get(sid) if sid else None

    # ── private helpers ───────────────────────────────────────────────────

    def _require(self, session_id: str) -> PodcastSession:
        s = self.sessions.get(session_id)
        if not s:
            raise ValueError("Session not found")
        return s

    async def _broadcast(self, user_ids: list[str], payload: dict) -> None:
        await asyncio.gather(
            *[self.ws.deliver(uid, payload) for uid in user_ids],
            return_exceptions=True,
        )

    async def _broadcast_crew(self, session: PodcastSession, payload: dict) -> None:
        await self._broadcast(
            [m.user_id for m in session.crew.values()], payload,
        )

    async def _announce_join(self, session: PodcastSession, member: CrewMember) -> None:
        await self._broadcast_crew(session, {
            "type":       "ravensight.crew.joined",
            "session_id": session.id,
            "member": {
                "user_id":      member.user_id,
                "display_name": member.display_name,
                "role":         member.role.value,
            },
            "roster": session.roster_list(),
        })

    async def _notify_green_room_pending(
        self, session: PodcastSession, member: CrewMember,
    ) -> None:
        approvers = [
            m.user_id for m in session.crew.values()
            if m.has(Capability.ADMIT_GUEST)
        ]
        await self._broadcast(approvers, {
            "type":       "ravensight.green_room.pending",
            "session_id": session.id,
            "member": {
                "user_id":      member.user_id,
                "display_name": member.display_name,
                "role":         member.role.value,
            },
        })
