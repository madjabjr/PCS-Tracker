from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import WhitelistedEmail, User
from ..schemas import WhitelistEntryCreate, WhitelistEntryResponse, WhitelistRoleUpdate
from ..auth.dependencies import require_admin

router = APIRouter()


@router.get("/whitelist", response_model=list[WhitelistEntryResponse])
async def list_whitelist(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(WhitelistedEmail).order_by(WhitelistedEmail.created_at))
    return result.scalars().all()


@router.post("/whitelist", response_model=WhitelistEntryResponse, status_code=201)
async def add_to_whitelist(
    entry: WhitelistEntryCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    email = entry.email.lower().strip()

    if entry.role not in ("admin", "user"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role must be 'admin' or 'user'")

    existing = await db.execute(select(WhitelistedEmail).where(WhitelistedEmail.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in whitelist")

    new_entry = WhitelistedEmail(email=email, role=entry.role, added_by_id=current_user.id)
    db.add(new_entry)
    await db.commit()
    await db.refresh(new_entry)
    return new_entry


@router.patch("/whitelist/{entry_id}", response_model=WhitelistEntryResponse)
async def update_role(
    entry_id: int,
    update: WhitelistRoleUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if update.role not in ("admin", "user"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role must be 'admin' or 'user'")

    result = await db.execute(select(WhitelistedEmail).where(WhitelistedEmail.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    entry.role = update.role

    user_result = await db.execute(select(User).where(User.email == entry.email))
    user = user_result.scalar_one_or_none()
    if user:
        user.is_admin = (update.role == "admin")

    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/whitelist/{entry_id}", status_code=204)
async def remove_from_whitelist(
    entry_id: int,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(WhitelistedEmail).where(WhitelistedEmail.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    await db.delete(entry)
    await db.commit()
