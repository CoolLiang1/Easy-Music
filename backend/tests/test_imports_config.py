from pathlib import Path

from app.core.config import Settings
from app.services.imports import ImportRootPolicy


def test_import_allowed_roots_parse_semicolon_separated_windows_friendly_value() -> None:
    settings = Settings(import_allowed_roots="C:\\Music Import;D:\\Inbox")

    assert settings.import_allowed_roots == ["C:\\Music Import", "D:\\Inbox"]


def test_import_allowed_roots_parse_comma_separated_value() -> None:
    settings = Settings(import_allowed_roots="/srv/import-a,/srv/import-b")

    assert settings.import_allowed_roots == ["/srv/import-a", "/srv/import-b"]


def test_empty_import_roots_return_configured_off_response(tmp_path: Path) -> None:
    policy = ImportRootPolicy(Settings(media_root=str(tmp_path / "media")))

    response = policy.get_configuration_response()

    assert response.enabled is False
    assert response.roots == []
    assert "IMPORT_ALLOWED_ROOTS is empty" in response.message


def test_configured_import_roots_return_safe_labels_without_absolute_paths(tmp_path: Path) -> None:
    import_root = tmp_path / "music-import"
    import_root.mkdir()
    policy = ImportRootPolicy(
        Settings(
            media_root=str(tmp_path / "media"),
            import_allowed_roots=[str(import_root)],
        ),
    )

    response = policy.get_configuration_response()

    assert response.enabled is True
    assert response.roots[0].id == "root-1"
    assert response.roots[0].label == "music-import"
    assert str(import_root) not in response.model_dump_json()
