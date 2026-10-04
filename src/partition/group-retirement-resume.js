/**
 * Owner contract:
 * Owner: a split/merge workflow owner resuming, from the durable record, a
 * whole-group retirement step nobody is driving (owner decision 2026-10-04:
 * the workflow owner owns completion of its own durable step). The step
 * state is already durable - the table's `tables` record (cutover active
 * with the source finished mirroring, or an aborted transition whose
 * never-authoritative targets still have partition rows) plus the frozen
 * member set and the positive answers on each retiring group's participant
 * (group-retirement-members.js) - so an owner that lost its in-memory
 * re-drive (restart) resumes it here.
 * Triggers (events): owner start (the records already in the local view),
 * and every `tables`-record change this owner observes (the view's
 * hydration after a restart, any later write). Ownership acquisition is the
 * workflow's existing durable claim (fence + lease, compare-and-swapped on
 * the record): only the claimant drives, and its fence is what the
 * replicas verify. Every exit of a resume that does not drive:
 *   a live FOREIGN lease (the claim refuses it without a write; the durable
 *   row is re-read after any refused claim) - one timer at THAT lease's
 *   expiry (the ownership protocol's own bound), logged once when armed and
 *   as a spent wait (WARN: what was awaited, the last observed owner and
 *   lease) when it fires on a still-retiring record;
 *   a refused claim with no live foreign lease on the re-read row - one
 *   WARN per record version naming the workflow, the record state and the
 *   claim result; the next durable record change resumes it (no timer, never
 *   a zero-delay retry);
 *   this owner already resuming or driving the workflow - nothing.
 * Prohibited: a missing row is never treated as completion; nothing here
 * decides retirement (group-retirement-evidence.js does) or completes a
 * step (the workflow's own finalize/teardown does).
 */
import {WORKFLOW_FAMILY, retiringWorkflowOf} from
  './group-retirement-evidence.js';
import {durableOwnershipClaimOf} from './managed-workflow-ownership-core.js';

const TABLES_TABLE = 'tables';
const DELETE_OPERATION = 'DELETE';
const RESUME_TRIGGER = Object.freeze({
  OWNER_START: 'owner-start',
  RECORD_CHANGED: 'record-changed',
  LEASE_EXPIRED: 'lease-expired',
});
const RESUME_LOG_MSG = Object.freeze({
  RESUMED: 'Group retirement resumed from the durable record by the ' +
    'workflow owner',
  AWAITING_LEASE: 'Group retirement resume awaits a foreign owner\'s ' +
    'live lease; re-scanning once at its expiry',
  LEASE_WAIT_SPENT: 'Group retirement resume: the awaited foreign lease ' +
    'expired with the record still retiring',
  CLAIM_REFUSED: 'Group retirement resume: ownership claim refused with ' +
    'no live foreign lease on the durable record; waiting for the next ' +
    'record change',
  FAILED: 'Group retirement resume failed; waiting for the next record ' +
    'change',
});
const AWAITED_FOREIGN_LEASE = 'foreign-lease-expiry';

function resumeKey(workflowId) {
  return `resume:${workflowId}`;
}

/**
 * Attach the durable resume to one workflow owner.
 * @param {Object} owner - The split or merge workflow owner (its
 *   groupRetirementRedrive, resolveWorkflowState, recoverWorkflowState,
 *   parsePartitionTransition, getPartitionInfo, listTableInfos,
 *   observeSystemRows, workflowOwnerId, now, logger).
 * @param {Object} spec
 * @param {string} spec.family - WORKFLOW_FAMILY of this owner.
 * @param {Function} spec.claim - (workflowId) => claim result.
 * @param {Function} spec.finalize - (workflowId) => dissolution step.
 * @param {Function} spec.teardown - (workflowId, workflow) => teardown.
 * @param {Object} [spec.scheduler] - {setTimeout, clearTimeout}.
 * @return {Function} resume(tablesRow, trigger) => Promise.
 */
