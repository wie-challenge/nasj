import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rankCandidates,
  validateAllocation,
  suggestAllocation,
  releasableQuantity,
  suggestPricing,
  simulateDelivery,
  PLANNING_POLICY_VERSION,
  rankingWeights,
  type RankingCandidate,
} from '@nasj/contracts';

const candidate = (over: Partial<RankingCandidate> = {}): RankingCandidate => ({
  artisanProfileId: 'profile_a',
  displayName: 'Group A',
  associationName: null,
  decision: 'ELIGIBLE',
  knownRemaining: '180.00',
  unitType: 'PIECES',
  periodFrom: '2026-11-01T00:00:00.000+01:00',
  periodTo: '2026-11-30T00:00:00.000+01:00',
  reasons: [{ code: 'CRAFT_MATCH', detail: 'The required craft matches an active skill.' }],
  unknown: [],
  ...over,
});

test('ranking separates recommended, review and excluded with explanations', () => {
  const ranked = rankCandidates({
    requiredQuantity: 500,
    unitCompatible: true,
    candidates: [
      candidate({ artisanProfileId: 'b', knownRemaining: '120.00' }),
      candidate({ artisanProfileId: 'a', knownRemaining: '200.00' }),
      candidate({
        artisanProfileId: 'unknown',
        decision: 'NEEDS_REVIEW',
        knownRemaining: null,
        unknown: ['CAPACITY_UNKNOWN'],
        reasons: [{ code: 'CAPACITY_UNKNOWN', detail: 'Capacity is unknown.' }],
      }),
      candidate({
        artisanProfileId: 'blocked',
        decision: 'INELIGIBLE',
        knownRemaining: '0.00',
        reasons: [{ code: 'CRAFT_MISMATCH', detail: 'Craft does not match.' }],
      }),
    ],
  });
  assert.equal(ranked.policyVersion, PLANNING_POLICY_VERSION);
  assert.deepEqual(
    ranked.candidates.map((row) => [row.artisanProfileId, row.tier]),
    [
      ['a', 'RECOMMENDED'],
      ['b', 'RECOMMENDED'],
      ['unknown', 'REVIEW'],
      ['blocked', 'EXCLUDED'],
    ],
  );
  const unknown = ranked.candidates.find((row) => row.artisanProfileId === 'unknown');
  assert.equal(unknown?.allocatablePieces, null);
  assert.ok(unknown?.explanation.includes('Capacity is unknown.'));
  const blocked = ranked.candidates.find((row) => row.artisanProfileId === 'blocked');
  assert.deepEqual(blocked?.blocks, ['CRAFT_MISMATCH']);
});

test('unknown capacity is never ranked as zero and hours capacity cannot become pieces', () => {
  const ranked = rankCandidates({
    requiredQuantity: 100,
    unitCompatible: true,
    candidates: [
      candidate({ artisanProfileId: 'hours', unitType: 'HOURS', knownRemaining: '40.00' }),
      candidate({
        artisanProfileId: 'unknown',
        knownRemaining: null,
        unknown: ['CAPACITY_UNKNOWN'],
      }),
      candidate({ artisanProfileId: 'zero', knownRemaining: '0.00' }),
    ],
  });
  const byId = Object.fromEntries(ranked.candidates.map((row) => [row.artisanProfileId, row]));
  assert.equal(byId.hours.tier, 'REVIEW');
  assert.equal(byId.hours.allocatablePieces, null);
  assert.equal(byId.unknown.tier, 'REVIEW');
  assert.equal(byId.unknown.allocatablePieces, null);
  assert.equal(byId.zero.tier, 'EXCLUDED');
  assert.equal(byId.zero.allocatablePieces, 0);
});

