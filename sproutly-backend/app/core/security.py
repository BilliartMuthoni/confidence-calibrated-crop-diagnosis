import base64
import hashlib
import hmac
import io
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import pyotp
import qrcode
from cryptography.fernet import Fernet
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
_fernet = Fernet(settings.totp_encryption_key)

# Accept the code for the current 30-second step and one step either side, to
# allow for a phone clock that is slightly off. Wider windows make guessing easier.
TOTP_VALID_WINDOW = 1


# --- Passwords ---

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# --- JWT ---

def _create_token(data: dict, expires_delta: timedelta, token_type: str) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire, "type": token_type})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(subject: str, role: str, minutes: Optional[int] = None,
                        auth_time: Optional[int] = None) -> str:
    """``auth_time``: when the person last proved who they are (password and code, or Google),
    in seconds since 1970. Renewing a session keeps it, so actions that need a recent proof
    (deleting a Google-only account) can tell a fresh sign-in from a renewed one."""
    return _create_token(
        {"sub": subject, "role": role, "auth_time": auth_time or int(time.time())},
        timedelta(minutes=minutes or settings.access_token_expire_minutes),
        "access",
    )


def create_refresh_token(subject: str, token_id: str, auth_time: Optional[int] = None) -> str:
    """Long-lived key the app swaps for a fresh pair (/auth/refresh). ``token_id`` is also
    stored on the user, and only the stored one works, so each key works once."""
    return _create_token(
        {"sub": subject, "jti": token_id, "auth_time": auth_time or int(time.time())},
        timedelta(days=settings.refresh_token_expire_days),
        "refresh",
    )


def create_mfa_token(subject: str, token_type: str, minutes: int) -> str:
    """Short-lived token that links the password step to the code step.

    token_type is "mfa_login" or "mfa_setup". get_current_user only accepts
    "access", so neither can be used to call the API.
    """
    return _create_token({"sub": subject}, timedelta(minutes=minutes), token_type)


def create_reenrol_token(subject: str, encrypted_secret: str) -> str:
    """Carries a new, not yet confirmed authenticator secret (Fernet-encrypted) while the user
    moves to a new phone, so the current secret keeps working until the new one is confirmed."""
    return _create_token(
        {"sub": subject, "pending": encrypted_secret},
        timedelta(minutes=settings.mfa_setup_token_expire_minutes),
        "mfa_reenrol",
    )


def create_link_token(subject: str, provider: str, provider_subject: str, minutes: int) -> str:
    """Carries a Google identity that has just signed in but is not yet joined to the account
    with the same email. Signed by the backend, so the app can't swap in another identity."""
    return _create_token(
        {"sub": subject, "provider": provider, "provider_sub": provider_subject},
        timedelta(minutes=minutes),
        "oauth_link",
    )


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None


# --- One-time codes for sign-in with Google ---

def new_url_token() -> str:
    """Random value safe to put in a link (256 bits)."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Stored instead of the one-time code itself, so a database leak can't be used to log in."""
    return hashlib.sha256(token.encode()).hexdigest()


def pkce_challenge(verifier: str) -> str:
    """PKCE (RFC 7636, S256): the challenge sent first is the hash of a verifier revealed only at the end,
    so whoever finishes the sign-in must be whoever started it."""
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


# --- Authenticator app (TOTP) ---

def new_totp_secret() -> str:
    return pyotp.random_base32()


def encrypt_secret(secret: str) -> str:
    return _fernet.encrypt(secret.encode()).decode()


def decrypt_secret(encrypted: str) -> str:
    return _fernet.decrypt(encrypted.encode()).decode()


def provisioning_uri(secret: str, account_name: str) -> str:
    """otpauth:// link that Google Authenticator and Microsoft Authenticator both read. On a
    public (https) deployment it also names the Sproutly logo, which some authenticator apps
    (FreeOTP, 2FAS, Aegis) show beside the codes; Google's and Microsoft's show only icons from
    their own lists, so there it stays a letter."""
    extra = {}
    if settings.admin_portal_url.startswith("https://"):
        extra["image"] = f"{settings.admin_portal_url.rstrip('/')}/sproutly-logo.png"
    return pyotp.TOTP(secret).provisioning_uri(name=account_name, issuer_name=settings.totp_issuer, **extra)


def qr_code_data_uri(uri: str) -> str:
    """PNG QR code of the otpauth link, as a data URI an <Image> can show directly."""
    buffer = io.BytesIO()
    qrcode.make(uri).save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def new_backup_codes(count: int = 10) -> list[str]:
    """Codes like "4821-0937": 8 random digits, easy to write down. Stored only as bcrypt
    hashes, so a database leak does not reveal them; each works once."""
    return [f"{secrets.randbelow(10**4):04d}-{secrets.randbelow(10**4):04d}" for _ in range(count)]


def normalise_backup_code(code: str) -> str:
    digits = "".join(ch for ch in code if ch.isdigit())
    return f"{digits[:4]}-{digits[4:]}" if len(digits) == 8 else ""


def verify_totp(secret: str, code: str, last_used_step: Optional[int]) -> Optional[int]:
    """Return the time step the code belongs to, or None if it is wrong or already used.

    The caller stores the returned step; any code from that step or earlier is then
    rejected, so a code seen over someone's shoulder can't be replayed.
    """
    totp = pyotp.TOTP(secret)
    current_step = int(time.time()) // totp.interval
    for step in range(current_step - TOTP_VALID_WINDOW, current_step + TOTP_VALID_WINDOW + 1):
        if last_used_step is not None and step <= last_used_step:
            continue
        if hmac.compare_digest(totp.generate_otp(step), code):
            return step
    return None
