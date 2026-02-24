"""
全局配置模块

使用 pydantic-settings 管理所有配置项，支持通过 .env 文件覆盖默认值。
包括：文件路径、数据库连接、Ollama 模型、RAG 参数等。

打包模式下，数据目录自动切换到 ~/Library/Application Support/Atlas/data/，
可通过环境变量 ATLAS_DATA_DIR / ATLAS_PORT 覆盖。
"""

import os
import sys
from pathlib import Path
from pydantic import model_validator
from pydantic_settings import BaseSettings


def _is_packaged() -> bool:
    """判断是否运行在 PyInstaller 打包环境中。"""
    return getattr(sys, 'frozen', False)


class Settings(BaseSettings):
    # ===== 应用基础配置 =====
    app_name: str = "Atlas Knowledge Base"
    debug: bool = True

    # ===== 网络配置 =====
    host: str = "127.0.0.1"
    port: int = 8000

    # ===== 文件路径配置 =====
    # 以下字段由 model_validator 动态计算，此处仅声明类型
    base_dir: Path = Path(__file__).parent.parent.parent
    data_dir: Path = Path()
    chroma_dir: Path = Path()
    sqlite_dir: Path = Path()
    uploads_dir: Path = Path()

    # ===== 数据库配置 =====
    database_url: str = ""

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

    @model_validator(mode='before')
    @classmethod
    def resolve_paths(cls, values: dict) -> dict:
        """
        根据运行环境动态计算所有路径和端口。

        - 打包环境：数据存储到 ~/Library/Application Support/Atlas/data/
        - 开发环境：数据存储到项目根目录下的 data/
        - 支持 ATLAS_DATA_DIR 环境变量覆盖数据目录
        - 支持 ATLAS_PORT 环境变量覆盖端口
        """
        # 处理端口覆盖
        env_port = os.environ.get('ATLAS_PORT')
        if env_port:
            values['port'] = int(env_port)

        # 处理主机地址覆盖
        env_host = os.environ.get('ATLAS_HOST')
        if env_host:
            values['host'] = env_host

        # 确定数据目录
        env_data_dir = os.environ.get('ATLAS_DATA_DIR')
        if env_data_dir:
            data_dir = Path(env_data_dir)
        elif _is_packaged():
            # 打包模式：使用 macOS 标准应用数据目录
            data_dir = Path.home() / "Library" / "Application Support" / "Atlas" / "data"
        else:
            # 开发模式：使用项目根目录下的 data/
            base_dir = values.get('base_dir', Path(__file__).parent.parent.parent)
            if isinstance(base_dir, str):
                base_dir = Path(base_dir)
            data_dir = base_dir / "data"

        values['data_dir'] = data_dir
        values['chroma_dir'] = data_dir / "chroma"
        values['sqlite_dir'] = data_dir / "sqlite"
        values['uploads_dir'] = data_dir / "uploads"
        values['database_url'] = f"sqlite+aiosqlite:///{data_dir / 'sqlite' / 'atlas.db'}"

        return values

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# 全局配置单例
settings = Settings()

# 确保数据目录存在，不存在则自动创建
settings.chroma_dir.mkdir(parents=True, exist_ok=True)
settings.sqlite_dir.mkdir(parents=True, exist_ok=True)
settings.uploads_dir.mkdir(parents=True, exist_ok=True)
