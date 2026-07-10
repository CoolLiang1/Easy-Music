import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PENDING_PLAYBACK_EVENTS,
  PENDING_PLAYBACK_EVENTS_STORAGE_KEY,
  enqueuePendingPlaybackEvent,
  flushPendingPlaybackEvents,
  readPendingPlaybackEvents,
} from "../.test-dist/player/pendingPlaybackEvents.js";
import { WebPlaybackEventRecorder } from "../.test-dist/player/WebPlaybackEventRecorder.js";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

function event(id, overrides = {}) {
  return {
    client_event_id: id,
    track_id: 1,
    event_type: "play",
    position_seconds: 0,
    duration_seconds: 180,
    occurred_at: "2026-07-10T00:00:00.000Z",
    client: "web",
    ...overrides,
  };
}

test("pending event storage deduplicates ids and stays bounded", () => {
  const storage = new MemoryStorage();
  enqueuePendingPlaybackEvent(storage, event("same"));
  enqueuePendingPlaybackEvent(storage, event("same", { track_id: 2 }));

  for (let index = 0; index < MAX_PENDING_PLAYBACK_EVENTS + 10; index += 1) {
    enqueuePendingPlaybackEvent(storage, event(`event-${index}`));
  }

  const pending = readPendingPlaybackEvents(storage);
  assert.equal(pending.length, MAX_PENDING_PLAYBACK_EVENTS);
  assert.equal(pending.at(-1).client_event_id, `event-${MAX_PENDING_PLAYBACK_EVENTS + 9}`);
  assert.equal(pending.some((item) => item.client_event_id === "same"), false);
});

test("pending event storage rejects corrupt and unsafe-shaped data", () => {
  const storage = new MemoryStorage();
  storage.setItem(PENDING_PLAYBACK_EVENTS_STORAGE_KEY, "not-json");
  assert.deepEqual(readPendingPlaybackEvents(storage), []);

  storage.setItem(
    PENDING_PLAYBACK_EVENTS_STORAGE_KEY,
    JSON.stringify([event("valid"), { ...event("token"), access_token: "secret" }, { bad: true }]),
  );
  assert.deepEqual(
    readPendingPlaybackEvents(storage).map((item) => item.client_event_id),
    ["valid", "token"],
  );
  assert.equal("access_token" in readPendingPlaybackEvents(storage)[1], false);
});

test("flush removes accepted, duplicate, and permanent failed events", async () => {
  const storage = new MemoryStorage();
  enqueuePendingPlaybackEvent(storage, event("accepted"));
  enqueuePendingPlaybackEvent(storage, event("duplicate"));
  enqueuePendingPlaybackEvent(storage, event("failed"));

  const result = await flushPendingPlaybackEvents(storage, async () => ({
    accepted: [
      { client_event_id: "accepted", status: "accepted" },
      { client_event_id: "duplicate", status: "duplicate" },
    ],
    failed: [
      {
        client_event_id: "failed",
        track_id: 1,
        status: "failed",
        error: "Track not found for current user.",
      },
    ],
  }));

  assert.deepEqual(result, {
    sentCount: 3,
    acceptedCount: 2,
    failedCount: 1,
    pendingCount: 0,
  });
  assert.deepEqual(readPendingPlaybackEvents(storage), []);
});

test("flush keeps events when delivery throws", async () => {
  const storage = new MemoryStorage();
  enqueuePendingPlaybackEvent(storage, event("retry"));

  await assert.rejects(
    flushPendingPlaybackEvents(storage, async () => {
      throw new Error("offline");
    }),
    /offline/,
  );
  assert.equal(readPendingPlaybackEvents(storage).length, 1);
});

test("flush preserves an event enqueued while a request is in flight", async () => {
  const storage = new MemoryStorage();
  enqueuePendingPlaybackEvent(storage, event("first"));

  await flushPendingPlaybackEvents(storage, async () => {
    enqueuePendingPlaybackEvent(storage, event("during-request"));
    return {
      accepted: [{ client_event_id: "first", status: "accepted" }],
      failed: [],
    };
  });

  assert.deepEqual(
    readPendingPlaybackEvents(storage).map((item) => item.client_event_id),
    ["during-request"],
  );
});

test("recorder emits one ordered lifecycle with normalized positions", () => {
  const recorded = [];
  let id = 0;
  const recorder = new WebPlaybackEventRecorder(
    (item) => recorded.push(item),
    () => new Date("2026-07-10T00:00:00.000Z"),
    () => `id-${++id}`,
  );

  recorder.startTrack(42);
  recorder.onPlay(-1, 180.12345);
  recorder.onPlay(0, 180);
  recorder.onPause(10.55555, 180);
  recorder.onPause(11, 180);
  recorder.onPlay(12, 180);
  recorder.onSeek(30.12345, 180);
  recorder.onComplete(180, 180);
  recorder.onSkip(180, 180);

  assert.deepEqual(
    recorded.map((item) => item.event_type),
    ["play", "pause", "resume", "seek", "complete"],
  );
  assert.equal(recorded[0].position_seconds, 0);
  assert.equal(recorded[0].duration_seconds, 180.123);
  assert.equal(recorded[3].position_seconds, 30.123);
  assert.equal(recorded.every((item) => item.track_id === 42), true);
});

test("recorder records skip before selecting a replacement track", () => {
  const recorded = [];
  let id = 0;
  const recorder = new WebPlaybackEventRecorder(
    (item) => recorded.push(item),
    () => new Date("2026-07-10T00:00:00.000Z"),
    () => `id-${++id}`,
  );

  recorder.startTrack(1);
  recorder.onPlay(0, 100);
  recorder.onSkip(25, 100);
  recorder.startTrack(2);
  recorder.onPlay(0, 200);

  assert.deepEqual(
    recorded.map((item) => [item.track_id, item.event_type]),
    [
      [1, "play"],
      [1, "skip"],
      [2, "play"],
    ],
  );
});
