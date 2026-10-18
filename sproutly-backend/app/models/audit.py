from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.core.timeutil import utcnow
from app.db.session import Base


class AuditEntry(Base):
    """Who did what, when. Written by the backend only; no endpoint edits or deletes a row."""

    __tablename__ = "audit_log"

    entry_id = Column(Integer, primary_key=True)
    at = Column(DateTime, nullable=False, default=utcnow, index=True)
    # Null for failed sign-ins to unknown accounts.
    actor_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    # Name or email at the time, so the entry still reads right if the account changes.
    actor_label = Column(String, nullable=False)
    # e.g. sign_in, referral_reply, user_reset_mfa (the portal's AUDIT_ACTIONS keys).
    action = Column(String, nullable=False, index=True)
    target = Column(String, nullable=False, default="")
    detail = Column(String, nullable=False, default="")
    ip = Column(String, nullable=True)
