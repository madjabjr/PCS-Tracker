from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from ..database import get_db
from ..models import ChecklistTask, User
from ..schemas import ChecklistTaskCreate, ChecklistTaskUpdate, ChecklistTaskResponse
from ..auth.dependencies import get_current_user
from ..gcal_sync import sync_task_to_gcal, delete_task_from_gcal

router = APIRouter()

VALID_CATEGORIES = {"medical", "passports", "housing"}


@router.get("/", response_model=list[ChecklistTaskResponse])
async def list_tasks(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChecklistTask).order_by(ChecklistTask.category, ChecklistTask.created_at)
    )
    return result.scalars().all()


@router.post("/", response_model=ChecklistTaskResponse, status_code=201)
async def create_task(
    body: ChecklistTaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category must be one of: {', '.join(VALID_CATEGORIES)}",
        )
    task = ChecklistTask(
        title=body.title,
        category=body.category,
        assigned_to_email=body.assigned_to_email,
        assigned_to_name=body.assigned_to_name,
        due_date=body.due_date,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    if task.due_date:
        await sync_task_to_gcal(task, current_user, db)
    return task


@router.patch("/{task_id}", response_model=ChecklistTaskResponse)
async def update_task(
    task_id: int,
    body: ChecklistTaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ChecklistTask).where(ChecklistTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    title_changed = body.title is not None and body.title != task.title
    due_changed = "due_date" in body.model_fields_set

    if body.title is not None:
        task.title = body.title
    if body.is_completed is not None:
        task.is_completed = body.is_completed
        task.completed_at = datetime.utcnow() if body.is_completed else None
    if body.assigned_to_email is not None:
        task.assigned_to_email = body.assigned_to_email or None
        task.assigned_to_name = body.assigned_to_name or None
    elif body.assigned_to_email == "":
        task.assigned_to_email = None
        task.assigned_to_name = None
    if due_changed:
        task.due_date = body.due_date

    await db.commit()
    await db.refresh(task)

    if (title_changed or due_changed) and task.due_date:
        await sync_task_to_gcal(task, current_user, db)
    elif due_changed and not task.due_date:
        await delete_task_from_gcal(task, current_user, db)

    return task


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ChecklistTask).where(ChecklistTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await delete_task_from_gcal(task, current_user, db)
    await db.delete(task)
    await db.commit()
