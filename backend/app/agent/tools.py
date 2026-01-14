"""
Agent 工具定义

定义 AI Agent 可以调用的工具，包括命令执行、文件操作等。
所有工具调用都会被审计记录。
"""

import asyncio
from typing import Optional, Dict, Any, Tuple
from langchain_core.tools import tool
from app.executors.sandbox import SandboxExecutor
from app.schemas.command import CommandResult

import contextvars
import logging

logger = logging.getLogger("agent.tools")

# 上下文变量：存储当前任务和工作空间信息
current_task_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_task_id", default=None
)
current_workspace_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_workspace_id", default=None
)

# 执行器注册表
_executor_context: Dict[str, SandboxExecutor] = {}


def set_executor_context(
    task_id: str,
    executor: SandboxExecutor,
    workspace_id: Optional[str] = None
):
    """
    设置当前执行上下文
    
    Args:
        task_id: 任务 ID
        executor: 沙箱执行器实例
        workspace_id: 工作空间 ID（用于卷挂载）
    """
    _executor_context[task_id] = executor
    current_task_id.set(task_id)
    if workspace_id:
        current_workspace_id.set(workspace_id)


def clear_executor_context(task_id: str):
    """清理执行上下文"""
    _executor_context.pop(task_id, None)


@tool
async def execute_command(command: str) -> str:
    """
    在渗透测试沙箱中执行 shell 命令。
    使用此工具运行 nmap、curl、gobuster 等工具。
    长时间运行的扫描工具会自动提交到任务队列异步执行。
    返回命令的标准输出和标准错误，或任务队列ID。
    """
    task_id = current_task_id.get()
    workspace_id = current_workspace_id.get()
    executor = _executor_context.get(task_id) if task_id else None
    
    if not executor:
        return f"错误: 未找到活动的执行器 (任务 ID: {task_id})"

    # 安全：基础输入验证
    if not command or not command.strip():
        return "错误: 命令不能为空"
    if len(command) > 5000:
        return "错误: 命令过长 (最大 5000 字符)"

    # 检查是否为异步工具
    from app.utils.command_parser import extract_tool_name
    from app.config.tool_config import is_async_tool
    
    tool_name = extract_tool_name(command)
    if tool_name and is_async_tool(tool_name):
        # 异步工具：提交到任务队列
        try:
            from app.core.database import AsyncSessionLocal
            from app.services.jobs_service import JobsService
            
            async with AsyncSessionLocal() as session:
                jobs_service = JobsService(session)
                job = await jobs_service.create_job(
                    workspace_id=workspace_id or task_id,
                    command=command,
                    priority=5,
                    agent_id="agent",
                    task_id=task_id
                )
                
                logger.info(f"[异步] 任务 {task_id} 命令已提交到队列: Job ID {job.id}")
                
                return (
                    f"✅ 扫描任务已提交到队列执行\n\n"
                    f"**任务ID**: {job.id[:8]}...\n"
                    f"**工具**: {tool_name}\n"
                    f"**命令**: {command}\n"
                    f"**状态**: 等待执行\n\n"
                    f"💡 此工具需要较长时间运行，已在后台异步执行。\n"
                    f"您可以在右侧「Queue」面板查看任务进度。"
                )
        except Exception as e:
            logger.error(f"[异步] 提交任务到队列失败: {str(e)}")
            # 失败时回退到同步执行
            logger.warning(f"[异步] 回退到同步执行模式")

    # 同步执行（快速工具或异步失败）
    try:
        logger.info(f"[同步] 任务 {task_id} 工作空间 {workspace_id} 执行: {command}")
        
        # 执行命令，传入工作空间 ID 以挂载对应的卷
        result: CommandResult = await executor.execute(
            command,
            workspace_id=workspace_id
        )
        
        # 持久化到数据库用于审计
        try:
            from app.core.database import AsyncSessionLocal
            from app.models.base import CommandLog
            
            async with AsyncSessionLocal() as session:
                log_entry = CommandLog(
                    task_id=task_id,
                    command=command,
                    exit_code=result.exit_code,
                    stdout=result.stdout,
                    stderr=result.stderr
                )
                session.add(log_entry)
                await session.commit()
                logger.info(f"[审计] 任务 {task_id} 命令已记录到数据库")
        except Exception as log_err:
            logger.error(f"[审计] 记录命令到数据库失败: {str(log_err)}")
        
        logger.info(f"[同步] 任务 {task_id} 命令完成，退出码 {result.exit_code}")

        # 格式化输出
        output = f"退出码: {result.exit_code}\n"
        output += f"标准输出:\n{result.stdout}\n"
        if result.stderr:
            output += f"标准错误:\n{result.stderr}\n"
            
        return output
    except Exception as e:
        logger.error(f"[同步] 执行命令时出错: {str(e)}")
        return f"执行错误: {str(e)}"


@tool
async def lookup_tool_usage(tool_name: str) -> str:
    """
    Search for usage guide and examples for a specific tool from the Knowledge Base.
    Use this when you need detailed syntax, options, or examples for a pentest tool (e.g., nmap, ffuf).
    """
    from app.services.connection_manager import manager
    
    if not manager.mcp_connection:
        return "Error: Knowledge Base (MCP) is disconnected. Please rely on your internal knowledge or use `execute_command` with `--help`."
    
    try:
        # Prompt names in MCP are prefixed with "usage-"
        prompt_name = f"usage-{tool_name.lower().strip()}"
        content = await manager.get_mcp_prompt(prompt_name)
        
        if not content:
            return f"No usage guide found for '{tool_name}'. Try running `{tool_name} --help`."
            
        return f"## Usage Guide for {tool_name}\n\n{content}"
    except Exception as e:
        logger.error(f"Failed to fetch tool usage: {e}")
        return f"Error retrieving usage for {tool_name}: {e}"
