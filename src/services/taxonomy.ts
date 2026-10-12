import { TAXON_GROUPS } from "@/data/taxa";
import type { SpeciesRecord, TaxonGroup } from "@/types";
import { getSpecies, isMedicallySignificant, listSpecies } from "./venomDatabase";
import { NOT_IN_CATALOG } from "./providers/types";
import { binomialOf, getTaxonomyRecord, lookupName, type TaxonomyRecord } from "./taxonomyIndex";

/**
 * Maps whatever the model said to something in our own data, in this order:
 * curated catalog species → recognised species from the full taxonomy (exact,
 * synonym or small-typo match) → genus (or group of genera) → family → unknown.
 * Only our data decides venom status; the model's own claims are never used.
 */

export type Taxon =
  /** fuzzy: matched a curated species only via a corrected typo, so it is not an exact identification. */
  | { kind: "species"; species: SpeciesRecord; fuzzy?: boolean }
  /** A real, recognised species that isn't curated. Venom comes from its genus/family group, or is not assessed (group null). */
  | { kind: "taxonomy"; record: TaxonomyRecord; group: TaxonGroup | null; fuzzy: boolean }
  | { kind: "group"; group: TaxonGroup }
  | { kind: "unknown" };

const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const speciesByName = new Map(listSpecies().map((s) => [norm(s.scientificName), s]));
const groupByGenus = new Map(
  TAXON_GROUPS.filter((g) => g.rank !== "family").flatMap((g) => g.genera.map((name) => [norm(name), g] as const)),
);
const groupByFamily = new Map(TAXON_GROUPS.filter((g) => g.rank === "family").map((g) => [norm(g.name), g]));
const groupById = new Map(TAXON_GROUPS.map((g) => [g.id, g]));

export function getGroup(id: string | null | undefined): TaxonGroup | null {
  return id ? (groupById.get(id) ?? null) : null;
}

/** Venom rules for a genus/family: the matching venomous group, or null when not assessed. */
export function groupFor(genus: string | null | undefined, family: string | null | undefined): TaxonGroup | null {
  return groupByGenus.get(norm(genus)) ?? groupByFamily.get(norm(family)) ?? null;
}

export function resolveTaxon(input: {
  catalogId?: string | null;
  scientificName?: string | null;
  genus?: string | null;
  family?: string | null;
}): Taxon {
  const bySlug = input.catalogId && input.catalogId !== NOT_IN_CATALOG ? getSpecies(input.catalogId) : null;
  if (bySlug) return { kind: "species", species: bySlug };
  // Recognised (uncurated) species from a country candidate list are listed by taxonomy slug.
  const byTaxonomySlug = input.catalogId && input.catalogId !== NOT_IN_CATALOG ? getTaxonomyRecord(input.catalogId) : null;
  if (byTaxonomySlug) {
    const curatedAccepted = speciesByName.get(norm(byTaxonomySlug.name));
    if (curatedAccepted) return { kind: "species", species: curatedAccepted };
    return { kind: "taxonomy", record: byTaxonomySlug, group: groupFor(byTaxonomySlug.genus, byTaxonomySlug.family), fuzzy: false };
  }

  const binomial = binomialOf(input.scientificName);
  const curated = speciesByName.get(binomial);
  if (curated) return { kind: "species", species: curated };

  const match = lookupName(input.scientificName);
  if (match) {
    const { record, fuzzy } = match;
    const curatedAccepted = speciesByName.get(norm(record.name));
    if (curatedAccepted) return { kind: "species", species: curatedAccepted, fuzzy };
    return { kind: "taxonomy", record, group: groupFor(record.genus, record.family), fuzzy };
  }

  // Unrecognised name: never confirmed. Fall back to the genus/family the model gave.
  const genusName = norm(input.genus) || binomial.split(" ")[0];
  const byGenus = groupByGenus.get(genusName);
  if (byGenus) return { kind: "group", group: byGenus };

  const byFamily = groupByFamily.get(norm(input.family));
  if (byFamily) return { kind: "group", group: byFamily };

  return { kind: "unknown" };
}

/**
 * Look-alikes with a different venom class: species that share a region and a
 * pattern tag. Derived from data so new catalog entries get them for free.
 */
export function autoLookAlikes(species: SpeciesRecord): SpeciesRecord[] {
  const significant = isMedicallySignificant(species);
  return listSpecies().filter(
    (other) =>
      other.id !== species.id &&
      isMedicallySignificant(other) !== significant &&
      other.regions.some((r) => species.regions.includes(r)) &&
      other.patternTags.some((t) => species.patternTags.includes(t)),
  );
}

/** Manual similarSpeciesIds plus automatic look-alikes, without duplicates. */
export function lookAlikesOf(species: SpeciesRecord): SpeciesRecord[] {
  const manual = species.similarSpeciesIds
    .map((id) => getSpecies(id))
    .filter((s): s is SpeciesRecord => Boolean(s));
  const seen = new Set<string>();
  return [...manual, ...autoLookAlikes(species)].filter((s) => !seen.has(s.id) && seen.add(s.id));
}
