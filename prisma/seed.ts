// Mirrors the curated TypeScript knowledge base into Postgres. Idempotent.
import { PrismaClient } from "@prisma/client";
import { SPECIES } from "../src/data/species/catalog";
import { SOURCES, reptileDatabaseSource } from "../src/data/sources";

const prisma = new PrismaClient();

async function main() {
  const allSources = [...SOURCES, ...SPECIES.map((s) => reptileDatabaseSource(s.scientificName))];
  for (const s of allSources) {
    const data = {
      title: s.title,
      publisher: s.publisher,
      url: s.url,
      sourceType: s.sourceType,
      publicationYear: s.year,
      verifiedAt: s.lastVerified ? new Date(s.lastVerified) : null,
    };
    await prisma.source.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }

  for (const s of SPECIES) {
    const data = {
      commonName: s.commonName,
      otherNames: s.otherNames ?? [],
      scientificName: s.scientificName,
      family: s.family,
      genus: s.genus,
      description: s.appearance,
      keyFeatures: s.keyFeatures,
      distribution: s.distribution,
      regions: s.regions,
      habitat: s.habitat,
      venomStatus: s.venomStatus,
      riskLevel: s.medicalRisk,
      reviewStatus: s.reviewStatus,
      lastVerified: s.lastVerified ? new Date(s.lastVerified) : null,
    };
    await prisma.species.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });

    const venom = {
      venomTypes: s.venomTypes,
      medicalEffects: s.medicalEffects,
      riskLevel: s.medicalRisk,
      riskRationale: s.riskRationale,
      potencyValue: s.potency?.value ?? null,
      potencyMethod: s.potency?.method ?? null,
      potencySourceId: s.potency?.sourceId ?? null,
      antivenomInformation: s.antivenom?.summary ?? null,
    };
    await prisma.venomProfile.upsert({ where: { speciesId: s.id }, create: { speciesId: s.id, ...venom }, update: venom });

    const sourceIds = [reptileDatabaseSource(s.scientificName).id, ...s.sourceIds];
    await prisma.speciesSource.deleteMany({ where: { speciesId: s.id } });
    await prisma.speciesSource.createMany({ data: sourceIds.map((sourceId) => ({ speciesId: s.id, sourceId })) });
  }

  // Similar-species links after all species exist.
  await prisma.similarSpecies.deleteMany();
  await prisma.similarSpecies.createMany({
    data: SPECIES.flatMap((s) => s.similarSpeciesIds.map((toId) => ({ fromId: s.id, toId }))),
    skipDuplicates: true,
  });

  console.log(`Seeded ${SPECIES.length} species and ${allSources.length} sources.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
