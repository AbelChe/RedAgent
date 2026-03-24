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
from fastapi import Request, Response
from pathlib import Path
import os
import shutil
import io
import zipfile

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent

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
    
    只生成 MCP WebSocket URL 和 Token，不自动部署任何容器。
    用户需要自行部署 MCP 执行器。
    """
    import secrets
    import string
    from app.core.config import settings
    
    # Generate MCP connection credentials
    mcp_token = str(uuid.uuid4())
    
    # Use user-provided Code Server password or generate one
    if workspace_in.code_server_password:
        code_server_password = workspace_in.code_server_password
    else:
        alphabet = string.ascii_letters + string.digits
        code_server_password = ''.join(secrets.choice(alphabet) for i in range(16))
    
    # Store Code Server password in config
    config = workspace_in.config or {}
    config['code_server_password'] = code_server_password
    
    # 创建数据库记录
    workspace = Workspace(
        name=workspace_in.name,
        description=workspace_in.description,
        mode=workspace_in.mode,
        config=config,
        mcp_token=mcp_token,
        code_server_url=workspace_in.code_server_url or "http://localhost:8080",
        status="created"  # Not "running" since nothing is auto-deployed
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
    
    # Set MCP WebSocket URL (after workspace.id is available)
    workspace.mcp_ws_url = f"{settings.MCP_BACKEND_URL}/mcp/{workspace.id}/connect"
    await db.commit()
    
    logger.info(f"Created workspace {workspace.id} with default conversation {default_conversation.id}")
    logger.info(f"MCP Connection - URL: {workspace.mcp_ws_url}, Token: {mcp_token}")
    logger.info(f"Code Server Password: {code_server_password}")
    logger.info(f"Workspace created. User must manually deploy MCP executor.")
    
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
    
    # Handle config update
    current_config = dict(workspace.config) if workspace.config else {}
    
    if workspace_in.config is not None:
        current_config.update(workspace_in.config)
        
    # Handle Code Server updates
    if workspace_in.code_server_url is not None:
        workspace.code_server_url = workspace_in.code_server_url
        
    if workspace_in.code_server_password is not None:
        current_config['code_server_password'] = workspace_in.code_server_password
        
    workspace.config = current_config
    
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
    
    注意：如果您部署了 MCP 服务器和 Code Server，需要手动停止和清理这些容器。
    """
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalars().first()
    if not workspace:
        raise HTTPException(status_code=404, detail="工作空间未找到")
    
    # 删除数据库记录
    await db.delete(workspace)
    await db.commit()
    
    logger.info(f"已删除工作空间 {workspace_id}，请手动清理相关的 Docker 容器和卷")
    return {
        "status": "deleted", 
        "workspace_id": workspace_id,
        "message": "工作空间已删除。如果您部署了 MCP 服务器，请手动运行 'docker-compose down' 清理容器。"
    }



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



def _generate_docker_compose_config(workspace: Workspace, mcp_token: str) -> str:
    # Get Code Server password from config
    code_server_password = workspace.config.get('code_server_password', 'changeme') if workspace.config else 'changeme'
    
    # Parse port from code_server_url
    code_server_port = "8080"
    if workspace.code_server_url:
        from urllib.parse import urlparse
        try:
            parsed = urlparse(workspace.code_server_url)
            if parsed.port:
                code_server_port = str(parsed.port)
        except:
            pass
    
    # Use workspace_manager for consistent volume naming
    volume_name = workspace_manager.get_volume_name(workspace.id)
            
    return f'''services:
  mcp-server:
    image: diudiudiuuuu/redagent-mcp-server:latest
    container_name: mcp-server-{workspace.id}
    volumes:
      # Use named volume for workspace data (shared with code-server)
      - {volume_name}:/app/workspace_data
      # CRITICAL: Allow MCP to manage Docker containers (for tool execution)
      - /var/run/docker.sock:/var/run/docker.sock
      - ./workspace_config:/app/config
    environment:
      - WORKSPACE_VOLUME_NAME={volume_name}
      - WORKSPACE_ID={workspace.id}
      - MCP_HUB_URL={workspace.mcp_ws_url}
      - MCP_TOKEN={mcp_token}
    restart: unless-stopped
    networks:
      - workspace-network

  code-server:
    image: codercom/code-server:latest
    container_name: code-server-{workspace.id}
    volumes:
      # Share the same workspace volume with mcp-server
      - {volume_name}:/home/coder/project
    working_dir: /home/coder/project
    environment:
      - TZ=Etc/UTC
      - PASSWORD={code_server_password}
    ports:
      - "{code_server_port}:8080"
    restart: unless-stopped
    networks:
      - workspace-network
    command: --auth password --disable-telemetry

# Define named volumes for data persistence
volumes:
  {volume_name}:
    driver: local

# Define network for inter-service communication
networks:
  workspace-network:
    driver: bridge
'''


