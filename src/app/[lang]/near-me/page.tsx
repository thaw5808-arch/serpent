import type { Metadata } from "next";
import { NearMeScreen } from "@/components/nearMe/NearMeScreen";
import { alternates } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  return { title: t.meta.nearMeTitle, description: t.nearMe.lead, alternates: alternates(locale, "/near-me") };
}

export default function NearMePage() {
  // The chosen place lives in this browser (localStorage), so the page renders on the client.
  return (
    <div className="page py-8 lg:py-12">
      <NearMeScreen />
    </div>
  );
}
