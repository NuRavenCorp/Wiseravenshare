import argparse
import json
import os
import sys
from contextlib import nullcontext
from pathlib import Path

import torch
import torch.distributed as dist
from torch.distributed.fsdp import (
    FullyShardedDataParallel as FSDP,
    FullOptimStateDictConfig,
    FullStateDictConfig,
    MixedPrecision,
    ShardingStrategy,
    StateDictType,
)
from torch.utils.data import DataLoader

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from scratch_llm.data import MemmapTokenDataset
from scratch_llm.model import ScratchGPT
from scratch_llm.scheduler import PretrainingCosineSchedule


def setup_distributed():
    if not dist.is_initialized():
        backend = "nccl" if torch.cuda.is_available() else "gloo"
        dist.init_process_group(backend=backend)
    local_rank = int(os.environ.get("LOCAL_RANK", "0"))
    rank = dist.get_rank()
    world_size = dist.get_world_size()
    if torch.cuda.is_available():
        torch.cuda.set_device(local_rank)
        device = torch.device("cuda", local_rank)
    else:
        device = torch.device("cpu")
    return rank, world_size, local_rank, device


def cleanup_distributed():
    if dist.is_initialized():
        dist.destroy_process_group()


def rank0_print(rank: int, message: str):
    if rank == 0:
        print(message)


def save_checkpoint(
    model: FSDP,
    optimizer: torch.optim.Optimizer,
    step: int,
    best_val_loss: float,
    cfg: dict,
    out_file: Path,
):
    out_file.parent.mkdir(parents=True, exist_ok=True)
    save_model_cfg = FullStateDictConfig(offload_to_cpu=True, rank0_only=True)
    save_optim_cfg = FullOptimStateDictConfig(offload_to_cpu=True, rank0_only=True)
    with FSDP.state_dict_type(
        model,
        StateDictType.FULL_STATE_DICT,
        save_model_cfg,
        save_optim_cfg,
    ):
        model_state = model.state_dict()
        optim_state = FSDP.optim_state_dict(model, optimizer)

    if dist.get_rank() == 0:
        payload = {
            "model": model_state,
            "optimizer": optim_state,
            "step": step,
            "best_val_loss": best_val_loss,
            "config": cfg,
        }
        torch.save(payload, out_file)


@torch.no_grad()
def evaluate(model: FSDP, loader: DataLoader, device: torch.device, eval_batches: int):
    model.eval()
    total = torch.tensor(0.0, device=device)
    count = torch.tensor(0.0, device=device)

    for i, batch in enumerate(loader):
        if i >= eval_batches:
            break
        x, y = batch[0].to(device), batch[1].to(device)
        _, loss = model(x, y)
        total += loss.detach()
        count += 1.0

    dist.all_reduce(total, op=dist.ReduceOp.SUM)
    dist.all_reduce(count, op=dist.ReduceOp.SUM)
    model.train()
    return (total / count.clamp(min=1.0)).item()


