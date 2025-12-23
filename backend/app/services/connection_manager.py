from fastapi import WebSocket
from typing import Dict, List
import json

import asyncio
from typing import Dict, List, Optional
import uuid

class ConnectionManager:
    def __init__(self):
        # workspace_id -> List[WebSocket]
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # MCP Node Connection (Global for now, or could be per workspace)
        self.mcp_connection: Optional[WebSocket] = None
        # Pending RPC requests: id -> Future
        self.pending_requests: Dict[str, asyncio.Future] = {}

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

    async def register_mcp(self, websocket: WebSocket):
        """Register the MCP Server connection"""
        await websocket.accept()
        self.mcp_connection = websocket
        print("🔌 MCP Node Registered")
    
    def disconnect_mcp(self):
        self.mcp_connection = None
        print("🔌 MCP Node Disconnected")

    async def send_mcp_request(self, method: str, params: dict, timeout: int = 60) -> dict:
        """
        Send a generic JSON-RPC request to the connected MCP node.
        """
        if not self.mcp_connection:
            raise ConnectionError("No MCP Node connected")
        
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
            await self.mcp_connection.send_text(json.dumps(request))
            print(f"📡 Sent MCP Request {request_id}: {method}")
            return await asyncio.wait_for(future, timeout)
        finally:
            self.pending_requests.pop(request_id, None)

    async def call_mcp_tool(self, tool_name: str, arguments: dict, timeout: int = 60) -> dict:
        """Helper for tools/call"""
        return await self.send_mcp_request("tools/call", {
            "name": tool_name,
            "arguments": arguments
        }, timeout)

    async def get_mcp_prompt(self, prompt_name: str, arguments: dict = None, timeout: int = 30) -> str:
        """
        Helper for prompts/get. Returns the concatenated text content of the prompt.
        """
        if arguments is None:
            arguments = {}
            
        response = await self.send_mcp_request("prompts/get", {
            "name": prompt_name,
            "arguments": arguments
        }, timeout)
        
        # Parse standard MCP prompt result:
        # { "messages": [ { "role": "user", "content": { "type": "text", "text": "..." } } ] }
        # Note: MCP spec says content is "text" (string) or list of content objects?
        # Actually in recent spec, PromptMessage content is usually just "content".
        # Let's handle standard format.
        
        messages = response.get("messages", [])
        full_text = ""
        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, str):
                full_text += content + "\n"
            elif isinstance(content, dict) and content.get("type") == "text":
                 full_text += content.get("text", "") + "\n"
        
        return full_text.strip()

    def handle_mcp_message(self, data: str):
        """Process incoming message from MCP"""
        try:
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
                    # Notifications or other messages
                    pass
            else:
                # Could be a notification or log from MCP
                print(f"📥 Received MCP Message (No handler): {data[:100]}...")
                
        except Exception as e:
            print(f"⚠️ Error handling MCP message: {e}")

manager = ConnectionManager()
