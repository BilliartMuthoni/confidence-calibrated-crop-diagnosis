"""Farmers' photos are kept for PHOTO_DAYS (30) and then deleted.

A photo is needed for the check itself, for "change the crop" (which looks at the same photo
again) and for an officer answering a referral (REFERRAL_DAYS, 7). After that it is only
personal data being kept, so only the photo file goes: the check's result, confidence and any
officer's reply stay in the farmer's history, and the screens that show photos already say
"no longer stored" when the file is gone. Kenya Data Protection Act 2019, s.25(g) and s.39:
personal data is kept no longer than needed for the purpose it was collected for.

Runs when the backend starts and then every hour (main.py), and by hand with
``python -m app.scripts.delete_old_photos``.
"""

import os
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core import audit
from app.core.config import settings
from app.core.timeutil import utcnow
from app.models.diagnosis import Diagnosis
from app.models.referral import Referral, ReferralStatus

# A file in the uploads folder that belongs to no check (an upload that failed halfway) is
# removed once it is this old; younger ones may belong to a check being saved right now.
ORPHAN_HOURS = 24

OPEN = (ReferralStatus.new, ReferralStatus.in_review)


def inside_uploads(path: str) -> bool:
    folder = os.path.realpath(settings.upload_dir)
    return os.path.commonpath([folder, os.path.realpath(path)]) == folder


def delete_old_photos(db: Session, now: Optional[datetime] = None) -> dict:
    """Delete photo files past their time; returns what was done. The caller need not commit."""
    now = now or utcnow()
    cutoff = now - timedelta(days=settings.photo_days)

    # A referral that is somehow still open past its deadline keeps its photo until it ends.
    open_referrals = {
        r.diagnosis_id for r in db.query(Referral.diagnosis_id, Referral.expires_at, Referral.status)
        .filter(Referral.status.in_(OPEN), Referral.expires_at > now)
    }
    old = db.query(Diagnosis.diagnosis_id, Diagnosis.image_path).filter(Diagnosis.created_at < cutoff).all()
    deleted = kept_open = 0
    for diagnosis_id, path in old:
        if diagnosis_id in open_referrals:
            kept_open += 1
            continue
        if path and os.path.isfile(path) and inside_uploads(path):
            os.remove(path)
            deleted += 1

    orphans = 0
    folder = settings.upload_dir
    if os.path.isdir(folder):
        known = {os.path.realpath(p) for (p,) in db.query(Diagnosis.image_path) if p}
        oldest = (now - timedelta(hours=ORPHAN_HOURS)).timestamp()
        for name in os.listdir(folder):
            path = os.path.join(folder, name)
            if (os.path.isfile(path) and os.path.realpath(path) not in known
                    and os.path.getmtime(path) < oldest):
                os.remove(path)
                orphans += 1

    if deleted or orphans:
        audit.record(db, None, "photos_deleted", "",
                     f"{deleted} photos older than {settings.photo_days} days, {orphans} unused uploads",
                     actor_label="Sproutly (automatic)")
        db.commit()
    return {"deleted": deleted, "orphans": orphans, "kept_open_referrals": kept_open}
