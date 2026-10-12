import type { RawAnalysis } from "@/services/providers/types";

export function raw(partial: Partial<RawAnalysis> & { candidates: RawAnalysis["candidates"] }): RawAnalysis {
  return {
    image_quality: { snake_detected: true, snake_count: "one", usable_for_identification: true, issues: [] },
    observed_features: ["test feature"],
    overall_confidence: "high",
    uncertainty_notes: [],
    ...partial,
  };
}

export const c = (catalog_id: string, probability: number) => ({
  catalog_id,
  probability,
  supporting_features: [],
  conflicting_features: [],
});
