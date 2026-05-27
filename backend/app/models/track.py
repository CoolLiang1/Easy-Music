from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255))
    artist: Mapped[str | None] = mapped_column(String(255))
    album: Mapped[str | None] = mapped_column(String(255))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    content_type: Mapped[str] = mapped_column(String(50), default="song")
    original_file_path: Mapped[str | None] = mapped_column(String(1024))
    playback_file_path: Mapped[str | None] = mapped_column(String(1024))
    cover_path: Mapped[str | None] = mapped_column(String(1024))
    source_url: Mapped[str | None] = mapped_column(String(2048))
    format: Mapped[str | None] = mapped_column(String(50))
    bitrate: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(50), default="uploading")
    liked: Mapped[bool] = mapped_column(Boolean, default=False)
    cooldown_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
