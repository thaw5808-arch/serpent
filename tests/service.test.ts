import { describe, expect, it } from "vitest";
import { SnakeIdentificationService } from "@/services/snakeIdentification";
import { ProviderUnavailableError, type VisionProvider } from "@/services/providers/types";
import { raw, c } from "./helpers";

const meta = { id: "t", analyzedAt: "2026-01-01T00:00:00.000Z" };
const img = [{ imageBase64: "x", mediaType: "image/jpeg" as const }];

function provider(fn: () => Promise<unknown>): VisionProvider {
  return { name: "fake", model: "fake-1", analyze: fn };
}

describe("SnakeIdentificationService", () => {
  it("returns service_unavailable (not a fake result) when the provider fails", async () => {
    const s = new SnakeIdentificationService(provider(async () => { throw new ProviderUnavailableError("down"); }));
    const r = await s.identify(img, "TH", meta);
    expect(r.status).toBe("service_unavailable");
    expect(r.top).toBeNull();
  });

  it("rejects malformed model output", async () => {
    const s = new SnakeIdentificationService(provider(async () => ({ species: "King Cobra", venom: "100/100" })));
    const r = await s.identify(img, null, meta);
    expect(r.status).toBe("service_unavailable");
  });

  it("runs the full pipeline on valid output", async () => {
    const s = new SnakeIdentificationService(provider(async () => raw({ candidates: [c("malayan-krait", 0.88)] })));
    const r = await s.identify(img, "TH", meta);
    expect(r.status).toBe("likely_identified");
    expect(r.engine.model).toBe("fake-1");
    expect(r.country).toBe("TH");
  });

  it("puts local species first in the catalog sent to the model", () => {
    const s = new SnakeIdentificationService(provider(async () => ({})));
    const cat = s.catalogFor({ code: "US", name: "United States", region: "north_america", emergency: [] });
    expect(["eastern-diamondback", "copperhead", "corn-snake", "common-garter-snake"]).toContain(cat[0].id);
  });
});
