import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import taxonomy from "@/data/taxonomy.json";
import { decide } from "@/services/safetyService";
import { resolveTaxon } from "@/services/taxonomy";
import { lookupName, searchTaxonomy, TAXONOMY_SOURCE, type TaxonomyRecord } from "@/services/taxonomyIndex";
import { listSpecies } from "@/services/venomDatabase";
import { getCountry } from "@/data/countries";
import { raw, c } from "./helpers";

const RECORDS = taxonomy.species as TaxonomyRecord[];
const named = (probability: number, scientific_name: string | null, genus: string | null = null, family: string | null = null) => ({
  ...c("not_in_catalog", probability),
  scientific_name,
  genus,
  family,
});

describe("imported taxonomy", () => {
  it("covers the recognised snake species with source, licence and version recorded", () => {
    expect(RECORDS.length).toBeGreaterThan(4000);
    expect(TAXONOMY_SOURCE.license).toBe("CC BY 4.0");
    expect(TAXONOMY_SOURCE.version).toMatch(/^\d{4}-\d{2}$/);
    expect(TAXONOMY_SOURCE.attribution).toMatch(/Uetz/);
    for (const r of RECORDS) expect(r.name && r.genus && r.family, r.slug).toBeTruthy();
  });

  it("contains every curated species under its accepted name", () => {
    const names = new Set(RECORDS.map((r) => r.name));
    for (const s of listSpecies()) expect(names.has(s.scientificName), s.scientificName).toBe(true);
  });

  it("taxonomy slugs never collide with curated species ids", () => {
    const curated = new Set(listSpecies().map((s) => s.id));
    expect(RECORDS.filter((r) => curated.has(r.slug))).toEqual([]);
  });
});

describe("resolution order", () => {
  it("curated catalog species first, by id, name or synonym", () => {
    expect(resolveTaxon({ catalogId: "malayan-krait" })).toMatchObject({ kind: "species", species: { id: "malayan-krait" } });
    expect(resolveTaxon({ scientificName: "Bungarus candidus" })).toMatchObject({ kind: "species", species: { id: "malayan-krait" } });
    // A synonym in the taxonomy whose accepted species is curated → the curated record.
    expect(resolveTaxon({ scientificName: "Coluber candidus" })).toMatchObject({ kind: "species", species: { id: "malayan-krait" }, fuzzy: false });
  });

  it("then a recognised taxonomy species, then genus group, then family group, then unknown", () => {
    expect(resolveTaxon({ scientificName: "Bungarus multicinctus" })).toMatchObject({ kind: "taxonomy", record: { slug: "bungarus-multicinctus" } });
    expect(resolveTaxon({ scientificName: "Bungarus notarealspecies" })).toMatchObject({ kind: "group", group: { id: "genus-bungarus" } });
    expect(resolveTaxon({ scientificName: "Notarealgenus notreal", family: "Elapidae" })).toMatchObject({ kind: "group", group: { id: "family-elapidae" } });
    expect(resolveTaxon({ scientificName: "Notarealgenus notreal", family: "Colubridae" })).toEqual({ kind: "unknown" });
  });

  it("an ambiguous synonym (shared by several species) never confirms a species", () => {
    expect(lookupName("Typhlops tornieri")).toBeNull();
  });
});

describe("fuzzy matching", () => {
  it("corrects small typos in the epithet or the genus", () => {
    expect(lookupName("Bungarus multicintus")).toMatchObject({ record: { name: "Bungarus multicinctus" }, fuzzy: true });
    expect(lookupName("Bungarsu multicinctus")).toMatchObject({ record: { name: "Bungarus multicinctus" }, fuzzy: true });
    expect(resolveTaxon({ scientificName: "Bungarus candidis" })).toMatchObject({ kind: "species", species: { id: "malayan-krait" }, fuzzy: true });
  });

  it("explains the correction instead of silently replacing the model's name", () => {
    const d = decide(raw({ candidates: [named(0.85, "Bungarus multicintus", "Bungarus", "Elapidae")] }), getCountry("MM"));
    expect(d.alternatives[0]).toMatchObject({ scientificName: "Bungarus multicinctus", namedAs: "Bungarus multicintus" });
    expect(d.uncertaintyNotes.join(" ")).toMatch(/The AI wrote "Bungarus multicintus"; the closest recognised name is Bungarus multicinctus/);
  });

  it("a typo-corrected match to a curated non-venomous species is never reassuring", () => {
    const d = decide(raw({ candidates: [named(0.95, "Pantherophis gutatus", "Pantherophis", "Colubridae")] }), getCountry("US"));
    expect(d.top?.speciesId).toBe("corn-snake");
    expect(d.displayVenomStatus).toBe("potentially_venomous");
  });

  it("does not stretch to distant names", () => {
    expect(lookupName("Bungarus fantasticus")).toBeNull();
    expect(lookupName("Naja na")).toBeNull();
  });
});

