from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import os

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.batch import Batch
from app.models.image import Image
from app.models.prediction import Prediction
from app.models.task import Task
from app.models.user import User
from app.schemas.prediction import PredictionRead
from app.schemas.task import TaskRead, TaskUpdate

router = APIRouter()


@router.get("/my-queue", response_model=list[TaskRead])
def get_my_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(Task, Image, Batch)
        .join(Image, Task.image_id == Image.id)
        .join(Batch, Image.batch_id == Batch.id)
        .filter(Task.user_id == current_user.id)
        .all()
    )
    results = []
    for task, image, batch in rows:
        results.append(TaskRead(
            id=task.id,
            image_id=task.image_id,
            user_id=task.user_id,
            status=task.status,
            annotations_json=task.annotations_json,
            batch_id=batch.id,
            batch_name=batch.name,
            file_name=os.path.basename(image.file_path),
            created_at=task.created_at,
        ))
    return results


@router.get("/{task_id}", response_model=TaskRead)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your task")
    return task


@router.get("/{task_id}/predictions", response_model=list[PredictionRead])
def get_task_predictions(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your task")
    return db.query(Prediction).filter(Prediction.image_id == task.image_id).all()


@router.delete("/my-batch/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_batch_tasks(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete all of the current user's tasks for a given batch."""
    tasks = (
        db.query(Task)
        .join(Image, Task.image_id == Image.id)
        .filter(Image.batch_id == batch_id, Task.user_id == current_user.id)
        .all()
    )
    for task in tasks:
        db.delete(task)
    db.commit()


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your task")
    db.delete(task)
    db.commit()


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your task")
    if payload.status is not None:
        task.status = payload.status
    if payload.annotations_json is not None:
        task.annotations_json = payload.annotations_json
    db.commit()
    db.refresh(task)
    return task
