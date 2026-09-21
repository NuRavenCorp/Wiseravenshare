import hashlib
import hmac

import requests

from wiseravenshare.server.core.models import MediaUpload, PlatformEvent, PublishResult
from wiseravenshare.server.core.registry import register_platform
from wiseravenshare.server.platforms.base import BasePlatform


@register_platform("tiktok")
class TikTokPlatform(BasePlatform):
    name = "tiktok"
    capabilities = {"post.video", "webhook", "status"}

    def __init__(self, client_key: str, client_secret: str, access_token: str, open_id: str):
        self.client_key = client_key
        self.client_secret = client_secret
        self.token = access_token
        self.open_id = open_id
        self.base = "https://open.tiktokapis.com/v2"

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json; charset=UTF-8",
        }

    def post(self, payload):
        r = requests.post(
            f"{self.base}/post/publish/inbox/video/init/",
            headers=self._headers(),
            json={"source_info": {"source": "PULL_FROM_URL", "video_url": payload["video_url"]}},
            timeout=30,
        )
        r.raise_for_status()
        j = r.json()
        return PublishResult(success=True, external_id=j.get("data", {}).get("publish_id"), raw=j)

    def upload(self, media: MediaUpload):
        return self.post({"video_url": media.source})

    def gather(self, params):
        return []

    def status(self, external_id):
        r = requests.post(
            f"{self.base}/post/publish/status/fetch/",
            headers=self._headers(),
            json={"publish_id": external_id},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    def verify_webhook(self, headers, raw_body):
        sig_header = headers.get("TikTok-Signature", "")
        parts = dict(p.split("=", 1) for p in sig_header.split(",") if "=" in p)
        ts, sig = parts.get("t", ""), parts.get("s", "")
        expected = hmac.new(
            self.client_secret.encode(),
            f"{ts}.{raw_body.decode()}".encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, sig)

    def normalize_webhook(self, raw):
        return PlatformEvent(platform=self.name, type=raw.get("event", "unknown"), data=raw)
