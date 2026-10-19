import enum

from sqlalchemy import (
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

    # The farmer's choices when a case is referred: share the photo with a county officer,
    # and (separately) let the officer phone them.
    share_with_officer = Column(Boolean, nullable=False, default=False, server_default=false())
    allow_contact = Column(Boolean, nullable=False, default=False, server_default=false())

    # Filled in once an extension officer responds to a referred case.
    officer_response = Column(Text, nullable=True)
    responded_at = Column(DateTime, nullable=True)

    # Plain UTC without a zone marker: an aware value would be converted to the database
    # server's local time (e.g. Nairobi, +3 h) when stored in this zone-less column.
    created_at = Column(DateTime, default=utcnow)
