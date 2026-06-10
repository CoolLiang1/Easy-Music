from pydantic import BaseModel, Field

from app.schemas.track import TrackResponse


class ImportRootInfo(BaseModel):
    id: str
    label: str


class ImportConfigurationResponse(BaseModel):
    enabled: bool
    message: str
    roots: list[ImportRootInfo]


class ImportResolvedPath(BaseModel):
    root_id: str
    relative_path: str
    display_path: str


class ImportScanRequest(BaseModel):
    root_id: str
    relative_subdir: str | None = None


class ImportScanLimits(BaseModel):
    max_files: int
    max_depth: int
    max_file_size_bytes: int


class ImportScanCandidate(BaseModel):
    relative_path: str
    basename: str
    extension: str
    size_bytes: int
    status: str = "supported"


class ImportScanSkippedItem(BaseModel):
    relative_path: str
    basename: str
    extension: str | None = None
    size_bytes: int | None = None
    status: str = "skipped"
    reason: str


class ImportScanResponse(BaseModel):
    enabled: bool
    message: str
    root: ImportRootInfo | None = None
    scanned_relative_path: str | None = None
    candidates: list[ImportScanCandidate]
    skipped: list[ImportScanSkippedItem]
    limits: ImportScanLimits


class ImportConfirmFileSelection(BaseModel):
    relative_path: str


class ImportConfirmRequest(BaseModel):
    root_id: str
    files: list[ImportConfirmFileSelection]


class ImportDuplicateWarning(BaseModel):
    match_type: str
    reason: str
    candidate_track_ids: list[int]


class ImportConfirmResult(BaseModel):
    relative_path: str
    basename: str
    status: str
    track: TrackResponse | None = None
    error: str | None = None
    duplicate_warnings: list[ImportDuplicateWarning] = Field(default_factory=list)


class ImportConfirmResponse(BaseModel):
    enabled: bool
    message: str
    root: ImportRootInfo | None = None
    requested_count: int
    imported_count: int
    skipped_count: int
    failed_count: int
    results: list[ImportConfirmResult]
