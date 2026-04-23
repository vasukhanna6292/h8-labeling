import datetime
import os
from functools import lru_cache

from app.config import settings

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@lru_cache(maxsize=1)
def _get_client():
    from google.cloud import storage
    if settings.GCS_KEY_PATH and os.path.exists(settings.GCS_KEY_PATH):
        return storage.Client.from_service_account_json(settings.GCS_KEY_PATH)
    return storage.Client()


def is_gcs_available() -> bool:
    return bool(
        settings.GCS_BUCKET_NAME
        and settings.GCS_KEY_PATH
        and os.path.exists(settings.GCS_KEY_PATH)
    )


def list_images_in_folder(folder_prefix: str) -> list[str]:
    """Return list of GCS blob names (paths) for images in the given folder prefix."""
    client = _get_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blobs = bucket.list_blobs(prefix=folder_prefix)
    return [
        b.name for b in blobs
        if os.path.splitext(b.name)[1].lower() in SUPPORTED_EXTENSIONS
    ]


def generate_signed_url(blob_name: str, expiration_minutes: int = 60) -> str:
    """Generate a signed URL for a GCS object valid for expiration_minutes."""
    client = _get_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blob = bucket.blob(blob_name)
    return blob.generate_signed_url(
        expiration=datetime.timedelta(minutes=expiration_minutes),
        method="GET",
        version="v4",
    )


def upload_file_to_gcs(local_path: str, blob_name: str) -> str:
    """Upload a local file to GCS and return its gs:// URI."""
    client = _get_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(local_path)
    return f"gs://{settings.GCS_BUCKET_NAME}/{blob_name}"


def upload_bytes_to_gcs(data: bytes, blob_name: str, content_type: str = "application/octet-stream") -> str:
    """Upload bytes to GCS and return its gs:// URI."""
    client = _get_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blob = bucket.blob(blob_name)
    blob.upload_from_string(data, content_type=content_type)
    return f"gs://{settings.GCS_BUCKET_NAME}/{blob_name}"
