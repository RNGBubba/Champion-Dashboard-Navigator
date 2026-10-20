import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

import {
  GetChampionPosterArtworkParams,
  GetChampionPosterArtworkResponse,
  GetChampionPosterResponse,
  RefreshChampionPosterResponse,
} from "@workspace/api-zod";
import { championPosterSnapshotsTable, db } from "@workspace/db";

const router: IRouter = Router();

const ARENASWEATS_ORIGIN = "https://arenasweats.lol";
const PLAYER_NAME = "Angel Teemo#666";
const REGION = "na";
const SEASON = "live";
const SNAPSHOT_ID = "angel-teemo-na";
const CACHE_TTL_MS = 15 * 60 * 1000;
const AUTO_RETRY_COOLDOWN_MS = 5 * 60 * 1000;
const MANUAL_REFRESH_COOLDOWN_MS = 30 * 1000;
const ARTWORK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type PosterSnapshot = ReturnType<typeof GetChampionPosterResponse.parse>;
type JsonRecord = Record<string, unknown>;

const verifiedSeed: PosterSnapshot = GetChampionPosterResponse.parse({
  playerName: PLAYER_NAME,
  region: "NA",
  season: "LIVE",
  sourceName: "ArenaSweats public player profile",
  sourceUrl:
    "https://arenasweats.lol/na/Angel%20Teemo-666/profile/",
  lastSuccessfulRefresh: "2026-10-19T23:45:23.000Z",
  refreshStatus: "seed",
  refreshMessage:
    "Showing the last verified public snapshot while live data is unavailable.",
  overall: {
    games: 67,
    wins: 12,
    winRate: (12 / 67) * 100,
    topThreeRate: 52,
    averagePlacement: 3.28,
    bestTopThreeStreak: 4,
    bestWinStreak: 2,
    kda: "7.8 / 7.8 / 11.2",
    rating: 1469,
    rank: 25659,
    topPercentile: 13.1,
    leagueRank: "Platinum II 78 LP",
    peakRank: 857,
    peakRating: 2034,
    rankChange: -38,
    profileTier: 3,
    lastGameAt: "2026-10-19T16:42:35.000Z",
  },
  champions: [
    {
      id: "urgot",
      name: "Urgot",
      sourceOrder: 1,
      championRank: 1,
      score: 1769.4864822057084,
      games: 43,
      wins: 9,
      losses: 34,
      winRate: (9 / 43) * 100,
      topThreeRate: 56,
      averagePlacement: 3.09,
      kills: 353,
      assists: 513,
      goldEarned: 632370,
      damageDealtToChampions: 2004068,
      damageTaken: 1910741,
      damageMitigated: 4846654,
      healing: 731056,
    },
    {
      id: "singed",
      name: "Singed",
      sourceOrder: 2,
      championRank: 347,
      score: 384.78048696945507,
      games: 4,
      wins: 1,
      losses: 3,
      winRate: 25,
      topThreeRate: 50,
      averagePlacement: 3.25,
      kills: 24,
      assists: 53,
      goldEarned: 55329,
      damageDealtToChampions: 176803,
      damageTaken: 152286,
      damageMitigated: 339722,
      healing: 52157,
    },
    {
      id: "akshan",
      name: "Akshan",
      sourceOrder: 3,
      championRank: 376,
      score: 307.1955725918267,
      games: 3,
      wins: 0,
      losses: 3,
      winRate: 0,
      topThreeRate: 33,
      averagePlacement: 4.33,
      kills: 29,
      assists: 15,
      goldEarned: 42653,
      damageDealtToChampions: 135379,
      damageTaken: 120142,
      damageMitigated: 129452,
      healing: 14256,
    },
  ],
  rankingNote:
    "Displayed in ArenaSweats' top_champ1 through top_champ3 order with the source's associated champion scores. The site does not publish the score formula. Win rate (wins/games) and losses (games minus wins) are calculated.",
  coverageNote:
    "The public Tier III tab exposes three champion records totaling 50 games, while the overall profile reports 67. The remaining 17 games are not available here; carousel navigation is tier-locked, with no sort or pagination controls.",
  reportedOverallGames: 67,
  exposedChampionGames: 50,
});

