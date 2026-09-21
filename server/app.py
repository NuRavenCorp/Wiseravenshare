from flask import Flask

from wiseravenshare.server.api.routes_health import bp as health_bp
from wiseravenshare.server.api.routes_post import bp as post_bp
from wiseravenshare.server.api.routes_webhooks import bp as webhook_bp
from wiseravenshare.server.core.auth import credentials
from wiseravenshare.server.core.registry import registry

import wiseravenshare.server.platforms.facebook.service  # noqa: F401
import wiseravenshare.server.platforms.instagram.service  # noqa: F401
import wiseravenshare.server.platforms.linkedin.service  # noqa: F401
import wiseravenshare.server.platforms.reddit.service  # noqa: F401
import wiseravenshare.server.platforms.tiktok.service  # noqa: F401
import wiseravenshare.server.platforms.youtube.service  # noqa: F401


def build_platform(name: str):
    if name == "facebook":
        return registry.create(
            "facebook",
            page_id=credentials.get("facebook", "page_id"),
            access_token=credentials.get("facebook", "access_token"),
            app_secret=credentials.get("facebook", "app_secret") or "",
        )
    if name == "instagram":
        return registry.create(
            "instagram",
            user_id=credentials.get("instagram", "user_id"),
            access_token=credentials.get("instagram", "access_token"),
        )
    if name == "tiktok":
        return registry.create(
            "tiktok",
            client_key=credentials.get("tiktok", "client_key"),
            client_secret=credentials.get("tiktok", "client_secret"),
            access_token=credentials.get("tiktok", "access_token"),
            open_id=credentials.get("tiktok", "open_id"),
        )
    if name == "youtube":
        return registry.create(
            "youtube",
            credentials_file=credentials.get("youtube", "credentials"),
        )
    if name == "linkedin":
        return registry.create(
            "linkedin",
            person_urn=credentials.get("linkedin", "person_urn"),
            access_token=credentials.get("linkedin", "access_token"),
        )
    if name == "reddit":
        return registry.create(
            "reddit",
            access_token=credentials.get("reddit", "access_token"),
            user_agent=credentials.get("reddit", "user_agent")
            or "wiseravenshare.server/0.1.0",
        )
    raise KeyError(name)


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["build_platform"] = build_platform
    app.register_blueprint(post_bp, url_prefix="/webhook")
    app.register_blueprint(webhook_bp, url_prefix="/webhook")
    app.register_blueprint(health_bp)
    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=5000)
