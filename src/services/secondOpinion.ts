import en from "../../messages/en.json";
import type { Country } from "@/data/countries";
import { decide, rankCandidates, type Working } from "./safetyService";
import { resolveTaxon } from "./taxonomy";
import type { RawAnalysis } from "./providers/types";

/**
 * Second opinion for uncertain cases: one more independent analysis of the same
 * photos, merged with the first. Only the model's evidence is merged; the result
 * still goes through the unchanged safety policy.
 *
 * - Probabilities are averaged per resolved taxon (a candidate missing from one
 *   analysis counts as 0 there), so disagreement splits the mass.
 * - Agreement on the top candidate keeps the more confident of the two
 *   self-assessments; disagreement takes the less confident one, capped at
 *   "moderate", so it can never produce a high band.
 */

const CONFIDENCE = ["low", "moderate", "high"] as const;
type Confidence = (typeof CONFIDENCE)[number];
const rank = (c: Confidence) => CONFIDENCE.indexOf(c);
const minConf = (a: Confidence, b: Confidence) => (rank(a) <= rank(b) ? a : b);
const maxConf = (a: Confidence, b: Confidence) => (rank(a) >= rank(b) ? a : b);

type Candidate = RawAnalysis["candidates"][number];

/** Same key the safety policy merges on, so "Bungarus multicinctus" and its taxonomy id count as one. */
function keyOf(c: Candidate): string {
  const t = resolveTaxon({ catalogId: c.catalog_id, scientificName: c.scientific_name, genus: c.genus, family: c.family });
  if (t.kind === "species") return `species:${t.species.id}`;
  if (t.kind === "taxonomy") return `taxonomy:${t.record.slug}`;
  if (t.kind === "group") return `group:${t.group.id}`;
  return `unknown:${(c.scientific_name ?? c.genus ?? "").toLowerCase()}`;
}

function genusOf(w: Working | undefined): string | null {
  if (!w) return null;
  if (w.taxon.kind === "species") return w.taxon.species.genus;
  if (w.taxon.kind === "taxonomy") return w.taxon.record.genus;
  if (w.taxon.kind === "group" && w.taxon.group.rank === "genus") return w.taxon.group.name;
  return null;
}

/** Uncertain when the band would be below high, or the top two candidates are in different (or unknown) genera. */
export function needsSecondOpinion(raw: RawAnalysis, country: Country | null): boolean {
  const band = decide(raw, country).confidenceBand;
  if (band !== "high") return true;
  const [first, second] = rankCandidates(raw, country).filter((w) => w.key !== "unknown");
  if (!second) return false;
  const a = genusOf(first);
  const b = genusOf(second);
  return a === null || b === null || a !== b;
}

const unique = (xs: string[], max: number) => [...new Set(xs)].slice(0, max);

export function topKey(raw: RawAnalysis): string | null {
  const best = [...raw.candidates].sort((a, b) => b.probability - a.probability)[0];
  return best ? keyOf(best) : null;
}

export function mergeAnalyses(a: RawAnalysis, b: RawAnalysis): { merged: RawAnalysis; agreed: boolean } {
  const agreed = topKey(a) !== null && topKey(a) === topKey(b);

  const byKey = new Map<string, { a: number; b: number; best: Candidate; bestP: number; supporting: string[]; conflicting: string[] }>();
  for (const [side, list] of [["a", a.candidates], ["b", b.candidates]] as const) {
    for (const c of list) {
      const k = keyOf(c);
      const e = byKey.get(k) ?? { a: 0, b: 0, best: c, bestP: -1, supporting: [], conflicting: [] };
      e[side] += c.probability;
      if (c.probability > e.bestP) {
        e.best = c;
        e.bestP = c.probability;
      }
      e.supporting.push(...c.supporting_features);
      e.conflicting.push(...c.conflicting_features);
      byKey.set(k, e);
    }
  }
  const candidates = [...byKey.values()]
    .map((e) => ({
      ...e.best,
      probability: (e.a + e.b) / 2,
      supporting_features: unique(e.supporting, 6),
      conflicting_features: unique(e.conflicting, 6),
    }))
    .sort((x, y) => y.probability - x.probability);

  const qa = a.image_quality;
  const qb = b.image_quality;
  const multiple = qa.snake_count === "multiple" || qb.snake_count === "multiple";
  const any = qa.snake_count === "one" || qb.snake_count === "one";

  const overall: Confidence = agreed
    ? maxConf(a.overall_confidence, b.overall_confidence)
    : minConf(minConf(a.overall_confidence, b.overall_confidence), "moderate");

  return {
    agreed,
    merged: {
      image_quality: {
        // A snake either analysis saw is treated as present; issues from both are kept.
        snake_detected: qa.snake_detected || qb.snake_detected,
        snake_count: multiple ? "multiple" : any ? "one" : "none",
        usable_for_identification: qa.usable_for_identification || qb.usable_for_identification,
        issues: [...new Set([...qa.issues, ...qb.issues])],
      },
      observed_features: unique([...a.observed_features, ...b.observed_features], 10),
      candidates,
      overall_confidence: overall,
      uncertainty_notes: unique(
        [
          // Serpent's own note (not the model's); the result screen shows it from result.analysis.
          agreed ? en.notes.secondOpinionAgreed : en.notes.secondOpinionDisagreed,
          ...a.uncertainty_notes,
          ...b.uncertainty_notes,
        ],
        8,
      ),
    },
  };
}
