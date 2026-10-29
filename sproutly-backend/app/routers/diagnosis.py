import os
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core import audit
from app.core.assistant import answer
from app.core.classifier import Prediction, model_version, predict
from app.core.counties import COUNTIES
from app.core.deps import get_current_user
from app.core.image_intake import save_clean_image
from app.core.knowledge_base import display_name, get_guidance
from app.core.leaf_check import NOT_A_LEAF, is_leaf
from app.core.limiter import limiter
from app.core.referrals import expire_overdue, open_referral
from app.db.session import get_db
from app.models.diagnosis import CropType, Diagnosis
from app.models.referral import Referral
from app.models.user import User, UserRole
from app.schemas.diagnosis import (
    AssistantQuestion,
    AdviceItem,
    AssistantReply,
    BatchItem,
    BatchResponse,
    CropCorrection,
    DiagnosisDetail,
    DiagnosisListItem,
    DiagnosisResponse,
    Guidance,
    OfficerReply,
)

router = APIRouter(prefix="/diagnose", tags=["diagnosis"])

# Interim wording until the county support-contacts directory exists (Sprint 4).
REFERRAL_MESSAGE = (
    "We can't diagnose this reliably. Please contact agricultural support in your county, "
    "such as your county agriculture office or a local agrovet, before treating the crop."
)
# Several photos at once (#43): enough for a walk through a mixed plot, small enough
# to stay well inside NFR iii (about 0.15 s per photo on the laptop CPU).
MAX_BATCH_PHOTOS = 10


def _apply(record: Diagnosis, prediction: Prediction) -> None:
    """Copy a prediction onto a diagnosis record (new, or re-checked with another crop)."""
    record.crop = prediction.crop
    record.predicted_disease = None if prediction.is_referred else display_name(prediction.class_name)
    record.confidence = prediction.confidence
    record.is_referred = prediction.is_referred
    record.top_class = prediction.class_name
    record.crop_probability = prediction.crop_probability
    record.model_version = model_version()


def _share(db: Session, record: Diagnosis, user: User) -> None:
    """A referred case the farmer agreed to share goes to their county's officers (once)."""
    if record.is_referred and record.share_with_officer:
        if not db.query(Referral).filter(Referral.diagnosis_id == record.diagnosis_id).first():
            open_referral(db, record, user)
            db.commit()


def _response(db: Session, record: Diagnosis, prediction: Prediction) -> DiagnosisResponse:
    common = dict(
        diagnosis_id=record.diagnosis_id,
        crop=record.crop,
        confidence=record.confidence,
        crop_detected=prediction.crop_detected,
        created_at=record.created_at,
    )
    if prediction.is_referred:
        sent = db.query(Referral).filter(Referral.diagnosis_id == record.diagnosis_id).first() is not None
        return DiagnosisResponse(
            **common,
            is_referred=True,
            referral_message=REFERRAL_MESSAGE,
            crop_mismatch=prediction.crop_mismatch,
            sent_to_officer=sent,
        )
    guidance = get_guidance(prediction.class_name, db)
    return DiagnosisResponse(
        **common,
        is_referred=False,
        predicted_disease=record.predicted_disease,
        guidance=Guidance(**guidance) if guidance else None,
    )


def _diagnose(db: Session, user: User, crop: Optional[CropType], image_path: str,
              symptoms_text: Optional[str] = None, share: bool = False, contact: bool = False) -> DiagnosisResponse:
    prediction = predict(crop, image_path)
    record = Diagnosis(user_id=user.user_id, image_path=image_path, symptoms_text=symptoms_text,
                       share_with_officer=share, allow_contact=share and contact)
    _apply(record, prediction)
    db.add(record)
    db.commit()
    db.refresh(record)
    _share(db, record, user)
    return _response(db, record, prediction)


def _require_leaf(image_path: str) -> None:
    """Leaf check (D15) before the disease model: a photo that is not a leaf gets no
    diagnosis and no referral, and is not kept."""
    if not is_leaf(image_path):
        try:
            os.remove(image_path)
        except OSError:
            pass
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=NOT_A_LEAF)


def _remember_county(db: Session, user: User, county: Optional[str]) -> None:
    """The app may send the farmer's county with a photo; it decides who sees their referrals."""
    if county:
        if county not in COUNTIES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not one of Kenya's 47 counties")
        if user.role == UserRole.farmer and user.county != county:
            user.county = county
            db.commit()


