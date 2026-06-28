"""create playlists tables

Revision ID: 20260626_0009
Revises: 20260610_0008
Create Date: 2026-06-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260626_0009"
down_revision: str | Sequence[str] | None = "20260610_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "playlists",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_playlists_user_id"), "playlists", ["user_id"], unique=False)

    op.create_table(
        "playlist_tracks",
        sa.Column("playlist_id", sa.Integer(), nullable=False),
        sa.Column("track_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["playlist_id"], ["playlists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("playlist_id", "track_id"),
    )
    op.create_index(
        op.f("ix_playlist_tracks_track_id"),
        "playlist_tracks",
        ["track_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_playlist_tracks_track_id"), table_name="playlist_tracks")
    op.drop_table("playlist_tracks")
    op.drop_index(op.f("ix_playlists_user_id"), table_name="playlists")
    op.drop_table("playlists")
