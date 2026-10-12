"use client";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronRight } from "lucide-react";

export interface FilterOption<V extends string> {
  value: V;
  label: string;
  /** Shown on the right, e.g. how many species match this option given the other filters. */
  count?: number;
  /** Accessible text for the count ("12 species"); the number alone is shown visually. */
  countLabel?: string;
  /** CSS colour for an 8px dot before the label. Always paired with the label, never alone. */
  dotColor?: string;
}

/** Only one dropdown is open at a time: opening one tells the others to close. */
const OPEN_EVENT = "filterdropdown:open";

/**
 * A select-only combobox (WAI-ARIA APG pattern): focus stays on the trigger,
 * the active option is exposed with aria-activedescendant.
 */
export function FilterDropdown<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: FilterOption<V>[];
  value: V;
  onChange: (value: V) => void;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  const openAt = useCallback(
    (index: number) => {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
      setActive(Math.min(Math.max(index, 0), options.length - 1));
      setOpen(true);
    },
    [id, options.length],
  );

  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  };

  // Close when another dropdown opens, or on a pointer press outside this one.
  useEffect(() => {
    const onOtherOpen = (e: Event) => (e as CustomEvent<string>).detail !== id && setOpen(false);
    window.addEventListener(OPEN_EVENT, onOtherOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOtherOpen);
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Keep the active option in view inside the scrolling panel.
  useEffect(() => {
    if (open) listRef.current?.querySelector(`[id="${optionId(active)}"]`)?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId is derived from the stable id
  }, [open, active]);

  /** Type-to-select: jumps to the next option whose label starts with what was typed. */
  function typeahead(key: string) {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at > 600 ? key : t.text + key;
    t.at = now;
    const query = t.text.toLocaleLowerCase();
    const start = open ? active + (t.text.length === 1 ? 1 : 0) : selectedIndex;
    for (let step = 0; step < options.length; step++) {
      const i = (start + step) % options.length;
      if (options[i].label.toLocaleLowerCase().startsWith(query)) return openAt(i);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = options.length - 1;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openAt(selectedIndex);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        openAt(e.key === "Home" ? 0 : last);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        typeahead(e.key);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => Math.min(a + 1, last));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(last);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeahead(e.key);
    }
  }

  return (
    <div ref={rootRef} className="fd relative">
      <div
        role="combobox"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelId}
        aria-activedescendant={open ? optionId(active) : undefined}
        onClick={(e) => {
          // Safari doesn't focus on click; keyboard use must continue from the trigger.
          e.currentTarget.focus();
          if (open) setOpen(false);
          else openAt(selectedIndex);
        }}
        onKeyDown={onKeyDown}
        className="fd-trigger"
        data-open={open || undefined}
      >
        <span className="min-w-0 flex-1">
          <span id={labelId} className="fd-label">{label}</span>
          <span className="fd-value">{selected?.label}</span>
        </span>
        <ChevronRight aria-hidden className="fd-chevron" />
      </div>
      <ul ref={listRef} id={listId} role="listbox" aria-labelledby={labelId} hidden={!open} className="fd-panel">
        {options.map((o, i) => (
          <li
            key={o.value}
            id={optionId(i)}
            role="option"
            aria-selected={i === selectedIndex}
            data-active={(open && i === active) || undefined}
            onMouseMove={() => i !== active && setActive(i)}
            onMouseDown={(e) => e.preventDefault() /* keep focus on the trigger */}
            onClick={() => choose(i)}
            className="fd-option"
          >
            {o.dotColor && <span aria-hidden className="fd-dot" style={{ background: o.dotColor }} />}
            <span className="min-w-0 flex-1">{o.label}</span>
            {o.count !== undefined && (
              <span className="fd-count">
                <span aria-hidden>{o.count}</span>
                {o.countLabel && <span className="sr-only">, {o.countLabel}</span>}
              </span>
            )}
            <span className="fd-check" aria-hidden>
              {i === selectedIndex && <Check className="size-4" />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
