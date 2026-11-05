import { type FormEvent, useEffect, useId, useState } from "react";

import type { Track, TrackMetadataUpdate } from "../types/track";

type TrackMetadataFormProps = {
  disabled?: boolean;
  errorMessage?: string | null;
  onSave: (payload: TrackMetadataUpdate) => Promise<void>;
  track: Track;
};

type FormState = {
  artist: string;
  sourceUrl: string;
  title: string;
};

export function TrackMetadataForm({
  disabled = false,
  errorMessage,
  onSave,
  track,
}: TrackMetadataFormProps) {
  const artistId = useId();
  const sourceUrlId = useId();
  const titleId = useId();
  const [formState, setFormState] = useState<FormState>(() => buildFormState(track));
  const [validationError, setValidationError] = useState<string | null>(null);

  const initialState = buildFormState(track);
  const savedKey = JSON.stringify(initialState);

  // Reset only when the saved metadata itself changes, so unrelated updates
  // (liked toggle, tag save, status polling) never discard unsaved edits.
  useEffect(() => {
    setFormState(JSON.parse(savedKey) as FormState);
    setValidationError(null);
  }, [savedKey]);

  const isDirty = (Object.keys(initialState) as Array<keyof FormState>).some(
    (key) => initialState[key] !== formState[key],
  );

  const update = (key: keyof FormState, value: string) => {
    setFormState((current) => ({ ...current, [key]: value }));
  };

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
    <form className="card" onSubmit={handleSubmit}>
      <div className="card-header">
        <div>
          <h2 className="card-title">基本信息</h2>
          <p className="card-subtitle">标题和艺人会用于搜索与推荐说明。</p>
        </div>
      </div>
      <div className="card-body">
        <div className="form-grid">
          <label className="field span-2" htmlFor={titleId}>
            <span className="field-label">
              标题<span className="req">*</span>
            </span>
            <input
              className="input"
              disabled={disabled}
              id={titleId}
              maxLength={255}
              onChange={(event) => update("title", event.target.value)}
              required
              type="text"
              value={formState.title}
            />
          </label>

          <label className="field span-2" htmlFor={artistId}>
            <span className="field-label">艺人</span>
            <input
              className="input"
              disabled={disabled}
              id={artistId}
              maxLength={255}
              onChange={(event) => update("artist", event.target.value)}
              placeholder="未填写"
              type="text"
              value={formState.artist}
            />
          </label>


          <label className="field span-2" htmlFor={sourceUrlId}>
            <span className="field-label">来源链接</span>
            <input
              className="input"
              disabled={disabled}
              id={sourceUrlId}
              onChange={(event) => update("sourceUrl", event.target.value)}
              placeholder="https://"
              type="url"
              value={formState.sourceUrl}
            />
          </label>
        </div>

        {message ? (
          <p className="inline-error" role="alert" style={{ marginTop: 12 }}>
            {message}
          </p>
        ) : null}
      </div>
      <div className="card-foot between">
        <span className="dirty-note">{isDirty ? "有未保存的更改" : ""}</span>
        <div className="row">
          {isDirty ? (
            <button
              className="btn btn-ghost"
              disabled={disabled}
              onClick={() => {
                setFormState(buildFormState(track));
                setValidationError(null);
              }}
              type="button"
            >
              撤销
            </button>
          ) : null}
          <button className="btn btn-primary" disabled={disabled || !isDirty} type="submit">
            {disabled ? "正在保存…" : "保存信息"}
          </button>
        </div>
      </div>
    </form>
  );
}

function buildFormState(track: Track): FormState {
  return {
    artist: track.artist ?? "",
    sourceUrl: track.source_url ?? "",
    title: track.title,
  };
}

function getValidationError(formState: FormState) {
  if (!formState.title.trim()) {
    return "请填写标题。";
  }

  return null;
}

function buildPayload(formState: FormState): TrackMetadataUpdate {
  return {
    artist: optionalString(formState.artist),
    source_url: optionalString(formState.sourceUrl),
    title: formState.title.trim(),
  };
}

function optionalString(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}
