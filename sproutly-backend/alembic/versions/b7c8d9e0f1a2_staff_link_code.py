"""Staff set-up links need a code: staff_links.code_hash and wrong_tries

Found in testing: emailing the set-up link alone would let anyone who reads the officer's email
take the account before them. The link now goes by email and a 6-digit code is given to the
admin to pass on by phone or in person; the link works only with that code, and five wrong codes
cancel it. Links made before this change have no code and work as before until they expire.

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-11-14 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = 'a6b7c8d9e0f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('staff_links') as batch:
        batch.add_column(sa.Column('code_hash', sa.String(), nullable=True))
        batch.add_column(sa.Column('wrong_tries', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('staff_links') as batch:
        batch.drop_column('wrong_tries')
        batch.drop_column('code_hash')
