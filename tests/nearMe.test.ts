import { beforeEach, describe, expect, it, vi } from "vitest";
import { roundCoord, roundedPoint } from "@/lib/geo";
import { classifyArea, classifySpecies } from "@/services/nearMe/classify";
import { fetchArea, GbifUnavailableError, SNAKE_FAMILY_KEYS, type GbifSpecies } from "@/services/nearMe/gbif";
import { GeocoderUnavailableError, nearestPlace, searchPlaces } from "@/services/nearMe/geocoder";
import { CACHE_DAYS, EMPTY_CACHE_DAYS, getSightings, type CachedArea, type SightingStore } from "@/services/nearMe";
import en from "../messages/en.json";
import th from "../messages/th.json";
import my from "../messages/my.json";
import { FORBIDDEN } from "./forbidden";

const sp = (name: string, records = 1, extra: Partial<GbifSpecies> = {}): GbifSpecies => ({
  speciesKey: Math.abs([...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)),
  name,
  genus: name.split(" ")[0],
  family: null,
  records,
  lastYear: 2025,
  ...extra,
});

describe("matching GBIF names to our data", () => {
  it("a curated species takes venom status and risk from our catalog", () => {
    expect(classifySpecies(sp("Bungarus candidus", 4))).toMatchObject({
      kind: "species",
      id: "malayan-krait",
      commonName: "Malayan Krait",
      venomStatus: "venomous",
      medicalRisk: "very_high",
      dangerous: true,
      href: "/species/malayan-krait",
      records: 4,
    });
  });

  it("a GBIF synonym reaches the same curated species", () => {
    expect(classifySpecies(sp("Python reticulatus"))).toMatchObject({ kind: "species", id: "reticulated-python" });
  });

  it("a recognised species outside the catalog takes venom from its genus group", () => {
    expect(classifySpecies(sp("Trimeresurus macrops"))).toMatchObject({
      kind: "taxonomy",
      id: "trimeresurus-macrops",
      scientificName: "Trimeresurus macrops",
      venomStatus: "venomous",
      venomBasis: "genus",
      venomGroup: { name: "Trimeresurus", rank: "genus" },
      dangerous: true,
      href: "/species/trimeresurus-macrops",
    });
  });

  it("an unrecognised species in a venomous genus is venomous at genus level", () => {
    expect(classifySpecies(sp("Bungarus notarealis"))).toMatchObject({
      kind: "group",
      commonName: null,
      scientificName: "Bungarus notarealis",
      venomStatus: "venomous",
      venomGroup: { name: "Bungarus", rank: "genus" },
      dangerous: true,
      href: null,
    });
  });

  it("a recognised species with no venom group is not assessed (potentially venomous), not reassuring", () => {
    expect(classifySpecies(sp("Ptyas mucosa"))).toMatchObject({ kind: "taxonomy", venomStatus: null, venomBasis: "not_assessed", medicalRisk: null, dangerous: false });
  });

  it("a name we can't match at all is not assessed", () => {
    expect(classifySpecies(sp("Fakeus snakeus"))).toMatchObject({ kind: "unresolved", venomStatus: null, venomBasis: "unresolved", medicalRisk: null, href: null });
  });

  it("GBIF never decides venom: only names, records and years are read", () => {
    // Whatever GBIF puts in genus/family, our genus group still decides.
    expect(classifySpecies(sp("Bungarus notarealis", 1, { family: "Colubridae" })).venomStatus).toBe("venomous");
  });
});

