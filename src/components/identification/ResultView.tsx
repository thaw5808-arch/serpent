"use client";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, ChevronDown } from "lucide-react";
import { KeepDistance } from "@/components/safety/KeepDistance";
import { EmergencyCallBar } from "@/components/safety/EmergencyBar";
import { VenomStatusBadge, VenomTypeChip } from "@/components/ui/StatusBadge";
import { ButtonLink } from "@/components/ui/Button";
import { NotTranslated } from "@/components/ui/NotTranslated";
import { ReportWrongResult } from "./ReportWrongResult";
import { VenomPanel } from "@/components/venom/VenomPanel";
import { getCountry } from "@/data/countries";
import { Link, useLocale, useT } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { countryName, fmt, formatDateTime, formatPercent } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { candidateLabel, localizeSafety, venomBasisText, type LocalizedSafety } from "@/i18n/result";
import { localizeSpecies } from "@/i18n/species";
import { providerProduct } from "@/lib/labels";
import { getSpecies } from "@/services/venomDatabase";
import type { CandidateView, IdentificationResult, SpeciesRecord } from "@/types";

/*
 * Names (species, scientific, family, group) and everything the model wrote
 * (observed features, supporting/conflicting features, its own notes) are shown
 * exactly as they are, in every language. Only Serpent's own wording is translated.
 */

const IDENTIFIED = new Set(["likely_identified", "conflicting_evidence"]);

const CARD = "overflow-hidden rounded-card border border-line bg-surface";

export function ResultView({ result, thumbnails }: { result: IdentificationResult; thumbnails: string[] }) {
  const t = useT();
  const locale = useLocale();
  const identified = IDENTIFIED.has(result.status) && result.top?.speciesId;
  const species = identified ? getSpecies(result.top!.speciesId) : null;
  const high = result.displayVenomStatus === "venomous";
  const safety = localizeSafety(result, t, locale);

  const strip = <KeepDistance actions={safety.actions} legacy={safety.legacy} emphasis={high ? "high" : "caution"} />;
  const footer = (
    <>
      <ReportWrongResult result={result} />
      <p className="border-t border-line pt-4 text-center text-caption text-ink-2">
        {fmt(t.result.engineFooter, {
          product: providerProduct(result.engine.provider),
          model: result.engine.model,
          date: formatDateTime(result.analyzedAt, locale),
        })}
      </p>
    </>
  );

  if (species && result.top) {
    const others = otherPossibilities(result);
    return (
      <ResultLayout
        left={
          <>
            {strip}
            <SpeciesCard result={result} species={species} thumbnails={thumbnails} safety={safety} />
          </>
        }
        right={
          <>
            <section aria-labelledby="venom-detail">
              <h2 id="venom-detail" className="type-h2">{t.result.venomDetailTitle}</h2>
              <p className="mt-1 text-small text-ink-2">{fmt(t.result.forMostLikely, { name: species.commonName })}</p>
              <div className="mt-5">
                <VenomPanel species={species} />
              </div>
            </section>

            <Reasoning result={result} top={result.top} safety={safety} />

            {others.length > 0 && <Alternatives items={others} />}

            <Actions>
              <ButtonLink href="/identify" variant="secondary">{t.result.identifyAnother}</ButtonLink>
              <ButtonLink href={`/species/${species.id}`} variant="secondary">
                {fmt(t.result.fullProfile, { name: species.commonName })} <ArrowUpRight aria-hidden className="size-4 shrink-0" />
              </ButtonLink>
            </Actions>
            {footer}
          </>
        }
      />
    );
  }

  if (result.closestMatch) {
    return (
      <ClosestMatchResult
        result={result}
        closest={result.closestMatch}
        thumbnails={thumbnails}
        strip={strip}
        footer={footer}
        safety={safety}
      />
    );
  }
  return <NoIdentification result={result} thumbnails={thumbnails} strip={strip} footer={footer} safety={safety} />;
}

/** Desktop: safety strip and species card on the left (sticky), details and actions on the right. */
function ResultLayout({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-8">
      <div className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:col-span-5">{left}</div>
      <div className="min-w-0 space-y-10 lg:col-span-7">{right}</div>
    </div>
  );
}

