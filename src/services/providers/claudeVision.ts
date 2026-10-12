import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ProviderUnavailableError, type VisionInput, type VisionProvider } from "./types";
import { SYSTEM_PROMPT, TOOL_DESCRIPTION, TOOL_NAME, analysisSchema, userPromptText } from "./prompt";
import { VISION_PROVIDER } from "@/lib/labels";

export class ClaudeVisionProvider implements VisionProvider {
  readonly name = "anthropic";
  readonly model: string;
  private client: Anthropic;

  constructor(opts?: { apiKey?: string; model?: string }) {
    const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new ProviderUnavailableError("ANTHROPIC_API_KEY is not set");
    this.model = opts?.model ?? process.env.ANTHROPIC_MODEL ?? VISION_PROVIDER.anthropic.defaultModel;
    this.client = new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 });
  }

  async analyze(input: VisionInput): Promise<unknown> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: [{ name: TOOL_NAME, description: TOOL_DESCRIPTION, input_schema: analysisSchema }],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [
          {
            role: "user",
            content: [
              ...input.images.map((img) => ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: img.mediaType, data: img.imageBase64 },
              })),
              {
                type: "text",
                text: userPromptText({ ...input, imageCount: input.images.length }),
              },
            ],
          },
        ],
      });

      const block = response.content.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
      if (!block || block.type !== "tool_use") {
        throw new ProviderUnavailableError("Model did not return a structured analysis");
      }
      return block.input;
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError("Vision provider request failed", err);
    }
  }
}
