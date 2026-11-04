import type { ReactNode } from "react";

export type IconName =
  | "alert"
  | "arrowDown"
  | "arrowLeft"
  | "arrowUp"
  | "chart"
  | "check"
  | "chevronDown"
  | "chevronRight"
  | "close"
  | "compass"
  | "copy"
  | "edit"
  | "eye"
  | "eyeOff"
  | "file"
  | "film"
  | "folder"
  | "grip"
  | "heart"
  | "heartFilled"
  | "image"
  | "info"
  | "library"
  | "listMusic"
  | "listPlus"
  | "logout"
  | "menu"
  | "more"
  | "music"
  | "next"
  | "pause"
  | "play"
  | "playNext"
  | "plus"
  | "prev"
  | "queue"
  | "refresh"
  | "repeat"
  | "reverse"
  | "search"
  | "shuffle"
  | "sparkle"
  | "tag"
  | "trash"
  | "upload"
  | "volume"
  | "volumeMute";

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  label?: string;
};

const paths: Record<IconName, ReactNode> = {
  alert: (
    <>
      <path d="M12 4.2 21 19.5H3z" />
      <path d="M12 10v4.2M12 16.8v.2" />
    </>
  ),
  arrowDown: <path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" />,
  arrowLeft: <path d="M19 12H5M10.5 6.5 5 12l5.5 5.5" />,
  arrowUp: <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />,
  chart: <path d="M4 20V11M10 20V5M16 20v-6M21 20H3" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
      <path d="M15.5 8.5V5.5A1.5 1.5 0 0 0 14 4H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3" />
    </>
  ),
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M10 5.8c.6-.2 1.3-.3 2-.3 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.4 7.4A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1.1" />
      <path d="M4 4l16 16M9.9 10a2.8 2.8 0 0 0 4 4" />
    </>
  ),
  file: (
    <>
      <path d="M6.5 3.5H14l4.5 4.5v12a.5.5 0 0 1-.5.5H6.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z" />
      <path d="M13.5 3.5V8.5h5" />
    </>
  ),
  film: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M8 5v14M16 5v14M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5" />
    </>
  ),
  folder: (
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
  ),
  grip: (
    <g fill="currentColor" stroke="none">
      <circle cx="9" cy="6.5" r="1.4" />
      <circle cx="15" cy="6.5" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="17.5" r="1.4" />
      <circle cx="15" cy="17.5" r="1.4" />
    </g>
  ),
  heart: (
    <path d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z" />
  ),
  heartFilled: (
    <path
      d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z"
      fill="currentColor"
    />
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m20.5 16-4.5-4.5-9 8" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8v.2" />
    </>
  ),
  library: (
    <>
      <path d="M9 17.5V6l10-2v11.5" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="16.5" cy="15.5" r="2.5" />
    </>
  ),
  listMusic: (
    <>
      <path d="M3.5 6h11M3.5 11h11M3.5 16h6" />
      <path d="M17.5 17.5V8.5l3.5-1" />
      <circle cx="15.5" cy="17.5" r="2" />
    </>
  ),
  listPlus: <path d="M3.5 6h12M3.5 11h12M3.5 16h7M17.5 13.5v7M14 17h7" />,
  logout: (
    <path d="M14.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3.5M10 16.5 5.5 12 10 7.5M5.5 12H15" />
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </g>
  ),
  music: (
    <>
      <path d="M9.5 17V5.5l9-2V15" />
      <circle cx="7" cy="17" r="2.5" />
      <circle cx="16" cy="15" r="2.5" />
    </>
  ),
  next: (
    <>
      <path d="M6 5.5v13l9.5-6.5z" fill="currentColor" />
      <path d="M18.5 5.5v13" />
    </>
  ),
  pause: (
    <g fill="currentColor" stroke="none">
      <rect x="6.5" y="5" width="4" height="14" rx="1" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" />
    </g>
  ),
  play: <path d="M8 5.2v13.6a.6.6 0 0 0 .9.5l10.6-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5z" fill="currentColor" stroke="none" />,
  playNext: (
    <>
      <path d="M3.5 6h11M3.5 11h11M3.5 16h6" />
      <path d="M15.5 13v7l5.5-3.5z" fill="currentColor" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  prev: (
    <>
      <path d="M18 5.5v13L8.5 12z" fill="currentColor" />
      <path d="M5.5 5.5v13" />
    </>
  ),
  queue: (
    <>
      <path d="M3.5 6h12M3.5 11h12M3.5 16h7" />
      <path d="M14.5 14v6l5-3z" fill="currentColor" />
    </>
  ),
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.5H15" />,
  repeat: <path d="M4 11.5V9.5a3 3 0 0 1 3-3h12M16 3.5l3 3-3 3M20 12.5v2a3 3 0 0 1-3 3H5M8 20.5l-3-3 3-3" />,
  reverse: <path d="M8 4v16M4.5 7.5 8 4l3.5 3.5M16 20V4M12.5 16.5 16 20l3.5-3.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  shuffle: (
    <path d="M3.5 7H7c4.5 0 6 10 10.5 10h3M3.5 17H7c1.4 0 2.5-1 3.4-2.4M13.6 9.4C14.5 8 15.6 7 17.5 7h3M18 4.5 20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5" />
  ),
  sparkle: (
    <>
      <path d="M11 3.5 12.9 9l5.6 2-5.6 2L11 18.5 9.1 13l-5.6-2 5.6-2z" />
      <path d="M18.5 15.5 19.2 17.4 21 18l-1.8.7-.7 1.8-.7-1.8L16 18l1.8-.6z" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.2V5A1.5 1.5 0 0 1 5 3.5h7.2l8.3 8.5-8.5 8.5z" />
      <circle cx="8.2" cy="8.2" r="1.4" />
    </>
  ),
  trash: <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />,
  upload: (
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 14.5v3.5A1.5 1.5 0 0 0 6.5 19.5h11A1.5 1.5 0 0 0 19 18v-3.5" />
  ),
  volume: (
    <>
      <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" />
      <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.5 7.5 0 0 1 0 10.4" />
    </>
  ),
  volumeMute: (
    <>
      <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </>
  ),
};

export function Icon({ name, size = 18, className, label }: IconProps) {
  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={className ? `icon ${className}` : "icon"}
      fill="none"
      height={size}
      role={label ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  );
}
