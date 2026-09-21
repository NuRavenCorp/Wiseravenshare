import os
from abc import ABC, abstractmethod


class CredentialStore(ABC):
    @abstractmethod
    def get(self, platform: str, key: str) -> str | None:
        raise NotImplementedError


class EnvCredentialStore(CredentialStore):
    def get(self, platform: str, key: str) -> str | None:
        return os.getenv(f"{platform.upper()}_{key.upper()}")


class DictCredentialStore(CredentialStore):
    def __init__(self, data):
        self.data = data

    def get(self, platform: str, key: str) -> str | None:
        return self.data.get(platform, {}).get(key)


credentials: CredentialStore = EnvCredentialStore()
