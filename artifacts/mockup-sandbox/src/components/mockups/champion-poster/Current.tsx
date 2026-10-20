import { useEffect, useState } from 'react';
import './_group.css';

const championRows = [
  { id: 'urgot', name: 'Urgot', rank: 1, games: 43 },
  { id: 'singed', name: 'Singed', rank: 349, games: 4 },
  { id: 'akshan', name: 'Akshan', rank: 376, games: 3 },
];

const stats = [
  ['67', 'Games'],
  ['12', 'Wins'],
  ['52%', 'Top 3 rate'],
  ['3.28', 'Avg placement'],
  ['7.8 / 7.8 / 11.2', 'K / D / A'],
  ['4', 'Best top-3 streak'],
  ['2', 'Best win streak'],
  ['Top 13.2%', 'Source percentile'],
];

function ChampionImage({ id, name }: { id: string; name: string }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let mounted = true;
    fetch(`/api/champion-poster/artwork/${id}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Artwork unavailable')))
      .then((result: { dataUrl?: string }) => {
        if (mounted && result.dataUrl) setSrc(result.dataUrl);
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, [id]);

  return src
    ? <img src={src} alt={`${name} champion artwork`} />
    : <span className="current-art-fallback" aria-label={`${name} artwork`}>{name.slice(0, 1)}</span>;
}

export function Current() {
  return (
    <div className="current-root">
      <article className="current-poster">
        <div className="current-kicker">
          <span>ARENA SWEATS&nbsp; / &nbsp;PLAYER CARD</span>
          <span className="current-verified"><i className="current-dot" /> SOURCE SNAPSHOT</span>
        </div>
        <div className="current-player-title">Angel Teemo#666</div>
        <div className="current-player-subtitle">NA&nbsp; · &nbsp;LIVE&nbsp; · &nbsp;PUBLIC TIER 3</div>
        <div className="current-rank-row">
          <div className="current-rank-seal">II</div>
          <div className="current-rank-copy">
            <strong>Platinum II 78 LP</strong>
            <span>RANKED LEAGUE · 1469 RATING</span>
          </div>
        </div>
        <div className="current-stats">
          {stats.map(([value, label]) => (
            <div className="current-stat" key={label}>
              <b>{value}</b><small>{label}</small>
            </div>
          ))}
        </div>
        <div className="current-champions">
          {championRows.map((champion) => (
            <div className="current-champion" key={champion.id}>
              <ChampionImage id={champion.id} name={champion.name} />
              <div><strong>{champion.name}</strong><small>#{champion.rank} · {champion.games} games</small></div>
            </div>
          ))}
        </div>
        <div className="current-footer">
          <span>ArenaSweats public player profile · public stats</span>
          <span>Updated Oct 20, 2026</span>
        </div>
      </article>
    </div>
  );
}
