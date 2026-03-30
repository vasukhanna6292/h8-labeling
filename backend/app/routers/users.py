from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_lead
from app.database import get_db
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.schemas.user import UserRead

router = APIRouter()


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_lead),
):
    return db.query(User).all()


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_annotator(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_lead),
):
    """
    Remove an annotator. Deletes their pending/in-progress tasks (images become
    available to reassign). Completed tasks are also removed since user_id is
    non-nullable — lead should export first if they want to keep the work.
    """
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.query(Task).filter(Task.user_id == user_id).delete(synchronize_session=False)
    db.delete(user)
    db.commit()
