import logging
import math
import os

from app.config import settings
from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)

# Model is loaded once per worker process and reused across tasks.
# _model_version tracks the Redis version that was active when _model was loaded.
# If the lead uploads a new model, the Redis version changes and we reload.
_model = None
_model_version = None

MODEL_VERSION_KEY = "model_version"


def get_model():
    global _model, _model_version

    # Check Redis for a new model version signal
    try:
        import redis as redis_lib
        r = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
        current_version = r.get(MODEL_VERSION_KEY)
        if current_version != _model_version:
            logger.info(f"Model version changed ({_model_version} → {current_version}), reloading...")
            _model = None
            _model_version = current_version
    except Exception as e:
        logger.warning(f"Could not check model version from Redis: {e}")

    if _model is None:
        import torch
        from ultralytics import YOLO
        from ultralytics.nn.tasks import OBBModel
        # PyTorch 2.6 requires explicitly allowlisting custom classes in .pt files
        torch.serialization.add_safe_globals([OBBModel])
        logger.info(f"Loading YOLO model from {settings.MODEL_PATH}")
        _model = YOLO(settings.MODEL_PATH)
    return _model


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def run_inference_on_batch(self, batch_id: int):
    """Run YOLOv11 OBB inference on all uploaded images in a batch."""
    from app.database import SessionLocal
    from app.models.batch import Batch, BatchStatus
    from app.models.image import Image, ImageStatus
    from app.models.prediction import Prediction

    db = SessionLocal()
    try:
        batch = db.query(Batch).filter(Batch.id == batch_id).first()
        if not batch:
            logger.error(f"Batch {batch_id} not found")
            return

        batch.status = BatchStatus.processing
        db.commit()

        images = (
            db.query(Image)
            .filter(Image.batch_id == batch_id, Image.status == ImageStatus.uploaded)
            .all()
        )

        if not images:
            logger.info(f"No images to process in batch {batch_id}")
            batch.status = BatchStatus.done
            db.commit()
            return

        model = get_model()
        logger.info(f"Running inference on {len(images)} images in batch {batch_id}")

        for image in images:
            try:
                _infer_image(db, model, image, Prediction, ImageStatus)
            except Exception as e:
                logger.error(f"Failed to process image {image.id} ({image.file_path}): {e}")

        batch.status = BatchStatus.done
        db.commit()
        logger.info(f"Batch {batch_id} inference complete")

    except Exception as exc:
        db.rollback()
        logger.error(f"Batch {batch_id} inference task failed: {exc}")
        raise self.retry(exc=exc)
    finally:
        db.close()


def _infer_image(db, model, image, Prediction, ImageStatus):
    from PIL import Image as PILImage

    if not os.path.exists(image.file_path):
        logger.warning(f"Image file not found: {image.file_path}")
        return

    pil_img = PILImage.open(image.file_path)
    img_w, img_h = pil_img.size

    results = model(image.file_path, verbose=False)

    for result in results:
        if result.obb is None:
            continue
        for i in range(len(result.obb)):
            cls_idx = int(result.obb.cls[i].item())
            class_name = result.names[cls_idx]
            conf = float(result.obb.conf[i].item())
            # xywhr: cx, cy, w, h in pixels; angle in radians
            cx_px, cy_px, w_px, h_px, angle_rad = result.obb.xywhr[i].tolist()

            pred = Prediction(
                image_id=image.id,
                class_name=class_name,
                cx=cx_px / img_w,
                cy=cy_px / img_h,
                w=w_px / img_w,
                h=h_px / img_h,
                angle=math.degrees(angle_rad),
                confidence=conf,
            )
            db.add(pred)

    image.status = ImageStatus.inferenced
    db.flush()


@celery_app.task
def watch_cloud_storage():
    """
    Periodic task: poll S3 for new images, auto-create a batch, and trigger inference.
    Enabled only when WATCHER_ENABLED=true in .env.
    """
    if not settings.WATCHER_ENABLED:
        return

    if settings.CLOUD_STORAGE_PROVIDER != "s3":
        logger.warning("Watcher only supports S3 currently")
        return

    if not settings.AWS_BUCKET_NAME:
        logger.warning("WATCHER_ENABLED=true but AWS_BUCKET_NAME is not set")
        return

    import boto3
    import redis as redis_lib

    from app.database import SessionLocal
    from app.models.batch import Batch
    from app.models.image import Image

    r = redis_lib.from_url(settings.REDIS_URL)
    s3 = boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )

    paginator = s3.get_paginator("list_objects_v2")
    new_keys = []

    for page in paginator.paginate(Bucket=settings.AWS_BUCKET_NAME, Prefix=settings.WATCHER_PREFIX):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.lower().endswith((".jpg", ".jpeg", ".png")):
                if not r.sismember("processed_s3_keys", key):
                    new_keys.append(key)

    if not new_keys:
        return

    logger.info(f"Cloud watcher found {len(new_keys)} new image(s)")

    db = SessionLocal()
    try:
        batch = Batch(name=f"Auto-import ({len(new_keys)} images)")
        db.add(batch)
        db.flush()

        upload_dir = os.path.join(settings.UPLOAD_DIR, str(batch.id))
        os.makedirs(upload_dir, exist_ok=True)

        for key in new_keys:
            filename = os.path.basename(key)
            local_path = os.path.join(upload_dir, filename)
            s3.download_file(settings.AWS_BUCKET_NAME, key, local_path)

            image = Image(
                batch_id=batch.id,
                file_path=local_path,
                storage_url=f"s3://{settings.AWS_BUCKET_NAME}/{key}",
            )
            db.add(image)
            r.sadd("processed_s3_keys", key)

        db.commit()
        run_inference_on_batch.delay(batch.id)
        logger.info(f"Auto-batch {batch.id} created and inference queued")
    except Exception as e:
        db.rollback()
        logger.error(f"Cloud watcher failed: {e}")
        raise
    finally:
        db.close()
