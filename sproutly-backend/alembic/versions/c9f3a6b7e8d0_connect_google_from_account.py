"""Connect Google from Account

A farmer who signed up with a phone number or password can join Google to the account from
the Account tab, after their password and authenticator code. The sign-in attempt remembers
which account started it, so the Google identity is joined to that account and no other.

Revision ID: c9f3a6b7e8d0
Revises: b8e2f5a6d7c9
Create Date: 2026-10-20 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9f3a6b7e8d0'
down_revision: Union[str, Sequence[str], None] = 'b8e2f5a6d7c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('oauth_flows') as batch:
        batch.add_column(sa.Column('connect_user_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_oauth_flows_connect_user_id', 'users', ['connect_user_id'], ['user_id'],
                                 ondelete='CASCADE')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('oauth_flows') as batch:
        batch.drop_constraint('fk_oauth_flows_connect_user_id', type_='foreignkey')
        batch.drop_column('connect_user_id')
