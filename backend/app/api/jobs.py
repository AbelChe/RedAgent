from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.job import Job, JobStatus
from app.schemas.job import JobCreate, JobResponse
from typing import List, Optional
from datetime import datetime
import uuid

router = APIRouter(prefix="/jobs", tags=["Jobs"])

@router.post("/", response_model=JobResponse)
async def create_job(
    request: JobCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    创建新任务并提交到队列
    """
    from app.tasks.tool_execution import execute_tool_task
    
    # 创建Job记录
    job_id = str(uuid.uuid4())
    job = Job(
        id=job_id,
        command=request.command,
        workspace_id=request.workspace_id,
        task_id=request.task_id,
        priority=request.priority or 5,
        status=JobStatus.PENDING
    )
    
    db.add(job)
    await db.commit()
    await db.refresh(job)
    
    # 提交到Celery队列
    task = execute_tool_task.apply_async(
        kwargs={
            'command': request.command,
            'workspace_id': request.workspace_id,
            'job_id': job_id
        },
        priority=request.priority or 5
    )
    
    # 保存Celery任务ID
    job.celery_task_id = task.id
    await db.commit()
    
    return job

@router.get("/", response_model=List[JobResponse])
async def list_jobs(
    workspace_id: str,
    status: Optional[str] = None,
    conversation_id: Optional[str] = None,
    limit: int = Query(50, le=100),
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """列出任务"""
    query = select(Job).filter(Job.workspace_id == workspace_id)
    
    if conversation_id:
        from app.models.base import Task
        # Join with Task table to filter by conversation_id via task_id
        # Job.task_id must exist for this to work
        query = query.join(Task, Job.task_id == Task.id).filter(Task.conversation_id == conversation_id)
    
    if status:
        query = query.filter(Job.status == JobStatus(status))
    
    query = query.order_by(Job.created_at.desc()).limit(limit).offset(offset)
    
    result = await db.execute(query)
    jobs = result.scalars().all()
    
    return jobs

@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取任务详情"""
    result = await db.execute(select(Job).filter(Job.id == job_id))
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return job

@router.delete("/{job_id}")
async def cancel_job(
    job_id: str,
    db: AsyncSession = Depends(get_db)
):
    """取消正在运行的任务"""
    from app.core.celery_app import celery_app
    
    result = await db.execute(select(Job).filter(Job.id == job_id))
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status != JobStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Job is not running")
    
    # 撤销Celery任务
    celery_app.control.revoke(job.celery_task_id, terminate=True, signal='SIGKILL')
    
    job.status = JobStatus.CANCELLED
    job.completed_at = datetime.utcnow()
    await db.commit()
    
    return {"message": "Job cancelled"}
