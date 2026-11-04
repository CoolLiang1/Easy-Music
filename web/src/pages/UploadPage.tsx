import {
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type DragEvent,
  type KeyboardEvent,
  type SetStateAction,
} from "react";

import { listDuplicateCandidates } from "../api/duplicates";
import { getTrack, uploadTrack, uploadVideoTrack } from "../api/tracks";
import { useAuth } from "../auth/AuthProvider";
import { UploadResultList, type UploadResult } from "../components/UploadResultList";
import { PageHeader } from "../components/ui/common";
import { Icon } from "../components/ui/Icon";
import { env } from "../config/env";
import { RouteLink } from "../routes/RouteLink";

const audioExtensions = [".mp3", ".flac", ".m4a", ".wav", ".ogg", ".aac"];
const audioMimeTypes = [
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
const videoExtensions = [".mp4", ".mkv", ".mov", ".webm"];

type UploadJob = { file: File; id: string; kind: "audio" | "video" };

export function UploadPage() {
  const { accessToken } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queueRef = useRef<UploadJob[]>([]);
  const runningRef = useRef(false);
  const idRef = useRef(0);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const runQueue = async (token: string) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsUploading(true);

    while (queueRef.current.length > 0) {
      const job = queueRef.current.shift()!;
      updateUploadResult(setResults, job.id, { state: "uploading", uploadProgress: { percent: 0 } });

      try {
        const upload = job.kind === "video" ? uploadVideoTrack : uploadTrack;
        const track = await upload(token, job.file, (progress) => {
          updateUploadResult(setResults, job.id, { uploadProgress: { percent: progress.percent } });
        });
        updateUploadResult(setResults, job.id, {
          duplicateCheck: job.kind === "audio" ? { state: "loading" } : undefined,
          state: "success",
          track,
          uploadProgress: { percent: 100 },
        });
        if (job.kind === "audio") {
          void checkDuplicateCandidates(token, track.id, job.id, setResults);
        }
        void pollTrackStatus(token, track.id, job.id, setResults);
      } catch (error) {
        updateUploadResult(setResults, job.id, {
          message: getErrorMessage(error),
          state: "error",
        });
      }
    }

    runningRef.current = false;
    setIsUploading(false);
  };

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;

    const newResults: UploadResult[] = [];
    for (const file of files) {
      idRef.current += 1;
      const id = `upload-${Date.now()}-${idRef.current}`;
      const kind = detectKind(file);
      const base = { fileName: file.name, fileSize: file.size, id, kind: kind ?? "audio" } as const;

      if (!accessToken) {
        newResults.push({ ...base, message: "登录已失效，请重新登录后上传。", state: "error" });
      } else if (!kind) {
        newResults.push({
          ...base,
          message: "不支持的文件类型。音频支持 MP3/FLAC/M4A/WAV/OGG/AAC，视频支持 MP4/MKV/MOV/WEBM。",
          state: "error",
        });
      } else if (kind === "video" && file.size > env.maxVideoUploadMb * 1024 * 1024) {
        newResults.push({
          ...base,
          message: `视频超过 ${env.maxVideoUploadMb} MB 的上传上限。`,
          state: "error",
        });
      } else {
        newResults.push({ ...base, state: "queued" });
        queueRef.current.push({ file, id, kind });
      }
    }

    setResults((current) => [...newResults, ...current]);
    if (accessToken) void runQueue(accessToken);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const finishedCount = results.filter(
    (result) =>
      result.state === "error" ||
      (result.state === "success" &&
        (result.track?.status === "ready" || result.track?.status === "failed")),
  ).length;
  const readyCount = results.filter((result) => result.track?.status === "ready").length;
  const activeCount = results.filter(
    (result) => result.state === "queued" || result.state === "uploading",
  ).length;

  return (
    <div className="page narrow">
      <PageHeader
        actions={
          readyCount > 0 ? (
            <RouteLink className="btn btn-secondary" to="/library">
              <Icon name="library" size={16} />
              去曲库查看
            </RouteLink>
          ) : null
        }
        description="音频直接转码为可播放音轨；视频会先提取音轨。上传完成后自动检查是否与曲库重复。"
        title="上传音乐"
      />

      <div
        aria-label="选择或拖入要上传的文件"
        className={isDragging ? "dropzone dragging" : "dropzone"}
        onClick={() => inputRef.current?.click()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragging(false);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
      >
        <span className="dropzone-icon">
          <Icon name="upload" size={26} />
        </span>
        <span className="dropzone-title">
          {isDragging ? "松开即可开始上传" : "拖入文件，或点击选择"}
        </span>
        <span>可以一次选择多个文件，选中后会自动依次上传</span>
        <span className="dropzone-formats">
          {["MP3", "FLAC", "M4A", "WAV", "OGG", "AAC"].map((format) => (
            <span className="chip" key={format}>
              {format}
            </span>
          ))}
          {["MP4", "MKV", "MOV", "WEBM"].map((format) => (
            <span className="chip chip-type" key={format}>
              {format}
            </span>
          ))}
        </span>
        <span className="faint" style={{ fontSize: "0.8rem" }}>
          视频单个不超过 {env.maxVideoUploadMb} MB
        </span>
        <input
          accept={[...audioExtensions, ...videoExtensions].join(",")}
          className="visually-hidden"
          multiple
          onChange={handleInputChange}
          onClick={(event) => event.stopPropagation()}
          ref={inputRef}
          tabIndex={-1}
          type="file"
        />
      </div>

      {results.length > 0 ? (
        <section className="card" style={{ marginTop: 18 }}>
          <div className="card-header bordered">
            <div>
              <h2 className="card-title">上传记录</h2>
              <p className="card-subtitle">
                {isUploading || activeCount > 0
                  ? `还有 ${activeCount} 个文件在上传，请不要关闭页面。`
                  : `本次共 ${results.length} 个文件，${readyCount} 个已可播放。`}
              </p>
            </div>
            {finishedCount > 0 ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setResults((current) =>
                    current.filter(
                      (result) =>
                        result.state === "queued" ||
                        result.state === "uploading" ||
                        (result.state === "success" &&
                          result.track?.status !== "ready" &&
                          result.track?.status !== "failed"),
                    ),
                  )
                }
                type="button"
              >
                清除已完成
              </button>
            ) : null}
          </div>
          <UploadResultList results={results} />
        </section>
      ) : null}
    </div>
  );
}

