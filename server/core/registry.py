from typing import Callable, Dict, Type

from wiseravenshare.server.platforms.base import BasePlatform


class PlatformRegistry:
    def __init__(self):
        self._classes: Dict[str, Type[BasePlatform]] = {}
        self._factories: Dict[str, Callable[..., BasePlatform]] = {}

    def register(self, name: str, cls: Type[BasePlatform]):
        self._classes[name] = cls

    def register_factory(self, name: str, factory: Callable[..., BasePlatform]):
        self._factories[name] = factory

    def create(self, name: str, **kwargs) -> BasePlatform:
        if name in self._factories:
            return self._factories[name](**kwargs)
        if name in self._classes:
            return self._classes[name](**kwargs)
        raise KeyError(f"Platform not registered: {name}")

    def names(self):
        return sorted(set(self._classes) | set(self._factories))

    def get_class(self, name: str):
        return self._classes.get(name)


registry = PlatformRegistry()


def register_platform(name: str):
    def wrap(cls):
        registry.register(name, cls)
        return cls

    return wrap
