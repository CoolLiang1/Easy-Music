from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.feedback_event import (
    FeedbackEventBulkSyncRequest,
    FeedbackEventBulkSyncResponse,
)
from app.services import feedback_events as feedback_event_service


router = APIRouter(prefix="/feedback-events", tags=["feedback-events"])


@router.post("", response_model=FeedbackEventBulkSyncResponse)
def sync_feedback_events(
    payload: FeedbackEventBulkSyncRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> FeedbackEventBulkSyncResponse:
    return feedback_event_service.sync_feedback_events(db, current_user, payload)
