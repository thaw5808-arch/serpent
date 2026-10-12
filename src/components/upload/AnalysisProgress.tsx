"use client";
import { Check, Loader2 } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { fmt, formatPercent } from "@/i18n/format";

export type Phase = "uploading" | "analyzing";

/**
 * Shows only phases the client can actually observe. We don't animate
 * fake sub-steps: the model call is one request, so it is shown as one.
 */
export function AnalysisProgress({ phase, uploadPct }: { phase: Phase; uploadPct: number }) {
  const t = useT();
  const locale = useLocale();
  const steps = [
    { id: "prepared", label: t.progress.prepared, state: "done" as const },
    {
      id: "uploading",
      label: phase === "uploading" ? fmt(t.progress.sending, { pct: formatPercent(uploadPct / 100, locale) }) : t.progress.sent,
      state: phase === "uploading" ? ("active" as const) : ("done" as const),
    },
    {
      id: "analyzing",
      label: t.progress.analyzing,
      state: phase === "analyzing" ? ("active" as const) : ("pending" as const),
    },
  ];

  return (
    <div className="border-y border-line py-5">
      <ol className="space-y-3" aria-live="polite">
        {steps.map((s) => (
          <li key={s.id} className={`flex items-start gap-3 ${s.state === "pending" ? "text-ink-2" : ""}`}>
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
              {s.state === "done" && <Check aria-hidden className="size-5 text-low" />}
              {s.state === "active" && <Loader2 aria-hidden className="size-5 animate-spin" />}
              {s.state === "pending" && <span aria-hidden className="size-2 rounded-full bg-line" />}
            </span>
            <span>
              {s.label}
              <span className="sr-only">
                {s.state === "done" ? t.progress.done : s.state === "active" ? t.progress.inProgress : t.progress.waiting}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {phase === "analyzing" && (
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="indeterminate h-full w-2/5 rounded-full bg-moss" />
        </div>
      )}
      <p className="mt-3 text-small text-ink-2">{t.progress.usually}</p>
    </div>
  );
}
