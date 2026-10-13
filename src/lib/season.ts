/*
 * "Snake season": which months snakes are most often recorded near a place.
 * Pure rules over GBIF's monthly record counts, shared by the server and the page.
 * They only describe when records were made; they never claim why (no climate claims).
 */

/** Below this many records in total, no pattern is shown. */
export const MIN_SEASON_RECORDS = 30;
/** A peak month has at least this multiple of the monthly average… */
export const PEAK_FACTOR = 1.25;
/** …and there are at most this many (the busiest ones). */
export const MAX_PEAKS = 4;
/** On the home card, a month this far below the average is "quieter" (mirrors PEAK_FACTOR). */
export const QUIET_FACTOR = 0.75;

/** Record counts for January … December (index 0 = January). */
export type MonthCounts = number[];

export interface SeasonData {
  /** Records of all snakes per month. */
  months: MonthCounts;
  total: number;
  /**
   * Records of the high and very high risk species recorded near the place (up to 8),
   * or null when they couldn't be loaded. `species` holds their names, never translated.
   */
  dangerous: { months: MonthCounts; total: number; species: string[] } | null;
  /** The all-snakes query as a GBIF API URL, so anyone can check the counts. */
  queryUrl: string;
  sinceYear: number;
  fetchedAt: string;
  cached: boolean;
}

export type SeasonPattern =
  | { kind: "not_enough"; total: number }
  | { kind: "even"; total: number; average: number }
  /** `peaks` are month numbers 1–12, in calendar order. */
  | { kind: "peaks"; total: number; average: number; peaks: number[] };

export const sum = (m: MonthCounts) => m.reduce((a, b) => a + b, 0);

export function seasonPattern(months: MonthCounts): SeasonPattern {
  const total = sum(months);
  if (total < MIN_SEASON_RECORDS) return { kind: "not_enough", total };
  const average = total / 12;
  const peaks = months
    .map((count, i) => ({ month: i + 1, count }))
    .filter((m) => m.count >= PEAK_FACTOR * average)
    .sort((a, b) => b.count - a.count || a.month - b.month)
    .slice(0, MAX_PEAKS)
    .map((m) => m.month)
    .sort((a, b) => a - b);
  return peaks.length ? { kind: "peaks", total, average, peaks } : { kind: "even", total, average };
}

/** How one month compares with the rest, for the home card; null when there aren't enough records. */
export function monthStanding(months: MonthCounts, month: number): "busy" | "quieter" | "average" | null {
  const p = seasonPattern(months);
  if (p.kind === "not_enough") return null;
  if (p.kind === "peaks" && p.peaks.includes(month)) return "busy";
  return months[month - 1] < QUIET_FACTOR * p.average ? "quieter" : "average";
}
