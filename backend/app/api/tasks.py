from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.task_manager import TaskManager
from app.schemas.task import TaskCreateRequest, TaskResponse

router = APIRouter()

@router.post("/", response_model=TaskResponse)
async def create_task(
    task_in: TaskCreateRequest, 
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    manager = TaskManager(db)
    task = await manager.create_task(task_in)
    
    # Auto-start task execution
    background_tasks.add_task(run_background_wrapper, task.id)
    
    return task

@router.post("/{task_id}/run", response_model=TaskResponse)
async def run_task(
    task_id: str, 
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Trigger task execution in background.
    Returns immediately with status 'pending' (or 'running' race cond).
    """
    manager = TaskManager(db)
    task = await manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    background_tasks.add_task(run_background_wrapper, task_id)
    
    return task

@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    manager = TaskManager(db)
    task = await manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

async def run_background_wrapper(task_id: str):
    # Create new session context
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        manager = TaskManager(session)
        await manager.run_task_background(task_id)

@router.post("/{task_id}/approve", response_model=TaskResponse)
async def approve_task(
    task_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Approve value for a task waiting for approval.
    """
    manager = TaskManager(db)
    task = await manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    if task.status != "waiting_approval":
        raise HTTPException(status_code=400, detail="Task is not waiting for approval")
    
    background_tasks.add_task(approve_background_wrapper, task_id)
    
    # Optimistically update status
    # Note: Real status update happens in background, but we return current state
    return task

async def approve_background_wrapper(task_id: str):
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        manager = TaskManager(session)
        await manager.approve_task_and_resume(task_id)


@router.post("/{task_id}/cancel", response_model=TaskResponse)
async def cancel_task(
    task_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Cancel a running task"""
    manager = TaskManager(db)
    task = await manager.cancel_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
