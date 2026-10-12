import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";

export async function SiteFooter() {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return (
    <footer className="border-t border-line">
      <div className="page grid gap-6 py-10 text-small text-ink-2 md:grid-cols-[2fr_1fr]">
        <div>
          <p className="type-name text-ink">Serpent</p>
          <p className="mt-2 max-w-prose">{t.footer.disclaimer}</p>
          {locale === "my" && <p className="mt-2">{t.footer.unicodeNote}</p>}
        </div>
        <ul className="flex flex-col divide-y divide-divider border-y border-divider md:border-0 md:divide-y-0 md:items-end">
          <li><Link href="/species" className="flex min-h-11 items-center hover:text-ink">{t.common.navSpeciesReference}</Link></li>
          <li><Link href="/privacy" className="flex min-h-11 items-center hover:text-ink">{t.common.navPrivacy}</Link></li>
          <li><Link href="/emergency" className="flex min-h-11 items-center hover:text-ink">{t.common.navEmergency}</Link></li>
        </ul>
      </div>
    </footer>
  );
}
