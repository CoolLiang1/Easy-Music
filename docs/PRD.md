# Easy Music PRD

## 1. Product Positioning

Easy Music is a personal cloud music system for scenario-based listening.

It is a private, single-owner application rather than a commercial product.
Development optimizes for the owner's daily use, control, and ability to
understand and maintain the system. A broader roadmap, release program, or
platform capability is not valuable unless it solves a concrete problem the
owner has actually experienced.

It is not just a music player. Its core job is to help the user answer:

> What should I listen to right now?

It combines:

- Personal cloud music library
- Android music player
- Web management console
- AI music assistant
- Scenario-based recommendation
- Listening fatigue management

## 2. Target User

The first target user is a single owner who listens to different kinds of music while studying, working, exercising, relaxing, or sleeping.

The user currently relies heavily on background playback from video platforms, but wants a more controllable personal music library.

## 3. Core Problems

### 3.1 Music Is Managed By Files Or Favorites, But Used By Context

Traditional folders, playlists, and video favorites do not match how the user actually chooses music.

The user thinks in terms of:

- Current activity: study, work, exercise, relax, sleep
- Desired state: focus, energy, calm, healing, excitement
- Current taste: Japanese anime songs, game OST, instrumental, electronic, white noise
- Avoidance: too familiar, too noisy, vocal, recently overplayed

### 3.2 Favorites Do Not Express Listening State

A track can be liked but temporarily overplayed.

The system must distinguish:

- Like
- Dislike
- Tired of it for now
- Not suitable for this scenario
- Not today

### 3.3 Platform Links Limit Feedback And Playback Control

Jumping to an external platform makes it hard to record playback duration, skips, background playback, offline cache, and precise feedback.

Therefore Easy Music is a self-hosted cloud player, not a link-only manager.

## 4. Scope

The owner uses Easy Music daily to:

- Upload audio from the Web console, or import it from configured server
  directories, or extract it from user-provided video files.
- Keep the original files and listen to generated, loudness-normalized MP3
  playback files.
- Manage tracks, metadata, covers, source links, tags, and playlists.
- Play from Web and Android, with stable Android background playback,
  notification, lock-screen, and headset controls, and a local playback queue.
- Cache selected tracks on Android, play them offline, and sync the listening
  history later.
- Get scenario-based recommendations from tags, listening history, and
  feedback, asked for with structured tags or natural language.
- Let AI tag the library from the owner's catalogue, and correct it only where
  it is wrong.
- Use one owner login on a public HTTPS deployment.

## 5. Non-Goals

- Automatic downloading from Bilibili or any other site, including
  extracting audio from a pasted URL.
- Multiple users, sharing, social features, or public discovery.
- A native Windows desktop client.
- Full offline sync of the whole library.
- Deep audio analysis (BPM, vocals, mood, embeddings) or a machine-learning
  recommendation model.
- Letting AI choose or rank tracks.
- Commercial or SaaS product development.

## 6. Main Concepts

### 6.1 Track

Track is the core content unit.

A Track can be:

- A normal song
- A long study mix
- A white-noise audio
- A game OST
- A converted audio from a video
- Any playable audio item

Different content shapes are represented by a `content_type` field instead of separate core objects.

Example content types:

- song
- mix
- long_audio
- white_noise
- ost
- other

### 6.2 Tags

The app uses multi-dimensional tags instead of folder-like categories.

Tag groups (the owner's catalogue; these are examples):

- Scene: study, work, exercise, relax, sleep
- Type: Japanese, anime, game OST, instrumental, electronic, white noise,
  Chinese, English
- Feature: focus, energetic, calm, healing, exciting, vocal, instrumental,
  loopable, distracting, noisy

Tracks can have many tags across different groups.

### 6.3 Listening Fatigue

Listening fatigue means "temporarily reduce or avoid recommendation", not dislike.

The system supports:

- Manual cooldown: "tired of it", default 14 days
- Daily avoidance: "not today"
- Recent-play penalty
- Reappearance after cooldown

## 7. Core User Flows

### 7.1 Upload And Tag

1. User opens Web console.
2. User uploads one or more audio files.
3. Server saves original files.
4. Worker extracts metadata and generates MP3 playback files.
5. When AI auto-tagging is enabled, or when the owner presses "AI 打标签" on
   the Web Library page, tags from the owner's catalogue are applied based on
   filename and metadata. AI tags count less than owner
   tags in recommendation.
6. User corrects a wrong tag when noticing one; no per-track confirmation is
   required. Per-track AI suggestions remain available on request.
7. Titles come from cleaned file names. On the Web page "标题与艺人" the AI
   proposes a clean title and the artist for many tracks at once; the owner
   reviews the list and applies it. An unknown artist stays empty. Album is
   optional and not shown.
8. Tracks become available for recommendation and playback.

### 7.2 Android Listening

1. User opens Android app.
2. Home screen asks: "What do you want to listen to now?"
3. User can type natural language or tap quick scenarios.
4. App requests recommendations from server.
5. App shows one primary recommendation and two alternatives.
6. User plays, skips, likes, caches, or marks tired.
7. Playback and feedback events are synced to server.

### 7.3 Web Management

1. User opens Web console on Windows.
2. User manages music library, uploads files, edits tags, and tests recommendations.
3. AI suggests or applies tags; the owner corrects them.

## 8. AI Assistant

The AI assistant supports:

- Natural-language recommendation:
  - "I want Japanese anime songs for studying, but not too noisy."
  - "Give me something energetic for exercise."
  - "I am tired of this style; find something similar but fresher."
- Tag suggestion on request, and automatic tagging from the owner's tag
  catalogue without per-track confirmation
- Recommendation reason generation

The LLM should not be the only ranking system.

Recommended architecture:

> LLM parses intent and explains results. Rules rank tracks using local data.

This keeps recommendation controllable and prevents the LLM from ignoring recent playback, cooldowns, and user feedback.

## 9. Client Responsibilities

### 9.1 Android App

Android is the primary listening client.

Responsibilities:

- Stable online playback
- Background playback
- Lock screen controls
- Notification controls
- Headset controls
- Search
- Recommendation home
- Like, skip, tired, not today, not suitable feedback
- Manual cache
- Offline playback for cached tracks
- Sync events after reconnecting

### 9.2 Web App

Web is the primary management client and also a Windows player.

Responsibilities:

- Login
- Upload audio
- Library list
- Track detail editing
- Tag management
- AI tag suggestion
- Recommendation testing
- Web playback
- Playback history view

## 10. Success Criteria

The product works when:

- The user can upload music from a Windows browser.
- The user can play music from Android with stable background playback.
- The user can cache selected tracks on Android and play them offline.
- The user can ask for music using natural language.
- The app recommends three useful tracks for a scenario.
- The app avoids recently overplayed or cooled-down tracks.
- The user can manage tags without feeling like every track requires tedious manual work.
