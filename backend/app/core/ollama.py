"""
Ollama 模型服务模块

封装与本地 Ollama 服务的交互，提供：
- 文本向量化（embedding）：将文本转换为向量表示
- 对话生成（chat）：调用大模型进行文本生成
- 模型管理：查询可用模型列表、检查连接状态

使用 OpenAI 兼容的 /v1/chat/completions 接口进行对话，
以支持流式输出和思考过程（reasoning）的分离。
"""

import json
from typing import AsyncGenerator, Optional, List, Dict
from ollama import AsyncClient
import httpx

from app.config import settings


class OllamaService:
    """Ollama 模型服务，统一管理对话生成和文本向量化。"""

    def __init__(self):
        # 官方 Ollama Python 客户端（用于 embedding 和模型管理）
        self.client = AsyncClient(
            host=settings.ollama_base_url,
            timeout=httpx.Timeout(timeout=300.0, connect=10.0),
        )
        self.base_url = settings.ollama_base_url
        self.chat_model = settings.ollama_chat_model
        self.embedding_model = settings.ollama_embedding_model
        # httpx 客户端（用于 OpenAI 兼容接口的流式对话）
        self._http_client = httpx.AsyncClient(
            base_url=settings.ollama_base_url,
            timeout=httpx.Timeout(timeout=300.0, connect=10.0),
        )

    async def generate_embedding(self, text: str) -> List[float]:
        """将单条文本转换为向量表示。"""
        response = await self.client.embed(
            model=self.embedding_model,
            input=text,
        )
        return response.embeddings[0]

    async def generate_embeddings(self, texts: List[str], batch_size: int = 50) -> List[List[float]]:
        """
        批量将多条文本转换为向量表示。

        为避免单次请求过大导致 Ollama 超时或内存溢出，
        自动按 batch_size 分批发送请求。
        """
        all_embeddings: List[List[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = await self.client.embed(
                model=self.embedding_model,
                input=batch,
            )
            all_embeddings.extend(response.embeddings)
        return all_embeddings

    async def chat_stream(
        self,
        messages: List[Dict],
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, str], None]:
        """
        流式对话生成（通过 OpenAI 兼容接口 /v1/chat/completions）。

        逐块返回模型输出，支持分离「回答内容」和「思考过程」。

        Yields:
            字典 {"content": "回答片段", "reasoning": "思考过程片段"}
        """
        # 构建消息列表：系统提示词 + 对话历史
        chat_messages = []
        if system_prompt:
            chat_messages.append({"role": "system", "content": system_prompt})
        chat_messages.extend(messages)

        payload = {
            "model": model or self.chat_model,
            "messages": chat_messages,
            "stream": True,
        }

        # 使用 httpx 流式请求 OpenAI 兼容接口
        async with self._http_client.stream(
            "POST",
            "/v1/chat/completions",
            json=payload,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                # SSE 格式：每行以 "data: " 开头
                if not line.startswith("data: "):
                    continue
                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    data = json.loads(data_str)
                    delta = data.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")
                    # 兼容不同模型的思考过程字段名
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
        非流式对话生成（一次性返回完整结果）。

        Returns:
            字典 {"content": "完整回答", "reasoning": "完整思考过程"}
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
        """
        查询 Ollama 中可用的对话模型列表。
        自动排除嵌入模型（embedding），只返回可用于对话的模型。
        """
        try:
            result = await self.client.list()
            # 用于识别嵌入模型的关键词
            embedding_keywords = ['embed', 'embedding', 'bge-', 'nomic-embed']
            models = []
            for m in result.models:
                name_lower = m.model.lower()
                # 跳过嵌入模型
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
        """检查 Ollama 服务是否可用。"""
        try:
            await self.client.list()
            return True
        except Exception:
            return False

    async def check_models(self) -> Dict[str, bool]:
        """检查所需的对话模型和嵌入模型是否已下载到本地。"""
        try:
            models = await self.client.list()
            model_names = [m.model for m in models.models]
            return {
                "chat_model": any(self.chat_model in name for name in model_names),
                "embedding_model": any(self.embedding_model in name for name in model_names),
            }
        except Exception:
            return {"chat_model": False, "embedding_model": False}


# 全局单例实例
ollama_service = OllamaService()
