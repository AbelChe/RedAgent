from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    mode: str = "sandbox"
    config: Dict[str, Any] = {}
    code_server_url: Optional[str] = "http://localhost:8080"  # User's Code Server URL
    code_server_password: Optional[str] = None  # Optional custom password

class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    mode: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    code_server_url: Optional[str] = None
    code_server_password: Optional[str] = None

class WorkspaceBatchDelete(BaseModel):
    ids: List[str]

class WorkspaceResponse(BaseModel):
    """工作空间响应模型"""
    id: str
    name: str
    description: Optional[str] = None
    mode: str
    config: Dict[str, Any]
    volume_name: Optional[str] = None
    created_at: datetime
    
    # Service Stack Info
    status: Optional[str] = "stopped"
    code_server_url: Optional[str] = None  # User-configured Code Server URL
    mcp_endpoint: Optional[str] = None
    code_server_endpoint: Optional[str] = None
    mcp_container_id: Optional[str] = None
    code_container_id: Optional[str] = None
    
    # Statistics
    stats: Dict[str, Any] = {}

    class Config:
        from_attributes = True

class CommandRunRequest(BaseModel):
    """直接执行命令请求"""
    command: str
