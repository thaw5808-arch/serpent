/**
 * Imports every currently recognised snake species from The Reptile Database
 * into src/data/taxonomy.json (server-side lookup data; never sent to browsers).
 *
 * Source: the Reptile Database's own release on ChecklistBank (dataset 1008), in
 * Catalogue of Life Data Package (ColDP) format. That release is published by the
 * database's editors under CC BY. The Excel checklists on reptile-database.org
 * carry no licence statement, so they are deliberately NOT supported here.
 *
 *   1. Download https://api.checklistbank.org/dataset/1008/archive.zip
 *   2. Unzip it into data-sources/reptiledb/archive/   (gitignored)
 *   3. npm run import-taxonomy  [-- --dir data-sources/reptiledb/archive]
 *
 * Nothing is invented: fields the source doesn't have are left out. The script
 * refuses to run if the archive's licence is not CC BY or CC0.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dirArg = process.argv.indexOf("--dir");
const dir = dirArg >= 0 ? process.argv[dirArg + 1] : "data-sources/reptiledb/archive";
const OUT = "src/data/taxonomy.json";

/**
 * The source's higher classification has no "Serpentes" node (snake families sit
 * beside lizard families), so snakes are selected by family. Every Squamata family
 * must be listed in one of these two sets; an unlisted family stops the import, so
 * a new source release can't silently add or drop snakes.
 */
const SNAKE_FAMILIES = new Set([
  "Acrochordidae", "Aniliidae", "Anomalepididae", "Anomochilidae", "Atractaspididae", "Boidae", "Bolyeriidae",
  "Colubridae", "Cyclocoridae", "Cylindrophiidae", "Elapidae", "Gerrhopilidae", "Homalopsidae", "Lamprophiidae",
  "Leptotyphlopidae", "Loxocemidae", "Micrelapidae", "Pareidae", "Prosymnidae", "Psammodynastidae", "Psammophiidae",
  "Pseudaspididae", "Pseudoxyrhophiidae", "Pythonidae", "Tropidophiidae", "Typhlopidae", "Uropeltidae", "Viperidae",
  "Xenodermidae", "Xenopeltidae", "Xenophidiidae", "Xenotyphlopidae",
]);
const NON_SNAKE_SQUAMATA = new Set([
  // Lizards
  "Agamidae", "Alopoglossidae", "Anguidae", "Anolidae", "Carphodactylidae", "Chamaeleonidae", "Cordylidae",
  "Corytophanidae", "Crotaphytidae", "Dibamidae", "Diplodactylidae", "Diploglossidae", "Eublepharidae", "Gekkonidae",
  "Gerrhosauridae", "Gymnophthalmidae", "Helodermatidae", "Hoplocercidae", "Iguanidae", "Lacertidae", "Lanthanotidae",
  "Leiocephalidae", "Leiosauridae", "Liolaemidae", "Opluridae", "Phrynosomatidae", "Phyllodactylidae", "Polychrotidae",
  "Pygopodidae", "Scincidae", "Shinisauridae", "Sphaerodactylidae", "Teiidae", "Tropiduridae", "Varanidae",
  "Xantusiidae", "Xenosauridae",
  // Amphisbaenians (worm lizards)
  "Amphisbaenidae", "Bipedidae", "Blanidae", "Cadeidae", "Rhineuridae", "Trogonophidae",
]);

type Row = Record<string, string>;

function readTsv(file: string): Row[] {
  const path = join(dir, file);
  if (!existsSync(path)) throw new Error(`Missing ${path}. See the instructions at the top of scripts/import-taxonomy.ts.`);
  const [header, ...lines] = readFileSync(path, "utf8").split("\n");
  const cols = header.replace(/\r$/, "").split("\t");
  return lines
    .filter((l) => l.trim())
    .map((l) => {
      const values = l.replace(/\r$/, "").split("\t");
      return Object.fromEntries(cols.map((c, i) => [c, values[i] ?? ""]));
    });
}

/** Just enough YAML for the flat keys we record (title, version, license, …). */
function readMetadata(): Record<string, string> {
  const text = readFileSync(join(dir, "metadata.yaml"), "utf8");
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([a-zA-Z]+):\s*(.+)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "").trim();
  }
  return out;
}

const meta = readMetadata();
const license = (meta.license ?? "").toLowerCase();
const LICENSES: Record<string, string> = {
  "cc by": "CC BY 4.0",
  "cc0": "CC0 1.0",
};
const LICENSE_URLS: Record<string, string> = {
  "cc by": "https://creativecommons.org/licenses/by/4.0/",
  "cc0": "https://creativecommons.org/publicdomain/zero/1.0/",
};
if (!LICENSES[license]) {
  console.error(`Stopping: the archive's licence is "${meta.license ?? "missing"}", not CC BY or CC0. Check before importing.`);
  process.exit(1);
}

const names = new Map(readTsv("Name.tsv").map((n) => [n.id, n]));
const taxa = new Map(readTsv("Taxon.tsv").map((t) => [t.id, t]));

/** Rank and name of a taxon. One family in the source has no Name row; its name is taken from its own source link. */
function nameOf(t: Row): { rank: string; name: string } | null {
  const n = names.get(t.name_id);
  if (n) return { rank: n.rank, name: n.scientific_name };
  const fromLink = t.link.match(/[?&]taxon=([A-Za-z]+)/)?.[1];
  return fromLink?.endsWith("idae") ? { rank: "family", name: fromLink } : null;
}

