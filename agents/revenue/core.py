"""Core primitives for the multi-agent revenue system.

Task, BaseAgent, GemmaClient (local google/gemma-4-E4B-it), and StateStore.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

WORKSPACE = Path(__file__).resolve().parents[2]
GEMMA_HOME = Path(os.environ.get("GEMMA_HOME", r"C:\Users\arnol\AIsense\gemma-main"))
ASK_GEMMA = GEMMA_HOME / "ask_gemma.py"
GEMMA_PYTHON = GEMMA_HOME / "venv" / "Scripts" / "python.exe"


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Task model
# ---------------------------------------------------------------------------

@dataclass
class Task:
    """A unit of work passed between agents."""
    id: str
    kind: str                      # e.g. "market_scan", "content_plan", "outreach"
    goal: str                      # the high-level revenue goal this serves
    payload: dict[str, Any] = field(default_factory=dict)
    assigned_to: str = ""          # agent name
    status: str = "pending"        # pending | done | failed
    result: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=utcnow)
    finished_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "kind": self.kind, "goal": self.goal,
            "payload": self.payload, "assigned_to": self.assigned_to,
            "status": self.status, "result": self.result,
            "created_at": self.created_at, "finished_at": self.finished_at,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Task":
        return cls(**d)


# ---------------------------------------------------------------------------
# Gemma client
# ---------------------------------------------------------------------------

class GemmaClient:
    """Thin wrapper around ask_gemma.py (google/gemma-4-E4B-it, local venv).

    Falls back to a deterministic heuristic responder when the local model is
    unavailable, so the whole system still runs in dry-run mode.
    """

    name = "gemma-4-E4B-it"

    def __init__(self, enabled: bool = True, max_new_tokens: int = 512):
        self.enabled = enabled and ASK_GEMMA.exists() and GEMMA_PYTHON.exists()
        self.max_new_tokens = max_new_tokens
        self._loaded = False

    def _ensure_loaded(self) -> None:
        if not self._loaded:
            # First call pays the one-time weight-load cost; warm it with a ping.
            self.generate("Reply with exactly: OK", max_new_tokens=8)
            self._loaded = True

    def generate(self, prompt: str, max_new_tokens: int | None = None) -> str:
        tokens = max_new_tokens or self.max_new_tokens
        if not self.enabled:
            return self._fallback(prompt)
        try:
            cmd = [
                str(GEMMA_PYTHON), str(ASK_GEMMA),
                "--stdin", "--max-new-tokens", str(tokens),
            ]
            proc = subprocess.run(
                cmd, input=prompt.encode("utf-8"),
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                timeout=1800,
            )
            if proc.returncode != 0:
                raise RuntimeError(proc.stderr.decode("utf-8", "replace")[-500:])
            return proc.stdout.decode("utf-8", "replace").strip()
        except Exception as exc:
            print(f"[gemma] falling back to heuristic mode: {exc}", file=sys.stderr)
            self.enabled = False
            return self._fallback(prompt)

    # -- deterministic offline stand-in -------------------------------------

    @staticmethod
    def _fallback(prompt: str) -> str:
        return (
            '{"summary": "dry-run mode: no local model available", '
            '"actions": [], "notes": ["enable Gemma by restoring '
            f'{ASK_GEMMA}"]}}'
        )


# ---------------------------------------------------------------------------
# Base agent
# ---------------------------------------------------------------------------

class BaseAgent:
    """Specialist agent. Subclasses implement `run` and may use Gemma for
    reasoning. Every run is recorded in the shared StateStore."""

    name: str = "base"
    role: str = "specialist"

    def __init__(self, gemma: GemmaClient, store: "StateStore"):
        self.gemma = gemma
        self.store = store

    # -- LLM helpers ---------------------------------------------------------

    def ask(self, prompt: str, max_new_tokens: int | None = None) -> str:
        self.store.log(self.name, "llm_call", {"chars": len(prompt)})
        return self.gemma.generate(prompt, max_new_tokens=max_new_tokens)

    def ask_json(self, prompt: str, max_new_tokens: int | None = None) -> dict[str, Any]:
        """Ask Gemma and parse a JSON object out of the reply."""
        raw = self.ask(prompt, max_new_tokens=max_new_tokens)
        return extract_json(raw)

    # -- contract ------------------------------------------------------------

    def run(self, task: Task) -> dict[str, Any]:
        raise NotImplementedError

    def handle(self, task: Task) -> Task:
        task.assigned_to = self.name
        try:
            task.result = self.run(task)
            task.status = "done"
        except Exception as exc:
            task.status = "failed"
            task.result = {"error": repr(exc)}
        self.store.record_task(task)
        return task


# ---------------------------------------------------------------------------
# JSON extraction (LLMs like to wrap JSON in prose or fences)
# ---------------------------------------------------------------------------

def extract_json(text: str) -> dict[str, Any]:
    """Pull the first balanced {...} block out of an LLM reply."""
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    start = text.find("{")
    while start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    candidate = text[start:i + 1]
                    try:
                        parsed = json.loads(candidate)
                        if isinstance(parsed, dict):
                            return parsed
                    except json.JSONDecodeError:
                        break
                    break
        start = text.find("{", start + 1)
    raise ValueError(f"no valid JSON object found in: {text[:200]!r}")


def coerce_list(data: dict[str, Any], *keys: str) -> list[Any]:
    """Recover a list from common LLM schema slips.

    Tries each key in order; accepts a single object as a one-item list and
    unwraps {"items": [...]} style nesting.
    """
    for key in keys:
        if key in data:
            val = data[key]
            if isinstance(val, list):
                return [v for v in val if isinstance(v, dict)]
            if isinstance(val, dict):
                # e.g. {"plans": {"plan": {...}}} or a single plan object
                inner = val.get(key) or val.get("items") or val.get("list")
                if isinstance(inner, list):
                    return [v for v in inner if isinstance(v, dict)]
                return [val]
    # last resort: any list-of-dicts value in the payload
    for val in data.values():
        if isinstance(val, list) and val and all(isinstance(v, dict) for v in val):
            return val
    return []


# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

class StateStore:
    """Append-only journal + latest-goal snapshot, persisted as JSON."""

    def __init__(self, state_dir: Path | None = None):
        self.state_dir = Path(state_dir) if state_dir else WORKSPACE / "agents" / "revenue" / "state"
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.journal_path = self.state_dir / "journal.jsonl"
        self.goals_path = self.state_dir / "goals.json"

    def log(self, agent: str, event: str, data: dict[str, Any] | None = None) -> None:
        entry = {"ts": utcnow(), "agent": agent, "event": event, "data": data or {}}
        with self.journal_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def record_task(self, task: Task) -> None:
        self.log("overseer", "task_finished", task.to_dict())

    def save_goal(self, goal: dict[str, Any]) -> None:
        self.goals_path.write_text(
            json.dumps(goal, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    def load_goal(self) -> dict[str, Any]:
        if self.goals_path.exists():
            return json.loads(self.goals_path.read_text(encoding="utf-8"))
        return {}
