import { type ChangeEvent, type FormEvent, useId, useState } from "react";
import { env } from "../config/env";

const acceptedVideoExtensions = [".mp4", ".mkv", ".mov", ".webm"];

type VideoUploadFormProps = {
  disabled?: boolean;
  onUpload: (files: File[]) => Promise<void>;
};

export function VideoUploadForm({ disabled = false, onUpload }: VideoUploadFormProps) {
  const fileInputId = useId();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setSelectedFiles(files);
    setValidationError(getVideoValidationError(files));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const error = getVideoValidationError(selectedFiles);
    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError(null);
    await onUpload(selectedFiles);
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="form-card">
        <label className="field" htmlFor={fileInputId}>
          视频文件（提取音频）
          <input
            accept={acceptedVideoExtensions.join(",")}
            disabled={disabled}
            id={fileInputId}
            multiple
            onChange={handleFileChange}
            type="file"
          />
        </label>
        <p className="recommendation-muted">
          支持格式：MP4、MKV、MOV、WEBM。最大 {env.maxVideoUploadMb} MB。
          上传后将自动提取音频并转为可播放音轨。
        </p>
        {selectedFiles.length > 0 ? (
          <p className="status-message">
            已选择 {selectedFiles.length} 个文件。
          </p>
        ) : null}
        {validationError ? (
          <p className="status-message error" role="alert">
            {validationError}
          </p>
        ) : null}
      </div>

      <div className="toolbar">
        <button
          className="button primary"
          disabled={disabled || selectedFiles.length === 0}
          type="submit"
        >
          {disabled ? "正在上传..." : "上传视频"}
        </button>
      </div>
    </form>
  );
}

function getVideoValidationError(files: File[]) {
  if (files.length === 0) {
    return "请选择至少一个支持的视频文件。";
  }

  const unsupportedFile = files.find((file) => !isSupportedVideoFile(file));
  if (unsupportedFile) {
    return `${unsupportedFile.name} 不是支持的视频文件。`;
  }

  return null;
}

function isSupportedVideoFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return acceptedVideoExtensions.some((extension) =>
    lowerName.endsWith(extension),
  );
}
