from dataclasses import dataclass
from pathlib import Path

from app.core.config import Settings, get_settings
from app.schemas.imports import (
    ImportConfigurationResponse,
    ImportRootInfo,
    ImportScanCandidate,
    ImportScanLimits,
    ImportScanResponse,
    ImportScanSkippedItem,
)
from app.services.uploads import ALLOWED_UPLOAD_TYPES


class ImportConfigurationError(ValueError):
    pass


class ImportPathSafetyError(ValueError):
    pass


class ImportScanError(ValueError):
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
