"use client";
import { CalendarDays } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { fmt, formatCount, formatYear, monthName } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { seasonPattern, type SeasonData, type SeasonPattern } from "@/lib/season";
import type { Place } from "@/services/nearMe/geocoder";
import { currentMonth, useSeason } from "./useSeason";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** One sentence that names the peak months in words (or says there is no clear peak). */
export function seasonSummary(pattern: SeasonPattern, place: string, t: Messages, locale: Locale): string {
  if (pattern.kind === "not_enough") return t.season.notEnough;
  if (pattern.kind === "even") return t.season.even;
  return fmt(t.season.peaks, { place, months: pattern.peaks.map((m) => monthName(m, locale)).join(t.common.listSeparator) });
}

/** "Snake season near {place}" on Snakes near me: chart, a hidden table of the same numbers, and the note. */
export function SeasonSection({ place }: { place: Place }) {
  const t = useT();
  const locale = useLocale();
  const state = useSeason(place);

  return (
    <section aria-labelledby="season-title" aria-busy={state?.status === "loading"} className="mt-8 max-w-[880px] rounded-card border border-line bg-surface p-5 sm:p-6">
      <h2 id="season-title" className="type-h3 flex items-center gap-2">
        <CalendarDays aria-hidden className="size-5 shrink-0 text-gold-light" />
        {fmt(t.season.title, { place: place.name })}
      </h2>
      {state?.status === "loading" && (
        <div role="status" className="mt-4 space-y-3">
          <p className="text-small text-ink-2">{t.season.loading}</p>
          <div className="h-40 animate-pulse rounded-card bg-surface-2" />
        </div>
      )}
      {state?.status === "error" && <p className="mt-3 text-small text-ink-2">{t.season.unavailable}</p>}
      {state?.status === "ok" && <Season data={state.data} place={place.name} t={t} locale={locale} />}
      <p className="mt-4 border-t border-divider pt-3 text-caption text-ink-2">{t.season.note}</p>
    </section>
  );
}

function Season({ data, place, t, locale }: { data: SeasonData; place: string; t: Messages; locale: Locale }) {
  const pattern = seasonPattern(data.months);
  const summary = <p className="mt-3 text-body">{seasonSummary(pattern, place, t, locale)}</p>;
  if (pattern.kind === "not_enough") return summary;

  const now = currentMonth();
  const peaks = new Set(pattern.kind === "peaks" ? pattern.peaks : []);
  const max = Math.max(...data.months, 1);
  const danger = data.dangerous && data.dangerous.species.length > 0 ? data.dangerous : null;
  const pct = (n: number) => `${Math.max(n > 0 ? 2 : 0, (n / max) * 100)}%`;

  return (
    <>
      {summary}
      <p className="mt-1 text-small text-ink-2">
        {fmt(t.season.total, { n: formatCount(data.total), year: formatYear(data.sinceYear, locale) })}{" "}
        <a href={data.queryUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-ink">
          {t.nearMe.exactQuery}
          <span className="sr-only"> {t.common.opensInNewTab}</span>
        </a>
      </p>

      {/* The chart repeats the table below for sighted users; screen readers get the table. */}
      <div aria-hidden className="mt-5">
        <div className="season-chart">
          {MONTHS.map((m) => (
            <div key={m} className="season-col" data-now={m === now || undefined} data-peak={peaks.has(m) || undefined}>
              <span className="season-now-label">{m === now ? t.season.now : ""}</span>
              <span className="season-track">
                <span className="season-bar" style={{ height: pct(data.months[m - 1]) }} />
                {danger && <span className="season-danger" style={{ height: pct(danger.months[m - 1]) }} />}
              </span>
              <span className="season-month">
                <span className="sm:hidden">{monthName(m, locale, locale === "th" ? "short" : "narrow")}</span>
                <span className="hidden sm:inline">{monthName(m, locale, "short")}</span>
              </span>
              <span className="season-peak">{peaks.has(m) ? "▲" : ""}</span>
            </div>
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-caption text-ink-2">
          <li className="inline-flex items-center gap-2"><span className="season-key season-key-all" />{t.season.legendAll}</li>
          {danger && <li className="inline-flex items-center gap-2"><span className="season-key season-key-danger" />{t.season.legendDangerous}</li>}
          {peaks.size > 0 && <li className="inline-flex items-center gap-2"><span className="season-peak-key">▲</span>{t.season.legendPeak}</li>}
        </ul>
      </div>

      {/* sr-only on the table itself doesn't shrink it (tables size to their content), so it goes on a wrapper. */}
      <div className="sr-only">
        <table>
          <caption>{fmt(t.season.tableCaption, { place })}</caption>
          <thead>
            <tr>
              <th scope="col">{t.season.colMonth}</th>
              <th scope="col">{t.season.colAll}</th>
              {danger && <th scope="col">{t.season.colDangerous}</th>}
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((m) => (
              <tr key={m}>
                <th scope="row">{monthName(m, locale)}{m === now ? ` (${t.season.now})` : ""}</th>
                <td>{formatCount(data.months[m - 1])}</td>
                {danger && <td>{formatCount(danger.months[m - 1])}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-small text-ink-2">
        {data.dangerous === null
          ? t.season.dangerousUnavailable
          : danger
            ? fmt(t.season.dangerousIncludes, { names: danger.species.join(t.common.listSeparator) })
            : t.season.noDangerous}
      </p>
    </>
  );
}
