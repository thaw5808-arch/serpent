import { SPECIES } from "@/data/species/catalog";
import { SOURCES, reptileDatabaseSource } from "@/data/sources";
import type { MedicalRisk, RegionCode, SourceRecord, SpeciesRecord, VenomStatus, VenomType } from "@/types";

/**
 * Read access to the curated species + venom knowledge base.
 * Static TypeScript data is the reviewed source of truth (version-controlled,
 * diffable in PRs). `npm run db:seed` mirrors it into Postgres for future
 * admin tooling; swap the implementation here when that becomes the source.
 */

const byId = new Map(SPECIES.map((s) => [s.id, s]));

export function listSpecies(): SpeciesRecord[] {
  return SPECIES;
}

export function getSpecies(id: string | null | undefined): SpeciesRecord | null {
  if (!id) return null;
  return byId.get(id) ?? null;
}

export function getSourcesFor(species: SpeciesRecord): SourceRecord[] {
  const curated = species.sourceIds
    .map((id) => SOURCES.find((s) => s.id === id))
    .filter((s): s is SourceRecord => Boolean(s));
  return [reptileDatabaseSource(species.scientificName), ...curated];
}

export function getSource(id: string): SourceRecord | null {
  return SOURCES.find((s) => s.id === id) ?? null;
}

export interface SpeciesFilter {
  query?: string;
  region?: RegionCode | "";
  venomStatus?: VenomStatus | "";
  venomType?: VenomType | "";
  highRiskOnly?: boolean;
}

const HIGH: MedicalRisk[] = ["high", "very_high"];

export function filterSpecies(all: SpeciesRecord[], f: SpeciesFilter): SpeciesRecord[] {
  const q = f.query?.trim().toLowerCase() ?? "";
  return all.filter((s) => {
    if (q) {
      const hay = [s.commonName, s.scientificName, s.family, ...(s.otherNames ?? []), s.distribution]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.region && !s.regions.includes(f.region)) return false;
    if (f.venomStatus && s.venomStatus !== f.venomStatus) return false;
    if (f.venomType && !s.venomTypes.includes(f.venomType)) return false;
    if (f.highRiskOnly && !HIGH.includes(s.medicalRisk)) return false;
    return true;
  });
}

/** Ordering of danger, used for worst-case reasoning. */
export const VENOM_SEVERITY: Record<VenomStatus, number> = {
  non_venomous: 0,
  mildly_venomous: 1,
  unknown: 2,
  venomous: 3,
};

export function isMedicallySignificant(s: SpeciesRecord): boolean {
  return s.venomStatus === "venomous" || s.venomStatus === "unknown";
}
