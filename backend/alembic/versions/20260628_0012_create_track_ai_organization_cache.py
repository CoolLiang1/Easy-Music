"""create track ai organization cache tables

Revision ID: 20260628_0012
Revises: 20260628_0011
Create Date: 2026-06-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260628_0012"
down_revision: str | Sequence[str] | None = "20260628_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "track_ai_research",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("track_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("query", sa.String(length=500), nullable=False),
        sa.Column("provider", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("results_json", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_track_ai_research_expires_at"),
        "track_ai_research",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_track_ai_research_fetched_at"),
        "track_ai_research",
        ["fetched_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_track_ai_research_status"),
        "track_ai_research",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_track_ai_research_track_id"),
        "track_ai_research",
        ["track_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_track_ai_research_user_id"),
        "track_ai_research",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "track_ai_analysis",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("track_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("research_id", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(length=100), nullable=False),
        sa.Column("model", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("existing_tag_suggestions_json", sa.JSON(), nullable=False),
        sa.Column("new_tag_suggestions_json", sa.JSON(), nullable=False),
        sa.Column("playlist_suggestions_json", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["research_id"], ["track_ai_research.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_track_ai_analysis_created_at"),
        "track_ai_analysis",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_track_ai_analysis_research_id"),
        "track_ai_analysis",
        ["research_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_track_ai_analysis_status"),
        "track_ai_analysis",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_track_ai_analysis_track_id"),
        "track_ai_analysis",
        ["track_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_track_ai_analysis_user_id"),
        "track_ai_analysis",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_track_ai_analysis_user_id"), table_name="track_ai_analysis")
    op.drop_index(op.f("ix_track_ai_analysis_track_id"), table_name="track_ai_analysis")
    op.drop_index(op.f("ix_track_ai_analysis_status"), table_name="track_ai_analysis")
    op.drop_index(op.f("ix_track_ai_analysis_research_id"), table_name="track_ai_analysis")
    op.drop_index(op.f("ix_track_ai_analysis_created_at"), table_name="track_ai_analysis")
    op.drop_table("track_ai_analysis")

    op.drop_index(op.f("ix_track_ai_research_user_id"), table_name="track_ai_research")
    op.drop_index(op.f("ix_track_ai_research_track_id"), table_name="track_ai_research")
    op.drop_index(op.f("ix_track_ai_research_status"), table_name="track_ai_research")
    op.drop_index(op.f("ix_track_ai_research_fetched_at"), table_name="track_ai_research")
    op.drop_index(op.f("ix_track_ai_research_expires_at"), table_name="track_ai_research")
    op.drop_table("track_ai_research")
