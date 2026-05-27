"""create processing jobs table

Revision ID: 20260527_0003
Revises: 20260527_0002
Create Date: 2026-05-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260527_0003"
down_revision: str | Sequence[str] | None = "20260527_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "processing_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("track_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_processing_jobs_status"),
        "processing_jobs",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_processing_jobs_track_id"),
        "processing_jobs",
        ["track_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_processing_jobs_track_id"), table_name="processing_jobs")
    op.drop_index(op.f("ix_processing_jobs_status"), table_name="processing_jobs")
    op.drop_table("processing_jobs")
