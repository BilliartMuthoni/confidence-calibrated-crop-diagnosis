import enum

from sqlalchemy import Column, DateTime, Enum as SqlEnum, ForeignKey, Integer, String, Text

from app.core.timeutil import utcnow
from app.db.session import Base


class AdviceKind(str, enum.Enum):
    treatment = "treatment"  # what to do now
    prevention = "prevention"  # stopping it coming back


class AdviceStatus(str, enum.Enum):
    active = "active"
    retired = "retired"  # no longer shown; kept for the record


class AdviceEntry(Base):
    """One excerpt, word for word, from a cited and openly licensed source (D16).
    Shown to farmers after a diagnosis of its class; never written or reworded here."""

    __tablename__ = "advice_entries"

    advice_id = Column(Integer, primary_key=True, index=True)
    # Model class name, e.g. "Tomato___Early_blight". Healthy classes take prevention only.
    disease = Column(String, nullable=False, index=True)
    kind = Column(SqlEnum(AdviceKind, name="advice_kind"), nullable=False)
    text = Column(Text, nullable=False)
    source_title = Column(String, nullable=False)
    source_url = Column(String, nullable=False)
    licence = Column(String, nullable=False)
    version = Column(Integer, nullable=False, default=1)
    status = Column(SqlEnum(AdviceStatus, name="advice_status"), nullable=False, default=AdviceStatus.active)


class AdviceVersion(Base):
    """Change history: every version's wording, who saved it, when and why."""

    __tablename__ = "advice_versions"

    version_id = Column(Integer, primary_key=True)
    advice_id = Column(Integer, ForeignKey("advice_entries.advice_id"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    note = Column(String, nullable=False)
    saved_by_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    saved_at = Column(DateTime, nullable=False, default=utcnow)
