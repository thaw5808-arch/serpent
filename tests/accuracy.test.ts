import { afterEach, describe, expect, it, vi } from "vitest";
import { candidatesForCountry, countriesInText, genusRangeOf, MAX_CANDIDATES } from "@/services/countryCandidates";
import { mergeAnalyses, needsSecondOpinion } from "@/services/secondOpinion";
import { decide } from "@/services/safetyService";
import { SnakeIdentificationService } from "@/services/snakeIdentification";
import { RawAnalysisSchema, type RawAnalysis, type VisionProvider } from "@/services/providers/types";
import { userPromptText } from "@/services/providers/prompt";
import { validatePhotoSet, MAX_PHOTOS_PER_REQUEST } from "@/lib/imageValidation";
import { WHO_REFERENCE } from "@/data/reference/whoMedicallyImportant";
import { getCountry } from "@/data/countries";
import { listSpecies } from "@/services/venomDatabase";
import { raw, c } from "./helpers";

const TH = getCountry("TH");
const named = (probability: number, scientific_name: string, genus: string, family: string) => ({
  ...c("not_in_catalog", probability),
  scientific_name,
  genus,
  family,
});

describe("country-specific candidate list", () => {
  const th = candidatesForCountry("TH");
  const mm = candidatesForCountry("MM");
  const names = (list: typeof th) => list.map((e) => e.scientificName);

  it("puts every curated species first, local ones leading", () => {
    const curated = listSpecies();
    expect(th.slice(0, curated.length).every((e) => e.reviewed)).toBe(true);
    expect(th[0].reviewed && getCountry("TH")!.region).toBeTruthy();
    expect(th.slice(curated.length).every((e) => !e.reviewed)).toBe(true);
  });

  it("then the WHO medically important species for that country, Category 1 first", () => {
    const after = names(mm.slice(listSpecies().length));
    const who = WHO_REFERENCE.MM.listings.filter((l) => !l.scientificName.endsWith("spp."));
    const cat1 = who.filter((l) => l.category === 1 && !listSpecies().some((s) => s.scientificName === l.scientificName));
    expect(after.slice(0, cat1.length).sort()).toEqual(cat1.map((l) => l.scientificName).sort());
    expect(after).toEqual(expect.arrayContaining(["Bungarus multicinctus", "Bungarus magnimaculatus", "Naja mandalayensis"]));
  });

  it("includes species whose own distribution names the country", () => {
    expect(names(mm)).toContain("Ptyas mucosa"); // "Burma (Myanmar)" in the source
    expect(names(th)).toContain("Ptyas mucosa");
  });

  it("is capped, unique, and has genus and family for every entry", () => {
    for (const list of [th, mm]) {
      expect(list.length).toBeLessThanOrEqual(MAX_CANDIDATES);
      expect(new Set(names(list)).size).toBe(list.length);
      for (const e of list) expect(e.genus && e.family, e.scientificName).toBeTruthy();
    }
  });

  it("never invents identification features for unreviewed species", () => {
    for (const e of th.filter((x) => !x.reviewed)) expect(e.keyFeatures).toEqual([]);
  });

  it("does not include species from far away", () => {
    expect(names(th)).not.toContain("Crotalus adamanteus".replace("adamanteus", "horridus")); // a US rattlesnake
    expect(names(th)).not.toContain("Dendroaspis angusticeps");
  });

  it("parses country names, including the source's alternative names", () => {
    expect([...countriesInText("Burma (Myanmar), Laos, Vietnam, W Malaysia")].sort()).toEqual(["LA", "MM", "MY", "VN"]);
    expect([...countriesInText("Indian Ocean islands")]).toEqual([]); // no false "India"
    expect(genusRangeOf("Bungarus").has("TH")).toBe(true);
  });

  it("without a country the prompt keeps the curated catalog only", () => {
    const service = new SnakeIdentificationService({ name: "fake", model: "fake", analyze: async () => ({}) });
    const list = service.catalogFor(null);
    expect(list).toHaveLength(listSpecies().length);
    expect(list.every((e) => e.reviewed)).toBe(true);
    expect(userPromptText({ catalog: list, countryName: null })).not.toMatch(/Other recognised species/);
    expect(userPromptText({ catalog: th, countryName: "Thailand" })).toMatch(/Other recognised species recorded in or near Thailand/);
  });

  it("a taxonomy id from the list resolves to that recognised species", () => {
    const d = decide(raw({ overall_confidence: "low", candidates: [c("bungarus-multicinctus", 0.8)] }), getCountry("MM"));
    expect(d.closestMatch).toMatchObject({ kind: "taxonomy", scientificName: "Bungarus multicinctus", namedAs: null });
  });
});

