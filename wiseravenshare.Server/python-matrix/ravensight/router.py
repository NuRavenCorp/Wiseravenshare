"""
ravensight/router.py — FastAPI REST + WebSocket endpoints for Ravensight.

REST endpoints:
  POST   /ravensight/sessions                        create session
  GET    /ravensight/sessions/{sid}                  get session state
  POST   /ravensight/sessions/{sid}/role             change crew member's role
  POST   /ravensight/sessions/{sid}/state            advance session state
  POST   /ravensight/sessions/{sid}/scene            update scene
  POST   /ravensight/sessions/{sid}/cue              issue a directorial cue
  POST   /ravensight/sessions/{sid}/script           push script line
  POST   /ravensight/sessions/{sid}/recording        start/stop recording
  POST   /ravensight/sessions/{sid}/green-room/approve  admit from green room
  POST   /ravensight/sessions/{sid}/green-room/reject   reject from green room
  POST   /ravensight/sessions/{sid}/leave            leave session
  GET    /ravensight/sessions/{sid}/cues             cue history
  GET    /ravensight/me/active-session               user's current session
  POST   /ravensight/sessions/{sid}/end              end session

WebSocket:
  WS     /ravensight/ws?user_id=...                 realtime channel
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from ravensight.roles import Role, Capability
from ravensight.session import SessionState, JoinPolicy

logger = logging.getLogger("ravensight.router")

router = APIRouter(prefix="/ravensight", tags=["ravensight"])


# ── request models ────────────────────────────────────────────────────────

class CreateSessionReq(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    initial_roster: dict[str, str] = Field(
        default_factory=dict,
        description="user_id → role value (host, director, producer, camera, etc.)",
    )
    join_policy: str = "auto_if_invited"


class SetRoleReq(BaseModel):
    target_user_id: str
    role: str


class SetStateReq(BaseModel):
    state: str


class SetSceneReq(BaseModel):
    active_scene:   Optional[str]  = None
    camera_layout:  Optional[str]  = None
    spotlight_user: Optional[str]  = None
    lower_third:    Optional[dict] = None
    overlay:        Optional[dict] = None


class CueReq(BaseModel):
    message:     str
    target_role: Optional[str] = None
    target_user: Optional[str] = None
    severity:    str = "info"


class ScriptLineReq(BaseModel):
    line_id:     str
    text:        str
    target_role: str = "host"


class RecordingReq(BaseModel):
    active: bool


class GreenRoomDecisionReq(BaseModel):
    target_user_id: str
    role:           Optional[str] = None


class JoinReq(BaseModel):
    join_code:        str
    role_hint:        Optional[str] = None


# ── helpers ───────────────────────────────────────────────────────────────

def _engine():
    from ravensight.state import _rv_state
    return _rv_state.get("engine")


def _ws():
    from ravensight.state import _rv_state
    return _rv_state.get("ws")


# ── REST ──────────────────────────────────────────────────────────────────

@router.post("/sessions", status_code=201)
async def create_session(body: CreateSessionReq, user_id: str = Query(...)):
    engine = _engine()
    try:
        roster = {k: Role(v) for k, v in body.initial_roster.items()}
    except ValueError as e:
        raise HTTPException(400, f"Invalid role: {e}")
    session = await engine.create_session(
        user_id, body.title, roster, JoinPolicy(body.join_policy),
    )
    return {
        "id":         session.id,
        "join_code":  session.join_code,
        "title":      session.title,
        "state":      session.state.value,
        "join_policy": session.join_policy.value,
        "invited":    {k: v.value for k, v in session.invited_roles.items()},
    }


@router.post("/sessions/join")
async def join_session(body: JoinReq, user_id: str = Query(...)):
    engine = _engine()
    try:
        hint = Role(body.role_hint) if body.role_hint else None
        session, path, role = await engine.auto_join(user_id, body.join_code, hint)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {
        "session_id": session.id,
        "path":       path,
        "role":       role.value if role else None,
        "state":      session.state.value,
        "scene":      session.scene_dict(),
        "roster":     session.roster_list(),
        "current_script_line": session.current_script_line,
        "your_capabilities":   int(session.member_caps(user_id)),
    }


@router.get("/sessions/{sid}")
async def get_session(sid: str, user_id: str = Query(...)):
    engine = _engine()
    s = engine.get_session(sid)
    if not s:
        raise HTTPException(404, "Session not found")
    if user_id not in s.crew and user_id not in s.green_room:
        raise HTTPException(403, "Not a session member")
    return {
        "id":         s.id,
        "join_code":  s.join_code,
        "title":      s.title,
        "state":      s.state.value,
        "recording":  s.recording,
        "scene":      s.scene_dict(),
        "roster":     s.roster_list(),
        "green_room": [
            {"user_id": m.user_id, "display_name": m.display_name}
            for m in s.green_room.values()
        ],
        "your_role":  s.role_of(user_id).value if s.role_of(user_id) else None,
        "your_capabilities": int(s.member_caps(user_id)),
    }


@router.post("/sessions/{sid}/role")
async def set_role(sid: str, body: SetRoleReq, user_id: str = Query(...)):
    engine = _engine()
    try:
        await engine.change_role(user_id, sid, body.target_user_id, Role(body.role))
    except (ValueError, PermissionError) as e:
        raise HTTPException(403 if "permitted" in str(e) else 400, str(e))
    return {"ok": True, "role": body.role}


@router.post("/sessions/{sid}/state")
async def set_state(sid: str, body: SetStateReq, user_id: str = Query(...)):
    engine = _engine()
    try:
        await engine.set_state(user_id, sid, SessionState(body.state))
    except (ValueError, PermissionError) as e:
        raise HTTPException(403 if "permitted" in str(e) else 400, str(e))
    return {"ok": True, "state": body.state}


@router.post("/sessions/{sid}/scene")
async def set_scene(sid: str, body: SetSceneReq, user_id: str = Query(...)):
    engine = _engine()
    changes = {k: v for k, v in body.model_dump().items() if v is not None}
    try:
        scene = await engine.set_scene(user_id, sid, **changes)
    except (ValueError, PermissionError) as e:
        raise HTTPException(403 if "permitted" in str(e) else 400, str(e))
    return {"scene": engine.get_session(sid).scene_dict()}


@router.post("/sessions/{sid}/cue")
async def issue_cue(sid: str, body: CueReq, user_id: str = Query(...)):
    engine = _engine()
    try:
        target_role = Role(body.target_role) if body.target_role else None
        cue = await engine.issue_cue(
            user_id, sid, body.message,
            target_role=target_role,
            target_user=body.target_user,
            severity=body.severity,
        )
    except (ValueError, PermissionError) as e:
        raise HTTPException(403 if "permitted" in str(e) else 400, str(e))
    return {
        "id": cue.id, "message": cue.message, "severity": cue.severity,
        "target_role": cue.target_role.value if cue.target_role else None,
    }


@router.post("/sessions/{sid}/script")
async def push_script(sid: str, body: ScriptLineReq, user_id: str = Query(...)):
    engine = _engine()
    try:
        line = await engine.push_script_line(
            user_id, sid, body.line_id, body.text, Role(body.target_role),
        )
    except (ValueError, PermissionError) as e:
        raise HTTPException(403 if "permitted" in str(e) else 400, str(e))
    return line


@router.post("/sessions/{sid}/recording")
async def set_recording(sid: str, body: RecordingReq, user_id: str = Query(...)):
    engine = _engine()
    try:
        return await engine.set_recording(user_id, sid, body.active)
    except (ValueError, PermissionError) as e:
        raise HTTPException(403 if "permitted" in str(e) else 400, str(e))


@router.post("/sessions/{sid}/green-room/approve")
async def approve_green_room(
    sid: str, body: GreenRoomDecisionReq, user_id: str = Query(...),
):
    engine = _engine()
    try:
        m = await engine.approve_green_room(
            user_id, sid, body.target_user_id,
            Role(body.role) if body.role else None,
        )
    except (ValueError, PermissionError) as e:
        raise HTTPException(403 if "permitted" in str(e) else 400, str(e))
    return {"admitted": m.user_id, "role": m.role.value}


@router.post("/sessions/{sid}/green-room/reject", status_code=204)
async def reject_green_room(
    sid: str, body: GreenRoomDecisionReq, user_id: str = Query(...),
):
    engine = _engine()
    try:
        await engine.reject_green_room(user_id, sid, body.target_user_id)
    except PermissionError as e:
        raise HTTPException(403, str(e))


@router.post("/sessions/{sid}/leave", status_code=204)
async def leave_session(sid: str, user_id: str = Query(...)):
    await _engine().leave(user_id, sid)


@router.post("/sessions/{sid}/end", status_code=204)
async def end_session(sid: str, user_id: str = Query(...)):
    try:
        await _engine().end_session(user_id, sid)
    except (ValueError, PermissionError) as e:
        raise HTTPException(403 if "permitted" in str(e) else 400, str(e))


@router.get("/sessions/{sid}/cues")
async def list_cues(
    sid: str, limit: int = Query(100, ge=1, le=500), user_id: str = Query(...),
):
    engine = _engine()
    s = engine.get_session(sid)
    if not s or user_id not in s.crew:
        raise HTTPException(403, "Not a session member")
    return await engine.store.get_cues(sid, limit)


@router.get("/me/active-session")
async def my_active_session(user_id: str = Query(...)):
    engine = _engine()
    s = engine.get_session_for_user(user_id)
    if not s:
        return {"session_id": None}
    return {
        "session_id": s.id,
        "title":      s.title,
        "state":      s.state.value,
        "your_role":  s.role_of(user_id).value if s.role_of(user_id) else None,
    }


# ── WebSocket ─────────────────────────────────────────────────────────────

@router.websocket("/ws")
async def rv_ws(websocket: WebSocket, user_id: str = Query(...)):
    """
    Realtime Ravensight channel.

    Client → server frames:
      ravensight.join, ravensight.leave, ravensight.set_scene,
      ravensight.cue, ravensight.script.push, ravensight.recording,
      ravensight.state, ravensight.green_room.approve,
      ravensight.green_room.reject, ravensight.set_role

    Server → client: see ws_protocol comments in specification.
    """
    ws_mgr  = _ws()
    engine  = _engine()

    if not ws_mgr or not engine:
        await websocket.close(code=1011)
        return

    await ws_mgr.connect(user_id, websocket)
    await websocket.send_json({"type": "ravensight.connected", "user_id": user_id})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                frame = json.loads(raw)
            except Exception:
                continue

            t = frame.get("type", "")

            try:
                if t == "ravensight.join":
                    hint = Role(frame["role_hint"]) if frame.get("role_hint") else None
                    session, path, role = await engine.auto_join(
                        user_id, frame["join_code"], hint,
                    )
                    await websocket.send_json({
                        "type":       "ravensight.join.result",
                        "session_id": session.id,
                        "path":       path,
                        "role":       role.value if role else None,
                        "state":      session.state.value,
                        "scene":      session.scene_dict(),
                        "roster":     session.roster_list(),
                        "current_script_line": session.current_script_line,
                        "your_capabilities":   int(session.member_caps(user_id)),
                    })

                elif t == "ravensight.leave":
                    await engine.leave(user_id, frame["session_id"])

                elif t == "ravensight.set_scene":
                    keys = ("active_scene", "camera_layout",
                            "spotlight_user", "lower_third", "overlay")
                    changes = {k: frame[k] for k in keys if k in frame}
                    await engine.set_scene(user_id, frame["session_id"], **changes)

                elif t == "ravensight.cue":
                    tr = Role(frame["target_role"]) if frame.get("target_role") else None
                    await engine.issue_cue(
                        user_id, frame["session_id"], frame["message"],
                        target_role=tr,
                        target_user=frame.get("target_user"),
                        severity=frame.get("severity", "info"),
                    )

                elif t == "ravensight.script.push":
                    await engine.push_script_line(
                        user_id, frame["session_id"],
                        frame["line_id"], frame["text"],
                        Role(frame.get("target_role", "host")),
                    )

                elif t == "ravensight.recording":
                    await engine.set_recording(
                        user_id, frame["session_id"], bool(frame["active"]),
                    )

                elif t == "ravensight.state":
                    await engine.set_state(
                        user_id, frame["session_id"],
                        SessionState(frame["state"]),
                    )

                elif t == "ravensight.green_room.approve":
                    r = Role(frame["role"]) if frame.get("role") else None
                    await engine.approve_green_room(
                        user_id, frame["session_id"],
                        frame["target_user_id"], r,
                    )

                elif t == "ravensight.green_room.reject":
                    await engine.reject_green_room(
                        user_id, frame["session_id"], frame["target_user_id"],
                    )

                elif t == "ravensight.set_role":
                    await engine.change_role(
                        user_id, frame["session_id"],
                        frame["target_user_id"], Role(frame["role"]),
                    )

            except (ValueError, PermissionError) as exc:
                await websocket.send_json({
                    "type":  "ravensight.error",
                    "error": str(exc),
                })
            except Exception as exc:
                logger.debug("Ravensight WS error user=%s: %s", user_id, exc)

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("Ravensight WS disconnect user=%s: %s", user_id, exc)
    finally:
        await ws_mgr.disconnect(user_id, websocket)
        # Auto-leave any active session on disconnect
        s = engine.get_session_for_user(user_id)
        if s:
            await engine.leave(user_id, s.id)
