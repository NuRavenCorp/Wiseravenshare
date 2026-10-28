"""
ravensight/roles.py — Role & Permission Model for Ravensight production sessions.

Every crew member has a role that grants a fixed bundle of capabilities.
Roles are additive — capabilities_override lets a producer temporarily grant
a capability without changing the role (e.g., give a guest SCREEN_SHARE for a
demo without making them a co-host).
"""
from __future__ import annotations
from dataclasses import dataclass
from enum import Enum, Flag, auto


class Role(str, Enum):
    HOST         = "host"
    CO_HOST      = "co_host"
    DIRECTOR     = "director"
    PRODUCER     = "producer"
    SCRIPTWRITER = "scriptwriter"
    CAMERA       = "camera"
    AUDIO        = "audio"
    LIGHTING     = "lighting"
    GUEST        = "guest"
    OBSERVER     = "observer"   # audience / VIP watcher, no mic/cam


class Capability(Flag):
    NONE = 0
    # Audio / video
    MIC          = auto()       # can unmute
    CAMERA       = auto()       # can publish video
    SCREEN_SHARE = auto()
    # Production control
    START_SESSION  = auto()
    END_SESSION    = auto()
    CUE_ROLE       = auto()     # "go to camera 3"
    SET_SCENE      = auto()
    CONTROL_MIX    = auto()     # audio levels
    MANAGE_SCRIPTS = auto()
    SEND_SCRIPT_LINE = auto()   # push teleprompter line to host
    # People management
    ADMIT_GUEST  = auto()
    KICK         = auto()
    MUTE_OTHERS  = auto()
    CHANGE_ROLE  = auto()       # can reassign roles to others
    # Recording
    START_RECORDING = auto()
    STOP_RECORDING  = auto()
    # Communication
    TALKBACK    = auto()        # intercom to any role, not recorded
    CREW_CHAT   = auto()
    GUEST_CHAT  = auto()


ROLE_CAPS: dict[Role, Capability] = {
    Role.HOST: (
        Capability.MIC | Capability.CAMERA | Capability.SCREEN_SHARE |
        Capability.TALKBACK | Capability.CREW_CHAT
    ),
    Role.CO_HOST: (
        Capability.MIC | Capability.CAMERA | Capability.SCREEN_SHARE |
        Capability.TALKBACK | Capability.CREW_CHAT
    ),
    Role.DIRECTOR: (
        Capability.MIC | Capability.SCREEN_SHARE | Capability.CUE_ROLE |
        Capability.SET_SCENE | Capability.TALKBACK | Capability.CREW_CHAT |
        Capability.MUTE_OTHERS | Capability.START_RECORDING |
        Capability.STOP_RECORDING
    ),
    Role.PRODUCER: (
        Capability.MIC | Capability.SCREEN_SHARE | Capability.START_SESSION |
        Capability.END_SESSION | Capability.ADMIT_GUEST | Capability.KICK |
        Capability.CHANGE_ROLE | Capability.TALKBACK | Capability.CREW_CHAT |
        Capability.START_RECORDING | Capability.STOP_RECORDING
    ),
    Role.SCRIPTWRITER: (
        Capability.MANAGE_SCRIPTS | Capability.SEND_SCRIPT_LINE |
        Capability.TALKBACK | Capability.CREW_CHAT
    ),
    Role.CAMERA: (
        Capability.CAMERA | Capability.TALKBACK | Capability.CREW_CHAT
    ),
    Role.AUDIO: (
        Capability.MIC | Capability.CONTROL_MIX | Capability.TALKBACK |
        Capability.CREW_CHAT
    ),
    Role.LIGHTING: (
        Capability.SET_SCENE | Capability.TALKBACK | Capability.CREW_CHAT
    ),
    Role.GUEST: (
        Capability.MIC | Capability.CAMERA | Capability.GUEST_CHAT
    ),
    Role.OBSERVER: Capability.NONE,
}


@dataclass
class CrewMember:
    user_id: str
    display_name: str
    role: Role
    invited_by: str | None = None
    joined_at: float = 0.0
    capabilities_override: Capability | None = None

    def capabilities(self) -> Capability:
        if self.capabilities_override is not None:
            return self.capabilities_override
        return ROLE_CAPS[self.role]

    def has(self, cap: Capability) -> bool:
        return bool(self.capabilities() & cap)
