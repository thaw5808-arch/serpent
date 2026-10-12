"use client";
import { useLocale, useT } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { localizeSpecies } from "@/i18n/species";
import { NotTranslated } from "@/components/ui/NotTranslated";
import type { SpeciesRecord } from "@/types";
import { RiskMeter } from "./RiskMeter";

/** Venom profile + the potency-versus-medical-risk distinction for one species. */
export function VenomPanel({ species: record }: { species: SpeciesRecord }) {
  const t = useT();
  const locale = useLocale();
  const { species, untranslated } = localizeSpecies(record, locale);
  const english = (f: (typeof untranslated)[number]) => (untranslated.includes(f) ? "en" : undefined);
  const hasVenomTypes = species.venomTypes.length > 0;
  return (
    <div className="space-y-8">
      <section aria-labelledby={`risk-${species.id}`}>
        <h3 id={`risk-${species.id}`} className="sr-only">{t.venomPanel.howStrong}</h3>
        <div className="rounded-card border border-line bg-surface p-5">
          <RiskMeter risk={species.medicalRisk} />
          <p className="mt-4" lang={english("riskRationale")}>{species.riskRationale}</p>
          <NotTranslated show={untranslated.includes("riskRationale")} />
          <p className="mt-2 text-small text-ink-2">{fmt(t.venomPanel.riskExplainer, { risk: t.risk[species.medicalRisk] })}</p>
        </div>

        <dl className="mt-4 divide-y divide-line border-y border-line">
          <div className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
            <dt>
              <span className="type-h3 block">{t.venomPanel.potencyTitle}</span>
              <span className="text-small text-ink-2">{t.venomPanel.potencyDesc}</span>
            </dt>
            <dd className="text-small sm:text-body">
              {species.potency ? (
                <span lang="en">
                  {species.potency.value} <span className="text-ink-2">({species.potency.method})</span>
                </span>
              ) : (
                <span className="text-ink-2">{t.venomPanel.noPotency}</span>
              )}
            </dd>
          </div>
          <div className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
            <dt id={`av-${species.id}`} className="type-h3">{t.venomPanel.antivenomTitle}</dt>
            <dd className="text-small text-ink-2 sm:text-body">
              {species.antivenom ? (
                <>
                  <span lang="en">{species.antivenom.summary}</span>
                  <NotTranslated show={locale !== "en"} />
                </>
              ) : (
                t.venomPanel.noAntivenom
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby={`vp-${species.id}`}>
        <h3 id={`vp-${species.id}`} className="type-h3">{t.venomPanel.profileTitle}</h3>
        {hasVenomTypes ? (
          <dl className="mt-2 divide-y divide-divider border-y border-line">
            {species.venomTypes.map((v) => (
              <div key={v} className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="font-semibold">{t.venomType[v].label}</dt>
                <dd className="text-small text-ink-2 sm:text-body">{t.venomType[v].description}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-ink-2">
            {species.venomStatus === "mildly_venomous"
              ? t.venomPanel.mildProfile
              : species.venomStatus === "non_venomous"
                ? t.venomPanel.notVenomousProfile
                : t.venomPanel.noProfile}
          </p>
        )}
        {species.medicalEffects.length > 0 && (
          <>
            <h4 className="mt-6 font-semibold">{t.venomPanel.effectsTitle}</h4>
            <NotTranslated show={untranslated.includes("medicalEffects")} />
            <ul className="mt-2 divide-y divide-divider border-y border-line" lang={english("medicalEffects")}>
              {species.medicalEffects.map((m) => (
                <li key={m} className="py-3 text-small sm:text-body">{m}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
