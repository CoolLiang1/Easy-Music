from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TrackAiResearch(Base):
    __tablename__ = "track_ai_research"

    id: Mapped[int] = mapped_column(primary_key=True)
    track_id: Mapped[int] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"),
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    query: Mapped[str] = mapped_column(String(500))
    provider: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(50), index=True)
    results_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    error_message: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class TrackAiAnalysis(Base):
    __tablename__ = "track_ai_analysis"

    id: Mapped[int] = mapped_column(primary_key=True)
    track_id: Mapped[int] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"),
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    research_id: Mapped[int | None] = mapped_column(
        ForeignKey("track_ai_research.id", ondelete="SET NULL"),
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(50), index=True)
    summary: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    existing_tag_suggestions_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    new_tag_suggestions_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    playlist_suggestions_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )
