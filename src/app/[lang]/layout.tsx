import type { Metadata, Viewport } from "next";
import { Noto_Sans_Myanmar, Noto_Sans_Thai, Noto_Serif_Myanmar, Noto_Serif_Thai, Schibsted_Grotesk } from "next/font/google";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource-variable/source-serif-4/opsz-italic.css";
import "../globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileEmergencyBar } from "@/components/safety/EmergencyBar";
import { I18nProvider } from "@/i18n/client";
import { LOCALES, type Locale } from "@/i18n/config";
import { metadataBase } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-schibsted",
});

/*
 * Thai and Burmese faces. Their CSS variables are only set on /th and /my, so the
 * font files are only downloaded there; preloading is off so English pages never
 * fetch them. Latin text (names, numbers) keeps the Latin faces listed first.
 */
const sansThai = Noto_Sans_Thai({ subsets: ["thai"], weight: ["400", "500", "600"], variable: "--font-noto-sans-thai", preload: false });
const serifThai = Noto_Serif_Thai({ subsets: ["thai"], weight: ["500", "600"], variable: "--font-noto-serif-thai", preload: false });
const sansMyanmar = Noto_Sans_Myanmar({ subsets: ["myanmar"], weight: ["400", "500", "600"], variable: "--font-noto-sans-myanmar", preload: false });
const serifMyanmar = Noto_Serif_Myanmar({ subsets: ["myanmar"], weight: ["500", "600"], variable: "--font-noto-serif-myanmar", preload: false });

const LOCALE_FONTS: Record<Locale, string> = {
  en: "",
  th: `${sansThai.variable} ${serifThai.variable}`,
  my: `${sansMyanmar.variable} ${serifMyanmar.variable}`,
};

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1512" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return (
    <html lang={locale} className={`${sans.variable} ${LOCALE_FONTS[locale]}`}>
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
