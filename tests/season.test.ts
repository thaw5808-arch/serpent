import { describe, expect, it, vi } from "vitest";
import { MIN_SEASON_RECORDS, monthStanding, seasonPattern } from "@/lib/season";
import { monthName } from "@/i18n/format";
import type { NearbySnake, NearbySnakes } from "@/services/nearMe/classify";
import { GbifUnavailableError } from "@/services/nearMe/gbif";
import { dangerousForSeason, getSeason, parseMonthFacet, seasonCacheKey, type CachedSeason, type SeasonStore } from "@/services/nearMe/season";

const point = { lat: 13.8, lng: 100.5 };

/** A GBIF search response with a month facet. */
const facetResponse = (counts: Record<number, number>) => ({
  count: Object.values(counts).reduce((a, b) => a + b, 0),
  results: [],
  facets: [{ field: "MONTH", counts: Object.entries(counts).map(([name, count]) => ({ name, count })) }],
});

function row(over: Partial<NearbySnake>): NearbySnake {
  return {
    id: "x", kind: "species", commonName: null, scientificName: "X y", venomStatus: "venomous", venomBasis: "species",
    venomGroup: null, medicalRisk: "high", dangerous: true, href: null, records: 1, lastYear: 2024, gbifKeys: [1], ...over,
  };
}

describe("season: peak months", () => {
  it("peaks are months with at least 1.25× the monthly average, in calendar order", () => {
    // total 240, average 20: 25 is exactly 1.25×, 24 is not.
    const months = [10, 10, 10, 25, 40, 24, 21, 20, 20, 20, 20, 20];
    const p = seasonPattern(months);
    expect(p).toMatchObject({ kind: "peaks", total: 240, average: 20, peaks: [4, 5] });
  });

  it("keeps at most the 4 busiest peak months", () => {
    const months = [50, 60, 70, 80, 90, 0, 0, 0, 0, 0, 0, 0];
    const p = seasonPattern(months);
    expect(p.kind === "peaks" && p.peaks).toEqual([2, 3, 4, 5]);
  });

  it("says records are spread evenly when no month reaches 1.25× the average", () => {
    expect(seasonPattern([10, 11, 9, 12, 10, 10, 11, 9, 10, 12, 10, 10]).kind).toBe("even");
  });

  it("shows no pattern under 30 records", () => {
    expect(seasonPattern([0, 0, 0, 29, 0, 0, 0, 0, 0, 0, 0, 0])).toEqual({ kind: "not_enough", total: 29 });
    expect(seasonPattern([0, 0, 0, MIN_SEASON_RECORDS, 0, 0, 0, 0, 0, 0, 0, 0]).kind).toBe("peaks");
  });

  it("rates a month for the home card, never without enough records", () => {
    const months = [10, 10, 10, 25, 40, 24, 21, 20, 20, 20, 20, 20];
    expect(monthStanding(months, 5)).toBe("busy");
    expect(monthStanding(months, 1)).toBe("quieter");
    expect(monthStanding(months, 6)).toBe("average");
    expect(monthStanding(Array(12).fill(1), 5)).toBeNull();
  });
});

