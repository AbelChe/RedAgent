"""Jobs service for task queue management."""
from sqlalchemy.orm import Session
from app.models.job import Job, JobStatus
from app.tasks.tool_execution import execute_tool_task
from app.schemas.job import JobCreate
from typing import Optional
import uuid

class JobsService:
    """Service for managing asynchronous job execution."""
    
    def __init__(self, db: Session):
        self.db = db
    
    async def create_job(
        self,
        workspace_id: str,
        command: str,
        priority: int = 5,
        agent_id: Optional[str] = None,
        task_id: Optional[str] = None,
        dispatch_to_celery: bool = True  # NEW: Control Celery dispatch
    ) -> Job:
        """
        Create a new job and optionally submit to Celery queue.
        
        Args:
            workspace_id: Workspace ID
            command: Command to execute
            priority: Job priority (0-10, higher = more important)
            agent_id: Optional agent identifier
            task_id: Optional parent task ID
            dispatch_to_celery: If True, submit to Celery queue. If False, caller handles execution.
        
        Returns:
            Created Job object
        """
        # Create job in database
        job = Job(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            command=command,
            priority=priority,
            status=JobStatus.PENDING,
            agent_id=agent_id,
            task_id=task_id
        )
        
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)
        
        # Submit to Celery queue only if requested
        if dispatch_to_celery:
            execute_tool_task.apply_async(
                args=[command, workspace_id, job.id],
                task_id=job.id,
                priority=priority
            )
        
        return job
    
    def get_job(self, job_id: str) -> Optional[Job]:
        """Get job by ID."""
        return self.db.query(Job).filter(Job.id == job_id).first()
    
    def list_jobs(
        self,
        workspace_id: str,
        status: Optional[JobStatus] = None,
        limit: int = 100
    ) -> list[Job]:
        """
        List jobs for a workspace.
        
        Args:
            workspace_id: Workspace ID
            status: Optional status filter
            limit: Maximum number of jobs to return
        
        Returns:
            List of Job objects
        """
        query = self.db.query(Job).filter(Job.workspace_id == workspace_id)
        
        if status:
            query = query.filter(Job.status == status)
        
        return query.order_by(Job.created_at.desc()).limit(limit).all()
