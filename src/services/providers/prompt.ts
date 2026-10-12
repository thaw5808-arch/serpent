import "server-only";
import { IMAGE_ISSUES } from "@/types";
import { NOT_IN_CATALOG, type VisionInput } from "./types";

/**
 * Prompt and output schema shared by every vision provider, so switching
 * provider never changes what the model is asked or what it must return.
 * The schema mirrors RawAnalysisSchema; the zod validation stays the gate.
 */

export const TOOL_NAME = "report_snake_analysis";
export const TOOL_DESCRIPTION = "Report the structured visual analysis.";

export const SYSTEM_PROMPT = `You are the visual-analysis component of a snake safety application.

Your ONLY job is to describe what is visible in the photos and rank which species the snake most resembles. Venom, medical risk and safety advice are handled elsewhere from a verified database, so you must not state or reason about venom, danger or harmlessness.

Work in this order:
1. Look first. Fill "observations" from what you can actually see: dorsal pattern, colour, head shape, scale texture, body build and any other visible markings. Use null for anything you cannot see. Describe, don't identify.
2. Assess image quality.
3. Rank candidates. Each candidate's supporting_features must quote the observations it relies on, and conflicting_features the observations that argue against it.

Rules:
- You may be given up to 3 photos. They all show the same snake; combine what every photo shows.
- Use ids from the lists you are given: reviewed species (with identification features) and, when a country is given, other recognised species recorded in or near that country. If the snake matches none of them well, use "${NOT_IN_CATALOG}".
- For every candidate, give scientific_name, genus and family as precisely as you can tell. For "${NOT_IN_CATALOG}" candidates this is required: give your best specific species name as a current binomial (e.g. "Bungarus multicinctus"). If you can't tell the species, set scientific_name to null and give the genus and family. Never make up a name. A "${NOT_IN_CATALOG}" candidate may appear more than once with different names.
- Never rely on a single feature (head shape, colour, pupil shape or pattern alone). Weigh several features together.
- Probabilities across candidates must sum to at most 1. Leave mass on "${NOT_IN_CATALOG}" when unsure. Do not inflate confidence.
- Mild blur, low light, small size or a partial view go in image_quality.issues, but they should not stop a species-level answer: when pattern and colour are visible, still name the specific species and give it the probability the visible evidence supports.
- Use "partially_hidden" or "obstructed" only when features you need for identification (head, pattern, colour) are hidden. A coiled snake overlapping its own body, with head and pattern clearly visible, is not partially hidden.
- Set usable_for_identification to false only when no distinguishing features are visible at all (no colour, pattern, banding or scale texture).
- If there is no real snake (toy, drawing, rope, screenshot of text, empty scene), set snake_detected to false.
- If more than one snake is visible, set snake_count to "multiple". Several photos of the same snake are not multiple snakes.
- The user's country, if given, is context only. Do not let it override what you see.
- Keep each note short and concrete (what you actually see).
Report your result by calling the ${TOOL_NAME} tool exactly once.`;

const observation = (description: string) => ({ type: ["string", "null"], description });

/** JSON Schema for the tool input. Every object is closed and fully required so it also passes OpenAI strict mode. */
export const analysisSchema = {
  type: "object" as const,
  properties: {
    // Look first: the model fills these before ranking anything.
    observations: {
      type: "object",
      description: "Fill this first, from what is visible. null for anything you cannot see.",
      properties: {
        dorsal_pattern: observation("Pattern along the back: bands, blotches, stripes, saddles, plain…"),
        colour: observation("Body and belly colours as seen."),
        head_shape: observation("Head shape and how distinct it is from the neck; eyes and pupils if visible."),
        scale_texture: observation("Smooth/glossy or keeled; any enlarged scales."),
        body_build: observation("Slender, medium or stout; relative size."),
        visible_markings: observation("Any other markings: collars, head marks, tail colour, hood marks…"),
      },
      required: ["dorsal_pattern", "colour", "head_shape", "scale_texture", "body_build", "visible_markings"],
      additionalProperties: false,
    },
    image_quality: {
      type: "object",
      properties: {
        snake_detected: { type: "boolean" },
        snake_count: { type: "string", enum: ["none", "one", "multiple"] },
        usable_for_identification: { type: "boolean" },
        issues: { type: "array", items: { type: "string", enum: [...IMAGE_ISSUES] } },
      },
      required: ["snake_detected", "snake_count", "usable_for_identification", "issues"],
      additionalProperties: false,
    },
    candidates: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          catalog_id: { type: "string" },
          scientific_name: { type: ["string", "null"], description: "Binomial name, e.g. \"Bungarus multicinctus\"." },
          genus: { type: ["string", "null"] },
          family: { type: ["string", "null"], description: "Family, e.g. \"Elapidae\" or \"Colubridae\"." },
          probability: { type: "number", minimum: 0, maximum: 1 },
          supporting_features: {
            type: "array",
            items: { type: "string" },
            description: "The observations this candidate relies on, quoted from observations.",
          },
          conflicting_features: {
            type: "array",
            items: { type: "string" },
            description: "Observations that argue against this candidate.",
          },
        },
        required: ["catalog_id", "scientific_name", "genus", "family", "probability", "supporting_features", "conflicting_features"],
        additionalProperties: false,
      },
    },
    overall_confidence: { type: "string", enum: ["high", "moderate", "low"] },
    uncertainty_notes: { type: "array", items: { type: "string" } },
  },
  required: ["observations", "image_quality", "candidates", "overall_confidence", "uncertainty_notes"],
  additionalProperties: false,
};

export function userPromptText(input: Pick<VisionInput, "catalog" | "countryName"> & { imageCount?: number }): string {
  const reviewed = input.catalog.filter((c) => c.reviewed);
  const others = input.catalog.filter((c) => !c.reviewed);
  const reviewedText = reviewed
    .map(
      (c) =>
        `- id: ${c.id}\n  name: ${c.commonName} (${c.scientificName})${c.genus ? `\n  genus/family: ${c.genus}, ${c.family}` : ""}` +
        `${c.distribution ? `\n  range: ${c.distribution}` : ""}\n  features: ${c.keyFeatures.join("; ")}`,
    )
    .join("\n");
  const parts = [
    `Photos: ${input.imageCount ?? 1} of the same snake.`,
    `User's country: ${input.countryName ?? "not provided"}`,
    `Reviewed species (with identification features):\n${reviewedText}`,
  ];
  if (others.length > 0) {
    // One compact line each: no features for these, and none are made up.
    const lines = others.map((c) => `- ${c.id} | ${c.commonName === c.scientificName ? c.scientificName : `${c.commonName} (${c.scientificName})`} | ${c.genus}, ${c.family}`);
    parts.push(`Other recognised species recorded in or near ${input.countryName} (id | name | genus, family):\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}
