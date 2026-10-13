"use client";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { FilterDropdown, type FilterOption } from "@/components/ui/FilterDropdown";
import { VenomStatusBadge } from "@/components/ui/StatusBadge";
import { REGION_CODES } from "@/data/countries";
import { Link, useT } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { RISK, TONE_CLASSES, VENOM_TYPES } from "@/lib/labels";
import { filterSpecies, type SpeciesFilter } from "@/services/venomDatabase";
import type { SpeciesRecord, VenomStatus } from "@/types";

/** Venom-status filter values with their dot colours (always shown next to the label, never alone). */
const STATUS_FILTERS: [VenomStatus, string][] = [
  ["venomous", "var(--venom-fill)"],
  ["mildly_venomous", "var(--caution)"],
  ["non_venomous", "var(--low)"],
  ["unknown", "var(--muted)"],
];

export function SpeciesBrowser({ species }: { species: SpeciesRecord[] }) {
  const t = useT();
  const [f, setF] = useState<SpeciesFilter>({ query: "", region: "", venomStatus: "", venomType: "", highRiskOnly: false });
  const results = useMemo(() => filterSpecies(species, f), [species, f]);
  const set = (patch: Partial<SpeciesFilter>) => setF((prev) => ({ ...prev, ...patch }));
  const others = useTaxonomySearch(f.query ?? "");
  const onlyQuery = !f.region && !f.venomStatus && !f.venomType && !f.highRiskOnly;

  /** How many reviewed species an option would match, keeping every other current filter. */
  const countWith = (patch: Partial<SpeciesFilter>) => filterSpecies(species, { ...f, ...patch }).length;
  const withCount = <V extends string>(value: V, label: string, patch: Partial<SpeciesFilter>, dotColor?: string): FilterOption<V> => {
    const count = countWith(patch);
    return { value, label, count, countLabel: fmt(t.speciesList.optionCount, { n: count }), dotColor };
  };
  const regionOptions = [
    withCount("" as const, t.speciesList.allRegions, { region: "" }),
    ...REGION_CODES.map((r) => withCount(r, t.regions[r], { region: r })),
  ];
  const statusOptions = [
    withCount("" as const, t.speciesList.anyStatus, { venomStatus: "" }),
    ...STATUS_FILTERS.map(([v, color]) =>
      withCount(v, v === "non_venomous" ? t.venomStatus.nonVenomousSpecies : t.venomStatus[v].label, { venomStatus: v }, color),
    ),
  ];
  const typeOptions = [
    withCount("" as const, t.speciesList.anyType, { venomType: "" }),
    ...VENOM_TYPES.map((v) => withCount(v, t.venomType[v].label, { venomType: v })),
  ];
  const labelOf = <V extends string>(options: FilterOption<V>[], value: V | undefined) =>
    options.find((o) => o.value === (value ?? ""))?.label ?? options[0].label;
  const summary = [labelOf(regionOptions, f.region), labelOf(statusOptions, f.venomStatus), labelOf(typeOptions, f.venomType)].join(" · ");

  return (
    <div>
      <div role="search" className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="q" className="sr-only">{t.speciesList.searchLabel}</label>
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
          <input
            id="q"
            type="search"
            placeholder={t.speciesList.searchPlaceholder}
            value={f.query}
            onChange={(e) => set({ query: e.target.value })}
            className="min-h-14 w-full rounded-[10px] border border-line bg-field pl-10 pr-3 text-body text-ink placeholder:text-[var(--muted)] hover:border-ink-2 focus:border-gold-light"
          />
        </div>
        <FilterDropdown label={t.speciesList.region} options={regionOptions} value={f.region ?? ""} onChange={(region) => set({ region })} />
        <FilterDropdown label={t.speciesList.venomStatus} options={statusOptions} value={f.venomStatus ?? ""} onChange={(venomStatus) => set({ venomStatus })} />
        <FilterDropdown label={t.speciesList.venomType} options={typeOptions} value={f.venomType ?? ""} onChange={(venomType) => set({ venomType })} />
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 sm:col-span-2 lg:col-span-4">
          <label className="flex min-h-11 items-center gap-2 text-small">
            <input
              type="checkbox"
              checked={f.highRiskOnly}
              onChange={(e) => set({ highRiskOnly: e.target.checked })}
              className="size-5 accent-[var(--gold)]"
            />
            {t.speciesList.highRiskOnly}
          </label>
          <p className="text-small text-ink-2" aria-live="polite">
            <span className="sr-only">{t.speciesList.currentFilters}: </span>
            {summary}
          </p>
        </div>
      </div>

      <p className="mt-8 text-small text-ink-2 tabular-nums" aria-live="polite">
        {fmt(t.speciesList.countReviewed, { n: results.length })}
        {onlyQuery && others.length > 0
          ? `${t.common.listSeparator}${fmt(t.speciesList.countMore, { n: `${others.length}${others.length === 30 ? "+" : ""}` })}`
          : ""}
      </p>

      {results.length === 0 && !(onlyQuery && others.length > 0) ? (
        <div className="mt-3 border-y border-line py-8 text-center">
          <p className="font-medium">{t.speciesList.noMatch}</p>
          <button
            type="button"
            onClick={() => setF({ query: "", region: "", venomStatus: "", venomType: "", highRiskOnly: false })}
            className="mt-3 min-h-11 rounded-card px-4 text-ink underline underline-offset-2"
          >
            {t.speciesList.clearFilters}
          </button>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {results.map((s) => {
            const risk = RISK[s.medicalRisk];
            return (
              <li key={s.id}>
                <Link
                  href={`/species/${s.id}`}
                  className="grid gap-2 py-4 hover:bg-row-hover sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-3"
                >
                  <span>
                    <span className="type-name block">{s.commonName}</span>
                    <span className="binomial text-small text-ink-2">{s.scientificName}</span>
                  </span>
                  <span className="text-small text-ink-2">{s.regions.map((r) => t.regions[r]).join(t.common.listSeparator)}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <VenomStatusBadge status={s.venomStatus} context="species" />
                    <span className={`text-small font-medium ${TONE_CLASSES[risk.tone].text}`}>{fmt(t.risk.riskLabel, { risk: t.risk[s.medicalRisk] })}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {onlyQuery && others.length > 0 && (
        <section aria-labelledby="unreviewed" className="mt-8">
          <h2 id="unreviewed" className="type-h3">{t.speciesList.otherTitle}</h2>
          <p className="mt-1 text-small text-ink-2">{t.speciesList.otherLead}</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {others.map((h) => (
              <li key={h.slug}>
                <Link href={`/species/${h.slug}`} className="flex min-h-14 flex-wrap items-baseline justify-between gap-2 py-3 hover:bg-row-hover sm:px-3">
                  <span>
                    <span className="type-name text-[1.125rem]">{h.commonName ?? h.name}</span>
                    {h.commonName && <span className="binomial ml-2 text-small text-ink-2">{h.name}</span>}
                  </span>
                  <span className="text-small text-ink-2">{h.family}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface TaxonomyHit {
  slug: string;
  name: string;
  commonName: string | null;
  family: string;
}

/** Server-side search over the full taxonomy (it is never loaded into the browser). */
function useTaxonomySearch(query: string): TaxonomyHit[] {
  const q = query.trim();
  const [state, setState] = useState<{ q: string; hits: TaxonomyHit[] }>({ q: "", hits: [] });
  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/species/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((body: { hits: TaxonomyHit[] }) => setState({ q, hits: body.hits }))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);
  return q.length >= 2 && state.q === q ? state.hits : [];
}
