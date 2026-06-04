import type { DuplicateCandidateGroup } from "./duplicate";

export type LibraryReportTrack = {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  duration_seconds: number | null;
  content_type: string;
  status: string;
  updated_at: string;
  last_played_at: string | null;
  playback_count: number;
};

export type LibraryReportTrackIssue = {
  track: LibraryReportTrack;
  reasons: string[];
};

export type LibraryOrganizationReport = {
  generated_at: string;
  untagged_ready_tracks: LibraryReportTrack[];
  missing_metadata_tracks: LibraryReportTrackIssue[];
  processing_tracks: LibraryReportTrackIssue[];
  duplicate_groups: DuplicateCandidateGroup[];
  never_played_ready_tracks: LibraryReportTrack[];
  rarely_played_ready_tracks: LibraryReportTrack[];
  stale_cooldown_tracks: LibraryReportTrackIssue[];
};