let refreshInFlight: Promise<PosterSnapshot> | null = null;
let lastRefreshAttemptAt = 0;
let lastManualRefreshAt = 0;
let lastRefreshError: string | null = null;
const artworkCache = new Map<
  string,
  { dataUrl: string; expiresAt: number }
>();

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`ArenaSweats returned invalid ${label} data.`);
  }
  return value as JsonRecord;
}

function readNumber(record: JsonRecord, key: string): number {
  const value = Number(record[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`ArenaSweats response is missing numeric ${key}.`);
  }
  return value;
}

function readString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`ArenaSweats response is missing ${key}.`);
  }
  return value;
}

function parsedDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function championId(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function apiUrl(
  path: string,
  params: Record<string, string>,
): string {
  const url = new URL(`/api/${path}`, ARENASWEATS_ORIGIN);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`ArenaSweats returned HTTP ${response.status}.`);
  }
  return response.json() as Promise<unknown>;
}

async function fetchLatestSnapshot(): Promise<PosterSnapshot> {
  const rankData = asRecord(
    await fetchJson(
      apiUrl("player_rank", {
        search_term: PLAYER_NAME,
        region: REGION,
        season: SEASON,
        profile: "1",
      }),
    ),
    "player rank",
  );
  if (readString(rankData, "player_name") !== PLAYER_NAME) {
    throw new Error("ArenaSweats returned a different player profile.");
  }

  const playerHash = readString(rankData, "player_hash");
  const [overallDataValue, championsValue, peaksValue] = await Promise.all([
    fetchJson(
      apiUrl("player-data", {
        player_name: PLAYER_NAME,
        region: REGION,
        season: SEASON,
        player_hash: playerHash,
      }),
    ),
    fetchJson(
      apiUrl("player-topchamps", {
        player_name: PLAYER_NAME,
        region: REGION,
        season: SEASON,
      }),
    ),
    fetchJson(
      apiUrl("player-peaks", {
        player_hash: playerHash,
        region: REGION,
        season: SEASON,
      }),
    ),
  ]);

  const overallData = asRecord(overallDataValue, "overall stats");
  const championsData = asRecord(championsValue, "champion stats");
  const peaks = asRecord(peaksValue, "peak stats");
  const sourceChampionsValue = championsData.champions;
  if (!Array.isArray(sourceChampionsValue)) {
    throw new Error("ArenaSweats returned an invalid champion list.");
  }
  const sourceChampions = sourceChampionsValue.map((champion, index) =>
    asRecord(champion, `champion ${index + 1}`),
  );

  const champions = [1, 2, 3].map((order) => {
    const name = readString(rankData, `top_champ${order}`);
    const stats = sourceChampions.find(
      (candidate) =>
        typeof candidate.champion === "string" &&
        candidate.champion.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (!stats) {
      throw new Error(
        `ArenaSweats did not return stats for ranked champion ${name}.`,
      );
    }

    const games = readNumber(stats, "games");
    const wins = readNumber(stats, "wins");
    const losses = Math.max(0, games - wins);
    const rate = (wins / games) * 100;
    const score = readNumber(rankData, `top_champ${order}_score`);
    const championRank = readNumber(rankData, `rank_champ${order}`);

    return {
      id: championId(name),
      name,
      sourceOrder: order,
      championRank,
      score,
      games,
      wins,
      losses,
      winRate: Number.isFinite(rate) ? rate : 0,
      topThreeRate: readNumber(stats, "tophalf_percent"),
      averagePlacement: readNumber(stats, "avg_placing"),
      kills: readNumber(stats, "kills_sum"),
      assists: readNumber(stats, "assists_sum"),
      goldEarned: readNumber(stats, "gold_earned_sum"),
      damageDealtToChampions: readNumber(
        stats,
        "total_damage_dealt_to_champions_sum",
      ),
      damageTaken: readNumber(stats, "total_damage_taken_sum"),
      damageMitigated: readNumber(stats, "damage_self_mitigated_sum"),
      healing: readNumber(stats, "total_heal_sum"),
    };
  });

  const games = readNumber(overallData, "games");
  const wins = readNumber(overallData, "wins");
  const percentile = readNumber(rankData, "percentile");
  const exposedChampionGames = champions.reduce(
    (total, champion) => total + champion.games,
    0,
  );
  const snapshot = {
    playerName: PLAYER_NAME,
    region: "NA",
    season: "LIVE",
    sourceName: "ArenaSweats public player profile",
    sourceUrl:
      "https://arenasweats.lol/na/Angel%20Teemo-666/profile/",
    lastSuccessfulRefresh: new Date().toISOString(),
    refreshStatus: "fresh" as const,
    refreshMessage: null,
    overall: {
      games,
      wins,
      winRate: games > 0 ? (wins / games) * 100 : 0,
      topThreeRate: readNumber(overallData, "tophalf_percent"),
      averagePlacement: readNumber(overallData, "avg_placing"),
      bestTopThreeStreak: readNumber(overallData, "best_tophalf_streak"),
      bestWinStreak: readNumber(overallData, "best_win_streak"),
      kda: readString(overallData, "avg_kda"),
      rating: readNumber(rankData, "rating"),
      rank: readNumber(rankData, "player_rank"),
      topPercentile: Number((100 - percentile).toFixed(1)),
      leagueRank: readString(rankData, "league_rank"),
      peakRank: readNumber(peaks, "peak_rank"),
      peakRating: readNumber(peaks, "peak_rating"),
      rankChange: readNumber(rankData, "rank_change"),
      profileTier: readNumber(rankData, "profile_tier"),
      lastGameAt: parsedDate(rankData.last_game_timestamp),
    },
    champions,
    rankingNote:
      "Displayed in ArenaSweats' top_champ1 through top_champ3 order with the source's associated champion scores. The site does not publish the score formula. Win rate (wins/games) and losses (games minus wins) are calculated.",
    coverageNote: `The public Tier III tab exposes ${champions.length} champion records totaling ${exposedChampionGames} games, while the overall profile reports ${games}. The remaining ${Math.max(0, games - exposedChampionGames)} games are not available here; carousel navigation is tier-locked, with no sort or pagination controls.`,
    reportedOverallGames: games,
    exposedChampionGames,
  };

  return GetChampionPosterResponse.parse(snapshot);
}

async function readStoredSnapshot(): Promise<PosterSnapshot | null> {
  const rows = await db
    .select()
    .from(championPosterSnapshotsTable)
    .where(eq(championPosterSnapshotsTable.id, SNAPSHOT_ID))
    .limit(1);
  if (!rows[0]) return null;

  const validated = GetChampionPosterResponse.safeParse(rows[0].snapshot);
  if (validated.success) return validated.data;

  const stored = asRecord(rows[0].snapshot, "saved player snapshot");
  if (!Array.isArray(stored.champions)) {
    throw new Error("The saved player snapshot is invalid.");
  }
  const champions = stored.champions.map((value, index) => {
    const champion = asRecord(value, `saved champion ${index + 1}`);
    const games = Number(champion.games);
    const wins = Number(champion.wins);
    const losses = Number(champion.losses);
    return {
      ...champion,
      losses: Number.isFinite(losses)
        ? losses
        : Math.max(0, games - wins),
    };
  });
  const migrated = GetChampionPosterResponse.parse({
    ...stored,
    champions,
  });
  await saveSnapshot(migrated);
  return migrated;
}

async function saveSnapshot(snapshot: PosterSnapshot): Promise<void> {
  const now = new Date();
  await db
    .insert(championPosterSnapshotsTable)
    .values({ id: SNAPSHOT_ID, snapshot })
    .onConflictDoUpdate({
      target: championPosterSnapshotsTable.id,
      set: { snapshot, updatedAt: now },
    });
}

function withRefreshStatus(
  snapshot: PosterSnapshot,
  refreshStatus: "fresh" | "stale" | "seed" | "error",
  refreshMessage: string | null,
): PosterSnapshot {
  return GetChampionPosterResponse.parse({
    ...snapshot,
    refreshStatus,
    refreshMessage,
  });
}

async function refreshAndSave(): Promise<PosterSnapshot> {
  if (refreshInFlight) return refreshInFlight;
  lastRefreshAttemptAt = Date.now();
  lastRefreshError = null;
  refreshInFlight = (async () => {
    const snapshot = await fetchLatestSnapshot();
    await saveSnapshot(snapshot);
    return snapshot;
  })();

  try {
    return await refreshInFlight;
  } catch (error) {
    lastRefreshError =
      error instanceof Error ? error.message : "Live refresh failed.";
    throw error;
  } finally {
    refreshInFlight = null;
  }
}

async function getSnapshot(forceRefresh: boolean): Promise<PosterSnapshot> {
  const stored = await readStoredSnapshot();
  const now = Date.now();

  if (!stored) {
    if (
      lastRefreshAttemptAt > 0 &&
      now - lastRefreshAttemptAt < AUTO_RETRY_COOLDOWN_MS
    ) {
      return withRefreshStatus(
        verifiedSeed,
        "seed",
        lastRefreshError ??
          "Live data was checked recently; showing the last verified snapshot.",
      );
    }
    try {
      return await refreshAndSave();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Live refresh failed.";
      return withRefreshStatus(verifiedSeed, "seed", message);
    }
  }

  const ageMs =
    now - new Date(stored.lastSuccessfulRefresh).getTime();
  const isStale = !Number.isFinite(ageMs) || ageMs >= CACHE_TTL_MS;
  if (!forceRefresh && !isStale) {
    return withRefreshStatus(stored, "fresh", null);
  }

  const cooldownMs = forceRefresh
    ? MANUAL_REFRESH_COOLDOWN_MS
    : AUTO_RETRY_COOLDOWN_MS;
  const mostRecentAttemptAt = forceRefresh
    ? lastManualRefreshAt
    : lastRefreshAttemptAt;
  if (
    mostRecentAttemptAt > 0 &&
    now - mostRecentAttemptAt < cooldownMs
  ) {
    return withRefreshStatus(
      stored,
      lastRefreshError ? "error" : "stale",
      lastRefreshError ??
        "A refresh was just attempted. The saved data is still available.",
    );
  }

  if (forceRefresh) lastManualRefreshAt = now;
  try {
    return await refreshAndSave();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Live refresh failed.";
    return withRefreshStatus(stored, "error", message);
  }
}

router.get("/champion-poster", async (req, res): Promise<void> => {
  const snapshot = await getSnapshot(false);
  res.json(GetChampionPosterResponse.parse(snapshot));
});

router.post("/champion-poster/refresh", async (req, res): Promise<void> => {
  const snapshot = await getSnapshot(true);
  res.json(RefreshChampionPosterResponse.parse(snapshot));
});

router.get(
  "/champion-poster/artwork/:championId",
  async (req, res): Promise<void> => {
    const parsedParams = GetChampionPosterArtworkParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "Invalid champion artwork identifier." });
      return;
    }

    const { championId: id } = parsedParams.data;
    const snapshot = (await readStoredSnapshot()) ?? verifiedSeed;
    if (!snapshot.champions.some((champion) => champion.id === id)) {
      res.status(404).json({ error: "Champion artwork is not available." });
      return;
    }

    const cached = artworkCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(
        GetChampionPosterArtworkResponse.parse({
          championId: id,
          dataUrl: cached.dataUrl,
        }),
      );
      return;
    }

    const imageUrl = new URL(
      `/static/imgs/champion_icons/${id}.webp?v=d0ad126`,
      ARENASWEATS_ORIGIN,
    );
    const response = await fetch(imageUrl, {
      headers: { Accept: "image/webp,image/*;q=0.8" },
      signal: AbortSignal.timeout(12_000),
    });
    const contentType = response.headers.get("content-type") ?? "";
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (
      !response.ok ||
      !contentType.startsWith("image/") ||
      (contentLength > 0 && contentLength > 5_000_000)
    ) {
      res.status(404).json({ error: "Champion artwork is unavailable." });
      return;
    }

    const image = Buffer.from(await response.arrayBuffer());
    if (image.byteLength > 5_000_000) {
      res.status(404).json({ error: "Champion artwork is unavailable." });
      return;
    }
    const dataUrl = `data:${contentType};base64,${image.toString("base64")}`;
    artworkCache.set(id, {
      dataUrl,
      expiresAt: Date.now() + ARTWORK_CACHE_TTL_MS,
    });
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.json(
      GetChampionPosterArtworkResponse.parse({
        championId: id,
        dataUrl,
      }),
    );
  },
);

export default router;