describe("sorting", () => {
  const area = classifyArea([
    sp("Malayopython reticulatus", 900), // curated non-venomous
    sp("Trimeresurus albolabris", 500), // curated venomous, moderate
    sp("Naja kaouthia", 40), // high
    sp("Bungarus candidus", 3), // very high
    sp("Daboia siamensis", 10), // very high
    sp("Fakeus snakeus", 50), // not assessed
    sp("Chrysopelea ornata", 70), // mildly venomous
  ]);

  it("venomous snakes are listed first, by medical risk (very high first), then by records", () => {
    expect(area.dangerous.map((r) => r.scientificName)).toEqual(["Daboia siamensis", "Bungarus candidus", "Naja kaouthia", "Trimeresurus albolabris"]);
  });

  it("everything else follows by records, the unmatched one included", () => {
    expect(area.other.map((r) => r.scientificName)).toEqual(["Malayopython reticulatus", "Chrysopelea ornata", "Fakeus snakeus"]);
  });

  it("an unknown risk never sinks a venomous snake below known moderate ones", () => {
    const { dangerous } = classifyArea([sp("Trimeresurus albolabris", 999), sp("Bungarus notarealis", 1)]);
    const group = dangerous.find((r) => r.kind === "group")!;
    if (group.medicalRisk === "unknown") expect(dangerous[0]).toBe(group);
    else expect(["very_high", "high"]).toContain(group.medicalRisk);
  });

  it("GBIF names that are one of our species are added together", () => {
    const { other } = classifyArea([sp("Malayopython reticulatus", 5, { lastYear: 2019 }), sp("Python reticulatus", 2, { lastYear: 2024 })]);
    expect(other).toHaveLength(1);
    expect(other[0]).toMatchObject({ id: "reticulated-python", records: 7, lastYear: 2024 });
  });
});

describe("coordinate rounding", () => {
  it("rounds to 0.1° (about 11 km)", () => {
    expect(roundCoord(13.7563)).toBe(13.8);
    expect(roundCoord(100.5018)).toBe(100.5);
    expect(roundCoord(-33.8688)).toBe(-33.9);
    expect(Object.is(roundCoord(-0.04), 0)).toBe(true);
  });

  it("accepts numbers or strings in range, rejects anything else", () => {
    expect(roundedPoint("18.7883", "98.9853")).toEqual({ lat: 18.8, lng: 99 });
    for (const [lat, lng] of [["", "1"], ["91", "0"], ["0", "181"], ["NaN", "0"], [null, null], ["1e400", "0"]]) {
      expect(roundedPoint(lat, lng), `${lat},${lng}`).toBeNull();
    }
  });
});

/** A fake api.gbif.org: one overview facet, then one detail per species. */
function fakeGbif(species: { key: number; name: string; count: number; years: number[] }[], opts: { failDetail?: number } = {}) {
  const calls: URL[] = [];
  const fetch = vi.fn(async (url: string) => {
    const u = new URL(url);
    calls.push(u);
    const key = u.searchParams.get("speciesKey");
    if (!key) {
      return Response.json({
        count: species.reduce((n, s) => n + s.count, 0),
        results: [],
        facets: [
          { field: "SPECIES_KEY", counts: species.map((s) => ({ name: String(s.key), count: s.count })) },
          { field: "LICENSE", counts: [{ name: "CC_BY_4_0", count: 3 }] },
        ],
      });
    }
    if (Number(key) === opts.failDetail) return new Response("broken", { status: 500 });
    const s = species.find((x) => x.key === Number(key))!;
    return Response.json({
      count: s.count,
      results: [{ species: s.name, genus: s.name.split(" ")[0], family: "Elapidae" }],
      facets: [{ field: "YEAR", counts: s.years.map((y) => ({ name: String(y), count: 1 })) }],
    });
  });
  return { fetch, calls };
}

const BANGKOK = { lat: 13.8, lng: 100.5 };
const KRAIT = { key: 1, name: "Bungarus candidus", count: 3, years: [2019, 2024, 2021] };
const PYTHON = { key: 2, name: "Malayopython reticulatus", count: 9, years: [2025] };

