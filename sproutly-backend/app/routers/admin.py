"""Admin and officer portal: overview, referral queue, staff accounts, audit log, model.

Every route checks the caller's role on the server. Officers reach only referrals from their
own county (anything else answers 404, so the queue never confirms other counties' cases);
everything else here is for admins.
"""

import os
from collections import Counter
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core import audit
from app.core.config import settings
from app.core.deps import require_role
from app.core.knowledge_base import KNOWLEDGE_BASE, display_name
from app.core.referrals import OTHER_JUDGEMENTS, expire_overdue
from app.core.staff_links import issue_link
from app.core.timeutil import utcnow
from app.db.session import get_db
from app.models.advice import AdviceEntry, AdviceStatus
from app.models.audit import AuditEntry
from app.models.diagnosis import Diagnosis
from app.models.referral import Referral, ReferralStatus
from app.models.staff_auth import BackupCode
from app.models.user import User, UserRole
from app.schemas.admin import (
    UserOut,
    ActiveIn,
    Agreement,
    AuditOut,
    ClaimedBy,
    CountyIn,
    Guess,
    JudgementIn,
    LinkOut,
    ModelOut,
    ModelPart,
    OfficerCreated,
    OfficerIn,
    OverviewOut,
    ReferralOut,
    Reply,
    ReplyIn,
)

router = APIRouter(prefix="/admin", tags=["admin"])

staff_only = require_role(UserRole.admin, UserRole.officer)
admin_only = require_role(UserRole.admin)

OPEN = (ReferralStatus.new, ReferralStatus.in_review)


def _name(user: Optional[User]) -> str:
    return audit.label(user) if user else "(deleted account)"


def farmer_label(user_id: int) -> str:
    """Officers see a reference number, not the farmer's name or number (unless they agreed to a call)."""
    return f"Farmer {user_id:04d}"


# --------------------------------------------------------------------------- referrals

def _referral_out(db: Session, referral: Referral, viewer: User) -> ReferralOut:
    diagnosis = db.get(Diagnosis, referral.diagnosis_id)
    farmer = db.get(User, diagnosis.user_id)
    claimer = db.get(User, referral.claimed_by_id) if referral.claimed_by_id else None
    replier = db.get(User, referral.replied_by_id) if referral.replied_by_id else None

    # Blind judgement: while a case is open, the model's guess is shown only to the officer
    # reviewing it, and only after their own judgement is recorded.
    judged_by_viewer = referral.judgement is not None and referral.claimed_by_id == viewer.user_id
    show_guess = referral.status not in OPEN or judged_by_viewer

    return ReferralOut(
        id=referral.referral_id,
        created_at=referral.created_at,
        expires_at=referral.expires_at,
        county=referral.county,
        crop=diagnosis.crop.value,
        farmer=farmer_label(diagnosis.user_id),
        consent=diagnosis.share_with_officer,
        contact_consent=diagnosis.allow_contact,
        farmer_phone=(farmer.user_phone_number or farmer.user_email) if diagnosis.allow_contact and farmer else None,
        status=referral.status,
        claimed_by=ClaimedBy(id=claimer.user_id, name=_name(claimer), at=referral.claimed_at) if claimer else None,
        guess=Guess(disease=diagnosis.top_class, confidence=diagnosis.confidence)
        if show_guess and diagnosis.top_class else None,
        judgement=referral.judgement if (judged_by_viewer or referral.status not in OPEN) else None,
        crop_mismatch=(diagnosis.crop_probability or 1.0) < 0.5,
        symptoms_text=diagnosis.symptoms_text,
        has_photo=os.path.exists(diagnosis.image_path),
        reply=Reply(
            text=referral.reply_text,
            judgement=referral.judgement,
            advice_ids=[a["id"] for a in referral.reply_advice or []],
            officer_id=referral.replied_by_id,
            officer=_name(replier),
            replied_at=referral.replied_at,
        ) if referral.replied_at else None,
    )


def _visible(query, user: User):
    """Officers see their own county only; an officer without a county sees nothing."""
    if user.role == UserRole.admin:
        return query
    return query.filter(Referral.county == user.county) if user.county else query.filter(False)


def _get_referral(db: Session, referral_id: int, user: User) -> Referral:
    referral = _visible(db.query(Referral), user).filter(Referral.referral_id == referral_id).first()
    if not referral:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Referral not found")
    return referral


def _check_judgement(value: str) -> str:
    if value not in KNOWLEDGE_BASE and value not in OTHER_JUDGEMENTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose one of the listed answers")
    return value


