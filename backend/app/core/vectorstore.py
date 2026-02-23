"""
向量数据库模块

基于 ChromaDB 实现文档向量的存储与语义检索：
- 文档片段经 Ollama 向量化后存入 ChromaDB
- 查询时将用户问题向量化，通过余弦相似度找到最相关的文档片段
- 支持按文档 ID 过滤检索范围
"""

from typing import Any, Optional, List, Dict

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import settings
from app.core.ollama import ollama_service


class VectorStore:
    """ChromaDB 向量存储，负责文档向量的增删查操作。"""

    COLLECTION_NAME = "documents"  # ChromaDB 集合名称

    def __init__(self):
        # 初始化 ChromaDB 持久化客户端，数据存储在本地磁盘
        self.client = chromadb.PersistentClient(
            path=str(settings.chroma_dir),
            settings=ChromaSettings(anonymized_telemetry=False),  # 关闭匿名遥测
        )
        # 获取或创建文档集合，使用余弦相似度作为距离度量
        self.collection = self.client.get_or_create_collection(
            name=self.COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    async def add_documents(
        self,
        chunks: List[str],
        document_id: str,
        metadatas: Optional[List[Dict]] = None,
    ) -> List[str]:
        """
        将文档片段向量化后存入 ChromaDB。

        处理流程：
        1. 调用 Ollama 批量生成片段的向量表示
        2. 为每个片段生成唯一 ID（格式：{document_id}_{序号}）
        3. 将向量、原文、元数据一起存入集合

        Args:
            chunks: 文本片段列表
            document_id: 所属文档的 ID
            metadatas: 每个片段的元数据（如文件名、片段索引等）

        Returns:
            存入的片段 ID 列表
        """
        if not chunks:
            return []

        # 批量生成向量嵌入
        embeddings = await ollama_service.generate_embeddings(chunks)

        # 为每个片段生成唯一 ID
        chunk_ids = [f"{document_id}_{i}" for i in range(len(chunks))]

        # 初始化元数据（如果未提供）
        if metadatas is None:
            metadatas = [{} for _ in chunks]

        # 在所有元数据中注入 document_id，便于后续按文档过滤
        for meta in metadatas:
            meta["document_id"] = document_id

        # 存入 ChromaDB 集合
        self.collection.add(
            ids=chunk_ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas,
        )

        return chunk_ids

    async def search(
        self,
        query: str,
        top_k: Optional[int] = None,
        filter_document_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        语义检索：根据查询文本找到最相似的文档片段。

        处理流程：
        1. 将查询文本向量化
        2. 在 ChromaDB 中按余弦相似度检索
        3. 可选按文档 ID 过滤检索范围

        Args:
            query: 用户查询文本
            top_k: 返回结果数量
            filter_document_ids: 限定检索的文档 ID 列表

        Returns:
            结果列表，每项包含 content（原文）、metadata（元数据）、distance（距离）
        """
        top_k = top_k or settings.retrieval_top_k

        # 将查询文本向量化
        query_embedding = await ollama_service.generate_embedding(query)

        # 构建文档 ID 过滤条件
        where_filter = None
        if filter_document_ids:
            where_filter = {"document_id": {"$in": filter_document_ids}}

        # 执行向量相似度查询
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )

        # 格式化返回结果
        formatted_results = []
        if results["documents"] and results["documents"][0]:
            for i, doc in enumerate(results["documents"][0]):
                formatted_results.append({
                    "content": doc,
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    "distance": results["distances"][0][i] if results["distances"] else 0,
                })

        return formatted_results

    def delete_document(self, document_id: str) -> int:
        """
        删除某个文档的所有向量片段。

        Args:
            document_id: 要删除的文档 ID

        Returns:
            被删除的片段数量
        """
        # 先查出该文档的所有片段 ID
        results = self.collection.get(
            where={"document_id": document_id},
            include=[],
        )

        if not results["ids"]:
            return 0

        # 批量删除
        self.collection.delete(ids=results["ids"])
        return len(results["ids"])

    def get_document_chunks(self, document_id: str) -> List[Dict]:
        """
        获取某个文档的所有片段内容和元数据（用于预览）。

        Args:
            document_id: 文档 ID

        Returns:
            片段列表，每项包含 content 和 metadata
        """
        results = self.collection.get(
            where={"document_id": document_id},
            include=["documents", "metadatas"],
        )

        chunks = []
        if results["documents"]:
            for i, doc in enumerate(results["documents"]):
                chunks.append({
                    "content": doc,
                    "metadata": results["metadatas"][i] if results["metadatas"] else {},
                })

        return chunks

    def count(self) -> int:
        """返回集合中的总片段数量。"""
        return self.collection.count()


# 全局单例实例
vector_store = VectorStore()
