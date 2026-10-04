/**
 * Owner contract:
 * Owner: a split/merge workflow owner resuming, from the durable record, a
 * whole-group retirement step nobody is driving (owner decision 2026-10-04:
 * the workflow owner owns completion of its own durable step). The step
 * state is already durable - the table's `tables` record (cutover active
 * with the source finished mirroring, or an aborted transition whose
 * never-authoritative targets still have partition rows) plus the
 * DISSOLVED_REPLICA_IDS progress on its source participant - so an owner
 * that lost its in-memory re-drive (restart) resumes it here.
 * Triggers (events): owner start (the records already in the local view),
 * and every `tables`-record change this owner observes (the view's
 * hydration after a restart, any later write). Ownership acquisition is the
 * workflow's existing durable claim (fence + lease, compare-and-swapped on
 * the record): only the claimant drives, and its fence is what the
 * replicas verify. A claim refused because another incarnation's lease is
 * still live re-scans once at that lease's expiry - the ownership
 * protocol's own liveness bound - and a resume that then drives logs a WARN.
 * Prohibited: a missing row is never treated as completion; nothing here
 * decides retirement (group-retirement-evidence.js does) or completes a
 * step (the workflow's own finalize/teardown does).
 */
import {WORKFLOW_FAMILY, retiringWorkflowOf} from
  './group-retirement-evidence.js';

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
  AWAITING_LEASE: 'Group retirement resume awaits the current owner ' +
    'lease; re-scanning at its expiry',
});

function resumeKey(workflowId) {
  return `resume:${workflowId}`;
}

/**
 * Attach the durable resume to one workflow owner.
 * @param {Object} owner - The split or merge workflow owner (its
 *   groupRetirementRedrive, resolveWorkflowState, getPartitionInfo,
 *   listTableInfos, observeSystemRows, workflowOwnerId, now, logger).
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
  const leaseTimers = new Map();
  let resume = null;
  const awaitLease = (workflowId, workflow, tablesRow) => {
    const expiresAt = Number(workflow?.leaseExpiresAt);
    if (!Number.isFinite(expiresAt) || leaseTimers.has(workflowId)) {
      return;
    }
    owner.logger.info(RESUME_LOG_MSG.AWAITING_LEASE, {workflowId,
      ownerId: workflow.workflowOwnerId ?? null, leaseExpiresAt: expiresAt});
    const timer = scheduler.setTimeout(() => {
      leaseTimers.delete(workflowId);
      resume(currentRecord(owner, tablesRow), RESUME_TRIGGER.LEASE_EXPIRED)
        .catch(
          () => {});
    }, Math.max(0, expiresAt - owner.now()));
    timer?.unref?.();
    leaseTimers.set(workflowId, timer);
  };
  resume = async (tablesRow, trigger) => {
    const retiring = retiringWorkflowOf(tablesRow);
    if (!isResumable(owner, spec.family, retiring)) {
      return false;
    }
    const workflowId = retiring.workflowId;
    const workflow = owner.resolveWorkflowState(workflowId);
    if (!workflow?.workflowId) {
      return false;
    }
    if (!ownsLiveLease(owner, workflow)) {
      const claim = await spec.claim(workflowId);
      if (claim?.accepted !== true) {
        awaitLease(workflowId, claim?.workflow ?? workflow, tablesRow);
        return false;
      }
    }
    owner.logger.warn(RESUME_LOG_MSG.RESUMED, {workflowId, trigger,
      retiringPartitionIds: retiring.retiringPartitionIds});
    return owner.groupRetirementRedrive.exclusive(resumeKey(workflowId),
      () => retiring.aborted ?
        spec.teardown(workflowId, owner.resolveWorkflowState(workflowId)) :
        spec.finalize(workflowId));
  };
  owner.observeSystemRows?.((tableName, operation, row) => {
    if (tableName === TABLES_TABLE && operation !== DELETE_OPERATION) {
      resume(row, RESUME_TRIGGER.RECORD_CHANGED).catch(() => {});
    }
  });
  for (const tableInfo of owner.listTableInfos?.() || []) {
    resume(tableInfo, RESUME_TRIGGER.OWNER_START).catch(() => {});
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

function currentRecord(owner, tablesRow) {
  const tableId = String(tablesRow?.table_id || '');
  return (owner.listTableInfos?.() || []).find((row) =>
    String(row?.table_id || '') === tableId) || tablesRow;
}

export {WORKFLOW_FAMILY, attachGroupRetirementResume};
