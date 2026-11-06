from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
import json
import math
import os
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
    audio_bitrate: str = "320k",
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


# Longest edge of an extracted cover; larger artwork is scaled down.
COVER_MAX_EDGE_PX = 800


def extract_cover_image(
    source_path: str | Path,
    destination_path: str | Path,
    *,
    settings: Settings | None = None,
    runner: SubprocessRunner | None = None,
    seek_seconds: float | None = None,
) -> bool:
    """Write the first picture stream of *source_path* as a JPEG cover.

    For audio files this is the embedded artwork (ID3 APIC, MP4 covr, FLAC
    picture). For a video, pass *seek_seconds* to grab a frame from that
    point. Best effort: returns False when the file has no picture stream or
    ffmpeg fails, and leaves nothing behind at *destination_path*.
    """
    active_settings = settings or get_settings()
    destination = Path(destination_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(f"{destination.stem}.partial{destination.suffix}")

    args = [active_settings.ffmpeg_path, "-y", "-v", "error"]
    if seek_seconds is not None and seek_seconds > 0:
        args.extend(["-ss", f"{seek_seconds:.2f}"])
    args.extend(
        [
            "-i",
            str(source_path),
            "-map",
            "0:v:0",
            "-an",
            "-frames:v",
            "1",
            "-vf",
            f"scale='min({COVER_MAX_EDGE_PX},iw)':'min({COVER_MAX_EDGE_PX},ih)':force_original_aspect_ratio=decrease",
            "-q:v",
            "3",
            "-f",
            "image2",
            "-c:v",
            "mjpeg",
            str(partial),
        ]
    )

    try:
        result = _run_media_command(args, runner=runner)
    except FileNotFoundError:
        partial.unlink(missing_ok=True)
        return False

    if result.returncode != 0 or not partial.is_file() or partial.stat().st_size == 0:
        partial.unlink(missing_ok=True)
        return False

    os.replace(partial, destination)
    return True


@dataclass(frozen=True)
class LoudnessMeasurement:
    integrated_lufs: float | None
    true_peak_dbtp: float | None


# Never boost a track by more than this, even when its peaks would allow it.
# Near-silent recordings would otherwise have their noise floor raised a lot.
MAX_PLAYBACK_BOOST_DB = 20.0
# Gains smaller than this are inaudible; skip the volume filter entirely.
MIN_PLAYBACK_GAIN_DB = 0.05


def measure_loudness(
    source_path: str | Path,
    *,
    settings: Settings | None = None,
    runner: SubprocessRunner | None = None,
) -> LoudnessMeasurement:
    """Measure integrated loudness (EBU R128) and true peak with ffmpeg loudnorm."""
    active_settings = settings or get_settings()
    args = [
        active_settings.ffmpeg_path,
        "-hide_banner",
        "-nostats",
        "-i",
        str(source_path),
        "-vn",
        "-af",
        "loudnorm=print_format=json",
        "-f",
        "null",
        "-",
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
            "ffmpeg failed to measure loudness.",
            executable=active_settings.ffmpeg_path,
            args=args,
            returncode=result.returncode,
            stderr=result.stderr,
        )

    payload = _parse_loudnorm_json(result.stderr)
    if payload is None:
        raise FFmpegError(
            "ffmpeg loudness measurement returned no JSON summary.",
            executable=active_settings.ffmpeg_path,
            args=args,
            returncode=result.returncode,
            stderr=result.stderr,
        )

    return LoudnessMeasurement(
        integrated_lufs=_parse_finite_float(payload.get("input_i")),
        true_peak_dbtp=_parse_finite_float(payload.get("input_tp")),
    )


def compute_playback_gain_db(
    measurement: LoudnessMeasurement,
    *,
    target_lufs: float,
    max_true_peak_dbtp: float,
) -> float:
    """Return one static gain that moves the track toward the target loudness.

    The gain is linear (no compression): it is reduced so the measured true
    peak never exceeds the ceiling, and boosts are capped. Silent or
    unmeasurable tracks get no gain.
    """
    if measurement.integrated_lufs is None:
        return 0.0

    gain = target_lufs - measurement.integrated_lufs
    if measurement.true_peak_dbtp is not None:
        gain = min(gain, max_true_peak_dbtp - measurement.true_peak_dbtp)
    gain = min(gain, MAX_PLAYBACK_BOOST_DB)
    return round(gain, 2)


def _parse_loudnorm_json(output: str | None) -> dict[str, Any] | None:
    if not output:
        return None
    end = output.rfind("}")
    if end == -1:
        return None
    start = output.rfind("{", 0, end)
    if start == -1:
        return None
    try:
        payload = json.loads(output[start : end + 1])
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _parse_finite_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def generate_mp3_playback(
    source_path: str | Path,
    destination_path: str | Path,
    *,
    settings: Settings | None = None,
    runner: SubprocessRunner | None = None,
    audio_bitrate: str = "320k",
    gain_db: float | None = None,
) -> None:
    """Encode the playback MP3, replacing the destination only on success."""
    active_settings = settings or get_settings()
    destination = Path(destination_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(f"{destination.stem}.partial{destination.suffix}")

    args = [
        active_settings.ffmpeg_path,
        "-y",
        "-i",
        str(source_path),
        "-vn",
    ]
    if gain_db is not None and abs(gain_db) >= MIN_PLAYBACK_GAIN_DB:
        args.extend(["-af", f"volume={gain_db:.2f}dB"])
    args.extend(
        [
            "-codec:a",
            "libmp3lame",
            "-b:a",
            audio_bitrate,
            str(partial),
        ]
    )

    try:
        result = _run_media_command(args, runner=runner)
    except FileNotFoundError as exc:
        partial.unlink(missing_ok=True)
        raise FFmpegError(
            "ffmpeg executable was not found.",
            executable=active_settings.ffmpeg_path,
            args=args,
        ) from exc

    if result.returncode != 0:
        partial.unlink(missing_ok=True)
        raise FFmpegError(
            "ffmpeg failed to generate playback MP3.",
            executable=active_settings.ffmpeg_path,
            args=args,
            returncode=result.returncode,
            stderr=result.stderr,
        )

    if partial.exists():
        os.replace(partial, destination)
