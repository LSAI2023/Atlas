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
    message: str
    conversation_id: Optional[str] = None
    document_ids: Optional[List[str]] = None
    model: Optional[str] = None


class ConversationCreate(BaseModel):
    title: str = "New Conversation"


async def generate_sse_stream(
    query: str,
    conversation_id: str,
    session: AsyncSession,
    document_ids: Optional[List[str]] = None,
    model: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Generate SSE stream for chat response."""
    # Get conversation history
    history_messages = []
    messages = await crud.get_recent_messages(session, conversation_id)
    for msg in messages:
        history_messages.append({
            "role": msg.role,
            "content": msg.content,
        })

    # Save user message
    await crud.create_message(
        session=session,
        conversation_id=conversation_id,
        role="user",
        content=query,
    )

    # Stream response
    full_content = []
    full_reasoning = []
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
            # SSE format: data: {json}\n\n
            yield f"data: {json.dumps({'content': content, 'reasoning': reasoning, 'done': False})}\n\n"

        # Save assistant message (content only, reasoning is ephemeral)
        complete_response = "".join(full_content)
        await crud.create_message(
            session=session,
            conversation_id=conversation_id,
            role="assistant",
            content=complete_response,
        )

        # Send done signal
        yield f"data: {json.dumps({'content': '', 'reasoning': '', 'done': True})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"


@router.post("")
async def chat(
    request: ChatRequest,
    session: AsyncSession = Depends(get_session),
):
    """Send a chat message with RAG and get streaming response via SSE."""
    conversation_id = request.conversation_id

    # Create new conversation if not provided
    if not conversation_id:
        conv = await crud.create_conversation(session)
        conversation_id = conv.id
    else:
        # Verify conversation exists
        conv = await crud.get_conversation(session, conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

    return StreamingResponse(
        generate_sse_stream(
            query=request.message,
            conversation_id=conversation_id,
            session=session,
            document_ids=request.document_ids,
            model=request.model,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Conversation-Id": conversation_id,
        },
    )


@router.post("/conversations")
async def create_conversation(
    request: ConversationCreate,
    session: AsyncSession = Depends(get_session),
):
    """Create a new conversation."""
    conv = await crud.create_conversation(session, title=request.title)
    return conv.to_dict()


@router.get("/conversations")
async def list_conversations(session: AsyncSession = Depends(get_session)):
    """Get list of all conversations."""
    conversations = await crud.get_all_conversations(session)
    return {"conversations": [conv.to_dict() for conv in conversations]}


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get conversation details with messages."""
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
    """Delete a conversation and all its messages."""
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
    """Update conversation title."""
    conv = await crud.update_conversation_title(session, conversation_id, request.title)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return conv.to_dict()


@router.get("/models")
async def list_models():
    """List available Ollama models."""
    models = await ollama_service.list_models()
    return {
        "models": models,
        "default": ollama_service.chat_model,
    }
