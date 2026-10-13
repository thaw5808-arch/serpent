/*
 * "Describe a snake": the questions' answer ids, shared by the question screens,
 * the API route and the matching service. Ids are stable codes (stored in History
 * and sent to the model as English); the words shown for them are in messages/*.json
 * under "describe".
 */

export const NOT_SURE = "not_sure";

export const COLOURS = ["black", "brown", "grey", "green", "yellow", "red_orange", "white_cream", "blue_iridescent"] as const;
export const PATTERNS = ["bands", "stripes", "blotches", "speckled", "plain"] as const;
export const HEADS = ["triangular", "same_as_neck", "hood"] as const;
export const SIZES = ["under_50cm", "50cm_1m", "1m_2m", "over_2m"] as const;
export const SETTINGS = ["building", "garden", "water", "tree", "road", "forest"] as const;
export const TIMES = ["day", "night"] as const;
export const BEHAVIOURS = ["raised_head", "hissed", "flattened_neck", "fled", "stayed_still"] as const;

export const MAX_COLOURS = 3;

export type Colour = (typeof COLOURS)[number];
export type Behaviour = (typeof BEHAVIOURS)[number];

type OneOf<T extends readonly string[]> = T[number] | typeof NOT_SURE;

/** A town the snake was seen near: a picked place (rounded coordinates), never the user's own position. */
export interface DescribedPlace {
  name: string;
  region: string | null;
  country: string | null;
  /** ISO 3166-1 alpha-2, or null. */
  countryCode: string | null;
  lat: number;
  lng: number;
}

/** The answers. Validated on the server by DescriptionSchema (src/services/describe/schema.ts). */
export interface Description {
  /** null = not given ("Not sure" or skipped). */
  place: DescribedPlace | null;
  colours: Colour[] | typeof NOT_SURE;
  pattern: OneOf<typeof PATTERNS>;
  head: OneOf<typeof HEADS>;
  size: OneOf<typeof SIZES>;
  setting: OneOf<typeof SETTINGS>;
  time: OneOf<typeof TIMES>;
  /** Optional: an empty list means nothing was chosen. */
  behaviour: Behaviour[] | typeof NOT_SURE;
}

/** The six questions about the snake itself (place and behaviour are optional extras). */
export const CORE_ANSWERS = ["colours", "pattern", "head", "size", "setting", "time"] as const;

/** At least this many of the core answers must be more than "Not sure" before any match is attempted. */
export const MIN_INFORMATIVE = 3;

/** How many core questions got a real answer. */
export function informativeCount(d: Description): number {
  return CORE_ANSWERS.filter((k) => d[k] !== NOT_SURE).length;
}

/** Mostly "Not sure": too little to match on, so the result is "Unknown" without asking the model. */
export const tooVague = (d: Description) => informativeCount(d) < MIN_INFORMATIVE;
