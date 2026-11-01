import requests


url = "http://127.0.0.1:8000/stream"
data = {
    "prompt": "Artificial intelligence will transform the world by",
    "max_new_tokens": 50,
    "temperature": 0.8,
}

response = requests.post(url, json=data, stream=True, timeout=120)
response.raise_for_status()

print("Prompt Response: ", end="", flush=True)
for line in response.iter_lines():
    if not line:
        continue
    decoded_line = line.decode("utf-8", errors="replace")
    if decoded_line.startswith("data: "):
        token_text = decoded_line.replace("data: ", "", 1)
        print(token_text, end="", flush=True)
print()
