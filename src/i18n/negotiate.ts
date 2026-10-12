import { COUNTRY_LOCALE, DEFAULT_LOCALE, hasLocale, LOCALES, type Locale } from "./config";

/** Parses an Accept-Language header into language subtags, best first (q=0 entries dropped). */
export function acceptedLanguages(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.slice(2)) : 1, i };
    })
    .filter((x) => x.tag && x.tag !== "*" && Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .map((x) => x.tag);
}

/**
 * First-visit language: the saved choice, else the best Accept-Language match,
 * else the selected country (TH → th, MM → my), else English.
 */
export function pickLocale(input: {
  saved?: string | null;
  acceptLanguage?: string | null;
  country?: string | null;
}): Locale {
  if (hasLocale(input.saved)) return input.saved;
  for (const tag of acceptedLanguages(input.acceptLanguage)) {
    const base = tag.split("-")[0];
    const match = LOCALES.find((l) => l === base);
    if (match) return match;
  }
  const fromCountry = input.country ? COUNTRY_LOCALE[input.country.toUpperCase()] : undefined;
  return fromCountry ?? DEFAULT_LOCALE;
}
