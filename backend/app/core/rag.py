"""
RAG（检索增强生成）服务模块

核心编排逻辑：
1. 接收用户问题
2. 可选：查询改写（LLM 优化检索语句）
3. 如果指定了文档，从向量数据库中检索相关片段（Retrieve）
   - 支持层级化检索（summary → chunk 两阶段）
   - 支持混合检索（向量语义 + BM25 关键词融合）
4. 可选：检索后重排序（LLM 精排）
5. 上下文扩展（拉取相邻片段补充上下文）
6. 将检索到的内容拼接为上下文，注入到系统提示词中
7. 调用 Ollama 大模型生成回答（Generate）

支持两种模式：
- RAG 模式：基于知识库文档的问答（有 document_ids 时）
- 普通对话模式：不依赖文档的通用问答
"""

import logging
from typing import AsyncGenerator, Optional, List, Dict, Tuple

from app.core.ollama import ollama_service
from app.core.vectorstore import vector_store
from app.config import settings

logger = logging.getLogger(__name__)


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

# 查询改写提示词
QUERY_REWRITE_PROMPT = """请将用户的问题改写为更适合语义检索的查询语句。要求：
1. 保持原意，但使表述更明确、更具体
2. 如果是复合问题，拆分为多个独立的检索语句，用换行分隔
3. 去除口语化表达，使用关键术语
4. 只输出改写后的查询语句，不要输出其他内容

用户问题：{query}"""

# 重排序提示词
RERANK_PROMPT = """请对以下检索结果按照与用户问题的相关性进行打分（0-10分），10分最相关。
只输出每个结果的编号和分数，格式为"编号:分数"，每行一个，不要输出其他内容。

用户问题：{query}

检索结果：
{results}"""