describe("look-first observations", () => {
  it("turns structured observations into observed features, skipping what wasn't visible", () => {
    const parsed = RawAnalysisSchema.parse({
      observations: { dorsal_pattern: "black and white bands", colour: "glossy black, white", head_shape: null, scale_texture: "smooth", body_build: null, visible_markings: null },
      image_quality: { snake_detected: true, snake_count: "one", usable_for_identification: true, issues: ["blur"] },
      candidates: [c("malayan-krait", 0.7)],
      overall_confidence: "moderate",
      uncertainty_notes: [],
    });
    expect(parsed.observed_features).toEqual(["Dorsal pattern: black and white bands", "Colour: glossy black, white", "Scale texture: smooth"]);
  });
});

describe("second opinion: merge", () => {
  const a = raw({ overall_confidence: "moderate", candidates: [c("malayan-krait", 0.8), c("laotian-wolf-snake", 0.2)] });

  it("averages probabilities per taxon, counting a missing candidate as 0", () => {
    const b = raw({ overall_confidence: "low", candidates: [c("malayan-krait", 0.6), c("banded-krait", 0.3)] });
    const { merged } = mergeAnalyses(a, b);
    const p = Object.fromEntries(merged.candidates.map((x) => [x.catalog_id, x.probability]));
    expect(p["malayan-krait"]).toBeCloseTo(0.7);
    expect(p["laotian-wolf-snake"]).toBeCloseTo(0.1);
    expect(p["banded-krait"]).toBeCloseTo(0.15);
  });

  it("treats a catalog id and the same species named freely as one candidate", () => {
    const b = raw({ overall_confidence: "moderate", candidates: [named(0.6, "Bungarus candidus", "Bungarus", "Elapidae")] });
    const { merged, agreed } = mergeAnalyses(a, b);
    expect(agreed).toBe(true);
    expect(merged.candidates.filter((x) => x.catalog_id === "malayan-krait" || x.scientific_name === "Bungarus candidus")).toHaveLength(1);
  });

  it("agreement raises confidence to the more confident analysis", () => {
    const b = raw({ overall_confidence: "high", candidates: [c("malayan-krait", 0.9)] });
    const { merged, agreed } = mergeAnalyses(a, b);
    expect(agreed).toBe(true);
    expect(merged.overall_confidence).toBe("high");
  });

  it("disagreement keeps confidence capped and can never give a high band", () => {
    const b = raw({ overall_confidence: "high", candidates: [c("laotian-wolf-snake", 0.95)] });
    const { merged, agreed } = mergeAnalyses(raw({ overall_confidence: "high", candidates: [c("malayan-krait", 0.95)] }), b);
    expect(agreed).toBe(false);
    expect(merged.overall_confidence).toBe("moderate");
    const d = decide(merged, TH);
    expect(d.confidenceBand).not.toBe("high");
    expect(d.displayVenomStatus).not.toBe("non_venomous");
  });

  it("keeps every image issue and the most cautious snake count", () => {
    const b = raw({
      image_quality: { snake_detected: true, snake_count: "multiple", usable_for_identification: true, issues: ["low_light"] },
      candidates: [c("malayan-krait", 0.5)],
    });
    const { merged } = mergeAnalyses(raw({ image_quality: { snake_detected: true, snake_count: "one", usable_for_identification: true, issues: ["blur"] }, candidates: [c("malayan-krait", 0.5)] }), b);
    expect(merged.image_quality.issues.sort()).toEqual(["blur", "low_light"]);
    expect(merged.image_quality.snake_count).toBe("multiple");
  });
});

