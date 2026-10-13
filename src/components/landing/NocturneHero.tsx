import { Scan } from "lucide-react";
import { Link } from "@/i18n/client";
import { LOCALES } from "@/i18n/config";
import { formatCount } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
import { taxonomyCount } from "@/services/taxonomyIndex";

/** Iris striations, clipped to the almond. */
const IRIS =
  "M360 230L360 490M300 236L330 488M420 236L390 488M250 250L310 480M470 250L410 480M200 280L290 460M520 280L430 460";
const ALMOND = "M120 360C220 210 500 210 600 360C500 510 220 510 120 360Z";

/** The big slit eye. Decorative: the rings turn, the eye opens, blinks and looks around (CSS only, see globals.css). */
function Eye() {
  return (
    <svg viewBox="0 0 720 720" className="noc-eye" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="noc-iris">
          <stop offset="0" stopColor="#F0DE96" />
          <stop offset=".45" stopColor="#C9AE4F" />
          <stop offset=".85" stopColor="#7A6420" />
          <stop offset="1" stopColor="#3E3210" />
        </radialGradient>
        <clipPath id="noc-almond">
          <path d={ALMOND} />
        </clipPath>
      </defs>
      <g className="noc-rings" fill="none" stroke="rgba(194,169,75,.28)">
        <circle cx="360" cy="360" r="300" strokeDasharray="1 9" />
        <circle cx="360" cy="360" r="330" opacity=".5" />
      </g>
      <g className="noc-almond">
        <path d={ALMOND} fill="url(#noc-iris)" />
        <g clipPath="url(#noc-almond)">
          <path d={IRIS} fill="none" stroke="rgba(62,50,16,.35)" strokeWidth="1.2" />
          <g className="noc-look">
            <ellipse className="noc-pupil" cx="360" cy="360" rx="22" ry="128" fill="#070B09" />
            <ellipse cx="392" cy="318" rx="10" ry="14" fill="#FFFFFF" opacity=".75" />
          </g>
        </g>
        <path d={ALMOND} fill="none" stroke="#0B110E" strokeWidth="6" />
      </g>
    </svg>
  );
}

/** "Nocturne" landing hero: dark, gold-framed, with the animated eye. */
export async function NocturneHero() {
  const t = (await getDictionary()).landing;
  // Every species Serpent can recognise (The Reptile Database), not just the detailed catalog.
  // The page is prerendered, so this is counted at build time.
  const count = formatCount(taxonomyCount());
  // The lead keeps {unknown} as a slot so the word can be set in italic serif.
  const [before, after] = t.lead.replace("{count}", count).split("{unknown}");
  return (
    <section className="nocturne" aria-labelledby="landing-title">
      <div className="noc-frame" aria-hidden="true" />
      <div className="noc-body">
        <div className="noc-art" aria-hidden="true">
          <div className="noc-glow" />
          <Eye />
        </div>
        <div className="noc-copy">
          <p className="noc-eyebrow noc-rise" style={{ animationDelay: ".7s" }}>
            <span className="noc-eyebrow-line" aria-hidden="true" />
            {t.eyebrow}
          </p>
          <h1 id="landing-title" className="noc-title">
            <span className="noc-mask">
              <span className="noc-line" style={{ animationDelay: ".85s" }}>{t.titleLine1}</span>
            </span>{" "}
            <span className="noc-mask">
              <span className="noc-line noc-line-2" style={{ animationDelay: "1s" }}>{t.titleLine2}</span>
            </span>
          </h1>
          <p className="noc-lead noc-rise" style={{ animationDelay: "1.4s" }}>
            {before}
            <em className="noc-unknown">{t.unknown}</em>
            {after}
          </p>
          <div className="noc-ctas noc-rise" style={{ animationDelay: "1.65s" }}>
            <Link href="/identify" className="noc-cta noc-cta-primary">
              <Scan aria-hidden className="size-5 shrink-0" />
              {t.ctaIdentify}
            </Link>
            <Link href="/species" className="noc-cta noc-cta-secondary">
              {t.ctaBrowse}
            </Link>
          </div>
        </div>
      </div>
      <div className="noc-foot noc-rise" style={{ animationDelay: "2s" }}>
        <ul className="noc-stats" aria-label={t.statsLabel}>
          <li>
            <span className="noc-stat-value">{count}</span> <span className="noc-stat-label">{t.statSpecies}</span>
          </li>
          <li>
            <span className="noc-stat-value">{LOCALES.length}</span> <span className="noc-stat-label">{t.statLanguages}</span>
          </li>
          <li>
            <em className="noc-stat-value">{t.statNever}</em> <span className="noc-stat-label">{t.statNeverLabel}</span>
          </li>
        </ul>
        <div className="noc-scroll" aria-hidden="true">
          {t.scroll}
          <span className="noc-scroll-line" />
        </div>
      </div>
    </section>
  );
}
