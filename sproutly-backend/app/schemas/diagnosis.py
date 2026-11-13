from datetime import datetime
from typing import Literal, Optional, List

from pydantic import BaseModel, Field

from app.models.diagnosis import CropType


class Guidance(BaseModel):
    summary: str
    treatment: List[str]
    prevention: List[str]
    # What causes it, how it spreads, the weather it likes (n22): a fold-out on the result.
    about: List[str] = []
    # Where the advice comes from, when it is from the reviewed advice library.
    sources: List[str] = []
    # A fixed warning shown above the advice for a disease that can spread very fast
    # (late blight, n20); None for every other result.
    warning: Optional[str] = None
    # A past check's advice is shown as it was then (t42); True when a line has been
    # corrected or retired since, so the app can say the advice has been updated.
    updated_since: bool = False


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
    # True when the model guessed the crop and would have answered: no answer is shown until the
    # farmer confirms or corrects the crop (POST /diagnose/{id}/crop). Notebook 21 (A5): with a
    # guessed crop, 2.6 of 100 new field photos got a wrong answer, against 0.10 with the crop given.
    awaiting_crop: bool = False
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


class ReplyFeedback(BaseModel):
    """PR C (i08): "Was this helpful?" on an officer's reply."""
    helpful: bool
    reason: Optional[Literal["not_answered", "did_not_work", "other"]] = None
    note: Optional[str] = Field(None, max_length=300)


class DoubtRequest(BaseModel):
    """t31: "This doesn't match what I see" on a diagnosed result. consent must be True."""
    consent: bool
    allow_contact: bool = False
    county: Optional[str] = None
    affected: Optional[str] = None
    note: Optional[str] = Field(None, max_length=300)


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
    # Late blight advice: the fixed "can spread fast" note, shown with the support contacts (n20).
    warning: Optional[str] = None
    # Not-diagnosed checks (t47): which button goes with the reply: retake, send or contacts.
    action: Optional[str] = None
    # The farmer's choice about keeping their questions: None until asked (the app then asks
    # once), True when this question and reply were kept with the check.
    keep_questions: Optional[bool] = None


class SavedTurnItem(BaseModel):
    """A kept question and the reply that was shown."""
    question: str
    reply: AssistantReply
    asked_at: datetime


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


class OfficerReply(BaseModel):
    text: str
    officer: str
    replied_at: Optional[datetime] = None
    # Advice library entries the officer attached, as they were when sent.
    advice: List[AdviceItem] = []
    # The farmer's own rating of this reply (PR C): "helpful", "not_helpful" or None.
    rating: Optional[str] = None


class DiagnosisDetail(DiagnosisResponse):
    """One past check with everything about it (GET /diagnose/{id})."""
    symptoms_text: Optional[str] = None
    # new / in_review / answered / expired when the case went to an officer; None otherwise.
    referral_status: Optional[str] = None
    officer_reply: Optional[OfficerReply] = None
    # False once the photo has been deleted (PHOTO_DAYS after the check).
    photo_available: bool = False
    # Questions the farmer asked about this result, oldest first, if they chose to keep them.
    questions: List[SavedTurnItem] = []
