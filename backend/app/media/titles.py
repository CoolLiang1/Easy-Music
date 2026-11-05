"""Deterministic clean-up of titles derived from upload or import file names.

Files ripped from video sites carry quality marks, platform noise and
numbering in their names. This removes only noise that is safe to drop
without knowing the song; deciding the artist or the real title is left to
the owner-reviewed AI metadata clean-up. Bracketed text without noise, such
as a source work (``【头文字D】``) or a version (``(Live)``), is kept.
"""

from __future__ import annotations

import re

# Lower-case fragments that mark a bracketed segment as upload noise.
_NOISE_FRAGMENTS = (
    "4k", "8k", "1080p", "720p", "2160p", "60帧", "60fps", "hi-res", "hires",
    "高音质", "高品质", "无损", "无损音质", "修复", "高清", "超清", "蓝光", "杜比",
    "官方", "official", "lyric", "lyrics", "歌词", "字幕", "中字", "中日", "中英",
    "完整版", "抖音", "热门", "循环", "无广告", "music video", "mv", "pv",
    "320k", "flac", "动态歌词", "纯享",
)
# Whole tokens (outside brackets) that are always noise.
_NOISE_TOKENS = {
    "高音质", "高品质", "无损", "无损音质", "完整版", "官方mv", "mv", "pv", "1080p",
    "720p", "4k", "4k修复", "8k", "60帧", "高清", "超清", "中日字幕", "中日歌词",
    "中英字幕", "动态歌词", "抖音", "热门", "抖音热门", "无广告", "纯享版", "320k", "flac",
}
_NOISE_PHRASES = re.compile(
    r"\b(?:official\s+(?:music\s+)?(?:video|audio|mv)|lyric\s+video|music\s+video)\b",
    re.IGNORECASE,
)
_DURATION_TOKEN = re.compile(r"^\d+(?:\.\d+)?(?:小时|分钟|h)(?:循环|版)?$", re.IGNORECASE)
_VIDEO_ID = re.compile(r"\b(?:BV[0-9A-Za-z]{10}|av\d{5,})\b")
_BRACKETS = re.compile(r"【[^【】]*】|\[[^\[\]]*\]|\([^()]*\)|（[^（）]*）")
# "01 ", "01. ", "1. ", "1、" — not a bare "2 " so titles like "2 Become 1" survive.
_TRACK_NUMBER = re.compile(r"^(?:0\d{1,2}(?:\s*[.、\-]\s*|\s+)|\d{1,3}\s*[.、]\s*)(?=\S)")
_SPACES = re.compile(r"\s+")
_EDGE_SEPARATORS = " -_~|·,，"


def clean_filename_title(stem: str) -> str:
    """Return *stem* with upload noise removed, or *stem* itself if nothing is left."""
    original = _SPACES.sub(" ", stem).strip()
    text = original.replace("_", " ")
    text = _VIDEO_ID.sub(" ", text)
    text = _BRACKETS.sub(_drop_noise_bracket, text)
    text = _NOISE_PHRASES.sub(" ", text)
    tokens = [token for token in text.split() if not _is_noise_token(token)]
    text = " ".join(tokens)
    text = _TRACK_NUMBER.sub("", text)
    text = _SPACES.sub(" ", text).strip(_EDGE_SEPARATORS).strip()
    return text or original


def _drop_noise_bracket(match: re.Match[str]) -> str:
    inner = match.group(0)[1:-1].casefold()
    if not inner.strip() or any(_contains_fragment(inner, fragment) for fragment in _NOISE_FRAGMENTS):
        return " "
    return match.group(0)


def _contains_fragment(text: str, fragment: str) -> bool:
    if fragment.isascii() and fragment.isalnum():
        # Short ASCII marks such as "mv" must be whole words, not part of "MyGO".
        return re.search(rf"(?<![a-z0-9]){re.escape(fragment)}(?![a-z0-9])", text) is not None
    return fragment in text


def _is_noise_token(token: str) -> bool:
    folded = token.casefold()
    return folded in _NOISE_TOKENS or _DURATION_TOKEN.match(folded) is not None
