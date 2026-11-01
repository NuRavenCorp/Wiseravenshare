import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

import torch
from tokenizers import Tokenizer
from torch.utils.data import DataLoader, Dataset

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from scratch_llm.lora import LoRAConfig, freeze_non_lora_parameters, inject_lora, lora_state_dict
from scratch_llm.model import ScratchGPT
from scratch_llm.scheduler import PretrainingCosineSchedule


def read_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def extract_pair(record: dict) -> tuple[str, str]:
    if "messages" in record and isinstance(record["messages"], list):
        user = []
        assistant = []
        for msg in record["messages"]:
            role = str(msg.get("role", "")).lower()
            content = str(msg.get("content", "")).strip()
            if not content:
                continue
            if role == "assistant":
                assistant.append(content)
            else:
                user.append(content)
        return "\n".join(user).strip(), "\n".join(assistant).strip()

    prompt = (
        record.get("instruction")
        or record.get("prompt")
        or record.get("user")
        or record.get("input")
        or ""
    )
    response = (
        record.get("output")
        or record.get("response")
        or record.get("assistant")
        or ""
    )
    return str(prompt).strip(), str(response).strip()


class SFTDataset(Dataset):
    def __init__(self, path: Path, tokenizer: Tokenizer, max_seq_len: int, pad_id: int, eos_id: int):
        self.examples = []
        self.pad_id = pad_id
        self.max_seq_len = max_seq_len

        for record in read_jsonl(path):
            prompt, answer = extract_pair(record)
            if not prompt or not answer:
                continue

            prompt_text = f"User: {prompt}\nAssistant:"
            answer_text = f" {answer}"

            prompt_ids = tokenizer.encode(prompt_text).ids
            answer_ids = tokenizer.encode(answer_text).ids + [eos_id]
            input_ids = (prompt_ids + answer_ids)[:max_seq_len]
            labels = ([-100] * len(prompt_ids) + answer_ids)[:max_seq_len]

            if all(v == -100 for v in labels):
                continue

            self.examples.append((input_ids, labels))

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, idx):
        return self.examples[idx]

    def collate(self, batch):
        max_len = max(len(x[0]) for x in batch)
        input_batch, label_batch = [], []
        for input_ids, labels in batch:
            pad = max_len - len(input_ids)
            input_batch.append(input_ids + [self.pad_id] * pad)
            label_batch.append(labels + [-100] * pad)
        return (
            torch.tensor(input_batch, dtype=torch.long),
            torch.tensor(label_batch, dtype=torch.long),
        )


@torch.no_grad()
def evaluate(model: ScratchGPT, loader: DataLoader, device: str, max_batches: int) -> float:
    model.eval()
    losses = []
    for i, (x, y) in enumerate(loader):
        if i >= max_batches:
            break
        x, y = x.to(device), y.to(device)
        _, loss = model(x, y)
        losses.append(loss.item())
    model.train()
    return float(sum(losses) / max(1, len(losses)))