test('allocation reconciles allocated and unallocated quantities without over-allocation', () => {
  const valid = validateAllocation({
    requiredQuantity: 500,
    lines: [
      {
        artisanProfileId: 'a',
        quantity: 200,
        availablePieces: 200,
        unitType: 'PIECES',
        needsReview: false,
      },
      {
        artisanProfileId: 'b',
        quantity: 180,
        availablePieces: 250,
        unitType: 'PIECES',
        needsReview: false,
      },
      {
        artisanProfileId: 'c',
        quantity: 120,
        availablePieces: 120,
        unitType: 'PIECES',
        needsReview: false,
      },
    ],
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.allocated, 500);
  assert.equal(valid.unallocated, 0);
  const short = validateAllocation({
    requiredQuantity: 500,
    lines: [
      {
        artisanProfileId: 'a',
        quantity: 200,
        availablePieces: 200,
        unitType: 'PIECES',
        needsReview: false,
      },
    ],
  });
  assert.equal(short.unallocated, 300);
  assert.equal(short.valid, true, 'a plan may leave work unallocated');
});

test('allocation rejects oversubscription, duplicates, units and over-allocation', () => {
  const over = validateAllocation({
    requiredQuantity: 500,
    lines: [
      {
        artisanProfileId: 'a',
        quantity: 400,
        availablePieces: 200,
        unitType: 'PIECES',
        needsReview: false,
      },
      {
        artisanProfileId: 'b',
        quantity: 200,
        availablePieces: 500,
        unitType: 'PIECES',
        needsReview: false,
      },
    ],
  });
  assert.equal(over.overAllocated, true);
  assert.ok(over.violations.includes('CAPACITY_EXCEEDED'));
  assert.ok(over.violations.includes('OVER_ALLOCATED'));
  const duplicate = validateAllocation({
    requiredQuantity: 100,
    lines: [
      {
        artisanProfileId: 'a',
        quantity: 50,
        availablePieces: 100,
        unitType: 'PIECES',
        needsReview: false,
      },
      {
        artisanProfileId: 'a',
        quantity: 50,
        availablePieces: 100,
        unitType: 'PIECES',
        needsReview: false,
      },
    ],
  });
  assert.ok(duplicate.violations.includes('DUPLICATE_GROUP'));
  const hours = validateAllocation({
    requiredQuantity: 100,
    lines: [
      {
        artisanProfileId: 'a',
        quantity: 50,
        availablePieces: 100,
        unitType: 'HOURS',
        needsReview: false,
      },
    ],
  });
  assert.ok(hours.violations.includes('UNIT_INCOMPATIBLE'));
  const unknown = validateAllocation({
    requiredQuantity: 100,
    lines: [
      {
        artisanProfileId: 'a',
        quantity: 50,
        availablePieces: null,
        unitType: 'PIECES',
        needsReview: true,
      },
    ],
  });
  assert.ok(unknown.violations.includes('CAPACITY_UNKNOWN'));
  assert.ok(unknown.violations.includes('ELIGIBILITY_INCOMPLETE'));
  const negative = validateAllocation({
    requiredQuantity: 100,
    lines: [
      {
        artisanProfileId: 'a',
        quantity: -5,
        availablePieces: 100,
        unitType: 'PIECES',
        needsReview: false,
      },
    ],
  });
  assert.ok(negative.violations.includes('QUANTITY_INVALID'));
});

test('suggestion fills in rank order, respects capacity and reports the remainder', () => {
  const ranked = rankCandidates({
    requiredQuantity: 500,
    unitCompatible: true,
    candidates: [
      candidate({ artisanProfileId: 'a', knownRemaining: '200.00' }),
      candidate({ artisanProfileId: 'b', knownRemaining: '180.00' }),
      candidate({ artisanProfileId: 'c', knownRemaining: '60.00' }),
    ],
  });
  const suggestion = suggestAllocation({ requiredQuantity: 500, candidates: ranked.candidates });
  assert.deepEqual(
    suggestion.lines.map((line) => [line.artisanProfileId, line.quantity]),
    [
      ['a', 200],
      ['b', 180],
      ['c', 60],
    ],
  );
  assert.equal(suggestion.unallocated, 60);
  assert.ok(suggestion.notes.some((note) => note.includes('remainder')));
});

test('reallocation releases offered and expired quantity but never accepted work', () => {
  assert.equal(releasableQuantity({ quantity: 100, state: 'OFFERED', accepted: false }), 100);
  assert.equal(releasableQuantity({ quantity: 100, state: 'DECLINED', accepted: false }), 100);
  assert.equal(releasableQuantity({ quantity: 100, state: 'EXPIRED', accepted: false }), 100);
  assert.equal(releasableQuantity({ quantity: 100, state: 'ACCEPTED', accepted: true }), 0);
  assert.equal(releasableQuantity({ quantity: 100, state: 'RELEASED', accepted: false }), 100);
});

test('pricing suggestion is exact, advisory and separates every cost component', () => {
  const suggestion = suggestPricing({
    quantity: 100,
    artisanUnitTnd: '12.000',
    materialsUnitTnd: '5.000',
    qualityUnitTnd: '1.000',
    packagingUnitTnd: '1.000',
    transportFixedTnd: '80.000',
    overheadFixedTnd: '120.000',
    contingencyPercent: 5,
    effortMinutesPerPiece: 90,
  });
  assert.equal(suggestion.artisanTotalTnd, '1200.000');
  assert.equal(suggestion.materialTotalTnd, '500.000');
  assert.equal(suggestion.subtotalTnd, '2100.000');
  assert.equal(suggestion.contingencyTnd, '105.000');
  assert.equal(suggestion.totalCostTnd, '2205.000');
  assert.equal(suggestion.unitCostTnd, '22.050');
  assert.equal(suggestion.effectiveHourlyTnd, '8.000');
  assert.equal(suggestion.advisory, true);
  assert.equal(suggestion.proposedBuyerPriceTnd, null);
  assert.ok(suggestion.limitations.some((line) => line.includes('not a quotation')));
});

test('pricing withholds effective hourly pay when effort evidence is missing', () => {
  const suggestion = suggestPricing({
    quantity: 10,
    artisanUnitTnd: '12.000',
    materialsUnitTnd: '0.000',
    qualityUnitTnd: '0.000',
    packagingUnitTnd: '0.000',
    transportFixedTnd: '0.000',
    overheadFixedTnd: '0.000',
    contingencyPercent: 0,
    effortMinutesPerPiece: null,
  });
  assert.equal(suggestion.effectiveHourlyTnd, null);
  assert.ok(suggestion.missing.includes('MEASURED_EFFORT'));
  assert.ok(suggestion.limitations.some((line) => line.includes('unknown')));
});

test('delivery simulation reports feasible, infeasible and unknown without guessing', () => {
  const comparison = simulateDelivery({
    requiredQuantity: 500,
    startDate: '2026-11-02T08:00:00.000+01:00',
    deadline: '2026-11-20T17:00:00.000+01:00',
    scenarios: [
      {
        name: 'single group',
        lines: [
          {
            artisanProfileId: 'a',
            quantity: 500,
            weeklyPieces: 100,
            committedPieces: 0,
            committedWeeks: 1,
            materialReadiness: 'READY',
            availableFrom: '2026-11-02T08:00:00.000+01:00',
          },
        ],
      },
      {
        name: 'split groups',
        lines: [
          {
            artisanProfileId: 'a',
            quantity: 200,
            weeklyPieces: 100,
            committedPieces: 0,
            committedWeeks: 1,
            materialReadiness: 'READY',
            availableFrom: '2026-11-02T08:00:00.000+01:00',
          },
          {
            artisanProfileId: 'b',
            quantity: 300,
            weeklyPieces: 150,
            committedPieces: 0,
            committedWeeks: 1,
            materialReadiness: 'READY',
            availableFrom: '2026-11-02T08:00:00.000+01:00',
          },
        ],
      },
      {
        name: 'unknown throughput',
        lines: [
          {
            artisanProfileId: 'c',
            quantity: 500,
            weeklyPieces: null,
            committedPieces: 0,
            committedWeeks: 1,
            materialReadiness: 'READY',
            availableFrom: '2026-11-02T08:00:00.000+01:00',
          },
        ],
      },
    ],
  });
  const [single, split, unknown] = comparison.scenarios;
  assert.equal(single.deadlineFeasible, 'INFEASIBLE');
  assert.equal(split.deadlineFeasible, 'FEASIBLE');
  assert.equal(unknown.deadlineFeasible, 'UNKNOWN');
  assert.equal(unknown.earliestCompletion, null);
  assert.ok(unknown.unknowns.some((code) => code.startsWith('WEEKLY_CAPACITY_UNKNOWN')));
  assert.ok(comparison.assumptions.length > 0);
});

test('delivery simulation flags unallocated work and committed capacity consumption', () => {
  const comparison = simulateDelivery({
    requiredQuantity: 500,
    startDate: '2026-11-02T08:00:00.000+01:00',
    deadline: '2026-12-31T17:00:00.000+01:00',
    scenarios: [
      {
        name: 'partial',
        lines: [
          {
            artisanProfileId: 'a',
            quantity: 100,
            weeklyPieces: 50,
            committedPieces: 100,
            committedWeeks: 2,
            materialReadiness: 'READY',
            availableFrom: '2026-11-02T08:00:00.000+01:00',
          },
        ],
      },
    ],
  });
  const plan = comparison.scenarios[0];
  assert.equal(plan.unallocated, 400);
  assert.equal(plan.capacityShortage, true);
  assert.equal(plan.lines[0].weeksNeeded, null, 'committed work consumes all weekly capacity');
});

test('ranking exposes normalized inputs, weights and reproducible score components', () => {
  const ranked = rankCandidates({
    requiredQuantity: 100,
    unitCompatible: true,
    candidates: [
      candidate({ artisanProfileId: 'big', knownRemaining: '100.00', declaredPieces: 100 }),
      candidate({ artisanProfileId: 'small', knownRemaining: '25.00', declaredPieces: 100 }),
    ],
  });
  const big = ranked.candidates.find((row) => row.artisanProfileId === 'big')!;
  assert.equal(ranked.weightVersion, rankingWeights.version);
  assert.equal(big.scoreComponents.length, rankingWeights.components.length);
  const total = big.scoreComponents.reduce((sum, component) => sum + component.contribution, 0);
  assert.ok(Math.abs(total - (big.score as number)) < 0.05, 'score is the sum of components');
  assert.equal(
    big.scoreComponents.reduce((sum, component) => sum + component.weight, 0),
    1,
    'weights sum to one',
  );
  assert.ok((big.score as number) > 0);
  // Coverage dominates: the group that covers the whole requirement ranks first.
  assert.equal(ranked.candidates[0].artisanProfileId, 'big');
});

test('a missing weighted input leaves the score null rather than scoring it as zero', () => {
  const ranked = rankCandidates({
    requiredQuantity: 100,
    unitCompatible: true,
    candidates: [
      candidate({ artisanProfileId: 'headless', knownRemaining: '50.00', declaredPieces: null }),
    ],
  });
  assert.equal(ranked.candidates[0].score, null);
  assert.equal(ranked.candidates[0].normalized.COMMITMENT_HEADROOM, null);
});

test('weights never admit an ineligible candidate', () => {
  const ranked = rankCandidates({
    requiredQuantity: 100,
    unitCompatible: true,
    candidates: [
      candidate({
        artisanProfileId: 'blocked',
        decision: 'INELIGIBLE',
        knownRemaining: '1000.00',
        declaredPieces: 1000,
        reasons: [{ code: 'PARTICIPATION_UNAUTHORIZED', detail: 'No consent.' }],
      }),
    ],
  });
  assert.equal(ranked.candidates[0].tier, 'EXCLUDED');
  assert.equal(ranked.candidates[0].blocks.includes('PARTICIPATION_UNAUTHORIZED'), true);
});

test('delivery readiness and availability move completion; unknown materials never become feasible', () => {
  const line = {
    artisanProfileId: 'a',
    quantity: 10,
    weeklyPieces: 10,
    committedPieces: 0,
    committedWeeks: 1,
    availableFrom: '2026-11-01T00:00:00Z',
  };
  const input = {
    requiredQuantity: 10,
    deadline: '2026-11-15T00:00:00Z',
    startDate: '2026-11-01T00:00:00Z',
  };
  assert.equal(
    simulateDelivery({ ...input, scenarios: [{ name: 'unknown materials', lines: [line] }] })
      .scenarios[0].deadlineFeasible,
    'UNKNOWN',
  );
  const ready = simulateDelivery({
    ...input,
    scenarios: [
      {
        name: 'delayed materials',
        lines: [{ ...line, materialReadiness: 'READY', materialReadyAt: '2026-11-12T00:00:00Z' }],
      },
    ],
  });
  assert.equal(ready.scenarios[0].earliestCompletion, '2026-11-19T00:00:00.000Z');
  assert.equal(ready.scenarios[0].deadlineFeasible, 'INFEASIBLE');
});

test('material assumptions remain an explicit allocation review constraint', () => {
  const lines = [
    {
      artisanProfileId: 'a',
      quantity: 10,
      availablePieces: 10,
      unitType: 'PIECES' as const,
      needsReview: false,
    },
  ];
  assert.deepEqual(
    validateAllocation({ requiredQuantity: 10, lines, materialReadiness: 'UNKNOWN' }).violations,
    ['MATERIAL_READINESS_UNKNOWN'],
  );
  assert.equal(
    validateAllocation({ requiredQuantity: 10, lines, materialReadiness: 'READY' }).valid,
    true,
  );
});