describe("GBIF query", () => {
  it("uses the required filters and facets instead of downloading records", async () => {
    const { fetch, calls } = fakeGbif([KRAIT]);
    await fetchArea(BANGKOK, { fetch, includesNonCommercial: false });
    const overview = calls[0].searchParams;
    expect(overview.get("geoDistance")).toBe("13.8,100.5,50km");
    expect(overview.get("hasCoordinate")).toBe("true");
    expect(overview.get("hasGeospatialIssue")).toBe("false");
    expect(overview.get("occurrenceStatus")).toBe("PRESENT");
    expect(overview.getAll("basisOfRecord")).toEqual(["HUMAN_OBSERVATION", "PRESERVED_SPECIMEN", "MACHINE_OBSERVATION"]);
    expect(overview.get("year")).toBe("1990,*");
    expect(overview.get("limit")).toBe("0");
    expect(overview.getAll("facet")).toContain("speciesKey");
    expect(overview.getAll("taxonKey").map(Number)).toEqual(Object.values(SNAKE_FAMILY_KEYS));
    // Without GBIF_INCLUDE_NC, only openly licensed records.
    expect(overview.getAll("license")).toEqual(["CC0_1_0", "CC_BY_4_0"]);
  });

  it("includes CC BY-NC records only when allowed", async () => {
    const { fetch, calls } = fakeGbif([KRAIT]);
    const area = await fetchArea(BANGKOK, { fetch, includesNonCommercial: true });
    expect(calls[0].searchParams.getAll("license")).toEqual([]);
    expect(area.includesNonCommercial).toBe(true);
  });

  it("reads each species' name and most recent year", async () => {
    const { fetch } = fakeGbif([KRAIT, PYTHON]);
    const area = await fetchArea(BANGKOK, { fetch, includesNonCommercial: false });
    expect(area.species).toEqual([
      { speciesKey: 1, name: "Bungarus candidus", genus: "Bungarus", family: "Elapidae", records: 3, lastYear: 2024 },
      { speciesKey: 2, name: "Malayopython reticulatus", genus: "Malayopython", family: "Elapidae", records: 9, lastYear: 2025 },
    ]);
    expect(area.licenses).toEqual({ CC_BY_4_0: 3 });
    expect(area.queryUrl).toMatch(/^https:\/\/api\.gbif\.org\/v1\/occurrence\/search\?/);
  });

  it("fails as a whole if any species can't be read, so none is silently missing", async () => {
    const { fetch } = fakeGbif([KRAIT, PYTHON], { failDetail: 1 });
    await expect(fetchArea(BANGKOK, { fetch })).rejects.toBeInstanceOf(GbifUnavailableError);
  });

  it("waits and retries when GBIF says too many requests (429), honouring Retry-After", async () => {
    const real = fakeGbif([KRAIT]);
    let refusals = 2;
    const fetch = vi.fn(async (url: string) =>
      refusals-- > 0 ? new Response("slow down", { status: 429, headers: { "Retry-After": "2" } }) : real.fetch(url),
    );
    const waits: number[] = [];
    const area = await fetchArea(BANGKOK, { fetch, sleep: async (ms) => void waits.push(ms) });
    expect(area.species).toHaveLength(1);
    expect(waits).toEqual([2000, 2000]);
  });

  it("gives up after a few retries, so a busy GBIF shows the 'couldn't load' message", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 429 }));
    const waits: number[] = [];
    await expect(fetchArea(BANGKOK, { fetch, sleep: async (ms) => void waits.push(ms) })).rejects.toBeInstanceOf(GbifUnavailableError);
    expect(waits).toEqual([1000, 2000, 4000]);
  });

  it("retries a timeout or dropped connection, then reports GbifUnavailableError if it persists", async () => {
    const real = fakeGbif([KRAIT]);
    let drops = 1;
    const flaky = vi.fn(async (url: string) => {
      if (drops-- > 0) throw new DOMException("The operation timed out.", "TimeoutError");
      return real.fetch(url);
    });
    expect((await fetchArea(BANGKOK, { fetch: flaky, sleep: async () => {} })).species).toHaveLength(1);

    const down = vi.fn(async () => { throw new TypeError("fetch failed"); });
    await expect(fetchArea(BANGKOK, { fetch: down, sleep: async () => {} })).rejects.toThrow(/GBIF request failed \(TypeError: fetch failed\)/);
    expect(down).toHaveBeenCalledTimes(4);
  });
});

