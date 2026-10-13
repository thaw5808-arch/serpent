import type { Metadata } from "next";
import { Suspense } from "react";
import { DoctorCardScreen } from "@/components/doctorCard/DoctorCardScreen";
import { LOCALES } from "@/i18n/config";
import { alternates } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";
import type { CardDict, CardDicts } from "@/lib/doctorCard";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  // The card is personal and lives only in this browser: nothing to index.
  return { title: t.doctorCard.pageTitle, alternates: alternates(locale, "/doctor-card"), robots: { index: false } };
}

/**
 * The card can be shown in any language, whatever the site language, so every
 * language's card text is sent with the page. It is all the card needs: after
 * this load it makes no network requests.
 */
async function cardDicts(): Promise<CardDicts> {
  const entries = await Promise.all(
    LOCALES.map(async (l) => {
      const { doctorCard, venomStatus, venomType, risk, candidate } = await getDictionary(l);
      return [l, { doctorCard, venomStatus, venomType, risk, candidate } satisfies CardDict] as const;
    }),
  );
  return Object.fromEntries(entries) as CardDicts;
}

export default async function DoctorCardPage() {
  const [t, dicts] = await Promise.all([getDictionary(), cardDicts()]);
  return (
    <div className="dc-page page py-8 lg:py-12">
      {/* ?result= picks the result, read on the client from this device's storage. */}
      <Suspense fallback={<div role="status" aria-label={t.doctorCard.loading} className="h-64 animate-pulse rounded-card bg-surface-2" />}>
        <DoctorCardScreen dicts={dicts} />
      </Suspense>
    </div>
  );
}
