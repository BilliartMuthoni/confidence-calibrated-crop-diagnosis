"""Support contacts: what kind of number is shown, and consent for personal mobiles

A contact's number is now an office line, hotline, business line or a personal mobile; a
personal mobile is shown to farmers only with that person's consent, recorded with the date
and the admin who recorded it (Data Protection Act 2019, s.30 and s.32: consent for a stated
purpose, which the controller must be able to prove). Existing contacts become office lines.

Revision ID: f6c9d2e3b4a5
Revises: e5b8c1d2a3f4
Create Date: 2026-10-19 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6c9d2e3b4a5'
down_revision: Union[str, Sequence[str], None] = 'e5b8c1d2a3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

phone_type = sa.Enum('office', 'hotline', 'business', 'personal', name='phone_type')


def upgrade() -> None:
    """Upgrade schema."""
    phone_type.create(op.get_bind(), checkfirst=True)
    with op.batch_alter_table('support_contacts') as batch:
        batch.add_column(sa.Column('phone_type', phone_type, server_default='office', nullable=False))
        batch.add_column(sa.Column('personal_consent_on', sa.DateTime(), nullable=True))
        batch.add_column(sa.Column('personal_consent_by_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_support_contacts_consent_by', 'users', ['personal_consent_by_id'], ['user_id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('support_contacts') as batch:
        batch.drop_constraint('fk_support_contacts_consent_by', type_='foreignkey')
        batch.drop_column('personal_consent_by_id')
        batch.drop_column('personal_consent_on')
        batch.drop_column('phone_type')
    phone_type.drop(op.get_bind(), checkfirst=True)
