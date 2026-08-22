"""Specialist agents: Market Intelligence, Content & SEO, Outreach.

Each agent pairs deterministic data handling with local-Gemma reasoning.
All generated copy passes through the campaign guardrail screener before it
is accepted (no astroturfing, no unverifiable claims, no engagement bait).
"""
from __future__ import annotations

import json
import re
from typing import Any

from .core import BaseAgent, Task, coerce_list

# ---------------------------------------------------------------------------
# Guardrails (mirrors docs/marketing/campaigns constraints)
# ---------------------------------------------------------------------------

GUARDRAIL_PATTERNS: list[tuple[str, str]] = [
    (r"\b(guarantee[sd]?|100% (?:safe|effective|works))\b", "unverifiable claim"),
    (r"\b(you won'?t believe|shocking|insane|gone wrong|must see)\b", "engagement bait"),
    (r"\b(actually|secretly) (a|an|the) .{0,40}(scam|fraud|liar)", "unverifiable attack"),
    (r"\bfollow(?:ing)? (?:me|us) back\b", "follow-back bait"),
    (r"\bbuy now!!+\b", "spam pressure"),
]

INFLAMMATORY = re.compile(
    "|".join(f"({p})" for p, _ in GUARDRAIL_PATTERNS), re.IGNORECASE
)


def screen(text: str) -> tuple[bool, list[str]]:
    """Return (passes, reasons). Campaign copy must pass all guardrails."""
    hits = [label for pat, label in GUARDRAIL_PATTERNS if re.search(pat, text, re.IGNORECASE)]
    return (not hits), hits


def _screen_items(items: list[dict[str, Any]], *fields: str) -> list[dict[str, Any]]:
    kept, rejected = [], []
    for item in items:
        blob = " ".join(str(item.get(f, "")) for f in fields)
        ok, reasons = screen(blob)
        if ok:
            kept.append(item)
        else:
            item["rejected_for"] = reasons
            rejected.append(item)
    return kept


# ---------------------------------------------------------------------------
# 2. Market Intelligence Agent (The Researcher)
# ---------------------------------------------------------------------------

class MarketIntelligenceAgent(BaseAgent):
    name = "market_intel"
    role = "researcher"

    def run(self, task: Task) -> dict[str, Any]:
        metrics = task.payload.get("metrics", {})
        site = task.payload.get("site", "wise-ravens.com")

        # Dry-run: deterministic sample analysis, no model needed.
        if not self.gemma.enabled:
            return {
                "site": site,
                "trends": ["truth-first social discovery", "source-verification tooling"],
                "competitor_moves": ["rivals leaning on engagement-bait formats"],
                "underperforming_pages": ["/blog/archive"],
                "segments": [{"name": "skeptic-curious professionals", "potential": "high"}],
                "opportunities": [{
                    "title": DRY_RUN_PLANS[0]["title"],
                    "rationale": "aligns with the truth-first launch campaign",
                    "score": 8,
                }],
            }

        brief = json.dumps(metrics, indent=2) if metrics else "(no metrics supplied)"

        prompt = (
            "You are a market intelligence analyst for an affiliate/content business.\n"
            f"Site under management: {site}\n"
            f"Latest performance metrics:\n{brief}\n\n"
            "Identify revenue opportunities. Reply with ONLY a JSON object:\n"
            '{"trends": ["..."], "competitor_moves": ["..."], '
            '"underperforming_pages": ["..."], '
            '"segments": [{"name": "...", "potential": "high|medium|low"}], '
            '"opportunities": [{"title": "...", "rationale": "...", "score": 1-10}]}\n'
            "Score opportunities by expected revenue impact vs effort."
        )
        analysis = self.ask_json(prompt)
        opportunities = coerce_list(analysis, "opportunities")

        # Deterministic post-processing: keep only well-formed, scored items.
        opps = [
            o for o in opportunities
            if isinstance(o, dict) and o.get("title")
        ]
        for o in opps:
            try:
                o["score"] = max(1, min(10, int(o.get("score", 5))))
            except (TypeError, ValueError):
                o["score"] = 5
        opps.sort(key=lambda o: o["score"], reverse=True)

        return {
            "site": site,
            "trends": [str(t) for t in analysis.get("trends", [])][:8],
            "competitor_moves": [str(c) for c in analysis.get("competitor_moves", [])][:8],
            "underperforming_pages": [str(p) for p in analysis.get("underperforming_pages", [])][:8],
            "segments": analysis.get("segments", [])[:6],
            "opportunities": opps[:10],
        }


# ---------------------------------------------------------------------------
# 3. Content & SEO Agent (The Optimizer)
# ---------------------------------------------------------------------------

