import os
from typing import Dict, List

import requests


class LLMGenerator:
    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("GROQ_API_KEY is missing.")
        self.api_key = api_key
        self.url = "https://api.groq.com/openai/v1/chat/completions"
        self.model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
        self.debug = os.getenv("GROQ_DEBUG", "0") == "1"

    def generate(self, question: str, contexts: List[Dict[str, str | float]]) -> str:
        if not contexts:
            return "Not found in references."

        context_text = "\n".join(str(item["text"]) for item in contexts if "text" in item)
        if not context_text.strip():
            return "Not found in references."

        grounding_instruction = (
            "Answer strictly using the provided context.\n"
            "If the answer is not explicitly present, respond:\n"
            "'Not found in references.'"
        )

        payload = {
            "model": self.model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": grounding_instruction},
                {
                    "role": "user",
                    "content": f"Context:\n{context_text}\n\nQuestion: {question}",
                },
            ],
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(self.url, headers=headers, json=payload, timeout=30)
            if response.status_code >= 400:
                if self.debug:
                    print(f"[GROQ_DEBUG] HTTP {response.status_code}: {response.text}")
                return "Not found in references."

            data = response.json()
            choices = data.get("choices", [])
            if not choices:
                return "Not found in references."

            message = choices[0].get("message", {})
            answer = str(message.get("content", "")).strip()
            return answer if answer else "Not found in references."
        except requests.RequestException as error:
            if self.debug:
                print(f"[GROQ_DEBUG] Request error: {error}")
            return "Not found in references."
        except ValueError as error:
            if self.debug:
                print(f"[GROQ_DEBUG] JSON parse error: {error}")
            return "Not found in references."
