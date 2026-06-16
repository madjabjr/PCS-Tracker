import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import HousingWaitlist, HousingProperty, User
from ..schemas import WaitlistCreate, WaitlistUpdate, WaitlistResponse, PropertyResponse
from ..auth.dependencies import get_current_user

router = APIRouter()

UPLOADS_DIR = Path("uploads")
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_PHOTO_BYTES = 10 * 1024 * 1024

VALID_WAITLIST_STATUSES = {"active", "removed", "housed"}
VALID_PROPERTY_STATUSES = {"considering", "shortlisted", "rejected", "selected"}


def _ext_from_ct(ct: str) -> str:
    return {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp"}.get(ct, ".jpg")


async def _save_photo(file: UploadFile) -> str:
    if file.content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(status_code=400, detail="Photo must be JPEG, PNG, GIF, or WebP")
    data = await file.read()
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="Photo must be under 10 MB")
    UPLOADS_DIR.mkdir(exist_ok=True)
    filename = f"{uuid.uuid4().hex}{_ext_from_ct(file.content_type)}"
    (UPLOADS_DIR / filename).write_bytes(data)
    return filename


def _delete_photo(filename: str) -> None:
    path = UPLOADS_DIR / filename
    if path.exists():
        path.unlink()


# ── Waitlist endpoints ─────────────────────────────────────────────────────────

@router.get("/waitlists", response_model=list[WaitlistResponse])
async def list_waitlists(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(HousingWaitlist).order_by(HousingWaitlist.created_at.desc()))
    return result.scalars().all()


@router.post("/waitlists", response_model=WaitlistResponse, status_code=201)
async def create_waitlist(
    body: WaitlistCreate,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.status not in VALID_WAITLIST_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(VALID_WAITLIST_STATUSES)}")
    entry = HousingWaitlist(
        base_name=body.base_name.strip(),
        waitlist_type=body.waitlist_type.strip(),
        position=body.position,
        status=body.status,
        date_applied=body.date_applied,
        notes=body.notes or None,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.patch("/waitlists/{entry_id}", response_model=WaitlistResponse)
async def update_waitlist(
    entry_id: int,
    body: WaitlistUpdate,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(HousingWaitlist).where(HousingWaitlist.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Waitlist entry not found")

    if body.base_name is not None:
        entry.base_name = body.base_name.strip()
    if body.waitlist_type is not None:
        entry.waitlist_type = body.waitlist_type.strip()
    if body.position is not None:
        entry.position = body.position
    if body.status is not None:
        if body.status not in VALID_WAITLIST_STATUSES:
            raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(VALID_WAITLIST_STATUSES)}")
        entry.status = body.status
    if body.date_applied is not None:
        entry.date_applied = body.date_applied
    if body.notes is not None:
        entry.notes = body.notes or None
    entry.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/waitlists/{entry_id}", status_code=204)
async def delete_waitlist(
    entry_id: int,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(HousingWaitlist).where(HousingWaitlist.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Waitlist entry not found")
    await db.delete(entry)
    await db.commit()


# ── Property endpoints ─────────────────────────────────────────────────────────

@router.get("/properties", response_model=list[PropertyResponse])
async def list_properties(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(HousingProperty).order_by(HousingProperty.created_at.desc()))
    return result.scalars().all()


@router.post("/properties", response_model=PropertyResponse, status_code=201)
async def create_property(
    name: str = Form(...),
    address: Optional[str] = Form(None),
    rent: Optional[float] = Form(None),
    utilities_estimate: Optional[float] = Form(None),
    commute_time_minutes: Optional[int] = Form(None),
    bedrooms: Optional[int] = Form(None),
    bathrooms: Optional[float] = Form(None),
    pet_friendly: Optional[bool] = Form(False),
    notes: Optional[str] = Form(None),
    status: str = Form("considering"),
    photos: list[UploadFile] = File(default=[]),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if status not in VALID_PROPERTY_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(VALID_PROPERTY_STATUSES)}")

    saved_photos = []
    for photo in photos:
        if photo and photo.filename:
            saved_photos.append(await _save_photo(photo))

    prop = HousingProperty(
        name=name.strip(),
        address=address or None,
        rent=rent,
        utilities_estimate=utilities_estimate,
        commute_time_minutes=commute_time_minutes,
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        pet_friendly=pet_friendly or False,
        notes=notes or None,
        status=status,
        photos=json.dumps(saved_photos) if saved_photos else None,
    )
    db.add(prop)
    await db.commit()
    await db.refresh(prop)
    return prop


@router.patch("/properties/{prop_id}", response_model=PropertyResponse)
async def update_property(
    prop_id: int,
    name: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    rent: Optional[float] = Form(None),
    utilities_estimate: Optional[float] = Form(None),
    commute_time_minutes: Optional[int] = Form(None),
    bedrooms: Optional[int] = Form(None),
    bathrooms: Optional[float] = Form(None),
    pet_friendly: Optional[bool] = Form(None),
    notes: Optional[str] = Form(None),
    prop_status: Optional[str] = Form(None),
    photos: list[UploadFile] = File(default=[]),
    remove_photos: Optional[str] = Form(None),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(HousingProperty).where(HousingProperty.id == prop_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    if name is not None:
        prop.name = name.strip()
    if address is not None:
        prop.address = address or None
    if rent is not None:
        prop.rent = rent
    if utilities_estimate is not None:
        prop.utilities_estimate = utilities_estimate
    if commute_time_minutes is not None:
        prop.commute_time_minutes = commute_time_minutes
    if bedrooms is not None:
        prop.bedrooms = bedrooms
    if bathrooms is not None:
        prop.bathrooms = bathrooms
    if pet_friendly is not None:
        prop.pet_friendly = pet_friendly
    if notes is not None:
        prop.notes = notes or None
    if prop_status is not None:
        if prop_status not in VALID_PROPERTY_STATUSES:
            raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(VALID_PROPERTY_STATUSES)}")
        prop.status = prop_status

    existing = json.loads(prop.photos) if prop.photos else []
    to_remove = json.loads(remove_photos) if remove_photos else []
    for fn in to_remove:
        _delete_photo(fn)
    existing = [f for f in existing if f not in to_remove]

    for photo in photos:
        if photo and photo.filename:
            existing.append(await _save_photo(photo))

    prop.photos = json.dumps(existing) if existing else None
    prop.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(prop)
    return prop


@router.delete("/properties/{prop_id}", status_code=204)
async def delete_property(
    prop_id: int,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(HousingProperty).where(HousingProperty.id == prop_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    if prop.photos:
        for fn in json.loads(prop.photos):
            _delete_photo(fn)

    await db.delete(prop)
    await db.commit()
