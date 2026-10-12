import type { SourceRecord } from "@/types";

/**
 * Source registry. Every record here is a real publication or database, but
 * NONE has been verified by a reviewer yet (lastVerified: null). Before launch,
 * a reviewer must open each source, confirm it supports the claims that cite it,
 * fill in missing URLs, and set lastVerified.
 */
export const SOURCES: SourceRecord[] = [
  {
    id: "who-factsheet",
    title: "Snakebite envenoming (fact sheet)",
    publisher: "World Health Organization",
    url: "https://www.who.int/news-room/fact-sheets/detail/snakebite-envenoming",
    sourceType: "who",
    year: null,
    lastVerified: null,
  },
  {
    id: "who-searo-2016",
    title: "Guidelines for the management of snakebites, 2nd edition",
    publisher: "WHO Regional Office for South-East Asia",
    url: null,
    sourceType: "who",
    year: 2016,
    lastVerified: null,
  },
  {
    id: "who-trs-1004",
    title: "Guidelines for the production, control and regulation of snake antivenom immunoglobulins (TRS 1004, Annex 5)",
    publisher: "World Health Organization",
    url: "https://cdn.who.int/media/docs/default-source/biologicals/blood-products/document-migration/antivenomglrevwho_trs_1004_web_annex_5.pdf",
    sourceType: "who",
    year: 2017,
    lastVerified: null,
  },
  {
    id: "toxinology",
    title: "Clinical Toxinology Resources",
    publisher: "University of Adelaide",
    url: "https://www.toxinology.com",
    sourceType: "university",
    year: null,
    lastVerified: null,
  },
  {
    id: "anzcor-948",
    title: "Guideline 9.4.8: Envenomation – pressure immobilisation technique",
    publisher: "Australian and New Zealand Committee on Resuscitation (ANZCOR)",
    url: null,
    sourceType: "medical_authority",
    year: null,
    lastVerified: null,
  },
  {
    id: "nhs-snake-bites",
    title: "Snake bites",
    publisher: "NHS (UK)",
    url: "https://www.nhs.uk/conditions/snake-bites/",
    sourceType: "medical_authority",
    year: null,
    lastVerified: null,
  },
];

/** Per-species Reptile Database entries are generated from the scientific name. */
export function reptileDatabaseSource(scientificName: string): SourceRecord {
  const [genus, species] = scientificName.split(" ");
  return {
    id: `reptiledb-${genus.toLowerCase()}-${species.toLowerCase()}`,
    title: `${scientificName} — species account`,
    publisher: "The Reptile Database",
    url: `https://reptile-database.reptarium.cz/species?genus=${genus}&species=${species}`,
    sourceType: "database",
    year: null,
    lastVerified: null,
  };
}