class RAGService:
    """RAG（检索增强生成）服务，协调向量检索和大模型生成。"""

    def __init__(self):
        self.vector_store = vector_store
        self.ollama = ollama_service

    async def _rewrite_query(self, query: str) -> List[str]:
        """
        调用 LLM 改写用户查询，提升检索召回率。

        将模糊问题改写为更精确的检索语句，复合问题拆分为多个子查询。

        Returns:
            改写后的查询列表（可能包含多个子查询）
        """
        try:
            prompt = QUERY_REWRITE_PROMPT.format(query=query)
            response = await self.ollama.chat(
                messages=[{"role": "user", "content": prompt}],
            )
            rewritten = response.get("content", "").strip()
            if not rewritten:
                return [query]
            # 按换行拆分为多个子查询
            queries = [q.strip() for q in rewritten.split("\n") if q.strip()]
            return queries if queries else [query]
        except Exception as e:
            logger.warning(f"Query rewrite failed: {e}")
            return [query]

    async def _bm25_search(
        self,
        query: str,
        document_ids: Optional[List[str]] = None,
    ) -> List[Dict]:
        """
        BM25 关键词检索。

        使用 jieba 分词 + rank_bm25 库对文档语料进行关键词匹配，
        擅长精确关键词匹配，与向量语义检索互补。

        Returns:
            按 BM25 分数排序的片段列表
        """
        try:
            import jieba
            from rank_bm25 import BM25Okapi
        except ImportError:
            logger.warning("rank_bm25 or jieba not installed, skipping BM25 search")
            return []

        # 获取所有候选片段
        all_chunks = self.vector_store.get_all_chunks_text(
            filter_document_ids=document_ids
        )
        if not all_chunks:
            return []

        # jieba 分词构建语料库
        tokenized_corpus = [list(jieba.cut(c["content"])) for c in all_chunks]
        bm25 = BM25Okapi(tokenized_corpus)

        # 对查询分词并计算 BM25 分数
        tokenized_query = list(jieba.cut(query))
        scores = bm25.get_scores(tokenized_query)

        # 按分数排序
        scored_chunks = []
        for i, score in enumerate(scores):
            if score > 0:
                chunk = all_chunks[i].copy()
                chunk["bm25_score"] = float(score)
                scored_chunks.append(chunk)

        scored_chunks.sort(key=lambda x: x["bm25_score"], reverse=True)
        return scored_chunks

    async def _hybrid_search(
        self,
        query: str,
        top_k: int,
        document_ids: Optional[List[str]] = None,
    ) -> List[Dict]:
        """
        混合检索：向量语义检索 + BM25 关键词检索，通过 RRF 融合排序。

        RRF（Reciprocal Rank Fusion）公式：
        score = (1 - bm25_weight) / (k + rank_vector) + bm25_weight / (k + rank_bm25)
        """
        bm25_weight = settings.bm25_weight

        # 并行执行向量检索和 BM25 检索
        vector_results = await self.vector_store.search(
            query=query,
            top_k=top_k * 3,  # 粗筛取更多结果
            filter_document_ids=document_ids,
        )
        bm25_results = await self._bm25_search(query, document_ids)

        if not bm25_results:
            return vector_results[:top_k]

        # 构建唯一标识 → 排名映射
        def _chunk_key(chunk: Dict) -> str:
            meta = chunk.get("metadata", {})
            return f"{meta.get('document_id', '')}_{meta.get('chunk_index', '')}"

        vector_rank = {_chunk_key(r): rank + 1 for rank, r in enumerate(vector_results)}
        bm25_rank = {_chunk_key(r): rank + 1 for rank, r in enumerate(bm25_results)}

        # RRF 融合
        k = 60  # RRF 常数
        all_keys = set(vector_rank.keys()) | set(bm25_rank.keys())
        default_v = len(vector_results) + 100
        default_b = len(bm25_results) + 100

        rrf_scores = {}
        for key in all_keys:
            v_rank = vector_rank.get(key, default_v)
            b_rank = bm25_rank.get(key, default_b)
            rrf_scores[key] = (
                (1 - bm25_weight) / (k + v_rank) + bm25_weight / (k + b_rank)
            )

        # 构建结果查找表
        result_lookup: Dict[str, Dict] = {}
        for r in vector_results:
            result_lookup[_chunk_key(r)] = r
        for r in bm25_results:
            key = _chunk_key(r)
            if key not in result_lookup:
                result_lookup[key] = {
                    "content": r["content"],
                    "metadata": r.get("metadata", {}),
                    "distance": 1.0,
                }

        # 按 RRF 分数排序
        sorted_keys = sorted(rrf_scores.keys(), key=lambda x: -rrf_scores[x])
        return [result_lookup[k] for k in sorted_keys[:top_k] if k in result_lookup]

    async def _rerank(
        self,
        query: str,
        chunks: List[Dict],
        top_k: int,
    ) -> List[Dict]:
        """
        调用 LLM 对检索结果进行重排序。

        初始向量检索粗筛 Top-N，LLM 对结果评分，取 Top-K 最相关的片段。
        """
        if len(chunks) <= top_k:
            return chunks

        try:
            # 构建检索结果文本
            results_text = ""
            for i, chunk in enumerate(chunks):
                content_preview = chunk["content"][:200]
                results_text += f"[{i+1}] {content_preview}\n\n"

            prompt = RERANK_PROMPT.format(query=query, results=results_text)
            response = await self.ollama.chat(
                messages=[{"role": "user", "content": prompt}],
            )

            # 解析 LLM 返回的分数
            scores_text = response.get("content", "")
            scores: Dict[int, float] = {}
            for line in scores_text.strip().split("\n"):
                line = line.strip()
                if ":" in line:
                    try:
                        parts = line.split(":")
                        idx = int(parts[0].strip()) - 1  # 转为 0-indexed
                        score = float(parts[1].strip())
                        if 0 <= idx < len(chunks):
                            scores[idx] = score
                    except (ValueError, IndexError):
                        continue

            # 按分数重排序
            if scores:
                scored = [(i, scores.get(i, 0)) for i in range(len(chunks))]
                scored.sort(key=lambda x: -x[1])
                return [chunks[i] for i, _ in scored[:top_k]]

        except Exception as e:
            logger.warning(f"Reranking failed: {e}")

        return chunks[:top_k]

    def _expand_context(self, chunks: List[Dict]) -> List[Dict]:
        """
        上下文扩展：为每个检索命中的片段拉取相邻片段，合并为更完整的上下文。

        合并逻辑：将 chunk_index-1、chunk_index、chunk_index+1 的内容拼接，
        同时去重避免重复片段。
        """
        expanded = []
        seen_keys = set()

        for chunk in chunks:
            metadata = chunk.get("metadata", {})
            doc_id = metadata.get("document_id", "")
            chunk_idx = metadata.get("chunk_index", -1)

            key = f"{doc_id}_{chunk_idx}"
            if key in seen_keys:
                continue
            seen_keys.add(key)

            # 获取相邻片段
            adjacent = self.vector_store.get_adjacent_chunks(doc_id, chunk_idx)
            adjacent_contents = []
            for adj in adjacent:
                adj_meta = adj.get("metadata", {})
                adj_idx = adj_meta.get("chunk_index", -1)
                adj_key = f"{doc_id}_{adj_idx}"
                if adj_key not in seen_keys:
                    seen_keys.add(adj_key)
                    if adj_idx < chunk_idx:
                        adjacent_contents.insert(0, adj["content"])
                    else:
                        adjacent_contents.append(adj["content"])

            # 合并为扩展内容
            merged_content = "\n".join(
                [c for c in adjacent_contents[:1]]
                + [chunk["content"]]
                + [c for c in adjacent_contents[1:]]
            )

            expanded.append({
                "content": merged_content,
                "metadata": metadata,
                "distance": chunk.get("distance", 0),
            })

        return expanded

    async def retrieve(
        self,
        query: str,
        top_k: Optional[int] = None,
        document_ids: Optional[List[str]] = None,
    ) -> List[Dict]:
        """
        增强检索流程：

        1. 可选查询改写（enable_query_rewrite）
        2. 向量检索或混合检索（enable_hybrid_search）
        3. 可选重排序（enable_reranking）
        4. 上下文扩展（自动拉取相邻片段）
        """
        final_top_k = top_k or settings.retrieval_top_k

        # 步骤 1：查询改写
        queries = [query]
        if settings.enable_query_rewrite:
            queries = await self._rewrite_query(query)
            logger.info(f"Query rewritten: {query} -> {queries}")

        # 步骤 2：检索（支持多查询合并结果）
        retrieval_top_k = final_top_k
        if settings.enable_reranking:
            retrieval_top_k = settings.rerank_top_n  # 重排序时先粗筛更多结果

        all_results: List[Dict] = []
        seen_keys = set()

        for q in queries:
            if settings.enable_hybrid_search:
                results = await self._hybrid_search(q, retrieval_top_k, document_ids)
            else:
                results = await self.vector_store.search(
                    query=q,
                    top_k=retrieval_top_k,
                    filter_document_ids=document_ids,
                )
            # 去重合并
            for r in results:
                meta = r.get("metadata", {})
                key = f"{meta.get('document_id', '')}_{meta.get('chunk_index', '')}"
                if key not in seen_keys:
                    seen_keys.add(key)
                    all_results.append(r)

        # 步骤 3：重排序
        if settings.enable_reranking and len(all_results) > final_top_k:
            all_results = await self._rerank(query, all_results, final_top_k)
        else:
            all_results = all_results[:final_top_k]

        # 步骤 4：上下文扩展（拉取相邻片段）
        expanded = self._expand_context(all_results)

        return expanded

    def build_context(self, retrieved_chunks: List[Dict]) -> str:
        """
        将检索到的文档片段拼接为格式化的上下文字符串。

        层级化展示：摘要片段排在前面，普通片段排在后面，
        让 LLM 先看到文档全貌再看具体细节。
        """
        if not retrieved_chunks:
            return "（无相关参考资料）"

        # 分离摘要和普通片段
        summaries = []
        chunks = []
        for chunk in retrieved_chunks:
            metadata = chunk.get("metadata", {})
            if metadata.get("type") == "summary":
                summaries.append(chunk)
            else:
                chunks.append(chunk)

        context_parts = []

        # 先展示摘要（文档全貌）
        if summaries:
            context_parts.append("### 文档摘要")
            for i, chunk in enumerate(summaries, 1):
                metadata = chunk.get("metadata", {})
                filename = metadata.get("filename", "未知文件")
                context_parts.append(f"[摘要{i}] ({filename})\n{chunk['content']}")

        # 再展示具体片段
        if chunks:
            if summaries:
                context_parts.append("\n### 相关片段")
            for i, chunk in enumerate(chunks, 1):
                content = chunk["content"]
                metadata = chunk.get("metadata", {})
                doc_id = metadata.get("document_id", "unknown")
                chunk_idx = metadata.get("chunk_index", "?")
                context_parts.append(
                    f"[{i}] (文档: {doc_id[:8]}..., 片段: {chunk_idx})\n{content}"
                )

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
            # RAG 模式：增强检索（含查询改写、混合检索、重排序、上下文扩展）
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
            system_prompt = RAG_SYSTEM_PROMPT.format(
                context=context,
                kb_description="",
            )
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
