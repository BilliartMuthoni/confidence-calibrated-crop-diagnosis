"""Farmers' rating of an officer's reply

PR C (i08): under an officer's reply the farmer can say whether it was helpful and, if not,
what went wrong and a note. Admins see it on the read-only Officer replies page (i07).

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-11-08 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b0c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('referrals', sa.Column('farmer_rating', sa.String(), nullable=True))
    op.add_column('referrals', sa.Column('feedback_reason', sa.String(), nullable=True))
    op.add_column('referrals', sa.Column('feedback_note', sa.Text(), nullable=True))
    op.add_column('referrals', sa.Column('rated_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('referrals', 'rated_at')
    op.drop_column('referrals', 'feedback_note')
    op.drop_column('referrals', 'feedback_reason')
    op.drop_column('referrals', 'farmer_rating')