/** Emergency first, then the secondary actions. */
function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-3">
      <EmergencyCallBar />
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/** The analysed photos: the first large, any others in a strip below it. */
function Photos({ thumbnails }: { thumbnails: string[] }) {
  const t = useT();
  if (thumbnails.length === 0) return null;
  const [first, ...rest] = thumbnails;
  return (
    <div className="border-b border-line bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- on-device data URL */}
      <img
        src={first}
        alt={rest.length ? fmt(t.result.photoAltN, { n: 1 }) : t.result.photoAlt}
        className="aspect-[4/3] w-full object-cover lg:aspect-[16/10]"
      />
      {rest.length > 0 && (
        <div className="grid grid-cols-3 gap-px border-t border-line">
          {rest.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- on-device data URL
            <img key={i} src={src} alt={fmt(t.result.photoAltN, { n: i + 2 })} className="aspect-[4/3] w-full object-cover" />
          ))}
        </div>
      )}
    </div>
  );
}

function NameBlock({ id, eyebrow, name, href, binomial }: { id: string; eyebrow: string; name: string; href: string | null; binomial?: string | null }) {
  return (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="type-h1 mt-1 break-words">
        {href ? (
          <Link href={href} className="underline-offset-4 hover:underline">{name}</Link>
        ) : (
          name
        )}
      </h2>
      {binomial && <p className="binomial mt-1 text-lead text-ink-2">{binomial}</p>}
    </>
  );
}

