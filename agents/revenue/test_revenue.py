"""Tests for the revenue agent system (dry-run only - no model needed)."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from agents.revenue.agents import (
    ContentSEOAgent, MarketIntelligenceAgent, OutreachAgent, screen,
)
from agents.revenue.core import GemmaClient, StateStore, Task, extract_json
from agents.revenue.overseer import OverseerAgent


def _make(gemma_enabled: bool = False):
    store = StateStore(state_dir=Path("agents/revenue/state_test"))
    gemma = GemmaClient(enabled=gemma_enabled)
    overseer = OverseerAgent(gemma, store)
    return overseer, store


class TestGuardrails(unittest.TestCase):
    def test_bait_rejected(self):
        ok, reasons = screen("You won't BELIEVE this shocking trick!!")
        self.assertFalse(ok)
        self.assertIn("engagement bait", " ".join(reasons))

    def test_unverifiable_claim_rejected(self):
        ok, reasons = screen("This tool guarantees 100% safe results.")
        self.assertFalse(ok)

    def test_honest_copy_passes(self):
        ok, reasons = screen(
            "We built a feed that rewards what holds up. https://wise-ravens.com"
        )
        self.assertTrue(ok, reasons)


class TestExtractJson(unittest.TestCase):
    def test_plain(self):
        self.assertEqual(extract_json('{"a": 1}'), {"a": 1})

    def test_fenced(self):
        self.assertEqual(extract_json('```json\n{"a": 2}\n```'), {"a": 2})

    def test_prose_wrapped(self):
        self.assertEqual(extract_json('Sure! Here it is: {"a": 3} hope that helps'), {"a": 3})

    def test_raises_without_json(self):
        with self.assertRaises(ValueError):
            extract_json("no json here at all")


class TestDryRunCycle(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        for p in ("journal.jsonl", "goals.json"):
            f = Path("agents/revenue/state_test") / p
            if f.exists():
                f.unlink()
        d = Path("agents/revenue/state_test")
        if d.exists():
            d.rmdir()

    def test_full_cycle(self):
        overseer, _ = _make()
        report = overseer.run_cycle(goal="test goal")
        self.assertEqual(report["results"]["opportunities"], 1)
        self.assertEqual(report["results"]["content_plans"], 1)
        self.assertGreaterEqual(report["results"]["posts_drafted"], 1)
        self.assertEqual(report["next_cycle"]["source"], "heuristic")
        self.assertIn("model", report)

    def test_outreach_truncates_to_channel_limit(self):
        _, store = _make()
        agent = OutreachAgent(GemmaClient(enabled=False), store)
        task = Task(id="t1", kind="outreach", goal="g",
                    payload={"plans": [{"title": "x"}], "channels": ["twitter"]})
        result = agent.handle(task)
        self.assertEqual(task.status, "done")
        text = result.result["drafts"][0]["posts"][0]["text"]
        self.assertLessEqual(len(text), OutreachAgent.CHANNEL_LIMITS["twitter"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
