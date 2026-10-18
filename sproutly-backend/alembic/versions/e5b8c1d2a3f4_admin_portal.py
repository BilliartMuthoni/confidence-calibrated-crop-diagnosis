"""Admin portal: referrals, county contacts, advice library, audit log, staff security

Adds what the admin and officer portal needs: staff names and counties, lockout and
last sign-in on users; the model's class, crop share and the farmer's sharing choices
on diagnoses; and tables for referrals, support contacts, advice entries with their
versions, the audit log, backup codes and one-time staff links.

Revision ID: e5b8c1d2a3f4
Revises: d4f2a6b19e07
Create Date: 2026-10-18 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5b8c1d2a3f4'
down_revision: Union[str, Sequence[str], None] = 'd4f2a6b19e07'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

referral_status = sa.Enum('new', 'in_review', 'answered', 'expired', name='referral_status')
contact_kind = sa.Enum('office', 'clinic', 'agrovet', 'hotline', name='contact_kind')
advice_kind = sa.Enum('treatment', 'prevention', name='advice_kind')
advice_status = sa.Enum('active', 'retired', name='advice_status')


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('full_name', sa.String(), nullable=True))
    op.add_column('users', sa.Column('county', sa.String(), nullable=True))
    op.create_index(op.f('ix_users_county'), 'users', ['county'], unique=False)
    op.add_column('users', sa.Column('failed_attempts', sa.Integer(), server_default='0', nullable=False))
    op.add_column('users', sa.Column('locked_until', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('last_sign_in', sa.DateTime(), nullable=True))

    op.add_column('diagnoses', sa.Column('top_class', sa.String(), nullable=True))
    op.add_column('diagnoses', sa.Column('crop_probability', sa.Float(), nullable=True))
    op.add_column('diagnoses', sa.Column('share_with_officer', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column('diagnoses', sa.Column('allow_contact', sa.Boolean(), server_default=sa.false(), nullable=False))

    op.create_table(
        'referrals',
        sa.Column('referral_id', sa.Integer(), nullable=False),
        sa.Column('diagnosis_id', sa.Integer(), nullable=False),
        sa.Column('county', sa.String(), nullable=True),
        sa.Column('status', referral_status, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('claimed_by_id', sa.Integer(), nullable=True),
        sa.Column('claimed_at', sa.DateTime(), nullable=True),
        sa.Column('judgement', sa.String(), nullable=True),
        sa.Column('judged_at', sa.DateTime(), nullable=True),
        sa.Column('reply_text', sa.Text(), nullable=True),
        sa.Column('reply_advice', sa.JSON(), nullable=True),
        sa.Column('replied_by_id', sa.Integer(), nullable=True),
        sa.Column('replied_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['diagnosis_id'], ['diagnoses.diagnosis_id']),
        sa.ForeignKeyConstraint(['claimed_by_id'], ['users.user_id']),
        sa.ForeignKeyConstraint(['replied_by_id'], ['users.user_id']),
        sa.PrimaryKeyConstraint('referral_id'),
        sa.UniqueConstraint('diagnosis_id'),
    )
    op.create_index(op.f('ix_referrals_referral_id'), 'referrals', ['referral_id'], unique=False)
    op.create_index(op.f('ix_referrals_county'), 'referrals', ['county'], unique=False)
    op.create_index(op.f('ix_referrals_status'), 'referrals', ['status'], unique=False)

    op.create_table(
        'support_contacts',
        sa.Column('contact_id', sa.Integer(), nullable=False),
        sa.Column('county', sa.String(), nullable=False),
        sa.Column('kind', contact_kind, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('organisation', sa.String(), nullable=False),
        sa.Column('phone', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('hours', sa.String(), nullable=False),
        sa.Column('checked_on', sa.DateTime(), nullable=False),
        sa.Column('active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.PrimaryKeyConstraint('contact_id'),
    )
    op.create_index(op.f('ix_support_contacts_contact_id'), 'support_contacts', ['contact_id'], unique=False)
    op.create_index(op.f('ix_support_contacts_county'), 'support_contacts', ['county'], unique=False)

    op.create_table(
        'advice_entries',
        sa.Column('advice_id', sa.Integer(), nullable=False),
        sa.Column('disease', sa.String(), nullable=False),
        sa.Column('kind', advice_kind, nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('source_title', sa.String(), nullable=False),
        sa.Column('source_url', sa.String(), nullable=False),
        sa.Column('licence', sa.String(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('status', advice_status, nullable=False),
        sa.PrimaryKeyConstraint('advice_id'),
    )
    op.create_index(op.f('ix_advice_entries_advice_id'), 'advice_entries', ['advice_id'], unique=False)
    op.create_index(op.f('ix_advice_entries_disease'), 'advice_entries', ['disease'], unique=False)

    op.create_table(
        'advice_versions',
        sa.Column('version_id', sa.Integer(), nullable=False),
        sa.Column('advice_id', sa.Integer(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('note', sa.String(), nullable=False),
        sa.Column('saved_by_id', sa.Integer(), nullable=True),
        sa.Column('saved_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['advice_id'], ['advice_entries.advice_id']),
        sa.ForeignKeyConstraint(['saved_by_id'], ['users.user_id']),
        sa.PrimaryKeyConstraint('version_id'),
    )
    op.create_index(op.f('ix_advice_versions_advice_id'), 'advice_versions', ['advice_id'], unique=False)

    op.create_table(
        'audit_log',
        sa.Column('entry_id', sa.Integer(), nullable=False),
        sa.Column('at', sa.DateTime(), nullable=False),
        sa.Column('actor_id', sa.Integer(), nullable=True),
        sa.Column('actor_label', sa.String(), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('target', sa.String(), nullable=False),
        sa.Column('detail', sa.String(), nullable=False),
        sa.Column('ip', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['actor_id'], ['users.user_id']),
        sa.PrimaryKeyConstraint('entry_id'),
    )
    op.create_index(op.f('ix_audit_log_at'), 'audit_log', ['at'], unique=False)
    op.create_index(op.f('ix_audit_log_action'), 'audit_log', ['action'], unique=False)

    op.create_table(
        'backup_codes',
        sa.Column('code_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('code_hash', sa.String(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id']),
        sa.PrimaryKeyConstraint('code_id'),
    )
    op.create_index(op.f('ix_backup_codes_user_id'), 'backup_codes', ['user_id'], unique=False)

    op.create_table(
        'staff_links',
        sa.Column('link_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(), nullable=False),
        sa.Column('purpose', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id']),
        sa.PrimaryKeyConstraint('link_id'),
        sa.UniqueConstraint('token_hash'),
    )
    op.create_index(op.f('ix_staff_links_user_id'), 'staff_links', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_staff_links_user_id'), table_name='staff_links')
    op.drop_table('staff_links')
    op.drop_index(op.f('ix_backup_codes_user_id'), table_name='backup_codes')
    op.drop_table('backup_codes')
    op.drop_index(op.f('ix_audit_log_action'), table_name='audit_log')
    op.drop_index(op.f('ix_audit_log_at'), table_name='audit_log')
    op.drop_table('audit_log')
    op.drop_index(op.f('ix_advice_versions_advice_id'), table_name='advice_versions')
    op.drop_table('advice_versions')
    op.drop_index(op.f('ix_advice_entries_disease'), table_name='advice_entries')
    op.drop_index(op.f('ix_advice_entries_advice_id'), table_name='advice_entries')
    op.drop_table('advice_entries')
    op.drop_index(op.f('ix_support_contacts_county'), table_name='support_contacts')
    op.drop_index(op.f('ix_support_contacts_contact_id'), table_name='support_contacts')
    op.drop_table('support_contacts')
    op.drop_index(op.f('ix_referrals_status'), table_name='referrals')
    op.drop_index(op.f('ix_referrals_county'), table_name='referrals')
    op.drop_index(op.f('ix_referrals_referral_id'), table_name='referrals')
    op.drop_table('referrals')
    for enum_type in (advice_status, advice_kind, contact_kind, referral_status):
        enum_type.drop(op.get_bind(), checkfirst=True)

    op.drop_column('diagnoses', 'allow_contact')
    op.drop_column('diagnoses', 'share_with_officer')
    op.drop_column('diagnoses', 'crop_probability')
    op.drop_column('diagnoses', 'top_class')

    op.drop_column('users', 'last_sign_in')
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'failed_attempts')
    op.drop_index(op.f('ix_users_county'), table_name='users')
    op.drop_column('users', 'county')
    op.drop_column('users', 'full_name')
