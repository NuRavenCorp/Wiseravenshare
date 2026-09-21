import requests

from wiseravenshare.server.core.models import MediaUpload, Post, PublishResult
from wiseravenshare.server.core.registry import register_platform
from wiseravenshare.server.platforms.base import BasePlatform


@register_platform("facebook")
class FacebookPlatform(BasePlatform):
    name = "facebook"
    capabilities = {"post.text", "post.image", "gather", "webhook"}

    def __init__(self, page_id: str, access_token: str, app_secret: str = ""):
        self.page_id = page_id
        self.token = access_token
        self.app_secret = app_secret
        self.base = "https://graph.facebook.com/v24.0"

    def post(self, payload):
        r = requests.post(
            f"{self.base}/{self.page_id}/feed",
            data={
                "message": payload.get("message", ""),
                "link": payload.get("link", ""),
                "access_token": self.token,
            },
            timeout=30,
        )
        r.raise_for_status()
        j = r.json()
        return PublishResult(success=True, external_id=j.get("id"), raw=j)

    def gather(self, params):
        r = requests.get(
            f"{self.base}/{self.page_id}/published_posts",
            params={
                "fields": "id,message,created_time,permalink_url,full_picture",
                "limit": params.get("limit", 25),
                "access_token": self.token,
            },
            timeout=30,
        )
        r.raise_for_status()
        return [
            Post(
                external_id=i["id"],
                platform=self.name,
                text=i.get("message", ""),
                permalink=i.get("permalink_url", ""),
                created_at=i.get("created_time"),
                raw=i,
            )
            for i in r.json().get("data", [])
        ]

    def upload(self, media: MediaUpload):
        r = requests.post(
            f"{self.base}/{self.page_id}/photos",
            data={
                "url": media.source,
                "caption": media.metadata.get("caption", ""),
                "access_token": self.token,
            },
            timeout=30,
        )
        r.raise_for_status()
        j = r.json()
        return PublishResult(success=True, external_id=j.get("id"), raw=j)

    def status(self, external_id):
        return {}
