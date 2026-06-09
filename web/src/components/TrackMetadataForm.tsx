import { type FormEvent, useEffect, useId, useState } from "react";

import type { Track, TrackMetadataUpdate } from "../types/track";

type TrackMetadataFormProps = {
  disabled?: boolean;
  errorMessage?: string | null;
  onSave: (payload: TrackMetadataUpdate) => Promise<void>;
  successMessage?: string | null;
  track: Track;
};

type FormState = {
  album: string;
  artist: string;
  contentType: string;
  cooldownUntil: string;
  liked: boolean;
  sourceUrl: string;
  title: string;
};

export function TrackMetadataForm({
  disabled = false,
  errorMessage,
  onSave,
  successMessage,
  track,
}: TrackMetadataFormProps) {
  const albumId = useId();
  const artistId = useId();
  const contentTypeId = useId();
  const cooldownUntilId = useId();
  const likedId = useId();
  const sourceUrlId = useId();
  const titleId = useId();
  const [formState, setFormState] = useState<FormState>(() =>
    buildFormState(track),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setFormState(buildFormState(track));
    setValidationError(null);
  }, [track]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const error = getValidationError(formState);
    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError(null);
    await onSave(buildPayload(formState));
  };

  const message = validationError ?? errorMessage;

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="form-card">
        <h2>Editable metadata</h2>
        <div className="form-grid">
          <label className="field" htmlFor={titleId}>
            Title
            <input
              disabled={disabled}
              id={titleId}
              maxLength={255}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              required
              type="text"
              value={formState.title}
            />
          </label>

          <label className="field" htmlFor={artistId}>
            Artist
            <input
              disabled={disabled}
              id={artistId}
              maxLength={255}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  artist: event.target.value,
                }))
              }
              type="text"
              value={formState.artist}
            />
          </label>

          <label className="field" htmlFor={albumId}>
            Album
            <input
              disabled={disabled}
              id={albumId}
              maxLength={255}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  album: event.target.value,
                }))
              }
              type="text"
              value={formState.album}
            />
          </label>

          <label className="field" htmlFor={contentTypeId}>
            Content type
            <input
              disabled={disabled}
              id={contentTypeId}
              maxLength={50}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  contentType: event.target.value,
                }))
              }
              required
              type="text"
              value={formState.contentType}
            />
          </label>

          <label className="field" htmlFor={sourceUrlId}>
            Source URL
            <input
              disabled={disabled}
              id={sourceUrlId}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  sourceUrl: event.target.value,
                }))
              }
              placeholder="https://example.com"
              type="url"
              value={formState.sourceUrl}
            />
          </label>

          <label className="field" htmlFor={cooldownUntilId}>
            Cooldown date
            <input
              disabled={disabled}
              id={cooldownUntilId}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  cooldownUntil: event.target.value,
                }))
              }
              type="datetime-local"
              value={formState.cooldownUntil}
            />
          </label>
        </div>

        <label
          htmlFor={likedId}
          style={{
            alignItems: "center",
            color: "#18212f",
            display: "inline-flex",
            fontWeight: 800,
            gap: "10px",
            marginTop: "18px",
          }}
        >
          <input
            checked={formState.liked}
            disabled={disabled}
            id={likedId}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                liked: event.target.checked,
              }))
            }
            type="checkbox"
          />
          Liked
        </label>

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
          {disabled ? "Saving..." : "Save metadata"}
        </button>
      </div>
    </form>
  );
}

function buildFormState(track: Track): FormState {
  return {
    album: track.album ?? "",
    artist: track.artist ?? "",
    contentType: track.content_type,
    cooldownUntil: formatDateTimeLocal(track.cooldown_until),
    liked: track.liked,
    sourceUrl: track.source_url ?? "",
    title: track.title,
  };
}

function getValidationError(formState: FormState) {
  if (!formState.title.trim()) {
    return "Title is required.";
  }

  if (!formState.contentType.trim()) {
    return "Content type is required.";
  }

  return null;
}

function buildPayload(formState: FormState): TrackMetadataUpdate {
  return {
    album: optionalString(formState.album),
    artist: optionalString(formState.artist),
    content_type: formState.contentType.trim(),
    cooldown_until: formState.cooldownUntil
      ? new Date(formState.cooldownUntil).toISOString()
      : null,
    liked: formState.liked,
    source_url: optionalString(formState.sourceUrl),
    title: formState.title.trim(),
  };
}

function optionalString(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function formatDateTimeLocal(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
