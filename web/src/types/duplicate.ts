export type DuplicateMatchType = "exact_file" | "metadata_duration";

export type DuplicateCandidateTrack = {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  duration_seconds: number | null;
  content_type: string;
  status: string;
};

export type DuplicateCandidateGroup = {
  group_id: string;
  match_type: DuplicateMatchType;
  confidence: number;
  reason: string;
  candidate_track_ids: number[];
  candidates: DuplicateCandidateTrack[];
};
