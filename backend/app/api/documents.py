"""
文档管理 API 模块

提供文档的上传、查询、删除接口：
- POST   /api/documents/upload       - 上传文档（快速返回，后台异步分片）
- GET    /api/documents              - 获取文档列表（可按知识库过滤）
- GET    /api/documents/{id}         - 获取文档详情（含分片内容）
- GET    /api/documents/{id}/chunks/{index} - 获取单个分片内容
- POST   /api/documents/{id}/reindex - 重新分片失败的文档
- DELETE /api/documents/{id}         - 删除文档（同时清理向量和文件）
"""

import os
import asyncio
import hashlib
import shutil
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session, async_session_maker
from app.db import crud
from app.config import settings
from app.core import DocumentParser, text_chunker, vector_store
from app.core.ollama import ollama_service


router = APIRouter()
logger = logging.getLogger(__name__)


async def _process_document(doc_id: str, file_path: Path, filename: str):
    """
    后台异步处理文档：解析 → 分片 → 向量化 → 摘要生成。

    使用独立的数据库会话，因为运行在后台任务中。
    """
    async with async_session_maker() as session:
        try:
            await crud.update_document_status(session, doc_id, "processing")

            # 步骤 1：解析文档提取文本
            content, file_type = DocumentParser.parse(file_path)
            if not content.strip():
                await crud.update_document_status(session, doc_id, "failed")
                return

            # 步骤 2：将文本切分为片段
            chunks = text_chunker.split(content)
            if not chunks:
                await crud.update_document_status(session, doc_id, "failed")
                return

            # 步骤 3：为每个片段准备元数据
            metadatas = [
                {"filename": filename, "chunk_index": i, "total_chunks": len(chunks)}
                for i in range(len(chunks))
            ]

            # 步骤 4：向量化并存入 ChromaDB
            await vector_store.add_documents(
                chunks=chunks,
                document_id=doc_id,
                metadatas=metadatas,
            )

            # 步骤 5：更新数据库中的片段数量
            await crud.update_document_chunk_count(session, doc_id, len(chunks))

            # 步骤 6：调用 LLM 生成文档摘要
            try:
                summary_input = content[:3000]
                summary_prompt = f"请用中文为以下文档内容生成一份简明摘要（200字以内），概括文档的主题、关键内容和核心要点：\n\n{summary_input}"
                summary_response = await ollama_service.chat(
                    messages=[{"role": "user", "content": summary_prompt}],
                    model=settings.ollama_summary_model,
                )
                summary_text = summary_response.get("content", "").strip()
                if summary_text:
                    await crud.update_document_summary(session, doc_id, summary_text)
                    await vector_store.add_documents(
                        chunks=[summary_text],
                        document_id=doc_id,
                        metadatas=[{
                            "filename": filename,
                            "chunk_index": -1,
                            "total_chunks": len(chunks),
                            "type": "summary",
                        }],
                        is_summary=True,
                    )
            except Exception:
                pass  # 摘要生成失败不影响主流程

            # 标记为完成
            await crud.update_document_status(session, doc_id, "completed")

        except Exception as e:
            logger.error(f"Failed to process document {doc_id}: {e}")
            try:
                await crud.update_document_status(session, doc_id, "failed")
            except Exception:
                pass


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    knowledge_base_id: str = Form(...),
    session: AsyncSession = Depends(get_session),
):
    """
    上传文档到知识库（快速返回，后台异步分片）。

    流程：
    1. 验证知识库和文件类型
    2. 保存文件、计算哈希、去重检查
    3. 创建 pending 状态的文档记录
    4. 启动后台任务处理分片
    5. 立即返回文档信息
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
        if file_path.exists():
            os.remove(file_path)
        raise HTTPException(
            status_code=409,
            detail=f"该知识库中已存在相同内容的文件：{existing_doc.filename}",
        )

    # 创建 pending 状态的文档记录（快速返回）
    doc = await crud.create_document(
        session=session,
        filename=filename,
        file_type=Path(filename).suffix.lstrip(".").lower(),
        file_size=file_size,
        knowledge_base_id=knowledge_base_id,
        chunk_count=0,
        file_hash=file_hash,
    )

    # 设置状态为 pending
    await crud.update_document_status(session, doc.id, "pending")

    # 启动后台任务处理分片
    asyncio.create_task(_process_document(doc.id, file_path, filename))

    return doc.to_dict()


@router.post("/{document_id}/reindex")
async def reindex_document(
    document_id: str,
    session: AsyncSession = Depends(get_session),
):
    """对 failed 状态的文档重新触发分片处理。"""
    doc = await crud.get_document(session, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.status not in ("failed", "pending"):
        raise HTTPException(status_code=400, detail=f"文档状态为 {doc.status}，无法重新分片")

    file_path = settings.uploads_dir / doc.filename
    if not file_path.exists():
        raise HTTPException(status_code=400, detail="源文件已丢失，无法重新分片")

    # 清理旧的向量数据
    vector_store.delete_document(document_id)

    # 重置状态并启动后台任务
    await crud.update_document_status(session, document_id, "pending")
    asyncio.create_task(_process_document(document_id, file_path, doc.filename))

    return {"message": "重新分片已启动", "document_id": document_id}


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


@router.get("/{document_id}/chunks/{chunk_index}")
async def get_chunk_content(
    document_id: str,
    chunk_index: int,
    session: AsyncSession = Depends(get_session),
):
    """按 document_id 和 chunk_index 获取单个分片内容（用于引用溯源按需加载）。"""
    doc = await crud.get_document(session, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    chunk = vector_store.get_chunk_by_index(document_id, chunk_index)
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")

    return chunk


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
