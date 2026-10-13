import "server-only";
import type { DescribeInput } from "./types";

/**
 * Prompt and output schema for "Describe a snake", shared by every provider.
 * Text only: no image. The schema mirrors DescribeOutputSchema; the zod
 * validation stays the gate.
 */

export const DESCRIBE_TOOL_NAME = "report_description_matches";
export const DESCRIBE_TOOL_DESCRIPTION = "Report the species that best match the description.";

export const DESCRIBE_SYSTEM_PROMPT = `You are the matching component of a snake safety application. Someone saw a snake but could not take a photo, and answered a few simple questions about it.

Your ONLY job is to list which species from the given list best match the answers. Venom, medical risk and safety advice are handled elsewhere from a verified database, so you must not state or reason about venom, danger or harmlessness.

Rules:
- Choose only scientific names from the list you are given, written exactly as listed (genus and species). Never make up a name.
- Give at most 5 candidates, best match first. Give fewer, or none, if few species fit.
- match_score is 0 to 1: how well the species fits the answers. Descriptions from memory are unreliable, so keep scores modest and do not inflate them.
- "why" is one short sentence that refers ONLY to the user's answers (colour, pattern, head, size, place, time, behaviour) that fit this species. Do not add features the user did not mention.
- Answers marked "not sure" carry no information. Do not guess them.
- People often misjudge colour, size and head shape, so weigh several answers together rather than relying on one.
- If the answers are too vague or contradictory to match anything, return an empty list.
Report your result by calling the ${DESCRIBE_TOOL_NAME} tool exactly once.`;

/** JSON Schema for the tool input. Closed and fully required so it also passes OpenAI strict mode. */
export const describeSchema = {
  type: "object" as const,
  properties: {
    candidates: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          scientific_name: { type: "string", description: 'Exactly as in the list, e.g. "Bungarus candidus".' },
          match_score: { type: "number", minimum: 0, maximum: 1 },
          why: { type: "string", description: "One short sentence, based only on the user's answers." },
        },
        required: ["scientific_name", "match_score", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["candidates"],
  additionalProperties: false,
};

const POOL_HEADING: Record<DescribeInput["poolKind"], string> = {
  nearby: "Species recorded within 50 km of where it was seen, plus our reviewed species",
  country: "Species recorded in or near that country, plus our reviewed species",
  everywhere: "Every recognised snake species (no place was given)",
};

export function describePromptText(input: DescribeInput): string {
  return [
    `Where it was seen: ${input.placeName ?? "not given"}`,
    `The user's answers:\n${input.answers}`,
    `${POOL_HEADING[input.poolKind]} (genus: species epithets, common name in brackets where known):\n${input.pool}`,
  ].join("\n\n");
}
