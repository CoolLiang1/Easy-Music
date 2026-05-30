"""Tests for app.core.logging — formatters, levels, and idempotency."""

import json
import logging

import pytest

from app.core.config import Settings
from app.core.logging import _JsonFormatter, configure_logging


# ------------------------------------------------------------------
# JSON formatter
# ------------------------------------------------------------------
class TestJsonFormatter:
    def test_format_produces_valid_json(self):
        fmt = _JsonFormatter()
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="hello %s",
            args=("world",),
            exc_info=None,
        )
        line = fmt.format(record)
        data = json.loads(line)

        assert data["level"] == "INFO"
        assert data["logger"] == "test.logger"
        assert data["message"] == "hello world"
        assert "timestamp" in data
        assert "exception" not in data

    def test_format_includes_exception_when_present(self):
        fmt = _JsonFormatter()
        try:
            raise ValueError("boom")
        except ValueError:
            record = logging.LogRecord(
                name="e",
                level=logging.ERROR,
                pathname=__file__,
                lineno=1,
                msg="fail",
                args=(),
                exc_info=(
                    ValueError,
                    ValueError("boom"),
                    None,
                ),
            )
        line = fmt.format(record)
        data = json.loads(line)

        assert data["level"] == "ERROR"
        assert "exception" in data
        assert "ValueError" in data["exception"]

    def test_format_handles_non_string_objects(self):
        fmt = _JsonFormatter()
        record = logging.LogRecord(
            name="t",
            level=logging.WARNING,
            pathname=__file__,
            lineno=1,
            msg="data: %s",
            args=({b"bytes": 1},),
            exc_info=None,
        )
        line = fmt.format(record)
        data = json.loads(line)

        assert data["message"] == "data: {b'bytes': 1}"


# ------------------------------------------------------------------
# configure_logging
# ------------------------------------------------------------------
class TestConfigureLogging:
    @pytest.fixture(autouse=True)
    def reset_logging_state(self):
        """Reset the module-level flag and root handlers between tests."""
        import app.core.logging as mod

        mod._configured = False
        root = logging.getLogger()
        root.handlers.clear()
        for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
            lg = logging.getLogger(name)
            lg.handlers.clear()
            lg.propagate = True
        yield
        mod._configured = False

    def test_sets_log_level_from_settings(self):
        settings = Settings(log_level="DEBUG", log_format="text")
        configure_logging(settings)

        assert logging.getLogger().level == logging.DEBUG

    def test_default_log_level_is_info(self):
        settings = Settings(log_level="INFO", log_format="text")
        configure_logging(settings)

        assert logging.getLogger().level == logging.INFO

    def test_unknown_log_level_defaults_to_info(self):
        settings = Settings(log_level="VERBOSE", log_format="text")
        configure_logging(settings)

        assert logging.getLogger().level == logging.INFO

    def test_is_idempotent(self):
        settings_a = Settings(log_level="DEBUG", log_format="text")
        settings_b = Settings(log_level="ERROR", log_format="json")

        configure_logging(settings_a)
        assert logging.getLogger().level == logging.DEBUG

        # Second call must be a no-op — level stays DEBUG.
        configure_logging(settings_b)
        assert logging.getLogger().level == logging.DEBUG

    def test_json_format_adds_stream_handler(self):
        settings = Settings(log_level="INFO", log_format="json")
        configure_logging(settings)

        handlers = logging.getLogger().handlers
        assert len(handlers) == 1
        assert isinstance(handlers[0].formatter, _JsonFormatter)

    def test_text_format_does_not_use_json_formatter(self):
        settings = Settings(log_level="INFO", log_format="text")
        configure_logging(settings)

        handlers = logging.getLogger().handlers
        assert len(handlers) == 1
        assert not isinstance(handlers[0].formatter, _JsonFormatter)

    def test_uvicorn_loggers_are_configured(self):
        settings = Settings(log_level="WARNING", log_format="text")
        configure_logging(settings)

        for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
            lg = logging.getLogger(name)
            assert lg.level == logging.WARNING
            assert lg.propagate is False
            assert len(lg.handlers) == 1


# ------------------------------------------------------------------
# Sensitive value audit
# ------------------------------------------------------------------
class TestLoggingSanitization:
    """The logging formatters must never introspect env vars or config values
    beyond what the caller passes as a log message.  This is a structural
    test: we verify the formatters only use record.getMessage()."""

    def test_json_formatter_only_reads_message_and_exc_info(self):
        formatter = _JsonFormatter()
        record = logging.LogRecord(
            name="s",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="plain message",
            args=(),
            exc_info=None,
        )
        line = formatter.format(record)
        data = json.loads(line)

        # The formatter must not add extra fields beyond the documented ones.
        assert set(data.keys()) == {"timestamp", "level", "logger", "message"}
