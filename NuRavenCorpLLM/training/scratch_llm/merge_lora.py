import argparse
import json
import sys
from pathlib import Path

import torch

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from scratch_llm.lora import LoRAConfig, inject_lora, load_lora_state_dict, merge_lora_layers
from scratch_llm.model import ScratchGPT


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge LoRA adapter weights into ScratchGPT checkpoint.")
    parser.add_argument("--base-checkpoint", required=True, type=Path)
    parser.add_argument("--lora-checkpoint", required=True, type=Path)
    parser.add_argument("--output-checkpoint", required=True, type=Path)
    parser.add_argument("--max-seq-len", type=int, default=None)
    args = parser.parse_args()

    base = torch.load(args.base_checkpoint, map_location="cpu")
    lora = torch.load(args.lora_checkpoint, map_location="cpu")

    cfg = dict(base.get("config", {}))
    max_seq_len = args.max_seq_len or int(cfg["block_size"])
    model = ScratchGPT(
        vocab_size=int(cfg["vocab_size"]),
        d_model=int(cfg["d_model"]),
        n_layers=int(cfg["n_layers"]),
        n_heads=int(cfg["n_heads"]),
        max_seq_len=max_seq_len,
        mlp_mult=int(cfg["mlp_mult"]),
        dropout=float(cfg["dropout"]),
    )
    model.load_state_dict(base["model"], strict=True)

    raw_lora_cfg = lora.get("lora_config", {})
    lora_cfg = LoRAConfig(
        rank=int(raw_lora_cfg.get("rank", 16)),
        alpha=int(raw_lora_cfg.get("alpha", 32)),
        dropout=float(raw_lora_cfg.get("dropout", 0.0)),
        target_modules=tuple(raw_lora_cfg.get("target_modules", ("qkv", "proj", "w1", "w2", "w3"))),
    )
    inject_lora(model, lora_cfg)
    load_lora_state_dict(model, lora["lora_state"])
    merge_lora_layers(model)

    merged_state = model.state_dict()
    args.output_checkpoint.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model": merged_state,
            "config": cfg,
            "source": {
                "base_checkpoint": str(args.base_checkpoint),
                "lora_checkpoint": str(args.lora_checkpoint),
                "lora_config": json.loads(json.dumps(raw_lora_cfg)),
            },
        },
        args.output_checkpoint,
    )
    print(f"Merged checkpoint written to {args.output_checkpoint}")


if __name__ == "__main__":
    main()
