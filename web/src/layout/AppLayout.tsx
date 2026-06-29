import { useState, type ReactNode } from "react";

import { useAuth } from "../auth/AuthProvider";
import { PlaybackQueueDrawer } from "../components/PlaybackQueueDrawer";
import { WebPlaybackQueuePlayer } from "../components/WebAudioPlayer";
import { usePlaybackQueue } from "../player/PlaybackQueueProvider";
import { RouteLink } from "../routes/RouteLink";

type AppLayoutProps = {
  children: ReactNode;
  onSignOut: () => void;
};

const navGroups = [
  {
    label: "管理",
    items: [
      { label: "曲库", path: "/library" },
      { label: "歌单", path: "/playlists" },
      { label: "上传", path: "/upload" },
      { label: "导入", path: "/imports" },
      { label: "标签", path: "/tags" },
    ],
  },
  {
    label: "整理",
    items: [
      { label: "报告", path: "/reports" },
      { label: "重复音轨", path: "/duplicates" },
    ],
  },
  {
    label: "收听",
    items: [
      { label: "推荐", path: "/recommendations" },
      { label: "AI 助手", path: "/ai-assistant" },
    ],
  },
];

export function AppLayout({ children, onSignOut }: AppLayoutProps) {
  const { accessToken } = useAuth();
  const { state: queueState } = usePlaybackQueue();
  const [isQueueDrawerOpen, setIsQueueDrawerOpen] = useState(false);
  const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const activePath = currentPath.startsWith("/tracks/") ? "/library" : currentPath;
  const queueCount =
    queueState.history.length +
    queueState.upcoming.length +
    (queueState.current ? 1 : 0);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="sidebar-brand-block">
          <p className="eyebrow">个人曲库</p>
          <RouteLink className="brand" to="/library">
            Easy Music
          </RouteLink>
          <p className="sidebar-subtitle">上传、整理、播放和推荐</p>
        </div>

        <nav className="nav-list">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.items.map((item) => (
                <RouteLink
                  className={
                    activePath === item.path ? "nav-link active" : "nav-link"
                  }
                  key={item.path}
                  to={item.path}
                  aria-current={activePath === item.path ? "page" : undefined}
                >
                  {item.label}
                </RouteLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="button secondary sidebar-queue-button"
            onClick={() => setIsQueueDrawerOpen(true)}
            type="button"
          >
            <span>播放队列</span>
            <strong>{queueCount} 首</strong>
          </button>
          <button className="button secondary" onClick={onSignOut} type="button">
            退出登录
          </button>
        </div>
      </aside>

      <main className="content-shell">
        {children}
        {queueState.current ? (
          <div className="global-player-bar" aria-label="当前播放">
            <div className="global-player-row">
              <WebPlaybackQueuePlayer accessToken={accessToken} />
              <button
                className="button secondary"
                onClick={() => setIsQueueDrawerOpen(true)}
                type="button"
              >
                队列
              </button>
            </div>
          </div>
        ) : null}
      </main>
      <PlaybackQueueDrawer
        isOpen={isQueueDrawerOpen}
        onClose={() => setIsQueueDrawerOpen(false)}
      />
    </div>
  );
}
