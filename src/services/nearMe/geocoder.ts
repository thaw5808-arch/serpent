import "server-only";
import { roundedPoint } from "@/lib/geo";
import { USER_AGENT, type FetchLike } from "./gbif";

/*
 * City search and reverse lookup through Photon (photon.komoot.io), which is
 * built for search-as-you-type over OpenStreetMap data. Nominatim's public
 * server forbids autocomplete, so it isn't used. Photon's demo server asks for
 * a reasonable request volume: the client waits for a pause in typing and needs
 * three characters, the server caches answers and caps its own request rate,
 * and pages credit "© OpenStreetMap contributors" (ODbL).
 */

const API = "https://photon.komoot.io";
const TIMEOUT_MS = 8000;
/** Photon names places in these languages; anything else gets the local name. */
const PHOTON_LANGS = new Set(["en", "de", "fr"]);

export interface Place {
  name: string;
  /** Province/state, to tell same-named places apart. */
  region: string | null;
  country: string | null;
  /** ISO 3166-1 alpha-2, upper case, or null. */
  countryCode: string | null;
  /** The place's own coordinates, rounded (see src/lib/geo.ts). */
  lat: number;
  lng: number;
}

export class GeocoderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocoderUnavailableError";
  }
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { name?: string; state?: string; country?: string; countrycode?: string };
}

function toPlaces(features: PhotonFeature[]): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const [lng, lat] = f.geometry?.coordinates ?? [];
    const point = roundedPoint(lat, lng);
    if (!p.name || !point) continue;
    const key = `${p.name}|${p.state ?? ""}|${p.countrycode ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: p.name,
      region: p.state ?? null,
      country: p.country ?? null,
      countryCode: p.countrycode ? p.countrycode.toUpperCase() : null,
      ...point,
    });
  }
  return out;
}

async function photon(fetchImpl: FetchLike, path: string, params: Record<string, string>): Promise<Place[]> {
  let res: Response;
  try {
    res = await fetchImpl(`${API}${path}?${new URLSearchParams(params)}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GeocoderUnavailableError("Photon request failed");
  }
  if (!res.ok) throw new GeocoderUnavailableError(`Photon answered ${res.status}`);
  const body = (await res.json().catch(() => null)) as { features?: PhotonFeature[] } | null;
  if (!body || !Array.isArray(body.features)) throw new GeocoderUnavailableError("Photon sent no features");
  return toPlaces(body.features);
}

const photonLang = (locale: string) => (PHOTON_LANGS.has(locale) ? locale : "default");

/** Cities, towns and villages matching what the user typed. */
export function searchPlaces(q: string, locale: string, fetchImpl: FetchLike = fetch): Promise<Place[]> {
  return photon(fetchImpl, "/api/", { q, limit: "6", lang: photonLang(locale), layer: "city" });
}

/** The nearest city or town to a (rounded) point, or null when none is within 25 km. */
export async function nearestPlace(lat: number, lng: number, locale: string, fetchImpl: FetchLike = fetch): Promise<Place | null> {
  const places = await photon(fetchImpl, "/reverse", {
    lat: String(lat),
    lon: String(lng),
    lang: photonLang(locale),
    layer: "city",
    radius: "25",
    limit: "1",
  });
  return places[0] ?? null;
}
