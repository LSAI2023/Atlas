"""
数据库连接与会话管理模块

使用 SQLAlchemy 异步引擎 + aiosqlite 驱动连接 SQLite 数据库。
提供：
- engine: 异步数据库引擎
- async_session_maker: 异步会话工厂
- init_db(): 初始化数据库（自动建表）
- get_session(): FastAPI 依赖注入用的会话获取器
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.config import settings
from app.models.models import Base


# 创建异步数据库引擎（debug 模式下会打印 SQL 语句）
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
)

# 创建异步会话工厂
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # 提交后不过期对象属性，避免懒加载问题
)


async def init_db():
    """初始化数据库：根据 ORM 模型定义自动创建所有表。"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:
    """FastAPI 依赖注入：提供异步数据库会话，请求结束后自动关闭。"""
    async with async_session_maker() as session:
        yield session
