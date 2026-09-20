"""Payment & Subscription Services Agent.

Dedicated agent for monitoring subscription health, payment events, and
revenue insights. Integrates with both local Gemma and the NuRavenCorpLLM
API for deeper analysis.

Usage:
    python -m agents.revenue services --api-url https://wise-ravens.com/api
    python -m agents.revenue services --demo
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

from .core import BaseAgent, GemmaClient, StateStore, Task, utcnow


# ---------------------------------------------------------------------------
# NuRavenCorpLLM gateway client
# ---------------------------------------------------------------------------

class NuRavenLLMClient:
    """Thin HTTP client that queries NuRavenCorpLLM for revenue insights.

    Set NURAVENCORP_LLM_API_URL and optionally NURAVENCORP_LLM_API_KEY
    in the environment (or pass via constructor).
    """

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: int = 20,
    ):
        self.base_url = (
            (base_url or os.environ.get("NURAVENCORP_LLM_API_URL", "")).rstrip("/")
        )
        self.api_key = api_key or os.environ.get("NURAVENCORP_LLM_API_KEY", "")
        self.timeout = timeout
        self.enabled = bool(self.base_url)

    def chat(self, user_message: str, system_prompt: str = "") -> str:
        """POST /api/chat and return the assistant reply text."""
        if not self.enabled:
            return "(NuRavenCorpLLM not configured — set NURAVENCORP_LLM_API_URL)"

        body = json.dumps({
            "messages": [{"role": "user", "content": user_message}],
            "systemPrompt": system_prompt or (
                "You are NuRaven, an expert revenue and subscription analyst. "
                "Respond concisely with actionable insights."
            ),
        }).encode()

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-Api-Key"] = self.api_key

        req = urllib.request.Request(
            f"{self.base_url}/api/chat",
            data=body,
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read())
                return (
                    data.get("reply")
                    or data.get("content")
                    or data.get("message")
                    or "(empty response)"
                )
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
            return f"(NuRavenCorpLLM error: {exc})"


# ---------------------------------------------------------------------------
# Wiseravenshare API client (subscription + payment data)
# ---------------------------------------------------------------------------

class WiseravenAPIClient:
    """HTTP client for the Wiseravenshare backend API.

    Set WISERAVEN_API_URL and WISERAVEN_ADMIN_TOKEN in the environment,
    or pass via constructor.
    """

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        timeout: int = 15,
    ):
        raw = base_url or os.environ.get("WISERAVEN_API_URL", "https://wise-ravens.com/api")
        self.base_url = raw.rstrip("/")
        self.token = token or os.environ.get("WISERAVEN_ADMIN_TOKEN", "")
        self.timeout = timeout

    def _get(self, path: str) -> dict[str, Any]:
        headers: dict[str, str] = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(
            f"{self.base_url}{path}", headers=headers, method="GET"
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read())
        except (urllib.error.URLError, json.JSONDecodeError) as exc:
            return {"error": str(exc)}

    def get_stripe_health(self) -> dict[str, Any]:
        return self._get("/payments/health")

    def get_webhook_workflow(self) -> dict[str, Any]:
        return self._get("/billing/webhook-workflow")

    def get_feature_catalog(self) -> dict[str, Any]:
        return self._get("/admin/feature-release/catalog")

    def get_subscription_status(self, user_id: str = "") -> dict[str, Any]:
        path = f"/billing/subscription?userId={user_id}" if user_id else "/billing/subscription"
        return self._get(path)


# ---------------------------------------------------------------------------
# Payment Services Agent
# ---------------------------------------------------------------------------

class PaymentServicesAgent(BaseAgent):
    """Dedicated agent for subscription health, payment monitoring, and
    revenue insights via both local Gemma and NuRavenCorpLLM.
    """

    name = "payment_services"
    role = "services_monitor"

    # Tier price reference (matches FeatureReleaseController.TierCatalog)
    TIER_PRICES_USD = {
        "free":          0.00,
        "creator-pro":   19.00,
        "copy-standard": 9.00,
        "copy-pro":      29.00,
        "growth-suite":  49.00,
        "studio-plus":   99.00,
        "podcast-pro":   149.00,
        # IP Protection
        "ip-basic":      4.99,
        "ip-standard":   14.99,
        "ip-pro":        29.99,
    }

    def __init__(
        self,
        gemma: GemmaClient,
        store: StateStore,
        wiseraven_url: str | None = None,
        wiseraven_token: str | None = None,
        nuravencorp_url: str | None = None,
        nuravencorp_key: str | None = None,
    ):
        super().__init__(gemma, store)
        self.api    = WiseravenAPIClient(wiseraven_url, wiseraven_token)
        self.llm    = NuRavenLLMClient(nuravencorp_url, nuravencorp_key)

    def run(self, task: Task) -> dict[str, Any]:
        kind = task.kind

        if kind == "payment_health":
            return self.run_payment_health()
        if kind == "feature_audit":
            return self.run_feature_audit()
        if kind == "revenue_insight":
            return self.run_revenue_insight(task.payload)
        if kind == "subscription_scan":
            return self.run_subscription_scan(task.payload)

        return {"error": f"unknown task kind: {kind}"}

    # ── Payment Health ───────────────────────────────────────────────────────

    def run_payment_health(self) -> dict[str, Any]:
        """Check Stripe config and webhook pipeline status."""
        stripe_health = self.api.get_stripe_health()
        webhook       = self.api.get_webhook_workflow()
        issues        = stripe_health.get("issues", [])

        status = "healthy" if not issues else "degraded"

        summary = {
            "checked_at":    utcnow(),
            "stripe_status": status,
            "configured":    stripe_health.get("configured", False),
            "issues":        issues,
            "webhook_triggers": len(webhook.get("triggers", [])),
            "subscriptions_tracked": len(webhook.get("subscriptions", [])),
        }

        if issues and self.gemma.enabled:
            prompt = (
                "Payment health issues detected:\n"
                + "\n".join(f"- {i}" for i in issues)
                + "\n\nSuggest concise remediation steps as JSON:\n"
                '{"remediation_steps": ["..."]}'
            )
            try:
                advice = self.ask_json(prompt)
                summary["remediation_advice"] = advice.get("remediation_steps", [])
            except ValueError:
                summary["remediation_advice"] = []

        # Also ask NuRavenCorpLLM for deeper insight
        if issues:
            llm_insight = self.llm.chat(
                user_message=(
                    f"Stripe configuration has {len(issues)} issues: "
                    + "; ".join(issues[:5])
                    + ". What revenue risk does this create and how should it be fixed?"
                ),
            )
            summary["llm_insight"] = llm_insight

        self.store.log(self.name, "payment_health_checked", summary)
        return summary

    # ── Feature Audit ────────────────────────────────────────────────────────

    def run_feature_audit(self) -> dict[str, Any]:
        """Audit which features are gated vs released."""
        catalog = self.api.get_feature_catalog()
        features = catalog.get("features", [])
        gated    = [f for f in features if f.get("status") == "gated"]
        released = [f for f in features if f.get("status") == "released"]

        audit = {
            "checked_at": utcnow(),
            "total":      len(features),
            "released":   len(released),
            "gated":      len(gated),
            "gated_features": [
                {"key": f["key"], "name": f["name"], "tier": f.get("requiredTier")}
                for f in gated
            ],
            "released_features": [
                {"key": f["key"], "name": f["name"], "tier": f.get("requiredTier")}
                for f in released
            ],
        }

        if gated:
            insight = self.llm.chat(
                user_message=(
                    f"{len(gated)} features are currently gated: "
                    + ", ".join(f.get("name", f.get("key")) for f in gated[:5])
                    + f". {len(released)} features are released. "
                    "What is the likely revenue impact and are there any gating "
                    "patterns worth changing?"
                )
            )
            audit["llm_insight"] = insight

        self.store.log(self.name, "feature_audit", audit)
        return audit

    # ── Revenue Insight ──────────────────────────────────────────────────────

    def run_revenue_insight(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Use NuRavenCorpLLM + local Gemma to generate revenue insights."""
        metrics = payload.get("metrics", {})
        goal    = payload.get("goal", "increase subscription revenue")

        metrics_str = json.dumps(metrics, indent=2) if metrics else "(no metrics provided)"

        # Ask NuRavenCorpLLM
        llm_insight = self.llm.chat(
            user_message=(
                f"Revenue goal: {goal}\n\n"
                f"Current metrics:\n{metrics_str}\n\n"
                "Provide 3–5 specific, actionable revenue recommendations. "
                "Focus on subscription upsells, feature gating strategy, "
                "and pricing tier optimisation."
            ),
            system_prompt=(
                "You are NuRaven, a revenue strategy advisor for the WiseRavenShare "
                "music and podcast creator platform. The platform has the following "
                "subscription tiers: Free, Creator Pro ($19/mo), Growth Suite ($49/mo), "
                "Studio Plus ($99/mo), Podcast Pro Bundle ($149/mo), "
                "Copy Standard ($9/mo), Copy Pro ($29/mo), "
                "IP Basic ($4.99/mo), IP Standard ($14.99/mo), IP Pro ($29.99/mo)."
            ),
        )

        # Also ask local Gemma if available
        gemma_insight: str | None = None
        if self.gemma.enabled:
            try:
                raw = self.ask_json(
                    f"Revenue goal: {goal}\nMetrics: {metrics_str}\n"
                    "Suggest 3 revenue improvements. Reply with ONLY JSON:\n"
                    '{"suggestions": ["..."]}'
                )
                gemma_insight = "; ".join(raw.get("suggestions", []))
            except ValueError:
                pass

        result = {
            "checked_at":   utcnow(),
            "goal":         goal,
            "llm_insight":  llm_insight,
            "gemma_insight": gemma_insight,
        }
        self.store.log(self.name, "revenue_insight", result)
        return result

    # ── Subscription Scan ────────────────────────────────────────────────────

    def run_subscription_scan(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Summarise subscription landscape from webhook workflow data."""
        webhook     = self.api.get_webhook_workflow()
        subs        = webhook.get("subscriptions", [])
        triggers    = webhook.get("triggers", [])

        active   = [s for s in subs if s.get("status") in ("active", "trialing")]
        inactive = [s for s in subs if s.get("status") not in ("active", "trialing")]
        cancel_risk = [s for s in active if s.get("cancelAtPeriodEnd")]

        # Estimate monthly recurring revenue from known tier prices
        mrr = 0.0
        for sub in active:
            price_id = (sub.get("stripePriceId") or "").lower()
            for tier, price in self.TIER_PRICES_USD.items():
                if tier.replace("-", "_") in price_id or tier.replace("-", "") in price_id:
                    mrr += price
                    break

        scan = {
            "checked_at":            utcnow(),
            "total_tracked":         len(subs),
            "active_subscriptions":  len(active),
            "inactive_subscriptions": len(inactive),
            "cancellation_risk":     len(cancel_risk),
            "estimated_mrr_usd":     round(mrr, 2),
            "webhook_triggers":      [t.get("trigger") for t in triggers],
            "at_risk_details": [
                {
                    "userId": s.get("userId"),
                    "status": s.get("status"),
                    "periodEnd": s.get("currentPeriodEnd"),
                }
                for s in cancel_risk[:10]
            ],
        }

        if cancel_risk or inactive:
            churn_msg = (
                f"{len(cancel_risk)} subscriptions set to cancel, "
                f"{len(inactive)} inactive. "
                f"Estimated MRR: ${mrr:.2f}/month."
            )
            scan["llm_insight"] = self.llm.chat(
                user_message=(
                    churn_msg
                    + " What retention strategies would reduce churn risk for a "
                    "creator-focused subscription platform?"
                )
            )

        self.store.log(self.name, "subscription_scan", scan)
        return scan

    # ── Full Services Cycle ───────────────────────────────────────────────────

    def run_services_cycle(
        self,
        goal: str = "monitor subscription and payment health",
        metrics: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Run all four service checks and return a consolidated report."""
        started = utcnow()
        self.store.log(self.name, "services_cycle_started", {"goal": goal})

        t_health = Task(id="svc-health",  kind="payment_health",    goal=goal, payload={})
        t_audit  = Task(id="svc-audit",   kind="feature_audit",     goal=goal, payload={})
        t_subs   = Task(id="svc-subs",    kind="subscription_scan", goal=goal, payload={})
        t_insight= Task(id="svc-insight", kind="revenue_insight",   goal=goal,
                        payload={"metrics": metrics or {}, "goal": goal})

        health  = self.handle(t_health).result
        audit   = self.handle(t_audit).result
        subs    = self.handle(t_subs).result
        insight = self.handle(t_insight).result

        report = {
            "started_at": started,
            "finished_at": utcnow(),
            "goal": goal,
            "payment_health": health,
            "feature_audit":  audit,
            "subscription_scan": subs,
            "revenue_insight":   insight,
            "summary": {
                "stripe_status":         health.get("stripe_status"),
                "active_subscriptions":  subs.get("active_subscriptions"),
                "estimated_mrr_usd":     subs.get("estimated_mrr_usd"),
                "cancellation_risk":     subs.get("cancellation_risk"),
                "features_gated":        audit.get("gated"),
                "features_released":     audit.get("released"),
                "payment_issues":        health.get("issues", []),
            },
        }

        self.store.log(self.name, "services_cycle_finished", report["summary"])
        return report
