from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List, Dict
from app.models.base import Task, Conversation
from app.schemas.task import TaskCreateRequest
from app.schemas.command import CommandResult
from app.schemas.command import CommandResult
from app.executors.sandbox import sandbox_executor
from datetime import datetime
import json
import asyncio

class TaskManager:
    # Class-level dict to track task cancellations
    _cancellation_flags: Dict[str, bool] = {}
    
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _cleanup_running_tools(self, workspace_id: str):
        """Helper to kill any running tools in the workspace"""
        from app.models.base import ToolRun
        from app.services.connection_manager import manager
        
        try:
            # Refresh session context check if needed, but assuming simple exec for now
            result = await self.db.execute(
                select(ToolRun).where(
                    ToolRun.workspace_id == workspace_id,
                    ToolRun.status == "running"
                )
            )
            running_tools = result.scalars().all()
            
            if not running_tools:
                return

            print(f"🧹 Cleaning up {len(running_tools)} running tools for workspace {workspace_id}")
            
            for tool_run in running_tools:
                try:
                    await manager.kill_tool_run(tool_run.id)
                    tool_run.status = "cancelled"
                except Exception as e:
                    print(f"⚠️ Failed to kill tool run {tool_run.id}: {e}")
            
            await self.db.commit()
        except Exception as e:
            print(f"⚠️ Error during tool cleanup: {e}")

    async def create_task(self, task_in: TaskCreateRequest) -> Task:
        """Create a new task record in pending state"""
        # Use provided conversation_id, or fall back to first conversation
        conversation_id = task_in.conversation_id
        
        if not conversation_id:
            # Fallback: get the first conversation for this workspace
            result = await self.db.execute(
                select(Conversation)
                .where(Conversation.workspace_id == task_in.workspace_id)
                .order_by(Conversation.created_at.asc())
                .limit(1)
            )
            conversation = result.scalars().first()
            conversation_id = conversation.id if conversation else None
        
        db_task = Task(
            workspace_id=task_in.workspace_id,
            conversation_id=conversation_id,
            command=task_in.content,
            mode=task_in.mode,
            status="pending"
        )
        self.db.add(db_task)
        await self.db.commit()
        await self.db.refresh(db_task)
        return db_task

    async def get_task(self, task_id: str) -> Optional[Task]:
        from sqlalchemy.orm import selectinload
        result = await self.db.execute(
            select(Task)
            .where(Task.id == task_id)
            .options(selectinload(Task.workspace))
        )
        return result.scalars().first()

    async def list_tasks(self, workspace_id: str, conversation_id: Optional[str] = None):
        """List all tasks for a workspace ordered by creation time"""
        query = select(Task).where(Task.workspace_id == workspace_id)
        
        if conversation_id:
            query = query.where(Task.conversation_id == conversation_id)
            
        result = await self.db.execute(
            query.order_by(Task.created_at.asc())
        )
        return result.scalars().all()
    
    async def cancel_task(self, task_id: str) -> Optional[Task]:
        """Cancel a running task"""
        task = await self.get_task(task_id)
        if not task:
            return None
        
        # Set cancellation flag
        TaskManager._cancellation_flags[task_id] = True
        
        # Update task status
        task.status = "cancelled"
        await self.db.commit()
        await self.db.refresh(task)
        
        # Broadcast cancellation event
        from app.services.event_bus import event_bus, Event
        await event_bus.publish(Event(
            type="task_cancelled",
            workspace_id=task.workspace_id,
            data={
                "type": "task_cancelled",
                "task_id": task_id,
                "message": "Task cancelled by user"
            }
        ))
        
        # Kill all running tools in this workspace
        # Cleanup running tools
        await self._execute_cleanup_running_tools(task.workspace_id)
        
        return task
    
    def is_cancelled(self, task_id: str) -> bool:
        """Check if task has been cancelled"""
        return TaskManager._cancellation_flags.get(task_id, False)

    async def run_task_background(self, task_id: str):
        """
        Entry point for background task execution.
        Routes to specific handler based on task mode.
        """
        task = await self.get_task(task_id)
        if not task:
            print(f"❌ Task {task_id} not found in background handler")
            return

        print(f"🚀 Starting background task {task_id} (Mode: {task.mode})")
        
        # Pre-fetch workspace config before commit expires the session/attributes
        workspace_config = task.workspace.config if task.workspace else {}
        
        # Mark as running
        task.status = "running"
        await self.db.commit()
        
        try:
            # All valid modes (ask, planning, agent) use the Agent Graph
            if task.mode in ['agent', 'ask', 'planning']:
                await self._execute_agent_task(task, workspace_config=workspace_config)
            else:
                # Fallback for deprecated 'simple' mode if any
                await self._execute_simple_task(task)
        except Exception as e:
            print(f"❌ Task {task_id} failed: {e}")
            task.status = "failed"
            task.result = {"error": str(e)}
            await self.db.commit()

    async def _execute_simple_task(self, task: Task):
        """简单模式：直接通过 SandboxExecutor 执行单个命令"""
        # 执行命令（传入 workspace_id 以挂载对应的卷）
        result: CommandResult = await sandbox_executor.execute(
            task.command,
            workspace_id=task.workspace_id
        )
        
        # 更新任务状态
        task.status = "completed" if result.success else "failed"
        task.result = result.model_dump()
        
        await self.db.commit()
        await self.db.refresh(task)

    async def _execute_agent_task(self, task: Task, resume_messages: Optional[list] = None, workspace_config: Dict = None):
        """Run ReAct Agent Loop with WebSocket Streaming"""
        from app.agent.core import app_graph
        from app.agent.tools import set_executor_context
        from langchain_core.messages import HumanMessage, AIMessage, ToolMessage, messages_to_dict
        from app.services.connection_manager import manager as websocket_manager
        from app.services.event_bus import event_bus, Event
        
        # 1. 绑定执行器上下文（包含工作空间 ID 用于卷挂载）
        set_executor_context(task.id, sandbox_executor, workspace_id=task.workspace_id)
        
        # 2. Prepare Inputs
        if resume_messages:
            inputs = {
                "messages": resume_messages,
                "task_id": task.id,
                "workspace_id": task.workspace_id,
                "mode": task.mode, # Inject mode
                "user_approval": "approved", # Inject approval if resuming
                "workspace_config": workspace_config or {} # Inject config
            }
        else:
            # Load context from previous tasks in this workspace
            # Filter by conversation_id to strictly isolate contexts
            previous_tasks = await self.list_tasks(task.workspace_id, conversation_id=task.conversation_id)
            messages = []
            from langchain_core.messages import messages_from_dict
            
            for pt in previous_tasks:
                if pt.id == task.id:
                    continue
                if pt.result and isinstance(pt.result, dict) and pt.result.get("messages"):
                    try:
                        messages.extend(messages_from_dict(pt.result["messages"]))
                    except:
                        pass
            
            # Add current command
            messages.append(HumanMessage(content=task.command))
            
            # CLEANING: Ensure no orphan tool_calls (must be followed by ToolMessage)
            # OpenAI/DeepSeek 400 error prevention
            cleaned_messages = []
            for i, msg in enumerate(messages):
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    # Check if next message is ToolMessage
                    has_tool_response = (i + 1 < len(messages) and messages[i+1].type == "tool")
                    
                    if has_tool_response:
                        cleaned_messages.append(msg)
                    else:
                        # Convert to plain AIMessage to avoid 400 error
                        # IMPORTANT: For reasoning models (DeepSeek R1), 
                        # we must preserve reasoning_content if possible
                        from langchain_core.messages import AIMessage
                        content = msg.content
                        reasoning = msg.additional_kwargs.get("reasoning_content", "")
                        
                        # If we have thinking content but it's an orphan tool call, 
                        # merge thinking into content so user sees it, and strip tool_calls
                        if reasoning:
                            total_content = f"<think>\n{reasoning}\n</think>\n\n{content}"
                        else:
                            total_content = content
                            
                        cleaned_messages.append(AIMessage(content=total_content.strip()))
                else:
                    cleaned_messages.append(msg)

            inputs = {
                "messages": cleaned_messages,
                "task_id": task.id,
                "workspace_id": task.workspace_id,
                "mode": task.mode,  # Inject mode
                "workspace_config": workspace_config or {} # Inject config (use passed value)
            }
        
        final_state = None
        current_thinking = ""
        current_content = ""
        
        try:
            # 3. Stream Execution with Event-level granularity (astream_events)
            print(f"📡 Start event streaming for task {task.id}")
            
            # Explicitly raise recursion limit to prevent early termination on complex tasks
            # And use a larger timeout if needed
            run_config = {"recursion_limit": 100}
            
            # Stream agent events and process them in real-time
            last_snapshot_time = 0  # Throttle database updates
            thinking_dirty = False  # Track if thinking needs to be saved
            # current_thinking = "" # Already defined above
            content_accumulator = "" # New variable, current_content is used for broadcast
            
            async for event in app_graph.astream_events(inputs, version="v2", config=run_config):
                # Check for cancellation
                if self.is_cancelled(task.id):
                    print(f"🛑 Task {task.id} cancelled by user, stopping agent loop")
                    task.status = "cancelled"
                    await self.db.commit()
                    break
                
                kind = event["event"]
                name = event.get("name", "unknown")
                # print(f"DEBUG EVENT: {kind} ({name})") # Verbose logging
                
                # A. Handle streaming tokens from Chat Model
                if kind == "on_chat_model_stream":
                    chunk = event["data"]["chunk"]
                    
                    # DEBUG: Dump the chunk structure to find where reasoning_content is hiding
                    # print(f"DEBUG CHUNK: content='{chunk.content}' kwargs={chunk.additional_kwargs}")
                    
                    # DeepSeek reasoning_content support
                    reasoning_chunk = chunk.additional_kwargs.get("reasoning_content", "")
                    content_chunk = chunk.content
                    
                    if reasoning_chunk:
                        # DeepSeek sends incremental chunks (deltas)
                        current_thinking += reasoning_chunk
                        
                        # PLANNED CHANGE: Publish to EventBus for SSE
                        await event_bus.publish(Event(
                            type="agent_state_update",
                            workspace_id=task.workspace_id,
                            data={
                                "type": "agent_state_update",
                                "task_id": task.id,
                                "state_summary": {
                                    "thinking": current_thinking,
                                    "is_streaming": True
                                }
                            }
                        ))
                        
                        # Throttled database update (max once per second)
                        thinking_dirty = True
                        current_time = asyncio.get_event_loop().time()
                        if current_time - last_snapshot_time >= 1.0:  # 1 second throttle
                            current_result = task.result or {}
                            task.result = {
                                **current_result,
                                "thinking": current_thinking
                            }
                            await self.db.commit()
                            last_snapshot_time = current_time
                            thinking_dirty = False
                        
                        # Keep WS for backward compat (or remove if fully migrating)
                        await websocket_manager.broadcast(task.workspace_id, {
                            "type": "agent_state_update",
                            "task_id": task.id,
                            "state_summary": {
                                "thinking": current_thinking,
                                "is_streaming": True
                            }
                        })
                    
                    if content_chunk:
                        # Clean up zero-width space if present (from DeepSeek LLM fix)
                        content_chunk = content_chunk.replace("\u200b", "")
                        
                        if content_chunk:
                            current_content += content_chunk
                            # PLANNED CHANGE: Publish to EventBus for SSE
                            await event_bus.publish(Event(
                                type="agent_state_update",
                                workspace_id=task.workspace_id,
                                data={
                                    "type": "agent_state_update",
                                    "task_id": task.id,
                                    "state_summary": {
                                        "thinking": current_thinking,
                                        "content": current_content,
                                        "is_streaming": True
                                    }
                                }
                            ))

                            await websocket_manager.broadcast(task.workspace_id, {
                                "type": "agent_state_update",
                                "task_id": task.id,
                                "state_summary": {
                                    "thinking": current_thinking,
                                    "content": current_content,
                                    "is_streaming": True
                                }
                            })

                # B. Handle Graph Node completion (to update final state)
                elif kind == "on_chain_end" and name == "LangGraph":
                    final_state = event["data"]["output"]
                
                # C. Handle node starts for UI feedback
                elif kind == "on_chain_start" and name in ["agent", "tool_node", "check_approval"]:
                     await event_bus.publish(Event(
                        type="agent_state_update",
                        workspace_id=task.workspace_id,
                        data={
                            "type": "agent_state_update",
                            "task_id": task.id,
                            "state_summary": {
                                "status": f"executing_{name}",
                                "is_streaming": True
                            }
                        }
                    ))
                    
                     await websocket_manager.broadcast(task.workspace_id, {
                        "type": "agent_state_update",
                        "task_id": task.id,
                        "state_summary": {
                            "status": f"executing_{name}",
                            "is_streaming": True
                        }
                    })

            # 4. Handle Result
            if not final_state:
                # Fallback if events didn't capture output (though on_chain_end should)
                task.status = "failed"
                task.result = {"error": "No final state captured from agent stream"}
                await self.db.commit()
                return

            if final_state.get("user_approval") == "pending":
                task.status = "waiting_approval"
                task.result = {
                    "pending_command": final_state.get("pending_command"),
                    "messages": messages_to_dict(final_state["messages"]) # Save full history for auditing
                }
            else:
                task.status = "completed"
                
                # Fetch command logs for auditing (best effort)
                command_logs = []
                try:
                    from sqlalchemy import select
                    from app.models.base import CommandLog
                    stmt = select(CommandLog).where(CommandLog.task_id == task.id).order_by(CommandLog.created_at)
                    log_results = await self.db.execute(stmt)
                    command_logs = [
                        {
                            "command": log.command,
                            "exit_code": log.exit_code,
                            "stdout": log.stdout,
                            "stderr": log.stderr,
                            "created_at": log.created_at.isoformat() if log.created_at else None
                        }
                        for log in log_results.scalars().all()
                    ]
                except Exception as audit_err:
                    print(f"⚠️ Failed to fetch audit logs for task {task.id}: {audit_err}")
                
                # Save final thinking snapshot if there are pending updates
                if thinking_dirty and current_thinking:
                    current_result = task.result or {}
                    task.result = {
                        **current_result,
                        "thinking": current_thinking
                    }
                    await self.db.commit()
                
                # Build complete final result
                task.result = {
                    "outcome": "Agent finished",
                    "final_message": final_state["messages"][-1].content if final_state["messages"] else "",
                    "history": [m.content for m in final_state["messages"]],
                    "messages": messages_to_dict(final_state["messages"]),
                    "thinking": current_thinking if current_thinking else final_state.get("thinking"),
                    "audit_logs": command_logs
                }
                
        except Exception as e:
            print(f"❌ Task {task.id} failed: {e}")
            
            # Pre-cache fields before rollback/potential session expiry
            workspace_id = str(task.workspace_id)
            task_id = str(task.id)
            
            # IMPORTANT: Rollback to clear poisoned transaction if any DB op failed
            await self.db.rollback()
            
            # Re-associate/refresh if needed, but staying safe with offline update
            task.status = "failed"
            # Try to save what we have so far
            partial_history = {}
            if final_state and "messages" in final_state:
                partial_history = {
                    "history": [m.content for m in final_state["messages"]],
                    "messages": messages_to_dict(final_state["messages"]),
                    "thinking": final_state.get("thinking")
                }
            
            task.result = {
                "error": str(e),
                **partial_history
            }
            
            # Final Broadcast and Save for failure case
            try:
                payload = {
                    "type": "task_update",
                    "task_id": task_id,
                    "status": "failed",
                    "result": task.result
                }
                
                await event_bus.publish(Event(
                    type="task_update",
                    workspace_id=workspace_id,
                    data=payload
                ))
                
                await websocket_manager.broadcast(workspace_id, payload)
                await self.db.commit()
            except Exception as final_err:
                print(f"❌ Failed to save failure state: {final_err}")
            
            # Ensure tools are cleaned up even on failure
            await self._cleanup_running_tools(workspace_id)
            return
            
        # Final Broadcast and Save for success/waiting cases
        try:
            # Broadcast final status
            payload = {
                "type": "task_update",
                "task_id": task.id,
                "status": task.status,
                "result": task.result
            }
            
            await event_bus.publish(Event(
                type="task_update",
                workspace_id=task.workspace_id,
                data=payload
            ))
            
            await websocket_manager.broadcast(task.workspace_id, payload)
            await self.db.commit()
        except Exception as final_err:
            await self.db.rollback()
            
        # Ensure tools are cleaned up on success
        await self._cleanup_running_tools(task.workspace_id)

    async def approve_task_and_resume(self, task_id: str):
        """
        Manually execute pending command and resume Agent loop.
        """
        from langchain_core.messages import ToolMessage, messages_from_dict
        
        task = await self.get_task(task_id)
        if not task or task.status != "waiting_approval":
            raise ValueError("Task not found or not waiting for approval")
            
        print(f"🔓 Resuming task {task_id} with approval...")
        
        # 1. Recover History
        saved_messages = task.result.get("messages", [])
        if not saved_messages:
             raise ValueError("No message history found in task result")
             
        messages = messages_from_dict(saved_messages)
        
        # 2. Extract Pending Command (Expect last message to be AI with tool_calls)
        last_msg = messages[-1]
        if not hasattr(last_msg, "tool_calls") or not last_msg.tool_calls:
            raise ValueError("Last message has no tool calls cannot resume")
            
        # Assuming single tool call for now
        tool_call = last_msg.tool_calls[0]
        cmd = tool_call["args"].get("command")
        call_id = tool_call["id"]
        
        # 3. Manually Execute Command
        # We use the sandbox executor directly as we are bypassing the 'tool_node' for this step
        # effectively doing what tool_node would have done if approved
        try:
            print(f"Running approved command: {cmd}")
            cmd_result = await sandbox_executor.execute(cmd)
            tool_output = cmd_result.stdout if cmd_result.success else f"Error: {cmd_result.stderr}"
        except Exception as e:
            tool_output = f"Execution Error: {str(e)}"
            
        # 4. Append Tool Output Message
        tool_msg = ToolMessage(content=tool_output, tool_call_id=call_id)
        messages.append(tool_msg)
        
        # 5. Resume Agent Loop
        # We pass the updated history. The agent_node will see [User, AI, Tool] and continue thinking.
        # Fetch workspace config explicitly to pass it down
        # Since we use get_task with eager load above, accessing task.workspace.config is safe BEFORE any commit
        # But we commit status="running" just before calling execute. 
        # So we should grab config before commit.
        workspace_config = task.workspace.config if task.workspace else {}

        task.status = "running"
        await self.db.commit()
        
        await self._execute_agent_task(task, resume_messages=messages, workspace_config=workspace_config)


    async def execute_task_sync(self, task_id: str) -> Task:
        """
        Execute task synchronously (blocking the request but managing state)
        Note: ideally for long running tasks we return immediately and run in background.
        """
        task = await self.get_task(task_id)
        if not task:
            raise ValueError("Task not found")

        # Update to running
        task.status = "running"
        await self.db.commit()

        # Execute
        # TODO: Route to correct executor based on workspace mode/config
        # For MVP Phase 1/2, we default to SandboxExecutor
        try:
            result: CommandResult = await sandbox_executor.execute(task.command)
            
            # Update to completed
            task.status = "completed" if result.success else "failed"
            task.result = result.model_dump()
        except Exception as e:
            task.status = "failed"
            task.result = CommandResult(
                success=False, 
                exit_code=-1, 
                stdout="", 
                stderr=str(e)
            ).model_dump()
        
        await self.db.commit()
        await self.db.refresh(task)
        return task