describe("invented names", () => {
  it("an invented genus and species is unresolved and potentially venomous; the name is never shown as a species", () => {
    expect(resolveTaxon({ scientificName: "Fakeophis inventus", genus: "Fakeophis", family: "Fakeidae" })).toEqual({ kind: "unknown" });
    const d = decide(raw({ candidates: [named(0.9, "Fakeophis inventus", "Fakeophis", "Fakeidae")] }), null);
    expect(d.displayVenomStatus).toBe("potentially_venomous");
    expect(d.top).toBeNull();
    for (const a of d.alternatives) {
      expect(a.label).not.toMatch(/Fakeophis/);
      expect(a.scientificName).toBeNull();
    }
    expect(d.uncertaintyNotes.join(" ")).toMatch(/"Fakeophis inventus", which isn't a recognised snake name/);
  });

  it("an invented species in a venomous genus falls back to the genus without confirming the name", () => {
    const d = decide(raw({ candidates: [named(0.9, "Bungarus fantasticus", "Bungarus", "Elapidae")] }), null);
    expect(d.alternatives[0]).toMatchObject({ groupId: "genus-bungarus", scientificName: "Bungarus sp.", taxonomySlug: null });
    expect(d.displayVenomStatus).toBe("venomous");
  });
});

describe("uncurated species are never non-venomous", () => {
  it("every uncurated colubrid, at high confidence, is potentially venomous", () => {
    const curated = new Set(listSpecies().map((s) => s.scientificName));
    const colubrids = RECORDS.filter((r) => r.family === "Colubridae" && !curated.has(r.name));
    expect(colubrids.length).toBeGreaterThan(2000);
    for (const r of colubrids) {
      const d = decide(raw({ candidates: [named(0.97, r.name, r.genus, r.family)] }), null);
      expect(d.displayVenomStatus, r.name).not.toBe("non_venomous");
      expect(d.displayVenomStatus, r.name).not.toBe("mildly_venomous");
      expect(d.safety.treatAsDangerous, r.name).toBe(true);
    }
  });
});

describe("search", () => {
  it("finds species by scientific name, common name and synonym", () => {
    expect(searchTaxonomy("multicinctus").map((h) => h.slug)).toContain("bungarus-multicinctus");
    expect(searchTaxonomy("many-banded krait").map((h) => h.slug)).toContain("bungarus-multicinctus");
    expect(searchTaxonomy("Enhydrina schistosa").map((h) => h.slug)).toContain("hydrophis-schistosus");
  });
});

describe("taxonomy stays out of client bundles", () => {
  const SRC = resolve(__dirname, "../src");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(tsx?|json)$/.test(f) ? [p] : [];
    });
  const resolveImport = (from: string, spec: string): string | null => {
    const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
    if (!base) return null;
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(cand) && statSync(cand).isFile()) return cand;
    return null;
  };
  const importsOf = (file: string) =>
    file.endsWith(".json")
      ? []
      : [...readFileSync(file, "utf8").matchAll(/(?:import|export)\s[^"']*?from\s+["']([^"']+)["']/g)]
          .filter((m) => !/^\s*(?:import|export)\s+type\s/.test(m[0]))
          .map((m) => resolveImport(file, m[1]))
          .filter((p): p is string => p !== null);

  it("no client component reaches the taxonomy data through its imports", () => {
    const forbidden = [join(SRC, "data/taxonomy.json"), join(SRC, "services/taxonomyIndex.ts")];
    const clientEntries = files(SRC).filter((f) => !f.endsWith(".json") && /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
    expect(clientEntries.length).toBeGreaterThan(0);
    for (const entry of clientEntries) {
      const seen = new Set<string>();
      const stack = [entry];
      while (stack.length) {
        const f = stack.pop()!;
        if (seen.has(f)) continue;
        seen.add(f);
        expect(forbidden, `${entry} imports ${f}`).not.toContain(f);
        stack.push(...importsOf(f));
      }
    }
  });

  it("the index module is marked server-only, so a client import fails the build", () => {
    expect(readFileSync(join(SRC, "services/taxonomyIndex.ts"), "utf8")).toMatch(/^import "server-only";/);
  });

  it("the built client JavaScript contains no taxonomy data (when a build exists)", () => {
    const STATIC = resolve(__dirname, "../.next/static");
    if (!existsSync(STATIC)) return;
    const js = files(STATIC).filter((f) => f.endsWith(".js"));
    // A synonym and a slug that only exist in the imported taxonomy, never in curated data.
    for (const f of js) {
      const text = readFileSync(f, "utf8");
      expect(text.includes("Ophryas acanthophis"), f).toBe(false);
      expect(text.includes("acanthophis-antarcticus"), f).toBe(false);
    }
  });
});
