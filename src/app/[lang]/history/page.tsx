import type { Metadata } from "next";
import { Suspense } from "react";
import { HistoryScreen } from "@/components/history/HistoryScreen";
import { alternates } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  // Each visitor's history lives only in their own browser; there is nothing here to index.
  return { title: t.meta.historyTitle, alternates: alternates(locale, "/history"), robots: { index: false } };
}

export default async function HistoryPage() {
  const t = await getDictionary();
  return (
    <div className="page py-8 lg:py-12">
      {/* The list is read from this browser's storage, and ?entry= picks a saved result, so it renders on the client. */}
      <Suspense
        fallback={
          <>
            <h1 className="type-h1">{t.history.title}</h1>
            <div className="mt-8 h-64 animate-pulse rounded-card bg-surface-2" aria-label={t.history.loading} />
          </>
        }
      >
        <HistoryScreen />
      </Suspense>
    </div>
  );
}
