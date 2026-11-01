import argparse
import json
import math
from pathlib import Path

import numpy as np
from tokenizers import Tokenizer


def select_dtype(vocab_size: int):
    return np.uint16 if vocab_size <= 65535 else np.uint32


def main() -> None:
    parser = argparse.ArgumentParser(description="Tokenize corpus and pack into memmap binaries.")
    parser.add_argument("--corpus-file", required=True, type=Path)
    parser.add_argument("--tokenizer-file", required=True, type=Path)
    parser.add_argument("--train-bin", required=True, type=Path)
    parser.add_argument("--val-bin", required=True, type=Path)
    parser.add_argument("--manifest-file", required=True, type=Path)
    parser.add_argument("--val-split", type=float, default=0.01)
    args = parser.parse_args()

    tokenizer = Tokenizer.from_file(str(args.tokenizer_file))
    vocab_size = tokenizer.get_vocab_size()
    dtype = select_dtype(vocab_size)

    all_ids = []
    with args.corpus_file.open("r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            ids = tokenizer.encode(line).ids
            if ids:
                all_ids.extend(ids + [1])  # [BOS] separator

    if not all_ids:
        raise RuntimeError("No tokens produced from corpus.")

    total = len(all_ids)
    val_count = max(1, math.floor(total * args.val_split))
    train_count = total - val_count

    train_ids = np.array(all_ids[:train_count], dtype=dtype)
    val_ids = np.array(all_ids[train_count:], dtype=dtype)

    args.train_bin.parent.mkdir(parents=True, exist_ok=True)
    args.val_bin.parent.mkdir(parents=True, exist_ok=True)
    train_ids.tofile(args.train_bin)
    val_ids.tofile(args.val_bin)

    manifest = {
        "tokenizer_file": str(args.tokenizer_file),
        "vocab_size": vocab_size,
        "dtype": str(dtype),
        "train_tokens": int(train_ids.size),
        "val_tokens": int(val_ids.size),
        "train_bin": str(args.train_bin),
        "val_bin": str(args.val_bin),
    }
    args.manifest_file.parent.mkdir(parents=True, exist_ok=True)
    args.manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
