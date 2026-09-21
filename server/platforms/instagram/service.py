import requests

from wiseravenshare.server.core.models import MediaUpload, Post, PublishResult
from wiseravenshare.server.core.registry import register_platform
from wiseravenshare.server.platforms.base import BasePlatform


@register_platform("instagram")
class InstagramPlatform(BasePlatform):
    name = "instagram"
    capabilities = {"post.image", "post.carousel", "gather", "webhook"}

    def __init__(self, user_id: str, access_token: str):
        self.user_id = user_id
        self.token = access_token
        self.base = "https://graph.facebook.com/v24.0"

    def post(self, payload):
        c = requests.post(
            f"{self.base}/{self.user_id}/media",
            data={
                "image_url": payload["image_url"],
                "caption": payload.get("caption", ""),
                "access_token": self.token,
            },
            timeout=30,
        )
        c.raise_for_status()
        creation_id = c.json()["id"]

        p = requests.post(
            f"{self.base}/{self.user_id}/media_publish",
            data={
                "creation_id": creation_id,
                "access_token": self.token,
            },
            timeout=30,
        )
        p.raise_for_status()
        j = p.json()
        return PublishResult(success=True, external_id=j.get("id"), raw=j)

    def gather(self, params):
        r = requests.get(
            f"{self.base}/{self.user_id}/media",
            params={
                "fields": "id,caption,media_url,permalink,timestamp,like_count",
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
                text=i.get("caption", ""),
                media=[i.get("media_url", "")],
                permalink=i.get("permalink", ""),
                created_at=i.get("timestamp"),
                raw=i,
            )
            for i in r.json().get("data", [])
        ]

    def upload(self, media: MediaUpload):
        return self.post(
            {"image_url": media.source, "caption": media.metadata.get("caption", "")}
        )

    def status(self, external_id):
        return {}
