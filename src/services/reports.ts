import "server-only";
import { z } from "zod";

/**
 * Misidentification reports. Anonymous by design: no image, no IP address,
 * no account. Requires DATABASE_URL; without it reporting is unavailable.
 */

export const ReportSchema = z.object({
  resultId: z.uuid(),
  suggestedSpecies: z.string().trim().max(120).optional().transform((s) => s || null),
  note: z.string().trim().max(1000).optional().transform((s) => s || null),
  // Snapshot of what the user was shown.
  resultStatus: z.string().max(40),
  shownLabel: z.string().max(160).nullable(),
  displayVenomStatus: z.string().max(40),
  countryCode: z.string().max(2).nullable(),
  provider: z.string().max(40),
  model: z.string().max(80),
});

export type ReportInput = z.infer<typeof ReportSchema>;

export const reportsEnabled = () => Boolean(process.env.DATABASE_URL);

export async function saveReport(input: ReportInput): Promise<void> {
  const { prisma } = await import("@/lib/db");
  await prisma.misidentificationReport.create({ data: input });
}

export async function listReports(limit = 200) {
  const { prisma } = await import("@/lib/db");
  return prisma.misidentificationReport.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