/** An in-memory cache store. */
function memoryStore() {
  const rows = new Map<string, CachedArea>();
  const store: SightingStore & { rows: typeof rows } = {
    rows,
    get: vi.fn(async (p, scope) => rows.get(`${p.lat},${p.lng},${scope}`) ?? null),
    put: vi.fn(async (p, scope, cityName, area, fetchedAt) => void rows.set(`${p.lat},${p.lng},${scope}`, { area, cityName, fetchedAt })),
  };
  return store;
}

const day = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * 86_400_000);

describe("cache", () => {
  let store: ReturnType<typeof memoryStore>;
  beforeEach(() => {
    store = memoryStore();
  });

  it("miss: queries GBIF and stores the rounded point, place name and answer", async () => {
    const { fetch } = fakeGbif([KRAIT]);
    const r = await getSightings(BANGKOK, "Bangkok", { store, fetch, now: day(0), includesNonCommercial: false });
    expect(r.cached).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.put).toHaveBeenCalledWith(BANGKOK, "open", "Bangkok", expect.objectContaining({ totalRecords: 3 }), day(0));
    expect(r.dangerous.map((s) => s.id)).toEqual(["malayan-krait"]);
  });

  it(`hit within ${CACHE_DAYS} days: no GBIF request, same answer`, async () => {
    const first = fakeGbif([KRAIT]);
    await getSightings(BANGKOK, "Bangkok", { store, fetch: first.fetch, now: day(0), includesNonCommercial: false });
    const second = fakeGbif([KRAIT]);
    const r = await getSightings(BANGKOK, "Krung Thep", { store, fetch: second.fetch, now: day(CACHE_DAYS - 1), includesNonCommercial: false });
    expect(second.fetch).not.toHaveBeenCalled();
    expect(r).toMatchObject({ cached: true, fetchedAt: day(0).toISOString() });
    expect(r.dangerous.map((s) => s.id)).toEqual(["malayan-krait"]);
  });

  it(`stale after ${CACHE_DAYS} days: queries GBIF again`, async () => {
    await getSightings(BANGKOK, "Bangkok", { store, fetch: fakeGbif([KRAIT]).fetch, now: day(0), includesNonCommercial: false });
    const again = fakeGbif([KRAIT, PYTHON]);
    const r = await getSightings(BANGKOK, "Bangkok", { store, fetch: again.fetch, now: day(CACHE_DAYS), includesNonCommercial: false });
    expect(again.fetch).toHaveBeenCalled();
    expect(r.cached).toBe(false);
    expect(r.other.map((s) => s.id)).toEqual(["reticulated-python"]);
  });

  it(`an empty answer is re-checked after ${EMPTY_CACHE_DAYS} days`, async () => {
    await getSightings(BANGKOK, "Bangkok", { store, fetch: fakeGbif([]).fetch, now: day(0), includesNonCommercial: false });
    const soon = fakeGbif([]);
    expect((await getSightings(BANGKOK, "Bangkok", { store, fetch: soon.fetch, now: day(EMPTY_CACHE_DAYS - 1), includesNonCommercial: false })).cached).toBe(true);
    const later = fakeGbif([KRAIT]);
    expect((await getSightings(BANGKOK, "Bangkok", { store, fetch: later.fetch, now: day(EMPTY_CACHE_DAYS), includesNonCommercial: false })).cached).toBe(false);
  });

  it("licence scope is part of the key: an open-only answer isn't reused when CC BY-NC is allowed", async () => {
    await getSightings(BANGKOK, "Bangkok", { store, fetch: fakeGbif([KRAIT]).fetch, now: day(0), includesNonCommercial: false });
    const all = fakeGbif([KRAIT]);
    await getSightings(BANGKOK, "Bangkok", { store, fetch: all.fetch, now: day(1), includesNonCommercial: true });
    expect(all.fetch).toHaveBeenCalled();
    expect([...store.rows.keys()]).toEqual(["13.8,100.5,open", "13.8,100.5,all"]);
  });

  it("re-classifies cached counts with today's data (the cache holds GBIF counts, not venom status)", async () => {
    await getSightings(BANGKOK, "Bangkok", { store, fetch: fakeGbif([KRAIT]).fetch, now: day(0), includesNonCommercial: false });
    const row = [...store.rows.values()][0];
    expect(JSON.stringify(row.area)).not.toMatch(/venom|risk/i);
  });

  it("GBIF failing: nothing is cached and the error reaches the route", async () => {
    const { fetch } = fakeGbif([KRAIT], { failDetail: 1 });
    await expect(getSightings(BANGKOK, "Bangkok", { store, fetch, now: day(0) })).rejects.toBeInstanceOf(GbifUnavailableError);
    expect(store.put).not.toHaveBeenCalled();
  });

  it("a broken cache never blocks a search", async () => {
    const broken: SightingStore = { get: async () => { throw new Error("db down"); }, put: async () => { throw new Error("db down"); } };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await getSightings(BANGKOK, "Bangkok", { store: broken, fetch: fakeGbif([KRAIT]).fetch, now: day(0) });
    expect(r.dangerous).toHaveLength(1);
    spy.mockRestore();
  });

  it("two searches for the same area at once make one GBIF lookup", async () => {
    const { fetch } = fakeGbif([KRAIT]);
    await Promise.all([1, 2].map(() => getSightings(BANGKOK, "Bangkok", { store: null, fetch, now: day(0), includesNonCommercial: false })));
    expect(fetch).toHaveBeenCalledTimes(2); // one overview + one species, not twice that
  });
});

