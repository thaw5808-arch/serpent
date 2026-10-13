"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Phone } from "lucide-react";
import { Link, useT } from "@/i18n/client";
import { stripLocale } from "@/i18n/config";
import { LanguageSwitcher } from "./LanguageSwitcher";

/** The page a path belongs to: nested routes (/species/[slug]) light up their section; a result belongs to Identify. */
function section(path: string): string | null {
  if (path === "/result") return "/identify";
  const first = path.split("/")[1];
  return first ? `/${first}` : null;
}

/** "Segmented control" header: logo, the four pages in a rounded track, language and the emergency button. */
export function SiteHeader() {
  const t = useT();
  const current = section(stripLocale(usePathname() ?? "/"));
  const links = [
    { href: "/identify", label: t.common.navIdentify },
    { href: "/species", label: t.common.navSpecies },
    { href: "/near-me", label: t.common.navNearMe },
    { href: "/history", label: t.common.navHistory },
  ];

  // The bottom border appears only once the page has scrolled.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="site-header sticky top-0 z-40 bg-paper" data-scrolled={scrolled || undefined}>
      <div className="page flex flex-wrap items-center gap-x-3 pb-2 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-x-4 lg:gap-x-6 md:pb-0">
        <Link
          href="/"
          className="type-name mr-auto inline-flex h-14 items-center justify-self-start text-[23px] md:h-16"
          aria-label={t.common.homeAria}
        >
          Serpent
        </Link>
        <nav aria-label={t.common.mainNav} className="order-last w-full md:order-none md:w-auto">
          <ul className="seg-track">
            {links.map((l) => (
              <li key={l.href} className="flex">
                <Link
                  href={l.href}
                  aria-current={current === l.href ? "page" : undefined}
                  className="seg-link"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2 justify-self-end md:gap-3">
          <LanguageSwitcher />
          <Link href="/emergency" className="bitten-btn">
            <Phone aria-hidden className="size-4 shrink-0" />
            {/* The full label needs the room of a laptop-width row; tablets keep the short one. */}
            <span className="lg:hidden">{t.common.bittenShort}</span>
            <span className="hidden lg:inline">{t.common.bitten}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
