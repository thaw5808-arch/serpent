import "server-only";
import type { LatLng } from "@/lib/geo";
import { classifyArea, type NearbySnakes } from "./classify";
import { fetchArea, includeNonCommercial, type FetchLike, type GbifArea } from "./gbif";

/*
 * Snakes recorded near a point: GBIF counts, cached per rounded point for 30 days
 * so repeated searches don't hit GBIF. The cache keeps GBIF's raw counts, not the
 * classified rows, so venom status and risk always come from the data we ship now.
 * Nothing about who searched is stored: only the rounded point, the place name
 * and GBIF's answer.
 */

export const CACHE_DAYS = 30;
/** An empty answer is re-checked sooner, in case records were added or GBIF had a gap. */
export const EMPTY_CACHE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Which licences went into an answer: part of the cache key. */
export type LicenseScope = "open" | "all";

export interface CachedArea {
  area: GbifArea;
  cityName: string;
  fetchedAt: Date;
}

export interface SightingStore {
  get(point: LatLng, scope: LicenseScope): Promise<CachedArea | null>;
  put(point: LatLng, scope: LicenseScope, cityName: string, area: GbifArea, fetchedAt: Date): Promise<void>;
}

export interface Sightings extends NearbySnakes {
  area: Omit<GbifArea, "species">;
  /** When GBIF was queried (the cache date for a cached answer). */
  fetchedAt: string;
  cached: boolean;
}

export function isFresh(entry: CachedArea, now: Date): boolean {
  const days = entry.area.species.length ? CACHE_DAYS : EMPTY_CACHE_DAYS;
  return now.getTime() - entry.fetchedAt.getTime() < days * DAY_MS;
}

/** Lookups already running, so two people searching the same city at once cost one GBIF query. */
const inFlight = new Map<string, Promise<GbifArea>>();

export async function getSightings(
  point: LatLng,
  cityName: string,
  deps: { store?: SightingStore | null; fetch?: FetchLike; now?: Date; includesNonCommercial?: boolean } = {},
): Promise<Sightings> {
  const now = deps.now ?? new Date();
  const includesNonCommercial = deps.includesNonCommercial ?? includeNonCommercial();
  const scope: LicenseScope = includesNonCommercial ? "all" : "open";
  const store = deps.store === undefined ? defaultStore() : deps.store;

  const hit = await store?.get(point, scope).catch((err: unknown) => {
    console.error("[near-me] cache read failed:", (err as Error).message);
    return null;
  });
  if (hit && isFresh(hit, now)) return present(hit.area, hit.fetchedAt, true);

  const key = `${point.lat},${point.lng},${scope}`;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = fetchArea(point, { fetch: deps.fetch, includesNonCommercial, now }).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  const area = await pending;
  await store?.put(point, scope, cityName, area, now).catch((err: unknown) => {
    console.error("[near-me] cache write failed:", (err as Error).message);
  });
  return present(area, now, false);
}

function present(area: GbifArea, fetchedAt: Date, cached: boolean): Sightings {
  const { species, ...meta } = area;
  return { area: meta, ...classifyArea(species), fetchedAt: fetchedAt.toISOString(), cached };
}

/** The Neon/Postgres cache, when DATABASE_URL is set; otherwise no cache. */
function defaultStore(): SightingStore | null {
  if (!process.env.DATABASE_URL) return null;
  return {
    async get(point, scope) {
      const { prisma } = await import("@/lib/db");
      const row = await prisma.sightingCache.findUnique({ where: { lat_lng_licenses: { lat: point.lat, lng: point.lng, licenses: scope } } });
      return row ? { area: row.results as unknown as GbifArea, cityName: row.cityName, fetchedAt: row.fetchedAt } : null;
    },
    async put(point, scope, cityName, area, fetchedAt) {
      const { prisma } = await import("@/lib/db");
      const data = { cityName, results: area as unknown as object, fetchedAt };
      await prisma.sightingCache.upsert({
        where: { lat_lng_licenses: { lat: point.lat, lng: point.lng, licenses: scope } },
        create: { lat: point.lat, lng: point.lng, licenses: scope, ...data },
        update: data,
      });
    },
  };
}
