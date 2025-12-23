from sqlalchemy import Column, String, JSON, ForeignKey, DateTime, Integer, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import uuid

def generate_uuid():
    return str(uuid.uuid4())

class Workspace(Base):
    """工作空间模型"""
    __tablename__ = "workspaces"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, index=True)
    mode = Column(String, default="sandbox")  # 'sandbox' | 'agent'
    config = Column(JSON, default={})
    volume_name = Column(String, nullable=True)  # Docker 卷名称
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tasks = relationship("Task", back_populates="workspace")
    messages = relationship("Message", back_populates="workspace")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=generate_uuid)
    workspace_id = Column(String, ForeignKey("workspaces.id"))
    command = Column(String)
    mode = Column(String, default="simple") # 'simple' or 'agent'
    status = Column(String, default="pending")  # pending, running, completed, failed, waiting_approval
    result = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    workspace = relationship("Workspace", back_populates="tasks")
    command_logs = relationship("CommandLog", back_populates="task")

class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=generate_uuid)
    workspace_id = Column(String, ForeignKey("workspaces.id"))
    role = Column(String)  # user, assistant, system
    content = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    workspace = relationship("Workspace", back_populates="messages")

class CommandLog(Base):
    """
    Detailed audit log for commands executed in the sandbox.
    """
    __tablename__ = "command_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"))
    command = Column(Text)
    exit_code = Column(Integer)
    stdout = Column(Text)
    stderr = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    task = relationship("Task", back_populates="command_logs")
