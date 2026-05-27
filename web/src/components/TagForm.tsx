import { type FormEvent, useEffect, useId, useState } from "react";

import type { Tag, TagCreate, TagGroup } from "../types/tag";

type TagFormProps = {
  disabled?: boolean;
  errorMessage?: string | null;
  mode: "create" | "edit";
  onCancel?: () => void;
  onSubmit: (payload: TagCreate) => Promise<void>;
  successMessage?: string | null;
  tag?: Tag;
};

type FormState = {
  group: TagGroup;
  name: string;
};

export const tagGroups: TagGroup[] = [
  "scenario",
  "state",
  "type",
  "attribute",
];

export const tagGroupLabels: Record<TagGroup, string> = {
  scenario: "Scenario",
  state: "State",
  type: "Type",
  attribute: "Attribute",
};

export function TagForm({
  disabled = false,
  errorMessage,
  mode,
  onCancel,
  onSubmit,
  successMessage,
  tag,
}: TagFormProps) {
  const groupId = useId();
  const nameId = useId();
  const [formState, setFormState] = useState<FormState>(() =>
    buildFormState(tag),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setFormState(buildFormState(tag));
    setValidationError(null);
  }, [tag]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const error = getValidationError(formState);
    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError(null);
    await onSubmit(buildPayload(formState));

    if (mode === "create") {
      setFormState(buildFormState());
    }
  };

  const message = validationError ?? errorMessage;

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "30px" }}>
      <div
        style={{
          border: "1px solid #d5dde8",
          borderRadius: "8px",
          background: "#f8fafc",
          padding: "22px",
        }}
      >
        <h2>{mode === "create" ? "Create tag" : "Edit tag"}</h2>
        <div
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            marginTop: "18px",
          }}
        >
          <label htmlFor={nameId} style={fieldStyle}>
            Name
            <input
              disabled={disabled}
              id={nameId}
              maxLength={100}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              required
              style={inputStyle}
              type="text"
              value={formState.name}
            />
          </label>

          <label htmlFor={groupId} style={fieldStyle}>
            Group
            <select
              disabled={disabled}
              id={groupId}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  group: event.target.value as TagGroup,
                }))
              }
              required
              style={inputStyle}
              value={formState.group}
            >
              {tagGroups.map((group) => (
                <option key={group} value={group}>
                  {tagGroupLabels[group]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {message ? (
          <p
            role="alert"
            style={{ color: "#991b1b", fontWeight: 700, margin: "16px 0 0" }}
          >
            {message}
          </p>
        ) : null}

        {successMessage ? (
          <p
            aria-live="polite"
            style={{ color: "#166534", fontWeight: 800, margin: "16px 0 0" }}
          >
            {successMessage}
          </p>
        ) : null}
      </div>

      <div className="login-actions">
        <button className="button primary" disabled={disabled} type="submit">
          {disabled
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Create tag"
              : "Save tag"}
        </button>
        {onCancel ? (
          <button
            className="button secondary"
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

const fieldStyle = {
  color: "#18212f",
  display: "grid",
  fontWeight: 800,
  gap: "8px",
} as const;

const inputStyle = {
  border: "1px solid #b9c5d4",
  borderRadius: "8px",
  color: "#18212f",
  minHeight: "42px",
  padding: "9px 11px",
  width: "100%",
} as const;

function buildFormState(tag?: Tag): FormState {
  return {
    group: tag?.group ?? "scenario",
    name: tag?.name ?? "",
  };
}

function getValidationError(formState: FormState) {
  if (!formState.name.trim()) {
    return "Tag name is required.";
  }

  if (!tagGroups.includes(formState.group)) {
    return "Choose a supported tag group.";
  }

  return null;
}

function buildPayload(formState: FormState): TagCreate {
  return {
    group: formState.group,
    name: formState.name.trim(),
  };
}
