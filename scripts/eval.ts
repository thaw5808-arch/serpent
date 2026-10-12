/**
 * Evaluation harness: runs labelled photos through the real pipeline (the
 * configured vision provider + the safety policy) and reports accuracy and,
 * above all, the DANGEROUS-MISS rate: venomous snakes shown as non-venomous
 * or mildly venomous. That rate must be 0; the script exits 1 otherwise.
 *
 *   eval/<scientific_name>/*.jpg     e.g. eval/Bungarus_candidus/01.jpg  (gitignored)
 *   npm run eval -- [--country TH] [--limit 50] [--dir eval]
 *
 * Every photo is sent to the configured provider (VISION_PROVIDER), which costs
 * money. Results are written to eval/results-<timestamp>.json.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getCountry } from "@/data/countries";
import { validateImageBytes } from "@/lib/imageValidation";
import { createVisionProvider } from "@/services/providers";
import { SnakeIdentificationService } from "@/services/snakeIdentification";
import { getGroup, resolveTaxon, type Taxon } from "@/services/taxonomy";
import { getSpecies, isMedicallySignificant } from "@/services/venomDatabase";
import type { CandidateView, IdentificationResult } from "@/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dir = arg("dir") ?? "eval";
const country = arg("country") ?? null;
const limit = Number(arg("limit") ?? Infinity);
if (country && !getCountry(country)) throw new Error(`Unknown country code: ${country}`);

type Truth = "venomous" | "harmless" | "unknown";

function truthOf(t: Taxon): Truth {
  if (t.kind === "group") return "venomous";
  // An uncurated species counts as venomous truth when its genus/family is venomous; otherwise our data can't say.
  if (t.kind === "taxonomy") return t.group ? "venomous" : "unknown";
  if (t.kind === "species") return isMedicallySignificant(t.species) ? "venomous" : "harmless";
  return "unknown";
}

/** The genus of what the result leads with (top species, else first possibility). */
function shownGenus(c: CandidateView | null): string | null {
  if (!c) return null;
  const s = getSpecies(c.speciesId);
  if (s) return s.genus;
  if (c.taxonomySlug && c.scientificName) return c.scientificName.split(" ")[0];
  const g = getGroup(c.groupId);
  if (g?.rank === "genus") return g.name;
  return c.namedAs?.split(" ")[0] ?? null;
}

function shownLabel(r: IdentificationResult): string {
  const c = r.top ?? r.closestMatch ?? r.alternatives[0];
  return c ? (c.scientificName ?? c.label) : r.status;
}

