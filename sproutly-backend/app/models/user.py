import enum

from sqlalchemy import Column, String, Integer, Boolean, DateTime, Enum as SqlEnum, false
from datetime import datetime, timezone
from app.db.session import Base


class UserRole(str, enum.Enum):
    farmer = "farmer"
    officer = "officer"
    admin = "admin"


class User(Base):
    __tablename__ = "users"
    user_id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, unique=True, index=True, nullable=True)
    user_phone_number = Column(String, unique=True, index=True, nullable=True)
    google_id = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=True)

    role = Column(SqlEnum(UserRole, name="user_role"), nullable=False, default=UserRole.farmer)

    # Authenticator-app MFA. The secret is Fernet-encrypted (see app/core/security.py)
    # and MFA only counts as on once the user has confirmed a first code.
    totp_secret_encrypted = Column(String, nullable=True)
    mfa_enabled = Column(Boolean, nullable=False, default=False, server_default=false())
    # 30-second time step of the last accepted code, so a code can't be used twice.
    totp_last_used_step = Column(Integer, nullable=True)
    is_verified = Column(Boolean, nullable=False, default=False)

    # Staff accounts have a name; officers have the county whose referrals they answer.
    # A farmer's county decides which officers see their referrals and which contacts they get.
    full_name = Column(String, nullable=True)
    county = Column(String, nullable=True, index=True)

    # Lockout (#38): wrong passwords or codes in a row; at the limit sign-in is refused until locked_until.
    failed_attempts = Column(Integer, nullable=False, default=0, server_default="0")
    locked_until = Column(DateTime, nullable=True)
    last_sign_in = Column(DateTime, nullable=True)

    is_active = Column(Boolean, default=True)
    created_at=Column(DateTime, default=lambda: datetime.now(timezone.utc))


