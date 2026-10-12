"use client";
import { useEffect, useState } from "react";
import { History as HistoryIcon } from "lucide-react";
import { Link, useT } from "@/i18n/client";
import { deleteFromHistory, isInHistory } from "@/lib/history";

/** On the result screen: says the result was saved on this device, with a way to take it back out. */
export function SavedToHistory({ resultId }: { resultId: string }) {
  const t = useT();
  const [state, setState] = useState<"saved" | "removed" | null>(null);

  // Checked on every showing, so deleting it on the History page is reflected here.
  useEffect(() => {
    let live = true;
    isInHistory(resultId).then((saved) => {
      if (live) setState((s) => (saved ? "saved" : s === "removed" ? s : null));
    });
    return () => {
      live = false;
    };
  }, [resultId]);

  async function remove() {
    if (await deleteFromHistory(resultId)) setState("removed");
  }

  return (
    <div role="status" className={state ? "mt-8 border-t border-line pt-3 text-center text-caption text-ink-2" : undefined}>
      {state === "saved" && (
        <p className="inline-flex flex-wrap items-center justify-center gap-x-2">
          <HistoryIcon aria-hidden className="size-3.5 shrink-0" />
          <Link href="/history" className="underline-offset-4 hover:underline">{t.history.savedHere}</Link>
          <button type="button" onClick={remove} className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4">
            {t.history.dontSave}
          </button>
        </p>
      )}
      {state === "removed" && <p className="inline-flex min-h-11 items-center">{t.history.removed}</p>}
    </div>
  );
}
