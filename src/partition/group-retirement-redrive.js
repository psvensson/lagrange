/**
 * Owner contract:
 * Owner: the workflow owner's completion of a whole-group retirement step
 * whose REMOVEs some members did not acknowledge (owner decision 2026-10-04:
 * the workflow owner owns completion of its own durable step; one owner, no
 * second mechanism). The step itself is the workflow's own (split/merge
 * dissolution, aborted child/target teardown); this owner only decides WHEN
 * it is run again, and keeps the unacknowledged members observable.
 * Triggers, events first:
 *   FAILED_ACK      the step's own failed outcome re-runs it once at once
 *                   (a REMOVE lost in transit is re-delivered);
 *   NODE_READY      a nodes-row change showing a ready heartbeat for a node
 *                   that hosts an unacknowledged member re-runs it;
 *   NODE_DEPARTED   that node's row deleted (node removed) or rewritten
 *                   not-ready re-runs it (a re-check, never proof the member
 *                   is gone);
 *   MEMBER_ROW_DELETED an unacknowledged member's services row deleted
 *                   (its node's own cleanup) re-runs it: the member is no
 *                   longer part of the group's durable membership list;
 *   OWNERSHIP       the owner's resume of the durable record on ownership
 *                   acquisition (owner start, a `tables` record change,
 *                   group-retirement-resume.js);
 *   RESUME          the durable record re-delivered to this owner (the
 *                   finished source re-delivers its acknowledgement on
 *                   leader activation: owner restart, ownership change) runs
 *                   the step through the workflow's own ack path;
 *   FALLBACK        a bounded exponential backoff, only for a node that no
 *                   event reports ready; every fallback run logs a WARN
 *                   naming the workflow, the group and the unacknowledged
 *                   replicas, and when the bound is spent one ERROR per
 *                   entry - it never ends anything silently, and an
 *                   exhausted entry stays re-drivable by every event above;
 *   STALLED         a re-run that neither completed nor re-reported (it
 *                   returned early) arms the fallback with a WARN.
 * Acknowledgement is a positive answer only (initiated, in progress,
 * completed): NOT_FOUND is not one - a node can answer it before its
 * replicas are registered at startup.
 * Canonical output: the step re-run; `unacknowledged()` - every tracked
 * workflow, group and unacknowledged replica (a lone un-notified survivor is
 * listed here, never silent).
 * Prohibited: no step is completed here; a superseded owner (its evidence
 * refused for workflow or fence) stops re-driving.
 */

import {ReplicaOperationResponseStatus} from
  '../rebalancer/replica-operation-constants.js';
import {wasNodeRecordReadyWhenWritten} from '../node/node-readiness-policy.js';
import {GROUP_RETIREMENT_REFUSAL} from './group-retirement-evidence.js';

const REDRIVE_TRIGGER = Object.freeze({
  FAILED_ACK: 'failed-ack',
  NODE_READY: 'node-ready',
  NODE_DEPARTED: 'node-departed',
  MEMBER_ROW_DELETED: 'member-row-deleted',
  FALLBACK: 'fallback-backoff',
});

const REDRIVE_LOG_MSG = Object.freeze({
  INCOMPLETE: 'Group retirement incomplete: replicas did not acknowledge ' +
    'their REMOVE; the workflow owner re-drives them',
  FALLBACK: 'Group retirement re-driven by the fallback backoff: no event ' +
    'reported the unacknowledged replicas\' nodes ready',
  EXHAUSTED: 'Group retirement fallback backoff exhausted: waiting for a ' +
    'node-ready event or a durable resume',
  SUPERSEDED: 'Group retirement re-drive stopped: this owner\'s evidence ' +
    'was refused as superseded',
  STALLED: 'Group retirement re-run returned without completing or ' +
    'reporting; the fallback is armed',
});

const REDRIVE_DEFAULT = Object.freeze({
  BACKOFF_BASE_MS: 1000,
  BACKOFF_MAX_MS: 30000,
  FALLBACK_ATTEMPTS: 8,
});

