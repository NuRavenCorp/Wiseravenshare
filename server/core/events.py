import logging
from collections import defaultdict
from typing import Any, Callable, DefaultDict, List

logger = logging.getLogger(__name__)


class EventBus:
    def __init__(self):
        self._subs: DefaultDict[str, List[Callable[[Any], None]]] = defaultdict(list)

    def on(self, topic: str, handler: Callable[[Any], None]):
        self._subs[topic].append(handler)

    def emit(self, topic: str, payload: Any):
        for handler in self._subs.get(topic, []):
            try:
                handler(payload)
            except Exception:
                logger.exception("Event handler failed on topic %s", topic)


bus = EventBus()
