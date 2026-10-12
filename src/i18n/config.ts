/** Supported interface languages. Burmese is "my" (ISO 639-1), always Myanmar Unicode, never Zawgyi. */
export const LOCALES = ["en", "th", "my"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const hasLocale = (value: string | null | undefined): value is Locale =>
  (LOCALES as readonly string[]).includes(value ?? "");

/** Each language named in its own script, for the switcher. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", th: "ไทย", my: "မြန်မာ" };

/** The saved language choice (set only when the user picks a language). */
export const LOCALE_COOKIE = "serpent-lang";
/** Mirrors the chosen country so a first visit can pick Thai or Burmese from it. */
export const COUNTRY_COOKIE = "serpent-country";

/** Countries whose main language has a translation. */
export const COUNTRY_LOCALE: Record<string, Locale> = { TH: "th", MM: "my" };

/** `/species/x` → `/th/species/x`. Paths must start with "/". */
export function localePath(locale: Locale, path: string): string {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** `/th/species/x` → `/species/x`; paths without a locale come back unchanged. */
export function stripLocale(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  if (!hasLocale(first)) return pathname || "/";
  return rest.length ? `/${rest.join("/")}` : "/";
}
