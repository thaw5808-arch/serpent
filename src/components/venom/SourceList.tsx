"use client";
import { ExternalLink } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { fmt, formatDate } from "@/i18n/format";
import type { SourceRecord } from "@/types";

/** Source titles and publishers are bibliographic records, shown as published (in English). */
export function SourceList({ sources }: { sources: SourceRecord[] }) {
  const t = useT();
  const locale = useLocale();
  if (sources.length === 0) {
    return <p className="text-ink-2">{t.sources.none}</p>;
  }
  return (
    <ul className="divide-y divide-line border-y border-line">
      {sources.map((s) => (
        <li key={s.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <div lang="en">
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-2 hover:underline">
                {s.title}
                <ExternalLink aria-hidden className="ml-1 inline size-3.5 align-baseline" />
                <span className="sr-only" lang={locale}> {t.common.opensInNewTab}</span>
              </a>
            ) : (
              <span className="font-medium">{s.title}</span>
            )}
            <p className="text-small text-ink-2">
              {s.publisher}
              {s.year ? `, ${s.year}` : ""}
            </p>
          </div>
          <span className="shrink-0 text-small text-ink-2">
            {s.lastVerified ? fmt(t.sources.verified, { date: formatDate(s.lastVerified, locale) }) : t.sources.notVerified}
          </span>
        </li>
      ))}
    </ul>
  );
}
