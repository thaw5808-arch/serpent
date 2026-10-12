import { describe, expect, it } from "vitest";
import { decide, rankCandidates, type Decision } from "@/services/safetyService";
import { getCountry } from "@/data/countries";
import { raw, c } from "./helpers";
import { FORBIDDEN } from "./forbidden";
import { candidateLabel, localizeSafety, venomBasisText } from "@/i18n/result";
import type { Messages } from "@/i18n/messages";
import en from "../messages/en.json";
import th from "../messages/th.json";
import my from "../messages/my.json";

const TH = getCountry("TH");
const US = getCountry("US");

/** Every user-visible string a decision can produce. */
function allText(d: Decision): string {
  return JSON.stringify(d);
}

/** Everything a decision shows in a given language: Serpent's wording plus labels, as the result screen builds it. */
function localizedText(d: Decision, t: Messages, locale: "en" | "th" | "my"): string {
  const s = localizeSafety(d, t, locale);
  const candidates = [d.top, d.closestMatch, ...d.alternatives, ...d.couldAlsoBe].filter((x) => x !== null);
  return [
    s.headline,
    s.message,
    ...s.actions,
    s.lookAlike,
    ...s.notes,
    t.venomStatus[d.displayVenomStatus].label,
    t.venomStatus[d.displayVenomStatus].short,
    ...d.imageIssues.map((i) => t.issues[i]),
    ...candidates.flatMap((c) => [candidateLabel(c, t), venomBasisText(c, t, locale) ?? "", c.band ? t.band[c.band] : ""]),
  ].join("\n");
}

/** One snake, seen only partly: the model flags the photo as unusable but still ranks candidates. */
const partial = (candidates: ReturnType<typeof c>[], issues: Decision["imageIssues"] = ["partially_hidden", "blur"]) =>
  raw({
    overall_confidence: "low",
    image_quality: { snake_detected: true, snake_count: "one", usable_for_identification: false, issues },
    candidates,
  });

describe("safety policy — never reassures falsely", () => {
  const scenarios: [string, Decision][] = [
    ["low-confidence non-venomous", decide(raw({ overall_confidence: "low", candidates: [c("corn-snake", 0.55)] }), US)],
    ["moderate non-venomous", decide(raw({ overall_confidence: "moderate", candidates: [c("checkered-keelback", 0.6), c("red-necked-keelback", 0.2)] }), TH)],
    ["high non-venomous", decide(raw({ candidates: [c("corn-snake", 0.95)] }), US)],
    ["krait vs wolf snake", decide(raw({ candidates: [c("laotian-wolf-snake", 0.6), c("malayan-krait", 0.35)] }), TH)],
    ["unknown", decide(raw({ candidates: [c("not_in_catalog", 0.8)] }), null)],
    ["named species outside the catalog, venomous genus", decide(raw({ candidates: [{ ...c("not_in_catalog", 0.85), scientific_name: "Bungarus multicinctus", genus: "Bungarus", family: "Elapidae" }] }), TH)],
    ["named species outside the catalog, unknown genus", decide(raw({ candidates: [{ ...c("not_in_catalog", 0.95), scientific_name: "Ptyas mucosa", genus: "Ptyas", family: "Colubridae" }] }), null)],
    ["partial photo, krait vs wolf snake", decide(partial([c("laotian-wolf-snake", 0.55), c("malayan-krait", 0.35)]), TH)],
    ["partial photo, non-venomous only", decide(partial([c("corn-snake", 0.9)]), US)],
    ["no snake", decide(raw({ image_quality: { snake_detected: false, snake_count: "none", usable_for_identification: false, issues: ["no_snake"] }, candidates: [] }), null)],
  ];

  it.each(scenarios)("%s: no reassuring language, distance-first headline", (_, d) => {
    expect(allText(d)).not.toMatch(FORBIDDEN.en);
    expect(d.safety.headline).toBe("Keep your distance");
    expect(d.safety.actions.join(" ")).toMatch(/Do not touch, catch, corner or try to kill/);
  });

  it.each(
    scenarios.flatMap(([name, d]) =>
      ([["en", en], ["th", th], ["my", my]] as const).map(([locale, t]) => [`${name} (${locale})`, d, locale, t] as const),
    ),
  )("%s: shown in that language with no reassuring language, distance first", (_, d, locale, t) => {
    const text = localizedText(d, t as Messages, locale);
    expect(text).not.toMatch(FORBIDDEN[locale]);
    const s = localizeSafety(d, t as Messages, locale);
    expect(s.legacy).toBe(false);
    expect(s.headline).toBe(t.safety.keepDistance);
    expect(s.actions).toContain(t.safety.actions.noTouch);
  });

  it("low-confidence non-venomous is shown as potentially venomous and treated as dangerous", () => {
    const d = decide(raw({ overall_confidence: "low", candidates: [c("corn-snake", 0.55)] }), US);
    expect(d.confidenceBand).toBe("low");
    expect(d.displayVenomStatus).toBe("potentially_venomous");
    expect(d.safety.treatAsDangerous).toBe(true);
  });

  it("non-venomous top with a plausible venomous look-alike is conflicting evidence", () => {
    const d = decide(raw({ candidates: [c("laotian-wolf-snake", 0.6), c("malayan-krait", 0.35)] }), TH);
    expect(d.status).toBe("conflicting_evidence");
    expect(d.displayVenomStatus).toBe("potentially_venomous");
    expect(d.safety.lookAlike.active).toBe(true);
    expect(d.safety.lookAlike.speciesIds).toContain("malayan-krait");
  });

  it("high-confidence non-venomous still warns about dangerous look-alikes", () => {
    const d = decide(raw({ candidates: [c("corn-snake", 0.95)] }), US);
    expect(d.displayVenomStatus).toBe("non_venomous");
    expect(d.safety.lookAlike.active).toBe(true);
    expect(d.safety.lookAlike.speciesIds).toContain("copperhead");
  });

  it("venomous top is reported as venomous", () => {
    const d = decide(raw({ candidates: [c("malayan-krait", 0.9)] }), TH);
    expect(d.status).toBe("likely_identified");
    expect(d.displayVenomStatus).toBe("venomous");
    expect(d.top?.speciesId).toBe("malayan-krait");
  });

  it("weak top candidate becomes unknown_species", () => {
    const d = decide(raw({ overall_confidence: "low", candidates: [c("king-cobra", 0.3), c("monocled-cobra", 0.25)] }), TH);
    expect(d.status).toBe("unknown_species");
    expect(d.top).toBeNull();
    // Unresolved is never shown as "unknown": the fail-safe floor is potentially venomous.
    expect(d.displayVenomStatus).toBe("potentially_venomous");
  });

  it("not_in_catalog top becomes unknown_species", () => {
    expect(decide(raw({ candidates: [c("not_in_catalog", 0.7), c("corn-snake", 0.3)] }), US).status).toBe("unknown_species");
  });

  it("unknown catalog ids are treated as not in catalog, never invented", () => {
    const d = decide(raw({ candidates: [c("made-up-viper", 0.9)] }), null);
    expect(d.status).toBe("unknown_species");
  });

  it("spitting cobra adds eye-protection advice", () => {
    const d = decide(raw({ candidates: [c("indochinese-spitting-cobra", 0.85)] }), TH);
    expect(d.safety.actions[0]).toMatch(/spray venom/);
  });
});

