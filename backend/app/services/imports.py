from dataclasses import dataclass
from pathlib import Path
import shutil

from sqlalchemy import select
from app.core.config import Settings, get_settings
from app.media.storage import MediaStorage
from app.models.import_batch import ImportBatch, ImportItem
from app.models.track import Track
from app.models.user import User
from app.schemas.imports import (
    ImportBatchItemResponse,
    ImportBatchResponse,
    ImportConfirmResponse,
    ImportConfirmResult,
    ImportDuplicateWarning,
    ImportConfigurationResponse,
    ImportRootInfo,
    ImportScanCandidate,
    ImportScanLimits,
    ImportScanResponse,
    ImportScanSkippedItem,
)
from app.services.duplicate_signals import build_normalized_metadata_key, collect_file_duplicate_signal
from app.services.jobs import create_processing_job
from app.services.tracks import build_track_response
from app.services.uploads import ALLOWED_UPLOAD_TYPES


class ImportConfigurationError(ValueError):
    pass


class ImportPathSafetyError(ValueError):
    pass


class ImportScanError(ValueError):
    pass


class ImportConfirmError(ValueError):
    pass


@dataclass(frozen=True)
class ConfiguredImportRoot:
    id: str
    label: str
    path: Path


@dataclass(frozen=True)
class ResolvedImportPath:
    root: ConfiguredImportRoot
    path: Path
    relative_path: str


_DISABLED_MESSAGE = "Import tools are disabled because IMPORT_ALLOWED_ROOTS is empty."


