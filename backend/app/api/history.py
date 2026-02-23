"""
聊天历史 API 模块

提供对话消息历史的查询接口：
- GET /api/history/messages/{conversation_id} - 获取指定对话的消息记录
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.db import crud


router = APIRouter()


@router.get("/messages/{conversation_id}")
async def get_conversation_history(
    conversation_id: str,
    limit: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
):
    """
    获取指定对话的消息历史记录。

    Args:
        conversation_id: 对话 ID
        limit: 可选的消息数量限制
    """
    conv = await crud.get_conversation(session, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = await crud.get_conversation_messages(session, conversation_id, limit=limit)

    return {
        "conversation_id": conversation_id,
        "messages": [msg.to_dict() for msg in messages],
    }
