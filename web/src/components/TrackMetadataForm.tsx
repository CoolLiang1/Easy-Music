import { type FormEvent, useEffect, useId, useState } from "react";

import { contentTypeOptions, formatContentTypeLabel } from "../i18n/zh";
import type { Track, TrackMetadataUpdate } from "../types/track";

type TrackMetadataFormProps = {
  disabled?: boolean;
  errorMessage?: string | null;
  onSave: (payload: TrackMetadataUpdate) => Promise<void>;
  track: Track;
};

type FormState = {
  album: string;
  artist: string;
  contentType: string;
  cooldownUntil: string;
  sourceUrl: string;
  title: string;
};

export function TrackMetadataForm({
  disabled = false,
  errorMessage,
  onSave,
  track,
}: TrackMetadataFormProps) {
  const albumId = useId();
  const artistId = useId();
  const contentTypeId = useId();
  const cooldownUntilId = useId();
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
  const knownContentType = (contentTypeOptions as readonly string[]).includes(formState.contentType);

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="card-header">
        <div>
          <h2 className="card-title">基本信息</h2>
          <p className="card-subtitle">标题、艺人和专辑会用于搜索与推荐说明。</p>
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

          <label className="field" htmlFor={artistId}>
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

          <label className="field" htmlFor={albumId}>
            <span className="field-label">专辑</span>
            <input
              className="input"
              disabled={disabled}
              id={albumId}
              maxLength={255}
              onChange={(event) => update("album", event.target.value)}
              placeholder="未填写"
              type="text"
              value={formState.album}
            />
          </label>

          <label className="field" htmlFor={contentTypeId}>
            <span className="field-label">内容类型</span>
            <select
              className="select"
              disabled={disabled}
              id={contentTypeId}
              onChange={(event) => update("contentType", event.target.value)}
              value={formState.contentType}
            >
              {contentTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {formatContentTypeLabel(option)}
                </option>
              ))}
              {!knownContentType ? (
                <option value={formState.contentType}>{formState.contentType}</option>
              ) : null}
            </select>
          </label>

          <label className="field" htmlFor={cooldownUntilId}>
            <span className="field-label">冷却到</span>
            <span className="row" style={{ flexWrap: "nowrap" }}>
              <input
                className="input"
                disabled={disabled}
                id={cooldownUntilId}
                onChange={(event) => update("cooldownUntil", event.target.value)}
                type="datetime-local"
                value={formState.cooldownUntil}
              />
              {formState.cooldownUntil ? (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={disabled}
                  onClick={() => update("cooldownUntil", "")}
                  type="button"
                >
                  清除
                </button>
              ) : null}
            </span>
            <span className="field-hint">冷却期内推荐会降低这首的排序或暂时跳过。</span>
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
    album: track.album ?? "",
    artist: track.artist ?? "",
    contentType: track.content_type,
    cooldownUntil: formatDateTimeLocal(track.cooldown_until),
    sourceUrl: track.source_url ?? "",
    title: track.title,
  };
}

function getValidationError(formState: FormState) {
  if (!formState.title.trim()) {
    return "请填写标题。";
  }

  if (!formState.contentType.trim()) {
    return "请选择内容类型。";
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
