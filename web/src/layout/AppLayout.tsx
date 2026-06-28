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

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div>
          <p className="eyebrow">个人曲库</p>
          <RouteLink className="brand" to="/library">
            Easy Music
          </RouteLink>
        </div>

        <nav className="nav-list">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.items.map((item) => (
                <RouteLink
                  className={
                    currentPath === item.path ? "nav-link active" : "nav-link"
                  }
                  key={item.path}
                  to={item.path}
                >
                  {item.label}
                </RouteLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
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
