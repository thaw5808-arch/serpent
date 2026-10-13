"use client";
import type { ReactNode, Ref } from "react";
import { AlertTriangle, ChevronDown, Info, RotateCcw, Siren } from "lucide-react";
import { DoctorCardLink } from "@/components/doctorCard/DoctorCardLink";
import { KeepDistance } from "@/components/safety/KeepDistance";
import { EmergencyCallBar } from "@/components/safety/EmergencyBar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { VenomStatusBadge } from "@/components/ui/StatusBadge";
import { Link, useLocale, useT } from "@/i18n/client";
import { countryName, fmt, formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { venomBasisText } from "@/i18n/result";
import { NOT_SURE, type Description } from "@/lib/describe";
import { providerProduct } from "@/lib/labels";
import type { DescribedCandidate, DescriptionResult } from "@/types";

/*
 * The result of "Describe a snake". Names and the model's "why it matches" are
 * shown exactly as they are; venom and risk badges come from our data (decided in
 * src/services/safetyService.ts). The overall status is never reassuring.
 */

const CARD = "rounded-card border border-line bg-surface";

export function DescriptionResultView({
  result,
  headingRef,
  onStartOver,
}: {
  result: DescriptionResult;
  /** Receives focus when the result appears. */
  headingRef?: Ref<HTMLHeadingElement>;
  /** Without it, "Start over" links to a new description. */
  onStartOver?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const d = t.describe.result;
  const matches = result.status === "possible_matches" && result.candidates.length > 0;
  const title = matches ? d.overallTitle : result.status === "service_unavailable" ? d.unavailableTitle : d.unknownTitle;

  return (
    <div className="space-y-6">
      {result.dangerous && <DangerBanner />}

      <section aria-labelledby="describe-status" className={`${CARD} p-5 sm:p-6`}>
        <p className="eyebrow">{d.eyebrow}</p>
        <h2 id="describe-status" ref={headingRef} tabIndex={-1} className="type-h2 mt-1 outline-none">
          {title}
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <VenomStatusBadge status={result.displayVenomStatus} size="lg" />
          {matches && <span className="text-small font-medium">{fmt(d.overallRisk, { risk: t.risk[result.overallRisk] })}</span>}
        </div>
        {result.status === "service_unavailable" && <p className="mt-3 text-small">{d.unavailableBody}</p>}
        <p className="mt-4 flex items-start gap-2 rounded-badge border border-caution-border bg-caution-bg px-4 py-3 text-small text-caution">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{d.disclaimer}</span>
        </p>
        {result.status === "not_enough_detail" && (
          <p className="mt-3 flex items-start gap-2 text-small text-ink-2">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{d.unknownTip}</span>
          </p>
        )}
        {matches && <p className="mt-3 text-small text-ink-2">{poolNote(result, t, locale)}</p>}
      </section>

      {matches && <Matches candidates={result.candidates} />}

      <KeepDistance actionKeys={result.safety.actionKeys} emphasis={result.dangerous ? "high" : "caution"} />

      <Answers answers={result.answers} />

      <div className="space-y-3">
        <EmergencyCallBar />
        <DoctorCardLink resultId={result.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <ButtonLink href="/identify">{t.describe.result.photoInstead}</ButtonLink>
          {onStartOver ? (
            <Button variant="secondary" onClick={onStartOver} className="sm:min-h-15">
              <RotateCcw aria-hidden className="size-4" /> {d.startOver}
            </Button>
          ) : (
            <ButtonLink href="/identify/describe" variant="secondary" className="sm:min-h-15">
              <RotateCcw aria-hidden className="size-4" /> {d.startOver}
            </ButtonLink>
          )}
        </div>
      </div>

      {result.status !== "service_unavailable" && (
        <p className="border-t border-line pt-4 text-center text-caption text-ink-2">
          {fmt(d.engineFooter, {
            product: providerProduct(result.engine.provider),
            model: result.engine.model,
            date: formatDateTime(result.analyzedAt, locale),
          })}
        </p>
      )}
    </div>
  );
}

/** Red, first on the page, when any possible match is high or very high risk. */
function DangerBanner() {
  const t = useT();
  return (
    <section aria-labelledby="describe-danger" className="rounded-card bg-emergency p-5 text-emergency-ink sm:p-6">
      <h2 id="describe-danger" className="type-h3 flex items-start gap-2">
        <Siren aria-hidden className="mt-1 size-5 shrink-0" />
        {t.describe.result.dangerTitle}
      </h2>
      <p className="mt-2 text-small">{t.describe.result.dangerBody}</p>
      <Link
        href="/emergency"
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-card border border-emergency-ink/70 px-4 font-semibold transition-colors hover:bg-emergency-hover"
      >
        <Siren aria-hidden className="size-5 shrink-0" /> {t.common.bitten}
      </Link>
    </section>
  );
}

function poolNote(result: DescriptionResult, t: Messages, locale: Locale): string {
  const d = t.describe.result;
  const place = result.answers.place;
  if (result.pool === "nearby" && place) return fmt(d.poolNearby, { place: place.name });
  if (result.pool === "country" && result.country) return fmt(d.poolCountry, { country: countryName(result.country, locale) });
  return d.poolEverywhere;
}

export function candidateHrefOf(c: DescribedCandidate): string | null {
  if (c.speciesId) return `/species/${c.speciesId}`;
  if (c.taxonomySlug) return `/species/${c.taxonomySlug}`;
  return null;
}

function Matches({ candidates }: { candidates: DescribedCandidate[] }) {
  const t = useT();
  const locale = useLocale();
  return (
    <section aria-labelledby="describe-matches">
      <h2 id="describe-matches" className="type-h2">{t.describe.result.matchesTitle}</h2>
      <p className="mt-1 text-small text-ink-2">{t.describe.result.matchesLead}</p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {candidates.map((c) => {
          const href = candidateHrefOf(c);
          const name = c.commonName ?? c.scientificName;
          const basis = c.venomGroup || c.venomBasis === "not_assessed" ? venomBasisText(c, t, locale) : null;
          return (
            <li key={c.speciesId ?? c.taxonomySlug} className="py-4">
              <p className="type-name break-words text-[1.125rem]">
                {href ? (
                  <Link href={href} className="underline-offset-4 hover:underline">{name}</Link>
                ) : (
                  name
                )}
              </p>
              {c.commonName && <p className="binomial text-small text-ink-2">{c.scientificName}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {c.venomStatus ? (
                  <VenomStatusBadge status={c.venomStatus} context="species" />
                ) : (
                  <VenomStatusBadge status="potentially_venomous" label={t.nearMe.notAssessed} />
                )}
                {c.medicalRisk && c.venomStatus !== "non_venomous" && (
                  <span className="text-small font-medium">{fmt(t.risk.riskLabel, { risk: t.risk[c.medicalRisk] })}</span>
                )}
              </div>
              {basis && <p className="mt-1 text-caption text-ink-2">{basis}</p>}
              <p className="mt-2 text-small">
                <span className="font-semibold">{t.describe.result.why}</span>{" "}
                {/* The model's words, verbatim: never translated. */}
                <span lang={locale === "en" ? undefined : "en"}>{c.why}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The answer text for each question, in the interface language. */
export function answerRows(a: Description, t: Messages): { question: string; answer: string }[] {
  const q = t.describe;
  const one = (group: Record<string, string>, v: string) => (v === NOT_SURE ? q.notSure : (group[v] ?? v));
  const many = (group: Record<string, string>, v: string[] | typeof NOT_SURE, none: string) =>
    v === NOT_SURE ? q.notSure : v.length ? v.map((x) => group[x] ?? x).join(t.common.listSeparator) : none;
  return [
    { question: q.place.title, answer: a.place ? [a.place.name, a.place.region, a.place.country].filter(Boolean).join(", ") : q.notSure },
    { question: q.colours.title, answer: many(q.colours, a.colours, q.notSure) },
    { question: q.pattern.title, answer: one(q.pattern, a.pattern) },
    { question: q.head.title, answer: one(q.head, a.head) },
    { question: q.size.title, answer: one(q.size, a.size) },
    { question: q.setting.title, answer: one(q.setting, a.setting) },
    { question: q.time.title, answer: one(q.time, a.time) },
    { question: q.behaviour.title, answer: many(q.behaviour, a.behaviour, "—") },
  ];
}

function Answers({ answers }: { answers: Description }): ReactNode {
  const t = useT();
  return (
    <details className="border-y border-line">
      <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-3">
        <h2 className="type-h3">{t.describe.result.yourAnswers}</h2>
        <ChevronDown aria-hidden className="chevron size-5 shrink-0 text-ink-2 transition-transform" />
      </summary>
      <dl className="divide-y divide-divider pb-3 text-small">
        {answerRows(answers, t).map((r) => (
          <div key={r.question} className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[1fr_1fr]">
            <dt className="text-ink-2">{r.question}</dt>
            <dd className="font-medium">{r.answer}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
