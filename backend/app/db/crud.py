"""
数据库 CRUD 操作模块

封装所有数据库增删改查操作，按实体分组：
- 知识库（KnowledgeBase）CRUD
- 文档（Document）CRUD
- 对话（Conversation）CRUD
- 消息（Message）CRUD

所有操作使用 SQLAlchemy 异步会话，支持与 FastAPI 的依赖注入集成。
"""

import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KnowledgeBase, Document, Conversation, Message, Setting


# ==========================
#  知识库（KnowledgeBase）CRUD
# ==========================

async def create_knowledge_base(
    session: AsyncSession,
    name: str,
    description: str = "",
) -> KnowledgeBase:
    """创建知识库，自动生成 UUID。"""
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
    """根据 ID 查询知识库。"""
    result = await session.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    return result.scalar_one_or_none()


async def get_all_knowledge_bases(session: AsyncSession) -> List[KnowledgeBase]:
    """获取所有知识库，按更新时间倒序排列。"""
    result = await session.execute(select(KnowledgeBase)
                                   .order_by(KnowledgeBase.updated_at.desc()))
    return list(result.scalars().all())


async def update_knowledge_base(
    session: AsyncSession,
    kb_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Optional[KnowledgeBase]:
    """更新知识库名称和描述（仅更新非 None 字段）。"""
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
    """删除知识库（关联文档通过 ORM 级联自动删除）。"""
    kb = await get_knowledge_base(session, kb_id)
    if kb:
        await session.delete(kb)
        await session.commit()
        return True
    return False


async def get_knowledge_base_documents(session: AsyncSession, kb_id: str) -> List[Document]:
    """获取知识库下的所有文档，按创建时间倒序排列。"""
    result = await session.execute(
        select(Document).where(Document.knowledge_base_id == kb_id).order_by(Document.created_at.desc())
    )
    return list(result.scalars().all())


async def get_document_ids_for_knowledge_bases(
    session: AsyncSession, kb_ids: List[str]
) -> List[str]:
    """将知识库 ID 列表解析为文档 ID 列表（用于 RAG 检索时的文档范围限定）。"""
    result = await session.execute(
        select(Document.id).where(Document.knowledge_base_id.in_(kb_ids))
    )
    return list(result.scalars().all())


# ==========================
#  文档（Document）CRUD
# ==========================

async def create_document(
    session: AsyncSession,
    filename: str,
    file_type: str,
    file_size: int,
    knowledge_base_id: str,
    chunk_count: int = 0,
    file_hash: Optional[str] = None,
) -> Document:
    """创建文档记录，自动生成 UUID。"""
    doc = Document(
        id=str(uuid.uuid4()),
        filename=filename,
        file_type=file_type,
        file_size=file_size,
        knowledge_base_id=knowledge_base_id,
        chunk_count=chunk_count,
        file_hash=file_hash,
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)
    return doc


async def get_document(session: AsyncSession, doc_id: str) -> Optional[Document]:
    """根据 ID 查询文档。"""
    result = await session.execute(select(Document).where(Document.id == doc_id))
    return result.scalar_one_or_none()


async def get_document_by_hash(
    session: AsyncSession, knowledge_base_id: str, file_hash: str
) -> Optional[Document]:
    """根据文件哈希在指定知识库内查询文档（用于去重检测）。"""
    result = await session.execute(
        select(Document).where(
            Document.knowledge_base_id == knowledge_base_id,
            Document.file_hash == file_hash,
        )
    )
    return result.scalar_one_or_none()


async def get_all_documents(
    session: AsyncSession, knowledge_base_id: Optional[str] = None
) -> List[Document]:
    """获取文档列表，支持按知识库 ID 过滤。"""
    query = select(Document).order_by(Document.created_at.desc())
    if knowledge_base_id:
        query = query.where(Document.knowledge_base_id == knowledge_base_id)
    result = await session.execute(query)
    return list(result.scalars().all())


async def update_document_chunk_count(
    session: AsyncSession, doc_id: str, chunk_count: int
) -> Optional[Document]:
    """更新文档的分片数量（文档索引完成后调用）。"""
    doc = await get_document(session, doc_id)
    if doc:
        doc.chunk_count = chunk_count
        await session.commit()
        await session.refresh(doc)
    return doc


async def update_document_summary(
    session: AsyncSession, doc_id: str, summary: str
) -> Optional[Document]:
    """更新文档的摘要（摘要生成完成后调用）。"""
    doc = await get_document(session, doc_id)
    if doc:
        doc.summary = summary
        await session.commit()
        await session.refresh(doc)
    return doc


async def update_document_status(
    session: AsyncSession, doc_id: str, status: str
) -> Optional[Document]:
    """更新文档的处理状态。"""
    doc = await get_document(session, doc_id)
    if doc:
        doc.status = status
        await session.commit()
        await session.refresh(doc)
    return doc


async def delete_document(session: AsyncSession, doc_id: str) -> bool:
    """删除文档记录。"""
    doc = await get_document(session, doc_id)
    if doc:
        await session.delete(doc)
        await session.commit()
        return True
    return False


# ==========================
#  对话（Conversation）CRUD
# ==========================

async def create_conversation(session: AsyncSession, title: str = "New Conversation") -> Conversation:
    """创建新对话，自动生成 UUID。"""
    conv = Conversation(
        id=str(uuid.uuid4()),
        title=title,
    )
    session.add(conv)
    await session.commit()
    await session.refresh(conv)
    return conv


async def get_conversation(session: AsyncSession, conv_id: str) -> Optional[Conversation]:
    """根据 ID 查询对话。"""
    result = await session.execute(select(Conversation).where(Conversation.id == conv_id))
    return result.scalar_one_or_none()


async def get_all_conversations(session: AsyncSession) -> List[Conversation]:
    """获取所有对话，按更新时间倒序排列。"""
    result = await session.execute(
        select(Conversation).order_by(Conversation.updated_at.desc())
    )
    return list(result.scalars().all())


async def update_conversation_title(
    session: AsyncSession, conv_id: str, title: str
) -> Optional[Conversation]:
    """更新对话标题。"""
    conv = await get_conversation(session, conv_id)
    if conv:
        conv.title = title
        conv.updated_at = datetime.utcnow()
        await session.commit()
        await session.refresh(conv)
    return conv


async def delete_conversation(session: AsyncSession, conv_id: str) -> bool:
    """删除对话（关联消息通过 ORM 级联自动删除）。"""
    conv = await get_conversation(session, conv_id)
    if conv:
        await session.delete(conv)
        await session.commit()
        return True
    return False


# ==========================
#  消息（Message）CRUD
# ==========================

async def create_message(
    session: AsyncSession,
    conversation_id: str,
    role: str,
    content: str,
    reasoning: Optional[str] = None,
    references: Optional[str] = None,
) -> Message:
    """
    创建消息记录。

    同时更新所属对话的 updated_at 时间戳，
    使对话列表能按最近活跃时间排序。
    """
    msg = Message(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        role=role,
        content=content,
        reasoning=reasoning,
        references=references,
    )
    session.add(msg)

    # 同步更新对话的最后活跃时间
    conv = await get_conversation(session, conversation_id)
    if conv:
        conv.updated_at = datetime.utcnow()

    await session.commit()
    await session.refresh(msg)
    return msg


async def get_conversation_messages(
    session: AsyncSession, conversation_id: str, limit: Optional[int] = None
) -> List[Message]:
    """获取对话的所有消息，按时间正序排列。"""
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
    """
    获取对话的最近 N 条消息（用于构建对话上下文）。

    先按时间倒序取出最新的 N 条，再反转为正序返回，
    确保传给大模型的消息保持时间顺序。
    """
    query = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    result = await session.execute(query)
    messages = list(result.scalars().all())
    return list(reversed(messages))  # 反转为时间正序


# ==========================
#  配置（Setting）CRUD
# ==========================

async def get_setting(session: AsyncSession, key: str) -> Optional[Setting]:
    """根据 key 查询单个配置项。"""
    result = await session.execute(select(Setting).where(Setting.key == key))
    return result.scalar_one_or_none()


async def get_all_settings(session: AsyncSession) -> List[Setting]:
    """获取所有用户自定义配置项。"""
    result = await session.execute(select(Setting))
    return list(result.scalars().all())


async def upsert_setting(session: AsyncSession, key: str, value: str) -> Setting:
    """插入或更新配置项。"""
    existing = await get_setting(session, key)
    if existing:
        existing.value = value
        existing.updated_at = datetime.utcnow()
    else:
        existing = Setting(key=key, value=value)
        session.add(existing)
    await session.commit()
    await session.refresh(existing)
    return existing


async def delete_setting(session: AsyncSession, key: str) -> bool:
    """删除单个配置项。"""
    setting = await get_setting(session, key)
    if setting:
        await session.delete(setting)
        await session.commit()
        return True
    return False


async def delete_all_settings(session: AsyncSession) -> int:
    """删除所有配置项，返回删除数量。"""
    result = await session.execute(delete(Setting))
    await session.commit()
    return result.rowcount
