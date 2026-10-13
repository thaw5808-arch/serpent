import { Link } from "@/i18n/client";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-card px-5 text-body font-semibold disabled:cursor-not-allowed disabled:opacity-50";
/** Primary is the landing hero's gold CTA and secondary its outline button (.btn-primary / .btn-secondary in globals.css). */
const variants: Record<Variant, string> = {
  primary: "min-h-15 btn-primary",
  secondary: "min-h-13 btn-secondary",
  danger: "min-h-15 bg-emergency text-emergency-ink transition-colors hover:bg-emergency-hover",
  ghost: "min-h-11 font-medium text-ink-2 transition-colors hover:text-ink hover:bg-surface-2",
};

// .btn-primary, .btn-secondary and .btn-viewfinder bring their own transitions (globals.css).
export function buttonClass(variant: Variant = "primary", extra = "", viewfinder = false) {
  return `${base} ${variants[variant]} ${viewfinder ? "btn-viewfinder" : ""} ${extra}`;
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
