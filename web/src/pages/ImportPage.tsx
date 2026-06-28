import { useCallback, useEffect, useMemo, useState } from "react";

import {
  confirmAudioImport,
  getImportBatch,
  getImportConfiguration,
  getLatestImportBatch,
  scanImportDirectory,
} from "../api/imports";
import { useAuth } from "../auth/AuthProvider";
import { TrackStatusBadge } from "../components/TrackStatusBadge";
import { formatDateTime } from "../i18n/zh";
import { RouteLink } from "../routes/RouteLink";
import type {
  ImportBatchResponse,
  ImportConfirmResponse,
  ImportRootInfo,
  ImportScanCandidate,
  ImportScanResponse,
  ImportScanSkippedItem,
} from "../types/imports";
import type { Track } from "../types/track";

type ImportPageState =
  | { name: "loading" }
  | { name: "ready"; configuration: Awaited<ReturnType<typeof getImportConfiguration>> }
  | { name: "error"; message: string };

export function ImportPage() {
  const { accessToken } = useAuth();
  const [pageState, setPageState] = useState<ImportPageState>({ name: "loading" });
  const [selectedRootId, setSelectedRootId] = useState("");
  const [relativeSubdir, setRelativeSubdir] = useState("");
  const [scanResult, setScanResult] = useState<ImportScanResponse | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [confirmResult, setConfirmResult] = useState<ImportConfirmResponse | null>(null);
  const [latestBatch, setLatestBatch] = useState<ImportBatchResponse | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRefreshingBatch, setIsRefreshingBatch] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadConfiguration = useCallback(async () => {
    if (!accessToken) {
      setPageState({
        name: "error",
        message: "Please sign in again before using imports.",
      });
      return;
    }

    setPageState({ name: "loading" });
    setActionError(null);

    try {
      const [configuration, batch] = await Promise.all([
        getImportConfiguration(accessToken),
        getLatestImportBatch(accessToken),
      ]);
      setPageState({ name: "ready", configuration });
      setLatestBatch(batch);
      setSelectedRootId((currentRootId) => {
        if (configuration.roots.some((root) => root.id === currentRootId)) {
          return currentRootId;
        }

        return configuration.roots[0]?.id ?? "";
      });
    } catch (error: unknown) {
      setPageState({ name: "error", message: getErrorMessage(error) });
    }
  }, [accessToken]);

  useEffect(() => {
    void loadConfiguration();
  }, [loadConfiguration]);

  const selectedRoot = useMemo(() => {
    if (pageState.name !== "ready") {
      return null;
    }

    return pageState.configuration.roots.find((root) => root.id === selectedRootId) ?? null;
  }, [pageState, selectedRootId]);

  const [mediaKindFilter, setMediaKindFilter] = useState<"all" | "audio" | "video">("all");

  const filteredCandidates = useMemo(() => {
    if (!scanResult) return [];
    if (mediaKindFilter === "all") return scanResult.candidates;
    return scanResult.candidates.filter((c) => c.media_kind === mediaKindFilter);
  }, [scanResult, mediaKindFilter]);

  const handleScan = async () => {
    if (!accessToken || !selectedRootId) {
      setActionError("Choose a configured import root before scanning.");
      return;
    }

    setIsScanning(true);
    setActionError(null);
    setScanResult(null);
    setConfirmResult(null);
    setSelectedPaths(new Set());

    try {
      const result = await scanImportDirectory(accessToken, {
        root_id: selectedRootId,
        relative_subdir: normalizeOptionalText(relativeSubdir),
      });
      setScanResult(result);
    } catch (error: unknown) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsScanning(false);
    }
  };

  const handleConfirm = async () => {
    if (!accessToken || !selectedRootId) {
      setActionError("Choose a configured import root before importing.");
      return;
    }

    const paths = [...selectedPaths];
    if (paths.length === 0) {
      setActionError("Select at least one scanned file.");
      return;
    }

    setIsConfirming(true);
    setActionError(null);

    try {
      const result = await confirmAudioImport(accessToken, {
        root_id: selectedRootId,
        files: paths.map((relativePath) => ({ relative_path: relativePath })),
      });
      setConfirmResult(result);
      if (result.batch_id !== null) {
        const batch = await getImportBatch(accessToken, result.batch_id);
        setLatestBatch(batch);
        void pollImportBatch(accessToken, result.batch_id, setLatestBatch);
      }
    } catch (error: unknown) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsConfirming(false);
    }
  };

  const refreshLatestBatch = async () => {
    if (!accessToken) {
      setActionError("Please sign in again before refreshing import status.");
      return;
    }

    setIsRefreshingBatch(true);
    setActionError(null);

    try {
      setLatestBatch(await getLatestImportBatch(accessToken));
    } catch (error: unknown) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsRefreshingBatch(false);
    }
  };

  const toggleSelectedPath = (relativePath: string) => {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) {
        next.delete(relativePath);
      } else {
        next.add(relativePath);
      }

      return next;
    });
    setActionError(null);
  };

  const selectAllCandidates = () => {
    setSelectedPaths((current) => {
      const next = new Set(current);
      for (const candidate of filteredCandidates) {
        next.add(candidate.relative_path);
      }
      return next;
    });
    setActionError(null);
  };

  const clearSelection = () => {
    setSelectedPaths(new Set());
    setActionError(null);
  };

  return (
    <section className="page-panel" aria-labelledby="import-title">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">Import</p>
          <h1 id="import-title">Import audio & video</h1>
          <p className="page-copy">
            Scan a configured server-side import root, select audio or video
            files, then import them into the normal Easy Music processing flow.
            Video files will have their audio extracted automatically.
          </p>
        </div>
        {scanResult ? (
          <span className="score-pill">
            {scanResult.candidates.length} candidates
          </span>
        ) : null}
      </div>

      {pageState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          Loading import configuration...
        </div>
      ) : null}

      {pageState.name === "error" ? (
        <div className="empty-state error" role="alert">
          {pageState.message}
        </div>
      ) : null}

      {pageState.name === "ready" ? (
        <>
          <ImportScanPanel
            configuration={pageState.configuration}
            isScanning={isScanning}
            onRelativeSubdirChange={setRelativeSubdir}
            onRootChange={setSelectedRootId}
            onScan={() => void handleScan()}
            relativeSubdir={relativeSubdir}
            selectedRoot={selectedRoot}
            selectedRootId={selectedRootId}
          />

          {actionError ? (
            <div className="empty-state error" role="alert">
              {actionError}
            </div>
          ) : null}

          {scanResult ? (
            <ScanResultPanel
              filteredCandidates={filteredCandidates}
              isConfirming={isConfirming}
              mediaKindFilter={mediaKindFilter}
              onClearSelection={clearSelection}
              onConfirm={() => void handleConfirm()}
              onMediaKindFilterChange={setMediaKindFilter}
              onSelectAll={selectAllCandidates}
              onTogglePath={toggleSelectedPath}
              result={scanResult}
              selectedPaths={selectedPaths}
            />
          ) : null}

          {confirmResult ? <ConfirmResultPanel result={confirmResult} /> : null}

          <LatestBatchPanel
            batch={latestBatch}
            isRefreshing={isRefreshingBatch}
            onRefresh={() => void refreshLatestBatch()}
          />
        </>
      ) : null}
    </section>
  );
}

