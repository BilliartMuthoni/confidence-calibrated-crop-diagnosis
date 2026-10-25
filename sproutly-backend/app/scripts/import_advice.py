"""Load the reviewed advice file (D16) into the advice library.

Run inside sproutly-backend:

    python -m app.scripts.import_advice path/to/advice.csv
    python -m app.scripts.import_advice path/to/advice.csv --if-empty

--if-empty imports only into an empty library (the deployed server runs it at every start: the
first start fills a new database; later starts never re-add an entry an admin has corrected).

The CSV has a header row with: disease, kind, text, source_title, source_url, licence.
disease is a model class name (e.g. Tomato___Early_blight), kind is treatment or prevention,
and text is the excerpt word for word. Rows already in the library (same disease, kind and
text) are skipped, so the file can be imported again after adding rows.
"""

import csv
import sys

from pydantic import ValidationError

from app.core import audit
from app.core.knowledge_base import KNOWLEDGE_BASE
from app.db.session import SessionLocal
from app.models import advice as _advice, audit as _audit, contact, diagnosis, oauth_flow, referral, staff_auth  # noqa: F401
from app.models.advice import AdviceEntry, AdviceStatus, AdviceVersion
from app.models.user import User  # noqa: F401
from app.schemas.admin import AdviceIn


def main(path: str, if_empty: bool = False) -> int:
    db = SessionLocal()
    added, skipped, problems = 0, 0, []
    try:
        if if_empty and db.query(AdviceEntry).first() is not None:
            print("The advice library already has entries; nothing imported.")
            return 0
        with open(path, newline="", encoding="utf-8") as handle:
            for line, row in enumerate(csv.DictReader(handle), start=2):
                try:
                    item = AdviceIn(**{k: (row.get(k) or "").strip() for k in
                                       ("disease", "kind", "text", "source_title", "source_url", "licence")},
                                    note="Imported from the reviewed advice file")
                except ValidationError as exc:
                    problems.append(f"line {line}: {exc.errors()[0]['msg']}")
                    continue
                if item.disease not in KNOWLEDGE_BASE:
                    problems.append(f"line {line}: unknown class {item.disease!r}")
                    continue
                if item.disease.endswith("healthy") and item.kind.value != "prevention":
                    problems.append(f"line {line}: healthy classes take prevention advice only")
                    continue
                exists = db.query(AdviceEntry).filter(AdviceEntry.disease == item.disease,
                                                      AdviceEntry.kind == item.kind,
                                                      AdviceEntry.text == item.text).first()
                if exists:
                    skipped += 1
                    continue
                entry = AdviceEntry(**item.model_dump(exclude={"note"}), version=1, status=AdviceStatus.active)
                db.add(entry)
                db.flush()
                db.add(AdviceVersion(advice_id=entry.advice_id, version=1, text=entry.text, note=item.note))
                added += 1
        if problems:
            print("Nothing imported; fix these rows first:")
            print("\n".join(problems))
            db.rollback()
            return 1
        audit.record(db, None, "advice_add", f"{added} entries", f"Imported from {path}", actor_label="(server command)")
        db.commit()
    finally:
        db.close()
    print(f"Added {added} entries; {skipped} were already in the library.")
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if_empty = "--if-empty" in args
    paths = [a for a in args if a != "--if-empty"]
    if len(paths) != 1:
        print(__doc__)
        sys.exit(1)
    sys.exit(main(paths[0], if_empty))
