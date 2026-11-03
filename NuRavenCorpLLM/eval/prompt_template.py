"""
Prompt engineering module for NuRavenCorpLLM evaluation pipeline.

Wraps raw task prompts with:
  - A grounding system/role constraint header
  - Optional few-shot examples from the golden set
  - Optional chain-of-thought (CoT) forcing
  - Post-generation output extraction (strips prompt echo)

Usage:
    from eval.prompt_template import build_prompt, extract_completion

    wrapped = build_prompt(task_prompt, mode="few_shot_cot")
    raw_output = call_model(wrapped)
    clean = extract_completion(raw_output, wrapped)
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Literal

PromptMode = Literal["raw", "system", "few_shot", "cot", "few_shot_cot"]

# ---------------------------------------------------------------------------
# Grounding system header – constrains model to the task only
# Kept compact to stay within small context windows (e.g. 256 tokens).
# ---------------------------------------------------------------------------
SYSTEM_HEADER = "[INST] You are a concise, factual assistant. Answer only what is asked. [/INST]\n\n"

# ---------------------------------------------------------------------------
# Chain-of-thought forcing suffix
# ---------------------------------------------------------------------------
COT_SUFFIX = "\nAnswer:"

# ---------------------------------------------------------------------------
# Few-shot exemplars – deliberately short to fit small context windows
# ---------------------------------------------------------------------------
FEW_SHOT_EXAMPLES = [
    {
        "prompt": "Write a one sentence greeting for a software product.",
        "answer": "Welcome to the platform, where you can build and ship faster.",
    },
    {
        "prompt": "Return JSON with keys name and version.",
        "answer": '{"name": "nuraven", "version": "1.0"}',
    },
    {
        "prompt": "In one sentence, explain why logging matters.",
        "answer": "Logging captures runtime errors so engineers can diagnose failures quickly.",
    },
]


def _few_shot_block() -> str:
    lines: list[str] = []
    for ex in FEW_SHOT_EXAMPLES:
        lines.append(f"Q: {ex['prompt']}")
        lines.append(f"A: {ex['answer']}")
    lines.append("")
    return "\n".join(lines)


def build_prompt(task_prompt: str, mode: PromptMode = "few_shot_cot") -> str:
    """
    Build a wrapped prompt from a raw task instruction.

    Modes:
        raw          – pass-through, no modification
        system       – add role/constraint header only
        few_shot     – header + few-shot examples
        cot          – header + chain-of-thought suffix
        few_shot_cot – header + few-shot + CoT (recommended)
    """
    if mode == "raw":
        return task_prompt

    parts: list[str] = [SYSTEM_HEADER]

    if mode in ("few_shot", "few_shot_cot"):
        parts.append(_few_shot_block())

    if mode in ("cot", "few_shot_cot"):
        parts.append(f"Q: {task_prompt}{COT_SUFFIX}")
    else:
        parts.append(f"Q: {task_prompt}\nA:")

    return "".join(parts)


def extract_completion(raw_output: str, prompt_sent: str) -> str:
    """
    Strip the prompt echo from model output.

    GPT2-family continuation models repeat the full input before generating.
    We remove the prompt prefix and return only the generated completion.
    """
    # Try to strip exact prompt prefix first
    if raw_output.startswith(prompt_sent):
        return raw_output[len(prompt_sent):].strip()

    # Fuzzy strip: normalize whitespace comparison
    prompt_norm = re.sub(r"\s+", " ", prompt_sent.strip())
    output_norm = re.sub(r"\s+", " ", raw_output.strip())
    if output_norm.lower().startswith(prompt_norm.lower()):
        return raw_output[len(prompt_sent):].strip()

    # Fall back: find last Answer: marker
    answer_marker = re.search(r"\bAnswer:\s*", raw_output)
    if answer_marker:
        return raw_output[answer_marker.end():].strip()

    # Final fallback: find last "A:" pattern after a newline
    a_marker = re.search(r"\nA:\s*([^\n].*)$", raw_output, flags=re.DOTALL)
    if a_marker:
        return a_marker.group(1).strip()

    return raw_output.strip()


def load_few_shot_from_golden(golden_path: Path, n: int = 5) -> None:
    """
    Optionally replace built-in few-shot exemplars with top-N entries
    from your golden set (use after a human review pass).
    """
    global FEW_SHOT_EXAMPLES  # noqa: PLW0603
    examples: list[dict] = []
    with golden_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            examples.append({"prompt": obj["prompt"], "answer": obj.get("reference", "")})
            if len(examples) >= n:
                break
    if examples:
        FEW_SHOT_EXAMPLES = examples
