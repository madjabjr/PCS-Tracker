from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
from .database import create_tables, run_migrations, seed_whitelist, seed_checklist, get_db
from .models import User
from .schemas import UserSummary
from .auth.dependencies import get_current_user
from .routers import auth, admin
from .routers import checklist, items
from .routers import calendar, travel
from .routers import documents, export
from .routers import housing

UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)
Path("documents").mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    await run_migrations()
    await seed_whitelist()
    await seed_checklist()
    yield


app = FastAPI(title="PCS Tracker API", lifespan=lifespan)

app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(checklist.router, prefix="/api/checklist", tags=["checklist"])
app.include_router(items.router, prefix="/api/items", tags=["items"])
app.include_router(calendar.router, prefix="/api/calendar", tags=["calendar"])
app.include_router(travel.router, prefix="/api/travel", tags=["travel"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
app.include_router(housing.router, prefix="/api/housing", tags=["housing"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/users", response_model=list[UserSummary])
async def list_users(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.is_active == True))
    return result.scalars().all()
