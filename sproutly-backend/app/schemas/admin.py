"""Shapes for the admin and officer portal. Field names match the portal's sample data
(sproutly-admin/src/api/sampleData.js), so the pages work the same on either."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, field_validator

from app.core.counties import check_county
from app.models.advice import AdviceKind, AdviceStatus
from app.models.contact import ContactKind, PhoneType
from app.models.referral import ReferralStatus
from app.models.user import UserRole

# Licences that allow showing an excerpt to farmers with attribution.
LICENCES = ("CC BY 4.0", "CC BY-SA 4.0", "CC BY-SA 3.0", "CC0", "Public domain")


# --- Referrals ---

class Guess(BaseModel):
    disease: str
    confidence: float


class ClaimedBy(BaseModel):
    id: int
    name: str
    at: datetime


class Reply(BaseModel):
    text: str
    judgement: str
    advice_ids: list[int]
    officer_id: int
    officer: str
    replied_at: datetime


class ReferralOut(BaseModel):
    id: int
    created_at: datetime
    expires_at: datetime
    county: Optional[str]
    crop: str
    farmer: str
    consent: bool
    contact_consent: bool
    # Only when the farmer agreed to be phoned (their phone, or email if they have no phone).
    farmer_phone: Optional[str]
    status: ReferralStatus
    claimed_by: Optional[ClaimedBy]
    # Hidden (null) while the case is open, until the officer reviewing it has recorded
    # their own judgement; see POST /admin/referrals/{id}/judgement.
    guess: Optional[Guess]
    # The officer's judgement once recorded (it cannot change after the guess is shown).
    judgement: Optional[str]
    crop_mismatch: bool
    symptoms_text: Optional[str]
    has_photo: bool
    reply: Optional[Reply]


class JudgementIn(BaseModel):
    judgement: str


class ReplyIn(BaseModel):
    text: str
    judgement: str
    advice_ids: list[int] = []

    @field_validator("text")
    @classmethod
    def long_enough(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("Write at least a sentence for the farmer")
        return v


# --- Overview ---

class Agreement(BaseModel):
    agreed: int
    judged: int


class OverviewOut(BaseModel):
    checks_this_week: int
    referred_this_week: int
    answered_within_7_days: Optional[float]
    top_results: list[tuple[str, int]]
    by_county: list[tuple[str, int]]
    referred_confidence: list[tuple[float, int]]
    waiting_referrals: int
    expiring_soon: int
    officer_agreement: Agreement


# --- Users ---

class UserOut(BaseModel):
    id: int
    name: str
    contact: str
    role: UserRole
    county: Optional[str]
    mfa: bool
    active: bool
    created_at: datetime
    last_sign_in: Optional[datetime]


class OfficerIn(BaseModel):
    name: str
    email: EmailStr
    county: str

    @field_validator("name")
    @classmethod
    def name_given(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Give the officer's name")
        return v.strip()

    @field_validator("county")
    @classmethod
    def county_is_real(cls, v: str) -> str:
        return check_county(v)


class CountyIn(BaseModel):
    county: str

    @field_validator("county")
    @classmethod
    def county_is_real(cls, v: str) -> str:
        return check_county(v)


class ActiveIn(BaseModel):
    active: bool


class LinkOut(BaseModel):
    """A one-time link for the staff member to choose a password (shown to the admin to pass on)."""

    link: str
    expires_in_hours: int


class OfficerCreated(LinkOut):
    user: UserOut


# --- Audit ---

class AuditOut(BaseModel):
    id: int
    at: datetime
    who: str
    action: str
    target: str
    detail: str


# --- Contacts ---

class ContactIn(BaseModel):
    county: str
    kind: ContactKind = ContactKind.office
    name: str
    role: str
    organisation: str
    phone: str
    phone_type: PhoneType = PhoneType.office
    # Required for a personal mobile: the admin confirms the person agreed to it being shown to farmers.
    personal_consent: bool = False
    email: Optional[EmailStr] = None
    hours: str

    @field_validator("county")
    @classmethod
    def county_is_real(cls, v: str) -> str:
        return check_county(v)

    @field_validator("name", "role", "organisation", "phone", "hours")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Required")
        return v.strip()


class ContactOut(BaseModel):
    id: int
    county: str
    kind: ContactKind
    name: str
    role: str
    organisation: str
    phone: str
    phone_type: PhoneType
    personal_consent_on: Optional[datetime] = None
    email: Optional[str]
    hours: str
    checked_on: datetime
    active: bool


# --- Advice library ---

class AdviceIn(BaseModel):
    disease: str
    kind: AdviceKind
    text: str
    source_title: str
    source_url: str
    licence: Literal[LICENCES]  # type: ignore[valid-type]
    note: str

    @field_validator("source_url")
    @classmethod
    def is_link(cls, v: str) -> str:
        if not v.startswith(("https://", "http://")):
            raise ValueError("The source link must start with https://")
        return v

    @field_validator("text", "source_title")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Required")
        return v.strip()

    @field_validator("note")
    @classmethod
    def note_given(cls, v: str) -> str:
        if len(v.strip()) < 5:
            raise ValueError("Say briefly why, for the change log")
        return v.strip()


class RetireIn(BaseModel):
    note: str

    @field_validator("note")
    @classmethod
    def note_given(cls, v: str) -> str:
        if len(v.strip()) < 3:
            raise ValueError("Say briefly why it is retired")
        return v.strip()


class HistoryOut(BaseModel):
    version: int
    at: datetime
    by: str
    note: str


class AdviceOut(BaseModel):
    id: int
    disease: str
    kind: AdviceKind
    text: str
    source_title: str
    source_url: str
    licence: str
    version: int
    status: AdviceStatus
    history: list[HistoryOut]


# --- Model settings ---

class ModelPart(BaseModel):
    label: str
    value: str | float
    source: str
    results: str
    commit: str
    date: str
    note: Optional[str] = None


class ModelOut(BaseModel):
    parts: list[ModelPart]
    fitted_on: str
