# Auth Session Renewal Acceptance

Status: Implemented
Last updated: 2026-11-04
Canonical role: acceptance
Related: `docs/TASKS/AUTH_SESSION_RENEWAL_TASKS.md`, `docs/ROADMAP.md`
Pair: `docs/TASKS/AUTH_SESSION_RENEWAL_TASKS.md`
Decision: Implemented

## Accepted Scope

- Backend refresh-token issue, rotation, revocation, and migration.
- Web silent renewal and sign-out revocation.
- Android silent renewal for API calls, Media3 streaming, and cache downloads.

## Environment

- Branch/commit: `feature/auth-refresh-tokens` (uncommitted working tree at
  verification time, based on `6699094`).
- Date and timezone: 2026-11-04, local Windows 11 machine.
- Runtime, device, browser, or OS versions: backend `.venv` Python with
  SQLite tests; local Docker Compose PostgreSQL for the migration; Claude
  desktop app browser pane for the Web smoke; Gradle Robolectric unit tests.
- Relevant configuration with secrets redacted: Web smoke API used a throwaway
  SQLite database with `ACCESS_TOKEN_EXPIRE_MINUTES=1` and a generated test
  user.

## Automated Evidence

- [x] Command: `.\.venv\Scripts\python.exe -m pytest tests/test_auth_api.py`
  - Result: 12 passed (8 new refresh/logout tests).
- [x] Command: `.\.venv\Scripts\python.exe -m pytest` (backend)
  - Result: 372 passed, 2 skipped.
- [x] Command: `npm run build` (Web)
  - Result: typecheck and Vite build passed.
- [x] Command: `.\gradlew.bat testDebugUnitTest assembleDebug` (Android)
  - Result: build successful; 79 unit tests passed, including 7
    `AuthTokenRefresherTest` cases.
- [x] Command: `docker compose exec api alembic upgrade head`, then
  `alembic downgrade -1` and `upgrade head` on the local PostgreSQL
  - Result: `20261104_0013` applied, reverted, and re-applied; table, unique
    hash index, and cascade foreign key present.

## Manual Evidence

- [x] Flow: Web login, wait past the 1-minute access token, full page load.
  - Expected: stays signed in; one refresh call.
  - Observed: two concurrent `GET /api/auth/me` returned `401`, a single
    `POST /api/auth/refresh` returned `200`, both retries returned `200`;
    stored tokens rotated; no login page.
- [x] Flow: Web in-app navigation after another expiry.
  - Expected: page loads without a login prompt.
  - Observed: Playlists page loaded; tokens rotated again.
- [x] Flow: Web sign out, then reuse the previous refresh token.
  - Expected: local tokens cleared and server rejects the old token.
  - Observed: redirected to `/login`, storage empty, refresh returned `401`.
- [ ] Flow: Android login, wait past access-token expiry, browse and play.
  - Expected: no login prompt; playback continues across expiry.
  - Observed: not run (no emulator or device session in this change).
- [ ] Flow: owner daily use on the real deployment for several days.
  - Expected: no repeated username/password prompts.
  - Observed: not run.

## Known Gaps

- Android behavior is covered by unit tests and a successful build only;
  emulator or device verification of playback across expiry is outstanding.
- Production rollout needs `alembic upgrade head` and a rebuilt Android APK.
  Older installed APKs ignore the refresh token, so lower
  `ACCESS_TOKEN_EXPIRE_MINUTES` in `.env.production` only after updating the
  APK.

## Acceptance Decision

Current decision: `Implemented`.

Promote to `Accepted` only when every required criterion is satisfied and the
evidence above is recorded. Otherwise use `Implemented`, `Deferred`, or another
allowed status that matches the evidence.
