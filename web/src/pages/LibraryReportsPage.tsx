import { useCallback, useEffect, useState, type ReactNode } from "react";

import { getLibraryOrganizationReport } from "../api/libraryReports";
import { useAuth } from "../auth/AuthProvider";
import { TrackStatusBadge } from "../components/TrackStatusBadge";
import { Callout, LoadingRows, PageHeader, getErrorMessage } from "../components/ui/common";
import { Icon } from "../components/ui/Icon";
import { TrackCover } from "../components/ui/TrackCover";
import { formatBackendReason, formatDateTime, formatDuration, formatRelativeDays } from "../i18n/zh";
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

type SectionKey =
  | "untagged"
  | "metadata"
  | "processing"
  | "duplicates"
  | "never"
  | "rarely"
  | "cooldown";

type SectionDef = {
  action: string;
  attention: boolean;
  clear: string;
  key: SectionKey;
  title: string;
};

const sections: SectionDef[] = [
  {
    action: "打上场景/类型/特点标签后，它们才会出现在推荐里。",
    attention: true,
    clear: "所有可播放音轨都有标签了。",
    key: "untagged",
    title: "还没打标签",
  },
  {
    action: "补上艺人、专辑等信息，搜索和推荐说明会更准确。",
    attention: true,
    clear: "可播放音轨的核心信息都填好了。",
    key: "metadata",
    title: "信息不完整",
  },
  {
    action: "处理中的会自动完成；失败的可以查看详情里的错误。",
    attention: true,
    clear: "没有处理中或失败的上传。",
    key: "processing",
    title: "处理状态",
  },
  {
    action: "确认后可以在详情页删除多余的副本。这里不会自动删除任何内容。",
    attention: true,
    clear: "没有发现可能重复的音轨。",
    key: "duplicates",
    title: "可能重复",
  },
  {
    action: "上传后还没播放过的音轨。",
    attention: false,
    clear: "每首可播放音轨都至少播放过一次。",
    key: "never",
    title: "从未播放",
  },
  {
    action: "播放次数很少的音轨，可能值得重新听听或整理。",
    attention: false,
    clear: "没有低频播放的音轨。",
    key: "rarely",
    title: "很少播放",
  },
  {
    action: "冷却时间已经过了，可以按需清除冷却设置。",
    attention: false,
    clear: "没有过期的冷却设置。",
    key: "cooldown",
    title: "冷却已过期",
  },
];

