import { useCallback, useEffect, useState, type ReactNode } from "react";

import { useAuth } from "../auth/AuthProvider";
import { PlaybackQueueDrawer } from "../components/PlaybackQueueDrawer";
import { Icon, type IconName } from "../components/ui/Icon";
import { PlayerDeck } from "../components/WebAudioPlayer";
import { usePlaybackQueue } from "../player/PlaybackQueueProvider";
import { RouteLink } from "../routes/RouteLink";
import brandMarkUrl from "../assets/brand-mark.png";

type AppLayoutProps = {
  children: ReactNode;
  onSignOut: () => void;
  path: string;
  title: string;
};

type NavItem = { icon: IconName; label: string; path: string };

export const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "收听",
    items: [
      { icon: "compass", label: "推荐", path: "/recommendations" },
      { icon: "sparkle", label: "AI 助手", path: "/ai-assistant" },
    ],
  },
  {
    label: "音乐库",
    items: [
      { icon: "library", label: "曲库", path: "/library" },
      { icon: "listMusic", label: "歌单", path: "/playlists" },
    ],
  },
  {
    label: "添加音乐",
    items: [
      { icon: "upload", label: "上传", path: "/upload" },
      { icon: "folder", label: "从服务器导入", path: "/imports" },
    ],
  },
  {
    label: "整理",
    items: [
      { icon: "tag", label: "标签", path: "/tags" },
      { icon: "edit", label: "标题与艺人", path: "/metadata" },
      { icon: "image", label: "查找封面", path: "/covers" },
      { icon: "chart", label: "整理报告", path: "/reports" },
      { icon: "copy", label: "重复音轨", path: "/duplicates" },
    ],
  },
];

export function AppLayout({ children, onSignOut, path, title }: AppLayoutProps) {
  const { currentUser } = useAuth();
  const { state: queueState } = usePlaybackQueue();
  const [isQueueDrawerOpen, setIsQueueDrawerOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const normalizedPath = path.replace(/\/+$/, "") || "/";
  const activePath =
    normalizedPath === "/" || normalizedPath.startsWith("/tracks/") ? "/library" : normalizedPath;
  const queueCount =
    queueState.upcoming.length + (queueState.current ? 1 : 0);
  const hasDeck = Boolean(queueState.current);
  const openQueue = useCallback(() => setIsQueueDrawerOpen(true), []);
  const closeQueue = useCallback(() => setIsQueueDrawerOpen(false), []);

  useEffect(() => {
    setIsNavOpen(false);
  }, [normalizedPath]);

  // The deck height also offsets portals (toasts, menus) rendered outside the shell.
  useEffect(() => {
    document.documentElement.classList.toggle("has-deck", hasDeck);
    return () => document.documentElement.classList.remove("has-deck");
  }, [hasDeck]);

  useEffect(() => {
    if (!isNavOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsNavOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isNavOpen]);

  const shellClasses = ["app-shell", isNavOpen ? "nav-open" : ""]
    .filter(Boolean)
    .join(" ");
  const username = currentUser?.username ?? "";

  return (
    <div className={shellClasses}>
      <header className="topbar">
        <button
          aria-expanded={isNavOpen}
          aria-label="打开导航"
          className="icon-btn"
          onClick={() => setIsNavOpen(true)}
          type="button"
        >
          <Icon name="menu" />
        </button>
        <img alt="" className="brand-mark" src={brandMarkUrl} />
        <span className="topbar-title">{title}</span>
        <button
          aria-label={`播放队列，共 ${queueCount} 首`}
          className="icon-btn"
          onClick={openQueue}
          type="button"
        >
          <Icon name="queue" />
        </button>
      </header>

      <div className="sidebar-backdrop" onClick={() => setIsNavOpen(false)} role="presentation" />

      <aside aria-label="主导航" className="sidebar">
        <RouteLink className="sidebar-brand" to="/library">
          <img alt="" className="brand-mark" src={brandMarkUrl} />
          <span>
            <span className="brand-name">Easy Music</span>
            <span className="brand-sub">私人曲库</span>
          </span>
        </RouteLink>

        <nav className="nav">
          {navGroups.map((group) => (
            <div className="nav-section" key={group.label}>
              <p className="nav-section-label">{group.label}</p>
              {group.items.map((item) => {
                const isActive = activePath === item.path;
                return (
                  <RouteLink
                    aria-current={isActive ? "page" : undefined}
                    className={isActive ? "nav-item active" : "nav-item"}
                    key={item.path}
                    to={item.path}
                  >
                    <Icon name={item.icon} size={18} />
                    <span>{item.label}</span>
                  </RouteLink>
                );
              })}
            </div>
          ))}

          <div className="nav-section">
            <button
              className="nav-item"
              onClick={openQueue}
              type="button"
            >
              <Icon name="queue" size={18} />
              <span>播放队列</span>
              <span className={queueCount > 0 ? "nav-item-badge live" : "nav-item-badge"}>
                {queueCount}
              </span>
            </button>
          </div>
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip">
            <span aria-hidden="true" className="user-avatar">
              {username.slice(0, 1) || "?"}
            </span>
            <span className="user-chip-name truncate">
              {username || "已登录"}
              <small>管理员</small>
            </span>
            <button
              aria-label="退出登录"
              className="icon-btn"
              onClick={onSignOut}
              title="退出登录"
              type="button"
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main" id="main">
        {children}
      </main>

      {hasDeck ? (
        <PlayerDeck onOpenQueue={openQueue} queueCount={queueCount} />
      ) : null}

      <PlaybackQueueDrawer isOpen={isQueueDrawerOpen} onClose={closeQueue} />
    </div>
  );
}
