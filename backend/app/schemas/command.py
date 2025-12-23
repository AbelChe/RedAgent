from pydantic import BaseModel
from typing import Optional, Dict, Any, Literal

class CommandResult(BaseModel):
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    
    @property
    def output(self) -> str:
        """Helper to get combined output"""
        return self.stdout + self.stderr

class TaskStatusUpdate(BaseModel):
    task_id: str
    status: Literal['pending', 'running', 'completed', 'failed', 'cancelled', 'waiting_approval']
    result: Optional[CommandResult] = None
    error: Optional[str] = None
    progress: Optional[int] = None # 0-100
    metadata: Optional[Dict[str, Any]] = None
