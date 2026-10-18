"""One-time links for staff to choose a password: sent after an admin creates an officer
account (invite) or resets one (reset). Staff never get password recovery by email or SMS;
only an admin can issue a link, and every link is in the audit log.

There is no email service yet, so the admin portal shows the link to the admin, who passes
it on (for example by WhatsApp to the officer's known number). Sending it by email is a
config change once a mail service is chosen.
"""

from datetime import timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_token, new_url_token
from app.core.timeutil import utcnow
from app.models.staff_auth import StaffLink
from app.models.user import User


def issue_link(db: Session, user: User, purpose: str) -> str:
    """Cancel the user's earlier unused links and return a new one. The caller commits."""
    for old in db.query(StaffLink).filter(StaffLink.user_id == user.user_id, StaffLink.used_at.is_(None)):
        old.used_at = utcnow()
    token = new_url_token()
    db.add(StaffLink(
        user_id=user.user_id,
        token_hash=hash_token(token),
        purpose=purpose,
        expires_at=utcnow() + timedelta(hours=settings.staff_link_expire_hours),
    ))
    return f"{settings.admin_portal_url.rstrip('/')}/set-password?token={token}"


def find_link(db: Session, token: str) -> Optional[StaffLink]:
    link = db.query(StaffLink).filter(StaffLink.token_hash == hash_token(token)).first()
    if not link or link.used_at or link.expires_at < utcnow():
        return None
    return link
