import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  confirmAudioImport,
  getImportBatch,
  getImportConfiguration,
  getLatestImportBatch,
  scanImportDirectory,
} from "../api/imports";
import { useAuth } from "../auth/AuthProvider";
import { TrackStatusBadge } from "../components/TrackStatusBadge";
import { Callout, EmptyState, LoadingRows, PageHeader, getErrorMessage } from "../components/ui/common";
import { Icon } from "../components/ui/Icon";
import { useToast } from "../components/ui/Toast";
import { formatBackendReason, formatBytes, formatDateTime } from "../i18n/zh";
import { RouteLink } from "../routes/RouteLink";
import type {
  ImportBatchResponse,
  ImportConfigurationResponse,
  ImportConfirmResponse,
  ImportDuplicateWarning,
  ImportScanCandidate,
  ImportScanResponse,
} from "../types/imports";
import type { Track } from "../types/track";

type ImportPageState =
  | { name: "loading" }
  | { name: "ready"; configuration: ImportConfigurationResponse }
  | { name: "error"; message: string };

type KindFilter = "all" | "audio" | "video";

export function ImportPage() {
  const { accessToken } = useAuth();
  const showToast = useToast();
  const rootId = useId();
  const subdirId = useId();
  const [pageState, setPageState] = useState<ImportPageState>({ name: "loading" });
  const [selectedRootId, setSelectedRootId] = useState("");
  const [relativeSubdir, setRelativeSubdir] = useState("");
  const [scanResult, setScanResult] = useState<ImportScanResponse | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [confirmResult, setConfirmResult] = useState<ImportConfirmResponse | null>(null);
  const [latestBatch, setLatestBatch] = useState<ImportBatchResponse | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRefreshingBatch, setIsRefreshingBatch] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const loadConfiguration = useCallback(async () => {
    if (!accessToken) {
      setPageState({ name: "error", message: "登录已失效，请重新登录。" });
      return;
    }

    setPageState({ name: "loading" });
    try {
      const [configuration, batch] = await Promise.all([
        getImportConfiguration(accessToken),
        getLatestImportBatch(accessToken),
      ]);
      setPageState({ name: "ready", configuration });
      setLatestBatch(batch);
      setSelectedRootId((current) =>
        configuration.roots.some((root) => root.id === current)
          ? current
          : (configuration.roots[0]?.id ?? ""),
      );
    } catch (error: unknown) {
      setPageState({ name: "error", message: getErrorMessage(error, "无法加载导入配置。") });
    }
  }, [accessToken]);

  useEffect(() => {
    void loadConfiguration();
  }, [loadConfiguration]);

  const filteredCandidates = useMemo(() => {
    if (!scanResult) return [];
    if (kindFilter === "all") return scanResult.candidates;
    return scanResult.candidates.filter((candidate) => candidate.media_kind === kindFilter);
  }, [kindFilter, scanResult]);

  const handleScan = async () => {
    if (!accessToken || !selectedRootId) {
      setActionError("请先选择导入目录。");
      return;
    }

    setIsScanning(true);
    setActionError(null);
    setScanResult(null);
    setConfirmResult(null);
    setSelectedPaths(new Set());
    setKindFilter("all");

    try {
      const result = await scanImportDirectory(accessToken, {
        root_id: selectedRootId,
        relative_subdir: relativeSubdir.trim() || null,
      });
      setScanResult(result);
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, "扫描失败。"));
    } finally {
      setIsScanning(false);
    }
  };

  const handleConfirm = async () => {
    if (!accessToken || !selectedRootId) return;
    const paths = [...selectedPaths];
    if (paths.length === 0) {
      setActionError("请至少选择一个文件。");
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
      setScanResult(null);
      setSelectedPaths(new Set());
      showToast(`已提交导入：${result.imported_count} 个成功，${result.failed_count} 个失败。`);
      if (result.batch_id !== null) {
        const batch = await getImportBatch(accessToken, result.batch_id);
        setLatestBatch(batch);
        void pollImportBatch(accessToken, result.batch_id, setLatestBatch);
      }
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, "导入失败。"));
    } finally {
      setIsConfirming(false);
    }
  };

  const refreshLatestBatch = async () => {
    if (!accessToken) return;
    setIsRefreshingBatch(true);
    try {
      setLatestBatch(await getLatestImportBatch(accessToken));
    } catch (error: unknown) {
      showToast(getErrorMessage(error, "刷新失败。"), "error");
    } finally {
      setIsRefreshingBatch(false);
    }
  };

  const togglePath = (relativePath: string) => {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) {
        next.delete(relativePath);
      } else {
        next.add(relativePath);
      }
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelectedPaths((current) => {
      const allSelected =
        filteredCandidates.length > 0 &&
        filteredCandidates.every((candidate) => current.has(candidate.relative_path));
      const next = new Set(current);
      for (const candidate of filteredCandidates) {
        if (allSelected) {
          next.delete(candidate.relative_path);
        } else {
          next.add(candidate.relative_path);
        }
      }
      return next;
    });
  };

  return (
    <div className="page">
      <PageHeader
        description="扫描服务器上预先配置的目录，把选中的音频或视频复制进曲库。源文件只读，不会被移动、改名或删除。"
        title="从服务器导入"
      />

      {pageState.name === "loading" ? (
        <div className="card">
          <LoadingRows rows={3} />
        </div>
      ) : null}

      {pageState.name === "error" ? (
        <div className="card card-pad stack">
          <Callout title="导入配置加载失败" tone="danger">
            {pageState.message}
          </Callout>
          <div>
            <button className="btn btn-secondary" onClick={() => void loadConfiguration()} type="button">
              重试
            </button>
          </div>
        </div>
      ) : null}

      {pageState.name === "ready" && !pageState.configuration.enabled ? (
        <div className="card">
          <EmptyState
            action={
              <RouteLink className="btn btn-primary" to="/upload">
                改为上传文件
              </RouteLink>
            }
            description={
              <>
                服务器还没有配置允许扫描的目录。在环境变量 <code>IMPORT_ALLOWED_ROOTS</code>{" "}
                中设置后即可使用；在此之前可以直接上传文件。
                <span className="faint" style={{ display: "block", fontSize: "0.8rem", marginTop: 6 }}>
                  {pageState.configuration.message}
                </span>
              </>
            }
            icon="folder"
            title="导入功能未开启"
          />
        </div>
      ) : null}

      {pageState.name === "ready" && pageState.configuration.enabled ? (
        <div className="steps">
          <section className="card">
            <div className="card-header">
              <div className="step-head">
                <span className="step-num">1</span>
                <div>
                  <h2 className="card-title">选择要扫描的目录</h2>
                  <p className="card-subtitle">扫描只读取文件列表，不会导入任何内容。</p>
                </div>
              </div>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <label className="field" htmlFor={rootId}>
                  <span className="field-label">导入根目录</span>
                  <select
                    className="select"
                    id={rootId}
                    onChange={(event) => setSelectedRootId(event.target.value)}
                    value={selectedRootId}
                  >
                    {pageState.configuration.roots.map((root) => (
                      <option key={root.id} value={root.id}>
                        {root.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor={subdirId}>
                  <span className="field-label">子目录（可选）</span>
                  <input
                    className="input"
                    id={subdirId}
                    onChange={(event) => setRelativeSubdir(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleScan();
                    }}
                    placeholder="例如：2026/新专辑"
                    type="text"
                    value={relativeSubdir}
                  />
                </label>
              </div>
            </div>
            <div className="card-foot">
              <button
                className="btn btn-primary"
                disabled={isScanning || !selectedRootId}
                onClick={() => void handleScan()}
                type="button"
              >
                {isScanning ? (
                  <>
                    <span aria-hidden="true" className="spinner" />
                    正在扫描…
                  </>
                ) : (
                  <>
                    <Icon name="search" size={16} />
                    扫描目录
                  </>
                )}
              </button>
            </div>
          </section>

          {actionError ? <Callout tone="danger">{actionError}</Callout> : null}

          {scanResult ? (
            <ScanResultCard
              filteredCandidates={filteredCandidates}
              isConfirming={isConfirming}
              kindFilter={kindFilter}
              onConfirm={() => void handleConfirm()}
              onKindFilterChange={setKindFilter}
              onToggleAll={toggleAllFiltered}
              onTogglePath={togglePath}
              result={scanResult}
              selectedPaths={selectedPaths}
            />
          ) : null}

          <div ref={resultRef}>{confirmResult ? <ConfirmResultCard result={confirmResult} /> : null}</div>

          <LatestBatchCard
            batch={latestBatch}
            isRefreshing={isRefreshingBatch}
            onRefresh={() => void refreshLatestBatch()}
          />
        </div>
      ) : null}
    </div>
  );
}

function ScanResultCard({
  filteredCandidates,
  isConfirming,
  kindFilter,
  onConfirm,
  onKindFilterChange,
  onToggleAll,
  onTogglePath,
  result,
  selectedPaths,
}: {
  filteredCandidates: ImportScanCandidate[];
  isConfirming: boolean;
  kindFilter: KindFilter;
  onConfirm: () => void;
  onKindFilterChange: (kind: KindFilter) => void;
  onToggleAll: () => void;
  onTogglePath: (relativePath: string) => void;
  result: ImportScanResponse;
  selectedPaths: Set<string>;
}) {
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const audioCount = result.candidates.filter((candidate) => candidate.media_kind === "audio").length;
  const videoCount = result.candidates.filter((candidate) => candidate.media_kind === "video").length;
  const selectedVisible = filteredCandidates.filter((candidate) =>
    selectedPaths.has(candidate.relative_path),
  ).length;
  const allSelected = filteredCandidates.length > 0 && selectedVisible === filteredCandidates.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedVisible > 0 && !allSelected;
    }
  }, [allSelected, selectedVisible]);

  return (
    <section className="card table-card">
      <div className="card-header">
        <div className="step-head">
          <span className="step-num">2</span>
          <div>
            <h2 className="card-title">选择要导入的文件</h2>
            <p className="card-subtitle">
              {result.root?.label ?? "未知目录"} /{" "}
              {result.scanned_relative_path && result.scanned_relative_path !== "."
                ? result.scanned_relative_path
                : "根目录"}{" "}
              · 找到{" "}
              {result.candidates.length} 个可导入文件
            </p>
          </div>
        </div>
        {result.candidates.length > 0 ? (
          <div className="segmented" role="tablist">
            {(
              [
                ["all", "全部", result.candidates.length],
                ["audio", "音频", audioCount],
                ["video", "视频", videoCount],
              ] as Array<[KindFilter, string, number]>
            ).map(([value, label, count]) => (
              <button
                aria-selected={kindFilter === value}
                className={kindFilter === value ? "segmented-item active" : "segmented-item"}
                key={value}
                onClick={() => onKindFilterChange(value)}
                role="tab"
                type="button"
              >
                {label}
                <span className="count">{count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 14 }}>
        {result.candidates.length === 0 ? (
          <EmptyState
            compact
            description={result.message}
            icon="folder"
            title="这个目录里没有可导入的音频或视频"
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-check" scope="col">
                    <input
                      aria-label={allSelected ? "取消全选" : "全选"}
                      checked={allSelected}
                      onChange={onToggleAll}
                      ref={selectAllRef}
                      type="checkbox"
                    />
                  </th>
                  <th scope="col">文件</th>
                  <th className="hide-md" scope="col">
                    路径
                  </th>
                  <th scope="col">类型</th>
                  <th className="col-num" scope="col">
                    大小
                  </th>
                  <th scope="col">状态</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((candidate) => (
                  <tr
                    className={selectedPaths.has(candidate.relative_path) ? "is-selected" : undefined}
                    key={candidate.relative_path}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("input")) return;
                      onTogglePath(candidate.relative_path);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="col-check">
                      <input
                        aria-label={`选择 ${candidate.basename}`}
                        checked={selectedPaths.has(candidate.relative_path)}
                        onChange={() => onTogglePath(candidate.relative_path)}
                        type="checkbox"
                      />
                    </td>
                    <td>
                      <span className="track-cell-title" title={candidate.basename}>
                        {candidate.basename}
                      </span>
                    </td>
                    <td className="hide-md">
                      <span className="mono faint" style={{ fontSize: "0.8rem" }}>
                        {candidate.relative_path}
                      </span>
                    </td>
                    <td>
                      <MediaKindBadge mediaKind={candidate.media_kind} />{" "}
                      <span className="faint">{candidate.extension.toUpperCase().replace(".", "")}</span>
                    </td>
                    <td className="col-num">{formatBytes(candidate.size_bytes)}</td>
                    <td>
                      <ImportStatusBadge status={candidate.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {result.skipped.length > 0 ? (
        <details className="disclosure">
          <summary>
            <Icon name="chevronRight" size={15} />
            已跳过 {result.skipped.length} 个文件
          </summary>
          <div className="disclosure-body">
            <ul className="list-rows" style={{ margin: "0 -20px" }}>
              {result.skipped.map((item) => (
                <li className="list-row" key={`${item.relative_path}-${item.reason}`}>
                  <div className="list-row-main">
                    <span className="track-cell-title">{item.basename}</span>
                    <span className="track-cell-sub">
                      {formatImportReason(item.reason)}
                      {item.size_bytes !== null ? ` · ${formatBytes(item.size_bytes)}` : ""}
                    </span>
                  </div>
                  <span className="list-row-meta mono">{item.relative_path}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}

      <div className="card-foot between">
        <span className="faint" style={{ fontSize: "0.8rem" }}>
          限制：最多 {result.limits.max_files} 个文件 · 深度 {result.limits.max_depth} · 单个文件{" "}
          {formatBytes(result.limits.max_file_size_bytes)}
        </span>
        <button
          className="btn btn-primary"
          disabled={isConfirming || selectedPaths.size === 0}
          onClick={onConfirm}
          type="button"
        >
          {isConfirming ? (
            <>
              <span aria-hidden="true" className="spinner" />
              正在导入…
            </>
          ) : (
            `导入已选 ${selectedPaths.size} 个文件`
          )}
        </button>
      </div>
    </section>
  );
}

function ConfirmResultCard({ result }: { result: ImportConfirmResponse }) {
  return (
    <section className="card">
      <div className="card-header">
        <div className="step-head">
          <span className="step-num">3</span>
          <div>
            <h2 className="card-title">导入结果</h2>
            <p className="card-subtitle">
              {result.message}
              {result.batch_id !== null ? ` · 批次 #${result.batch_id}` : ""}
            </p>
          </div>
        </div>
      </div>
      <div className="card-body">
        <div className="stat-row">
          <Stat label="请求" value={result.requested_count} />
          <Stat label="已导入" value={result.imported_count} />
          <Stat label="已跳过" value={result.skipped_count} />
          <Stat label="失败" value={result.failed_count} />
        </div>
      </div>
      <ul className="list-rows">
        {result.results.map((item) => (
          <li className="list-row" key={`${item.relative_path}-${item.status}`} style={{ alignItems: "flex-start" }}>
            <div className="list-row-main">
              <div className="row" style={{ gap: 8 }}>
                <span className="track-cell-title">{item.basename}</span>
                {item.media_kind ? <MediaKindBadge mediaKind={item.media_kind} /> : null}
                <ImportStatusBadge status={item.status} />
              </div>
              {item.error ? <p className="inline-error">{item.error}</p> : null}
              {item.track ? <TrackImportSummary track={item.track} /> : null}
              <DuplicateWarningList warnings={item.duplicate_warnings} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LatestBatchCard({
  batch,
  isRefreshing,
  onRefresh,
}: {
  batch: ImportBatchResponse | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">最近一次导入</h2>
          <p className="card-subtitle">
            {batch
              ? `批次 #${batch.id} · ${batch.root.label} · ${formatDateTime(batch.updated_at)}`
              : "还没有导入记录"}
          </p>
        </div>
        <div className="row">
          {batch ? <ImportStatusBadge status={batch.status} /> : null}
          <button className="btn btn-ghost btn-sm" disabled={isRefreshing} onClick={onRefresh} type="button">
            <Icon name="refresh" size={15} />
            {isRefreshing ? "正在刷新…" : "刷新"}
          </button>
        </div>
      </div>
      {batch ? (
        <>
          <div className="card-body">
            <div className="stat-row">
              <Stat label="请求" value={batch.requested_count} />
              <Stat label="已导入" value={batch.imported_count} />
              <Stat label="已跳过" value={batch.skipped_count} />
              <Stat label="失败" value={batch.failed_count} />
            </div>
          </div>
          {batch.items.length > 0 ? (
            <details className="disclosure" open={batch.items.length <= 8}>
              <summary>
                <Icon name="chevronRight" size={15} />
                {batch.items.length} 个文件
              </summary>
              <ul className="list-rows">
                {batch.items.map((item) => (
                  <li className="list-row" key={item.id}>
                    <div className="list-row-main">
                      <div className="row" style={{ gap: 8 }}>
                        <span className="track-cell-title">{item.basename}</span>
                        {item.media_kind ? <MediaKindBadge mediaKind={item.media_kind} /> : null}
                        <ImportStatusBadge status={item.status} />
                      </div>
                      {item.error ? <p className="inline-error">{item.error}</p> : null}
                      {item.track ? <TrackImportSummary track={item.track} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function TrackImportSummary({ track }: { track: Track }) {
  return (
    <div className="row" style={{ gap: 8, marginTop: 4 }}>
      <RouteLink className="inline-link" to={`/tracks/${encodeURIComponent(track.id)}`}>
        {track.title || "未命名音轨"}
      </RouteLink>
      <TrackStatusBadge status={track.status} />
      {track.processing_error_message ? (
        <span className="inline-error">{track.processing_error_message}</span>
      ) : null}
    </div>
  );
}

function DuplicateWarningList({ warnings }: { warnings: ImportDuplicateWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="callout callout-warn" role="status" style={{ marginTop: 8 }}>
      <Icon name="copy" size={17} />
      <div className="callout-body">
        <strong className="callout-title">可能重复</strong>
        {warnings.map((warning) => (
          <div key={`${warning.match_type}-${warning.candidate_track_ids.join("-")}`}>
            {formatDuplicateMatchType(warning.match_type)}：{formatBackendReason(warning.reason)}{" "}
            {warning.candidate_track_ids.map((trackId) => (
              <RouteLink
                className="inline-link"
                key={trackId}
                style={{ marginRight: 6 }}
                to={`/tracks/${encodeURIComponent(trackId)}`}
              >
                #{trackId}
              </RouteLink>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tones: Record<string, string> = {
    failed: "badge-danger",
    imported: "badge-ok",
    importing: "badge-warn",
    skipped: "",
    supported: "badge-info",
  };
  return <span className={`badge ${tones[normalized] ?? ""}`}>{formatImportStatus(normalized)}</span>;
}

function MediaKindBadge({ mediaKind }: { mediaKind: string }) {
  return (
    <span className={mediaKind === "video" ? "chip chip-type" : "chip"}>
      {mediaKind === "video" ? "视频" : mediaKind === "audio" ? "音频" : mediaKind}
    </span>
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
    file_too_large: "文件超过大小限制",
    max_depth_exceeded: "超过扫描深度限制",
    max_files_exceeded: "超过扫描文件数量限制",
    not_regular_file: "不是普通文件",
    path_escapes_root: "路径超出允许的根目录",
    permission_denied: "没有读取权限",
    read_error: "无法读取",
    symlink_directory_skipped: "跳过了符号链接目录",
    unsupported_extension: "不支持的扩展名",
  };

  return labels[reason] ?? reason.replace(/[_-]+/g, " ");
}

function formatDuplicateMatchType(matchType: string) {
  if (matchType === "exact_file") {
    return "文件完全一致";
  }

  return matchType.replace(/[_-]+/g, " ");
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
