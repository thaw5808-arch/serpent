import { NextResponse } from "next/server";
import { clientKey, IDENTIFY_RATE_LIMIT, rateLimit } from "@/lib/rateLimit";
import { roundedPoint } from "@/lib/geo";
import { DescribeService } from "@/services/describe";
import { DescriptionSchema } from "@/services/describe/schema";
import { createVisionProvider } from "@/services/providers";
import { configuredEngine } from "@/services/providers/config";
import { decideDescription } from "@/services/safetyService";
import type { DescriptionResult } from "@/types";

/** A first lookup of a new area's sightings can take a while (it falls back to the country list after 20 s). */
export const maxDuration = 60;

/** The answers are a few short codes and a place; anything bigger isn't a description. */
const MAX_BODY_BYTES = 8 * 1024;

function error(status: number, code: string, message: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** POST a description (src/lib/describe.ts) → a DescriptionResult. One text-only model call at most. */
export async function POST(req: Request) {
  const limited = rateLimit(`${IDENTIFY_RATE_LIMIT.key}:${clientKey(req)}`, IDENTIFY_RATE_LIMIT.limit, IDENTIFY_RATE_LIMIT.windowMs);
  if (!limited.allowed) {
    return error(429, "rate_limited", "Too many requests in a short time. Wait a minute and try again.", {
      "Retry-After": String(limited.retryAfterSeconds),
    });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return error(413, "invalid", "The description could not be read.");

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return error(413, "invalid", "The description could not be read.");
    body = JSON.parse(text);
  } catch {
    return error(400, "invalid", "The description could not be read.");
  }
  const parsed = DescriptionSchema.safeParse(body);
  if (!parsed.success) return error(400, "invalid", "The description could not be read.");

  // The place is a town's own coordinates; round again here, as Near me does.
  const description = { ...parsed.data };
  if (description.place) {
    const point = roundedPoint(description.place.lat, description.place.lng);
    description.place = point ? { ...description.place, ...point } : null;
  }

  const meta = { id: crypto.randomUUID(), analyzedAt: new Date().toISOString() };
  let result: DescriptionResult;
  try {
    result = await new DescribeService(createVisionProvider()).describe(description, meta);
  } catch (err) {
    // Provider construction errors (missing key, bad VISION_PROVIDER) land here; their messages carry no secrets.
    console.error("[describe] unavailable:", (err as Error).message);
    result = {
      mode: "description",
      ...meta,
      engine: configuredEngine(),
      ...decideDescription({ description, output: null, pool: description.place ? "nearby" : "everywhere", country: description.place?.countryCode ?? null }),
    };
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
