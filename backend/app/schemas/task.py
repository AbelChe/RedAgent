from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Literal
from datetime import datetime
from app.schemas.command import CommandResult

class TaskCreateRequest(BaseModel):
    content: str = Field(..., description="任务内容/指令")
    workspace_id: Optional[str] = Field(None, description="工作空间ID")
    mode: Literal["ask", "planning", "agent"] = Field("agent", description="运行模式")

class TaskResponse(BaseModel):
    id: str
    workspace_id: str
    command: str
    mode: str = 'simple'
    status: Literal['pending', 'running', 'completed', 'failed', 'cancelled', 'waiting_approval']
    result: Optional[Any] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
