"""Account lockout (#38): after settings.lockout_attempts wrong passwords or codes in a row,
sign-in is refused for settings.lockout_minutes, even with the right password. This stops
guessing a password or a 6-digit code online; the rate limiter alone allows 5 tries a minute
per address, which a botnet gets around. The cost: anyone who knows an email can lock that
account for a while, so the lock is short and an admin can still help.
"""

import math
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutil import utcnow
from app.models.user import User


def ensure_not_locked(user: User) -> None:
    if user.locked_until and user.locked_until > utcnow():
        minutes = math.ceil((user.locked_until - utcnow()).total_seconds() / 60)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many wrong attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        )


def register_failure(db: Session, user: User) -> None:
    user.failed_attempts = (user.failed_attempts or 0) + 1
    if user.failed_attempts >= settings.lockout_attempts:
        user.locked_until = utcnow() + timedelta(minutes=settings.lockout_minutes)
        user.failed_attempts = 0
    db.commit()


def register_success(user: User) -> None:
    """The caller commits."""
    user.failed_attempts = 0
    user.locked_until = None
