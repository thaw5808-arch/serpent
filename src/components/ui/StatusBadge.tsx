"use client";
import { AlertTriangle, CircleHelp, ShieldAlert, ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/client";
import type { DisplayVenomStatus, VenomType } from "@/types";

const ICON = {
  venomous: ShieldAlert,
  potentially_venomous: AlertTriangle,
  mildly_venomous: ShieldCheck,
  non_venomous: ShieldCheck,
  unknown: CircleHelp,
} as const;

/** Venomous is the one filled badge; the rest are tinted. Icon + text always carry the meaning. */
const STYLE: Record<DisplayVenomStatus, string> = {
  venomous: "border-venom bg-venom text-white",
  potentially_venomous: "border-caution/30 bg-caution-bg text-caution",
  mildly_venomous: "border-low/25 bg-low-bg text-low",
  non_venomous: "border-low/25 bg-low-bg text-low",
  unknown: "border-line bg-neutral-bg text-neutral",
};

/** Venom status with icon + text, never colour alone. */
export function VenomStatusBadge({
  status,
  size = "md",
  context = "result",
  label,
}: {
  status: DisplayVenomStatus;
  size?: "md" | "lg";
  /** "species" = a database record, so drop the result-only "(most likely)" qualifier. */
  context?: "result" | "species";
  /** Overrides the text, e.g. "Not assessed" with the neutral "unknown" style. */
  label?: string;
}) {
  const t = useT();
  const Icon = ICON[status];
  return (
    <span
      className={`inline-flex max-w-full shrink-0 items-center gap-2 rounded-badge border font-semibold ${STYLE[status]} ${
        size === "lg" ? "min-h-8 px-3 py-0.5 text-small" : "min-h-7 px-2 py-0.5 text-[0.8125rem]"
      }`}
    >
      <Icon aria-hidden className={`shrink-0 ${size === "lg" ? "size-4" : "size-3.5"}`} />
      {label ?? (context === "species" && status === "non_venomous" ? t.venomStatus.nonVenomousSpecies : t.venomStatus[status].label)}
    </span>
  );
}

/** A venom type as a small neutral chip (the description lives in the venom profile). */
export function VenomTypeChip({ type }: { type: VenomType }) {
  const t = useT();
  return (
    <span className="inline-flex min-h-7 items-center rounded-badge border border-line bg-surface px-2 py-0.5 text-[0.8125rem] font-medium">
      {t.venomType[type].label}
    </span>
  );
}
