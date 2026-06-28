# Android Playback Queue Performance Incident

Date: 2026-06-27

This note records a real Android performance regression found after V2.2
playback queue work. Keep it as a debugging checklist for future playback,
Media3 service, and queue changes.

## Symptom

On Android, the app scrolled smoothly immediately after launch. After starting
one track or starting a playlist queue, the whole app became sluggish and
scrolling dropped frames. The issue was most visible after opening a playlist
and tapping sequence play.

## Diagnosis

The first suspicion was high-frequency Compose recomposition from playback
position updates. That was a partial risk, but it was not the root cause.

Useful checks:

```powershell
adb shell pidof com.easymusic.app
adb shell top -H -b -n 3 -d 1 -p <pid>
adb shell dumpsys gfxinfo com.easymusic.app
adb logcat -d -v time -t 800 | Select-String -Pattern 'NotificationService|NotifySyncService|OplusFgs|MediaPlayerData|com.easymusic.app'
adb shell dumpsys notification --noredact | Select-String -Pattern 'com.easymusic.app|intercepted: 0\|com.easymusic.app'
```

Observed before the fix:

- App process CPU rose to roughly 75% while playing.
- Main thread `m.easymusic.app` stayed around 50% CPU.
- `gfxinfo` reported heavy jank after queue playback, with many slow UI-thread
  frames.
- ColorOS/Oplus notification logs showed repeated media notification updates.
- `dumpsys notification` showed entries for notification id `1001` roughly
  every 200ms.

Media3 source inspection showed `MediaNotificationManager` does not normally
refresh notifications on every playback position tick. It updates for playback
state, play-when-ready, media metadata, timeline, and notification refresh
events. That made an app-side notification update loop more likely than a
normal progress update.

## Root Cause

`EasyMusicPlaybackService.onStartCommand()` manually called:

```kotlin
onUpdateNotification(session, true)
```

Media3 already starts and updates the foreground media notification when play is
requested and when relevant player events change. Calling `onUpdateNotification`
from `onStartCommand` created a feedback loop:

1. Media3 updates or starts the foreground notification.
2. The notification flow starts the playback service.
3. `onStartCommand` manually updates the notification again.
4. The system media notification stack processes another update and the cycle
   repeats.

On ColorOS/Oplus this was especially expensive because each media notification
update triggered additional SystemUI media-card work.

## Fix

Remove the manual notification update from
`EasyMusicPlaybackService.onStartCommand()` and let `MediaSessionService` own
the foreground notification lifecycle.

Also keep list screens from observing position-only playback updates:

- Derive a compact `PlaybackUiSummary` from `PlayerUiState`.
- Use `map { toPlaybackUiSummary() }.distinctUntilChanged()` for library,
  playlist, and track-detail highlight state.
- Let only the mini player and Now Playing surfaces observe full playback
  position.

## Verification

Checks run after the fix:

```powershell
cd android
.\gradlew.bat test
.\gradlew.bat build
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Manual device path:

1. Force-stop and relaunch the app.
2. Open Playlists.
3. Open playlist `MC1`.
4. Tap sequence play.
5. Return to Library and scroll.
6. Sample `top -H`, `gfxinfo`, logcat, and notification state.

Observed after the fix:

- Main thread fell from sustained 50%+ CPU to roughly 3% to 7% while idle
  playback continued.
- The 200ms notification enqueue pattern disappeared.
- Remaining CPU was mostly ExoPlayer playback and codec work.
- Scrolling no longer matched the original sustained main-thread saturation
  failure mode.

## Prevention

- Do not call `onUpdateNotification` from `MediaSessionService.onStartCommand`.
- Prefer Media3's `MediaSessionService` notification lifecycle unless there is
  a measured reason to customize it.
- If playback causes global UI jank, check thread-level CPU first with
  `top -H`; do not assume Compose recomposition is the only culprit.
- For list surfaces, observe stable playback summary state instead of full
  playback position ticks.
- On OEM Android builds, inspect notification logs because media notifications
  may trigger heavy SystemUI work outside the app's visible UI.
