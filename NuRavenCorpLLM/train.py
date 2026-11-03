import argparse
import gc
import os
import subprocess
import sys

import torch
from datasets import load_dataset
from torch.utils.data import IterableDataset
from transformers import AutoTokenizer, GPT2Config, GPT2LMHeadModel, Trainer, TrainingArguments

parser = argparse.ArgumentParser(description="NuRavenCorpLLM FineWeb trainer")
parser.add_argument(
    "--force-cpu",
    action="store_true",
    help="Skip GPU requirement and train on CPU (slow, for testing or incompatible hardware).",
)
args = parser.parse_args()

FORCE_CPU = args.force_cpu


# ============================================================
# 1. Hardware check
# ============================================================
def _smi_list():
    try:
        result = subprocess.run(["nvidia-smi", "-L"], check=False, capture_output=True, text=True)
        return result.stdout.strip() or result.stderr.strip() or "nvidia-smi returned no output"
    except OSError:
        return "nvidia-smi not found on PATH"


def _parse_sm(sm_label):
    digits = sm_label[3:]
    if not digits.isdigit():
        return None
    if len(digits) == 2:
        return int(digits[0]), int(digits[1])
    if len(digits) == 3:
        return int(digits[:2]), int(digits[2])
    return None


DEVICE = "cpu"

if FORCE_CPU:
    print("⚠  --force-cpu set: running on CPU. Training will be very slow.", flush=True)
else:
    if not torch.backends.cuda.is_built():
        print(
            "ERROR: Installed PyTorch build is CPU-only.\n"
            "  To install a CUDA-enabled build for Python 3.11/3.12 + CUDA 11.8:\n"
            "    pip install torch --index-url https://download.pytorch.org/whl/cu118\n"
            "  Or use --force-cpu to run on CPU.",
            file=sys.stderr,
        )
        sys.exit(1)

    if not torch.cuda.is_available():
        print(
            f"ERROR: NVIDIA GPU not detected by PyTorch.\n  Driver check: {_smi_list()}\n"
            "  Try --force-cpu to run on CPU.",
            file=sys.stderr,
        )
        sys.exit(1)

    gpu_cc = torch.cuda.get_device_capability(0)
    gpu_sm = f"sm_{gpu_cc[0]}{gpu_cc[1]}"
    supported_sms = sorted({arch for arch in torch.cuda.get_arch_list() if arch.startswith("sm_")})
    gpu_major, gpu_minor = gpu_cc

    has_compatible_sm = any(
        (parsed := _parse_sm(sm)) is not None and parsed[0] == gpu_major and parsed[1] <= gpu_minor
        for sm in supported_sms
    )

    if not has_compatible_sm:
        supported_text = ", ".join(supported_sms) or "none reported"
        gpu_name = torch.cuda.get_device_name(0)
        print(
            f"ERROR: GPU {gpu_name} ({gpu_sm}) is not supported by this torch build.\n"
            f"  This build supports: {supported_text}\n\n"
            f"  The {gpu_name} is Maxwell architecture (CC {gpu_major}.{gpu_minor}).\n"
            "  To use this GPU you need PyTorch ≤ 1.13 with CUDA 10.2 and Python ≤ 3.10:\n"
            "    pip install torch==1.13.1+cu102 -f https://download.pytorch.org/whl/torch_stable.html\n\n"
            "  Alternatively, run on CPU with: python train.py --force-cpu",
            file=sys.stderr,
        )
        sys.exit(1)

    DEVICE = "cuda"
    print(f"✓ GPU: {torch.cuda.get_device_name(0)} (CC {gpu_major}.{gpu_minor})", flush=True)

print("Configuring environment for training...", flush=True)

if DEVICE == "cuda":
    os.environ.setdefault("CUDA_DEVICE_ORDER", "PCI_BUS_ID")
os.environ["ACCELERATE_USE_FSDP"] = "false"


# ============================================================
# 2. Tokenizer (must match whatever you use at inference time)
# ============================================================
tokenizer = AutoTokenizer.from_pretrained("gpt2")
tokenizer.pad_token = tokenizer.eos_token


# ============================================================
# 3. Small GPT-2 config for 8GB legacy GPUs
# ============================================================
config = GPT2Config(
    vocab_size=len(tokenizer),
    n_positions=256,
    n_embd=288,
    n_layer=4,
    n_head=6,
    attn_pdrop=0.0,
    resid_pdrop=0.0,
    embd_pdrop=0.0,
)

model = GPT2LMHeadModel(config)
# "eager" is supported for GPT-2 and is the safest fallback on old hardware.
model.config.attn_implementation = "eager"
# Required when gradient_checkpointing=True, otherwise the Trainer warns/errors.
model.config.use_cache = False


# ============================================================
# 4. Streaming dataset wrapped in a proper IterableDataset
# ============================================================
class GroupedTextStream(IterableDataset):
    """Chunks an HF streaming dataset into fixed-length causal-LM samples."""

    def __init__(self, dataset, tokenizer, block_size):
        self.dataset = dataset
        self.tokenizer = tokenizer
        self.block_size = block_size

    def __iter__(self):
        buffer = []
        for item in self.dataset:
            tokens = self.tokenizer.encode(item["text"]) + [self.tokenizer.eos_token_id]
            buffer.extend(tokens)
            while len(buffer) >= self.block_size:
                chunk = buffer[: self.block_size]
                buffer = buffer[self.block_size :]
                yield {
                    "input_ids": torch.tensor(chunk, dtype=torch.long),
                    "labels": torch.tensor(chunk, dtype=torch.long),
                }


dataset = load_dataset(
    "HuggingFaceFW/fineweb-edu",
    name="sample-10BT",
    split="train",
    streaming=True,
)

train_dataset = GroupedTextStream(dataset, tokenizer, block_size=config.n_positions)


# ============================================================
# 5. Clear memory before training
# ============================================================
gc.collect()
if DEVICE == "cuda":
    torch.cuda.empty_cache()


# ============================================================
# 6. Training arguments for legacy 8GB hardware
# ============================================================
training_args = TrainingArguments(
    output_dir="./quadro_fineweb_output",
    max_steps=1500,
    per_device_train_batch_size=1,
    gradient_accumulation_steps=32,
    learning_rate=4e-4,
    weight_decay=0.01,
    lr_scheduler_type="linear",
    warmup_steps=50,
    logging_steps=10,
    save_steps=500,
    save_total_limit=2,
    fp16=(DEVICE == "cuda"),
    bf16=False,
    gradient_checkpointing=(DEVICE == "cuda"),
    optim="adamw_torch",
    dataloader_pin_memory=(DEVICE == "cuda"),
    use_cpu=(DEVICE == "cpu"),
    report_to="none",
)


# ============================================================
# 7. Launch training
# ============================================================
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
)

print("Starting training process. Monitor host window memory carefully.")
trainer.train()

# Optional: persist final model + tokenizer
trainer.save_model("./quadro_fineweb_output/final")
tokenizer.save_pretrained("./quadro_fineweb_output/final")
print("Training complete. Final model saved to ./quadro_fineweb_output/final")
