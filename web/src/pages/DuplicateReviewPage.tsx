import { useCallback, useEffect, useState } from "react";

import { listDuplicateCandidates } from "../api/duplicates";
import { useAuth } from "../auth/AuthProvider";
import { TrackStatusBadge } from "../components/TrackStatusBadge";
import {
  formatContentTypeLabel,
  formatDuration,
  formatTrackStatusLabel,
} from "../i18n/zh";
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
        message: "请重新登录后再查看重复音轨候选。",
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
          <p className="eyebrow">重复检查</p>
          <h1 id="duplicate-review-title">重复音轨候选</h1>
          <p className="page-copy">
            查看曲库中完全一致或疑似重复的音轨组。这里只提供参考，不会删除、
            合并、隐藏或修改任何音轨。
          </p>
        </div>
        {reviewState.name === "ready" ? (
          <span className="score-pill">{reviewState.groups.length} 组</span>
        ) : null}
      </div>
      <div className="toolbar">
        <button
          className="button secondary"
          disabled={reviewState.name === "loading" || isRefreshing}
          onClick={() => void loadDuplicateGroups(false)}
          type="button"
        >
          {isRefreshing ? "正在刷新..." : "刷新重复音轨"}
        </button>
        <RouteLink className="button secondary" to="/library">
          返回曲库
        </RouteLink>
      </div>

      {reviewState.name === "loading" ? (
        <div className="empty-state" aria-live="polite">
          正在加载重复音轨候选...
        </div>
      ) : null}

      {reviewState.name === "error" ? (
        <div className="empty-state error" role="alert">
          {reviewState.message}
        </div>
      ) : null}

      {reviewState.name === "ready" && reviewState.groups.length === 0 ? (
        <div className="empty-state">未发现重复音轨候选组。</div>
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
                    {candidate.title || "未命名音轨"}
                  </RouteLink>
                  <TrackStatusBadge status={candidate.status} />
                </div>
                <dl className="duplicate-candidate-meta">
                  <CandidateMeta label="艺人" value={candidate.artist || "未设置"} />
                  <CandidateMeta label="专辑" value={candidate.album || "未设置"} />
                  <CandidateMeta
                    label="时长"
                    value={formatDuration(candidate.duration_seconds)}
                  />
                  <CandidateMeta
                    label="类型"
                    value={formatContentTypeLabel(candidate.content_type)}
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
    return "文件完全一致";
  }

  if (matchType === "metadata_duration") {
    return "元数据和时长疑似一致";
  }

  return formatTrackStatusLabel(matchType);
}

function formatConfidence(confidence: number) {
  const percentage = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return `${percentage}% 可信度`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "无法加载重复音轨候选。";
}
