import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KnowledgeBase, Document, Conversation, Message


# KnowledgeBase CRUD
async def create_knowledge_base(
    session: AsyncSession,
    name: str,
    description: str = "",
) -> KnowledgeBase:
    kb = KnowledgeBase(
        id=str(uuid.uuid4()),
        name=name,
        description=description,
    )
    session.add(kb)
    await session.commit()
    await session.refresh(kb)
    return kb


async def get_knowledge_base(session: AsyncSession, kb_id: str) -> Optional[KnowledgeBase]:
    result = await session.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    return result.scalar_one_or_none()


async def get_all_knowledge_bases(session: AsyncSession) -> List[KnowledgeBase]:
    result = await session.execute(select(KnowledgeBase).order_by(KnowledgeBase.updated_at.desc()))
    return list(result.scalars().all())


async def update_knowledge_base(
    session: AsyncSession,
    kb_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Optional[KnowledgeBase]:
    kb = await get_knowledge_base(session, kb_id)
    if kb:
        if name is not None:
            kb.name = name
        if description is not None:
            kb.description = description
        kb.updated_at = datetime.utcnow()
        await session.commit()
        await session.refresh(kb)
    return kb


async def delete_knowledge_base(session: AsyncSession, kb_id: str) -> bool:
    kb = await get_knowledge_base(session, kb_id)
    if kb:
        await session.delete(kb)
        await session.commit()
        return True
    return False


async def get_knowledge_base_documents(session: AsyncSession, kb_id: str) -> List[Document]:
    result = await session.execute(
        select(Document).where(Document.knowledge_base_id == kb_id).order_by(Document.created_at.desc())
    )
    return list(result.scalars().all())


async def get_document_ids_for_knowledge_bases(
    session: AsyncSession, kb_ids: List[str]
) -> List[str]:
    """Resolve knowledge base IDs to document IDs."""
    result = await session.execute(
        select(Document.id).where(Document.knowledge_base_id.in_(kb_ids))
    )
    return list(result.scalars().all())


# Document CRUD
async def create_document(
    session: AsyncSession,
    filename: str,
    file_type: str,
    file_size: int,
    knowledge_base_id: str,
    chunk_count: int = 0,
) -> Document:
    doc = Document(
        id=str(uuid.uuid4()),
        filename=filename,
        file_type=file_type,
        file_size=file_size,
        knowledge_base_id=knowledge_base_id,
        chunk_count=chunk_count,
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)
    return doc


async def get_document(session: AsyncSession, doc_id: str) -> Optional[Document]:
    result = await session.execute(select(Document).where(Document.id == doc_id))
    return result.scalar_one_or_none()


async def get_all_documents(
    session: AsyncSession, knowledge_base_id: Optional[str] = None
) -> List[Document]:
    query = select(Document).order_by(Document.created_at.desc())
    if knowledge_base_id:
        query = query.where(Document.knowledge_base_id == knowledge_base_id)
    result = await session.execute(query)
    return list(result.scalars().all())


async def update_document_chunk_count(
    session: AsyncSession, doc_id: str, chunk_count: int
) -> Optional[Document]:
    doc = await get_document(session, doc_id)
    if doc:
        doc.chunk_count = chunk_count
        await session.commit()
        await session.refresh(doc)
    return doc


async def delete_document(session: AsyncSession, doc_id: str) -> bool:
    doc = await get_document(session, doc_id)
    if doc:
        await session.delete(doc)
        await session.commit()
        return True
    return False


# Conversation CRUD
async def create_conversation(session: AsyncSession, title: str = "New Conversation") -> Conversation:
    conv = Conversation(
        id=str(uuid.uuid4()),
        title=title,
    )
    session.add(conv)
    await session.commit()
    await session.refresh(conv)
    return conv


async def get_conversation(session: AsyncSession, conv_id: str) -> Optional[Conversation]:
    result = await session.execute(select(Conversation).where(Conversation.id == conv_id))
    return result.scalar_one_or_none()


async def get_all_conversations(session: AsyncSession) -> List[Conversation]:
    result = await session.execute(
        select(Conversation).order_by(Conversation.updated_at.desc())
    )
    return list(result.scalars().all())


async def update_conversation_title(
    session: AsyncSession, conv_id: str, title: str
) -> Optional[Conversation]:
    conv = await get_conversation(session, conv_id)
    if conv:
        conv.title = title
        conv.updated_at = datetime.utcnow()
        await session.commit()
        await session.refresh(conv)
    return conv


async def delete_conversation(session: AsyncSession, conv_id: str) -> bool:
    conv = await get_conversation(session, conv_id)
    if conv:
        await session.delete(conv)
        await session.commit()
        return True
    return False


# Message CRUD
async def create_message(
    session: AsyncSession,
    conversation_id: str,
    role: str,
    content: str,
) -> Message:
    msg = Message(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        role=role,
        content=content,
    )
    session.add(msg)

    # Update conversation's updated_at
    conv = await get_conversation(session, conversation_id)
    if conv:
        conv.updated_at = datetime.utcnow()

    await session.commit()
    await session.refresh(msg)
    return msg


async def get_conversation_messages(
    session: AsyncSession, conversation_id: str, limit: Optional[int] = None
) -> List[Message]:
    query = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    )
    if limit:
        query = query.limit(limit)
    result = await session.execute(query)
    return list(result.scalars().all())


async def get_recent_messages(
    session: AsyncSession, conversation_id: str, limit: int = 10
) -> List[Message]:
    """Get the most recent messages for context."""
    query = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    result = await session.execute(query)
    messages = list(result.scalars().all())
    return list(reversed(messages))  # Return in chronological order
