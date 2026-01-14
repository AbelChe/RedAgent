from typing import TypedDict, Annotated, List, Union
from langchain_core.messages import BaseMessage
import operator

class AgentState(TypedDict):
    """
    State for the RedAgent.
    """
    # Conversation history (Accumulates messages)
    messages: Annotated[List[BaseMessage], operator.add]
    
    # Context
    task_id: str
    
    # Approval Flow
    pending_command: str # The command waiting for approval
    user_approval: str # "pending", "approved", "rejected", "auto" (safe)
    
    # Metadata
    workspace_id: str
    mode: str # "ask", "planning", "agent"
    next_step: str # Navigation hint for the router
    thinking: str # Reasoning process/thinking content
    workspace_config: dict # Workspace-specific configuration overrides
