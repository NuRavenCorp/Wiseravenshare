import argparse
import json
import sys
from pathlib import Path

import torch
from torch.utils.data import DataLoader

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from scratch_llm.data import MemmapTokenDataset
from scratch_llm.model import ScratchGPT
from scratch_llm.scheduler import PretrainingCosineSchedule


@torch.no_grad()
def evaluate(model, loader, device, eval_batches: int):
    model.eval()
    losses = []
    for i, batch in enumerate(loader):
        if i >= eval_batches:
            break
        x, y = batch[0].to(device), batch[1].to(device)
        _, loss = model(x, y)
        losses.append(loss.item())
    model.train()
    return float(sum(losses) / max(1, len(losses)))


def main() -> None:
    parser = argparse.ArgumentParser(description="Scratch GPT pre-training loop.")
    parser.add_argument("--tokens-manifest", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--block-size", type=int, default=1024)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--max-steps", type=int, default=10000)
    parser.add_argument("--eval-interval", type=int, default=250)
    parser.add_argument("--eval-batches", type=int, default=20)
    parser.add_argument("--save-interval", type=int, default=500)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--warmup-ratio", type=float, default=0.01)
    parser.add_argument("--min-lr-ratio", type=float, default=0.1)
    parser.add_argument("--weight-decay", type=float, default=0.1)
    parser.add_argument("--grad-clip", type=float, default=1.0)
    parser.add_argument("--grad-accum", type=int, default=1)
    parser.add_argument("--dtype", choices=["bf16", "fp16", "fp32"], default="bf16")
    parser.add_argument("--resume-from", type=Path, default=None)
    parser.add_argument("--d-model", type=int, default=768)
    parser.add_argument("--n-layers", type=int, default=12)
    parser.add_argument("--n-heads", type=int, default=12)
    parser.add_argument("--mlp-mult", type=int, default=4)
    parser.add_argument("--dropout", type=float, default=0.0)
    args = parser.parse_args()

    manifest = json.loads(args.tokens_manifest.read_text(encoding="utf-8"))
    vocab_size = int(manifest["vocab_size"])
    data_dtype = "uint16" if "uint16" in manifest["dtype"] else "uint32"
    train_bin = Path(manifest["train_bin"])
    val_bin = Path(manifest["val_bin"])

    device = "cuda" if torch.cuda.is_available() else "cpu"
    amp_dtype = torch.bfloat16 if args.dtype == "bf16" else (torch.float16 if args.dtype == "fp16" else torch.float32)
    use_amp = device == "cuda" and args.dtype in {"bf16", "fp16"}

    model = ScratchGPT(
        vocab_size=vocab_size,
        d_model=args.d_model,
        n_layers=args.n_layers,
        n_heads=args.n_heads,
        max_seq_len=args.block_size,
        mlp_mult=args.mlp_mult,
        dropout=args.dropout,
    ).to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, betas=(0.9, 0.95), weight_decay=args.weight_decay)
    scaler = torch.GradScaler(enabled=use_amp and args.dtype == "fp16")

    train_ds = MemmapTokenDataset(train_bin, args.block_size, data_dtype)
    val_ds = MemmapTokenDataset(val_bin, args.block_size, data_dtype)
    train_loader = iter(DataLoader(train_ds, batch_size=args.batch_size, num_workers=0))
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, num_workers=0)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    state = {"step": 0, "best_val_loss": float("inf")}
    if args.resume_from and args.resume_from.exists():
        ckpt = torch.load(args.resume_from, map_location=device)
        model.load_state_dict(ckpt["model"])
        optimizer.load_state_dict(ckpt["optimizer"])
        state["step"] = int(ckpt.get("step", 0))
        state["best_val_loss"] = float(ckpt.get("best_val_loss", float("inf")))

    warmup_steps = max(1, int(args.max_steps * args.warmup_ratio))
    scheduler = PretrainingCosineSchedule(
        warmup_steps=warmup_steps,
        total_steps=args.max_steps,
        max_lr=args.lr,
        min_lr_ratio=args.min_lr_ratio,
    )

    for step in range(state["step"], args.max_steps):
        lr = scheduler.at(step)
        for g in optimizer.param_groups:
            g["lr"] = lr

        optimizer.zero_grad(set_to_none=True)
        running_loss = 0.0

        for _ in range(args.grad_accum):
            x, y = next(train_loader)
            x, y = x.to(device), y.to(device)
            with torch.autocast(device_type="cuda", dtype=amp_dtype, enabled=use_amp):
                _, loss = model(x, y)
                loss = loss / args.grad_accum
            running_loss += loss.item()
            scaler.scale(loss).backward()

        if args.grad_clip > 0:
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), args.grad_clip)

        scaler.step(optimizer)
        scaler.update()

        if step % 20 == 0:
            print(f"step={step} train_loss={running_loss:.4f} lr={lr:.6e}")

        if step % args.eval_interval == 0:
            val_loss = evaluate(model, val_loader, device, args.eval_batches)
            print(f"step={step} val_loss={val_loss:.4f}")
            if val_loss < state["best_val_loss"]:
                state["best_val_loss"] = val_loss
                torch.save(
                    {
                        "model": model.state_dict(),
                        "optimizer": optimizer.state_dict(),
                        "step": step,
                        "best_val_loss": val_loss,
                        "config": vars(args),
                    },
                    args.out_dir / "best.pt",
                )

        if step > 0 and step % args.save_interval == 0:
            torch.save(
                {
                    "model": model.state_dict(),
                    "optimizer": optimizer.state_dict(),
                    "step": step,
                    "best_val_loss": state["best_val_loss"],
                    "config": vars(args),
                },
                args.out_dir / f"step-{step}.pt",
            )

    torch.save(
        {
            "model": model.state_dict(),
            "optimizer": optimizer.state_dict(),
            "step": args.max_steps,
            "best_val_loss": state["best_val_loss"],
            "config": vars(args),
        },
        args.out_dir / "last.pt",
    )


if __name__ == "__main__":
    main()
