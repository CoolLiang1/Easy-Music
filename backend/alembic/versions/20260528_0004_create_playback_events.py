"""create playback events table

Revision ID: 20260528_0004
Revises: 20260527_0003
Create Date: 2026-05-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260528_0004"
down_revision: str | Sequence[str] | None = "20260527_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "playback_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("track_id", sa.Integer(), nullable=False),
        sa.Column("client_event_id", sa.String(length=128), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("position_seconds", sa.Float(), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("client", sa.String(length=50), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "client_event_id",
            name="uq_playback_events_user_client_event",
        ),
    )
    op.create_index(
        op.f("ix_playback_events_track_id"),
        "playback_events",
        ["track_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_playback_events_user_id"),
        "playback_events",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_playback_events_user_id"), table_name="playback_events")
    op.drop_index(op.f("ix_playback_events_track_id"), table_name="playback_events")
    op.drop_table("playback_events")
