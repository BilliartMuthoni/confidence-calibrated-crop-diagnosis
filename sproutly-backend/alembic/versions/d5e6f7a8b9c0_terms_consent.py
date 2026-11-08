"""Terms of use and privacy policy consent

A farmer agrees to the terms of use and privacy policy when signing up (a tick-box in the app).
users.terms_version records which version and users.terms_accepted_at when, so the consent can
be shown later (Data Protection Act 2019, s.32: the data controller bears the burden of proof of
consent). Existing accounts start empty and are asked once in the app.

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-11-06 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, Sequence[str], None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users') as batch:
        batch.add_column(sa.Column('terms_version', sa.String(), nullable=True))
        batch.add_column(sa.Column('terms_accepted_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users') as batch:
        batch.drop_column('terms_accepted_at')
        batch.drop_column('terms_version')
