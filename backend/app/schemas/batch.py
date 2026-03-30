from pydantic import BaseModel
from datetime import datetime
from app.models.batch import BatchStatus


class BatchCreate(BaseModel):
    name: str


class BatchRead(BaseModel):
    id: int
    name: str
    status: BatchStatus
    created_at: datetime

    class Config:
        from_attributes = True


class BatchUpdate(BaseModel):
    name: str | None = None
    status: BatchStatus | None = None


class AssignRequest(BaseModel):
    annotator_ids: list[int] | None = None  # None = use all annotators


class AssignmentSummary(BaseModel):
    batch_id: int
    total_images: int
    annotators_count: int
    tasks_created: int
    distribution: dict[str, int]  # email -> image count
