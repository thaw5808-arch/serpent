export interface WhoListing {
  /** As written in the source; "Genus spp." means the whole genus. */
  scientificName: string;
  genus: string;
  family: string;
  /** True when the source omitted the family label and it was taken from the same genus elsewhere in the source. */
  familyInferred?: boolean;
  category: 1 | 2;
  note: string | null;
}

export interface WhoReferenceCountry {
  pages: number[];
  caveat?: string;
  listings: WhoListing[];
}
