"""
核心业务逻辑模块

统一导出 RAG 流程中的各个核心组件：
- ollama_service: Ollama 模型调用服务（对话 + 向量化）
- DocumentParser: 多格式文档解析器（PDF/DOCX/TXT/MD）
- text_chunker: 文本分块器（将长文本切分为适合向量化的片段）
- vector_store: ChromaDB 向量存储（语义检索）
- rag_service: RAG 编排服务（检索 + 生成的完整流程）
"""

from app.core.ollama import ollama_service
from app.core.parser import DocumentParser
from app.core.chunker import text_chunker
from app.core.vectorstore import vector_store
from app.core.rag import rag_service

__all__ = [
    "ollama_service",
    "DocumentParser",
    "text_chunker",
    "vector_store",
    "rag_service",
]
