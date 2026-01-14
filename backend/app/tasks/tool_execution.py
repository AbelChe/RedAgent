from celery import Task
from app.core.celery_app import celery_app
from app.schemas.command import CommandResult
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class ToolExecutionTask(Task):
    """工具执行任务基类"""
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """任务失败回调"""
        from app.core.database import SessionLocal
        from app.models.job import Job, JobStatus
        
        # args顺序: [command, workspace_id, job_id, user_id]
        job_id = args[2] if len(args) > 2 else kwargs.get('job_id')
        
        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status = JobStatus.FAILED
                job.error_message = str(exc)
                job.completed_at = datetime.utcnow()
                db.commit()
                
        logger.error(f"Job {job_id} failed: {exc}")
    
    def on_success(self, retval, task_id, args, kwargs):
        """任务成功回调"""
        from app.core.database import SessionLocal
        from app.models.job import Job, JobStatus
        
        # args顺序: [command, workspace_id, job_id, user_id]
        job_id = args[2] if len(args) > 2 else kwargs.get('job_id')
        
        with SessionLocal() as db:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status = JobStatus.COMPLETED
                job.exit_code = retval.get('exit_code', 0)
                job.stdout = retval.get('stdout', '')
                job.stderr = retval.get('stderr', '')
                job.output_files = retval.get('output_files', [])
                job.completed_at = datetime.utcnow()
                db.commit()
                
        logger.info(f"Job {job_id} completed successfully")

@celery_app.task(base=ToolExecutionTask, bind=True, name="execute_tool")
def execute_tool_task(
    self,
    command: str,
    workspace_id: str,
    job_id: str,
    user_id: str = None
):
    """
    异步执行工具命令
    
    Args:
        command: Shell命令
        workspace_id: 工作空间ID
        job_id: 任务ID
        user_id: 用户ID（可选）
    
    Returns:
        dict: {"exit_code": int, "success": bool}
    """
    from app.core.database import SessionLocal
    from app.models.job import Job, JobStatus
    from app.models.base import ToolRun
    from app.executors.sandbox import sandbox_executor
    import asyncio
    
    logger.info(f"Starting job {job_id}: {command}")
    
    # 1. 更新任务状态为运行中并创建ToolRun
    with SessionLocal() as db:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found")
        
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        job.agent_id = self.request.hostname  # Celery worker名称
        
        # 创建ToolRun记录用于Tool Logs面板显示
        tool_run = ToolRun(
            id=job_id,  # 使用job_id作为run_id
            workspace_id=workspace_id,
            task_id=job.task_id,  # Link to task for conversation filtering
            tool="celery_job",
            command=command,
            logs=[],
            status="running"
        )
        db.add(tool_run)
        db.commit()
    
    # 2. 执行命令
    try:
        result = asyncio.run(
            sandbox_executor.execute(
                command=command,
                workspace_id=workspace_id
            )
        )
        
        # 3. 保存日志到Job和ToolRun记录
        with SessionLocal() as db:
            # 更新ToolRun日志
            tool_run = db.query(ToolRun).filter(ToolRun.id == job_id).first()
            if tool_run:
                # 将stdout转换为日志行数组
                if result.stdout:
                    tool_run.logs = result.stdout.split('\n')
                tool_run.status = "completed" if result.success else "failed"
                db.commit()
        
        return {
            "exit_code": result.exit_code,
            "success": result.success,
            "stdout": result.stdout,
            "stderr": result.stderr
        }
        
    except Exception as e:
        logger.error(f"Job {job_id} execution error: {e}")
        
        # 更新ToolRun为失败状态
        try:
            with SessionLocal() as db:
                tool_run = db.query(ToolRun).filter(ToolRun.id == job_id).first()
                if tool_run:
                    tool_run.status = "failed"
                    tool_run.logs = (tool_run.logs or []) + [f"❌ Error: {str(e)}"]
                    db.commit()
        except:
            pass
        
        raise  # 让on_failure处理

