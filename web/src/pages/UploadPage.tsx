import { useState } from "react";

import { uploadTrack } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import { UploadForm } from "../components/UploadForm";
import {
  UploadResultList,
  type UploadResult,
} from "../components/UploadResultList";
import { navigateTo } from "../routes/router";

export function UploadPage() {
  const { accessToken } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);

  const handleUpload = async (files: File[]) => {
    if (!accessToken) {
      setResults(
        files.map((file) => ({
          fileName: file.name,
          message: "Sign in again before uploading files.",
          state: "error",
        })),
      );
      return;
    }

    setIsUploading(true);
    setResults([]);

    const uploadResults: UploadResult[] = [];

    for (const file of files) {
      try {
        const track = await uploadTrack(accessToken, file);
        uploadResults.push({
          fileName: file.name,
          state: "success",
          track,
        });
      } catch (error) {
        uploadResults.push({
          fileName: file.name,
          message: getErrorMessage(error),
          state: "error",
        });
      }
    }

    setResults(uploadResults);
    setIsUploading(false);
  };

  const hasSuccessfulUpload = results.some((result) => result.state === "success");

  return (
    <section className="page-panel" aria-labelledby="upload-title">
      <p className="eyebrow">Upload</p>
      <h1 id="upload-title">Upload audio</h1>
      <p className="page-copy">
        Add supported audio files to the library. New tracks appear immediately
        with their initial processing status.
      </p>
      <UploadForm disabled={isUploading} onUpload={handleUpload} />
      {isUploading ? (
        <div className="empty-state" aria-live="polite">
          Uploading selected files...
        </div>
      ) : null}
      <UploadResultList results={results} />
      {hasSuccessfulUpload ? (
        <div className="login-actions">
          <button
            className="button secondary"
            onClick={() => navigateTo("/library")}
            type="button"
          >
            Return to library
          </button>
        </div>
      ) : null}
    </section>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Upload failed.";
}
