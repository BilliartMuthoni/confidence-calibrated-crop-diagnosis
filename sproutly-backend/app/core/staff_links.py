"""One-time links for staff to choose a password: sent after an admin creates an officer
account (invite) or resets one (reset). Staff never get password recovery by email or SMS;
only an admin can issue a link, and every link is in the audit log.

Two channels (found in testing): the link is emailed to the officer's work address, and a
6-digit code is shown once to the admin, who gives it to the officer by phone or in person.
The link works only with the code, so someone who reads the officer's email cannot set up the
account first; five wrong codes cancel the link. When email cannot be sent (no mail settings,
or the server refuses), the portal shows the link to the admin to pass on instead, as before.
"""

import secrets
from datetime import timedelta
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_email_code, hash_token, new_url_token
from app.core.timeutil import utcnow
from app.models.staff_auth import StaffLink
from app.models.user import User

MAX_WRONG_CODES = 5


def issue_link(db: Session, user: User, purpose: str) -> Tuple[str, str]:
    """Cancel the user's earlier unused links and return a new link and its code. The caller commits."""
    for old in db.query(StaffLink).filter(StaffLink.user_id == user.user_id, StaffLink.used_at.is_(None)):
        old.used_at = utcnow()
    token = new_url_token()
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(StaffLink(
        user_id=user.user_id,
        token_hash=hash_token(token),
        purpose=purpose,
        expires_at=utcnow() + timedelta(hours=settings.staff_link_expire_hours),
        code_hash=hash_email_code(user.user_id, code),
        wrong_tries=0,
    ))
    return f"{settings.admin_portal_url.rstrip('/')}/set-password?token={token}", code


def find_link(db: Session, token: str) -> Optional[StaffLink]:
    link = db.query(StaffLink).filter(StaffLink.token_hash == hash_token(token)).first()
    if not link or link.used_at or link.expires_at < utcnow():
        return None
    return link


def code_matches(link: StaffLink, code: Optional[str]) -> bool:
    """True for the right code. Links made before codes were added have none and need none."""
    if link.code_hash is None:
        return True
    return secrets.compare_digest(link.code_hash, hash_email_code(link.user_id, (code or "").strip()))
