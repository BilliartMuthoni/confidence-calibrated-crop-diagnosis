from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, Text

from app.core.timeutil import utcnow
from app.db.session import Base


class SavedTurn(Base):
    """A question the farmer asked about one of their results and the reply they were shown,
    kept only when they agreed (User.keep_questions). Kept as long as the check; deleted with
    the account, or earlier from Account, Privacy. Only the farmer sees them."""

    __tablename__ = "assistant_turns"

    turn_id = Column(Integer, primary_key=True, index=True)
    diagnosis_id = Column(Integer, ForeignKey("diagnoses.diagnosis_id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    # The reply as it was shown (kind, message, advice with sources, choices), so later
    # advice corrections don't change what the farmer reads back.
    reply = Column(JSON, nullable=False)
    asked_at = Column(DateTime, nullable=False, default=utcnow)
