from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, batches, images, invites, models, tasks, users

app = FastAPI(
    title="Annotation Agent API",
    description="OBB annotation platform for part-based XAI image labeling",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(batches.router, prefix="/batches", tags=["batches"])
app.include_router(images.router, prefix="/images", tags=["images"])
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(invites.router, prefix="/invites", tags=["invites"])
app.include_router(models.router, prefix="/models", tags=["models"])


@app.get("/health")
def health_check():
    return {"status": "ok"}
