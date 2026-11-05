/**
 * A procurement document's stored content is an immutable internal record. It embeds the accepted
 * quote snapshot, which carries the seller's cost structure: per-category cost lines, fixed and
 * variable bases, the margin method and basis points, plus feasibility effort figures. None of that
 * is a buyer's business, and the buyer must never receive it through an invoice download.
 *
 * Documents are projected rather than filtered. Every field the buyer may see is listed here; a
 * field added to the stored record later is invisible until it is deliberately allowed, so a future
 * nested object cannot leak by default through unrestricted serialization.
 */

/** Keys that are buyer-facing on any document kind. Contractual and priced, never costed. */
const BUYER_FIELDS = [
  'number',
  'kind',
  'version',
  'status',
  'createdAt',
  'currency',
  'totalTnd',
  'taxTnd',
  'netTnd',
  'subtotalTnd',
  'taxBasisPoints',
  'paymentTerms',
  'deliveryConditions',
  'delivered',
  'orderStatus',
  'provenance',
  'legalStatus',
  'quoteVersion',
  'quoteId',
  'acceptanceId',
  'revisionId',
  'rfqId',
  'specification',
  'quantity',
  'unit',
  'dimensions',
  'materials',
] as const;

/**
 * Keys that must never reach a buyer, whatever document kind is being projected. This list is the
 * second line of defence: the allowlist already excludes them, and this check makes a regression
 * loud instead of silent if someone widens the allowlist carelessly.
 */
const FORBIDDEN_KEYS = new Set([
  'internal',
  'costEstimate',
  'costEstimateId',
  'costs',
  'marginMethod',
  'marginBasisPoints',
  'lines',
  'rateTnd',
  'basis',
  'unitCost',
  'feasibility',
  'feasibilityAssessment',
  'feasibilityId',
  'effortMin',
  'effortMax',
  'knownRemaining',
  'shortage',
  'constraints',
  'explanation',
  'reservation',
  'producerShare',
  'compensation',
  'payables',
  'payouts',
  'costedQuote',
  'netQuotationRevenueMillimes',
]);

export type BuyerDocument = Record<string, unknown> & {
  provenance: 'SYNTHETIC';
  legalStatus: 'DEMO_ONLY_NOT_A_TAX_OR_LEGAL_DOCUMENT';
};

/**
 * Returns only explicitly allowlisted buyer-facing fields. `specification` and material/dimension
 * data are unwrapped from their nested objects because the quote snapshot nests them a level down.
 */
export function projectBuyerDocument(
  content: unknown,
  header: {
    number: number;
    kind: string;
    version: number;
    status: string;
    createdAt: Date | string;
  },
): BuyerDocument {
  if (!content || typeof content !== 'object' || Array.isArray(content))
    throw new Error('DocumentContentUnavailable');

  const source = content as Record<string, unknown>;
  const flat: Record<string, unknown> = { ...(header as Record<string, unknown>) };

  for (const key of BUYER_FIELDS) {
    if (key in source && source[key] !== undefined) flat[key] = source[key];
  }
  // The quote snapshot places specification fields one level down under `specification`.
  const spec = source.specification;
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    const s = spec as Record<string, unknown>;
    for (const key of ['description', 'dimensions', 'materials', 'unit'] as const) {
      if (s[key] !== undefined && flat[key] === undefined) flat[key] = s[key];
    }
  }

  const projected = assertBuyerSafe(flat);
  return {
    ...(projected as Record<string, unknown>),
    provenance: 'SYNTHETIC',
    legalStatus: 'DEMO_ONLY_NOT_A_TAX_OR_LEGAL_DOCUMENT',
  } as BuyerDocument;
}

/** Depth-limited scan. Throws rather than letting an unexpected nested field escape. */
function assertBuyerSafe(value: unknown, path = 'document', depth = 0): unknown {
  if (depth > 6) throw new Error(`DocumentTooDeep:${path}`);
  if (Array.isArray(value))
    return value.map((item, i) => assertBuyerSafe(item, `${path}[${i}]`, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) throw new Error(`BuyerDocumentLeak:${path}.${key}`);
      out[key] = assertBuyerSafe(inner, `${path}.${key}`, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * The quote snapshot is projected at every buyer-facing read, not only at download time. Stripping
 * a single conventional `internal` key was not sufficient: cost lines, the margin basis and the
 * feasibility projection sit beside it. Only buyer-facing commercial terms survive.
 */
const QUOTE_BUYER_FIELDS = [
  'quoteId',
  'quoteVersion',
  'revisionId',
  'version',
  'totalTnd',
  'taxTnd',
  'taxStatus',
  'taxPolicyReference',
  'netTnd',
  'subtotalTnd',
  'taxBasisPoints',
  'currency',
  'paymentTerms',
  'deliveryConditions',
  'expiresAt',
  'buyer',
  'freight',
  'packaging',
  'leadTimeDays',
  'validityDays',
] as const;

export function projectBuyerSnapshot(snapshot: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of QUOTE_BUYER_FIELDS) {
    if (key in snapshot && snapshot[key] !== undefined) out[key] = snapshot[key];
  }
  // Specification fields describe the goods the buyer is purchasing and remain buyer-facing.
  const spec = snapshot.specification;
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    out.specification = spec;
  } else {
    for (const key of ['description', 'dimensions', 'materials', 'unit', 'quantity'] as const) {
      if (snapshot[key] !== undefined) out[key] = snapshot[key];
    }
  }
  return assertBuyerSafe(out) as Record<string, unknown>;
}

/**
 * Internal staff keep the full immutable record: costing, margin basis and feasibility stay
 * available to the roles that authorise them. This is the same object the document was issued with.
 */
export function projectInternalDocument(content: unknown) {
  return content;
}
