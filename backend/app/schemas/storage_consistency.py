from datetime import datetime
from typing import Literal

from pydantic import BaseModel


MediaKind = Literal["original", "playback", "cover", "temporary_video"]


class MediaReferenceIssue(BaseModel):
    track_id: int
    media_kind: MediaKind
    path: str | None


class OrphanMediaFile(BaseModel):
    media_kind: MediaKind
    path: str


class StorageConsistencyReport(BaseModel):
    generated_at: datetime
    referenced_file_count: int
    scanned_file_count: int
    missing_references: list[MediaReferenceIssue]
    unsafe_references: list[MediaReferenceIssue]
    orphan_files: list[OrphanMediaFile]
    scan_errors: list[str]
