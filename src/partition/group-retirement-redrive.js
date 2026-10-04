/**
 * Owner contract:
 * Owner: the workflow owner's completion of a whole-group retirement step
 * whose REMOVEs some members did not acknowledge (owner decision 2026-10-04:
 * the workflow owner owns completion of its own durable step; one owner, no
 * second mechanism). The step itself is the workflow's own (split/merge
 * dissolution, aborted child/target teardown) and completes only when every
 * member of its frozen set answered positively (group-retirement-members.js);
 * this owner only decides WHEN it is run again, and keeps the unacknowledged
 * members observable.
 * Triggers, events first - each only RE-RUNS the step, none completes it:
 *   FAILED_ACK      the step's own failed outcome re-runs it once at once
 *                   (a REMOVE lost in transit is re-delivered);
 *   NODE_READY      a nodes-row change showing a ready heartbeat for a node
 *                   that hosts an unacknowledged member re-runs it;
 *   NODE_DEPARTED   that node's row deleted (node removed) or rewritten
 *                   not-ready re-runs it (a re-check, never proof the member
 *                   is gone);
 *   MEMBER_ROW_CHANGED an unacknowledged member's services row written or
 *                   deleted re-runs it: a written row may give the member an
 *                   address; a deleted row is never proof the member is gone
 *                   (owner ruling 2026-10-04) - the member stays required
 *                   and listed;
 *   GROUP_LEADER    for a step whose membership could not be read (no
 *                   leader answered, or a configuration change was
 *                   pending), the group gaining a leader - its leader's
 *                   services row written with the leader role, or its
 *                   partitions row's leader_node_id written (the canonical
 *                   leader publication) - re-runs it;
 *   GROUP_ROW_CHANGED for such a step, any other services or partitions
 *                   row of its group (a hydrating view, a member's row
 *                   after a configuration change applied) re-runs it;
 *   OWNERSHIP       the owner's resume of the durable record on ownership
 *                   acquisition (owner start, a `tables` record change,
 *                   group-retirement-resume.js);
 *   RESUME          the durable record re-delivered to this owner (the
 *                   finished source re-delivers its acknowledgement on
 *                   leader activation: owner restart, ownership change) runs
 *                   the step through the workflow's own ack path;
 *   FALLBACK        a bounded exponential backoff, only for a node that no
 *                   event reports ready (only its own runs spend its bound;
 *                   an event-triggered re-run re-arms it at the current
 *                   delay); every fallback run logs a WARN
 *                   naming the workflow, the group and the unacknowledged
 *                   replicas, and when the bound is spent one ERROR per
 *                   entry - it never ends anything silently, and an
 *                   exhausted entry stays re-drivable by every event above;
 *   STALLED         a re-run that neither completed nor re-reported (it
 *                   returned early) arms the fallback with a WARN.
 * Acknowledgement is the member's COMPLETED answer only (its replica durably
 * retired; initiated and in-progress keep it listed, re-driven by its row
 * events): NOT_FOUND is not one - a node can answer it before its replicas
 * are registered at startup.
 * Canonical output: the step re-run; `unacknowledged()` - every tracked
 * workflow, group and unacknowledged replica, or the group's membership
 * marked unavailable (a lone un-notified survivor is listed here, never
 * silent). A member that never answers stays listed with its alarm: the
 * only future exit for it is an explicit durable operator retirement fact,
 * which does not exist yet.
 * Prohibited: no step is completed here; a superseded owner (its evidence
 * refused for workflow or fence) stops re-driving.
 */

import {wasNodeRecordReadyWhenWritten} from '../node/node-readiness-policy.js';
import {RAFT_ROLE} from '../raft/constants.js';