@router.get("/referrals", response_model=list[ReferralOut])
def list_referrals(status_: Optional[ReferralStatus] = Query(None, alias="status"), county: Optional[str] = None,
                   mine: bool = False, db: Session = Depends(get_db), user: User = Depends(staff_only)):
    expire_overdue(db)
    query = _visible(db.query(Referral), user)
    if status_:
        query = query.filter(Referral.status == status_)
    if county and user.role == UserRole.admin:
        query = query.filter(Referral.county == county)
    if mine:
        query = query.filter((Referral.claimed_by_id == user.user_id) | (Referral.replied_by_id == user.user_id))
    referrals = query.order_by(Referral.created_at.desc()).limit(200).all()
    return [_referral_out(db, r, user) for r in referrals]


@router.get("/referrals/{referral_id}", response_model=ReferralOut)
def get_referral(referral_id: int, db: Session = Depends(get_db), user: User = Depends(staff_only)):
    expire_overdue(db)
    return _referral_out(db, _get_referral(db, referral_id, user), user)


@router.get("/referrals/{referral_id}/photo")
def referral_photo(referral_id: int, db: Session = Depends(get_db), user: User = Depends(staff_only)):
    """The farmer's photo, only for cases they agreed to share (every referral is one)."""
    referral = _get_referral(db, referral_id, user)
    diagnosis = db.get(Diagnosis, referral.diagnosis_id)
    if not diagnosis.share_with_officer or not os.path.exists(diagnosis.image_path):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="The photo is no longer stored")
    return FileResponse(diagnosis.image_path, headers={"Cache-Control": "private, no-store"})


@router.post("/referrals/{referral_id}/claim", response_model=ReferralOut)
def claim_referral(referral_id: int, request: Request, db: Session = Depends(get_db),
                   user: User = Depends(staff_only)):
    expire_overdue(db)
    referral = _get_referral(db, referral_id, user)
    # One UPDATE that only succeeds while the case is still new, so two officers clicking
    # at the same moment can't both get it.
    claimed = (
        db.query(Referral)
        .filter(Referral.referral_id == referral.referral_id, Referral.status == ReferralStatus.new)
        .update({Referral.status: ReferralStatus.in_review, Referral.claimed_by_id: user.user_id,
                 Referral.claimed_at: utcnow()}, synchronize_session=False)
    )
    if not claimed:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Someone else has already claimed this case")
    audit.record(db, user, "referral_claim", f"Referral {referral.referral_id}", request=request)
    db.commit()
    db.refresh(referral)
    return _referral_out(db, referral, user)


