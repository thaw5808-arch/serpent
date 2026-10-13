"use client";
import { Stethoscope } from "lucide-react";
import { Link, useT } from "@/i18n/client";

export const doctorCardHref = (resultId?: string | null) =>
  resultId ? `/doctor-card?result=${encodeURIComponent(resultId)}` : "/doctor-card";

/** "Bitten? Make a doctor card": red-outlined, prefilled with this result when there is one. */
export function DoctorCardLink({ resultId, label, className = "" }: { resultId?: string | null; label?: string; className?: string }) {
  const t = useT();
  return (
    <Link href={doctorCardHref(resultId)} className={`btn-doctor ${className}`}>
      <Stethoscope aria-hidden className="size-5 shrink-0" />
      {label ?? t.doctorCard.entryBitten}
    </Link>
  );
}
