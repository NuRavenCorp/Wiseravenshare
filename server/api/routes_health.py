from flask import Blueprint, current_app, jsonify

from wiseravenshare.server.core.registry import registry

bp = Blueprint("health", __name__)


@bp.route("/health")
def health():
    return jsonify({"status": "ok", "platforms": registry.names()})


@bp.route("/capabilities")
def capabilities():
    out = {}
    for name in registry.names():
        cls = registry.get_class(name)
        if cls is None:
            out[name] = []
            continue
        out[name] = sorted(getattr(cls, "capabilities", set()))
    return jsonify(out)


@bp.route("/platforms")
def platforms():
    build_platform = current_app.config.get("build_platform")
    names = registry.names()
    if not callable(build_platform):
        return jsonify({"platforms": names})

    status = {}
    for name in names:
        try:
            build_platform(name)
            status[name] = {"ready": True}
        except Exception as exc:
            status[name] = {"ready": False, "error": str(exc)}
    return jsonify({"platforms": status})
