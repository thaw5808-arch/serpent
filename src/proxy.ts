import { NextResponse, type NextRequest } from "next/server";
import { COUNTRY_COOKIE, hasLocale, LOCALE_COOKIE, localePath } from "@/i18n/config";
import { pickLocale } from "@/i18n/negotiate";

/**
 * Sends unprefixed page URLs to a locale (/species → /th/species): the saved
 * choice, else Accept-Language, else the selected country, else English.
 * API routes, admin pages, Next internals and files are never prefixed.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (hasLocale(pathname.split("/")[1])) return;

  const locale = pickLocale({
    saved: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
    country: request.cookies.get(COUNTRY_COOKIE)?.value,
  });
  const url = request.nextUrl.clone();
  url.pathname = localePath(locale, pathname);
  const response = NextResponse.redirect(url);
  // The target depends on these request headers and cookies.
  response.headers.set("Vary", "Accept-Language, Cookie");
  return response;
}

export const config = {
  matcher: ["/((?!api|admin|_next|.*\\..*).*)"],
};
