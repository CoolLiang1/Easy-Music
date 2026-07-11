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

export type MediaKind = "original" | "playback" | "cover" | "temporary_video";

export type MediaReferenceIssue = {
  track_id: number;
  media_kind: MediaKind;
  path: string | null;
};

export type OrphanMediaFile = {
  media_kind: MediaKind;
  path: string;
};

export type StorageConsistencyReport = {
  generated_at: string;
  referenced_file_count: number;
  scanned_file_count: number;
  missing_references: MediaReferenceIssue[];
  unsafe_references: MediaReferenceIssue[];
  orphan_files: OrphanMediaFile[];
  scan_errors: string[];
};
