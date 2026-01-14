from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ConversationCreate(BaseModel):
    """创建对话的请求"""
    title: Optional[str] = "New Conversation"
    system_prompt: Optional[str] = None

class ConversationUpdate(BaseModel):
    """更新对话的请求"""
    title: Optional[str] = None
    context_summary: Optional[str] = None

class ConversationResponse(BaseModel):
    """对话响应"""
    id: str
    workspace_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    system_prompt: Optional[str] = None
    context_summary: Optional[str] = None
    
    class Config:
        from_attributes = True

class ConversationWithTasksResponse(ConversationResponse):
    """带任务列表的对话响应"""
    task_count: int
    message_count: int
