import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import urllib.parse
from typing import Dict, Tuple

import requests
from flask import Blueprint, jsonify, request

from wiseravenshare.server.core.auth import credentials

bp = Blueprint("auth", __name__)


def _user_id() -> str:
    return (
        request.headers.get("X-User-Id")
        or request.args.get("user_id")
        or (request.get_json(silent=True) or {}).get("user_id")
        or ""
    ).strip()


def _secret() -> str:
    return os.getenv("OAUTH_STATE_SECRET") or os.getenv("WEBHOOK_SECRET") or "change-me"


def _make_state(platform: str, user_id: str) -> str:
    payload = {"p": platform, "u": user_id, "t": int(time.time()), "n": secrets.token_hex(8)}
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    sig = hmac.new(_secret().encode("utf-8"), raw, hashlib.sha256).hexdigest().encode("utf-8")
    token = base64.urlsafe_b64encode(raw + b"." + sig).decode("utf-8")
    return token


def _read_state(token: str) -> Dict:
    decoded = base64.urlsafe_b64decode(token.encode("utf-8"))
    raw, sig = decoded.rsplit(b".", 1)
    expected = hmac.new(_secret().encode("utf-8"), raw, hashlib.sha256).hexdigest().encode("utf-8")
    if not hmac.compare_digest(sig, expected):
        raise ValueError("invalid state signature")
    payload = json.loads(raw.decode("utf-8"))
    if int(time.time()) - int(payload.get("t", 0)) > 900:
        raise ValueError("state expired")
    return payload


def _oauth_settings(platform: str) -> Dict[str, str]:
    p = platform.lower()
    if p == "facebook":
        return {
            "client_id": os.getenv("FACEBOOK_APP_ID", ""),
            "client_secret": os.getenv("FACEBOOK_APP_SECRET", ""),
            "redirect_uri": os.getenv("FACEBOOK_REDIRECT_URI", ""),
            "auth_url": "https://www.facebook.com/v24.0/dialog/oauth",
            "token_url": "https://graph.facebook.com/v24.0/oauth/access_token",
            "scope": os.getenv(
                "FACEBOOK_SCOPE",
                "pages_show_list,pages_manage_posts,pages_read_engagement,business_management",
            ),
        }
    if p == "instagram":
        return {
            "client_id": os.getenv("INSTAGRAM_APP_ID", os.getenv("FACEBOOK_APP_ID", "")),
            "client_secret": os.getenv("INSTAGRAM_APP_SECRET", os.getenv("FACEBOOK_APP_SECRET", "")),
            "redirect_uri": os.getenv("INSTAGRAM_REDIRECT_URI", ""),
            "auth_url": "https://www.facebook.com/v24.0/dialog/oauth",
            "token_url": "https://graph.facebook.com/v24.0/oauth/access_token",
            "scope": os.getenv(
                "INSTAGRAM_SCOPE",
                "instagram_basic,instagram_content_publish,pages_show_list,business_management",
            ),
        }
    if p == "tiktok":
        return {
            "client_id": os.getenv("TIKTOK_CLIENT_KEY", ""),
            "client_secret": os.getenv("TIKTOK_CLIENT_SECRET", ""),
            "redirect_uri": os.getenv("TIKTOK_REDIRECT_URI", ""),
            "auth_url": "https://www.tiktok.com/v2/auth/authorize/",
            "token_url": "https://open.tiktokapis.com/v2/oauth/token/",
            "scope": os.getenv("TIKTOK_SCOPE", "user.info.basic,video.publish"),
        }
    if p == "youtube":
        return {
            "client_id": os.getenv("YOUTUBE_CLIENT_ID", ""),
            "client_secret": os.getenv("YOUTUBE_CLIENT_SECRET", ""),
            "redirect_uri": os.getenv("YOUTUBE_REDIRECT_URI", ""),
            "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_url": "https://oauth2.googleapis.com/token",
            "scope": os.getenv(
                "YOUTUBE_SCOPE",
                "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
            ),
        }
    if p == "linkedin":
        return {
            "client_id": os.getenv("LINKEDIN_CLIENT_ID", ""),
            "client_secret": os.getenv("LINKEDIN_CLIENT_SECRET", ""),
            "redirect_uri": os.getenv("LINKEDIN_REDIRECT_URI", ""),
            "auth_url": "https://www.linkedin.com/oauth/v2/authorization",
            "token_url": "https://www.linkedin.com/oauth/v2/accessToken",
            "scope": os.getenv("LINKEDIN_SCOPE", "openid profile email w_member_social"),
        }
    if p == "reddit":
        return {
            "client_id": os.getenv("REDDIT_CLIENT_ID", ""),
            "client_secret": os.getenv("REDDIT_CLIENT_SECRET", ""),
            "redirect_uri": os.getenv("REDDIT_REDIRECT_URI", ""),
            "auth_url": "https://www.reddit.com/api/v1/authorize",
            "token_url": "https://www.reddit.com/api/v1/access_token",
            "scope": os.getenv("REDDIT_SCOPE", "identity submit read"),
        }
    raise KeyError(platform)


