import { useCallback, useEffect, useState } from "react";

import { listDuplicateCandidates } from "../api/duplicates";
import { useAuth } from "../auth/AuthProvider";
import { TrackStatusBadge } from "../components/TrackStatusBadge";
import { RouteLink } from "../routes/RouteLink";
import type { DuplicateCandidateGroup } from "../types/duplicate";

type DuplicateReviewState =
  | { name: "loading" }
  | { name: "ready"; groups: DuplicateCandidateGroup[] }
  | { name: "error"; message: string };

export function DuplicateReviewPage() {
  const { accessToken } = useAuth();
  const [reviewState, setReviewState] = useState<DuplicateReviewState>({
    name: "loading",
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadDuplicateGroups = useCallback(async (showLoading: boolean) => {
    if (!accessToken) {
      setReviewState({
        name: "error",
        message: "Sign in again to review duplicate candidates.",
      });
      return;
    }

    if (showLoading) {
      setReviewState({ name: "loading" });
    } else {
      setIsRefreshing(true);
    }

    try {
      const groups = await listDuplicateCandidates(accessToken);
      setReviewState({ name: "ready", groups });
    } catch (error: unknown) {
      setReviewState({
        name: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadDuplicateGroups(true);
  }, [loadDuplicateGroups]);

  return (
    <section className="page-panel" aria-labelledby="duplicate-review-title">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">Duplicate review</p>
          <h1 id="duplicate-review-title">Duplicate candidates</h1>
          <p className="page-copy">
            Review exact and likely duplicate groups across the library. Matches
            are advisory only; this view never deletes, merges, hides, or
            modifies tracks.
          </p>
        </div>
        {reviewState.name === "ready" ? (
          <span className="score-pill">{reviewState.groups.length} groups</span>
        ) : null}
      </div>
      <div className="toolbar">
        <button
          className="button secondary"
          disabled={reviewState.name === "loading" || isRefreshing}
          onClick={() => void loadDuplicateGroups(false)}
          type="button"
        >
          {isRefreshing ? "Refreshing..." : "Refresh duplicates"}
        </button>
        <RouteLink className="button secondary" to="/library">
          Back to library
        </RouteLink>
      </div>

      {reviewState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          Loading duplicate candidates...
        </div>
      ) : null}

      {reviewState.name === "error" ? (
        <div className="empty-state error" role="alert">
          {reviewState.message}
        </div>
      ) : null}

      {reviewState.name === "ready" && reviewState.groups.length === 0 ? (
        <div className="empty-state">No duplicate candidate groups found.</div>
      ) : null}

      {reviewState.name === "ready" && reviewState.groups.length > 0 ? (
        <DuplicateGroupList groups={reviewState.groups} />
      ) : null}
    </section>
  );
}

function DuplicateGroupList({ groups }: { groups: DuplicateCandidateGroup[] }) {
  return (
    <div style={{ display: "grid", gap: "16px", marginTop: "28px" }}>
      {groups.map((group) => (
        <article
          key={group.group_id}
          style={{
            background: "#f8fafc",
            border: "1px solid #d5dde8",
            borderRadius: "8px",
            padding: "22px",
          }}
        >
          <div
            style={{
              alignItems: "flex-start",
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h2 style={{ marginBottom: "8px" }}>{formatMatchType(group.match_type)}</h2>
              <p style={{ color: "#334155", lineHeight: 1.55, margin: 0 }}>
                {group.reason}
              </p>
            </div>
            <span className="score-pill">{formatConfidence(group.confidence)}</span>
          </div>

          <ul
            style={{
              display: "grid",
              gap: "12px",
              listStyle: "none",
              margin: "18px 0 0",
              padding: 0,
            }}
          >
            {group.candidates.map((candidate) => (
              <li
                key={candidate.id}
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    alignItems: "flex-start",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px",
                    justifyContent: "space-between",
                  }}
                >
                  <RouteLink
                    style={{
                      color: "#0f766e",
                      fontWeight: 800,
                      textDecoration: "underline",
                      textUnderlineOffset: "3px",
                    }}
                    to={`/tracks/${encodeURIComponent(candidate.id)}`}
                  >
                    {candidate.title || "Untitled track"}
                  </RouteLink>
                  <TrackStatusBadge status={candidate.status} />
                </div>
                <dl className="duplicate-candidate-meta">
                  <CandidateMeta label="Artist" value={candidate.artist || "Not set"} />
                  <CandidateMeta label="Album" value={candidate.album || "Not set"} />
                  <CandidateMeta
                    label="Duration"
                    value={formatDuration(candidate.duration_seconds)}
                  />
                  <CandidateMeta
                    label="Type"
                    value={formatContentType(candidate.content_type)}
                  />
                </dl>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function CandidateMeta({ label, value }: { label: string; value: string }) {
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

function formatConfidence(confidence: number) {
  const percentage = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return `${percentage}% confidence`;
}

function formatContentType(contentType: string) {
  return contentType
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to load duplicate candidates.";
}
