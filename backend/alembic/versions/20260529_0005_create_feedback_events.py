"""create feedback events table

Revision ID: 20260529_0005
Revises: 20260528_0004
Create Date: 2026-05-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260529_0005"
down_revision: str | Sequence[str] | None = "20260528_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feedback_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("track_id", sa.Integer(), nullable=False),
        sa.Column("client_event_id", sa.String(length=128), nullable=True),
        sa.Column("feedback_type", sa.String(length=50), nullable=False),
        sa.Column("scenario_tag_ids", sa.JSON(), nullable=True),
        sa.Column("state_tag_ids", sa.JSON(), nullable=True),
        sa.Column("type_tag_ids", sa.JSON(), nullable=True),
        sa.Column("attribute_tag_ids", sa.JSON(), nullable=True),
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
            name="uq_feedback_events_user_client_event",
        ),
    )
    op.create_index(
        op.f("ix_feedback_events_track_id"),
        "feedback_events",
        ["track_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_feedback_events_user_id"),
        "feedback_events",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_feedback_events_user_id"), table_name="feedback_events")
    op.drop_index(op.f("ix_feedback_events_track_id"), table_name="feedback_events")
    op.drop_table("feedback_events")
