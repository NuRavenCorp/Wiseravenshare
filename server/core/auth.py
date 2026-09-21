import json
import os
import pathlib
import threading
from abc import ABC, abstractmethod
from typing import Dict, Optional


class CredentialStore(ABC):
    @abstractmethod
    def get(self, platform: str, key: str, user_id: str | None = None) -> str | None:
        raise NotImplementedError

    @abstractmethod
    def set_many(self, platform: str, values: Dict[str, str], user_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def get_platform_credentials(self, platform: str, user_id: str) -> Dict[str, str]:
        raise NotImplementedError

    @abstractmethod
    def clear_platform_credentials(self, platform: str, user_id: str) -> None:
        raise NotImplementedError


class EnvCredentialStore(CredentialStore):
    def get(self, platform: str, key: str, user_id: str | None = None) -> str | None:
        # user_id intentionally ignored for env-backed credentials
        return os.getenv(f"{platform.upper()}_{key.upper()}")

    def set_many(self, platform: str, values: Dict[str, str], user_id: str) -> None:
        raise RuntimeError("EnvCredentialStore is read-only. Configure a writable CredentialStore.")

    def get_platform_credentials(self, platform: str, user_id: str) -> Dict[str, str]:
        return {}

    def clear_platform_credentials(self, platform: str, user_id: str) -> None:
        raise RuntimeError("EnvCredentialStore is read-only. Configure a writable CredentialStore.")


class DictCredentialStore(CredentialStore):
    def __init__(self, data: Optional[Dict] = None):
        self.data = data or {}

    def get(self, platform: str, key: str, user_id: str | None = None) -> str | None:
        if user_id:
            user_scoped = (((self.data.get("users") or {}).get(user_id) or {}).get(platform) or {})
            if key in user_scoped:
                return user_scoped.get(key)
        return ((self.data.get("global") or {}).get(platform) or {}).get(key)

    def set_many(self, platform: str, values: Dict[str, str], user_id: str) -> None:
        self.data.setdefault("users", {}).setdefault(user_id, {}).setdefault(platform, {}).update(values)

    def get_platform_credentials(self, platform: str, user_id: str) -> Dict[str, str]:
        return dict((((self.data.get("users") or {}).get(user_id) or {}).get(platform) or {}))

    def clear_platform_credentials(self, platform: str, user_id: str) -> None:
        users = self.data.setdefault("users", {})
        user_bucket = users.setdefault(user_id, {})
        user_bucket.pop(platform, None)


class FileCredentialStore(CredentialStore):
    """
    Lightweight JSON-backed per-user credential store.
    Format:
    {
      "users": {
        "user-123": {
          "facebook": {"access_token": "...", "page_id": "..."}
        }
      }
    }
    """

    def __init__(self, file_path: str):
        self.file_path = pathlib.Path(file_path)
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        if not self.file_path.exists():
            self._write({"users": {}, "global": {}})

    def _read(self) -> Dict:
        try:
            return json.loads(self.file_path.read_text(encoding="utf-8") or "{}")
        except Exception:
            return {"users": {}, "global": {}}

    def _write(self, payload: Dict) -> None:
        self.file_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def get(self, platform: str, key: str, user_id: str | None = None) -> str | None:
        data = self._read()
        if user_id:
            user_scoped = (((data.get("users") or {}).get(user_id) or {}).get(platform) or {})
            if key in user_scoped:
                return user_scoped.get(key)
        return ((data.get("global") or {}).get(platform) or {}).get(key)

    def set_many(self, platform: str, values: Dict[str, str], user_id: str) -> None:
        with self._lock:
            data = self._read()
            data.setdefault("users", {}).setdefault(user_id, {}).setdefault(platform, {}).update(values)
            self._write(data)

    def get_platform_credentials(self, platform: str, user_id: str) -> Dict[str, str]:
        data = self._read()
        return dict((((data.get("users") or {}).get(user_id) or {}).get(platform) or {}))

    def clear_platform_credentials(self, platform: str, user_id: str) -> None:
        with self._lock:
            data = self._read()
            users = data.setdefault("users", {})
            user_bucket = users.setdefault(user_id, {})
            user_bucket.pop(platform, None)
            self._write(data)


def _build_default_store() -> CredentialStore:
    # Prefer file-backed credentials so users can OAuth-connect once and reuse.
    if os.getenv("WISERAVEN_CREDENTIAL_STORE", "").lower() == "env":
        return EnvCredentialStore()
    file_path = os.getenv("WISERAVEN_CREDENTIAL_FILE", ".wiseravenshare/credentials.json")
    return FileCredentialStore(file_path=file_path)


credentials: CredentialStore = _build_default_store()
