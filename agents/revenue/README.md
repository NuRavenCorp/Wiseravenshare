# Multi-Agent Revenue Generation System

Local-first revenue automation for Wise Ravens, powered by
`google/gemma-4-E4B-it` running on your own machine (no API keys, no cloud).

## Architecture

```
                 +---------------------------+
   goal -------->|  Overseer (manager)       |
                 |  - orchestration          |
                 |  - feedback loop          |
                 +------------+--------------+
                              |
        +---------------------+---------------------+
        v                     v                     v
+----------------+   +------------------+   +----------------+
| Market Intel   |   | Content & SEO    |   | Outreach       |
| (researcher)   |-->| (optimizer)      |-->| (action)       |
| trends, comps, |   | keyword plans,   |   | channel drafts,|
| pages, segments|   | outlines, CTAs   |   | limits, screen |
+----------------+   +------------------+   +----------------+
```

Each cycle: **Goal -> Intel -> Content plan -> Outreach drafts -> Adjust strategy**.
The adjustment step feeds the next cycle's prompts and channel weights.

## Files

| File | Purpose |
|---|---|
| `core.py` | `Task`, `BaseAgent`, `GemmaClient`, `StateStore`, JSON extraction |
| `agents.py` | The three specialist agents + guardrail screener |
| `overseer.py` | The Overseer control loop (`run_cycle`) |
| `__main__.py` | CLI: `run` / `demo` / `status` |

## Usage

```powershell
# One full cycle with the local model (first call loads weights, ~1-2 min)
& C:\Users\arnol\AIsense\gemma-main\venv\Scripts\python.exe -m agents.revenue run `
    --goal "Increase affiliate sales on wise-ravens.com by 10% this month" `
    --metrics-file metrics.json --channels twitter reddit facebook --json

# Dry-run with sample data - no model load, instant
& C:\Users\arnol\AIsense\gemma-main\venv\Scripts\python.exe -m agents.revenue demo

# Model availability + last cycle report
& C:\Users\arnol\AIsense\gemma-main\venv\Scripts\python.exe -m agents.revenue status
```

Run from the workspace root (`E:\NuRavenCorp\Wiseravenshare`) so
the `agents` package resolves.

## Dry-run mode

If `ask_gemma.py` or the gemma venv is missing (or you pass `--no-gemma`),
every agent falls back to deterministic sample outputs. The whole pipeline,
guardrails included, still runs — useful for CI and prompt development.

## Guardrails

All generated copy passes `screen()` before acceptance, mirroring the campaign
constraints in `docs/marketing/campaigns/2026-04-08-launch-truth-first.md`:
no astroturfing patterns, no unverifiable claims ("guaranteed", "100% works"),
no engagement bait ("you won't believe", "shocking"), no follow-back bait,
no spam pressure. Rejected items are reported per cycle, never silently dropped.

## State

- `state/journal.jsonl` - append-only event log (every LLM call, task result)
- `state/goals.json` - latest cycle report snapshot

## Extending

Add a specialist by subclassing `BaseAgent`, implementing `run(task)`, and
registering it in `OverseerAgent.__init__`. Use `self.ask_json(prompt)` for
structured reasoning; post-process deterministically and never trust raw LLM
output past the screener.
