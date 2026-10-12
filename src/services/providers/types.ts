import { z } from "zod";
import { IMAGE_ISSUES } from "@/types";

/** Compact catalog entry sent to the vision model. No venom data on purpose. */
export interface CatalogEntry {
  /** Curated species id, or a taxonomy slug for recognised species that aren't reviewed. */
  id: string;
  commonName: string;
  scientificName: string;
  genus?: string;
  family?: string;
  /** Identification features; only reviewed (curated) species have them. */
  keyFeatures: string[];
  distribution?: string;
  reviewed: boolean;
}

export interface VisionImage {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

/** Up to this many photos of the same snake go into one request. */
export const MAX_PHOTOS = 3;

export interface VisionInput {
  /** 1–MAX_PHOTOS photos of the same snake. */
  images: VisionImage[];
  catalog: CatalogEntry[];
  countryName: string | null;
}

export const NOT_IN_CATALOG = "not_in_catalog";

const OBSERVATION_LABELS = {
  dorsal_pattern: "Dorsal pattern",
  colour: "Colour",
  head_shape: "Head shape",
  scale_texture: "Scale texture",
  body_build: "Body build",
  visible_markings: "Markings",
} as const;

/** The model reports structured observations first; downstream code uses them as observed_features. */
function observationsToFeatures(value: unknown): unknown {
  if (!value || typeof value !== "object" || "observed_features" in value || !("observations" in value)) return value;
  const obs = (value as { observations: Record<string, unknown> }).observations ?? {};
  const observed_features = Object.entries(OBSERVATION_LABELS)
    .map(([key, label]) => (typeof obs[key] === "string" && obs[key] ? `${label}: ${String(obs[key]).slice(0, 140)}` : null))
    .filter((f): f is string => f !== null);
  return { ...value, observed_features };
}

/** Shape the model must return. Validated server-side; anything else is rejected. */
export const RawAnalysisSchema = z.preprocess(observationsToFeatures, z.object({
  image_quality: z.object({
    snake_detected: z.boolean(),
    snake_count: z.enum(["none", "one", "multiple"]),
    usable_for_identification: z.boolean(),
    issues: z.array(z.enum(IMAGE_ISSUES)).max(9),
  }),
  observed_features: z.array(z.string().max(160)).max(10),
  candidates: z
    .array(
      z.object({
        catalog_id: z.string().max(80),
        // Free-text taxonomy for snakes outside the catalog. Used only to look up
        // our own data; never trusted for venom status.
        scientific_name: z.string().max(120).nullish(),
        genus: z.string().max(60).nullish(),
        family: z.string().max(60).nullish(),
        probability: z.number().min(0).max(1),
        supporting_features: z.array(z.string().max(160)).max(6),
        conflicting_features: z.array(z.string().max(160)).max(6),
      }),
    )
    .max(5),
  overall_confidence: z.enum(["high", "moderate", "low"]),
  uncertainty_notes: z.array(z.string().max(200)).max(6),
}));

export type RawAnalysis = z.infer<typeof RawAnalysisSchema>;

export interface VisionProvider {
  readonly name: string;
  readonly model: string;
  /** Running token totals for this provider instance (for cost reporting in scripts). */
  readonly usage?: { calls: number; inputTokens: number; outputTokens: number };
  analyze(input: VisionInput): Promise<unknown>;
}

export class ProviderUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