describe("season: GBIF month facet", () => {
  it("reads counts by month and treats missing months as 0", () => {
    expect(parseMonthFacet(facetResponse({ 1: 5, 4: 12, 12: 3 }))).toEqual([5, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 3]);
  });

  it("ignores other facets, bad month names and bad counts", () => {
    const res = {
      facets: [
        { field: "YEAR", counts: [{ name: "2020", count: 99 }] },
        { field: "MONTH", counts: [{ name: "13", count: 4 }, { name: "0", count: 4 }, { name: "x", count: 4 }, { name: "2", count: -1 }, { name: "3", count: 7 }] },
      ],
    };
    expect(parseMonthFacet(res)).toEqual([0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("returns 12 zeros for an empty or malformed answer", () => {
    for (const r of [null, {}, { facets: [] }, { facets: "nope" }, { facets: [{ field: "MONTH", counts: null }] }]) {
      expect(parseMonthFacet(r)).toEqual(Array(12).fill(0));
    }
  });
});

describe("season: dangerous series", () => {
  it("counts only high and very high risk species, at most 8, with every GBIF key behind them", () => {
    const snakes: NearbySnakes = {
      dangerous: [
        row({ commonName: "Malayan Krait", medicalRisk: "very_high", gbifKeys: [1, 2] }),
        row({ commonName: "White-lipped Pit Viper", medicalRisk: "moderate", gbifKeys: [3] }),
        ...Array.from({ length: 9 }, (_, i) => row({ commonName: `Cobra ${i}`, gbifKeys: [10 + i] })),
      ],
      other: [],
    };
    const d = dangerousForSeason(snakes);
    expect(d.names).toHaveLength(8);
    expect(d.names).not.toContain("White-lipped Pit Viper");
    expect(d.keys).toEqual([1, 2, 10, 11, 12, 13, 14, 15, 16]);
  });
});

/** A fake GBIF: the all-snakes query has the family taxonKeys; the dangerous one only species keys. */
function fakeGbif() {
  const urls: string[] = [];
  const fetch = vi.fn(async (url: string) => {
    urls.push(url);
    const keys = new URL(url).searchParams.getAll("taxonKey");
    const body = keys.includes("9455") ? facetResponse({ 3: 20, 4: 30, 5: 10 }) : facetResponse({ 4: 6 });
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { fetch, urls };
}

function memoryStore(): SeasonStore & { rows: Map<string, { season: CachedSeason; fetchedAt: Date }> } {
  const rows = new Map<string, { season: CachedSeason; fetchedAt: Date }>();
  return {
    rows,
    async get(p, key) {
      return rows.get(`${p.lat},${p.lng},${key}`) ?? null;
    },
    async put(p, key, _city, season, fetchedAt) {
      rows.set(`${p.lat},${p.lng},${key}`, { season, fetchedAt });
    },
  };
}

const sightings = async (): Promise<NearbySnakes> => ({ dangerous: [row({ commonName: "Malayan Krait", gbifKeys: [42] })], other: [] });

describe("season: lookup and cache", () => {
  it("asks GBIF for month counts only, with the Near me filters, and repeated taxonKeys for dangerous species", async () => {
    const gbif = fakeGbif();
    const s = await getSeason(point, "Bangkok", { sightings, store: null, fetch: gbif.fetch, includesNonCommercial: false });
    expect(s.months).toEqual([0, 0, 20, 30, 10, 0, 0, 0, 0, 0, 0, 0]);
    expect(s.total).toBe(60);
    expect(s.dangerous).toEqual({ months: [0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0], total: 6, species: ["Malayan Krait"] });
    for (const url of gbif.urls) {
      const q = new URL(url).searchParams;
      expect(q.get("limit")).toBe("0");
      expect(q.get("facet")).toBe("month");
      expect(q.get("facetLimit")).toBe("12");
      expect(q.get("geoDistance")).toBe("13.8,100.5,50km");
      expect(q.getAll("license")).toEqual(["CC0_1_0", "CC_BY_4_0"]);
    }
    const danger = gbif.urls.map((u) => new URL(u).searchParams.getAll("taxonKey")).find((k) => !k.includes("9455"));
    expect(danger).toEqual(["42"]);
  });

  it("includes CC BY-NC records only when GBIF_INCLUDE_NC is on, and caches them separately", async () => {
    const gbif = fakeGbif();
    const store = memoryStore();
    await getSeason(point, "Bangkok", { sightings, store, fetch: gbif.fetch, includesNonCommercial: true });
    expect(new URL(gbif.urls[0]).searchParams.getAll("license")).toEqual([]);
    expect([...store.rows.keys()]).toEqual([`13.8,100.5,${seasonCacheKey("all")}`]);
  });

  it("uses the cache on the second call, for 7 days", async () => {
    const gbif = fakeGbif();
    const store = memoryStore();
    const now = new Date("2026-10-01T00:00:00Z");
    const first = await getSeason(point, "Bangkok", { sightings, store, fetch: gbif.fetch, now, includesNonCommercial: false });
    const calls = gbif.fetch.mock.calls.length;
    const second = await getSeason(point, "Bangkok", { sightings, store, fetch: gbif.fetch, now: new Date("2026-10-07T23:00:00Z"), includesNonCommercial: false });
    expect(gbif.fetch.mock.calls.length).toBe(calls);
    expect(first.cached).toBe(false);
    expect(second).toMatchObject({ cached: true, months: first.months, dangerous: first.dangerous });
    await getSeason(point, "Bangkok", { sightings, store, fetch: gbif.fetch, now: new Date("2026-10-08T01:00:00Z"), includesNonCommercial: false });
    expect(gbif.fetch.mock.calls.length).toBeGreaterThan(calls);
  });

  it("times out and fails gracefully", async () => {
    const hang = vi.fn(() => new Promise<Response>(() => {}));
    await expect(getSeason(point, "Bangkok", { sightings, store: null, fetch: hang, timeoutMs: 20 })).rejects.toBeInstanceOf(GbifUnavailableError);
  });

  it("still shows all snakes when the dangerous series can't load, and doesn't cache that", async () => {
    const gbif = fakeGbif();
    const store = memoryStore();
    const s = await getSeason(point, "Bangkok", { sightings: () => Promise.reject(new Error("GBIF down")), store, fetch: gbif.fetch, includesNonCommercial: false });
    expect(s.total).toBe(60);
    expect(s.dangerous).toBeNull();
    expect(store.rows.size).toBe(0);
  });
});

describe("season: month names", () => {
  it("come from Intl in each language", () => {
    expect(monthName(1, "en")).toBe("January");
    expect(monthName(9, "en", "short")).toBe("Sep");
    expect(monthName(1, "th")).toBe("มกราคม");
    expect(monthName(1, "my")).toBe("ဇန်နဝါရီ");
  });
});
