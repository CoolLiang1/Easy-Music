from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tag import Tag
from app.models.user import User
from app.schemas.tag import TagCreate, TagUpdate


def list_tags(db: Session, user: User) -> list[Tag]:
    return list(
        db.scalars(
            select(Tag).where(Tag.user_id == user.id).order_by(Tag.created_at, Tag.id),
        ),
    )


def create_tag(db: Session, user: User, payload: TagCreate) -> Tag:
    tag = Tag(user_id=user.id, name=payload.name, group=payload.group)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def get_tag(db: Session, user: User, tag_id: int) -> Tag | None:
    return db.scalar(select(Tag).where(Tag.id == tag_id, Tag.user_id == user.id))


def update_tag(db: Session, tag: Tag, payload: TagUpdate) -> Tag:
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(tag, field, value)

    db.commit()
    db.refresh(tag)
    return tag


def delete_tag(db: Session, tag: Tag) -> None:
    db.delete(tag)
    db.commit()
