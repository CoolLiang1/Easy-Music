export type CoverlessTrack = {
  track_id: number;
  title: string;
  /** Empty when the track has no artist and cannot be searched. */
  artist: string;
  duration_seconds: number | null;
  /** A search already ran for it without a saved cover. */
  searched: boolean;
};

export type CoverSearchStatusResponse = {
  enabled: boolean;
  coverless_count: number;
  pending_count: number;
  tracks: CoverlessTrack[];
  skipped_without_artist: number;
};

export type CoverCandidate = {
  track_id: number;
  artwork_url: string;
  track_name: string;
  artist_name: string;
  collection_name: string;
  confidence: "match" | "uncertain";
  selected: boolean;
};

export type CoverSearchBatchResponse = {
  status: "ok" | "disabled" | "error";
  candidates: CoverCandidate[];
  reviewed_track_ids: number[];
  next_after_id: number | null;
  remaining_count: number;
  error: string | null;
};

export type CoverSearchApplyRequest = {
  choices: Array<{ track_id: number; artwork_url: string }>;
  reviewed_track_ids: number[];
};

export type CoverSearchApplyResponse = {
  updated_count: number;
  failed_count: number;
  reviewed_count: number;
};
