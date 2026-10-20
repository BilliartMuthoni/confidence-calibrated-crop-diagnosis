from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, field_validator, model_validator

from app.core.counties import check_county
from app.models.user import UserRole

# Staff passwords are longer than farmers' (NIST SP 800-63B recommends length over complexity).
STAFF_PASSWORD_MIN = 12


def _six_digits(v: str) -> str:
    # Authenticator apps show the code as "123 456"; accept it either way.
    v = v.replace(" ", "")
    if not v.isdigit() or len(v) != 6:
        raise ValueError("Code must be the 6 digits shown in your authenticator app")
    return v


class _RequiresIdentifier(BaseModel):
    phone_number: Optional[str] = None
    email: Optional[EmailStr] = None

    @model_validator(mode="after")
    def check_identifier_present(self):
        if not self.phone_number and not self.email:
            raise ValueError("Either phone_number or email is required")
        return self


class RegisterRequest(_RequiresIdentifier):
    password: str
    # Decides which officers see the farmer's referrals and which support contacts they get.
    county: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return v

    @field_validator("county")
    @classmethod
    def county_is_real(cls, v: Optional[str]) -> Optional[str]:
        return check_county(v) if v else None


class LoginRequest(_RequiresIdentifier):
    password: str


class MfaCodeRequest(BaseModel):
    mfa_token: str
    code: str

    @field_validator("code")
    @classmethod
    def code_is_six_digits(cls, v: str) -> str:
        return _six_digits(v)


class BackupCodeLoginRequest(BaseModel):
    """Second sign-in step with a backup code instead of the phone."""

    mfa_token: str
    code: str


class MfaSetup(BaseModel):
    # Typed into the authenticator app by hand ("Enter a setup key").
    secret: str
    # otpauth:// link; opening it on the phone adds the account to the authenticator app.
    otpauth_uri: str
    # The same link as a PNG QR code, for setting up from another screen.
    qr_code: str


class MfaChallengeResponse(BaseModel):
    """Password accepted; the app must now send a code to the endpoint in next_step."""

    # "setup": confirm the first code at /auth/mfa/setup/confirm.
    # "verify": send the current code to /auth/mfa/verify.
    next_step: Literal["setup", "verify"]
    mfa_token: str
    expires_in_minutes: int
    setup: Optional[MfaSetup] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: UserRole


class OAuthExchangeRequest(BaseModel):
    # One-time login code the backend sent to the app's link after Google sign-in.
    code: str
    # PKCE verifier the app generated before opening the browser (RFC 7636: 43-128 characters).
    code_verifier: str

    @field_validator("code_verifier")
    @classmethod
    def verifier_length(cls, v: str) -> str:
        if not 43 <= len(v) <= 128:
            raise ValueError("code_verifier must be 43-128 characters")
        return v


class LinkNeeded(BaseModel):
    """Google's email already has a password account: prove it's yours to join Google to it."""

    link_token: str
    email: str
    # The account has the authenticator on, so its code is asked with the password.
    needs_code: bool
    expires_in_minutes: int


class OAuthLoginResponse(BaseModel):
    """Exactly one is set: tokens to log in, an authenticator challenge (code, or setup for a
    password account that never finished it), or a request to join Google to an existing account."""

    tokens: Optional[TokenResponse] = None
    challenge: Optional[MfaChallengeResponse] = None
    link: Optional[LinkNeeded] = None


class OAuthLinkRequest(BaseModel):
    link_token: str
    password: str
    code: Optional[str] = None

    @field_validator("code")
    @classmethod
    def code_is_six_digits(cls, v: Optional[str]) -> Optional[str]:
        return _six_digits(v) if v else None


class AddPasswordRequest(BaseModel):
    """A Google account adding a Sproutly password, so it can also sign in with email."""

    password: str
    # The email typed on the sign-up form: the Google account just used must be that one.
    email: Optional[EmailStr] = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return v


class CurrentUserResponse(BaseModel):
    user_id: int
    user_phone_number: Optional[str] = None
    user_email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    county: Optional[str] = None
    role: UserRole
    is_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CountyUpdate(BaseModel):
    county: str

    @field_validator("county")
    @classmethod
    def county_is_real(cls, v: str) -> str:
        return check_county(v)


# --- My account (staff self-service) ---

class CodeRequest(BaseModel):
    """A current authenticator code, asked for again before a security change (step-up)."""

    code: str

    @field_validator("code")
    @classmethod
    def code_is_six_digits(cls, v: str) -> str:
        return _six_digits(v)


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class StaffPasswordRequest(BaseModel):
    """Choosing a password from a one-time invite or reset link."""

    token: str
    password: str

    @field_validator("password")
    @classmethod
    def long_enough(cls, v: str) -> str:
        if len(v) < STAFF_PASSWORD_MIN:
            raise ValueError(f"Password must be at least {STAFF_PASSWORD_MIN} characters long")
        return v


class ReenrolStart(BaseModel):
    setup_token: str
    secret: str
    otpauth_uri: str
    qr_code: str


class ReenrolConfirmRequest(BaseModel):
    setup_token: str
    code: str

    @field_validator("code")
    @classmethod
    def code_is_six_digits(cls, v: str) -> str:
        return _six_digits(v)


class BackupCodesResponse(BaseModel):
    codes: list[str]


class SignInEvent(BaseModel):
    id: int
    at: datetime
    action: str
    detail: str


class AccountResponse(BaseModel):
    backup_codes_left: int
    recent_sign_ins: list[SignInEvent]