const NODES_TABLE = 'nodes';
const SERVICES_TABLE = 'services';
const TABLES_TABLE = 'tables';
const DELETE_OPERATION = 'DELETE';
const ACCEPTED_REMOVAL_STATUSES = Object.freeze(new Set([
  ReplicaOperationResponseStatus.INITIATED,
  ReplicaOperationResponseStatus.IN_PROGRESS,
  ReplicaOperationResponseStatus.COMPLETED,
]));
// A refusal saying this owner's evidence is not the record's: a newer owner
// (fence) or another workflow holds the record.
const SUPERSEDED_REFUSALS = Object.freeze(new Set([
  GROUP_RETIREMENT_REFUSAL.WORKFLOW_MISMATCH,
  GROUP_RETIREMENT_REFUSAL.FENCE_MISMATCH,
]));
const INCOMPLETE_ERROR = 'Group retirement incomplete: unacknowledged ' +
  'replicas ';
const REPLICA_ID_SEPARATOR = ',';

function fieldsOf(entry) {
  return {workflowId: entry.workflowId, partitionId: entry.partitionId,
    unacknowledgedReplicaIds: entry.unacknowledged.map((member) =>
      member.replicaId)};
}

function rowField(row, snake, camel) {
  return String(row?.[snake] ?? row?.[camel] ?? '');
}

/**
 * Deliver the group-retirement REMOVE to every member not yet acknowledged
 * (one pass, never stopping at the first failure), and answer which members
 * acknowledged. When any did not, throws an Error carrying
 * {unacknowledged: [{replicaId, nodeId, refusal}], superseded,
 * acknowledgedReplicaIds}: the step is incomplete, so its caller neither
 * deletes the group's row nor reports completion.
 * @param {Object} options
 * @param {Array<Object>} options.serviceRows - The group's services rows.
 * @param {Array<string>} [options.acknowledgedReplicaIds] - Already
 *   acknowledged (durable progress): not re-sent.
 * @param {Function} options.deliver - async ({replicaId, nodeId}) =>
 *   the handler's answer (or null when undelivered).
 * @return {Promise<string[]>} Every acknowledged replica id.
 */
async function dispatchGroupRetirementRemovals({serviceRows,
  acknowledgedReplicaIds = [], deliver}) {
  const acknowledged = [...acknowledgedReplicaIds];
  const unacknowledged = [];
  for (const row of serviceRows) {
    const member = {
      replicaId: rowField(row, 'replica_id', 'replicaId'),
      nodeId: rowField(row, 'node_id', 'nodeId'),
    };
    if (!member.replicaId || !member.nodeId ||
        acknowledged.includes(member.replicaId)) {
      continue;
    }
    const answer = await deliver(member).catch(() => null);
    if (ACCEPTED_REMOVAL_STATUSES.has(String(answer?.status || ''))) {
      acknowledged.push(member.replicaId);
    } else {
      unacknowledged.push({...member,
        refusal: answer?.groupRetirementRefusal ?? null});
    }
  }
  if (unacknowledged.length > 0) {
    throw incompleteRetirementError(unacknowledged, acknowledged);
  }
  return acknowledged;
}

function incompleteRetirementError(unacknowledged, acknowledged) {
  return Object.assign(new Error(INCOMPLETE_ERROR +
    unacknowledged.map((member) => member.replicaId)
      .join(REPLICA_ID_SEPARATOR)), {
    unacknowledged,
    superseded: unacknowledged.some((member) =>
      SUPERSEDED_REFUSALS.has(member.refusal)),
    acknowledgedReplicaIds: acknowledged,
  });
}

/**
 * The workflow owner's re-drive of an incomplete group retirement.
 */
class GroupRetirementRedrive {
  /**
   * @param {Object} options
   * @param {Object} options.logger
   * @param {Function} [options.observeSystemRows] - (listener(tableName,
   *   operation, row)) => unsubscribe; delivers system-row changes.
   * @param {Function} [options.isNodeRowReady] - (row) => boolean.
   * @param {Object} [options.scheduler] - {setTimeout, clearTimeout}.
   */
  constructor({logger, observeSystemRows = null,
    isNodeRowReady = () => false, scheduler = globalThis}) {
    this.logger = logger;
    this.observeSystemRows = observeSystemRows;
    this.isNodeRowReady = isNodeRowReady;
    this.scheduler = scheduler;
    this.entries = new Map();
    this.unsubscribe = null;
    this.inFlight = new Map();
  }

