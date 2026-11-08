"""Why a referral came: the model was not sure, or the farmer doubted the result

t31 (supervisor, 24 Oct): on a diagnosed result the farmer can tap "This doesn't match what I
see"; with their consent the photo goes to their county's officers like a referred case.
referrals.reason is "doesnt_match" for those (empty: the model was not sure), and
referrals.farmer_note keeps what the farmer wrote, if anything.

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-11-08 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b0c1d2e3f4a5'
down_revision: Union[str, None] = 'a9b0c1d2e3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('referrals', sa.Column('reason', sa.String(), nullable=True))
    op.add_column('referrals', sa.Column('farmer_note', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('referrals', 'farmer_note')
    op.drop_column('referrals', 'reason')
