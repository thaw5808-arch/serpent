import { Link } from "@/i18n/client";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-card px-5 text-body font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const variants: Record<Variant, string> = {
  primary: "min-h-15 bg-moss text-moss-ink",
  secondary: "min-h-13 border border-ink bg-transparent text-ink hover:bg-surface-2",
  danger: "min-h-15 bg-emergency text-emergency-ink hover:opacity-90",
  ghost: "min-h-11 font-medium text-ink-2 hover:text-ink hover:bg-surface-2",
};

// .btn-viewfinder supplies its own transitions (globals.css), so it skips the
// utilities that would override them and darkens on hover instead of fading.
const hover = "transition-colors";
const primaryHover = "hover:opacity-90";

export function buttonClass(variant: Variant = "primary", extra = "", viewfinder = false) {
  if (viewfinder) return `${base} ${variants[variant]} hover:bg-moss-hover btn-viewfinder ${extra}`;
  return `${base} ${hover} ${variants[variant]} ${variant === "primary" ? primaryHover : ""} ${extra}`;
}

/** Decorative corner brackets and scan line for primary camera CTAs. */
function Viewfinder({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="vf-corner vf-tl" aria-hidden="true" />
      <span className="vf-corner vf-tr" aria-hidden="true" />
      <span className="vf-corner vf-bl" aria-hidden="true" />
      <span className="vf-corner vf-br" aria-hidden="true" />
      <span className="vf-scan" aria-hidden="true" />
      <span className="vf-label">{children}</span>
    </>
  );
}

export function Button({
  variant = "primary",
  viewfinder = false,
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; viewfinder?: boolean }) {
  return (
    <button className={buttonClass(variant, className, viewfinder)} {...props}>
      {viewfinder ? <Viewfinder>{children}</Viewfinder> : children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  viewfinder = false,
  className = "",
  children,
}: { href: string; variant?: Variant; viewfinder?: boolean; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, className, viewfinder)}>
      {viewfinder ? <Viewfinder>{children}</Viewfinder> : children}
    </Link>
  );
}
