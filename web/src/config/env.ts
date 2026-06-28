const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const viteEnv = (
  import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }
).env;

export const env = {
  apiBaseUrl: trimTrailingSlash(
    viteEnv?.VITE_API_BASE_URL ?? "http://127.0.0.1:8000",
  ),
  maxVideoUploadMb: Number(
    viteEnv?.VITE_MAX_VIDEO_UPLOAD_MB ?? "1024",
  ),
};
