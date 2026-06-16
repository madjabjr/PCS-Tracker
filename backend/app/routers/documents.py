import io
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import Document, User
from ..schemas import DocumentResponse
from ..auth.dependencies import get_current_user
from ..crypto import decrypt_bytes
from ..storage import (
    compress_encrypt_write,
    decrypt_decompress_stream,
    is_v2_format,
    should_compress,
    FileTooLargeError,
)

router = APIRouter()

DOCUMENTS_DIR = Path("documents")
MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB
VALID_CATEGORIES = {"orders", "medical", "housing", "financial", "personnel", "other"}


async def _save_file(file: UploadFile, _sensitive: bool) -> tuple[str, int]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    ext = Path(file.filename).suffix.lower()
    filename = f"{uuid.uuid4().hex}{ext}"
    DOCUMENTS_DIR.mkdir(exist_ok=True)

    compress = should_compress(file.filename, file.content_type)
    try:
        original_size = await compress_encrypt_write(
            file,
            DOCUMENTS_DIR / filename,
            compress=compress,
            max_bytes=MAX_FILE_BYTES,
        )
    except FileTooLargeError:
        raise HTTPException(status_code=400, detail="File must be under 25 MB")

    return filename, original_size


@router.get("/", response_model=list[DocumentResponse])
async def list_documents(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).order_by(Document.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=DocumentResponse, status_code=201)
async def upload_document(
    name: str = Form(...),
    category: str = Form("other"),
    description: Optional[str] = Form(None),
    is_sensitive: bool = Form(False),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Category must be one of: {', '.join(sorted(VALID_CATEGORIES))}",
        )
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    filename, file_size = await _save_file(file, is_sensitive)

    doc = Document(
        name=name.strip(),
        category=category,
        description=description or None,
        filename=filename,
        original_filename=file.filename,
        file_size=file_size,
        content_type=file.content_type,
        uploaded_by_email=current_user.email,
        is_sensitive=is_sensitive,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: int,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    path = DOCUMENTS_DIR / doc.filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    media_type = doc.content_type or "application/octet-stream"
    disposition = f'attachment; filename="{doc.original_filename}"'

    if is_v2_format(path):
        # New compress+encrypt format — stream decrypt→decompress to client
        return StreamingResponse(
            decrypt_decompress_stream(path),
            media_type=media_type,
            headers={"Content-Disposition": disposition},
        )

    # ── Legacy formats (files uploaded before v2 pipeline) ──────────────────
    if doc.is_sensitive:
        # Legacy: Fernet-only encrypted, no compression
        decrypted = decrypt_bytes(path.read_bytes())
        return StreamingResponse(
            io.BytesIO(decrypted),
            media_type=media_type,
            headers={"Content-Disposition": disposition},
        )

    # Legacy: plain (unencrypted) file
    return FileResponse(
        path=str(path),
        filename=doc.original_filename,
        media_type=media_type,
    )


@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    doc_id: int,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    path = DOCUMENTS_DIR / doc.filename
    if path.exists():
        path.unlink()

    await db.delete(doc)
    await db.commit()
