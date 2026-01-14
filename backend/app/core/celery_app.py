from celery import Celery
from celery.signals import task_prerun, task_postrun, task_failure
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

celery_app = Celery(
    "redagent",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    # 序列化
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='UTC',
    enable_utc=True,
    
    # Worker配置
    worker_prefetch_multiplier=1,  # 每次只领取一个任务
    worker_max_tasks_per_child=50,  # 防止内存泄漏
    
    # 任务配置
    task_track_started=True,  # 追踪任务开始状态
    task_time_limit=7200,  # 2小时硬超时
    task_soft_time_limit=7000,  # 软超时预警
    
    # 结果配置
    result_expires=3600,  # 结果保留1小时
    
    # 导入任务模块
    imports=['app.tasks.tool_execution'],
)

# 信号处理
@task_prerun.connect
def task_prerun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, **extra):
    """任务开始前"""
    logger.info(f"Task started: {task.name} [{task_id}]")

@task_postrun.connect
def task_postrun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, retval=None, **extra):
    """任务完成后"""
    logger.info(f"Task completed: {task.name} [{task_id}]")

@task_failure.connect
def task_failure_handler(sender=None, task_id=None, exception=None, **extra):
    """任务失败"""
    logger.error(f"Task failed: {task_id} - {exception}")
