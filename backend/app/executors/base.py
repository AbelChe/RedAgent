from abc import ABC, abstractmethod
from app.schemas.command import CommandResult

class BaseExecutor(ABC):
    @abstractmethod
    async def execute(self, command: str, **kwargs) -> CommandResult:
        """
        Execute a command synchronously (blocking until complete or timeout)
        """
        pass
    
    @abstractmethod
    async def start_async(self, command: str, **kwargs) -> str:
        """
        Start an asynchronous command execution
        Returns: execution_id (or similar identifier)
        """
        pass
    
    # Optional methods for async control
    async def get_status(self, execution_id: str):
        pass
        
    async def cancel(self, execution_id: str):
        pass
