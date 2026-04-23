from sqlalchemy import Column, Integer, String, Enum, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base

import enum


class BatchStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    done = "done"


class Batch(Base):
    __tablename__ = "batches"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    status = Column(Enum(BatchStatus), nullable=False, default=BatchStatus.pending)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    classes = Column(JSON, nullable=True)  # list of class name strings from YAML
    gcs_folder = Column(String, nullable=True)  # GCS folder prefix e.g. "images/batch1/"

    images = relationship("Image", back_populates="batch")
