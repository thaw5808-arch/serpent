import { describe, expect, it } from "vitest";
import { decide, rankCandidates, POLICY } from "@/services/safetyService";
import { autoLookAlikes, resolveTaxon } from "@/services/taxonomy";
import { getSpecies, isMedicallySignificant, listSpecies } from "@/services/venomDatabase";
import { getCountry } from "@/data/countries";
import { WHO_REFERENCE } from "@/data/reference/whoMedicallyImportant";
import type { RawAnalysis } from "@/services/providers/types";
import { raw, c } from "./helpers";

const TH = getCountry("TH");
const US = getCountry("US");

/** A not-in-catalog candidate named by the model. */
const named = (probability: number, scientific_name: string | null, genus: string | null, family: string | null) => ({
  ...c("not_in_catalog", probability),
  scientific_name,
  genus,
  family,
});

describe("taxonomic fallback", () => {
  it("a model-named species outside the catalog in a venomous genus resolves to the venomous genus group", () => {
    const analysis = raw({ candidates: [named(0.85, "Bungarus multicinctus", "Bungarus", "Elapidae")] });
    expect(rankCandidates(analysis, TH)[0]).toMatchObject({ taxonomySlug: "bungarus-multicinctus", groupId: "genus-bungarus" });

    const d = decide(analysis, TH);
    expect(d.status).toBe("unknown_species");
    expect(d.top).toBeNull();
    expect(d.displayVenomStatus).toBe("venomous");
    expect(d.safety.treatAsDangerous).toBe(true);
    expect(d.alternatives[0]).toMatchObject({
      taxonomySlug: "bungarus-multicinctus",
      groupId: "genus-bungarus",
      scientificName: "Bungarus multicinctus",
      venomStatus: "venomous",
      venomBasis: "genus",
    });
    expect(d.uncertaintyNotes.join(" ")).toMatch(/Bungarus multicinctus is a recognised species that Serpent hasn't reviewed yet/);
  });

  it("recognised species and their synonyms take venom from their genus group", () => {
    expect(resolveTaxon({ scientificName: "Echis carinatus" })).toMatchObject({ kind: "taxonomy", group: { id: "genus-echis" } });
    // Old names resolve to the current species through the source's synonyms.
    expect(resolveTaxon({ scientificName: "Enhydrina schistosa" })).toMatchObject({
      kind: "taxonomy",
      record: { genus: "Hydrophis" },
      group: { id: "group-sea-snakes" },
    });
  });

  it("an unrecognised name in a venomous genus uses the genus from the binomial, including genus synonyms", () => {
    expect(resolveTaxon({ scientificName: "Echis notarealspecies" })).toMatchObject({ kind: "group", group: { id: "genus-echis" } });
    // Not a synonym in this source, but Cryptelytrops is a former name of Trimeresurus.
    expect(resolveTaxon({ scientificName: "Cryptelytrops macrops" })).toMatchObject({ kind: "group", group: { id: "genus-trimeresurus" } });
  });

  it("falls back to the family when the genus is unknown", () => {
    expect(resolveTaxon({ scientificName: "Madeupus viperinus", family: "Viperidae" })).toMatchObject({
      kind: "group",
      group: { id: "family-viperidae", venomStatus: "venomous" },
    });
  });

  it("an exact scientific name of a catalog species resolves to that species", () => {
    expect(resolveTaxon({ catalogId: "not_in_catalog", scientificName: "Bungarus  candidus Blyth" })).toMatchObject({
      kind: "species",
      species: { id: "malayan-krait" },
    });
  });

  it("an uncurated colubrid is potentially venomous with venom not assessed, never non-venomous", () => {
    const d = decide(raw({ candidates: [named(0.95, "Ptyas mucosa", "Ptyas", "Colubridae")] }), getCountry("IN"));
    expect(d.status).toBe("unknown_species");
    expect(d.displayVenomStatus).toBe("potentially_venomous");
    expect(d.safety.treatAsDangerous).toBe(true);
    expect(d.alternatives[0]).toMatchObject({
      taxonomySlug: "ptyas-mucosa",
      scientificName: "Ptyas mucosa",
      venomStatus: null,
      venomBasis: "not_assessed",
    });
  });

  it("a model-named species not in our data, in a catalog species' genus, is still not reassuring", () => {
    // Pantherophis guttatus (corn snake) is non-venomous in the catalog; its relatives are not looked up by genus.
    const d = decide(raw({ candidates: [named(0.95, "Pantherophis alleghaniensis", "Pantherophis", "Colubridae")] }), US);
    expect(d.displayVenomStatus).toBe("potentially_venomous");
  });

  it("a plausible venomous genus beside a non-venomous species leads with the venomous one", () => {
    const d = decide(raw({ candidates: [c("laotian-wolf-snake", 0.7), named(0.25, "Bungarus multicinctus", "Bungarus", "Elapidae")] }), TH);
    expect(d.status).toBe("conflicting_evidence");
    expect(d.top).toBeNull();
    expect(d.displayVenomStatus).toBe("potentially_venomous");
    expect(d.alternatives[0].groupId).toBe("genus-bungarus");
  });

  it("every venomous catalog genus and every WHO-listed genus has a venomous fallback", () => {
    for (const s of listSpecies().filter((s) => s.venomStatus === "venomous")) {
      const t = resolveTaxon({ scientificName: `${s.genus} notinourcatalog` });
      expect(t.kind, s.genus).toBe("group");
    }
    for (const [country, ref] of Object.entries(WHO_REFERENCE)) {
      for (const l of ref.listings) {
        const t = resolveTaxon({ scientificName: l.scientificName, genus: l.genus, family: l.family });
        const venomous =
          t.kind === "group" ||
          (t.kind === "taxonomy" && t.group !== null) ||
          (t.kind === "species" && isMedicallySignificant(t.species));
        expect(venomous, `${country}: ${l.scientificName}`).toBe(true);
      }
    }
  });
});

describe("automatic look-alikes", () => {
  const ids = (id: string) => autoLookAlikes(getSpecies(id)!).map((s) => s.id);

  it("pairs species that share a region and a pattern tag but differ in venom class", () => {
    expect(ids("malayan-krait")).toContain("laotian-wolf-snake");
    expect(ids("laotian-wolf-snake")).toContain("malayan-krait");
    expect(ids("corn-snake")).toEqual(expect.arrayContaining(["copperhead", "eastern-diamondback"]));
    expect(ids("checkered-keelback")).toEqual(expect.arrayContaining(["russells-viper", "malayan-pit-viper"]));
  });

  it("ignores species in other regions or of the same venom class", () => {
    expect(ids("malayan-pit-viper")).not.toContain("copperhead"); // same tag, different region, same class
    expect(ids("corn-snake")).not.toContain("malayan-pit-viper"); // same tag, different region
    expect(ids("malayan-pit-viper")).not.toContain("eastern-russells-viper"); // same class
  });

  it("feeds the look-alike warning even without a manual pair", () => {
    // checkered-keelback's manual list only has red-necked-keelback.
    const d = decide(raw({ candidates: [c("checkered-keelback", 0.95)] }), getCountry("IN"));
    expect(d.safety.lookAlike.active).toBe(true);
    expect(d.safety.lookAlike.speciesIds).toContain("russells-viper");
  });
});

describe("non_venomous is only reachable under all strict conditions", () => {
  it("allowed: high band, exact catalog species, nothing venomous or unresolved plausible", () => {
    expect(decide(raw({ candidates: [c("corn-snake", 0.95)] }), US).displayVenomStatus).toBe("non_venomous");
    expect(
      decide(raw({ candidates: [named(0.95, "Pantherophis guttatus", "Pantherophis", "Colubridae")] }), US).displayVenomStatus,
    ).toBe("non_venomous");
  });

  it.each([
    ["band not high (moderate model confidence)", raw({ overall_confidence: "moderate", candidates: [c("corn-snake", 0.95)] })],
    ["band capped by an imperfect photo", raw({ image_quality: { snake_detected: true, snake_count: "one", usable_for_identification: true, issues: ["partially_hidden"] }, candidates: [c("corn-snake", 0.95)] })],
    ["plausible venomous species", raw({ candidates: [c("corn-snake", 0.85), c("copperhead", 0.1)] })],
    ["plausible venomous genus", raw({ candidates: [c("corn-snake", 0.85), named(0.1, "Crotalus horridus", "Crotalus", "Viperidae")] })],
    ["plausible unresolved mass", raw({ candidates: [c("corn-snake", 0.88)] })],
    ["top is not an exact catalog species", raw({ candidates: [named(0.95, "Lampropeltis getula", "Lampropeltis", "Colubridae")] })],
  ])("blocked: %s", (_, analysis) => {
    const d = decide(analysis, US);
    expect(d.displayVenomStatus).not.toBe("non_venomous");
    expect(d.displayVenomStatus).not.toBe("mildly_venomous");
    expect(d.safety.treatAsDangerous).toBe(true);
  });

  it("holds for thousands of random analyses", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    const pool = [
      ...listSpecies().map((s) => c(s.id, 0)),
      named(0, "Bungarus multicinctus", "Bungarus", "Elapidae"),
      named(0, "Ptyas mucosa", "Ptyas", "Colubridae"),
      named(0, null, null, "Viperidae"),
      named(0, null, null, null),
      c("made-up-id", 0),
    ];
    const countries = [null, TH, US, getCountry("AU"), getCountry("GB")];
    let reassuring = 0;

    for (let i = 0; i < 5000; i++) {
      const n = 1 + Math.floor(rand() * 3);
      let left = 1;
      const candidates = Array.from({ length: n }, () => {
        const p = Math.round(rand() * left * 100) / 100;
        left -= p;
        return { ...pick(pool), probability: p };
      });
      const analysis: RawAnalysis = raw({
        overall_confidence: pick(["high", "high", "moderate", "low"] as const),
        candidates,
        image_quality: { snake_detected: true, snake_count: "one", usable_for_identification: rand() > 0.1, issues: rand() > 0.7 ? ["blur"] : [] },
      });
      const country = pick(countries);
      const d = decide(analysis, country);
      if (d.displayVenomStatus !== "non_venomous") continue;
      reassuring++;

      const ranked = rankCandidates(analysis, country);
      const top = ranked[0];
      expect(d.confidenceBand).toBe("high");
      expect(top.taxon.kind).toBe("species");
      expect(d.top?.speciesId).toBe(top.speciesId);
      expect(ranked.filter((r) => r.p >= POLICY.plausibleThreshold && r.taxon.kind !== "unknown" && (r.taxon.kind !== "species" || isMedicallySignificant(r.taxon.species)))).toEqual([]);
      expect(ranked.filter((r) => r.taxon.kind === "unknown").reduce((s, r) => s + r.p, 0)).toBeLessThan(POLICY.plausibleThreshold);
    }
    expect(reassuring).toBeGreaterThan(0); // the generator does reach the reassuring branch
  });
});

