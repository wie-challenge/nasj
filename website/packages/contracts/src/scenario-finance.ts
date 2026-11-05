import { formatTnd, parseTnd, prorateTnd } from './domain.js';
import { agreedProducerShare } from './logistics.js';

/** Presentation-only assumptions. No IDs, persistence, transport or ledger commands. */
export type FinancialScenarioInput = {
  quantity: string;
  sellingPrice: string;
  compensationMode: 'UNIT' | 'HOURLY';
  unitCompensation: string;
  hourlyRate: string;
  effortMinutes: string;
  materialPerUnit: string;
  qaPerUnit: string;
  packagingPerUnit: string;
  transportFixed: string;
  overheadFixed: string;
  contingencyPercent: string;
  rejectionPercent: string;
};
export const financialScenarioPresets: Record<
  'Baseline' | 'Optimistic' | 'Conservative',
  FinancialScenarioInput
> = {
  Baseline: {
    quantity: '100',
    sellingPrice: '30.000',
    compensationMode: 'UNIT',
    unitCompensation: '12.000',
    hourlyRate: '8.000',
    effortMinutes: '90',
    materialPerUnit: '5.000',
    qaPerUnit: '1.000',
    packagingPerUnit: '1.000',
    transportFixed: '80.000',
    overheadFixed: '120.000',
    contingencyPercent: '5',
    rejectionPercent: '5',
  },
  Optimistic: {
    quantity: '150',
    sellingPrice: '32.000',
    compensationMode: 'UNIT',
    unitCompensation: '12.000',
    hourlyRate: '8.000',
    effortMinutes: '75',
    materialPerUnit: '4.500',
    qaPerUnit: '1.000',
    packagingPerUnit: '1.000',
    transportFixed: '80.000',
    overheadFixed: '120.000',
    contingencyPercent: '3',
    rejectionPercent: '2',
  },
  Conservative: {
    quantity: '60',
    sellingPrice: '25.000',
    compensationMode: 'UNIT',
    unitCompensation: '12.000',
    hourlyRate: '8.000',
    effortMinutes: '120',
    materialPerUnit: '6.000',
    qaPerUnit: '1.500',
    packagingPerUnit: '1.000',
    transportFixed: '100.000',
    overheadFixed: '150.000',
    contingencyPercent: '10',
    rejectionPercent: '15',
  },
};
export function signedScenarioTnd(value: bigint): string {
  return `${value < 0n ? '-' : ''}${formatTnd(value < 0n ? -value : value)}`;
}
function ratioHalfUp(numerator: bigint, denominator: bigint): bigint {
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  return sign * (absolute / denominator + (2n * (absolute % denominator) >= denominator ? 1n : 0n));
}
export function scenarioPercentage(basisPoints: bigint | null): string {
  if (basisPoints === null) return 'UNAVAILABLE';
  const sign = basisPoints < 0n ? '-' : '';
  const value = basisPoints < 0n ? -basisPoints : basisPoints;
  return `${sign}${value / 100n}.${String(value % 100n).padStart(2, '0')}%`;
}
function integer(value: string, maximum: bigint, field: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value) || BigInt(value) > maximum)
    throw new RangeError(`${field}: enter a whole number from 0 to ${maximum}.`);
  return BigInt(value);
}
function percentage(value: string, field: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value))
    throw new RangeError(`${field}: enter 0–100 percent with at most two decimals.`);
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (result > 10000n) throw new RangeError(`${field}: enter 0–100 percent.`);
  return result;
}
export function calculateFinancialScenario(input: FinancialScenarioInput) {
  const q = integer(input.quantity, 1000000n, 'Quantity');
  const minutes = integer(input.effortMinutes, 100000n, 'Effort minutes');
  const money = (key: keyof FinancialScenarioInput) => {
    try {
      const value = parseTnd(input[key]);
      if (value > 1000000000n) throw new RangeError();
      return value;
    } catch {
      throw new RangeError(
        `${key}: enter exact TND from 0 to 1000000 with at most three decimals.`,
      );
    }
  };
  const price = money('sellingPrice');
  if (input.compensationMode !== 'UNIT' && input.compensationMode !== 'HOURLY')
    throw new RangeError('Choose a supported compensation mode.');
  const compensationPerUnit =
    input.compensationMode === 'UNIT'
      ? money('unitCompensation')
      : prorateTnd(money('hourlyRate'), minutes, 60n);
  const rejection = percentage(input.rejectionPercent, 'Rejection');
  const contingencyRate = percentage(input.contingencyPercent, 'Contingency');
  const materialsPerUnit = money('materialPerUnit');
  const qaPerUnit = money('qaPerUnit');
  const packagingPerUnit = money('packagingPerUnit');
  const transport = money('transportFixed');
  const overhead = money('overheadFixed');
  const grossRevenue = q * price;
  const revenue = prorateTnd(grossRevenue, 10000n - rejection, 10000n);
  const artisanCompensation = q * compensationPerUnit;
  const materials = q * materialsPerUnit;
  const qa = q * qaPerUnit;
  const packaging = q * packagingPerUnit;
  const variablePerUnit = compensationPerUnit + materialsPerUnit + qaPerUnit + packagingPerUnit;
  const baseCosts = q * variablePerUnit + transport + overhead;
  const contingency = prorateTnd(baseCosts, contingencyRate, 10000n);
  const costs = baseCosts + contingency;
  const contribution = revenue - costs;
  // Estimated continuous planning threshold, ceil to whole pieces before monetary rounding.
  const marginNumerator =
    price * (10000n - rejection) - variablePerUnit * (10000n + contingencyRate);
  const fixedNumerator = (transport + overhead) * (10000n + contingencyRate);
  const breakEvenQuantity =
    marginNumerator <= 0n ? null : (fixedNumerator + marginNumerator - 1n) / marginNumerator;
  const producerShareBasisPoints =
    revenue > 0n ? ratioHalfUp(artisanCompensation * 10000n, revenue) : null;
  // Same agreed-compensation / net quotation denominator, no refunds. Three fictional artisans,
  // not a real cohort. Reuse policy (including rounding); retain extreme loss ratios above its cap.
  const policyShare =
    producerShareBasisPoints !== null && producerShareBasisPoints > 100000n
      ? null
      : agreedProducerShare({
          compensationMillimes: artisanCompensation,
          quotationMillimes: revenue,
          refundMillimes: 0n,
          artisanCount: 3,
        });
  return {
    quantity: q,
    grossRevenue,
    revenue,
    artisanCompensation,
    compensationPerUnit,
    materials,
    qa,
    packaging,
    transport,
    overhead,
    contingency,
    costs,
    contribution,
    breakEvenQuantity,
    contributionBasisPoints: revenue > 0n ? ratioHalfUp(contribution * 10000n, revenue) : null,
    producerShareBasisPoints,
    producerSharePolicy: policyShare,
    effectiveHourlyMillimes:
      minutes > 0n && q > 0n ? prorateTnd(compensationPerUnit, 60n, minutes) : null,
  };
}
