import { z } from "zod";
import {
  BEHAVIOURS,
  COLOURS,
  HEADS,
  MAX_COLOURS,
  NOT_SURE,
  PATTERNS,
  SETTINGS,
  SIZES,
  TIMES,
  type DescribedPlace,
  type Description,
} from "@/lib/describe";

/** The town the snake was seen near: a picked place (rounded coordinates), never the user's own position. */
export const DescribedPlaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  region: z.string().max(120).nullable(),
  country: z.string().max(120).nullable(),
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const DescriptionSchema = z.object({
  /** null = not given ("Not sure" or skipped). */
  place: DescribedPlaceSchema.nullable(),
  colours: z.union([z.literal(NOT_SURE), z.array(z.enum(COLOURS)).min(1).max(MAX_COLOURS)]),
  pattern: z.enum([...PATTERNS, NOT_SURE]),
  head: z.enum([...HEADS, NOT_SURE]),
  size: z.enum([...SIZES, NOT_SURE]),
  setting: z.enum([...SETTINGS, NOT_SURE]),
  time: z.enum([...TIMES, NOT_SURE]),
  /** Optional: an empty list means nothing was chosen. */
  behaviour: z.union([z.literal(NOT_SURE), z.array(z.enum(BEHAVIOURS)).max(BEHAVIOURS.length)]),
});

// The hand-written types in src/lib/describe.ts must match what the schemas accept.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const _placeMatches: Same<z.infer<typeof DescribedPlaceSchema>, DescribedPlace> = true;
export const _descriptionMatches: Same<z.infer<typeof DescriptionSchema>, Description> = true;

