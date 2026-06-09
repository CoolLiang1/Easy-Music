import type { RecommendationExplanation } from "../types/recommendation";

type RecommendationExplanationDetailsProps = {
  explanation?: RecommendationExplanation;
};

const groupLabels: Record<string, string> = {
  scenario: "Scenario matches",
  state: "State matches",
  type: "Type matches",
  attribute: "Attribute matches",
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
    <dl
      className="recommendation-meta"
      aria-label="Structured recommendation explanation"
    >
      {matchedEntries.map(([group, tags]) => (
        <div key={group}>
          <dt>{groupLabels[group] ?? `${formatLabel(group)} matches`}</dt>
          <dd>{tags.map((tag) => tag.name).join(", ")}</dd>
        </div>
      ))}

      <ExplanationPartList label="Boosts" parts={boosts} />
      <ExplanationPartList label="Penalties" parts={penalties} />
      <ExplanationPartList label="Feedback impact" parts={feedbackImpacts} />
      <ExplanationPartList label="Avoidance" parts={avoidanceReasons} />
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
    <div className="empty-state" aria-label="Recommendation exclusions considered">
      <strong>Filtered before ranking:</strong> {exclusions.join(" ")}
    </div>
  );
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
  if (part.score_delta === null || part.score_delta === undefined) {
    return part.label;
  }

  const prefix = part.score_delta > 0 ? "+" : "";
  return `${part.label} (${prefix}${part.score_delta})`;
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}
