# Easy Music PRD

## 1. Product Positioning

Easy Music is a personal cloud music system for scenario-based listening.

It is not just a music player. Its core job is to help the user answer:

> What should I listen to right now?

The first version combines:

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

Therefore the first version will build a self-hosted cloud player instead of a link-only manager.

## 4. Version 1 Goal

Build a usable personal cloud music app that supports:

- Uploading existing audio files from the web console
- Preserving original files
- Generating standard MP3 playback files
- Managing tracks, tags, metadata, and source links
- Playing music from Android and Web
- Stable Android background playback
- Android notification, lock screen, and headset controls
- Manual Android offline cache
- Scenario-based recommendation
- AI assistant for natural-language recommendation and tag suggestions
- Single-user login for public deployment

## 5. First Version Scope

### 5.1 In Scope

- Single-user system with login
- Web app for Windows/browser use
- Android app for mobile playback
- Server-hosted audio library
- Upload audio files from Web
- Supported upload formats:
  - MP3
  - FLAC
  - M4A
  - WAV
  - OGG
- Preserve original upload
- Generate MP3 playback version
- Track metadata extraction
- Track editing
- Tag editing
- Source link field, such as a Bilibili URL
- Scenario tags
- Mood/state tags
- Genre/type tags
- AI tag suggestion
- Natural-language recommendation request
- Rule-based ranking combined with LLM intent parsing
- Recommendation reason text
- Playback history
- Feedback actions:
  - Like
  - Tired of it
  - Not today
  - Skip
  - Not suitable for this scenario
- Android manual cache
- Offline playback for cached tracks
- Sync cached playback events when online

### 5.2 Out Of Scope For Version 1

- Automatic Bilibili download
- Automatic video-to-audio extraction from a pasted URL
- Multi-user sharing
- Social features
- Full native Windows desktop client
- Deep audio analysis such as BPM, vocal detection, mood classification, or embeddings
- Full offline library sync
- Complex machine-learning recommendation model
- Public music discovery service

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

Tag groups:

- Scenario: study, work, exercise, relax, sleep
- State: focus, energetic, calm, healing, exciting
- Type: Japanese, anime, game OST, instrumental, electronic, white noise, Chinese, English
- Attribute: vocal, instrumental, loopable, distracting, noisy

Tracks can have many tags across different groups.

### 6.3 Listening Fatigue

Listening fatigue means "temporarily reduce or avoid recommendation", not dislike.

Version 1 supports:

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
5. AI suggests title cleanup and tags based on filename and metadata.
6. User confirms or edits tags.
7. Tracks become available for recommendation and playback.

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
3. AI assistant helps with tag cleanup and organization suggestions.

## 8. AI Assistant

The AI assistant is part of Version 1.

It should support:

- Natural-language recommendation:
  - "I want Japanese anime songs for studying, but not too noisy."
  - "Give me something energetic for exercise."
  - "I am tired of this style; find something similar but fresher."
- Tag suggestion after upload
- Recommendation reason generation
- Simple organization suggestions

The LLM should not be the only ranking system.

Recommended architecture:

> LLM parses intent and explains results. Rules rank tracks using local data.

This keeps recommendation controllable and prevents the LLM from ignoring recent playback, cooldowns, and user feedback.

## 9. Client Responsibilities

### 9.1 Android App

Android is the primary listening client.

First-version responsibilities:

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

First-version responsibilities:

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

Version 1 is successful if:

- The user can upload music from a Windows browser.
- The user can play music from Android with stable background playback.
- The user can cache selected tracks on Android and play them offline.
- The user can ask for music using natural language.
- The app recommends three useful tracks for a scenario.
- The app avoids recently overplayed or cooled-down tracks.
- The user can manage tags without feeling like every track requires tedious manual work.

