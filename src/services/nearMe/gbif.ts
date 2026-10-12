import "server-only";
import type { LatLng } from "@/lib/geo";

/*
 * Snake occurrence records from GBIF (api.gbif.org, no key needed).
 *
 * GBIF's backbone taxonomy has no usable Serpentes key: Squamata is ranked as a
 * class and snake families sit directly under it beside the lizard families (the
 * backbone's lone "Serpentes" is a stray family under Chordata). So snakes are
 * selected by family: every family in src/data/taxonomy.json, matched to its
 * backbone key (Micrelaps and Psammodynastes, families of their own in The
 * Reptile Database, sit in Atractaspididae and Pseudaspididae in GBIF, both listed).
 *
 * Licences: each dataset on GBIF carries CC0 1.0, CC BY 4.0 or CC BY-NC 4.0, and
 * GBIF's data user agreement requires following each dataset's licence and
 * crediting GBIF.org. CC BY-NC records may only be used non-commercially, so they
 * are left out unless GBIF_INCLUDE_NC=true is set for a non-commercial deployment.
 */

export const SNAKE_FAMILY_KEYS: Record<string, number> = {
  Acrochordidae: 9200,
  Aniliidae: 5676,
  Anomalepididae: 4287901,
  Anomochilidae: 5128,
  Atractaspididae: 5127,
  Boidae: 2464897,
  Bolyeriidae: 4287610,
  Colubridae: 6172,
  Cyclocoridae: 11182941,
  Cylindrophiidae: 5664,
  Elapidae: 9455,
  Gerrhopilidae: 7398556,
  Homalopsidae: 5789856,
  Lamprophiidae: 5789868,
  Leptotyphlopidae: 6931,
  Loxocemidae: 3533,
  Pareidae: 10543166,
  Prosymnidae: 10765577,
  Psammophiidae: 5789716,
  Pseudaspididae: 11209474,
  Pseudoxyrhophiidae: 10874056,
  Pythonidae: 4287591,
  Tropidophiidae: 5020,
  Typhlopidae: 5021,
  Uropeltidae: 5022,
  Viperidae: 5024,
  Xenodermidae: 10196291,
  Xenopeltidae: 9117,
  Xenophidiidae: 7734500,
  Xenotyphlopidae: 7603232,
};

export const RADIUS_KM = 50;
export const SINCE_YEAR = 1990;
const BASIS_OF_RECORD = ["HUMAN_OBSERVATION", "PRESERVED_SPECIMEN", "MACHINE_OBSERVATION"] as const;
const OPEN_LICENSES = ["CC0_1_0", "CC_BY_4_0"] as const;

const API = "https://api.gbif.org/v1/occurrence/search";
/** GBIF asks API clients to identify themselves. */
export const USER_AGENT = "Serpent/0.1 (snake safety app; https://github.com/thaw5808-arch/serpent)";
/** A normal GBIF answer takes about 2 s; give up on one request well before the route's own limit. */
const TIMEOUT_MS = 12_000;
/** Parallel per-species requests: GBIF answers 429 (too many requests) to bursts much above this. */
const CONCURRENCY = 4;
/** On 429/503, wait and try again this many times (honouring Retry-After) before giving up. */
const RETRIES = 3;
const MAX_WAIT_MS = 8000;
/** More species than any 50 km area has; a facet can't be paged, so ask for all at once. */
const FACET_LIMIT = 1000;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;
const sleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One species as GBIF records it in the area. Names are GBIF's accepted backbone names. */
export interface GbifSpecies {
  speciesKey: number;
  name: string;
  genus: string | null;
  family: string | null;
  records: number;
  /** Most recent year with a record in the area (since SINCE_YEAR). */
  lastYear: number | null;
}

export interface GbifArea {
  center: LatLng;
  radiusKm: number;
  sinceYear: number;
  includesNonCommercial: boolean;
  totalRecords: number;
  /** Record counts per licence, e.g. { CC0_1_0: 19, CC_BY_4_0: 231 }. */
  licenses: Record<string, number>;
  species: GbifSpecies[];
  /** The exact query (GBIF API, JSON), so anyone can check the counts behind the page. */
  queryUrl: string;
  /** ISO time the query ran. */
  queriedAt: string;
}

export class GbifUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "GbifUnavailableError";
  }
}

export const includeNonCommercial = () => process.env.GBIF_INCLUDE_NC === "true";

