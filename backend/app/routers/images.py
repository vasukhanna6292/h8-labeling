import os
import shutil

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.dependencies import get_current_user, require_lead
from app.database import get_db
from app.models.batch import Batch, BatchStatus
from app.models.image import Image
from app.models.prediction import Prediction
from app.models.task import Task
from app.models.user import User
from app.schemas.image import ImageRead

router = APIRouter()


@router.post(
    "/batches/{batch_id}/upload",
    response_model=list[ImageRead],
    status_code=status.HTTP_201_CREATED,
)
def upload_images(
    batch_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    upload_dir = os.path.join(settings.UPLOAD_DIR, str(batch_id))
    os.makedirs(upload_dir, exist_ok=True)

    # Reset batch status to pending so assign button locks until inference runs
    if batch.status == BatchStatus.done:
        batch.status = BatchStatus.pending

    created = []
    for file in files:
        dest = os.path.join(upload_dir, file.filename)
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
        image = Image(batch_id=batch_id, file_path=dest)
        db.add(image)
        db.flush()
        created.append(image)

    db.commit()
    for img in created:
        db.refresh(img)
    return created


@router.get("/batches/{batch_id}", response_model=list[ImageRead])
def list_images(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return db.query(Image).filter(Image.batch_id == batch_id).all()


@router.get("/{image_id}", response_model=ImageRead)
def get_image(
    image_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    return image


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(
    image_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    """Delete an image and its associated predictions/task from a batch."""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Delete related records first
    db.query(Prediction).filter(Prediction.image_id == image_id).delete()
    db.query(Task).filter(Task.image_id == image_id).delete()

    # Delete file from disk
    if os.path.exists(image.file_path):
        os.remove(image.file_path)

    db.delete(image)
    db.commit()


@router.get("/{image_id}/file")
def serve_image_file(
    image_id: int,
    db: Session = Depends(get_db),
):
    """Serve the raw image file for display in the annotation canvas."""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    if not os.path.exists(image.file_path):
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    return FileResponse(image.file_path)
