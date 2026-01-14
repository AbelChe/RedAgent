"""
Conversation API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from app.core.database import get_db
from app.models.base import Conversation, Workspace, Task, Message
from app.schemas.conversation import (
    ConversationCreate,
    ConversationUpdate,
    ConversationResponse,
    ConversationWithTasksResponse
)
import uuid

router = APIRouter()

@router.post("/workspaces/{workspace_id}/conversations", response_model=ConversationResponse)
async def create_conversation(
    workspace_id: str,
    conversation_data: ConversationCreate,
    db: AsyncSession = Depends(get_db)
):
    """创建新对话"""
    # 验证workspace存在
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # 创建conversation
    conversation = Conversation(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        title=conversation_data.title,
        system_prompt=conversation_data.system_prompt
    )
    
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    
    return conversation

@router.get("/workspaces/{workspace_id}/conversations", response_model=List[ConversationWithTasksResponse])
async def list_conversations(
    workspace_id: str,
    db: AsyncSession = Depends(get_db)
):
    """列出workspace下所有conversations"""
    # 验证workspace存在
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # 查询conversations并统计任务数
    result = await db.execute(
        select(
            Conversation,
            func.count(Task.id).label('task_count'),
            func.count(Message.id).label('message_count')
        )
        .outerjoin(Task, Task.conversation_id == Conversation.id)
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.workspace_id == workspace_id)
        .group_by(Conversation.id)
        .order_by(Conversation.updated_at.desc())
    )
    
    conversations = []
    for conv, task_count, message_count in result:
        conv_dict = {
            **conv.__dict__,
            'task_count': task_count or 0,
            'message_count': message_count or 0
        }
        conversations.append(ConversationWithTasksResponse(**conv_dict))
    
    return conversations

@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取对话详情"""
    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    return conversation

@router.patch("/conversations/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: str,
    conversation_data: ConversationUpdate,
    db: AsyncSession = Depends(get_db)
):
    """更新对话"""
    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if conversation_data.title is not None:
        conversation.title = conversation_data.title
    if conversation_data.context_summary is not None:
        conversation.context_summary = conversation_data.context_summary
    
    await db.commit()
    await db.refresh(conversation)
    
    return conversation

@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db)
):
    """删除对话（级联删除tasks和messages）"""
    conversation = await db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    await db.delete(conversation)
    await db.commit()
    
    return {"message": "Conversation deleted successfully"}
