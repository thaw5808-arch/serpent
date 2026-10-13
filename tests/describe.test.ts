import { describe, expect, it, vi } from "vitest";
import { NOT_SURE, informativeCount, tooVague, type Description } from "@/lib/describe";
import { DescribeService, answersText, buildPool, poolText, type SightingsLookup } from "@/services/describe";
import { DescriptionSchema } from "@/services/describe/schema";
import { decideDescription, worstRisk } from "@/services/safetyService";
import { DescribeOutputSchema, type DescribeInput, type DescribeOutput, type VisionProvider } from "@/services/providers/types";
import type { DescriptionResult } from "@/types";

const meta = { id: "d1", analyzedAt: "2026-01-01T00:00:00.000Z" };

const BANGKOK = { name: "Bangkok", region: "Bangkok", country: "Thailand", countryCode: "TH", lat: 13.8, lng: 100.5 };

/** A full, informative description; override what a test needs. */
function desc(over: Partial<Description> = {}): Description {
  return {
    place: BANGKOK,
    colours: ["black", "white_cream"],
    pattern: "bands",
    head: "same_as_neck",
    size: "1m_2m",
    setting: "building",
    time: "night",
    behaviour: [],
    ...over,
  };
}

const out = (...candidates: [string, number][]): DescribeOutput => ({
  candidates: candidates.map(([scientific_name, match_score]) => ({ scientific_name, match_score, why: "Fits the answers." })),
});

const decide = (output: DescribeOutput | null, d = desc()) => decideDescription({ description: d, output, pool: "nearby", country: "TH" });

/** Every way a description result could reassure, which it must never do. */
function expectNeverReassuring(r: Pick<DescriptionResult, "displayVenomStatus" | "overallRisk" | "safety">) {
  expect(r.displayVenomStatus).toBe("potentially_venomous");
  expect(["non_venomous", "mildly_venomous", "unknown"]).not.toContain(r.displayVenomStatus);
  expect(r.overallRisk).not.toBe("low");
  expect(r.safety.treatAsDangerous).toBe(true);
}

describe("describe: worst-risk rule", () => {
  it("the overall risk is the worst among all candidates, not the top match's", () => {
    // The best fit is a harmless-listed species; a lower-scored candidate is very high risk.
    const r = decide(out(["Lycodon laoensis", 0.8], ["Bungarus candidus", 0.4]));
    expect(r.candidates[0].scientificName).toBe("Lycodon laoensis");
    expect(r.candidates[0].medicalRisk).toBe("low");
    expect(r.overallRisk).toBe("very_high");
  });

  it("ranks an unknown or not-assessed risk above a known moderate one", () => {
    expect(worstRisk(["moderate", null])).toBe("unknown");
    expect(worstRisk(["moderate", "low"])).toBe("moderate");
    expect(worstRisk(["high", "unknown", "very_high"])).toBe("very_high");
    expect(worstRisk([])).toBe("unknown");
  });

  it("a high or very high risk candidate anywhere in the list makes the result dangerous", () => {
    expect(decide(out(["Lycodon laoensis", 0.9], ["Naja kaouthia", 0.2])).dangerous).toBe(true);
    expect(decide(out(["Lycodon laoensis", 0.9], ["Trimeresurus albolabris", 0.2])).dangerous).toBe(false);
  });

  it("uses the genus fallback for recognised species that aren't reviewed", () => {
    const r = decide(out(["Bungarus multicinctus", 0.7]));
    expect(r.candidates[0]).toMatchObject({ kind: "taxonomy", venomBasis: "genus", venomStatus: "venomous" });
    expect(r.candidates[0].venomGroup?.name).toBe("Bungarus");
    expect(r.dangerous).toBe(true);
  });
});

describe("describe: never non-venomous or low risk overall", () => {
  it("only non-venomous candidates still give 'potentially venomous' and never 'low'", () => {
    const r = decide(out(["Lycodon laoensis", 0.9], ["Fowlea piscator", 0.5], ["Malayopython reticulatus", 0.3]));
    expect(r.candidates.every((c) => c.venomStatus === "non_venomous")).toBe(true);
    expectNeverReassuring(r);
    expect(r.overallRisk).toBe("unknown");
    expect(r.dangerous).toBe(false);
  });

  it("holds for every status, including failures", () => {
    for (const r of [
      decide(out(["Lycodon laoensis", 0.95])),
      decide(out(["Ahaetulla prasina", 0.95])),
      decide(out()),
      decide(null),
      decide(out(["Bungarus candidus", 0.5]), desc({ pattern: NOT_SURE, head: NOT_SURE, size: NOT_SURE, setting: NOT_SURE })),
    ]) {
      expectNeverReassuring(r);
    }
  });
});

