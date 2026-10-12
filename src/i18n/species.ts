import type { SpeciesRecord } from "@/types";
import type { Locale } from "./config";
import { SPECIES_TEXT_MY } from "@/data/species/translations/my";
import { SPECIES_TEXT_TH } from "@/data/species/translations/th";

/**
 * Descriptive species fields that may be translated. Names, ids, taxonomy and
 * every other field are never translated: they are not in this list, and the
 * per-locale files are typed so they cannot contain them.
 */
export const TRANSLATABLE_SPECIES_FIELDS = [
  "appearance",
  "habitat",
  "riskRationale",
  "medicalEffects",
  "keyFeatures",
  "distribution",
  "otherLookAlikes",
] as const;
export type TranslatableSpeciesField = (typeof TRANSLATABLE_SPECIES_FIELDS)[number];
export type SpeciesText = Partial<Pick<SpeciesRecord, TranslatableSpeciesField>>;

export const SPECIES_TEXT: Record<Exclude<Locale, "en">, Record<string, SpeciesText>> = {
  th: SPECIES_TEXT_TH,
  my: SPECIES_TEXT_MY,
};

export interface LocalizedSpecies {
  species: SpeciesRecord;
  /** Fields shown in English because no translation exists yet; the UI labels them. */
  untranslated: TranslatableSpeciesField[];
}

/** The record with its descriptive text in `locale` where translated; names are always the original. */
export function localizeSpecies(s: SpeciesRecord, locale: Locale): LocalizedSpecies {
  if (locale === "en") return { species: s, untranslated: [] };
  const text = SPECIES_TEXT[locale][s.id] ?? {};
  const untranslated = TRANSLATABLE_SPECIES_FIELDS.filter((f) => {
    const original = s[f];
    const empty = original === undefined || (Array.isArray(original) && original.length === 0);
    return !empty && text[f] === undefined;
  });
  const translated = Object.fromEntries(TRANSLATABLE_SPECIES_FIELDS.filter((f) => text[f] !== undefined).map((f) => [f, text[f]]));
  return { species: { ...s, ...translated }, untranslated };
}
