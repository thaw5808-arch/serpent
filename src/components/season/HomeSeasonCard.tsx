"use client";
import { ArrowRight, CalendarDays } from "lucide-react";
import { usePlace } from "@/components/nearMe/usePlace";
import { Link, useLocale, useT } from "@/i18n/client";
import { fmt, monthName } from "@/i18n/format";
import { monthStanding } from "@/lib/season";
import { currentMonth, useSeason } from "./useSeason";

/**
 * Home page: how this month compares near the city remembered from Snakes near me.
 * Shows nothing without a remembered city, while loading, on failure, or when there
 * are too few records to say.
 */
export function HomeSeasonCard() {
  const t = useT();
  const locale = useLocale();
  const [place] = usePlace();
  const state = useSeason(place);
  if (!place || state?.status !== "ok") return null;

  const month = currentMonth();
  const standing = monthStanding(state.data.months, month);
  if (!standing) return null;
  const text = { busy: t.season.cardBusy, quieter: t.season.cardQuieter, average: t.season.cardAverage }[standing];

  return (
    <div className="page pt-8">
      <section aria-labelledby="home-season" className="flex max-w-[720px] items-start gap-3 rounded-card border border-line bg-surface p-4 sm:p-5">
        <CalendarDays aria-hidden className="mt-1 size-5 shrink-0 text-gold-light" />
        <div className="min-w-0">
          <h2 id="home-season" className="font-semibold">{fmt(text, { month: monthName(month, locale), city: place.name })}</h2>
          <p className="mt-1 text-small text-ink-2">{t.season.cardNote}</p>
          <Link href="/near-me" className="mt-2 inline-flex min-h-11 items-center gap-1 text-small font-medium underline underline-offset-4">
            {fmt(t.season.cardLink, { city: place.name })} <ArrowRight aria-hidden className="size-4 shrink-0" />
          </Link>
        </div>
      </section>
    </div>
  );
}
