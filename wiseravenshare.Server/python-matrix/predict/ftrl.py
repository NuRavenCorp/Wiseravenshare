from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass


@dataclass
class FTRLConfig:
    alpha: float = 0.1
    beta: float = 1.0
    l1: float = 0.1
    l2: float = 1.0


class FTRLModel:
    def __init__(self, config: FTRLConfig | None = None):
        self.cfg = config or FTRLConfig()
        self.z: dict[str, float] = {}
        self.n: dict[str, float] = {}

    def weight(self, key: str) -> float:
        z = self.z.get(key, 0.0)
        n = self.n.get(key, 0.0)
        if abs(z) <= self.cfg.l1:
            return 0.0
        sign = 1.0 if z >= 0.0 else -1.0
        return (-(z - sign * self.cfg.l1)) / (
            (self.cfg.beta + math.sqrt(n)) / self.cfg.alpha + self.cfg.l2
        )

    def predict_proba(self, features: dict[str, float]) -> float:
        weighted_sum = sum(self.weight(k) * v for k, v in features.items())
        return self._sigmoid(weighted_sum)

    def explain(self, features: dict[str, float], top_k: int = 5) -> list[tuple[str, float]]:
        contributions = [(k, self.weight(k) * v) for k, v in features.items() if v != 0.0]
        contributions.sort(key=lambda item: -abs(item[1]))
        return contributions[:top_k]

    def update(self, features: dict[str, float], label: int, sample_weight: float = 1.0) -> float:
        p = self.predict_proba(features)
        gradient = (p - label) * sample_weight
        loss = -(
            label * math.log(p + 1e-12) + (1 - label) * math.log(1 - p + 1e-12)
        ) * sample_weight

        for key, value in features.items():
            if value == 0.0:
                continue
            prev_n = self.n.get(key, 0.0)
            sigma = (math.sqrt(prev_n + gradient * gradient) - math.sqrt(prev_n)) / self.cfg.alpha
            self.z[key] = self.z.get(key, 0.0) + gradient * value - sigma * self.weight(key)
            self.n[key] = prev_n + (gradient * value) ** 2

        return loss

    def save(self, path: str) -> None:
        with open(path, "w", encoding="utf-8") as handle:
            json.dump({"z": self.z, "n": self.n, "cfg": asdict(self.cfg)}, handle)

    def load(self, path: str) -> None:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        self.z = data["z"]
        self.n = data["n"]
        self.cfg = FTRLConfig(**data["cfg"])

    @staticmethod
    def _sigmoid(value: float) -> float:
        if value >= 0:
            z = math.exp(-value)
            return 1.0 / (1.0 + z)
        z = math.exp(value)
        return z / (1.0 + z)
