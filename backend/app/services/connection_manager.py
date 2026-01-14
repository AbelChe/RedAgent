from fastapi import WebSocket
from typing import Dict, List
import json

import asyncio
import logging
from typing import Dict, List, Optional
import uuid
from app.services.event_bus import event_bus, Event
from app.core.database import AsyncSessionLocal
from app.models.base import ToolRun
from sqlalchemy import select

class ConnectionManager:
    def __init__(self):
        # workspace_id -> List[WebSocket]
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # session_id -> WebSocket
        self.terminal_connections: Dict[str, WebSocket] = {}
        # MCP Node Connection (Workspace specific)
        # workspace_id -> WebSocket
        self.mcp_connection: Dict[str, WebSocket] = {}
        # Pending RPC requests: id -> Future
        self.pending_requests: Dict[str, asyncio.Future] = {}

    # ... (existing connect/disconnect/broadcast) ...

    async def connect(self, workspace_id: str, websocket: WebSocket):
        await websocket.accept()
        if workspace_id not in self.active_connections:
            self.active_connections[workspace_id] = []
        self.active_connections[workspace_id].append(websocket)
        print(f"🔌 Client connected to workspace {workspace_id}")

    def disconnect(self, workspace_id: str, websocket: WebSocket):
        if workspace_id in self.active_connections:
            if websocket in self.active_connections[workspace_id]:
                self.active_connections[workspace_id].remove(websocket)
            if not self.active_connections[workspace_id]:
                del self.active_connections[workspace_id]
        print(f"🔌 Client disconnected from workspace {workspace_id}")
        
    async def register_terminal(self, session_id: str, websocket: WebSocket):
        """Register a terminal websocket connection"""
        await websocket.accept()
        self.terminal_connections[session_id] = websocket
        print(f"🔌 Terminal Client connected: {session_id}")
        
    def disconnect_terminal(self, session_id: str):
        if session_id in self.terminal_connections:
            del self.terminal_connections[session_id]
        print(f"🔌 Terminal Client disconnected: {session_id}")

    # ... (broadcast unchanged) ...
    async def broadcast(self, workspace_id: str, message: dict):
        """推送消息到指定工作空间的所有客户端"""
        if workspace_id in self.active_connections:
            text = json.dumps(message)
            for connection in list(self.active_connections[workspace_id]):
                try:
                    await connection.send_text(text)
                except Exception as e:
                    print(f"⚠️ Error broadcasting to client: {e}")
                    self.disconnect(workspace_id, connection)

    # --- MCP Support ---

    async def register_mcp(self, workspace_id: str, websocket: WebSocket):
        """Register the MCP Server connection for a workspace"""
        await websocket.accept()
        if not self.mcp_connection:
             self.mcp_connection = {} # Initialize if needed (though init does it)
        
        # In case we repurposed self.mcp_connection to be Dict[str, WebSocket]
        # But wait, type hint was Optional[WebSocket]. I need to update init too.
        # Let's assume I will update init in a separate step or just cast here.
        # Actually, let's update init via multi_replace or careful chunking.
        # I'll rely on python dynamic typing but cleaner to update init.
        
        # For now, let's treat self.mcp_connection as Dict[str, WebSocket] 
        # (I will update init in next step to be clean)
        if hasattr(self.mcp_connection, "send_text"): # Old single socket
             self.mcp_connection = {}
             
        if self.mcp_connection is None:
            self.mcp_connection = {}

        self.mcp_connection[workspace_id] = websocket
        print(f"🔌 MCP Node Registered for workspace {workspace_id}")
    
    def disconnect_mcp(self, workspace_id: str):
        if self.mcp_connection and isinstance(self.mcp_connection, dict):
            if workspace_id in self.mcp_connection:
                del self.mcp_connection[workspace_id]
        print(f"🔌 MCP Node Disconnected for workspace {workspace_id}")

    async def send_mcp_notification(self, workspace_id: str, method: str, params: dict):
        """Send a one-way notification to MCP"""
        if not self.mcp_connection or not isinstance(self.mcp_connection, dict) or workspace_id not in self.mcp_connection:
            print(f"⚠️ Cannot send notification: No MCP Node connected for {workspace_id}")
            return
            
        ws = self.mcp_connection[workspace_id]
        bs = json.dumps({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        })
        try:
            await ws.send_text(bs)
        except Exception as e:
            print(f"⚠️ Error sending notification: {e}")

    async def send_mcp_request(self, workspace_id: str, method: str, params: dict, timeout: int = 60) -> dict:
        """
        Send a generic JSON-RPC request to the connected MCP node.
        """
        if not self.mcp_connection or not isinstance(self.mcp_connection, dict) or workspace_id not in self.mcp_connection:
             raise ConnectionError(f"No MCP Node connected for workspace {workspace_id}")
        
        ws = self.mcp_connection[workspace_id]
        
        request_id = str(uuid.uuid4())
        request = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params
        }
        
        # Create Future to wait for response
        future = asyncio.get_running_loop().create_future()
        self.pending_requests[request_id] = future
        
        try:
            await ws.send_text(json.dumps(request))
            print(f"📡 Sent MCP Request {request_id}: {method}")
            return await asyncio.wait_for(future, timeout)
        finally:
            self.pending_requests.pop(request_id, None)

    async def call_mcp_tool(self, workspace_id: str, tool_name: str, arguments: dict, timeout: int = 60) -> dict:
        """Helper for tools/call"""
        return await self.send_mcp_request(workspace_id, "tools/call", {
            "name": tool_name,
            "arguments": arguments
        }, timeout)
    
    async def kill_tool_run(self, workspace_id: str, run_id: str):
        """Send tool/kill notification to terminate a running tool"""
        await self.send_mcp_notification(workspace_id, "tool/kill", {
            "runId": run_id
        })

    async def get_mcp_prompt(self, workspace_id: str, prompt_name: str, arguments: dict = None, timeout: int = 30) -> str:
        """
        Helper for prompts/get. Returns the concatenated text content of the prompt.
        """
        if arguments is None:
            arguments = {}
            
        response = await self.send_mcp_request(workspace_id, "prompts/get", {
            "name": prompt_name,
            "arguments": arguments
        }, timeout)
        
        messages = response.get("messages", [])
        full_text = ""
        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, str):
                full_text += content + "\n"
            elif isinstance(content, dict) and content.get("type") == "text":
                 full_text += content.get("text", "") + "\n"
        
        return full_text.strip()

    async def handle_mcp_message(self, data: str):
        """Process incoming message from MCP"""
        try:
            # DEBUG: Print all incoming MCP messages
            print(f"🔍 [MCP-IN] {data[:200]}...")  # First 200 chars
            message = json.loads(data)
            msg_id = message.get("id")
            
            # Match response to pending request
            if msg_id and msg_id in self.pending_requests:
                future = self.pending_requests[msg_id]
                if "error" in message:
                    future.set_exception(Exception(message["error"].get("message", "Unknown RPC Error")))
                elif "result" in message:
                    future.set_result(message["result"])
                else:
                    pass
            elif "method" in message:
                # Notification handling
                method = message.get("method")
                params = message.get("params", {})
                
                if method == "terminal/output":
                    session_id = params.get("sessionId")
                    content = params.get("data")
                    # Debug Log
                    print(f"🔍 [Back-Term] Received output for {session_id}. Len: {len(content) if content else 0}. Has WS? {session_id in self.terminal_connections}")
                    
                    if session_id in self.terminal_connections:
                        ws = self.terminal_connections[session_id]
                        try:
                            # Forward directly to frontend WS if connected
                            await ws.send_text(content)
                        except Exception as e:
                            print(f"⚠️ Error forwarding terminal output via WS: {e}")
                            self.disconnect_terminal(session_id)
                            
                    # 2. Publish to SSE (Critical for React Frontend)
                    for ws_id in event_bus._subscribers.keys():
                        await event_bus.publish(Event(
                            type="terminal/output",
                            workspace_id=ws_id,
                            data={"sessionId": session_id, "data": content}
                        ))
                
                elif method == "tool/log":
                    # Handle Tool Logs (Filtered by Workspace)
                    tool_name = params.get("tool")
                    run_id = params.get("runId")
                    command = params.get("command")
                    data = params.get("data")
                    log_workspace_id = params.get("workspaceId")
                    
                    sub_count = len(event_bus._subscribers.keys())
                    logging.info(f"🔍 [Back-Log] Processing tool/log for {tool_name} (run: {run_id}, ws: {log_workspace_id}). Subscribers: {sub_count}")

                    # Publish to EventBus
                    if log_workspace_id:
                        await event_bus.publish(Event(
                            type="tool_log",
                            workspace_id=log_workspace_id,
                            data={
                                "type": "tool_log",
                                "data": {
                                    "tool": tool_name,
                                    "runId": run_id,
                                    "command": command,
                                    "data": data
                                }
                            }
                        ))
                        
                        # Persist to database
                        try:
                            async with AsyncSessionLocal() as db:
                                # Check if run exists
                                result = await db.execute(select(ToolRun).where(ToolRun.id == run_id))
                                existing_run = result.scalar_one_or_none()
                                
                                if existing_run:
                                    # Append log
                                    existing_run.logs = existing_run.logs + [data] if existing_run.logs else [data]
                                else:
                                    # Create new run
                                    new_run = ToolRun(
                                        id=run_id,
                                        workspace_id=log_workspace_id,
                                        tool=tool_name,
                                        command=command,
                                        logs=[data],
                                        status="running"
                                    )
                                    db.add(new_run)
                                await db.commit()
                        except Exception as e:
                            logging.error(f"Failed to persist tool log: {e}")
                    else:
                        # Fallback: Broadcast to all
                        for ws_id in event_bus._subscribers.keys():
                            await event_bus.publish(Event(
                                type="tool_log",
                                workspace_id=ws_id,
                                data={
                                    "type": "tool_log",
                                    "data": {
                                        "tool": tool_name,
                                        "runId": run_id,
                                        "command": command,
                                        "data": data
                                    }
                                }
                            ))
                
                elif method == "tool/exit":
                    # Handle Tool Exit (Filtered by Workspace)
                    tool_name = params.get("tool")
                    run_id = params.get("runId")
                    status = params.get("status")
                    error = params.get("error")
                    log_workspace_id = params.get("workspaceId")
                    
                    logging.info(f"🔍 [Back-Log] Processing tool/exit for {tool_name} (run: {run_id}, ws: {log_workspace_id}). Status: {status}")

                    # Publish to EventBus
                    if log_workspace_id:
                        await event_bus.publish(Event(
                            type="tool_exit",
                            workspace_id=log_workspace_id,
                            data={
                                "type": "tool_exit",
                                "data": {
                                    "tool": tool_name,
                                    "runId": run_id,
                                    "status": status,
                                    "error": error
                                }
                            }
                        ))
                        
                        # Persist status to database
                        try:
                            async with AsyncSessionLocal() as db:
                                result = await db.execute(select(ToolRun).where(ToolRun.id == run_id))
                                existing_run = result.scalar_one_or_none()
                                if existing_run:
                                    # MCP sends 'completed' or 'failed'
                                    existing_run.status = "completed" if status in ("completed", "success") else "failed"
                                    await db.commit()
                        except Exception as e:
                            logging.error(f"Failed to persist tool exit: {e}")
                    else:
                        for ws_id in event_bus._subscribers.keys():
                            await event_bus.publish(Event(
                                type="tool_exit",
                                workspace_id=ws_id,
                                data={
                                    "type": "tool_exit",
                                    "data": {
                                        "tool": tool_name,
                                        "runId": run_id,
                                        "status": status,
                                        "error": error
                                    }
                                }
                            ))

            else:
                # Log other messages
                print(f"📥 Received MCP Message (No handler): {data[:100]}...")
                
        except Exception as e:
            print(f"⚠️ Error handling MCP message: {e}")

manager = ConnectionManager()
