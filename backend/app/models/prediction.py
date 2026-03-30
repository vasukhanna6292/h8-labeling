from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("images.id"), nullable=False)
    class_name = Column(String, nullable=False)
    cx = Column(Float, nullable=False)
    cy = Column(Float, nullable=False)
    w = Column(Float, nullable=False)
    h = Column(Float, nullable=False)
    angle = Column(Float, nullable=False)
    confidence = Column(Float, nullable=False)

    image = relationship("Image", back_populates="predictions")
