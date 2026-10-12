import "server-only";
import { ClaudeVisionProvider } from "./claudeVision";
import { OpenAIVisionProvider } from "./openaiVision";
import { configuredModel, configuredProvider } from "./config";
import { ProviderUnavailableError, type VisionProvider } from "./types";

/** Picks the vision provider named by VISION_PROVIDER (default: anthropic). */
export function createVisionProvider(): VisionProvider {
  const provider = configuredProvider();
  switch (provider) {
    case "anthropic":
      return new ClaudeVisionProvider({ model: configuredModel(provider) });
    case "openai":
      return new OpenAIVisionProvider({ model: configuredModel(provider) });
    default:
      throw new ProviderUnavailableError('VISION_PROVIDER must be "anthropic" or "openai"');
  }
}
