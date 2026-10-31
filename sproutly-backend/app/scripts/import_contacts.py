"""Load the sourced support contacts file (t38) into the contacts table.

Run inside sproutly-backend:

    python -m app.scripts.import_contacts path/to/support_contacts.csv

The deployed server runs it at every start (start.sh). Only contacts not already in the table
are added, matched on county, name and organisation, so an admin's later edits (a new phone
number, hiding a contact) are never undone and never duplicated.

The CSV has a header row with: county, kind, name, role, organisation, phone, phone_type, email,
hours, checked_on, source_url. county is one of the 47 counties or Nationwide; checked_on
(YYYY-MM-DD) is when the details were read from source_url, which stays in the file only.
Only office lines and hotlines are accepted: a personal mobile needs that person's consent,
which only an admin can record in the portal.
"""

import csv
import sys
from datetime import datetime, timezone

from pydantic import ValidationError

from app.core import audit
from app.db.session import SessionLocal
from app.models import advice, audit as _audit, contact as _contact, diagnosis, oauth_flow, referral, staff_auth  # noqa: F401
from app.models.contact import PhoneType, SupportContact
from app.models.user import User  # noqa: F401
from app.schemas.admin import ContactIn

FIELDS = ("county", "kind", "name", "role", "organisation", "phone", "phone_type", "email", "hours")


def main(path: str) -> int:
    db = SessionLocal()
    added, skipped, problems = 0, 0, []
    try:
        with open(path, newline="", encoding="utf-8") as handle:
            for line, row in enumerate(csv.DictReader(handle), start=2):
                values = {k: (row.get(k) or "").strip() for k in FIELDS}
                values["email"] = values["email"] or None
                try:
                    item = ContactIn(**values)
                    checked = datetime.strptime(row["checked_on"].strip(), "%Y-%m-%d").replace(tzinfo=timezone.utc)
                except (ValidationError, ValueError, KeyError) as exc:
                    message = exc.errors()[0]["msg"] if isinstance(exc, ValidationError) else str(exc)
                    problems.append(f"line {line}: {message}")
                    continue
                if item.phone_type == PhoneType.personal:
                    problems.append(f"line {line}: personal mobiles are added in the portal, with consent")
                    continue
                exists = db.query(SupportContact).filter(SupportContact.county == item.county,
                                                         SupportContact.name == item.name,
                                                         SupportContact.organisation == item.organisation).first()
                if exists:
                    skipped += 1
                    continue
                db.add(SupportContact(**item.model_dump(exclude={"personal_consent"}), checked_on=checked, active=True))
                added += 1
        if problems:
            print("Nothing imported; fix these rows first:")
            print("\n".join(problems))
            db.rollback()
            return 1
        if added:
            audit.record(db, None, "contact_add", f"{added} contacts", f"Imported from {path}", actor_label="(server command)")
        db.commit()
    finally:
        db.close()
    print(f"Added {added} contacts; {skipped} were already in the table.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    sys.exit(main(sys.argv[1]))
