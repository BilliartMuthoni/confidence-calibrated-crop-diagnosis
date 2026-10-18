from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.audit import AuditEntry
from app.models.user import User


def label(user: User) -> str:
    """How a person appears in the log: their name, else their email or phone."""
    return user.full_name or user.user_email or user.user_phone_number or f"User {user.user_id}"


def record(db: Session, actor: Optional[User], action: str, target: str = "", detail: str = "",
           request: Optional[Request] = None, actor_label: Optional[str] = None) -> None:
    """Add one audit entry. The caller commits, so the entry is saved with the change it describes."""
    db.add(AuditEntry(
        actor_id=actor.user_id if actor else None,
        actor_label=actor_label or (label(actor) if actor else "(unknown)"),
        action=action,
        target=target,
        detail=detail[:500],
        ip=request.client.host if request and request.client else None,
    ))
