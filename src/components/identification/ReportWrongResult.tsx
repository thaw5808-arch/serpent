"use client";
import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/client";
import type { Messages } from "@/i18n/messages";
import type { IdentificationResult } from "@/types";

type State = "closed" | "open" | "sending" | "sent" | "error";

const REPORT_ERRORS: Record<string, keyof Messages["report"]> = {
  unavailable: "unavailable",
  rate_limited: "rateLimited",
  unreadable: "unreadable",
};

/** "This identification looks wrong": an anonymous correction tied to the result id. No image is sent. */
export function ReportWrongResult({ result }: { result: IdentificationResult }) {
  const t = useT();
  const [state, setState] = useState<State>("closed");
  const [error, setError] = useState("");

  if (result.status === "service_unavailable") return null;

  if (state === "sent") {
    return (
      <p role="status" className="rounded-card border border-line bg-surface p-4 text-small">
        {t.report.sent}
      </p>
    );
  }

  if (state === "closed") {
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={() => setState("open")}
          className="inline-flex min-h-11 items-center gap-2 px-2 text-small text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          <Flag aria-hidden className="size-4" /> {t.report.open}
        </button>
      </div>
    );
  }

  async function submit(form: FormData) {
    setState("sending");
    const shown = result.top ?? result.closestMatch ?? result.alternatives[0] ?? null;
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultId: result.id,
          suggestedSpecies: String(form.get("species") ?? ""),
          note: String(form.get("note") ?? ""),
          resultStatus: result.status,
          shownLabel: shown?.label ?? null,
          displayVenomStatus: result.displayVenomStatus,
          countryCode: result.country,
          provider: result.engine.provider,
          model: result.engine.model,
        }),
      });
      if (res.ok) return setState("sent");
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      setError(t.report[(body.code && REPORT_ERRORS[body.code]) || "failed"]);
    } catch {
      setError(t.report.failedNetwork);
    }
    setState("error");
  }

  return (
    <section aria-labelledby="report" className="rounded-card border border-line bg-surface p-5">
      <h2 id="report" className="type-h3">{t.report.title}</h2>
      <p className="mt-1 text-small text-ink-2">{t.report.lead}</p>
      <form action={submit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="report-species" className="block text-small font-medium">
            {t.report.speciesLabel} <span className="font-normal text-ink-2">{t.common.optional}</span>
          </label>
          <input
            id="report-species"
            name="species"
            maxLength={120}
            autoComplete="off"
            className="mt-2 block min-h-12 w-full rounded-badge border border-line bg-field px-3 text-ink placeholder:text-[var(--muted)] focus:border-gold-light text-[16px]"
          />
        </div>
        <div>
          <label htmlFor="report-note" className="block text-small font-medium">
            {t.report.noteLabel} <span className="font-normal text-ink-2">{t.common.optional}</span>
          </label>
          <textarea
            id="report-note"
            name="note"
            maxLength={1000}
            rows={3}
            className="mt-2 block w-full rounded-badge border border-line bg-field px-3 text-ink placeholder:text-[var(--muted)] focus:border-gold-light py-2 text-[16px]"
          />
        </div>
        {state === "error" && (
          <p role="alert" className="text-small text-critical">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={state === "sending"}>
            {state === "sending" ? t.report.sending : t.report.send}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setState("closed")}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </section>
  );
}
