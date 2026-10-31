"""County support contacts and the advice library: edited by admins in the portal,
read by officers, and shown to farmers in the app."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core import audit
from app.core.counties import NATIONWIDE
from app.core.deps import get_current_user, require_role
from app.core.knowledge_base import KNOWLEDGE_BASE, display_name
from app.core.timeutil import utcnow
from app.db.session import get_db
from app.models.advice import AdviceEntry, AdviceKind, AdviceStatus, AdviceVersion
from app.models.contact import PhoneType, SupportContact
from app.models.user import User, UserRole
from app.schemas.admin import (
    ActiveIn,
    AdviceIn,
    AdviceOut,
    ContactIn,
    ContactOut,
    HistoryOut,
    RetireIn,
)

router = APIRouter(prefix="/admin", tags=["admin"])
public_router = APIRouter(prefix="/contacts", tags=["contacts"])

staff_only = require_role(UserRole.admin, UserRole.officer)
admin_only = require_role(UserRole.admin)


# ---------------------------------------------------------------------------- contacts

def _contact_out(c: SupportContact) -> ContactOut:
    return ContactOut(id=c.contact_id, county=c.county, kind=c.kind, name=c.name, role=c.role,
                      organisation=c.organisation, phone=c.phone, phone_type=c.phone_type,
                      personal_consent_on=c.personal_consent_on, email=c.email, hours=c.hours,
                      checked_on=c.checked_on, active=c.active)


def _apply_contact(contact: SupportContact, payload: ContactIn, user: User) -> None:
    """Copy the form onto the contact. A personal mobile is shown to farmers only with that
    person's consent (Data Protection Act 2019, s.30), recorded with the date and the admin so
    it can be shown later (s.32(1)); a new personal number needs consent again."""
    if payload.phone_type == PhoneType.personal and not payload.personal_consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A personal mobile is shown only with the person's consent. Confirm it, or use an office line or hotline.",
        )
    new_personal = payload.phone_type == PhoneType.personal and (
        contact.phone_type != PhoneType.personal or contact.phone != payload.phone or not contact.personal_consent_on)
    for key, value in payload.model_dump(exclude={"personal_consent"}).items():
        setattr(contact, key, value)
    if payload.phone_type != PhoneType.personal:
        contact.personal_consent_on = None
        contact.personal_consent_by_id = None
    elif new_personal:
        contact.personal_consent_on = utcnow()
        contact.personal_consent_by_id = user.user_id


def _get_contact(db: Session, contact_id: int) -> SupportContact:
    contact = db.get(SupportContact, contact_id)
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    return contact


@router.get("/contacts", response_model=list[ContactOut])
def list_contacts(db: Session = Depends(get_db), user: User = Depends(staff_only)):
    query = db.query(SupportContact)
    if user.role != UserRole.admin:
        query = query.filter(SupportContact.active.is_(True))
    return [_contact_out(c) for c in query.order_by(SupportContact.county, SupportContact.name).all()]


@router.post("/contacts", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
def add_contact(payload: ContactIn, request: Request, db: Session = Depends(get_db), user: User = Depends(admin_only)):
    # Whoever saves a contact has just looked at its details, so it counts as checked today.
    contact = SupportContact(checked_on=utcnow(), active=True)
    _apply_contact(contact, payload, user)
    db.add(contact)
    audit.record(db, user, "contact_add", f"{contact.name} ({contact.county})",
                 "Personal mobile, consent recorded" if contact.personal_consent_on else "", request)
    db.commit()
    return _contact_out(contact)


@router.put("/contacts/{contact_id}", response_model=ContactOut)
def edit_contact(contact_id: int, payload: ContactIn, request: Request, db: Session = Depends(get_db),
                 user: User = Depends(admin_only)):
    contact = _get_contact(db, contact_id)
    consent_before = contact.personal_consent_on
    _apply_contact(contact, payload, user)
    contact.checked_on = utcnow()
    detail = "Personal mobile, consent recorded" if contact.personal_consent_on and contact.personal_consent_on != consent_before else ""
    audit.record(db, user, "contact_edit", f"{contact.name} ({contact.county})", detail, request)
    db.commit()
    return _contact_out(contact)


@router.post("/contacts/{contact_id}/checked", status_code=status.HTTP_204_NO_CONTENT)
def mark_contact_checked(contact_id: int, request: Request, db: Session = Depends(get_db),
                         user: User = Depends(admin_only)):
    contact = _get_contact(db, contact_id)
    contact.checked_on = utcnow()
    audit.record(db, user, "contact_checked", f"{contact.name} ({contact.county})", request=request)
    db.commit()


@router.post("/contacts/{contact_id}/active", status_code=status.HTTP_204_NO_CONTENT)
def set_contact_active(contact_id: int, payload: ActiveIn, request: Request, db: Session = Depends(get_db),
                       user: User = Depends(admin_only)):
    contact = _get_contact(db, contact_id)
    contact.active = payload.active
    audit.record(db, user, "contact_show" if payload.active else "contact_hide",
                 f"{contact.name} ({contact.county})", request=request)
    db.commit()


@public_router.get("", response_model=list[ContactOut])
def contacts_for_farmer(county: Optional[str] = None, db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    """The app's Support contacts screen: the nationwide contacts first, then the shown contacts
    of a county (default: the farmer's own). Without a county, only the nationwide ones."""
    county = county or user.county
    counties = [NATIONWIDE, county] if county else [NATIONWIDE]
    contacts = (
        db.query(SupportContact)
        .filter(SupportContact.county.in_(counties), SupportContact.active.is_(True))
        .order_by(SupportContact.county != NATIONWIDE, SupportContact.kind, SupportContact.name)
        .all()
    )
    return [_contact_out(c) for c in contacts]


# ------------------------------------------------------------------------------ advice

def _advice_out(db: Session, entry: AdviceEntry) -> AdviceOut:
    versions = (
        db.query(AdviceVersion, User)
        .outerjoin(User, User.user_id == AdviceVersion.saved_by_id)
        .filter(AdviceVersion.advice_id == entry.advice_id)
        .order_by(AdviceVersion.version_id)
        .all()
    )
    return AdviceOut(
        id=entry.advice_id, disease=entry.disease, kind=entry.kind, text=entry.text,
        source_title=entry.source_title, source_url=entry.source_url, licence=entry.licence,
        version=entry.version, status=entry.status,
        history=[HistoryOut(version=v.version, at=v.saved_at, by=audit.label(u) if u else "(import)", note=v.note)
                 for v, u in versions],
    )


def _check_disease(disease: str, kind: AdviceKind) -> None:
    if disease not in KNOWLEDGE_BASE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose one of the model's 11 results")
    if disease.endswith("healthy") and kind != AdviceKind.prevention:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="A healthy result takes prevention advice only")