const REDRIVE_TRIGGER = Object.freeze({
  FAILED_ACK: 'failed-ack',
  NODE_READY: 'node-ready',
  NODE_DEPARTED: 'node-departed',
  MEMBER_ROW_CHANGED: 'member-row-changed',
  GROUP_ROW_CHANGED: 'group-row-changed',
  GROUP_LEADER: 'group-leader',
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
const PARTITIONS_TABLE = 'partitions';
const TABLES_TABLE = 'tables';
const DELETE_OPERATION = 'DELETE';

function fieldsOf(entry) {
  return {workflowId: entry.workflowId, partitionId: entry.partitionId,
    unacknowledgedReplicaIds: entry.unacknowledged.map((member) =>
      member.replicaId),
    membershipUnavailable: entry.membershipUnavailable};
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
   * @param {boolean} [report.membershipUnavailable] - The group's frozen
   *   member set could not be established (its committed configuration was
   *   not readable): the step waits for its group's rows to change.
   * @param {Function} report.redrive - async () => re-runs the step.
   */
  report({workflowId, partitionId, unacknowledged, superseded = false,
    membershipUnavailable = false, redrive}) {
    const key = `${workflowId}\u0000${partitionId}`;
    const fields = {workflowId, partitionId,
      unacknowledgedReplicaIds: unacknowledged.map((member) =>
        member.replicaId), membershipUnavailable};
    if (superseded) {
      this.settle(workflowId, partitionId);
      this.logger.warn(REDRIVE_LOG_MSG.SUPERSEDED, fields);
      return;
    }
    const entry = this.entries.get(key) ||
      {key, workflowId, partitionId, attempts: 0, fallbackRuns: 0,
        timer: null, exhausted: false};
    entry.unacknowledged = unacknowledged;
    entry.membershipUnavailable = membershipUnavailable;
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
   *   {workflowId, partitionId, unacknowledgedReplicaIds,
   *   membershipUnavailable, attempts}.
   */
  unacknowledged() {
    return [...this.entries.values()].map((entry) => Object.freeze({
      ...fieldsOf(entry),
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
    // Only the fallback's own runs spend its bound: a re-run an event
    // triggered re-arms it at the current backoff, so a stream of row events
    // never exhausts the timer left for a node no event reports ready.
    const fallbackRuns = entry.fallbackRuns;
    if (fallbackRuns >= REDRIVE_DEFAULT.FALLBACK_ATTEMPTS) {
      // Once per entry; it stays tracked and re-drivable by every event.
      if (!entry.exhausted) {
        entry.exhausted = true;
        this.logger.error(REDRIVE_LOG_MSG.EXHAUSTED, fieldsOf(entry));
      }
      return;
    }
    const delayMs = Math.min(REDRIVE_DEFAULT.BACKOFF_MAX_MS,
      REDRIVE_DEFAULT.BACKOFF_BASE_MS * (2 ** fallbackRuns));
    this.scheduler.clearTimeout(entry.timer);
    entry.timer = this.scheduler.setTimeout(() => {
      entry.fallbackRuns += 1;
      this.logger.warn(REDRIVE_LOG_MSG.FALLBACK, {...fieldsOf(entry),
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
    for (const entry of [...this.entries.values()]) {
      if (entryMatchesRow(entry, tableName, row)) {
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
    if (announcesLeader(tableName, row)) {
      return REDRIVE_TRIGGER.GROUP_LEADER;
    }
    if (tableName === SERVICES_TABLE) {
      return REDRIVE_TRIGGER.MEMBER_ROW_CHANGED;
    }
    return tableName === PARTITIONS_TABLE ?
      REDRIVE_TRIGGER.GROUP_ROW_CHANGED : null;
  }
}

// Whether a row announces its group's leader: the leader's own services row,
// or the partitions row's canonical leader publication.
function announcesLeader(tableName, row) {
  if (tableName === SERVICES_TABLE) {
    return String(row?.raft_role || '') === RAFT_ROLE.LEADER;
  }
  return tableName === PARTITIONS_TABLE &&
    String(row?.leader_node_id || '').length > 0;
}

// Whether one system-row change concerns an entry: the node or services row
// of one of its unacknowledged members, or - its membership unavailable - a
// services or partitions row of its group.
function entryMatchesRow(entry, tableName, row) {
  const groupRow = String(row?.partition_id ?? '') === entry.partitionId;
  if (tableName === NODES_TABLE) {
    return entry.unacknowledged.some((member) =>
      member.nodeId === String(row?.node_id || ''));
  }
  if (tableName === PARTITIONS_TABLE) {
    return entry.membershipUnavailable && groupRow;
  }
  return (entry.membershipUnavailable && groupRow) ||
    entry.unacknowledged.some((member) => member.replicaId ===
      String(row?.replica_id ?? row?.service_id ?? ''));
}

const OBSERVED_TABLES = Object.freeze(new Set([NODES_TABLE, SERVICES_TABLE,
  PARTITIONS_TABLE, TABLES_TABLE]));

/**
 * Deliver every nodes-, services-, partitions- and tables-row change of a
 * system-table cache to `listener`.
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
  observeSystemRows,
};
