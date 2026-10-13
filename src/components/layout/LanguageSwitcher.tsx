"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, localePath, stripLocale, type Locale } from "@/i18n/config";

/** Remembers an explicit language choice for future visits (read by src/proxy.ts). */
function saveChoice(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/**
 * Compact "EN ▾" button opening English · ไทย · မြန်မာ, each in its own script;
 * switching keeps the current page. Same select-only combobox pattern as
 * FilterDropdown: focus stays on the trigger, the active option is exposed with
 * aria-activedescendant; Esc or a press outside closes it.
 */
export function LanguageSwitcher() {
  const t = useT();
  const current = useLocale();
  const path = stripLocale(usePathname() ?? "/");
  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedIndex = LOCALES.indexOf(current);

  const openAt = (index: number) => {
    setActive(Math.min(Math.max(index, 0), LOCALES.length - 1));
    setOpen(true);
  };

  const choose = (index: number) => {
    setOpen(false);
    const locale = LOCALES[index];
    if (!locale || locale === current) return;
    saveChoice(locale);
    // A full load: each language is its own root layout, and a client-side
    // navigation between root layouts leaves the old page mounted.
    window.location.assign(localePath(locale, path));
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = LOCALES.length - 1;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openAt(selectedIndex);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        openAt(e.key === "Home" ? 0 : last);
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
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <span id={labelId} hidden>{t.language.label}</span>
      <div
        role="combobox"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-activedescendant={open ? optionId(active) : undefined}
        onClick={(e) => {
          // Safari doesn't focus on click; keyboard use must continue from the trigger.
          e.currentTarget.focus();
          if (open) setOpen(false);
          else openAt(selectedIndex);
        }}
        onKeyDown={onKeyDown}
        className="lang-trigger"
        data-open={open || undefined}
      >
        <span aria-hidden>{current.toUpperCase()}</span>
        <span id={valueId} lang={current} className="sr-only">{LOCALE_NAMES[current]}</span>
        <ChevronDown aria-hidden className="lang-chevron" />
      </div>
      <ul id={listId} role="listbox" aria-labelledby={labelId} hidden={!open} className="fd-panel lang-panel">
        {LOCALES.map((l, i) => (
          <li
            key={l}
            id={optionId(i)}
            role="option"
            lang={l}
            aria-selected={i === selectedIndex}
            data-active={(open && i === active) || undefined}
            onMouseMove={() => i !== active && setActive(i)}
            onMouseDown={(e) => e.preventDefault() /* keep focus on the trigger */}
            onClick={() => choose(i)}
            className="fd-option"
          >
            <span className="min-w-0 flex-1">{LOCALE_NAMES[l]}</span>
            <span className="fd-check" aria-hidden>
              {i === selectedIndex && <Check className="size-4" />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
