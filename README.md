# Serpent — Snake identification & venom safety

Serpent helps people work out what snake they've seen and how dangerous it might be, from a photo or from a few simple answers. It is built for South and Southeast Asia first, in English, Thai and Burmese. Safety comes before a confident-looking answer: the AI only suggests which snake it might be, Serpent's own data decides venom and risk, and anything uncertain is treated as dangerous.

**Live:** https://serpent-zeta.vercel.app

> **Serpent is an AI estimate, not medical advice.** If someone has been bitten, call your local emergency number and go to a hospital now. Don't wait for symptoms, and never approach a snake to identify it.

## Features

### Photo identification
- Take or upload up to 3 photos of the same snake. Photos are resized and stripped of EXIF/GPS data on the device before upload.
- Uses OpenAI vision (`VISION_PROVIDER=openai`); Anthropic Claude is also supported and is the default when `VISION_PROVIDER` isn't set. The model returns structured JSON only (forced tool call), validated with zod.
- Uncertain results can get one more independent analysis (`VERIFY_UNCERTAIN`).
- Results include a closest match, "could also be" species of a different venom class, look-alike warnings, and an honest **Unknown** when the photo isn't good enough. Unknown is always treated as dangerous.
- "Report a wrong result" (stored anonymously when a database is configured).

### Describe a snake (no photo)
- For when you couldn't take a photo: 8 short questions (place, colours, pattern, head shape, size, where, time, behaviour), each with a "Not sure" option.
- One text-only model call matches the answers against snakes recorded near the chosen city (GBIF) plus the curated catalog, or the whole taxonomy if no place is given (flagged as much less reliable).
- A description result is never non-venomous or low risk overall, shows the worst risk among the possible matches, and shows a red danger banner if any match is high or very high risk. Mostly "Not sure" gives "Unknown — not enough detail".

### Species reference
- 4,245 living snake species from The Reptile Database, with synonyms, common names and distribution.
- A curated catalog of 23 species with venom type, medical risk, look-alikes and sources. All curated records are drafts pending expert review.
- Species outside the catalog get venom status from their genus or family where Serpent has data, otherwise "not assessed" (shown as potentially venomous).

### Snakes near me
- Pick a city (search or "Use my location", rounded to about 10 km on the device). Shows snakes recorded within 50 km since 1990 from GBIF, dangerous ones first. City-level only; your own position is never stored.

### Snake season
- A 12-month chart of when snakes were recorded near the chosen city (GBIF monthly counts), with dangerous species as a separate series and the current month marked. A visually hidden table carries the same data for screen readers.
- Peak months are only named with at least 100 records; 30–99 records shows the chart with a "may not be reliable" note; under 30 shows no chart.
- The home page shows how the current month compares near your remembered city.

### History
- Past results (photo and described) saved in this browser's IndexedDB only, with small thumbnails. "Save my results" can be turned off; entries can be deleted one by one or all at once.

### Show the doctor card
- A one-screen snakebite summary for hospital staff: bite time with live elapsed time, bite location, symptoms with the time each was ticked, first aid done (risky first aid flagged "Tell the doctor"), optional patient details, and the snake exactly as the result showed it.
- Card language (EN / ไทย / မြန်မာ) is independent of the site language. Scientific names stay in Latin; common names are never translated.
- "Save as PDF" uses a print stylesheet that fits the card on one A4 or Letter page.
- Saved in IndexedDB on the device only (kept even with "Save my results" off, with a delete button). After the page has loaded it works offline: no network requests.
- No treatment, dosing or antivenom advice anywhere on the card.

### I've been bitten
- Emergency numbers for the selected country, first-aid do's and don'ts with sources, and a shortcut to the doctor card. The "I've been bitten" button is in the header on every page (pinned to the bottom on phones).

### Languages and design
- English, Thai and Burmese (Myanmar Unicode). Locale-prefixed URLs (`/en`, `/th`, `/my`); the language is chosen from a saved choice, the browser, then the selected country. Thai and Burmese safety and medical text is a draft until reviewed by a native speaker with medical knowledge: see [`messages/REVIEW.md`](messages/REVIEW.md).
- "Nocturne" dark design: one dark theme throughout, gold primary actions, red only for emergencies, text contrast at least 4.5:1.

## Safety principles

- **The model never decides venom.** It only describes what it sees and ranks names. Venom status, medical risk and every safety message come from Serpent's own data and the deterministic, unit-tested policy in [`src/services/safetyService.ts`](src/services/safetyService.ts) (species → genus → family fallback).
- **Never false reassurance.** "Non-venomous" needs a high-confidence match to a curated species with no plausible venomous alternative. Descriptions can never be reassuring overall. Translations are tested for reassuring words ("harmless", "definitely", and their Thai and Burmese equivalents).
- **Unknown is treated as dangerous.** Unresolved, unassessed or low-confidence results are shown as potentially venomous or unknown, always with keep-your-distance advice.
- **No fake results.** Malformed model output or a provider failure gives "service unavailable", never a made-up answer.
- **Dangerous-miss rate = 0 in evals.** `npm run eval` fails if any venomous snake is shown as non-venomous or mildly venomous. Recorded runs so far: 3 runs over a small labelled set (7 photos, 4 species) with 0 dangerous misses, and 3 live "describe" cases (kraits, green pit vipers, cobras) that all found the expected genus. This is a small set, not a validation study.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) and React 19, TypeScript
- Tailwind CSS v4
- Prisma with Neon Postgres (optional)
- zod for validating every model response and API input
- vitest for unit and route tests
- Deployed on Vercel