describe("describe: unknown fallback", () => {
  const vague = desc({ colours: NOT_SURE, pattern: NOT_SURE, head: NOT_SURE, size: NOT_SURE, time: "night" });

  it("counts mostly 'Not sure' as too vague", () => {
    expect(informativeCount(vague)).toBe(2);
    expect(tooVague(vague)).toBe(true);
    expect(tooVague(desc())).toBe(false);
  });

  it("mostly 'Not sure' is 'not enough detail', even if the model named a species", () => {
    const r = decide(out(["Bungarus candidus", 0.9]), vague);
    expect(r.status).toBe("not_enough_detail");
    expect(r.candidates).toEqual([]);
  });

  it("an empty answer from the model is 'not enough detail'", () => {
    expect(decide(out()).status).toBe("not_enough_detail");
  });

  it("does not call the model at all when the answers are mostly 'Not sure'", async () => {
    const describeCall = vi.fn();
    const sightings = vi.fn();
    const s = new DescribeService({ name: "fake", model: "f", analyze: vi.fn(), describe: describeCall }, { sightings });
    const r = await s.describe(vague, meta);
    expect(r.status).toBe("not_enough_detail");
    expect(describeCall).not.toHaveBeenCalled();
    expect(sightings).not.toHaveBeenCalled();
  });

  it("a provider failure is 'service unavailable', never a made-up result", async () => {
    const s = new DescribeService(
      { name: "fake", model: "f", analyze: vi.fn(), describe: () => Promise.reject(new Error("down")) },
      { sightings: async () => null },
    );
    await expect(s.describe(desc(), meta)).rejects.toThrow("down"); // non-provider errors surface
    const unavailable = new DescribeService(
      { name: "fake", model: "f", analyze: vi.fn(), describe: async () => ({ candidates: "Bungarus" }) },
      { sightings: async () => null },
    );
    const r = await unavailable.describe(desc(), meta);
    expect(r.status).toBe("service_unavailable");
    expect(r.candidates).toEqual([]);
    expectNeverReassuring(r);
  });
});

describe("describe: only species in our taxonomy", () => {
  it("drops invented names, genus-only names and non-snakes", () => {
    const r = decide(out(["Bungarus fantasticus", 0.9], ["Naja", 0.8], ["Felis catus", 0.7], ["Naja kaouthia", 0.4]));
    expect(r.candidates.map((c) => c.scientificName)).toEqual(["Naja kaouthia"]);
  });

  it("only invented names leave nothing usable: 'not enough detail'", () => {
    const r = decide(out(["Bungarus fantasticus", 0.9], ["Serpentus imaginarius", 0.5]));
    expect(r.status).toBe("not_enough_detail");
  });

  it("merges duplicates, keeps at most 5 and orders by fit", () => {
    const r = decide(
      out(
        ["Naja kaouthia", 0.3],
        ["Naja kaouthia", 0.2],
        ["Bungarus candidus", 0.6],
        ["Bungarus fasciatus", 0.5],
        ["Ophiophagus hannah", 0.4],
        ["Daboia siamensis", 0.35],
        ["Lycodon laoensis", 0.1],
      ),
    );
    expect(r.candidates.map((c) => c.scientificName)).toEqual([
      "Bungarus candidus",
      "Bungarus fasciatus",
      "Ophiophagus hannah",
      "Daboia siamensis",
      "Naja kaouthia",
    ]);
  });
});