describe("geocoder (Photon)", () => {
  const feature = (name: string, lng: number, lat: number, cc = "th") => ({
    geometry: { coordinates: [lng, lat] },
    properties: { name, state: "Chiang Mai Province", country: "Thailand", countrycode: cc },
  });

  it("returns places with rounded coordinates and upper-case country codes, without duplicates", async () => {
    const fetch = vi.fn(async (url: string) => {
      const u = new URL(url);
      expect(u.searchParams.get("layer")).toBe("city");
      expect(u.searchParams.get("lang")).toBe("default"); // Photon has no Thai; local names instead
      return Response.json({ features: [feature("Chiang Mai", 98.9858802, 18.7882778), feature("Chiang Mai", 98.98, 18.79), feature("", 1, 1)] });
    });
    expect(await searchPlaces("chiang", "th", fetch)).toEqual([
      { name: "Chiang Mai", region: "Chiang Mai Province", country: "Thailand", countryCode: "TH", lat: 18.8, lng: 99 },
    ]);
  });

  it("reverse lookup names the nearest town, or null", async () => {
    expect(await nearestPlace(13.8, 100.5, "en", async () => Response.json({ features: [feature("Bang Kruai", 100.477, 13.803)] }))).toMatchObject({
      name: "Bang Kruai",
      lat: 13.8,
      lng: 100.5,
    });
    expect(await nearestPlace(0, 0, "en", async () => Response.json({ features: [] }))).toBeNull();
  });

  it("errors become GeocoderUnavailableError", async () => {
    await expect(searchPlaces("bangkok", "en", async () => new Response("", { status: 429 }))).rejects.toBeInstanceOf(GeocoderUnavailableError);
    await expect(searchPlaces("bangkok", "en", async () => { throw new TypeError("offline"); })).rejects.toBeInstanceOf(GeocoderUnavailableError);
  });
});

describe("near-me wording", () => {
  it.each([["en", en], ["th", th], ["my", my]] as const)("%s: no reassuring words", (locale, dict) => {
    const values = Object.entries(dict.nearMe).map(([k, v]) => `${k}: ${v}`);
    expect(values.filter((v) => FORBIDDEN[locale].test(v))).toEqual([]);
  });

  it("the unmatched label says to treat it as potentially venomous", () => {
    expect(en.nearMe.notAssessed).toBe("Not assessed — treat as potentially venomous");
  });
});
