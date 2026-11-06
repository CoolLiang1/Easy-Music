import { useEffect, useRef, useState, type CSSProperties } from "react";

import { getTrackCoverBlob } from "../../api/tracks";
import { useAuth } from "../../auth/AuthProvider";

type CoverSource = {
  artist?: string | null;
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
  const artwork = placeholderArtwork(track.artist?.trim() || track.title || String(track.id), track.title);
  const style = {
    "--size": `${size}px`,
    "--cover-bg": artwork.background,
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
        <span className="cover-letter">{artwork.glyph}</span>
      )}
    </div>
  );
}
/**
 * Generated artwork for tracks without a cover. The colour comes from the
 * artist (or the title when there is none), so one artist's tracks share a
 * look; a seeded record-groove pattern keeps tiles from looking identical.
 * Keep in step with Android `TrackArtwork.kt`.
 */
export function placeholderArtwork(seedText: string, title: string) {
  const hash = stringHash(seedText);
  const [from, to] = palette[floorMod(hash, palette.length)];
  const cx = 25 + floorMod(hash >>> 3, 50);
  const cy = 25 + floorMod(hash >>> 9, 50);
  const background = [
    `radial-gradient(circle at ${cx}% ${cy}%, rgb(255 255 255 / 20%) 0 7%, transparent 7.5%)`,
    `repeating-radial-gradient(circle at ${cx}% ${cy}%, rgb(255 255 255 / 9%) 0 1.2%, transparent 1.2% 4.5%)`,
    `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
  ].join(", ");
  return { background, glyph: firstGlyph(title) };
}

/** First letter or digit of the title, skipping brackets and symbols such as 【. */
export function firstGlyph(title: string) {
  for (const char of title.trim()) {
    if (/[\p{L}\p{N}]/u.test(char)) return char.toUpperCase();
  }
  return "♪";
}

const palette: Array<[string, string]> = [
  ["#dd733f", "#9a512f"],
  ["#2e6e78", "#1d474e"],
  ["#8a4c70", "#552d45"],
  ["#506b28", "#33461a"],
  ["#b5862f", "#6e4f17"],
  ["#9a512f", "#5a2e1a"],
  ["#6e5b4c", "#3b2619"],
  ["#3f5f8a", "#263a57"],
  ["#a3434a", "#65262b"],
];

function stringHash(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return hash;
}

function floorMod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}
