import json
from typing import AsyncGenerator, Optional, List, Dict
from ollama import AsyncClient
import httpx

from app.config import settings


class OllamaService:
    def __init__(self):
        self.client = AsyncClient(
            host=settings.ollama_base_url,
            timeout=httpx.Timeout(timeout=300.0, connect=10.0),
        )
        self.base_url = settings.ollama_base_url
        self.chat_model = settings.ollama_chat_model
        self.embedding_model = settings.ollama_embedding_model
        self._http_client = httpx.AsyncClient(
            base_url=settings.ollama_base_url,
            timeout=httpx.Timeout(timeout=300.0, connect=10.0),
        )

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for a single text."""
        response = await self.client.embed(
            model=self.embedding_model,
            input=text,
        )
        return response.embeddings[0]

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts."""
        response = await self.client.embed(
            model=self.embedding_model,
            input=texts,
        )
        return response.embeddings

    async def chat_stream(
        self,
        messages: List[Dict],
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, str], None]:
        """
        Stream chat via /v1/chat/completions (OpenAI-compatible).
        Yields dicts: {"content": "...", "reasoning": "..."}
        """
        chat_messages = []
        if system_prompt:
            chat_messages.append({"role": "system", "content": system_prompt})
        chat_messages.extend(messages)

        payload = {
            "model": model or self.chat_model,
            "messages": chat_messages,
            "stream": True,
        }

        async with self._http_client.stream(
            "POST",
            "/v1/chat/completions",
            json=payload,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    data = json.loads(data_str)
                    delta = data.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")
                    reasoning = delta.get("reasoning", "") or delta.get("reasoning_content", "")
                    if content or reasoning:
                        yield {"content": content, "reasoning": reasoning}
                except (json.JSONDecodeError, IndexError, KeyError):
                    continue

    async def chat(
        self,
        messages: List[Dict],
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, str]:
        """
        Non-streaming chat via /v1/chat/completions.
        Returns {"content": "...", "reasoning": "..."}
        """
        chat_messages = []
        if system_prompt:
            chat_messages.append({"role": "system", "content": system_prompt})
        chat_messages.extend(messages)

        payload = {
            "model": model or self.chat_model,
            "messages": chat_messages,
            "stream": False,
        }

        response = await self._http_client.post(
            "/v1/chat/completions",
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
        choice = data.get("choices", [{}])[0].get("message", {})
        return {
            "content": choice.get("content", ""),
            "reasoning": choice.get("reasoning", "") or choice.get("reasoning_content", ""),
        }

    async def list_models(self) -> List[Dict]:
        """List available Ollama chat models (exclude embedding models)."""
        try:
            result = await self.client.list()
            embedding_keywords = ['embed', 'embedding', 'bge-', 'nomic-embed']
            models = []
            for m in result.models:
                name_lower = m.model.lower()
                if any(kw in name_lower for kw in embedding_keywords):
                    continue
                models.append({
                    "name": m.model,
                    "size": m.size,
                    "modified_at": str(m.modified_at) if m.modified_at else None,
                })
            return models
        except Exception:
            return []

    async def check_connection(self) -> bool:
        """Check if Ollama is available."""
        try:
            await self.client.list()
            return True
        except Exception:
            return False

    async def check_models(self) -> Dict[str, bool]:
        """Check if required models are available."""
        try:
            models = await self.client.list()
            model_names = [m.model for m in models.models]
            return {
                "chat_model": any(self.chat_model in name for name in model_names),
                "embedding_model": any(self.embedding_model in name for name in model_names),
            }
        except Exception:
            return {"chat_model": False, "embedding_model": False}


# Singleton instance
ollama_service = OllamaService()
