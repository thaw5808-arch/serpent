import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.meta.notFoundTitle };
}

export default async function NotFound() {
  const t = await getDictionary();
  return (
    <div className="page py-16 lg:py-24">
      <div className="max-w-[720px]">
        <h1 className="type-h1">{t.notFound.title}</h1>
        <p className="mt-3 text-lead text-ink-2">{t.notFound.body}</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <ButtonLink href="/identify">{t.notFound.identify}</ButtonLink>
          <ButtonLink href="/emergency" variant="danger">{t.notFound.bitten}</ButtonLink>
        </div>
      </div>
    </div>
  );
}
