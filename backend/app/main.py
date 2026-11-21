from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import Base, engine
from app.core.redis import close_redis, get_redis

logger = logging.getLogger("uvicorn")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Initializes database schema, verifies Redis connectivity, and handles graceful shutdown.
    """
    logger.info("Starting Evently Backend API...")

    # Verify and sync database schema
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            logger.info("Database schema checked and tables verified.")
    except Exception as exc:
        logger.warning(f"Database startup verification notice: {exc}")

    # Check Redis connectivity
    try:
        client = get_redis()
        await client.ping()
        logger.info("Redis connection successfully established.")
    except Exception as exc:
        logger.warning(f"Redis startup connection notice: {exc}")

    yield

    # Clean up resources on shutdown
    logger.info("Shutting down Evently Backend API...")
    try:
        await close_redis()
    except Exception:
        pass
    await engine.dispose()
    logger.info("Application shutdown complete.")


app = FastAPI(
    title="Evently API",
    description="University Campus Event Management System Backend API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS configuration allowing configured frontend origins
allowed_origins = [
    settings.FRONTEND_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]
# Remove any empty strings and duplicates
allowed_origins = list({origin for origin in allowed_origins if origin})

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all API version 1 routers
app.include_router(api_router, prefix="/api/v1")


@app.get("/", tags=["health"])
async def root_health_check():
    """
    Root health check endpoint.
    """
    return {"status": "ok", "service": "evently-api"}
