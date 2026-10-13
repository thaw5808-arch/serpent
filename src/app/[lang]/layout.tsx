import type { Metadata, Viewport } from "next";
/*
 * Self-hosted fonts (no request to Google at build or run time). An @font-face rule
 * downloads nothing by itself: a file is fetched only when a font-family stack in
 * use names it and the text needs its unicode-range. The Thai faces are named only
 * under html:lang(th) and the Myanmar faces only under html:lang(my) (globals.css),
 * so /en never fetches them. Latin text (names, numbers) keeps the Latin faces
 * listed first, so the Noto faces' Latin files are never fetched either.
 */
import "@fontsource-variable/schibsted-grotesk/wght.css";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource-variable/source-serif-4/opsz-italic.css";
import "@fontsource-variable/noto-sans-thai/wght.css";
import "@fontsource-variable/noto-serif-thai/wght.css";
import "@fontsource-variable/noto-sans-myanmar/wght.css";
// Noto Serif Myanmar has no variable build: the two heading weights, Myanmar script only.
import "@fontsource/noto-serif-myanmar/myanmar-500.css";
import "@fontsource/noto-serif-myanmar/myanmar-600.css";
import "../globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileEmergencyBar } from "@/components/safety/EmergencyBar";
import { I18nProvider } from "@/i18n/client";
import { LOCALES } from "@/i18n/config";
import { metadataBase } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    metadataBase,
    title: { default: t.meta.siteTitle, template: "%s · Serpent" },
    description: t.meta.siteDescription,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b110e",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col antialiased">
        <I18nProvider locale={locale} messages={t}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-badge focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2"
          >
            {t.common.skipToContent}
          </a>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <MobileEmergencyBar />
          <SiteFooter />
        </I18nProvider>
      </body>
    </html>
  );
}
