# Environment

This document describes the planned configuration categories for Easy Music.

No real secrets, tokens, passwords, private paths, or production credentials should be committed. The repository does not yet contain active application configuration or config loading code.

## Current Status

Backend, Web, Android, and deployment configuration are planned but not implemented yet. Environment variable names and example values will be introduced by the scoped environment task.

## Planned Configuration Categories

### Database

Database configuration will cover PostgreSQL database name, user, password, host, port, and application connection URL.

Development values should be safe placeholders. Deployment values should be supplied outside version control.

### Application Secrets

Application secret configuration will cover signing keys, token lifetimes, and other security-sensitive backend settings.

Secrets must be unique per deployment and must not be committed.

### Media Storage

Media storage configuration will cover paths for preserved original uploads, generated playback files, covers, and upload size limits.

Paths should be configurable so local development and server deployment can use different storage locations.

### FFmpeg

FFmpeg configuration will cover executable paths or command names for `ffmpeg` and `ffprobe`.

These settings will support metadata extraction and playback MP3 generation once media processing is implemented.

### Client Access

Client access configuration will cover allowed origins and any future API base URL settings required by Web and Android clients.

Development settings should be local and explicit. Production settings should be narrowed to the deployed domains.

### AI Provider

AI provider configuration is planned for later recommendation and tag suggestion work. It is not an active Phase 0 requirement.

## Rules

- Commit only development-safe examples.
- Do not commit `.env` files with real values.
- Do not hard-code machine-specific absolute paths.
- Do not require AI provider credentials before the AI assistant scope begins.
