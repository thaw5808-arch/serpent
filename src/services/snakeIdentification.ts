import "server-only";
import { getCountry, type Country } from "@/data/countries";
import { listSpecies, getSpecies, getSourcesFor } from "./venomDatabase";
import { mergeAnalyses, needsSecondOpinion } from "./secondOpinion";
import { candidatesForCountry } from "./countryCandidates";
import { calculateBand, decide, nonIdentification, rankCandidates, type Decision } from "./safetyService";
import {
  ProviderUnavailableError,
  RawAnalysisSchema,
  type CatalogEntry,
  type RawAnalysis,
  MAX_PHOTOS,
  type VisionImage,
  type VisionProvider,
} from "./providers/types";
import type { IdentificationResult } from "@/types";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/** Masks anything shaped like an API key (some 401 messages echo a partial key). */
const redact = (text: string) => text.replace(/\bsk-[\w*-]+/g, "[redacted]");

/**
 * Summarizes a provider error for logs. Only picks safe fields: never the
 * request (API key, image data) or the raw error object.
 */
function describeCause(cause: unknown) {
  if (cause instanceof Anthropic.APIError) {
    const body = cause.error as { error?: { type?: string; message?: string } } | undefined;
    return {
      status: cause.status,
      type: body?.error?.type ?? cause.name,
      message: redact(body?.error?.message ?? cause.message),
      requestId: cause.requestID,
    };
  }
  if (cause instanceof OpenAI.APIError) {
    return {
      status: cause.status,
      type: cause.type ?? cause.name,
      code: cause.code,
      message: redact(cause.message),
      requestId: cause.requestID,
    };
  }
  if (cause instanceof Error) return { name: cause.name, message: redact(cause.message) };
  return cause === undefined ? undefined : { cause: redact(String(cause)) };
}

/**
 * Orchestrates the identification pipeline. The UI and API route talk to this
 * class only; the vision provider is injected so it can be swapped
 * (Claude or OpenAI today, a dedicated classifier later) without touching callers.
 *
 *   image → provider.analyze (quality + candidates)
 *         → schema validation (reject anything malformed; never fake a result)
 *         → knowledge-base mapping + geographic weighting
 *         → confidence band → venom lookup → deterministic safety assessment
 */
export class SnakeIdentificationService {
  constructor(private readonly provider: VisionProvider) {}

  get engine() {
    return { provider: this.provider.name, model: this.provider.model };
  }

  /** Builds the catalog the model may choose from, ordered so local species come first. */
  /**
   * With a country: the curated catalog plus recognised species likely in that
   * country (capped). Without one: the curated catalog only; the model can still
   * name any species freely.
   */
  catalogFor(country: Country | null): CatalogEntry[] {
    if (country) return candidatesForCountry(country.code);
    return listSpecies().map((s) => ({
      id: s.id,
      commonName: s.commonName,
      scientificName: s.scientificName,
      genus: s.genus,
      family: s.family,
      keyFeatures: s.keyFeatures,
      distribution: s.distribution,
      reviewed: true,
    }));
  }

  /** Step 1: send the photos to the provider and validate the structured response. */
  async analyzeImage(images: VisionImage[], country: Country | null): Promise<RawAnalysis> {
    if (images.length < 1 || images.length > MAX_PHOTOS) throw new Error(`Expected 1-${MAX_PHOTOS} photos`);
    const raw = await this.provider.analyze({
      images,
      catalog: this.catalogFor(country),
      countryName: country?.name ?? null,
    });
    const parsed = RawAnalysisSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ProviderUnavailableError("Provider returned an invalid analysis", parsed.error);
    }
    return parsed.data;
  }

  /** Step 2: candidate ranking against the knowledge base, with geography applied. */
  identifySpecies(raw: RawAnalysis, country: Country | null) {
    return rankCandidates(raw, country);
  }

  /** Step 3: confidence band from the ranked candidates. */
  calculateConfidence(raw: RawAnalysis, country: Country | null) {
    const ranked = rankCandidates(raw, country);
    return calculateBand(ranked[0]?.p ?? 0, ranked[1]?.p ?? 0, raw.overall_confidence);
  }

  retrieveSpeciesData(id: string) {
    return getSpecies(id);
  }

  retrieveVenomData(id: string) {
    const s = getSpecies(id);
    if (!s) return null;
    return {
      venomStatus: s.venomStatus,
      venomTypes: s.venomTypes,
      medicalRisk: s.medicalRisk,
      potency: s.potency,
      antivenom: s.antivenom,
      sources: getSourcesFor(s),
    };
  }

  /** Step 4: the deterministic safety decision. */
  generateSafetyAssessment(raw: RawAnalysis, country: Country | null): Decision {
    return decide(raw, country);
  }

  /**
   * Full pipeline. Never throws for provider problems: returns service_unavailable instead.
   * Uncertain results get at most one more independent analysis (VERIFY_UNCERTAIN, default on);
   * if that extra call fails, the first analysis is used.
   */
  async identify(
    images: VisionImage[],
    countryCode: string | null,
    meta: { id: string; analyzedAt: string },
    opts: { verifyUncertain?: boolean } = {},
  ): Promise<IdentificationResult> {
    const country = getCountry(countryCode);
    const verify = opts.verifyUncertain ?? process.env.VERIFY_UNCERTAIN !== "false";
    try {
      let raw = await this.analyzeImage(images, country);
      let analysis: NonNullable<IdentificationResult["analysis"]> = { photos: images.length, secondOpinion: false, agreed: null };
      if (verify && needsSecondOpinion(raw, country)) {
        try {
          const second = await this.analyzeImage(images, country);
          const { merged, agreed } = mergeAnalyses(raw, second);
          raw = merged;
          analysis = { ...analysis, secondOpinion: true, agreed };
        } catch (err) {
          console.error("[identify] second opinion failed; using the first analysis:", (err as Error).message);
        }
      }
      return { ...meta, engine: this.engine, ...this.generateSafetyAssessment(raw, country), analysis };
    } catch (err) {
      if (err instanceof ProviderUnavailableError) {
        console.error("[identify] provider unavailable:", err.message, describeCause(err.cause));
        return {
          ...meta,
          engine: this.engine,
          ...nonIdentification("service_unavailable"),
          country: country?.code ?? null,
        };
      }
      throw err;
    }
  }
}
