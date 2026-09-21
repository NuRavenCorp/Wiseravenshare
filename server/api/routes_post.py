from flask import Blueprint, current_app, jsonify, request

from wiseravenshare.server.core.events import bus
from wiseravenshare.server.core.queue import queue

bp = Blueprint("post", __name__)

ASYNC_ACTIONS = {"upload", "post.video"}


@bp.route("/post", methods=["POST"])
def handle():
    body = request.get_json(force=True)
    platform_name = body.get("platform")
    action = body.get("action")
    data = body.get("data", {})

    if not platform_name or not action:
        return jsonify({"error": "platform and action are required"}), 400

    if action in ASYNC_ACTIONS:
        job_id = queue.enqueue(f"{platform_name}.{action}", data)
        return jsonify({"queued": True, "job_id": job_id}), 202

    try:
        platform = current_app.config["build_platform"](platform_name)
        if action == "post":
            result = platform.post(data)
        elif action == "gather":
            result = platform.gather(data)
        elif action == "status":
            result = platform.status(data["external_id"])
        elif action == "upload":
            from wiseravenshare.server.core.models import MediaUpload

            result = platform.upload(MediaUpload(**data))
        else:
            return jsonify({"error": f"unsupported action {action}"}), 400

        payload = result.__dict__ if hasattr(result, "__dict__") else result
        bus.emit("publish.result", {"platform": platform_name, "result": payload})
        return jsonify({"success": True, "result": payload})
    except KeyError:
        return jsonify({"success": False, "error": f"unknown platform {platform_name}"}), 404
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500