describe("unresolved results stay specific", () => {
  // Live regression: a Bungarus multicinctus photo also ranked king cobra at 0.12, and the
  // spitting cobra (a look-alike of the king cobra) leaked its eye-spray advice into a krait result.
  const d = decide(
    raw({
      overall_confidence: "low",
      image_quality: { snake_detected: true, snake_count: "one", usable_for_identification: true, issues: ["partially_hidden"] },
      candidates: [
        named(0.5, "Bungarus multicinctus", "Bungarus", "Elapidae"),
        c("malayan-krait", 0.23),
        c("king-cobra", 0.12),
        c("laotian-wolf-snake", 0.08),
      ],
    }),
    getCountry("MM"),
  );

  it("does not add advice for species that are only look-alikes of look-alikes", () => {
    expect(d.safety.actions.join(" ")).not.toMatch(/spray venom/);
  });

  it("lists the candidates and their other-class look-alikes, not second-degree ones", () => {
    expect(d.safety.lookAlike.speciesIds.sort()).toEqual(["king-cobra", "laotian-wolf-snake", "malayan-krait"]);
  });

  it("still adds spitting-cobra advice when a spitting cobra is itself a candidate", () => {
    const s = decide(raw({ overall_confidence: "low", candidates: [c("indochinese-spitting-cobra", 0.3), c("monocled-cobra", 0.3)] }), TH);
    expect(s.safety.actions[0]).toMatch(/spray venom/);
  });
});
