import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { candidateLabel } from "@/i18n/result";
import { getSpecies } from "@/services/venomDatabase";
import type { DisplayVenomStatus, MedicalRisk, VenomType } from "@/types";
import { isDescription, type SavedResult } from "./history";

/*
 * "Show the doctor": a one-screen snakebite summary kept on this device only.
 * Everything about the snake is copied from the result exactly as the result
 * showed it; nothing here makes it sound more certain. No treatment advice.
 */

export const BITE_LOCATIONS = ["hand", "arm", "foot", "leg", "torso", "head_neck", "other"] as const;
export const SYMPTOMS = [
  "none",
  "pain_swelling",
  "bleeding",
  "eyelids_vision",
  "swallow_speak",
  "breathing",
  "nausea",
  "dizzy",
  "numbness",
  "urine",
] as const;
export const FIRST_AID = ["still", "rings", "tourniquet", "cut_suck", "herbal"] as const;
/** First aid the doctor needs to know about. */
export const TELL_DOCTOR: ReadonlySet<FirstAid> = new Set(["tourniquet", "cut_suck", "herbal"]);

export type BiteLocation = (typeof BITE_LOCATIONS)[number];
export type Symptom = (typeof SYMPTOMS)[number];
export type FirstAid = (typeof FIRST_AID)[number];

export interface DoctorCard {
  /** `result:<result id>`, or `none` for a card without an identification. */
  id: string;
  resultId: string | null;
  /** The result as it was shown, kept with the card so the card survives History being cleared. */
  source: SavedResult | null;
  /** Small on-device thumbnails of the result's photos. */
  thumbnails: string[];
  createdAt: string;
  updatedAt: string;
  /** ISO time of the bite; null until given. */
  biteTime: string | null;
  location: BiteLocation | null;
  /** Each symptom with the time it was ticked. */
  symptoms: { key: Symptom; at: string }[];
  firstAid: FirstAid[];
  patientName: string;
  allergies: string;
  notes: string;
  /** The card's own language, independent of the site language. */
  cardLocale: Locale;
}

export const cardIdFor = (resultId: string | null) => (resultId ? `result:${resultId}` : "none");

export function newCard(resultId: string | null, source: SavedResult | null, thumbnails: string[], siteLocale: Locale, now = new Date()): DoctorCard {
  const iso = now.toISOString();
  return {
    id: cardIdFor(resultId),
    resultId,
    source,
    thumbnails,
    createdAt: iso,
    updatedAt: iso,
    biteTime: null,
    location: null,
    symptoms: [],
    firstAid: [],
    patientName: "",
    allergies: "",
    notes: "",
    cardLocale: siteLocale,
  };
}

/** Ticking a symptom records when; "None yet" and the real symptoms exclude each other. */
export function toggleSymptom(list: DoctorCard["symptoms"], key: Symptom, now = new Date()): DoctorCard["symptoms"] {
  if (list.some((s) => s.key === key)) return list.filter((s) => s.key !== key);
  const rest = key === "none" ? [] : list.filter((s) => s.key !== "none");
  return [...rest, { key, at: now.toISOString() }];
}

/** Whole hours and minutes since the bite; null when the time is more than a minute in the future. */
export function elapsed(biteIso: string, now: number): { h: number; m: number } | null {
  const ms = now - new Date(biteIso).getTime();
  if (Number.isNaN(ms) || ms < -60_000) return null;
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return { h: Math.floor(minutes / 60), m: minutes % 60 };
}

/** The message subsets the card needs, for each card language (passed from the server). */
export type CardDict = Pick<Messages, "doctorCard" | "venomStatus" | "venomType" | "risk" | "candidate">;
export type CardDicts = Record<Locale, CardDict>;

export interface CardSnake {
  /** One closest match (photo), up to three possible matches (description), or none. */
  kind: "match" | "possible" | "none";
  names: { name: string; scientific: string | null }[];
  /** Exactly the venom status the result showed. */
  status: DisplayVenomStatus;
  /** "Potentially venomous — AI estimate from photo", or just "Unknown". */
  statusText: string;
  venomTypes: VenomType[];
  /** From our data only: the most likely species' risk (photo), or the worst among possible matches (description). */
  risk: { level: MedicalRisk; text: string } | null;
}

/**
 * What the card says about the snake, in the card's language. The status is the
 * result's own displayVenomStatus, never recomputed. Names are never translated.
 */
export function cardSnake(source: SavedResult | null, t: CardDict): CardSnake {
  const d = t.doctorCard;
  const none = (status: DisplayVenomStatus): CardSnake => ({
    kind: "none",
    names: [],
    status,
    statusText: statusText(status, null, t),
    venomTypes: [],
    risk: null,
  });
  if (!source) return none("unknown");

  if (isDescription(source)) {
    const matches = source.status === "possible_matches" ? source.candidates.slice(0, 3) : [];
    const status = source.displayVenomStatus;
    if (matches.length === 0) return none(status);
    return {
      kind: "possible",
      names: matches.map((c) => ({ name: c.commonName ?? c.scientificName, scientific: c.commonName ? c.scientificName : null })),
      status,
      statusText: statusText(status, "description", t),
      venomTypes: [],
      risk: { level: source.overallRisk, text: fmtRisk(d.riskWorst, source.overallRisk, t) },
    };
  }

  const status = source.displayVenomStatus;
  const match = source.top ?? source.closestMatch;
  if (!match) return none(status);
  // Venom type and risk only for a reviewed species the result named as the identification.
  const species = source.top?.speciesId ? getSpecies(source.top.speciesId) : null;
  return {
    kind: "match",
    names: [{ name: candidateLabel(match, t), scientific: match.scientificName }],
    status,
    statusText: statusText(status, "photo", t),
    venomTypes: species?.venomTypes ?? [],
    risk: species ? { level: species.medicalRisk, text: fmtRisk(d.riskSpecies, species.medicalRisk, t) } : null,
  };
}

function fmtRisk(template: string, risk: MedicalRisk, t: CardDict) {
  return template.replace("{risk}", t.risk[risk]);
}

/** The result's own label; an AI source is named unless the status is plain "Unknown". */
function statusText(status: DisplayVenomStatus, from: "photo" | "description" | null, t: CardDict): string {
  const label = t.venomStatus[status].label;
  if (!from || status === "unknown") return label;
  return `${label} — ${from === "photo" ? t.doctorCard.fromPhoto : t.doctorCard.fromDescription}`;
}
