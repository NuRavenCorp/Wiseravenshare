import os
from pathlib import Path
from threading import Thread
from typing import Generator

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer


def _select_device() -> str:
    if os.getenv("FORCE_CPU", "").strip().lower() in {"1", "true", "yes"}:
        return "cpu"
    if not torch.cuda.is_available():
        return "cpu"
    try:
        _ = torch.zeros(1, device="cuda")
        return "cuda"
    except Exception:
        return "cpu"


class GPT(torch.nn.Module):
    def __init__(self, model_id: str | None = None) -> None:
        super().__init__()
        self.model_id = model_id or os.getenv("MODEL_ID", "distilgpt2")
        self.device_name = _select_device()
        dtype = torch.float16 if self.device_name == "cuda" else torch.float32

        self.model = AutoModelForCausalLM.from_pretrained(self.model_id, torch_dtype=dtype)
        self.max_seq_len = getattr(self.model.config, "max_position_embeddings", None)

    def forward(self, input_ids: torch.Tensor, **kwargs):
        return self.model(input_ids=input_ids, **kwargs)

    @classmethod
    def from_checkpoint(cls, checkpoint_path: str, model_id: str | None = None) -> "GPT":
        checkpoint = Path(checkpoint_path)
        if not checkpoint.exists():
            raise FileNotFoundError(f"Checkpoint not found: {checkpoint}")

        instance = cls(model_id=model_id)

        if checkpoint.is_dir():
            instance.model = AutoModelForCausalLM.from_pretrained(checkpoint)
            instance.max_seq_len = getattr(instance.model.config, "max_position_embeddings", None)
            return instance

        state = torch.load(checkpoint, map_location="cpu")
        if isinstance(state, dict):
            if "model_state_dict" in state:
                state = state["model_state_dict"]
            elif "state_dict" in state:
                state = state["state_dict"]
            elif "model" in state and isinstance(state["model"], dict):
                state = state["model"]

        if not isinstance(state, dict):
            raise ValueError(f"Unsupported checkpoint format in: {checkpoint}")

        instance.model.load_state_dict(state, strict=False)
        return instance


class LlmModel:
    def __init__(self) -> None:
        self.model_id = os.getenv("MODEL_ID", "distilgpt2")
        self.device = _select_device()
        dtype = torch.float16 if self.device == "cuda" else torch.float32

        self.tokenizer = AutoTokenizer.from_pretrained(self.model_id)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        self.model = AutoModelForCausalLM.from_pretrained(self.model_id, torch_dtype=dtype)
        self.model.to(self.device)
        self.model.eval()
        self.max_seq_len = getattr(self.model.config, "max_position_embeddings", None)

    def generate(
        self,
        prompt: str,
        max_new_tokens: int = 128,
        temperature: float = 0.7,
        top_k: int = 50,
        top_p: float = 0.9,
    ) -> str:
        inputs = self.tokenizer(prompt, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        # Truncate to fit context window, leaving room for new tokens
        if self.max_seq_len:
            max_input_len = max(1, self.max_seq_len - max_new_tokens)
            for key in ("input_ids", "attention_mask"):
                if key in inputs and inputs[key].shape[-1] > max_input_len:
                    inputs[key] = inputs[key][..., -max_input_len:]

        generate_kwargs = dict(
            **inputs,
            do_sample=temperature > 0,
            temperature=max(temperature, 1e-5),
            top_p=top_p,
            max_new_tokens=max_new_tokens,
            pad_token_id=self.tokenizer.eos_token_id,
        )
        if top_k > 0:
            generate_kwargs["top_k"] = top_k

        with torch.inference_mode():
            output = self.model.generate(**generate_kwargs)

        return self.tokenizer.decode(output[0], skip_special_tokens=True)

    def stream_generate(
        self,
        prompt: str,
        max_new_tokens: int = 128,
        temperature: float = 0.7,
        top_k: int = 50,
        top_p: float = 0.9,
    ) -> Generator[str, None, None]:
        inputs = self.tokenizer(prompt, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        # Truncate to fit context window, leaving room for new tokens
        if self.max_seq_len:
            max_input_len = max(1, self.max_seq_len - max_new_tokens)
            for key in ("input_ids", "attention_mask"):
                if key in inputs and inputs[key].shape[-1] > max_input_len:
                    inputs[key] = inputs[key][..., -max_input_len:]

        streamer = TextIteratorStreamer(self.tokenizer, skip_prompt=True, skip_special_tokens=True)

        generate_kwargs = dict(
            **inputs,
            streamer=streamer,
            do_sample=temperature > 0,
            temperature=max(temperature, 1e-5),
            top_p=top_p,
            max_new_tokens=max_new_tokens,
            pad_token_id=self.tokenizer.eos_token_id,
        )
        if top_k > 0:
            generate_kwargs["top_k"] = top_k

        thread = Thread(target=self.model.generate, kwargs=generate_kwargs)
        thread.start()

        for text in streamer:
            yield text
