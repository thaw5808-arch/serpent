import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { ReportSchema, reportsEnabled, saveReport } from "@/services/reports";

const RATE_LIMIT = { limit: 5, windowMs: 10 * 60_000 };

function clientKey(req: Request): string {
  // Used only as an in-memory rate-limit key; never logged or stored.
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

function json(status: number, body: object) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!reportsEnabled()) return json(503, { error: "Reporting isn't available right now.", code: "unavailable" });

  const limited = rateLimit(`report:${clientKey(req)}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (!limited.allowed) return json(429, { error: "Too many reports in a short time. Try again later.", code: "rate_limited" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "The report could not be read.", code: "unreadable" });
  }
  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) return json(400, { error: "The report could not be read.", code: "unreadable" });

  try {
    await saveReport(parsed.data);
  } catch (err) {
    console.error("[reports] write failed:", (err as Error).message);
    return json(503, { error: "Reporting isn't available right now.", code: "unavailable" });
  }
  return json(201, { ok: true });
}