def _get_advice(db: Session, advice_id: int) -> AdviceEntry:
    entry = db.get(AdviceEntry, advice_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Advice entry not found")
    return entry


@router.get("/advice", response_model=list[AdviceOut])
def list_advice(db: Session = Depends(get_db), user: User = Depends(staff_only)):
    return [_advice_out(db, e) for e in db.query(AdviceEntry).order_by(AdviceEntry.disease, AdviceEntry.advice_id).all()]


@router.post("/advice", response_model=AdviceOut, status_code=status.HTTP_201_CREATED)
def add_advice(payload: AdviceIn, request: Request, db: Session = Depends(get_db), user: User = Depends(admin_only)):
    _check_disease(payload.disease, payload.kind)
    entry = AdviceEntry(**payload.model_dump(exclude={"note"}), version=1, status=AdviceStatus.active)
    db.add(entry)
    db.flush()
    db.add(AdviceVersion(advice_id=entry.advice_id, version=1, text=entry.text, note=payload.note,
                         saved_by_id=user.user_id))
    audit.record(db, user, "advice_add", display_name(entry.disease), payload.note, request)
    db.commit()
    return _advice_out(db, entry)


@router.put("/advice/{advice_id}", response_model=AdviceOut)
def correct_advice(advice_id: int, payload: AdviceIn, request: Request, db: Session = Depends(get_db),
                   user: User = Depends(admin_only)):
    """A correction saves a new version; the old wording stays in the history."""
    entry = _get_advice(db, advice_id)
    if entry.status != AdviceStatus.active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A retired entry cannot be corrected")
    if payload.disease != entry.disease:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="An entry stays with its disease; add a new entry instead")
    _check_disease(payload.disease, payload.kind)
    for key, value in payload.model_dump(exclude={"note", "disease"}).items():
        setattr(entry, key, value)
    entry.version += 1
    db.add(AdviceVersion(advice_id=entry.advice_id, version=entry.version, text=entry.text, note=payload.note,
                         saved_by_id=user.user_id))
    audit.record(db, user, "advice_correct", display_name(entry.disease), payload.note, request)
    db.commit()
    return _advice_out(db, entry)


@router.post("/advice/{advice_id}/retire", status_code=status.HTTP_204_NO_CONTENT)
def retire_advice(advice_id: int, payload: RetireIn, request: Request, db: Session = Depends(get_db),
                  user: User = Depends(admin_only)):
    entry = _get_advice(db, advice_id)
    entry.status = AdviceStatus.retired
    db.add(AdviceVersion(advice_id=entry.advice_id, version=entry.version, text=entry.text,
                         note=f"Retired: {payload.note}", saved_by_id=user.user_id))
    audit.record(db, user, "advice_retire", display_name(entry.disease), payload.note, request)
    db.commit()
