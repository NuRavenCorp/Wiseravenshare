from abc import ABC, abstractmethod
from typing import Any, Dict, List

from wiseravenshare.server.core.models import MediaUpload, PlatformEvent, Post, PublishResult


class BasePlatform(ABC):
    name: str = "base"
    capabilities: set[str] = set()

    @abstractmethod
    def post(self, payload: Dict[str, Any]) -> PublishResult:
        raise NotImplementedError

    @abstractmethod
    def gather(self, params: Dict[str, Any]) -> List[Post]:
        raise NotImplementedError

    @abstractmethod
    def upload(self, media: MediaUpload) -> PublishResult:
        raise NotImplementedError

    @abstractmethod
    def status(self, external_id: str) -> Dict[str, Any]:
        raise NotImplementedError

    def verify_webhook(self, headers: Dict[str, str], raw_body: bytes) -> bool:
        return True

    def normalize_webhook(self, raw: Dict[str, Any]) -> PlatformEvent:
        return PlatformEvent(platform=self.name, type="unknown", data=raw)

    def supports(self, capability: str) -> bool:
        return capability in self.capabilities
