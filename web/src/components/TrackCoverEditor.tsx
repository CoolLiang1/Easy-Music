import { type ChangeEvent, type FormEvent, useEffect, useId, useState } from "react";

import { getTrackCoverBlob } from "../api/tracks";
import type { Track } from "../types/track";

type TrackCoverEditorProps = {
  accessToken?: string | null;
  disabled?: boolean;
  errorMessage?: string | null;
  onSave: (file: File) => Promise<void>;
  successMessage?: string | null;
  track: Track;
};

export function TrackCoverEditor({
  accessToken,
  disabled = false,
  errorMessage,
  onSave,
  successMessage,
  track,
}: TrackCoverEditorProps) {
  const inputId = useId();
  const [currentCoverUrl, setCurrentCoverUrl] = useState<string | null>(null);
  const [coverLoadError, setCoverLoadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    let objectUrl: string | null = null;

    setCurrentCoverUrl(null);
    setCoverLoadError(null);

    if (!accessToken || !track.cover_path) {
      return undefined;
    }

    void getTrackCoverBlob(accessToken, track.id)
      .then((blob) => {
        if (!isActive) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setCurrentCoverUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }
        setCoverLoadError(getErrorMessage(error));
      });

    return () => {
      isActive = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, track.cover_path, track.id]);

  useEffect(() => {
    return () => {
      if (selectedPreviewUrl) {
        URL.revokeObjectURL(selectedPreviewUrl);
      }
    };
  }, [selectedPreviewUrl]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setValidationError(null);
    setSelectedFile(file);

    if (selectedPreviewUrl) {
      URL.revokeObjectURL(selectedPreviewUrl);
    }

    setSelectedPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) {
      setValidationError("请先选择封面图片。");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(selectedFile.type)) {
      setValidationError("请选择 JPEG、PNG 或 WebP 图片。");
      return;
    }

    setValidationError(null);
    await onSave(selectedFile);
  };

  const message = validationError ?? errorMessage ?? coverLoadError;

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="form-card">
        <h2>封面图片</h2>
        <div
          style={{
            display: "grid",
            gap: "18px",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            marginTop: "18px",
          }}
        >
          <CoverPreview
            alt={`当前封面：${track.title || "未命名音轨"}`}
            label="当前封面"
            src={currentCoverUrl}
          />
          <CoverPreview
            alt="已选择的新封面"
            label="已选择图片"
            src={selectedPreviewUrl}
          />
        </div>

        <label htmlFor={inputId} style={fieldStyle}>
          替换图片
          <input
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            id={inputId}
            onChange={handleFileChange}
            style={inputStyle}
            type="file"
          />
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
          {disabled ? "正在上传..." : "上传封面"}
        </button>
      </div>
    </form>
  );
}

type CoverPreviewProps = {
  alt: string;
  label: string;
  src: string | null;
};

function CoverPreview({ alt, label, src }: CoverPreviewProps) {
  return (
    <div>
      <p style={{ color: "#64748b", fontWeight: 800, margin: "0 0 8px" }}>
        {label}
      </p>
      <div
        style={{
          alignItems: "center",
          aspectRatio: "1",
          background: "#ffffff",
          border: "1px solid #d5dde8",
          borderRadius: "8px",
          display: "flex",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {src ? (
          <img
            alt={alt}
            src={src}
            style={{ height: "100%", objectFit: "cover", width: "100%" }}
          />
        ) : (
          <span style={{ color: "#64748b", fontWeight: 800 }}>暂无封面</span>
        )}
      </div>
    </div>
  );
}

const fieldStyle = {
  color: "#18212f",
  display: "grid",
  fontWeight: 800,
  gap: "8px",
  marginTop: "18px",
} as const;

const inputStyle = {
  border: "1px solid #b9c5d4",
  borderRadius: "8px",
  color: "#18212f",
  minHeight: "42px",
  padding: "9px 11px",
  width: "100%",
} as const;

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "无法加载这个音轨的封面。";
}