class ContentSEOAgent(BaseAgent):
    name = "content_seo"
    role = "optimizer"

    def run(self, task: Task) -> dict[str, Any]:
        opportunities = task.payload.get("opportunities", [])
        brand = task.payload.get("brand", "Wise Ravens")
        site = task.payload.get("site", "wise-ravens.com")
        top = opportunities[:3]

        if not top:
            return {"plans": [], "note": "no opportunities supplied"}

        # Dry-run: return the canned plan, still guardrail-screened.
        if not self.gemma.enabled:
            plans = _screen_items([dict(DRY_RUN_PLANS[0])], "title", "cta", "affiliate_angle")
            return {"plans": plans, "rejected": []}

        listing = "\n".join(
            f"{i + 1}. {o.get('title')}: {o.get('rationale', '')}" for i, o in enumerate(top)
        )
        prompt = (
            f"You are the content & SEO strategist for {brand} ({site}).\n"
            "Turn these validated opportunities into a content plan.\n"
            f"{listing}\n\n"
            "Reply with ONLY a JSON object:\n"
            '{"plans": [{"target_keyword": "...", "title": "...", '
            '"outline": ["..."], "cta": "...", "affiliate_angle": "..."}]}\n'
            "Rules: honest claims only, CTA must point to "
            f"{site}, no engagement bait."
        )
        raw = self.ask_json(prompt)
        plans = coerce_list(raw, "plans")

        # Corrective retry: one more attempt if the model returned no usable plans.
        if not plans:
            retry_prompt = (
                "Your previous reply could not be parsed as the requested schema.\n"
                "Answer again with ONLY a JSON object of exactly this shape:\n"
                '{"plans": [{"target_keyword": "...", "title": "...", '
                '"outline": ["..."], "cta": "...", "affiliate_angle": "..."}]}\n'
                f"Original task: {listing}\n"
                "Include at least one plan. No prose outside the JSON."
            )
            raw = self.ask_json(retry_prompt, max_new_tokens=384)
            plans = coerce_list(raw, "plans")

        kept = _screen_items(plans, "title", "cta", "affiliate_angle")
        for p in kept:
            p.setdefault("outline", [])
        return {
            "plans": kept[:5],
            "rejected": [p.get("title", "?") for p in plans if p not in kept],
        }


# ---------------------------------------------------------------------------
# 4. Outreach Agent (The Action)
# ---------------------------------------------------------------------------

class OutreachAgent(BaseAgent):
    name = "outreach"
    role = "action"

    CHANNEL_LIMITS = {
        "twitter": 280, "x": 280,
        "reddit": 40000, "facebook": 5000,
        "instagram": 2200, "tiktok": 2200,
    }

    def run(self, task: Task) -> dict[str, Any]:
        plans = task.payload.get("plans", [])
        channels = task.payload.get("channels", ["twitter", "reddit"])
        drafts: list[dict[str, Any]] = []
        rejected: list[str] = []

        # Dry-run: canned posts per channel, still guardrail-screened.
        if not self.gemma.enabled:
            posts = []
            for channel in channels:
                text = DRY_RUN_POSTS.get(channel)
                if text is None:
                    continue
                ok, reasons = screen(text)
                if ok:
                    posts.append({"channel": channel, "text": text})
                else:
                    rejected.append(f"{channel}: {reasons}")
            keyword = plans[0].get("target_keyword", "") if plans else ""
            return {"drafts": [{"plan": "dry-run plan", "keyword": keyword, "posts": posts}],
                    "rejected": rejected}

        for plan in plans:
            title = plan.get("title", "untitled plan")
            keyword = plan.get("target_keyword", "")
            cta = plan.get("cta", "https://wise-ravens.com")

            listing = json.dumps(plan, indent=2)
            prompt = (
                "You are a social outreach copywriter.\n"
                f"Write one post per channel from this content plan:\n{listing}\n\n"
                "Channels and hard limits: "
                + ", ".join(f"{c}={self.CHANNEL_LIMITS.get(c, 2000)} chars" for c in channels)
                + "\nReply with ONLY a JSON object:\n"
                '{"posts": [{"channel": "...", "text": "..."}]}\n'
                "Rules: value-first tone, disclose affiliate intent where required, "
                f"include the CTA link, stay under each channel limit."
            )
            raw = self.ask_json(prompt)
            posts_raw = coerce_list(raw, "posts")

            posts = []
            for post in posts_raw:
                channel = str(post.get("channel", "")).lower().strip()
                text = str(post.get("text", ""))
                if channel not in channels:
                    continue
                ok, reasons = screen(text)
                if not ok:
                    rejected.append(f"{channel}: {reasons}")
                    continue
                if len(text) > self.CHANNEL_LIMITS.get(channel, 2000):
                    text = text[: self.CHANNEL_LIMITS[channel] - 1] + "…"
                posts.append({"channel": channel, "text": text})
            drafts.append({"plan": title, "keyword": keyword, "posts": posts})

        return {"drafts": drafts, "rejected": rejected}


# ---------------------------------------------------------------------------
# Guardrail-only fallback used when Gemma is offline (dry-run mode)
# ---------------------------------------------------------------------------

DRY_RUN_PLANS = [
    {
        "target_keyword": "truth-first social media",
        "title": "Why truth-first social needs verifiable sourcing",
        "outline": ["problem", "approach", "proof", "CTA"],
        "cta": "https://wise-ravens.com",
        "affiliate_angle": "honest review roundup",
    }
]

DRY_RUN_POSTS = {
    "twitter": (
        "Most feeds reward whoever shouts loudest. We built a feed that rewards "
        "what holds up. Truth-first social is live: https://wise-ravens.com"
    ),
    "reddit": (
        "We kept asking why nothing online could show its sources, so we built a "
        "platform around it. Happy to answer questions about the approach."
    ),
}
