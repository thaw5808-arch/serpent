import "server-only";
import type { LatLng } from "@/lib/geo";
import type { MonthCounts, SeasonData } from "@/lib/season";
import type { NearbySnakes } from "./classify";
import {
  API,
  GbifUnavailableError,
  SINCE_YEAR,
  includeNonCommercial,
  placeFilters,
  query,
  search,
  snakeTaxonFilter,
  type FetchLike,
  type SearchResponse,
} from "./gbif";

/*
 * Snake records per month near a point, from GBIF's month facet (limit=0: counts
 * only, no records downloaded). Same area, years, record types and licences as
 * Near me. The dangerous series counts only the high and very high risk species
 * Near me lists for the place (up to 8), in one request with repeated taxonKeys.
 * Cached in the SightingCache table for 7 days, under its own licence key.
 */

export const SEASON_CACHE_DAYS = 7;
export const SEASON_TIMEOUT_MS = 15_000;
export const MAX_DANGEROUS_SPECIES = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

type Scope = "open" | "all";
/** The SightingCache `licenses` value for season rows, kept apart from Near me's species rows. */
export const seasonCacheKey = (scope: Scope) => `season:${scope}`;

/** What is cached: GBIF's counts, plus the names of the species behind the dangerous series. */
export type CachedSeason = Omit<SeasonData, "cached" | "fetchedAt">;

export interface SeasonStore {
  get(point: LatLng, key: string): Promise<{ season: CachedSeason; fetchedAt: Date } | null>;
  put(point: LatLng, key: string, cityName: string, season: CachedSeason, fetchedAt: Date): Promise<void>;
}

/** GBIF's month facet → 12 counts (January first). Missing or malformed months count as 0. */
export function parseMonthFacet(response: unknown): MonthCounts {
  const months = Array<number>(12).fill(0);
  const facets = (response as SearchResponse | null)?.facets;
  const counts = Array.isArray(facets) ? facets.find((f) => f?.field === "MONTH")?.counts : undefined;
  for (const c of Array.isArray(counts) ? counts : []) {
    const m = Number(c?.name);
    const n = Number(c?.count);
    if (Number.isInteger(m) && m >= 1 && m <= 12 && Number.isFinite(n) && n >= 0) months[m - 1] = n;
  }
  return months;
}

const monthParams = (): [string, string][] => [["limit", "0"], ["facet", "month"], ["facetLimit", "12"]];

/** The all-snakes month query as a GBIF API URL. */
export const seasonQueryUrl = (center: LatLng, nc: boolean) =>
  `${API}?${query([...placeFilters(center, nc), ...snakeTaxonFilter(), ...monthParams()])}`;

function withDeadline<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GbifUnavailableError(`${what} took longer than ${ms / 1000} s`)), ms);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}

/** The dangerous rows to count: high and very high risk, most dangerous first (Near me's order), at most 8. */
export function dangerousForSeason(snakes: NearbySnakes): { names: string[]; keys: number[] } {
  const rows = snakes.dangerous.filter((r) => r.medicalRisk === "high" || r.medicalRisk === "very_high").slice(0, MAX_DANGEROUS_SPECIES);
  return { names: rows.map((r) => r.commonName ?? r.scientificName), keys: [...new Set(rows.flatMap((r) => r.gbifKeys))] };
}

export async function getSeason(
  point: LatLng,
  cityName: string,
  deps: {
    /** Near me's species list for the place (its own cache applies). */
    sightings: () => Promise<NearbySnakes>;
    store?: SeasonStore | null;
    fetch?: FetchLike;
    now?: Date;
    includesNonCommercial?: boolean;
    timeoutMs?: number;
  },
): Promise<SeasonData> {
  const now = deps.now ?? new Date();
  const nc = deps.includesNonCommercial ?? includeNonCommercial();
  const key = seasonCacheKey(nc ? "all" : "open");
  const store = deps.store === undefined ? defaultStore() : deps.store;
  const fetchImpl = deps.fetch ?? fetch;
  const ms = deps.timeoutMs ?? SEASON_TIMEOUT_MS;

  const hit = await store?.get(point, key).catch((err: unknown) => {
    console.error("[season] cache read failed:", (err as Error).message);
    return null;
  });
  if (hit && now.getTime() - hit.fetchedAt.getTime() < SEASON_CACHE_DAYS * DAY_MS) {
    return { ...hit.season, fetchedAt: hit.fetchedAt.toISOString(), cached: true };
  }

  const area = placeFilters(point, nc);
  // Both run at once; together they never take longer than the deadline.
  const all = withDeadline(search(fetchImpl, [...area, ...snakeTaxonFilter(), ...monthParams()]), ms, "GBIF month counts");
  const dangerous = withDeadline(
    (async () => {
      const { names, keys } = dangerousForSeason(await deps.sightings());
      if (keys.length === 0) return { months: Array<number>(12).fill(0), total: 0, species: [] };
      const res = await search(fetchImpl, [...area, ...keys.map((k): [string, string] => ["taxonKey", String(k)]), ...monthParams()]);
      const months = parseMonthFacet(res);
      return { months, total: months.reduce((a, b) => a + b, 0), species: names };
    })(),
    ms,
    "GBIF dangerous-species month counts",
  ).catch((err: unknown) => {
    // The all-snakes chart still shows; the dangerous series is left out (and not cached).
    console.error("[season] dangerous series unavailable:", (err as Error).message);
    return null;
  });

  const months = parseMonthFacet(await all);
  const season: CachedSeason = {
    months,
    total: months.reduce((a, b) => a + b, 0),
    dangerous: await dangerous,
    queryUrl: seasonQueryUrl(point, nc),
    sinceYear: SINCE_YEAR,
  };
  if (season.dangerous) {
    await store?.put(point, key, cityName, season, now).catch((err: unknown) => {
      console.error("[season] cache write failed:", (err as Error).message);
    });
  }
  return { ...season, fetchedAt: now.toISOString(), cached: false };
}

/** The Neon/Postgres cache (SightingCache), when DATABASE_URL is set; otherwise no cache. */
function defaultStore(): SeasonStore | null {
  if (!process.env.DATABASE_URL) return null;
  return {
    async get(point, key) {
      const { prisma } = await import("@/lib/db");
      const row = await prisma.sightingCache.findUnique({ where: { lat_lng_licenses: { lat: point.lat, lng: point.lng, licenses: key } } });
      return row ? { season: row.results as unknown as CachedSeason, fetchedAt: row.fetchedAt } : null;
    },
    async put(point, key, cityName, season, fetchedAt) {
      const { prisma } = await import("@/lib/db");
      const data = { cityName, results: season as unknown as object, fetchedAt };
      await prisma.sightingCache.upsert({
        where: { lat_lng_licenses: { lat: point.lat, lng: point.lng, licenses: key } },
        create: { lat: point.lat, lng: point.lng, licenses: key, ...data },
        update: data,
      });
    },
  };
}
