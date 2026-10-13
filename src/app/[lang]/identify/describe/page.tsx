import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { DescribeFlow } from "@/components/describe/DescribeFlow";
import { DescribeNotice } from "@/components/layout/ProviderDisclosure";
import { alternates } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return { title: t.describe.title, alternates: alternates(locale, "/identify/describe") };
}

export default async function DescribePage() {
  const t = await getDictionary();
  return (
    <div className="page py-8 lg:py-12">
      <div className="mx-auto max-w-[720px]">
        <h1 className="type-h1">{t.describe.title}</h1>
        <p className="mt-3 text-lead text-ink-2">{t.describe.lead}</p>
        <p className="mt-6 flex items-start gap-2 text-small">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-caution" />
          <span>{t.describe.result.disclaimer}</span>
        </p>
        <div className="mt-6">
          <DescribeFlow notice={<DescribeNotice t={t} />} />
        </div>
      </div>
    </div>
  );
}
