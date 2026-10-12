import { Siren } from "lucide-react";
import { Link } from "@/i18n/client";
import { getDictionary } from "@/i18n/server";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileMenu } from "./MobileMenu";

export async function SiteHeader() {
  const t = await getDictionary();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper">
      <div className="page flex h-16 items-center gap-8">
        <Link
          href="/"
          className="type-name inline-flex min-h-11 items-center text-[1.5rem] tracking-[-0.025em]"
          aria-label={t.common.homeAria}
        >
          Serpent
        </Link>
        <nav aria-label={t.common.mainNav} className="hidden items-center gap-6 text-small font-medium text-ink-2 md:flex">
          <Link href="/identify" className="inline-flex min-h-11 items-center hover:text-ink">{t.common.navIdentify}</Link>
          <Link href="/species" className="inline-flex min-h-11 items-center hover:text-ink">{t.common.navSpecies}</Link>
          <Link href="/near-me" className="inline-flex min-h-11 items-center hover:text-ink">{t.common.navNearMe}</Link>
          <Link href="/history" className="inline-flex min-h-11 items-center hover:text-ink">{t.common.navHistory}</Link>
        </nav>
        <LanguageSwitcher className="ml-auto hidden md:block" />
        <Link
          href="/emergency"
          className="hidden min-h-11 items-center gap-2 rounded-full bg-emergency px-5 text-small font-semibold text-emergency-ink hover:opacity-90 md:inline-flex"
        >
          <Siren aria-hidden className="size-4" />
          {t.common.bitten}
        </Link>
        <div className="ml-auto flex items-center gap-1 md:hidden">
          <Link href="/species" className="inline-flex min-h-11 items-center px-3 text-small font-medium text-ink-2 hover:text-ink">
            {t.common.navSpecies}
          </Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
