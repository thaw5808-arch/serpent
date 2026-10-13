// Core domain types for SERPENT.
import type { Description } from "@/lib/describe";

export type VenomStatus =
  | "venomous" // medically significant venom
  | "mildly_venomous" // venom present, usually medically minor in humans
  | "non_venomous"
  | "unknown";

/** What the result screen shows. Adds "potentially_venomous" for uncertain results. */
export type DisplayVenomStatus = VenomStatus | "potentially_venomous";

export type VenomType =
  | "neurotoxic"
  | "hemotoxic"
  | "cytotoxic"
  | "myotoxic"
  | "cardiotoxic";

export type MedicalRisk = "low" | "moderate" | "high" | "very_high" | "unknown";

export type RegionCode =
  | "south_asia"
  | "southeast_asia"
  | "east_asia"
  | "australia_png"
  | "north_america"
  | "sub_saharan_africa"
  | "europe";

export type ReviewStatus = "draft" | "expert_reviewed";

/**
 * Coarse visual pattern classes. Species that share a region and a tag but
 * differ in venom class are treated as look-alikes automatically.
 */
export const PATTERN_TAGS = [
  "banded-black-white",
  "banded-black-yellow",
  "green-arboreal",
  "brown-plain",
  "blotched-viper",
  "zigzag-barred",
  "striped",
] as const;
export type PatternTag = (typeof PATTERN_TAGS)[number];

/**
 * A genus, a group of genera (e.g. sea snakes) or a family that is used as a
 * fail-safe when a snake can't be matched to a catalog species. Every group
 * here is venomous; non-venomous genera deliberately have no group, so they
 * resolve to "unknown" and never to a reassuring result.
 */
export interface TaxonGroup {
  id: string; // e.g. "genus-bungarus", "family-elapidae"
  rank: "genus" | "group" | "family";
  name: string; // scientific name of the taxon, e.g. "Bungarus"
  commonName: string; // e.g. "Kraits"
  family: string;
  /** Genus names (including common synonyms) that resolve to this group. Empty for families. */
  genera: string[];
  venomStatus: "venomous";
  /** Conservative editorial classification for the whole group. */
  medicalRisk: MedicalRisk;
  note: string;
  sourceIds: string[];
  reviewStatus: ReviewStatus;
}

export interface SpeciesRecord {
  id: string; // slug, also the catalog id sent to the vision model
  commonName: string;
  otherNames?: string[];
  scientificName: string;
  family: string;
  genus: string;
  venomStatus: VenomStatus;
  venomTypes: VenomType[];
  /** Relative medical-risk classification (editorial, pending expert review). */
  medicalRisk: MedicalRisk;
  riskRationale: string;
  /**
   * Standardized potency data (e.g. LD50 with route + animal model). Null until a
   * citable value is added by a human. Never fill this from memory or from the LLM.
   */
  potency: null | { value: string; method: string; sourceId: string };
  /** Visual identification features; also sent to the vision model as the catalog. */
  keyFeatures: string[];
  appearance: string;
  regions: RegionCode[];
  distribution: string;
  habitat: string;
  medicalEffects: string[];
  /** Null = not yet sourced. Never invent antivenom availability. */
  antivenom: null | { summary: string; sourceIds: string[] };
  similarSpeciesIds: string[];
  /** Visual pattern classes, used to derive look-alikes automatically. */
  patternTags: PatternTag[];
  /** Look-alikes that are not in the catalog yet, described in words. */
  otherLookAlikes?: string;
  sourceIds: string[];
  reviewStatus: ReviewStatus;
  /** ISO date, set only by a human reviewer. */
  lastVerified: string | null;
}

export interface SourceRecord {
  id: string;
  title: string;
  publisher: string;
  url: string | null;
  sourceType: "government" | "who" | "university" | "database" | "peer_reviewed" | "medical_authority";
  year: number | null;
  lastVerified: string | null;
}

export type IdentificationStatus =
  | "likely_identified"
  | "conflicting_evidence"
  | "unknown_species"
  | "insufficient_image"
  | "no_snake"
  | "multiple_snakes"
  | "service_unavailable";

export type ConfidenceBand = "high" | "moderate" | "low";

export const IMAGE_ISSUES = [
  "blur",
  "low_light",
  "partially_hidden",
  "too_small",
  "obstructed",
  "low_resolution",
  "multiple_snakes",
  "no_snake",
  "not_a_live_snake_photo",
] as const;
export type ImageIssue = (typeof IMAGE_ISSUES)[number];

export interface CandidateView {
  /** What the candidate resolved to: a curated species, a recognised species from the taxonomy, a genus/family group, or nothing. */
  kind: "species" | "taxonomy" | "group" | "unresolved";
  speciesId: string | null; // null = not a catalog species
  /** Set when the candidate was resolved to a genus, group or family instead of a species. */
  groupId: string | null;
  label: string;
  scientificName: string | null;
  /** Set for a recognised species from the full taxonomy that isn't curated (links to /species/<slug>). */
  taxonomySlug: string | null;
  /** Venom status of whatever the candidate resolved to; null when not assessed or unresolved. */
  venomStatus: VenomStatus | null;
  /** Where the venom status comes from. */
  venomBasis: "species" | "genus" | "family" | "not_assessed" | "unresolved";
  /** The genus/family group the venom status came from, when it wasn't the species itself. */
  venomGroup: { name: string; commonName: string; rank: "genus" | "group" | "family" } | null;
  /** The name the model gave when it was not a catalog id, e.g. "Bungarus multicinctus". */
  namedAs: string | null;
  probability: number; // after geographic adjustment, renormalized
  band: ConfidenceBand;
  supportingFeatures: string[];
  conflictingFeatures: string[];
  outsideSelectedRegion: boolean;
}

