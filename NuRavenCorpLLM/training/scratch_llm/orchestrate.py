import argparse
import json
import subprocess
import sys
from pathlib import Path


def build_single_command(cfg: dict, script_dir: Path):
    cmd = [
        sys.executable,
        str(script_dir / "train.py"),
        "--tokens-manifest",
        str(cfg["tokens_manifest"]),
        "--out-dir",
        str(cfg["out_dir"]),
    ]
    passthrough = [
        "block_size",
        "batch_size",
        "max_steps",
        "eval_interval",
        "eval_batches",
        "save_interval",
        "lr",
        "warmup_ratio",
        "min_lr_ratio",
        "weight_decay",
        "grad_clip",
        "grad_accum",
        "dtype",
        "d_model",
        "n_layers",
        "n_heads",
        "mlp_mult",
        "dropout",
    ]
    for key in passthrough:
        if key in cfg and cfg[key] is not None:
            cmd.extend([f"--{key.replace('_', '-')}", str(cfg[key])])
    if cfg.get("resume_from"):
        cmd.extend(["--resume-from", str(cfg["resume_from"])])
    return cmd


def build_fsdp_command(cfg: dict, script_dir: Path):
    nproc = int(cfg.get("nproc_per_node", 1))
    cmd = [
        "torchrun",
        "--nproc_per_node",
        str(nproc),
        str(script_dir / "train_fsdp.py"),
        "--tokens-manifest",
        str(cfg["tokens_manifest"]),
        "--out-dir",
        str(cfg["out_dir"]),
    ]
    passthrough = [
        "block_size",
        "batch_size",
        "max_steps",
        "eval_interval",
        "eval_batches",
        "save_interval",
        "lr",
        "warmup_ratio",
        "min_lr_ratio",
        "weight_decay",
        "grad_clip",
        "grad_accum",
        "dtype",
        "d_model",
        "n_layers",
        "n_heads",
        "mlp_mult",
        "dropout",
        "sharding_strategy",
    ]
    for key in passthrough:
        if key in cfg and cfg[key] is not None:
            cmd.extend([f"--{key.replace('_', '-')}", str(cfg[key])])
    if cfg.get("resume_from"):
        cmd.extend(["--resume-from", str(cfg["resume_from"])])
    return cmd


def main():
    parser = argparse.ArgumentParser(description="Scratch LLM training orchestrator.")
    parser.add_argument("--config", required=True, type=Path, help="Path to JSON orchestrator config.")
    args = parser.parse_args()

    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    mode = str(cfg.get("mode", "single")).lower()
    script_dir = Path(__file__).resolve().parent
    tokens_manifest = Path(str(cfg.get("tokens_manifest", "")))
    out_dir = Path(str(cfg.get("out_dir", "")))

    if not tokens_manifest.is_file():
        raise FileNotFoundError(
            f"tokens_manifest not found: {tokens_manifest}\n"
            f"Set 'tokens_manifest' in {args.config} to a real tokens_manifest.json path."
        )
    out_dir.mkdir(parents=True, exist_ok=True)

    if mode == "single":
        cmd = build_single_command(cfg, script_dir)
    elif mode == "fsdp":
        cmd = build_fsdp_command(cfg, script_dir)
    else:
        raise ValueError(f"Unsupported mode '{mode}'. Use 'single' or 'fsdp'.")

    print("Launching:", " ".join(cmd))
    result = subprocess.run(cmd, check=False)
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
