from wiseravenshare.server.core.models import MediaUpload, Post, PublishResult
from wiseravenshare.server.core.registry import register_platform
from wiseravenshare.server.platforms.base import BasePlatform


@register_platform("youtube")
class YouTubePlatform(BasePlatform):
    name = "youtube"
    capabilities = {"post.video", "gather"}

    def __init__(self, credentials_file: str):
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds = Credentials.from_authorized_user_file(
            credentials_file,
            [
                "https://www.googleapis.com/auth/youtube.upload",
                "https://www.googleapis.com/auth/youtube.readonly",
            ],
        )
        self.svc = build("youtube", "v3", credentials=creds)

    def post(self, payload):
        return self.upload(
            MediaUpload(
                source=payload["file_path"],
                kind="video",
                metadata={k: v for k, v in payload.items() if k != "file_path"},
            )
        )

    def upload(self, media: MediaUpload):
        from googleapiclient.http import MediaFileUpload

        meta = media.metadata
        body = {
            "snippet": {
                "title": meta.get("title", ""),
                "description": meta.get("description", ""),
                "tags": meta.get("tags", []),
                "categoryId": meta.get("category_id", "22"),
            },
            "status": {"privacyStatus": meta.get("privacy", "private")},
        }
        req = self.svc.videos().insert(
            part="snippet,status",
            body=body,
            media_body=MediaFileUpload(media.source, chunksize=5 * 1024 * 1024, resumable=True),
        )
        resp = None
        while resp is None:
            _, resp = req.next_chunk()
        return PublishResult(success=True, external_id=resp["id"], raw=resp)

    def gather(self, params):
        ch = self.svc.channels().list(part="contentDetails", mine=True).execute()
        uploads = ch["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
        vids = self.svc.playlistItems().list(
            part="snippet,contentDetails",
            playlistId=uploads,
            maxResults=params.get("max_results", 25),
        ).execute()
        return [
            Post(
                external_id=i["contentDetails"]["videoId"],
                platform=self.name,
                text=i["snippet"].get("title", ""),
                created_at=i["snippet"].get("publishedAt"),
                raw=i,
            )
            for i in vids.get("items", [])
        ]

    def status(self, external_id):
        return self.svc.videos().list(part="status,statistics", id=external_id).execute()
