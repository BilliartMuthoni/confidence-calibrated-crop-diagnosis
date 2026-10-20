"""Join Google to an existing password account after the owner proves it is theirs

When Google signs in someone whose email already has a password account, the Google id now
waits on the sign-in attempt (oauth_flows.link_subject) until the password and authenticator
code are given, instead of the attempt being refused.

Revision ID: a7d1e4f5c6b8
Revises: f6c9d2e3b4a5
Create Date: 2026-10-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7d1e4f5c6b8'
down_revision: Union[str, Sequence[str], None] = 'f6c9d2e3b4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('oauth_flows') as batch:
        batch.add_column(sa.Column('link_subject', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('oauth_flows') as batch:
        batch.drop_column('link_subject')
