"""Production logging configuration.

Configures the Python root logger and uvicorn loggers so every log line is
written to stdout in either human-readable text or machine-readable JSON,
controlled by the LOG_LEVEL and LOG_FORMAT settings.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.config import Settings

_configured: bool = False


class _JsonFormatter(logging.Formatter):
    """Emit each log record as a single-line JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0] is not None:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


_TEXT_FMT = "%(asctime)s [%(levelname)-8s] %(name)s: %(message)s"
_TEXT_DATEFMT = "%Y-%m-%dT%H:%M:%S"

_UVICORN_LOGGER_NAMES = ("uvicorn", "uvicorn.access", "uvicorn.error")


def configure_logging(settings: Settings) -> None:
    """Idempotent logging setup called once during application startup.

    * When *settings.log_format* is ``"json"``, every log line is a JSON
      object with ``timestamp``, ``level``, ``logger``, and ``message``.
    * When it is ``"text"`` (the default), output matches the familiar
      uvicorn style.

    Uvicorn access and error loggers are aligned to the same level and
    format so nothing is silently dropped or double-formatted.
    """
    global _configured
    if _configured:
        return
    _configured = True

    level = _resolve_level(settings.log_level)
    formatter = _build_formatter(settings.log_format)

    # --- root logger ----------------------------------------------------
    root = logging.getLogger()
    root.setLevel(level)
    _replace_handlers(root, formatter)

    # --- uvicorn loggers ------------------------------------------------
    for name in _UVICORN_LOGGER_NAMES:
        lg = logging.getLogger(name)
        lg.setLevel(level)
        _replace_handlers(lg, formatter)
        lg.propagate = False

    root.info(
        "Logging configured: level=%s format=%s",
        settings.log_level.upper(),
        settings.log_format,
    )


# ------------------------------------------------------------------
# helpers
# ------------------------------------------------------------------


def _resolve_level(name: str) -> int:
    upper = name.upper()
    if upper == "DEBUG":
        return logging.DEBUG
    if upper == "WARNING":
        return logging.WARNING
    if upper == "ERROR":
        return logging.ERROR
    if upper == "CRITICAL":
        return logging.CRITICAL
    return logging.INFO  # default


def _build_formatter(fmt: str) -> logging.Formatter:
    if fmt == "json":
        return _JsonFormatter()
    return logging.Formatter(fmt=_TEXT_FMT, datefmt=_TEXT_DATEFMT)


def _replace_handlers(
    logger: logging.Logger, formatter: logging.Formatter
) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    logger.handlers.clear()
    logger.addHandler(handler)
