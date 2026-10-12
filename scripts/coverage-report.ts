/**
 * Coverage report: for every country in COUNTRIES, which medically important
 * snakes (WHO TRS 1004, Annex 5, Appendix 1, Categories 1 and 2) are missing
 * from the species catalog, and what the safety layer falls back to for them.
 *
 *   npm run coverage-report            # print the report
 *   npm run coverage-report -- --stubs # also write data-gaps/species-stubs.json
 *
 * Stubs carry only the name, genus, family and venom class from the WHO list.
 * They are flagged "needs_sourcing" and are NOT loaded by the app: every other
 * field must be written from a cited source before a stub becomes a catalog entry.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { COUNTRIES } from "@/data/countries";
import { WHO_REFERENCE } from "@/data/reference/whoMedicallyImportant";
import { resolveTaxon } from "@/services/taxonomy";

interface Stub {
  scientificName: string;
  genus: string;
  family: string;
  venomStatus: "venomous";
  whoCategoryByCountry: Record<string, 1 | 2>;
  status: "needs_sourcing";
}

const writeStubs = process.argv.includes("--stubs");
const stubs = new Map<string, Stub>();
const lines: string[] = ["# Catalog coverage against WHO medically important snakes", ""];
let totalMissing = 0;

for (const country of COUNTRIES) {
  const ref = WHO_REFERENCE[country.code];
  lines.push(`## ${country.name} (${country.code})`);
  if (country.emergency.length === 0) lines.push("- Emergency numbers: none verified yet (generic text shown).");
  if (!ref) {
    lines.push("- No WHO reference transcribed for this country.", "");
    continue;
  }
  if (ref.caveat) lines.push(`- Source note: ${ref.caveat}`);

  const covered: string[] = [];
  const missing: string[] = [];
  for (const l of ref.listings) {
    const genusLevel = l.scientificName.endsWith(" spp.");
    const t = resolveTaxon({ scientificName: genusLevel ? null : l.scientificName, genus: l.genus, family: l.family });
    const where = l.note ? ` (${l.note})` : "";
    if (t.kind === "species") {
      covered.push(`${l.scientificName} → ${t.species.id}`);
      continue;
    }
    const fallback =
      t.kind === "group"
        ? `falls back to ${t.group.id}`
        : t.kind === "taxonomy"
          ? t.group
            ? `recognised species (taxonomy), venom from ${t.group.id}`
            : "recognised species (taxonomy), NO VENOM FALLBACK"
          : "NO FALLBACK";
    missing.push(`  - Cat ${l.category}: ${l.scientificName}${where} — ${genusLevel ? "genus-level listing, " : ""}${fallback}`);
    if (genusLevel) continue;
    totalMissing++;
    const stub = stubs.get(l.scientificName) ?? {
      scientificName: l.scientificName,
      genus: l.genus,
      family: l.family,
      venomStatus: "venomous" as const,
      whoCategoryByCountry: {},
      status: "needs_sourcing" as const,
    };
    stub.whoCategoryByCountry[country.code] = l.category;
    stubs.set(l.scientificName, stub);
  }

  lines.push(`- WHO listings: ${ref.listings.length}, in catalog: ${covered.length}, missing: ${missing.length}`);
  if (covered.length) lines.push(`- In catalog: ${covered.join("; ")}`);
  if (missing.length) lines.push("- Missing:", ...missing);
  lines.push("");
}

const unique = [...stubs.values()].sort(
  (a, b) => Object.keys(b.whoCategoryByCountry).length - Object.keys(a.whoCategoryByCountry).length || a.scientificName.localeCompare(b.scientificName),
);
lines.push(
  "## Summary",
  `- Missing country listings: ${totalMissing}; distinct species: ${unique.length}`,
  "- Most widespread gaps first:",
  ...unique.slice(0, 15).map((s) => `  - ${s.scientificName} (${Object.keys(s.whoCategoryByCountry).length} countries)`),
  "",
  "Source: WHO TRS 1004 (2017), Annex 5, Appendix 1. See src/data/reference/whoMedicallyImportant.ts.",
);
console.log(lines.join("\n"));

if (writeStubs) {
  mkdirSync("data-gaps", { recursive: true });
  writeFileSync("data-gaps/species-stubs.json", JSON.stringify(unique, null, 2) + "\n");
  console.error(`\nWrote ${unique.length} stubs to data-gaps/species-stubs.json (needs sourcing; not loaded by the app).`);
}
