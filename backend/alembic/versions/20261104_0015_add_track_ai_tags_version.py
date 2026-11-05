"""add track ai auto-tagging version

Revision ID: 20261104_0015
Revises: 20261104_0014
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261104_0015"
down_revision: str | Sequence[str] | None = "20261104_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tracks", sa.Column("ai_tags_version", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("tracks", "ai_tags_version")
