import type { ReactNode } from "react";

/*
 * Small line drawings for the pattern and head-shape answers. Decorative only
 * (aria-hidden): the option's text always carries the meaning. Drawn in the
 * current text colour so they follow the option card's state.
 */

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 72 40"
      className="h-10 w-[72px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** A straight length of body, seen from above. */
const BODY = "M6 13h60a7 7 0 0 1 0 14H6a7 7 0 0 1 0-14z";

const PATTERNS: Record<string, ReactNode> = {
  bands: (
    <>
      <path d={BODY} />
      {[16, 28, 40, 52].map((x) => (
        <path key={x} d={`M${x} 13v14M${x + 4} 13v14`} />
      ))}
    </>
  ),
  stripes: (
    <>
      <path d={BODY} />
      <path d="M4 18h64M4 22h64" />
    </>
  ),
  blotches: (
    <>
      <path d={BODY} />
      {[16, 32, 48].map((x) => (
        <path key={x} d={`M${x} 20l5-5 5 5-5 5z`} />
      ))}
    </>
  ),
  speckled: (
    <>
      <path d={BODY} />
      {[
        [12, 18], [20, 23], [27, 17], [34, 22], [41, 18], [48, 23], [55, 17], [61, 21],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="currentColor" stroke="none" />
      ))}
    </>
  ),
  plain: <path d={BODY} />,
};

/** Head and neck seen from above, head on the right. */
const HEADS: Record<string, ReactNode> = {
  triangular: (
    <>
      <path d="M4 17h34M4 23h34" />
      <path d="M38 17l8-8 18 8a4 4 0 0 1 0 6l-18 8-8-8" />
      <circle cx="53" cy="15.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="53" cy="24.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  same_as_neck: (
    <>
      <path d="M4 16h52a8 4 0 0 1 0 8H4" />
      <circle cx="56" cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx="56" cy="22" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  hood: (
    <>
      <path d="M4 17h16M4 23h16" />
      <path d="M20 17c6-14 26-14 32 0M20 23c6 14 26 14 32 0" />
      <path d="M52 17h8a3 3 0 0 1 0 6h-8" />
      <circle cx="58" cy="18.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="58" cy="21.5" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
};

export function PatternDrawing({ value }: { value: string }) {
  const art = PATTERNS[value];
  return art ? <Frame>{art}</Frame> : null;
}

export function HeadDrawing({ value }: { value: string }) {
  const art = HEADS[value];
  return art ? <Frame>{art}</Frame> : null;
}
