"""Advice kinds: about and harvest

Two new kinds of advice-library entry (t49, issue #65), chosen only by the assistant:
about (what causes the disease, how it spreads, the weather it likes) and harvest (harvest
and storage). The result screen still shows treatment and prevention only.

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-11-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite (local tests) keeps the kind as plain text: nothing to change.
    if op.get_bind().dialect.name != "postgresql":
        return
    # PostgreSQL adds enum values outside a transaction block.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE advice_kind ADD VALUE IF NOT EXISTS 'about'")
        op.execute("ALTER TYPE advice_kind ADD VALUE IF NOT EXISTS 'harvest'")


def downgrade() -> None:
    # PostgreSQL cannot drop a value from an enum: the entries of the new kinds (and their
    # history) are removed, and the two unused values stay in the type.
    op.execute("DELETE FROM advice_versions WHERE advice_id IN "
               "(SELECT advice_id FROM advice_entries WHERE CAST(kind AS VARCHAR) IN ('about', 'harvest'))")
    op.execute("DELETE FROM advice_entries WHERE CAST(kind AS VARCHAR) IN ('about', 'harvest')")