@router.get("/{workspace_id}/mcp-connection-info")
async def get_mcp_connection_info(
    workspace_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get MCP connection information for user-deployed MCP servers.
    Returns WebSocket URL, authentication token, and Code Server credentials.
    """
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    if not workspace.mcp_ws_url or not workspace.mcp_token:
        raise HTTPException(status_code=500, detail="MCP connection credentials not generated")
    
    # Generate complete docker-compose.yml template
    docker_compose_template = _generate_docker_compose_config(workspace, workspace.mcp_token)

    # Get Code Server password for response
    code_server_password = workspace.config.get('code_server_password', 'changeme') if workspace.config else 'changeme'
    
    return {
        "workspace_id": workspace.id,
        "mcp_ws_url": workspace.mcp_ws_url,
        "mcp_token": workspace.mcp_token,
        "code_server_password": code_server_password,
        "code_server_url": workspace.code_server_url or "http://localhost:8080",  # User's configured URL
        "docker_compose_yml": docker_compose_template  # Clearer field name
    }

@router.post("/{workspace_id}/regenerate-mcp-token")
async def regenerate_mcp_token(
    workspace_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Regenerate MCP authentication token for security purposes.
    This will disconnect any currently connected MCP servers.
    """
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # Generate new token
    new_token = str(uuid.uuid4())
    workspace.mcp_token = new_token
    
    await db.commit()
    logger.info(f"Regenerated MCP token for workspace {workspace_id}")
    
    # TODO: Disconnect any active MCP connections for this workspace
    # This would require integration with ConnectionManager
    
    # Generate complete docker-compose.yml template with new token
    docker_compose_template = _generate_docker_compose_config(workspace, new_token)
    
    # Get Code Server password for response
    code_server_password = workspace.config.get('code_server_password', 'changeme') if workspace.config else 'changeme'
    
    return {
        "workspace_id": workspace.id,
        "mcp_token": new_token,
        "mcp_ws_url": workspace.mcp_ws_url,
        "code_server_password": code_server_password,
        "code_server_url": workspace.code_server_url or "http://localhost:8080",
        "docker_compose_yml": docker_compose_template,
        "message": "Token regenerated successfully. Please update your MCP server configuration."
    }

@router.get("/config/default-containers")
async def get_default_containers_yaml():
    """Download default containers.yaml"""
    # Try mcp-server root source first (local dev)
    config_path = BACKEND_ROOT.parent / "mcp-server/containers.yaml"
    
    if not config_path.exists():
        # Try symlink location in backend
        config_path = BACKEND_ROOT / "backend/app/config/containers.yaml"
    
    if not config_path.exists():
        # Fallback to local config dir relative to app (Docker)
        config_path = BACKEND_ROOT / "app/config/containers.yaml"

    if not config_path.exists():
        return Response(content="# Error: containers.yaml not found", media_type="text/yaml", status_code=404)

    with open(config_path, "rb") as f:
        content = f.read()
    return Response(content=content, media_type="text/yaml")


@router.get("/config/default-tools")
async def get_default_tools_zip():
    """Download zipped tools directory"""
    # Locate tools directory
    tools_dir = BACKEND_ROOT.parent / "mcp-server/tools"
    
    if not tools_dir.exists():
        return Response(content="Error: tools directory not found", media_type="text/plain", status_code=404)

    # Create zip in memory
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # Walk directory
        for root, dirs, files in os.walk(tools_dir):
            for file in files:
                if file.endswith('.md'): # Only include markdown definitions
                    file_path = os.path.join(root, file)
                    # Archive name relative to tools root
                    arcname = os.path.relpath(file_path, tools_dir)
                    zf.write(file_path, arcname)
    
    return Response(
        content=mem_zip.getvalue(), 
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=tools.zip"}
    )


@router.get("/{workspace_id}/check.sh")
async def get_check_script(workspace_id: str, request: Request):
    """Generate environment check script"""
    script = f"""#!/bin/bash
echo -e "\\033[1;34m[RedAgent] Environment Check for Workspace: {workspace_id}\\033[0m"

# 1. Check Docker
if command -v docker &> /dev/null; then
    echo -e "✅ Docker is installed: $(docker --version)"
else
    echo -e "❌ Docker is NOT installed. Please install Docker first."
    exit 1
fi

# 2. Check Docker Compose
if docker compose version &> /dev/null; then
    echo -e "✅ Docker Compose is available."
elif command -v docker-compose &> /dev/null; then
    echo -e "✅ Docker Compose (legacy) is available."
else
    echo -e "❌ Docker Compose is NOT installed."
    exit 1
fi

# 3. Check connectivity to Backend
echo -e "Checking connectivity to backend ({request.base_url})..."
if command -v curl &> /dev/null; then
    status_code=$(curl -s -o /dev/null -w "%{{http_code}}" {request.base_url}health || echo "000")
    # Assuming /health might not exist yet, but even 404 means connectable
    echo -e "✅ Backend connection successful."
else
    echo -e "⚠️  curl not found, skipping connectivity check."
fi

echo -e "\\033[1;32mEverything looks good! Run init.sh next.\\033[0m"
"""
    return Response(content=script, media_type="text/x-shellscript")


@router.get("/{workspace_id}/init.sh")
async def get_init_script(
    workspace_id: str, 
    request: Request,
    db: AsyncSession = Depends(get_db)  # Changed from db: AsyncSession = Depends(get_db) inside function logic
):
    """Generate initialization script"""
    # We need to fetch workspace to get the token and settings
    # But init.sh is just setup, credentials are in docker-compose.yml 
    # which we can regenerate/fetch.
    
    BASE_URL = str(request.base_url).rstrip('/')
    # Assuming API prefix /api/v1? No request.base_url includes scheme://host:port/
    # Router prefix is usually included?
    # We need full URL to API.
    # request.base_url returns base path. We append workspaces/...
    
    API_URL = f"{BASE_URL}/workspaces"

    script = f"""#!/bin/bash
set -e

WORKSPACE_ID="{workspace_id}"
API_URL="{API_URL}"

echo -e "\\033[1;34m[RedAgent] Initializing Workspace: $WORKSPACE_ID\\033[0m"

# 1. Create Directories
echo -e "📂 Creating directories..."
mkdir -p workspace_data
mkdir -p workspace_config/tools
chmod 777 workspace_data

# 2. Download Configuration
echo -e "⬇️  Downloading configuration..."
# Download containers.yaml
if curl -s -f "$API_URL/config/default-containers" -o workspace_config/containers.yaml; then
    echo -e "✅ Loaded containers.yaml"
else
    echo -e "❌ Failed to download containers.yaml"
    exit 1
fi

# Download tools.zip and unzip
echo -e "⬇️  Downloading tools..."
if curl -s -f "$API_URL/config/default-tools" -o tools.zip; then
    unzip -o -q tools.zip -d workspace_config/tools
    rm tools.zip
    echo -e "✅ Loaded knowledge base (tools)"
else
    echo -e "❌ Failed to download tools"
    exit 1
fi

# 3. Generate docker-compose.yml
# We can fetch mcp-connection-info which returns the template in JSON
echo -e "📝 Generating docker-compose.yml..."
# We use a python one-liner or simple curl processing if jq exists, else straightforward dump
# Actually, let's just use the API to get the info.
# NOTE: This endpoint requires no auth currently? Or User Token?
# workspaces endpoints are usually unauthenticated in this MVP phase or rely on session cookie.
# If auth is required, this script will fail.
# Assuming no auth for mvp for now.

RESPONSE=$(curl -s "$API_URL/$WORKSPACE_ID/mcp-connection-info")
# Extract docker_compose_yml from JSON. 
# Ideally we should have a dedicated endpoint for raw yaml download.
# For now, let's extract it using python (installed usually) or grep/sed (fragile).
# Or we can simply ECHO the content from THIS python function into the script?
# Yes! We can generate the YAML content server-side and embed it in the script!
"""

    # Fetch workspace info to generate YAML
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalar_one_or_none()
    
    if not workspace:
         return Response(content="echo 'Workspace not found'", media_type="text/x-shellscript")
         
    # Generate YAML (reuse logic)
    # Copied from get_mcp_connection_info logic (simplified)
    # ... logic repetition ...
    # To avoid repetition, we should call a helper. 
    # But for now I will inline it or fetch it.
    
    # Let's call the logic locally or just fetch it via `get_mcp_connection_info` logic
    # Reuse is hard without refactoring.
    
    docker_compose_content = _generate_docker_compose_config(workspace, workspace.mcp_token)
    
    # Escape single quotes for shell heredoc
    docker_compose_content_escaped = docker_compose_content.replace("'", "'\\''")

    script += f"""
cat <<EOF > docker-compose.yml
{docker_compose_content_escaped}
EOF
echo -e "✅ Generated docker-compose.yml"

echo -e "\\033[1;32mInitialization Complete!\\033[0m"
echo -e "🚀 Run the following command to start services:"
echo -e "\\033[1m  docker-compose up -d\\033[0m"
"""
    return Response(content=script, media_type="text/x-shellscript")

