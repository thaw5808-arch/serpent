"use client";
import NextLink from "next/link";
import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { hasLocale, localePath, type Locale } from "./config";
import type { Messages } from "./messages";

const I18nContext = createContext<{ locale: Locale; messages: Messages } | null>(null);

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  return <I18nContext.Provider value={{ locale, messages }}>{children}</I18nContext.Provider>;
}

function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}

/** The current dictionary. */
export const useT = () => useI18n().messages;
export const useLocale = () => useI18n().locale;

/** Prefixes an app path with the locale. External links, anchors, /api and already-prefixed paths pass through. */
export function localizeHref(locale: Locale, href: string): string {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) return href;
  const first = href.split(/[/?#]/)[1];
  return hasLocale(first) ? href : localePath(locale, href);
}

/** next/link that keeps the user in their language. */
export function Link({ href, ...props }: Omit<ComponentProps<typeof NextLink>, "href"> & { href: string }) {
  const locale = useLocale();
  return <NextLink href={localizeHref(locale, href)} {...props} />;
}
