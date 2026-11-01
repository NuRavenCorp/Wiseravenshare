import math
from dataclasses import dataclass

import torch
import torch.nn as nn


@dataclass
class LoRAConfig:
    rank: int = 8
    alpha: int = 16
    dropout: float = 0.05
    target_modules: tuple[str, ...] = ("qkv", "proj", "w1", "w2", "w3")


class LoRALinear(nn.Module):
    def __init__(self, base: nn.Linear, rank: int, alpha: int, dropout: float):
        super().__init__()
        self.base = base
        self.rank = rank
        self.alpha = alpha
        self.scaling = alpha / max(1, rank)
        self.dropout = nn.Dropout(dropout)

        for p in self.base.parameters():
            p.requires_grad = False

        self.lora_A = nn.Linear(base.in_features, rank, bias=False)
        self.lora_B = nn.Linear(rank, base.out_features, bias=False)
        nn.init.kaiming_uniform_(self.lora_A.weight, a=math.sqrt(5))
        nn.init.zeros_(self.lora_B.weight)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        base_out = self.base(x)
        lora_out = self.lora_B(self.lora_A(self.dropout(x))) * self.scaling
        return base_out + lora_out

    @torch.no_grad()
    def merge_(self) -> None:
        delta = torch.matmul(self.lora_B.weight, self.lora_A.weight) * self.scaling
        self.base.weight.add_(delta.to(self.base.weight.dtype))


def inject_lora(model: nn.Module, config: LoRAConfig) -> int:
    replaced = 0

    def _inject(module: nn.Module, prefix: str = "") -> None:
        nonlocal replaced
        for name, child in list(module.named_children()):
            full_name = f"{prefix}.{name}" if prefix else name
            if isinstance(child, nn.Linear) and any(target in full_name for target in config.target_modules):
                setattr(module, name, LoRALinear(child, config.rank, config.alpha, config.dropout))
                replaced += 1
            else:
                _inject(child, full_name)

    _inject(model)
    return replaced


def freeze_non_lora_parameters(model: nn.Module) -> None:
    for name, param in model.named_parameters():
        param.requires_grad = "lora_" in name


def lora_state_dict(model: nn.Module) -> dict[str, torch.Tensor]:
    return {name: p.detach().cpu() for name, p in model.named_parameters() if "lora_" in name}


def load_lora_state_dict(model: nn.Module, state: dict[str, torch.Tensor]) -> None:
    named = dict(model.named_parameters())
    for name, value in state.items():
        if name not in named:
            continue
        target = named[name]
        target.data.copy_(value.to(target.device, dtype=target.dtype))


def merge_lora_layers(model: nn.Module) -> None:
    for module in model.modules():
        if isinstance(module, LoRALinear):
            module.merge_()
