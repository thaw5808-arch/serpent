"use client";
import { useT } from "@/i18n/client";
import { RISK, TONE_CLASSES } from "@/lib/labels";
import type { MedicalRisk } from "@/types";

const STEPS: MedicalRisk[] = ["low", "moderate", "high", "very_high"];

/** Four-step scale plus a text label, so meaning never depends on colour. */
export function RiskMeter({ risk, label }: { risk: MedicalRisk; label?: string }) {
  const t = useT();
  const meta = RISK[risk];
  const tone = TONE_CLASSES[meta.tone];
  const name = label ?? t.risk.medicalRisk;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="eyebrow">{name}</span>
        <span className={`text-lead font-semibold ${tone.text}`}>{t.risk[risk]}</span>
      </div>
      <div
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={meta.level}
        aria-valuetext={t.risk[risk]}
        className="mt-2 grid grid-cols-4 gap-1"
      >
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`h-2 rounded-[2px] ${
              risk === "unknown" ? "hatch" : i < meta.level ? tone.fill : "bg-surface-2"
            }`}
          />
        ))}
      </div>
      <div className="mt-1 grid grid-cols-4 gap-1 text-caption text-ink-2" aria-hidden>
        {STEPS.map((s) => (
          <span key={s}>{t.risk[s]}</span>
        ))}
      </div>
    </div>
  );
}
