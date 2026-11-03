import os
import json
import re
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

    def _build_inputs(self, prompt: str, system_prompt: str | None = None) -> dict[str, torch.Tensor]:
        if hasattr(self.tokenizer, "apply_chat_template") and getattr(self.tokenizer, "chat_template", None):
            messages = []
            if system_prompt and system_prompt.strip():
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            input_ids = self.tokenizer.apply_chat_template(
                messages,
                tokenize=True,
                add_generation_prompt=True,
                return_tensors="pt",
            )
            if isinstance(input_ids, torch.Tensor):
                attention_mask = torch.ones_like(input_ids)
                return {
                    "input_ids": input_ids.to(self.device),
                    "attention_mask": attention_mask.to(self.device),
                }
        inputs = self.tokenizer(prompt, return_tensors="pt")
        return {k: v.to(self.device) for k, v in inputs.items()}

    def _extract_json_object(self, text: str) -> dict | None:
        candidate = text.strip()
        fence = re.search(r"```(?:json)?\s*(.*?)```", candidate, flags=re.IGNORECASE | re.DOTALL)
        if fence:
            candidate = fence.group(1).strip()
        first = candidate.find("{")
        if first == -1:
            return None
        depth = 0
        start = -1
        for i, ch in enumerate(candidate[first:], start=first):
            if ch == "{":
                if depth == 0:
                    start = i
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and start != -1:
                    snippet = candidate[start : i + 1]
                    try:
                        parsed = json.loads(snippet)
                        if isinstance(parsed, dict):
                            return parsed
                    except json.JSONDecodeError:
                        pass
        return None

    def generate(
        self,
        prompt: str,
        max_new_tokens: int = 128,
        temperature: float = 0.7,
        top_k: int = 50,
        top_p: float = 0.9,
        system_prompt: str | None = None,
    ) -> str:
        inputs = self._build_inputs(prompt, system_prompt=system_prompt)
        prompt_len = inputs["input_ids"].shape[-1]

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

        generated = output[0][prompt_len:]
        return self.tokenizer.decode(generated, skip_special_tokens=True).strip()

    def generate_json(
        self,
        prompt: str,
        required_keys: list[str] | None = None,
        max_new_tokens: int = 128,
        temperature: float = 0.2,
        top_k: int = 50,
        top_p: float = 0.9,
        system_prompt: str | None = None,
        retries: int = 2,
        retry_token_buffer: int = 32,
        max_retry_tokens: int = 1024,
    ) -> str:
        required_keys = required_keys or []
        key_hint = ""
        if required_keys:
            key_hint = f"Required keys: {', '.join(required_keys)}."
        forced_prompt = (
            f"{prompt}\n\n"
            "Respond ONLY with valid JSON object. No prose, no markdown fences.\n"
            f"{key_hint}"
        )
        forced_system = (
            system_prompt
            or "You are a strict JSON assistant. Return only valid JSON objects that satisfy requested keys."
        )

        attempts = max(1, retries + 1)
        for attempt in range(attempts):
            temp = 0.0 if attempt > 0 else temperature
            current_max_new_tokens = min(max_retry_tokens, max_new_tokens + (attempt * max(0, retry_token_buffer)))
            text = self.generate(
                prompt=forced_prompt,
                max_new_tokens=current_max_new_tokens,
                temperature=temp,
                top_k=top_k,
                top_p=top_p,
                system_prompt=forced_system,
            )
            parsed = self._extract_json_object(text)
            if parsed is None:
                continue
            missing = [k for k in required_keys if k not in parsed]
            if missing:
                continue
            return json.dumps(parsed, ensure_ascii=False)
        raise ValueError("Model did not produce valid JSON for requested schema.")

    def stream_generate(
        self,
        prompt: str,
        max_new_tokens: int = 128,
        temperature: float = 0.7,
        top_k: int = 50,
        top_p: float = 0.9,
        system_prompt: str | None = None,
    ) -> Generator[str, None, None]:
        inputs = self._build_inputs(prompt, system_prompt=system_prompt)

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
