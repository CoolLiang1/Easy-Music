from fastapi import APIRouter

from app.api.routes import auth, feedback_events, playback_events, tags, tracks, uploads

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/api")
api_router.include_router(feedback_events.router, prefix="/api")
api_router.include_router(playback_events.router, prefix="/api")
api_router.include_router(tags.router, prefix="/api")
api_router.include_router(uploads.router, prefix="/api")
api_router.include_router(tracks.router, prefix="/api")


@api_router.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy"}
