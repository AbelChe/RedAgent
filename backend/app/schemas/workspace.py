from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

class WorkspaceCreate(BaseModel):
    name: str
    mode: str = "sandbox"
    config: Dict[str, Any] = {}

class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None

class WorkspaceBatchDelete(BaseModel):
    ids: List[str]

class WorkspaceResponse(BaseModel):
    """工作空间响应模型"""
    id: str
    name: str
    mode: str
    config: Dict[str, Any]
    volume_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
