from sqlalchemy import Column, String, Integer, DateTime, Enum as SQLEnum, ForeignKey, Text, Index, JSON
from sqlalchemy.orm import relationship
from app.models.base import Base
from datetime import datetime
import enum

class JobStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class Job(Base):
    __tablename__ = "jobs"
    
    id = Column(String, primary_key=True)
    command = Column(Text, nullable=False)
    status = Column(SQLEnum(JobStatus), default=JobStatus.PENDING, nullable=False)
    priority = Column(Integer, default=5)
    
    # 所有权
    user_id = Column(String, nullable=True)  # 暂时可选，后续添加认证后必填
    workspace_id = Column(String, ForeignKey('workspaces.id'), nullable=False)
    task_id = Column(String, ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True, index=True)  # Link to task
    
    # 执行信息
    celery_task_id = Column(String, nullable=True)  # Celery任务ID
    agent_id = Column(String, nullable=True)  # Worker hostname
    exit_code = Column(Integer, nullable=True)
    stdout = Column(Text, nullable=True)
    stderr = Column(Text, nullable=True)
    output_files = Column(JSON, nullable=True)  # List of file paths in workspace volume
    error_message = Column(Text, nullable=True)
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # 关系
    workspace = relationship("Workspace", back_populates="jobs")
    task = relationship("Task")
    
    # 索引
    __table_args__ = (
        Index('idx_workspace_status', 'workspace_id', 'status'),
        Index('idx_created_at', 'created_at'),
    )
    
    def __repr__(self):
        return f"<Job {self.id} {self.status}>"
    
    def to_dict(self):
        return {
            "id": self.id,
            "command": self.command,
            "status": self.status.value,
            "priority": self.priority,
            "workspace_id": self.workspace_id,
            "agent_id": self.agent_id,
            "exit_code": self.exit_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
