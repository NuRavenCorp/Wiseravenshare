from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset, IterableDataset


class MemmapTokenDataset(IterableDataset):
    def __init__(self, bin_file: Path, block_size: int, dtype: str):
        self.bin_file = Path(bin_file)
        self.block_size = block_size
        np_dtype = np.uint16 if dtype == "uint16" else np.uint32
        self.data = np.memmap(self.bin_file, dtype=np_dtype, mode="r")

    def __iter__(self):
        high = len(self.data) - self.block_size - 2
        if high <= 0:
            raise RuntimeError(
                f"Token file {self.bin_file} is too small for block_size={self.block_size}."
            )
        while True:
            ix = np.random.randint(0, high)
            x = torch.from_numpy(self.data[ix : ix + self.block_size].astype(np.int64))
            y = torch.from_numpy(self.data[ix + 1 : ix + 1 + self.block_size].astype(np.int64))
            yield x, y


class PreferencePairDataset(Dataset):
    def __init__(self, jsonl_file: Path, block_size: int):
        self.block_size = int(block_size)
        self.rows: list[dict[str, torch.Tensor]] = []
        with Path(jsonl_file).open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                sample = self._parse_line(line)
                self.rows.append(sample)

        if not self.rows:
            raise RuntimeError(f"No valid preference samples parsed from {jsonl_file}.")

    @staticmethod
    def _to_1d_long(values, name: str) -> torch.Tensor:
        if not isinstance(values, list) or len(values) == 0:
            raise ValueError(f"{name} must be a non-empty list")
        out = torch.tensor(values, dtype=torch.long)
        if out.ndim != 1:
            raise ValueError(f"{name} must be 1D")
        return out

    def _clip(self, values: torch.Tensor) -> torch.Tensor:
        return values[: self.block_size]

    def _build_labels(self, ids: torch.Tensor) -> torch.Tensor:
        if ids.numel() < 2:
            raise ValueError("sequence must have at least 2 tokens")
        labels = ids.roll(-1)
        labels[-1] = -100
        return labels

    def _normalize_mask(self, values, ids: torch.Tensor, labels: torch.Tensor) -> torch.Tensor:
        if values is None:
            mask = (labels >= 0).to(torch.long)
            return mask
        mask = self._to_1d_long(values, "response_mask")
        if mask.shape != ids.shape:
            raise ValueError("response_mask must match token ids length")
        mask = (mask > 0).to(torch.long)
        return mask

    def _normalize_labels(self, values, ids: torch.Tensor) -> torch.Tensor:
        if values is None:
            return self._build_labels(ids)
        labels = self._to_1d_long(values, "labels")
        if labels.shape != ids.shape:
            raise ValueError("labels must match token ids length")
        return labels

    def _extract_ids(self, row: dict, prefix: str) -> torch.Tensor:
        for key in (f"{prefix}_ids", f"{prefix}_input_ids", prefix):
            if key in row:
                return self._to_1d_long(row[key], key)
        raise ValueError(f"Missing token ids for {prefix}")

    def _extract_labels(self, row: dict, prefix: str, ids: torch.Tensor) -> torch.Tensor:
        labels = None
        for key in (f"{prefix}_labels", f"{prefix}_label_ids"):
            if key in row:
                labels = row[key]
                break
        labels_t = self._normalize_labels(labels, ids)
        return labels_t

    def _extract_mask(self, row: dict, prefix: str, ids: torch.Tensor, labels: torch.Tensor) -> torch.Tensor:
        mask = None
        for key in (f"{prefix}_response_mask", f"{prefix}_mask"):
            if key in row:
                mask = row[key]
                break
        mask_t = self._normalize_mask(mask, ids, labels)
        return mask_t

    def _parse_line(self, line: str) -> dict[str, torch.Tensor]:
        import json

        row = json.loads(line)
        if not isinstance(row, dict):
            raise ValueError("Each JSONL row must be an object")

        chosen_ids = self._clip(self._extract_ids(row, "chosen"))
        rejected_ids = self._clip(self._extract_ids(row, "rejected"))

        chosen_labels = self._clip(self._extract_labels(row, "chosen", chosen_ids))
        rejected_labels = self._clip(self._extract_labels(row, "rejected", rejected_ids))

        chosen_mask = self._clip(self._extract_mask(row, "chosen", chosen_ids, chosen_labels))
        rejected_mask = self._clip(self._extract_mask(row, "rejected", rejected_ids, rejected_labels))

        chosen_mask = (chosen_mask > 0).to(torch.long) * (chosen_labels >= 0).to(torch.long)
        rejected_mask = (rejected_mask > 0).to(torch.long) * (rejected_labels >= 0).to(torch.long)

        return {
            "chosen_ids": chosen_ids,
            "chosen_labels": chosen_labels,
            "chosen_response_mask": chosen_mask,
            "rejected_ids": rejected_ids,
            "rejected_labels": rejected_labels,
            "rejected_response_mask": rejected_mask,
        }

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        return self.rows[idx]

    @staticmethod
    def collate(batch: list[dict[str, torch.Tensor]]) -> dict[str, torch.Tensor]:
        def pad_stack(items: list[torch.Tensor], pad_value: int) -> torch.Tensor:
            max_len = max(x.numel() for x in items)
            out = []
            for x in items:
                if x.numel() < max_len:
                    x = torch.nn.functional.pad(x, (0, max_len - x.numel()), value=pad_value)
                out.append(x)
            return torch.stack(out, dim=0)

        return {
            "chosen_ids": pad_stack([x["chosen_ids"] for x in batch], 0),
            "chosen_labels": pad_stack([x["chosen_labels"] for x in batch], -100),
            "chosen_response_mask": pad_stack([x["chosen_response_mask"] for x in batch], 0),
            "rejected_ids": pad_stack([x["rejected_ids"] for x in batch], 0),
            "rejected_labels": pad_stack([x["rejected_labels"] for x in batch], -100),
            "rejected_response_mask": pad_stack([x["rejected_response_mask"] for x in batch], 0),
        }
