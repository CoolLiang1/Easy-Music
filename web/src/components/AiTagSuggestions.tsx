import { useCallback, useMemo, useState } from "react";

import { suggestTrackTags } from "../api/ai";
import { ApiClientError } from "../api/http";
import type {
  AiProviderStatus,
  ExistingTagSuggestion,
  NewTagSuggestion,
  TagSuggestionResponse,
} from "../types/ai";
import type { Tag, TagGroup } from "../types/tag";

// ---------------------------------------------------------------------------
// props
// ---------------------------------------------------------------------------

type AiTagSuggestionsProps = {
  accessToken: string | null;
  onToggleTag: (tagId: number) => void;
  selectedTagIds: number[];
  trackId: number;
};

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

type SuggestState =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "ready"; response: TagSuggestionResponse }
  | { name: "error"; message: string };

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const GROUP_ORDER: TagGroup[] = ["scenario", "state", "type", "attribute"];

const GROUP_LABELS: Record<TagGroup, string> = {
  scenario: "Scenario",
  state: "State",
  type: "Type",
  attribute: "Attribute",
};

// ---------------------------------------------------------------------------
// component
// ---------------------------------------------------------------------------

export function AiTagSuggestions({
  accessToken,
  onToggleTag,
  selectedTagIds,
  trackId,
}: AiTagSuggestionsProps) {
  const [suggestState, setSuggestState] = useState<SuggestState>({
    name: "idle",
  });

  const selectedSet = useMemo(
    () => new Set(selectedTagIds),
    [selectedTagIds],
  );

  const handleRequest = useCallback(async () => {
    if (!accessToken) {
      setSuggestState({
        name: "error",
        message: "Sign in again to request tag suggestions.",
      });
      return;
    }

    setSuggestState({ name: "loading" });

    try {
      const response = await suggestTrackTags(accessToken, trackId, {
        include_new_tag_suggestions: true,
      });
      setSuggestState({ name: "ready", response });
    } catch (error: unknown) {
      setSuggestState({
        name: "error",
        message: getSuggestionError(error),
      });
    }
  }, [accessToken, trackId]);

  const isLoading = suggestState.name === "loading";

  return (
    <div
      style={{
        border: "1px solid #d5dde8",
        borderRadius: "8px",
        background: "#f0f4ff",
        marginTop: "24px",
        padding: "22px",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: "14px",
          justifyContent: "space-between",
        }}
      >
        <h2 style={{ margin: 0 }}>AI tag suggestions</h2>
        <button
          className="button secondary"
          disabled={isLoading}
          onClick={() => void handleRequest()}
          type="button"
        >
          {isLoading ? "Asking AI..." : "Get AI tag suggestions"}
        </button>
      </div>

      <p className="page-copy" style={{ marginTop: "8px" }}>
        Let the AI Assistant analyse this track&apos;s metadata and suggest
        tags from your catalogue. No tags are applied until you save them
        explicitly.
      </p>

      {/* ---- states ---- */}
      {suggestState.name === "idle" ? (
        <p className="recommendation-muted" style={{ marginTop: "14px" }}>
          Click the button above to request AI tag suggestions for this track.
        </p>
      ) : null}

      {suggestState.name === "loading" ? (
        <p className="recommendation-muted" style={{ marginTop: "14px" }}>
          Analysing track metadata and matching against your tag catalogue...
        </p>
      ) : null}

      {suggestState.name === "error" ? (
        <div role="alert" style={{ color: "#991b1b", fontWeight: 700, marginTop: "14px" }}>
          {suggestState.message}
        </div>
      ) : null}

      {suggestState.name === "ready" ? (
        <AiSuggestionsReady
          onToggleTag={onToggleTag}
          response={suggestState.response}
          selectedSet={selectedSet}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ready content
// ---------------------------------------------------------------------------

type AiSuggestionsReadyProps = {
  onToggleTag: (tagId: number) => void;
  response: TagSuggestionResponse;
  selectedSet: Set<number>;
};

function AiSuggestionsReady({
  onToggleTag,
  response,
  selectedSet,
}: AiSuggestionsReadyProps) {
  const {
    existing_tag_suggestions: existing,
    new_tag_suggestions: newTags,
    explanation,
    provider_status: status,
  } = response;

  return (
    <div style={{ marginTop: "14px" }}>
      <ProviderWarning status={status} />

      {/* AI explanation */}
      {explanation ? (
        <p className="recommendation-reason">{explanation}</p>
      ) : null}

      {/* existing tag suggestions grouped */}
      {GROUP_ORDER.map((group) => {
        const items = existing[group];
        if (!items || items.length === 0) {
          return null;
        }
        return (
          <SuggestionGroup
            group={group}
            items={items}
            key={group}
            onToggleTag={onToggleTag}
            selectedSet={selectedSet}
          />
        );
      })}

      {/* no existing suggestions */}
      {Object.keys(existing).length === 0 ? (
        <p className="recommendation-muted">
          No existing-tag suggestions were returned.
        </p>
      ) : null}

      {/* new tag suggestions (info only) */}
      {newTags.length > 0 ? (
        <NewTagSuggestionsPanel items={newTags} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// sub-components
// ---------------------------------------------------------------------------

function ProviderWarning({ status }: { status: AiProviderStatus }) {
  if (status === "ok") {
    return null;
  }

  const messages: Record<AiProviderStatus, string> = {
    ok: "",
    disabled:
      "AI provider is disabled. Suggestions may be incomplete.",
    unconfigured:
      "AI provider is not configured. Check AI_API_KEY and AI_MODEL.",
    error:
      "AI provider encountered an error. Suggestions may be incomplete.",
  };

  return (
    <div
      role="alert"
      style={{
        background: "#fef3c7",
        border: "1px solid #d97706",
        borderRadius: "6px",
        color: "#92400e",
        fontWeight: 700,
        marginBottom: "14px",
        padding: "10px 14px",
      }}
    >
      {messages[status]}
    </div>
  );
}

type SuggestionGroupProps = {
  group: TagGroup;
  items: ExistingTagSuggestion[];
  onToggleTag: (tagId: number) => void;
  selectedSet: Set<number>;
};

function SuggestionGroup({
  group,
  items,
  onToggleTag,
  selectedSet,
}: SuggestionGroupProps) {
  return (
    <div
      style={{
        border: "1px solid #d5dde8",
        borderRadius: "8px",
        background: "#fff",
        marginBottom: "12px",
        padding: "14px",
      }}
    >
      <h3 style={{ fontSize: "0.95rem", margin: "0 0 10px" }}>
        {GROUP_LABELS[group]}
      </h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {items.map((suggestion) => {
          const isSelected = selectedSet.has(suggestion.tag_id);
          return (
            <div
              key={suggestion.tag_id}
              style={{
                alignItems: "center",
                background: isSelected ? "#dcfce7" : "#f8fafc",
                border: isSelected
                  ? "1px solid #16a34a"
                  : "1px solid #d5dde8",
                borderRadius: "8px",
                display: "flex",
                gap: "8px",
                padding: "6px 12px",
              }}
              title={`${suggestion.reason} (confidence: ${suggestion.confidence.toFixed(2)})`}
            >
              <span style={{ fontWeight: 800, fontSize: "0.9rem" }}>
                {suggestion.name}
              </span>
              <span
                style={{
                  color: "#64748b",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                {Math.round(suggestion.confidence * 100)}%
              </span>
              {isSelected ? (
                <span
                  style={{
                    color: "#16a34a",
                    fontSize: "0.8rem",
                    fontWeight: 800,
                  }}
                >
                  &#10003; Added
                </span>
              ) : (
                <button
                  className="button secondary"
                  onClick={() => onToggleTag(suggestion.tag_id)}
                  style={{
                    fontSize: "0.8rem",
                    padding: "2px 10px",
                  }}
                  type="button"
                >
                  + Add
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewTagSuggestionsPanel({ items }: { items: NewTagSuggestion[] }) {
  return (
    <div
      style={{
        border: "1px dashed #d5dde8",
        borderRadius: "8px",
        background: "#fefce8",
        marginTop: "14px",
        padding: "14px",
      }}
    >
      <h3 style={{ fontSize: "0.95rem", margin: "0 0 8px" }}>
        New tag ideas (suggestions only — not created)
      </h3>
      <p className="recommendation-muted" style={{ marginBottom: "10px" }}>
        These tag names do not exist yet. Create them on the Tags page before
        assigning them to this track.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {items.map((suggestion, index) => (
          <span
            key={`${suggestion.name}-${index}`}
            style={{
              background: "#fefce8",
              border: "1px dashed #ca8a04",
              borderRadius: "8px",
              color: "#854d0e",
              fontSize: "0.85rem",
              fontWeight: 700,
              padding: "4px 10px",
            }}
            title={`${suggestion.reason} (confidence: ${suggestion.confidence.toFixed(2)})`}
          >
            {suggestion.name}{" "}
            <span style={{ color: "#a16207", fontWeight: 600 }}>
              ({suggestion.group})
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function getSuggestionError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return "Your session is unauthorized. Sign in again and retry.";
    }
    if (error.status === 503) {
      return "AI provider is unavailable. Check backend AI configuration.";
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unable to load tag suggestions.";
}
