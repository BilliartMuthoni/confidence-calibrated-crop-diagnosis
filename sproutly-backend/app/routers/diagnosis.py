import os
import re
from dataclasses import replace
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core import audit
from app.core.assistant import answer, answer_referred
from app.core.blur_check import TOO_BLURRED, is_sharp
from app.core.classifier import Prediction, model_version, predict
from app.core.counties import COUNTIES
from app.core.deps import get_current_user
from app.core.image_intake import save_clean_image
from app.core.knowledge_base import display_name, get_guidance
from app.core.leaf_check import NOT_A_LEAF, is_leaf
from app.core.limiter import limiter
from app.core.referrals import expire_overdue, open_referral
from app.core.retention import inside_uploads
from app.core.timeutil import utcnow
from app.db.session import get_db
from app.models.diagnosis import CropType, Diagnosis
from app.models.referral import Referral
from app.models.saved_turn import SavedTurn
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
    DoubtRequest,
    Guidance,
    ReplyFeedback,
    OfficerReply,
    SavedTurnItem,
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


def _hold_for_crop(prediction: Prediction) -> Prediction:
    """No answer with a crop the model guessed (notebook 21, A5: 2.6 wrong answers per 100 new
    field photos with a guessed crop, 0.10 with the crop given). Until the farmer confirms or
    corrects it, the photo is not diagnosed and not sent to an officer; confirming checks it
    again with the farmer's crop. A photo that would be referred anyway is left as it is."""
    if prediction.crop_detected and not prediction.is_referred:
        return replace(prediction, is_referred=True, awaiting_crop=True)
    return prediction


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
    if prediction.awaiting_crop:
        return DiagnosisResponse(**common, is_referred=True, awaiting_crop=True,
                                 referral_message="Confirm the crop to see the result.")
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
    if guidance and guidance["shown"] and record.advice_shown is None:
        # t42: remember which advice versions this result showed.
        record.advice_shown = guidance["shown"]
        db.commit()
    return DiagnosisResponse(
        **common,
        is_referred=False,
        predicted_disease=record.predicted_disease,
        guidance=Guidance(**guidance) if guidance else None,
    )


def _diagnose(db: Session, user: User, crop: Optional[CropType], image_path: str,
              symptoms_text: Optional[str] = None, share: bool = False, contact: bool = False,
              affected: Optional[str] = None, client_id: Optional[str] = None,
              retake_of: Optional[int] = None) -> DiagnosisResponse:
    prediction = _hold_for_crop(predict(crop, image_path, symptoms_text))
    record = Diagnosis(user_id=user.user_id, image_path=image_path, symptoms_text=symptoms_text,
                       share_with_officer=share, allow_contact=share and contact,
                       affected=affected if share else None, client_id=client_id, retake_of=retake_of)
    _apply(record, prediction)
    db.add(record)
    db.commit()
    db.refresh(record)
    if not prediction.awaiting_crop:
        _share(db, record, user)
    return _response(db, record, prediction)


def _refuse(image_path: str, detail: str) -> None:
    """A photo that fails a check gets no diagnosis and no referral, and is not kept."""
    try:
        os.remove(image_path)
    except OSError:
        pass
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


def _require_checks(image_path: str, allow_blurry: bool = False) -> None:
    """The blur check (notebook 21b), then the leaf check (D15), before the disease model.
    Blur goes first: a blurred leaf can fail the leaf check, and "retake it" is the useful answer."""
    if not allow_blurry and not is_sharp(image_path):
        _refuse(image_path, TOO_BLURRED)
    if not is_leaf(image_path):
        _refuse(image_path, NOT_A_LEAF)


# A photo the app queued with no signal (g07) carries the app's own ID (a UUID).
CLIENT_ID = re.compile(r"[A-Za-z0-9-]{8,64}")


