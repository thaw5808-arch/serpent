import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PhotoPrivacyText } from "@/components/layout/ProviderDisclosure";
import { alternates } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return { title: t.meta.privacyTitle, alternates: alternates(locale, "/privacy") };
}

export default async function PrivacyPage() {
  const t = await getDictionary();
  const p = t.privacy;
  const points: [string, ReactNode][] = [
    [p.photo, <PhotoPrivacyText key="photo" t={t} />],
    [p.result, p.resultBody],
    [p.history, p.historyBody],
    [p.location, p.locationBody],
    [p.language, p.languageBody],
    [p.reports, p.reportsBody],
    [p.logs, p.logsBody],
    [p.rateLimit, p.rateLimitBody],
  ];
  return (
    <div className="page py-8 lg:py-12">
      <div className="max-w-[880px]">
        <h1 className="type-h1">{p.title}</h1>
        <p className="mt-3 text-lead text-ink-2">{p.lead}</p>
        <dl className="mt-8 divide-y divide-line border-y border-line">
          {points.map(([term, d]) => (
            <div key={term} className="grid gap-1 py-5 sm:grid-cols-[12rem_1fr] sm:gap-6">
              <dt className="type-h3">{term}</dt>
              <dd className="text-ink-2">{d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
