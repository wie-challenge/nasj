import type { Prisma } from '@prisma/client';
import * as C from '@nasj/contracts';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import type { Db } from '../foundation/transaction.js';

/**
 * E18-06 scoping helpers. Buyer feedback is narrower than the general collaboration workspace: an
 * artisan, coordinator or unrelated employee of the same buyer organization does not inherit the
 * author's private assessment. Every helper accepts the caller's transaction and never opens one.
 */

export type FeedbackOrder = Prisma.CommercialOrderGetPayload<{
  include: { rfq: true };
}>;

export async function feedbackOrder(tx: Db, orderId: string) {
  const order = await tx.commercialOrder.findUnique({
    where: { id: orderId },
    include: { rfq: true },
  });
  if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
  return order;
}

/** Active approved membership in one specific organization, evaluated against its own grants. */
async function membership(tx: Db, actor: Actor, organizationId: string) {
  const member = await tx.organizationMember.findFirst({
    where: {
      userId: actor.id,
      organizationId,
      status: 'ACTIVE',
      organization: { approvalStatus: 'APPROVED' },
    },
    include: { roles: true, permissionGrants: true, organization: true },
  });
  return member ? { member, permissions: C.permissionsForMembership(member) } : null;
}

export async function buyerFeedbackAuthority(tx: Db, actor: Actor, order: FeedbackOrder) {
  const found = await membership(tx, actor, order.rfq.buyerOrganizationId);
  if (found?.member.organization.type !== 'BUYER_BUSINESS') return null;
  const permissions = new Set<string>(found.permissions);
  return {
    canRead:
      permissions.has('buyer.rfq.read') ||
      permissions.has('buyer.delivery.confirm') ||
      permissions.has('buyer.quotation.negotiate'),
    canWrite: permissions.has('buyer.delivery.confirm') && permissions.has('buyer.rfq.read'),
  };
}

export type SupportFeedbackAuthority = {
  organizationId: string;
  canManage: boolean;
  assignmentActive: boolean;
};

/**
 * Support follow-up needs all three: an active INTERNAL membership in this order's operator
 * organization, support.case.manage there, and an unrevoked assignment to this buyer. Ordinary
 * production, finance or sales membership is insufficient, and no default role is broadened.
 */
export async function supportFeedbackAuthority(
  tx: Db,
  actor: Actor,
  order: FeedbackOrder,
): Promise<SupportFeedbackAuthority | null> {
  const found = await membership(tx, actor, order.rfq.operatorOrganizationId);
  if (found?.member.organization.type !== 'INTERNAL') return null;
  const assignment = await tx.operatorAssignment.findFirst({
    where: { operatorId: actor.id, organizationId: order.rfq.buyerOrganizationId, revokedAt: null },
    select: { id: true },
  });
  return {
    organizationId: order.rfq.operatorOrganizationId,
    canManage: found.permissions.includes('support.case.manage'),
    assignmentActive: Boolean(assignment),
  };
}

