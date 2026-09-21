from flask import Flask

from wiseravenshare.server.api.routes_auth import bp as auth_bp
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


def _credential(platform: str, key: str, user_id: str | None = None) -> str | None:
    return credentials.get(platform, key, user_id=user_id)


def build_platform(name: str, user_id: str | None = None):
    if name == "facebook":
        return registry.create(
            "facebook",
            page_id=_credential("facebook", "page_id", user_id=user_id),
            access_token=(
                _credential("facebook", "page_access_token", user_id=user_id)
                or _credential("facebook", "access_token", user_id=user_id)
            ),
            app_secret=_credential("facebook", "app_secret", user_id=user_id)
            or _credential("facebook", "app_secret")
            or "",
        )
    if name == "instagram":
        return registry.create(
            "instagram",
            user_id=(
                _credential("instagram", "user_id", user_id=user_id)
                or _credential("facebook", "user_id", user_id=user_id)
            ),
            access_token=(
                _credential("instagram", "access_token", user_id=user_id)
                or _credential("facebook", "page_access_token", user_id=user_id)
                or _credential("facebook", "access_token", user_id=user_id)
            ),
        )
    if name == "tiktok":
        return registry.create(
            "tiktok",
            client_key=_credential("tiktok", "client_key", user_id=user_id) or _credential("tiktok", "client_key"),
            client_secret=_credential("tiktok", "client_secret", user_id=user_id)
            or _credential("tiktok", "client_secret"),
            access_token=_credential("tiktok", "access_token", user_id=user_id),
            open_id=_credential("tiktok", "open_id", user_id=user_id),
        )
    if name == "youtube":
        return registry.create(
            "youtube",
            credentials_file=(
                _credential("youtube", "credentials", user_id=user_id)
                or _credential("youtube", "credentials")
            ),
        )
    if name == "linkedin":
        return registry.create(
            "linkedin",
            person_urn=_credential("linkedin", "person_urn", user_id=user_id),
            access_token=_credential("linkedin", "access_token", user_id=user_id),
        )
    if name == "reddit":
        return registry.create(
            "reddit",
            access_token=_credential("reddit", "access_token", user_id=user_id),
            user_agent=_credential("reddit", "user_agent", user_id=user_id)
            or _credential("reddit", "user_agent")
            or "wiseravenshare.server/0.1.0",
        )
    raise KeyError(name)


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["build_platform"] = build_platform
    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(post_bp, url_prefix="/webhook")
    app.register_blueprint(webhook_bp, url_prefix="/webhook")
    app.register_blueprint(health_bp)
    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=5000)
