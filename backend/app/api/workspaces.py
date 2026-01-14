"""
工作空间 API 路由

提供工作空间的创建、查询、删除等接口，
包含 Docker 卷的生命周期管理。
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.base import Workspace, Conversation
from app.schemas.workspace import WorkspaceCreate, WorkspaceResponse, WorkspaceUpdate, WorkspaceBatchDelete, CommandRunRequest
from app.services.workspace_manager import workspace_manager
import logging
import uuid  # Added for conversation ID generation

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=List[WorkspaceResponse])
async def list_workspaces(
    db: AsyncSession = Depends(get_db)
):
    """
    获取所有工作空间（按创建时间倒序）
    用于侧边栏历史记录显示
    """
    from app.models.base import Task, ToolRun
    from sqlalchemy import func
    
    # Get all workspaces
    result = await db.execute(select(Workspace).order_by(Workspace.created_at.desc()))
    workspaces = result.scalars().all()
    
    # Populate stats (This is N+1 but acceptable for small number of workspaces)
    # Ideally should use group by queries
    for ws in workspaces:
        # Task Count
        task_count = await db.scalar(
            select(func.count(Task.id)).where(Task.workspace_id == ws.id)
        )
        # Tool Run Count
        tool_count = await db.scalar(
            select(func.count(ToolRun.id)).where(ToolRun.workspace_id == ws.id)
        )
        
        ws.stats = {
            "task_count": task_count,
            "tool_run_count": tool_count
        }
    
    return workspaces


@router.post("/", response_model=WorkspaceResponse)
async def create_workspace(
    workspace_in: WorkspaceCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    创建新工作空间
    
    同时创建对应的 Docker 卷用于文件存储。
    """
    import secrets
    import string
    
    # Generate secure random password
    alphabet = string.ascii_letters + string.digits
    password = ''.join(secrets.choice(alphabet) for i in range(12))
    
    # Update config with password
    config = workspace_in.config or {}
    config['code_server_password'] = password
    
    # 创建数据库记录
    workspace = Workspace(
        name=workspace_in.name,
        description=workspace_in.description,
        mode=workspace_in.mode,
        config=config
    )
    db.add(workspace)
    await db.commit()
    await db.refresh(workspace)
    
    # Auto-create default conversation for this workspace
    default_conversation = Conversation(
        id=str(uuid.uuid4()),
        workspace_id=workspace.id,
        title="Main Conversation"
    )
    db.add(default_conversation)
    await db.commit()
    
    logger.info(f"Created workspace {workspace.id} with default conversation {default_conversation.id}")
    
    # 创建 Docker 卷
    try:
        volume_info = workspace_manager.create_workspace_volume(workspace.id)
        workspace.volume_name = volume_info.name
        
        # 部署服务栈 (MCP + Code Server)
        logger.info(f"Deploying service stack for workspace {workspace.id}...")
        stack_info = workspace_manager.deploy_stack(workspace.id, code_server_password=password)
        
        workspace.mcp_container_id = stack_info["mcp_container_id"]
        workspace.code_container_id = stack_info["code_container_id"]
        workspace.mcp_endpoint = stack_info["mcp_endpoint"]
        workspace.code_server_endpoint = stack_info["code_server_endpoint"]
        
        # Save MCP token and Hub URL to config
        if "mcp_token" in stack_info:
            if workspace.config is None: workspace.config = {}
            # Create a new dict to ensure SQLAlchemy tracking detects the change
            new_config = dict(workspace.config)
            new_config["mcp_token"] = stack_info.get("mcp_token")
            new_config["mcp_hub_url"] = stack_info.get("mcp_hub_url")
            workspace.config = new_config
            
        workspace.status = "running"
        
        await db.commit()
        logger.info(f"工作空间 {workspace.id} 创建成功，卷: {volume_info.name}, Stack: Running")
    except Exception as e:
        logger.error(f"创建资源失败: {e}")
        workspace.status = "error"
        # 尝试回滚清理
        workspace_manager.terminate_stack(workspace.id)
        # Note: We don't delete the workspace record so user can see error, or we could.
        await db.commit()
    
    return workspace


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取工作空间详情"""
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalars().first()
    if not workspace:
        raise HTTPException(status_code=404, detail="工作空间未找到")
    return workspace


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: str,
    workspace_in: WorkspaceUpdate,
    db: AsyncSession = Depends(get_db)
):
    """更新工作空间 (例如重命名)"""
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalars().first()
    if not workspace:
        raise HTTPException(status_code=404, detail="工作空间未找到")
    
    if workspace_in.name is not None:
        workspace.name = workspace_in.name
    if workspace_in.description is not None:
        workspace.description = workspace_in.description
    if workspace_in.config is not None:
        workspace.config = workspace_in.config
    
    await db.commit()
    await db.refresh(workspace)
    return workspace


@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    删除工作空间
    
    同时清理对应的 Docker 卷、容器和服务栈。
    """
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalars().first()
    if not workspace:
        raise HTTPException(status_code=404, detail="工作空间未找到")
    
    # 1. Terminate Service Stack
    try:
        workspace_manager.terminate_stack(workspace_id)
    except Exception as e:
        logger.warning(f"Error terminating stack: {e}")

    # 2. 删除 Docker 卷
    try:
        workspace_manager.delete_workspace_volume(workspace_id, force=True)
        logger.info(f"已删除工作空间 {workspace_id} 的 Docker 卷")
    except Exception as e:
        logger.warning(f"删除 Docker 卷失败: {e}")
    
    # 3. 删除数据库记录
    await db.delete(workspace)
    await db.commit()
    
    return {"status": "deleted", "workspace_id": workspace_id}


