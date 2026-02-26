"""
Atlas 后端应用入口模块

FastAPI 应用的创建、配置和启动，包括：
- 应用生命周期管理（数据库初始化）
- CORS 跨域中间件配置
- API 路由注册
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.database import init_db
from app.db import get_session, async_session_maker
from app.db import crud
from app.api import chat, documents, history, knowledge_bases
from app.api import settings as settings_api


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理：启动时初始化数据库并加载用户配置，关闭时清理资源。"""
    # 启动阶段：初始化数据库表结构
    await init_db()
    # 从数据库加载用户自定义配置覆盖默认值
    async with async_session_maker() as session:
        user_settings = await crud.get_all_settings(session)
        user_map = {s.key: s.value for s in user_settings}
        settings.apply_user_settings(user_map)
    yield
    # 关闭阶段：如需清理资源可在此处添加


# 创建 FastAPI 应用实例
app = FastAPI(
    title=settings.app_name,
    description="本地 RAG 知识库助手 API",
    version="0.1.0",
    lifespan=lifespan,
)

# 配置 CORS 跨域中间件，允许前端 Electron 应用访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # 允许所有来源（开发环境）
    allow_credentials=True,
    allow_methods=["*"],       # 允许所有 HTTP 方法
    allow_headers=["*"],       # 允许所有请求头
)

# 注册各模块的 API 路由
app.include_router(knowledge_bases.router, prefix="/api/knowledge-bases", tags=["knowledge-bases"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(history.router, prefix="/api/history", tags=["history"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["settings"])


@app.get("/")
async def root():
    """根路径，返回 API 基本信息。"""
    return {"message": "Atlas Knowledge Base API", "version": "0.1.0"}


@app.get("/health")
async def health_check():
    """健康检查接口，用于确认服务是否正常运行。"""
    return {"status": "healthy"}
