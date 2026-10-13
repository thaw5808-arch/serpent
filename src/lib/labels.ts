import type { DisplayVenomStatus, MedicalRisk, VenomType } from "@/types";

export type Tone = "neutral" | "low" | "caution" | "high" | "critical";

/*
 * Presentation metadata only. Every label and description is in messages/*.json
 * (venomStatus.*, risk.*, venomType.*, band.*) so it can be shown in any language.
 */

export const VENOM_TONE: Record<DisplayVenomStatus, Tone> = {
  venomous: "high",
  potentially_venomous: "caution",
  mildly_venomous: "low",
  non_venomous: "low",
  unknown: "neutral",
};

export const RISK: Record<MedicalRisk, { tone: Tone; level: number }> = {
  low: { tone: "low", level: 1 },
  moderate: { tone: "caution", level: 2 },
  high: { tone: "high", level: 3 },
  very_high: { tone: "critical", level: 4 },
  unknown: { tone: "neutral", level: 0 },
};

export const VENOM_TYPES: VenomType[] = ["neurotoxic", "hemotoxic", "cytotoxic", "myotoxic", "cardiotoxic"];

export const TONE_CLASSES: Record<Tone, { text: string; bg: string; border: string; fill: string }> = {
  neutral: { text: "text-neutral", bg: "bg-neutral-bg", border: "border-line", fill: "bg-neutral" },
  low: { text: "text-low", bg: "bg-low-bg", border: "border-low-border", fill: "bg-low" },
  caution: { text: "text-caution", bg: "bg-caution-bg", border: "border-caution-border", fill: "bg-caution" },
  high: { text: "text-high", bg: "bg-high-bg", border: "border-high-border", fill: "bg-high" },
  // Critical is a solid red fill (white text on it); as text it is the same salmon as high.
  critical: { text: "text-critical", bg: "bg-critical-bg", border: "border-high-border", fill: "bg-critical-fill" },
};

export type VisionProviderName = "anthropic" | "openai";

/** How each vision provider is named to users: the model family and the company that processes the photo. */
export const VISION_PROVIDER: Record<VisionProviderName, { product: string; company: string; defaultModel: string }> = {
  anthropic: { product: "Claude", company: "Anthropic", defaultModel: "claude-sonnet-5-5" },
  openai: { product: "GPT", company: "OpenAI", defaultModel: "gpt-6.1-sol" },
};

export function providerProduct(provider: string): string {
  return provider in VISION_PROVIDER ? VISION_PROVIDER[provider as VisionProviderName].product : provider;
}
