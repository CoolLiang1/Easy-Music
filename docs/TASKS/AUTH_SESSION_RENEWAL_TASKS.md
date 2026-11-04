# Auth Session Renewal Tasks

Status: Implemented
Last updated: 2026-11-04
Canonical role: task
Related: `docs/ACCEPTANCE/AUTH_SESSION_RENEWAL_ACCEPTANCE.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`
Pair: `docs/ACCEPTANCE/AUTH_SESSION_RENEWAL_ACCEPTANCE.md`

## Goal

The owner reported having to re-enter the username and password repeatedly on
Web and Android. The single 24-hour access token had no renewal path, so every
expiry forced a full login. This slice keeps a signed-in client signed in, like
an ordinary app, until the owner signs out or does not open it for the refresh
window.

## Scope

In scope:

- Backend opaque, rotating refresh tokens stored as SHA-256 hashes, with
  `POST /api/auth/refresh` and refresh-token revocation on logout.
- Shorter default access-token lifetime (60 minutes) now that renewal is silent.
- Web: store the refresh token, renew once on `401` and retry, share one
  refresh between concurrent requests, keep the stored session when the server
  is unreachable.
- Android: store the refresh token in DataStore, renew once on `401` in
  `ApiClient`, renew before Media3 streaming and cache downloads when the token
  is about to expire, through one process-wide refresher.

Out of scope:

- Login rate limiting or lockout.
- Password change, multiple devices list, or session management UI.
- Multi-user support.

## Dependencies And Contracts

- `POST /api/auth/login` response gains `expires_in`, `refresh_token`, and
  `refresh_token_expires_at`; existing `access_token` and `token_type` are
  unchanged, so older clients keep working until their access token expires.
- `POST /api/auth/logout` accepts an optional `{"refresh_token": ...}` body.
  Without it, the previous bearer-token behavior is unchanged.
- New Alembic revision `20261104_0013` creates `refresh_tokens`.
- New optional setting `REFRESH_TOKEN_EXPIRE_DAYS` (default 30);
  `ACCESS_TOKEN_EXPIRE_MINUTES` default and templates change from 1440 to 60.

## Implementation Tasks

- [x] `RefreshToken` model, migration, and `app/auth/refresh_tokens.py`
  (issue, rotate with 60-second grace, revoke, stale-row cleanup).
- [x] Auth routes: login returns the pair, `/refresh`, logout revocation.
- [x] Backend tests for rotation, grace window, expiry, unknown token, logout
  without access token, and cleanup.
- [x] Web token storage, `apiRequest` retry hook, single-flight refresh in
  `AuthProvider`, upload and cover requests, login page no longer signs out on
  mount.
- [x] Android `AuthTokenStore` refresh token, `AuthApi.refresh`,
  `AuthTokenRefresher`, `ApiClient` retry, `EasyMusicApplication` install,
  Media3 `ResolvingDataSource` header, cache download renewal, logout
  revocation.
- [x] Android unit tests for the refresher.
- [x] Env templates, production compose defaults, and operational docs.

## Acceptance Criteria

- After the access token expires, Web and Android continue working without a
  login prompt while the refresh token is valid.
- Concurrent requests that hit an expired token trigger one refresh.
- A rejected refresh token signs the client out; a network failure does not.
- Signing out revokes the refresh token on the server.
- Android playback that outlives the access token keeps streaming.

## Verification Plan

- Automated: backend `pytest`, Web `npm run build`, Android
  `testDebugUnitTest assembleDebug`.
- Manual: local browser smoke with a 1-minute access token; Alembic upgrade and
  downgrade on PostgreSQL; Android emulator/device run across token expiry.
- Environment/device requirements: Android device or emulator for the playback
  and background-sync criteria.

## Documentation Impact

- [x] Task status and completion notes
- [x] Acceptance evidence
- [x] Roadmap status or next work
- [x] English and Chinese README summaries
- [x] PRD / architecture / specification
- [x] Development / environment / deployment / API testing
- [ ] AGENTS.md stable rules

N/A reasons:

- PRD: single-user login was already in scope; no product scope change.
- Specification: no subsystem spec exists for auth; the contract lives in
  `docs/ARCHITECTURE.md`.
- `docs/DEVELOPMENT.md`: no new setup step or command; the existing
  `alembic upgrade head` step applies the new migration.
- AGENTS.md: no new cross-cutting pitfall beyond what the architecture section
  records.

## Progress Notes

- 2026-11-04: Implemented on `feature/auth-refresh-tokens`. Android device
  verification and owner daily use remain; see the acceptance record.
