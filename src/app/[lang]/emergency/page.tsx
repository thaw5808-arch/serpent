import type { Metadata } from "next";
import { EmergencyPanel } from "@/components/safety/EmergencyPanel";
import { SourceList } from "@/components/venom/SourceList";
import { getSource } from "@/services/venomDatabase";
import { FIRST_AID_SOURCE_IDS } from "@/data/firstAid";
import { alternates } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return { title: t.meta.emergencyTitle, alternates: alternates(locale, "/emergency") };
}

export default async function EmergencyPage() {
  const t = await getDictionary();
  const sources = [...FIRST_AID_SOURCE_IDS, "anzcor-948"].map(getSource).filter((s) => s !== null);
  return (
    <div className="page py-8 lg:py-12">
      <h1 className="sr-only">{t.emergency.srTitle}</h1>
      <EmergencyPanel />
      <section aria-labelledby="em-sources" className="mt-16">
        <h2 id="em-sources" className="type-h3">{t.emergency.sourcesTitle}</h2>
        <div className="mt-3">
          <SourceList sources={sources} />
        </div>
      </section>
    </div>
  );
}
