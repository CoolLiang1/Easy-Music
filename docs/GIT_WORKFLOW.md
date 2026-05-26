# Git Workflow

## Branches

- `main`: stable baseline. Keep it releasable and protected once the repository is pushed to GitHub.
- `develop`: integration branch for completed project tasks before they are promoted to `main`.
- `feature/<short-name>`: focused implementation branches created from `develop`.
- `fix/<short-name>`: focused bug-fix branches created from `develop` unless the fix must patch `main` directly.

## Local Flow

1. Start new work from `develop`.
2. Create a focused branch, for example `feature/backend-skeleton`.
3. Complete one task at a time.
4. Run the relevant checks for that task.
5. Inspect `git diff`.
6. Commit with a concise message.
7. Merge back into `develop` after review.
8. Merge `develop` into `main` only for stable milestones.

## Commit Style

Use short conventional prefixes when they fit:

- `docs:` documentation-only updates
- `chore:` repository setup and maintenance
- `feat:` user-visible functionality
- `fix:` bug fixes
- `test:` automated tests
- `refactor:` behavior-preserving code changes

## Current Project Notes

The repository currently contains planning documents only. Backend, Web, Android, and deployment directories should be created by their scoped Phase 0 tasks rather than as empty placeholders.
