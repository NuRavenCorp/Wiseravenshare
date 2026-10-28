"""
ravensight/session.py — Session data model (no external DB dependencies).

PodcastSession is the in-memory runtime state for one recording.
Persisted tables live in ravensight/store.py.
"""
from __future__ import annotations
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from ravensight.roles import Role, Capability, CrewMember, ROLE_CAPS


class SessionState(str, Enum):
    GREEN_ROOM = "green_room"   # pre-show, testing
    LIVE       = "live"         # on air (no recording yet)
    PAUSED     = "paused"
    RECORDING  = "recording"
    ENDING     = "ending"
    ENDED      = "ended"


class JoinPolicy(str, Enum):
    AUTO_IF_INVITED = "auto_if_invited"   # invited role → instant join (default)
    AUTO_IF_CREW    = "auto_if_crew"      # any crew role → instant join
    MANUAL_APPROVAL = "manual_approval"  # everyone waits in green room
    OPEN            = "open"              # anyone with code (rare)


# Valid state machine transitions
ALLOWED_TRANSITIONS: dict[SessionState, set[SessionState]] = {
    SessionState.GREEN_ROOM: {SessionState.LIVE},
    SessionState.LIVE:       {SessionState.PAUSED, SessionState.RECORDING, SessionState.ENDING},
    SessionState.PAUSED:     {SessionState.LIVE,  SessionState.ENDING},
    SessionState.RECORDING:  {SessionState.LIVE,  SessionState.ENDING},
    SessionState.ENDING:     {SessionState.ENDED},
}


@dataclass
class SceneState:
    """Director's current look. All crew see this synchronised state."""
    active_scene:   str            = "default"
    camera_layout:  str            = "grid"   # "grid"|"spotlight"|"split"|"host_full"
    spotlight_user: Optional[str]  = None
    lower_third:    Optional[dict] = None     # {"name": "...", "title": "..."}
    overlay:        Optional[dict] = None


@dataclass
class Cue:
    id:          str
    issued_by:   str
    target_role: Optional[Role]
    target_user: Optional[str]
    message:     str
    severity:    str  = "info"          # "info" | "warning" | "urgent"
    created_at:  float = field(default_factory=time.time)


@dataclass
class PodcastSession:
    id:          str
    join_code:   str
    title:       str
    created_by:  str
    created_at:  float
    state:       SessionState = SessionState.GREEN_ROOM
    join_policy: JoinPolicy   = JoinPolicy.AUTO_IF_INVITED

    # Roster
    crew:          dict[str, CrewMember] = field(default_factory=dict)
    invited_roles: dict[str, Role]       = field(default_factory=dict)  # user_id → pre-assigned role
    green_room:    dict[str, CrewMember] = field(default_factory=dict)  # awaiting approval

    # Production state
    scene:               SceneState        = field(default_factory=SceneState)
    cues:                list[Cue]         = field(default_factory=list)
    current_script_line: Optional[dict]   = None  # {id, text, target_role}
    recording:           bool              = False
    recording_started_at: Optional[float] = None

    # Timing
    went_live_at: Optional[float] = None
    ended_at:     Optional[float] = None

    # ── helpers ────────────────────────────────────────────────────────────

    def member_caps(self, user_id: str) -> Capability:
        m = self.crew.get(user_id)
        return m.capabilities() if m else Capability.NONE

    def has_cap(self, user_id: str, cap: Capability) -> bool:
        return bool(self.member_caps(user_id) & cap)

    def role_of(self, user_id: str) -> Optional[Role]:
        m = self.crew.get(user_id)
        return m.role if m else None

    def scene_dict(self) -> dict:
        return {
            "active_scene":   self.scene.active_scene,
            "camera_layout":  self.scene.camera_layout,
            "spotlight_user": self.scene.spotlight_user,
            "lower_third":    self.scene.lower_third,
            "overlay":        self.scene.overlay,
        }

    def roster_list(self) -> list[dict]:
        return [
            {
                "user_id":      m.user_id,
                "display_name": m.display_name,
                "role":         m.role.value,
            }
            for m in self.crew.values()
        ]


def generate_join_code() -> str:
    """6-char uppercase alnum, no ambiguous chars (0/O, 1/I)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))