describe("image quality gates", () => {
  it("no snake", () => {
    const d = decide(raw({ image_quality: { snake_detected: false, snake_count: "none", usable_for_identification: false, issues: ["no_snake"] }, candidates: [c("king-cobra", 0.9)] }), null);
    expect(d.status).toBe("no_snake");
    expect(d.top).toBeNull();
  });
  it("multiple snakes", () => {
    expect(decide(raw({ image_quality: { snake_detected: true, snake_count: "multiple", usable_for_identification: true, issues: [] }, candidates: [c("king-cobra", 0.9)] }), null).status).toBe("multiple_snakes");
  });
  it("blurry / unusable image never yields a species, even if the model guessed one", () => {
    const d = decide(raw({ image_quality: { snake_detected: true, snake_count: "one", usable_for_identification: false, issues: ["blur"] }, candidates: [c("corn-snake", 0.9)] }), US);
    // Listed as a low-confidence possibility only, never as the identification.
    expect(d.status).toBe("unknown_species");
    expect(d.top).toBeNull();
    expect(d.confidenceBand).toBe("low");
    expect(d.alternatives.every((a) => a.band === "low")).toBe(true);
    expect(d.displayVenomStatus).toBe("potentially_venomous");
    expect(d.safety.treatAsDangerous).toBe(true);
    expect(d.safety.actions.join(" ")).toMatch(/Do not move closer/);
  });

  it("unusable image with no catalog candidates is insufficient_image", () => {
    for (const candidates of [[], [c("not_in_catalog", 0.9)]]) {
      const d = decide(partial(candidates), TH);
      expect(d.status).toBe("insufficient_image");
      expect(d.alternatives).toEqual([]);
      expect(d.safety.actions.join(" ")).toMatch(/Do not move closer/);
    }
  });
});

