# Serpent — Snake Identification & Venom Safety

AI-assisted snake identification that puts safety and honest uncertainty ahead of a confident-looking answer.

## Run locally

```bash
npm install            # also runs `prisma generate`
cp .env.example .env   # add ANTHROPIC_API_KEY (DATABASE_URL optional)
npm run dev
```

Optional database (anonymous analysis log + mirrored knowledge base):

```bash
npm run db:push
npm run db:seed
```

## Scripts

`dev` · `build` · `test` (vitest) · `typecheck` · `lint` · `db:push` · `db:seed`

## Architecture

```
photo → on-device resize (strips EXIF/GPS) → POST /api/identify
      → magic-byte validation, size limit, rate limit
      → SnakeIdentificationService
          → VisionProvider (ClaudeVisionProvider; swappable)
              returns image quality + ranked catalog ids only (forced tool-use JSON)
          → zod validation (malformed → service_unavailable, never a fake result)
          → safetyService.decide(): KB mapping, geographic down-weighting,
            confidence band, worst-plausible-case venom status, look-alike warning
      → result kept in sessionStorage; anonymous log row (no image)
```

The model never writes venom, risk or safety text. That all comes from `src/data` and the deterministic policy in `src/services/safetyService.ts`, which is unit-tested.

| Path | What |
|---|---|
| `src/data/species/catalog.ts` | Curated species KB (source of truth, reviewed in git) |
| `src/data/sources.ts` | Source registry |
| `src/data/countries.ts` | Countries, regions, emergency numbers |
| `src/data/firstAid.ts` | First-aid guidance + regional additions |
| `src/services/snakeIdentification.ts` | Pipeline orchestrator |
| `src/services/providers/` | Vision provider interface + Claude implementation |
| `src/services/safetyService.ts` | Safety policy (thresholds in `POLICY`) |
| `tests/` | Safety, validation, rate-limit and pipeline tests |

## Before a public launch

- **Expert review of all data.** Every species record is `reviewStatus: "draft"`; every source and emergency number has `lastVerified: null`. A qualified herpetologist/toxinologist must verify them. Potency and antivenom fields are deliberately empty until sourced.
- **Shared rate limiter.** `src/lib/rateLimit.ts` is in-memory (per serverless instance). Swap for Upstash Redis or similar.
- **Evaluation set.** Run the identifier over a labelled photo set per species (clear, blurry, partial, look-alike pairs) and tune `POLICY` thresholds from the results.
- **Species photos.** Detail pages have no photography yet; add licensed images with credits.