/** The shared filters, as repeated query parameters. */
function filters(center: LatLng, includesNonCommercial: boolean): [string, string][] {
  return [
    ["geoDistance", `${center.lat},${center.lng},${RADIUS_KM}km`],
    ["hasCoordinate", "true"],
    ["hasGeospatialIssue", "false"],
    ["occurrenceStatus", "PRESENT"],
    ...BASIS_OF_RECORD.map((b): [string, string] => ["basisOfRecord", b]),
    ["year", `${SINCE_YEAR},*`],
    ...(includesNonCommercial ? [] : OPEN_LICENSES.map((l): [string, string] => ["license", l])),
    ...Object.values(SNAKE_FAMILY_KEYS).map((k): [string, string] => ["taxonKey", String(k)]),
  ];
}

const query = (params: [string, string][]) => new URLSearchParams(params).toString();

interface FacetCount {
  name: string;
  count: number;
}
interface SearchResponse {
  count: number;
  results: { species?: string; genus?: string; family?: string }[];
  facets?: { field: string; counts: FacetCount[] }[];
}

/** Seconds from a Retry-After header, else exponential backoff (1 s, 2 s, 4 s), capped. */
function waitFor(res: Response, attempt: number): number {
  const header = Number(res.headers.get("retry-after"));
  return Math.min(Number.isFinite(header) && header > 0 ? header * 1000 : 1000 * 2 ** attempt, MAX_WAIT_MS);
}

async function search(fetchImpl: FetchLike, params: [string, string][], wait: Sleep = sleep): Promise<SearchResponse> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetchImpl(`${API}?${query(params)}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // Timeouts and dropped connections are usually momentary: retry them like a 503.
      if (attempt < RETRIES) {
        await wait(1000 * 2 ** attempt);
        continue;
      }
      throw new GbifUnavailableError(`GBIF request failed (${(err as Error).name}: ${(err as Error).message})`, err);
    }
    if ((res.status === 429 || res.status === 503) && attempt < RETRIES) {
      await wait(waitFor(res, attempt));
      continue;
    }
    break;
  }
  if (!res.ok) throw new GbifUnavailableError(`GBIF answered ${res.status}`);
  try {
    return (await res.json()) as SearchResponse;
  } catch (err) {
    throw new GbifUnavailableError("GBIF sent unreadable JSON", err);
  }
}

const facet = (r: SearchResponse, field: string) => r.facets?.find((f) => f.field === field)?.counts ?? [];

/** Runs `fn` over `items`, at most `limit` at a time, keeping order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Counts per species from one faceted query (no records downloaded), then one
 * small query per species for its name and the most recent year it was recorded.
 * Any failure fails the whole lookup: a partial list could silently leave out a
 * dangerous species.
 */
export async function fetchArea(
  center: LatLng,
  opts: { fetch?: FetchLike; includesNonCommercial?: boolean; now?: Date; sleep?: Sleep } = {},
): Promise<GbifArea> {
  const fetchImpl = opts.fetch ?? fetch;
  const wait = opts.sleep ?? sleep;
  const includesNonCommercial = opts.includesNonCommercial ?? includeNonCommercial();
  const base = filters(center, includesNonCommercial);

  const overview = await search(
    fetchImpl,
    [...base, ["limit", "0"], ["facet", "speciesKey"], ["facet", "license"], ["facetLimit", String(FACET_LIMIT)]],
    wait,
  );

  const counts = facet(overview, "SPECIES_KEY");
  const species = await mapLimit(counts, CONCURRENCY, async ({ name: key, count }): Promise<GbifSpecies> => {
    const detail = await search(fetchImpl, [...base, ["speciesKey", key], ["limit", "1"], ["facet", "year"], ["facetLimit", "100"]], wait);
    const record = detail.results[0];
    if (!record?.species) throw new GbifUnavailableError(`GBIF returned no name for species ${key}`);
    const years = facet(detail, "YEAR").map((y) => Number(y.name)).filter(Number.isFinite);
    return {
      speciesKey: Number(key),
      name: record.species,
      genus: record.genus ?? null,
      family: record.family ?? null,
      records: count,
      lastYear: years.length ? Math.max(...years) : null,
    };
  });

  return {
    center,
    radiusKm: RADIUS_KM,
    sinceYear: SINCE_YEAR,
    includesNonCommercial,
    totalRecords: overview.count,
    licenses: Object.fromEntries(facet(overview, "LICENSE").map((l) => [l.name, l.count])),
    species,
    queryUrl: queryUrl(center, includesNonCommercial),
    queriedAt: (opts.now ?? new Date()).toISOString(),
  };
}

/** The species-count query as a GBIF API URL. */
export function queryUrl(center: LatLng, includesNonCommercial: boolean): string {
  return `${API}?${query([...filters(center, includesNonCommercial), ["limit", "0"], ["facet", "speciesKey"], ["facetLimit", String(FACET_LIMIT)]])}`;
}
