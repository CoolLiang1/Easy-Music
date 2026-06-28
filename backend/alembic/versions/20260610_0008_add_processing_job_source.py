"""add processing job source

Revision ID: 20260610_0008
Revises: 20260610_0007
Create Date: 2026-06-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260610_0008"
down_revision: str | Sequence[str] | None = "20260610_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "processing_jobs",
        sa.Column(
            "job_type",
            sa.String(length=50),
            nullable=False,
            server_default="audio_processing",
        ),
    )
    op.add_column(
        "processing_jobs",
        sa.Column("source_path", sa.String(length=1024), nullable=True),
    )
    op.create_index(
        op.f("ix_processing_jobs_job_type"),
        "processing_jobs",
        ["job_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_processing_jobs_job_type"), table_name="processing_jobs")
    op.drop_column("processing_jobs", "source_path")
    op.drop_column("processing_jobs", "job_type")
