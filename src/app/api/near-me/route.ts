import { NextResponse } from "next/server";
import { z } from "zod";
import { roundedPoint } from "@/lib/geo";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { getSightings } from "@/services/nearMe";
import { GbifUnavailableError } from "@/services/nearMe/gbif";

/** A first lookup for an area makes one GBIF request per species; cached lookups return at once. */
export const maxDuration = 120;

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

const Query = z.object({
  name: z.string().trim().min(1).max(120),
  cc: z.string().regex(/^[A-Z]{2}$/).nullable(),
});

function json(status: number, body: object, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** GET ?lat=&lng=&name=&cc= — snakes recorded within 50 km of a (rounded) point. */
export async function GET(req: Request) {
  const limited = rateLimit(`near-me:${clientKey(req)}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (!limited.allowed) {
    return json(429, { error: "Too many searches in a short time. Wait a minute and try again.", code: "rate_limited" }, {
      "Retry-After": String(limited.retryAfterSeconds),
    });
  }

  const params = new URL(req.url).searchParams;
  const point = roundedPoint(params.get("lat"), params.get("lng"));
  const query = Query.safeParse({ name: params.get("name") ?? "", cc: params.get("cc") || null });
  if (!point || !query.success) return json(400, { error: "Choose a place to search.", code: "invalid" });

  try {
    const sightings = await getSightings(point, query.data.name);
    return json(200, { place: { name: query.data.name, countryCode: query.data.cc, ...point }, ...sightings });
  } catch (err) {
    if (err instanceof GbifUnavailableError) {
      console.error("[near-me] GBIF unavailable:", err.message);
      return json(503, { error: "We couldn't load sightings for this area right now.", code: "unavailable" });
    }
    throw err;
  }
}
