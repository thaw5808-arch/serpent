import type { Metadata } from "next";
import { SpeciesBrowser } from "@/components/identification/SpeciesBrowser";
import { alternates } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";
import { listSpecies } from "@/services/venomDatabase";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return { title: t.meta.speciesTitle, alternates: alternates(locale, "/species") };
}

export default async function SpeciesPage() {
  const t = await getDictionary();
  return (
    <div className="page py-8 lg:py-12">
      <h1 className="type-h1">{t.speciesList.title}</h1>
      <p className="mt-3 max-w-prose text-ink-2">{t.speciesList.lead}</p>
      <div className="mt-8">
        <SpeciesBrowser species={listSpecies()} />
      </div>
    </div>
  );
}
