from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class JobStatus(str):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class JobCreate(BaseModel):
    command: str
    workspace_id: str
    task_id: Optional[str] = None
    priority: Optional[int] = Field(5, ge=0, le=10)

class JobResponse(BaseModel):
    id: str
    command: str
    status: str
    priority: int
    workspace_id: str
    task_id: Optional[str] = None
    agent_id: Optional[str] = None
    exit_code: Optional[int] = None
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    output_files: Optional[List[str]] = None
    error_message: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
