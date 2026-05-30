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
    max_upload_mb: int = Field(default=200, validation_alias="MAX_UPLOAD_MB")
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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("originals_dir", "playback_dir")
    @classmethod
    def validate_media_subdir(cls, value: str) -> str:
        return validate_storage_dir(value)


@lru_cache
def get_settings() -> Settings:
    return Settings()