/** Keys of the safety actions in messages/*.json (safety.actions.*). */
export type SafetyActionKey = "stayBack" | "noTouch" | "children" | "rescue" | "retake" | "spitting";

/**
 * A note Serpent itself writes about a result (as opposed to the model's own notes),
 * stored as a message key plus parameters so it can be shown in any language.
 * Parameters are names or codes, never translated text.
 */
export type SystemNote =
  | { key: "typo"; params: { namedAs: string; resolved: string } }
  | { key: "unreviewedInGroup"; params: { name: string; common: string; group: string } }
  | { key: "unreviewedNotAssessed"; params: { name: string } }
  | { key: "groupPoints"; params: { common: string; group: string } }
  | { key: "groupSuggested"; params: { namedAs: string; common: string; group: string } }
  | { key: "unrecognised"; params: { namedAs: string } }
  | { key: "notInDatabase"; params?: undefined }
  | { key: "partialOnly"; params?: undefined }
  /** `country` is an ISO code. */
  | { key: "outsideCountry"; params: { country: string } };

export interface SafetyAssessment {
  headline: string;
  /** English text of each action, in order (kept for logs and older clients). */
  actions: string[];
  /** The same actions as message keys, for display in the user's language. */
  actionKeys: SafetyActionKey[];
  lookAlike: { active: boolean; message: string; speciesIds: string[] };
  treatAsDangerous: boolean;
}

export interface IdentificationResult {
  id: string;
  status: IdentificationStatus;
  message: string;
  analyzedAt: string;
  country: string | null; // ISO country code chosen by the user, or null
  engine: { provider: string; model: string };
  imageIssues: ImageIssue[];
  top: CandidateView | null;
  alternatives: CandidateView[];
  confidenceBand: ConfidenceBand | null;
  displayVenomStatus: DisplayVenomStatus;
  /**
   * Presentation only (the safety fields above are unchanged by it): the candidate
   * to name as the closest match, preferring a resolved species over a genus/family
   * group over an unrecognised name. Null only when there are no candidates.
   */
  closestMatch: CandidateView | null;
  /** Plausible candidates of a different venom class from the closest match, venomous first. */
  couldAlsoBe: CandidateView[];
  observedFeatures: string[];
  /** The model's notes followed by Serpent's own, all in English (kept for logs and older clients). */
  uncertaintyNotes: string[];
  /** The model's own notes, verbatim. Never translated. */
  modelNotes: string[];
  /** Serpent's own notes as message keys (see SystemNote). */
  notes: SystemNote[];
  safety: SafetyAssessment;
  /** How many photos were analysed and whether an uncertain result got a second, independent analysis. */
  analysis?: { photos: number; secondOpinion: boolean; agreed: boolean | null };
}

/** One possible match for a described snake. Names and "why" are never translated. */
export interface DescribedCandidate {
  /** A curated species, or a recognised species from the full taxonomy. Anything else is dropped. */
  kind: "species" | "taxonomy";
  speciesId: string | null;
  taxonomySlug: string | null;
  /** English common name when there is one (never translated). */
  commonName: string | null;
  scientificName: string;
  /** From our data at species, genus or family level; null = not assessed. Never from the model. */
  venomStatus: VenomStatus | null;
  venomBasis: CandidateView["venomBasis"];
  venomGroup: CandidateView["venomGroup"];
  /** From our data; null = not assessed. */
  medicalRisk: MedicalRisk | null;
  /** The model's 0–1 match to the answers (a relative estimate, not a probability). */
  score: number;
  /** The model's reason, based only on the answers, verbatim and in English. */
  why: string;
}

/**
 * - possible_matches: candidates were found (still never a confirmed identification);
 * - not_enough_detail: mostly "Not sure", or nothing usable came back;
 * - service_unavailable: the model couldn't be reached or answered badly.
 */
export type DescriptionStatus = "possible_matches" | "not_enough_detail" | "service_unavailable";

/** Which species the model was allowed to choose from. */
export type DescriptionPool = "nearby" | "country" | "everywhere";

/** The result of "Describe a snake" (no photo). */
export interface DescriptionResult {
  mode: "description";
  id: string;
  analyzedAt: string;
  engine: { provider: string; model: string };
  status: DescriptionStatus;
  /** ISO code of the place's country, or null. */
  country: string | null;
  /** The answers as given (ids, see src/lib/describe.ts). */
  answers: Description;
  pool: DescriptionPool;
  /**
   * Overall venom status: a description can't rule anything out, so this is never
   * "non_venomous", "mildly_venomous" or "unknown".
   */
  displayVenomStatus: "potentially_venomous";
  /** The worst medical risk among the candidates; never "low". */
  overallRisk: Exclude<MedicalRisk, "low">;
  /** A candidate is high or very high risk: show the danger banner and "I've been bitten" first. */
  dangerous: boolean;
  candidates: DescribedCandidate[];
  safety: SafetyAssessment;
}
