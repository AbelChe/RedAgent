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
@router.websocket("/connect")
async def mcp_connect_endpoint(websocket: WebSocket):
    """
    MCP Server Call-Home Endpoint
    """
    print(f"Connection attempt from MCP Node: {websocket.client.host}")
    await manager.register_mcp(websocket)
    
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
            manager.handle_mcp_message(data)
            
    except WebSocketDisconnect:
        manager.disconnect_mcp()
    except Exception as e:
        print(f"MCP Error: {e}")
        manager.disconnect_mcp()
