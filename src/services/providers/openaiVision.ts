import "server-only";
import OpenAI from "openai";
import { ProviderUnavailableError, type VisionInput, type VisionProvider } from "./types";
import { SYSTEM_PROMPT, TOOL_DESCRIPTION, TOOL_NAME, analysisSchema, userPromptText } from "./prompt";
import { VISION_PROVIDER } from "@/lib/labels";

export class OpenAIVisionProvider implements VisionProvider {
  readonly name = "openai";
  readonly model: string;
  readonly usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  private client: OpenAI;

  constructor(opts?: { apiKey?: string; model?: string }) {
    const apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ProviderUnavailableError("OPENAI_API_KEY is not set");
    this.model = opts?.model ?? process.env.OPENAI_MODEL ?? VISION_PROVIDER.openai.defaultModel;
    this.client = new OpenAI({ apiKey, timeout: 45_000, maxRetries: 1 });
  }

  /** The exact request sent for an analysis (also used to measure prompt size). */
  requestBody(input: VisionInput) {
    return {
      model: this.model,
      // Reasoning tokens count toward this limit, so it is higher than the Claude provider's.
      max_output_tokens: 8000,
      // Do not keep the photo or the analysis on OpenAI's side for later retrieval.
      store: false,
      instructions: SYSTEM_PROMPT,
      tools: [
        {
          type: "function" as const,
          name: TOOL_NAME,
          description: TOOL_DESCRIPTION,
          parameters: analysisSchema,
          strict: true,
        },
      ],
      tool_choice: { type: "function" as const, name: TOOL_NAME },
      parallel_tool_calls: false,
      input: [
        {
          role: "user" as const,
          content: [
            ...input.images.map((img) => ({
              type: "input_image" as const,
              image_url: `data:${img.mediaType};base64,${img.imageBase64}`,
              detail: "high" as const,
            })),
            { type: "input_text" as const, text: userPromptText({ ...input, imageCount: input.images.length }) },
          ],
        },
      ],
    };
  }

  /** Counts the input tokens a request would use, without running it. */
  async countInputTokens(input: VisionInput): Promise<number> {
    const { max_output_tokens: _max, store: _store, ...body } = this.requestBody(input);
    void _max;
    void _store;
    return (await this.client.responses.inputTokens.count(body)).input_tokens;
  }

  async analyze(input: VisionInput): Promise<unknown> {
    try {
      const response = await this.client.responses.create(this.requestBody(input));
      this.usage.calls++;
      this.usage.inputTokens += response.usage?.input_tokens ?? 0;
      this.usage.outputTokens += response.usage?.output_tokens ?? 0;

      const call = response.output.find((item) => item.type === "function_call" && item.name === TOOL_NAME);
      if (!call || call.type !== "function_call") {
        throw new ProviderUnavailableError("Model did not return a structured analysis");
      }
      try {
        return JSON.parse(call.arguments) as unknown;
      } catch (err) {
        throw new ProviderUnavailableError("Model returned unparseable tool arguments", err);
      }
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError("Vision provider request failed", err);
    }
  }
}
