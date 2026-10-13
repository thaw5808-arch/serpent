import type { Metadata } from "next";
import { Info } from "lucide-react";
import { notFound, permanentRedirect } from "next/navigation";
import { NotTranslated } from "@/components/ui/NotTranslated";
import { VenomStatusBadge } from "@/components/ui/StatusBadge";
import { VenomPanel } from "@/components/venom/VenomPanel";
import { SourceList } from "@/components/venom/SourceList";
import { KeepDistance } from "@/components/safety/KeepDistance";
import { Link } from "@/i18n/client";
import { localePath, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { alternates } from "@/i18n/metadata";
import { inlineName } from "@/i18n/result";
import { getDictionary, getLocale } from "@/i18n/server";
import { localizeSpecies, type TranslatableSpeciesField } from "@/i18n/species";
import { getSourcesFor, getSpecies, listSpecies } from "@/services/venomDatabase";
import { groupFor } from "@/services/taxonomy";
import { englishName, getTaxonomyRecord, TAXONOMY_SOURCE, type TaxonomyRecord } from "@/services/taxonomyIndex";
import type { SpeciesRecord } from "@/types";

export function generateStaticParams() {
  return listSpecies().map((s) => ({ slug: s.id }));
}

/** Titles are the species' own names, identical in every language. */
export async function generateMetadata({ params }: PageProps<"/[lang]/species/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const alt = alternates(locale, `/species/${slug}`);
  const s = getSpecies(slug);
  if (s) return { title: `${s.commonName} (${s.scientificName})`, alternates: alt };
  const record = getTaxonomyRecord(slug);
  if (!record) return { title: (await getDictionary(locale)).meta.speciesNotFoundTitle };
  const common = englishName(record);
  return { title: common ? `${common} (${record.name})` : record.name, alternates: alt };
}

/**
 * Curated species are prerendered at build time. Every other recognised snake
 * species (~4,000, from the taxonomy) renders on its first request and is then
 * cached, rather than being generated up front.
 */
export default async function SpeciesDetail({ params }: PageProps<"/[lang]/species/[slug]">) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const s = getSpecies(slug);
  if (s) return <CuratedSpecies s={s} t={t} locale={locale} />;

  const record = getTaxonomyRecord(slug);
  if (!record) notFound();
  const curated = listSpecies().find((x) => x.scientificName === record.name);
  if (curated) permanentRedirect(localePath(locale, `/species/${curated.id}`));
  return <TaxonomySpecies record={record} t={t} locale={locale} />;
}

