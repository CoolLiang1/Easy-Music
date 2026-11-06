# Easy Music Roadmap

This is the only status register. Other documents link here instead of
repeating status. How records and statuses work is described in the
[Documentation Guide](README.md).

## Direction

Easy Music is a private, single-owner application. The goal is a stable system
the owner can understand, operate, and change.

- Work is chosen one problem at a time, from friction the owner meets in real
  use. There is no milestone plan.
- Bug fixes, security, and data safety come before new features.
- Each change is the smallest maintainable one that solves the problem.

## Open Work

Every slice below is on `main` and passed its automated checks. Each one waits
for an owner check in real use. When the owner reports a result, record it in
the slice's acceptance record and move the row to History.

| Slice | Status | Record | What is left |
| --- | --- | --- | --- |
| Web UI redesign | Implemented | [task](TASKS/WEB_UI_REDESIGN_TASKS.md) / [acceptance](ACCEPTANCE/WEB_UI_REDESIGN_ACCEPTANCE.md) | Owner review on the real library. |
| V2.2 playback queue | Implemented | [task](TASKS/V2_2_PLAYBACK_QUEUE_TASKS.md) / [acceptance](ACCEPTANCE/V2_2_PLAYBACK_QUEUE_ACCEPTANCE.md) | Web queue regression after later playback-control fixes; check it with the Web UI redesign review. |
| Android UI redesign | Implemented | [task](TASKS/ANDROID_UI_REDESIGN_TASKS.md) / [acceptance](ACCEPTANCE/ANDROID_UI_REDESIGN_ACCEPTANCE.md) | Review on a real phone. |
| Auth session renewal | Implemented | [task](TASKS/AUTH_SESSION_RENEWAL_TASKS.md) / [acceptance](ACCEPTANCE/AUTH_SESSION_RENEWAL_ACCEPTANCE.md) | Android device check; no unexpected sign-outs in daily use. |
| Playback loudness normalization | Implemented | [task](TASKS/PLAYBACK_LOUDNESS_NORMALIZATION_TASKS.md) / [acceptance](ACCEPTANCE/PLAYBACK_LOUDNESS_NORMALIZATION_ACCEPTANCE.md) | Re-cache Android offline tracks; owner listening check. The production backfill is done. |
| AI auto-tagging | Implemented | [task](TASKS/AI_AUTO_TAGGING_TASKS.md) / [acceptance](ACCEPTANCE/AI_AUTO_TAGGING_ACCEPTANCE.md) | PostgreSQL migration check, a real-provider run (worker or the Web "AI 打标签" button), owner review of tag quality. |
| Warm theme from the app icon | Implemented | [task](TASKS/WARM_THEME_TASKS.md) | Owner check on Web and on the real phone (light, dark, mini player). |
| App icon redesign | Implemented | [task](TASKS/APP_ICON_REDESIGN.md) | Check the launcher icon on the real phone and the Web icons in daily use. |
| AI metadata clean-up | Implemented | [task](TASKS/AI_METADATA_CLEANUP.md) | Owner runs 标题与艺人 on the production library and reviews the suggestions. |
| Automatic covers | Implemented | [task](TASKS/AUTO_COVERS.md) | Run the cover backfill on the server; owner look at generated covers on Web and phone. |
| Deploy update script | Implemented | [task](TASKS/DEPLOY_UPDATE_SCRIPT_TASKS.md) / [acceptance](ACCEPTANCE/DEPLOY_UPDATE_SCRIPT_ACCEPTANCE.md) | First run on the real server. |
| First Ubuntu production smoke | Implemented | [acceptance](ACCEPTANCE/UBUNTU_PRODUCTION_SMOKE_ACCEPTANCE.md) | Record the server's Ubuntu release (`lsb_release -a`); production has run since. |

## Candidate Next Work

Not scheduled. Each becomes a slice only when the owner picks it.

- **Media backup.** Database dumps do not include original audio or covers
  (see [DEPLOYMENT.md](DEPLOYMENT.md#step-10---back-up-the-database)), so a
  disk failure loses the library. An off-host copy of originals and covers,
  plus one restore drill. The owner deferred this on 2026-11-04.
- **Continuous listening.** A recommendation returns at most three tracks and
  the queue then ends; there is no "keep playing this scene" mode.
- **Login throttling.** `POST /api/auth/login` has no limit on failed attempts
  on a public host.

Parked ideas, not planned: automatic audio analysis (BPM, vocals, language,
energy), embedding-based recommendation, Bilibili metadata import,
multi-user support, a Windows desktop client.

## History

| Milestone | Status | Record |
| --- | --- | --- |
| MVP Phase 0-7: backend, Web, Android playback and offline cache, recommendation, AI assistant, deployment | Accepted | [Phase 7 acceptance](ACCEPTANCE/PHASE_7_ACCEPTANCE.md) and earlier phase records |
| V1.1: batch tags, duplicate detection, cover editing, reports, recommendation explanations, revived tracks, Android shortcuts | Accepted | [V1.1 acceptance](ACCEPTANCE/V1_1_WORKFLOW_ENHANCEMENTS_ACCEPTANCE.md) |
| V2 import and video extraction | Accepted | [Import/video acceptance](ACCEPTANCE/V2_IMPORT_AND_VIDEO_ACCEPTANCE.md) |
| V2.1 playlists | Accepted | [Playlist acceptance](ACCEPTANCE/V2_1_PLAYLISTS_ACCEPTANCE.md) |
| V2 recommendation foundation: cooldown modes, feedback scoring, playlist signals | Accepted | [Recommendation acceptance](ACCEPTANCE/V2_RECOMMENDATION_FOUNDATION_ACCEPTANCE.md) |
| V2.4 tag taxonomy: `scene`, `type`, `feature` | Accepted | [Tag taxonomy acceptance](ACCEPTANCE/V2_4_TAG_TAXONOMY_ACCEPTANCE.md) |
| V2.5 AI tag suggestions | Accepted | [AI tag acceptance](ACCEPTANCE/V2_5_AI_TAG_SUGGESTIONS_V2_ACCEPTANCE.md) |
| UI optimization round 1 | Superseded | [Round 1 acceptance](ACCEPTANCE/UI_OPTIMIZATION_ROUND_1_ACCEPTANCE.md); replaced by the Web and Android UI redesigns |

The V2.6 "Stability And Listening Loop" milestone plan was dropped in July 2026
in favour of owner-driven slices. Its branch and stash are not to be resumed.
