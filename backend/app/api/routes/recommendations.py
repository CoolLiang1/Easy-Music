from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.recommendation import RecommendationRequest, RecommendationResponse
from app.services import recommendations as recommendation_service


router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.post("", response_model=RecommendationResponse)
def create_recommendations(
    payload: RecommendationRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> RecommendationResponse:
    tag_error = recommendation_service.validate_recommendation_request_tags(
        db,
        current_user,
        payload,
    )
    if tag_error is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=tag_error,
        )

    recommendation_context = recommendation_service.recommend_tracks_with_context(
        db,
        current_user,
        payload,
    )
    return RecommendationResponse(
        request_id=str(uuid4()),
        results=recommendation_context.results,
        exclusions_considered=recommendation_context.exclusions_considered,
    )
