#!/usr/bin/env python
"""ask_gemma.py -- corroborate claims against google/gemma-4-E4B-it locally.

Usage:
    python ask_gemma.py "your question here"
    python ask_gemma.py --check          # env report only, no model load
    python ask_gemma.py --download       # pre-download weights, then exit

First run downloads weights to the HF cache (~15-25 GB). Later runs are local.
"""
import argparse
import os
import sys

MODEL_ID = "google/gemma-4-E4B-it"

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def check() -> int:
    import transformers
    import torch

    print(f"python      : {sys.version.split()[0]}")
    print(f"transformers: {transformers.__version__}")
    print(f"torch       : {torch.__version__} (cuda={torch.cuda.is_available()})")
    print(f"model id    : {MODEL_ID}")
    try:
        from transformers.models.auto.modeling_auto import (
            MODEL_FOR_MULTIMODAL_LM_MAPPING_NAMES as M,
        )
        arch = next((v for k, v in M.items() if "gemma4" in str(k)), "unknown")
        print(f"gemma4 arch : {arch}")
        print(f"auto class  : AutoModelForMultimodalLM available")
    except Exception as exc:
        print(f"registry    : unavailable ({exc})")
    return 0


def download() -> int:
    from huggingface_hub import snapshot_download

    path = snapshot_download(MODEL_ID)
    print(f"weights ready at: {path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Ask the local Gemma model.")
    parser.add_argument("prompt", nargs="*", help="question / claim to corroborate")
    parser.add_argument("--check", action="store_true", help="print environment report and exit")
    parser.add_argument("--download", action="store_true", help="download weights and exit")
    parser.add_argument("--stdin", action="store_true", help="read prompt from stdin (for long prompts)")
    parser.add_argument("--max-new-tokens", type=int, default=512)
    args = parser.parse_args()

    if args.check:
        return check()
    if args.download:
        return download()

    prompt = " ".join(args.prompt).strip()
    if args.stdin:
        prompt = sys.stdin.read().strip()
    if not prompt:
        parser.error("provide a prompt, pipe one via stdin, or use --check / --download")

    from transformers import AutoProcessor, AutoModelForMultimodalLM
    import torch

    print(f"[ask_gemma] loading {MODEL_ID} ...", file=sys.stderr)
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    model = AutoModelForMultimodalLM.from_pretrained(
        MODEL_ID,
        dtype=torch.bfloat16,
        device_map="cpu",
        low_cpu_mem_usage=True,
    )
    model.eval()

    conversation = [
        {
            "role": "user",
            "content": [{"type": "text", "text": prompt}],
        }
    ]
    inputs = processor.apply_chat_template(
        conversation,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    )

    with torch.inference_mode():
        output = model.generate(**inputs, max_new_tokens=args.max_new_tokens)

    # Decode only the newly generated tokens (skip the echoed prompt).
    in_len = inputs["input_ids"].shape[-1]
    print(processor.decode(output[0][in_len:], skip_special_tokens=True).strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