export function LibraryReportsPage() {
  const { accessToken } = useAuth();
  const [reportState, setReportState] = useState<ReportState>({ name: "loading" });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadReport = useCallback(
    async (showLoading: boolean) => {
      if (!accessToken) {
        setReportState({ name: "error", message: "登录已失效，请重新登录。" });
        return;
      }

      if (showLoading) {
        setReportState({ name: "loading" });
      } else {
        setIsRefreshing(true);
      }

      try {
        setReportState({ name: "ready", report: await getLibraryOrganizationReport(accessToken) });
      } catch (error: unknown) {
        setReportState({ name: "error", message: getErrorMessage(error, "无法加载整理报告。") });
      } finally {
        setIsRefreshing(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadReport(true);
  }, [loadReport]);

  const report = reportState.name === "ready" ? reportState.report : null;
  const counts: Record<SectionKey, number> = report
    ? {
        cooldown: report.stale_cooldown_tracks.length,
        duplicates: report.duplicate_groups.length,
        metadata: report.missing_metadata_tracks.length,
        never: report.never_played_ready_tracks.length,
        processing: report.processing_tracks.length,
        rarely: report.rarely_played_ready_tracks.length,
        untagged: report.untagged_ready_tracks.length,
      }
    : { cooldown: 0, duplicates: 0, metadata: 0, never: 0, processing: 0, rarely: 0, untagged: 0 };
  const todoCount = sections
    .filter((section) => section.attention)
    .reduce((sum, section) => sum + counts[section.key], 0);

  return (
    <div className="page">
      <PageHeader
        actions={
          <button
            className="btn btn-secondary"
            disabled={reportState.name === "loading" || isRefreshing}
            onClick={() => void loadReport(false)}
            type="button"
          >
            <Icon name="refresh" size={16} />
            {isRefreshing ? "正在刷新…" : "重新生成"}
          </button>
        }
        description="找出需要补标签、补信息或关注处理状态的音轨。报告只读，不会修改任何内容。"
        meta={
          report ? (
            <>
              <span>
                待整理 <strong>{todoCount}</strong> 项
              </span>
              <span>生成于 {formatDateTime(report.generated_at)}</span>
            </>
          ) : null
        }
        title="整理报告"
      />

      {reportState.name === "loading" ? (
        <div className="card">
          <LoadingRows rows={6} />
        </div>
      ) : null}

      {reportState.name === "error" ? (
        <div className="card card-pad stack">
          <Callout title="报告加载失败" tone="danger">
            {reportState.message}
          </Callout>
          <div>
            <button className="btn btn-secondary" onClick={() => void loadReport(true)} type="button">
              重试
            </button>
          </div>
        </div>
      ) : null}

      {report ? (
        <>
          <div className="stat-grid">
            {sections.map((section) => {
              const count = counts[section.key];
              const tone = count === 0 ? "clear" : section.attention ? "attention" : "";
              return (
                <button
                  className={`stat-card ${tone}`}
                  key={section.key}
                  onClick={() =>
                    document
                      .getElementById(`report-${section.key}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  type="button"
                >
                  <span className="stat-card-value">{count}</span>
                  <span className="stat-card-label">{section.title}</span>
                </button>
              );
            })}
          </div>

          <div className="stack">
            {sections.map((section) => (
              <ReportSection count={counts[section.key]} key={section.key} section={section}>
                {section.key === "untagged" ? <TrackRows tracks={report.untagged_ready_tracks} /> : null}
                {section.key === "metadata" ? <IssueRows issues={report.missing_metadata_tracks} /> : null}
                {section.key === "processing" ? <IssueRows issues={report.processing_tracks} showStatus /> : null}
                {section.key === "duplicates" ? <DuplicateRows groups={report.duplicate_groups} /> : null}
                {section.key === "never" ? <TrackRows tracks={report.never_played_ready_tracks} /> : null}
                {section.key === "rarely" ? <TrackRows tracks={report.rarely_played_ready_tracks} /> : null}
                {section.key === "cooldown" ? <IssueRows issues={report.stale_cooldown_tracks} /> : null}
              </ReportSection>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ReportSection({
  children,
  count,
  section,
}: {
  children: ReactNode;
  count: number;
  section: SectionDef;
}) {
  return (
    <section aria-labelledby={`report-${section.key}-title`} className="card" id={`report-${section.key}`}>
      <div className="card-header" style={count === 0 ? { paddingBottom: 16 } : undefined}>
        <div>
          <h2 className="card-title row" id={`report-${section.key}-title`} style={{ gap: 8 }}>
            {section.title}
            <span className="count-pill">{count}</span>
          </h2>
          <p className="card-subtitle">
            {count === 0 ? (
              <span className="row" style={{ gap: 6, color: "var(--ok)" }}>
                <Icon name="check" size={15} />
                {section.clear}
              </span>
            ) : (
              section.action
            )}
          </p>
        </div>
      </div>
      {count > 0 ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </section>
  );
}

const PREVIEW_LIMIT = 8;

function useExpandable<T>(items: T[]) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, PREVIEW_LIMIT);
  const toggle =
    items.length > PREVIEW_LIMIT ? (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setExpanded((current) => !current)}
        style={{ margin: "4px 12px 12px" }}
        type="button"
      >
        {expanded ? "收起" : `显示全部 ${items.length} 项`}
      </button>
    ) : null;
  return { toggle, visible };
}

function TrackRows({ tracks }: { tracks: LibraryReportTrack[] }) {
  const { toggle, visible } = useExpandable(tracks);
  return (
    <>
      <ul className="list-rows">
        {visible.map((track) => (
          <li className="list-row" key={track.id}>
            <ReportTrack track={track} />
          </li>
        ))}
      </ul>
      {toggle}
    </>
  );
}

function IssueRows({ issues, showStatus = false }: { issues: LibraryReportTrackIssue[]; showStatus?: boolean }) {
  const { toggle, visible } = useExpandable(issues);
  return (
    <>
      <ul className="list-rows">
        {visible.map((issue) => (
          <li className="list-row" key={issue.track.id}>
            <ReportTrack note={issue.reasons.map(formatBackendReason).join("、")} showStatus={showStatus} track={issue.track} />
          </li>
        ))}
      </ul>
      {toggle}
    </>
  );
}

function ReportTrack({
  note,
  showStatus = false,
  track,
}: {
  note?: string;
  showStatus?: boolean;
  track: LibraryReportTrack;
}) {
  return (
    <>
      <TrackCover size={36} track={{ cover_path: null, id: track.id, title: track.title }} />
      <div className="list-row-main">
        <RouteLink className="track-cell-title" to={`/tracks/${encodeURIComponent(track.id)}`}>
          {track.title || "未命名音轨"}
        </RouteLink>
        <span className="track-cell-sub">
          {[track.artist || "未填写艺人", formatDuration(track.duration_seconds)]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {note ? <p className="list-row-note">{note}</p> : null}
      </div>
      {showStatus ? <TrackStatusBadge status={track.status} /> : null}
      <span className="list-row-meta">
        播放 {track.playback_count} 次
        <br />
        <span className="faint">上次 {formatRelativeDays(track.last_played_at)}</span>
      </span>
      <RouteLink
        aria-label={`编辑「${track.title || "未命名音轨"}」`}
        className="icon-btn"
        title="去编辑"
        to={`/tracks/${encodeURIComponent(track.id)}`}
      >
        <Icon name="chevronRight" size={17} />
      </RouteLink>
    </>
  );
}

function DuplicateRows({ groups }: { groups: LibraryOrganizationReport["duplicate_groups"] }) {
  return (
    <>
      <ul className="list-rows">
        {groups.map((group) => (
          <li className="list-row" key={group.group_id} style={{ alignItems: "flex-start" }}>
            <span className="file-icon">
              <Icon name="copy" size={17} />
            </span>
            <div className="list-row-main">
              <span className="track-cell-title">{formatMatchType(group.match_type)}</span>
              <span className="track-cell-sub">{formatBackendReason(group.reason)}</span>
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                {group.candidates.map((candidate) => (
                  <RouteLink
                    className="chip"
                    key={candidate.id}
                    to={`/tracks/${encodeURIComponent(candidate.id)}`}
                  >
                    {candidate.title || "未命名音轨"} · {formatDuration(candidate.duration_seconds)}
                  </RouteLink>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div style={{ padding: "4px 20px 14px" }}>
        <RouteLink className="btn btn-ghost btn-sm" to="/duplicates">
          打开重复音轨对比
          <Icon name="chevronRight" size={14} />
        </RouteLink>
      </div>
    </>
  );
}

function formatMatchType(matchType: string) {
  if (matchType === "exact_file") {
    return "文件完全一致";
  }

  if (matchType === "metadata_duration") {
    return "元数据和时长相近";
  }

  return matchType.replace(/[_-]+/g, " ");
}
