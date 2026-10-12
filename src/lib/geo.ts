/**
 * Coordinates are rounded to one decimal place before they leave the device and
 * again on the server: 0.1° is about 11 km north–south (less east–west away from
 * the equator), which is enough to find snake records within 50 km and too coarse
 * to point at anyone's home. The rounded point is also the cache key.
 */
export const COORD_DECIMALS = 1;

const FACTOR = 10 ** COORD_DECIMALS;

export function roundCoord(value: number): number {
  // Adding 0 turns -0 into 0, so the cache key for a point on the equator is stable.
  return Math.round(value * FACTOR) / FACTOR + 0;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** A valid, rounded point, or null when either value is missing or out of range. */
export function roundedPoint(lat: unknown, lng: unknown): LatLng | null {
  // Number("") is 0: an empty value must not become the equator.
  const num = (v: unknown) => (typeof v === "string" ? (v.trim() ? Number(v) : NaN) : v);
  const la = num(lat);
  const ln = num(lng);
  if (typeof la !== "number" || typeof ln !== "number" || !Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return { lat: roundCoord(la), lng: roundCoord(ln) };
}
