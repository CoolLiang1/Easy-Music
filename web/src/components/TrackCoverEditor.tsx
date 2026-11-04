import { type ChangeEvent, type DragEvent, useEffect, useId, useState } from "react";

import type { Track } from "../types/track";
import { Icon } from "./ui/Icon";
import { useCoverUrl } from "./ui/TrackCover";

type TrackCoverEditorProps = {
  disabled?: boolean;
  errorMessage?: string | null;
  onSave: (file: File) => Promise<boolean>;
  track: Track;
};

const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];

export function TrackCoverEditor({
  disabled = false,
  errorMessage,
  onSave,
  track,
}: TrackCoverEditorProps) {
  const inputId = useId();
  const currentCoverUrl = useCoverUrl(track);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (selectedPreviewUrl) {
        URL.revokeObjectURL(selectedPreviewUrl);
      }
    };
  }, [selectedPreviewUrl]);

  const chooseFile = (file: File | null) => {
    setValidationError(null);
    if (file && !acceptedTypes.includes(file.type)) {
      setValidationError("只支持 JPEG、PNG 或 WebP 图片。");
      return;
    }
    setSelectedFile(file);
    setSelectedPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    chooseFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    chooseFile(event.dataTransfer.files?.[0] ?? null);
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    const saved = await onSave(selectedFile);
    if (saved) {
      chooseFile(null);
    }
  };

  const previewUrl = selectedPreviewUrl ?? currentCoverUrl;
  const message = validationError ?? errorMessage;

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">封面</h2>
          <p className="card-subtitle">拖入图片或点击选择，支持 JPEG / PNG / WebP。</p>
        </div>
      </div>
      <div className="card-body cover-editor">
        <label
          className={isDragging ? "cover-drop dragging" : "cover-drop"}
          htmlFor={inputId}
          onDragLeave={() => setIsDragging(false)}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDrop={handleDrop}
        >
          {previewUrl ? (
            <img alt={selectedFile ? "新封面预览" : `「${track.title}」的封面`} src={previewUrl} />
          ) : (
            <span className="cover-drop-hint">
              <Icon name="image" size={28} />
              <span>还没有封面</span>
              <span className="faint">点击或拖入图片</span>
            </span>
          )}
          {selectedFile ? <span className="badge badge-signal plain cover-badge">待保存</span> : null}
          <input
            accept={acceptedTypes.join(",")}
            className="visually-hidden"
            disabled={disabled}
            id={inputId}
            onChange={handleFileChange}
            type="file"
          />
        </label>

        {message ? (
          <p className="inline-error" role="alert">
            {message}
          </p>
        ) : null}

        {selectedFile ? (
          <div className="row" style={{ justifyContent: "center" }}>
            <button
              className="btn btn-ghost"
              disabled={disabled}
              onClick={() => chooseFile(null)}
              type="button"
            >
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={disabled}
              onClick={() => void handleSave()}
              type="button"
            >
              {disabled ? "正在上传…" : "保存封面"}
            </button>
          </div>
        ) : (
          <label className="btn btn-secondary btn-sm" htmlFor={inputId}>
            <Icon name="upload" size={15} />
            {currentCoverUrl ? "更换封面" : "选择图片"}
          </label>
        )}
      </div>
    </section>
  );
}
