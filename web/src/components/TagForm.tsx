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
    <form className="panel" onSubmit={handleSubmit}>
      <div className="form-card">
        <h2>{mode === "create" ? "Create tag" : "Edit tag"}</h2>
        <div className="form-grid">
          <label className="field" htmlFor={nameId}>
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
              type="text"
              value={formState.name}
            />
          </label>

          <label className="field" htmlFor={groupId}>
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
            className="status-message error"
            role="alert"
          >
            {message}
          </p>
        ) : null}

        {successMessage ? (
          <p
            aria-live="polite"
            className="status-message success"
          >
            {successMessage}
          </p>
        ) : null}
      </div>

      <div className="toolbar">
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
