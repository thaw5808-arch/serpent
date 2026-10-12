import "server-only";
import data from "@/data/taxonomy.json";

/**
 * Server-only index over every recognised snake species (The Reptile Database,
 * CC BY 4.0; see TAXONOMY_SOURCE). The `server-only` import makes the build fail
 * if a client component ever imports this, so the ~2 MB list never reaches browsers.
 */

export interface TaxonomyRecord {
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

export const TAXONOMY_SOURCE = data.source;
const RECORDS = data.species as TaxonomyRecord[];

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
/** Genus + species epithet only: drops authors, subspecies and anything after. */
export const binomialOf = (s: string | null | undefined) => norm(s ?? "").split(" ").slice(0, 2).join(" ");

const bySlug = new Map(RECORDS.map((r) => [r.slug, r]));
/** Name → accepted species. Accepted names win; a synonym shared by several species is left out (ambiguous). */
const byName = new Map<string, TaxonomyRecord>();
const ambiguous = new Set<string>();
for (const r of RECORDS) byName.set(binomialOf(r.name), r);
const synonymOwners = new Map<string, Set<TaxonomyRecord>>();
for (const r of RECORDS) {
  for (const s of r.synonyms ?? []) {
    const key = binomialOf(s);
    if (key.split(" ").length < 2 || byName.has(key)) continue;
    synonymOwners.set(key, (synonymOwners.get(key) ?? new Set()).add(r));
  }
}
for (const [key, owners] of synonymOwners) {
  if (owners.size === 1) byName.set(key, [...owners][0]);
  else ambiguous.add(key);
}

/** genus → epithet → record, over every indexed name (accepted and unambiguous synonyms). */
const epithetsByGenus = new Map<string, Map<string, TaxonomyRecord>>();
for (const [key, r] of byName) {
  const [genus, epithet] = key.split(" ");
  if (!epithet) continue;
  const m = epithetsByGenus.get(genus) ?? new Map<string, TaxonomyRecord>();
  m.set(epithet, r);
  epithetsByGenus.set(genus, m);
}

export const taxonomyCount = () => RECORDS.length;
export const allTaxonomyRecords = (): readonly TaxonomyRecord[] => RECORDS;
export const getTaxonomyRecord = (slug: string | null | undefined) => (slug ? (bySlug.get(slug) ?? null) : null);
export const isKnownGenus = (genus: string) => epithetsByGenus.has(norm(genus));

export function englishName(r: TaxonomyRecord): string | null {
  return r.commonNames?.find((c) => c.language === "English")?.name ?? null;
}

/** Optimal string alignment distance (Levenshtein plus adjacent transpositions), capped for speed. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

export type NameMatch = { record: TaxonomyRecord; fuzzy: boolean } | null;

/** Small typos only: at most 2 edits in total, 1 for short words, and the best match must be unique. */
const allowed = (word: string) => (word.length <= 5 ? 1 : 2);

/**
 * Exact name or unambiguous synonym first; otherwise a fuzzy match on genus +
 * epithet. Returns null for names that are invented, too far off, ambiguous, or
 * not a binomial — those must be treated as unresolved.
 */
export function lookupName(scientificName: string | null | undefined): NameMatch {
  const key = binomialOf(scientificName);
  const [genus, epithet] = key.split(" ");
  if (!genus || !epithet || epithet.length < 3) return null;

  const exact = byName.get(key);
  if (exact) return { record: exact, fuzzy: false };
  if (ambiguous.has(key)) return null;

  let best: { record: TaxonomyRecord; cost: number } | null = null;
  let tie = false;
  const genera = epithetsByGenus.has(genus)
    ? [genus]
    : [...epithetsByGenus.keys()].filter((g) => editDistance(genus, g, allowed(genus)) <= allowed(genus));
  for (const g of genera) {
    const genusCost = g === genus ? 0 : editDistance(genus, g, 2);
    for (const [ep, record] of epithetsByGenus.get(g)!) {
      if (Math.abs(ep.length - epithet.length) > 2) continue;
      const cost = genusCost + editDistance(epithet, ep, allowed(epithet));
      if (cost > 2 || cost - genusCost > allowed(epithet)) continue;
      if (!best || cost < best.cost) {
        best = { record, cost };
        tie = false;
      } else if (cost === best.cost && record !== best.record) {
        tie = true;
      }
    }
  }
  return best && !tie ? { record: best.record, fuzzy: true } : null;
}

export interface TaxonomySearchHit {
  slug: string;
  name: string;
  commonName: string | null;
  family: string;
}

/** Search accepted names, synonyms and common names. Prefix matches rank first. */
export function searchTaxonomy(query: string, limit = 30, exclude: Set<string> = new Set()): TaxonomySearchHit[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const scored: { r: TaxonomyRecord; score: number }[] = [];
  for (const r of RECORDS) {
    if (exclude.has(norm(r.name))) continue;
    const fields = [r.name, ...(r.commonNames ?? []).map((c) => c.name), ...(r.synonyms ?? [])].map(norm);
    let score = Infinity;
    for (const [i, f] of fields.entries()) {
      const at = f.indexOf(q);
      if (at < 0) continue;
      // Accepted name beats common names beats synonyms; prefixes beat substrings.
      score = Math.min(score, (i === 0 ? 0 : i <= (r.commonNames?.length ?? 0) ? 10 : 20) + (at === 0 ? 0 : 5));
    }
    if (score < Infinity) scored.push({ r, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.r.name.localeCompare(b.r.name))
    .slice(0, limit)
    .map(({ r }) => ({ slug: r.slug, name: r.name, commonName: englishName(r), family: r.family }));
}
