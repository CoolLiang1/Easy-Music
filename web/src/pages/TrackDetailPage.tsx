type TrackDetailPageProps = {
  trackId: string;
};

export function TrackDetailPage({ trackId }: TrackDetailPageProps) {
  return (
    <section className="page-panel" aria-labelledby="track-detail-title">
      <p className="eyebrow">Track detail</p>
      <h1 id="track-detail-title">Track metadata</h1>
      <p className="page-copy">
        Detail and editing fields will be connected to track API data in later
        tasks.
      </p>

      <dl className="detail-list">
        <div>
          <dt>Route track ID</dt>
          <dd>{trackId}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>Placeholder only</dd>
        </div>
      </dl>
    </section>
  );
}
