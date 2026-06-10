"""create import batches

Revision ID: 20260610_0007
Revises: 20260604_0006
Create Date: 2026-06-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260610_0007"
down_revision: str | Sequence[str] | None = "20260604_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "import_batches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("root_id", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("requested_count", sa.Integer(), nullable=False),
        sa.Column("imported_count", sa.Integer(), nullable=False),
        sa.Column("skipped_count", sa.Integer(), nullable=False),
        sa.Column("failed_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_import_batches_user_id"), "import_batches", ["user_id"], unique=False)
    op.create_index(op.f("ix_import_batches_status"), "import_batches", ["status"], unique=False)

    op.create_table(
        "import_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("root_id", sa.String(length=100), nullable=False),
        sa.Column("relative_source_path", sa.String(length=2048), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("track_id", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["batch_id"], ["import_batches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_import_items_batch_id"), "import_items", ["batch_id"], unique=False)
    op.create_index(op.f("ix_import_items_user_id"), "import_items", ["user_id"], unique=False)
    op.create_index(op.f("ix_import_items_status"), "import_items", ["status"], unique=False)
    op.create_index(op.f("ix_import_items_track_id"), "import_items", ["track_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_import_items_track_id"), table_name="import_items")
    op.drop_index(op.f("ix_import_items_status"), table_name="import_items")
    op.drop_index(op.f("ix_import_items_user_id"), table_name="import_items")
    op.drop_index(op.f("ix_import_items_batch_id"), table_name="import_items")
    op.drop_table("import_items")
    op.drop_index(op.f("ix_import_batches_status"), table_name="import_batches")
    op.drop_index(op.f("ix_import_batches_user_id"), table_name="import_batches")
    op.drop_table("import_batches")
