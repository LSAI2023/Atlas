import os
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
    """Upload and index a document into a knowledge base."""
    # Verify knowledge base exists
    kb = await crud.get_knowledge_base(session, knowledge_base_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    # Validate file type
    filename = file.filename or "unknown"
    file_ext = Path(filename).suffix.lower()

    if file_ext not in DocumentParser.supported_extensions():
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file_ext}. Supported: {DocumentParser.supported_extensions()}",
        )

    # Save file to uploads directory
    file_path = settings.uploads_dir / filename
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Get file size
    file_size = os.path.getsize(file_path)

    try:
        # Parse document
        content, file_type = DocumentParser.parse(file_path)

        if not content.strip():
            raise HTTPException(status_code=400, detail="Document is empty or could not be parsed")

        # Create document record
        doc = await crud.create_document(
            session=session,
            filename=filename,
            file_type=file_type,
            file_size=file_size,
            knowledge_base_id=knowledge_base_id,
            chunk_count=0,
        )

        # Chunk text
        chunks = text_chunker.split(content)

        if not chunks:
            raise HTTPException(status_code=400, detail="No text chunks generated from document")

        # Create metadata for each chunk
        metadatas = [
            {"filename": filename, "chunk_index": i, "total_chunks": len(chunks)}
            for i in range(len(chunks))
        ]

        # Add to vector store
        await vector_store.add_documents(
            chunks=chunks,
            document_id=doc.id,
            metadatas=metadatas,
        )

        # Update chunk count
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
        # Clean up file on parsing error
        if file_path.exists():
            os.remove(file_path)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Clean up file on any error
        if file_path.exists():
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")


@router.get("")
async def list_documents(
    knowledge_base_id: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Get list of documents, optionally filtered by knowledge base."""
    documents = await crud.get_all_documents(session, knowledge_base_id=knowledge_base_id)
    return {"documents": [doc.to_dict() for doc in documents]}


@router.get("/{document_id}")
async def get_document(
    document_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get document details."""
    doc = await crud.get_document(session, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Get chunks from vector store
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
    """Delete a document and its vectors."""
    doc = await crud.get_document(session, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete from vector store
    deleted_chunks = vector_store.delete_document(document_id)

    # Delete from database
    await crud.delete_document(session, document_id)

    # Delete file from uploads
    file_path = settings.uploads_dir / doc.filename
    if file_path.exists():
        os.remove(file_path)

    return {
        "message": "Document deleted successfully",
        "deleted_chunks": deleted_chunks,
    }