@router.post("/referrals/{referral_id}/release", response_model=ReferralOut)
def release_referral(referral_id: int, request: Request, db: Session = Depends(get_db),
                     user: User = Depends(staff_only)):
    referral = _get_referral(db, referral_id, user)
    if referral.status != ReferralStatus.in_review or (
            referral.claimed_by_id != user.user_id and user.role != UserRole.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only the officer reviewing this case can release it")
    referral.status = ReferralStatus.new
    referral.claimed_by_id = referral.claimed_at = None
    # A new reviewer judges afresh, without seeing the last one's judgement.
    referral.judgement = referral.judged_at = None
    audit.record(db, user, "referral_release", f"Referral {referral.referral_id}", request=request)
    db.commit()
    return _referral_out(db, referral, user)


def _require_claim(referral: Referral, user: User) -> None:
    if referral.status != ReferralStatus.in_review or referral.claimed_by_id != user.user_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Claim this case before answering it")


@router.post("/referrals/{referral_id}/judgement", response_model=ReferralOut)
def record_judgement(referral_id: int, payload: JudgementIn, db: Session = Depends(get_db),
                     user: User = Depends(staff_only)):
    """Record the officer's own judgement, then show them the model's guess. Once recorded it
    cannot change, so judgements stay independent of the model (avoiding automation bias)."""
    referral = _get_referral(db, referral_id, user)
    _require_claim(referral, user)
    judgement = _check_judgement(payload.judgement)
    if referral.judgement and referral.judgement != judgement:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Your judgement is locked once you have seen the model's guess")
    referral.judgement = judgement
    referral.judged_at = referral.judged_at or utcnow()
    db.commit()
    return _referral_out(db, referral, user)


@router.post("/referrals/{referral_id}/reply", response_model=ReferralOut)
def reply_to_referral(referral_id: int, payload: ReplyIn, request: Request, db: Session = Depends(get_db),
                      user: User = Depends(staff_only)):
    referral = _get_referral(db, referral_id, user)
    _require_claim(referral, user)
    judgement = _check_judgement(payload.judgement)
    if referral.judgement and referral.judgement != judgement:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Your judgement is locked once you have seen the model's guess")

    advice = []
    if payload.advice_ids:
        entries = db.query(AdviceEntry).filter(AdviceEntry.advice_id.in_(payload.advice_ids),
                                               AdviceEntry.status == AdviceStatus.active).all()
        if len(entries) != len(set(payload.advice_ids)) or any(e.disease != judgement for e in entries):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Attach only current advice for the disease you judged")
        # Copied as sent, so a later correction doesn't change what the farmer was shown.
        advice = [{"id": e.advice_id, "version": e.version, "kind": e.kind.value, "text": e.text,
                   "source_title": e.source_title, "source_url": e.source_url, "licence": e.licence}
                  for e in entries]

    now = utcnow()
    referral.judgement = judgement
    referral.judged_at = referral.judged_at or now
    referral.reply_text = payload.text
    referral.reply_advice = advice
    referral.replied_by_id = user.user_id
    referral.replied_at = now
    referral.status = ReferralStatus.answered

    # The farmer sees the reply on this check in their history.
    diagnosis = db.get(Diagnosis, referral.diagnosis_id)
    extra = "".join(f"\n\n{a['text']}\n(Source: {a['source_title']}, {a['licence']})" for a in advice)
    diagnosis.officer_response = f"{payload.text}{extra}\n\n{_name(user)}, county extension officer"
    diagnosis.responded_at = now

    judged = display_name(judgement) if judgement in KNOWLEDGE_BASE else judgement
    audit.record(db, user, "referral_reply", f"Referral {referral.referral_id}", f"Judgement: {judged}", request)
    db.commit()
    return _referral_out(db, referral, user)


# ---------------------------------------------------------------------------- overview

@router.get("/overview", response_model=OverviewOut)
def overview(db: Session = Depends(get_db), user: User = Depends(admin_only)):
    expire_overdue(db)
    now = utcnow()
    week = db.query(Diagnosis).filter(Diagnosis.created_at >= now - timedelta(days=7)).all()
    referred = [d for d in week if d.is_referred]
    counties = dict(db.query(User.user_id, User.county).filter(User.user_id.in_({d.user_id for d in week})).all())

    open_ = db.query(Referral).filter(Referral.status.in_(OPEN)).all()
    month = db.query(Referral).filter(Referral.created_at >= now - timedelta(days=30),
                                      Referral.status.in_([ReferralStatus.answered, ReferralStatus.expired])).all()
    answered = [r for r in month if r.status == ReferralStatus.answered]

    # Officer-model agreement: only replies naming a disease (or "another disease");
    # "can't tell" and "needs a farm visit" say nothing about whether the model was right.
    agreement_rows = (
        db.query(Referral.judgement, Diagnosis.top_class)
        .join(Diagnosis, Diagnosis.diagnosis_id == Referral.diagnosis_id)
        .filter(Referral.status == ReferralStatus.answered)
        .all()
    )
    judged = [(j, top) for j, top in agreement_rows if j in KNOWLEDGE_BASE or j == "other_disease"]

    bins = Counter(min(int(d.confidence * 10), 9) / 10 for d in referred)
    return OverviewOut(
        checks_this_week=len(week),
        referred_this_week=len(referred),
        answered_within_7_days=len(answered) / len(month) if month else None,
        top_results=Counter(d.top_class for d in week if not d.is_referred and d.top_class).most_common(6),
        by_county=Counter(counties.get(d.user_id) or "Not set" for d in week).most_common(8),
        referred_confidence=sorted(bins.items()),
        waiting_referrals=len(open_),
        expiring_soon=sum(1 for r in open_ if r.expires_at < now + timedelta(days=2)),
        officer_agreement=Agreement(agreed=sum(1 for j, top in judged if j == top), judged=len(judged)),
    )


# ------------------------------------------------------------------------------- users

def _contact(user: User) -> str:
    if user.role != UserRole.farmer:
        return user.user_email or ""
    # Farmers' numbers are personal data: admins see only enough to tell accounts apart.
    if user.user_phone_number:
        return f"{user.user_phone_number[:2]}xx xxx {user.user_phone_number[-3:]}"
    return "email account"


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.user_id,
        name=user.full_name or (farmer_label(user.user_id) if user.role == UserRole.farmer else _contact(user)),
        contact=_contact(user),
        role=user.role,
        county=user.county,
        mfa=user.mfa_enabled,
        active=bool(user.is_active),
        created_at=user.created_at,
        last_sign_in=user.last_sign_in,
    )


def _managed(db: Session, user_id: int, me: User, officers_only: bool = True) -> User:
    """Admins manage officers (and switch farmers on or off); admin accounts are managed only
    with the server command, so one stolen admin session can't take over the others."""
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if target.user_id == me.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use My account for your own account")
    if target.role == UserRole.admin or (officers_only and target.role != UserRole.officer):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Admin accounts are managed with the server command")
    return target


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), user: User = Depends(admin_only)):
    return [_user_out(u) for u in db.query(User).order_by(User.role, User.created_at).limit(500).all()]


