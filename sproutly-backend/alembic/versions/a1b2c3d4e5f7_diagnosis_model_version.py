"""Which model made each diagnosis

Every new diagnosis records what made it (the model run folders, temperature and threshold,
from app.core.classifier.model_version), so a result can still be traced after the deployed
model changes. Diagnoses made before this column existed keep it empty: their version
was not recorded.

Revision ID: a1b2c3d4e5f7
Revises: c9f3a6b7e8d0
Create Date: 2026-10-24 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, Sequence[str], None] = 'c9f3a6b7e8d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('diagnoses') as batch:
        batch.add_column(sa.Column('model_version', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('diagnoses') as batch:
        batch.drop_column('model_version')
