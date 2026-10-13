import type { CandidateView, MedicalRisk, VenomStatus } from "@/types";
import { resolveTaxon } from "@/services/taxonomy";
import { englishName } from "@/services/taxonomyIndex";
import { isMedicallySignificant } from "@/services/venomDatabase";
import type { GbifSpecies } from "./gbif";

/*
 * Turns GBIF's species list into rows for the page. GBIF supplies only names and
 * counts; venom status and medical risk always come from our own data, through the
 * same resolver the identifier uses: curated catalog, then the full taxonomy
 * (exact, synonym or near-typo), then the genus/family venom groups. A name none of
 * them knows, or a recognised species with no venom group, is "not assessed" and
 * shown as potentially venomous, never as harmless.
 */

export interface NearbySnake {
  /** Stable id: our species/taxonomy/group id, or the GBIF key when nothing matched. */
  id: string;
  kind: "species" | "taxonomy" | "group" | "unresolved";
  /** English common name as recorded (never translated); null when there is none. */
  commonName: string | null;
  /** Accepted scientific name (ours when matched, GBIF's otherwise). */
  scientificName: string;
  /** Our venom status; null = not assessed. */
  venomStatus: VenomStatus | null;
  venomBasis: CandidateView["venomBasis"];
  venomGroup: CandidateView["venomGroup"];
  /** Our medical-risk classification; null = not assessed. */
  medicalRisk: MedicalRisk | null;
  /** Shown under "Dangerous snakes recorded here". */
  dangerous: boolean;
  /** Our species page, when there is one. */
  href: string | null;
  records: number;
  lastYear: number | null;
  /** GBIF species keys behind this row (several when GBIF names are synonyms of one species). */
  gbifKeys: number[];
}

/**
 * Most dangerous first. An unknown risk for a venomous snake ranks above the known
 * moderate and low ones, so missing data never pushes a venomous snake down the list.
 */
const RISK_ORDER: Record<MedicalRisk, number> = { very_high: 0, high: 1, unknown: 2, moderate: 3, low: 4 };

export function classifySpecies(g: GbifSpecies): NearbySnake {
  const counts = { records: g.records, lastYear: g.lastYear, gbifKeys: [g.speciesKey] };
  const taxon = resolveTaxon({ scientificName: g.name, genus: g.genus, family: g.family });

  if (taxon.kind === "species") {
    const s = taxon.species;
    return {
      id: s.id,
      kind: "species",
      commonName: s.commonName,
      scientificName: s.scientificName,
      venomStatus: s.venomStatus,
      venomBasis: "species",
      venomGroup: null,
      medicalRisk: s.medicalRisk,
      dangerous: isMedicallySignificant(s),
      href: `/species/${s.id}`,
      ...counts,
    };
  }

  if (taxon.kind === "taxonomy") {
    const { record, group } = taxon;
    return {
      id: record.slug,
      kind: "taxonomy",
      commonName: englishName(record),
      scientificName: record.name,
      venomStatus: group ? group.venomStatus : null,
      venomBasis: group ? (group.rank === "family" ? "family" : "genus") : "not_assessed",
      venomGroup: group ? { name: group.name, commonName: group.commonName, rank: group.rank } : null,
      medicalRisk: group ? group.medicalRisk : null,
      dangerous: group !== null,
      href: `/species/${record.slug}`,
      ...counts,
    };
  }

  if (taxon.kind === "group") {
    const group = taxon.group;
    return {
      id: `gbif-${g.speciesKey}`,
      kind: "group",
      commonName: null,
      scientificName: g.name,
      venomStatus: group.venomStatus,
      venomBasis: group.rank === "family" ? "family" : "genus",
      venomGroup: { name: group.name, commonName: group.commonName, rank: group.rank },
      medicalRisk: group.medicalRisk,
      dangerous: true,
      href: null,
      ...counts,
    };
  }

  return {
    id: `gbif-${g.speciesKey}`,
    kind: "unresolved",
    commonName: null,
    scientificName: g.name,
    venomStatus: null,
    venomBasis: "unresolved",
    venomGroup: null,
    medicalRisk: null,
    dangerous: false,
    href: null,
    ...counts,
  };
}

export interface NearbySnakes {
  dangerous: NearbySnake[];
  other: NearbySnake[];
}

/** Several GBIF names can be one of our species (synonyms): add their records together. */
function merge(rows: NearbySnake[]): NearbySnake[] {
  const byId = new Map<string, NearbySnake>();
  for (const r of rows) {
    const seen = byId.get(r.id);
    if (!seen) byId.set(r.id, { ...r, gbifKeys: [...r.gbifKeys] });
    else {
      seen.records += r.records;
      seen.gbifKeys.push(...r.gbifKeys);
      seen.lastYear = Math.max(seen.lastYear ?? 0, r.lastYear ?? 0) || null;
    }
  }
  return [...byId.values()];
}

const byName = (a: NearbySnake, b: NearbySnake) => a.scientificName.localeCompare(b.scientificName);

/** Dangerous snakes by medical risk, then records; everything else by records. */
export function classifyArea(species: GbifSpecies[]): NearbySnakes {
  const rows = merge(species.map(classifySpecies));
  const dangerous = rows
    .filter((r) => r.dangerous)
    .sort((a, b) => RISK_ORDER[a.medicalRisk ?? "unknown"] - RISK_ORDER[b.medicalRisk ?? "unknown"] || b.records - a.records || byName(a, b));
  const other = rows.filter((r) => !r.dangerous).sort((a, b) => b.records - a.records || byName(a, b));
  return { dangerous, other };
}
