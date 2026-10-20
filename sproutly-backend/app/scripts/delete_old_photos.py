"""Delete farmers' photos older than PHOTO_DAYS now, instead of waiting for the hourly run.

Run inside sproutly-backend (it uses the database in .env):

    python -m app.scripts.delete_old_photos
"""

import sys

from app.core.config import settings
from app.core.retention import delete_old_photos
from app.db.session import SessionLocal
from app.models import advice, audit, contact, diagnosis, oauth_flow, referral, staff_auth, user  # noqa: F401


def main() -> int:
    db = SessionLocal()
    try:
        result = delete_old_photos(db)
    finally:
        db.close()
    print(f"Deleted {result['deleted']} photos older than {settings.photo_days} days and "
          f"{result['orphans']} unused uploads; kept {result['kept_open_referrals']} for open referrals.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
