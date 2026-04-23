import io
import json
import math
import os
import zipfile

import yaml
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_lead
from app.database import get_db
from app.models.batch import Batch, BatchStatus
from app.models.image import Image, ImageStatus
from app.models.prediction import Prediction
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.schemas.batch import AssignRequest, AssignmentSummary, BatchCreate, BatchRead, BatchUpdate

router = APIRouter()


def _obb_to_corners(cx: float, cy: float, w: float, h: float, angle_deg: float):
    """
    Convert OBB (cx, cy, w, h, angle_degrees) in normalized [0,1] coords
    to 4 corner points: top-left, top-right, bottom-right, bottom-left.
    Returns list of (x, y) tuples, all normalized [0, 1].
    """
    a = math.radians(angle_deg)
    cos_a, sin_a = math.cos(a), math.sin(a)
    hw, hh = w / 2, h / 2
    corners = []
    for px, py in [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]:
        corners.append((cx + px * cos_a - py * sin_a, cy + px * sin_a + py * cos_a))
    return corners


@router.post("/", response_model=BatchRead, status_code=status.HTTP_201_CREATED)
def create_batch(
    payload: BatchCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    batch = Batch(name=payload.name)
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


@router.get("/", response_model=list[BatchRead])
def list_batches(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(Batch).all()


@router.get("/{batch_id}", response_model=BatchRead)
def get_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


@router.patch("/{batch_id}", response_model=BatchRead)
def update_batch(
    batch_id: int,
    payload: BatchUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if payload.name is not None:
        batch.name = payload.name
    if payload.status is not None:
        batch.status = payload.status
    db.commit()
    db.refresh(batch)
    return batch


@router.delete("/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Must delete child records first to avoid foreign key constraint errors
    image_ids = db.query(Image.id).filter(Image.batch_id == batch_id).subquery()
    db.query(Prediction).filter(Prediction.image_id.in_(image_ids)).delete(synchronize_session=False)
    db.query(Task).filter(Task.image_id.in_(image_ids)).delete(synchronize_session=False)

    # Delete image files from disk
    images = db.query(Image).filter(Image.batch_id == batch_id).all()
    for img in images:
        if os.path.exists(img.file_path):
            os.remove(img.file_path)

    db.query(Image).filter(Image.batch_id == batch_id).delete(synchronize_session=False)
    db.delete(batch)
    db.commit()


@router.post("/{batch_id}/assign", response_model=AssignmentSummary)
def assign_tasks(
    batch_id: int,
    payload: AssignRequest = AssignRequest(),
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    """
    Divide all inferenced images in a batch equally among annotators (round-robin).
    Pass annotator_ids to target specific users, or omit to use all annotators.
    Re-running will skip images that already have a task.
    """
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Get annotators
    query = db.query(User).filter(User.role == UserRole.annotator)
    if payload.annotator_ids:
        query = query.filter(User.id.in_(payload.annotator_ids))
    annotators = query.all()

    if not annotators:
        raise HTTPException(status_code=400, detail="No annotators found. Register annotator users first.")

    # Get inferenced images that don't already have a task
    assigned_image_ids = db.query(Task.image_id).filter(
        Task.image_id.in_(
            db.query(Image.id).filter(Image.batch_id == batch_id)
        )
    ).subquery()

    images = (
        db.query(Image)
        .filter(
            Image.batch_id == batch_id,
            Image.status == ImageStatus.inferenced,
            Image.id.notin_(assigned_image_ids),
        )
        .all()
    )

    if not images:
        raise HTTPException(
            status_code=400,
            detail="No inferenced images available to assign. Run inference first.",
        )

    # Round-robin assignment
    distribution: dict[str, int] = {a.email: 0 for a in annotators}
    tasks_created = 0

    for i, image in enumerate(images):
        annotator = annotators[i % len(annotators)]
        task = Task(
            image_id=image.id,
            user_id=annotator.id,
            status=TaskStatus.pending,
        )
        db.add(task)
        distribution[annotator.email] += 1
        tasks_created += 1

    db.commit()

    # Send assignment notification emails (fire-and-forget, never blocks)
    from app.core.email import send_task_assignment_email
    for annotator in annotators:
        count = distribution.get(annotator.email, 0)
        if count > 0:
            try:
                send_task_assignment_email(annotator.name or annotator.email, annotator.email, batch.name, count)
            except Exception:
                pass

    return AssignmentSummary(
        batch_id=batch_id,
        total_images=len(images),
        annotators_count=len(annotators),
        tasks_created=tasks_created,
        distribution=distribution,
    )


@router.get("/{batch_id}/classes")
def batch_classes(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return class names for this batch. Uses YAML-defined classes if set, else from predictions."""
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if batch.classes:
        return batch.classes
    predictions = (
        db.query(Prediction.class_name)
        .join(Image)
        .filter(Image.batch_id == batch_id)
        .distinct()
        .all()
    )
    return sorted(p.class_name for p in predictions)


@router.post("/{batch_id}/upload-yaml")
async def upload_yaml(
    batch_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    """Upload a YOLO data.yaml file to define class names for this batch."""
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    content = await file.read()
    try:
        data = yaml.safe_load(content)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid YAML file")
    names = data.get("names", [])
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names.keys())]
    if not names:
        raise HTTPException(status_code=400, detail="No class names found in YAML. Expected 'names' key.")
    batch.classes = [str(n) for n in names]
    db.commit()
    return {"classes": batch.classes}


@router.put("/{batch_id}/classes")
def update_classes(
    batch_id: int,
    classes: list[str],
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    """Manually set or update class names for a batch."""
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    batch.classes = [c.strip() for c in classes if c.strip()]
    db.commit()
    return {"classes": batch.classes}


@router.get("/{batch_id}/progress")
def batch_progress(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Show annotation progress for a batch."""
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    total_images = db.query(Image).filter(Image.batch_id == batch_id).count()
    total_tasks = db.query(Task).join(Image).filter(Image.batch_id == batch_id).count()
    completed = (
        db.query(Task)
        .join(Image)
        .filter(Image.batch_id == batch_id, Task.status == TaskStatus.completed)
        .count()
    )
    in_progress = (
        db.query(Task)
        .join(Image)
        .filter(Image.batch_id == batch_id, Task.status == TaskStatus.in_progress)
        .count()
    )

    return {
        "batch_id": batch_id,
        "batch_name": batch.name,
        "total_images": total_images,
        "total_tasks": total_tasks,
        "completed": completed,
        "in_progress": in_progress,
        "pending": total_tasks - completed - in_progress,
        "percent_complete": round(completed / total_tasks * 100, 1) if total_tasks else 0,
    }


@router.post("/{batch_id}/set-gcs-folder")
def set_gcs_folder(
    batch_id: int,
    folder: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    """Set GCS folder prefix for a batch and import image records from it."""
    from app.core.gcs import is_gcs_available, list_images_in_folder
    from app.models.image import Image, ImageStatus

    if not is_gcs_available():
        raise HTTPException(status_code=400, detail="GCS is not configured on this server")

    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    folder = folder.strip().rstrip("/") + "/"
    batch.gcs_folder = folder
    db.commit()

    blob_names = list_images_in_folder(folder)
    if not blob_names:
        return {"gcs_folder": folder, "images_found": 0, "images_imported": 0, "message": "No images found in that GCS folder"}

    imported = 0
    for blob_name in blob_names:
        existing = db.query(Image).filter(Image.storage_url == f"gcs://{blob_name}").first()
        if not existing:
            image = Image(
                batch_id=batch_id,
                file_path=blob_name,
                storage_url=f"gcs://{blob_name}",
                status=ImageStatus.uploaded,
            )
            db.add(image)
            imported += 1

    db.commit()
    return {"gcs_folder": folder, "images_found": len(blob_names), "images_imported": imported}


@router.get("/{batch_id}/gcs-image-url/{image_id}")
def get_gcs_image_url(
    batch_id: int,
    image_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get a signed URL for a GCS image valid for 60 minutes."""
    from app.core.gcs import generate_signed_url
    from app.models.image import Image

    image = db.query(Image).filter(Image.id == image_id, Image.batch_id == batch_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    if not image.storage_url or not image.storage_url.startswith("gcs://"):
        raise HTTPException(status_code=400, detail="Image is not stored in GCS")

    blob_name = image.storage_url[len("gcs://"):]
    url = generate_signed_url(blob_name)
    return {"url": url}


@router.post("/{batch_id}/export-to-gcs")
def export_batch_to_gcs(
    batch_id: int,
    export_folder: str = "exports",
    completed_only: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    """Export batch annotations to a GCS folder in YOLO OBB format."""
    from app.core.gcs import is_gcs_available, upload_bytes_to_gcs, upload_file_to_gcs
    from app.config import settings as app_settings

    if not is_gcs_available():
        raise HTTPException(status_code=400, detail="GCS is not configured on this server")

    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    images = db.query(Image).filter(Image.batch_id == batch_id).all()
    if not images:
        raise HTTPException(status_code=400, detail="No images in this batch")

    predictions_all = db.query(Prediction).join(Image).filter(Image.batch_id == batch_id).all()
    class_names = sorted(set(p.class_name for p in predictions_all))
    if not class_names:
        raise HTTPException(status_code=400, detail="No predictions found. Run inference first.")
    class_to_idx = {name: idx for idx, name in enumerate(class_names)}

    completed_tasks = (
        db.query(Task).join(Image)
        .filter(Image.batch_id == batch_id, Task.status == TaskStatus.completed)
        .all()
    )
    task_annotations: dict[int, list] = {}
    for t in completed_tasks:
        if t.annotations_json:
            task_annotations[t.image_id] = json.loads(t.annotations_json)

    preds_by_image: dict[int, list[Prediction]] = {}
    for p in predictions_all:
        preds_by_image.setdefault(p.image_id, []).append(p)

    export_prefix = f"{export_folder}/batch_{batch_id}/"
    exported = 0

    for image in images:
        filename = os.path.basename(image.file_path)
        stem = os.path.splitext(filename)[0]

        if image.id in task_annotations:
            boxes = task_annotations[image.id]
            lines = []
            for b in boxes:
                idx = class_to_idx.get(b.get("class_name", ""), 0)
                corners = _obb_to_corners(b["cx"], b["cy"], b["w"], b["h"], b["angle"])
                pts = " ".join(f"{x:.6f} {y:.6f}" for x, y in corners)
                lines.append(f"{idx} {pts}")
        elif completed_only:
            continue
        elif image.id in preds_by_image:
            lines = []
            for p in preds_by_image[image.id]:
                idx = class_to_idx.get(p.class_name, 0)
                corners = _obb_to_corners(p.cx, p.cy, p.w, p.h, p.angle)
                pts = " ".join(f"{x:.6f} {y:.6f}" for x, y in corners)
                lines.append(f"{idx} {pts}")
        else:
            continue

        label_content = "\n".join(lines).encode()
        upload_bytes_to_gcs(label_content, f"{export_prefix}labels/{stem}.txt", "text/plain")

        if image.file_path and os.path.exists(image.file_path):
            upload_file_to_gcs(image.file_path, f"{export_prefix}images/{filename}")

        exported += 1

    names_str = "[" + ", ".join(class_names) + "]"
    data_yaml = f"path: .\ntrain: images\nval: images\nnc: {len(class_names)}\nnames: {names_str}\n"
    upload_bytes_to_gcs(data_yaml.encode(), f"{export_prefix}data.yaml", "text/plain")

    return {
        "exported": exported,
        "gcs_path": f"gs://{app_settings.GCS_BUCKET_NAME}/{export_prefix}",
    }


@router.post("/{batch_id}/trigger-inference", status_code=status.HTTP_202_ACCEPTED)
def trigger_inference(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    from app.worker.tasks import run_inference_on_batch

    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if batch.status == BatchStatus.processing:
        raise HTTPException(status_code=409, detail="Inference already running for this batch")

    task = run_inference_on_batch.delay(batch_id)
    return {"detail": f"Inference queued for batch {batch_id}", "task_id": task.id}


@router.get("/{batch_id}/annotator-stats")
def annotator_stats(
    batch_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    """Per-annotator progress for a batch."""
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    tasks = (
        db.query(Task, User)
        .join(User, Task.user_id == User.id)
        .join(Image, Task.image_id == Image.id)
        .filter(Image.batch_id == batch_id)
        .all()
    )

    stats: dict[int, dict] = {}
    for task, user in tasks:
        if user.id not in stats:
            stats[user.id] = {
                "user_id": user.id,
                "name": user.name,
                "email": user.email,
                "total": 0,
                "completed": 0,
                "in_progress": 0,
                "pending": 0,
            }
        stats[user.id]["total"] += 1
        stats[user.id][task.status.value] += 1

    return list(stats.values())


@router.get("/{batch_id}/export")
def export_batch(
    batch_id: int,
    completed_only: bool = Query(False, description="If true, only export tasks marked as completed"),
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    """
    Export batch as a YOLO OBB dataset zip.
    completed_only=true  → only images with a completed task (uses reviewed annotations)
    completed_only=false → all inferenced images (completed tasks use reviewed annotations,
                           others fall back to raw model predictions)
    Format per label line: class_idx cx cy w h angle_degrees
    """
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    images = db.query(Image).filter(Image.batch_id == batch_id).all()
    if not images:
        raise HTTPException(status_code=400, detail="No images in this batch")

    # Collect all class names across predictions for this batch
    predictions_all = (
        db.query(Prediction)
        .join(Image)
        .filter(Image.batch_id == batch_id)
        .all()
    )
    class_names = sorted(set(p.class_name for p in predictions_all))
    if not class_names:
        raise HTTPException(status_code=400, detail="No predictions found. Run inference first.")
    class_to_idx = {name: idx for idx, name in enumerate(class_names)}

    # Map image_id → completed task annotations
    completed_tasks = (
        db.query(Task)
        .join(Image)
        .filter(Image.batch_id == batch_id, Task.status == TaskStatus.completed)
        .all()
    )
    task_annotations: dict[int, list] = {}
    for t in completed_tasks:
        if t.annotations_json:
            task_annotations[t.image_id] = json.loads(t.annotations_json)

    # Map image_id → raw predictions
    preds_by_image: dict[int, list[Prediction]] = {}
    for p in predictions_all:
        preds_by_image.setdefault(p.image_id, []).append(p)

    zip_buffer = io.BytesIO()
    exported = 0

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for image in images:
            if not os.path.exists(image.file_path):
                continue

            filename = os.path.basename(image.file_path)
            stem = os.path.splitext(filename)[0]

            if image.id in task_annotations:
                # Completed task — use reviewed annotations
                boxes = task_annotations[image.id]
                lines = []
                for b in boxes:
                    idx = class_to_idx.get(b.get("class_name", ""), 0)
                    corners = _obb_to_corners(b["cx"], b["cy"], b["w"], b["h"], b["angle"])
                    pts = " ".join(f"{x:.6f} {y:.6f}" for x, y in corners)
                    lines.append(f"{idx} {pts}")
            elif completed_only:
                # Skip non-completed images when completed_only is set
                continue
            elif image.id in preds_by_image:
                # Fall back to raw predictions
                lines = []
                for p in preds_by_image[image.id]:
                    idx = class_to_idx.get(p.class_name, 0)
                    corners = _obb_to_corners(p.cx, p.cy, p.w, p.h, p.angle)
                    pts = " ".join(f"{x:.6f} {y:.6f}" for x, y in corners)
                    lines.append(f"{idx} {pts}")
            else:
                continue

            with open(image.file_path, "rb") as f:
                zf.writestr(f"images/{filename}", f.read())
            zf.writestr(f"labels/{stem}.txt", "\n".join(lines))
            exported += 1

        # data.yaml (written without pyyaml dependency)
        names_str = "[" + ", ".join(class_names) + "]"
        data_yaml = (
            f"path: .\n"
            f"train: images\n"
            f"val: images\n"
            f"nc: {len(class_names)}\n"
            f"names: {names_str}\n"
        )
        zf.writestr("data.yaml", data_yaml)

    if exported == 0:
        raise HTTPException(status_code=400, detail="No exportable images found")

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=batch_{batch_id}_yolo_obb.zip"},
    )
