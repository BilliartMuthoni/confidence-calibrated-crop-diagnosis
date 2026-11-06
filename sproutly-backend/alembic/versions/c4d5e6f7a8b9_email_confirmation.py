"""Email confirmation at sign-up

A farmer who signs up or signs in with an email now confirms it with a 6-digit code sent there
before the authenticator step (t08). users.email_verified_at records when; the code is kept only
as a keyed hash with its expiry, wrong tries, when it was sent (60 s between codes) and how many
were sent that day (at most 10).

Staff accounts (made by an administrator) and accounts joined to Google (Google confirmed the
email) count as confirmed from now on. Existing email farmers stay unconfirmed and confirm at
their next sign-in.

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a8
Create Date: 2026-11-05 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users') as batch:
        batch.add_column(sa.Column('email_verified_at', sa.DateTime(), nullable=True))
        batch.add_column(sa.Column('email_code_hash', sa.String(), nullable=True))
        batch.add_column(sa.Column('email_code_expires', sa.DateTime(), nullable=True))
        batch.add_column(sa.Column('email_code_tries', sa.Integer(), nullable=False, server_default='0'))
        batch.add_column(sa.Column('email_code_sent_at', sa.DateTime(), nullable=True))
        batch.add_column(sa.Column('email_codes_day', sa.Date(), nullable=True))
        batch.add_column(sa.Column('email_codes_today', sa.Integer(), nullable=False, server_default='0'))
    op.execute(
        "UPDATE users SET email_verified_at = CURRENT_TIMESTAMP "
        "WHERE user_email IS NOT NULL AND (role <> 'farmer' OR google_id IS NOT NULL)"
    )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users') as batch:
        batch.drop_column('email_codes_today')
        batch.drop_column('email_codes_day')
        batch.drop_column('email_code_sent_at')
        batch.drop_column('email_code_tries')
        batch.drop_column('email_code_expires')
        batch.drop_column('email_code_hash')
        batch.drop_column('email_verified_at')
