from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: 连接数据库/Redis
    print("🚀 AI-Pentest Agent Backend Starting...")
    
    # Create tables if they don't exist
    from app.core.database import engine, Base
    # Import all models to register them with Base.metadata
    from app.models.base import Workspace, Task, Message, CommandLog
    
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

from app.api import websockets, sandbox, tasks, workspaces

app.include_router(websockets.router)
app.include_router(sandbox.router)
app.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
app.include_router(workspaces.router, prefix="/workspaces", tags=["Workspaces"])

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

@app.get("/")
async def root():
    return {"message": "Welcome to RedAgent API - AI-Powered Penetration Testing Platform"}
