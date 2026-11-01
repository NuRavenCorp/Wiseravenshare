import torch
import torch.nn.functional as F

from model import GPT
from tokenizer import Tokenizer


def generate(
    model,
    tokenizer,
    prompt,
    max_new_tokens=100,
    temperature=0.7,
    top_k=50,
    top_p=0.9,
    device=None,
) -> str:
    if device is None:
        device = next(model.parameters()).device

    model.eval()

    ids = tokenizer.encode(prompt)
    x = torch.tensor([ids], dtype=torch.long, device=device)

    max_seq = getattr(model, "max_seq_len", None) or getattr(
        getattr(model, "config", None), "max_position_embeddings", None
    )
    eos_id = getattr(tokenizer, "eos_token_id", None)

    with torch.inference_mode():
        for _ in range(max_new_tokens):
            if max_seq is not None and x.size(1) >= max_seq:
                break
            x_cond = x

            out = model(x_cond)
            if isinstance(out, tuple):
                logits = out[0]
            elif hasattr(out, "logits"):
                logits = out.logits
            else:
                logits = out

            logits = logits[:, -1, :]

            if temperature <= 0:
                next_token = torch.argmax(logits, dim=-1, keepdim=True)
            else:
                logits = logits / temperature

                if top_k > 0:
                    v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                    logits = logits.masked_fill(logits < v[:, [-1]], -float("Inf"))

                if top_p < 1.0:
                    sorted_logits, sorted_indices = torch.sort(logits, descending=True)
                    cum = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)
                    sorted_remove = cum > top_p
                    sorted_remove[..., 1:] = sorted_remove[..., :-1].clone()
                    sorted_remove[..., 0] = False

                    remove_mask = torch.zeros_like(logits, dtype=torch.bool)
                    remove_mask.scatter_(1, sorted_indices, sorted_remove)
                    logits = logits.masked_fill(remove_mask, -float("Inf"))

                probs = F.softmax(logits, dim=-1)
                if not torch.isfinite(probs).all():
                    raise RuntimeError("all tokens filtered out; lower top_k / top_p")
                next_token = torch.multinomial(probs, num_samples=1)

            x = torch.cat([x, next_token], dim=-1)

            if eos_id is not None and next_token.item() == eos_id:
                break

    return tokenizer.decode(x[0].tolist())


if __name__ == "__main__":
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("Loading model checkpoint...")
    model = GPT.from_checkpoint("checkpoints/best_model.pt").to(device)
    model.eval()

    tokenizer = Tokenizer("tokenizer.json")

    prompt = "Deep learning is a subset of machine learning that"
    print(f"\nPrompt: {prompt}")
    output = generate(model, tokenizer, prompt, max_new_tokens=50, temperature=0.8, device=device)
    print(f"\nGenerated Output:\n{output}")
