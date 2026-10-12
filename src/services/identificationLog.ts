import "server-only";
import type { IdentificationResult } from "@/types";

/**
 * Stores an anonymous record of each analysis for quality monitoring:
 * status, top species, confidence. No image, no IP, no precise location.
 * Silently skipped when DATABASE_URL is not configured.
 */
export async function logIdentification(result: IdentificationResult): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { prisma } = await import("@/lib/db");
    await prisma.identification.create({
      data: {
        id: result.id,
        status: result.status,
        speciesId: result.top?.speciesId ?? null,
        confidence: result.top?.probability ?? null,
        confidenceBand: result.confidenceBand,
        displayVenomStatus: result.displayVenomStatus,
        countryCode: result.country,
        provider: result.engine.provider,
        model: result.engine.model,
      },
    });
  } catch (err) {
    console.error("[identificationLog] write failed:", (err as Error).message);
  }
}
