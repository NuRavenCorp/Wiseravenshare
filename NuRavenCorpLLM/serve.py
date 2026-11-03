import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_DIR = "./quadro_fineweb_output/final"
DEVICE = "cpu"

tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
model = AutoModelForCausalLM.from_pretrained(MODEL_DIR).to(DEVICE)
model.eval()

app = FastAPI()


class GenerateRequest(BaseModel):
    prompt: str
    max_new_tokens: int = 60
    temperature: float = 0.7


@app.post("/generate")
def generate(req: GenerateRequest):
    with torch.no_grad():
        inputs = tokenizer(req.prompt, return_tensors="pt").to(DEVICE)
        output = model.generate(
            **inputs,
            max_new_tokens=req.max_new_tokens,
            do_sample=True,
            temperature=req.temperature,
            pad_token_id=tokenizer.eos_token_id,
        )
    text = tokenizer.decode(output[0], skip_special_tokens=True)
    return {"text": text}
