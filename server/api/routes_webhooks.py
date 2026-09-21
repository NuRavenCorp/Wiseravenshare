from flask import Blueprint, current_app, jsonify, request

from wiseravenshare.server.core.events import bus

bp = Blueprint("platform_webhooks", __name__)


@bp.route("/<platform>/events", methods=["POST"])
def receive(platform: str):
    raw = request.get_data()
    headers = {k: v for k, v in request.headers.items()}

    try:
        svc = current_app.config["build_platform"](platform)
    except KeyError:
        return jsonify({"error": "unknown platform"}), 404

    if not svc.verify_webhook(headers, raw):
        return jsonify({"error": "invalid signature"}), 401

    body = request.get_json(silent=True) or {}
    event = svc.normalize_webhook(body)
    bus.emit(f"event.{platform}", event)
    bus.emit("event.any", event)
    return jsonify({"status": "ok"}), 200