describe("partial photos", () => {
  const kraitOrWolf = decide(partial([c("laotian-wolf-snake", 0.55), c("malayan-krait", 0.35)]), TH);

  it("banded krait / wolf snake: potentially venomous with a look-alike warning", () => {
    expect(kraitOrWolf.status).toBe("conflicting_evidence");
    expect(kraitOrWolf.displayVenomStatus).toBe("potentially_venomous");
    expect(kraitOrWolf.displayVenomStatus).not.toBe("non_venomous");
    expect(kraitOrWolf.safety.treatAsDangerous).toBe(true);
    expect(kraitOrWolf.safety.lookAlike.active).toBe(true);
    expect(kraitOrWolf.safety.lookAlike.speciesIds).toContain("malayan-krait");
  });

  it("lists candidates as low-confidence possibilities, never as the identification", () => {
    expect(kraitOrWolf.top).toBeNull();
    expect(kraitOrWolf.confidenceBand).toBe("low");
    // Venomous-first: the krait leads even though the wolf snake scored higher.
    expect(kraitOrWolf.alternatives.map((a) => a.speciesId)).toEqual(["malayan-krait", "laotian-wolf-snake"]);
    expect(kraitOrWolf.alternatives.every((a) => a.band === "low")).toBe(true);
  });

  it("keeps the image issues and the do-not-move-closer advice", () => {
    expect(kraitOrWolf.imageIssues).toEqual(["partially_hidden", "blur"]);
    expect(kraitOrWolf.safety.actions.join(" ")).toMatch(/Do not move closer/);
  });

  it("never reports non-venomous, whatever the model favours", () => {
    for (const candidates of [
      [c("laotian-wolf-snake", 0.95)],
      [c("laotian-wolf-snake", 0.9), c("malayan-krait", 0.05)],
      [c("corn-snake", 0.6), c("copperhead", 0.3)],
    ]) {
      const d = decide(partial(candidates), null);
      expect(d.displayVenomStatus).toBe("potentially_venomous");
      expect(d.safety.treatAsDangerous).toBe(true);
    }
  });

  it("same venom class only: unknown_species", () => {
    const d = decide(partial([c("malayan-krait", 0.6), c("banded-krait", 0.3)]), TH);
    expect(d.status).toBe("unknown_species");
    expect(d.displayVenomStatus).toBe("potentially_venomous");
  });
});

describe("geography", () => {
  it("down-weights but does not exclude out-of-region species", () => {
    const ranked = rankCandidates(raw({ candidates: [c("copperhead", 0.5), c("malayan-pit-viper", 0.5)] }), TH);
    const copper = ranked.find((r) => r.speciesId === "copperhead");
    const mpv = ranked.find((r) => r.speciesId === "malayan-pit-viper");
    expect(copper).toBeDefined();
    expect(copper!.outside).toBe(true);
    expect(mpv!.p).toBeGreaterThan(copper!.p);
  });

  it("location unknown leaves probabilities untouched", () => {
    const ranked = rankCandidates(raw({ candidates: [c("copperhead", 0.5), c("malayan-pit-viper", 0.5)] }), null);
    expect(ranked[0].p).toBeCloseTo(0.5);
  });

  it("probabilities always sum to 1 and unclaimed mass stays as 'not in catalog'", () => {
    const ranked = rankCandidates(raw({ candidates: [c("king-cobra", 0.6)] }), null);
    expect(ranked.reduce((s, r) => s + r.p, 0)).toBeCloseTo(1);
    expect(ranked.find((r) => r.speciesId === null)?.p).toBeCloseTo(0.4);
  });
});

describe("usable but imperfect photos", () => {
  const usable = (candidates: ReturnType<typeof c>[], issues: Decision["imageIssues"]) =>
    raw({ image_quality: { snake_detected: true, snake_count: "one", usable_for_identification: true, issues }, candidates });

  it.each(["blur", "partially_hidden", "obstructed", "too_small", "low_resolution"] as const)(
    "%s caps the band at moderate and adds the retake advice",
    (issue) => {
      const d = decide(usable([c("malayan-krait", 0.95)], [issue]), TH);
      expect(d.status).toBe("likely_identified");
      expect(d.top?.speciesId).toBe("malayan-krait");
      expect(d.confidenceBand).toBe("moderate");
      expect(d.top?.band).toBe("moderate");
      expect(d.displayVenomStatus).toBe("venomous");
      expect(d.safety.actions.join(" ")).toMatch(/Do not move closer/);
    },
  );

  it("a capped non-venomous result is no longer shown as non-venomous", () => {
    const d = decide(usable([c("corn-snake", 0.95)], ["partially_hidden"]), US);
    expect(d.confidenceBand).toBe("moderate");
    expect(d.displayVenomStatus).toBe("potentially_venomous");
    expect(d.safety.treatAsDangerous).toBe(true);
  });

  it("low light alone does not cap the band or add retake advice", () => {
    const d = decide(usable([c("malayan-krait", 0.95)], ["low_light"]), TH);
    expect(d.confidenceBand).toBe("high");
    expect(d.safety.actions.join(" ")).not.toMatch(/Do not move closer/);
  });

  it("a clear photo keeps the high band and no retake advice", () => {
    const d = decide(usable([c("malayan-krait", 0.95)], []), TH);
    expect(d.confidenceBand).toBe("high");
    expect(d.safety.actions.join(" ")).not.toMatch(/Do not move closer/);
  });

  it("never reassures falsely", () => {
    const d = decide(usable([c("laotian-wolf-snake", 0.95)], ["blur"]), TH);
    expect(JSON.stringify(d)).not.toMatch(FORBIDDEN.en);
    expect(d.displayVenomStatus).not.toBe("non_venomous");
  });
});
