import "server-only";
import { WHO_REFERENCE } from "@/data/reference/whoMedicallyImportant";
import { COUNTRIES, getCountry } from "@/data/countries";
import { listSpecies } from "./venomDatabase";
import { allTaxonomyRecords, englishName, lookupName, type TaxonomyRecord } from "./taxonomyIndex";
import type { CatalogEntry } from "./providers/types";

/**
 * Country-specific candidate list for the vision prompt: the curated catalog plus
 * recognised species likely to occur in the selected country. It only changes
 * what the model is shown; the safety policy (and geographic weighting) is
 * unchanged, and the model may still name any species outside the list.
 */

export const MAX_CANDIDATES = 300;

/** How each country appears in the source's distribution text (word-boundary matches). */
const COUNTRY_PATTERNS: Record<string, RegExp> = {
  TH: /\bThailand\b/, MY: /\bMalaysia\b/, SG: /\bSingapore\b/, VN: /\bViet ?nam\b/i, PH: /\bPhilippines\b/,
  ID: /\b(Indonesia|Sumatra|Java|Bali|Sulawesi|Kalimantan)\b/, IN: /\bIndia\b/, AU: /\bAustralia\b/,
  US: /\b(USA|United States)\b/, CA: /\bCanada\b/, GB: /\b(United Kingdom|Great Britain|England|Scotland|Wales)\b/,
  DE: /\bGermany\b/, FR: /\bFrance\b/, ZA: /\bSouth Africa\b/, KE: /\bKenya\b/,
  BN: /\bBrunei\b/, KH: /\bCambodia\b/, LA: /\bLaos\b/, MM: /\b(Myanmar|Burma)\b/, TL: /\b(Timor-Leste|East Timor|Timor)\b/,
  AF: /\bAfghanistan\b/, BD: /\bBangladesh\b/, BT: /\bBhutan\b/, MV: /\bMaldives\b/, NP: /\bNepal\b/,
  PK: /\bPakistan\b/, LK: /\bSri Lanka\b/,
};

/** Land (or very close sea) neighbours among the countries Serpent lists. */
const NEIGHBOURS: Record<string, string[]> = {
  TH: ["MM", "LA", "KH", "MY"], MM: ["TH", "LA", "BD", "IN"], LA: ["TH", "MM", "KH", "VN"], KH: ["TH", "LA", "VN"],
  VN: ["LA", "KH"], MY: ["TH", "SG", "BN", "ID"], SG: ["MY", "ID"], BN: ["MY", "ID"], ID: ["MY", "TL", "SG", "BN"],
  TL: ["ID"], PH: ["MY", "ID"], IN: ["PK", "NP", "BT", "BD", "MM", "LK"], BD: ["IN", "MM"], BT: ["IN"], NP: ["IN"],
  PK: ["IN", "AF"], AF: ["PK"], LK: ["IN"], MV: ["IN", "LK"], US: ["CA"], CA: ["US"], DE: ["FR"], FR: ["DE", "GB"], GB: ["FR"],
};

export function countriesInText(text: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  for (const [code, re] of Object.entries(COUNTRY_PATTERNS)) if (re.test(text)) out.add(code);
  return out;
}

/**
 * Genus range table: for each genus, every country named in any of its species'
 * distribution text, plus every country where WHO lists one of its species.
 * The union over a genus also offsets the source's truncated per-species text.
 */
const genusRange = new Map<string, Set<string>>();
function addRange(genus: string, codes: Iterable<string>) {
  const set = genusRange.get(genus) ?? new Set<string>();
  for (const c of codes) set.add(c);
  genusRange.set(genus, set);
}
for (const r of allTaxonomyRecords()) addRange(r.genus, countriesInText(r.distribution));
for (const [code, ref] of Object.entries(WHO_REFERENCE)) {
  for (const l of ref.listings) {
    const rec = l.scientificName.endsWith(" spp.") ? null : lookupName(l.scientificName)?.record;
    addRange(rec?.genus ?? l.genus, [code]);
  }
}

export function genusRangeOf(genus: string): Set<string> {
  return genusRange.get(genus) ?? new Set();
}

function taxonomyEntry(r: TaxonomyRecord): CatalogEntry {
  return {
    id: r.slug,
    commonName: englishName(r) ?? r.name,
    scientificName: r.name,
    genus: r.genus,
    family: r.family,
    keyFeatures: [],
    reviewed: false,
  };
}

/**
 * Curated species first (local ones leading), then species WHO lists as
 * medically important in the country (Category 1 before 2), then species whose
 * own distribution names the country, then species whose genus range covers it
 * (nearby ones first).
 */
export function candidatesForCountry(code: string, max = MAX_CANDIDATES): CatalogEntry[] {
  const country = getCountry(code);
  const curated = listSpecies();
  const local = country ? curated.filter((s) => s.regions.includes(country.region)) : [];
  const entries: CatalogEntry[] = [...local, ...curated.filter((s) => !local.includes(s))].map((s) => ({
    id: s.id,
    commonName: s.commonName,
    scientificName: s.scientificName,
    genus: s.genus,
    family: s.family,
    keyFeatures: s.keyFeatures,
    distribution: s.distribution,
    reviewed: true,
  }));
  const seen = new Set(curated.map((s) => s.scientificName));
  const add = (r: TaxonomyRecord | null | undefined) => {
    if (!r || seen.has(r.name) || entries.length >= max) return;
    seen.add(r.name);
    entries.push(taxonomyEntry(r));
  };

  const who = [...(WHO_REFERENCE[code]?.listings ?? [])].sort((a, b) => a.category - b.category);
  for (const l of who) if (!l.scientificName.endsWith(" spp.")) add(lookupName(l.scientificName)?.record);

  const all = allTaxonomyRecords();
  const named = (r: TaxonomyRecord) => countriesInText(r.distribution);
  for (const r of all) if (named(r).has(code)) add(r);

  // Genus range only: the per-species text may be truncated, so rank these by
  // (1) naming a neighbouring country, then any country in the same region, and
  // (2) how many species of the genus are recorded in this country.
  const localByGenus = new Map<string, number>();
  for (const r of all) if (named(r).has(code)) localByGenus.set(r.genus, (localByGenus.get(r.genus) ?? 0) + 1);
  const neighbours = new Set(NEIGHBOURS[code] ?? []);
  const sameRegion = new Set(COUNTRIES.filter((c) => c.region === country?.region).map((c) => c.code));
  const proximity = (r: TaxonomyRecord) => {
    const where = [...named(r)];
    return where.some((c) => neighbours.has(c)) ? 2 : where.some((c) => sameRegion.has(c)) ? 1 : 0;
  };
  const genusOnly = all
    .filter((r) => genusRangeOf(r.genus).has(code) && !named(r).has(code))
    .sort(
      (a, b) =>
        proximity(b) - proximity(a) ||
        (localByGenus.get(b.genus) ?? 0) - (localByGenus.get(a.genus) ?? 0) ||
        a.name.localeCompare(b.name),
    );
  for (const r of genusOnly) add(r);
  return entries;
}
