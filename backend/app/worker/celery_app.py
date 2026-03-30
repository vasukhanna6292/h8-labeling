from celery import Celery
from celery.schedules import timedelta

from app.config import settings

celery_app = Celery(
    "annotation_agent",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "watch-cloud-storage": {
            "task": "app.worker.tasks.watch_cloud_storage",
            "schedule": timedelta(seconds=settings.WATCHER_INTERVAL_SECONDS),
        },
    },
)
