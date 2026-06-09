import { useState, type Dispatch, type SetStateAction } from "react";

import { listDuplicateCandidates } from "../api/duplicates";
import { getTrack, uploadTrack } from "../api/tracks";
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
        files.map((file, index) => ({
          id: buildUploadResultId(file, index),
          fileName: file.name,
          message: "请重新登录后再上传文件。",
          state: "error",
        })),
      );
      return;
    }

    setIsUploading(true);
    setResults([]);

    for (const [index, file] of files.entries()) {
      const resultId = buildUploadResultId(file, index);
      setResults((currentResults) => [
        ...currentResults,
        {
          id: resultId,
          fileName: file.name,
          state: "uploading",
          uploadProgress: { percent: 0 },
        },
      ]);

      try {
        const track = await uploadTrack(accessToken, file, (progress) => {
          updateUploadResult(setResults, resultId, {
            uploadProgress: { percent: progress.percent },
          });
        });
        updateUploadResult(setResults, resultId, {
          duplicateCheck: { state: "loading" },
          state: "success",
          track,
          uploadProgress: { percent: 100 },
        });
        void checkDuplicateCandidates(accessToken, track.id, resultId, setResults);
        void pollTrackStatus(accessToken, track.id, resultId, setResults);
      } catch (error) {
        updateUploadResult(setResults, resultId, {
          message: getErrorMessage(error),
          state: "error",
        });
      }
    }

    setIsUploading(false);
  };

  const hasSuccessfulUpload = results.some((result) => result.state === "success");

  return (
    <section className="page-panel" aria-labelledby="upload-title">
      <div className="page-header-row">
        <div>
          <p className="eyebrow">上传</p>
          <h1 id="upload-title">上传音频</h1>
          <p className="page-copy">
            将支持的音频文件加入曲库，并查看上传进度、重复检查和后台处理状态。
          </p>
        </div>
        {results.length > 0 ? (
          <span className="score-pill">{results.length} 个文件</span>
        ) : null}
      </div>
      <UploadForm disabled={isUploading} onUpload={handleUpload} />
      {isUploading ? (
        <div className="empty-state" aria-live="polite">
          正在上传选中文件...
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
            返回曲库
          </button>
        </div>
      ) : null}
    </section>
  );
}

async function checkDuplicateCandidates(
  accessToken: string,
  trackId: number,
  resultId: string,
  setResults: Dispatch<SetStateAction<UploadResult[]>>,
) {
  const maxAttempts = 4;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const groups = await listDuplicateCandidates(accessToken, trackId);
      if (groups.length > 0) {
        updateDuplicateCheck(setResults, resultId, {
          state: "found",
          groups,
        });
        return;
      }

      if (attempt < maxAttempts - 1) {
        await delay(2500);
      }
    } catch (error) {
      updateDuplicateCheck(setResults, resultId, {
        state: "error",
        message: getDuplicateCheckErrorMessage(error),
      });
      return;
    }
  }

  updateDuplicateCheck(setResults, resultId, { state: "none" });
}

function updateDuplicateCheck(
  setResults: Dispatch<SetStateAction<UploadResult[]>>,
  resultId: string,
  duplicateCheck: NonNullable<UploadResult["duplicateCheck"]>,
) {
  setResults((currentResults) =>
    currentResults.map((result) =>
      result.id === resultId ? { ...result, duplicateCheck } : result,
    ),
  );
}

async function pollTrackStatus(
  accessToken: string,
  trackId: number,
  resultId: string,
  setResults: Dispatch<SetStateAction<UploadResult[]>>,
) {
  const maxAttempts = 40;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const track = await getTrack(accessToken, trackId);
      updateUploadResult(setResults, resultId, { track });

      if (track.status === "ready" || track.status === "failed") {
        return;
      }
    } catch (error) {
      updateUploadResult(setResults, resultId, {
        statusMessage: getErrorMessage(error),
      });
      return;
    }

    await delay(3000);
  }

  updateUploadResult(setResults, resultId, {
    statusMessage: "后台仍在处理。稍后可到曲库页面查看最新状态。",
  });
}

function updateUploadResult(
  setResults: Dispatch<SetStateAction<UploadResult[]>>,
  resultId: string,
  updates: Partial<UploadResult>,
) {
  setResults((currentResults) =>
    currentResults.map((result) =>
      result.id === resultId ? { ...result, ...updates } : result,
    ),
  );
}

function buildUploadResultId(file: File, index: number) {
  return `${Date.now()}-${index}-${file.name}`;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getDuplicateCheckErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "无法检查可能重复的音轨。";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "上传失败。";
}
