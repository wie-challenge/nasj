import type { BuyerCatalog, CatalogExample } from '@nasj/contracts';

const assumption =
  'Fictional planning range for 10 pieces after specification and material review. Capacity, shipping and delivery date must be reassessed; no stock or supply is confirmed.';
// Versioned, bounded fixtures only. E20 owns approved live manufacturing SKUs.
const examples: readonly CatalogExample[] = [
  {
    id: 'woven-table-runner-v1',
    craftSkillId: 'weaving',
    name: 'Woven table runner',
    specification: 'Fictional cotton table runner, 140 × 35 cm, plain weave, hemmed edges.',
    designRequirements:
      'Confirm dimensions, yarn, colors and finish with the operator before quoting.',
    unit: 'PIECE',
    availability: 'ILLUSTRATIVE',
    unavailableReason: null,
    image: {
      src: '/catalog/woven-runner.svg',
      alt: 'Illustration of a striped woven table runner; synthetic example',
    },
    leadTime: { minDays: 14, maxDays: 28, assumption },
    provenance: 'SYNTHETIC',
  },
  {
    id: 'embroidered-panel-v1',
    craftSkillId: 'embroidery',
    name: 'Embroidered decorative panel',
    specification: 'Fictional linen decorative panel, 30 × 30 cm, stitched geometric border.',
    designRequirements: 'Confirm motif, thread colors, backing and stitch density before quoting.',
    unit: 'PIECE',
    availability: 'ILLUSTRATIVE',
    unavailableReason: null,
    image: null,
    leadTime: { minDays: 21, maxDays: 35, assumption },
    provenance: 'SYNTHETIC',
  },
  {
    id: 'woven-basket-v1',
    craftSkillId: 'basketry',
    name: 'Woven storage basket',
    specification:
      'Fictional plant-fiber basket, 25 cm diameter, unlined, decorative household use.',
    designRequirements:
      'Confirm fiber, dimensions and finish. No food-contact certification is asserted.',
    unit: 'PIECE',
    availability: 'ILLUSTRATIVE',
    unavailableReason: null,
    image: {
      src: '/catalog/woven-basket.svg',
      alt: 'Illustration of a woven storage basket; synthetic example',
    },
    leadTime: { minDays: 14, maxDays: 30, assumption },
    provenance: 'SYNTHETIC',
  },
  {
    id: 'decorative-vase-v1',
    craftSkillId: 'pottery',
    name: 'Decorative ceramic vase',
    specification:
      'Fictional ceramic vase, 20 cm tall, decorative use only; glaze and firing unverified.',
    designRequirements:
      'Material, glaze, firing and breakage requirements need a separately reviewed sample.',
    unit: 'PIECE',
    availability: 'UNAVAILABLE',
    unavailableReason:
      'No reviewed sample or planning assumptions support an RFQ from this example yet.',
    image: null,
    leadTime: { minDays: 28, maxDays: 42, assumption },
    provenance: 'SYNTHETIC',
  },
];

export function findCatalogExample(id: string) {
  return examples.find((example) => example.id === id);
}

export function projectBuyerCatalog(
  crafts: readonly { id: string; name: string; description: string }[],
): BuyerCatalog {
  return {
    version: 1,
    provenance: 'SYNTHETIC',
    categories: crafts.map((craft) => ({
      id: craft.id,
      name: craft.name,
      specificationSummary: craft.description,
      examples: examples.filter((example) => example.craftSkillId === craft.id),
    })),
  };
}