function ImportScanPanel({
  configuration,
  isScanning,
  onRelativeSubdirChange,
  onRootChange,
  onScan,
  relativeSubdir,
  selectedRoot,
  selectedRootId,
}: {
  configuration: Awaited<ReturnType<typeof getImportConfiguration>>;
  isScanning: boolean;
  onRelativeSubdirChange: (value: string) => void;
  onRootChange: (value: string) => void;
  onScan: () => void;
  relativeSubdir: string;
  selectedRoot: ImportRootInfo | null;
  selectedRootId: string;
}) {
  if (!configuration.enabled) {
    return (
      <div className="empty-state" role="status">
        {configuration.message}
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Scan</h2>
      <div className="form-grid">
        <label className="field">
          Import root
          <select
            onChange={(event) => onRootChange(event.target.value)}
            value={selectedRootId}
          >
            {configuration.roots.map((root) => (
              <option key={root.id} value={root.id}>
                {root.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Relative subdirectory
          <input
            onChange={(event) => onRelativeSubdirChange(event.target.value)}
            placeholder="Optional"
            type="text"
            value={relativeSubdir}
          />
        </label>
      </div>
      <div className="toolbar">
        <button
          className="button primary"
          disabled={isScanning || !selectedRoot}
          onClick={onScan}
          type="button"
        >
          {isScanning ? "Scanning..." : "Scan"}
        </button>
      </div>
    </div>
  );
}

function ScanResultPanel({
  filteredCandidates,
  isConfirming,
  mediaKindFilter,
  onClearSelection,
  onConfirm,
  onMediaKindFilterChange,
  onSelectAll,
  onTogglePath,
  result,
  selectedPaths,
}: {
  filteredCandidates: ImportScanCandidate[];
  isConfirming: boolean;
  mediaKindFilter: "all" | "audio" | "video";
  onClearSelection: () => void;
  onConfirm: () => void;
  onMediaKindFilterChange: (kind: "all" | "audio" | "video") => void;
  onSelectAll: () => void;
  onTogglePath: (relativePath: string) => void;
  result: ImportScanResponse;
  selectedPaths: Set<string>;
}) {
  const selectedCount = selectedPaths.size;
  const audioCount = result.candidates.filter((c) => c.media_kind === "audio").length;
  const videoCount = result.candidates.filter((c) => c.media_kind === "video").length;

  return (
    <div className="panel">
      <div className="recommendation-result-heading">
        <div>
          <h2>Scan result</h2>
          <p className="recommendation-muted">
            {result.message} Root: {result.root?.label ?? "Unavailable"}.
            Directory: {result.scanned_relative_path ?? "."}.
          </p>
        </div>
        <span className="score-pill">{selectedCount} selected</span>
      </div>

      {result.candidates.length === 0 ? (
        <div className="empty-state">No supported audio or video files were found.</div>
      ) : (
        <>
          <div className="toolbar" style={{ flexWrap: "wrap", gap: "8px" }}>
            <span style={{ fontSize: "0.9rem", color: "#526174" }}>
              {audioCount} audio / {videoCount} video
            </span>
            <button
              className={`button ${mediaKindFilter === "all" ? "primary" : "secondary"}`}
              onClick={() => onMediaKindFilterChange("all")}
              type="button"
            >
              All
            </button>
            <button
              className={`button ${mediaKindFilter === "audio" ? "primary" : "secondary"}`}
              onClick={() => onMediaKindFilterChange("audio")}
              type="button"
            >
              Audio
            </button>
            <button
              className={`button ${mediaKindFilter === "video" ? "primary" : "secondary"}`}
              onClick={() => onMediaKindFilterChange("video")}
              type="button"
            >
              Video
            </button>
            <button className="button secondary" onClick={onSelectAll} type="button">
              Select candidates
            </button>
            <button className="button secondary" onClick={onClearSelection} type="button">
              Clear selection
            </button>
            <button
              className="button primary"
              disabled={isConfirming || selectedCount === 0}
              onClick={onConfirm}
              type="button"
            >
              {isConfirming ? "Importing..." : "Import selected"}
            </button>
          </div>
          <CandidateTable
            candidates={filteredCandidates}
            onTogglePath={onTogglePath}
            selectedPaths={selectedPaths}
          />
        </>
      )}

      <ScanSkippedList skipped={result.skipped} />
      <p className="hint-text">
        Limit: {result.limits.max_files} files, depth {result.limits.max_depth},
        max {formatBytes(result.limits.max_file_size_bytes)} per file.
      </p>
    </div>
  );
}

function CandidateTable({
  candidates,
  onTogglePath,
  selectedPaths,
}: {
  candidates: ImportScanCandidate[];
  onTogglePath: (relativePath: string) => void;
  selectedPaths: Set<string>;
}) {
  return (
    <div className="table-wrap">
      <table className="track-table import-table">
        <thead>
          <tr>
            <th scope="col">Select</th>
            <th scope="col">File</th>
            <th scope="col">Path</th>
            <th scope="col">Kind</th>
            <th scope="col">Type</th>
            <th scope="col">Size</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => (
            <tr key={candidate.relative_path}>
              <td>
                <input
                  aria-label={`Select ${candidate.basename}`}
                  checked={selectedPaths.has(candidate.relative_path)}
                  onChange={() => onTogglePath(candidate.relative_path)}
                  type="checkbox"
                />
              </td>
              <td className="track-title-cell">{candidate.basename}</td>
              <td>{candidate.relative_path}</td>
              <td>{formatMediaKind(candidate.media_kind)}</td>
              <td>{candidate.extension.toUpperCase()}</td>
              <td>{formatBytes(candidate.size_bytes)}</td>
              <td>
                <ImportStatusBadge status={candidate.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScanSkippedList({ skipped }: { skipped: ImportScanSkippedItem[] }) {
  if (skipped.length === 0) {
    return null;
  }

  return (
    <div className="import-subpanel">
      <h3>Skipped</h3>
      <ul className="item-list">
        {skipped.map((item) => (
          <li className="item-card" key={`${item.relative_path}-${item.reason}`}>
            <div className="item-heading">
              <strong>{item.basename}</strong>
              <ImportStatusBadge status={item.status} />
            </div>
            <p className="status-message">
              {item.relative_path} / {formatImportReason(item.reason)}
              {item.size_bytes !== null ? ` / ${formatBytes(item.size_bytes)}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConfirmResultPanel({ result }: { result: ImportConfirmResponse }) {
  return (
    <div className="panel">
      <div className="recommendation-result-heading">
        <div>
          <h2>Import result</h2>
          <p className="recommendation-muted">
            {result.message} Batch #{result.batch_id ?? "none"}.
          </p>
        </div>
        <span className="score-pill">
          {result.imported_count} imported / {result.failed_count} failed
        </span>
      </div>
      <ul className="item-list">
        {result.results.map((item) => (
          <li className="item-card" key={`${item.relative_path}-${item.status}`}>
            <div className="item-heading">
              <strong>{item.basename}</strong>
              <div className="toolbar compact-toolbar">
                {item.media_kind ? <MediaKindBadge mediaKind={item.media_kind} /> : null}
                <ImportStatusBadge status={item.status} />
              </div>
            </div>
            <p className={item.status === "failed" ? "status-message error" : "status-message"}>
              {item.error ?? item.relative_path}
            </p>
            {item.track ? <TrackImportSummary track={item.track} /> : null}
            <DuplicateWarningList warnings={item.duplicate_warnings} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function LatestBatchPanel({
  batch,
  isRefreshing,
  onRefresh,
}: {
  batch: ImportBatchResponse | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="panel">
      <div className="recommendation-result-heading">
        <div>
          <h2>Latest import batch</h2>
          {batch ? (
            <p className="recommendation-muted">
              Batch #{batch.id} / {formatDateTime(batch.updated_at)}
            </p>
          ) : null}
        </div>
        {batch ? <ImportStatusBadge status={batch.status} /> : null}
      </div>
      <div className="toolbar">
        <button
          className="button secondary"
          disabled={isRefreshing}
          onClick={onRefresh}
          type="button"
        >
          {isRefreshing ? "Refreshing..." : "Refresh import status"}
        </button>
      </div>
      {!batch ? (
        <div className="empty-state">No import batch has been recorded yet.</div>
      ) : (
        <>
          <dl className="meta-grid">
            <Meta label="Root" value={batch.root.label} />
            <Meta label="Requested" value={batch.requested_count.toString()} />
            <Meta label="Imported" value={batch.imported_count.toString()} />
            <Meta label="Skipped" value={batch.skipped_count.toString()} />
            <Meta label="Failed" value={batch.failed_count.toString()} />
          </dl>
          <ul className="item-list import-batch-list">
            {batch.items.map((item) => (
              <li className="item-card" key={item.id}>
                <div className="item-heading">
                  <strong>{item.basename}</strong>
                  <div className="toolbar compact-toolbar">
                    {item.media_kind ? <MediaKindBadge mediaKind={item.media_kind} /> : null}
                    <ImportStatusBadge status={item.status} />
                  </div>
                </div>
                <p className={item.status === "failed" ? "status-message error" : "status-message"}>
                  {item.error ?? item.relative_path}
                </p>
                {item.track ? <TrackImportSummary track={item.track} /> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function TrackImportSummary({ track }: { track: Track }) {
  return (
    <div className="import-track-summary">
      <RouteLink
        className="track-title-link"
        to={`/tracks/${encodeURIComponent(track.id)}`}
      >
        #{track.id} {track.title || "Untitled track"}
      </RouteLink>
      <TrackStatusBadge status={track.status} />
      {track.processing_error_message ? (
        <span className="status-message error">{track.processing_error_message}</span>
      ) : null}
    </div>
  );
}

function DuplicateWarningList({
  warnings,
}: {
  warnings: ImportConfirmResponse["results"][number]["duplicate_warnings"];
}) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="import-warning" role="status">
      <strong>Possible duplicate</strong>
      <ul>
        {warnings.map((warning) => (
          <li key={`${warning.match_type}-${warning.candidate_track_ids.join("-")}`}>
            {formatDuplicateMatchType(warning.match_type)}: {warning.reason}{" "}
            {warning.candidate_track_ids.map((trackId) => (
              <RouteLink
                className="inline-link"
                key={trackId}
                to={`/tracks/${encodeURIComponent(trackId)}`}
              >
                #{trackId}
              </RouteLink>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImportStatusBadge({ status }: { status: string }) {
  const normalizedStatus = status.toLowerCase();
  return (
    <span className={`status-badge import-status-${normalizeCssToken(normalizedStatus)}`}>
      {formatImportStatus(normalizedStatus)}
    </span>
  );
}

function MediaKindBadge({ mediaKind }: { mediaKind: string }) {
  return (
    <span className={`status-badge import-kind-${normalizeCssToken(mediaKind)}`}>
      {formatMediaKind(mediaKind)}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

async function pollImportBatch(
  accessToken: string,
  batchId: number,
  setLatestBatch: (batch: ImportBatchResponse) => void,
) {
  const maxAttempts = 40;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await delay(3000);
    let batch: ImportBatchResponse;
    try {
      batch = await getImportBatch(accessToken, batchId);
    } catch {
      return;
    }

    setLatestBatch(batch);

    if (
      batch.items.every(
        (item) =>
          item.status !== "imported" ||
          !item.track ||
          item.track.status === "ready" ||
          item.track.status === "failed",
      )
    ) {
      return;
    }
  }
}

function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatImportStatus(status: string) {
  const labels: Record<string, string> = {
    failed: "Failed",
    imported: "Imported",
    importing: "Importing",
    skipped: "Skipped",
    supported: "Supported",
  };

  return labels[status] ?? status.replace(/[_-]+/g, " ");
}

function formatImportReason(reason: string) {
  const labels: Record<string, string> = {
    file_too_large: "File exceeds the configured size limit",
    max_depth_exceeded: "Scan depth limit reached",
    max_files_exceeded: "Scan file limit reached",
    not_regular_file: "Not a regular file",
    path_escapes_root: "Path escapes configured root",
    permission_denied: "Permission denied",
    read_error: "Unable to read path",
    symlink_directory_skipped: "Symlink directory skipped",
    unsupported_extension: "Unsupported extension",
  };

  return labels[reason] ?? reason.replace(/[_-]+/g, " ");
}

function formatDuplicateMatchType(matchType: string) {
  if (matchType === "exact_file") {
    return "Exact file match";
  }

  return matchType.replace(/[_-]+/g, " ");
}

function normalizeCssToken(value: string) {
  return value.replace(/[^a-z0-9_-]+/g, "-");
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function formatMediaKind(kind: string) {
  if (kind === "audio") return "Audio";
  if (kind === "video") return "Video";
  return kind;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Import request failed.";
}
