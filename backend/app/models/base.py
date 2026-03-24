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
    description = Column(String, nullable=True)
    mode = Column(String, default="sandbox")  # 'sandbox' | 'agent'
    config = Column(JSON, default={})
    
    # DEPRECATED: The following fields are no longer used after removing auto-deployment
    # They are kept for backward compatibility with existing workspaces
    volume_name = Column(String, nullable=True)  # DEPRECATED: Docker volume name
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # MCP Connection Credentials (for user-deployed MCP servers)
    mcp_ws_url = Column(String, nullable=True)  # WebSocket connection URL
    mcp_token = Column(String, nullable=True)   # Authentication token
    
    # User-configured Code Server (for IDE embedding)
    code_server_url = Column(String, nullable=True, default="http://localhost:8080")  # User's Code Server URL
    
    # DEPRECATED: Legacy auto-deployment fields (no longer used)
    mcp_container_id = Column(String, nullable=True)  # DEPRECATED
    code_container_id = Column(String, nullable=True)  # DEPRECATED
    mcp_endpoint = Column(String, nullable=True)  # DEPRECATED
    code_server_endpoint = Column(String, nullable=True)  # DEPRECATED
    
    status = Column(String, default="created")  # created, running (legacy), error, stopped


    tasks = relationship("Task", back_populates="workspace")
    messages = relationship("Message", back_populates="workspace")
    jobs = relationship("Job", back_populates="workspace", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="workspace", cascade="all, delete-orphan")


class Conversation(Base):
    """对话会话模型 - 一个workspace可以有多个conversation"""
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=generate_uuid)
    workspace_id = Column(String, ForeignKey("workspaces.id"), nullable=False)
    
    # 对话元数据
    title = Column(String, default="New Conversation")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 对话上下文
    system_prompt = Column(Text, nullable=True)
    context_summary = Column(Text, nullable=True)  # AI生成的摘要
    
    # 关系
    workspace = relationship("Workspace", back_populates="conversations")
    tasks = relationship("Task", back_populates="conversation", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="conversation")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=generate_uuid)
    workspace_id = Column(String, ForeignKey("workspaces.id"))
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=True)  # Nullable for migration
    command = Column(String)
    mode = Column(String, default="simple") # 'simple' or 'agent'
    status = Column(String, default="pending")  # pending, running, completed, failed, waiting_approval
    result = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    workspace = relationship("Workspace", back_populates="tasks")
    conversation = relationship("Conversation", back_populates="tasks")
    command_logs = relationship("CommandLog", back_populates="task")

class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=generate_uuid)
    workspace_id = Column(String, ForeignKey("workspaces.id"))
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=True)
    role = Column(String)  # user, assistant, system
    content = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    workspace = relationship("Workspace", back_populates="messages")
    conversation = relationship("Conversation", back_populates="messages")

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

class ToolRun(Base):
    """
    Persisted tool execution runs for the logs panel.
    """
    __tablename__ = "tool_runs"

    id = Column(String, primary_key=True)  # runId from MCP
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    task_id = Column(String, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True)  # Link to task
    tool = Column(String)
    command = Column(Text)
    logs = Column(JSON, default=[])  # Array of log strings
    status = Column(String, default="running")  # running, completed, failed
    start_time = Column(DateTime(timezone=True), server_default=func.now())

    workspace = relationship("Workspace")
    task = relationship("Task")

