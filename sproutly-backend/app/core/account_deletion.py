"""Deleting a farmer's account after the grace period (found in testing, tracker t71).

A farmer who asks to delete their account is signed out everywhere and their cases are hidden
from officers at once; everything is deleted when the grace period ends (users.delete_after).
Signing in before then keeps the account. The hourly clean-up job in main.py calls purge_due.
Kenya Data Protection Act 2019, s.40 (right to erasure): the deletion happens on a fixed,
stated date, and the farmer is told that date.
"""
import logging
import os

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core import audit
from app.core.retention import inside_uploads
from app.core.timeutil import utcnow
from app.models.audit import AuditEntry
from app.models.diagnosis import Diagnosis
from app.models.oauth_flow import OAuthFlow
from app.models.referral import Referral
from app.models.saved_turn import SavedTurn
from app.models.staff_auth import BackupCode
from app.models.user import User, UserRole

logger = logging.getLogger("sproutly")


def purge_account(db: Session, user: User) -> None:
    """Delete the account and its data: photos (the files too), checks, referrals, kept assistant
    questions, backup codes and sign-in records. One audit entry records that an account was
    deleted and when, with nothing that identifies the person. Commits, then removes the files."""
    user_id = user.user_id
    diagnoses = db.query(Diagnosis).filter(Diagnosis.user_id == user_id).all()
    photos = [d.image_path for d in diagnoses if d.image_path]
    ids = [d.diagnosis_id for d in diagnoses]
    db.query(SavedTurn).filter(SavedTurn.user_id == user_id).delete(synchronize_session=False)
    if ids:
        db.query(Referral).filter(Referral.diagnosis_id.in_(ids)).delete(synchronize_session=False)
        db.query(Diagnosis).filter(Diagnosis.diagnosis_id.in_(ids)).update(
            {Diagnosis.retake_of: None}, synchronize_session=False)
        db.query(Diagnosis).filter(Diagnosis.diagnosis_id.in_(ids)).delete(synchronize_session=False)
    db.query(BackupCode).filter(BackupCode.user_id == user_id).delete(synchronize_session=False)
    db.query(OAuthFlow).filter(or_(OAuthFlow.user_id == user_id, OAuthFlow.connect_user_id == user_id)).delete(
        synchronize_session=False)
    db.query(AuditEntry).filter(AuditEntry.actor_id == user_id).update(
        {AuditEntry.actor_id: None, AuditEntry.actor_label: "(deleted account)"}, synchronize_session=False)
    audit.record(db, None, "account_deleted", f"farmer account #{user_id}",
                 f"Deleted by the account holder's request with {len(ids)} checks", actor_label="(deleted account)")
    db.delete(user)
    db.commit()
    # Files last, once the rows are gone, so a failure above leaves nothing half deleted.
    for path in photos:
        if os.path.isfile(path) and inside_uploads(path):
            os.remove(path)


def purge_due(db: Session) -> int:
    """Delete every account whose grace period has ended. Returns how many were deleted."""
    due = (db.query(User)
           .filter(User.role == UserRole.farmer, User.delete_after.isnot(None), User.delete_after <= utcnow())
           .all())
    for user in due:
        purge_account(db, user)
    if due:
        logger.warning("Deleted %d account(s) after the grace period", len(due))
    return len(due)
