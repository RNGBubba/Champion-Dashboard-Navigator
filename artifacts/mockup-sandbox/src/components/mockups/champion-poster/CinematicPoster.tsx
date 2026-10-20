import './CinematicPoster.css';

const championMetrics = [
  { value: '43', label: 'Games' },
  { value: '9', label: 'Wins' },
  { value: '56%', label: 'Top-three' },
  { value: '3.09', label: 'Avg placement' },
  { value: '1769.486', label: 'Score', compact: true },
];

const overallMetrics = [
  { value: '67', label: 'Games' },
  { value: '12', label: 'Wins' },
  { value: '52%', label: 'Top-three' },
  { value: '3.28', label: 'Avg placement' },
];

export function CinematicPoster() {
  return (
    <main className="cinematic-poster">
      <article className="cp-frame" aria-label="ArenaSweats player recap poster">
        <section className="cp-hero" aria-label="Global champion ladder rank">
          <img
            className="cp-art"
            src="/__mockup/images/urgot-art.jpg"
            alt="Urgot charging through the arena with a blazing cannon"
          />
          <div className="cp-image-shade" />

          <div className="cp-topline">
            <div className="cp-brand">
              <span className="cp-brand-mark" aria-hidden="true"><span>A</span></span>
              <span>ArenaSweats&nbsp; / &nbsp;Player Recap</span>
            </div>
            <div className="cp-live"><i className="cp-live-dot" /> Live</div>
          </div>

          <div className="cp-identity">
            <p className="cp-overline">Global champion ladder</p>
            <h1 className="cp-global-rank">#<span>1</span></h1>
            <p className="cp-champion-name">Urgot</p>
            <p className="cp-champion-subtitle">
              <strong>Top champion</strong>
              <span className="cp-subtitle-divider" />
              <span>Champion rank #1</span>
            </p>
          </div>

          <div className="cp-player">
            <p className="cp-player-name">Angel Teemo#666</p>
            <p className="cp-player-meta">NA&nbsp; / &nbsp;LIVE</p>
          </div>
        </section>

        <section className="cp-plaque" aria-label="Player and champion statistics">
          <div className="cp-panel">
            <div className="cp-panel-heading">
              <span>Urgot · Champion stats</span>
              <span>Global ladder #1</span>
            </div>
            <div className="cp-metric-grid">
              {championMetrics.map(({ value, label, compact }) => (
                <div key={label}>
                  <strong className={`cp-metric-value${label === 'Wins' ? ' is-highlight' : ''}${compact ? ' is-small' : ''}`}>
                    {value}
                  </strong>
                  <span className="cp-metric-label">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="cp-panel">
            <div className="cp-panel-heading">
              <span>Overall · All champions</span>
              <span>Season snapshot</span>
            </div>
            <div className="cp-metric-grid">
              {overallMetrics.map(({ value, label }) => (
                <div key={label}>
                  <strong className={`cp-metric-value${label === 'Wins' ? ' is-highlight' : ''}`}>{value}</strong>
                  <span className="cp-metric-label">{label}</span>
                </div>
              ))}
            </div>
            <div className="cp-kda">
              <strong className="cp-kda-value">7.8 / 7.8 / 11.2</strong>
              <span className="cp-kda-label">K / D / A</span>
            </div>
          </div>

          <div className="cp-panel">
            <div className="cp-panel-heading">
              <span>Source rank</span>
              <span>Player overall</span>
            </div>
            <div className="cp-rank-stack">
              <div className="cp-rank-line">
                <span>Current rank</span>
                <strong>#25,685</strong>
              </div>
              <div className="cp-rank-line">
                <span>Rating</span>
                <strong>1469</strong>
              </div>
              <div className="cp-rank-line">
                <span>Top percentile</span>
                <strong className="cp-percentile">13.2%</strong>
              </div>
              <div className="cp-rank-line">
                <span>Peak · rank / rating</span>
                <strong>#857 · 2034</strong>
              </div>
            </div>
          </div>

          <div className="cp-panel">
            <div className="cp-panel-heading">
              <span>Personal bests</span>
              <span>Streak records</span>
            </div>
            <div className="cp-streaks">
              <div className="cp-streak">
                <span>Best top-three streak</span>
                <strong>4</strong>
              </div>
              <div className="cp-streak">
                <span>Best win streak</span>
                <strong>2</strong>
              </div>
            </div>
          </div>
        </section>

        <footer className="cp-footnote">
          <span>ArenaSweats public player stats</span>
          <span>Overall source rank #25,685&nbsp; · &nbsp;Champion rank #1</span>
        </footer>
      </article>
    </main>
  );
}
