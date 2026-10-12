import type { Metadata } from "next";
import { AlertTriangle, Camera } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { VenomStatusBadge } from "@/components/ui/StatusBadge";
import { RiskMeter } from "@/components/venom/RiskMeter";
import { alternates } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";
import { getSpecies } from "@/services/venomDatabase";

const STEP_KEYS = ["photograph", "check", "match", "safety"] as const;
const PROMISE_KEYS = ["harmless", "score", "unknown"] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: alternates(await getLocale(), "/") };
}


export default async function Home() {
  const t = await getDictionary();
  // The example shows real catalog names, which are never translated.
  const krait = getSpecies("malayan-krait")!;
  const wolfSnake = getSpecies("laotian-wolf-snake")!;
  return (
    <>
      <section className="page grid gap-10 pb-16 pt-10 lg:grid-cols-12 lg:items-center lg:gap-8 lg:pb-24 lg:pt-20">
        <div className="lg:col-span-7 lg:pr-8">
          <h1 className="type-display">{t.home.title}</h1>
          <p className="mt-4 max-w-xl text-lead text-ink-2 lg:text-[1.1875rem]">
            {t.home.lead}
          </p>
          <div className="mt-8 max-w-sm">
            <ButtonLink href="/identify" viewfinder className="w-full">
              <Camera aria-hidden className="size-5" /> {t.home.cta}
            </ButtonLink>
          </div>
          <p className="mt-4 flex max-w-xl items-start gap-2 text-small">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-caution" />
            {t.home.neverApproach}
          </p>
        </div>

        <figure aria-label={t.home.exampleLabel} className="rounded-card border border-line bg-surface lg:col-span-5">
          <figcaption className="eyebrow border-b border-divider px-5 py-3">{t.home.exampleLabel}</figcaption>
          <div className="p-5">
            <p className="type-h2 text-[1.75rem]">{krait.commonName}</p>
            <p className="binomial mt-1 text-lead text-ink-2">{krait.scientificName}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <VenomStatusBadge status="venomous" />
              <span className="text-small text-ink-2">{t.band.moderate}</span>
            </div>
            <div className="mt-5 border-t border-divider pt-4">
              <RiskMeter risk="very_high" />
            </div>
            <p className="mt-5 flex items-start gap-2 border-t border-divider pt-4 text-small">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-caution" />
              <span>
                <span className="font-semibold">{t.home.exampleCouldAlsoBe}</span> {wolfSnake.commonName} (
                {t.venomStatus.nonVenomousSpeciesInline}). {t.home.exampleLookAlikeNote}
              </span>
            </p>
          </div>
        </figure>
      </section>

      <section aria-labelledby="how" className="border-t border-line">
        <div className="page py-16">
          <h2 id="how" className="type-h1">{t.home.howTitle}</h2>
          <ol className="mt-8 border-t border-line lg:grid lg:grid-cols-4 lg:gap-8 lg:border-t-0">
            {STEP_KEYS.map((k, i) => (
              <li
                key={k}
                className="grid grid-cols-[2rem_1fr] gap-x-3 border-b border-line py-5 lg:block lg:border-b-0 lg:border-t lg:py-0 lg:pt-5"
              >
                <span className="font-serif text-[1.5rem] leading-none text-moss tabular-nums">{i + 1}</span>
                <div className="lg:mt-4">
                  <h3 className="type-h3">{t.home.steps[k].title}</h3>
                  <p className="mt-1 text-small text-ink-2">{t.home.steps[k].body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="promises" className="border-t border-line">
        <div className="page py-16">
          <h2 id="promises" className="type-h1 max-w-2xl">
            {t.home.promisesTitle}
          </h2>
          <div className="mt-8 grid gap-x-8 md:grid-cols-3">
            {PROMISE_KEYS.map((k) => (
              <div key={k} className="border-t border-ink py-5">
                <h3 className="type-h3">{t.home.promises[k].title}</h3>
                <p className="mt-2 text-small text-ink-2">{t.home.promises[k].body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
