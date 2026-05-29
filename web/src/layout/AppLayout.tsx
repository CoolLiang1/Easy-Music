import type { ReactNode } from "react";

import { RouteLink } from "../routes/RouteLink";

type AppLayoutProps = {
  children: ReactNode;
  onSignOut: () => void;
};

const navItems = [
  { label: "Library", path: "/library" },
  { label: "Upload", path: "/upload" },
  { label: "Tags", path: "/tags" },
  { label: "AI Assistant", path: "/ai-assistant" },
  { label: "Recommendations", path: "/recommendations" },
  { label: "Track detail", path: "/tracks/placeholder-track" },
];

export function AppLayout({ children, onSignOut }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div>
          <p className="eyebrow">Phase 2 Web Console</p>
          <RouteLink className="brand" to="/library">
            Easy Music
          </RouteLink>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <RouteLink
              className={
                window.location.pathname === item.path ? "nav-link active" : "nav-link"
              }
              key={item.path}
              to={item.path}
            >
              {item.label}
            </RouteLink>
          ))}
        </nav>

        <button className="button secondary" onClick={onSignOut} type="button">
          Clear placeholder session
        </button>
      </aside>

      <main className="content-shell">{children}</main>
    </div>
  );
}
