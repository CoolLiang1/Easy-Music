"""Single-track AI organization service for V2.5."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.playlist import Playlist, PlaylistTrack
from app.models.tag import Tag
from app.models.track import Track
from app.models.track_ai_organization import TrackAiAnalysis, TrackAiResearch
from app.models.user import User
from app.schemas.ai import (
    AiProviderStatus,
    TrackOrganizationAiOutput,
    TrackOrganizationAnalysisResponse,
    TrackOrganizationExistingTagSuggestion,
    TrackOrganizationNewTagSuggestion,
    TrackOrganizationPlaylistSuggestion,
    TrackOrganizationResearchResponse,
    TrackOrganizationResponse,
)
from app.schemas.ai_search import (
    AiSearchProviderStatus,
    AiSearchRequest,
    AiSearchResult,
)
from app.services import ai_track_organization_cache as cache_service
from app.services.ai_json import STRUCTURED_JSON_MAX_TOKENS, complete_and_parse_json
from app.services.ai_provider import AiProviderService
from app.services.ai_search_provider import (
    SUPPORTED_SEARCH_PROVIDER,
    AiSearchProviderService,
)

_VALID_GROUPS: frozenset[str] = frozenset({"scene", "type", "feature"})


def organize_track(
    db: Session,
    user: User,
    ai_provider: AiProviderService,
    search_provider: AiSearchProviderService,
    track_id: int,
    *,
    force_refresh_search: bool = False,
    force_reanalyze: bool = False,
    search_cache_days: int = 30,
) -> TrackOrganizationResponse:
    track = db.scalar(select(Track).where(Track.id == track_id, Track.user_id == user.id))
    if track is None:
        raise TrackOrganizationNotFoundError("Track not found.")

    now = datetime.now(timezone.utc)
    research_status = search_provider.status
    research_error_message: str | None = None
    research = cache_service.get_latest_usable_research(
        db,
        user=user,
        track=track,
        now=now,
    )
    refreshed_search = False

    if force_refresh_search or research is None:
        if search_provider.status == AiSearchProviderStatus.OK:
            search_result = search_provider.search(
                AiSearchRequest(
                    query=_build_search_query(track),
                    max_results=10,
                )
            )
            research_status = search_result.provider_status
            research_error_message = search_result.error_message
            fetched_at = now
            expires_at = now + timedelta(days=search_cache_days)
            research = cache_service.create_research_record(
                db,
                user=user,
                track=track,
                query=search_result.query or _build_search_query(track),
                provider=search_result.provider or SUPPORTED_SEARCH_PROVIDER,
                status=search_result.provider_status.value,
                results=[item.model_dump() for item in search_result.results],
                error_message=search_result.error_message,
                fetched_at=fetched_at,
                expires_at=expires_at,
            )
            refreshed_search = True
        else:
            research_status = search_provider.status
            research_error_message = _search_unavailable_message(research_status)
            research = None
    elif research is not None:
        research_status = AiSearchProviderStatus.OK

    latest_analysis = cache_service.get_latest_analysis(db, user=user, track=track)
    should_analyze = force_reanalyze or refreshed_search or latest_analysis is None

    if not should_analyze and latest_analysis is not None:
        return TrackOrganizationResponse(
            track_id=track.id,
            research_status=research_status,
            analysis_status=_analysis_status(latest_analysis.status),
            research=_research_response(research),
            analysis=_analysis_response(latest_analysis),
            research_error_message=research_error_message,
            analysis_error_message=latest_analysis.error_message,
        )

    ai_output, completion_result, parse_error = complete_and_parse_json(
        ai_provider,
        _build_analysis_prompt(
            db,
            user,
            track,
            research,
            search_status=research_status,
        ),
        TrackOrganizationAiOutput,
        system_instruction=(
            "Organize one track only. Suggest existing tag ids only from the "
            "provided tag catalogue. Suggest playlist ids only from the "
            "provided playlist catalogue. New tag groups must be only scene, "
            "type, or feature. Do not suggest creating playlists. Do not use "
            "lyrics, scraping, or recommendation scoring."
        ),
        max_tokens=STRUCTURED_JSON_MAX_TOKENS,
        temperature=0.2,
    )
    analysis_status = completion_result.provider_status

    if analysis_status in (AiProviderStatus.DISABLED, AiProviderStatus.UNCONFIGURED):
        return TrackOrganizationResponse(
            track_id=track.id,
            research_status=research_status,
            analysis_status=analysis_status,
            research=_research_response(research),
            analysis=_analysis_response(latest_analysis),
            research_error_message=research_error_message,
            analysis_error_message=completion_result.error_message,
        )

    if ai_output is None:
        analysis = cache_service.create_analysis_record(
            db,
            user=user,
            track=track,
            research=research,
            provider="openai-compatible",
            model=completion_result.model,
            status=AiProviderStatus.ERROR.value,
            summary=None,
            confidence=None,
            existing_tag_suggestions=[],
            new_tag_suggestions=[],
            playlist_suggestions=[],
            error_message=(
                parse_error
                or completion_result.error_message
                or "AI organization analysis failed."
            ),
        )
        return TrackOrganizationResponse(
            track_id=track.id,
            research_status=research_status,
            analysis_status=AiProviderStatus.ERROR,
            research=_research_response(research),
            analysis=_analysis_response(analysis),
            research_error_message=research_error_message,
            analysis_error_message=analysis.error_message,
        )

    tags = _load_tag_catalogue(db, user)
    playlists = _load_playlist_catalogue(db, user)
    existing_suggestions = _clean_existing_tag_suggestions(ai_output, tags)
    new_suggestions = _clean_new_tag_suggestions(ai_output)
    playlist_suggestions = _clean_playlist_suggestions(ai_output, playlists)

    analysis = cache_service.create_analysis_record(
        db,
        user=user,
        track=track,
        research=research,
        provider="openai-compatible",
        model=completion_result.model,
        status=AiProviderStatus.OK.value,
        summary=ai_output.summary,
        confidence=ai_output.confidence,
        existing_tag_suggestions=[item.model_dump() for item in existing_suggestions],
        new_tag_suggestions=[item.model_dump() for item in new_suggestions],
        playlist_suggestions=[item.model_dump() for item in playlist_suggestions],
        error_message=None,
    )

    return TrackOrganizationResponse(
        track_id=track.id,
        research_status=research_status,
        analysis_status=AiProviderStatus.OK,
        research=_research_response(research),
        analysis=_analysis_response(analysis),
        research_error_message=research_error_message,
        analysis_error_message=None,
    )


class TrackOrganizationNotFoundError(LookupError):
    pass


def _build_search_query(track: Track) -> str:
    parts = [track.title, track.artist, track.album]
    if track.original_file_path:
        basename = os.path.basename(track.original_file_path)
        if basename:
            parts.append(os.path.splitext(basename)[0])
    query = " ".join(part.strip() for part in parts if part and part.strip())
    return query[:500] or f"track {track.id}"


def _build_analysis_prompt(
    db: Session,
    user: User,
    track: Track,
    research: TrackAiResearch | None,
    *,
    search_status: AiSearchProviderStatus,
) -> str:
    tags = _load_tag_catalogue(db, user)
    playlists = _load_playlist_catalogue(db, user)
    lines: list[str] = ["Track metadata:"]
    lines.append(f"  title: {track.title}")
    if track.artist:
        lines.append(f"  artist: {track.artist}")
    if track.album:
        lines.append(f"  album: {track.album}")
    lines.append(f"  content_type: {track.content_type}")
    if track.source_url:
        lines.append(f"  source_url: {track.source_url}")
    if track.original_file_path:
        basename = os.path.basename(track.original_file_path)
        if basename:
            lines.append(f"  original_filename: {basename}")

    lines.append("")
    lines.append(f"Search status: {search_status.value}")
    if research is None:
        lines.append("Search summary: none")
    else:
        lines.append(f"Search query: {research.query}")
        lines.append(f"Search provider: {research.provider}")
        if not research.results_json:
            lines.append("Search results: none")
        else:
            lines.append("Search results:")
            for item in research.results_json:
                lines.append(f"  title: {item.get('title', '')}")
                lines.append(f"  snippet: {item.get('snippet', '')}")
                lines.append(f"  url: {item.get('url', '')}")

    lines.append("")
    if not tags:
        lines.append("Tag catalogue: none")
    else:
        lines.append("Tag catalogue (use only these ids for existing tags):")
        for tag in tags:
            lines.append(f"  [{tag.group}] tag_id:{tag.id} {tag.name}")

    lines.append("")
    if not playlists:
        lines.append("Playlist catalogue: none")
    else:
        lines.append("Playlist catalogue (suggest only these playlist ids):")
        for playlist in playlists:
            description = playlist["description"] or ""
            lines.append(
                "  "
                f"playlist_id:{playlist['id']} {playlist['name']} "
                f"tracks:{playlist['track_count']} description:{description}",
            )

    lines.append("")
    lines.append(
        "Return existing_tag_suggestions, new_tag_suggestions, "
        "playlist_suggestions, summary, and confidence. New tag suggestions "
        "must use only scene, type, or feature. Suggest joining existing "
        "playlists only; do not suggest playlist creation."
    )
    return "\n".join(lines)


def _load_tag_catalogue(db: Session, user: User) -> list[Tag]:
    return list(
        db.scalars(
            select(Tag)
            .where(Tag.user_id == user.id, Tag.group.in_(_VALID_GROUPS))
            .order_by(Tag.group, Tag.created_at, Tag.id),
        )
    )


def _load_playlist_catalogue(db: Session, user: User) -> list[dict]:
    rows = list(
        db.execute(
            select(Playlist, func.count(PlaylistTrack.track_id))
            .outerjoin(PlaylistTrack, PlaylistTrack.playlist_id == Playlist.id)
            .where(Playlist.user_id == user.id)
            .group_by(Playlist.id)
            .order_by(Playlist.created_at, Playlist.id),
        )
    )
    return [
        {
            "id": playlist.id,
            "name": playlist.name,
            "description": playlist.description,
            "track_count": track_count or 0,
        }
        for playlist, track_count in rows
    ]


def _clean_existing_tag_suggestions(
    ai_output: TrackOrganizationAiOutput,
    tags: list[Tag],
) -> list[TrackOrganizationExistingTagSuggestion]:
    tags_by_id = {tag.id: tag for tag in tags}
    result: list[TrackOrganizationExistingTagSuggestion] = []
    seen: set[int] = set()
    for suggestion in ai_output.existing_tag_suggestions:
        tag = tags_by_id.get(suggestion.tag_id)
        if tag is None or tag.id in seen or tag.group not in _VALID_GROUPS:
            continue
        seen.add(tag.id)
        result.append(
            TrackOrganizationExistingTagSuggestion(
                tag_id=tag.id,
                name=tag.name,
                group=tag.group,
                confidence=suggestion.confidence,
                reason=suggestion.reason,
            )
        )
    return result


def _clean_new_tag_suggestions(
    ai_output: TrackOrganizationAiOutput,
) -> list[TrackOrganizationNewTagSuggestion]:
    result: list[TrackOrganizationNewTagSuggestion] = []
    seen: set[tuple[str, str]] = set()
    for suggestion in ai_output.new_tag_suggestions:
        if suggestion.group not in _VALID_GROUPS:
            continue
        name = suggestion.name.strip()
        if not name:
            continue
        key = (suggestion.group, name.casefold())
        if key in seen:
            continue
        seen.add(key)
        result.append(
            TrackOrganizationNewTagSuggestion(
                name=name,
                group=suggestion.group,
                confidence=suggestion.confidence,
                reason=suggestion.reason,
            )
        )
    return result


def _clean_playlist_suggestions(
    ai_output: TrackOrganizationAiOutput,
    playlists: list[dict],
) -> list[TrackOrganizationPlaylistSuggestion]:
    playlists_by_id = {playlist["id"]: playlist for playlist in playlists}
    result: list[TrackOrganizationPlaylistSuggestion] = []
    seen: set[int] = set()
    for suggestion in ai_output.playlist_suggestions:
        playlist = playlists_by_id.get(suggestion.playlist_id)
        if playlist is None or playlist["id"] in seen:
            continue
        seen.add(playlist["id"])
        result.append(
            TrackOrganizationPlaylistSuggestion(
                playlist_id=playlist["id"],
                name=playlist["name"],
                description=playlist["description"],
                track_count=playlist["track_count"],
                confidence=suggestion.confidence,
                reason=suggestion.reason,
            )
        )
    return result


def _research_response(
    research: TrackAiResearch | None,
) -> TrackOrganizationResearchResponse | None:
    if research is None:
        return None
    return TrackOrganizationResearchResponse(
        id=research.id,
        query=research.query,
        provider=research.provider,
        status=_search_status(research.status),
        results=[AiSearchResult.model_validate(item) for item in research.results_json],
        error_message=research.error_message,
        fetched_at=research.fetched_at.isoformat(),
        expires_at=research.expires_at.isoformat(),
    )


def _analysis_response(
    analysis: TrackAiAnalysis | None,
) -> TrackOrganizationAnalysisResponse | None:
    if analysis is None:
        return None
    return TrackOrganizationAnalysisResponse(
        id=analysis.id,
        research_id=analysis.research_id,
        provider=analysis.provider,
        model=analysis.model,
        status=_analysis_status(analysis.status),
        summary=analysis.summary,
        confidence=analysis.confidence,
        existing_tag_suggestions=[
            TrackOrganizationExistingTagSuggestion.model_validate(item)
            for item in analysis.existing_tag_suggestions_json
        ],
        new_tag_suggestions=[
            TrackOrganizationNewTagSuggestion.model_validate(item)
            for item in analysis.new_tag_suggestions_json
        ],
        playlist_suggestions=[
            TrackOrganizationPlaylistSuggestion.model_validate(item)
            for item in analysis.playlist_suggestions_json
        ],
        error_message=analysis.error_message,
        created_at=analysis.created_at.isoformat(),
    )


def _search_status(value: str) -> AiSearchProviderStatus:
    try:
        return AiSearchProviderStatus(value)
    except ValueError:
        return AiSearchProviderStatus.ERROR


def _analysis_status(value: str) -> AiProviderStatus:
    try:
        return AiProviderStatus(value)
    except ValueError:
        return AiProviderStatus.ERROR


def _search_unavailable_message(status: AiSearchProviderStatus) -> str:
    if status == AiSearchProviderStatus.DISABLED:
        return "AI search provider is disabled."
    if status == AiSearchProviderStatus.UNCONFIGURED:
        return "AI search provider is not fully configured."
    return "AI search provider is unavailable."
