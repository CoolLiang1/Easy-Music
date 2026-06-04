import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { getLibraryOrganizationReport } from "../api/libraryReports";
import { useAuth } from "../auth/AuthProvider";
import { TrackStatusBadge } from "../components/TrackStatusBadge";
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
        message: "Sign in again to load library reports.",
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
      <p className="eyebrow">Reports</p>
      <h1 id="library-reports-title">Library organization</h1>
      <p className="page-copy">
        Find tracks that need metadata, tags, processing attention, or a fresh listen.
      </p>
      <div className="login-actions">
        <button
          className="button secondary"
          disabled={reportState.name === "loading" || isRefreshing}
          onClick={() => void loadReport(false)}
          type="button"
        >
          {isRefreshing ? "Refreshing..." : "Refresh reports"}
        </button>
        <RouteLink className="button secondary" to="/library">
          Back to library
        </RouteLink>
      </div>

      {reportState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          Loading library reports...
        </div>
      ) : null}

      {reportState.name === "error" ? (
        <div className="empty-state" role="alert">
          {reportState.message}
        </div>
      ) : null}

      {reportState.name === "ready" ? <ReportSections report={reportState.report} /> : null}
    </section>
  );
}

function ReportSections({ report }: { report: LibraryOrganizationReport }) {
  return (
    <div style={{ display: "grid", gap: "18px", marginTop: "28px" }}>
      <p className="page-copy" style={{ margin: 0 }}>
        Generated {formatDateTime(report.generated_at)}.
      </p>

      <TrackSection
        emptyMessage="No untagged ready tracks."
        title="Untagged ready tracks"
        tracks={report.untagged_ready_tracks}
      />
      <IssueSection
        emptyMessage="No ready tracks are missing core metadata."
        issues={report.missing_metadata_tracks}
        title="Missing metadata"
      />
      <IssueSection
        emptyMessage="No uploads are currently processing or failed."
        issues={report.processing_tracks}
        title="Processing attention"
      />
      <DuplicateSection groups={report.duplicate_groups} />
      <TrackSection
        emptyMessage="No ready tracks are waiting for a first play."
        title="Never played ready tracks"
        tracks={report.never_played_ready_tracks}
      />
      <TrackSection
        emptyMessage="No ready tracks are past the rarely played threshold."
        title="Rarely played ready tracks"
        tracks={report.rarely_played_ready_tracks}
      />
      <IssueSection
        emptyMessage="No ready tracks have expired cooldowns."
        issues={report.stale_cooldown_tracks}
        title="Expired cooldowns"
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
    <ReportPanel count={groups.length} title="Duplicate candidates">
      {groups.length === 0 ? (
        <p style={emptyTextStyle}>No duplicate candidate groups.</p>
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
                      {candidate.title || "Untitled track"}
                    </RouteLink>
                    <span style={{ color: "#526174" }}>
                      {" "}
                      / {candidate.artist || "Artist not set"} /{" "}
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
    <section
      style={{
        borderTop: "1px solid #d5dde8",
        paddingTop: "20px",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: "12px",
          justifyContent: "space-between",
        }}
      >
        <h2 style={{ margin: 0 }}>{title}</h2>
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
          {track.title || "Untitled track"}
        </RouteLink>
        <TrackStatusBadge status={track.status} />
      </div>
      <dl className="duplicate-candidate-meta">
        <Meta label="Artist" value={track.artist || "Not set"} />
        <Meta label="Album" value={track.album || "Not set"} />
        <Meta label="Duration" value={formatDuration(track.duration_seconds)} />
        <Meta label="Plays" value={track.playback_count.toString()} />
        <Meta label="Last played" value={formatDateTime(track.last_played_at)} />
        <Meta label="Updated" value={formatDateTime(track.updated_at)} />
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
    return "Exact file match";
  }

  if (matchType === "metadata_duration") {
    return "Likely metadata and duration match";
  }

  return matchType
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDuration(durationSeconds: number | null) {
  if (durationSeconds === null) {
    return "Not available";
  }

  const wholeSeconds = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to load library reports.";
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
