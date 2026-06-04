"""add duplicate signals to tracks

Revision ID: 20260604_0006
Revises: 20260529_0005
Create Date: 2026-06-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260604_0006"
down_revision: str | Sequence[str] | None = "20260529_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tracks",
        sa.Column("original_file_size_bytes", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "tracks",
        sa.Column("original_file_sha256", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "tracks",
        sa.Column("playback_file_sha256", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "tracks",
        sa.Column("normalized_metadata_key", sa.String(length=1024), nullable=True),
    )
    op.create_index(
        op.f("ix_tracks_original_file_sha256"),
        "tracks",
        ["original_file_sha256"],
        unique=False,
    )
    op.create_index(
        op.f("ix_tracks_playback_file_sha256"),
        "tracks",
        ["playback_file_sha256"],
        unique=False,
    )
    op.create_index(
        op.f("ix_tracks_normalized_metadata_key"),
        "tracks",
        ["normalized_metadata_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_tracks_normalized_metadata_key"), table_name="tracks")
    op.drop_index(op.f("ix_tracks_playback_file_sha256"), table_name="tracks")
    op.drop_index(op.f("ix_tracks_original_file_sha256"), table_name="tracks")
    op.drop_column("tracks", "normalized_metadata_key")
    op.drop_column("tracks", "playback_file_sha256")
    op.drop_column("tracks", "original_file_sha256")
    op.drop_column("tracks", "original_file_size_bytes")
