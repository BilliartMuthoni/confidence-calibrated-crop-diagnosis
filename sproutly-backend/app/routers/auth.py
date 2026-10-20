from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core import audit
from app.core.config import settings
from app.core.limiter import limiter
from app.core.lockout import ensure_not_locked, register_failure, register_success
from app.core.security import (
    create_reenrol_token,
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    create_mfa_token,
    decode_token,
    new_backup_codes,
    new_totp_secret,
    normalise_backup_code,
    encrypt_secret,
    decrypt_secret,
    provisioning_uri,
    qr_code_data_uri,
    verify_totp,
)
from app.core.staff_links import find_link
from app.core.timeutil import utcnow
from app.db.session import get_db
from app.models.audit import AuditEntry
from app.models.staff_auth import BackupCode
from app.models.user import User, UserRole
from app.core.deps import get_current_user
from app.schemas.auth import (
    STAFF_PASSWORD_MIN,
    AccountResponse,
    AddPasswordRequest,
    BackupCodeLoginRequest,
    BackupCodesResponse,
    CodeRequest,
    CountyUpdate,
    PasswordChangeRequest,
    ReenrolConfirmRequest,
    ReenrolStart,
    RegisterRequest,
    LoginRequest,
    MfaCodeRequest,
    MfaChallengeResponse,
    MfaSetup,
    SignInEvent,
    StaffPasswordRequest,
    TokenResponse,
    CurrentUserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])

STAFF = (UserRole.admin, UserRole.officer)


def _get_user_by_identifier(db: Session, phone_number: Optional[str], email: Optional[str]) -> Optional[User]:
    query = db.query(User)
    if phone_number:
        return query.filter(User.user_phone_number == phone_number).first()
    return query.filter(User.user_email == email).first()


def _is_staff(user: User) -> bool:
    return user.role in STAFF


GOOGLE_ACCOUNT = "This email signs in with Google. Use Continue with Google, or Sign up with this email to add a password."
GOOGLE_CONFIRM = "You already have an account with Google. Continue with Google to confirm it's you, and your password will be added."


def _google_only(user: User) -> bool:
    """An account made with Google: it has no password and can only be opened through Google.
    (A staff account whose password an admin reset also has none, but no Google id.)"""
    return user.google_id is not None and not user.hashed_password


def _start_setup(db: Session, user: User) -> MfaChallengeResponse:
    """Give the user a new authenticator secret to add to their app.

    Only reached while MFA is still off, so replacing an unconfirmed secret
    can't lock anyone out.
    """
    secret = new_totp_secret()
    user.totp_secret_encrypted = encrypt_secret(secret)
    user.totp_last_used_step = None
    db.commit()

    uri = provisioning_uri(secret, user.user_phone_number or user.user_email)
    minutes = settings.mfa_setup_token_expire_minutes
    return MfaChallengeResponse(
        next_step="setup",
        mfa_token=create_mfa_token(str(user.user_id), "mfa_setup", minutes),
        expires_in_minutes=minutes,
        setup=MfaSetup(secret=secret, otpauth_uri=uri, qr_code=qr_code_data_uri(uri)),
    )


def _user_from_mfa_token(db: Session, token: str, expected_type: str) -> User:
    payload = decode_token(token)
    if not payload or payload.get("type") != expected_type or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This step has expired. Please log in again.",
        )
    user = db.query(User).filter(User.user_id == int(payload["sub"])).first()
    if not user or not user.is_active or not user.totp_secret_encrypted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This step has expired. Please log in again.",
        )
    return user


def _check_code(db: Session, user: User, code: str, request: Optional[Request] = None) -> None:
    """Accept a current authenticator code once; a wrong one counts towards the lockout."""
    ensure_not_locked(user)
    step = verify_totp(decrypt_secret(user.totp_secret_encrypted), code, user.totp_last_used_step)
    if step is None:
        if _is_staff(user):
            audit.record(db, user, "sign_in_failed", user.user_email or "", "Wrong authenticator code", request)
        register_failure(db, user)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Wrong or expired code")
    user.totp_last_used_step = step
    db.commit()


def issue_tokens(user: User) -> TokenResponse:
    # Staff sessions end after a working day at most; farmers keep the app's usual tokens.
    minutes = settings.staff_session_minutes if _is_staff(user) else None
    return TokenResponse(
        access_token=create_access_token(subject=str(user.user_id), role=user.role.value, minutes=minutes),
        refresh_token=create_refresh_token(subject=str(user.user_id)),
        role=user.role,
    )


