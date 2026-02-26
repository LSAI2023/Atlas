"""
对话 API 模块

提供聊天相关的 REST 接口：
- POST /api/chat           - 发送消息并获取流式 SSE 响应
- POST /api/chat/conversations  - 创建新对话
- GET  /api/chat/conversations  - 获取对话列表
- GET  /api/chat/conversations/{id}  - 获取对话详情（含消息记录）
- PUT  /api/chat/conversations/{id}  - 更新对话标题
- DELETE /api/chat/conversations/{id} - 删除对话
- GET  /api/chat/models     - 获取可用模型列表
"""

import json
from typing import AsyncGenerator, Optional, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.db import crud
from app.core import rag_service
from app.core.ollama import ollama_service


router = APIRouter()


class ChatRequest(BaseModel):
    """聊天请求体"""
    message: str                                    # 用户消息内容
    conversation_id: Optional[str] = None           # 对话 ID（为空时自动创建新对话）
    knowledge_base_ids: Optional[List[str]] = None  # 关联的知识库 ID 列表（用于 RAG 检索）
    model: Optional[str] = None                     # 指定使用的模型（为空时使用默认模型）


class ConversationCreate(BaseModel):
    """创建对话请求体"""
    title: str = "New Conversation"


async def generate_sse_stream(
    query: str,
    conversation_id: str,
    session: AsyncSession,
    document_ids: Optional[List[str]] = None,
    model: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """
    生成 SSE（Server-Sent Events）流式响应。

    处理流程：
    1. 从数据库加载对话历史记录
    2. 保存用户消息到数据库
    3. 调用 RAG 服务流式生成回答
    4. 逐块通过 SSE 推送给前端
    5. 生成完成后保存助手消息到数据库

    SSE 数据格式：data: {"content": "...", "reasoning": "...", "done": false}\n\n
    """
    # 加载对话历史记录，用于上下文续接
    history_messages = []
    messages = await crud.get_recent_messages(session, conversation_id)
    for msg in messages:
        history_messages.append({
            "role": msg.role,
            "content": msg.content,
        })

    # 将用户消息持久化到数据库
    await crud.create_message(
        session=session,
        conversation_id=conversation_id,
        role="user",
        content=query,
    )

    # 流式生成并推送回答
    full_content = []     # 累积完整回答内容
    full_reasoning = []   # 累积完整思考过程
    try:
        async for chunk in rag_service.generate_stream(
            query=query,
            history_messages=history_messages,
            document_ids=document_ids,
            model=model,
        ):
            content = chunk.get("content", "")
            reasoning = chunk.get("reasoning", "")
            if content:
                full_content.append(content)
            if reasoning:
                full_reasoning.append(reasoning)
            # 以 SSE 格式推送每个片段
            yield f"data: {json.dumps({'content': content, 'reasoning': reasoning, 'done': False})}\n\n"

        # 生成完毕，将完整回答保存到数据库（包含思考过程）
        complete_response = "".join(full_content)
        complete_reasoning = "".join(full_reasoning) or None
        await crud.create_message(
            session=session,
            conversation_id=conversation_id,
            role="assistant",
            content=complete_response,
            reasoning=complete_reasoning,
        )

        # 发送完成信号
        yield f"data: {json.dumps({'content': '', 'reasoning': '', 'done': True})}\n\n"

    except Exception as e:
        # 发生错误时通过 SSE 推送错误信息
        yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"


@router.post("")
async def chat(
    request: ChatRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    发送聊天消息，返回流式 SSE 响应。

    如果未提供 conversation_id，自动创建新对话。
    如果提供了 knowledge_base_ids，将使用 RAG 模式基于文档回答。
    """
    conversation_id = request.conversation_id

    # 没有对话 ID 时，自动创建新对话
    if not conversation_id:
        conv = await crud.create_conversation(session)
        conversation_id = conv.id
    else:
        # 验证对话是否存在
        conv = await crud.get_conversation(session, conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

    # 将知识库 ID 解析为具体的文档 ID 列表
    document_ids = None
    if request.knowledge_base_ids:
        document_ids = await crud.get_document_ids_for_knowledge_bases(
            session, request.knowledge_base_ids
        )
        if not document_ids:
            document_ids = None  # 知识库中无文档时退回到普通对话模式

    # 返回 SSE 流式响应
    return StreamingResponse(
        generate_sse_stream(
            query=request.message,
            conversation_id=conversation_id,
            session=session,
            document_ids=document_ids,
            model=request.model,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Conversation-Id": conversation_id,  # 在响应头中返回对话 ID
        },
    )


@router.post("/conversations")
async def create_conversation(
    request: ConversationCreate,
    session: AsyncSession = Depends(get_session),
):
    """创建新对话。"""
    conv = await crud.create_conversation(session, title=request.title)
    return conv.to_dict()


@router.get("/conversations")
async def list_conversations(session: AsyncSession = Depends(get_session)):
    """获取所有对话列表，按更新时间倒序排列。"""
    conversations = await crud.get_all_conversations(session)
    return {"conversations": [conv.to_dict() for conv in conversations]}


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    session: AsyncSession = Depends(get_session),
):
    """获取对话详情，包含完整的消息记录。"""
    conv = await crud.get_conversation(session, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = await crud.get_conversation_messages(session, conversation_id)

    return {
        **conv.to_dict(),
        "messages": [msg.to_dict() for msg in messages],
    }


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    session: AsyncSession = Depends(get_session),
):
    """删除对话及其所有消息记录。"""
    conv = await crud.get_conversation(session, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await crud.delete_conversation(session, conversation_id)

    return {"message": "Conversation deleted successfully"}


@router.put("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    request: ConversationCreate,
    session: AsyncSession = Depends(get_session),
):
    """更新对话标题。"""
    conv = await crud.update_conversation_title(session, conversation_id, request.title)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return conv.to_dict()


@router.get("/models")
async def list_models():
    """获取 Ollama 中可用的对话模型列表及当前默认模型。"""
    models = await ollama_service.list_models()
    return {
        "models": models,
        "default": ollama_service.chat_model,
    }
