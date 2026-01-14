from fastapi import APIRouter
from typing import List
from app.services.container_registry import list_available_tools

router = APIRouter()

@router.get("/", response_model=List[str])
async def list_tools():
    """
    List all available tools supported by the platform.
    Used for frontend slash command suggestions.
    """
    return list_available_tools()
