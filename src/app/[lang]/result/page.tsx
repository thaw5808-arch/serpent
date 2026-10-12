import type { Metadata } from "next";
import { ResultScreen } from "@/components/identification/ResultScreen";
import { alternates } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return { title: t.meta.resultTitle, alternates: alternates(locale, "/result") };
}

export default async function ResultPage() {
  const t = await getDictionary();
  return (
    <div className="page py-8 lg:py-12">
      <h1 className="sr-only">{t.result.srTitle}</h1>
      <ResultScreen />
    </div>
  );
}