function CuratedSpecies({ s: record, t, locale }: { s: SpeciesRecord; t: Messages; locale: Locale }) {
  const { species: s, untranslated } = localizeSpecies(record, locale);
  const english = (f: TranslatableSpeciesField) => (untranslated.includes(f) ? "en" : undefined);
  const missing = (f: TranslatableSpeciesField) => untranslated.includes(f);
  const similar = s.similarSpeciesIds.map(getSpecies).filter((x) => x !== null);

  return (
    <article className="page py-8 lg:py-12">
      <div className="mx-auto max-w-[880px]">
        <nav aria-label="Breadcrumb" className="text-small text-ink-2">
          <Link href="/species" className="inline-flex min-h-11 items-center hover:text-ink">{t.common.backToSpecies}</Link>
        </nav>

        <header className="mt-2 border-b border-line pb-8">
          <h1 className="type-display">{s.commonName}</h1>
          <p className="binomial mt-2 text-[1.375rem] text-ink-2">{s.scientificName}</p>
          {s.otherNames && <p className="mt-2 text-small text-ink-2">{fmt(t.species.alsoCalled, { names: s.otherNames.join(", ") })}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <VenomStatusBadge status={s.venomStatus} size="lg" context="species" />
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-divider pt-4 text-small sm:grid-cols-4">
            <div><dt className="text-ink-2">{t.species.family}</dt><dd>{s.family}</dd></div>
            <div><dt className="text-ink-2">{t.species.genus}</dt><dd className="italic">{s.genus}</dd></div>
            <div className="col-span-2"><dt className="text-ink-2">{t.species.regions}</dt><dd>{s.regions.map((r) => t.regions[r]).join(t.common.listSeparator)}</dd></div>
          </dl>
          {s.reviewStatus === "draft" && (
            <p className="mt-5 flex items-start gap-2 border-t border-divider pt-4 text-small">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-2" />
            <span>{t.species.draftNote}</span>
            </p>
          )}
        </header>

        <div className="mt-10 space-y-16">
          <section aria-labelledby="appearance">
            <h2 id="appearance" className="type-h2">{t.species.appearance}</h2>
            <p className="mt-2 max-w-prose" lang={english("appearance")}>{s.appearance}</p>
            <NotTranslated show={missing("appearance")} />
            <h3 className="type-h3 mt-6">{t.species.featuresTitle}</h3>
            <NotTranslated show={missing("keyFeatures")} />
            <ul className="mt-2 divide-y divide-divider border-y border-line" lang={english("keyFeatures")}>
              {s.keyFeatures.map((k) => <li key={k} className="py-3">{k}</li>)}
            </ul>
            <p className="mt-3 text-small text-ink-2">{t.species.featuresNote}</p>
          </section>

          <section aria-labelledby="range" className="grid gap-8 sm:grid-cols-2">
            <div>
              <h2 id="range" className="type-h2">{t.species.distribution}</h2>
              <p className="mt-2" lang={english("distribution")}>{s.distribution}</p>
              <NotTranslated show={missing("distribution")} />
            </div>
            <div>
              <h2 className="type-h2">{t.species.habitat}</h2>
              <p className="mt-2" lang={english("habitat")}>{s.habitat}</p>
              <NotTranslated show={missing("habitat")} />
            </div>
          </section>

          <section aria-labelledby="venom">
            <h2 id="venom" className="type-h2">{t.species.venomTitle}</h2>
            <div className="mt-5"><VenomPanel species={record} /></div>
          </section>

          {(similar.length > 0 || s.otherLookAlikes) && (
            <section aria-labelledby="similar">
              <h2 id="similar" className="type-h2">{t.species.similarTitle}</h2>
              {similar.length > 0 && (
                <ul className="mt-3 divide-y divide-line border-y border-line">
                  {similar.map((x) => (
                    <li key={x.id}>
                      <Link href={`/species/${x.id}`} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3 hover:bg-row-hover sm:px-3">
                        <span>
                          <span className="type-name block text-[1.125rem]">{x.commonName}</span>
                          <span className="binomial text-small text-ink-2">{x.scientificName}</span>
                        </span>
                        <VenomStatusBadge status={x.venomStatus} context="species" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {s.otherLookAlikes && (
                <>
                  <p className="mt-3" lang={english("otherLookAlikes")}>{s.otherLookAlikes}</p>
                  <NotTranslated show={missing("otherLookAlikes")} />
                </>
              )}
            </section>
          )}

          <KeepDistance />

          <section aria-labelledby="sources">
            <h2 id="sources" className="type-h2">{t.species.sources}</h2>
            <div className="mt-3"><SourceList sources={getSourcesFor(s)} /></div>
          </section>
        </div>
      </div>
    </article>
  );
}

/** A species from the taxonomy only. Every name shown here comes from the source as is. */
function TaxonomySpecies({ record: r, t, locale }: { record: TaxonomyRecord; t: Messages; locale: Locale }) {
  const group = groupFor(r.genus, r.family);
  const common = englishName(r);
  const otherNames = (r.commonNames ?? []).filter((c) => c.name !== common);
  const level = group ? (group.rank === "family" ? t.candidate.level.family : t.candidate.level.genus) : "";

  return (
    <article className="page py-8 lg:py-12">
      <div className="mx-auto max-w-[880px]">
        <nav aria-label="Breadcrumb" className="text-small text-ink-2">
          <Link href="/species" className="inline-flex min-h-11 items-center hover:text-ink">{t.common.backToSpecies}</Link>
        </nav>

        <header className="mt-2 border-b border-line pb-8">
          <h1 className="type-display">{common ?? r.name}</h1>
          <p className="binomial mt-2 text-[1.375rem] text-ink-2">
            {r.name}
            {r.authorship && <span className="ml-2 text-lg not-italic text-ink-2">{r.authorship}</span>}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {group ? (
              <VenomStatusBadge status="venomous" size="lg" context="species" />
            ) : (
              <VenomStatusBadge status="unknown" size="lg" context="species" label={t.result.notAssessed} />
            )}
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-divider pt-4 text-small sm:grid-cols-4">
            <div><dt className="text-ink-2">{t.species.family}</dt><dd>{r.family}</dd></div>
            {r.subfamily && <div><dt className="text-ink-2">{t.species.subfamily}</dt><dd>{r.subfamily}</dd></div>}
            <div><dt className="text-ink-2">{t.species.genus}</dt><dd className="italic">{r.genus}</dd></div>
          </dl>
          <p className="mt-5 flex items-start gap-2 border-t border-divider pt-4 text-small">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-2" />
            <span>
            {group ? (
              <>
                <strong>{fmt(t.species.notReviewedGroupStrong, { level })}</strong>{" "}
                {fmt(t.species.notReviewedGroupBody, { common: inlineName(group.commonName, locale), name: group.name })}
              </>
            ) : (
              <>
                <strong>{t.species.notReviewedNoneStrong}</strong> {t.species.notReviewedNoneBody}
              </>
            )}
            </span>
          </p>
        </header>

        <div className="mt-10 space-y-16">
          <section aria-labelledby="range">
            <h2 id="range" className="type-h2">{t.species.distribution}</h2>
            {r.distribution ? (
              <>
                <p className="mt-2 max-w-prose" lang="en">{r.distribution}</p>
                <p className="mt-2 text-small text-ink-2">{t.species.distributionNote}</p>
              </>
            ) : (
              <p className="mt-2 text-ink-2">{t.species.noDistribution}</p>
            )}
          </section>

          {(otherNames.length > 0 || (r.synonyms?.length ?? 0) > 0) && (
            <section aria-labelledby="names">
              <h2 id="names" className="type-h2">{t.species.otherNames}</h2>
              {otherNames.length > 0 && (
                <p className="mt-2">
                  {otherNames.map((c) => `${c.name}${c.language ? ` (${c.language})` : ""}`).join(", ")}
                </p>
              )}
              {r.synonyms && r.synonyms.length > 0 && (
                <details className="mt-3">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-small font-medium underline underline-offset-4">{fmt(t.species.synonyms, { n: r.synonyms.length })}</summary>
                  <p className="binomial mt-2 text-small text-ink-2">{r.synonyms.join(", ")}</p>
                </details>
              )}
            </section>
          )}

          <KeepDistance />

          <section aria-labelledby="sources">
            <h2 id="sources" className="type-h2">{t.species.source}</h2>
            <p className="mt-3 max-w-prose text-small">
              {t.species.namesSource}{" "}
              {r.link ? (
                <a href={r.link} className="underline underline-offset-2" rel="noopener noreferrer">
                  {fmt(t.species.speciesAccount, { title: TAXONOMY_SOURCE.title })}
                </a>
              ) : (
                TAXONOMY_SOURCE.title
              )}
              . <span lang="en">{TAXONOMY_SOURCE.attribution}</span>{" "}
              <a href={TAXONOMY_SOURCE.licenseUrl} className="underline underline-offset-2" rel="license noopener noreferrer">
                {t.species.licence}
              </a>
              . {t.species.adapted} {group ? fmt(t.species.venomRuleGroup, { level }) : t.species.venomRuleDefault}
            </p>
          </section>
        </div>
      </div>
    </article>
  );
}