@router.post("", response_model=DiagnosisResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
def create_diagnosis(
    request: Request,
    crop: CropType = Form(...),
    symptoms_text: Optional[str] = Form(None),
    image: UploadFile = File(...),
    # If the model is not sure: may a county officer see the photo, and may they phone the farmer?
    share_with_officer: bool = Form(False),
    allow_contact: bool = Form(False),
    county: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _remember_county(db, current_user, county)
    image_path = save_clean_image(image)
    _require_leaf(image_path)
    # Image-only model for now; symptoms_text is stored and used by the fusion model in Sprint 3.
    return _diagnose(db, current_user, crop, image_path, symptoms_text, share_with_officer, allow_contact)


@router.post("/batch", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def create_batch(
    request: Request,
    images: List[UploadFile] = File(...),
    crop: Optional[CropType] = Form(None),
    share_with_officer: bool = Form(False),
    allow_contact: bool = Form(False),
    county: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Several photos at once (#43). With a crop, every photo is that crop; without one
    (mixed or not sure), each photo's crop is detected and can be corrected afterwards.
    Each photo becomes its own diagnosis, so history needs no changes. A photo that
    cannot be read, or is not a leaf, is reported and skipped; the others are still checked."""
    if not 1 <= len(images) <= MAX_BATCH_PHOTOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Send between 1 and {MAX_BATCH_PHOTOS} photos at a time",
        )
    _remember_county(db, current_user, county)

    results = []
    for index, image in enumerate(images):
        try:
            image_path = save_clean_image(image)
            _require_leaf(image_path)
        except HTTPException as exc:
            results.append(BatchItem(index=index, error=exc.detail))
            continue
        results.append(BatchItem(index=index, result=_diagnose(
            db, current_user, crop, image_path, share=share_with_officer, contact=allow_contact)))
    return BatchResponse(results=results)


def _own_diagnosis(db: Session, diagnosis_id: int, user: User) -> Diagnosis:
    record = (
        db.query(Diagnosis)
        .filter(Diagnosis.diagnosis_id == diagnosis_id, Diagnosis.user_id == user.user_id)
        .first()
    )
    if not record:
        # Same answer for "not yours" and "does not exist": never confirm other users' records.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagnosis not found")
    return record


@router.post("/{diagnosis_id}/crop", response_model=DiagnosisResponse)
@limiter.limit("30/minute")
def correct_crop(
    request: Request,
    diagnosis_id: int,
    payload: CropCorrection,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The farmer says the detected crop was wrong: check the same photo again with their crop.
    With the farmer's crop, accuracy on unfamiliar photos rises from 28% to 40% (see classifier)."""
    record = _own_diagnosis(db, diagnosis_id, current_user)
    if not os.path.exists(record.image_path):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="The photo is no longer stored. Please check it again with a new photo.",
        )

    prediction = predict(payload.crop, record.image_path)
    _apply(record, prediction)
    db.commit()
    db.refresh(record)
    # Re-checked with the right crop and now referred: it can still go to an officer.
    _share(db, record, current_user)
    return _response(db, record, prediction)


@router.post("/{diagnosis_id}/ask", response_model=AssistantReply)
# The free provider allows about 30 requests a minute for everyone together.
@limiter.limit("6/minute")
def ask_assistant(
    request: Request,
    diagnosis_id: int,
    payload: AssistantQuestion,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """A question about one of the farmer's results (D9). The model only chooses what to
    show: library advice, a fixed question, a hand-over to the officer, or "not about this"."""
    record = _own_diagnosis(db, diagnosis_id, current_user)
    if record.is_referred or not record.top_class:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This photo has no diagnosis to ask about. Please ask your extension officer.",
        )
    reply = answer(db, record.top_class, payload.question, [t.model_dump() for t in payload.history])
    return AssistantReply(kind=reply.kind, message=reply.message, advice=reply.advice, choices=reply.choices)


@router.get("/history", response_model=List[DiagnosisListItem])
def list_diagnoses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expire_overdue(db)
    rows = (
        db.query(Diagnosis, Referral.status)
        .outerjoin(Referral, Referral.diagnosis_id == Diagnosis.diagnosis_id)
        .filter(Diagnosis.user_id == current_user.user_id)
        .order_by(Diagnosis.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        DiagnosisListItem.model_validate(record).model_copy(
            update={"referral_status": referral_status.value if referral_status else None})
        for record, referral_status in rows
    ]


def _officer_reply(db: Session, referral: Optional[Referral], record: Diagnosis) -> Optional[OfficerReply]:
    """The officer's message and attached advice, as sent; older replies only kept the text."""
    if referral and referral.replied_at:
        officer = db.get(User, referral.replied_by_id) if referral.replied_by_id else None
        advice = [
            AdviceItem(text=a["text"], kind=a["kind"],
                       source=f"{a['source_title']} ({a['licence']})" + (f": {a['source_url']}" if a.get("source_url") else ""))
            for a in referral.reply_advice or []
        ]
        return OfficerReply(text=referral.reply_text or "", officer=audit.label(officer) if officer else "",
                            replied_at=referral.replied_at, advice=advice)
    if record.officer_response:
        return OfficerReply(text=record.officer_response, officer="", replied_at=record.responded_at)
    return None


@router.get("/{diagnosis_id}", response_model=DiagnosisDetail)
def get_diagnosis(
    diagnosis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """One of the farmer's own checks with everything about it: the result and its advice, what
    they described, and what happened to the referral. Someone else's check is 404."""
    expire_overdue(db)
    record = _own_diagnosis(db, diagnosis_id, current_user)
    referral = db.query(Referral).filter(Referral.diagnosis_id == record.diagnosis_id).first()
    common = dict(
        diagnosis_id=record.diagnosis_id,
        crop=record.crop,
        confidence=record.confidence,
        is_referred=record.is_referred,
        created_at=record.created_at,
        symptoms_text=record.symptoms_text,
        referral_status=referral.status.value if referral else None,
        officer_reply=_officer_reply(db, referral, record),
        photo_available=bool(record.image_path) and os.path.exists(record.image_path),
    )
    if record.is_referred:
        return DiagnosisDetail(
            **common,
            referral_message=REFERRAL_MESSAGE,
            crop_mismatch=record.crop_probability is not None and record.crop_probability < 0.5,
            sent_to_officer=referral is not None,
        )
    guidance = get_guidance(record.top_class, db) if record.top_class else None
    return DiagnosisDetail(
        **common,
        predicted_disease=record.predicted_disease,
        guidance=Guidance(**guidance) if guidance else None,
    )


@router.get("/{diagnosis_id}/photo")
def diagnosis_photo(
    diagnosis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The farmer's own photo of a check, until it is deleted (PHOTO_DAYS after the check)."""
    record = _own_diagnosis(db, diagnosis_id, current_user)
    if not record.image_path or not os.path.exists(record.image_path):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="The photo is no longer stored")
    return FileResponse(record.image_path, headers={"Cache-Control": "private, no-store"})
