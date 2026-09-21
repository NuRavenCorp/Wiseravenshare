import requests

from wiseravenshare.server.core.models import MediaUpload, Post, PublishResult
from wiseravenshare.server.core.registry import register_platform
from wiseravenshare.server.platforms.base import BasePlatform


@register_platform("linkedin")
class LinkedInPlatform(BasePlatform):
    name = "linkedin"
    capabilities = {"post.text", "post.image", "gather"}

    def __init__(self, person_urn: str, access_token: str):
        self.person_urn = person_urn
        self.token = access_token
        self.base = "https://api.linkedin.com/v2"

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "X-Restli-Protocol-Version": "2.0.0",
            "Content-Type": "application/json",
        }

    def post(self, payload):
        text = payload.get("message", "")
        body = {
            "author": self.person_urn,
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {"text": text},
                    "shareMediaCategory": "NONE",
                }
            },
            "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
        }
        r = requests.post(f"{self.base}/ugcPosts", headers=self._headers(), json=body, timeout=30)
        r.raise_for_status()
        external_id = r.headers.get("x-restli-id")
        return PublishResult(success=True, external_id=external_id, raw={"status": r.status_code})

    def gather(self, params):
        q = {"q": "authors", "authors": f"List({self.person_urn})", "count": params.get("limit", 25)}
        r = requests.get(f"{self.base}/shares", headers=self._headers(), params=q, timeout=30)
        r.raise_for_status()
        data = r.json().get("elements", [])
        return [
            Post(
                external_id=i.get("id", ""),
                platform=self.name,
                text=((i.get("text") or {}).get("text") or ""),
                raw=i,
            )
            for i in data
        ]

    def upload(self, media: MediaUpload):
        # LinkedIn image/video register-upload flow is multi-step. Keep initial
        # implementation as text post + media URL fallback.
        return self.post({"message": media.metadata.get("caption", media.source)})

    def status(self, external_id):
        r = requests.get(f"{self.base}/ugcPosts/{external_id}", headers=self._headers(), timeout=30)
        if r.status_code == 404:
            return {"found": False}
        r.raise_for_status()
        return {"found": True, "raw": r.json()}
