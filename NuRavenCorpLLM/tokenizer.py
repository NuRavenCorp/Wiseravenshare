from pathlib import Path

from transformers import PreTrainedTokenizerFast


class Tokenizer:
    def __init__(self, tokenizer_path: str) -> None:
        path = Path(tokenizer_path)
        if not path.exists():
            raise FileNotFoundError(f"Tokenizer file not found: {path}")

        self._tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(path))
        if self._tokenizer.pad_token is None and self._tokenizer.eos_token is not None:
            self._tokenizer.pad_token = self._tokenizer.eos_token

    @property
    def eos_token_id(self):
        return self._tokenizer.eos_token_id

    def encode(self, text: str) -> list[int]:
        return self._tokenizer.encode(text, add_special_tokens=False)

    def decode(self, token_ids: list[int]) -> str:
        return self._tokenizer.decode(token_ids, skip_special_tokens=True)
