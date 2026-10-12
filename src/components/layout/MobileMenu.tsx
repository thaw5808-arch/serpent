"use client";
import { useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Siren, X } from "lucide-react";
import { Link, useT } from "@/i18n/client";
import { LanguageSwitcher } from "./LanguageSwitcher";

/** Mobile navigation: a disclosure under the header, closed on navigation or Escape. */
export function MobileMenu() {
  const t = useT();
  const links = [
    { href: "/identify", label: t.common.navIdentify },
    { href: "/species", label: t.common.navSpeciesReference },
    { href: "/privacy", label: t.common.navPrivacy },
  ];
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const id = useId();

  // Close when the route changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-11 items-center justify-center rounded-card text-ink hover:bg-surface-2"
      >
        {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
        <span className="sr-only">{t.common.menu}</span>
      </button>
      <nav
        id={id}
        aria-label={t.common.mainMobileNav}
        hidden={!open}
        className="absolute inset-x-0 top-16 border-b border-line bg-paper"
      >
        <ul className="page divide-y divide-divider py-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex min-h-13 items-center text-body font-medium">
                {l.label}
              </Link>
            </li>
          ))}
          <li className="py-3">
            <Link
              href="/emergency"
              className="flex min-h-13 items-center gap-2 rounded-card bg-emergency px-4 font-semibold text-emergency-ink"
            >
              <Siren aria-hidden className="size-5" /> {t.common.bitten}
            </Link>
          </li>
          <li className="py-1">
            <LanguageSwitcher />
          </li>
        </ul>
      </nav>
    </>
  );
}
