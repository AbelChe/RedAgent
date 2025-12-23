"""
工作空间 API 路由

提供工作空间的创建、查询、删除等接口，
包含 Docker 卷的生命周期管理。
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.base import Workspace
from app.schemas.workspace import WorkspaceCreate, WorkspaceResponse, WorkspaceUpdate, WorkspaceBatchDelete
from app.services.workspace_manager import workspace_manager
import logging

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
    result = await db.execute(select(Workspace).order_by(Workspace.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=WorkspaceResponse)
async def create_workspace(
    workspace_in: WorkspaceCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    创建新工作空间
    
    同时创建对应的 Docker 卷用于文件存储。
    """
    # 创建数据库记录
    workspace = Workspace(
        name=workspace_in.name,
        mode=workspace_in.mode,
        config=workspace_in.config
    )
    db.add(workspace)
    await db.commit()
    await db.refresh(workspace)
    
    # 创建 Docker 卷
    try:
        volume_info = workspace_manager.create_workspace_volume(workspace.id)
        workspace.volume_name = volume_info.name
        await db.commit()
        logger.info(f"工作空间 {workspace.id} 创建成功，卷: {volume_info.name}")
    except Exception as e:
        logger.warning(f"创建 Docker 卷失败: {e}，工作空间仍可使用")
    
    return workspace


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取工作空间详情"""
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
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
    
    同时清理对应的 Docker 卷和所有关联数据。
    """
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalars().first()
    if not workspace:
        raise HTTPException(status_code=404, detail="工作空间未找到")
    
    # 删除 Docker 卷
    try:
        workspace_manager.delete_workspace_volume(workspace_id, force=True)
        logger.info(f"已删除工作空间 {workspace_id} 的 Docker 卷")
    except Exception as e:
        logger.warning(f"删除 Docker 卷失败: {e}")
    
    # 删除数据库记录
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
    db: AsyncSession = Depends(get_db)
):
    """获取工作空间的所有任务"""
    from app.services.task_manager import TaskManager
    manager = TaskManager(db)
    return await manager.list_tasks(workspace_id)


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
