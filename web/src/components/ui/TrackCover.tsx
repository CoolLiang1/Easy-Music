import { useEffect, useRef, useState, type CSSProperties } from "react";

import { getTrackCoverBlob } from "../../api/tracks";
import { useAuth } from "../../auth/AuthProvider";

type CoverSource = {
  cover_path: string | null;
  id: number;
  title: string;
  updated_at?: string;
};

type TrackCoverProps = {
  className?: string;
  eager?: boolean;
  size?: number;
  track: CoverSource;
};

const coverCache = new Map<string, Promise<string | null>>();

function coverKey(track: CoverSource) {
  return `${track.id}:${track.cover_path}:${track.updated_at ?? ""}`;
}

export function loadCoverUrl(accessToken: string, track: CoverSource) {
  const key = coverKey(track);
  const cached = coverCache.get(key);
  if (cached) return cached;

  const request = getTrackCoverBlob(accessToken, track.id)
    .then((blob) => URL.createObjectURL(blob))
    .catch(() => {
      coverCache.delete(key);
      return null;
    });
  coverCache.set(key, request);
  return request;
}

export function useCoverUrl(track: CoverSource | null, enabled = true) {
  const { accessToken } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const key = track ? coverKey(track) : null;

  useEffect(() => {
    let isActive = true;
    setUrl(null);
    if (!enabled || !track || !track.cover_path || !accessToken) {
      return undefined;
    }

    void loadCoverUrl(accessToken, track).then((nextUrl) => {
      if (isActive) setUrl(nextUrl);
    });

    return () => {
      isActive = false;
    };
    // The cover key captures every track field that changes the image.
  }, [accessToken, enabled, key]);

  return url;
}

export function TrackCover({ className, eager = false, size = 40, track }: TrackCoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(eager);

  useEffect(() => {
    if (isVisible || !ref.current) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [isVisible]);

  const url = useCoverUrl(track, isVisible);
  const style = {
    "--size": `${size}px`,
    "--cover-bg": placeholderGradient(track.title || String(track.id)),
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={className ? `cover ${className}` : "cover"}
      ref={ref}
      style={style}
    >
      {url ? (
        <img alt="" src={url} />
      ) : (
        <span className="cover-letter">{firstGlyph(track.title)}</span>
      )}
    </div>
  );
}

function firstGlyph(title: string) {
  const trimmed = title.trim();
  if (!trimmed) return "♪";
  const glyph = Array.from(trimmed)[0] ?? "♪";
  return glyph.toUpperCase();
}

const palette: Array<[string, string]> = [
  ["#dd733f", "#9a512f"],
  ["#2e6e78", "#1d474e"],
  ["#8a4c70", "#552d45"],
  ["#506b28", "#33461a"],
  ["#b5862f", "#6e4f17"],
  ["#9a512f", "#5a2e1a"],
  ["#6e5b4c", "#3b2619"],
];

function placeholderGradient(seed: string) {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  const [from, to] = palette[Math.abs(hash) % palette.length];
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}
