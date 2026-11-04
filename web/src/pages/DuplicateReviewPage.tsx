import { useCallback, useEffect, useState } from "react";

import { listDuplicateCandidates } from "../api/duplicates";
import { useAuth } from "../auth/AuthProvider";
import { TrackStatusBadge } from "../components/TrackStatusBadge";
import { Callout, EmptyState, LoadingRows, PageHeader, getErrorMessage } from "../components/ui/common";
import { Icon } from "../components/ui/Icon";
import { TrackCover } from "../components/ui/TrackCover";
import { formatBackendReason, formatContentTypeLabel, formatDuration } from "../i18n/zh";
import { RouteLink } from "../routes/RouteLink";
import type { DuplicateCandidateGroup } from "../types/duplicate";

type DuplicateReviewState =
  | { name: "loading" }
  | { name: "ready"; groups: DuplicateCandidateGroup[] }
  | { name: "error"; message: string };

export function DuplicateReviewPage() {
  const { accessToken } = useAuth();
  const [reviewState, setReviewState] = useState<DuplicateReviewState>({ name: "loading" });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadDuplicateGroups = useCallback(
    async (showLoading: boolean) => {
      if (!accessToken) {
        setReviewState({ name: "error", message: "登录已失效，请重新登录。" });
        return;
      }

      if (showLoading) {
        setReviewState({ name: "loading" });
      } else {
        setIsRefreshing(true);
      }

      try {
        setReviewState({ name: "ready", groups: await listDuplicateCandidates(accessToken) });
      } catch (error: unknown) {
        setReviewState({ name: "error", message: getErrorMessage(error, "无法加载重复音轨。") });
      } finally {
        setIsRefreshing(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadDuplicateGroups(true);
  }, [loadDuplicateGroups]);

  return (
    <div className="page">
      <PageHeader
        actions={
          <button
            className="btn btn-secondary"
            disabled={reviewState.name === "loading" || isRefreshing}
            onClick={() => void loadDuplicateGroups(false)}
            type="button"
          >
            <Icon name="refresh" size={16} />
            {isRefreshing ? "正在检查…" : "重新检查"}
          </button>
        }
        description="并排对比文件完全一致或信息相近的音轨。这里只做提示，不会删除或合并任何内容；要清理请进入详情页手动删除。"
        meta={
          reviewState.name === "ready" ? (
            <span>
              发现 <strong>{reviewState.groups.length}</strong> 组
            </span>
          ) : null
        }
        title="重复音轨"
      />

      {reviewState.name === "loading" ? (
        <div className="card">
          <LoadingRows rows={4} />
        </div>
      ) : null}

      {reviewState.name === "error" ? (
        <div className="card card-pad stack">
          <Callout title="加载失败" tone="danger">
            {reviewState.message}
          </Callout>
          <div>
            <button className="btn btn-secondary" onClick={() => void loadDuplicateGroups(true)} type="button">
              重试
            </button>
          </div>
        </div>
      ) : null}

      {reviewState.name === "ready" && reviewState.groups.length === 0 ? (
        <div className="card">
          <EmptyState
            description="曲库里没有文件完全一致或信息相近的音轨。"
            icon="check"
            title="没有发现重复"
          />
        </div>
      ) : null}

      {reviewState.name === "ready" && reviewState.groups.length > 0 ? (
        <div className="stack">
          {reviewState.groups.map((group) => (
            <article className="card" key={group.group_id}>
              <div className="card-header">
                <div>
                  <h2 className="card-title">{formatMatchType(group.match_type)}</h2>
                  <p className="card-subtitle">{formatBackendReason(group.reason)}</p>
                </div>
                <span className={group.confidence >= 0.9 ? "badge badge-danger plain" : "badge badge-warn plain"}>
                  可信度 {Math.round(Math.max(0, Math.min(1, group.confidence)) * 100)}%
                </span>
              </div>
              <div className="dup-candidates" style={{ marginTop: 14 }}>
                {group.candidates.map((candidate) => (
                  <div className="dup-candidate" key={candidate.id}>
                    <div className="row" style={{ flexWrap: "nowrap", gap: 10 }}>
                      <TrackCover
                        size={40}
                        track={{ cover_path: null, id: candidate.id, title: candidate.title }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <RouteLink
                          className="track-cell-title"
                          to={`/tracks/${encodeURIComponent(candidate.id)}`}
                        >
                          {candidate.title || "未命名音轨"}
                        </RouteLink>
                        <span className="track-cell-sub mono">#{candidate.id}</span>
                      </div>
                      <TrackStatusBadge status={candidate.status} />
                    </div>
                    <dl>
                      <dt>艺人</dt>
                      <dd>{candidate.artist || "—"}</dd>
                      <dt>专辑</dt>
                      <dd>{candidate.album || "—"}</dd>
                      <dt>时长</dt>
                      <dd className="mono">{formatDuration(candidate.duration_seconds)}</dd>
                      <dt>类型</dt>
                      <dd>{formatContentTypeLabel(candidate.content_type)}</dd>
                    </dl>
                    <RouteLink
                      className="btn btn-secondary btn-sm"
                      to={`/tracks/${encodeURIComponent(candidate.id)}`}
                    >
                      查看详情
                    </RouteLink>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
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
