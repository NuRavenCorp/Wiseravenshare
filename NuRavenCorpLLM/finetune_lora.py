"""
LoRA instruction fine-tuning for NuRavenCorpLLM.

Uses PEFT + TRL SFTTrainer to apply Low-Rank Adaptation to the base model,
training on an Alpaca-format instruction dataset so the model learns to follow
instructions rather than just continue text.

Usage (CPU, quick smoke-test):
    python finetune_lora.py --base-model ./quadro_fineweb_output/final \
        --output-dir ./lora_output_safe --dataset alpaca_sample --max-steps 20

Usage (safer run on small dataset):
    python finetune_lora.py --base-model ./quadro_fineweb_output/final \
        --output-dir ./lora_output_safe --dataset alpaca_sample --epochs 4 --lr 3e-5 --lora-rank 16

Usage (custom JSONL file with instruction/output columns):
    python finetune_lora.py --base-model ./quadro_fineweb_output/final \
        --output-dir ./lora_output_safe --dataset-file ./my_data.jsonl --epochs 4 --lr 3e-5

After training, merge and export:
    python finetune_lora.py --merge-only \
        --base-model ./quadro_fineweb_output/final \
        --lora-adapter ./lora_output_safe \
        --output-dir ./lora_merged_safe
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path


def build_alpaca_prompt(instruction: str, input_text: str = "", output: str = "") -> str:
    """Format a single example in Alpaca instruction format."""
    if input_text.strip():
        prompt = (
            "Below is an instruction that describes a task, paired with an input. "
            "Write a response that appropriately completes the request.\n\n"
            f"### Instruction:\n{instruction}\n\n"
            f"### Input:\n{input_text}\n\n"
            "### Response:\n"
        )
    else:
        prompt = (
            "Below is an instruction that describes a task. "
            "Write a response that appropriately completes the request.\n\n"
            f"### Instruction:\n{instruction}\n\n"
            "### Response:\n"
        )
    return prompt + output


def load_alpaca_sample() -> list[dict]:
    """50 hand-crafted instruction examples covering NuRaven use-cases."""
    return [
        {"instruction": "Write a one sentence welcome message for NuRaven users.", "input": "",
         "output": "Welcome to NuRaven, where your team can ask questions, manage knowledge, and move faster with AI support."},
        {"instruction": "List 3 security best practices for API keys.", "input": "",
         "output": "Store keys in environment variables, rotate keys regularly, and never commit secrets to source control."},
        {"instruction": "Return JSON with keys status and message saying system is healthy.", "input": "",
         "output": '{"status": "ok", "message": "system is healthy"}'},
        {"instruction": "Write a short support response confirming that a deployment completed successfully.", "input": "",
         "output": "Deployment completed successfully and all services are healthy."},
        {"instruction": "In one sentence, explain why prompt injection filtering is useful.", "input": "",
         "output": "Prompt injection filtering helps block malicious instructions that try to override safety and system rules."},
        {"instruction": "Summarize what a REST API is in two sentences.", "input": "",
         "output": "A REST API is a web service that uses HTTP methods like GET, POST, and DELETE to expose resources. Clients interact with it by sending requests to structured URLs and receiving JSON responses."},
        {"instruction": "Write a Python function that returns the square of a number.", "input": "",
         "output": "def square(n):\n    return n * n"},
        {"instruction": "What is a JWT token?", "input": "",
         "output": "A JWT (JSON Web Token) is a compact, URL-safe token used to securely transmit claims between parties, typically for authentication."},
        {"instruction": "List 3 advantages of using Docker.", "input": "",
         "output": "Docker ensures consistent environments across development and production, simplifies dependency management, and enables easy horizontal scaling with containers."},
        {"instruction": "Write a SQL query to select all users with an active status.", "input": "",
         "output": "SELECT * FROM users WHERE status = 'active';"},
        {"instruction": "Explain what RAG (Retrieval Augmented Generation) means.", "input": "",
         "output": "RAG is a technique where a language model retrieves relevant documents from a knowledge base before generating a response, improving accuracy and reducing hallucinations."},
        {"instruction": "Write a one-sentence description of NuRaven's purpose.", "input": "",
         "output": "NuRaven is an AI-powered assistant platform that helps teams manage knowledge, automate conversations, and streamline business operations."},
        {"instruction": "What does CORS stand for and why does it matter?", "input": "",
         "output": "CORS stands for Cross-Origin Resource Sharing; it is a browser security mechanism that controls which domains can make requests to a given API."},
        {"instruction": "Write a short error message for a failed login attempt.", "input": "",
         "output": "Login failed. Please check your email and password and try again."},
        {"instruction": "Explain what an embedding vector is in one sentence.", "input": "",
         "output": "An embedding vector is a list of numbers that represents text or data as a point in high-dimensional space, capturing semantic meaning."},
        {"instruction": "Return JSON with keys name, email, and role for an admin user.", "input": "",
         "output": '{"name": "Admin User", "email": "admin@example.com", "role": "admin"}'},
        {"instruction": "Write a Python function to check if a string is a valid email.", "input": "",
         "output": "import re\n\ndef is_valid_email(email):\n    return bool(re.match(r'^[^@]+@[^@]+\\.[^@]+$', email))"},
        {"instruction": "Summarize what pgvector is.", "input": "",
         "output": "pgvector is a PostgreSQL extension that enables storing and querying high-dimensional vectors, making it possible to run similarity searches directly in the database."},
        {"instruction": "What is the difference between authentication and authorization?", "input": "",
         "output": "Authentication verifies who you are, while authorization determines what you are allowed to do."},
        {"instruction": "Write a short confirmation message that a file was uploaded successfully.", "input": "",
         "output": "Your file has been uploaded successfully and is now available for processing."},
        {"instruction": "List 3 best practices for writing REST API endpoints.", "input": "",
         "output": "Use nouns not verbs in URLs, return appropriate HTTP status codes, and version your API with a prefix like /v1."},
        {"instruction": "What is a webhook?", "input": "",
         "output": "A webhook is an HTTP callback that sends data to a URL when a specific event occurs, allowing systems to react in real time."},
        {"instruction": "Write a Python function that flattens a nested list.", "input": "",
         "output": "def flatten(lst):\n    result = []\n    for item in lst:\n        if isinstance(item, list):\n            result.extend(flatten(item))\n        else:\n            result.append(item)\n    return result"},
        {"instruction": "Explain what a vector database is.", "input": "",
         "output": "A vector database stores embeddings and enables fast nearest-neighbor search, allowing applications to find semantically similar items like documents or images."},
        {"instruction": "Write a short onboarding message for a new team member.", "input": "",
         "output": "Welcome to the team! Your account has been set up and you can start exploring the platform right away."},
        {"instruction": "What is fine-tuning in machine learning?", "input": "",
         "output": "Fine-tuning is the process of continuing to train a pre-trained model on a smaller, task-specific dataset so it learns to perform a specific task more accurately."},
        {"instruction": "Return JSON with keys total and items for an empty cart.", "input": "",
         "output": '{"total": 0, "items": []}'},
        {"instruction": "Write a Python function to count word frequency in a string.", "input": "",
         "output": "def word_count(text):\n    words = text.lower().split()\n    freq = {}\n    for w in words:\n        freq[w] = freq.get(w, 0) + 1\n    return freq"},
        {"instruction": "Explain what a system prompt is in LLM applications.", "input": "",
         "output": "A system prompt is a hidden instruction given to an LLM at the start of a conversation that sets its role, tone, and behavioral constraints."},
        {"instruction": "Write a one-sentence definition of machine learning.", "input": "",
         "output": "Machine learning is a subset of AI where models learn patterns from data to make predictions or decisions without being explicitly programmed."},
        {"instruction": "List 3 common causes of API 500 errors.", "input": "",
         "output": "Unhandled exceptions in server code, database connection failures, and null reference errors are common causes of API 500 errors."},
        {"instruction": "Write a short message confirming a password was changed.", "input": "",
         "output": "Your password has been changed successfully. Please log in with your new password."},
        {"instruction": "What is LoRA in the context of LLMs?", "input": "",
         "output": "LoRA (Low-Rank Adaptation) is a parameter-efficient fine-tuning method that injects trainable low-rank matrices into model layers, allowing large models to be fine-tuned with far less memory."},
        {"instruction": "Write a Python function to paginate a list.", "input": "",
         "output": "def paginate(items, page, page_size):\n    start = (page - 1) * page_size\n    return items[start:start + page_size]"},
        {"instruction": "Explain what a context window is in LLMs.", "input": "",
         "output": "A context window is the maximum number of tokens an LLM can process at once; text beyond this limit is ignored or must be chunked."},
        {"instruction": "Return JSON representing a successful API response.", "input": "",
         "output": '{"success": true, "message": "Operation completed successfully."}'},
        {"instruction": "Write a one sentence explanation of what an API key is.", "input": "",
         "output": "An API key is a unique secret token used to authenticate requests from an application to a service."},
        {"instruction": "List 3 principles of clean code.", "input": "",
         "output": "Write self-documenting variable names, keep functions small with a single responsibility, and avoid duplication by following the DRY principle."},
        {"instruction": "What is the purpose of a health check endpoint?", "input": "",
         "output": "A health check endpoint returns the current status of a service, allowing load balancers and monitoring tools to verify it is running correctly."},
        {"instruction": "Write a short apology message for a service outage.", "input": "",
         "output": "We apologize for the inconvenience. Our team is actively working to resolve the issue and restore service as quickly as possible."},
        {"instruction": "Explain what semantic search means.", "input": "",
         "output": "Semantic search finds results based on the meaning of a query rather than exact keyword matches, using embeddings to measure conceptual similarity."},
        {"instruction": "Write a Python function that checks if a number is prime.", "input": "",
         "output": "def is_prime(n):\n    if n < 2:\n        return False\n    for i in range(2, int(n**0.5) + 1):\n        if n % i == 0:\n            return False\n    return True"},
        {"instruction": "What is the difference between a list and a tuple in Python?", "input": "",
         "output": "A list is mutable and can be modified after creation, while a tuple is immutable and its elements cannot be changed."},
        {"instruction": "Write a success notification for a form submission.", "input": "",
         "output": "Thank you! Your form has been submitted successfully. We will get back to you shortly."},
        {"instruction": "What is quantization in the context of LLMs?", "input": "",
         "output": "Quantization reduces the precision of model weights (e.g., from 32-bit to 4-bit), significantly lowering memory usage and speeding up inference with minimal accuracy loss."},
        {"instruction": "Return JSON with keys page, total_pages, and results as an empty array.", "input": "",
         "output": '{"page": 1, "total_pages": 0, "results": []}'},
        {"instruction": "Write a one-sentence explanation of what a microservice is.", "input": "",
         "output": "A microservice is a small, independently deployable service that handles one specific function within a larger application."},
        {"instruction": "List 3 benefits of using environment variables for configuration.", "input": "",
         "output": "They keep secrets out of source code, allow different settings per environment, and can be changed without redeploying the application."},
        {"instruction": "What is the purpose of tokenization in NLP?", "input": "",
         "output": "Tokenization splits text into smaller units like words or subwords so a model can process and understand language numerically."},
        {"instruction": "Write a short message confirming that a user account was created.", "input": "",
         "output": "Your account has been created successfully. Welcome aboard!"},
    ]


def load_hf_dataset(name: str, split: str = "train", n: int | None = None):
    from datasets import load_dataset  # type: ignore[import]
    ds = load_dataset(name, split=split)
    if n:
        ds = ds.select(range(min(n, len(ds))))
    return ds


def load_jsonl_dataset(path: Path):
    from datasets import Dataset  # type: ignore[import]
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return Dataset.from_list(rows)


def merge_lora(base_model_path: str, lora_adapter_path: str, output_dir: str) -> None:
    import torch
    from peft import PeftModel  # type: ignore[import]
    from transformers import AutoModelForCausalLM, AutoTokenizer

    print(f"Loading base model from {base_model_path}...")
    tokenizer = AutoTokenizer.from_pretrained(base_model_path)
    model = AutoModelForCausalLM.from_pretrained(base_model_path, torch_dtype=torch.float32)

    print(f"Loading LoRA adapter from {lora_adapter_path}...")
    model = PeftModel.from_pretrained(model, lora_adapter_path)

    print("Merging LoRA weights into base model...")
    model = model.merge_and_unload()

    Path(output_dir).mkdir(parents=True, exist_ok=True)
    print(f"Saving merged model to {output_dir}...")
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    print("Done. Merged model ready for inference.")


def train(args: argparse.Namespace) -> None:
    import torch
    from datasets import Dataset  # type: ignore[import]
    from peft import LoraConfig, TaskType, get_peft_model  # type: ignore[import]
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from trl import SFTTrainer, SFTConfig  # type: ignore[import]

    # Force CPU — avoids CUDA kernel compatibility issues on non-standard GPUs
    device = "cpu"
    os.environ["CUDA_VISIBLE_DEVICES"] = ""

    print(f"Loading base model: {args.base_model}")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(args.base_model, torch_dtype=torch.float32)
    model = model.to(device)

    # LoRA config – keep rank small for tiny model
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=args.lora_rank,
        lora_alpha=args.lora_rank * 2,
        lora_dropout=0.05,
        target_modules=["c_attn", "c_proj"],  # GPT2 attention projection names
        bias="none",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # Load dataset
    if args.dataset_file:
        raw_ds = load_jsonl_dataset(Path(args.dataset_file))
    elif args.dataset == "alpaca_sample":
        raw_ds = Dataset.from_list(load_alpaca_sample())
    else:
        print(f"Downloading HuggingFace dataset: {args.dataset}")
        raw_ds = load_hf_dataset(args.dataset, n=args.max_train_samples)

    # Format into full training strings
    def format_example(example):
        text = build_alpaca_prompt(
            instruction=example.get("instruction", example.get("prompt", "")),
            input_text=example.get("input", ""),
            output=example.get("output", example.get("response", example.get("completion", ""))),
        )
        return {"text": text}

    dataset = raw_ds.map(format_example)
    dataset_size = len(dataset)
    effective_batch = max(1, args.batch_size * args.grad_accum)
    steps_per_epoch = max(1, math.ceil(dataset_size / effective_batch))
    estimated_steps = int(max(1, round(steps_per_epoch * args.epochs)))
    effective_max_steps = args.max_steps if args.max_steps and args.max_steps > 0 else -1
    schedule_steps = args.max_steps if effective_max_steps > 0 else estimated_steps

    print(
        f"Dataset rows: {dataset_size}, effective batch: {effective_batch}, "
        f"steps/epoch: {steps_per_epoch}, target epochs: {args.epochs}, "
        f"estimated total steps: {estimated_steps}"
    )
    if dataset_size < 200:
        print(
            "WARNING: dataset has fewer than 200 rows. Small datasets can overfit quickly; "
            "use low learning rate and <=5 epochs."
        )
    if args.lr > 5e-5:
        print("WARNING: learning rate is high for small datasets. Recommended range: 2e-5 to 5e-5.")

    sft_config = SFTConfig(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        max_steps=effective_max_steps,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_steps=min(50, max(1, schedule_steps // 10)),
        logging_steps=10,
        save_steps=max(10, schedule_steps // 4),
        save_total_limit=2,
        fp16=False,
        bf16=False,
        use_cpu=True,
        report_to="none",
        dataset_text_field="text",
        max_length=args.max_seq_length,
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=dataset,
    )

    print("Starting LoRA fine-tuning...")
    trainer.train()

    output_path = Path(args.output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(output_path))
    tokenizer.save_pretrained(str(output_path))
    print(f"\nLoRA adapter saved to: {output_path}")
    print("Next step: merge adapter into base model with --merge-only flag.")


def main() -> int:
    parser = argparse.ArgumentParser(description="LoRA instruction fine-tuning for NuRavenCorpLLM")
    parser.add_argument("--base-model", default="./quadro_fineweb_output/final",
                        help="Path to the HuggingFace model to fine-tune.")
    parser.add_argument("--output-dir", default="./lora_output",
                        help="Directory to save LoRA adapter (or merged model with --merge-only).")
    parser.add_argument("--dataset", default="alpaca_sample",
                        help="Dataset: 'alpaca_sample' (built-in 50 examples), 'tatsu-lab/alpaca' "
                             "(full 52k from HF), or any HF dataset name with instruction/output columns.")
    parser.add_argument("--dataset-file", default="",
                        help="Path to a custom JSONL file with instruction/output or prompt/completion columns.")
    parser.add_argument("--epochs", type=float, default=4.0,
                        help="Target epochs (safe default: 4.0 for small datasets).")
    parser.add_argument("--max-steps", type=int, default=-1,
                        help="Optional hard cap on total training steps. Use -1 to rely on --epochs.")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--grad-accum", type=int, default=4,
                        help="Gradient accumulation steps (effective batch = batch_size * grad_accum).")
    parser.add_argument("--lr", type=float, default=3e-5,
                        help="Learning rate (safe default for small data: 3e-5).")
    parser.add_argument("--lora-rank", type=int, default=16,
                        help="LoRA rank r (default 16). Alpha is set to 2*r.")
    parser.add_argument("--max-seq-length", type=int, default=256,
                        help="Max sequence length for training (must fit model context window).")
    parser.add_argument("--max-train-samples", type=int, default=5000,
                        help="Limit HF dataset to first N samples for faster runs.")
    parser.add_argument("--merge-only", action="store_true",
                        help="Skip training; just merge an existing LoRA adapter into the base model.")
    parser.add_argument("--lora-adapter", default="",
                        help="Path to existing LoRA adapter for --merge-only.")
    args = parser.parse_args()

    if args.merge_only:
        if not args.lora_adapter:
            print("Error: --lora-adapter required with --merge-only")
            return 1
        merge_lora(args.base_model, args.lora_adapter, args.output_dir)
        return 0

    train(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