function detectKind(file: File): "audio" | "video" | null {
  const lowerName = file.name.toLowerCase();
  if (videoExtensions.some((extension) => lowerName.endsWith(extension))) return "video";
  if (
    audioExtensions.some((extension) => lowerName.endsWith(extension)) ||
    audioMimeTypes.includes(file.type)
  ) {
    return "audio";
  }
  return null;
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
        updateUploadResult(setResults, resultId, { duplicateCheck: { state: "found", groups } });
        return;
      }

      if (attempt < maxAttempts - 1) {
        await delay(2500);
      }
    } catch (error) {
      updateUploadResult(setResults, resultId, {
        duplicateCheck: { state: "error", message: getErrorMessage(error) },
      });
      return;
    }
  }

  updateUploadResult(setResults, resultId, { duplicateCheck: { state: "none" } });
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
      updateUploadResult(setResults, resultId, { statusMessage: getErrorMessage(error) });
      return;
    }

    await delay(3000);
  }

  updateUploadResult(setResults, resultId, {
    statusMessage: "后台仍在处理，稍后可以到曲库查看最新状态。",
  });
}

function updateUploadResult(
  setResults: Dispatch<SetStateAction<UploadResult[]>>,
  resultId: string,
  updates: Partial<UploadResult>,
) {
  setResults((currentResults) =>
    currentResults.map((result) => (result.id === resultId ? { ...result, ...updates } : result)),
  );
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "上传失败。";
}