def main() -> None:
    parser = argparse.ArgumentParser(description="SFT + LoRA fine-tuning for ScratchGPT.")
    parser.add_argument("--base-checkpoint", required=True, type=Path)
    parser.add_argument("--tokenizer-file", required=True, type=Path)
    parser.add_argument("--train-jsonl", required=True, type=Path)
    parser.add_argument("--val-jsonl", type=Path, default=None)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--max-seq-len", type=int, default=1024)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--max-steps", type=int, default=2000)
    parser.add_argument("--eval-interval", type=int, default=100)
    parser.add_argument("--eval-batches", type=int, default=20)
    parser.add_argument("--save-interval", type=int, default=250)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--warmup-ratio", type=float, default=0.03)
    parser.add_argument("--min-lr-ratio", type=float, default=0.1)
    parser.add_argument("--weight-decay", type=float, default=0.0)
    parser.add_argument("--grad-clip", type=float, default=1.0)
    parser.add_argument("--grad-accum", type=int, default=4)
    parser.add_argument("--dtype", choices=["bf16", "fp16", "fp32"], default="bf16")
    parser.add_argument("--lora-rank", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    amp_dtype = torch.bfloat16 if args.dtype == "bf16" else (torch.float16 if args.dtype == "fp16" else torch.float32)
    use_amp = device == "cuda" and args.dtype in {"bf16", "fp16"}

    ckpt = torch.load(args.base_checkpoint, map_location="cpu")
    model_cfg = dict(ckpt.get("config", {}))
    vocab_size = int(model_cfg["vocab_size"])
    model = ScratchGPT(
        vocab_size=vocab_size,
        d_model=int(model_cfg["d_model"]),
        n_layers=int(model_cfg["n_layers"]),
        n_heads=int(model_cfg["n_heads"]),
        max_seq_len=args.max_seq_len,
        mlp_mult=int(model_cfg["mlp_mult"]),
        dropout=float(model_cfg["dropout"]),
    ).to(device)
    model.load_state_dict(ckpt["model"], strict=True)

    lora_cfg = LoRAConfig(rank=args.lora_rank, alpha=args.lora_alpha, dropout=args.lora_dropout)
    replaced = inject_lora(model, lora_cfg)
    if replaced == 0:
        raise RuntimeError("No modules were patched with LoRA adapters.")
    freeze_non_lora_parameters(model)

    tokenizer = Tokenizer.from_file(str(args.tokenizer_file))
    pad_id = tokenizer.token_to_id("[PAD]")
    eos_id = tokenizer.token_to_id("[EOS]")
    if pad_id is None:
        pad_id = 0
    if eos_id is None:
        eos_id = pad_id

    train_ds = SFTDataset(args.train_jsonl, tokenizer, args.max_seq_len, pad_id, eos_id)
    if len(train_ds) == 0:
        raise RuntimeError("No valid SFT training samples were parsed.")

    val_path = args.val_jsonl if args.val_jsonl and args.val_jsonl.exists() else args.train_jsonl
    val_ds = SFTDataset(val_path, tokenizer, args.max_seq_len, pad_id, eos_id)

    train_loader = iter(DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, collate_fn=train_ds.collate))
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, collate_fn=val_ds.collate)

    trainable = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(trainable, lr=args.lr, betas=(0.9, 0.999), weight_decay=args.weight_decay)
    scaler = torch.GradScaler(enabled=use_amp and args.dtype == "fp16")
    scheduler = PretrainingCosineSchedule(
        warmup_steps=max(1, int(args.max_steps * args.warmup_ratio)),
        total_steps=args.max_steps,
        max_lr=args.lr,
        min_lr_ratio=args.min_lr_ratio,
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    best_val = float("inf")

    for step in range(args.max_steps):
        lr = scheduler.at(step)
        for group in optimizer.param_groups:
            group["lr"] = lr

        optimizer.zero_grad(set_to_none=True)
        running_loss = 0.0

        for _ in range(args.grad_accum):
            try:
                x, y = next(train_loader)
            except StopIteration:
                train_loader = iter(DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, collate_fn=train_ds.collate))
                x, y = next(train_loader)

            x, y = x.to(device), y.to(device)
            with torch.autocast(device_type="cuda", dtype=amp_dtype, enabled=use_amp):
                _, loss = model(x, y)
                loss = loss / args.grad_accum
            running_loss += loss.item()
            scaler.scale(loss).backward()

        if args.grad_clip > 0:
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(trainable, args.grad_clip)

        scaler.step(optimizer)
        scaler.update()

        if step % 20 == 0:
            print(f"step={step} train_loss={running_loss:.4f} lr={lr:.6e}")

        if step % args.eval_interval == 0:
            val_loss = evaluate(model, val_loader, device, args.eval_batches)
            print(f"step={step} val_loss={val_loss:.4f}")
            if val_loss < best_val:
                best_val = val_loss
                torch.save(
                    {
                        "step": step,
                        "best_val_loss": best_val,
                        "base_checkpoint": str(args.base_checkpoint),
                        "lora_config": asdict(lora_cfg),
                        "lora_state": lora_state_dict(model),
                        "train_args": vars(args),
                    },
                    args.out_dir / "best_lora.pt",
                )

        if step > 0 and step % args.save_interval == 0:
            torch.save(
                {
                    "step": step,
                    "best_val_loss": best_val,
                    "base_checkpoint": str(args.base_checkpoint),
                    "lora_config": asdict(lora_cfg),
                    "lora_state": lora_state_dict(model),
                    "train_args": vars(args),
                },
                args.out_dir / f"step-{step}_lora.pt",
            )

    torch.save(
        {
            "step": args.max_steps,
            "best_val_loss": best_val,
            "base_checkpoint": str(args.base_checkpoint),
            "lora_config": asdict(lora_cfg),
            "lora_state": lora_state_dict(model),
            "train_args": vars(args),
        },
        args.out_dir / "last_lora.pt",
    )


if __name__ == "__main__":
    main()
