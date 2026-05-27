import { type ChangeEvent, type FormEvent, useId, useState } from "react";

const acceptedAudioExtensions = [".mp3", ".flac", ".m4a", ".wav", ".ogg"];
const acceptedAudioMimeTypes = [
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
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
    <form onSubmit={handleSubmit} style={{ marginTop: "28px" }}>
      <div
        style={{
          border: "1px solid #d5dde8",
          borderRadius: "8px",
          background: "#f8fafc",
          padding: "22px",
        }}
      >
        <label
          htmlFor={fileInputId}
          style={{
            color: "#18212f",
            display: "block",
            fontWeight: 800,
            marginBottom: "10px",
          }}
        >
          Audio files
        </label>
        <input
          accept={acceptedAudioExtensions.join(",")}
          disabled={disabled}
          id={fileInputId}
          multiple
          onChange={handleFileChange}
          type="file"
        />
        <p style={{ color: "#526174", lineHeight: 1.55, margin: "12px 0 0" }}>
          Accepted formats: MP3, FLAC, M4A, WAV, and OGG.
        </p>
        {selectedFiles.length > 0 ? (
          <p style={{ color: "#334155", fontWeight: 700, margin: "12px 0 0" }}>
            {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} selected.
          </p>
        ) : null}
        {validationError ? (
          <p role="alert" style={{ color: "#991b1b", fontWeight: 700, margin: "12px 0 0" }}>
            {validationError}
          </p>
        ) : null}
      </div>

      <div className="login-actions">
        <button
          className="button primary"
          disabled={disabled || selectedFiles.length === 0}
          type="submit"
        >
          {disabled ? "Uploading..." : "Upload selected files"}
        </button>
      </div>
    </form>
  );
}

function getValidationError(files: File[]) {
  if (files.length === 0) {
    return "Choose at least one supported audio file.";
  }

  const unsupportedFile = files.find((file) => !isSupportedAudioFile(file));
  if (unsupportedFile) {
    return `${unsupportedFile.name} is not a supported audio file.`;
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
