from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.core.timeutil import utcnow
from app.db.session import Base


class BackupCode(Base):
    """Single-use codes for signing in without the phone. Only a bcrypt hash is stored."""

    __tablename__ = "backup_codes"

    code_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    code_hash = Column(String, nullable=False)
    used_at = Column(DateTime, nullable=True)


class StaffLink(Base):
    """One-time link for a staff member to choose a password: after an admin creates their
    account ("invite") or resets it ("reset"). Only the SHA-256 of the token is stored."""

    __tablename__ = "staff_links"

    link_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True)
    purpose = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
