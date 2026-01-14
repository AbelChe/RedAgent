import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: 连接数据库/Redis
    print("🚀 AI-Pentest Agent Backend Starting...")
    
    # Create tables if they don't exist
    from app.core.database import engine, Base
    # Import all models to register them with Base.metadata
    from app.models.base import Workspace, Task, Message, CommandLog, ToolRun
    from app.models.job import Job
    
    async with engine.begin() as conn:
        # NOTE: In production you should use Alembic
        await conn.run_sync(Base.metadata.create_all)
        print("✅ Database tables initialized.")

    # 验证工具配置和镜像
    try:
        from app.services.container_registry import CONTAINER_REGISTRY
        print(f"✅ Container Registry Checked: {len(CONTAINER_REGISTRY)} tools loaded & validated.")
    except Exception as e:
        print(f"❌ Container Registry Check Failed: {e}")
        raise e
        
    yield
    # Shutdown: 清理资源
    print("🛑 Shutting down...")

app = FastAPI(
    title="RedAgent API",
    description="AI-Powered Penetration Testing Platform",
    version="0.1.0",
    lifespan=lifespan
)

from app.api import websockets, sandbox, tasks, workspaces, terminal
from app.routers import conversations  # conversations is in routers/

app.include_router(websockets.router)
app.include_router(sandbox.router)
app.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
app.include_router(workspaces.router, prefix="/workspaces", tags=["Workspaces"])
app.include_router(conversations.router, prefix="/api", tags=["Conversations"])  # Added
app.include_router(terminal.router, prefix="/terminal", tags=["Terminal"])

from app.api import tools
app.include_router(tools.router, prefix="/tools", tags=["Tools"])

from app.api import jobs
app.include_router(jobs.router, prefix="/api")

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发环境允许所有
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}

@app.get("/mcp/status")
async def mcp_status():
    """Check MCP Server connection status"""
    from app.services.connection_manager import manager
    is_connected = manager.mcp_connection is not None
    return {
        "connected": is_connected,
        "status": "connected" if is_connected else "disconnected"
    }

@app.get("/")
async def root():
    return {"message": "Welcome to RedAgent API - AI-Powered Penetration Testing Platform"}
