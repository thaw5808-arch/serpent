"use client";
import { useMemo } from "react";
import { COUNTRIES } from "@/data/countries";
import { useLocale, useT } from "@/i18n/client";
import { countryName, intlLocale } from "@/i18n/format";

export function CountrySelect({
  value,
  onChange,
  id = "country",
  hint,
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  hint?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const sorted = useMemo(() => {
    const collator = new Intl.Collator(intlLocale(locale));
    return COUNTRIES.map((c) => ({ code: c.code, name: countryName(c.code, locale) })).sort((a, b) => collator.compare(a.name, b.name));
  }, [locale]);
  return (
    <div>
      <label htmlFor={id} className="block text-small font-semibold">
        {t.country.label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-small opacity-80">
          {hint}
        </p>
      )}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-2 block min-h-12 w-full rounded-badge border border-line bg-surface px-3 text-body text-ink"
      >
        <option value="">{t.country.unknown}</option>
        {sorted.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