## Setup

Requires Node.js (current LTS) and npm.

```bash
npm install            # also runs `prisma generate`
cp .env.example .env   # then fill in the variables below
npm run dev            # http://localhost:3000
```

### Environment variables

Never commit real values. `.env` is gitignored.

| Variable | What it does |
| --- | --- |
| `VISION_PROVIDER` | Which AI provider analyzes photos and descriptions: `openai` or `anthropic` (default `anthropic`). |
| `OPENAI_API_KEY` | OpenAI API key. Required when `VISION_PROVIDER=openai`. |
| `OPENAI_MODEL` | Optional OpenAI model override (any vision-capable model). |
| `ANTHROPIC_API_KEY` | Anthropic API key. Required when `VISION_PROVIDER=anthropic`. |
| `ANTHROPIC_MODEL` | Optional Claude model override. |
| `VERIFY_UNCERTAIN` | Optional. `false` turns off the second analysis for uncertain photos (on by default; that analysis roughly doubles cost for those photos). |
| `DATABASE_URL` | Optional Neon Postgres URL. Enables the anonymous analysis log, wrong-result reports and the GBIF cache (Near me and Snake season). |
| `ADMIN_TOKEN` | Optional. Enables `/admin/reports` to read wrong-result reports. Use a long random value. |
| `GBIF_INCLUDE_NC` | Optional. `true` also uses GBIF records licensed CC BY-NC 4.0. Only for a non-commercial deployment. |
| `SITE_URL` | Base URL for canonical and hreflang links, e.g. the production URL. Defaults to `http://localhost:3000`. |

With a database:

```bash
npm run db:push        # create the tables
npm run db:seed        # mirror the curated catalog into Postgres
```

### Tests and checks

```bash
npm run lint
npm test               # vitest unit tests (safety policy, describe, season, doctor card, i18n, History…)
npm run typecheck
npm run build
npm run test:routes    # renders every page in Thai and Burmese against a production build (run `npm run build` first)
npm run i18n:review    # regenerate messages/REVIEW.md after adding safety-critical text (a test fails if it's stale)
```

### Evals

```bash
npm run eval -- --country TH            # photos in eval/<Scientific_name>/*.jpg
npm run eval -- --limit 50 --dir eval
```

The eval sends every photo to the configured provider (this costs money), writes `eval/results-<timestamp>.json`, and exits with an error if there is any dangerous miss. The `eval/` folder is gitignored; add your own labelled photos.

Other scripts:

```bash
npm run coverage-report             # WHO medically important snakes missing from the curated catalog, per country
npm run import-taxonomy             # rebuild src/data/taxonomy.json from The Reptile Database archive in data-sources/ (gitignored)
```

## Data sources and licences

- **The Reptile Database** (Uetz, P. & Hošek, J., version 2026-06, [doi:10.48580/d37s](https://doi.org/10.48580/d37s)), distributed through ChecklistBank (dataset 1008, Catalogue of Life Data Package). Licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Filtered to living snake species and reshaped; Serpent's venom assessments are not part of the source.
- **GBIF** ([GBIF.org](https://www.gbif.org)) occurrence records for Near me and Snake season, used under the GBIF data user agreement. Each dataset keeps its own licence (CC0 1.0, CC BY 4.0 or CC BY-NC 4.0). By default only CC0 and CC BY records are used; CC BY-NC records are included only when `GBIF_INCLUDE_NC=true`, which is for non-commercial deployments only. Pages credit GBIF.org, show the query date and licences, and link to the exact query.
- **Photon** ([photon.komoot.io](https://photon.komoot.io)) for city search and reverse lookup, with place data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Searches wait for a pause in typing to keep the load on Photon's public server light.
- **WHO** list of medically important venomous snakes (TRS 1004) and the medical and government sources cited on each species and first-aid page (see `src/data/sources.ts`).

## Privacy

**Sent to the AI provider (OpenAI, or Anthropic if configured):**
- Photo identification: the resized photo(s), with EXIF/GPS removed on the device, and the selected country's name. Requests to OpenAI use `store: false`.
- Describe a snake: your answers and the chosen place name (no photo, no coordinates).

Serpent does not store photos.

**Sent to Serpent's server, but not to the AI provider:**
- Near me and Snake season: the city's coordinates, rounded to about 10 km, which the server uses to query GBIF.
- City search: the text you type, which is passed on to Photon.

**Stored on the server, only when `DATABASE_URL` is set:**
- An anonymous log row per photo analysis: status, species, confidence and country. No image, no IP address.
- Wrong-result reports you choose to send.
- Cached GBIF counts per rounded city point.

**Stays on your device only:**
- History, the doctor card, the "Save my results" setting, the remembered city and the latest result (sessionStorage, cleared when the tab closes).

**Cookies:** your language choice and selected country are kept in the browser and mirrored into cookies, so the server can pick the page language on your next visit. The server reads them for that and doesn't store them.

## Disclaimer

Serpent's identifications are AI estimates, not a diagnosis or medical advice. Snakes are hard to identify from photos or descriptions, and Serpent can be wrong. Treat every snake as potentially dangerous and keep your distance. If someone is bitten, call your local emergency number and get them to a hospital immediately. Medical staff should treat according to the patient's symptoms and local protocols.

Species records, emergency numbers and Thai and Burmese safety translations are drafts awaiting expert review.

## Author

Tim (Thaw Zin Htut)
