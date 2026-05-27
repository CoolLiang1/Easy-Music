from collections.abc import Iterator
from pathlib import Path

from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse


_CHUNK_SIZE = 64 * 1024


def stream_file_response(
    path: Path,
    range_header: str | None,
    *,
    media_type: str,
) -> StreamingResponse:
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Playback file not found.",
        )

    file_size = path.stat().st_size
    start, end, response_status = _parse_range_header(range_header, file_size)
    content_length = end - start + 1
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(content_length),
    }
    if response_status == status.HTTP_206_PARTIAL_CONTENT:
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"

    return StreamingResponse(
        _iter_file(path, start, content_length),
        status_code=response_status,
        media_type=media_type,
        headers=headers,
    )


def _parse_range_header(range_header: str | None, file_size: int) -> tuple[int, int, int]:
    if file_size <= 0:
        return 0, -1, status.HTTP_200_OK

    if not range_header:
        return 0, file_size - 1, status.HTTP_200_OK

    unit, separator, range_spec = range_header.partition("=")
    if separator != "=" or unit.strip().lower() != "bytes" or "," in range_spec:
        raise _range_not_satisfiable(file_size)

    start_text, separator, end_text = range_spec.strip().partition("-")
    if separator != "-":
        raise _range_not_satisfiable(file_size)

    try:
        if start_text == "":
            suffix_length = int(end_text)
            if suffix_length <= 0:
                raise ValueError
            start = max(file_size - suffix_length, 0)
            end = file_size - 1
        else:
            start = int(start_text)
            end = int(end_text) if end_text else file_size - 1
    except ValueError as exc:
        raise _range_not_satisfiable(file_size) from exc

    if start < 0 or end < start or start >= file_size:
        raise _range_not_satisfiable(file_size)

    return start, min(end, file_size - 1), status.HTTP_206_PARTIAL_CONTENT


def _range_not_satisfiable(file_size: int) -> HTTPException:
    return HTTPException(
        status_code=416,
        detail="Requested Range Not Satisfiable.",
        headers={"Content-Range": f"bytes */{file_size}"},
    )


def _iter_file(path: Path, start: int, content_length: int) -> Iterator[bytes]:
    with path.open("rb") as file:
        file.seek(start)
        remaining = content_length
        while remaining > 0:
            chunk = file.read(min(_CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk
