"use client";
import { Hand } from "lucide-react";
import { Link, useT } from "@/i18n/client";
import { BASE_ACTIONS } from "@/lib/safetyActions";
import type { SafetyActionKey } from "@/types";

/**
 * First thing shown after any analysis, before any species information: one compact strip.
 * Pass `actionKeys` (shown in the interface language), or `actions` as already-localized text.
 * `legacy` marks a result saved before translations existed, whose actions are English only.
 */
export function KeepDistance({
  actionKeys,
  actions,
  legacy = false,
  emphasis = "caution",
}: {
  actionKeys?: SafetyActionKey[];
  actions?: string[];
  legacy?: boolean;
  emphasis?: "caution" | "high";
}) {
  const t = useT();
  const text = actions ?? (actionKeys ?? BASE_ACTIONS).map((k) => t.safety.actions[k]);
  const tone = emphasis === "high" ? "border-high-border bg-high-bg" : "border-caution/30 bg-caution-bg";
  return (
    <section aria-labelledby="keep-distance" className={`rounded-card border ${tone} px-4 py-4 sm:px-5`}>
      <div className="flex items-start gap-3">
        <Hand aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0">
          <h2 id="keep-distance" className="type-h2 text-[1.25rem] lg:text-[1.375rem]">
            {t.safety.keepDistance}
          </h2>
          <p className="mt-2 text-small" lang={legacy ? "en" : undefined}>{text.join(" ")}</p>
          {legacy && <p className="mt-1 text-caption text-ink-2">{t.notes.legacyResult}</p>}
          <p className="mt-2 text-small">
            {t.safety.bittenPrompt}{" "}
            <Link href="/emergency" className="font-semibold text-critical underline underline-offset-2">
              {t.safety.getGuidance}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
