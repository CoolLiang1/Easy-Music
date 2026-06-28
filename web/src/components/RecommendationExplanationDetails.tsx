import type { RecommendationExplanation } from "../types/recommendation";

type RecommendationExplanationDetailsProps = {
  explanation?: RecommendationExplanation;
};

const groupLabels: Record<string, string> = {
  scenario: "场景匹配",
  state: "状态匹配",
  type: "类型匹配",
  attribute: "属性匹配",
};

export function RecommendationExplanationDetails({
  explanation,
}: RecommendationExplanationDetailsProps) {
  if (!explanation) {
    return null;
  }

  const matchedEntries = Object.entries(explanation.matched_tags ?? {}).filter(
    ([, tags]) => tags.length > 0,
  );
  const boosts = explanation.boosts ?? [];
  const penalties = explanation.penalties ?? [];
  const feedbackImpacts = explanation.feedback_impacts ?? [];
  const avoidanceReasons = explanation.avoidance_reasons ?? [];

  if (
    matchedEntries.length === 0 &&
    boosts.length === 0 &&
    penalties.length === 0 &&
    feedbackImpacts.length === 0 &&
    avoidanceReasons.length === 0
  ) {
    return null;
  }

  return (
    <dl className="recommendation-meta" aria-label="结构化推荐解释">
      {matchedEntries.map(([group, tags]) => (
        <div key={group}>
          <dt>{groupLabels[group] ?? `${formatLabel(group)} 匹配`}</dt>
          <dd>{tags.map((tag) => tag.name).join(", ")}</dd>
        </div>
      ))}

      <ExplanationPartList label="加分项" parts={boosts} />
      <ExplanationPartList label="降权项" parts={penalties} />
      <ExplanationPartList label="反馈影响" parts={feedbackImpacts} />
      <ExplanationPartList label="规避原因" parts={avoidanceReasons} />
    </dl>
  );
}

export function RecommendationExclusionsNotice({
  exclusions,
}: {
  exclusions?: string[];
}) {
  if (!exclusions || exclusions.length === 0) {
    return null;
  }

  return (
    <div className="empty-state" aria-label="推荐排序前过滤项">
      <strong>排序前已过滤：</strong>{" "}
      {exclusions.map(formatRecommendationExclusionForDisplay).join(" ")}
    </div>
  );
}

export function formatRecommendationReasonForDisplay(reason: string) {
  const segments = reason
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return reason;
  }

  return segments.map(formatReasonSegment).join("；");
}

export function formatRecommendationExclusionForDisplay(exclusion: string) {
  const activeCooldown = exclusion.match(/^(.+) excluded by active cooldown\.$/);
  if (activeCooldown) {
    return `${activeCooldown[1]} 仍在冷却期，strict 模式下已过滤。`;
  }

  const notToday = exclusion.match(
    /^(.+) excluded by not_today feedback for today\.$/,
  );
  if (notToday) {
    return `${notToday[1]} 今天已标记不想听，已过滤。`;
  }

  return formatRecommendationReasonForDisplay(exclusion);
}

type ExplanationPartListProps = {
  label: string;
  parts: Array<{ label: string; score_delta: number | null }>;
};

function ExplanationPartList({ label, parts }: ExplanationPartListProps) {
  if (parts.length === 0) {
    return null;
  }

  return (
    <div>
      <dt>{label}</dt>
      <dd>{parts.map(formatPart).join("; ")}</dd>
    </div>
  );
}

function formatPart(part: { label: string; score_delta: number | null }) {
  const label = formatExplanationLabel(part.label);
  if (part.score_delta === null || part.score_delta === undefined) {
    return label;
  }

  const prefix = part.score_delta > 0 ? "+" : "";
  return `${label} (${prefix}${formatScoreDelta(part.score_delta)})`;
}

function formatReasonSegment(segment: string) {
  const label = stripTrailingPeriod(segment);
  const tagMatch = label.match(/^matched (scenario|state|type|attribute) tags?: (.+)$/);
  if (tagMatch) {
    return `${groupLabels[tagMatch[1]] ?? formatLabel(tagMatch[1])}：${tagMatch[2]}`;
  }

  return formatExplanationLabel(label);
}

function formatExplanationLabel(label: string) {
  const normalized = stripTrailingPeriod(label.trim());
  const playlistMembership = normalized.match(/^playlist membership boost: (.+)$/);
  if (playlistMembership) {
    return `已加入你的歌单：${playlistMembership[1]}`;
  }

  const playlistContext = normalized.match(/^playlist context boost: (.+)$/);
  if (playlistContext) {
    return `歌单名称/描述匹配：${playlistContext[1]}`;
  }

  const excludedAttribute = normalized.match(/^excluded attribute penalty: (.+)$/);
  if (excludedAttribute) {
    return `命中排除属性：${excludedAttribute[1]}`;
  }

  const matchedExcludedAttribute = normalized.match(
    /^matched excluded attributes: (.+)$/,
  );
  if (matchedExcludedAttribute) {
    return `规避属性命中：${matchedExcludedAttribute[1]}`;
  }

  const labels: Record<string, string> = {
    "liked track boost": "你喜欢的歌曲",
    "active cooldown soft penalty": "最近听过，已轻微降权",
    "active cooldown retained by soft mode": "软冷却模式保留了这首歌，只降低排序",
    "recently played penalty": "最近播放过，已降低排序",
    "dislike feedback penalty": "你标记过不喜欢，已明显降权",
    "not suitable for this context penalty": "曾反馈不适合类似场景，已降权",
    "recent recommendation skip penalty": "近期跳过过推荐，已降权",
    "no requested tag matches": "没有命中当前选择的标签",
  };

  return labels[normalized] ?? formatLabel(normalized);
}

function formatScoreDelta(delta: number) {
  return delta.toFixed(2).replace(/\.?0+$/, "");
}

function stripTrailingPeriod(value: string) {
  return value.replace(/\.$/, "");
}

function formatLabel(value: string) {
  return value.replace(/[_-]+/g, " ");
}
