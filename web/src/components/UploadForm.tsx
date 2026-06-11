import { type ChangeEvent, type FormEvent, useId, useState } from "react";

const acceptedAudioExtensions = [".mp3", ".flac", ".m4a", ".wav", ".ogg", ".aac"];
const acceptedAudioMimeTypes = [
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-aac",
  "audio/x-m4a",
  "audio/x-wav",
];

type UploadFormProps = {
  disabled?: boolean;
  onUpload: (files: File[]) => Promise<void>;
};

export function UploadForm({ disabled = false, onUpload }: UploadFormProps) {
  const fileInputId = useId();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setSelectedFiles(files);
    setValidationError(getValidationError(files));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const error = getValidationError(selectedFiles);
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
          音频文件
          <input
            accept={acceptedAudioExtensions.join(",")}
            disabled={disabled}
            id={fileInputId}
            multiple
            onChange={handleFileChange}
            type="file"
          />
        </label>
        <p className="recommendation-muted">
          支持格式：MP3、FLAC、M4A、WAV、OGG、AAC。
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
          {disabled ? "正在上传..." : "上传选中文件"}
        </button>
      </div>
    </form>
  );
}

function getValidationError(files: File[]) {
  if (files.length === 0) {
    return "请选择至少一个支持的音频文件。";
  }

  const unsupportedFile = files.find((file) => !isSupportedAudioFile(file));
  if (unsupportedFile) {
    return `${unsupportedFile.name} 不是支持的音频文件。`;
  }

  return null;
}

function isSupportedAudioFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const hasSupportedExtension = acceptedAudioExtensions.some((extension) =>
    lowerName.endsWith(extension),
  );

  return hasSupportedExtension || acceptedAudioMimeTypes.includes(file.type);
}
