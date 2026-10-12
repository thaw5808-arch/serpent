import { NextResponse } from "next/server";
import { searchTaxonomy } from "@/services/taxonomyIndex";
import { listSpecies } from "@/services/venomDatabase";

/**
 * Searches every recognised snake species server-side, so the full taxonomy
 * never ships to the browser. Curated species are excluded here because the
 * species browser already lists them first.
 */
const curatedNames = new Set(listSpecies().map((s) => s.scientificName.toLowerCase()));

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  const hits = searchTaxonomy(q, 30, curatedNames);
  return NextResponse.json({ hits }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