describe("second opinion: when it runs", () => {
  it("runs for low or moderate bands and for top two in different genera", () => {
    expect(needsSecondOpinion(raw({ candidates: [c("malayan-krait", 0.95)] }), TH)).toBe(false);
    expect(needsSecondOpinion(raw({ overall_confidence: "moderate", candidates: [c("malayan-krait", 0.95)] }), TH)).toBe(true);
    // High band, but the runner-up is another genus.
    expect(needsSecondOpinion(raw({ candidates: [c("malayan-krait", 0.8), c("laotian-wolf-snake", 0.12)] }), TH)).toBe(true);
    // High band, runner-up in the same genus.
    expect(needsSecondOpinion(raw({ candidates: [c("malayan-krait", 0.8), c("banded-krait", 0.12)] }), TH)).toBe(false);
  });

  const meta = { id: "t", analyzedAt: "2026-01-01T00:00:00.000Z" };
  const photo = [{ imageBase64: "x", mediaType: "image/jpeg" as const }];
  const counting = (...answers: (RawAnalysis | Error)[]) => {
    const calls = { n: 0 };
    const provider: VisionProvider = {
      name: "fake",
      model: "fake-1",
      analyze: async () => {
        const next = answers[Math.min(calls.n++, answers.length - 1)];
        if (next instanceof Error) throw next;
        return next;
      },
    };
    return { provider, calls };
  };
  const uncertain = raw({ overall_confidence: "low", candidates: [c("malayan-krait", 0.5), c("laotian-wolf-snake", 0.4)] });
  const certain = raw({ candidates: [c("malayan-krait", 0.95)] });

  afterEach(() => vi.unstubAllEnvs());

  it("makes exactly one extra call for an uncertain photo and records it", async () => {
    const { provider, calls } = counting(uncertain, uncertain);
    const r = await new SnakeIdentificationService(provider).identify(photo, "TH", meta);
    expect(calls.n).toBe(2);
    expect(r.analysis).toEqual({ photos: 1, secondOpinion: true, agreed: true });
  });

  it("makes no extra call for a certain photo", async () => {
    const { provider, calls } = counting(certain);
    const r = await new SnakeIdentificationService(provider).identify(photo, "TH", meta);
    expect(calls.n).toBe(1);
    expect(r.analysis?.secondOpinion).toBe(false);
  });

  it("is switched off by VERIFY_UNCERTAIN=false", async () => {
    vi.stubEnv("VERIFY_UNCERTAIN", "false");
    const { provider, calls } = counting(uncertain, uncertain);
    await new SnakeIdentificationService(provider).identify(photo, "TH", meta);
    expect(calls.n).toBe(1);
  });

  it("falls back to the first analysis if the extra call fails", async () => {
    const { provider, calls } = counting(uncertain, new Error("timeout"));
    const r = await new SnakeIdentificationService(provider).identify(photo, "TH", meta);
    expect(calls.n).toBe(2);
    expect(r.status).not.toBe("service_unavailable");
    expect(r.analysis?.secondOpinion).toBe(false);
  });
});

describe("multi-photo requests", () => {
  const jpeg = (size = 4096) => {
    const b = new Uint8Array(size);
    b.set([0xff, 0xd8, 0xff]);
    return b;
  };

  it("accepts 1 to 3 valid photos", () => {
    for (let n = 1; n <= MAX_PHOTOS_PER_REQUEST; n++) {
      const v = validatePhotoSet(Array.from({ length: n }, () => jpeg()));
      expect(v.ok && v.photos.length).toBe(n);
    }
  });

  it("rejects none, too many, or any invalid photo (naming which one)", () => {
    expect(validatePhotoSet([])).toMatchObject({ ok: false, status: 400 });
    expect(validatePhotoSet([jpeg(), jpeg(), jpeg(), jpeg()])).toMatchObject({ ok: false, status: 400 });
    const svg = new TextEncoder().encode("<svg xmlns".padEnd(4096, " "));
    expect(validatePhotoSet([jpeg(), svg])).toMatchObject({ ok: false, status: 415, error: expect.stringMatching(/^Photo 2:/) });
  });

  it("the identify route rejects more than 3 photos before calling any provider", async () => {
    const { POST } = await import("@/app/api/identify/route");
    const form = new FormData();
    for (let i = 0; i < 4; i++) form.append("image", new Blob([jpeg()], { type: "image/jpeg" }), `p${i}.jpg`);
    const res = await POST(new Request("http://localhost/api/identify", { method: "POST", body: form, headers: { "x-forwarded-for": "10.0.0.1" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at most 3 photos/);
  });
});
