import { describe, expect, it } from "vitest";
import { decide, decideSafety } from "@/services/safetyService";
import { getCountry } from "@/data/countries";
import { raw, c } from "./helpers";

const TH = getCountry("TH");
const MM = getCountry("MM");
const named = (probability: number, scientific_name: string | null, genus: string | null = null, family: string | null = null) => ({
  ...c("not_in_catalog", probability),
  scientific_name,
  genus,
  family,
});
const partialPhoto = { snake_detected: true, snake_count: "one" as const, usable_for_identification: true, issues: ["partially_hidden" as const] };

describe("closest match headline", () => {
  it("names a curated species, linking to its page", () => {
    // Weak top: unknown_species, which used to show only the generic sentence.
    const d = decide(raw({ overall_confidence: "low", candidates: [c("king-cobra", 0.3), c("monocled-cobra", 0.25)] }), TH);
    expect(d.status).toBe("unknown_species");
    expect(d.closestMatch).toMatchObject({ kind: "species", speciesId: "king-cobra", label: "King Cobra", scientificName: "Ophiophagus hannah", band: "low" });
  });

  it("names a taxonomy-only species, with its venom data from the genus group", () => {
    const d = decide(raw({ candidates: [named(0.8, "Bungarus multicinctus", "Bungarus", "Elapidae")] }), MM);
    expect(d.closestMatch).toMatchObject({
      kind: "taxonomy",
      taxonomySlug: "bungarus-multicinctus",
      label: "Many-banded Krait",
      scientificName: "Bungarus multicinctus",
      venomStatus: "venomous",
      venomBasis: "genus",
      venomGroup: { name: "Bungarus", commonName: "Kraits", rank: "genus" },
    });
    // Safety fields still come from the policy.
    expect(d.displayVenomStatus).toBe("venomous");
  });

  it("shows the recognised name for a typo, keeping the correction note", () => {
    const d = decide(raw({ candidates: [named(0.8, "Bungarus multicintus", "Bungarus", "Elapidae")] }), MM);
    expect(d.closestMatch).toMatchObject({ scientificName: "Bungarus multicinctus", namedAs: "Bungarus multicintus" });
    expect(d.uncertaintyNotes.join(" ")).toMatch(/The AI wrote "Bungarus multicintus"; the closest recognised name is Bungarus multicinctus/);
  });

  it("shows only a genus when no species resolves", () => {
    const d = decide(raw({ candidates: [named(0.8, "Bungarus fantasticus", "Bungarus", "Elapidae")] }), MM);
    expect(d.closestMatch).toMatchObject({ kind: "group", scientificName: "Bungarus sp.", label: "Kraits (genus Bungarus)" });
  });

  it("prefers a plausible resolved species over a more likely unrecognised name", () => {
    const d = decide(raw({ candidates: [named(0.6, "Fakeophis inventus", "Fakeophis", null), c("malayan-krait", 0.3)] }), TH);
    expect(d.closestMatch?.speciesId).toBe("malayan-krait");
  });

  it("an invented name is never shown as a species, even as the closest match", () => {
    const d = decide(raw({ candidates: [named(0.9, "Fakeophis inventus", "Fakeophis", "Fakeidae")] }), null);
    expect(d.closestMatch).toMatchObject({ kind: "unresolved", label: "An unrecognised snake", scientificName: null });
    for (const v of [d.closestMatch, ...d.couldAlsoBe, ...d.alternatives]) {
      expect(JSON.stringify([v?.label, v?.scientificName])).not.toMatch(/Fakeophis/);
    }
  });

  it("falls back to no closest match only when there are no candidates", () => {
    expect(decide(raw({ candidates: [] }), null).closestMatch).toBeNull();
    expect(decide(raw({ candidates: [c("not_in_catalog", 0.8)] }), null).closestMatch).toBeNull();
    // A photo with nothing identifiable keeps the old layout too.
    const blurry = decide(raw({ image_quality: { ...partialPhoto, usable_for_identification: false }, candidates: [] }), null);
    expect(blurry.status).toBe("insufficient_image");
    expect(blurry.closestMatch).toBeNull();
  });

  it("keeps the identified species as the closest match on the normal path", () => {
    const d = decide(raw({ candidates: [c("malayan-krait", 0.9)] }), TH);
    expect(d.top?.speciesId).toBe("malayan-krait");
    expect(d.closestMatch).toBe(d.top);
  });
});

describe("could also be", () => {
  it("lists plausible candidates of the other venom class, venomous first", () => {
    const d = decide(
      raw({
        image_quality: partialPhoto,
        overall_confidence: "low",
        candidates: [
          c("laotian-wolf-snake", 0.45),
          named(0.15, "Ptyas mucosa", "Ptyas", "Colubridae"), // not assessed
          c("malayan-krait", 0.2),
          named(0.15, "Bungarus multicinctus", "Bungarus", "Elapidae"),
        ],
      }),
      TH,
    );
    expect(d.closestMatch?.speciesId).toBe("laotian-wolf-snake");
    // Known venomous (species or genus level) before "not assessed", then by likelihood.
    expect(d.couldAlsoBe.map((v) => v.speciesId ?? v.taxonomySlug)).toEqual(["malayan-krait", "bungarus-multicinctus", "ptyas-mucosa"]);
  });

  it("is empty when every plausible candidate shares the closest match's venom class", () => {
    const d = decide(raw({ overall_confidence: "low", candidates: [c("malayan-krait", 0.5), c("banded-krait", 0.4)] }), TH);
    expect(d.couldAlsoBe).toEqual([]);
  });

  it("ignores implausible candidates", () => {
    const d = decide(raw({ overall_confidence: "low", candidates: [c("malayan-krait", 0.6), c("laotian-wolf-snake", 0.05)] }), TH);
    expect(d.couldAlsoBe).toEqual([]);
  });
});

describe("presentation never reassures", () => {
  it("a non-venomous closest match with a plausible venomous alternative keeps the potentially venomous badge", () => {
    const d = decide(raw({ candidates: [c("laotian-wolf-snake", 0.7), c("malayan-krait", 0.25)] }), TH);
    expect(d.closestMatch?.speciesId).toBe("laotian-wolf-snake");
    expect(d.couldAlsoBe.map((v) => v.speciesId)).toEqual(["malayan-krait"]);
    expect(d.displayVenomStatus).toBe("potentially_venomous");
    expect(d.safety.treatAsDangerous).toBe(true);
  });

  it.each([
    ["conflicting", raw({ overall_confidence: "low", candidates: [c("laotian-wolf-snake", 0.5), c("malayan-krait", 0.4)] }), TH],
    ["taxonomy genus", raw({ candidates: [named(0.8, "Bungarus multicinctus", "Bungarus", "Elapidae")] }), MM],
    ["not assessed", raw({ candidates: [named(0.9, "Ptyas mucosa", "Ptyas", "Colubridae")] }), null],
    ["identified", raw({ candidates: [c("corn-snake", 0.95)] }), getCountry("US")],
    ["partial photo", raw({ image_quality: { ...partialPhoto, usable_for_identification: false }, candidates: [c("malayan-krait", 0.5), c("laotian-wolf-snake", 0.4)] }), TH],
  ] as const)("%s: presentation leaves every safety field exactly as the policy decided", (_, analysis, country) => {
    const safetyFields = (d: ReturnType<typeof decide>) =>
      Object.fromEntries(Object.entries(d).filter(([k]) => k !== "closestMatch" && k !== "couldAlsoBe"));
    expect(safetyFields(decide(analysis, country))).toEqual(safetyFields(decideSafety(analysis, country)));
  });
});
