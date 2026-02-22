from typing import AsyncGenerator, Optional, List, Dict, Tuple

from app.core.ollama import ollama_service
from app.core.vectorstore import vector_store
from app.config import settings


RAG_SYSTEM_PROMPT = """你是一个知识库助手。请根据以下参考资料回答用户问题。
如果参考资料中没有相关信息，请明确告知用户"根据现有资料，我无法找到相关信息"。
回答时请保持准确、简洁，并尽可能引用参考资料中的内容。

## 参考资料
{context}"""

PLAIN_CHAT_SYSTEM_PROMPT = """你是 Atlas 智能助手，可以回答各种问题。
请保持回答准确、简洁、有帮助。如果用户需要基于文档的问答，请提示用户在设置中选择知识库文档。"""


class RAGService:
    """RAG (Retrieval Augmented Generation) service."""

    def __init__(self):
        self.vector_store = vector_store
        self.ollama = ollama_service

    async def retrieve(
        self,
        query: str,
        top_k: Optional[int] = None,
        document_ids: Optional[List[str]] = None,
    ) -> List[Dict]:
        """Retrieve relevant document chunks for a query."""
        return await self.vector_store.search(
            query=query,
            top_k=top_k or settings.retrieval_top_k,
            filter_document_ids=document_ids,
        )

    def build_context(self, retrieved_chunks: List[Dict]) -> str:
        """Build context string from retrieved chunks."""
        if not retrieved_chunks:
            return "（无相关参考资料）"

        context_parts = []
        for i, chunk in enumerate(retrieved_chunks, 1):
            content = chunk["content"]
            metadata = chunk.get("metadata", {})
            doc_id = metadata.get("document_id", "unknown")
            chunk_idx = metadata.get("chunk_index", "?")

            context_parts.append(f"[{i}] (文档: {doc_id[:8]}..., 片段: {chunk_idx})\n{content}")

        return "\n\n".join(context_parts)

    def build_messages(
        self,
        query: str,
        history_messages: List[Dict],
    ) -> List[Dict]:
        """
        Build proper messages array with conversation history.
        Like /v1/chat/completions format:
        [
            {"role": "user", "content": "..."},
            {"role": "assistant", "content": "..."},
            {"role": "user", "content": "current query"},
        ]
        """
        messages = []

        # Add recent history as proper role-based messages
        for msg in history_messages[-settings.max_history_messages:]:
            messages.append({
                "role": msg["role"],
                "content": msg["content"],
            })

        # Add current user query
        messages.append({"role": "user", "content": query})

        return messages

    async def generate_stream(
        self,
        query: str,
        history_messages: Optional[List[Dict]] = None,
        document_ids: Optional[List[str]] = None,
        model: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, str], None]:
        """
        Generate streaming response. Uses RAG when document_ids provided,
        otherwise plain chat. History is sent as proper messages array.
        Yields dicts: {"content": "...", "reasoning": "..."}
        """
        history_messages = history_messages or []

        # Build messages array with history (like /v1/chat/completions)
        messages = self.build_messages(query, history_messages)

        if document_ids:
            # RAG mode: retrieve from selected documents, inject context into system prompt
            retrieved_chunks = await self.retrieve(
                query=query,
                document_ids=document_ids,
            )
            context = self.build_context(retrieved_chunks)
            system_prompt = RAG_SYSTEM_PROMPT.format(context=context)
        else:
            # Plain chat mode
            system_prompt = PLAIN_CHAT_SYSTEM_PROMPT

        async for chunk in self.ollama.chat_stream(
            messages=messages,
            system_prompt=system_prompt,
            model=model,
        ):
            yield chunk

    async def generate(
        self,
        query: str,
        history_messages: Optional[List[Dict]] = None,
        document_ids: Optional[List[str]] = None,
        model: Optional[str] = None,
    ) -> Tuple[Dict[str, str], List[Dict]]:
        """
        Generate non-streaming response. Uses RAG when document_ids provided,
        otherwise plain chat. History is sent as proper messages array.
        Returns ({"content": "...", "reasoning": "..."}, retrieved_chunks)
        """
        history_messages = history_messages or []
        retrieved_chunks = []

        # Build messages array with history
        messages = self.build_messages(query, history_messages)

        if document_ids:
            # RAG mode
            retrieved_chunks = await self.retrieve(
                query=query,
                document_ids=document_ids,
            )
            context = self.build_context(retrieved_chunks)
            system_prompt = RAG_SYSTEM_PROMPT.format(context=context)
        else:
            # Plain chat mode
            system_prompt = PLAIN_CHAT_SYSTEM_PROMPT

        response = await self.ollama.chat(
            messages=messages,
            system_prompt=system_prompt,
            model=model,
        )

        return response, retrieved_chunks


# Singleton instance
rag_service = RAGService()
