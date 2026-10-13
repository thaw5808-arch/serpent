"use client";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { fmt, formatDate, formatDateTime, formatTime } from "@/i18n/format";
import { cardSnake, elapsed, TELL_DOCTOR, type CardDict, type DoctorCard } from "@/lib/doctorCard";

/*
 * The card shown to hospital staff, in the card's own language (`locale`), which
 * may differ from the site's. Names (common and scientific) are never translated.
 * No treatment, dosing or antivenom advice: only what happened and what Serpent showed.
 */

/** "2 h 5 min ago", or a warning for a time in the future; null without a bite time. */
export function elapsedText(card: DoctorCard, t: CardDict, now: number): string | null {
  if (!card.biteTime) return null;
  const e = elapsed(card.biteTime, now);
  if (!e) return t.doctorCard.futureTime;
  return e.h > 0 ? fmt(t.doctorCard.ago, { h: e.h, m: e.m }) : fmt(t.doctorCard.agoMinutes, { m: e.m });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dc-row">
      <dt className="dc-label">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function CardView({ card, t, locale, now }: { card: DoctorCard; t: CardDict; locale: Locale; now: number }) {
  const d = t.doctorCard;
  const snake = cardSnake(card.source, t);
  const ago = elapsedText(card, t, now);
  const dangerStatus = snake.status === "venomous" || snake.status === "potentially_venomous";

  return (
    <article lang={locale} aria-labelledby="dc-title" className="doctor-card">
      <div className="dc-head">
        <h2 id="dc-title" className="dc-title">{d.cardTitle}</h2>
        <p className="dc-date">{fmt(d.madeOn, { date: formatDate(card.createdAt, locale) })}</p>
      </div>

      <dl className="dc-list">
        <Row label={d.snake}>
          {snake.kind === "none" ? (
            <p className="font-semibold">{d.notIdentified}</p>
          ) : (
            <>
              {snake.kind === "possible" && <p className="dc-sub">{d.possibleMatches}</p>}
              <ul>
                {snake.names.map((n) => (
                  <li key={n.name + (n.scientific ?? "")}>
                    <span className="font-semibold">{n.name}</span>
                    {n.scientific && n.scientific !== n.name && (
                      <>
                        {" "}
                        <i lang="la" className="binomial">{n.scientific}</i>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {card.thumbnails.length > 0 && (
            <div className="dc-photos">
              {card.thumbnails.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- on-device data URL
                <img key={i} src={src} alt={fmt(d.photoAlt, { n: i + 1 })} />
              ))}
            </div>
          )}
        </Row>
        <Row label={d.status}>
          <p className={dangerStatus ? "dc-status dc-status-danger" : "dc-status"}>{snake.statusText}</p>
        </Row>
        {snake.venomTypes.length > 0 && (
          <Row label={d.venomType}>{snake.venomTypes.map((v) => t.venomType[v].label).join(", ")}</Row>
        )}
        {snake.risk && <Row label={d.risk}>{snake.risk.text}</Row>}

        <Row label={d.bitten}>
          {card.biteTime ? (
            <>
              <span className="font-semibold">{formatDateTime(card.biteTime, locale)}</span>
              {ago && <span className="dc-ago"> ({ago})</span>}
            </>
          ) : (
            <span className="dc-missing">{d.noBiteTime}</span>
          )}
        </Row>
        <Row label={d.biteLocation}>{card.location ? d.locations[card.location] : d.notGiven}</Row>

        <Row label={d.symptoms}>
          {card.symptoms.length === 0 ? (
            d.noneReported
          ) : (
            <ul className="dc-cols">
              {card.symptoms.map((s) => (
                <li key={s.key}>
                  {d.symptomItems[s.key]} <span className="dc-ago">({fmt(d.since, { time: formatTime(s.at, locale) })})</span>
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label={d.firstAid}>
          {card.firstAid.length === 0 ? (
            d.noneReported
          ) : (
            <ul className="dc-cols">
              {card.firstAid.map((f) => (
                <li key={f}>
                  {d.firstAidItems[f]}
                  {TELL_DOCTOR.has(f) && <strong className="dc-flag">{d.tellDoctor}</strong>}
                </li>
              ))}
            </ul>
          )}
        </Row>

        {(card.patientName || card.allergies || card.notes) && (
          <Row label={d.patientSection}>
            {card.patientName && <p className="font-semibold">{card.patientName}</p>}
            {card.allergies && (
              <p>
                {d.allergies}: {card.allergies}
              </p>
            )}
            {card.notes && <p className="whitespace-pre-line">{card.notes}</p>}
          </Row>
        )}
      </dl>

      <p className="dc-footer">{d.footer}</p>
    </article>
  );
}
