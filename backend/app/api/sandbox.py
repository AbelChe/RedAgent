from fastapi import APIRouter
from app.executors.sandbox import sandbox_executor
from pydantic import BaseModel

router = APIRouter()

class CommandRequest(BaseModel):
    command: str

@router.post("/sandbox/run")
async def run_command_in_sandbox(req: CommandRequest):
    """
    测试接口：在沙箱中执行命令
    """
    result = await sandbox_executor.execute(req.command)
    return result
