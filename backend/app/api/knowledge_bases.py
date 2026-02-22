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
    name: str
    description: str = ""


class KnowledgeBaseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


@router.post("")
async def create_knowledge_base(
    request: KnowledgeBaseCreate,
    session: AsyncSession = Depends(get_session),
):
    """Create a new knowledge base."""
    kb = await crud.create_knowledge_base(
        session=session,
        name=request.name,
        description=request.description,
    )
    return kb.to_dict()


@router.get("")
async def list_knowledge_bases(session: AsyncSession = Depends(get_session)):
    """Get list of all knowledge bases."""
    knowledge_bases = await crud.get_all_knowledge_bases(session)
    return {"knowledge_bases": [kb.to_dict() for kb in knowledge_bases]}


@router.get("/{kb_id}")
async def get_knowledge_base(
    kb_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get knowledge base details with documents."""
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
    """Update knowledge base name/description."""
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
    """Delete a knowledge base and all its documents (cascade)."""
    kb = await crud.get_knowledge_base(session, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    # Get all documents to clean up vector store and uploaded files
    documents = await crud.get_knowledge_base_documents(session, kb_id)
    total_deleted_chunks = 0
    for doc in documents:
        # Delete from vector store
        total_deleted_chunks += vector_store.delete_document(doc.id)
        # Delete uploaded file
        file_path = settings.uploads_dir / doc.filename
        if file_path.exists():
            os.remove(file_path)

    # Delete knowledge base (cascades to documents)
    await crud.delete_knowledge_base(session, kb_id)

    return {
        "message": "Knowledge base deleted successfully",
        "deleted_documents": len(documents),
        "deleted_chunks": total_deleted_chunks,
    }
