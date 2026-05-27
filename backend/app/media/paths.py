from pathlib import Path
import re
import unicodedata


class UnsafeMediaPathError(ValueError):
    pass


_SAFE_FILENAME_PATTERN = re.compile(r"[^A-Za-z0-9._-]+")


def sanitize_filename(filename: str, fallback: str = "upload") -> str:
    name = filename.replace("\\", "/").split("/")[-1]
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    path = Path(normalized)
    stem = _SAFE_FILENAME_PATTERN.sub("_", path.stem).strip("._")
    suffix = _SAFE_FILENAME_PATTERN.sub("", path.suffix.lower())
    sanitized = f"{stem}{suffix}" if stem else ""
    return sanitized or fallback


def validate_storage_dir(dirname: str) -> str:
    path = Path(dirname)
    parts = dirname.replace("\\", "/").split("/")
    if not dirname or path.is_absolute() or ".." in parts:
        raise UnsafeMediaPathError("storage directory must be a relative path inside MEDIA_ROOT")
    return dirname


def resolve_media_path(media_root: str | Path, *parts: str | Path) -> Path:
    root = Path(media_root).resolve(strict=False)
    candidate = root.joinpath(*parts).resolve(strict=False)
    if not candidate.is_relative_to(root):
        raise UnsafeMediaPathError("resolved media path escapes MEDIA_ROOT")
    return candidate
