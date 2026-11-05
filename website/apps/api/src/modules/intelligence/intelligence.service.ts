import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { audit } from '../foundation/audit.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import * as C from '@nasj/contracts';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Db } from '../foundation/transaction.js';
import { iamTransaction } from '../foundation/transaction.js';
import { projectCapacity } from '../artisans/capacity.js';

/**
 * Production intelligence reads authoritative records; it never writes a second ledger and never
 * estimates a figure it cannot support from stored data.
 */
@Injectable()
export class IntelligenceService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async workspace(actor: Actor, month?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      if (!access.analytics)
        fail(403, 'FORBIDDEN', 'Analytics access is required for this workspace.');
      const period = this.period(month);
      const policy = await this.reportingPolicy(tx);
      const orders = await tx.commercialOrder.findMany({
        where: {
          createdAt: { gte: period.start, lt: period.end },
          ...(access.platform
            ? {}
            : { rfq: { operatorOrganizationId: { in: access.operatorOrganizationIds } } }),
        },
        include: {
          rfq: true,
          acceptance: { include: { quote: true } },
          batches: {
            include: {
              artisanProfile: { select: { displayName: true } },
              offer: true,
              progressEvents: { orderBy: { recordedAt: 'desc' } },
              qualityAttempts: { orderBy: { createdAt: 'desc' } },
              materialRequirements: { select: { id: true, readiness: true } },
              release: true,
              forecasts: { orderBy: { createdAt: 'asc' } },
              exceptions: { where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } },
            },
          },
          offers: true,
          eligibilityAssessments: {
            select: { artisanProfileId: true, decision: true, version: true },
            orderBy: { version: 'desc' },
          },
          payables: {
            include: {
              settlements: true,
              // Real payout evidence. Synthetic settlements stay separate and are never read as
              // verified payment; verified figures come from execution records only.
              payouts: { include: { executions: true } },
            },
          },
          shipments: {
            include: {
              items: true,
              deliveryReport: true,
              buyerConfirmation: true,
              handovers: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const now = new Date();
      const batches: C.RiskBatchView[] = [];
      const forecasts: C.IntelligenceWorkspaceView['forecasts'] = [];
      let produced = 0;
      let approved = 0;
      let required = 0;
      let offeredQuantity = 0;
      let acceptedQuantity = 0;

      for (const order of orders) {
        required += order.rfq.quantity;
        offeredQuantity += order.offers.reduce((sum, offer) => sum + offer.quantity, 0);
        acceptedQuantity += order.offers
          .filter((offer) => offer.status === 'ACCEPTED')
          .reduce((sum, offer) => sum + offer.quantity, 0);
        for (const batch of order.batches) {
          produced += batch.produced;
          approved += batch.approved;
          const latest = batch.progressEvents[0];
          const rejectionOpen = (batch.qualityAttempts[0]?.rejected ?? 0) > 0;
          const readiness = await tx.materialReadiness.findMany({ where: { batchId: batch.id } });
          const shortageOpen =
            batch.materialRequirements.some((requirement) =>
              ['SHORT', 'SHORTAGE', 'NOT_READY'].includes(
                readiness.find((row) => row.requirementId === requirement.id)?.readiness ??
                  requirement.readiness,
              ),
            ) || batch.exceptions.some((row) => row.category === 'MATERIAL_SHORTAGE');
          // Confirmed near-term capacity is derived from the accepted offer's declared capacity
          // when a PIECES figure exists; otherwise it stays unknown.
          const confirmedCapacity = await this.confirmedCapacity(tx, {
            capacityDeclarationId: batch.offer.capacityDeclarationId,
            status: batch.offer.status,
            quantity: batch.offer.quantity,
          });
          const risk = C.assessDelayRisk({
            now: now.toISOString(),
            deadline: (batch.offer.deliveryDeadline ?? order.rfq.deliveryAt).toISOString(),
            acceptedQuantity: batch.offer.status === 'ACCEPTED' ? batch.offer.quantity : null,
            reportedProgress: latest ? latest.cumulative : null,
            confirmedCapacity,
            materialShortageOpen: shortageOpen,
            qualityRejectionOpen: rejectionOpen,
            approvedScheduleChangeTo: null,
            lastProgressAt: latest?.occurredAt.toISOString() ?? null,
            stalenessDays: 7,
            requiredInputsMissing: [
              ...(batch.offer.status === 'ACCEPTED' ? [] : ['OFFER_NOT_ACCEPTED']),
              ...(batch.materialRequirements.length &&
              !batch.materialRequirements.every((requirement) =>
                ['READY', 'SHORT', 'SHORTAGE', 'NOT_READY'].includes(
                  readiness.find((row) => row.requirementId === requirement.id)?.readiness ??
                    requirement.readiness,
                ),
              )
                ? ['MATERIAL_READINESS_UNVERIFIED']
                : []),
            ],
          });
          batches.push({
            batchId: batch.id,
            orderId: order.id,
            artisanDisplayName: batch.artisanProfile.displayName,
            quantity: batch.offer.quantity,
            deadline: (batch.offer.deliveryDeadline ?? order.rfq.deliveryAt).toISOString(),
            risk,
            evaluatedAt: now.toISOString(),
            interventionOwner: 'PRODUCTION_MANAGER',
          });
          // A forecast instant exists only where an approved feasibility assessment recorded a
          // production period; completion is the last recorded progress reaching quantity.
          const completed =
            batch.produced >= batch.offer.quantity &&
            !['CANCELLED', 'CLOSED_CANCELLED'].includes(batch.status)
              ? (batch.progressEvents
                  .filter(
                    (event) => event.cumulative >= batch.offer.quantity && event.kind !== 'FLAG',
                  )
                  .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())[0]
                  ?.recordedAt.toISOString() ?? null)
              : null;
          const snapshots = batch.forecasts;
          for (const forecast of snapshots.length ? snapshots : [null])
            forecasts.push({
              batchId: batch.id,
              evidence: forecast?.evidence ?? 'UNAVAILABLE',
              comparison: C.compareForecast({
                forecastedFor: forecast?.forecastedFor.toISOString() ?? null,
                actualCompletedAt: completed,
              }),
            });
        }
      }

      // Paid participation requires independently verified payment, not merely the existence of a
      // settlement row. A synthetic or unreconciled settlement is an intent to pay; counting it here
      // would report unpaid artisans as paid. See C.isVerifiedSettlement.
      const paidProfiles = new Set(
        orders.flatMap((order) =>
          order.payables
            .filter(
              (payable) => C.verifiedPaidMillimes(C.payoutEvidenceEvents(payable.payouts)) > 0n,
            )
            .map((payable) => payable.artisanProfileId),
        ),
      );
      const distribution = this.distribution(
        orders.map((order) => ({
          eligibleProfileIds: [
            ...new Map(
              order.eligibilityAssessments
                .map((row) => [row.artisanProfileId, row] as const)
                .reverse(),
            ).values(),
          ]
            .filter((row) => row.decision === 'ELIGIBLE')
            .map((row) => row.artisanProfileId),
          offersForDistribution: order.offers.map((offer) => ({
            artisanProfileId: offer.artisanProfileId,
            status: offer.status,
          })),
        })),
        policy.minimumCohort,
        paidProfiles,
      );
      const earned = orders.reduce(
        (sum, order) =>
          sum + order.payables.reduce((inner, payable) => inner + payable.amountMillimes, 0n),
        0n,
      );
      const simulatedPaid = orders.reduce(
        (sum, order) =>
          sum +
          order.payables.reduce(
            (inner, payable) => inner + C.simulatedPaidMillimes(payable.settlements),
            0n,
          ),
        0n,
      );
      // Verified paid is deduplicated by payment identity inside the helper, then clamped to each
      // payable here, where the obligation is known. A replay cannot inflate it and an overpayment
      // cannot exceed what was owed.
      const verifiedPaid = orders.reduce(
        (sum, order) =>
          sum +
          order.payables.reduce(
            (inner, payable) =>
              inner +
              C.clampVerifiedToObligation(
                C.verifiedPaidMillimes(C.payoutEvidenceEvents(payable.payouts)),
                payable.amountMillimes,
              ),
            0n,
          ),
        0n,
      );
      const agreed = orders.reduce(
        (sum, order) =>
          sum +
          order.offers
            .filter((offer) => offer.status === 'ACCEPTED')
            .reduce((inner, offer) => inner + offer.unitPayMillimes * BigInt(offer.quantity), 0n),
        0n,
      );
      const snapshots = await tx.recommendationSnapshot.count({
        where: access.platform
          ? {}
          : { order: { rfq: { operatorOrganizationId: { in: access.operatorOrganizationIds } } } },
      });
      const overrides = await tx.allocationOverride.count({
        where: access.platform
          ? {}
          : {
              plan: {
                order: { rfq: { operatorOrganizationId: { in: access.operatorOrganizationIds } } },
              },
            },
      });
      const excluded = batches.filter((batch) => batch.risk.state === 'INSUFFICIENT_DATA').length;

      const view: C.IntelligenceWorkspaceView = {
        generatedAt: now.toISOString(),
        period: {
          from: period.start.toISOString(),
          to: period.end.toISOString(),
          timezone: 'Africa/Tunis',
        },
        alerts: (
          await tx.batchAlert.findMany({
            where: { batchId: { in: batches.map((batch) => batch.batchId) } },
            orderBy: { createdAt: 'desc' },
          })
        ).map((row) => ({
          id: row.id,
          batchId: row.batchId,
          status: row.status,
          kind: row.kind,
          ownerRole: row.ownerRole,
          createdAt: row.createdAt.toISOString(),
        })),
        riskPolicyVersion: C.RISK_POLICY_VERSION,
        metricsPolicyVersion: C.METRICS_POLICY_VERSION,
        batches,
        forecasts,
        forecastSummary: C.forecastErrorSummary(
          forecasts.filter((row) => row.evidence === 'OBSERVED').map((row) => row.comparison),
        ),
        syntheticForecastSummary: C.forecastErrorSummary(
          forecasts.filter((row) => row.evidence === 'SYNTHETIC').map((row) => row.comparison),
        ),
        fairness: distribution,
        fulfillment: C.fulfillmentMetrics({
          rfqs: orders.length,
          acceptedQuotations: orders.filter((order) => order.acceptance).length,
          offeredQuantity,
          artisanAcceptedQuantity: acceptedQuantity,
          producedPieces: produced,
          qualityApprovedPieces: approved,
          shippedPieces: orders.reduce(
            (sum, order) =>
              sum +
              order.shipments
                .filter((shipment) =>
                  shipment.handovers.some(
                    (handover) => handover.confirmationStatus === 'CONFIRMED',
                  ),
                )
                .reduce(
                  (n, shipment) => n + shipment.items.reduce((q, item) => q + item.quantity, 0),
                  0,
                ),
            0,
          ),
          receivedPieces: orders.reduce(
            (sum, order) =>
              sum +
              order.shipments.reduce(
                (n, shipment) => n + (shipment.buyerConfirmation?.received ?? 0),
                0,
              ),
            0,
          ),
          buyerAcceptedPieces: orders.reduce((sum, order) => sum + order.delivered, 0),
          requiredQuantity: required,
        }),
        compensation:
          new Set(
            orders.flatMap((order) => order.payables.map((payable) => payable.artisanProfileId)),
          ).size < policy.minimumCohort
            ? null
            : C.compensationMetrics({
                agreedMillimes: agreed.toString(),
                earnedMillimes: earned.toString(),
                // Owed now is earned less what was actually verified as paid. A synthetic settlement
                // moves no money, so it cannot reduce the balance owed to an artisan.
                payableMillimes: (earned > verifiedPaid ? earned - verifiedPaid : 0n).toString(),
                simulatedPaidMillimes: simulatedPaid.toString(),
                verifiedPaidMillimes: verifiedPaid.toString(),
                // No approved settlement-verification authority exists (owner decision D1 open).
                authorityApproved: false,
              }),
        producerShare: C.producerShare({
          agreedCompensationMillimes: agreed.toString(),
          netQuotationRevenueMillimes: orders
            .reduce((sum, order) => sum + (order.acceptance?.quote.totalMillimes ?? 0n), 0n)
            .toString(),
          cohort: new Set(
            orders.flatMap((order) =>
              order.offers
                .filter((offer) => offer.status === 'ACCEPTED')
                .map((offer) => offer.artisanProfileId),
            ),
          ).size,
          minimumCohort: policy.minimumCohort,
        }),
        reportingPolicy: policy,
        rankingAudit: {
          policyVersion: C.PLANNING_POLICY_VERSION,
          snapshots,
          overrides,
          excludedCandidates: excluded,
        },
        limitations: [
          'All figures derive from synthetic demonstration records and are labelled as such.',
          'No verified payment exists, so verified paid stays zero rather than equal to simulated.',
          'Error metrics are withheld entirely when no comparable observed completion exists.',
          'A cohort below the minimum size is suppressed rather than masked.',
        ],
      };
      return view;
    });
  }

  /** Association-scoped aggregate outcomes. Private financial detail never leaves the organization. */
  async associationOutcomes(actor: Actor, from: string, to: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      if (!access.associationOutcomes)
        fail(403, 'FORBIDDEN', 'An authorized association role is required.');
      if (!access.organizationIds.length)
        fail(403, 'FORBIDDEN', 'A current association membership is required.');
      const start = new Date(from);
      const end = new Date(to);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end)
        fail(400, 'INVALID_PERIOD', 'Provide a valid reporting period.');
      const memberships = await tx.associationMembership.findMany({
        where: {
          organizationId: { in: access.associationOrganizationIds },
          endedAt: null,
          status: 'ACTIVE',
          consentRecord: { decision: true, withdrawnAt: null },
        },
        select: { artisanProfileId: true },
      });
      const profileIds = memberships.map((row) => row.artisanProfileId);
      const batches = await tx.commercialBatch.findMany({
        where: {
          artisanProfileId: { in: profileIds.length ? profileIds : [''] },
          createdAt: { gte: start, lt: end },
        },
        select: { produced: true, approved: true, submitted: true },
      });
      const payables = await tx.artisanPayable.findMany({
        where: {
          artisanProfileId: { in: profileIds.length ? profileIds : [''] },
          createdAt: { gte: start, lt: end },
        },
        select: { amountMillimes: true },
      });
      const policy = await this.reportingPolicy(tx);
      // Only closed calendar-month windows are accepted: overlapping/narrow windows permit differencing.
      if (
        start.getUTCDate() !== 1 ||
        start.getUTCHours() !== 0 ||
        start.getUTCMinutes() !== 0 ||
        end.getUTCDate() !== 1 ||
        end.getUTCHours() !== 0 ||
        end.getUTCMinutes() !== 0 ||
        end.getTime() !== Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)
      )
        fail(
          400,
          'UNSAFE_REPORTING_FILTER',
          'Use one complete UTC calendar month without individual or overlapping filters.',
        );
      const participants = new Set(
        (
          await tx.commercialBatch.findMany({
            where: { artisanProfileId: { in: profileIds }, createdAt: { gte: start, lt: end } },
            select: { artisanProfileId: true },
          })
        ).map((row) => row.artisanProfileId),
      );
      const aggregate = payables.reduce((sum, row) => sum + row.amountMillimes, 0n);
      return C.supressOutcome(
        {
          groupCount: participants.size,
          acceptedProduction: batches.reduce((sum, row) => sum + row.produced, 0),
          deliveredOutput: batches.reduce((sum, row) => sum + row.submitted, 0),
          qualityApproved: batches.reduce((sum, row) => sum + row.approved, 0),
          aggregateCompensationTnd: C.formatTnd(aggregate),
          period: `${start.toISOString()}/${end.toISOString()}`,
          evidence: 'SYNTHETIC',
        },
        policy.minimumCohort,
      );
    });
  }

  async saveForecast(
    actor: Actor,
    batchId: string,
    input: z.infer<typeof C.forecastSnapshotSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const batch = await this.batchScope(tx, actor, batchId, true);
      return this.command(tx, actor, batchId, 'forecast.record', key, input, async () => {
        if (input.evidence === 'OBSERVED' && batch.provenance === 'SYNTHETIC')
          fail(
            409,
            'SYNTHETIC_EVIDENCE_NOT_OBSERVED',
            'A synthetic batch cannot produce a genuine forecast-accuracy claim.',
          );
        if (batch.produced >= batch.offer.quantity || batch.status === 'CANCELLED')
          fail(
            409,
            'FORECAST_TOO_LATE',
            'A completed or cancelled batch cannot receive a new forecast.',
          );
        const row = await tx.forecastSnapshot.create({
          data: {
            batchId,
            ruleVersion: C.RISK_POLICY_VERSION,
            forecastedFor: new Date(input.forecastedFor),
            assumptions: {
              source: input.assumptions,
              quantity: batch.offer.quantity,
              deadline: (batch.offer.deliveryDeadline ?? batch.order.rfq.deliveryAt).toISOString(),
              forecastVersion: (await tx.forecastSnapshot.count({ where: { batchId } })) + 1,
            },
            evidence: input.evidence,
            createdById: actor.id,
          },
        });
        await audit(tx, actor, {
          action: 'intelligence.forecast.recorded',
          targetType: 'ForecastSnapshot',
          targetId: row.id,
          organizationId: batch.order.rfq.operatorOrganizationId,
          after: { ruleVersion: row.ruleVersion, evidence: row.evidence },
        });
        return {
          id: row.id,
          batchId,
          forecastedFor: row.forecastedFor.toISOString(),
          createdAt: row.createdAt.toISOString(),
          ruleVersion: row.ruleVersion,
          assumptions: row.assumptions,
          evidence: row.evidence,
        };
      });
    });
  }

  async reportTime(
    actor: Actor,
    batchId: string,
    input: z.infer<typeof C.productionTimeSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const batch = await this.batchScope(tx, actor, batchId, false);
      if (batch.artisanProfile.userId !== actor.id)
        fail(
          403,
          'ARTISAN_CONSENT_REQUIRED',
          'The artisan reports and consents to their own production time.',
        );
      return this.command(tx, actor, batchId, 'time.record', key, input, async () => {
        if (input.correctionOfId) {
          const original = await tx.productionTimeRecord.findFirst({
            where: { id: input.correctionOfId, batchId, artisanProfileId: batch.artisanProfileId },
            include: { correctedBy: true },
          });
          if (!original || original.correctedBy)
            fail(409, 'STALE_CORRECTION', 'Correct the current record for this batch.');
        }
        const start = new Date(input.periodFrom),
          end = new Date(input.periodTo);
        if (input.observedUnits > batch.offer.quantity)
          fail(400, 'INVALID_OBSERVED_UNITS', 'Observed units exceed this batch.');
        if (end > new Date())
          fail(400, 'FUTURE_OBSERVATION', 'Observed time cannot be in the future.');
        const existing = await tx.productionTimeRecord.findMany({
          where: {
            batchId,
            correctedBy: null,
            periodFrom: { lt: end },
            periodTo: { gt: start },
            ...(input.correctionOfId ? { id: { not: input.correctionOfId } } : {}),
          },
        });
        if (existing.length)
          fail(
            409,
            'OVERLAPPING_TIME',
            'A reporting period overlaps an existing current time record.',
          );
        const row = await tx.productionTimeRecord.create({
          data: {
            batchId,
            artisanProfileId: batch.artisanProfileId,
            reportedById: actor.id,
            consented: true,
            periodFrom: start,
            periodTo: end,
            unitContext: input.unitContext,
            observedMinutes: input.observedMinutes,
            observedUnits: input.observedUnits,
            evidence: input.evidence,
            provenance: input.provenance,
            correctionOfId: input.correctionOfId,
          },
        });
        await audit(tx, actor, {
          action: input.correctionOfId
            ? 'intelligence.time.corrected'
            : 'intelligence.time.recorded',
          targetType: 'ProductionTimeRecord',
          targetId: row.id,
          organizationId: batch.order.rfq.operatorOrganizationId,
          after: {
            evidence: input.evidence,
            consented: true,
            correctionOfId: input.correctionOfId ?? null,
          },
        });
        return {
          id: row.id,
          batchId,
          observedMinutes: row.observedMinutes,
          evidence: row.evidence,
          correctionOfId: row.correctionOfId,
        };
      });
    });
  }

  async timeHistory(actor: Actor, batchId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      await this.batchScope(tx, actor, batchId, false);
      const records = await tx.productionTimeRecord.findMany({
        where: { batchId },
        include: { correctedBy: { select: { id: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return {
        items: records.map((row) => ({
          id: row.id,
          periodFrom: row.periodFrom.toISOString(),
          periodTo: row.periodTo.toISOString(),
          observedMinutes: row.observedMinutes,
          observedUnits: row.observedUnits,
          unitContext: row.unitContext,
          provenance: row.provenance,
          evidence: row.evidence,
          consented: row.consented,
          correctionOfId: row.correctionOfId,
          superseded: Boolean(row.correctedBy),
        })),
      };
    });
  }

  async earnings(actor: Actor, batchId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const batch = await this.batchScope(tx, actor, batchId, false);
      const records = await tx.productionTimeRecord.findMany({
        where: { batchId, correctedBy: null },
        orderBy: [{ periodFrom: 'asc' }, { id: 'asc' }],
      });
      const payables = await tx.artisanPayable.findMany({
        where: { batchId },
        include: { settlements: true, payouts: { include: { executions: true } } },
      });
      const earned = payables.reduce((n, row) => n + row.amountMillimes, 0n);
      const simulated = payables.reduce(
        (n, row) => n + C.simulatedPaidMillimes(row.settlements),
        0n,
      );
      const verified = payables.reduce(
        (n, row) =>
          n +
          C.clampVerifiedToObligation(
            C.verifiedPaidMillimes(C.payoutEvidenceEvents(row.payouts)),
            row.amountMillimes,
          ),
        0n,
      );
      return {
        batchId,
        unit: 'TND/hour',
        evidenceClasses: [...new Set(records.map((row) => row.evidence))],
        periods: records.map((row) => ({
          from: Number.isFinite(row.periodFrom.getTime()) ? row.periodFrom.toISOString() : null,
          to: Number.isFinite(row.periodTo.getTime()) ? row.periodTo.toISOString() : null,
          unitContext: row.unitContext,
          provenance: row.provenance,
        })),
        compensation: C.compensationMetrics({
          agreedMillimes: (batch.offer.unitPayMillimes * BigInt(batch.offer.quantity)).toString(),
          earnedMillimes: earned.toString(),
          payableMillimes: (earned > verified ? earned - verified : 0n).toString(),
          simulatedPaidMillimes: simulated.toString(),
          verifiedPaidMillimes: verified.toString(),
          // No approved settlement-verification authority exists (owner decision D1 open).
          authorityApproved: false,
        }),
        estimate: C.earningsFromObservedTime({
          agreedMillimes: (batch.offer.unitPayMillimes * BigInt(batch.offer.quantity)).toString(),
          coveredQuantity: batch.offer.quantity,
          records,
          scope: batchId,
        }),
      };
    });
  }

  async evaluateAlerts(actor: Actor, month?: string) {
    // The calculation uses the same recorded facts and real clock as the displayed workspace.
    const workspace = await this.workspace(actor, month);
    return iamTransaction(this.db, actor, async (tx) => {
      for (const view of workspace.batches) {
        const batch = await this.batchScope(tx, actor, view.batchId, true);
        if (['AT_RISK', 'OVERDUE'].includes(view.risk.state)) {
          const reasonHash = createHash('sha256')
            .update([...new Set(view.risk.reasons.map((row) => row.code))].sort().join('|'))
            .digest('hex');
          const existing = await tx.batchAlert.findUnique({
            where: {
              batchId_ruleVersion_reasonHash: {
                batchId: batch.id,
                ruleVersion: C.RISK_POLICY_VERSION,
                reasonHash,
              },
            },
          });
          if (!existing) {
            const row = await tx.batchAlert.create({
              data: {
                batchId: batch.id,
                ruleVersion: C.RISK_POLICY_VERSION,
                reasonHash,
                kind: view.risk.state,
                facts: JSON.parse(JSON.stringify({ ...view.risk, evaluatedAt: view.evaluatedAt })),
                ownerRole: 'PRODUCTION_MANAGER',
              },
            });
            await audit(tx, actor, {
              action: 'intelligence.alert.raised',
              targetType: 'BatchAlert',
              targetId: row.id,
              organizationId: batch.order.rfq.operatorOrganizationId,
              after: { kind: row.kind, reasonHash },
            });
          }
        }
        const forecast = await tx.forecastSnapshot.findMany({
          where: { batchId: batch.id },
          include: { comparisons: true },
        });
        const completion =
          batch.produced >= batch.offer.quantity && batch.status !== 'CANCELLED'
            ? await tx.productionProgressEvent.findFirst({
                where: {
                  batchId: batch.id,
                  cumulative: { gte: batch.offer.quantity },
                  kind: { not: 'FLAG' },
                },
                orderBy: { recordedAt: 'asc' },
              })
            : null;
        if (completion)
          for (const original of forecast) {
            if (original.comparisons.length) continue;
            const comparison = C.compareForecast({
              forecastedFor: original.forecastedFor.toISOString(),
              actualCompletedAt: completion.recordedAt.toISOString(),
            });
            if (comparison.status === 'COMPARABLE')
              await tx.forecastComparison.create({
                data: {
                  forecastId: original.id,
                  actualCompletedAt: completion.recordedAt,
                  observedDifferenceDays: comparison.observedDifferenceDays as number,
                  absoluteErrorDays: comparison.absoluteErrorDays as number,
                  note: `${original.evidence}: ${comparison.note}`,
                },
              });
          }
      }
      return { evaluatedAt: workspace.generatedAt, evaluatedBatches: workspace.batches.length };
    });
  }

  async decideAlert(
    actor: Actor,
    alertId: string,
    input: z.infer<typeof C.alertDecisionSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const alert = await tx.batchAlert.findUnique({ where: { id: alertId } });
      if (!alert) fail(404, 'NOT_FOUND', 'Alert not found.');
      const batch = await this.batchScope(tx, actor, alert.batchId, true);
      return this.command(tx, actor, alertId, 'alert.decide', key, input, async () => {
        if (
          alert.status === 'RESOLVED' ||
          (input.action === 'ACKNOWLEDGE' && alert.status !== 'OPEN')
        )
          fail(409, 'INVALID_TRANSITION', 'This alert has already changed.');
        const row = await tx.batchAlert.update({
          where: { id: alertId },
          data:
            input.action === 'ACKNOWLEDGE'
              ? { status: 'ACKNOWLEDGED', acknowledgedById: actor.id, acknowledgedAt: new Date() }
              : { status: 'RESOLVED', resolvedAt: new Date() },
        });
        await audit(tx, actor, {
          action: 'intelligence.alert.decided',
          targetType: 'BatchAlert',
          targetId: row.id,
          organizationId: batch.order.rfq.operatorOrganizationId,
          reason: input.reason,
          before: { status: alert.status },
          after: { status: row.status, ownerRole: row.ownerRole },
        });
        return { id: row.id, status: row.status };
      });
    });
  }

  async reviewPolicy(actor: Actor, input: z.infer<typeof C.reportingPolicySchema>, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      if (actor.role !== 'ADMIN')
        fail(403, 'FORBIDDEN', 'Platform policy review authority is required.');
      return this.command(tx, actor, 'reporting', 'policy.review', key, input, async () => {
        const previous = await this.reportingPolicy(tx);
        const version = previous.version + 1;
        await tx.reportingPolicy.create({
          data: {
            key: `reporting:${version}`,
            version,
            value: {
              minimumCohort: input.minimumCohort,
              reviewReference: input.reviewReference,
              producerShareBasis: C.DEFAULT_REPORTING_POLICY.producerShareBasis,
            },
            reviewedById: actor.id,
          },
        });
        await audit(tx, actor, {
          action: 'intelligence.reporting_policy.reviewed',
          targetType: 'ReportingPolicy',
          targetId: `reporting:${version}`,
          reason: input.reviewReference,
          after: { minimumCohort: input.minimumCohort, version },
        });
        return {
          version,
          minimumCohort: input.minimumCohort,
          producerShareBasis: C.DEFAULT_REPORTING_POLICY.producerShareBasis,
        };
      });
    });
  }

  async recordFinding(
    actor: Actor,
    input: z.infer<typeof C.rankingAuditFindingSchema>,
    key?: string,
  ) {
    return iamTransaction(this.db, actor, async (tx) => {
      const access = await this.access(tx, actor);
      const order = await tx.commercialOrder.findUnique({
        where: { id: input.orderId },
        include: { rfq: true },
      });
      if (!order || !access.operatorOrganizationIds.includes(order.rfq.operatorOrganizationId))
        fail(404, 'NOT_FOUND', 'Order not found.');
      if (!access.audit) fail(403, 'FORBIDDEN', 'Scoped audit permission is required.');
      return this.command(tx, actor, order.id, 'audit.finding', key, input, async () => {
        await audit(tx, actor, {
          action: 'intelligence.audit.finding',
          targetType: 'CommercialOrder',
          targetId: order.id,
          organizationId: order.rfq.operatorOrganizationId,
          reason: input.purpose,
          after: {
            finding: input.finding,
            reviewOwnerId: actor.id,
            correctiveDecision: input.correctiveDecision,
            automatedWorkerPenalty: false,
          },
        });
        return { recorded: true, reviewOwnerId: actor.id, automatedWorkerPenalty: false };
      });
    });
  }

  private period(month?: string) {
    const current =
      month ??
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Tunis',
        year: 'numeric',
        month: '2-digit',
      })
        .format(new Date())
        .slice(0, 7);
    const [year, number] = current.split('-').map(Number);
    return {
      start: new Date(Date.UTC(year, number - 1, 1) - 3600000),
      end: new Date(Date.UTC(year, number, 1) - 3600000),
    };
  }

  private async reportingPolicy(tx: Db): Promise<C.ReportingPolicy> {
    const row = await tx.reportingPolicy.findFirst({
      where: { key: { startsWith: 'reporting' }, reviewedById: { not: null } },
      orderBy: { version: 'desc' },
    });
    const value = row?.value as { minimumCohort?: number } | undefined;
    return {
      version: row?.version ?? C.DEFAULT_REPORTING_POLICY.version,
      minimumCohort: Math.max(5, Math.trunc(value?.minimumCohort ?? C.MINIMUM_COHORT)),
      producerShareBasis: C.DEFAULT_REPORTING_POLICY.producerShareBasis,
    };
  }

  private async batchScope(tx: Db, actor: Actor, batchId: string, managing: boolean) {
    const batch = await tx.commercialBatch.findUnique({
      where: { id: batchId },
      include: { artisanProfile: true, offer: true, order: { include: { rfq: true } } },
    });
    if (!batch) fail(404, 'NOT_FOUND', 'Batch not found.');
    if (!managing && batch.artisanProfile.userId === actor.id) return batch;
    const member = await tx.organizationMember.findFirst({
      where: {
        userId: actor.id,
        status: 'ACTIVE',
        organizationId: batch.order.rfq.operatorOrganizationId,
        organization: { approvalStatus: 'APPROVED', type: 'INTERNAL' },
      },
      include: { roles: true, permissionGrants: true, organization: true },
    });
    const assigned =
      member && C.permissionsForMembership(member).includes('operator.production.manage')
        ? await tx.operatorAssignment.findFirst({
            where: {
              operatorId: actor.id,
              organizationId: batch.order.rfq.buyerOrganizationId,
              revokedAt: null,
            },
          })
        : null;
    if (!assigned) fail(404, 'NOT_FOUND', 'Batch not found.');
    return batch;
  }

  private command<T extends Prisma.InputJsonValue>(
    tx: Db,
    actor: Actor,
    id: string,
    operation: string,
    key: string | undefined,
    input: unknown,
    fn: () => Promise<T>,
  ) {
    if (!key) fail(400, 'INVALID_IDEMPOTENCY_KEY', 'An Idempotency-Key is required.');
    validateIdempotencyKey(key);
    return replaySafe(
      tx,
      { actorId: actor.id, resourceId: id, operation: `intelligence.${operation}`, key },
      JSON.parse(JSON.stringify(input)),
      fn,
    );
  }

  /**
   * Documented remaining capacity for the accepted offer's period, in pieces. Hours, an absent
   * declaration or a constrained projection all stay unknown rather than being coerced.
   */
  private async confirmedCapacity(
    tx: Db,
    offer: { capacityDeclarationId: string | null; status: string; quantity: number },
  ): Promise<number | null> {
    if (offer.status !== 'ACCEPTED' || !offer.capacityDeclarationId) return null;
    const declaration = await tx.capacityDeclaration.findUnique({
      where: { id: offer.capacityDeclarationId },
    });
    if (declaration?.unitType !== 'PIECES') return null;
    const projection = await projectCapacity(tx, declaration);
    if (!projection.availabilityKnown || projection.constraints.length) return null;
    // The accepted reservation belongs to this batch; add it back when assessing this batch's remaining work.
    const remaining = Number(projection.remaining) + offer.quantity;
    return Number.isFinite(remaining) ? Math.floor(remaining) : null;
  }

  private distribution(
    orders: {
      eligibleProfileIds: string[];
      offersForDistribution: { artisanProfileId: string; status: string }[];
    }[],
    minimumCohort: number,
    paidProfiles: Set<string>,
  ) {
    const counts = new Map<string, C.DistributionCount>();
    for (const order of orders)
      for (const id of order.eligibleProfileIds)
        if (!counts.has(id))
          counts.set(id, {
            artisanProfileId: id,
            offered: 0,
            accepted: 0,
            declined: 0,
            expired: 0,
            paidParticipation: paidProfiles.has(id) ? 1 : 0,
          });
    for (const order of orders)
      for (const offer of order.offersForDistribution) {
        const row = counts.get(offer.artisanProfileId) ?? {
          artisanProfileId: offer.artisanProfileId,
          offered: 0,
          accepted: 0,
          declined: 0,
          expired: 0,
          paidParticipation: paidProfiles.has(offer.artisanProfileId) ? 1 : 0,
        };
        row.offered += 1;
        if (offer.status === 'ACCEPTED') row.accepted += 1;
        if (offer.status === 'DECLINED') row.declined += 1;
        if (offer.status === 'EXPIRED') row.expired += 1;
        counts.set(offer.artisanProfileId, row);
      }
    const result = C.offerDistribution([...counts.values()], minimumCohort);
    return {
      ...result,
      note:
        result.note +
        ' Population: latest recorded eligible participants per order in the displayed order-created month, plus participants offered work. Eligible participants with no offer have zero exposure; simulated paid is distinct from verified payment.',
    };
  }

  private async access(tx: Db, actor: Actor) {
    const members = await tx.organizationMember.findMany({
      where: { userId: actor.id, status: 'ACTIVE', organization: { approvalStatus: 'APPROVED' } },
      include: { roles: true, permissionGrants: true, organization: true },
    });
    const permissions = new Set(
      members.flatMap((member) => C.permissionsForMembership(member) as string[]),
    );
    return {
      platform: permissions.has('platform.roles.manage'),
      analytics:
        permissions.has('analytics.aggregate.read') ||
        permissions.has('platform.roles.manage') ||
        permissions.has('operator.production.manage'),
      associationOutcomes:
        members.some((member) =>
          ['ASSOCIATION', 'PARTNER_COOPERATIVE'].includes(member.organization.type),
        ) &&
        (permissions.has('association.artisan.read') ||
          permissions.has('analytics.aggregate.read')),
      organizationIds: members.map((member) => member.organizationId),
      associationOrganizationIds: members
        .filter((member) =>
          ['ASSOCIATION', 'PARTNER_COOPERATIVE'].includes(member.organization.type),
        )
        .map((member) => member.organizationId),
      audit: members.some(
        (member) =>
          member.organization.type === 'INTERNAL' &&
          C.permissionsForMembership(member).includes('audit.read.scoped'),
      ),
      operatorOrganizationIds: members
        .filter(
          (member) =>
            member.organization.type === 'INTERNAL' &&
            C.permissionsForMembership(member).some((permission) =>
              [
                'operator.production.manage',
                'analytics.aggregate.read',
                'audit.read.scoped',
              ].includes(permission),
            ),
        )
        .map((member) => member.organizationId),
    };
  }
}