function ancestor(t: Row, rank: string): string | null {
  for (let p = taxa.get(t.parent_id); p; p = taxa.get(p.parent_id)) {
    const n = nameOf(p);
    if (n?.rank === rank) return n.name;
  }
  return null;
}

// Every Squamata family must be classified as snake or not.
for (const t of taxa.values()) {
  const n = nameOf(t);
  if (n?.rank !== "family" || ancestor(t, "order") !== "Squamata") continue;
  if (!SNAKE_FAMILIES.has(n.name) && !NON_SNAKE_SQUAMATA.has(n.name)) {
    throw new Error(`Unclassified Squamata family "${n.name}": add it to SNAKE_FAMILIES or NON_SNAKE_SQUAMATA.`);
  }
}

const synonymsByTaxon = new Map<string, string[]>();
for (const s of readTsv("Synonym.tsv")) {
  const n = names.get(s.name_id);
  if (!n || (n.rank !== "species" && n.rank !== "subspecies")) continue;
  const list = synonymsByTaxon.get(s.taxon_id) ?? [];
  list.push(n.scientific_name);
  synonymsByTaxon.set(s.taxon_id, list);
}
const vernacularByTaxon = new Map<string, { name: string; language: string }[]>();
for (const v of readTsv("VernacularName.tsv")) {
  if (!v.name) continue;
  const list = vernacularByTaxon.get(v.taxon_id) ?? [];
  list.push({ name: v.name, language: v.language });
  vernacularByTaxon.set(v.taxon_id, list);
}
const distributionByTaxon = new Map(readTsv("Distribution.tsv").map((d) => [d.taxon_id, d.area.trim().replace(/[,;]\s*$/, "")]));

interface TaxonomyRecord {
  slug: string;
  name: string;
  authorship?: string;
  genus: string;
  family: string;
  subfamily?: string;
  synonyms?: string[];
  commonNames?: { name: string; language: string }[];
  distribution?: string;
  link?: string;
}

const species: TaxonomyRecord[] = [];
for (const t of taxa.values()) {
  const n = names.get(t.name_id);
  if (!n || n.rank !== "species" || t.extinct === "true") continue;
  const family = ancestor(t, "family");
  if (!family || !SNAKE_FAMILIES.has(family)) continue;
  const genus = ancestor(t, "genus") ?? n.genus;
  const rec: TaxonomyRecord = {
    slug: n.scientific_name.toLowerCase().replace(/[^a-z]+/g, "-"),
    name: n.scientific_name,
    genus,
    family,
  };
  if (n.authorship) rec.authorship = n.authorship;
  const subfamily = ancestor(t, "subfamily");
  if (subfamily) rec.subfamily = subfamily;
  const synonyms = [...new Set(synonymsByTaxon.get(t.id) ?? [])].filter((s) => s !== n.scientific_name);
  if (synonyms.length) rec.synonyms = synonyms;
  const common = vernacularByTaxon.get(t.id);
  if (common?.length) rec.commonNames = common;
  const distribution = distributionByTaxon.get(t.id);
  if (distribution) rec.distribution = distribution;
  if (t.link) rec.link = t.link;
  species.push(rec);
}
species.sort((a, b) => a.name.localeCompare(b.name));

const slugs = new Set<string>();
for (const s of species) {
  if (slugs.has(s.slug)) throw new Error(`Duplicate slug ${s.slug}`);
  slugs.add(s.slug);
}

const source = {
  title: meta.title,
  creators: "Peter Uetz and Jiří Hošek",
  version: meta.version,
  issued: meta.issued,
  doi: meta.doi ? `https://doi.org/${meta.doi}` : undefined,
  versionDoi: meta.versionDoi ? `https://doi.org/${meta.versionDoi}` : undefined,
  url: meta.url,
  distributedVia: "ChecklistBank dataset 1008 (Catalogue of Life Data Package)",
  license: LICENSES[license],
  licenseUrl: LICENSE_URLS[license],
  licenseAsDeclared: meta.license,
  attribution: `Uetz, P. & Hošek, J. (${meta.issued?.slice(0, 4)}). The Reptile Database (Version ${meta.version}). ${meta.doi ? `https://doi.org/${meta.doi}` : meta.url}. Licensed under ${LICENSES[license]}.`,
  changes:
    "Filtered to living snake species; reshaped to one record per species with synonyms, common names, distribution text and source link. Serpent's venom assessments are not part of this data.",
  knownLimitations: [
    "Distribution text in this release keeps only the first line of multi-line entries, so it can be incomplete. Serpent shows it but does not use it to down-weight identifications.",
  ],
  importedAt: new Date().toISOString().slice(0, 10),
  speciesCount: species.length,
};

// One species per line keeps diffs between releases readable.
writeFileSync(
  OUT,
  `{\n"source": ${JSON.stringify(source, null, 1)},\n"species": [\n${species.map((s) => JSON.stringify(s)).join(",\n")}\n]\n}\n`,
);
console.log(`Wrote ${species.length} snake species in ${new Set(species.map((s) => s.family)).size} families to ${OUT}`);
console.log(`Source: ${source.title} ${source.version} (${source.license})`);
