import enum

from sqlalchemy import JSON, Column, DateTime, Enum as SqlEnum, ForeignKey, Integer, String, Text

from app.core.timeutil import utcnow
from app.db.session import Base


class ReferralStatus(str, enum.Enum):
    new = "new"  # nobody has claimed it
    in_review = "in_review"  # one officer claimed it, so no one else answers it too
    answered = "answered"
    expired = "expired"  # no reply in time; the farmer is shown the county contacts


class Referral(Base):
    """A referred diagnosis the farmer agreed to share with a county officer."""

    __tablename__ = "referrals"

    referral_id = Column(Integer, primary_key=True, index=True)
    diagnosis_id = Column(Integer, ForeignKey("diagnoses.diagnosis_id"), nullable=False, unique=True)
    # The farmer's county when the case was referred; officers see only their own county's cases.
    county = Column(String, nullable=True, index=True)
    status = Column(SqlEnum(ReferralStatus, name="referral_status"), nullable=False, default=ReferralStatus.new, index=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    expires_at = Column(DateTime, nullable=False)

    claimed_by_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    claimed_at = Column(DateTime, nullable=True)

    # The officer's judgement: a class name, or other_disease / cannot_tell / farm_visit.
    # Recorded BEFORE the model's guess is shown to them (POST .../judgement), so it is
    # independent of the model; kept as a candidate label, never used to retrain automatically.
    judgement = Column(String, nullable=True)
    judged_at = Column(DateTime, nullable=True)

    reply_text = Column(Text, nullable=True)
    # Advice library entries attached to the reply, copied as they were when sent
    # (id, version, kind, text, source), so later corrections don't change what the farmer saw.
    reply_advice = Column(JSON, nullable=True)
    replied_by_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    replied_at = Column(DateTime, nullable=True)
