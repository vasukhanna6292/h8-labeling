from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REDIS_URL: str = "redis://redis:6379/0"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_BUCKET_NAME: str = ""
    AWS_REGION: str = ""
    CLOUD_STORAGE_PROVIDER: str = "s3"
    UPLOAD_DIR: str = "./uploads"
    MODEL_PATH: str = "/app/weights/best.pt"
    WATCHER_ENABLED: bool = False
    WATCHER_PREFIX: str = "incoming/"
    WATCHER_INTERVAL_SECONDS: int = 60
    # Email / SMTP (optional — leave blank to disable email notifications)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    APP_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
