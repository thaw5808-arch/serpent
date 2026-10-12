import type { Metadata } from "next";
import { LOCALES, localePath, type Locale } from "./config";

/** Absolute base for canonical and hreflang links. Set SITE_URL in production. */
export const metadataBase = new URL(process.env.SITE_URL ?? "http://localhost:3000");

/**
 * Canonical URL for this locale plus hreflang alternates for every locale.
 * x-default points at the unprefixed path, which picks a language for the visitor.
 */
export function alternates(locale: Locale, path: string): Metadata["alternates"] {
  return {
    canonical: localePath(locale, path),
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, localePath(l, path)])),
      "x-default": path,
    },
  };
}
