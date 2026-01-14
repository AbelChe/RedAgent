from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from typing import AsyncGenerator
from app.core.config import settings

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 数据库引擎 (Async)
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=True, # 调试模式
)

# 数据库引擎 (Sync for Celery)
# 将 asyncpg 替换为 psycopg2 (或其他同步驱动)
SYNC_DATABASE_URL = settings.DATABASE_URL.replace("+asyncpg", "")
if "+asyncpg" not in settings.DATABASE_URL and "+psycopg" not in settings.DATABASE_URL:
     # Fallback if URL doesn't have driver specified, though ideally checking schema is better
     pass

sync_engine = create_engine(
    SYNC_DATABASE_URL,
    echo=True,
    pool_pre_ping=True
)

# 会话工厂 (Async)
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# 会话工厂 (Sync)
SessionLocal = sessionmaker(
    autocommit=False, 
    autoflush=False, 
    bind=sync_engine
)

# ORM 基类
class Base(DeclarativeBase):
    pass

# 依赖注入
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
