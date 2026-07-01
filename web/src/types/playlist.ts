import type { Track } from "./track";

export type PlaylistSummary = {
  id: number;
  name: string;
  description: string | null;
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
  description?: string | null;
};

export type PlaylistUpdate = {
  name?: string | null;
  description?: string | null;
};

export type PlaylistTrackAdd = {
  track_id: number;
};

export type PlaylistTracksAdd = {
  track_ids: number[];
};

export type PlaylistReorder = {
  track_ids: number[];
};
