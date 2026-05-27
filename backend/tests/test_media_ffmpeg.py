from pathlib import Path
import subprocess

import pytest

from app.core.config import Settings
from app.media.ffmpeg import FFmpegError, FFprobeError, FFprobeOutputError, generate_mp3_playback
from app.media.metadata import MediaMetadata, extract_metadata


def completed(stdout: str = "{}", stderr: str = "", returncode: int = 0) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


def test_extract_metadata_uses_ffprobe_json_output() -> None:
    calls: list[list[str]] = []

    def fake_run(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        assert kwargs["capture_output"] is True
        assert kwargs["text"] is True
        assert kwargs["check"] is False
        return completed(
            """
            {
              "format": {
                "duration": "123.45",
                "format_name": "mp3",
                "bit_rate": "320000",
                "tags": {
                  "TITLE": "Test Title",
                  "artist": "Test Artist",
                  "album": "Test Album"
                }
              }
            }
            """
        )

    metadata = extract_metadata(
        Path("song.mp3"),
        settings=Settings(ffprobe_path="custom-ffprobe"),
        runner=fake_run,
    )

    assert metadata == MediaMetadata(
        duration_seconds=123,
        format="mp3",
        bitrate=320000,
        title="Test Title",
        artist="Test Artist",
        album="Test Album",
    )
    assert calls == [
        [
            "custom-ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,format_name,bit_rate:format_tags=title,artist,album",
            "-of",
            "json",
            "song.mp3",
        ]
    ]


def test_extract_metadata_tolerates_missing_optional_fields() -> None:
    metadata = extract_metadata(
        "untagged.wav",
        runner=lambda *args, **kwargs: completed('{"format": {}}'),
    )

    assert metadata == MediaMetadata(
        duration_seconds=None,
        format=None,
        bitrate=None,
        title=None,
        artist=None,
        album=None,
    )


def test_ffprobe_failure_raises_structured_exception() -> None:
    with pytest.raises(FFprobeError) as exc_info:
        extract_metadata(
            "broken.flac",
            settings=Settings(ffprobe_path="ffprobe-test"),
            runner=lambda *args, **kwargs: completed(stderr="bad input", returncode=1),
        )

    assert exc_info.value.executable == "ffprobe-test"
    assert exc_info.value.returncode == 1
    assert exc_info.value.stderr == "bad input"
    assert exc_info.value.args[-1] == "broken.flac"


def test_ffprobe_invalid_json_raises_structured_exception() -> None:
    with pytest.raises(FFprobeOutputError):
        extract_metadata("song.mp3", runner=lambda *args, **kwargs: completed("not-json"))


def test_generate_mp3_playback_uses_ffmpeg_argument_array(tmp_path: Path) -> None:
    calls: list[list[str]] = []
    output_path = tmp_path / "playback" / "track-1.mp3"

    def fake_run(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        assert kwargs["capture_output"] is True
        assert kwargs["text"] is True
        assert kwargs["check"] is False
        return completed()

    generate_mp3_playback(
        "source.flac",
        output_path,
        settings=Settings(ffmpeg_path="custom-ffmpeg"),
        runner=fake_run,
    )

    assert output_path.parent.exists()
    assert calls == [
        [
            "custom-ffmpeg",
            "-y",
            "-i",
            "source.flac",
            "-vn",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "192k",
            str(output_path),
        ]
    ]


def test_ffmpeg_failure_raises_structured_exception(tmp_path: Path) -> None:
    with pytest.raises(FFmpegError) as exc_info:
        generate_mp3_playback(
            "source.ogg",
            tmp_path / "playback.mp3",
            settings=Settings(ffmpeg_path="ffmpeg-test"),
            runner=lambda *args, **kwargs: completed(stderr="codec error", returncode=1),
        )

    assert exc_info.value.executable == "ffmpeg-test"
    assert exc_info.value.returncode == 1
    assert exc_info.value.stderr == "codec error"
    assert exc_info.value.args[0] == "ffmpeg-test"