/** Candidate follow-up owners: active same-operator support managers currently assigned here. */ export async function eligibleFollowUpOwners(
  tx: Db,
  order: FeedbackOrder,
) {
  const members = await tx.organizationMember.findMany({
    where: {
      organizationId: order.rfq.operatorOrganizationId,
      status: 'ACTIVE',
      organization: { approvalStatus: 'APPROVED' },
    },
    include: { roles: true, permissionGrants: true, organization: true, user: true },
  });
  const candidates = members.filter((member) =>
    C.permissionsForMembership(member).includes('support.case.manage'),
  );
  if (!candidates.length) return [];
  const assignments = await tx.operatorAssignment.findMany({
    where: {
      operatorId: { in: candidates.map((member) => member.userId) },
      organizationId: order.rfq.buyerOrganizationId,
      revokedAt: null,
    },
    select: { operatorId: true },
  });
  const assigned = new Set(assignments.map((row) => row.operatorId));
  return candidates
    .filter((member) => assigned.has(member.userId))
    .map((member) => ({ id: member.userId, name: member.user.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * A linked formal case is only rendered to an actor who can already see that ticket under the
 * existing support authority. Feedback projection is never an authorization shortcut.
 */
export async function visibleTicketIds(tx: Db, actor: Actor, ticketIds: string[]) {
  if (!ticketIds.length) return new Map<string, string>();
  const members = await tx.organizationMember.findMany({
    where: { userId: actor.id, status: 'ACTIVE', organization: { approvalStatus: 'APPROVED' } },
    include: { roles: true, permissionGrants: true, organization: true },
  });
  const platform = members.some((member) =>
    C.permissionsForMembership(member).includes('platform.roles.manage'),
  );
  const supportOrganizations = new Set(
    members
      .filter((member) => C.permissionsForMembership(member).includes('support.case.manage'))
      .map((member) => member.organizationId),
  );
  const tickets = await tx.supportTicket.findMany({
    where: { id: { in: ticketIds } },
    select: { id: true, reporterId: true, organizationId: true, status: true },
  });
  const visible = new Map<string, string>();
  for (const ticket of tickets) {
    if (
      platform ||
      ticket.reporterId === actor.id ||
      supportOrganizations.has(ticket.organizationId ?? '')
    )
      visible.set(ticket.id, ticket.status);
  }
  return visible;
}

type RevisionRow = {
  id: string;
  version: number;
  kind: string;
  createdAt: Date;
  category: string;
  rating: number | null;
  comment: string;
  followUpStatus: string;
  followUpOwnerId: string | null;
  followUpNote: string;
  linkedTicketId: string | null;
  reason: string;
  actor: { id: string; name: string };
  followUpOwner: { id: string; name: string } | null;
};

type FeedbackRow = {
  id: string;
  orderId: string;
  reporterId: string;
  receiptConfirmationId: string;
  sourceClass: string;
  createdAt: Date;
  currentVersion: number;
  revisions: RevisionRow[];
};

/**
 * The buyer projection never carries internal follow-up notes, and it withholds an inaccessible
 * case identifier. The support projection additionally receives the note for its own workflow.
 */
export function feedbackView(input: {
  row: FeedbackRow;
  actorId: string;
  orderProvenance: string;
  support: boolean;
  visibleTickets: Map<string, string>;
  canCorrect: boolean;
  canManageFollowUp: boolean;
}): C.OrderFeedbackView {
  const latest = input.row.revisions[0];
  if (!latest) fail(409, 'INVALID_STATE', 'This assessment has no recorded statement.');
  const label = C.feedbackSourceLabel({
    sourceClass: input.row.sourceClass as C.FeedbackSourceClass,
    orderProvenance: input.orderProvenance,
  });
  const visibleTicket = latest.linkedTicketId
    ? input.visibleTickets.get(latest.linkedTicketId)
    : undefined;
  return {
    id: input.row.id,
    orderId: input.row.orderId,
    reporterId: input.row.reporterId,
    receiptConfirmationId: input.row.receiptConfirmationId,
    sourceClass: input.row.sourceClass as C.FeedbackSourceClass,
    sourceLabel: label.label,
    syntheticOrder: label.syntheticOrder,
    createdAt: input.row.createdAt.toISOString(),
    currentVersion: input.row.currentVersion,
    category: latest.category as C.FeedbackCategory,
    rating: latest.rating,
    comment: latest.comment,
    followUpStatus: latest.followUpStatus as C.FeedbackFollowUpStatus,
    followUpOwnerId: latest.followUpOwnerId,
    followUpOwnerName: latest.followUpOwner?.name ?? null,
    linkedTicketId: visibleTicket ? latest.linkedTicketId : null,
    linkedTicketStatus: (visibleTicket as C.SupportTicketState | undefined) ?? null,
    canCorrect: input.canCorrect && input.row.reporterId === input.actorId,
    canManageFollowUp: input.canManageFollowUp,
  };
}

export function feedbackHistoryView(input: {
  feedbackId: string;
  rows: RevisionRow[];
  total: number;
  page: number;
  pageSize: number;
  viewerIsReporter: boolean;
  reporterId: string;
  visibleTickets: Map<string, string>;
}): C.OrderFeedbackHistoryView {
  return {
    feedbackId: input.feedbackId,
    viewerIsReporter: input.viewerIsReporter,
    notesWithheld: input.viewerIsReporter,
    items: input.rows.map((row) => ({
      id: row.id,
      version: row.version,
      kind: row.kind as C.FeedbackRevisionKind,
      actorName: row.actor.name,
      actorIsReporter: row.actor.id === input.reporterId,
      createdAt: row.createdAt.toISOString(),
      category: row.category as C.FeedbackCategory,
      rating: row.rating,
      comment: row.comment,
      followUpStatus: row.followUpStatus as C.FeedbackFollowUpStatus,
      followUpOwnerId: row.followUpOwnerId,
      followUpOwnerName: row.followUpOwner?.name ?? null,
      followUpNote: input.viewerIsReporter ? null : row.followUpNote,
      linkedTicketId:
        row.linkedTicketId && input.visibleTickets.has(row.linkedTicketId)
          ? row.linkedTicketId
          : null,
      reason: row.reason,
    })),
    total: input.total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export const feedbackLimitationNotes = [
  'A recorded buyer receipt is not payment, quality completion or commercial acceptance.',
  'A satisfaction assessment never resolves a formal case, settles money or closes an order.',
  'No feedback is published as a testimonial or rating outside this private workspace.',
];