@router.post("/users/officers", response_model=OfficerCreated, status_code=status.HTTP_201_CREATED)
def create_officer(payload: OfficerIn, request: Request, db: Session = Depends(get_db),
                   user: User = Depends(admin_only)):
    email = payload.email.lower()
    if db.query(User).filter(User.user_email == email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An account with this email already exists")
    officer = User(user_email=email, full_name=payload.name, county=payload.county, role=UserRole.officer,
                   is_verified=True)
    db.add(officer)
    db.flush()
    link = issue_link(db, officer, "invite")
    audit.record(db, user, "user_create", email, f"Extension officer, {payload.county}", request)
    db.commit()
    return OfficerCreated(user=_user_out(officer), link=link, expires_in_hours=settings.staff_link_expire_hours)


@router.post("/users/{user_id}/active", status_code=status.HTTP_204_NO_CONTENT)
def set_user_active(user_id: int, payload: ActiveIn, request: Request, db: Session = Depends(get_db),
                    user: User = Depends(admin_only)):
    target = _managed(db, user_id, user, officers_only=False)
    target.is_active = payload.active
    audit.record(db, user, "user_reactivate" if payload.active else "user_deactivate",
                 target.user_email or farmer_label(target.user_id), request=request)
    db.commit()


@router.post("/users/{user_id}/reset-password", response_model=LinkOut)
def reset_password(user_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(admin_only)):
    """The old password stops working now; the officer chooses a new one from the link."""
    target = _managed(db, user_id, user)
    target.hashed_password = None
    link = issue_link(db, target, "reset")
    audit.record(db, user, "user_reset_password", target.user_email, request=request)
    db.commit()
    return LinkOut(link=link, expires_in_hours=settings.staff_link_expire_hours)


@router.post("/users/{user_id}/reset-mfa", response_model=LinkOut)
def reset_authenticator(user_id: int, request: Request, db: Session = Depends(get_db),
                        user: User = Depends(admin_only)):
    """For a lost phone. The password is reset too: otherwise anyone who knew the password could
    set up their own authenticator at the next sign-in. Backup codes are cancelled."""
    target = _managed(db, user_id, user)
    target.totp_secret_encrypted = None
    target.totp_last_used_step = None
    target.mfa_enabled = False
    target.hashed_password = None
    db.query(BackupCode).filter(BackupCode.user_id == target.user_id).delete()
    link = issue_link(db, target, "reset")
    audit.record(db, user, "user_reset_mfa", target.user_email, request=request)
    db.commit()
    return LinkOut(link=link, expires_in_hours=settings.staff_link_expire_hours)


@router.post("/users/{user_id}/county", status_code=status.HTTP_204_NO_CONTENT)
def set_officer_county(user_id: int, payload: CountyIn, request: Request, db: Session = Depends(get_db),
                       user: User = Depends(admin_only)):
    target = _managed(db, user_id, user)
    target.county = payload.county
    audit.record(db, user, "user_county", target.user_email, f"Now {payload.county}", request)
    db.commit()


# ------------------------------------------------------------------------------- audit

@router.get("/audit", response_model=list[AuditOut])
def list_audit(db: Session = Depends(get_db), user: User = Depends(admin_only)):
    entries = db.query(AuditEntry).order_by(AuditEntry.at.desc(), AuditEntry.entry_id.desc()).limit(500).all()
    return [AuditOut(id=e.entry_id, at=e.at, who=e.actor_label, action=e.action, target=e.target, detail=e.detail)
            for e in entries]


# ------------------------------------------------------------------------------- model

@router.get("/model", response_model=ModelOut)
def model_settings(user: User = Depends(admin_only)):
    """What diagnosis runs on and where each part came from (notebook, results, commit)."""
    return ModelOut(
        parts=[
            ModelPart(label="Image model", value=f"ResNet-50 ({settings.ml_model_path})",
                      source="Notebook 10 (architecture comparison)", results="ml/results/compare_resnet50",
                      commit="92e4496", date="2026-10-14"),
            ModelPart(label="Symptom text model", value="BERT-base, late fusion (not yet in the backend)",
                      source="Notebook 11b (late-fusion follow-up)", results="ml/results/fusion_late_followup",
                      commit="cfb3906", date="2026-10-17",
                      note="The farmer's description is stored with each check; the backend does not use it yet."),
            ModelPart(label="Calibration", value=f"Temperature scaling, T = {settings.temperature:g}",
                      source="Notebook 13 (calibration and threshold)", results="ml/results/calibration",
                      commit="b0ab005", date="2026-10-18"),
            ModelPart(label="Referral threshold", value=max(settings.confidence_threshold, 0.5),
                      source="Notebook 13b (threshold follow-up)", results="ml/results/calibration_followup",
                      commit="0c7224f", date="2026-10-18",
                      note="No threshold reached 90% accuracy with confidence, so the rule fixed in advance chose "
                           "it: one wrong answer counts as much as five referrals."),
        ],
        fitted_on="Selection set: 3,821 unseen field photos (notebook 12)",
    )
