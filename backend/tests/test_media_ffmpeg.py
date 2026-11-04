from pathlib import Path
import subprocess

import pytest

from app.core.config import Settings
from app.media.ffmpeg import (
    MAX_PLAYBACK_BOOST_DB,
    FFmpegError,
    FFprobeError,
    FFprobeOutputError,
    LoudnessMeasurement,
    compute_playback_gain_db,
    generate_mp3_playback,
    measure_loudness,
)
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
            "320k",
            str(output_path.with_name("track-1.partial.mp3")),
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


LOUDNORM_STDERR = """
[Parsed_loudnorm_0 @ 0000000000] 
{
	"input_i" : "-9.84",
	"input_tp" : "0.31",
	"input_lra" : "6.10",
	"input_thresh" : "-20.05",
	"output_i" : "-16.01",
	"output_tp" : "-1.00",
	"output_lra" : "5.20",
	"output_thresh" : "-26.17",
	"normalization_type" : "dynamic",
	"target_offset" : "0.01"
}
"""


def test_measure_loudness_parses_loudnorm_json_from_stderr() -> None:
    calls: list[list[str]] = []

    def fake_run(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        return completed(stdout="", stderr="Input #0, flac\n" + LOUDNORM_STDERR)

    measurement = measure_loudness(
        "source.flac",
        settings=Settings(ffmpeg_path="custom-ffmpeg"),
        runner=fake_run,
    )

    assert measurement == LoudnessMeasurement(integrated_lufs=-9.84, true_peak_dbtp=0.31)
    assert calls == [
        [
            "custom-ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            "source.flac",
            "-vn",
            "-af",
            "loudnorm=print_format=json",
            "-f",
            "null",
            "-",
        ]
    ]


def test_measure_loudness_treats_silence_as_unmeasured() -> None:
    stderr = '{\n"input_i" : "-inf",\n"input_tp" : "-inf"\n}'

    measurement = measure_loudness(
        "silence.wav",
        runner=lambda *args, **kwargs: completed(stderr=stderr),
    )

    assert measurement == LoudnessMeasurement(integrated_lufs=None, true_peak_dbtp=None)


def test_measure_loudness_without_json_raises() -> None:
    with pytest.raises(FFmpegError):
        measure_loudness("song.mp3", runner=lambda *args, **kwargs: completed(stderr="no summary"))


def test_measure_loudness_failure_raises_structured_exception() -> None:
    with pytest.raises(FFmpegError) as exc_info:
        measure_loudness(
            "broken.mp3",
            runner=lambda *args, **kwargs: completed(stderr="bad input", returncode=1),
        )

    assert exc_info.value.returncode == 1
    assert exc_info.value.stderr == "bad input"


@pytest.mark.parametrize(
    ("integrated", "peak", "expected"),
    [
        # Loud master: attenuate straight to target.
        (-9.84, 0.31, -6.16),
        # Quiet track with headroom: boost to target.
        (-24.0, -12.0, 8.0),
        # Quiet track with a hot peak: boost only up to the peak ceiling.
        (-24.0, -3.0, 2.0),
        # Unknown peak: plain target gain.
        (-20.0, None, 4.0),
        # Near-silent recording: boost is capped.
        (-60.0, -50.0, MAX_PLAYBACK_BOOST_DB),
        # Silence or unmeasurable: no gain.
        (None, None, 0.0),
    ],
)
def test_compute_playback_gain_db(
    integrated: float | None,
    peak: float | None,
    expected: float,
) -> None:
    gain = compute_playback_gain_db(
        LoudnessMeasurement(integrated_lufs=integrated, true_peak_dbtp=peak),
        target_lufs=-16.0,
        max_true_peak_dbtp=-1.0,
    )

    assert gain == pytest.approx(expected)


def test_generate_mp3_playback_applies_gain_and_replaces_destination(tmp_path: Path) -> None:
    calls: list[list[str]] = []
    output_path = tmp_path / "playback.mp3"
    output_path.write_bytes(b"old")

    def fake_run(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        Path(args[-1]).write_bytes(b"new")
        return completed()

    generate_mp3_playback("source.flac", output_path, runner=fake_run, gain_db=-6.16)

    assert calls[0][5:7] == ["-af", "volume=-6.16dB"]
    assert output_path.read_bytes() == b"new"
    assert not (tmp_path / "playback.partial.mp3").exists()


def test_generate_mp3_playback_skips_inaudible_gain(tmp_path: Path) -> None:
    calls: list[list[str]] = []

    def fake_run(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        return completed()

    generate_mp3_playback("source.flac", tmp_path / "playback.mp3", runner=fake_run, gain_db=0.01)

    assert "-af" not in calls[0]


def test_generate_mp3_playback_failure_keeps_existing_playback(tmp_path: Path) -> None:
    output_path = tmp_path / "playback.mp3"
    output_path.write_bytes(b"old")

    def fake_run(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        Path(args[-1]).write_bytes(b"partial")
        return completed(stderr="codec error", returncode=1)

    with pytest.raises(FFmpegError):
        generate_mp3_playback("source.flac", output_path, runner=fake_run, gain_db=3.0)

    assert output_path.read_bytes() == b"old"
    assert not (tmp_path / "playback.partial.mp3").exists()
