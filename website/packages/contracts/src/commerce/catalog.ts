/** Buyer-safe examples, not inventory, prices or confirmed manufacturing capacity. */
export type CatalogExample = {
  id: string;
  craftSkillId: string;
  name: string;
  specification: string;
  designRequirements: string;
  unit: 'PIECE';
  availability: 'ILLUSTRATIVE' | 'UNAVAILABLE';
  unavailableReason: string | null;
  image: { src: string; alt: string } | null;
  leadTime: { minDays: number; maxDays: number; assumption: string };
  provenance: 'SYNTHETIC';
};
export type BuyerCatalog = {
  version: 1;
  provenance: 'SYNTHETIC';
  categories: {
    id: string;
    name: string;
    specificationSummary: string;
    examples: CatalogExample[];
  }[];
};
