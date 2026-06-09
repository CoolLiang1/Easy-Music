import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { getLibraryOrganizationReport } from "../api/libraryReports";
import { useAuth } from "../auth/AuthProvider";
import { TrackStatusBadge } from "../components/TrackStatusBadge";
import { formatDateTime, formatDuration } from "../i18n/zh";
import { RouteLink } from "../routes/RouteLink";
import type {
  LibraryOrganizationReport,
  LibraryReportTrack,
  LibraryReportTrackIssue,
} from "../types/libraryReport";

type ReportState =
  | { name: "loading" }
  | { name: "ready"; report: LibraryOrganizationReport }
  | { name: "error"; message: string };

export function LibraryReportsPage() {
  const { accessToken } = useAuth();
  const [reportState, setReportState] = useState<ReportState>({ name: "loading" });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadReport = useCallback(async (showLoading: boolean) => {
    if (!accessToken) {
      setReportState({
        name: "error",
        message: "请重新登录后再加载曲库报告。",
      });
      return;
    }

    if (showLoading) {
      setReportState({ name: "loading" });
    } else {
      setIsRefreshing(true);
    }

    try {
      const report = await getLibraryOrganizationReport(accessToken);
      setReportState({ name: "ready", report });
    } catch (error: unknown) {
      setReportState({
        name: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadReport(true);
  }, [loadReport]);

  return (
    <section className="page-panel" aria-labelledby="library-reports-title">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">报告</p>
          <h1 id="library-reports-title">曲库整理</h1>
          <p className="page-copy">
            找出需要补元数据、补标签、关注处理状态，或值得重新听听的音轨。
          </p>
        </div>
      </div>
      <div className="toolbar">
        <button
          className="button secondary"
          disabled={reportState.name === "loading" || isRefreshing}
          onClick={() => void loadReport(false)}
          type="button"
        >
          {isRefreshing ? "正在刷新..." : "刷新报告"}
        </button>
        <RouteLink className="button secondary" to="/library">
          返回曲库
        </RouteLink>
      </div>

      {reportState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          正在加载曲库报告...
        </div>
      ) : null}

      {reportState.name === "error" ? (
        <div className="empty-state error" role="alert">
          {reportState.message}
        </div>
      ) : null}

      {reportState.name === "ready" ? <ReportSections report={reportState.report} /> : null}
    </section>
  );
}

function ReportSections({ report }: { report: LibraryOrganizationReport }) {
  return (
    <div className="recommendation-results">
      <p className="page-copy" style={{ margin: 0 }}>
        生成于 {formatDateTime(report.generated_at)}。
      </p>

      <TrackSection
        emptyMessage="没有缺少标签的可播放音轨。"
        title="未打标签的可播放音轨"
        tracks={report.untagged_ready_tracks}
      />
      <IssueSection
        emptyMessage="没有缺少核心元数据的可播放音轨。"
        issues={report.missing_metadata_tracks}
        title="缺少元数据"
      />
      <IssueSection
        emptyMessage="当前没有处理中或处理失败的上传。"
        issues={report.processing_tracks}
        title="处理状态关注"
      />
      <DuplicateSection groups={report.duplicate_groups} />
      <TrackSection
        emptyMessage="没有等待首次播放的可播放音轨。"
        title="从未播放的可播放音轨"
        tracks={report.never_played_ready_tracks}
      />
      <TrackSection
        emptyMessage="没有超过低频播放阈值的可播放音轨。"
        title="很少播放的可播放音轨"
        tracks={report.rarely_played_ready_tracks}
      />
      <IssueSection
        emptyMessage="没有冷却期已过的可播放音轨。"
        issues={report.stale_cooldown_tracks}
        title="已过期冷却"
      />
    </div>
  );
}

function TrackSection({
  emptyMessage,
  title,
  tracks,
}: {
  emptyMessage: string;
  title: string;
  tracks: LibraryReportTrack[];
}) {
  return (
    <ReportPanel count={tracks.length} title={title}>
      {tracks.length === 0 ? (
        <p style={emptyTextStyle}>{emptyMessage}</p>
      ) : (
        <TrackList tracks={tracks} />
      )}
    </ReportPanel>
  );
}

function IssueSection({
  emptyMessage,
  issues,
  title,
}: {
  emptyMessage: string;
  issues: LibraryReportTrackIssue[];
  title: string;
}) {
  return (
    <ReportPanel count={issues.length} title={title}>
      {issues.length === 0 ? (
        <p style={emptyTextStyle}>{emptyMessage}</p>
      ) : (
        <ul style={listStyle}>
          {issues.map((issue) => (
            <li key={issue.track.id} style={itemStyle}>
              <TrackSummary track={issue.track} />
              <p style={{ color: "#526174", lineHeight: 1.5, margin: "10px 0 0" }}>
                {issue.reasons.join(" ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </ReportPanel>
  );
}

function DuplicateSection({ groups }: { groups: LibraryOrganizationReport["duplicate_groups"] }) {
  return (
    <ReportPanel count={groups.length} title="重复音轨候选">
      {groups.length === 0 ? (
        <p style={emptyTextStyle}>没有重复音轨候选组。</p>
      ) : (
        <ul style={listStyle}>
          {groups.map((group) => (
            <li key={group.group_id} style={itemStyle}>
              <h3 style={{ margin: 0 }}>{formatMatchType(group.match_type)}</h3>
              <p style={{ color: "#526174", lineHeight: 1.5, margin: "8px 0 0" }}>
                {group.reason}
              </p>
              <ul style={{ display: "grid", gap: "8px", margin: "12px 0 0", paddingLeft: "20px" }}>
                {group.candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <RouteLink
                      style={trackLinkStyle}
                      to={`/tracks/${encodeURIComponent(candidate.id)}`}
                    >
                      {candidate.title || "未命名音轨"}
                    </RouteLink>
                    <span style={{ color: "#526174" }}>
                      {" "}
                      / {candidate.artist || "艺人未设置"} /{" "}
                      {formatDuration(candidate.duration_seconds)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </ReportPanel>
  );
}

function ReportPanel({
  children,
  count,
  title,
}: {
  children: ReactNode;
  count: number;
  title: string;
}) {
  return (
    <section className="panel">
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: "12px",
          justifyContent: "space-between",
        }}
      >
          <h2>{title}</h2>
        <span className="score-pill">{count}</span>
      </div>
      <div style={{ marginTop: "16px" }}>{children}</div>
    </section>
  );
}

function TrackList({ tracks }: { tracks: LibraryReportTrack[] }) {
  return (
    <ul style={listStyle}>
      {tracks.map((track) => (
        <li key={track.id} style={itemStyle}>
          <TrackSummary track={track} />
        </li>
      ))}
    </ul>
  );
}

function TrackSummary({ track }: { track: LibraryReportTrack }) {
  return (
    <div>
      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          justifyContent: "space-between",
        }}
      >
        <RouteLink style={trackLinkStyle} to={`/tracks/${encodeURIComponent(track.id)}`}>
          {track.title || "未命名音轨"}
        </RouteLink>
        <TrackStatusBadge status={track.status} />
      </div>
      <dl className="duplicate-candidate-meta">
        <Meta label="艺人" value={track.artist || "未设置"} />
        <Meta label="专辑" value={track.album || "未设置"} />
        <Meta label="时长" value={formatDuration(track.duration_seconds)} />
        <Meta label="播放次数" value={track.playback_count.toString()} />
        <Meta label="上次播放" value={formatDateTime(track.last_played_at)} />
        <Meta label="更新时间" value={formatDateTime(track.updated_at)} />
      </dl>
    </div>
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

function formatMatchType(matchType: string) {
  if (matchType === "exact_file") {
    return "文件完全一致";
  }

  if (matchType === "metadata_duration") {
    return "元数据和时长疑似一致";
  }

  return matchType
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "无法加载曲库报告。";
}

const listStyle = {
  display: "grid",
  gap: "12px",
  listStyle: "none",
  margin: 0,
  padding: 0,
} as const;

const itemStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "16px",
} as const;

const emptyTextStyle = {
  color: "#526174",
  lineHeight: 1.55,
  margin: 0,
} as const;

const trackLinkStyle = {
  color: "#0f766e",
  fontWeight: 800,
  textDecoration: "underline",
  textUnderlineOffset: "3px",
} as const;
