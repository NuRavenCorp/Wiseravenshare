"""The Overseer Agent (The Manager).

Implements the control loop:
  1. Receive Goal
  2. Consult Market Intelligence Agent
  3. Task Distribution (Content & SEO -> Outreach)
  4. Collect Results from Action Agents
  5. Adjust Strategy (feedback refines next cycle)
"""
from __future__ import annotations

import json
import time
from typing import Any

from .agents import ContentSEOAgent, MarketIntelligenceAgent, OutreachAgent
from .core import BaseAgent, GemmaClient, StateStore, Task, utcnow


class OverseerAgent(BaseAgent):
    name = "overseer"
    role = "manager"

    def __init__(self, gemma: GemmaClient, store: StateStore):
        super().__init__(gemma, store)
        self.intel = MarketIntelligenceAgent(gemma, store)
        self.content = ContentSEOAgent(gemma, store)
        self.outreach = OutreachAgent(gemma, store)

    # The overseer itself does not take specialist tasks.
    def run(self, task: Task) -> dict[str, Any]:
        raise NotImplementedError("use run_cycle()")

    # ------------------------------------------------------------------

    def run_cycle(
        self,
        goal: str,
        metrics: dict[str, Any] | None = None,
        site: str = "wise-ravens.com",
        brand: str = "Wise Ravens",
        channels: list[str] | None = None,
    ) -> dict[str, Any]:
        channels = channels or ["twitter", "reddit"]
        cycle_id = f"c{int(time.time())}"
        started = utcnow()
        self.store.log(self.name, "cycle_started", {"cycle": cycle_id, "goal": goal})

        # -- 1. Receive Goal -------------------------------------------
        self.store.log(self.name, "goal_received", {"goal": goal})

        # -- 2. Consult Market Intelligence -----------------------------
        t_intel = Task(
            id=f"{cycle_id}-intel", kind="market_scan", goal=goal,
            payload={"metrics": metrics or {}, "site": site},
        )
        intel = self.intel.handle(t_intel).result

        # -- 3. Task Distribution ----------------------------------------
        t_content = Task(
            id=f"{cycle_id}-content", kind="content_plan", goal=goal,
            payload={
                "opportunities": intel.get("opportunities", []),
                "brand": brand, "site": site,
            },
        )
        content = self.content.handle(t_content).result

        t_outreach = Task(
            id=f"{cycle_id}-outreach", kind="outreach", goal=goal,
            payload={"plans": content.get("plans", []), "channels": channels},
        )
        outreach = self.outreach.handle(t_outreach).result

        # -- 4. Collect Results ------------------------------------------
        n_opps = len(intel.get("opportunities", []))
        n_plans = len(content.get("plans", []))
        n_posts = sum(len(d.get("posts", [])) for d in outreach.get("drafts", []))
        n_rejected = len(outreach.get("rejected", [])) + len(content.get("rejected", []))

        # -- 5. Adjust Strategy (feedback loop) ---------------------------
        adjustment = self._adjust_strategy(
            goal, n_opps, n_plans, n_posts, n_rejected, intel, outreach
        )

        report = {
            "cycle": cycle_id,
            "started_at": started,
            "finished_at": utcnow(),
            "goal": goal,
            "model": self.gemma.name if self.gemma.enabled else "dry-run (heuristics)",
            "results": {
                "opportunities": n_opps,
                "content_plans": n_plans,
                "posts_drafted": n_posts,
                "guardrail_rejections": n_rejected,
            },
            "artifacts": {
                "intel_top_opportunity": (
                    intel["opportunities"][0] if intel.get("opportunities") else None
                ),
                "content_titles": [p.get("title") for p in content.get("plans", [])],
                "drafts": outreach.get("drafts", []),
            },
            "next_cycle": adjustment,
        }
        self.store.save_goal(report)
        self.store.log(self.name, "cycle_finished", {"cycle": cycle_id, "results": report["results"]})
        return report

    # ------------------------------------------------------------------

    def _adjust_strategy(
        self,
        goal: str,
        n_opps: int,
        n_plans: int,
        n_posts: int,
        n_rejected: int,
        intel: dict[str, Any],
        outreach: dict[str, Any],
    ) -> dict[str, Any]:
        """Feedback step: refine prompts/parameters for the next cycle."""
        if not self.gemma.enabled:
            focus = []
            if n_rejected:
                focus.append("tighten copy prompts to reduce guardrail rejections")
            if n_posts == 0:
                focus.append("broaden channel coverage")
            if not focus:
                focus.append("scale winning formats; keep cadence steady")
            return {"strategy_notes": focus, "source": "heuristic"}

        rejected_sample = json.dumps(outreach.get("rejected", [])[:5])
        prompt = (
            "You are the overseer of a revenue-generating agent team.\n"
            f"Goal: {goal}\n"
            f"This cycle produced: {n_opps} opportunities, {n_plans} content plans, "
            f"{n_posts} posts drafted, {n_rejected} guardrail rejections.\n"
            f"Rejected samples: {rejected_sample}\n\n"
            "Decide how to adjust the next cycle. Reply with ONLY JSON:\n"
            '{"strategy_notes": ["..."], "channel_weights": {"twitter": 0-1}, '
            '"prompt_tweaks": ["..."]}\n'
            "Be concrete and brief."
        )
        try:
            adj = self.ask_json(prompt, max_new_tokens=256)
        except ValueError:
            adj = {}
        adj.setdefault("strategy_notes", ["no usable adjustment returned"])
        adj["source"] = "gemma"
        return adj
