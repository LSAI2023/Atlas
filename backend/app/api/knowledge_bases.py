"""
知识库管理 API 模块

提供知识库的 CRUD 接口：
- POST   /api/knowledge-bases       - 创建知识库
- GET    /api/knowledge-bases       - 获取知识库列表
- GET    /api/knowledge-bases/{id}  - 获取知识库详情（含文档列表）
- PUT    /api/knowledge-bases/{id}  - 更新知识库信息
- DELETE /api/knowledge-bases/{id}  - 删除知识库（级联删除所有文档和向量）
"""

import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.db import crud
from app.config import settings
from app.core import vector_store


router = APIRouter()


class KnowledgeBaseCreate(BaseModel):
    """创建知识库请求体"""
    name: str              # 知识库名称
    description: str = ""  # 知识库描述（可选）


class KnowledgeBaseUpdate(BaseModel):
    """更新知识库请求体"""
    name: Optional[str] = None
    description: Optional[str] = None


@router.post("")
async def create_knowledge_base(
    request: KnowledgeBaseCreate,
    session: AsyncSession = Depends(get_session),
):
    """创建新知识库。"""
    kb = await crud.create_knowledge_base(
        session=session,
        name=request.name,
        description=request.description,
    )
    return kb.to_dict()


@router.get("")
async def list_knowledge_bases(session: AsyncSession = Depends(get_session)):
    """获取所有知识库列表。"""
    knowledge_bases = await crud.get_all_knowledge_bases(session)
    return {"knowledge_bases": [kb.to_dict() for kb in knowledge_bases]}


@router.get("/{kb_id}")
async def get_knowledge_base(
    kb_id: str,
    session: AsyncSession = Depends(get_session),
):
    """获取知识库详情，包含其下所有文档信息。"""
    kb = await crud.get_knowledge_base(session, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    documents = await crud.get_knowledge_base_documents(session, kb_id)

    return {
        **kb.to_dict(),
        "documents": [doc.to_dict() for doc in documents],
    }


@router.put("/{kb_id}")
async def update_knowledge_base(
    kb_id: str,
    request: KnowledgeBaseUpdate,
    session: AsyncSession = Depends(get_session),
):
    """更新知识库名称和描述。"""
    kb = await crud.update_knowledge_base(
        session=session,
        kb_id=kb_id,
        name=request.name,
        description=request.description,
    )
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    return kb.to_dict()


@router.delete("/{kb_id}")
async def delete_knowledge_base(
    kb_id: str,
    session: AsyncSession = Depends(get_session),
):
    """
    删除知识库及其所有资源（级联删除）。

    清理内容包括：
    1. 所有文档在 ChromaDB 中的向量数据
    2. uploads 目录中的原始上传文件
    3. SQLite 中的知识库和文档记录（通过外键级联删除）
    """
    kb = await crud.get_knowledge_base(session, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    # 逐个清理该知识库下所有文档的向量和文件
    documents = await crud.get_knowledge_base_documents(session, kb_id)
    total_deleted_chunks = 0
    for doc in documents:
        # 删除 ChromaDB 中的向量
        total_deleted_chunks += vector_store.delete_document(doc.id)
        # 删除本地上传文件
        file_path = settings.uploads_dir / doc.filename
        if file_path.exists():
            os.remove(file_path)

    # 删除知识库记录（外键级联自动删除关联文档记录）
    await crud.delete_knowledge_base(session, kb_id)

    return {
        "message": "Knowledge base deleted successfully",
        "deleted_documents": len(documents),
        "deleted_chunks": total_deleted_chunks,
    }
