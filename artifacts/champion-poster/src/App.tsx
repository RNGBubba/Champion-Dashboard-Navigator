import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  getGetChampionPosterArtworkQueryKey,
  getGetChampionPosterQueryKey,
  useGetChampionPoster,
  useGetChampionPosterArtwork,
  useRefreshChampionPoster,
} from '@workspace/api-client-react';
import { GetChampionPosterResponse } from '@workspace/api-zod';
import type { ChampionPosterChampion, ChampionPosterSnapshot } from '@workspace/api-client-react';
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, CircleAlert, ExternalLink, FileJson, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

const LOCAL_SNAPSHOT_KEY = 'arenasweats-poster-snapshot-v1';

function readLocalSnapshot(): ChampionPosterSnapshot | null {
  try {
    const saved = localStorage.getItem(LOCAL_SNAPSHOT_KEY);
    if (!saved) return null;
    const candidate: unknown = JSON.parse(saved);
    return GetChampionPosterResponse.safeParse(candidate).success
      ? candidate as ChampionPosterSnapshot
      : null;
  } catch {
    return null;
  }
}

function formatDate(value?: string | null) {
  if (!value) return 'Not reported';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function number(value: number, digits = 0) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

function ChampionArtwork({ champion, onArtwork }: { champion: ChampionPosterChampion; onArtwork: (id: string, dataUrl: string) => void }) {
  const { data } = useGetChampionPosterArtwork(champion.id, {
    query: { queryKey: getGetChampionPosterArtworkQueryKey(champion.id), staleTime: 60 * 60 * 1000 },
  });
  const onArtworkRef = useRef(onArtwork);
  onArtworkRef.current = onArtwork;
  useEffect(() => {
    if (data?.dataUrl) onArtworkRef.current(champion.id, data.dataUrl);
  }, [champion.id, data?.dataUrl]);
  return data?.dataUrl
    ? <img src={data.dataUrl} alt={`${champion.name} champion artwork`} />
    : <div className="fallback-art" aria-label={`${champion.name} artwork loading`}>{champion.name.slice(0, 1)}</div>;
}

function Home() {
  const queryClient = useQueryClient();
  const posterQueryKey = getGetChampionPosterQueryKey();
  const { data: liveSnapshot, isLoading, isError, error } = useGetChampionPoster({
    query: { queryKey: posterQueryKey, refetchInterval: 15 * 60 * 1000, refetchIntervalInBackground: false, retry: 1 },
  });
  const [importedSnapshot, setImportedSnapshot] = useState<ChampionPosterSnapshot | null>(() => readLocalSnapshot());
  const [jsonDraft, setJsonDraft] = useState(() => {
    const saved = readLocalSnapshot();
    return saved ? JSON.stringify(saved, null, 2) : '';
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [artwork, setArtwork] = useState<Record<string, string>>({});
  const snapshot = importedSnapshot ?? liveSnapshot ?? null;
  const isLocalCopy = Boolean(importedSnapshot);

  const refreshMutation = useRefreshChampionPoster({
    mutation: {
      onSuccess: (freshSnapshot) => {
        queryClient.setQueryData(posterQueryKey, freshSnapshot);
        queryClient.invalidateQueries({ queryKey: posterQueryKey });
        localStorage.removeItem(LOCAL_SNAPSHOT_KEY);
        setImportedSnapshot(null);
        setJsonDraft(JSON.stringify(freshSnapshot, null, 2));
        setFeedback('Verified profile refreshed.');
      },
      onError: () => setFeedback('Refresh did not complete. The last available snapshot remains visible.'),
    },
  });

  const rememberArtwork = (id: string, dataUrl: string) => setArtwork((current) => current[id] === dataUrl ? current : { ...current, [id]: dataUrl });
  const loadJson = () => {
    try {
      const candidate: unknown = JSON.parse(jsonDraft);
      const result = GetChampionPosterResponse.safeParse(candidate);
      if (!result.success) {
        throw new Error(result.error.issues[0]?.message ?? 'Snapshot data is incomplete.');
      }
      // Keep date-time values as JSON strings; the schema's parsed output may coerce them to Date.
      const parsed = candidate as ChampionPosterSnapshot;
      localStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(parsed));
      setImportedSnapshot(parsed);
      setJsonDraft(JSON.stringify(parsed, null, 2));
      setFeedback('Local snapshot loaded and saved on this device.');
    } catch (issue) {
      setFeedback(issue instanceof Error ? issue.message : 'Could not read that JSON snapshot.');
    }
  };
  const useLiveSnapshot = () => {
    localStorage.removeItem(LOCAL_SNAPSHOT_KEY);
    setImportedSnapshot(null);
    setFeedback(liveSnapshot ? 'Showing the latest server snapshot.' : 'No live snapshot is available yet.');
  };

  const downloadPng = async () => {
    if (!snapshot) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1500;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#192b28'; context.fillRect(0, 0, 1200, 1500);
    const glow = context.createRadialGradient(1000, 100, 0, 1000, 100, 620);
    glow.addColorStop(0, 'rgba(210,165,83,.30)'); glow.addColorStop(1, 'rgba(25,43,40,0)');
    context.fillStyle = glow; context.fillRect(0, 0, 1200, 800);
    context.strokeStyle = 'rgba(224,191,123,.22)'; context.lineWidth = 2;
    for (let i = 0; i < 4; i++) { context.beginPath(); context.arc(1030, 130, 170 + i * 70, 0, Math.PI * 2); context.stroke(); }
    const text = (value: string, x: number, y: number, size: number, color: string, font = '600') => {
      context.fillStyle = color; context.font = `${font} ${size}px ${size < 18 ? 'monospace' : 'Arial'}`; context.fillText(value, x, y);
    };
    text(`ARENAsweats  /  ${isLocalCopy ? 'LOCAL JSON COPY' : 'SOURCE SNAPSHOT'}`, 72, 88, 17, '#d9bd78', '500');
    text(snapshot.playerName, 72, 205, 72, '#f1efe6');
    text(`${snapshot.region}  ·  ${snapshot.season}`, 75, 252, 19, '#bdc8bb', '500');
    text(snapshot.overall.leagueRank, 75, 345, 37, '#e5ca83');
    text(`CURRENT LEAGUE  ·  PROFILE TIER ${snapshot.overall.profileTier}`, 75, 382, 14, '#bbc7bb', '500');
    text(`SOURCE RANK #${number(snapshot.overall.rank)}  ·  TOP ${number(snapshot.overall.topPercentile, 1)}%  ·  PEAK #${number(snapshot.overall.peakRank)}`, 590, 345, 15, '#e5ca83', '500');
    text(`PEAK RATING ${number(snapshot.overall.peakRating)}  ·  RANK CHANGE ${snapshot.overall.rankChange > 0 ? '+' : ''}${number(snapshot.overall.rankChange)}`, 590, 382, 13, '#bbc7bb', '500');
    context.strokeStyle = 'rgba(236,237,219,.2)'; context.beginPath(); context.moveTo(72, 430); context.lineTo(1128, 430); context.stroke();
    const stats = [
      ['GAMES', number(snapshot.overall.games)], ['WINS', number(snapshot.overall.wins)],
      ['TOP THREE', `${number(snapshot.overall.topThreeRate, 0)}%`], ['AVG PLACE', number(snapshot.overall.averagePlacement, 2)],
      ['KDA', snapshot.overall.kda], ['RATING', number(snapshot.overall.rating)],
      ['BEST TOP-3 STREAK', number(snapshot.overall.bestTopThreeStreak)], ['BEST WIN STREAK', number(snapshot.overall.bestWinStreak)],
    ];
    stats.forEach(([label, value], index) => {
      const x = 72 + (index % 4) * 267; const y = 475 + Math.floor(index / 4) * 120;
      text(value, x, y + 32, 29, '#f1efe6');
      text(label, x, y + 60, 13, '#aebcb0', '500');
    });
    text('EXPOSED CHAMPION RECORDS', 72, 760, 16, '#d9bd78', '500');
    const champions = [...snapshot.champions].sort((a, b) => a.sourceOrder - b.sourceOrder).slice(0, 3);
    for (let index = 0; index < champions.length; index++) {
      const champion = champions[index]; const y = 810 + index * 150;
      context.fillStyle = '#213a34'; context.fillRect(72, y, 1056, 126);
      const sourceArt = artwork[champion.id];
      if (sourceArt) {
        const image = new Image(); image.src = sourceArt;
        await new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); });
        if (image.complete && image.naturalWidth) context.drawImage(image, 92, y + 13, 100, 100);
      }
      text(`#${champion.championRank}`, 220, y + 44, 14, '#d9bd78', '500');
      text(champion.name, 220, y + 78, 26, '#f1efe6');
      text(`${number(champion.games)} GAMES · ${number(champion.wins)} WINS · ${number(champion.losses)} LOSSES · ${number(champion.winRate, 1)}% WIN · ${number(champion.topThreeRate)}% TOP 3`, 510, y + 43, 11, '#c2cec2', '500');
      text(`AVG ${number(champion.averagePlacement, 2)} · SCORE ${number(champion.score, 1)} · GLOBAL LADDER #${number(champion.championRank)}`, 510, y + 66, 11, '#d9bd78', '500');
      text(`KILLS ${number(champion.kills)} · ASSISTS ${number(champion.assists)} · GOLD EARNED ${number(champion.goldEarned)}`, 510, y + 89, 10, '#c2cec2', '500');
      text(`DAMAGE TO CHAMPIONS ${number(champion.damageDealtToChampions)} · DAMAGE TAKEN ${number(champion.damageTaken)}`, 510, y + 106, 9, '#aebcb0', '500');
      text(`DAMAGE MITIGATED ${number(champion.damageMitigated)} · HEALING ${number(champion.healing)}`, 510, y + 121, 9, '#aebcb0', '500');
    }
    text(`PUBLIC PROFILE · ${snapshot.sourceName}`, 72, 1325, 14, '#d9bd78', '500');
    text(snapshot.coverageNote.slice(0, 120), 72, 1363, 12, '#bdc8bb', '500');
    text(`LAST SUCCESSFUL REFRESH · ${formatDate(snapshot.lastSuccessfulRefresh)}`, 72, 1410, 12, '#9eaea3', '500');
    text('CHAMPION WIN RATES AND LOSSES ARE CALCULATED FROM GAMES AND WINS', 72, 1436, 10, '#9eaea3', '500');
    const anchor = document.createElement('a');
    anchor.download = `${snapshot.playerName.replace(/[^a-z0-9-]/gi, '-')}-${snapshot.season}-arenasweats.png`;
    anchor.href = canvas.toDataURL('image/png'); anchor.click();
  };

  const status = snapshot?.refreshStatus ?? 'stale';
  const statusText = isLocalCopy ? 'LOCAL JSON COPY' : status === 'fresh' ? 'SOURCE CURRENT' : status === 'seed' ? 'BUILD SNAPSHOT' : status === 'error' ? 'REFRESH ERROR · LAST GOOD DATA' : 'CACHED SNAPSHOT';
  const exposedGames = snapshot?.exposedChampionGames ?? 0;
  const reportedGames = snapshot?.reportedOverallGames ?? snapshot?.overall.games ?? 0;

  return (
    <div className="app-shell">
      <div className="content-wrap">
        <header className="topbar">
          <div className="brand"><div className="brand-mark"><span>AS</span></div><span>ARENA SWEATS</span></div>
          <div className="top-label">PUBLIC PLAYER RECORD &nbsp; / &nbsp; NORTH AMERICA</div>
        </header>
        <main className="main">
          <section className="intro enter">
            <div>
              <div className="eyebrow">Competitive profile / Season {snapshot?.season ?? '—'}</div>
              <h1>Player poster.</h1>
              <p className="intro-copy">A shareable view of public ArenaSweats results. Source-reported records only; no inferred match history or hidden ladder data.</p>
            </div>
            <div className="actions">
              <button className="button button-primary" onClick={downloadPng} disabled={!snapshot || !snapshot.champions.every((champion) => artwork[champion.id])} data-testid="button-download-png" title="PNG includes source champion artwork">
                <ArrowDownToLine size={15} /> Download PNG
              </button>
              <button className="button" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} data-testid="button-refresh">
                <RefreshCw size={14} className={refreshMutation.isPending ? 'animate-spin' : ''} /> {refreshMutation.isPending ? 'Refreshing' : 'Refresh'}
              </button>
            </div>
          </section>
          {isError && !snapshot && !isLoading && (
            <div className="error-notice" role="alert"><CircleAlert size={14} /> &nbsp; Could not load the public snapshot. {error instanceof Error ? error.message : ''} Import a previously exported JSON file below and retry.</div>
          )}
          {isError && snapshot && status !== 'error' && (
            <div className="error-notice" role="status"><CircleAlert size={14} /> &nbsp; The latest source check failed; keeping the last available data visible.</div>
          )}
          {status === 'error' && snapshot && (
            <div className="error-notice" role="status"><CircleAlert size={14} /> &nbsp; Refresh failed; showing the last successful snapshot. {snapshot.refreshMessage ?? ''}</div>
          )}
          {isLoading && !snapshot ? (
            <div className="poster-layout enter-delay" aria-label="Loading profile">
              <div className="poster"><div className="skeleton" style={{ width: 210, height: 15 }} /><div className="skeleton" style={{ width: '68%', height: 54, marginTop: 70 }} /><div className="skeleton" style={{ height: 155, marginTop: 50 }} /></div>
              <div className="side-panel"><div className="skeleton" style={{ height: 24, width: 160, marginBottom: 25 }} />{[1, 2, 3].map((item) => <div className="skeleton" key={item} style={{ height: 62, marginBottom: 10 }} />)}</div>
            </div>
          ) : snapshot ? (
            <>
              <div className="poster-layout enter-delay">
                <article className="poster" id="player-poster" data-testid="card-player-poster">
                  <div className="poster-kicker"><span>ARENA SWEATS&nbsp; / &nbsp;PLAYER CARD</span><span className="verified"><span className="verified-dot" /> {isLocalCopy ? 'LOCAL JSON COPY' : 'SOURCE SNAPSHOT'}</span></div>
                  <div className="player-title" data-testid="text-player-name">{snapshot.playerName}</div>
                  <div className="player-subtitle">{snapshot.region} &nbsp;·&nbsp; {snapshot.season} &nbsp;·&nbsp; PUBLIC TIER {snapshot.overall.profileTier}</div>
                  <div className="rank-row">
                    <div className="rank-seal"><ShieldCheck size={23} /></div>
                    <div className="rank-copy"><strong>{snapshot.overall.leagueRank}</strong><span>RANKED LEAGUE · {snapshot.overall.rating} RATING</span></div>
                  </div>
                  <div className="poster-stats">
                    <div className="poster-stat"><b>{number(snapshot.overall.games)}</b><small>Games</small></div>
                    <div className="poster-stat"><b>{number(snapshot.overall.wins)}</b><small>Wins</small></div>
                    <div className="poster-stat"><b>{number(snapshot.overall.topThreeRate)}%</b><small>Top 3 rate</small></div>
                    <div className="poster-stat"><b>{number(snapshot.overall.averagePlacement, 2)}</b><small>Avg placement</small></div>
                    <div className="poster-stat"><b>{snapshot.overall.kda}</b><small>K / D / A</small></div>
                    <div className="poster-stat"><b>{number(snapshot.overall.bestTopThreeStreak)}</b><small>Best top-3 streak</small></div>
                    <div className="poster-stat"><b>{number(snapshot.overall.bestWinStreak)}</b><small>Best win streak</small></div>
                    <div className="poster-stat"><b>Top {number(snapshot.overall.topPercentile, 1)}%</b><small>Source percentile</small></div>
                  </div>
                  <div className="champion-strip">
                    {[...snapshot.champions].sort((a, b) => a.sourceOrder - b.sourceOrder).map((champion) => (
                      <div className="champion-mini" key={champion.id} data-testid={`card-champion-${champion.id}`}>
                        <ChampionArtwork champion={champion} onArtwork={rememberArtwork} />
                        <div><strong>{champion.name}</strong><small>#{champion.championRank} · {champion.games} games</small></div>
                      </div>
                    ))}
                  </div>
                  <div className="poster-footer"><span>{snapshot.sourceName} · public stats</span><span>Updated {formatDate(snapshot.lastSuccessfulRefresh)}</span></div>
                </article>
                <aside className="side-panel">
                  <div className="section-heading"><h2>Champion records</h2><span className="games-total">{exposedGames} GAMES SHOWN</span></div>
                  <div className="champion-list">
                    {[...snapshot.champions].sort((a, b) => a.sourceOrder - b.sourceOrder).map((champion) => (
                      <div className="champion-row" key={champion.id} data-testid={`row-champion-${champion.id}`}>
                        <ChampionArtwork champion={champion} onArtwork={rememberArtwork} />
                        <div className="champion-details">
                          <div className="champion-heading">
                            <div>
                              <div className="champion-name">{champion.name}</div>
                              <div className="champion-meta">{number(champion.games)} games · {number(champion.wins)} wins · {number(champion.losses)} losses</div>
                              <div className="champion-meta">{number(champion.winRate, 1)}% win · {number(champion.topThreeRate)}% top 3 · avg {number(champion.averagePlacement, 2)}</div>
                            </div>
                            <div className="champion-score">{number(champion.score, 1)}<small>SCORE · #{champion.championRank}</small></div>
                          </div>
                          <div className="champion-stat-heading">Source-reported totals</div>
                          <div className="champion-stat-grid" aria-label={`${champion.name} champion totals`}>
                            <div className="champion-total"><span>Kills</span><strong>{number(champion.kills)}</strong></div>
                            <div className="champion-total"><span>Assists</span><strong>{number(champion.assists)}</strong></div>
                            <div className="champion-total"><span>Gold earned</span><strong>{number(champion.goldEarned)}</strong></div>
                            <div className="champion-total"><span>Damage dealt to champions</span><strong>{number(champion.damageDealtToChampions)}</strong></div>
                            <div className="champion-total"><span>Damage taken</span><strong>{number(champion.damageTaken)}</strong></div>
                            <div className="champion-total"><span>Damage mitigated</span><strong>{number(champion.damageMitigated)}</strong></div>
                            <div className="champion-total"><span>Healing</span><strong>{number(champion.healing)}</strong></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="coverage-box" data-testid="text-coverage-note"><strong>Coverage limitation.</strong> {snapshot.coverageNote} Public champion records shown total {exposedGames} games; {reportedGames} overall games are reported.</div>
                </aside>
              </div>
              <div className="details-grid">
                <section className="detail-panel">
                  <div className="section-heading"><h2>Competitive record</h2><span className="status-line"><i className={`status-pip ${status}`} />{statusText}</span></div>
                  <div className="detail-pair"><span>Source rank</span><strong>#{number(snapshot.overall.rank)} · top {number(snapshot.overall.topPercentile, 1)}%</strong></div>
                  <div className="detail-pair"><span>Peak standing</span><strong>#{number(snapshot.overall.peakRank)} · {number(snapshot.overall.peakRating)} rating</strong></div>
                  <div className="detail-pair"><span>League record</span><strong>{snapshot.overall.leagueRank}</strong></div>
                  <div className="detail-pair"><span>Source ranking note</span><strong>{snapshot.rankingNote}</strong></div>
                  <div className="detail-pair"><span>Last successful refresh</span><strong>{formatDate(snapshot.lastSuccessfulRefresh)}</strong></div>
                  <div className="detail-pair"><span>Last game reported</span><strong>{formatDate(snapshot.overall.lastGameAt)}</strong></div>
                </section>
                <section className="detail-panel">
                  <div className="section-heading"><h2>Source & provenance</h2><span className="status-line"><i className={`status-pip ${status}`} />{isLocalCopy ? 'local copy' : snapshot.refreshStatus}</span></div>
                  <div className="detail-pair"><span>Data source</span><strong>{snapshot.sourceName}</strong></div>
                  <div className="detail-pair"><span>Player profile</span><strong><a className="source-link" href={snapshot.sourceUrl} target="_blank" rel="noreferrer" data-testid="link-source-profile">{snapshot.sourceUrl} <ExternalLink size={11} /></a></strong></div>
                  <div className="detail-pair"><span>Refresh message</span><strong>{snapshot.refreshMessage || 'No source warning reported.'}</strong></div>
                  <div className="detail-pair"><span>Refresh cadence</span><strong>Automatic check every 15 minutes</strong></div>
                  <div className="coverage-box"><strong>{isLocalCopy ? 'Local copy.' : 'Ranking method.'}</strong> {isLocalCopy ? 'These values were imported from JSON and saved only in this browser. Check the linked source for verification.' : `${snapshot.rankingNote} The source does not disclose its ranking formula; no formula is inferred here.`}</div>
                </section>
              </div>
            </>
          ) : (
            <div className="empty-state"><div><div className="eyebrow">No snapshot available</div><h2>Bring a saved profile.</h2><p>This view does not fabricate player records. Import a valid snapshot JSON below, or try refreshing the public ArenaSweats source.</p><button className="button button-primary" onClick={() => setEditorOpen(true)}><ArrowUpFromLine size={14} /> Import snapshot JSON</button></div></div>
          )}
          <section className="detail-panel data-tools">
            <div className="tools-header">
              <div><div className="eyebrow">Portable data</div><h2>Snapshot JSON</h2></div>
              <div className="actions">
                {importedSnapshot && <button className="button" onClick={useLiveSnapshot} data-testid="button-use-live"><Check size={14} /> Use live</button>}
                <button className="button" onClick={() => {
                  if (!snapshot) return;
                  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
                  anchor.href = url; anchor.download = `${snapshot.playerName.replace(/[^a-z0-9-]/gi, '-')}-snapshot.json`; anchor.click(); URL.revokeObjectURL(url);
                }} disabled={!snapshot} data-testid="button-export-json"><FileJson size={14} /> Export JSON</button>
                <button className="button" onClick={() => setEditorOpen((open) => !open)} data-testid="button-toggle-json"><ChevronDown size={14} style={{ transform: editorOpen ? 'rotate(180deg)' : undefined }} /> {editorOpen ? 'Close editor' : 'Edit / import'}</button>
              </div>
            </div>
            {editorOpen && <>
              <textarea className="json-editor" aria-label="Editable player snapshot JSON" data-testid="input-snapshot-json" value={jsonDraft} onChange={(event) => setJsonDraft(event.target.value)} placeholder="Paste a previously exported ChampionPosterSnapshot JSON object here." spellCheck={false} />
              <div className="tools-header"><p className="tool-feedback" role="status" data-testid="status-json-feedback">{feedback}</p><button className="button button-primary" onClick={loadJson} data-testid="button-import-json"><ArrowUpFromLine size={14} /> Validate & use locally</button></div>
            </>}
            {!editorOpen && <p className="tool-feedback">Export the current snapshot for safekeeping, or edit/import JSON. Imported snapshots persist locally on this device and remain visibly marked as a local copy.</p>}
          </section>
        </main>
        <footer className="footer"><span>PUBLIC SOURCE DATA · NO MATCH HISTORY INFERRED</span><span>{snapshot ? `${snapshot.sourceName} · ${snapshot.region}` : 'ARENASWEATS'}</span></footer>
      </div>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
