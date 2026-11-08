"""The app's own ID for a photo queued with no signal

g07 (offline queue): with no signal the app saves a check and sends it later, tagged with its
own UUID. diagnoses.client_id is unique, so if the same photo is sent twice (the reply was lost
on a weak connection) the server returns the first check instead of making a second one.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-11-08 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('diagnoses', sa.Column('client_id', sa.String(length=64), nullable=True))
    op.create_index('ix_diagnoses_client_id', 'diagnoses', ['client_id'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_diagnoses_client_id', table_name='diagnoses')
    op.drop_column('diagnoses', 'client_id')
