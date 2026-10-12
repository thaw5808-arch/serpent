"use client";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useT } from "@/i18n/client";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, localePath, stripLocale, type Locale } from "@/i18n/config";

/** Remembers an explicit language choice for future visits (read by src/proxy.ts). */
function saveChoice(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** English · ไทย · မြန်မာ — each in its own script; switching keeps the current page. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const t = useT();
  const current = useLocale();
  const path = stripLocale(usePathname() ?? "/");
  return (
    <nav aria-label={t.language.label} className={className}>
      <ul className="flex items-center">
        {LOCALES.map((l, i) => (
          <li key={l} className="flex items-center">
            {i > 0 && <span aria-hidden className="px-1 text-ink-2">·</span>}
            <NextLink
              href={localePath(l, path)}
              lang={l}
              hrefLang={l}
              aria-current={l === current ? "true" : undefined}
              onClick={() => saveChoice(l)}
              className={`inline-flex min-h-11 items-center px-1.5 text-small ${
                l === current ? "font-semibold text-ink" : "text-ink-2 underline-offset-4 hover:text-ink hover:underline"
              }`}
            >
              {LOCALE_NAMES[l]}
            </NextLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
