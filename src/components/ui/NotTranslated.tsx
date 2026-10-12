"use client";
import { Languages } from "lucide-react";
import { useT } from "@/i18n/client";

/** Marks species text that is shown in English because it has no translation yet. Never silent. */
export function NotTranslated({ show, className = "mt-1" }: { show: boolean; className?: string }) {
  const t = useT();
  if (!show) return null;
  return (
    <p className={`flex items-center gap-1.5 text-caption text-ink-2 ${className}`}>
      <Languages aria-hidden className="size-3.5 shrink-0" />
      {t.common.notYetTranslatedNote}
    </p>
  );
}
