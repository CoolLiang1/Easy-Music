import type { Track } from "./track";

export type PlaylistSummary = {
  id: number;
  name: string;
  track_count: number;
  created_at: string;
  updated_at: string;
};

export type PlaylistTrack = {
  position: number;
  added_at: string;
  track: Track;
};

export type Playlist = PlaylistSummary & {
  tracks: PlaylistTrack[];
};

export type PlaylistCreate = {
  name: string;
};

export type PlaylistUpdate = {
  name?: string | null;
};

export type PlaylistTrackAdd = {
  track_id: number;
};

export type PlaylistReorder = {
  track_ids: number[];
};
