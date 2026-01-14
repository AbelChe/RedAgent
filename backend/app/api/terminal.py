from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.connection_manager import manager
import json

router = APIRouter()

@router.websocket("/ws/{session_id}")
async def terminal_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for Interactive Terminal.
    Path param `session_id` identifies the terminal session.
    Query param `workspace_id` is required to route to correct MCP.
    """
    workspace_id = websocket.query_params.get("workspaceId")
    if not workspace_id:
        print(f"⚠️ Terminal connection rejected: Missing workspaceId for session {session_id}")
        await websocket.close(code=1008)
        return

    print(f"🔌 [Terminal] Connection attempt for session: {session_id} (WS: {workspace_id})")
    # 1. Accept and Register
    await manager.register_terminal(session_id, websocket)
    
    try:
        # 2. Initialize Terminal on MCP
        try:
            print(f"🚀 Initializing terminal session {session_id} on MCP ({workspace_id})...")
            await manager.call_mcp_tool(workspace_id, "start_terminal", {
                "id": session_id,
                "image": "pentest-sandbox" 
            }, timeout=10)
            print(f"✅ Terminal session {session_id} initialized.")
        except Exception as e:
            await websocket.send_text(f"\r\nError starting terminal: {e}\r\n")
        
        # 3. Loop for Input
        while True:
            data = await websocket.receive_text()
            
            try:
                # Protocol: JSON {type: 'input'|'resize', ...}
                msg = json.loads(data)
                msg_type = msg.get("type")
                
                if msg_type == "input":
                    content = msg.get("data", "")
                    await manager.send_mcp_notification(workspace_id, "terminal/input", {
                        "sessionId": session_id,
                        "data": content
                    })
                elif msg_type == "resize":
                    cols = msg.get("cols")
                    rows = msg.get("rows")
                    if cols and rows:
                        await manager.send_mcp_notification(workspace_id, "terminal/resize", {
                            "sessionId": session_id,
                            "cols": cols,
                            "rows": rows
                        })
                else:
                    # Fallback or unknown
                    pass
            except json.JSONDecodeError:
                # Treat raw text as input (backward compatibility or lazy frontend)
                # But we prefer JSON.
                # Let's assume raw input for now if JSON fails, for easier testing with raw WS clients?
                # No, strict protocol is better for xterm integration.
                pass
                
    except WebSocketDisconnect:
        manager.disconnect_terminal(session_id)
    except Exception as e:
        print(f"Terminal WS Error: {e}")
        manager.disconnect_terminal(session_id)
