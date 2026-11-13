"""Retake linking: diagnoses.retake_of

n22: a Retake from a not-diagnosed result used to make a second, unrelated check, so Your checks
showed both. The new check now records the one it replaces, and the list hides the older one
(unless it went to an officer). Existing checks have no link and are shown as before.

Revision ID: a6b7c8d9e0f1
Revises: f4a5b6c7d8e9
Create Date: 2026-11-11 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a6b7c8d9e0f1'
down_revision: Union[str, None] = 'f4a5b6c7d8e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('diagnoses') as batch:
        batch.add_column(sa.Column('retake_of', sa.Integer(), nullable=True))
        batch.create_index('ix_diagnoses_retake_of', ['retake_of'])
        batch.create_foreign_key('fk_diagnoses_retake_of', 'diagnoses', ['retake_of'], ['diagnosis_id'],
                                 ondelete='SET NULL')


def downgrade() -> None:
    with op.batch_alter_table('diagnoses') as batch:
        batch.drop_constraint('fk_diagnoses_retake_of', type_='foreignkey')
        batch.drop_index('ix_diagnoses_retake_of')
        batch.drop_column('retake_of')