def _already_sent(db: Session, user: User, client_id: Optional[str]) -> Optional[Diagnosis]:
    """The check this queued photo already made, if the app is sending it again; None if new."""
    if not client_id:
        return None
    if not CLIENT_ID.fullmatch(client_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a valid photo ID")
    existing = db.query(Diagnosis).filter(Diagnosis.client_id == client_id).first()
    if existing and existing.user_id != user.user_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Not a valid photo ID")
    return existing


# "How much of your crop is affected?" when sharing a case (n20); "most" lists it first for officers.
AFFECTED = ("few", "patch", "most")


def _check_affected(affected: Optional[str]) -> Optional[str]:
    if affected and affected not in AFFECTED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a few plants, a patch or most of the field")
    return affected or None


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
    affected: Optional[str] = Form(None),
    # Sent by the app only after two retakes failed the blur check; the threshold still applies.
    allow_blurry: bool = Form(False),
    # The app's ID for a photo it queued with no signal (g07): sent twice, it is checked once.
    client_id: Optional[str] = Form(None),
    # Retake from a not-diagnosed result (n22): the check this new photo replaces.
    retake_of: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = _already_sent(db, current_user, client_id)
    if existing:
        return get_diagnosis(existing.diagnosis_id, db, current_user)
    if retake_of is not None:
        replaced = _own_diagnosis(db, retake_of, current_user)  # 404 for someone else's check
        if not replaced.is_referred:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Only a check that was not diagnosed can be retaken")
    _remember_county(db, current_user, county)
    affected = _check_affected(affected)
    image_path = save_clean_image(image)
    _require_checks(image_path, allow_blurry)
    # symptoms_text is stored, shown to officers, and on a referred photo reorders the crop's
    # diseases (notebook 20b); it never decides whether the farmer gets an answer.
    return _diagnose(db, current_user, crop, image_path, symptoms_text, share_with_officer, allow_contact, affected,
                     client_id, retake_of)


@router.post("/batch", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def create_batch(
    request: Request,
    images: List[UploadFile] = File(...),
    crop: Optional[CropType] = Form(None),
    share_with_officer: bool = Form(False),
    allow_contact: bool = Form(False),
    county: Optional[str] = Form(None),
    affected: Optional[str] = Form(None),
    # One app ID per photo, in the same order, for photos queued with no signal (g07).
    client_ids: Optional[List[str]] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Several photos at once (#43). With a crop, every photo is that crop; without one
    (mixed or not sure), each photo's crop is detected and can be corrected afterwards.
    Each photo becomes its own diagnosis, so history needs no changes. A photo that
    cannot be read, is too blurred or is not a leaf is reported and skipped; the others are
    still checked."""
    if not 1 <= len(images) <= MAX_BATCH_PHOTOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Send between 1 and {MAX_BATCH_PHOTOS} photos at a time",
        )
    _remember_county(db, current_user, county)
    affected = _check_affected(affected)

    results = []
    for index, image in enumerate(images):
        client_id = client_ids[index] if client_ids and index < len(client_ids) else None
        existing = _already_sent(db, current_user, client_id)
        if existing:
            results.append(BatchItem(index=index, result=get_diagnosis(existing.diagnosis_id, db, current_user)))
            continue
        try:
            image_path = save_clean_image(image)
            _require_checks(image_path)
        except HTTPException as exc:
            results.append(BatchItem(index=index, error=exc.detail))
            continue
        results.append(BatchItem(index=index, result=_diagnose(
            db, current_user, crop, image_path, share=share_with_officer, contact=allow_contact, affected=affected,
            client_id=client_id)))
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

    prediction = predict(payload.crop, record.image_path, record.symptoms_text)
    _apply(record, prediction)
    db.commit()
    db.refresh(record)
    # Re-checked with the right crop and now referred: it can still go to an officer.
    _share(db, record, current_user)
    return _response(db, record, prediction)


OFFICER_HAS_IT = "An officer is already looking at this photo, so it can't be removed."


@router.post("/{diagnosis_id}/other-crop", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def other_crop(
    request: Request,
    diagnosis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """"None of these crops" (n02): the photo shows a crop Sproutly can't check, so there is
    nothing to diagnose. The check and its photo are removed, as if it had not been sent. A case
    an officer has already picked up stays (removing it would take it from under them)."""
    record = _own_diagnosis(db, diagnosis_id, current_user)
    referral = db.query(Referral).filter(Referral.diagnosis_id == record.diagnosis_id).first()
    if referral and referral.status.value != "new":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=OFFICER_HAS_IT)
    if record.image_path and inside_uploads(record.image_path):
        try:
            os.remove(record.image_path)
        except OSError:
            pass
    db.query(SavedTurn).filter(SavedTurn.diagnosis_id == record.diagnosis_id).delete(synchronize_session=False)
    if referral:
        db.delete(referral)
    db.query(Diagnosis).filter(Diagnosis.retake_of == record.diagnosis_id).update(
        {Diagnosis.retake_of: None}, synchronize_session=False)
    db.delete(record)
    db.commit()


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
    show: library advice, a fixed question, a hand-over to the officer, or "not about this".
    The question and reply are kept with the check only if the farmer agreed (keep_questions)."""
    record = _own_diagnosis(db, diagnosis_id, current_user)
    history = [t.model_dump() for t in payload.history]
    if record.is_referred:
        # t47: no diagnosis, so only fixed replies; the stored low-confidence guess is never passed on.
        sent = db.query(Referral).filter(Referral.diagnosis_id == record.diagnosis_id).first() is not None
        reply = answer_referred(record.crop.value, payload.question, history, sent)
    elif record.top_class:
        reply = answer(db, record.top_class, payload.question, history)
    else:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="This photo has no result to ask about. Please ask your extension officer.")
    shown = AssistantReply(kind=reply.kind, message=reply.message, advice=reply.advice, choices=reply.choices,
                           warning=reply.warning, action=reply.action)
    # "Not available right now" is not worth reading again, so only real answers are kept.
    if current_user.keep_questions and shown.kind != "unavailable":
        db.add(SavedTurn(diagnosis_id=record.diagnosis_id, user_id=current_user.user_id,
                         question=payload.question, reply=shown.model_dump(exclude={"keep_questions"})))
        db.commit()
    return shown.model_copy(update={"keep_questions": current_user.keep_questions})


@router.get("/history", response_model=List[DiagnosisListItem])
def list_diagnoses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expire_overdue(db)
    # A not-diagnosed check the farmer retook (n22) is replaced by the new one, so it is left out;
    # one that went to an officer stays, so the officer's reply is never hidden.
    retaken = (
        db.query(Diagnosis.retake_of)
        .filter(Diagnosis.user_id == current_user.user_id, Diagnosis.retake_of.isnot(None))
    )
    rows = (
        db.query(Diagnosis, Referral.status)
        .outerjoin(Referral, Referral.diagnosis_id == Diagnosis.diagnosis_id)
        .filter(Diagnosis.user_id == current_user.user_id)
        .filter(~(Diagnosis.diagnosis_id.in_(retaken) & Referral.diagnosis_id.is_(None)))
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
                            replied_at=referral.replied_at, advice=advice, rating=referral.farmer_rating)
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
        questions=[
            SavedTurnItem(question=t.question, reply=AssistantReply(**t.reply), asked_at=t.asked_at)
            for t in db.query(SavedTurn)
            .filter(SavedTurn.diagnosis_id == record.diagnosis_id, SavedTurn.user_id == current_user.user_id)
            .order_by(SavedTurn.asked_at, SavedTurn.turn_id)
        ],
    )
    if record.is_referred:
        return DiagnosisDetail(
            **common,
            referral_message=REFERRAL_MESSAGE,
            crop_mismatch=record.crop_probability is not None and record.crop_probability < 0.5,
            sent_to_officer=referral is not None,
        )
    # As shown at the time (t42), or today's advice for checks made before that was recorded.
    guidance = get_guidance(record.top_class, db, shown=record.advice_shown) if record.top_class else None
    return DiagnosisDetail(
        **common,
        sent_to_officer=referral is not None,
        predicted_disease=record.predicted_disease,
        guidance=Guidance(**guidance) if guidance else None,
    )


@router.post("/{diagnosis_id}/doubt", response_model=DiagnosisDetail)
@limiter.limit("10/minute")
def doubt_diagnosis(
    request: Request,
    diagnosis_id: int,
    payload: DoubtRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """t31 (supervisor, 24 Oct): "This doesn't match what I see" on a diagnosed result. With the
    farmer's consent the photo goes to their county's officers like a referred case, who judge
    it before they see the model's answer and reply. The farmer's doubt is not a label: only an
    officer's judgement is recorded, and nothing retrains the model automatically."""
    record = _own_diagnosis(db, diagnosis_id, current_user)
    if not record.is_referred and not record.top_class:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This check has no result to send")
    if not payload.consent:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Tick the box to send your photo to an extension officer")
    if db.query(Referral).filter(Referral.diagnosis_id == record.diagnosis_id).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This check has already been sent to an officer")
    if not record.image_path or not os.path.exists(record.image_path):
        raise HTTPException(status_code=status.HTTP_410_GONE,
                            detail="The photo is no longer kept, so an officer cannot see it. Please use the support contacts.")
    affected = _check_affected(payload.affected)
    _remember_county(db, current_user, payload.county)
    if not current_user.county:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose your county so the right officers see it")
    record.share_with_officer = True
    record.allow_contact = payload.allow_contact
    record.affected = affected
    note = (payload.note or "").strip() or None
    # Not diagnosed (t47: sent later): an ordinary "model was not sure" case.
    open_referral(db, record, current_user, reason=None if record.is_referred else "doesnt_match", note=note)
    db.commit()
    return get_diagnosis(diagnosis_id, db, current_user)


@router.post("/{diagnosis_id}/reply-feedback", response_model=DiagnosisDetail)
@limiter.limit("20/minute")
def reply_feedback(
    request: Request,
    diagnosis_id: int,
    payload: ReplyFeedback,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """PR C (i08): "Was this helpful?" on an officer's reply to one of the farmer's own checks.
    The farmer can change their answer; admins see it on the Officer replies page."""
    record = _own_diagnosis(db, diagnosis_id, current_user)
    referral = db.query(Referral).filter(Referral.diagnosis_id == record.diagnosis_id).first()
    if not referral or not referral.replied_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="There is no officer's reply to rate yet")
    referral.farmer_rating = "helpful" if payload.helpful else "not_helpful"
    referral.feedback_reason = None if payload.helpful else payload.reason
    referral.feedback_note = None if payload.helpful else ((payload.note or "").strip() or None)
    referral.rated_at = utcnow()
    db.commit()
    return get_diagnosis(diagnosis_id, db, current_user)


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
