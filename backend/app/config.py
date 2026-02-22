from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App settings
    app_name: str = "Atlas Knowledge Base"
    debug: bool = True

    # Paths
    base_dir: Path = Path(__file__).parent.parent.parent
    data_dir: Path = base_dir / "data"
    chroma_dir: Path = data_dir / "chroma"
    sqlite_dir: Path = data_dir / "sqlite"
    uploads_dir: Path = data_dir / "uploads"

    # Database
    database_url: str = f"sqlite+aiosqlite:///{sqlite_dir}/atlas.db"

    # Ollama settings
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_chat_model: str = "qwen3:14b"
    ollama_embedding_model: str = "qwen3-embedding:4b"

    # RAG settings
    chunk_size: int = 600
    chunk_overlap: int = 100
    retrieval_top_k: int = 5

    # Chat settings
    max_history_messages: int = 10

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure directories exist
settings.chroma_dir.mkdir(parents=True, exist_ok=True)
settings.sqlite_dir.mkdir(parents=True, exist_ok=True)
settings.uploads_dir.mkdir(parents=True, exist_ok=True)
