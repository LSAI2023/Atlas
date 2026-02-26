"""
文档管理 API 模块

提供文档的上传、查询、删除接口：
- POST   /api/documents/upload     - 上传并索引文档（解析 → 分块 → 向量化 → 存储）
- GET    /api/documents            - 获取文档列表（可按知识库过滤）
- GET    /api/documents/{id}       - 获取文档详情（含分片内容）
- DELETE /api/documents/{id}       - 删除文档（同时清理向量和文件）
"""

import os
import hashlib
import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.db import crud
from app.config import settings
from app.core import DocumentParser, text_chunker, vector_store


router = APIRouter()


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    knowledge_base_id: str = Form(...),
    session: AsyncSession = Depends(get_session),
):
    """
    上传并索引文档到知识库。

    完整处理流程：
    1. 验证知识库存在且文件类型受支持
    2. 保存文件到本地 uploads 目录
    3. 解析文档提取文本内容
    4. 将文本切分为小片段
    5. 调用 Ollama 将片段向量化
    6. 存入 ChromaDB 向量数据库
    7. 在 SQLite 中记录文档元数据
    """
    # 验证知识库是否存在
    kb = await crud.get_knowledge_base(session, knowledge_base_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    # 验证文件类型是否受支持
    filename = file.filename or "unknown"
    file_ext = Path(filename).suffix.lower()

    if file_ext not in DocumentParser.supported_extensions():
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file_ext}. Supported: {DocumentParser.supported_extensions()}",
        )

    # 保存上传文件到本地磁盘
    file_path = settings.uploads_dir / filename
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    file_size = os.path.getsize(file_path)

    # 计算文件内容的 SHA-256 哈希值
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    file_hash = sha256.hexdigest()

    # 同知识库内去重检查
    existing_doc = await crud.get_document_by_hash(session, knowledge_base_id, file_hash)
    if existing_doc:
        # 重复文件，清理并拒绝
        if file_path.exists():
            os.remove(file_path)
        raise HTTPException(
            status_code=409,
            detail=f"该知识库中已存在相同内容的文件：{existing_doc.filename}",
        )

    try:
        # 步骤 1：解析文档提取文本
        content, file_type = DocumentParser.parse(file_path)

        if not content.strip():
            raise HTTPException(status_code=400, detail="Document is empty or could not be parsed")

        # 步骤 2：在数据库中创建文档记录
        doc = await crud.create_document(
            session=session,
            filename=filename,
            file_type=file_type,
            file_size=file_size,
            knowledge_base_id=knowledge_base_id,
            chunk_count=0,
            file_hash=file_hash,
        )

        # 步骤 3：将文本切分为片段
        chunks = text_chunker.split(content)

        if not chunks:
            raise HTTPException(status_code=400, detail="No text chunks generated from document")

        # 步骤 4：为每个片段准备元数据
        metadatas = [
            {"filename": filename, "chunk_index": i, "total_chunks": len(chunks)}
            for i in range(len(chunks))
        ]

        # 步骤 5：向量化并存入 ChromaDB
        await vector_store.add_documents(
            chunks=chunks,
            document_id=doc.id,
            metadatas=metadatas,
        )

        # 步骤 6：更新数据库中的片段数量
        await crud.update_document_chunk_count(session, doc.id, len(chunks))

        return {
            "id": doc.id,
            "filename": doc.filename,
            "file_type": doc.file_type,
            "file_size": doc.file_size,
            "chunk_count": len(chunks),
            "knowledge_base_id": knowledge_base_id,
            "message": f"Document uploaded and indexed successfully with {len(chunks)} chunks",
        }

    except ValueError as e:
        # 解析失败时清理已保存的文件
        if file_path.exists():
            os.remove(file_path)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # 其他错误也需要清理文件
        if file_path.exists():
            os.remove(file_path)
        error_detail = str(e) or repr(e)
        raise HTTPException(status_code=500, detail=f"Failed to process document: {error_detail}")


@router.get("")
async def list_documents(
    knowledge_base_id: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """获取文档列表，支持按知识库 ID 过滤。"""
    documents = await crud.get_all_documents(session, knowledge_base_id=knowledge_base_id)
    return {"documents": [doc.to_dict() for doc in documents]}


@router.get("/{document_id}")
async def get_document(
    document_id: str,
    session: AsyncSession = Depends(get_session),
):
    """获取文档详情，包含所有分片内容（用于预览）。"""
    doc = await crud.get_document(session, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # 从向量数据库获取分片内容
    chunks = vector_store.get_document_chunks(document_id)

    return {
        **doc.to_dict(),
        "chunks": chunks,
    }


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    session: AsyncSession = Depends(get_session),
):
    """
    删除文档，同时清理：
    1. ChromaDB 中的向量数据
    2. SQLite 中的元数据记录
    3. uploads 目录中的原始文件
    """
    doc = await crud.get_document(session, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # 删除向量数据
    deleted_chunks = vector_store.delete_document(document_id)

    # 删除数据库记录
    await crud.delete_document(session, document_id)

    # 删除本地文件
    file_path = settings.uploads_dir / doc.filename
    if file_path.exists():
        os.remove(file_path)

    return {
        "message": "Document deleted successfully",
        "deleted_chunks": deleted_chunks,
    }
