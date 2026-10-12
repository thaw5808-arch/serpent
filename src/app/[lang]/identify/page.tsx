import type { Metadata } from "next";
import { IdentifyFlow } from "@/components/upload/IdentifyFlow";
import { PhotoUploadNotice } from "@/components/layout/ProviderDisclosure";
import { alternates } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return { title: t.meta.identifyTitle, alternates: alternates(locale, "/identify") };
}

export default async function IdentifyPage() {
  const t = await getDictionary();
  return (
    <div className="page py-8 lg:py-12">
      <div className="mx-auto max-w-[720px]">
        <h1 className="type-h1">{t.identify.title}</h1>
        <p className="mt-3 text-lead text-ink-2">{t.identify.lead}</p>
        <div className="mt-8">
          <IdentifyFlow notice={<PhotoUploadNotice t={t} />} />
        </div>
      </div>
    </div>
  );
}
