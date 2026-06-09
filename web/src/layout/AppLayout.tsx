import type { ReactNode } from "react";

import { RouteLink } from "../routes/RouteLink";

type AppLayoutProps = {
  children: ReactNode;
  onSignOut: () => void;
};

const navGroups = [
  {
    label: "Manage",
    items: [
      { label: "Library", path: "/library" },
      { label: "Upload", path: "/upload" },
      { label: "Tags", path: "/tags" },
    ],
  },
  {
    label: "Organize",
    items: [
      { label: "Reports", path: "/reports" },
      { label: "Duplicates", path: "/duplicates" },
    ],
  },
  {
    label: "Listen",
    items: [
      { label: "Recommendations", path: "/recommendations" },
      { label: "AI Assistant", path: "/ai-assistant" },
    ],
  },
];

export function AppLayout({ children, onSignOut }: AppLayoutProps) {
  const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div>
          <p className="eyebrow">Music Library</p>
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
            Sign out
          </button>
        </div>
      </aside>

      <main className="content-shell">{children}</main>
    </div>
  );
}
