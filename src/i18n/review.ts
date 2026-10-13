import en from "../../messages/en.json";
import { SPECIES_TEXT } from "./species";

/**
 * Message keys whose wrong translation could hurt someone: first aid, emergency,
 * keep-distance and look-alike text, venom and risk labels and descriptions, and
 * the result wording that tells people how to treat a snake. Every one of these
 * is listed in messages/REVIEW.md and stays a draft in Thai and Burmese until a
 * native speaker with medical knowledge reviews it.
 */
export const SAFETY_CRITICAL_PREFIXES = [
  "firstAid.",
  "emergency.",
  "contacts.",
  "safety.",
  "status.",
  "notes.",
  "venomStatus.",
  "venomType.",
  "risk.",
  "band.",
  "venomPanel.",
  "result.treatDangerous",
  "result.serviceUnavailableNote",
  "result.listedAs",
  "result.ifBitten",
  "result.getGuidance",
  "result.call",
  "result.altNotReviewed",
  "result.basis",
  "species.notReviewed",
  "species.draftNote",
  "home.neverApproach",
  "identify.lead",
  "identify.warning",
  "notFound.body",
  "common.bitten",
  "footer.disclaimer",
  // The landing hero promises how dangerous a snake may be and "never false reassurance".
  "landing.",
] as const;

/** Every leaf key of a messages object, dotted. */
export function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k));
}

export const isSafetyCritical = (key: string) => SAFETY_CRITICAL_PREFIXES.some((p) => key === p || key.startsWith(p));

/** Translated species fields that carry medical meaning. */
const MEDICAL_SPECIES_FIELDS = ["riskRationale", "medicalEffects"] as const;

/** All keys that need medical review, messages first, then translated species text ("species:<id>.<field>"). */
export function reviewKeys(): string[] {
  const messageKeys = flattenKeys(en).filter(isSafetyCritical);
  const speciesKeys = new Set<string>();
  for (const table of Object.values(SPECIES_TEXT)) {
    for (const [id, text] of Object.entries(table)) {
      for (const f of MEDICAL_SPECIES_FIELDS) if (text[f] !== undefined) speciesKeys.add(`species:${id}.${f}`);
    }
  }
  return [...messageKeys, ...[...speciesKeys].sort()];
}
