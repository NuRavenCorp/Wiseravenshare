import requests

from wiseravenshare.server.core.models import MediaUpload, Post, PublishResult
from wiseravenshare.server.core.registry import register_platform
from wiseravenshare.server.platforms.base import BasePlatform


@register_platform("reddit")
class RedditPlatform(BasePlatform):
    name = "reddit"
    capabilities = {"post.text", "post.link", "gather"}

    def __init__(self, access_token: str, user_agent: str = "wiseravenshare.server/0.1.0"):
        self.token = access_token
        self.user_agent = user_agent
        self.base = "https://oauth.reddit.com"

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "User-Agent": self.user_agent,
        }

    def post(self, payload):
        subreddit = payload["subreddit"]
        title = payload["title"]
        text = payload.get("text", "")
        url = payload.get("url")
        kind = "link" if url else "self"
        form = {"sr": subreddit, "kind": kind, "title": title, "text": text}
        if url:
            form["url"] = url
        r = requests.post(f"{self.base}/api/submit", headers=self._headers(), data=form, timeout=30)
        r.raise_for_status()
        j = r.json()
        errors = (((j.get("json") or {}).get("errors")) or [])
        if errors:
            return PublishResult(success=False, error=str(errors), raw=j)
        return PublishResult(success=True, raw=j)

    def gather(self, params):
        subreddit = params["subreddit"]
        limit = int(params.get("limit", 25))
        r = requests.get(
            f"{self.base}/r/{subreddit}/new",
            headers=self._headers(),
            params={"limit": limit},
            timeout=30,
        )
        r.raise_for_status()
        children = ((((r.json() or {}).get("data")) or {}).get("children")) or []
        posts = []
        for child in children:
            data = child.get("data", {})
            posts.append(
                Post(
                    external_id=data.get("name", ""),
                    platform=self.name,
                    text=data.get("title", ""),
                    permalink=f"https://reddit.com{data.get('permalink', '')}",
                    metrics={"score": data.get("score"), "num_comments": data.get("num_comments")},
                    raw=data,
                )
            )
        return posts

    def upload(self, media: MediaUpload):
        return PublishResult(success=False, error="reddit direct media upload not implemented")

    def status(self, external_id):
        r = requests.get(f"{self.base}/api/info", headers=self._headers(), params={"id": external_id}, timeout=30)
        r.raise_for_status()
        return r.json()
