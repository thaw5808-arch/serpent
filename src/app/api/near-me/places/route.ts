import { NextResponse } from "next/server";
import { LOCALES } from "@/i18n/config";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { GeocoderUnavailableError, searchPlaces, type Place } from "@/services/nearMe/geocoder";

/*
 * City autocomplete, proxied so the browser never talks to Photon directly.
 * Photon's public server asks for a reasonable request volume, so answers are
 * cached here and the whole site stays under its own cap.
 */
const PER_CLIENT = { limit: 40, windowMs: 60_000 };
const SITE_WIDE = { limit: 120, windowMs: 60_000 };
const CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { places: Place[]; at: number }>();

const json = (status: number, body: object, cacheControl = "no-store") =>
  NextResponse.json(body, { status, headers: { "Cache-Control": cacheControl } });

/** GET ?q=&lang= — up to six places. `q` needs at least three characters. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const lang = LOCALES.find((l) => l === params.get("lang")) ?? "en";
  if (q.length < 3) return json(200, { places: [] });

  const key = `${lang}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(200, { places: hit.places }, "public, max-age=86400");

  if (!rateLimit(`places:${clientKey(req)}`, PER_CLIENT.limit, PER_CLIENT.windowMs).allowed || !rateLimit("places:site", SITE_WIDE.limit, SITE_WIDE.windowMs).allowed) {
    return json(429, { error: "Too many searches in a short time. Wait a moment and try again.", code: "rate_limited" });
  }

  try {
    const places = await searchPlaces(q, lang);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { places, at: Date.now() });
    return json(200, { places }, "public, max-age=86400");
  } catch (err) {
    if (err instanceof GeocoderUnavailableError) return json(503, { error: "Place search isn't available right now.", code: "unavailable" });
    throw err;
  }
}
