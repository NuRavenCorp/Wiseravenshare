import math


class PretrainingCosineSchedule:
    def __init__(self, warmup_steps: int, total_steps: int, max_lr: float, min_lr_ratio: float = 0.1):
        self.warmup_steps = max(1, warmup_steps)
        self.total_steps = max(1, total_steps)
        self.max_lr = max_lr
        self.min_lr_ratio = min_lr_ratio
        self.min_lr = max_lr * min_lr_ratio

    def at(self, step: int) -> float:
        if step < self.warmup_steps:
            alpha = float(step + 1) / float(self.warmup_steps)
            return self.max_lr * alpha

        if step >= self.total_steps:
            return self.min_lr

        decay_steps = max(1, self.total_steps - self.warmup_steps)
        current_decay_step = step - self.warmup_steps
        progress = float(current_decay_step) / float(decay_steps)
        cosine_decay = 0.5 * (1.0 + math.cos(math.pi * min(max(progress, 0.0), 1.0)))
        return self.min_lr + (self.max_lr - self.min_lr) * cosine_decay
