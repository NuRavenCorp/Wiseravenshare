import uuid
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Tuple


class JobQueue(ABC):
    @abstractmethod
    def enqueue(self, job_type: str, payload: Dict[str, Any]) -> str:
        raise NotImplementedError

    @abstractmethod
    def dequeue(self) -> Optional[Tuple[str, str, Dict[str, Any]]]:
        raise NotImplementedError


class InMemoryQueue(JobQueue):
    def __init__(self):
        self._jobs = []

    def enqueue(self, job_type: str, payload: Dict[str, Any]) -> str:
        jid = str(uuid.uuid4())
        self._jobs.append((jid, job_type, payload))
        return jid

    def dequeue(self) -> Optional[Tuple[str, str, Dict[str, Any]]]:
        return self._jobs.pop(0) if self._jobs else None


queue: JobQueue = InMemoryQueue()
