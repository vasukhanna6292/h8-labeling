from sqlalchemy import Column, Integer, String, Enum, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base

import enum


class ImageStatus(str, enum.Enum):
    uploaded = "uploaded"
    inferenced = "inferenced"
    annotated = "annotated"


class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    file_path = Column(String, nullable=False)
    storage_url = Column(String, nullable=True)
    status = Column(Enum(ImageStatus), nullable=False, default=ImageStatus.uploaded)

    batch = relationship("Batch", back_populates="images")
    predictions = relationship("Prediction", back_populates="image")
    task = relationship("Task", back_populates="image", uselist=False)
