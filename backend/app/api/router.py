from fastapi import APIRouter, Depends, Response
from sqlalchemy import text

from app.api.routes import (
    ai,
    auth,
    duplicates,
    feedback_events,
    playback_events,
    recommendations,
    tags,
    tracks,
    uploads,
)
from app.db.session import engine

api_router = APIRouter()
api_router.include_router(ai.router, prefix="/api")
api_router.include_router(auth.router, prefix="/api")
api_router.include_router(duplicates.router, prefix="/api")
api_router.include_router(feedback_events.router, prefix="/api")
api_router.include_router(playback_events.router, prefix="/api")
api_router.include_router(recommendations.router, prefix="/api")
api_router.include_router(tags.router, prefix="/api")
api_router.include_router(uploads.router, prefix="/api")
api_router.include_router(tracks.router, prefix="/api")


def check_database_health() -> bool:
    """Return True if the database accepts a lightweight connectivity check.

    Uses the module-level engine so failures are caught at the engine
    level even when the database is unreachable.  This callable is used
    as a FastAPI dependency so tests can override it cleanly.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@api_router.get("/health")
def health(
    response: Response,
    db_ok: bool = Depends(check_database_health),
) -> dict[str, str]:
    if not db_ok:
        response.status_code = 503
        return {"status": "unhealthy", "database": "disconnected"}
    return {"status": "healthy", "database": "connected"}
