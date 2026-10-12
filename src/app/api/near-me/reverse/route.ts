import { NextResponse } from "next/server";
import { LOCALES } from "@/i18n/config";
import { roundedPoint } from "@/lib/geo";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { GeocoderUnavailableError, nearestPlace } from "@/services/nearMe/geocoder";

/*
 * "Use my location": the browser rounds its position to 0.1° (about 11 km) before
 * calling this, and it is rounded again here. The point is passed to Photon to
 * name the nearest town and is never logged or stored; the page then searches
 * from that town's own coordinates.
 */
const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

const json = (status: number, body: object) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** GET ?lat=&lng=&lang= — the nearest city or town, or { place: null }. */
export async function GET(req: Request) {
  if (!rateLimit(`reverse:${clientKey(req)}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs).allowed) {
    return json(429, { error: "Too many searches in a short time. Wait a minute and try again.", code: "rate_limited" });
  }
  const params = new URL(req.url).searchParams;
  const point = roundedPoint(params.get("lat"), params.get("lng"));
  if (!point) return json(400, { error: "Invalid location.", code: "invalid" });
  const lang = LOCALES.find((l) => l === params.get("lang")) ?? "en";
  try {
    return json(200, { place: await nearestPlace(point.lat, point.lng, lang) });
  } catch (err) {
    if (err instanceof GeocoderUnavailableError) return json(503, { error: "Place search isn't available right now.", code: "unavailable" });
    throw err;
  }
}
