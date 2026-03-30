import secrets

import redis as redis_lib
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth import hash_password
from app.core.dependencies import require_lead
from app.database import get_db
from app.models.user import User, UserRole

router = APIRouter()

INVITE_TTL = 48 * 3600  # 48 hours


def _redis():
    return redis_lib.from_url(settings.REDIS_URL, decode_responses=True)


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_invite(_: User = Depends(require_lead)):
    """Generate a one-time annotator invite token (48-hour TTL). Lead shares the URL manually."""
    r = _redis()
    token = secrets.token_urlsafe(32)
    r.setex(f"invite:{token}", INVITE_TTL, "pending")
    return {"token": token, "expires_in_hours": 48}


@router.get("/{token}/validate")
def validate_invite(token: str):
    """Public — check if an invite token is still valid."""
    r = _redis()
    if not r.get(f"invite:{token}"):
        raise HTTPException(status_code=404, detail="Invite link is invalid or expired")
    return {"valid": True}


@router.post("/{token}/register", status_code=status.HTTP_201_CREATED)
def register_with_invite(
    token: str,
    name: str,
    email: str,
    password: str,
    db: Session = Depends(get_db),
):
    """Public — register as annotator using a valid invite token."""
    r = _redis()
    if not r.get(f"invite:{token}"):
        raise HTTPException(status_code=400, detail="Invite link is invalid or expired")

    if not email.lower().endswith("@asu.edu"):
        raise HTTPException(status_code=400, detail="Only @asu.edu email addresses are allowed")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        name=name,
        email=email,
        hashed_password=hash_password(password),
        role=UserRole.annotator,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # One-time use — delete the token
    r.delete(f"invite:{token}")

    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}