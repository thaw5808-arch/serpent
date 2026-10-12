import type { Messages } from "@/i18n/messages";

/**
 * Snakebite first aid — conservative, broadly agreed guidance (WHO and
 * national medical authorities). The text lives in messages/*.json under
 * firstAid.*; region-specific additions are listed in REGIONAL_FIRST_AID.
 * Medical reviewer sign-off required before launch, in every language
 * (see messages/REVIEW.md).
 */
export const FIRST_AID_DO: (keyof Messages["firstAid"]["do"])[] = ["moveAway", "call", "calm", "limb", "rings", "time", "eyes"];

export const FIRST_AID_DONT: (keyof Messages["firstAid"]["dont"])[] = ["cut", "suck", "tourniquet", "ice", "remedies", "catch", "wait"];

export const REGIONAL_FIRST_AID: Record<string, { key: keyof Messages["firstAid"]["regional"]; sourceId: string }[]> = {
  AU: [
    { key: "auPressure", sourceId: "anzcor-948" },
    { key: "auNoWash", sourceId: "anzcor-948" },
  ],
};

export const FIRST_AID_SOURCE_IDS = ["who-factsheet", "who-searo-2016", "nhs-snake-bites"];
