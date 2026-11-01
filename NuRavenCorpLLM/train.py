import gc
import os
import subprocess

import torch
from datasets import load_dataset
from torch.utils.data import IterableDataset
from transformers import AutoTokenizer, GPT2Config, GPT2LMHeadModel, Trainer, TrainingArguments


# ============================================================
# 1. Hardware check
# ============================================================
if not torch.backends.cuda.is_built():
    raise RuntimeError(
        "Installed PyTorch build is CPU-only. Install a CUDA-enabled torch wheel for this Python version."
    )

if not torch.cuda.is_available():
    try:
        smi = subprocess.run(
            ["nvidia-smi", "-L"],
            check=False,
            capture_output=True,
            text=True,
        )
        smi_out = smi.stdout.strip() or smi.stderr.strip() or "nvidia-smi returned no output"
    except OSError:
        smi_out = "nvidia-smi not found on PATH"
    raise RuntimeError(f"NVIDIA GPU context not detected by PyTorch. Driver check: {smi_out}")

gpu_cc = torch.cuda.get_device_capability(0)
gpu_sm = f"sm_{gpu_cc[0]}{gpu_cc[1]}"
supported_sms = sorted({arch for arch in torch.cuda.get_arch_list() if arch.startswith("sm_")})

def parse_sm(sm_label):
    digits = sm_label[3:]
    if not digits.isdigit():
        return None
    if len(digits) == 2:
        return int(digits[0]), int(digits[1])
    if len(digits) == 3:
        return int(digits[:2]), int(digits[2])
    return None

gpu_major, gpu_minor = gpu_cc
has_compatible_sm = False
for sm in supported_sms:
    parsed = parse_sm(sm)
    if parsed is None:
        continue
    major, minor = parsed
    if major == gpu_major and minor <= gpu_minor:
        has_compatible_sm = True
        break

if not has_compatible_sm:
    supported_text = ", ".join(supported_sms) or "none reported"
    raise RuntimeError(
        f"Detected GPU {torch.cuda.get_device_name(0)} ({gpu_sm}), but this torch build only supports: {supported_text}. "
        "Use a torch wheel that includes your GPU architecture."
    )

print(f"Detected GPU: {torch.cuda.get_device_name(0)}")
print("Configuring environment for legacy 8GB hardware architecture...")

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
    fp16=True,  # legacy-safe precision path (monitor for NaN)
    bf16=False,  # not supported on pre-Ampere
    gradient_checkpointing=True,
    optim="adamw_torch",
    dataloader_pin_memory=True,
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
