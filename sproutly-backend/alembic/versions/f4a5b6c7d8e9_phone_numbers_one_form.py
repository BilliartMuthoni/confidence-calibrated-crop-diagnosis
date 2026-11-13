"""Phone numbers in one form (+2547XXXXXXXX)

Until now a phone number was stored as typed, so 0712345678 and +254712345678 were two different
accounts and a farmer who signed up with one could not log in with the other. Sign-up, log in and
changing the number now store +254 followed by 9 digits (app/core/phone.py); this converts the
numbers already stored.

A number that is not a Kenyan mobile number, or that would become the same as another account's,
is left as it is and listed in the log, so no account is merged or lost silently. (Such an account
can still log in with email if it has one, or be fixed by hand.) Downgrade keeps the new form: the
original spelling was not kept.

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-11-10 23:00:00.000000

"""
import logging
import re
from collections import defaultdict
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log = logging.getLogger("alembic.runtime.migration")


def _one_form(value):
    """A copy of app/core/phone.normalise_phone as it was on 10 Nov 2026 (a migration must not
    change if that file changes later). None when it is not a Kenyan mobile number."""
    v = re.sub(r"[\s\-().]", "", value or "")
    if v.startswith("00"):
        v = "+" + v[2:]
    if v.startswith("+"):
        if not v[1:].startswith("254"):
            return None
        v = v[1:]
    if not v.isdigit():
        return None
    if v.startswith("254") and len(v) == 12:
        national = v[3:]
    elif v.startswith("0") and len(v) == 10:
        national = v[1:]
    elif len(v) == 9:
        national = v
    else:
        return None
    return "+254" + national if national[0] in "71" else None


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT user_id, user_phone_number FROM users WHERE user_phone_number IS NOT NULL")).all()
    wanted = defaultdict(list)
    for user_id, phone in rows:
        new = _one_form(phone)
        if new is None:
            log.warning("Phone of user %s is not a Kenyan mobile number; left as it is", user_id)
        else:
            wanted[new].append((user_id, phone))
    for new, owners in wanted.items():
        if len(owners) > 1:
            ids = ", ".join(str(user_id) for user_id, _ in owners)
            log.warning("Users %s have the same phone number written differently; left as they are", ids)
            continue
        user_id, phone = owners[0]
        if phone != new:
            conn.execute(sa.text("UPDATE users SET user_phone_number = :new WHERE user_id = :id"),
                         {"new": new, "id": user_id})


def downgrade() -> None:
    pass
