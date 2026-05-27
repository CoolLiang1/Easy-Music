from fastapi import APIRouter

from app.api.routes import auth, tags

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/api")
api_router.include_router(tags.router, prefix="/api")


@api_router.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy"}
