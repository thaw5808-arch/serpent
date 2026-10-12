"use client";
import { Check, X } from "lucide-react";
import { FIRST_AID_DO, FIRST_AID_DONT, REGIONAL_FIRST_AID } from "@/data/firstAid";
import { useT } from "@/i18n/client";

export function FirstAid({ countryCode }: { countryCode: string }) {
  const t = useT();
  const regional = REGIONAL_FIRST_AID[countryCode] ?? [];
  return (
    <div className="space-y-10">
      <section aria-labelledby="fa-do">
        <h3 id="fa-do" className="type-h2">{t.firstAid.doTitle}</h3>
        <ol className="mt-4 divide-y divide-line border-y border-line">
          {FIRST_AID_DO.map((k, i) => (
            <li key={k} className="grid grid-cols-[2rem_1fr] gap-x-3 py-4">
              <span className="font-serif text-[1.375rem] font-semibold leading-6 text-moss tabular-nums">{i + 1}</span>
              <span>{t.firstAid.do[k]}</span>
            </li>
          ))}
          {regional.map((r) => (
            <li key={r.key} className="grid grid-cols-[2rem_1fr] gap-x-3 py-4">
              <Check aria-hidden className="size-6 text-low" />
              <span>{t.firstAid.regional[r.key]}</span>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="fa-dont">
        <h3 id="fa-dont" className="type-h2">{t.firstAid.dontTitle}</h3>
        <ul className="mt-4 grid border-t border-line sm:grid-cols-2 sm:gap-x-8">
          {FIRST_AID_DONT.map((k) => (
            <li key={k} className="flex gap-3 border-b border-line py-3 text-small sm:text-body">
              <X aria-hidden className="mt-0.5 size-5 shrink-0 text-high" />
              <span>{t.firstAid.dont[k]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
