"""
RAG（检索增强生成）服务模块

核心编排逻辑：
1. 接收用户问题
2. 如果指定了文档，从向量数据库中检索相关片段（Retrieve）
3. 将检索到的内容拼接为上下文，注入到系统提示词中
4. 调用 Ollama 大模型生成回答（Generate）

支持两种模式：
- RAG 模式：基于知识库文档的问答（有 document_ids 时）
- 普通对话模式：不依赖文档的通用问答
"""

from typing import AsyncGenerator, Optional, List, Dict, Tuple

from app.core.ollama import ollama_service
from app.core.vectorstore import vector_store
from app.config import settings


# RAG 模式的系统提示词模板，{context} 会被替换为检索到的文档片段
RAG_SYSTEM_PROMPT = """你是一个知识库助手。请根据以下参考资料回答用户问题。
如果参考资料中没有相关信息，请明确告知用户"根据现有资料，我无法找到相关信息"。
回答时请保持准确、简洁，并尽可能引用参考资料中的内容。
{kb_description}
## 参考资料
{context}"""

# 普通对话模式的系统提示词（无文档上下文）
PLAIN_CHAT_SYSTEM_PROMPT = """你是 Atlas 智能助手，可以回答各种问题。
请保持回答准确、简洁、有帮助。如果用户需要基于文档的问答，请提示用户在设置中选择知识库文档。"""


class RAGService:
    """RAG（检索增强生成）服务，协调向量检索和大模型生成。"""

    def __init__(self):
        self.vector_store = vector_store
        self.ollama = ollama_service

    async def retrieve(
        self,
        query: str,
        top_k: Optional[int] = None,
        document_ids: Optional[List[str]] = None,
    ) -> List[Dict]:
        """
        从向量数据库中检索与查询语义最相似的文档片段。

        Args:
            query: 用户查询文本
            top_k: 返回的最相似片段数量，默认取配置值
            document_ids: 限定检索范围的文档 ID 列表
        """
        return await self.vector_store.search(
            query=query,
            top_k=top_k or settings.retrieval_top_k,
            filter_document_ids=document_ids,
        )

    def build_context(self, retrieved_chunks: List[Dict]) -> str:
        """
        将检索到的文档片段拼接为格式化的上下文字符串，
        用于注入到 RAG 系统提示词中。
        """
        if not retrieved_chunks:
            return "（无相关参考资料）"

        context_parts = []
        for i, chunk in enumerate(retrieved_chunks, 1):
            content = chunk["content"]
            metadata = chunk.get("metadata", {})
            doc_id = metadata.get("document_id", "unknown")
            chunk_idx = metadata.get("chunk_index", "?")

            # 格式：[序号] (来源文档和片段编号) + 内容
            context_parts.append(f"[{i}] (文档: {doc_id[:8]}..., 片段: {chunk_idx})\n{content}")

        return "\n\n".join(context_parts)

    def build_messages(
        self,
        query: str,
        history_messages: List[Dict],
    ) -> List[Dict]:
        """
        构建符合 OpenAI /v1/chat/completions 格式的消息数组。

        将历史对话记录和当前用户问题按角色（user/assistant）组装，
        截取最近 max_history_messages 条记录以控制上下文长度。
        """
        messages = []

        # 添加最近的历史消息（按角色保留）
        for msg in history_messages[-settings.max_history_messages:]:
            messages.append({
                "role": msg["role"],
                "content": msg["content"],
            })

        # 追加当前用户问题
        messages.append({"role": "user", "content": query})

        return messages

    async def generate_stream(
        self,
        query: str,
        history_messages: Optional[List[Dict]] = None,
        document_ids: Optional[List[str]] = None,
        model: Optional[str] = None,
        kb_descriptions: Optional[List[str]] = None,
        kb_map: Optional[Dict[str, Dict]] = None,
    ) -> AsyncGenerator[Dict, None]:
        """
        流式生成回答。

        根据是否提供 document_ids 自动切换 RAG/普通对话模式：
        - 有 document_ids → 先检索相关片段，注入上下文后生成
        - 无 document_ids → 直接使用通用系统提示词生成

        Yields:
            字典 {"content": "...", "reasoning": "..."} 或 {"references": [...]}
        """
        history_messages = history_messages or []

        # 构建包含历史记录的消息数组
        messages = self.build_messages(query, history_messages)

        retrieved_chunks = []
        if document_ids:
            # RAG 模式：检索相关文档片段并构建上下文
            retrieved_chunks = await self.retrieve(
                query=query,
                document_ids=document_ids,
            )
            context = self.build_context(retrieved_chunks)
            # 构建知识库背景描述段落
            kb_desc_section = ""
            if kb_descriptions:
                kb_desc_section = "\n## 知识库背景\n" + "\n".join(kb_descriptions) + "\n"
            system_prompt = RAG_SYSTEM_PROMPT.format(
                context=context,
                kb_description=kb_desc_section,
            )
        else:
            # 普通对话模式
            system_prompt = PLAIN_CHAT_SYSTEM_PROMPT

        # 调用 Ollama 模型进行流式生成
        async for chunk in self.ollama.chat_stream(
            messages=messages,
            system_prompt=system_prompt,
            model=model,
        ):
            yield chunk

        # 流结束后 yield 引用索引信息
        if retrieved_chunks and kb_map:
            references = []
            for chunk in retrieved_chunks:
                metadata = chunk.get("metadata", {})
                doc_id = metadata.get("document_id", "")
                doc_info = kb_map.get(doc_id, {})
                references.append({
                    "knowledge_base_id": doc_info.get("knowledge_base_id", ""),
                    "knowledge_base_name": doc_info.get("knowledge_base_name", ""),
                    "document_id": doc_id,
                    "filename": metadata.get("filename", ""),
                    "chunk_index": metadata.get("chunk_index", 0),
                    "distance": chunk.get("distance", 0),
                })
            yield {"references": references}

    async def generate(
        self,
        query: str,
        history_messages: Optional[List[Dict]] = None,
        document_ids: Optional[List[str]] = None,
        model: Optional[str] = None,
    ) -> Tuple[Dict[str, str], List[Dict]]:
        """
        非流式生成回答（一次性返回完整结果）。

        Returns:
            (回答内容字典, 检索到的文档片段列表)
        """
        history_messages = history_messages or []
        retrieved_chunks = []

        messages = self.build_messages(query, history_messages)

        if document_ids:
            # RAG 模式
            retrieved_chunks = await self.retrieve(
                query=query,
                document_ids=document_ids,
            )
            context = self.build_context(retrieved_chunks)
            system_prompt = RAG_SYSTEM_PROMPT.format(context=context)
        else:
            # 普通对话模式
            system_prompt = PLAIN_CHAT_SYSTEM_PROMPT

        response = await self.ollama.chat(
            messages=messages,
            system_prompt=system_prompt,
            model=model,
        )

        return response, retrieved_chunks


# 全局单例实例
rag_service = RAGService()