def _signed_in(db: Session, user: User, request: Request, how: str = "") -> TokenResponse:
    register_success(user)
    user.last_sign_in = utcnow()
    if _is_staff(user):
        audit.record(db, user, "sign_in", user.user_email or "", how, request)
    db.commit()
    return issue_tokens(user)


@router.post("/register", response_model=MfaChallengeResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = _get_user_by_identifier(db, payload.phone_number, payload.email)
    if existing and _google_only(existing):
        # Typing an email proves nothing (sign-up doesn't confirm emails), so the password is
        # only added after a Google sign-in proves the account is theirs (/auth/password/add).
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GOOGLE_CONFIRM)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this phone number or email already exists",
        )

    # Sign-up only ever makes farmer accounts; staff accounts are made by an admin.
    user = User(
        user_phone_number=payload.phone_number,
        user_email=payload.email,
        hashed_password=hash_password(payload.password),
        county=payload.county,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # The account can't log in until the first authenticator code is confirmed.
    return _start_setup(db, user)


@router.post("/login", response_model=MfaChallengeResponse)
@limiter.limit("5/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    user = _get_user_by_identifier(db, payload.phone_number, payload.email)
    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user or not user.is_active:
        # Same error for "no such user", "deactivated" and "wrong password" -- never reveal which one.
        raise invalid
    if _google_only(user):
        # There is no Sproutly password to check (Google's stays with Google): point the farmer
        # to Google. This says the email is registered, which sign-up already reveals.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GOOGLE_ACCOUNT)
    ensure_not_locked(user)
    if not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        if _is_staff(user):
            audit.record(db, user, "sign_in_failed", user.user_email or "", "Wrong password", request)
        register_failure(db, user)
        raise invalid

    # Accounts from before MFA, new staff, or a reset authenticator: set it up now.
    if not user.mfa_enabled:
        return _start_setup(db, user)

    minutes = settings.mfa_token_expire_minutes
    return MfaChallengeResponse(
        next_step="verify",
        mfa_token=create_mfa_token(str(user.user_id), "mfa_login", minutes),
        expires_in_minutes=minutes,
    )


@router.post("/mfa/setup/confirm", response_model=TokenResponse)
@limiter.limit("5/minute")
def confirm_mfa_setup(request: Request, payload: MfaCodeRequest, db: Session = Depends(get_db)):
    user = _user_from_mfa_token(db, payload.mfa_token, "mfa_setup")
    if user.mfa_enabled:
        # A setup token must not be usable once MFA is on.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This step has expired. Please log in again.",
        )

    # A correct code proves the secret reached the authenticator app.
    _check_code(db, user, payload.code, request)
    user.mfa_enabled = True
    user.is_verified = True
    return _signed_in(db, user, request, "First sign-in: authenticator set up")


@router.post("/mfa/verify", response_model=TokenResponse)
@limiter.limit("5/minute")
def verify_mfa(request: Request, payload: MfaCodeRequest, db: Session = Depends(get_db)):
    user = _user_from_mfa_token(db, payload.mfa_token, "mfa_login")
    if not user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This step has expired. Please log in again.",
        )

    _check_code(db, user, payload.code, request)
    return _signed_in(db, user, request)


@router.post("/mfa/backup", response_model=TokenResponse)
@limiter.limit("5/minute")
def verify_backup_code(request: Request, payload: BackupCodeLoginRequest, db: Session = Depends(get_db)):
    """Second step with a backup code, for a lost or broken phone. Each code works once."""
    user = _user_from_mfa_token(db, payload.mfa_token, "mfa_login")
    ensure_not_locked(user)
    code = normalise_backup_code(payload.code)
    unused = db.query(BackupCode).filter(BackupCode.user_id == user.user_id, BackupCode.used_at.is_(None)).all()
    match = next((c for c in unused if code and verify_password(code, c.code_hash)), None)
    if not match:
        if _is_staff(user):
            audit.record(db, user, "sign_in_failed", user.user_email or "", "Wrong backup code", request)
        register_failure(db, user)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That backup code is wrong or already used")
    match.used_at = utcnow()
    return _signed_in(db, user, request, f"With a backup code ({len(unused) - 1} left)")