async function main() {
  const folders = (existsSync(dir) ? readdirSync(dir) : []).filter((f) => statSync(join(dir, f)).isDirectory());
  const photos = folders.flatMap((folder) =>
    readdirSync(join(dir, folder))
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .map((f) => ({ folder, path: join(dir, folder, f) })),
  );
  if (photos.length === 0) {
    console.log(`No photos found. Put labelled photos in ${dir}/<Genus_species>/*.jpg`);
    return;
  }

  const provider = createVisionProvider();
  const service = new SnakeIdentificationService(provider);
  console.log(`Engine: ${service.engine.provider} / ${service.engine.model}; country: ${country ?? "none"}; photos: ${Math.min(photos.length, limit)}\n`);

  const rows: {
    file: string;
    truthName: string;
    truth: Truth;
    status: string;
    displayVenomStatus: string;
    shown: string;
    speciesCorrect: boolean | null;
  secondOpinion: boolean;
  agreed: boolean | null;
    genusCorrect: boolean;
    dangerousMiss: boolean;
  }[] = [];

  for (const { folder, path } of photos.slice(0, limit)) {
    const truthName = folder.replace(/_/g, " ").trim();
    const truthTaxon = resolveTaxon({ scientificName: truthName });
    const truth = truthOf(truthTaxon);
    const truthSpecies =
      truthTaxon.kind === "species" ? truthTaxon.species.scientificName : truthTaxon.kind === "taxonomy" ? truthTaxon.record.name : null;

    const valid = validateImageBytes(new Uint8Array(readFileSync(path)));
    if (!valid.ok) {
      console.log(`SKIP ${path}: ${valid.error}`);
      continue;
    }
    const result = await service.identify(
      [{ imageBase64: Buffer.from(valid.bytes).toString("base64"), mediaType: valid.mime }],
      country,
      { id: crypto.randomUUID(), analyzedAt: new Date().toISOString() },
    );

    const lead = result.top ?? result.closestMatch ?? result.alternatives[0] ?? null;
    const dangerousMiss = truth === "venomous" && (result.displayVenomStatus === "non_venomous" || result.displayVenomStatus === "mildly_venomous");
    const row = {
      file: path,
      truthName,
      truth,
      status: result.status,
      displayVenomStatus: result.displayVenomStatus,
      shown: shownLabel(result),
      // Correct when the named closest match is the true species (curated or recognised taxonomy species).
    speciesCorrect: truthSpecies ? (lead?.scientificName ?? null) === truthSpecies : null,
    secondOpinion: result.analysis?.secondOpinion ?? false,
    agreed: result.analysis?.agreed ?? null,
      genusCorrect: shownGenus(lead)?.toLowerCase() === truthName.split(" ")[0].toLowerCase(),
      dangerousMiss,
    };
    rows.push(row);
    console.log(
      `${dangerousMiss ? "DANGEROUS MISS" : "ok"}  ${truthName} → ${row.shown} [${row.status}, ${row.displayVenomStatus}]  ${path}`,
    );
  }

  const answered = rows.filter((r) => r.status !== "service_unavailable");
  const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}% (${n}/${d})` : "n/a");
  const speciesRows = answered.filter((r) => r.speciesCorrect !== null);
  const venomous = answered.filter((r) => r.truth === "venomous");
  const harmless = answered.filter((r) => r.truth === "harmless");
  const misses = venomous.filter((r) => r.dangerousMiss);

  const confusion = new Map<string, number>();
  for (const r of answered) {
    if (r.shown.toLowerCase().startsWith(r.truthName.toLowerCase())) continue;
    const k = `${r.truthName} → ${r.shown}`;
    confusion.set(k, (confusion.get(k) ?? 0) + 1);
  }

  console.log(`
Photos: ${rows.length} (service unavailable: ${rows.length - answered.length})
Species accuracy (closest match named):   ${pct(speciesRows.filter((r) => r.speciesCorrect).length, speciesRows.length)}
Genus accuracy of the leading result:      ${pct(answered.filter((r) => r.genusCorrect).length, answered.length)}
Truth not resolvable to our data:          ${answered.filter((r) => r.truth === "unknown").length} (excluded from the venom metrics)
Harmless snakes shown as non-venomous:     ${pct(harmless.filter((r) => r.displayVenomStatus === "non_venomous").length, harmless.length)}
Second opinions used:                      ${rows.filter((r) => r.secondOpinion).length} (agreed: ${rows.filter((r) => r.agreed).length})

DANGEROUS-MISS RATE (venomous shown as non-venomous or mildly venomous): ${pct(misses.length, venomous.length)}
${misses.map((m) => `  ${m.file}: ${m.truthName} shown as ${m.shown} (${m.displayVenomStatus})`).join("\n")}
Confusion pairs (truth → shown):
${[...confusion.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${n}× ${k}`).join("\n") || "  none"}`);

  if (provider.usage) {
    const u = provider.usage;
    console.log(
      `\nAPI usage: ${u.calls} calls, ${u.inputTokens} input + ${u.outputTokens} output tokens` +
        ` (${(u.inputTokens / Math.max(rows.length, 1)).toFixed(0)} in / ${(u.outputTokens / Math.max(rows.length, 1)).toFixed(0)} out per photo)`,
    );
  }

  const out = join(dir, `results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(out, JSON.stringify({ engine: service.engine, country, rows }, null, 2));
  console.log(`\nWrote ${out}`);
  process.exit(misses.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
