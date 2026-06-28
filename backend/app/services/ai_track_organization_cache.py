"""Persistence helpers for single-track AI organization research and analysis."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.track import Track
from app.models.track_ai_organization import TrackAiAnalysis, TrackAiResearch
from app.models.user import User


def create_research_record(
    db: Session,
    *,
    user: User,
    track: Track,
    query: str,
    provider: str,
    status: str,
    results: list[dict[str, Any]],
    error_message: str | None,
    fetched_at: datetime,
    expires_at: datetime,
) -> TrackAiResearch:
    research = TrackAiResearch(
        user_id=user.id,
        track_id=track.id,
        query=query,
        provider=provider,
        status=status,
        results_json=results,
        error_message=error_message,
        fetched_at=fetched_at,
        expires_at=expires_at,
    )
    db.add(research)
    db.commit()
    db.refresh(research)
    return research


def get_latest_research(
    db: Session,
    *,
    user: User,
    track: Track,
) -> TrackAiResearch | None:
    return db.scalar(
        select(TrackAiResearch)
        .where(
            TrackAiResearch.user_id == user.id,
            TrackAiResearch.track_id == track.id,
        )
        .order_by(TrackAiResearch.fetched_at.desc(), TrackAiResearch.id.desc())
        .limit(1)
    )


def get_latest_usable_research(
    db: Session,
    *,
    user: User,
    track: Track,
    now: datetime | None = None,
) -> TrackAiResearch | None:
    lookup_time = _as_utc(now or datetime.now(timezone.utc))
    records = list(
        db.scalars(
            select(TrackAiResearch)
            .where(
                TrackAiResearch.user_id == user.id,
                TrackAiResearch.track_id == track.id,
                TrackAiResearch.status == "ok",
            )
            .order_by(TrackAiResearch.fetched_at.desc(), TrackAiResearch.id.desc())
        )
    )
    for record in records:
        expires_at = _as_utc(record.expires_at)
        if expires_at is not None and expires_at > lookup_time:
            return record
    return None


def create_analysis_record(
    db: Session,
    *,
    user: User,
    track: Track,
    research: TrackAiResearch | None,
    provider: str,
    model: str | None,
    status: str,
    summary: str | None,
    confidence: float | None,
    existing_tag_suggestions: list[dict[str, Any]],
    new_tag_suggestions: list[dict[str, Any]],
    playlist_suggestions: list[dict[str, Any]],
    error_message: str | None,
) -> TrackAiAnalysis:
    analysis = TrackAiAnalysis(
        user_id=user.id,
        track_id=track.id,
        research_id=research.id if research is not None else None,
        provider=provider,
        model=model,
        status=status,
        summary=summary,
        confidence=confidence,
        existing_tag_suggestions_json=existing_tag_suggestions,
        new_tag_suggestions_json=new_tag_suggestions,
        playlist_suggestions_json=playlist_suggestions,
        error_message=error_message,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


def get_latest_analysis(
    db: Session,
    *,
    user: User,
    track: Track,
) -> TrackAiAnalysis | None:
    return db.scalar(
        select(TrackAiAnalysis)
        .where(
            TrackAiAnalysis.user_id == user.id,
            TrackAiAnalysis.track_id == track.id,
        )
        .order_by(TrackAiAnalysis.created_at.desc(), TrackAiAnalysis.id.desc())
        .limit(1)
    )


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
