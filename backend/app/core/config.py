from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from app.media.paths import validate_storage_dir


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    app_name: str = "Easy Music API"
    database_url: str = Field(
        default="postgresql+psycopg://easy_music:change-me-development-only@postgres:5432/easy_music_dev",
        validation_alias="DATABASE_URL",
    )
    app_secret_key: str = Field(
        default="development-secret-key-change-before-deploy",
        validation_alias="APP_SECRET_KEY",
    )
    access_token_expire_minutes: int = Field(
        default=1440,
        validation_alias="ACCESS_TOKEN_EXPIRE_MINUTES",
    )
    media_root: str = Field(default="/app/media", validation_alias="MEDIA_ROOT")
    originals_dir: str = Field(default="originals", validation_alias="ORIGINALS_DIR")
    playback_dir: str = Field(default="playback", validation_alias="PLAYBACK_DIR")
    covers_dir: str = Field(default="covers", validation_alias="COVERS_DIR")
    temp_videos_dir: str = Field(default="temp-videos", validation_alias="TEMP_VIDEOS_DIR")
    max_upload_mb: int = Field(default=200, validation_alias="MAX_UPLOAD_MB")
    max_video_upload_mb: int = Field(default=1024, validation_alias="MAX_VIDEO_UPLOAD_MB")
    max_cover_mb: int = Field(default=10, validation_alias="MAX_COVER_MB")
    import_allowed_roots: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        validation_alias="IMPORT_ALLOWED_ROOTS",
    )
    import_scan_max_files: int = Field(default=1000, validation_alias="IMPORT_SCAN_MAX_FILES")
    import_scan_max_depth: int = Field(default=5, validation_alias="IMPORT_SCAN_MAX_DEPTH")
    import_scan_max_file_mb: int = Field(default=200, validation_alias="IMPORT_SCAN_MAX_FILE_MB")
    ffmpeg_path: str = Field(default="ffmpeg", validation_alias="FFMPEG_PATH")
    ffprobe_path: str = Field(default="ffprobe", validation_alias="FFPROBE_PATH")
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        validation_alias="CORS_ORIGINS",
    )

    # Logging
    log_level: str = Field(default="INFO", validation_alias="LOG_LEVEL")
    log_format: str = Field(default="text", validation_alias="LOG_FORMAT")

    # AI provider (development-only, no real secrets committed)
    ai_enabled: bool = Field(default=False, validation_alias="AI_ENABLED")
    ai_provider: str = Field(default="", validation_alias="AI_PROVIDER")
    ai_api_key: str = Field(default="", validation_alias="AI_API_KEY")
    ai_model: str = Field(default="", validation_alias="AI_MODEL")
    ai_base_url: str = Field(default="", validation_alias="AI_BASE_URL")
    ai_tag_search_enabled: bool = Field(
        default=False,
        validation_alias="AI_TAG_SEARCH_ENABLED",
    )
    ai_tag_search_provider: str = Field(
        default="tavily",
        validation_alias="AI_TAG_SEARCH_PROVIDER",
    )
    ai_tag_search_api_key: str = Field(
        default="",
        validation_alias="AI_TAG_SEARCH_API_KEY",
    )
    ai_tag_search_base_url: str = Field(
        default="https://api.tavily.com",
        validation_alias="AI_TAG_SEARCH_BASE_URL",
    )
    ai_tag_search_max_results: int = Field(
        default=5,
        ge=1,
        le=5,
        validation_alias="AI_TAG_SEARCH_MAX_RESULTS",
    )
    ai_tag_search_cache_days: int = Field(
        default=30,
        ge=0,
        validation_alias="AI_TAG_SEARCH_CACHE_DAYS",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("import_allowed_roots", mode="before")
    @classmethod
    def parse_import_allowed_roots(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            separator = ";" if ";" in value else ","
            return [root.strip() for root in value.split(separator) if root.strip()]
        return value

    @field_validator("originals_dir", "playback_dir", "covers_dir", "temp_videos_dir")
    @classmethod
    def validate_media_subdir(cls, value: str) -> str:
        return validate_storage_dir(value)


@lru_cache
def get_settings() -> Settings:
    return Settings()