class ImportRootPolicy:
    def __init__(self, settings: Settings | None = None, repository_root: Path | None = None) -> None:
        self.settings = settings or get_settings()
        self.repository_root = (
            repository_root.resolve(strict=False)
            if repository_root is not None
            else Path(__file__).resolve(strict=False).parents[3]
        )
        self.media_root = Path(self.settings.media_root).resolve(strict=False)

    def get_configuration_response(self) -> ImportConfigurationResponse:
        roots = self.configured_roots()
        if not roots:
            return ImportConfigurationResponse(
                enabled=False,
                message=_DISABLED_MESSAGE,
                roots=[],
            )
        return ImportConfigurationResponse(
            enabled=True,
            message="Import tools are enabled for configured import roots.",
            roots=[ImportRootInfo(id=root.id, label=root.label) for root in roots],
        )

    def scan_audio_preview(self, root_id: str, relative_subdir: str | None = None) -> ImportScanResponse:
        limits = self._scan_limits()
        if not self.settings.import_allowed_roots:
            return ImportScanResponse(
                enabled=False,
                message=_DISABLED_MESSAGE,
                candidates=[],
                skipped=[],
                limits=limits,
            )

        resolved = self.resolve_requested_path(root_id, relative_subdir)
        if not resolved.path.exists():
            raise ImportScanError("Requested import directory does not exist.")
        if not resolved.path.is_dir():
            raise ImportScanError("Requested import path is not a directory.")

        candidates: list[ImportScanCandidate] = []
        skipped: list[ImportScanSkippedItem] = []
        stopped_early = self._scan_directory(
            current=resolved.path,
            root=resolved.root.path,
            candidates=candidates,
            skipped=skipped,
            depth=0,
            limits=limits,
        )
        message = "Scan completed."
        if stopped_early:
            message = "Scan completed with configured limits applied."

        return ImportScanResponse(
            enabled=True,
            message=message,
            root=ImportRootInfo(id=resolved.root.id, label=resolved.root.label),
            scanned_relative_path=resolved.relative_path,
            candidates=candidates,
            skipped=skipped,
            limits=limits,
        )

    def confirm_audio_import(
        self,
        db,
        user: User,
        root_id: str,
        relative_paths: list[str],
        storage: MediaStorage,
    ) -> ImportConfirmResponse:
        if not self.settings.import_allowed_roots:
            return ImportConfirmResponse(
                enabled=False,
                message=_DISABLED_MESSAGE,
                batch_id=None,
                requested_count=len(relative_paths),
                imported_count=0,
                skipped_count=0,
                failed_count=0,
                results=[],
            )

        roots = {root.id: root for root in self.configured_roots()}
        root = roots.get(root_id)
        if root is None:
            raise ImportPathSafetyError("Requested import root is not configured.")

        batch = ImportBatch(
            user_id=user.id,
            root_id=root.id,
            status="importing",
            message="Import is running.",
            requested_count=len(relative_paths),
        )
        db.add(batch)
        db.commit()
        db.refresh(batch)

        results: list[ImportConfirmResult] = []
        for relative_path in relative_paths:
            result = self._confirm_one_audio_import(db, user, root, relative_path, storage)
            results.append(result)
            self._record_import_item(db, batch, user, root, result)

        imported_count = sum(1 for result in results if result.status == "imported")
        skipped_count = sum(1 for result in results if result.status == "skipped")
        failed_count = sum(1 for result in results if result.status == "failed")
        batch.imported_count = imported_count
        batch.skipped_count = skipped_count
        batch.failed_count = failed_count
        batch.status = self._batch_status(imported_count, skipped_count, failed_count)
        batch.message = "Import completed."
        db.commit()
        db.refresh(batch)

        return ImportConfirmResponse(
            enabled=True,
            message="Import completed.",
            root=ImportRootInfo(id=root.id, label=root.label),
            batch_id=batch.id,
            requested_count=len(relative_paths),
            imported_count=imported_count,
            skipped_count=skipped_count,
            failed_count=failed_count,
            results=results,
        )

    def latest_import_batch(self, db, user: User) -> ImportBatchResponse | None:
        batch = db.scalar(
            select(ImportBatch)
            .where(ImportBatch.user_id == user.id)
            .order_by(ImportBatch.created_at.desc(), ImportBatch.id.desc()),
        )
        if batch is None:
            return None
        return self._build_batch_response(db, user, batch)

    def get_import_batch(self, db, user: User, batch_id: int) -> ImportBatchResponse | None:
        batch = db.scalar(
            select(ImportBatch).where(
                ImportBatch.id == batch_id,
                ImportBatch.user_id == user.id,
            ),
        )
        if batch is None:
            return None
        return self._build_batch_response(db, user, batch)

    def configured_roots(self) -> list[ConfiguredImportRoot]:
        roots: list[ConfiguredImportRoot] = []
        for index, configured_path in enumerate(self.settings.import_allowed_roots, start=1):
            root_path = Path(configured_path).expanduser().resolve(strict=False)
            self._validate_allowed_root(root_path)
            roots.append(
                ConfiguredImportRoot(
                    id=f"root-{index}",
                    label=self._safe_root_label(root_path, index),
                    path=root_path,
                ),
            )
        return roots

    def resolve_requested_path(self, root_id: str, relative_subpath: str | None = None) -> ResolvedImportPath:
        roots = {root.id: root for root in self.configured_roots()}
        if not roots:
            raise ImportConfigurationError(_DISABLED_MESSAGE)

        root = roots.get(root_id)
        if root is None:
            raise ImportPathSafetyError("Requested import root is not configured.")

        relative = (relative_subpath or "").strip()
        candidate = self._resolve_under_root(root.path, relative)
        self._validate_scan_target(candidate)
        return ResolvedImportPath(
            root=root,
            path=candidate,
            relative_path=candidate.relative_to(root.path).as_posix() or ".",
        )

    def _confirm_one_audio_import(
        self,
        db,
        user: User,
        root: ConfiguredImportRoot,
        relative_path: str,
        storage: MediaStorage,
    ) -> ImportConfirmResult:
        basename = Path(relative_path.replace("\\", "/")).name or "."
        try:
            source = self._resolve_under_root(root.path, relative_path)
            relative_source_path = source.relative_to(root.path).as_posix()
            basename = source.name
            if not source.exists():
                return self._import_result(relative_source_path, basename, "failed", "Source file does not exist.")
            if not source.is_file():
                return self._import_result(relative_source_path, basename, "failed", "Source path is not a file.")
            extension = source.suffix.lower()
            if extension not in ALLOWED_UPLOAD_TYPES:
                return self._import_result(relative_source_path, basename, "skipped", "Unsupported audio file extension.")
            size_bytes = source.stat().st_size
            if size_bytes > self._scan_limits().max_file_size_bytes:
                return self._import_result(relative_source_path, basename, "skipped", "Source file exceeds import size limit.")

            source_signal = collect_file_duplicate_signal(source)
            duplicate_warnings = self._duplicate_warnings_for_signal(db, user, source_signal.sha256 if source_signal else None)

            track = Track(
                user_id=user.id,
                title=source.stem or "Untitled Import",
                content_type="song",
                status="uploading",
                format=extension.removeprefix("."),
            )
            db.add(track)
            db.flush()

            destination = storage.original_upload_path(user.id, track.id, source.name)
            try:
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
            except Exception as exc:
                db.rollback()
                if destination.exists():
                    destination.unlink()
                return self._import_result(relative_source_path, basename, "failed", f"Copy failed: {exc}")

            copied_signal = collect_file_duplicate_signal(destination)
            if copied_signal is not None:
                track.original_file_size_bytes = copied_signal.size_bytes
                track.original_file_sha256 = copied_signal.sha256
            else:
                track.original_file_size_bytes = size_bytes
                track.original_file_sha256 = source_signal.sha256 if source_signal else None

            track.original_file_path = storage.relative_media_path(destination)
            track.normalized_metadata_key = build_normalized_metadata_key(
                title=track.title,
                artist=track.artist,
                album=track.album,
                duration_seconds=track.duration_seconds,
            )
            track.status = "processing"
            create_processing_job(db, track)
            db.commit()
            db.refresh(track)
            return ImportConfirmResult(
                relative_path=relative_source_path,
                basename=basename,
                status="imported",
                track=build_track_response(db, track),
                duplicate_warnings=duplicate_warnings,
            )
        except (ImportPathSafetyError, OSError) as exc:
            db.rollback()
            return self._import_result(relative_path, basename, "failed", str(exc))

    @staticmethod
    def _import_result(relative_path: str, basename: str, status: str, error: str) -> ImportConfirmResult:
        return ImportConfirmResult(
            relative_path=relative_path.replace("\\", "/"),
            basename=basename,
            status=status,
            error=error,
        )

    @staticmethod
    def _record_import_item(
        db,
        batch: ImportBatch,
        user: User,
        root: ConfiguredImportRoot,
        result: ImportConfirmResult,
    ) -> None:
        db.add(
            ImportItem(
                batch_id=batch.id,
                user_id=user.id,
                root_id=root.id,
                relative_source_path=result.relative_path.replace("\\", "/"),
                display_name=result.basename,
                status=result.status,
                track_id=result.track.id if result.track else None,
                error_message=result.error,
            ),
        )
        db.commit()

    @staticmethod
    def _batch_status(imported_count: int, skipped_count: int, failed_count: int) -> str:
        if failed_count > 0:
            return "failed"
        if imported_count > 0:
            return "imported"
        if skipped_count > 0:
            return "skipped"
        return "skipped"

    def _build_batch_response(self, db, user: User, batch: ImportBatch) -> ImportBatchResponse:
        root_label = batch.root_id
        for root in self.configured_roots():
            if root.id == batch.root_id:
                root_label = root.label
                break

        items = list(
            db.scalars(
                select(ImportItem)
                .where(
                    ImportItem.batch_id == batch.id,
                    ImportItem.user_id == user.id,
                )
                .order_by(ImportItem.created_at, ImportItem.id),
            ),
        )
        track_ids = [item.track_id for item in items if item.track_id is not None]
        tracks_by_id = {
            track.id: track
            for track in db.scalars(
                select(Track).where(
                    Track.user_id == user.id,
                    Track.id.in_(track_ids),
                ),
            )
        } if track_ids else {}

        return ImportBatchResponse(
            id=batch.id,
            root=ImportRootInfo(id=batch.root_id, label=root_label),
            status=batch.status,
            message=batch.message,
            requested_count=batch.requested_count,
            imported_count=batch.imported_count,
            skipped_count=batch.skipped_count,
            failed_count=batch.failed_count,
            items=[
                ImportBatchItemResponse(
                    id=item.id,
                    relative_path=item.relative_source_path,
                    basename=item.display_name,
                    status=item.status,
                    track_id=item.track_id,
                    track=(
                        build_track_response(db, tracks_by_id[item.track_id])
                        if item.track_id is not None and item.track_id in tracks_by_id
                        else None
                    ),
                    error=item.error_message,
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                )
                for item in items
            ],
            created_at=batch.created_at,
            updated_at=batch.updated_at,
        )

    @staticmethod
    def _duplicate_warnings_for_signal(db, user: User, sha256: str | None) -> list[ImportDuplicateWarning]:
        if not sha256:
            return []
        candidate_track_ids = list(
            db.scalars(
                select(Track.id)
                .where(
                    Track.user_id == user.id,
                    Track.original_file_sha256 == sha256,
                )
                .order_by(Track.id),
            ),
        )
        if not candidate_track_ids:
            return []
        return [
            ImportDuplicateWarning(
                match_type="exact_file",
                reason="Selected file matches an existing track original file SHA-256.",
                candidate_track_ids=candidate_track_ids,
            ),
        ]

    def _scan_directory(
        self,
        current: Path,
        root: Path,
        candidates: list[ImportScanCandidate],
        skipped: list[ImportScanSkippedItem],
        depth: int,
        limits: ImportScanLimits,
    ) -> bool:
        if len(candidates) >= limits.max_files:
            return True
        if depth > limits.max_depth:
            skipped.append(self._skipped_item(current, root, "max_depth_exceeded"))
            return False

        try:
            entries = sorted(current.iterdir(), key=lambda entry: entry.name.lower())
        except PermissionError:
            skipped.append(self._skipped_item(current, root, "permission_denied"))
            return False
        except OSError:
            skipped.append(self._skipped_item(current, root, "read_error"))
            return False

        stopped_early = False
        for entry in entries:
            if len(candidates) >= limits.max_files:
                skipped.append(self._skipped_item(entry, root, "max_files_exceeded"))
                stopped_early = True
                break

            try:
                resolved_entry = entry.resolve(strict=False)
                if not resolved_entry.is_relative_to(root):
                    skipped.append(self._skipped_item(entry, root, "path_escapes_root"))
                    continue
                if entry.is_dir():
                    if entry.is_symlink():
                        skipped.append(self._skipped_item(entry, root, "symlink_directory_skipped"))
                        continue
                    stopped_early = (
                        self._scan_directory(
                            current=resolved_entry,
                            root=root,
                            candidates=candidates,
                            skipped=skipped,
                            depth=depth + 1,
                            limits=limits,
                        )
                        or stopped_early
                    )
                    continue
                if not entry.is_file():
                    skipped.append(self._skipped_item(entry, root, "not_regular_file"))
                    continue
                self._scan_file(entry, root, candidates, skipped, limits)
            except PermissionError:
                skipped.append(self._skipped_item(entry, root, "permission_denied"))
            except OSError:
                skipped.append(self._skipped_item(entry, root, "read_error"))
        return stopped_early

    def _scan_file(
        self,
        path: Path,
        root: Path,
        candidates: list[ImportScanCandidate],
        skipped: list[ImportScanSkippedItem],
        limits: ImportScanLimits,
    ) -> None:
        extension = path.suffix.lower()
        stat = path.stat()
        if extension not in ALLOWED_UPLOAD_TYPES:
            skipped.append(self._skipped_item(path, root, "unsupported_extension", stat.st_size))
            return
        if stat.st_size > limits.max_file_size_bytes:
            skipped.append(self._skipped_item(path, root, "file_too_large", stat.st_size))
            return

        relative_path = path.resolve(strict=False).relative_to(root).as_posix()
        candidates.append(
            ImportScanCandidate(
                relative_path=relative_path,
                basename=path.name,
                extension=extension.removeprefix("."),
                size_bytes=stat.st_size,
            ),
        )

    def _resolve_under_root(self, root: Path, relative_subpath: str) -> Path:
        if self._looks_absolute(relative_subpath):
            raise ImportPathSafetyError("Import paths must be relative to a configured root.")

        normalized = relative_subpath.replace("\\", "/")
        parts = [part for part in normalized.split("/") if part and part != "."]
        if any(part == ".." for part in parts):
            raise ImportPathSafetyError("Import paths may not contain '..'.")

        candidate = root.joinpath(*parts).resolve(strict=False)
        if not candidate.is_relative_to(root):
            raise ImportPathSafetyError("Resolved import path escapes the configured root.")
        return candidate

    def _validate_allowed_root(self, root: Path) -> None:
        self._reject_broad_path(root, "Configured import root")
        if root == self.media_root or root.is_relative_to(self.media_root):
            raise ImportConfigurationError("Configured import root may not be inside MEDIA_ROOT.")

    def _validate_scan_target(self, target: Path) -> None:
        self._reject_broad_path(target, "Requested import path")

    def _scan_limits(self) -> ImportScanLimits:
        return ImportScanLimits(
            max_files=max(1, self.settings.import_scan_max_files),
            max_depth=max(0, self.settings.import_scan_max_depth),
            max_file_size_bytes=max(1, self.settings.import_scan_max_file_mb) * 1024 * 1024,
        )

    @staticmethod
    def _skipped_item(path: Path, root: Path, reason: str, size_bytes: int | None = None) -> ImportScanSkippedItem:
        try:
            relative_path = path.resolve(strict=False).relative_to(root).as_posix()
        except ValueError:
            relative_path = path.name or "."
        return ImportScanSkippedItem(
            relative_path=relative_path or ".",
            basename=path.name or ".",
            extension=path.suffix.lower().removeprefix(".") or None,
            size_bytes=size_bytes,
            reason=reason,
        )

    def _reject_broad_path(self, path: Path, subject: str) -> None:
        root_anchor = Path(path.anchor).resolve(strict=False) if path.anchor else None
        if root_anchor is not None and path == root_anchor:
            raise ImportPathSafetyError(f"{subject} may not be a drive or OS root.")

        home = Path.home().resolve(strict=False)
        if path == home:
            raise ImportPathSafetyError(f"{subject} may not be the user home directory.")

        if path == self.repository_root:
            raise ImportPathSafetyError(f"{subject} may not be the repository root.")

    @staticmethod
    def _looks_absolute(path_text: str) -> bool:
        if not path_text:
            return False
        normalized = path_text.replace("\\", "/")
        if normalized.startswith("/"):
            return True
        if len(path_text) >= 3 and path_text[1] == ":" and path_text[2] in ("\\", "/"):
            return True
        return Path(path_text).is_absolute()

    @staticmethod
    def _safe_root_label(root: Path, index: int) -> str:
        return root.name or f"Import root {index}"


def get_import_root_policy() -> ImportRootPolicy:
    return ImportRootPolicy()
