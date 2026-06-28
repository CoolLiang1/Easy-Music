from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


TagGroup = Literal["scene", "type", "feature"]


class TagCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    group: TagGroup


class TagUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    group: TagGroup | None = None


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    group: TagGroup
    created_at: datetime
