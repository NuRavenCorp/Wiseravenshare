"""CLI for the revenue agent system.

  python -m agents.revenue run --goal "..." [--metrics-file m.json] [--json]
  python -m agents.revenue services [--api-url URL] [--nuravencorp-url URL] [--demo]
  python -m agents.revenue demo
  python -m agents.revenue status
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .core import ASK_GEMMA, GEMMA_PYTHON, GemmaClient, StateStore
from .overseer import OverseerAgent
from .services_agent import PaymentServicesAgent


def _build(gemma_on: bool):
    store = StateStore()
    gemma = GemmaClient(enabled=gemma_on)
    return OverseerAgent(gemma, store), store


def _build_services(
    gemma_on: bool,
    api_url: str | None = None,
    token: str | None = None,
    nuravencorp_url: str | None = None,
    nuravencorp_key: str | None = None,
) -> PaymentServicesAgent:
    store = StateStore()
    gemma = GemmaClient(enabled=gemma_on)
    return PaymentServicesAgent(
        gemma, store,
        wiseraven_url=api_url,
        wiseraven_token=token,
        nuravencorp_url=nuravencorp_url,
        nuravencorp_key=nuravencorp_key,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="agents.revenue")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_run = sub.add_parser("run", help="run one full overseer cycle (uses Gemma)")
    p_run.add_argument("--goal", required=True)
    p_run.add_argument("--metrics-file", type=Path, default=None,
                       help="JSON file with site metrics to feed the intel agent")
    p_run.add_argument("--site", default="wise-ravens.com")
    p_run.add_argument("--brand", default="Wise Ravens")
    p_run.add_argument("--channels", nargs="*", default=["twitter", "reddit"])
    p_run.add_argument("--no-gemma", action="store_true", help="force dry-run heuristics")
    p_run.add_argument("--json", action="store_true", help="machine-readable output")

    p_svc = sub.add_parser("services", help="run payment & subscription services agent")
    p_svc.add_argument("--api-url",         default=None,
                       help="Wiseravenshare API base URL (or set WISERAVEN_API_URL)")
    p_svc.add_argument("--token",           default=None,
                       help="Admin bearer token (or set WISERAVEN_ADMIN_TOKEN)")
    p_svc.add_argument("--nuravencorp-url", default=None,
                       help="NuRavenCorpLLM API URL (or set NURAVENCORP_LLM_API_URL)")
    p_svc.add_argument("--nuravencorp-key", default=None,
                       help="NuRavenCorpLLM API key (or set NURAVENCORP_LLM_API_KEY)")
    p_svc.add_argument("--goal",            default="monitor subscription and payment health")
    p_svc.add_argument("--metrics-file",    type=Path, default=None)
    p_svc.add_argument("--check",           choices=["health", "audit", "subs", "insight", "all"],
                       default="all",
                       help="which service check to run (default: all)")
    p_svc.add_argument("--no-gemma",        action="store_true")
    p_svc.add_argument("--demo",            action="store_true",
                       help="dry-run with mock data (no live API calls)")
    p_svc.add_argument("--json",            action="store_true")

    sub.add_parser("demo", help="one dry-run overseer cycle with sample data")
    sub.add_parser("status", help="show model availability and last cycle report")

    args = parser.parse_args(argv)

    # ── status ──────────────────────────────────────────────────────────────
    if args.cmd == "status":
        print(f"gemma script : {ASK_GEMMA} ({'OK' if ASK_GEMMA.exists() else 'MISSING'})")
        print(f"gemma python : {GEMMA_PYTHON} ({'OK' if GEMMA_PYTHON.exists() else 'MISSING'})")
        report = StateStore().load_goal()
        if report:
            print(f"last cycle   : {report.get('cycle')} @ {report.get('finished_at')}")
            print(json.dumps(report.get("results", {}), indent=2))
        else:
            print("last cycle   : none yet")
        return 0

    # ── demo ────────────────────────────────────────────────────────────────
    if args.cmd == "demo":
        overseer, _ = _build(gemma_on=False)
        report = overseer.run_cycle(
            goal="Increase affiliate sales on Site A by 10% this month",
            metrics={"sessions": 12000, "ctr": 0.021, "affiliate_rev": 830.0},
        )
        print(json.dumps(report, indent=2))
        return 0

    # ── services ────────────────────────────────────────────────────────────
    if args.cmd == "services":
        if args.demo:
            _run_services_demo(args)
            return 0

        agent = _build_services(
            gemma_on=not args.no_gemma,
            api_url=args.api_url,
            token=args.token,
            nuravencorp_url=args.nuravencorp_url,
            nuravencorp_key=args.nuravencorp_key,
        )
        if not agent.gemma.enabled:
            print("[warn] Gemma unavailable – running in dry-run heuristic mode",
                  file=sys.stderr)

        metrics = {}
        if getattr(args, "metrics_file", None):
            metrics = json.loads(args.metrics_file.read_text(encoding="utf-8"))

        check = getattr(args, "check", "all")
        if check == "all":
            report = agent.run_services_cycle(goal=args.goal, metrics=metrics)
        elif check == "health":
            from .core import Task as T
            report = agent.handle(T(id="srv-1", kind="payment_health", goal=args.goal)).result
        elif check == "audit":
            from .core import Task as T
            report = agent.handle(T(id="srv-2", kind="feature_audit", goal=args.goal)).result
        elif check == "subs":
            from .core import Task as T
            report = agent.handle(T(id="srv-3", kind="subscription_scan", goal=args.goal)).result
        elif check == "insight":
            from .core import Task as T
            report = agent.handle(T(id="srv-4", kind="revenue_insight", goal=args.goal,
                                    payload={"metrics": metrics, "goal": args.goal})).result
        else:
            report = {}

        if getattr(args, "json", False):
            print(json.dumps(report, indent=2))
        else:
            print(_human_services(report, check))
        return 0

    # ── run ─────────────────────────────────────────────────────────────────
    metrics = {}
    if args.metrics_file:
        metrics = json.loads(args.metrics_file.read_text(encoding="utf-8"))

    overseer, store = _build(gemma_on=not args.no_gemma)
    if not overseer.gemma.enabled:
        print("[warn] Gemma unavailable - running in dry-run heuristic mode",
              file=sys.stderr)

    report = overseer.run_cycle(
        goal=args.goal,
        metrics=metrics,
        site=args.site,
        brand=args.brand,
        channels=args.channels,
    )
    print(json.dumps(report, indent=2) if args.json else _human(report))
    return 0


def _run_services_demo(args) -> None:
    """Demo mode: print a mock services report without any live API calls."""
    print("[services demo] Running with mock data (no live API or model required)")
    mock = {
        "goal": args.goal,
        "summary": {
            "stripe_status":        "healthy",
            "active_subscriptions": 47,
            "estimated_mrr_usd":    2341.53,
            "cancellation_risk":    3,
            "features_gated":       4,
            "features_released":    5,
            "payment_issues":       [],
        },
        "payment_health": {"stripe_status": "healthy", "configured": True, "issues": []},
        "feature_audit":  {"gated": 4, "released": 5},
        "subscription_scan": {
            "active_subscriptions": 47, "estimated_mrr_usd": 2341.53,
            "cancellation_risk": 3,
        },
        "revenue_insight": {
            "llm_insight": "(NuRavenCorpLLM not configured in demo mode)",
            "gemma_insight": "(Gemma not loaded in demo mode)",
        },
    }
    print(json.dumps(mock, indent=2) if getattr(args, "json", False) else _human_services(mock))


def _human_services(report: dict, check: str = "all") -> str:
    lines: list[str] = []
    s = report.get("summary", report)

    if check == "all":
        lines += [
            "═══ Payment Services Agent Report ═══",
            f"  Stripe status       : {s.get('stripe_status', 'unknown')}",
            f"  Active subscriptions: {s.get('active_subscriptions', '—')}",
            f"  Estimated MRR       : ${s.get('estimated_mrr_usd', 0):.2f}/mo",
            f"  Cancellation risk   : {s.get('cancellation_risk', 0)} accounts",
            f"  Features gated      : {s.get('features_gated', '—')}",
            f"  Features released   : {s.get('features_released', '—')}",
        ]
        issues = s.get("payment_issues", [])
        if issues:
            lines.append("\n  ⚠ Payment issues:")
            lines += [f"    - {i}" for i in issues]
    else:
        lines.append(f"═══ Services check: {check} ═══")
        for k, v in report.items():
            if isinstance(v, (str, int, float, bool)):
                lines.append(f"  {k}: {v}")

    # LLM insight
    insight = (
        report.get("revenue_insight", {}).get("llm_insight")
        or report.get("llm_insight")
    )
    if insight and "(NuRavenCorpLLM" not in insight:
        lines += ["", "  NuRaven LLM insight:", f"  {insight[:400]}"]

    return "\n".join(lines)


def _human(report: dict) -> str:
    lines = [
        f"Cycle {report['cycle']} - {report['goal']}",
        f"Model: {report['model']}",
        "",
        "Results:",
    ]
    for k, v in report["results"].items():
        lines.append(f"  {k:22} {v}")
    top = report["artifacts"].get("intel_top_opportunity")
    if top:
        lines += ["", f"Top opportunity (score {top.get('score')}): {top.get('title')}"]
        if top.get("rationale"):
            lines.append(f"  {top['rationale']}")
    titles = report["artifacts"].get("content_titles") or []
    if titles:
        lines += ["", "Content plans:"]
        lines += [f"  - {t}" for t in titles]
    drafts = report["artifacts"].get("drafts") or []
    if drafts:
        lines += ["", "Draft posts:"]
        for d in drafts:
            for p in d.get("posts", []):
                lines.append(
                    f"  [{p['channel']}] {p['text'][:100]}"
                    f"{'...' if len(p['text']) > 100 else ''}"
                )
    nxt = report.get("next_cycle", {})
    notes = nxt.get("strategy_notes") or []
    if notes:
        lines += ["", "Next-cycle adjustments:"]
        lines += [f"  - {n}" for n in notes]
    return "\n".join(lines)


if __name__ == "__main__":
    sys.exit(main())


    overseer, store = _build(gemma_on=not args.no_gemma)
    if not overseer.gemma.enabled:
        print("[warn] Gemma unavailable - running in dry-run heuristic mode",
              file=sys.stderr)

    report = overseer.run_cycle(
        goal=args.goal,
        metrics=metrics,
        site=args.site,
        brand=args.brand,
        channels=args.channels,
    )
    print(json.dumps(report, indent=2) if args.json else _human(report))
    return 0


def _human(report: dict) -> str:
    lines = [
        f"Cycle {report['cycle']} - {report['goal']}",
        f"Model: {report['model']}",
        "",
        "Results:",
    ]
    for k, v in report["results"].items():
        lines.append(f"  {k:22} {v}")
    top = report["artifacts"].get("intel_top_opportunity")
    if top:
        lines += ["", f"Top opportunity (score {top.get('score')}): {top.get('title')}"]
        if top.get("rationale"):
            lines.append(f"  {top['rationale']}")
    titles = report["artifacts"].get("content_titles") or []
    if titles:
        lines += ["", "Content plans:"]
        lines += [f"  - {t}" for t in titles]
    drafts = report["artifacts"].get("drafts") or []
    if drafts:
        lines += ["", "Draft posts:"]
        for d in drafts:
            for p in d.get("posts", []):
                lines.append(f"  [{p['channel']}] {p['text'][:100]}{'...' if len(p['text']) > 100 else ''}")
    nxt = report.get("next_cycle", {})
    notes = nxt.get("strategy_notes") or []
    if notes:
        lines += ["", "Next-cycle adjustments:"]
        lines += [f"  - {n}" for n in notes]
    return "\n".join(lines)


if __name__ == "__main__":
    sys.exit(main())
