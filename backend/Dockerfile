FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && apt-get clean

# Create a non-root user with a fixed UID so host bind-mount permissions
# are predictable.  UID 1100 is chosen to avoid collisions with typical
# host system users (< 1000) and regular human users (>= 1000).
RUN addgroup --system --gid 1100 appgroup \
    && adduser --system --no-create-home --ingroup appgroup --uid 1100 appuser

COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

# Create media directories with non-root ownership so named volumes
# (dev compose) and bind mounts (prod compose) both work correctly.
RUN mkdir -p /app/media/originals /app/media/playback /app/media/covers \
    && chown -R appuser:appgroup /app/media

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
