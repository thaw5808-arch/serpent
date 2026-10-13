import { NextResponse } from "next/server";
import { z } from "zod";
import { roundedPoint } from "@/lib/geo";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { getSightings } from "@/services/nearMe";
import { GbifUnavailableError } from "@/services/nearMe/gbif";
import { getSeason } from "@/services/nearMe/season";

/** The month counts give up after 15 s; a first Near me lookup for the area may still be running. */
export const maxDuration = 30;

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };
const Query = z.object({ name: z.string().trim().min(1).max(120) });

function json(status: number, body: object, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** GET ?lat=&lng=&name= — snake records per month within 50 km of a (rounded) point. */
export async function GET(req: Request) {
  const limited = rateLimit(`season:${clientKey(req)}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (!limited.allowed) {
    return json(429, { error: "Too many requests in a short time.", code: "rate_limited" }, { "Retry-After": String(limited.retryAfterSeconds) });
  }
  const params = new URL(req.url).searchParams;
  const point = roundedPoint(params.get("lat"), params.get("lng"));
  const q = Query.safeParse({ name: params.get("name") ?? "" });
  if (!point || !q.success) return json(400, { error: "Choose a place.", code: "invalid" });

  try {
    const season = await getSeason(point, q.data.name, { sightings: () => getSightings(point, q.data.name) });
    return json(200, { season });
  } catch (err) {
    if (err instanceof GbifUnavailableError) {
      console.error("[season] GBIF unavailable:", err.message);
      return json(503, { error: "Season data isn't available right now.", code: "unavailable" });
    }
    throw err;
  }
}
