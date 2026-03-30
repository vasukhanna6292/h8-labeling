from pydantic import BaseModel
from app.models.task import TaskStatus


class TaskRead(BaseModel):
    id: int
    image_id: int
    user_id: int
    status: TaskStatus
    annotations_json: str | None
    batch_id: int | None = None
    batch_name: str | None = None
    file_name: str | None = None

    class Config:
        from_attributes = True


class TaskUpdate(BaseModel):
    status: TaskStatus | None = None
    annotations_json: str | None = None
