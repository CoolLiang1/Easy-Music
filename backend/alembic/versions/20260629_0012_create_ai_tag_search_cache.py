"""create ai tag search cache

Revision ID: 20260629_0012
Revises: 20260628_0011
Create Date: 2026-06-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260629_0012"
down_revision: str | Sequence[str] | None = "20260628_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_tag_search_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("query", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("results_json", sa.JSON(), nullable=False),
        sa.Column("searched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "query", name="uq_ai_tag_search_provider_query"),
    )
    op.create_index("ix_ai_tag_search_cache_provider", "ai_tag_search_cache", ["provider"])
    op.create_index("ix_ai_tag_search_cache_query", "ai_tag_search_cache", ["query"])
    op.create_index(
        "ix_ai_tag_search_cache_searched_at",
        "ai_tag_search_cache",
        ["searched_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_tag_search_cache_searched_at", table_name="ai_tag_search_cache")
    op.drop_index("ix_ai_tag_search_cache_query", table_name="ai_tag_search_cache")
    op.drop_index("ix_ai_tag_search_cache_provider", table_name="ai_tag_search_cache")
    op.drop_table("ai_tag_search_cache")
