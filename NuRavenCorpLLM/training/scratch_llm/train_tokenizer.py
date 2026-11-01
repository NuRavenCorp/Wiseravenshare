import argparse
from pathlib import Path
from tokenizers import Tokenizer
from tokenizers.models import BPE
from tokenizers.pre_tokenizers import Whitespace
from tokenizers.trainers import BpeTrainer


def main() -> None:
    parser = argparse.ArgumentParser(description="Train BPE tokenizer for scratch LLM.")
    parser.add_argument("--corpus-file", required=True, type=Path)
    parser.add_argument("--tokenizer-out", required=True, type=Path)
    parser.add_argument("--vocab-size", type=int, default=32000)
    args = parser.parse_args()

    tokenizer = Tokenizer(BPE(unk_token="[UNK]"))
    tokenizer.pre_tokenizer = Whitespace()
    trainer = BpeTrainer(
        vocab_size=args.vocab_size,
        special_tokens=["[UNK]", "[BOS]", "[EOS]", "[PAD]", "[MASK]"],
    )
    tokenizer.train([str(args.corpus_file)], trainer)
    args.tokenizer_out.parent.mkdir(parents=True, exist_ok=True)
    tokenizer.save(str(args.tokenizer_out))
    print(f"Saved tokenizer to {args.tokenizer_out}")


if __name__ == "__main__":
    main()
