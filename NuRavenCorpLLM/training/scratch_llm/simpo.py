import torch
import torch.nn.functional as F


def _require_tensor(name: str, value: torch.Tensor) -> torch.Tensor:
    if not isinstance(value, torch.Tensor):
        raise TypeError(f"{name} must be a torch.Tensor")
    if value.numel() == 0:
        raise ValueError(f"{name} must be non-empty")
    if not torch.isfinite(value).all():
        raise ValueError(f"{name} contains non-finite values")
    return value


def simpo_loss(
    chosen_avg_logprobs: torch.Tensor,   # shape (B,)
    rejected_avg_logprobs: torch.Tensor, # shape (B,)
    beta: float = 2.0,
    gamma: float = 1.0,
) -> torch.Tensor:
    """
    SimPO loss from Meng et al., NeurIPS 2024 (arXiv:2405.14734).

    L = -log sigmoid( beta * (avg_logp_chosen - avg_logp_rejected) - gamma )

    No reference model is used.
    """
    chosen_avg_logprobs = _require_tensor("chosen_avg_logprobs", chosen_avg_logprobs)
    rejected_avg_logprobs = _require_tensor("rejected_avg_logprobs", rejected_avg_logprobs)

    if chosen_avg_logprobs.ndim != 1 or rejected_avg_logprobs.ndim != 1:
        raise ValueError("chosen and rejected logprobs must be rank-1 tensors shaped (B,)")
    if chosen_avg_logprobs.shape != rejected_avg_logprobs.shape:
        raise ValueError("chosen and rejected logprobs must have the same shape")
    if beta <= 0:
        raise ValueError("beta must be > 0")
    if not torch.isfinite(torch.tensor([gamma], device=chosen_avg_logprobs.device)).all():
        raise ValueError("gamma must be finite")

    chosen = chosen_avg_logprobs.float()
    rejected = rejected_avg_logprobs.float()
    logits = beta * (chosen - rejected) - gamma
    loss = -F.logsigmoid(logits).mean()
    if not torch.isfinite(loss):
        raise ValueError("simpo loss produced a non-finite value")
    return loss


def avg_sequence_logprob(
    per_token_logprobs: torch.Tensor,  # shape (B, T)
    response_mask: torch.Tensor,       # shape (B, T), 1 on response tokens, 0 elsewhere
) -> torch.Tensor:
    """
    Converts per-token log-probs into per-sequence average log-prob.
    SimPO uses the average (not sum) to avoid penalizing long responses.
    """
    per_token_logprobs = _require_tensor("per_token_logprobs", per_token_logprobs)
    response_mask = _require_tensor("response_mask", response_mask)

    if per_token_logprobs.ndim != 2 or response_mask.ndim != 2:
        raise ValueError("per_token_logprobs and response_mask must be rank-2 tensors shaped (B, T)")
    if per_token_logprobs.shape != response_mask.shape:
        raise ValueError("per_token_logprobs and response_mask must have the same shape")

    per_token = per_token_logprobs.float()
    mask = (response_mask > 0).float()
    n_tokens = mask.sum(dim=-1).clamp_min(1.0)
    avg = (per_token * mask).sum(dim=-1) / n_tokens

    if not torch.isfinite(avg).all():
        raise ValueError("avg sequence logprob contains non-finite values")
    return avg

