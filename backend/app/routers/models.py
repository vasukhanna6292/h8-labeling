import os
import shutil
import time
from datetime import datetime

import redis as redis_lib
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.dependencies import require_lead
from app.database import get_db
from app.models.user import User

router = APIRouter()

MODEL_VERSION_KEY = "model_version"


def _redis():
    return redis_lib.from_url(settings.REDIS_URL, decode_responses=True)


@router.get("/current")
def get_current_model(_: User = Depends(require_lead)):
    """Return metadata about the current model file on disk."""
    path = settings.MODEL_PATH
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="No model file found at configured path")
    stat = os.stat(path)
    r = _redis()
    version = r.get(MODEL_VERSION_KEY) or "original"
    return {
        "path": path,
        "size_mb": round(stat.st_size / 1024 / 1024, 1),
        "last_modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "version": version,
    }


@router.post("/upload", status_code=status.HTTP_200_OK)
def upload_model(
    file: UploadFile = File(...),
    _: User = Depends(require_lead),
):
    """
    Upload a new YOLO .pt model file.
    Replaces the current model on disk. Celery workers detect the version
    change via Redis and reload the model automatically on their next inference run.
    """
    if not file.filename.endswith(".pt"):
        raise HTTPException(status_code=400, detail="Only .pt model files are accepted")

    model_path = settings.MODEL_PATH
    weights_dir = os.path.dirname(model_path)
    if weights_dir:
        os.makedirs(weights_dir, exist_ok=True)

    with open(model_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Bump version — workers check this and reload _model on their next task
    version = str(int(time.time()))
    r = _redis()
    r.set(MODEL_VERSION_KEY, version)

    stat = os.stat(model_path)
    return {
        "detail": "Model uploaded. Workers will reload automatically on next inference.",
        "size_mb": round(stat.st_size / 1024 / 1024, 1),
        "version": version,
    }


@router.get("/download")
def download_model(_: User = Depends(require_lead)):
    """Download the current model weights file. Used by Sol script to auto-sync."""
    path = settings.MODEL_PATH
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="No model file found")
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename="best.pt",
    )