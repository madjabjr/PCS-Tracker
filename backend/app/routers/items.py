import uuid
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import HighValueItem, User
from ..schemas import HighValueItemResponse
from ..auth.dependencies import get_current_user

router = APIRouter()

UPLOADS_DIR = Path("uploads")
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


def _ext_from_content_type(ct: str) -> str:
    return {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp"}.get(ct, ".jpg")


async def _save_image(file: UploadFile) -> str:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Image must be JPEG, PNG, GIF, or WebP")
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image must be under 10 MB")
    ext = _ext_from_content_type(file.content_type)
    filename = f"{uuid.uuid4().hex}{ext}"
    UPLOADS_DIR.mkdir(exist_ok=True)
    (UPLOADS_DIR / filename).write_bytes(data)
    return filename


def _delete_image(filename: Optional[str]) -> None:
    if filename:
        path = UPLOADS_DIR / filename
        if path.exists():
            path.unlink()


@router.get("/", response_model=list[HighValueItemResponse])
async def list_items(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(HighValueItem).order_by(HighValueItem.created_at))
    return result.scalars().all()


@router.post("/", response_model=HighValueItemResponse, status_code=201)
async def create_item(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    notes: Optional[str] = Form(None),
    serial_number: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    image_filename = None
    if image and image.filename:
        image_filename = await _save_image(image)

    item = HighValueItem(
        name=name,
        description=description or None,
        price=price,
        notes=notes or None,
        serial_number=serial_number or None,
        image_filename=image_filename,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/{item_id}", response_model=HighValueItemResponse)
async def update_item(
    item_id: int,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    notes: Optional[str] = Form(None),
    serial_number: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(HighValueItem).where(HighValueItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    if name is not None:
        item.name = name
    if description is not None:
        item.description = description or None
    if price is not None:
        item.price = price
    if notes is not None:
        item.notes = notes or None
    if serial_number is not None:
        item.serial_number = serial_number or None

    if image and image.filename:
        old_filename = item.image_filename
        item.image_filename = await _save_image(image)
        _delete_image(old_filename)

    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
async def delete_item(
    item_id: int,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(HighValueItem).where(HighValueItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    _delete_image(item.image_filename)
    await db.delete(item)
    await db.commit()
