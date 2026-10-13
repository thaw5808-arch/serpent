"use client";
import { Phone } from "lucide-react";
import { getCountry } from "@/data/countries";
import { useLocale, useT } from "@/i18n/client";
import { countryName, fmt } from "@/i18n/format";
import { useCountry } from "@/lib/useCountry";
import { CountrySelect } from "./CountrySelect";
import { FirstAid } from "./FirstAid";

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

export function EmergencyPanel() {
  const t = useT();
  const locale = useLocale();
  const [code, setCode] = useCountry();
  const country = getCountry(code);
  const [main, ...secondary] = country?.emergency ?? [];

  return (
    <div className="grid gap-12 lg:grid-cols-12 lg:items-start lg:gap-8">
      <section aria-labelledby="call" className="rounded-card border border-line bg-surface p-5 text-ink sm:p-8 lg:col-span-5">
        <h2 id="call" className="type-h1">
          {t.emergency.callNow}
        </h2>
        <p className="mt-3 max-w-prose opacity-95">{t.emergency.treatEvery}</p>

        {main ? (
          <ul className="mt-6 space-y-3">
            <li>
              <a
                href={tel(main.number)}
                className="flex min-h-24 items-center gap-4 rounded-card bg-emergency px-5 py-4 text-emergency-ink transition-colors hover:bg-emergency-hover"
              >
                <Phone aria-hidden className="size-7 shrink-0" />
                <span>
                  <span dir="ltr" className="block text-[2.5rem] font-semibold leading-none tracking-tight tabular-nums">{main.number}</span>
                  <span className="mt-1 block text-small opacity-90">
                    {t.contacts[main.label]}
                    {main.note ? ` — ${t.contacts[main.note]}` : ""}
                  </span>
                </span>
              </a>
            </li>
            {secondary.map((e) => (
              <li key={e.number}>
                <a
                  href={tel(e.number)}
                  className="flex min-h-14 items-center gap-3 rounded-card bg-emergency px-4 py-3 text-emergency-ink transition-colors hover:bg-emergency-hover"
                >
                  <Phone aria-hidden className="size-5 shrink-0" />
                  <span dir="ltr" className="shrink-0 text-lead font-semibold tabular-nums">{e.number}</span>
                  <span className="text-small opacity-90">
                    {t.contacts[e.label]}
                    {e.note ? ` — ${t.contacts[e.note]}` : ""}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 rounded-card border border-caution-border bg-caution-bg px-5 py-4 font-medium text-caution">
            {country ? fmt(t.emergency.noVerifiedNumber, { country: countryName(country.code, locale) }) : t.emergency.chooseCountry}
          </p>
        )}

        <div className="mt-6 border-t border-line pt-5">
          <CountrySelect value={code} onChange={setCode} id="emergency-country" />
        </div>
        <p className="mt-3 text-small opacity-90">{t.emergency.numbersDisclaimer}</p>
      </section>

      <section aria-labelledby="first-aid" className="lg:col-span-7">
        <h2 id="first-aid" className="type-h1">{t.emergency.firstAidTitle}</h2>
        <p className="mt-2 max-w-prose text-ink-2">{t.emergency.firstAidLead}</p>
        <div className="mt-8">
          <FirstAid countryCode={code} />
        </div>
      </section>
    </div>
  );
}
