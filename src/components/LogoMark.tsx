/** The "Slit eye" mark: a snake's eye with a vertical pupil. Decorative; pair it with the "Serpent" wordmark. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="#17201B" />
      <path d="M4 16C8.5 9.5 23.5 9.5 28 16C23.5 22.5 8.5 22.5 4 16Z" fill="#C2A94B" />
      <ellipse cx="16" cy="16" rx="1.9" ry="5.4" fill="#17201B" />
      <circle cx="18.6" cy="13.6" r=".9" fill="#FFFFFF" opacity=".8" />
    </svg>
  );
}
