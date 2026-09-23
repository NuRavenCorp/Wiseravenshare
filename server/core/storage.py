from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import BinaryIO

DEFAULT_BLOCK_SIZE = 65536


def _coerce_block(block: bytes | bytearray | memoryview | str) -> bytes:
    if isinstance(block, str):
        return block.encode("utf-8")
    return bytes(block)


def iter_file_blocks(path: str | Path, block_size: int = DEFAULT_BLOCK_SIZE) -> Iterator[bytes]:
    if block_size <= 0:
        raise ValueError("block_size must be greater than zero")

    with open(path, "rb") as stream:
        while True:
            chunk = stream.read(block_size)
            if not chunk:
                break
            yield chunk


def read_file_in_blocks(path: str | Path, block_size: int = DEFAULT_BLOCK_SIZE) -> list[bytes]:
    return list(iter_file_blocks(path, block_size=block_size))


def write_file_in_blocks(path: str | Path, blocks: Iterable[bytes | bytearray | memoryview | str], block_size: int = DEFAULT_BLOCK_SIZE) -> Path:
    if block_size <= 0:
        raise ValueError("block_size must be greater than zero")

    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)

    with open(target, "wb") as stream:
        for block in blocks:
            stream.write(_coerce_block(block))

    return target


def read_block(path: str | Path, offset: int = 0, block_size: int = DEFAULT_BLOCK_SIZE) -> bytes:
    if offset < 0:
        raise ValueError("offset must be zero or greater")
    if block_size <= 0:
        raise ValueError("block_size must be greater than zero")

    with open(path, "rb") as stream:
        stream.seek(offset)
        return stream.read(block_size)


def write_block(path: str | Path, data: bytes | bytearray | memoryview | str, offset: int = 0) -> int:
    if offset < 0:
        raise ValueError("offset must be zero or greater")

    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = _coerce_block(data)

    with open(target, "r+b") as stream:
        stream.seek(offset)
        stream.write(payload)
        return offset + len(payload)


def copy_stream_in_blocks(source: BinaryIO, destination: BinaryIO, block_size: int = DEFAULT_BLOCK_SIZE) -> int:
    if block_size <= 0:
        raise ValueError("block_size must be greater than zero")

    total = 0
    while True:
        block = source.read(block_size)
        if not block:
            break
        destination.write(block)
        total += len(block)
    return total


class Storage(ABC):
    @abstractmethod
    def save(self, key: str, data: bytes) -> str:
        raise NotImplementedError

    @abstractmethod
    def public_url(self, key: str) -> str:
        raise NotImplementedError

    def read_bytes(self, key: str) -> bytes:
        return self._resolve_path(key).read_bytes()

    def write_bytes(self, key: str, data: bytes) -> str:
        return self.save(key, data)

    def read_text(self, key: str, encoding: str = "utf-8") -> str:
        return self._resolve_path(key).read_text(encoding=encoding)

    def write_text(self, key: str, data: str, encoding: str = "utf-8") -> str:
        path = self._resolve_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data, encoding=encoding)
        return str(path)

    def exists(self, key: str) -> bool:
        return self._resolve_path(key).exists()

    def delete(self, key: str) -> bool:
        path = self._resolve_path(key)
        if not path.exists():
            return False
        path.unlink()
        return True

    def copy_from(self, key: str, source: str | Path) -> str:
        src = Path(source)
        data = src.read_bytes()
        return self.save(key, data)

    def copy_to(self, key: str, destination: str | Path) -> Path:
        target = Path(destination)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(self.read_bytes(key))
        return target

    def read_in_blocks(self, key: str, block_size: int = DEFAULT_BLOCK_SIZE) -> list[bytes]:
        return read_file_in_blocks(self._resolve_path(key), block_size=block_size)

    def write_in_blocks(self, key: str, blocks: Iterable[bytes | bytearray | memoryview | str], block_size: int = DEFAULT_BLOCK_SIZE) -> str:
        target = write_file_in_blocks(self._resolve_path(key), blocks, block_size=block_size)
        return str(target)

    def _resolve_path(self, key: str) -> Path:
        raise NotImplementedError


class LocalStorage(Storage):
    def __init__(self, root: str, base_url: str):
        self.root = root
        self.base_url = base_url

    def _resolve_path(self, key: str) -> Path:
        return Path(self.root) / key

    def save(self, key: str, data: bytes) -> str:
        p = self._resolve_path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return str(p)

    def public_url(self, key: str) -> str:
        return f"{self.base_url}/{key}"


storage: Storage = LocalStorage("media", "https://cdn.wiseraven.example")
