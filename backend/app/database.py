from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import select, func, text
from .config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def create_tables():
    from . import models
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def run_migrations():
    new_columns = [
        "ALTER TABLE checklist_tasks ADD COLUMN due_date DATETIME",
        "ALTER TABLE users ADD COLUMN google_access_token TEXT",
        "ALTER TABLE users ADD COLUMN google_refresh_token TEXT",
        "ALTER TABLE users ADD COLUMN google_token_expiry DATETIME",
        "ALTER TABLE documents ADD COLUMN is_sensitive BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN pcs_calendar_id TEXT",
        "ALTER TABLE checklist_tasks ADD COLUMN gcal_event_id TEXT",
        "ALTER TABLE flight_itineraries ADD COLUMN gcal_dep_event_id TEXT",
        "ALTER TABLE flight_itineraries ADD COLUMN gcal_arr_event_id TEXT",
    ]
    async with engine.begin() as conn:
        for sql in new_columns:
            try:
                await conn.execute(text(sql))
            except Exception:
                pass


PCS_CHECKLIST_DEFAULTS = [
    ("Schedule physical exams for all family members", "medical"),
    ("Request dental and medical records", "medical"),
    ("Obtain immunization records for all family members", "medical"),
    ("Refill prescriptions (request 90-day supply)", "medical"),
    ("Transfer records to gaining installation TMC", "medical"),
    ("Verify EFMP (Exceptional Family Member Program) enrollment", "medical"),
    ("Schedule pre-departure eye exams", "medical"),
    ("Apply for / renew no-fee (official) passports", "passports"),
    ("Apply for / renew tourist passports", "passports"),
    ("Update dependent passports", "passports"),
    ("Verify all passports valid 6+ months past travel date", "passports"),
    ("Obtain visa if required for overseas PCS", "passports"),
    ("Submit housing application at gaining installation", "housing"),
    ("Notify current landlord or base housing of move-out date", "housing"),
    ("Schedule final housing inspection / walkthrough", "housing"),
    ("Research off-post housing options at new duty station", "housing"),
    ("Contact gaining unit sponsor for area housing tips", "housing"),
    ("Return base housing keys and complete out-processing", "housing"),
]


async def seed_checklist():
    from .models import ChecklistTask

    async with AsyncSessionLocal() as session:
        count_result = await session.execute(select(func.count()).select_from(ChecklistTask))
        if count_result.scalar() == 0:
            for title, category in PCS_CHECKLIST_DEFAULTS:
                session.add(ChecklistTask(title=title, category=category))
            await session.commit()


async def seed_whitelist():
    from .models import WhitelistedEmail, User
    from .config import settings
    from sqlalchemy import select

    if not settings.admin_email:
        return

    email = settings.admin_email.lower().strip()

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(WhitelistedEmail).where(WhitelistedEmail.email == email))
        if not result.scalar_one_or_none():
            session.add(WhitelistedEmail(email=email, role="admin"))

        user_result = await session.execute(select(User).where(User.email == email))
        user = user_result.scalar_one_or_none()
        if user and not user.is_admin:
            user.is_admin = True

        await session.commit()