function SpeciesCard({
  result,
  species,
  thumbnails,
  safety,
}: {
  result: IdentificationResult;
  species: SpeciesRecord;
  thumbnails: string[];
  safety: LocalizedSafety;
}) {
  const t = useT();
  return (
    <section aria-labelledby="ident" className={CARD}>
      <Photos thumbnails={thumbnails} />
      <div className="p-5">
        <NameBlock
          id="ident"
          eyebrow={result.status === "likely_identified" ? t.result.mostLikely : t.result.closestMatch}
          name={species.commonName}
          href={`/species/${species.id}`}
          binomial={species.scientificName}
        />
        <dl className="mt-4 grid grid-cols-2 gap-x-6 border-t border-divider pt-4 text-small">
          <div>
            <dt className="text-ink-2">{t.result.confidence}</dt>
            <dd className="font-semibold">{result.confidenceBand ? t.band[result.confidenceBand] : "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-2">{t.result.family}</dt>
            <dd>{species.family}</dd>
          </div>
        </dl>
      </div>
      <div className="border-t border-divider p-5">
        <h3 className="sr-only">{t.result.venomStatusSr}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <VenomStatusBadge status={result.displayVenomStatus} size="lg" />
          {species.venomTypes.map((v) => (
            <VenomTypeChip key={v} type={v} />
          ))}
        </div>
        <p className="mt-3 text-small font-medium">{t.venomStatus[result.displayVenomStatus].short}</p>
        <p className="mt-1 text-small text-ink-2">{safety.message}</p>
        {result.displayVenomStatus !== species.venomStatus && (
          <p className="mt-2 text-small">{fmt(t.result.listedAs, { status: t.venomStatus[species.venomStatus].inline })}</p>
        )}
      </div>
      <CouldAlsoBe result={result} safety={safety} />
    </section>
  );
}

/** A candidate's venom badge, falling back to unknown / "Not assessed". */
function CandidateBadge({ c }: { c: CandidateView }) {
  const t = useT();
  return c.venomStatus ? (
    <VenomStatusBadge status={c.venomStatus} context="species" />
  ) : (
    <VenomStatusBadge status="unknown" context="species" label={c.venomBasis === "not_assessed" ? t.result.notAssessed : undefined} />
  );
}

function AltRow({ name, href, binomial, badge }: { name: string; href: string | null; binomial?: string | null; badge: ReactNode }) {
  return (
    <li className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
      <span className="min-w-0">
        <span className="type-name block text-[1.125rem]">
          {href ? (
            <Link href={href} className="underline-offset-4 hover:underline">{name}</Link>
          ) : (
            name
          )}
        </span>
        {binomial && <span className="binomial block text-small text-ink-2">{binomial}</span>}
      </span>
      {badge}
    </li>
  );
}

/**
 * Inside the species card: plausible candidates of the other venom class, venomous
 * first, then the look-alike warning and any look-alike species not already listed.
 */
function CouldAlsoBe({ result, safety }: { result: IdentificationResult; safety: LocalizedSafety }) {
  const t = useT();
  const items = result.couldAlsoBe ?? [];
  const listed = new Set(items.map((c) => c.speciesId).filter(Boolean));
  const lookAlikes = cardLookAlikes(result).filter((s) => !listed.has(s.id));
  if (items.length === 0 && !result.safety.lookAlike.active) return null;
  return (
    <section aria-labelledby="lookalike" className="border-t border-divider px-5 pb-3 pt-4">
      <h3 id="lookalike" className="flex items-center gap-2 text-small font-semibold">
        <AlertTriangle aria-hidden className="size-4 shrink-0 text-caution" />
        {items.length > 0 ? t.result.couldAlsoBe : t.result.lookAlikeWarning}
      </h3>
      {safety.lookAlike && <p className="mt-1 text-small text-ink-2">{safety.lookAlike}</p>}
      {(items.length > 0 || lookAlikes.length > 0) && (
        <ul className="mt-2 divide-y divide-divider">
          {items.map((c) => (
            <AltRow key={candidateKey(c)} name={candidateLabel(c, t)} href={candidateHref(c)} binomial={c.scientificName} badge={<CandidateBadge c={c} />} />
          ))}
          {lookAlikes.map((s) => (
            <AltRow
              key={s.id}
              name={s.commonName}
              href={`/species/${s.id}`}
              binomial={s.scientificName}
              badge={<VenomStatusBadge status={s.venomStatus} context="species" />}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** A collapsible row with its heading in the summary. */
function Expandable({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <details className="border-b border-line">
        <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-3">
          <h2 id={id} className="type-h3">{title}</h2>
          <ChevronDown aria-hidden className="chevron size-5 shrink-0 text-ink-2 transition-transform" />
        </summary>
        <div className="pb-5">{children}</div>
      </details>
    </section>
  );
}

/** `lang` marks items shown in English (the model's words, untranslated species text). */
function HairlineList({ items }: { items: { text: string; lang?: string }[] }) {
  return (
    <ul className="divide-y divide-divider text-small sm:text-body">
      {items.map((w, i) => (
        <li key={`${i}:${w.text}`} lang={w.lang} className="py-2">{w.text}</li>
      ))}
    </ul>
  );
}

/** The model writes its features and notes in English; they are shown verbatim and marked as English. */
const MODEL_LANG = "en";

function Reasoning({ result, top, safety }: { result: IdentificationResult; top: CandidateView; safety: LocalizedSafety }) {
  const t = useT();
  const locale = useLocale();
  const country = getCountry(result.country);
  const record = getSpecies(top.speciesId);
  const species = record ? localizeSpecies(record, locale) : null;
  const geo = !country
    ? t.result.geoNone
    : top.outsideSelectedRegion
      ? fmt(t.result.geoOutside, { country: countryName(country.code, locale) })
      : fmt(t.result.geoConsistent, { country: countryName(country.code, locale) });
  const why = top.supportingFeatures.length > 0 ? top.supportingFeatures : result.observedFeatures;
  const lookAlikeText = species?.species.otherLookAlikes;
  const lookAlikeEnglish = Boolean(species?.untranslated.includes("otherLookAlikes"));

  return (
    <div className="border-t border-line">
      <Expandable id="why" title={t.result.whyTitle}>
        <HairlineList items={[...why.map((text) => ({ text, lang: MODEL_LANG })), { text: geo }]} />
      </Expandable>
      <Expandable id="uncertainty" title={t.result.wrongTitle}>
        <HairlineList
          items={[
            ...top.conflictingFeatures.map((text) => ({ text, lang: MODEL_LANG })),
            ...notesFor(safety, result, locale),
            ...result.imageIssues.map((i) => ({ text: t.issues[i] })),
            ...(lookAlikeText ? [{ text: lookAlikeText, lang: lookAlikeEnglish ? "en" : undefined }] : []),
            { text: t.result.variationNote },
          ]}
        />
        <NotTranslated show={lookAlikeEnglish} className="mt-2" />
        {safety.legacy && <p className="mt-2 text-caption text-ink-2">{t.notes.legacyResult}</p>}
      </Expandable>
    </div>
  );
}

/** Serpent's notes in the interface language, the model's notes marked as English. */
function notesFor(safety: LocalizedSafety, result: IdentificationResult, locale: Locale): { text: string; lang?: string }[] {
  if (safety.legacy) return safety.notes.map((text) => ({ text, lang: "en" }));
  const model = new Set(result.modelNotes ?? []);
  return safety.notes.map((text) => ({ text, lang: model.has(text) && locale !== "en" ? MODEL_LANG : undefined }));
}

/** "High confidence, not recorded in your area, …" for one alternative. */
function altDetails(c: CandidateView, t: Messages): string {
  const parts: string[] = [t.band[c.band]];
  if (c.outsideSelectedRegion) parts.push(t.result.altNotInArea);
  if (c.taxonomySlug) {
    parts.push(
      c.venomBasis === "not_assessed"
        ? t.result.altNotReviewedNotAssessed
        : fmt(t.result.altNotReviewedFrom, { level: c.venomBasis === "family" ? t.candidate.level.family : t.candidate.level.genus }),
    );
  }
  return parts.join(t.common.listSeparator);
}

function Alternatives({ items, heading }: { items: CandidateView[]; heading?: string }) {
  const t = useT();
  const locale = useLocale();
  return (
    <section aria-labelledby="alts">
      <h2 id="alts" className="type-h3">{heading ?? t.result.otherPossibilities}</h2>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {items.map((c) => {
          const s = getSpecies(c.speciesId);
          const href = s ? `/species/${s.id}` : c.taxonomySlug ? `/species/${c.taxonomySlug}` : null;
          const label = candidateLabel(c, t);
          return (
            <li key={candidateKey(c)} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                {href ? (
                  <Link href={href} className="type-name text-[1.125rem] underline-offset-4 hover:underline">
                    {label}
                  </Link>
                ) : (
                  <span className="type-name text-[1.125rem]">{label}</span>
                )}
                {c.scientificName && <span className="binomial ml-2 text-small text-ink-2">{c.scientificName}</span>}
                <p className="text-small text-ink-2">{altDetails(c, t)}</p>
              </div>
              <CandidateBadge c={c} />
            </li>
          );
        })}
      </ul>
      <details className="mt-2 text-small text-ink-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1">
          {t.result.showEstimates} <ChevronDown aria-hidden className="chevron size-4 shrink-0 transition-transform" />
        </summary>
        <p>{t.result.estimatesNote}</p>
        <ul className="mt-1 tabular-nums">
          {items.map((c) => (
            <li key={candidateKey(c)}>
              {fmt(t.result.estimateRow, { name: candidateLabel(c, t), pct: formatPercent(c.probability, locale) })}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function candidateKey(c: CandidateView): string {
  return c.speciesId ?? c.taxonomySlug ?? c.groupId ?? c.namedAs ?? "unlisted";
}

/** The species page for a candidate, when it has one. */
export function candidateHref(c: CandidateView): string | null {
  if (c.kind === "species" && c.speciesId) return `/species/${c.speciesId}`;
  if (c.kind === "taxonomy" && c.taxonomySlug) return `/species/${c.taxonomySlug}`;
  return null;
}

/** Look-alike species named in the species card's warning. */
function cardLookAlikes(result: IdentificationResult): SpeciesRecord[] {
  const l = result.safety.lookAlike;
  return l.active ? l.speciesIds.map((id) => getSpecies(id)).filter((s) => s !== null) : [];
}

/** Alternatives not already shown as the closest match, in "Could also be" or as a look-alike in the card. */
function otherPossibilities(result: IdentificationResult): CandidateView[] {
  const shown = new Set([result.closestMatch, ...(result.couldAlsoBe ?? [])].filter(Boolean).map((c) => candidateKey(c!)));
  cardLookAlikes(result).forEach((s) => shown.add(s.id));
  if (result.top) shown.add(candidateKey(result.top));
  return result.alternatives.filter((a) => !shown.has(candidateKey(a)));
}

/**
 * No reviewed species is "the" identification, but there are candidates: name the
 * closest match, show other-venom-class possibilities beside it, and keep the
 * overall venom badge exactly as the safety policy decided.
 */
function ClosestMatchResult({
  result,
  closest,
  thumbnails,
  strip,
  footer,
  safety,
}: {
  result: IdentificationResult;
  closest: CandidateView;
  thumbnails: string[];
  strip: ReactNode;
  footer: ReactNode;
  safety: LocalizedSafety;
}) {
  const t = useT();
  const locale = useLocale();
  const href = candidateHref(closest);
  const basis = venomBasisText(closest, t, locale);
  const others = otherPossibilities(result);
  const record = closest.kind === "species" ? getSpecies(closest.speciesId) : null;
  const label = candidateLabel(closest, t);
  const notes = notesFor(safety, result, locale);
  return (
    <ResultLayout
      left={
        <>
          {strip}
          <section aria-labelledby="closest" className={CARD}>
            <Photos thumbnails={thumbnails} />
            <div className="p-5">
              <NameBlock id="closest" eyebrow={t.result.closestMatch} name={label} href={href} binomial={closest.scientificName} />
              <dl className="mt-4 grid grid-cols-2 gap-x-6 border-t border-divider pt-4 text-small">
                <div>
                  <dt className="text-ink-2">{t.result.confidence}</dt>
                  <dd className="font-semibold">{t.band[closest.band]}</dd>
                </div>
                {(record || closest.kind === "taxonomy") && (
                  <div>
                    <dt className="text-ink-2">{record ? t.result.family : t.result.status}</dt>
                    <dd>{record ? record.family : t.result.notYetReviewed}</dd>
                  </div>
                )}
              </dl>
              {basis && <p className="mt-3 text-small text-ink-2">{basis}</p>}
            </div>
            <div className="border-t border-divider p-5">
              <div className="flex flex-wrap items-center gap-2">
                <VenomStatusBadge status={result.displayVenomStatus} size="lg" />
                {record?.venomTypes.map((v) => <VenomTypeChip key={v} type={v} />)}
              </div>
              <p className="mt-3 text-small text-ink-2">{safety.message}</p>
              {result.imageIssues.length > 0 && (
                <ul className="mt-3 divide-y divide-divider border-y border-divider text-small">
                  {result.imageIssues.map((i) => (
                    <li key={i} className="py-2">{t.issues[i]}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-small">{t.result.treatDangerous}</p>
            </div>
            <CouldAlsoBe result={result} safety={safety} />
          </section>
        </>
      }
      right={
        <>
          {notes.length > 0 && (
            <div className="border-t border-line">
              <Expandable id="notes" title={t.result.wrongTitle}>
                <HairlineList items={notes} />
                {safety.legacy && <p className="mt-2 text-caption text-ink-2">{t.notes.legacyResult}</p>}
              </Expandable>
            </div>
          )}

          {others.length > 0 && <Alternatives items={others} heading={t.result.otherPossibilitiesLow} />}

          <Actions>
            <ButtonLink href="/identify" variant="secondary">{t.result.identifyAnother}</ButtonLink>
            {href && (
              <ButtonLink href={href} variant="secondary">
                {fmt(t.result.fullProfile, { name: label })} <ArrowUpRight aria-hidden className="size-4 shrink-0" />
              </ButtonLink>
            )}
            <ButtonLink href="/species" variant="secondary">{t.result.browseSpecies}</ButtonLink>
          </Actions>
          {footer}
        </>
      }
    />
  );
}

function NoIdentification({
  result,
  thumbnails,
  strip,
  footer,
  safety,
}: {
  result: IdentificationResult;
  thumbnails: string[];
  strip: ReactNode;
  footer: ReactNode;
  safety: LocalizedSafety;
}) {
  const t = useT();
  const canRetake = ["insufficient_image", "no_snake", "multiple_snakes", "unknown_species", "conflicting_evidence"].includes(result.status);
  return (
    <ResultLayout
      left={
        <>
          {strip}
          <section aria-labelledby="status" className={CARD}>
            <Photos thumbnails={thumbnails} />
            <div className="p-5">
              <p className="eyebrow">{t.result.resultEyebrow}</p>
              <h2 id="status" className="type-h2 mt-1">{safety.message}</h2>
              <div className="mt-4">
                <VenomStatusBadge status={result.displayVenomStatus} size="lg" />
              </div>
              {result.imageIssues.length > 0 && (
                <ul className="mt-4 divide-y divide-divider border-y border-divider text-small">
                  {result.imageIssues.map((i) => (
                    <li key={i} className="py-2">{t.issues[i]}</li>
                  ))}
                </ul>
              )}
              {result.status === "service_unavailable" && <p className="mt-3 text-small">{t.result.serviceUnavailableNote}</p>}
              {(result.status === "unknown_species" || result.status === "conflicting_evidence") && (
                <p className="mt-3 text-small">{t.result.treatDangerous}</p>
              )}
            </div>
            <CouldAlsoBe result={{ ...result, couldAlsoBe: [] }} safety={safety} />
          </section>
        </>
      }
      right={
        <>
          {result.alternatives.length > 0 && <Alternatives items={result.alternatives} heading={t.result.mayResemble} />}

          <Actions>
            {canRetake && <ButtonLink href="/identify">{t.result.tryAnotherPhoto}</ButtonLink>}
            {result.status === "service_unavailable" && <ButtonLink href="/identify">{t.common.tryAgain}</ButtonLink>}
            <ButtonLink href="/species" variant="secondary">{t.result.browseSpecies}</ButtonLink>
          </Actions>
          {footer}
        </>
      }
    />
  );
}
