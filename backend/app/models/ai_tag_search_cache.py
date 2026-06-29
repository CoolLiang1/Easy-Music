from datetime import datetime

from sqlalchemy import DateTime, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AiTagSearchCache(Base):
    __tablename__ = "ai_tag_search_cache"
    __table_args__ = (
        UniqueConstraint("provider", "query", name="uq_ai_tag_search_provider_query"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(50), index=True)
    query: Mapped[str] = mapped_column(String(500), index=True)
    status: Mapped[str] = mapped_column(String(50))
    results_json: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    searched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
