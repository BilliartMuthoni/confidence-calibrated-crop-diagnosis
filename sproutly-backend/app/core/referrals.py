"""Referral queue rules shared by the diagnosis and admin routers."""

from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutil import utcnow
from app.models.diagnosis import Diagnosis
from app.models.referral import Referral, ReferralStatus
from app.models.user import User

# An officer's judgement is one of the model's classes or one of these, never free text,
# so it can be compared with the model and kept as a candidate label.
OTHER_JUDGEMENTS = ("other_disease", "cannot_tell", "farm_visit")


def open_referral(db: Session, diagnosis: Diagnosis, farmer: User) -> Referral:
    """Queue a referred case for the farmer's county. The caller commits."""
    now = utcnow()
    referral = Referral(
        diagnosis_id=diagnosis.diagnosis_id,
        county=farmer.county,
        status=ReferralStatus.new,
        created_at=now,
        expires_at=now + timedelta(days=settings.referral_days),
    )
    db.add(referral)
    return referral


def expire_overdue(db: Session) -> None:
    """Close cases nobody answered in time; the app then shows the farmer the county contacts.
    Run before reading the queue, so no scheduler is needed."""
    overdue = (
        db.query(Referral)
        .filter(Referral.status.in_([ReferralStatus.new, ReferralStatus.in_review]), Referral.expires_at < utcnow())
        .all()
    )
    for referral in overdue:
        referral.status = ReferralStatus.expired
    if overdue:
        db.commit()
