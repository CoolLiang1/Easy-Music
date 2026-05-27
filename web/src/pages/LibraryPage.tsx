import { RouteLink } from "../routes/RouteLink";

export function LibraryPage() {
  return (
    <section className="page-panel" aria-labelledby="library-title">
      <p className="eyebrow">Library</p>
      <h1 id="library-title">Music library</h1>
      <p className="page-copy">
        Track listing will be connected to the Phase 1 track API in a later
        task.
      </p>

      <div className="placeholder-grid">
        <div className="placeholder-card">
          <h2>Tracks</h2>
          <p>Placeholder area for title, artist, status, and update time.</p>
        </div>
        <div className="placeholder-card">
          <h2>Selection</h2>
          <p>
            Track rows will navigate to detail pages when the library feature is
            implemented.
          </p>
          <RouteLink className="button secondary" to="/tracks/placeholder-track">
            Open placeholder detail
          </RouteLink>
        </div>
      </div>
    </section>
  );
}