function attachGroupRetirementResume(owner, spec) {
  const scheduler = spec.scheduler || globalThis;
  const leaseWaits = new Map();
  const resuming = new Set();
  const refusedVersions = new Map();
  let resume = null;
  // A resume that threw (a claim or recovery write failed) is never silent;
  // the next record change resumes it.
  const failed = (error) => owner.logger.warn(RESUME_LOG_MSG.FAILED,
    {error: error?.message || String(error)});
  const awaitForeignLease = (workflowId, workflow, tablesRow) => {
    if (leaseWaits.has(workflowId)) {
      return;
    }
    const awaited = {ownerId: workflow.workflowOwnerId ?? null,
      leaseExpiresAt: Number(workflow.leaseExpiresAt)};
    owner.logger.info(RESUME_LOG_MSG.AWAITING_LEASE, {workflowId,
      ...awaited});
    const timer = scheduler.setTimeout(() => {
      leaseWaits.delete(workflowId);
      const record = currentRecord(owner, tablesRow);
      if (retiringWorkflowOf(record).retiring) {
        const last = durableOwnershipClaimOf(
          owner.parsePartitionTransition?.(record)?.metadata);
        owner.logger.warn(RESUME_LOG_MSG.LEASE_WAIT_SPENT, {workflowId,
          awaited: AWAITED_FOREIGN_LEASE, ...awaited,
          lastOwnerId: last.workflowOwnerId ?? null,
          lastLeaseExpiresAt: last.leaseExpiresAt ?? null,
          recordState: record?.partition_transition_state ?? null});
      }
      resume(record, RESUME_TRIGGER.LEASE_EXPIRED).catch(failed);
    }, awaited.leaseExpiresAt - owner.now());
    timer?.unref?.();
    leaseWaits.set(workflowId, timer);
  };
  const refusedClaim = (workflowId, claim, workflow, tablesRow) => {
    const version = String(tablesRow?.partition_transition_metadata ?? '');
    if (refusedVersions.get(workflowId) === version) {
      return;
    }
    refusedVersions.set(workflowId, version);
    owner.logger.warn(RESUME_LOG_MSG.CLAIM_REFUSED, {workflowId,
      result: claim?.result ?? null,
      recordState: tablesRow?.partition_transition_state ?? null,
      ownerId: workflow?.workflowOwnerId ?? null,
      leaseExpiresAt: workflow?.leaseExpiresAt ?? null});
  };
  // Whether this owner holds (or just claimed) the workflow; otherwise the
  // wait it took (a foreign lease's expiry, or the next record change).
  const holdOrClaim = async (workflowId, tablesRow) => {
    const workflow = owner.resolveWorkflowState(workflowId);
    if (!workflow?.workflowId) {
      return false;
    }
    if (ownsLiveLease(owner, workflow)) {
      return true;
    }
    // The claim itself refuses a live foreign lease without writing
    // (ACTIVE_OWNER); every refusal then re-reads the durable row.
    const claim = await spec.claim(workflowId);
    if (claim?.accepted === true) {
      scheduler.clearTimeout(leaseWaits.get(workflowId));
      leaseWaits.delete(workflowId);
      return true;
    }
    // A refused claim proves the in-memory workflow stale: re-read the
    // durable row before deciding what to wait for.
    const durable = owner.recoverWorkflowState(workflowId);
    if (holdsLiveForeignLease(owner, durable)) {
      awaitForeignLease(workflowId, durable, tablesRow);
      return false;
    }
    refusedClaim(workflowId, claim, durable, currentRecord(owner, tablesRow));
    return false;
  };
  resume = async (tablesRow, trigger) => {
    const retiring = retiringWorkflowOf(tablesRow);
    if (!isResumable(owner, spec.family, retiring) ||
        resuming.has(retiring.workflowId)) {
      return false;
    }
    const workflowId = retiring.workflowId;
    resuming.add(workflowId);
    try {
      if (!await holdOrClaim(workflowId, tablesRow)) {
        return false;
      }
      owner.logger.warn(RESUME_LOG_MSG.RESUMED, {workflowId, trigger,
        retiringPartitionIds: retiring.retiringPartitionIds});
      return await owner.groupRetirementRedrive.exclusive(
        resumeKey(workflowId), () => retiring.aborted ?
          spec.teardown(workflowId, owner.resolveWorkflowState(workflowId)) :
          spec.finalize(workflowId));
    } finally {
      resuming.delete(workflowId);
    }
  };
  owner.observeSystemRows?.((tableName, operation, row) => {
    if (tableName === TABLES_TABLE && operation !== DELETE_OPERATION) {
      resume(row, RESUME_TRIGGER.RECORD_CHANGED).catch(failed);
    }
  });
  for (const tableInfo of owner.listTableInfos?.() || []) {
    resume(tableInfo, RESUME_TRIGGER.OWNER_START).catch(failed);
  }
  return resume;
}

// A retiring record of this owner's family that nobody here drives yet, and
// (aborted) whose targets still have partition rows.
function isResumable(owner, family, retiring) {
  if (!retiring.retiring || retiring.family !== family ||
      owner.groupRetirementRedrive.isDriving(retiring.workflowId)) {
    return false;
  }
  return !retiring.aborted || retiring.retiringPartitionIds.some((id) =>
    owner.getPartitionInfo(id));
}

function ownsLiveLease(owner, workflow) {
  return workflow.workflowOwnerId === owner.workflowOwnerId &&
    Number(workflow.leaseExpiresAt) > owner.now();
}

// Another incarnation holds a lease with a finite expiry still ahead.
function holdsLiveForeignLease(owner, workflow) {
  const expiresAt = Number(workflow?.leaseExpiresAt);
  return Boolean(workflow?.workflowOwnerId) &&
    workflow.workflowOwnerId !== owner.workflowOwnerId &&
    Number.isFinite(expiresAt) && expiresAt > owner.now();
}

function currentRecord(owner, tablesRow) {
  const tableId = String(tablesRow?.table_id || '');
  return (owner.listTableInfos?.() || []).find((row) =>
    String(row?.table_id || '') === tableId) || tablesRow;
}

export {WORKFLOW_FAMILY, attachGroupRetirementResume};
