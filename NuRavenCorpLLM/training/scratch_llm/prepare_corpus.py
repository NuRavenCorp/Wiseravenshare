import argparse
import html
import json
import re
from pathlib import Path


TOXIC_TERMS = {
    "kill yourself",
    "self-harm tutorial",
    "credit card dump",
}

EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_RE = re.compile(r"\b(?:\+?\d[\d\-\s().]{7,}\d)\b")
HTML_TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")


def clean_line(text: str) -> str:
    text = html.unescape(text)
    text = HTML_TAG_RE.sub(" ", text)
    text = EMAIL_RE.sub("[REDACTED_EMAIL]", text)
    text = PHONE_RE.sub("[REDACTED_PHONE]", text)
    text = SPACE_RE.sub(" ", text).strip()
    return text


def is_valid_line(text: str, min_chars: int, max_chars: int) -> bool:
    if len(text) < min_chars or len(text) > max_chars:
        return False
    lowered = text.lower()
    return not any(term in lowered for term in TOXIC_TERMS)


def iter_lines(input_dir: Path):
    for path in input_dir.rglob("*.txt"):
        with path.open("r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                yield line


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare cleaned corpus for LLM pre-training.")
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--output-file", required=True, type=Path)
    parser.add_argument("--manifest-file", required=True, type=Path)
    parser.add_argument("--min-chars", type=int, default=30)
    parser.add_argument("--max-chars", type=int, default=4000)
    args = parser.parse_args()

    seen = set()
    total = kept = deduped = dropped = 0
    args.output_file.parent.mkdir(parents=True, exist_ok=True)
    args.manifest_file.parent.mkdir(parents=True, exist_ok=True)

    with args.output_file.open("w", encoding="utf-8") as out:
        for raw in iter_lines(args.input_dir):
            total += 1
            cleaned = clean_line(raw)
            if not is_valid_line(cleaned, args.min_chars, args.max_chars):
                dropped += 1
                continue
            fingerprint = hash(cleaned)
            if fingerprint in seen:
                deduped += 1
                continue
            seen.add(fingerprint)
            kept += 1
            out.write(cleaned + "\n")

    manifest = {
        "input_dir": str(args.input_dir),
        "output_file": str(args.output_file),
        "total_lines": total,
        "kept_lines": kept,
        "deduped_lines": deduped,
        "dropped_lines": dropped,
        "min_chars": args.min_chars,
        "max_chars": args.max_chars,
    }
    args.manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
