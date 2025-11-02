from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .api import routes_clipboard, routes_auth
from .core.config import get_settings
from .core.database import init_db

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    print("Initialize database finished.")
    yield
    print("Shutting down application.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Clipboard API service for storing and retrieving clipboard data.",
    lifespan=lifespan,
    docs_url=None,  # 禁用 /docs
    redoc_url=None,  # 禁用 /redoc
    openapi_url=None  # 禁用 /openapi.json
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_auth.router)
app.include_router(routes_clipboard.router)


# 如果不需要根路径访问，可以注释掉或删除
# @app.get("/")
# async def root():
#     return {
#         "message": "Welcome to the Clipboard API!",
#         "version": settings.APP_VERSION,
#         "docs": "/docs"
#     }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
