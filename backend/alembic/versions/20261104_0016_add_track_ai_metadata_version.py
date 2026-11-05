"""add track ai metadata clean-up version

Revision ID: 20261104_0016
Revises: 20261104_0015
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261104_0016"
down_revision: str | Sequence[str] | None = "20261104_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tracks", sa.Column("ai_metadata_version", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("tracks", "ai_metadata_version")
