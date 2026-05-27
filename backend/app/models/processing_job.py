from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    track_id: Mapped[int] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"),
        index=True,
    )
    status: Mapped[str] = mapped_column(String(50), index=True, default="pending")
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