def _validate_settings(settings: Dict[str, str]) -> Tuple[bool, str]:
    required = ("client_id", "client_secret", "redirect_uri")
    for key in required:
        if not settings.get(key):
            return False, f"missing oauth setting: {key}"
    return True, ""


def _token_exchange(platform: str, settings: Dict[str, str], code: str) -> Dict:
    p = platform.lower()
    if p in ("facebook", "instagram"):
        r = requests.get(
            settings["token_url"],
            params={
                "client_id": settings["client_id"],
                "client_secret": settings["client_secret"],
                "redirect_uri": settings["redirect_uri"],
                "code": code,
            },
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    if p == "tiktok":
        r = requests.post(
            settings["token_url"],
            data={
                "client_key": settings["client_id"],
                "client_secret": settings["client_secret"],
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings["redirect_uri"],
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    if p in ("youtube", "linkedin"):
        r = requests.post(
            settings["token_url"],
            data={
                "client_id": settings["client_id"],
                "client_secret": settings["client_secret"],
                "redirect_uri": settings["redirect_uri"],
                "grant_type": "authorization_code",
                "code": code,
            },
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    if p == "reddit":
        basic = base64.b64encode(f"{settings['client_id']}:{settings['client_secret']}".encode("utf-8")).decode("utf-8")
        r = requests.post(
            settings["token_url"],
            headers={
                "Authorization": f"Basic {basic}",
                "User-Agent": os.getenv("REDDIT_USER_AGENT", "wiseravenshare.server/0.1.0"),
            },
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings["redirect_uri"],
            },
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    raise KeyError(platform)


def _extract_provider_tokens(platform: str, token_payload: Dict) -> Dict[str, str]:
    p = platform.lower()
    if p in ("facebook", "instagram"):
        return {
            "access_token": str(token_payload.get("access_token", "")),
            "token_type": str(token_payload.get("token_type", "")),
            "expires_in": str(token_payload.get("expires_in", "")),
        }
    if p == "tiktok":
        data = token_payload.get("data") or {}
        return {
            "access_token": str(data.get("access_token", "")),
            "refresh_token": str(data.get("refresh_token", "")),
            "open_id": str(data.get("open_id", "")),
            "expires_in": str(data.get("expires_in", "")),
        }
    if p in ("youtube", "linkedin", "reddit"):
        return {
            "access_token": str(token_payload.get("access_token", "")),
            "refresh_token": str(token_payload.get("refresh_token", "")),
            "scope": str(token_payload.get("scope", "")),
            "token_type": str(token_payload.get("token_type", "")),
            "expires_in": str(token_payload.get("expires_in", "")),
        }
    return {}


def _hydrate_facebook_page_context(platform: str, user_tokens: Dict[str, str]) -> Dict[str, str]:
    """
    Best-effort page context enrichment for facebook/instagram.
    """
    if platform.lower() not in ("facebook", "instagram"):
        return {}
    access_token = user_tokens.get("access_token")
    if not access_token:
        return {}

    try:
        r = requests.get(
            "https://graph.facebook.com/v24.0/me/accounts",
            params={"fields": "id,name,access_token,instagram_business_account{id,username}", "access_token": access_token},
            timeout=30,
        )
        r.raise_for_status()
        pages = (r.json() or {}).get("data") or []
        if not pages:
            return {}
        primary = pages[0]
        enriched = {
            "page_id": str(primary.get("id", "")),
            "page_name": str(primary.get("name", "")),
            "page_access_token": str(primary.get("access_token", "")),
        }
        ig = primary.get("instagram_business_account") or {}
        if ig.get("id"):
            enriched["user_id"] = str(ig.get("id", ""))
            enriched["instagram_username"] = str(ig.get("username", ""))
        return {k: v for k, v in enriched.items() if v}
    except Exception:
        return {}


@bp.route("/<platform>/start", methods=["GET"])
def auth_start(platform: str):
    user_id = _user_id()
    if not user_id:
        return jsonify({"error": "missing user_id (header X-User-Id or query param)"}), 400

    try:
        settings = _oauth_settings(platform)
    except KeyError:
        return jsonify({"error": "unknown platform"}), 404

    ok, message = _validate_settings(settings)
    if not ok:
        return jsonify({"error": message}), 400

    state = _make_state(platform.lower(), user_id)
    params = {
        "client_id": settings["client_id"],
        "redirect_uri": settings["redirect_uri"],
        "response_type": "code",
        "scope": settings["scope"],
        "state": state,
    }
    if platform.lower() == "reddit":
        params["duration"] = "permanent"
    if platform.lower() == "youtube":
        params["access_type"] = "offline"
        params["include_granted_scopes"] = "true"
        params["prompt"] = "consent"

    authorize_url = f"{settings['auth_url']}?{urllib.parse.urlencode(params)}"
    return jsonify({"platform": platform.lower(), "user_id": user_id, "authorize_url": authorize_url})


@bp.route("/<platform>/callback", methods=["GET"])
def auth_callback(platform: str):
    code = (request.args.get("code") or "").strip()
    state = (request.args.get("state") or "").strip()
    error = (request.args.get("error") or "").strip()
    if error:
        return jsonify({"success": False, "platform": platform.lower(), "error": error}), 400
    if not code or not state:
        return jsonify({"success": False, "error": "missing code or state"}), 400

    try:
        parsed = _read_state(state)
    except Exception as exc:
        return jsonify({"success": False, "error": f"invalid state: {exc}"}), 400

    if parsed.get("p") != platform.lower():
        return jsonify({"success": False, "error": "platform mismatch in state"}), 400

    user_id = str(parsed.get("u") or "").strip()
    if not user_id:
        return jsonify({"success": False, "error": "missing user in state"}), 400

    try:
        settings = _oauth_settings(platform)
        token_payload = _token_exchange(platform, settings, code)
        values = _extract_provider_tokens(platform, token_payload)
        values.update(_hydrate_facebook_page_context(platform, values))
        credentials.set_many(platform.lower(), values, user_id=user_id)
    except Exception as exc:
        return jsonify({"success": False, "platform": platform.lower(), "error": str(exc)}), 500

    manual_notes = []
    if platform.lower() == "instagram" and not values.get("user_id"):
        manual_notes.append(
            "Instagram publishing may require linking an Instagram Business account to a Facebook page."
        )
    if platform.lower() == "youtube" and not values.get("refresh_token"):
        manual_notes.append("YouTube may require prompt=consent to return a refresh_token.")

    return jsonify(
        {
            "success": True,
            "platform": platform.lower(),
            "user_id": user_id,
            "stored_keys": sorted([k for k, v in values.items() if v]),
            "notes": manual_notes,
        }
    )


@bp.route("/<platform>/status", methods=["GET"])
def auth_status(platform: str):
    user_id = _user_id()
    if not user_id:
        return jsonify({"error": "missing user_id (header X-User-Id or query param)"}), 400
    values = credentials.get_platform_credentials(platform.lower(), user_id=user_id)
    connected = bool(values.get("access_token") or values.get("page_access_token"))
    safe = {
        k: ("***" if "token" in k.lower() else v)
        for k, v in values.items()
        if k not in {"refresh_token", "access_token", "page_access_token"}
    }
    return jsonify({"platform": platform.lower(), "user_id": user_id, "connected": connected, "details": safe})


@bp.route("/<platform>/disconnect", methods=["POST"])
def auth_disconnect(platform: str):
    user_id = _user_id()
    if not user_id:
        return jsonify({"error": "missing user_id (header X-User-Id or body/query param)"}), 400
    credentials.clear_platform_credentials(platform.lower(), user_id=user_id)
    return jsonify({"success": True, "platform": platform.lower(), "user_id": user_id})
