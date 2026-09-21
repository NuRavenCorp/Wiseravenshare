from abc import ABC, abstractmethod


class Storage(ABC):
    @abstractmethod
    def save(self, key: str, data: bytes) -> str:
        raise NotImplementedError

    @abstractmethod
    def public_url(self, key: str) -> str:
        raise NotImplementedError


class LocalStorage(Storage):
    def __init__(self, root: str, base_url: str):
        self.root = root
        self.base_url = base_url

    def save(self, key: str, data: bytes) -> str:
        import pathlib

        p = pathlib.Path(self.root) / key
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return str(p)

    def public_url(self, key: str) -> str:
        return f"{self.base_url}/{key}"


storage: Storage = LocalStorage("media", "https://cdn.wiseraven.example")