describe("describe: zod validation", () => {
  it("rejects malformed model output", () => {
    const bad: unknown[] = [
      "Bungarus candidus",
      null,
      {},
      { candidates: "Bungarus candidus" },
      { candidates: [{ scientific_name: "Bungarus candidus", match_score: 1.4, why: "x" }] },
      { candidates: [{ scientific_name: "Bungarus candidus", match_score: 0.5 }] },
      { candidates: [{ scientific_name: "Bungarus candidus", match_score: "high", why: "x" }] },
      { candidates: [{ scientific_name: "", match_score: 0.5, why: "x" }] },
      { candidates: Array.from({ length: 6 }, () => ({ scientific_name: "Naja kaouthia", match_score: 0.1, why: "x" })) },
    ];
    for (const b of bad) expect(DescribeOutputSchema.safeParse(b).success, JSON.stringify(b)).toBe(false);
    expect(DescribeOutputSchema.safeParse(out(["Naja kaouthia", 0.5])).success).toBe(true);
  });

  it("rejects invalid answers", () => {
    expect(DescriptionSchema.safeParse(desc()).success).toBe(true);
    expect(DescriptionSchema.safeParse(desc({ place: null, behaviour: NOT_SURE })).success).toBe(true);
    for (const bad of [
      { ...desc(), colours: ["black", "brown", "grey", "green"] },
      { ...desc(), colours: [] },
      { ...desc(), colours: ["purple"] },
      { ...desc(), pattern: "polka dots" },
      { ...desc(), place: { ...BANGKOK, lat: 200 } },
      { ...desc(), place: { ...BANGKOK, countryCode: "Thailand" } },
      { ...desc(), time: undefined },
    ]) {
      expect(DescriptionSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("describe: candidate pool", () => {
  it("uses snakes recorded near the place, plus the reviewed catalog", async () => {
    const sightings: SightingsLookup = async () => ({
      dangerous: [],
      other: [{ id: "x", kind: "taxonomy", commonName: "Some Snake", scientificName: "Lycodon subcinctus", venomStatus: null, venomBasis: "not_assessed", venomGroup: null, medicalRisk: null, dangerous: false, href: null, records: 3, lastYear: 2020 }],
    });
    const pool = await buildPool(BANGKOK, sightings);
    expect(pool.kind).toBe("nearby");
    expect(pool.names.map((n) => n.name)).toEqual(expect.arrayContaining(["Lycodon subcinctus", "Bungarus candidus", "Pantherophis guttatus"]));
  });

  it("falls back to the place's country when sightings are unavailable", async () => {
    const pool = await buildPool(BANGKOK, async () => {
      throw new Error("GBIF down");
    });
    expect(pool.kind).toBe("country");
    expect(pool.names.some((n) => n.genus === "Bungarus")).toBe(true);
  });

  it("uses every recognised species when no place is given", async () => {
    const pool = await buildPool(null);
    expect(pool.kind).toBe("everywhere");
    expect(pool.names.length).toBeGreaterThan(4000);
  });

  it("sends names grouped by genus, and the answers in plain English", () => {
    const text = poolText({ kind: "country", names: [{ name: "Bungarus candidus", common: "Malayan Krait", genus: "Bungarus" }, { name: "Bungarus fasciatus", common: null, genus: "Bungarus" }] });
    expect(text).toBe("Bungarus: candidus (Malayan Krait), fasciatus");
    const answers = answersText(desc({ head: NOT_SURE }));
    expect(answers).toContain("Pattern: bands or rings around the body");
    expect(answers).toContain("Head: not sure");
  });
});

/*
 * Eval cases with a fake provider. The fake reads the answers and the pool exactly
 * as the real model would get them and picks genera by simple field-guide rules,
 * only from names in the pool. This checks the whole path: pool → prompt → zod →
 * taxonomy → safety policy.
 */
function fieldGuideProvider(): VisionProvider & { calls: DescribeInput[] } {
  const calls: DescribeInput[] = [];
  const pick = (input: DescribeInput, genus: string, score: number) =>
    input.pool
      .split("\n")
      .filter((line) => line.startsWith(`${genus}: `))
      .flatMap((line) => line.slice(genus.length + 2).split(", "))
      .slice(0, 2)
      .map((ep) => ({ scientific_name: `${genus} ${ep.replace(/ \(.*\)$/, "")}`, match_score: score, why: "Matches the answers." }));
  return {
    name: "fake",
    model: "field-guide",
    calls,
    analyze: vi.fn(),
    async describe(input) {
      calls.push(input);
      const a = input.answers;
      const candidates = [];
      if (/hood/.test(a)) candidates.push(...pick(input, "Naja", 0.7), ...pick(input, "Ophiophagus", 0.4));
      if (/bands or rings/.test(a) && /black/.test(a) && /white/.test(a)) candidates.push(...pick(input, "Bungarus", 0.7), ...pick(input, "Lycodon", 0.4));
      if (/green/.test(a) && /triangular/.test(a) && /tree/.test(a)) candidates.push(...pick(input, "Trimeresurus", 0.7), ...pick(input, "Ahaetulla", 0.3));
      return { candidates: candidates.slice(0, 5) };
    },
  };
}

const genera = (r: DescriptionResult) => r.candidates.map((c) => c.scientificName.split(" ")[0]);

describe("describe: eval cases (fake provider)", () => {
  const unavailable: SightingsLookup = async () => null;

  it("black and white bands, Thailand, night, inside a house → includes Bungarus, shown as dangerous", async () => {
    const provider = fieldGuideProvider();
    const r = await new DescribeService(provider, { sightings: unavailable }).describe(
      desc({ place: { ...BANGKOK, name: "Chiang Mai", region: "Chiang Mai" }, colours: ["black", "white_cream"], pattern: "bands", time: "night", setting: "building" }),
      meta,
    );
    expect(provider.calls).toHaveLength(1); // one text-only call
    expect(r.status).toBe("possible_matches");
    expect(genera(r)).toContain("Bungarus");
    expect(r.dangerous).toBe(true);
    expectNeverReassuring(r);
  });

  it("green, triangular head, in a tree, Bangkok → includes Trimeresurus", async () => {
    const r = await new DescribeService(fieldGuideProvider(), { sightings: unavailable }).describe(
      desc({ colours: ["green"], pattern: "plain", head: "triangular", setting: "tree", time: "day", size: "50cm_1m" }),
      meta,
    );
    expect(genera(r)).toContain("Trimeresurus");
    expectNeverReassuring(r);
  });

  it("hood spread (no place) → includes Naja, much less reliable pool", async () => {
    const provider = fieldGuideProvider();
    const r = await new DescribeService(provider, { sightings: unavailable }).describe(
      desc({ place: null, colours: ["brown"], pattern: "plain", head: "hood", setting: "garden", behaviour: ["raised_head"] }),
      meta,
    );
    expect(provider.calls[0].poolKind).toBe("everywhere");
    expect(r.pool).toBe("everywhere");
    expect(genera(r)).toContain("Naja");
    expect(r.dangerous).toBe(true);
  });
});
