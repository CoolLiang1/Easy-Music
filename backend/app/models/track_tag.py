from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


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
    source: Mapped[str] = mapped_column(String(50), default="user")
