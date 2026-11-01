from pathlib import Path

import numpy as np
import torch
from torch.utils.data import IterableDataset


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
