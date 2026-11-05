from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Track-tag provenance. Owner-chosen rows use USER_TAG_SOURCE; batch AI
# auto-tagging writes AI_TAG_SOURCE rows with the AI confidence.
USER_TAG_SOURCE = "user"
AI_TAG_SOURCE = "ai"


class TrackTag(Base):
    __tablename__ = "track_tags"

    track_id: Mapped[int] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    source: Mapped[str] = mapped_column(String(50), default=USER_TAG_SOURCE)
