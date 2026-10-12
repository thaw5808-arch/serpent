import "server-only";
import { VISION_PROVIDER, type VisionProviderName } from "@/lib/labels";

/** VISION_PROVIDER from the environment; null when it is set to something unsupported. */
export function configuredProvider(): VisionProviderName | null {
  const value = process.env.VISION_PROVIDER?.trim().toLowerCase() || "anthropic";
  return value in VISION_PROVIDER ? (value as VisionProviderName) : null;
}

export function configuredModel(provider: VisionProviderName): string {
  const env = provider === "openai" ? process.env.OPENAI_MODEL : process.env.ANTHROPIC_MODEL;
  return env?.trim() || VISION_PROVIDER[provider].defaultModel;
}

/** The engine a result is attributed to, even when the provider could not be created. */
export function configuredEngine(): { provider: string; model: string } {
  const provider = configuredProvider();
  if (!provider) return { provider: process.env.VISION_PROVIDER ?? "unknown", model: "unknown" };
  return { provider, model: configuredModel(provider) };
}
