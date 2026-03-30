from pydantic import BaseModel
from app.models.image import ImageStatus


class ImageRead(BaseModel):
    id: int
    batch_id: int
    file_path: str
    storage_url: str | None
    status: ImageStatus

    class Config:
        from_attributes = True