  /**
   * Run one step exclusively per key: a call while it runs schedules exactly
   * one more run after it (a trigger is never lost, never doubled).
   * @param {string} key
   * @param {Function} step - async () => *.
   * @return {Promise<*>}
   */
  exclusive(key, step) {
    const running = this.inFlight.get(key);
    if (running) {
      running.again = true;
      return running.promise;
    }
    const slot = {again: false, promise: null};
    slot.promise = (async () => {
      try {
        let result = await step();
        while (slot.again) {
          slot.again = false;
          result = await step();
        }
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, slot);
    return slot.promise;
  }

  /**
   * Record that a step left members unacknowledged, and arm its triggers.
   * @param {Object} report
   * @param {string} report.workflowId
   * @param {string} report.partitionId - The retiring group.
   * @param {Array<Object>} report.unacknowledged - [{replicaId, nodeId}].
   * @param {boolean} [report.superseded] - The evidence was refused as
   *   superseded (workflow or fence): stop re-driving.
   * @param {Function} report.redrive - async () => re-runs the step.
   */
  report({workflowId, partitionId, unacknowledged, superseded = false,
    redrive}) {
    const key = `${workflowId}\u0000${partitionId}`;
    const fields = {workflowId, partitionId,
      unacknowledgedReplicaIds: unacknowledged.map((member) =>
        member.replicaId)};
    if (superseded) {
      this.settle(workflowId, partitionId);
      this.logger.warn(REDRIVE_LOG_MSG.SUPERSEDED, fields);
      return;
    }
    const entry = this.entries.get(key) ||
      {key, workflowId, partitionId, attempts: 0, timer: null,
        exhausted: false};
    entry.unacknowledged = unacknowledged;
    entry.redrive = redrive;
    entry.attempts += 1;
    this.entries.set(key, entry);
    this.logger.warn(REDRIVE_LOG_MSG.INCOMPLETE,
      {...fields, attempt: entry.attempts});
    this.subscribeNodeRows();
    if (entry.attempts === 1) {
      this.run(entry, REDRIVE_TRIGGER.FAILED_ACK);
      return;
    }
    this.armFallback(entry);
  }

  /**
   * The step completed: forget it.
   * @param {string} workflowId
   * @param {string} partitionId
   */
  settle(workflowId, partitionId) {
    const key = `${workflowId}\u0000${partitionId}`;
    const entry = this.entries.get(key);
    if (entry) {
      this.scheduler.clearTimeout(entry.timer);
      this.entries.delete(key);
    }
    if (this.entries.size === 0 && this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * @return {Array<Object>} Every incomplete retirement:
   *   {workflowId, partitionId, unacknowledgedReplicaIds, attempts}.
   */
  unacknowledged() {
    return [...this.entries.values()].map((entry) => Object.freeze({
      workflowId: entry.workflowId,
      partitionId: entry.partitionId,
      unacknowledgedReplicaIds: entry.unacknowledged.map((member) =>
        member.replicaId),
      attempts: entry.attempts,
    }));
  }

  /** @private */
  run(entry, trigger) {
    this.scheduler.clearTimeout(entry.timer);
    entry.timer = null;
    entry.lastTrigger = trigger;
    const reported = entry.attempts;
    Promise.resolve().then(() => entry.redrive(trigger)).catch((error) => {
      this.logger.warn(REDRIVE_LOG_MSG.INCOMPLETE, {
        workflowId: entry.workflowId, partitionId: entry.partitionId,
        trigger, error: error?.message || String(error)});
    }).then(() => this.armIfStalled(entry, reported));
  }

  /**
   * A re-run that neither settled nor re-reported returned early: the entry
   * would otherwise wait silently for events only.
   * @private
   */
  armIfStalled(entry, reported) {
    if (this.entries.get(entry.key) !== entry || entry.attempts !== reported ||
        entry.timer) {
      return;
    }
    entry.attempts += 1;
    this.logger.warn(REDRIVE_LOG_MSG.STALLED, fieldsOf(entry));
    this.armFallback(entry);
  }

  /** @private */
  armFallback(entry) {
    const fallbackRuns = entry.attempts - 1;
    if (fallbackRuns > REDRIVE_DEFAULT.FALLBACK_ATTEMPTS) {
      // Once per entry; it stays tracked and re-drivable by every event.
      if (!entry.exhausted) {
        entry.exhausted = true;
        this.logger.error(REDRIVE_LOG_MSG.EXHAUSTED, fieldsOf(entry));
      }
      return;
    }
    const delayMs = Math.min(REDRIVE_DEFAULT.BACKOFF_MAX_MS,
      REDRIVE_DEFAULT.BACKOFF_BASE_MS * (2 ** (fallbackRuns - 1)));
    this.scheduler.clearTimeout(entry.timer);
    entry.timer = this.scheduler.setTimeout(() => {
      this.logger.warn(REDRIVE_LOG_MSG.FALLBACK, {
        workflowId: entry.workflowId, partitionId: entry.partitionId,
        unacknowledgedReplicaIds: entry.unacknowledged.map((member) =>
          member.replicaId),
        delayMs});
      this.run(entry, REDRIVE_TRIGGER.FALLBACK);
    }, delayMs);
    entry.timer?.unref?.();
  }

  /**
   * Whether this owner is running or tracking a step of the workflow.
   * @param {string} workflowId
   * @return {boolean}
   */
  isDriving(workflowId) {
    return [...this.inFlight.keys(), ...[...this.entries.values()].map(
      (entry) => entry.workflowId)].some((key) => key === workflowId ||
      key.startsWith(`${workflowId}:`));
  }

  /** @private */
  subscribeNodeRows() {
    if (this.unsubscribe || typeof this.observeSystemRows !== 'function') {
      return;
    }
    this.unsubscribe = this.observeSystemRows((tableName, operation, row) =>
      this.onSystemRow(tableName, operation, row)) || null;
  }

  /** @private */
  onSystemRow(tableName, operation, row) {
    const trigger = this.triggerOf(tableName, operation, row);
    if (!trigger) {
      return;
    }
    const matches = tableName === NODES_TABLE ?
      (member) => member.nodeId === String(row?.node_id || '') :
      (member) => member.replicaId ===
        String(row?.replica_id ?? row?.service_id ?? '');
    for (const entry of [...this.entries.values()]) {
      if (entry.unacknowledged.some(matches)) {
        this.run(entry, trigger);
      }
    }
  }

  /** @private */
  triggerOf(tableName, operation, row) {
    if (tableName === NODES_TABLE) {
      if (operation === DELETE_OPERATION) {
        return REDRIVE_TRIGGER.NODE_DEPARTED;
      }
      return this.isNodeRowReady(row) ? REDRIVE_TRIGGER.NODE_READY :
        REDRIVE_TRIGGER.NODE_DEPARTED;
    }
    if (tableName === SERVICES_TABLE && operation === DELETE_OPERATION) {
      return REDRIVE_TRIGGER.MEMBER_ROW_DELETED;
    }
    return null;
  }
}

const OBSERVED_TABLES = Object.freeze(new Set([NODES_TABLE, SERVICES_TABLE,
  TABLES_TABLE]));

/**
 * Deliver every nodes-, services- and tables-row change of a system-table
 * cache to `listener`.
 * @param {Object|null} cache - The runtime's system-table cache.
 * @param {Function} listener - (tableName, operation, row) => void.
 * @return {Function|null} Unsubscribe, or null when there is no cache.
 */
function observeSystemRows(cache, listener) {
  if (typeof cache?.onCacheChange !== 'function') {
    return null;
  }
  const onChange = (tableName, operation, row) => {
    if (OBSERVED_TABLES.has(tableName)) {
      listener(tableName, operation, row);
    }
  };
  cache.onCacheChange(onChange);
  return () => cache.offCacheChange?.(onChange);
}

/**
 * The re-drive of one workflow owner, observing node readiness through the
 * owner's topology (`observeNodeRows`), a node-row being ready when it
 * encoded a ready heartbeat at write time.
 * @param {Object} workflow - The workflow owner.
 * @param {Object} options - Its constructor options
 *   (groupRetirementScheduler: {setTimeout, clearTimeout}).
 * @return {GroupRetirementRedrive}
 */
function createGroupRetirementRedrive(workflow, options) {
  return options.groupRetirementRedrive || new GroupRetirementRedrive({
    logger: workflow.logger,
    observeSystemRows: (listener) => workflow.observeSystemRows(listener),
    isNodeRowReady: (row) => wasNodeRecordReadyWhenWritten(row),
    scheduler: options.groupRetirementScheduler || globalThis,
  });
}

export {
  createGroupRetirementRedrive,
  dispatchGroupRetirementRemovals,
  observeSystemRows,
};
