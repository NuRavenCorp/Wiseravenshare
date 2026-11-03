import argparse
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

# Allow running from repo root: python eval/run_eval.py
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.prompt_template import PromptMode, build_prompt, extract_completion  # noqa: E402

DEFAULT_ENDPOINT = "http://127.0.0.1:8001/generate"


@dataclass
class EvalRow:
    row_id: str
    prompt: str
    reference: str
    keywords: list[str]
    expects_json: bool
    json_required_keys: list[str]


def normalize_text(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"\s+", " ", text)
    return text


def token_set(text: str) -> set[str]:
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", " ", text.lower())
    return {t for t in cleaned.split() if t}


def exact_match(a: str, b: str) -> bool:
    return normalize_text(a) == normalize_text(b)


def jaccard_similarity(a: str, b: str) -> float:
    a_tokens = token_set(a)
    b_tokens = token_set(b)
    if not a_tokens and not b_tokens:
        return 1.0
    union = a_tokens | b_tokens
    if not union:
        return 0.0
    return len(a_tokens & b_tokens) / len(union)


def keyword_recall(text: str, keywords: list[str]) -> float:
    if not keywords:
        return 1.0
    haystack = normalize_text(text)
    hits = 0
    for kw in keywords:
        if normalize_text(kw) in haystack:
            hits += 1
    return hits / len(keywords)


def check_json_schema(text: str, required_keys: list[str]) -> tuple[bool, str | None]:
    candidate = text.strip()

    # If wrapped in markdown fences, prefer fenced payload.
    fence_match = re.search(r"```(?:json)?\s*(.*?)```", candidate, flags=re.IGNORECASE | re.DOTALL)
    if fence_match:
        candidate = fence_match.group(1).strip()

    # If there's conversational prefix/suffix, try first JSON object span.
    if not candidate.startswith("{") or not candidate.endswith("}"):
        first = candidate.find("{")
        last = candidate.rfind("}")
        if first != -1 and last != -1 and last > first:
            candidate = candidate[first : last + 1].strip()

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError as ex:
        return False, f"invalid_json: {ex.msg}"

    if not isinstance(parsed, dict):
        return False, "json_not_object"

    missing = [k for k in required_keys if k not in parsed]
    if missing:
        return False, f"missing_keys: {','.join(missing)}"
    return True, None


def http_json_post(url: str, payload: dict[str, Any], timeout_seconds: int) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw)


def generate_text(
    endpoint: str,
    prompt: str,
    timeout_seconds: int,
    max_new_tokens: int,
    temperature: float,
    top_p: float = 0.9,
) -> str:
    payloads = [
        {
            "prompt": prompt,
            "max_new_tokens": max_new_tokens,
            "temperature": temperature,
            "top_k": 50,
            "top_p": top_p,
            "stream": False,
        },
        # Fallback for simpler serve.py endpoint schema
        {"prompt": prompt, "max_new_tokens": max_new_tokens, "temperature": temperature},
    ]

    errors: list[str] = []
    for payload in payloads:
        try:
            data = http_json_post(endpoint, payload, timeout_seconds=timeout_seconds)
            text = data.get("text")
            if isinstance(text, str):
                return text
            raise RuntimeError("response_missing_text")
        except urllib.error.HTTPError as ex:
            errors.append(f"http_{ex.code}")
        except Exception as ex:  # noqa: BLE001
            errors.append(type(ex).__name__)
    raise RuntimeError(f"request_failed:{'|'.join(errors)}")


def load_dataset(path: Path) -> list[EvalRow]:
    rows: list[EvalRow] = []
    with path.open("r", encoding="utf-8") as f:
        for i, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            row = EvalRow(
                row_id=str(obj.get("id", f"row-{i}")),
                prompt=str(obj["prompt"]),
                reference=str(obj.get("reference", "")),
                keywords=[str(k) for k in obj.get("keywords", [])],
                expects_json=bool(obj.get("expects_json", False)),
                json_required_keys=[str(k) for k in obj.get("json_required_keys", [])],
            )
            rows.append(row)
    if not rows:
        raise ValueError("dataset is empty")
    return rows


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    index = int(round((p / 100.0) * (len(sorted_vals) - 1)))
    return sorted_vals[index]


