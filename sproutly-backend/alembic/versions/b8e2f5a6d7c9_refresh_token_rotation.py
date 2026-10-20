"""Sessions that last: refresh tokens that work once

Access tokens last 15 minutes and the app had no way to renew them, so farmers were sent back
to the login screen after 15 minutes. The app now swaps its refresh token for a new pair; the
id of the one refresh token that may be used next is kept on the user, so an old one used
again (a sign it was copied) ends the session, and logging out really ends it.

Revision ID: b8e2f5a6d7c9
Revises: a7d1e4f5c6b8
Create Date: 2026-10-20 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8e2f5a6d7c9'
down_revision: Union[str, Sequence[str], None] = 'a7d1e4f5c6b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users') as batch:
        batch.add_column(sa.Column('refresh_token_id', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users') as batch:
        batch.drop_column('refresh_token_id')
