from pydantic import BaseModel


class PredictionRead(BaseModel):
    id: int
    image_id: int
    class_name: str
    cx: float
    cy: float
    w: float
    h: float
    angle: float
    confidence: float

    class Config:
        from_attributes = True