def openai_judge(
    candidate: str,
    reference: str,
    prompt: str,
    model: str,
    timeout_seconds: int,
) -> tuple[float | None, str | None]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None, "missing_openai_api_key"

    rubric = (
        "You are evaluating an assistant answer against a reference. "
        "Return strict JSON: {\"score\": <1-5 integer>, \"reason\": \"short text\"}. "
        "Score by factual alignment and usefulness."
    )
    user_text = (
        f"Prompt:\n{prompt}\n\nReference:\n{reference}\n\nCandidate:\n{candidate}\n\n"
        "Respond with JSON only."
    )
    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": rubric},
            {"role": "user", "content": user_text},
        ],
        "response_format": {"type": "json_object"},
    }

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url="https://api.openai.com/v1/chat/completions",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception as ex:  # noqa: BLE001
        return None, f"judge_request_failed:{type(ex).__name__}"

    try:
        content = data["choices"][0]["message"]["content"]
        judged = json.loads(content)
        score = float(judged["score"])
        reason = str(judged.get("reason", ""))
        return score, reason
    except Exception as ex:  # noqa: BLE001
        return None, f"judge_parse_failed:{type(ex).__name__}"


def run() -> int:
    parser = argparse.ArgumentParser(description="Run baseline LLM evaluation against a golden dataset.")
    parser.add_argument("--dataset", default="eval/golden_set.jsonl", help="Path to JSONL evaluation dataset.")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT, help="Model API endpoint.")
    parser.add_argument("--max-new-tokens", type=int, default=128)
    parser.add_argument("--temperature", type=float, default=0.1, help="Lower = more deterministic (default: 0.1)")
    parser.add_argument("--top-p", type=float, default=0.9, help="Nucleus sampling cutoff (default: 0.9)")
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument(
        "--prompt-mode",
        choices=["raw", "system", "few_shot", "cot", "few_shot_cot"],
        default="few_shot_cot",
        help=(
            "Prompt engineering mode (default: few_shot_cot). "
            "raw=no modification, system=role header, few_shot=add examples, "
            "cot=chain-of-thought, few_shot_cot=all combined (recommended)."
        ),
    )
    parser.add_argument(
        "--no-strip-prompt",
        action="store_true",
        default=False,
        help="Disable prompt-echo stripping (enabled by default for continuation models).",
    )
    parser.add_argument(
        "--judge-provider",
        choices=["none", "openai"],
        default="none",
        help="Optional external judge provider.",
    )
    parser.add_argument("--judge-model", default="gpt-4o-mini")
    parser.add_argument("--output-dir", default="eval/reports")
    parser.add_argument(
        "--label",
        default="",
        help="Optional run label appended to the report filename (e.g. 'few_shot_cot_temp01').",
    )
    args = parser.parse_args()

    strip_prompt = not args.no_strip_prompt
    prompt_mode: PromptMode = args.prompt_mode  # type: ignore[assignment]

    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        sample_path = dataset_path.parent / "golden_set.sample.jsonl"
        print(f"Dataset not found: {dataset_path}")
        if sample_path.exists():
            print(f"Copy this template first: {sample_path}")
        return 2

    rows = load_dataset(dataset_path)

    details: list[dict[str, Any]] = []
    latencies_ms: list[float] = []
    matches = 0
    jaccards: list[float] = []
    keyword_scores: list[float] = []
    json_checks = 0
    json_pass = 0
    judge_scores: list[float] = []
    errors = 0

    for row in rows:
        wrapped_prompt = build_prompt(row.prompt, mode=prompt_mode)
        start = time.perf_counter()
        error: str | None = None
        raw_output = ""
        generated = ""
        try:
            raw_output = generate_text(
                endpoint=args.endpoint,
                prompt=wrapped_prompt,
                timeout_seconds=args.timeout,
                max_new_tokens=args.max_new_tokens,
                temperature=args.temperature,
                top_p=args.top_p,
            )
            generated = extract_completion(raw_output, wrapped_prompt) if strip_prompt else raw_output
        except Exception as ex:  # noqa: BLE001
            error = str(ex)
            errors += 1
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        latencies_ms.append(elapsed_ms)

        is_match = exact_match(generated, row.reference) if not error else False
        if is_match:
            matches += 1

        jac = jaccard_similarity(generated, row.reference) if not error else 0.0
        jaccards.append(jac)

        kw_recall = keyword_recall(generated, row.keywords) if not error else 0.0
        keyword_scores.append(kw_recall)

        json_schema_ok = None
        json_schema_error = None
        if row.expects_json:
            json_checks += 1
            json_schema_ok, json_schema_error = check_json_schema(generated, row.json_required_keys)
            if json_schema_ok:
                json_pass += 1

        judge_score = None
        judge_reason = None
        if args.judge_provider == "openai" and not error:
            judge_score, judge_reason = openai_judge(
                candidate=generated,
                reference=row.reference,
                prompt=row.prompt,
                model=args.judge_model,
                timeout_seconds=args.timeout,
            )
            if judge_score is not None:
                judge_scores.append(judge_score)

        details.append(
            {
                "id": row.row_id,
                "latency_ms": round(elapsed_ms, 2),
                "error": error,
                "prompt_mode": prompt_mode,
                "prompt": row.prompt,
                "reference": row.reference,
                "raw_output": raw_output,
                "generated": generated,
                "exact_match": is_match,
                "jaccard_similarity": round(jac, 4),
                "keyword_recall": round(kw_recall, 4),
                "json_schema_ok": json_schema_ok,
                "json_schema_error": json_schema_error,
                "judge_score": judge_score,
                "judge_reason": judge_reason,
            }
        )

    total = len(rows)
    now_utc = datetime.now(UTC)
    report = {
        "timestamp_utc": now_utc.isoformat(),
        "dataset": str(dataset_path),
        "endpoint": args.endpoint,
        "prompt_mode": prompt_mode,
        "strip_prompt": strip_prompt,
        "temperature": args.temperature,
        "top_p": args.top_p,
        "max_new_tokens": args.max_new_tokens,
        "judge_provider": args.judge_provider,
        "judge_model": args.judge_model if args.judge_provider != "none" else None,
        "summary": {
            "total_cases": total,
            "errors": errors,
            "exact_match_rate": round(matches / total, 4) if total else 0.0,
            "avg_jaccard_similarity": round(statistics.mean(jaccards), 4) if jaccards else 0.0,
            "avg_keyword_recall": round(statistics.mean(keyword_scores), 4) if keyword_scores else 0.0,
            "json_schema_pass_rate": round(json_pass / json_checks, 4) if json_checks else None,
            "avg_latency_ms": round(statistics.mean(latencies_ms), 2) if latencies_ms else 0.0,
            "p95_latency_ms": round(percentile(latencies_ms, 95), 2) if latencies_ms else 0.0,
            "avg_judge_score": round(statistics.mean(judge_scores), 3) if judge_scores else None,
        },
        "details": details,
    }

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    label_suffix = f"-{args.label}" if args.label else f"-{prompt_mode}_t{args.temperature}"
    output_path = output_dir / f"eval-report-{now_utc.strftime('%Y%m%d-%H%M%S')}{label_suffix}.json"
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"Evaluation complete: {total} cases")
    print(f"  prompt_mode:       {prompt_mode}")
    print(f"  temperature:       {args.temperature}  top_p: {args.top_p}")
    print(f"  strip_prompt:      {strip_prompt}")
    print(f"  exact_match_rate:  {report['summary']['exact_match_rate']}")
    print(f"  avg_keyword_recall:{report['summary']['avg_keyword_recall']}")
    print(f"  avg_jaccard:       {report['summary']['avg_jaccard_similarity']}")
    print(f"  avg_latency_ms:    {report['summary']['avg_latency_ms']}")
    if report["summary"]["json_schema_pass_rate"] is not None:
        print(f"  json_schema_pass:  {report['summary']['json_schema_pass_rate']}")
    if report["summary"]["avg_judge_score"] is not None:
        print(f"  avg_judge_score:   {report['summary']['avg_judge_score']}")
    print(f"  report: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
