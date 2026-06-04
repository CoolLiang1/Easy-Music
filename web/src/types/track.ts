import type { Tag } from "./tag";

export type TrackStatus = "uploaded" | "processing" | "ready" | "failed" | string;

export type Track = {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  duration_seconds: number | null;
  content_type: string;
  original_file_path: string | null;
  playback_file_path: string | null;
  cover_path: string | null;
  source_url: string | null;
  format: string | null;
  bitrate: number | null;
  status: TrackStatus;
  processing_job_status: string | null;
  processing_error_message: string | null;
  liked: boolean;
  cooldown_until: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
};

export type TrackUpdate = {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  content_type?: string | null;
  source_url?: string | null;
  liked?: boolean | null;
  cooldown_until?: string | null;
  tag_ids?: number[] | null;
};

export type TrackMetadataUpdate = Pick<
  TrackUpdate,
  | "album"
  | "artist"
  | "content_type"
  | "cooldown_until"
  | "liked"
  | "source_url"
  | "title"
>;

export type TrackTagUpdate = Pick<TrackUpdate, "tag_ids">;
