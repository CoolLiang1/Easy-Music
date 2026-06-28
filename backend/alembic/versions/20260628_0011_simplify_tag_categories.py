"""simplify tag categories

Revision ID: 20260628_0011
Revises: 20260628_0010
Create Date: 2026-06-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "20260628_0011"
down_revision: str | Sequence[str] | None = "20260628_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("feedback_events", sa.Column("scene_tag_ids", sa.JSON(), nullable=True))
    op.add_column(
        "feedback_events",
        sa.Column("feature_tag_ids", sa.JSON(), nullable=True),
    )
    op.execute(
        'UPDATE feedback_events SET scene_tag_ids = scenario_tag_ids '
        "WHERE scenario_tag_ids IS NOT NULL",
    )
    op.execute(
        "UPDATE feedback_events SET feature_tag_ids = state_tag_ids "
        "WHERE state_tag_ids IS NOT NULL",
    )

    op.execute(
        'DELETE FROM track_tags WHERE tag_id IN '
        '(SELECT id FROM tags WHERE "group" = \'attribute\')',
    )
    op.execute('DELETE FROM tags WHERE "group" = \'attribute\'')
    op.execute('UPDATE tags SET "group" = \'scene\' WHERE "group" = \'scenario\'')
    op.execute('UPDATE tags SET "group" = \'feature\' WHERE "group" = \'state\'')


def downgrade() -> None:
    op.execute('UPDATE tags SET "group" = \'scenario\' WHERE "group" = \'scene\'')
    op.execute('UPDATE tags SET "group" = \'state\' WHERE "group" = \'feature\'')
    op.execute(
        "UPDATE feedback_events SET scenario_tag_ids = scene_tag_ids "
        "WHERE scene_tag_ids IS NOT NULL",
    )
    op.execute(
        "UPDATE feedback_events SET state_tag_ids = feature_tag_ids "
        "WHERE feature_tag_ids IS NOT NULL",
    )
    op.drop_column("feedback_events", "feature_tag_ids")
    op.drop_column("feedback_events", "scene_tag_ids")