@router.post("/batch_delete")
async def batch_delete_workspaces(
    batch_in: WorkspaceBatchDelete,
    db: AsyncSession = Depends(get_db)
):
    """
    批量删除工作空间
    """
    ids = batch_in.ids
    if not ids:
        return {"status": "success", "count": 0}

    # 查询要删除的工作空间
    result = await db.execute(select(Workspace).where(Workspace.id.in_(ids)))
    workspaces = result.scalars().all()

    count = 0
    for workspace in workspaces:
        try:
            # Terminate Stack
            try:
                workspace_manager.terminate_stack(workspace.id)
            except Exception as e:
                logger.warning(f"终止栈失败 ({workspace.id}): {e}")

            # 删除 Docker 卷
            try:
                workspace_manager.delete_workspace_volume(workspace.id, force=True)
            except Exception as e:
                logger.warning(f"删除 Docker 卷失败 ({workspace.id}): {e}")
            
            # 删除数据库记录
            await db.delete(workspace)
            count += 1
        except Exception as e:
            logger.error(f"删除工作空间失败 ({workspace.id}): {e}")

    await db.commit()
    return {"status": "success", "count": count}


@router.get("/{workspace_id}/tasks")
async def get_workspace_tasks(
    workspace_id: str,
    conversation_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """获取工作空间的所有任务"""
    from app.services.task_manager import TaskManager
    manager = TaskManager(db)
    return await manager.list_tasks(workspace_id, conversation_id=conversation_id)


@router.get("/{workspace_id}/volume")
async def get_workspace_volume(
    workspace_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取工作空间的 Docker 卷信息"""
    volume_info = workspace_manager.get_volume_info(workspace_id)
    if not volume_info:
        raise HTTPException(status_code=404, detail="卷未找到")
    
    return {
        "name": volume_info.name,
        "mountpoint": volume_info.mountpoint,
        "created": volume_info.created,
    }

@router.get("/{workspace_id}/stream")
async def stream_workspace_events(
    workspace_id: str
):
    """
    SSE Stream for workspace events (real-time thinking, task updates).
    Client should connect to this with EventSource.
    """
    from fastapi.responses import StreamingResponse
    from app.services.event_bus import event_bus
    import json
    
    async def event_generator():
        # print(f"📡 SSE Client connected to workspace {workspace_id}")
        try:
            async for event in event_bus.subscribe(workspace_id):
                # SSE Format: data: {json}\n\n
                yield f"data: {json.dumps(event.data)}\n\n"
        except Exception as e:
            print(f"❌ SSE Error: {e}")
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/{workspace_id}/tool-runs")
async def get_workspace_tool_runs(
    workspace_id: str,
    conversation_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """获取工作空间的工具执行日志"""
    from app.models.base import ToolRun, Task
    
    query = select(ToolRun).where(ToolRun.workspace_id == workspace_id)
    
    # Filter by conversation if provided
    if conversation_id:
        query = query.join(Task, ToolRun.task_id == Task.id).where(Task.conversation_id == conversation_id)
    
    query = query.order_by(ToolRun.start_time.asc())
    
    result = await db.execute(query)
    runs = result.scalars().all()
    return [
        {
            "id": run.id,
            "tool": run.tool,
            "command": run.command,
            "logs": run.logs or [],
            "status": run.status,
            "startTime": run.start_time.timestamp() * 1000 if run.start_time else None,
            "workspaceId": run.workspace_id,
            "task_id": run.task_id
        }
        for run in runs
    ]


@router.delete("/{workspace_id}/tool-runs")
async def clear_workspace_tool_runs(
    workspace_id: str,
    db: AsyncSession = Depends(get_db)
):
    """清除工作空间的工具执行日志"""
    from app.models.base import ToolRun
    from sqlalchemy import delete
    await db.execute(delete(ToolRun).where(ToolRun.workspace_id == workspace_id))
    await db.commit()


@router.post("/tool-runs/{run_id}/kill")
async def kill_tool_run(
    run_id: str,
    db: AsyncSession = Depends(get_db)
):
    """终止正在运行的工具"""
    from app.models.base import ToolRun
    from app.services.connection_manager import manager
    
    # Get the tool run
    result = await db.execute(select(ToolRun).where(ToolRun.id == run_id))
    tool_run = result.scalars().first()
    
    if not tool_run:
        raise HTTPException(status_code=404, detail="Tool run not found")
    
    if tool_run.status != "running":
        raise HTTPException(status_code=400, detail="Tool run is not running")
    
    # Send kill signal to MCP
    try:
        await manager.kill_tool_run(run_id)
    except Exception as e:
        print(f"Failed to send kill signal to MCP: {e}")
    
    # Update status
    tool_run.status = "cancelled"
    await db.commit()
    
    return {"status": "killed", "run_id": run_id}

@router.post("/{workspace_id}/commands/run")
async def run_command(
    workspace_id: str,
    request: CommandRunRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    直接在后台执行命令（不创建对话任务）
    用于 "重跑" 功能或手动执行命令
    """
    from app.executors.sandbox import sandbox_executor
    
    # 异步执行命令
    # 注意：日志会通过 SSE (tool/log) 自动推送到前端
    background_tasks.add_task(
        sandbox_executor.execute, 
        request.command, 
        workspace_id=workspace_id
    )
    
    return {"status": "started", "message": f"Command '{request.command}' started in background"}

@router.post("/{workspace_id}/connection-token")
async def get_connection_token(
    workspace_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get an authentication token (cookie) for the Code Server.
    Allows seamless login without manual password entry.
    """
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    config = workspace.config or {}
    password = config.get("code_server_password")
    
    if not password:
        raise HTTPException(status_code=400, detail="Code Server password not found in workspace config")
        
    stack_info = workspace_manager.get_container_mount_config(workspace_id) # Just to check if volume exists? No, we need endpoint.
    
    # We need to reconstruct the endpoint or retrieve it from the live container
    # Since we don't persist the endpoint in the DB (it's dynamic based on container port),
    # we might need to inspect the container again or assume a standard if behind proxy.
    # However, deploy_stack returns it. But we don't save it to DB in the current schema?
    # Wait, the frontend has `workspace.code_server_endpoint`. Where does it come from? 
    # Providing it manually for now based on what we know: workspace_manager tracks it or we inspect.
    
    # Actually, let's look at how `get_workspace` populates `code_server_endpoint`.
    # It seems it might be missing from the DB model or transient.
    # Let's inspect the container to be sure.
    
    # Re-using logic from deploy_stack to find the port? 
    # Or better: `workspace_manager` should have a method to get running stack info.
    
    # Let's inspect the container named `code-{workspace_id}`
    try:
        container = workspace_manager.client.containers.get(f"code-{workspace_id}")
        if container.status != 'running':
             raise HTTPException(status_code=503, detail="Code Server is not running")
             
        ports = container.attrs.get('NetworkSettings', {}).get('Ports', {})
        if '8080/tcp' in ports and ports['8080/tcp']:
            host_port = ports['8080/tcp'][0]['HostPort']
            endpoint = f"http://localhost:{host_port}"
            logger.info(f"Resolved Code Server endpoint for {workspace_id}: {endpoint}")
        else:
             raise HTTPException(status_code=503, detail="Code Server port not found")
             
        # Now get the cookie
        cookie = await workspace_manager.get_code_server_cookie(endpoint, password)
        return {"token": cookie}
        
    except Exception as e:
        logger.error(f"Failed to get connection token: {e}")
        raise HTTPException(status_code=500, detail=str(e))
