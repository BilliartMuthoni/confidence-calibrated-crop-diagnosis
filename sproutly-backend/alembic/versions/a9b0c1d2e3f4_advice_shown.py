"""Which advice versions each check showed

Each diagnosed check stores the advice library entries it showed, as [{"id", "version"}]
(t42; promised in the 18 Oct scope as a versioned advice library). Opening the check later
shows that wording from the change history, so an admin's later correction does not change
what a farmer was told; the app says when the advice has been updated since. Checks made
before this stay empty and show today's advice, as before.

Revision ID: a9b0c1d2e3f4
Revises: f7a8b9c0d1e2
Create Date: 2026-11-08 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9b0c1d2e3f4'
down_revision: Union[str, None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('diagnoses', sa.Column('advice_shown', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('diagnoses', 'advice_shown')
