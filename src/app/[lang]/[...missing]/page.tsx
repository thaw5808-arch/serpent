import { notFound } from "next/navigation";

/** Unmatched paths under a locale render that locale's not-found page inside its layout. */
export default function Missing() {
  notFound();
}
