import os
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

# Create asynchronous SQLAlchemy engine tuned for remote Supabase Postgres
# (avoids pre_ping SELECT 1 round-trips and verbose SQL stdout dumps on every request)
engine = create_async_engine(
    settings.async_database_url,
    echo=(os.getenv("SQL_ECHO", "").lower() in ("1", "true")),
    future=True,
    pool_pre_ping=False,
    pool_size=10,
    max_overflow=15,
    pool_recycle=180,
    pool_timeout=15,
    connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0},
)

# Create session maker for async sessions
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy declarative models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides an asynchronous SQLAlchemy session.
    Automatically handles session commit/rollback and cleanup.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
