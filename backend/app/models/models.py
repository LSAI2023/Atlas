"""
数据库模型定义模块

使用 SQLAlchemy ORM 定义四个核心数据表：
- KnowledgeBase: 知识库（一个知识库包含多个文档）
- Document: 文档（属于某个知识库，上传后会被分片向量化）
- Conversation: 对话（一个对话包含多条消息）
- Message: 消息（属于某个对话，分为 user/assistant 两种角色）

关系说明：
- KnowledgeBase 1:N Document（级联删除）
- Conversation 1:N Message（级联删除）
"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship, DeclarativeBase


class Base(DeclarativeBase):
    """SQLAlchemy 声明式基类，所有模型继承自此类。"""
    pass


class KnowledgeBase(Base):
    """知识库表：存储知识库的基本信息。"""
    __tablename__ = "knowledge_bases"

    id = Column(String, primary_key=True)           # UUID 主键
    name = Column(String, nullable=False)            # 知识库名称
    description = Column(Text, default="")           # 知识库描述
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 一对多关系：一个知识库包含多个文档，级联删除
    documents = relationship("Document", back_populates="knowledge_base", cascade="all, delete-orphan")

    def to_dict(self):
        """转换为字典（用于 API 响应序列化）。"""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Document(Base):
    """文档表：存储上传文档的元数据信息。"""
    __tablename__ = "documents"

    id = Column(String, primary_key=True)            # UUID 主键
    filename = Column(String, nullable=False)         # 原始文件名
    file_type = Column(String, nullable=False)        # 文件类型（pdf/docx/txt/markdown）
    file_size = Column(Integer)                       # 文件大小（字节）
    file_hash = Column(String, nullable=True)          # 文件内容 SHA-256 哈希，同知识库内唯一
    chunk_count = Column(Integer, default=0)          # 分片数量
    summary = Column(Text, nullable=True)              # 文档摘要（由 LLM 生成）
    status = Column(String, default="completed")       # 文档状态：pending/processing/completed/failed
    knowledge_base_id = Column(String, ForeignKey("knowledge_bases.id"), nullable=False)  # 所属知识库
    created_at = Column(DateTime, default=datetime.utcnow)

    # 多对一关系：文档属于某个知识库
    knowledge_base = relationship("KnowledgeBase", back_populates="documents")

    def to_dict(self):
        """转换为字典（用于 API 响应序列化）。"""
        return {
            "id": self.id,
            "filename": self.filename,
            "file_type": self.file_type,
            "file_size": self.file_size,
            "file_hash": self.file_hash,
            "chunk_count": self.chunk_count,
            "summary": self.summary,
            "status": self.status,
            "knowledge_base_id": self.knowledge_base_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Conversation(Base):
    """对话表：存储对话的基本信息。"""
    __tablename__ = "conversations"

    id = Column(String, primary_key=True)            # UUID 主键
    title = Column(String, default="New Conversation")  # 对话标题
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 一对多关系：一个对话包含多条消息，级联删除
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")

    def to_dict(self):
        """转换为字典（用于 API 响应序列化）。"""
        return {
            "id": self.id,
            "title": self.title,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Message(Base):
    """消息表：存储对话中的每条消息。"""
    __tablename__ = "messages"

    id = Column(String, primary_key=True)            # UUID 主键
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False)  # 所属对话
    role = Column(String, nullable=False)             # 消息角色：'user'（用户）| 'assistant'（助手）
    content = Column(Text, nullable=False)            # 消息内容
    reasoning = Column(Text, nullable=True)            # 模型思考过程（仅 assistant 消息）
    references = Column(Text, nullable=True)            # 引用信息 JSON（仅 RAG 模式的 assistant 消息）
    created_at = Column(DateTime, default=datetime.utcnow)

    # 多对一关系：消息属于某个对话
    conversation = relationship("Conversation", back_populates="messages")

    def to_dict(self):
        """转换为字典（用于 API 响应序列化）。"""
        result = {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "role": self.role,
            "content": self.content,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if self.reasoning:
            result["reasoning"] = self.reasoning
        if self.references:
            import json as _json
            try:
                result["references"] = _json.loads(self.references)
            except (ValueError, TypeError):
                result["references"] = []
        return result


class Setting(Base):
    """配置表：键值对存储用户自定义配置项。"""
    __tablename__ = "settings"

    key = Column(String, primary_key=True)    # 配置项名称
    value = Column(Text, nullable=False)       # 配置项值（JSON 字符串）
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
