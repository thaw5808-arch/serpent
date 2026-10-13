"use client";
import { usePathname } from "next/navigation";
import { Phone, Siren } from "lucide-react";
import { getCountry } from "@/data/countries";
import { Link, useT } from "@/i18n/client";
import { stripLocale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { useCountry } from "@/lib/useCountry";

/** The selected country's first emergency number, if one is verified. */
function useEmergencyNumber() {
  const [code] = useCountry();
  return getCountry(code)?.emergency[0] ?? null;
}

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

/**
 * Mobile replacement for the header's emergency pill: a dark-red bar pinned to the
 * bottom of the screen on every page except the emergency page itself.
 * Phone numbers are always shown as written (Western digits) so they can be dialled.
 */
export function MobileEmergencyBar() {
  const t = useT();
  const pathname = usePathname();
  const contact = useEmergencyNumber();
  if (stripLocale(pathname ?? "/") === "/emergency") return null;
  return (
    <div className="no-print sticky bottom-0 z-30 border-t border-emergency bg-emergency md:hidden">
      <Link
        href="/emergency"
        className="page flex min-h-15 items-center justify-between gap-4 text-emergency-ink"
      >
        <span className="inline-flex items-center gap-2 font-semibold">
          <Siren aria-hidden className="size-5 shrink-0" /> {t.common.bitten}
        </span>
        {contact && (
          <span className="inline-flex shrink-0 items-center gap-2 text-lead font-semibold tabular-nums">
            <Phone aria-hidden className="size-4" />
            <span className="sr-only">{t.common.emergencyNumber} </span>
            <span dir="ltr">{contact.number}</span>
          </span>
        )}
      </Link>
    </div>
  );
}

/** In-page emergency action on the result: calls the selected country's number, or opens guidance. */
export function EmergencyCallBar() {
  const t = useT();
  const contact = useEmergencyNumber();
  const cls =
    "flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-card bg-emergency px-5 py-3 text-emergency-ink hover:opacity-95";
  if (!contact) {
    return (
      <Link href="/emergency" className={cls}>
        <span className="font-semibold">{t.result.ifBitten}</span>
        <span className="inline-flex items-center gap-2 font-semibold">
          <Siren aria-hidden className="size-5 shrink-0" /> {t.result.getGuidance}
        </span>
      </Link>
    );
  }
  return (
    <a href={tel(contact.number)} className={cls}>
      <span className="font-semibold">{t.result.ifBitten}</span>
      <span className="inline-flex items-center gap-2 text-lead font-semibold tabular-nums">
        <Phone aria-hidden className="size-5 shrink-0" /> {fmt(t.result.call, { number: contact.number })}
        <span className="sr-only">, {t.contacts[contact.label]}</span>
      </span>
    </a>
  );
}
