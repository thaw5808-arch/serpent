import en from "../../messages/en.json";
import type { CandidateView, IdentificationResult, SystemNote } from "@/types";
import type { Locale } from "./config";
import type { Messages } from "./messages";
import { countryName, fmt } from "./format";

/*
 * Turns an identification result into display text in the user's language.
 * Only Serpent's own wording is translated. Names (species, scientific, genus,
 * family, group common names) and everything the model wrote (observed
 * features, its uncertainty notes) are passed through unchanged.
 */

/** Group common names ("Kraits") read in lower case inside an English sentence; other languages keep the name as is. */
export const inlineName = (name: string, locale: Locale) => (locale === "en" ? name.toLowerCase() : name);

export function noteTextIn(note: SystemNote, t: Messages, locale: Locale): string {
  if (note.key === "outsideCountry") return fmt(t.notes.outsideCountry, { country: countryName(note.params.country, locale) });
  const params: Record<string, string> = { ...note.params };
  if (params.common) params.common = inlineName(params.common, locale);
  return fmt(t.notes[note.key], params);
}

const SECOND_OPINION_NOTES = new Set([en.notes.secondOpinionAgreed, en.notes.secondOpinionDisagreed]);

type ResultText = Pick<IdentificationResult, "status" | "safety" | "uncertaintyNotes"> &
  Partial<Pick<IdentificationResult, "notes" | "modelNotes" | "analysis">>;

export interface LocalizedSafety {
  headline: string;
  message: string;
  actions: string[];
  /** Empty when no look-alike warning applies. */
  lookAlike: string;
  /** Serpent's notes in the user's language, plus the model's own notes verbatim. */
  notes: string[];
  /**
   * Saved before results carried message keys: actions and notes are only available
   * in English. The UI says so rather than mixing languages silently.
   */
  legacy: boolean;
}

export function localizeSafety(result: ResultText, t: Messages, locale: Locale): LocalizedSafety {
  const keys = result.safety.actionKeys;
  const legacy = !keys || !result.notes || !result.modelNotes;
  const secondOpinion = result.analysis?.secondOpinion
    ? [result.analysis.agreed ? t.notes.secondOpinionAgreed : t.notes.secondOpinionDisagreed]
    : [];
  return {
    headline: t.safety.keepDistance,
    message: t.status[result.status],
    actions: legacy ? result.safety.actions : keys!.map((k) => t.safety.actions[k]),
    lookAlike: result.safety.lookAlike.active ? t.safety.lookAlike : "",
    notes: legacy
      ? result.uncertaintyNotes
      : [
          ...secondOpinion,
          ...result.modelNotes!.filter((n) => !SECOND_OPINION_NOTES.has(n)),
          ...result.notes!.map((n) => noteTextIn(n, t, locale)),
        ],
    legacy: legacy && locale !== "en",
  };
}

/** A candidate's display name. Names stay as given; only the words around them are translated. */
export function candidateLabel(c: CandidateView, t: Messages): string {
  if (c.kind === "group" && c.venomGroup) {
    const g = c.venomGroup;
    return fmt(t.candidate[g.rank], { common: g.commonName, name: g.name });
  }
  if (c.kind === "unresolved") return c.namedAs ? t.candidate.unrecognised : t.candidate.notInDatabase;
  return c.label;
}

/** Where a candidate's venom status comes from, when it isn't a reviewed species. */
export function venomBasisText(c: CandidateView, t: Messages, locale: Locale): string | null {
  if (c.venomBasis === "not_assessed") return t.result.basisNotAssessed;
  const g = c.venomGroup;
  if (!g) return null;
  if (g.rank === "family") return fmt(t.result.basisFamily, { name: g.name });
  if (g.rank === "genus") return fmt(t.result.basisGenus, { name: g.name, common: inlineName(g.commonName, locale) });
  return fmt(t.result.basisGroup, { common: inlineName(g.commonName, locale) });
}
