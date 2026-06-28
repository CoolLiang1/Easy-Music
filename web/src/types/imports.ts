import type { Track } from "./track";

export type ImportRootInfo = {
  id: string;
  label: string;
};

export type ImportConfigurationResponse = {
  enabled: boolean;
  message: string;
  roots: ImportRootInfo[];
};

export type ImportScanLimits = {
  max_files: number;
  max_depth: number;
  max_file_size_bytes: number;
};

export type ImportScanCandidate = {
  relative_path: string;
  basename: string;
  extension: string;
  size_bytes: number;
  status: "supported" | string;
  media_kind: "audio" | "video" | string;
};

export type ImportScanSkippedItem = {
  relative_path: string;
  basename: string;
  extension: string | null;
  size_bytes: number | null;
  status: "skipped" | string;
  reason: string;
};

export type ImportScanRequest = {
  root_id: string;
  relative_subdir?: string | null;
};

export type ImportScanResponse = {
  enabled: boolean;
  message: string;
  root: ImportRootInfo | null;
  scanned_relative_path: string | null;
  candidates: ImportScanCandidate[];
  skipped: ImportScanSkippedItem[];
  limits: ImportScanLimits;
};

export type ImportConfirmRequest = {
  root_id: string;
  files: Array<{
    relative_path: string;
  }>;
};

export type ImportDuplicateWarning = {
  match_type: string;
  reason: string;
  candidate_track_ids: number[];
};

export type ImportConfirmResult = {
  relative_path: string;
  basename: string;
  status: "imported" | "skipped" | "failed" | string;
  media_kind: "audio" | "video" | string | null;
  track: Track | null;
  error: string | null;
  duplicate_warnings: ImportDuplicateWarning[];
};

export type ImportConfirmResponse = {
  enabled: boolean;
  message: string;
  root: ImportRootInfo | null;
  batch_id: number | null;
  requested_count: number;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  results: ImportConfirmResult[];
};

export type ImportBatchItemResponse = {
  id: number;
  relative_path: string;
  basename: string;
  status: "imported" | "skipped" | "failed" | string;
  track_id: number | null;
  track: Track | null;
  error: string | null;
  media_kind: string | null;
  created_at: string;
  updated_at: string;
};

export type ImportBatchResponse = {
  id: number;
  root: ImportRootInfo;
  status: "imported" | "skipped" | "failed" | "importing" | string;
  message: string | null;
  requested_count: number;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  items: ImportBatchItemResponse[];
  created_at: string;
  updated_at: string;
};
