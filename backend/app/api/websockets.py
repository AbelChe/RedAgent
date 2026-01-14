from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.connection_manager import manager
import json

router = APIRouter()

@router.websocket("/ws/{workspace_id}")
async def websocket_endpoint(websocket: WebSocket, workspace_id: str):
    await manager.connect(workspace_id, websocket)
    try:
        while True:
            # 接收客户端消息 (JSON)
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # 简单的 Echo 逻辑，后续对接 Agent
            if message.get("type") == "ping":
                await manager.broadcast(workspace_id, {"type": "pong"})
            
            elif message.get("type") == "chat":
                # 模拟回显
                await manager.broadcast(workspace_id, {
                    "type": "chat.message", 
                    "content": f"Echo: {message.get('content')}"
                })
                
    except WebSocketDisconnect:
        manager.disconnect(workspace_id, websocket)
    except Exception as e:
        print(f"WS Error: {e}")
        manager.disconnect(workspace_id, websocket)
@router.websocket("/mcp/{workspace_id}/connect")
async def mcp_connect_endpoint(websocket: WebSocket, workspace_id: str):
    """
    MCP Server Call-Home Endpoint (Workspace Specific)
    Authentication Required: `x-mcp-token` header or `token` query parameter
    """
    from app.core.database import AsyncSessionLocal
    from app.models.base import Workspace
    from sqlalchemy import select

    # 1. AUTHENTICATION
    auth_header = websocket.headers.get("x-mcp-token")
    query_token = websocket.query_params.get("token")
    client_token = auth_header or query_token

    if not client_token:
        print(f"⛔ MCP Auth Failed for {workspace_id}: No token provided.")
        await websocket.close(code=1008)
        return

    # Verify against database
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        workspace = result.scalar_one_or_none()
        
        if not workspace:
            print(f"⛔ MCP Auth Failed: Workspace {workspace_id} not found.")
            await websocket.close(code=1008)
            return

        config = workspace.config or {}
        expected_token = config.get("mcp_token")
        
        print(f"🔍 [MCP Auth Debug] Workspace: {workspace_id}")
        print(f"🔍 [MCP Auth Debug] Received Token: {client_token}")
        print(f"🔍 [MCP Auth Debug] Expected Token: {expected_token}")

        # Fallback for legacy/dev environments if needed, but better to be strict
        
        # Fallback for legacy/dev environments if needed, but better to be strict
        if not expected_token:
             # Try legacy global token if defined, specifically for 'dev' environment
             import os
             if os.getenv("ENVIRONMENT") == "dev":
                 expected_token = os.getenv("MCP_TOKEN", "dev-token-placeholder")
             else:
                 print(f"⛔ MCP Auth Failed: No token defined for workspace {workspace_id}.")
                 await websocket.close(code=1008)
                 return

        if client_token != expected_token:
            print(f"⛔ MCP Auth Failed for {workspace_id}. Token mismatch.")
            await websocket.close(code=1008)
            return

    print(f"🔌 Connection attempt from MCP Node for {workspace_id}: {websocket.client.host} (Auth Success)")
    await manager.register_mcp(workspace_id, websocket)
    
    try:
        # Initial Handshake: Ask for tools
        handshake_req = {
            "jsonrpc": "2.0",
            "id": "handshake",
            "method": "tools/list",
            "params": {}
        }
        await websocket.send_text(json.dumps(handshake_req))
        
        while True:
            data = await websocket.receive_text()
            # Pass everything to manager to handle RPC responses vs notifications
            await manager.handle_mcp_message(data)
            
    except WebSocketDisconnect:
        manager.disconnect_mcp(workspace_id)
    except Exception as e:
        print(f"MCP Error: {e}")
        manager.disconnect_mcp(workspace_id)
