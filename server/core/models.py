from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class Post:
    external_id: str
    platform: str
    text: str = ""
    media: List[str] = field(default_factory=list)
    permalink: str = ""
    created_at: Optional[datetime] = None
    metrics: Dict[str, Any] = field(default_factory=dict)
    raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MediaUpload:
    source: str
    kind: str
    mime: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PublishResult:
    success: bool
    external_id: Optional[str] = None
    permalink: Optional[str] = None
    error: Optional[str] = None
    raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PlatformEvent:
    platform: str
    type: str
    data: Dict[str, Any]
    received_at: datetime = field(default_factory=datetime.utcnow)
