"""Phone confirmation with an SMS code

t22: a farmer who signs up (or signs in) with a phone number confirms it with a 6-digit SMS
code, like email (t08). users.phone_verified_at records when. Existing phone accounts start
unconfirmed and are asked once at their next sign-in, but only once live SMS is set on the
server (app/core/sms.py sms_ready); until then phone sign-in works as before.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-11-08 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('phone_verified_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'phone_verified_at')
