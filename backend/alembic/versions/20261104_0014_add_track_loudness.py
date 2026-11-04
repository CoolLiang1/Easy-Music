"""add track loudness normalization fields

Revision ID: 20261104_0014
Revises: 20261104_0013
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20261104_0014"
down_revision: str | Sequence[str] | None = "20261104_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tracks", sa.Column("loudness_lufs", sa.Float(), nullable=True))
    op.add_column("tracks", sa.Column("true_peak_dbtp", sa.Float(), nullable=True))
    op.add_column("tracks", sa.Column("playback_gain_db", sa.Float(), nullable=True))
    op.add_column("tracks", sa.Column("loudness_version", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("tracks", "loudness_version")
    op.drop_column("tracks", "playback_gain_db")
    op.drop_column("tracks", "true_peak_dbtp")
    op.drop_column("tracks", "loudness_lufs")
