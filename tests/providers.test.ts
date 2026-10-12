import { afterEach, describe, expect, it, vi } from "vitest";
import { createVisionProvider } from "@/services/providers";
import { configuredEngine, configuredProvider } from "@/services/providers/config";
import { analysisSchema } from "@/services/providers/prompt";
import { ProviderUnavailableError } from "@/services/providers/types";

afterEach(() => vi.unstubAllEnvs());

describe("vision provider factory", () => {
  it("defaults to anthropic", () => {
    vi.stubEnv("VISION_PROVIDER", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    vi.stubEnv("ANTHROPIC_MODEL", "");
    expect(configuredProvider()).toBe("anthropic");
    expect(createVisionProvider()).toMatchObject({ name: "anthropic", model: "claude-sonnet-5-5" });
  });

  it("picks openai with the configured model", () => {
    vi.stubEnv("VISION_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.stubEnv("OPENAI_MODEL", "gpt-test");
    expect(createVisionProvider()).toMatchObject({ name: "openai", model: "gpt-test" });
    expect(configuredEngine()).toEqual({ provider: "openai", model: "gpt-test" });
  });

  it("reports a missing key as provider unavailable", () => {
    vi.stubEnv("VISION_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => createVisionProvider()).toThrow(ProviderUnavailableError);
  });

  it("rejects an unknown provider instead of falling back silently", () => {
    vi.stubEnv("VISION_PROVIDER", "gemini");
    expect(configuredProvider()).toBeNull();
    expect(() => createVisionProvider()).toThrow(ProviderUnavailableError);
  });
});

describe("shared analysis schema", () => {
  // OpenAI strict mode requires every object to be closed and list every property as required.
  function objects(node: unknown): Record<string, unknown>[] {
    if (!node || typeof node !== "object") return [];
    const n = node as Record<string, unknown>;
    const own = n.type === "object" ? [n] : [];
    return [...own, ...Object.values(n).flatMap(objects)];
  }

  it("is strict-mode compatible", () => {
    for (const o of objects(analysisSchema)) {
      expect(o.additionalProperties).toBe(false);
      expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as object).sort());
    }
  });
});
