"""
沙箱执行器 - 在隔离的 Docker 容器中执行命令

本模块提供安全的命令执行环境，支持：
- 动态容器创建（按工具选择镜像）
- 工作空间卷挂载（多容器共享）
- 安全加固（只读文件系统、能力限制等）
"""

import docker
import asyncio
from typing import Optional
from functools import partial
from app.executors.base import BaseExecutor
from app.schemas.command import CommandResult
from app.services.container_registry import (
    get_container_config,
    extract_tool_from_command,
    ContainerConfig,
)
from app.utils.output_injection import (
    inject_output_flags,
    create_tool_output_directory,
)
from app.services.workspace_manager import workspace_manager
import logging

logger = logging.getLogger(__name__)


# 安全配置常量
SECURITY_OPTIONS = ["no-new-privileges:true"]
DEFAULT_USER = "1000:1000"
TMPFS_CONFIG = {"/tmp": "size=100m,noexec,nosuid"}


class SandboxExecutor(BaseExecutor):
    """
    沙箱执行器
    
    在隔离的 Docker 容器中执行命令，支持：
    - 工作空间卷挂载
    - 按工具动态选择容器镜像
    - 安全加固配置
    """
    
    def __init__(self):
        self.client = docker.from_env()
        # 向后兼容：保留固定容器名用于调试
        self.legacy_container_name = "pentest_sandbox_debug"
    
    async def execute(
        self,
        command: str,
        workspace_id: Optional[str] = None,
        **kwargs
    ) -> CommandResult:
        """
        执行命令
        
        Args:
            command: 要执行的命令
            workspace_id: 工作空间 ID（可选，用于卷挂载）
            
        Returns:
            CommandResult 包含执行结果
        """
        from app.services.connection_manager import manager
        
        # 1. Try MCP Delegation (Modern Architecture)
        if manager.mcp_connection:
            try:
                logger.info(f"📡 [DELEGATION-START] Sending to Edge Node: {command}")
                # Call 'execute_command' tool on MCP Server
                mcp_result = await manager.call_mcp_tool(
                    "execute_command", 
                    {
                        "command": command,
                        "workspace_id": workspace_id
                    },
                    timeout=3600 # Long timeout for scans
                )
                
                # Parse MCP Result (Standard Schema)
                content_list = mcp_result.get("content", [])
                stdout = ""
                for item in content_list:
                    if item.get("type") == "text":
                        stdout += item.get("text", "")
                
                is_error = mcp_result.get("isError", False)
                return CommandResult(
                    success=not is_error,
                    exit_code=1 if is_error else 0, # MCP doesn't strictly return exit code in standard response
                    stdout=stdout,
                    stderr=""
                )
            except Exception as e:
                logger.error(f"MCP Execution Failed: {e}. Falling back to local.")
                # Fallback to local if MCP call fails (optional, or just fail)
                # return CommandResult(success=False, exit_code=-1, stdout="", stderr=f"MCP Error: {e}")
        
        # 2. Local Fallback (Legacy / Standalone Mode)
        logger.info("Using Local Docker Execution (No MCP connected)")
        loop = asyncio.get_running_loop()
        
        try:
            result = await loop.run_in_executor(
                None,
                partial(self._execute_sync, command, workspace_id)
            )
            return result
        except Exception as e:
            logger.error(f"命令执行失败: {e}")
            return CommandResult(
                success=False,
                exit_code=-1,
                stdout="",
                stderr=str(e)
            )
    
    def _execute_sync(
        self,
        command: str,
        workspace_id: Optional[str] = None
    ) -> CommandResult:
        """
        同步执行命令（在线程池中运行）
        
        如果提供 workspace_id，创建临时容器并挂载工作空间卷。
        否则使用旧版固定容器（向后兼容）。
        """
        if workspace_id:
            return self._execute_in_ephemeral_container(command, workspace_id)
        else:
            return self._execute_in_legacy_container(command)
    
    def _execute_in_ephemeral_container(
        self,
        command: str,
        workspace_id: str
    ) -> CommandResult:
        """
        在临时容器中执行命令
        
        特性：
        - 按工具选择合适的容器镜像
        - 挂载工作空间卷
        - 应用安全加固配置
        - 执行完毕自动销毁容器
        """
        # 根据命令选择容器配置
        tool_name = extract_tool_from_command(command)
        config = get_container_config(tool_name)
        
        logger.info(f"工作空间 {workspace_id}: 使用镜像 {config.image} 执行 {tool_name}")
        
        # 确保工作空间卷存在
        if not workspace_manager.volume_exists(workspace_id):
            workspace_manager.create_workspace_volume(workspace_id)
        
        # Create tool-specific output directory and inject output flags
        create_tool_output_directory(self.client, workspace_id, tool_name, workspace_manager.WORKSPACE_MOUNT_PATH)
        modified_command, output_files = inject_output_flags(command, tool_name, workspace_manager.WORKSPACE_MOUNT_PATH)
        
        if output_files:
            logger.info(f"📁 Output files will be saved to: {output_files}")
        
        # 构建容器配置
        volumes = workspace_manager.get_container_mount_config(workspace_id)
        
        try:
            # 尝试解析命令为列表，避免 Shell 注入
            import shlex
            cmd_list = shlex.split(modified_command)
        except Exception:
            # 如果解析失败（例如包含复杂未闭合引号），降级为 Shell 执行
            # 使用 /bin/sh 兼容性更好，避免依赖 bash
            cmd_list = ["/bin/sh", "-c", modified_command]

        # 安全配置
        EXECUTION_TIMEOUT = 3600  # 最大执行时间：1小时
        MAX_LOG_SIZE = 10 * 1024 * 1024  # 日志限制：10MB
        
        container = None
        try:
            # 创建并启动容器（后台模式）
            container = self.client.containers.run(
                image=config.image,
                command=cmd_list,
                volumes=volumes,
                working_dir=workspace_manager.WORKSPACE_MOUNT_PATH,
                user=DEFAULT_USER,
                read_only=True,
                tmpfs=TMPFS_CONFIG,
                security_opt=SECURITY_OPTIONS,
                cap_drop=["ALL"],
                cap_add=config.capabilities,
                mem_limit=config.memory_limit,
                pids_limit=config.pids_limit,
                network_mode="bridge",
                remove=False,  # 手动管理生命周期以确保能读取日志
                detach=True,   # 后台运行，避免阻塞
                stdout=True,
                stderr=True,
            )
            
            # 等待容器结束（带超时）
            try:
                result_status = container.wait(timeout=EXECUTION_TIMEOUT)
                exit_code = result_status.get('StatusCode', -1)
            except Exception as e:
                # 超时或等待失败
                logger.error(f"容器执行超时或异常: {e}")
                container.kill()
                return CommandResult(
                    success=False,
                    exit_code=-1,
                    stdout="",
                    stderr=f"执行超时（限制 {EXECUTION_TIMEOUT}秒）或被终止: {str(e)}"
                )

            # 读取日志（带大小限制）
            # 注意：logs() 返回 bytes
            logs = container.logs(stdout=True, stderr=True, stream=False)
            
            # 手动解码并截断
            if len(logs) > MAX_LOG_SIZE:
                logs = logs[:MAX_LOG_SIZE] + b"\n... [Output Truncated] ..."
                
            output = logs.decode('utf-8', errors='replace')
            
            # 简单区分 stdout/stderr (Docker API 混合流较难精确拆分，此处简化处理)
            # 若需精确拆分需使用 demux=True streaming 方式，较复杂
            
            return CommandResult(
                success=(exit_code == 0),
                exit_code=exit_code,
                stdout=output,
                stderr="" if exit_code == 0 else "Command failed (check stdout for details)",
                output_files=output_files
            )
            
        except docker.errors.ImageNotFound:
            return CommandResult(
                success=False,
                exit_code=-1,
                stdout="",
                stderr=f"镜像未找到: {config.image}"
            )
        except docker.errors.APIError as e:
            return CommandResult(
                success=False,
                exit_code=-1,
                stdout="",
                stderr=f"Docker API 错误: {e}"
            )
        finally:
            # 确保清理容器
            if container:
                try:
                    container.remove(force=True)
                except Exception:
                    pass
    
    def _execute_in_legacy_container(self, command: str) -> CommandResult:
        """
        在旧版固定容器中执行（向后兼容）
        
        用于调试或未提供 workspace_id 的场景。
        """
        try:
            container = self.client.containers.get(self.legacy_container_name)
            exit_code, output = container.exec_run(command, demux=True)
            
            stdout_bytes = output[0] if output[0] else b""
            stderr_bytes = output[1] if output[1] else b""
            
            return CommandResult(
                success=(exit_code == 0),
                exit_code=exit_code,
                stdout=stdout_bytes.decode('utf-8', errors='replace'),
                stderr=stderr_bytes.decode('utf-8', errors='replace')
            )
        except docker.errors.NotFound:
            return CommandResult(
                success=False,
                exit_code=-1,
                stdout="",
                stderr=f"沙箱容器未找到: {self.legacy_container_name}"
            )
        except Exception as e:
            raise e
    
    async def start_async(self, command: str, **kwargs) -> str:
        """
        异步启动命令执行
        
        TODO: 实现后台任务执行
        """
        raise NotImplementedError("异步执行暂未实现")
    
    def list_sandboxes(self):
        """列出所有沙箱容器"""
        return self.client.containers.list(filters={"name": "pentest_sandbox"})


# 单例实例
sandbox_executor = SandboxExecutor()
