import enum

from sqlalchemy import (
    JSON,
    Column,
    String,
    Integer,
    Boolean,
    Float,
    DateTime,
    Text,
    ForeignKey,
    Enum as SqlEnum,
    false,
)

from app.core.timeutil import utcnow
from app.db.session import Base


class CropType(str, enum.Enum):
    maize = "maize"
    tomato = "tomato"
    potato = "potato"


class Diagnosis(Base):
    __tablename__ = "diagnoses"

    diagnosis_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)

    crop = Column(SqlEnum(CropType, name="crop_type"), nullable=False)
    image_path = Column(String, nullable=False)
    symptoms_text = Column(Text, nullable=True)

    # Null when the case was referred instead of diagnosed.
    predicted_disease = Column(String, nullable=True)
    confidence = Column(Float, nullable=False)
    is_referred = Column(Boolean, nullable=False, default=False)
    # The model's best class of the crop (class name), kept even when referred, so officers'
    # judgements can be compared with it; and the share of probability on the chosen crop.
    top_class = Column(String, nullable=True)
    crop_probability = Column(Float, nullable=True)
    # Which model made this result: run folders, temperature and threshold
    # (classifier.model_version); empty for results made before it was recorded.
    model_version = Column(String, nullable=True)

    # The farmer's choices when a case is referred: share the photo with a county officer,
    # and (separately) let the officer phone them.
    share_with_officer = Column(Boolean, nullable=False, default=False, server_default=false())
    allow_contact = Column(Boolean, nullable=False, default=False, server_default=false())
    # The farmer's answer to "How much of your crop is affected?" when sharing (n20): few, patch
    # or most; empty if not answered. "most" lists the case first for officers.
    affected = Column(String, nullable=True)
    # The advice library entries this result showed, as [{"id", "version"}] (t42), so opening
    # the check later shows the wording the farmer was given, even after a correction.
    # Empty for referred checks and for checks made before this was recorded.
    advice_shown = Column(JSON, nullable=True)
    # The app's own ID for a photo it queued with no signal (g07): if the same photo is sent
    # again (the reply was lost on a weak connection), the first check is returned, not a second.
    client_id = Column(String(64), nullable=True, unique=True, index=True)
    # A new photo taken with Retake from a not-diagnosed result (n22): the check it replaces.
    # Your checks then hides that older check, unless it went to an officer (a reply stays visible).
    retake_of = Column(Integer, ForeignKey("diagnoses.diagnosis_id", ondelete="SET NULL"), nullable=True, index=True)

    # Filled in once an extension officer responds to a referred case.
    officer_response = Column(Text, nullable=True)
    responded_at = Column(DateTime, nullable=True)

    # Plain UTC without a zone marker: an aware value would be converted to the database
    # server's local time (e.g. Nairobi, +3 h) when stored in this zone-less column.
    created_at = Column(DateTime, default=utcnow)
