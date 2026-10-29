"""Saved assistant questions, with the farmer's consent

A farmer can choose to keep the questions they ask about a result ("Ask about this result")
and the replies they were shown, to read them again in Your checks. users.keep_questions is
their choice: empty until they are asked, then yes or no (Data Protection Act 2019, s.30 and
s.32: consent for a stated purpose). Nothing is kept without a yes; switching it off stops
new saving, and the saved ones can be deleted from Account, Privacy or with the account.

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
Create Date: 2026-10-29 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a8'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'assistant_turns',
        sa.Column('turn_id', sa.Integer(), nullable=False),
        sa.Column('diagnosis_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('reply', sa.JSON(), nullable=False),
        sa.Column('asked_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['diagnosis_id'], ['diagnoses.diagnosis_id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id']),
        sa.PrimaryKeyConstraint('turn_id'),
    )
    op.create_index('ix_assistant_turns_turn_id', 'assistant_turns', ['turn_id'])
    op.create_index('ix_assistant_turns_diagnosis_id', 'assistant_turns', ['diagnosis_id'])
    op.create_index('ix_assistant_turns_user_id', 'assistant_turns', ['user_id'])
    with op.batch_alter_table('users') as batch:
        batch.add_column(sa.Column('keep_questions', sa.Boolean(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users') as batch:
        batch.drop_column('keep_questions')
    op.drop_index('ix_assistant_turns_user_id', table_name='assistant_turns')
    op.drop_index('ix_assistant_turns_diagnosis_id', table_name='assistant_turns')
    op.drop_index('ix_assistant_turns_turn_id', table_name='assistant_turns')
    op.drop_table('assistant_turns')
