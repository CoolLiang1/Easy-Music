"""add track cover search version

Revision ID: 20261106_0017
Revises: 20261104_0016
Create Date: 2026-11-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261106_0017"
down_revision: str | Sequence[str] | None = "20261104_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tracks", sa.Column("cover_search_version", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("tracks", "cover_search_version")
