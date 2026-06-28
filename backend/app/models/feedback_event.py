from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FeedbackEvent(Base):
    __tablename__ = "feedback_events"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "client_event_id",
            name="uq_feedback_events_user_client_event",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    track_id: Mapped[int] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"),
        index=True,
    )
    client_event_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    feedback_type: Mapped[str] = mapped_column(String(50))
    scene_tag_ids: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    type_tag_ids: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    feature_tag_ids: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    client: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
