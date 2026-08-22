"""CLI for the revenue agent system.

  python -m agents.revenue run --goal "..." [--metrics-file m.json] [--json]
  python -m agents.revenue demo
  python -m agents.revenue status
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .core import ASK_GEMMA, GEMMA_PYTHON, GemmaClient, StateStore
from .overseer import OverseerAgent


def _build(gemma_on: bool):
    store = StateStore()
    gemma = GemmaClient(enabled=gemma_on)
    return OverseerAgent(gemma, store), store


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

    sub.add_parser("demo", help="one dry-run cycle with sample data (no model load)")

    sub.add_parser("status", help="show model availability and last cycle report")

    args = parser.parse_args(argv)

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

    if args.cmd == "demo":
        overseer, _ = _build(gemma_on=False)
        report = overseer.run_cycle(
            goal="Increase affiliate sales on Site A by 10% this month",
            metrics={"sessions": 12000, "ctr": 0.021, "affiliate_rev": 830.0},
        )
        print(json.dumps(report, indent=2))
        return 0

    # -- run -------------------------------------------------------------
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
