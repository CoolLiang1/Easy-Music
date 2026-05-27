from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


TagGroup = Literal["scenario", "state", "type", "attribute"]


class TagCreate(BaseModel):
    name: str
    group: TagGroup


class TagUpdate(BaseModel):
    name: str | None = None
    group: TagGroup | None = None


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    group: TagGroup
    created_at: datetime
