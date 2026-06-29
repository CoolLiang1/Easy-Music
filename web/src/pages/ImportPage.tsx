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
        message: "请重新登录后再使用导入功能。",
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
      setActionError("请先选择已配置的导入根目录。");
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
      setActionError("请先选择已配置的导入根目录。");
      return;
    }

    const paths = [...selectedPaths];
    if (paths.length === 0) {
      setActionError("请至少选择一个扫描到的文件。");
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
      setActionError("请重新登录后再刷新导入状态。");
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
          <p className="eyebrow">导入</p>
          <h1 id="import-title">导入音频与视频</h1>
          <p className="page-copy">
            扫描已配置的服务器导入目录，选择音频或视频文件，并加入 Easy Music
            的标准处理流程。视频文件会自动提取音频。
          </p>
        </div>
        {scanResult ? (
          <span className="score-pill">
            {scanResult.candidates.length} 个候选
          </span>
        ) : null}
      </div>

      {pageState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          正在加载导入配置...
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
      <h2>扫描目录</h2>
      <div className="form-grid">
        <label className="field">
          导入根目录
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
          相对子目录
          <input
            onChange={(event) => onRelativeSubdirChange(event.target.value)}
            placeholder="可选"
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
          {isScanning ? "正在扫描..." : "开始扫描"}
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
          <h2>扫描结果</h2>
          <p className="recommendation-muted">
            {result.message} 根目录：{result.root?.label ?? "不可用"}。
            扫描目录：{result.scanned_relative_path ?? "."}。
          </p>
        </div>
        <span className="score-pill">已选择 {selectedCount} 个</span>
      </div>

      {result.candidates.length === 0 ? (
        <div className="empty-state">没有找到支持的音频或视频文件。</div>
      ) : (
        <>
          <div className="toolbar segmented-toolbar">
            <span className="toolbar-label">
              {audioCount} 个音频 / {videoCount} 个视频
            </span>
            <button
              className={`button ${mediaKindFilter === "all" ? "primary" : "secondary"}`}
              onClick={() => onMediaKindFilterChange("all")}
              type="button"
            >
              全部
            </button>
            <button
              className={`button ${mediaKindFilter === "audio" ? "primary" : "secondary"}`}
              onClick={() => onMediaKindFilterChange("audio")}
              type="button"
            >
              音频
            </button>
            <button
              className={`button ${mediaKindFilter === "video" ? "primary" : "secondary"}`}
              onClick={() => onMediaKindFilterChange("video")}
              type="button"
            >
              视频
            </button>
            <button className="button secondary" onClick={onSelectAll} type="button">
              选择候选
            </button>
            <button className="button secondary" onClick={onClearSelection} type="button">
              清空选择
            </button>
            <button
              className="button primary"
              disabled={isConfirming || selectedCount === 0}
              onClick={onConfirm}
              type="button"
            >
              {isConfirming ? "正在导入..." : "导入已选"}
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
        限制：最多 {result.limits.max_files} 个文件，深度 {result.limits.max_depth}，
        单文件最大 {formatBytes(result.limits.max_file_size_bytes)}。
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
            <th scope="col">选择</th>
            <th scope="col">文件</th>
            <th scope="col">路径</th>
            <th scope="col">媒体</th>
            <th scope="col">格式</th>
            <th scope="col">大小</th>
            <th scope="col">状态</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => (
            <tr key={candidate.relative_path}>
              <td>
                <input
                  aria-label={`选择 ${candidate.basename}`}
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
      <h3>已跳过</h3>
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
          <h2>导入结果</h2>
          <p className="recommendation-muted">
            {result.message} 批次：#{result.batch_id ?? "无"}。
          </p>
        </div>
        <span className="score-pill">
          {result.imported_count} 个已导入 / {result.failed_count} 个失败
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
          <h2>最近导入批次</h2>
          {batch ? (
            <p className="recommendation-muted">
              批次 #{batch.id} / {formatDateTime(batch.updated_at)}
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
          {isRefreshing ? "正在刷新..." : "刷新导入状态"}
        </button>
      </div>
      {!batch ? (
        <div className="empty-state">还没有导入批次记录。</div>
      ) : (
        <>
          <dl className="meta-grid">
            <Meta label="根目录" value={batch.root.label} />
            <Meta label="请求导入" value={batch.requested_count.toString()} />
            <Meta label="已导入" value={batch.imported_count.toString()} />
            <Meta label="已跳过" value={batch.skipped_count.toString()} />
            <Meta label="失败" value={batch.failed_count.toString()} />
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
        #{track.id} {track.title || "未命名音轨"}
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
      <strong>可能重复</strong>
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
    failed: "失败",
    imported: "已导入",
    importing: "导入中",
    skipped: "已跳过",
    supported: "可导入",
  };

  return labels[status] ?? status.replace(/[_-]+/g, " ");
}

function formatImportReason(reason: string) {
  const labels: Record<string, string> = {
    file_too_large: "文件超过配置的大小限制",
    max_depth_exceeded: "已达到扫描深度限制",
    max_files_exceeded: "已达到扫描文件数量限制",
    not_regular_file: "不是普通文件",
    path_escapes_root: "路径超出配置的根目录",
    permission_denied: "没有读取权限",
    read_error: "无法读取路径",
    symlink_directory_skipped: "已跳过符号链接目录",
    unsupported_extension: "不支持的扩展名",
  };

  return labels[reason] ?? reason.replace(/[_-]+/g, " ");
}

function formatDuplicateMatchType(matchType: string) {
  if (matchType === "exact_file") {
    return "文件完全匹配";
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
  if (kind === "audio") return "音频";
  if (kind === "video") return "视频";
  return kind;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "导入请求失败。";
}