def main() -> None:
    parser = argparse.ArgumentParser(description="Scratch GPT pre-training loop with PyTorch FSDP orchestration.")
    parser.add_argument("--tokens-manifest", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--block-size", type=int, default=1024)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--max-steps", type=int, default=20000)
    parser.add_argument("--eval-interval", type=int, default=500)
    parser.add_argument("--eval-batches", type=int, default=20)
    parser.add_argument("--save-interval", type=int, default=1000)
    parser.add_argument("--lr", type=float, default=6e-4)
    parser.add_argument("--warmup-ratio", type=float, default=0.02)
    parser.add_argument("--min-lr-ratio", type=float, default=0.1)
    parser.add_argument("--weight-decay", type=float, default=0.1)
    parser.add_argument("--grad-clip", type=float, default=1.0)
    parser.add_argument("--grad-accum", type=int, default=8)
    parser.add_argument("--dtype", choices=["bf16", "fp16", "fp32"], default="bf16")
    parser.add_argument("--d-model", type=int, default=2048)
    parser.add_argument("--n-layers", type=int, default=24)
    parser.add_argument("--n-heads", type=int, default=16)
    parser.add_argument("--mlp-mult", type=int, default=4)
    parser.add_argument("--dropout", type=float, default=0.0)
    parser.add_argument("--resume-from", type=Path, default=None)
    parser.add_argument("--sharding-strategy", choices=["full_shard", "shard_grad_op"], default="full_shard")
    args = parser.parse_args()

    rank, world_size, local_rank, device = setup_distributed()
    rank0_print(rank, f"Initialized distributed training: world_size={world_size}, local_rank={local_rank}, device={device}")

    manifest = json.loads(args.tokens_manifest.read_text(encoding="utf-8"))
    vocab_size = int(manifest["vocab_size"])
    data_dtype = "uint16" if "uint16" in manifest["dtype"] else "uint32"
    train_bin = Path(manifest["train_bin"])
    val_bin = Path(manifest["val_bin"])

    amp_dtype = torch.bfloat16 if args.dtype == "bf16" else (torch.float16 if args.dtype == "fp16" else torch.float32)
    use_amp = device.type == "cuda" and args.dtype in {"bf16", "fp16"}

    base_model = ScratchGPT(
        vocab_size=vocab_size,
        d_model=args.d_model,
        n_layers=args.n_layers,
        n_heads=args.n_heads,
        max_seq_len=args.block_size,
        mlp_mult=args.mlp_mult,
        dropout=args.dropout,
    ).to(device)

    mp_policy = None
    if args.dtype == "bf16":
        mp_policy = MixedPrecision(param_dtype=torch.bfloat16, reduce_dtype=torch.bfloat16, buffer_dtype=torch.bfloat16)
    elif args.dtype == "fp16":
        mp_policy = MixedPrecision(param_dtype=torch.float16, reduce_dtype=torch.float16, buffer_dtype=torch.float16)

    shard_map = {
        "full_shard": ShardingStrategy.FULL_SHARD,
        "shard_grad_op": ShardingStrategy.SHARD_GRAD_OP,
    }
    model = FSDP(
        base_model,
        mixed_precision=mp_policy,
        sharding_strategy=shard_map[args.sharding_strategy],
        device_id=device if device.type == "cuda" else None,
    )

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, betas=(0.9, 0.95), weight_decay=args.weight_decay)
    scaler = torch.GradScaler(enabled=use_amp and args.dtype == "fp16")

    train_ds = MemmapTokenDataset(train_bin, args.block_size, data_dtype)
    val_ds = MemmapTokenDataset(val_bin, args.block_size, data_dtype)
    train_loader = iter(DataLoader(train_ds, batch_size=args.batch_size, num_workers=0))
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, num_workers=0)

    scheduler = PretrainingCosineSchedule(
        warmup_steps=max(1, int(args.max_steps * args.warmup_ratio)),
        total_steps=args.max_steps,
        max_lr=args.lr,
        min_lr_ratio=args.min_lr_ratio,
    )

    state = {"step": 0, "best_val_loss": float("inf")}
    if args.resume_from and args.resume_from.exists():
        rank0_print(rank, f"Loading checkpoint {args.resume_from}")
        checkpoint = torch.load(args.resume_from, map_location="cpu")
        model.load_state_dict(checkpoint["model"], strict=False)
        if "optimizer" in checkpoint:
            optimizer_state_to_load = FSDP.optim_state_dict_to_load(model, optimizer, checkpoint["optimizer"])
            optimizer.load_state_dict(optimizer_state_to_load)
        state["step"] = int(checkpoint.get("step", 0))
        state["best_val_loss"] = float(checkpoint.get("best_val_loss", float("inf")))
        rank0_print(rank, f"Resumed at step={state['step']} best_val_loss={state['best_val_loss']:.4f}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    train_cfg = vars(args) | {"vocab_size": vocab_size, "world_size": world_size}

    model.train()
    for step in range(state["step"], args.max_steps):
        lr = scheduler.at(step)
        for group in optimizer.param_groups:
            group["lr"] = lr

        optimizer.zero_grad(set_to_none=True)
        local_running = 0.0

        for micro in range(args.grad_accum):
            x, y = next(train_loader)
            x, y = x.to(device), y.to(device)
            should_sync = micro == args.grad_accum - 1
            sync_context = nullcontext() if should_sync else model.no_sync()
            with sync_context:
                with torch.autocast(device_type="cuda", dtype=amp_dtype, enabled=use_amp):
                    _, loss = model(x, y)
                    loss = loss / args.grad_accum
                local_running += loss.item()
                scaler.scale(loss).backward()

        if args.grad_clip > 0:
            scaler.unscale_(optimizer)
            model.clip_grad_norm_(args.grad_clip)

        scaler.step(optimizer)
        scaler.update()

        if step % 20 == 0:
            loss_tensor = torch.tensor(local_running, device=device)
            dist.all_reduce(loss_tensor, op=dist.ReduceOp.SUM)
            avg_loss = (loss_tensor / world_size).item()
            rank0_print(rank, f"step={step} train_loss={avg_loss:.4f} lr={lr:.6e}")

        if step % args.eval_interval == 0:
            val_loss = evaluate(model, val_loader, device, args.eval_batches)
            rank0_print(rank, f"step={step} val_loss={val_loss:.4f}")
            if val_loss < state["best_val_loss"]:
                state["best_val_loss"] = val_loss
                save_checkpoint(
                    model=model,
                    optimizer=optimizer,
                    step=step,
                    best_val_loss=val_loss,
                    cfg=train_cfg,
                    out_file=args.out_dir / "best_fsdp.pt",
                )

        if step > 0 and step % args.save_interval == 0:
            save_checkpoint(
                model=model,
                optimizer=optimizer,
                step=step,
                best_val_loss=state["best_val_loss"],
                cfg=train_cfg,
                out_file=args.out_dir / f"step-{step}_fsdp.pt",
            )

    save_checkpoint(
        model=model,
        optimizer=optimizer,
        step=args.max_steps,
        best_val_loss=state["best_val_loss"],
        cfg=train_cfg,
        out_file=args.out_dir / "last_fsdp.pt",
    )
    rank0_print(rank, "Training complete.")
    cleanup_distributed()


if __name__ == "__main__":
    main()
