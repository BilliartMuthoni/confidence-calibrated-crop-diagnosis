from datetime import datetime
from typing import Literal, Optional, List

from pydantic import BaseModel, Field

from app.models.diagnosis import CropType


class Guidance(BaseModel):
    summary: str
    treatment: List[str]
    prevention: List[str]
    # Where the advice comes from, when it is from the reviewed advice library.
    sources: List[str] = []


class DiagnosisResponse(BaseModel):
    diagnosis_id: int
    crop: CropType
    confidence: float
    is_referred: bool
    # Present only when the system was confident enough to answer.
    predicted_disease: Optional[str] = None
    guidance: Optional[Guidance] = None
    # Present only when the case was deferred.
    referral_message: Optional[str] = None
    # True when most of the probability belonged to a crop other than the one chosen,
    # so the app can suggest checking the crop. The other crop is never named.
    # With a detected crop it means the crop itself was unclear.
    crop_mismatch: bool = False
    # True when the model chose the crop (several photos, crop left out); the app shows
    # it so the farmer can correct it with POST /diagnose/{id}/crop.
    crop_detected: bool = False
    # True when the case went to a county officer (referred, and the farmer agreed to share it).
    sent_to_officer: bool = False
    created_at: datetime


class BatchItem(BaseModel):
    # Position of the photo in the upload, so the app can match results to thumbnails.
    index: int
    # Set when this photo was checked; None when it could not be (see error).
    result: Optional[DiagnosisResponse] = None
    # Why this photo was not checked (e.g. not an image, too large). Other photos still are.
    error: Optional[str] = None


class BatchResponse(BaseModel):
    results: List[BatchItem]


class CropCorrection(BaseModel):
    crop: CropType


class AssistantTurn(BaseModel):
    role: Literal["farmer", "assistant"]
    text: str = Field(max_length=500)


class AssistantQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=300)
    # Earlier turns of this conversation, oldest first (only the last few are used).
    history: List[AssistantTurn] = Field(default=[], max_length=12)


class AdviceItem(BaseModel):
    text: str
    kind: str
    source: str


class AssistantReply(BaseModel):
    # advice, question, officer, out_of_scope, or unavailable (the app then shows the advice
    # already on the result and the way to an officer).
    kind: str
    message: str
    advice: List[AdviceItem] = []
    # Replies the app offers as buttons when the assistant asks a question.
    choices: List[str] = []


class DiagnosisListItem(BaseModel):
    diagnosis_id: int
    crop: CropType
    predicted_disease: Optional[str] = None
    confidence: float
    is_referred: bool
    created_at: datetime
    # A county officer's reply to a referred case, shown as "Advice from a county officer".
    officer_response: Optional[str] = None
    responded_at: Optional[datetime] = None
    # For cases sent to an officer: new / in_review / answered / expired; None otherwise.
    referral_status: Optional[str] = None

    model_config = {"from_attributes": True}
