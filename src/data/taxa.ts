import type { MedicalRisk, TaxonGroup } from "@/types";

/**
 * Fail-safe taxon groups — DRAFT.
 *
 * When the model names a snake that is not in the species catalog, the server
 * falls back from species to genus (or a group of genera) to family. Every
 * group here is a medically significant venomous taxon, so an unrecognised
 * species in one of these genera is still treated as venomous. Non-venomous
 * genera deliberately have no entry: they resolve to "unknown", which the
 * safety policy shows as potentially venomous.
 *
 * Genus lists follow WHO TRS 1004 Annex 5, Appendix 1 (medically important
 * species by country). Synonyms follow its Table A5.1 where it gives them.
 * medicalRisk is a conservative editorial value for the whole group and must
 * be reviewed; it is never used to reassure.
 */

const WHO = "who-trs-1004";
const TOX = "toxinology";

function genus(
  name: string,
  commonName: string,
  family: string,
  opts: { synonyms?: string[]; medicalRisk?: MedicalRisk; note?: string; sourceIds?: string[] } = {},
): TaxonGroup {
  return {
    id: `genus-${name.toLowerCase()}`,
    rank: "genus",
    name,
    commonName,
    family,
    genera: [name, ...(opts.synonyms ?? [])],
    venomStatus: "venomous",
    medicalRisk: opts.medicalRisk ?? "high",
    note: opts.note ?? `All ${commonName.toLowerCase()} are treated as dangerously venomous until the species is confirmed.`,
    sourceIds: opts.sourceIds ?? [WHO, TOX],
    reviewStatus: "draft",
  };
}

export const TAXON_GROUPS: TaxonGroup[] = [
  // ───────────── Elapidae ─────────────
  genus("Bungarus", "Kraits", "Elapidae", { medicalRisk: "very_high" }),
  genus("Naja", "Cobras", "Elapidae", { synonyms: ["Boulengerina"] }),
  genus("Ophiophagus", "King cobras", "Elapidae", { medicalRisk: "very_high" }),
  genus("Dendroaspis", "Mambas", "Elapidae", { medicalRisk: "very_high" }),
  genus("Hemachatus", "Rinkhals", "Elapidae"),
  genus("Pseudohaje", "Tree cobras", "Elapidae"),
  genus("Calliophis", "Asian coral snakes", "Elapidae"),
  genus("Micrurus", "Coral snakes (Americas)", "Elapidae"),
  genus("Pseudonaja", "Brown snakes", "Elapidae", { medicalRisk: "very_high" }),
  genus("Oxyuranus", "Taipans", "Elapidae", { medicalRisk: "very_high" }),
  genus("Notechis", "Tiger snakes", "Elapidae", { medicalRisk: "very_high" }),
  genus("Acanthophis", "Death adders", "Elapidae"),
  genus("Pseudechis", "Black snakes", "Elapidae"),
  genus("Austrelaps", "Australian copperheads", "Elapidae"),
  genus("Hoplocephalus", "Broad-headed snakes", "Elapidae"),
  genus("Tropidechis", "Rough-scaled snake", "Elapidae"),
  genus("Micropechis", "New Guinea small-eyed snake", "Elapidae"),
  {
    id: "group-sea-snakes",
    rank: "group",
    name: "Hydrophiinae (sea snakes)",
    commonName: "Sea snakes and sea kraits",
    family: "Elapidae",
    genera: [
      "Hydrophis", "Laticauda", "Aipysurus", "Emydocephalus", "Microcephalophis", "Hydrelaps", "Ephalophis", "Parahydrophis",
      // Former genera now placed in Hydrophis, still common in older references.
      "Enhydrina", "Pelamis", "Lapemis", "Astrotia", "Acalyptophis", "Kerilia", "Thalassophina", "Disteira",
    ],
    venomStatus: "venomous",
    medicalRisk: "high",
    note: "Sea snakes have potent venom. WHO notes several marine species can cause illness or death, though they are not in its country tables.",
    sourceIds: [WHO, TOX],
    reviewStatus: "draft",
  },

  // ───────────── Viperidae ─────────────
  genus("Daboia", "Russell's vipers and relatives", "Viperidae", { medicalRisk: "very_high" }),
  genus("Echis", "Saw-scaled vipers", "Viperidae", { medicalRisk: "very_high" }),
  genus("Calloselasma", "Malayan pit viper", "Viperidae"),
  genus("Trimeresurus", "Asian pit vipers", "Viperidae", {
    synonyms: ["Cryptelytrops", "Parias", "Popeia", "Viridovipera", "Craspedocephalus"],
  }),
  genus("Protobothrops", "Lance-headed pit vipers", "Viperidae", { synonyms: ["Zhaoermia", "Ermia"] }),
  genus("Deinagkistrodon", "Hundred-pace viper", "Viperidae"),
  genus("Tropidolaemus", "Temple pit vipers", "Viperidae"),
  genus("Hypnale", "Hump-nosed pit vipers", "Viperidae"),
  genus("Gloydius", "Asian moccasins", "Viperidae"),
  genus("Himalayophis", "Himalayan pit viper", "Viperidae"),
  genus("Macrovipera", "Blunt-nosed vipers", "Viperidae"),
  genus("Eristicophis", "McMahon's viper", "Viperidae"),
  genus("Bothrops", "Lanceheads", "Viperidae", { medicalRisk: "very_high" }),
  genus("Crotalus", "Rattlesnakes", "Viperidae"),
  genus("Sistrurus", "Pygmy rattlesnakes and massasaugas", "Viperidae"),
  genus("Agkistrodon", "Copperheads and cottonmouths", "Viperidae"),
  genus("Bitis", "Puff adders and relatives", "Viperidae"),
  genus("Atheris", "Bush vipers", "Viperidae"),
  genus("Vipera", "Eurasian vipers and adders", "Viperidae", { medicalRisk: "moderate" }),

  // ───────────── Dangerous rear-fanged and burrowing snakes ─────────────
  genus("Atractaspis", "Burrowing asps (stiletto snakes)", "Atractaspididae"),
  genus("Dispholidus", "Boomslang", "Colubridae"),
  genus("Thelotornis", "Twig snakes", "Colubridae"),
  genus("Rhabdophis", "Asian keelbacks (Rhabdophis)", "Colubridae"),

  // ───────────── Family fallbacks ─────────────
  family("Elapidae", "Cobras, kraits, mambas, coral snakes, sea snakes and relatives"),
  family("Viperidae", "Vipers and pit vipers"),
  family(
    "Atractaspididae",
    "Burrowing asps and relatives",
    "Includes medically significant burrowing asps (Atractaspis); the whole family is treated as venomous as a fail-safe.",
  ),
];

function family(name: string, commonName: string, note?: string): TaxonGroup {
  return {
    id: `family-${name.toLowerCase()}`,
    rank: "family",
    name,
    commonName,
    family: name,
    genera: [],
    venomStatus: "venomous",
    medicalRisk: "high",
    note: note ?? `Every member of ${name} is venomous; many are medically significant.`,
    sourceIds: [TOX],
    reviewStatus: "draft",
  };
}
