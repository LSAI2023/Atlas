"""
全局配置模块

使用 pydantic-settings 管理所有配置项，支持通过 .env 文件覆盖默认值。
包括：文件路径、数据库连接、Ollama 模型、RAG 参数等。
"""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ===== 应用基础配置 =====
    app_name: str = "Atlas Knowledge Base"
    debug: bool = True

    # ===== 文件路径配置 =====
    base_dir: Path = Path(__file__).parent.parent.parent   # 项目根目录
    data_dir: Path = base_dir / "data"                     # 数据存储根目录
    chroma_dir: Path = data_dir / "chroma"                 # ChromaDB 向量数据库存储目录
    sqlite_dir: Path = data_dir / "sqlite"                 # SQLite 关系数据库存储目录
    uploads_dir: Path = data_dir / "uploads"               # 用户上传文件存储目录

    # ===== 数据库配置 =====
    database_url: str = f"sqlite+aiosqlite:///{sqlite_dir}/atlas.db"

    # ===== Ollama 模型配置 =====
    ollama_base_url: str = "http://127.0.0.1:11434"        # Ollama 服务地址
    ollama_chat_model: str = "qwen3:14b"                   # 对话生成模型
    ollama_embedding_model: str = "qwen3-embedding:4b"     # 文本向量化模型

    # ===== RAG 检索增强生成配置 =====
    chunk_size: int = 600          # 文档分块大小（字符数）
    chunk_overlap: int = 100       # 相邻分块的重叠字符数，保持上下文连贯性
    retrieval_top_k: int = 5       # 语义检索时返回最相似的 Top-K 个片段

    # ===== 对话配置 =====
    max_history_messages: int = 10  # 发送给模型的最大历史消息条数

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# 全局配置单例
settings = Settings()

# 确保数据目录存在，不存在则自动创建
settings.chroma_dir.mkdir(parents=True, exist_ok=True)
settings.sqlite_dir.mkdir(parents=True, exist_ok=True)
settings.uploads_dir.mkdir(parents=True, exist_ok=True)
