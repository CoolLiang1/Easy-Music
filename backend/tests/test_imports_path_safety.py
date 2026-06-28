from pathlib import Path

import pytest

from app.core.config import Settings
from app.services.imports import ImportConfigurationError, ImportPathSafetyError, ImportRootPolicy


def build_policy(tmp_path: Path, import_root: Path) -> ImportRootPolicy:
    return ImportRootPolicy(
        Settings(
            media_root=str(tmp_path / "media"),
            import_allowed_roots=[str(import_root)],
        ),
    )


def test_resolves_allowed_root_and_nested_directories(tmp_path: Path) -> None:
    import_root = tmp_path / "imports"
    nested = import_root / "album" / "disc-1"
    nested.mkdir(parents=True)
    policy = build_policy(tmp_path, import_root)

    resolved_root = policy.resolve_requested_path("root-1")
    resolved_nested = policy.resolve_requested_path("root-1", "album\\disc-1")

    assert resolved_root.path == import_root.resolve(strict=False)
    assert resolved_root.relative_path == "."
    assert resolved_nested.path == nested.resolve(strict=False)
    assert resolved_nested.relative_path == "album/disc-1"


def test_rejects_path_traversal(tmp_path: Path) -> None:
    import_root = tmp_path / "imports"
    import_root.mkdir()
    policy = build_policy(tmp_path, import_root)

    with pytest.raises(ImportPathSafetyError):
        policy.resolve_requested_path("root-1", "..\\outside")


def test_rejects_absolute_requested_paths(tmp_path: Path) -> None:
    import_root = tmp_path / "imports"
    import_root.mkdir()
    policy = build_policy(tmp_path, import_root)

    with pytest.raises(ImportPathSafetyError):
        policy.resolve_requested_path("root-1", str(tmp_path / "other"))

    with pytest.raises(ImportPathSafetyError):
        policy.resolve_requested_path("root-1", "C:\\Users\\owner\\Music")


def test_rejects_symlink_escape_where_supported(tmp_path: Path) -> None:
    import_root = tmp_path / "imports"
    outside = tmp_path / "outside"
    import_root.mkdir()
    outside.mkdir()
    link = import_root / "escape"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError as exc:
        pytest.skip(f"symlink creation is not available in this environment: {exc}")

    policy = build_policy(tmp_path, import_root)

    with pytest.raises(ImportPathSafetyError):
        policy.resolve_requested_path("root-1", "escape")


def test_rejects_disabled_configuration_when_resolving(tmp_path: Path) -> None:
    policy = ImportRootPolicy(Settings(media_root=str(tmp_path / "media")))

    with pytest.raises(ImportConfigurationError):
        policy.resolve_requested_path("root-1")


def test_rejects_drive_or_os_root_scan(tmp_path: Path) -> None:
    import_root = tmp_path / "imports"
    import_root.mkdir()
    policy = build_policy(tmp_path, import_root)

    os_root = Path(import_root.anchor).resolve(strict=False)

    with pytest.raises(ImportPathSafetyError):
        policy._reject_broad_path(os_root, "Requested import path")

    with pytest.raises(ImportPathSafetyError):
        ImportRootPolicy(
            Settings(
                media_root=str(tmp_path / "media"),
                import_allowed_roots=[str(os_root)],
            ),
        ).configured_roots()


def test_rejects_home_repository_and_media_roots(tmp_path: Path) -> None:
    import_root = tmp_path / "imports"
    import_root.mkdir()
    policy = build_policy(tmp_path, import_root)

    with pytest.raises(ImportPathSafetyError):
        policy._reject_broad_path(Path.home().resolve(strict=False), "Requested import path")

    with pytest.raises(ImportPathSafetyError):
        policy._reject_broad_path(policy.repository_root, "Requested import path")

    with pytest.raises(ImportPathSafetyError):
        ImportRootPolicy(
            Settings(
                media_root=str(tmp_path / "media"),
                import_allowed_roots=[str(Path.home().resolve(strict=False))],
            ),
        ).configured_roots()

    with pytest.raises(ImportPathSafetyError):
        ImportRootPolicy(
            Settings(
                media_root=str(tmp_path / "media"),
                import_allowed_roots=[str(policy.repository_root)],
            ),
        ).configured_roots()

    with pytest.raises(ImportConfigurationError):
        ImportRootPolicy(
            Settings(
                media_root=str(tmp_path / "media"),
                import_allowed_roots=[str(tmp_path / "media" / "imports")],
            ),
        ).configured_roots()
