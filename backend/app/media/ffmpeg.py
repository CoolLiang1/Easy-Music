from collections.abc import Callable, Sequence
from pathlib import Path
import json
import subprocess
from typing import Any

from app.core.config import Settings, get_settings


SubprocessRunner = Callable[..., subprocess.CompletedProcess[str]]


class MediaProcessingError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        executable: str,
        args: Sequence[str],
        returncode: int | None = None,
        stderr: str | None = None,
    ) -> None:
        super().__init__(message)
        self.executable = executable
        self.args = list(args)
        self.returncode = returncode
        self.stderr = stderr


class FFprobeError(MediaProcessingError):
    pass


class FFmpegError(MediaProcessingError):
    pass


class FFprobeOutputError(FFprobeError):
    pass


def _run_media_command(
    args: Sequence[str],
    *,
    runner: SubprocessRunner | None = None,
) -> subprocess.CompletedProcess[str]:
    run = runner or subprocess.run
    return run(
        list(args),
        capture_output=True,
        text=True,
        check=False,
    )


def probe_media(
    source_path: str | Path,
    *,
    settings: Settings | None = None,
    runner: SubprocessRunner | None = None,
) -> dict[str, Any]:
    active_settings = settings or get_settings()
    args = [
        active_settings.ffprobe_path,
        "-v",
        "error",
        "-show_entries",
        "format=duration,format_name,bit_rate:format_tags=title,artist,album",
        "-of",
        "json",
        str(source_path),
    ]

    try:
        result = _run_media_command(args, runner=runner)
    except FileNotFoundError as exc:
        raise FFprobeError(
            "ffprobe executable was not found.",
            executable=active_settings.ffprobe_path,
            args=args,
        ) from exc

    if result.returncode != 0:
        raise FFprobeError(
            "ffprobe failed to inspect media.",
            executable=active_settings.ffprobe_path,
            args=args,
            returncode=result.returncode,
            stderr=result.stderr,
        )

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise FFprobeOutputError(
            "ffprobe returned invalid JSON.",
            executable=active_settings.ffprobe_path,
            args=args,
            stderr=result.stdout,
        ) from exc

    if not isinstance(payload, dict):
        raise FFprobeOutputError(
            "ffprobe returned an unexpected JSON payload.",
            executable=active_settings.ffprobe_path,
            args=args,
            stderr=result.stdout,
        )

    return payload


def extract_audio_from_video(
    source_path: str | Path,
    destination_path: str | Path,
    *,
    settings: Settings | None = None,
    runner: SubprocessRunner | None = None,
    audio_bitrate: str = "192k",
) -> None:
    active_settings = settings or get_settings()
    destination = Path(destination_path)
    destination.parent.mkdir(parents=True, exist_ok=True)

    args = [
        active_settings.ffmpeg_path,
        "-y",
        "-i",
        str(source_path),
        "-vn",
        "-codec:a",
        "libmp3lame",
        "-b:a",
        audio_bitrate,
        str(destination),
    ]

    try:
        result = _run_media_command(args, runner=runner)
    except FileNotFoundError as exc:
        raise FFmpegError(
            "ffmpeg executable was not found.",
            executable=active_settings.ffmpeg_path,
            args=args,
        ) from exc

    if result.returncode != 0:
        raise FFmpegError(
            "FFmpeg failed to extract audio from video.",
            executable=active_settings.ffmpeg_path,
            args=args,
            returncode=result.returncode,
            stderr=result.stderr,
        )


def generate_mp3_playback(
    source_path: str | Path,
    destination_path: str | Path,
    *,
    settings: Settings | None = None,
    runner: SubprocessRunner | None = None,
    audio_bitrate: str = "192k",
) -> None:
    active_settings = settings or get_settings()
    destination = Path(destination_path)
    destination.parent.mkdir(parents=True, exist_ok=True)

    args = [
        active_settings.ffmpeg_path,
        "-y",
        "-i",
        str(source_path),
        "-vn",
        "-codec:a",
        "libmp3lame",
        "-b:a",
        audio_bitrate,
        str(destination),
    ]

    try:
        result = _run_media_command(args, runner=runner)
    except FileNotFoundError as exc:
        raise FFmpegError(
            "ffmpeg executable was not found.",
            executable=active_settings.ffmpeg_path,
            args=args,
        ) from exc

    if result.returncode != 0:
        raise FFmpegError(
            "ffmpeg failed to generate playback MP3.",
            executable=active_settings.ffmpeg_path,
            args=args,
            returncode=result.returncode,
            stderr=result.stderr,
        )