@router.get("/me", response_model=CurrentUserResponse)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/me/county", response_model=CurrentUserResponse)
def set_my_county(payload: CountyUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """A farmer chooses their county (it routes their referrals and their support contacts).
    Staff counties are set by an admin, so an officer can't move themselves to another queue."""
    if current_user.role != UserRole.farmer:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ask an administrator to change your county")
    current_user.county = payload.county
    db.commit()
    return current_user


# --- Staff passwords from one-time links ---

@router.post("/staff/password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def set_staff_password(request: Request, payload: StaffPasswordRequest, db: Session = Depends(get_db)):
    """Choose a password from an invite or reset link an admin made. The link works once."""
    link = find_link(db, payload.token)
    user = db.get(User, link.user_id) if link else None
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="This link has expired or was already used. Ask your administrator for a new one.")
    link.used_at = utcnow()
    user.hashed_password = hash_password(payload.password)
    register_success(user)
    audit.record(db, user, "password_set", user.user_email or "", f"From a {link.purpose} link", request)
    db.commit()


# --- My account ---

@router.get("/account", response_model=AccountResponse)
def my_account(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    left = db.query(BackupCode).filter(BackupCode.user_id == current_user.user_id, BackupCode.used_at.is_(None)).count()
    events = (
        db.query(AuditEntry)
        .filter(AuditEntry.actor_id == current_user.user_id, AuditEntry.action.in_(["sign_in", "sign_in_failed"]))
        .order_by(AuditEntry.at.desc())
        .limit(5)
        .all()
    )
    return AccountResponse(
        backup_codes_left=left,
        recent_sign_ins=[SignInEvent(id=e.entry_id, at=e.at, action=e.action, detail=e.detail) for e in events],
    )


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def change_password(request: Request, payload: PasswordChangeRequest, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    ensure_not_locked(current_user)
    if not current_user.hashed_password or not verify_password(payload.current_password, current_user.hashed_password):
        register_failure(db, current_user)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Your current password is not right")
    minimum = STAFF_PASSWORD_MIN if _is_staff(current_user) else 8
    if len(payload.new_password) < minimum:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"The new password must be at least {minimum} characters long")
    current_user.hashed_password = hash_password(payload.new_password)
    audit.record(db, current_user, "password_change", current_user.user_email or "", request=request)
    db.commit()


@router.post("/password/add", response_model=MfaChallengeResponse)
@limiter.limit("5/minute")
def add_password(request: Request, payload: AddPasswordRequest, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    """A farmer who signed up with Google adds a Sproutly password, right after a Google sign-in
    proved the account is theirs. Same account, same history; the authenticator is set up next,
    because every password account has one."""
    if current_user.role != UserRole.farmer or not _google_only(current_user):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This account already has a password")
    if payload.email and payload.email.lower() != (current_user.user_email or "").lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="That Google account is not the one for this email. Choose the right Google account.")
    current_user.hashed_password = hash_password(payload.password)
    db.commit()
    return _start_setup(db, current_user)


@router.post("/mfa/reenrol/start", response_model=ReenrolStart)
@limiter.limit("5/minute")
def start_reenrol(request: Request, payload: CodeRequest, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    """Moving to a new phone: a code from the current app first, then a new key.
    The new secret travels inside the signed setup token, encrypted, so the old one keeps
    working until the new phone is confirmed."""
    if not current_user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Set up your authenticator at sign-in first")
    _check_code(db, current_user, payload.code, request)
    secret = new_totp_secret()
    uri = provisioning_uri(secret, current_user.user_phone_number or current_user.user_email)
    token = create_reenrol_token(str(current_user.user_id), encrypt_secret(secret))
    return ReenrolStart(setup_token=token, secret=secret, otpauth_uri=uri, qr_code=qr_code_data_uri(uri))


@router.post("/mfa/reenrol/confirm", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def confirm_reenrol(request: Request, payload: ReenrolConfirmRequest, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    claims = decode_token(payload.setup_token)
    if not claims or claims.get("type") != "mfa_reenrol" or claims.get("sub") != str(current_user.user_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This step has expired. Please start again.")
    secret = decrypt_secret(claims["pending"])
    step = verify_totp(secret, payload.code, None)
    if step is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Wrong or expired code from the new phone")
    current_user.totp_secret_encrypted = encrypt_secret(secret)
    current_user.totp_last_used_step = step
    audit.record(db, current_user, "mfa_reenrol", current_user.user_email or "", request=request)
    db.commit()


@router.post("/backup-codes", response_model=BackupCodesResponse)
@limiter.limit("5/minute")
def make_backup_codes(request: Request, payload: CodeRequest, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Ten new codes, shown once; all older codes stop working."""
    _check_code(db, current_user, payload.code, request)
    db.query(BackupCode).filter(BackupCode.user_id == current_user.user_id).delete()
    codes = new_backup_codes()
    db.add_all(BackupCode(user_id=current_user.user_id, code_hash=hash_password(c)) for c in codes)
    audit.record(db, current_user, "backup_codes", current_user.user_email or "", request=request)
    db.commit()
    return BackupCodesResponse(codes=codes)
