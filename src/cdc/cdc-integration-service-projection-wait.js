/**
 * The one projection wait of the CDC integration owner (quest
 * replica-admission-from-committed-operation, attempt 2): a routed
 * system-table write answers at its commit with its position
 * {tableName, key, originHlc}; a consumer that needs its own node's
 * SystemTableCache to reflect that write waits for that position here. There
 * is no timer: the wait ends when the cache row for the key carries the
 * write's origin HLC or a later one (for a deletion: the row is absent on a
 * cache whose source position is current - CDC Stage 3: absence on a gapped
 * or position-unknown cache proves nothing - or carries a later origin), when
 * the owner shuts down, or when the waiting
 * client disconnects (typed). A write is never answered from this
 * projection. Each wait logs its start and end, and getProjectionWaitDiagnostics
 * counts the waits in progress: with no timer, those are what makes a wait
 * that does not end visible (a row whose stamp a skewed clock keeps below
 * the position is one such wait).
 */

import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {CDC_LOG_MSG} from './cdc-constants.js';
import {SOURCE_POSITION_STATE, SystemTableCacheSourceOrder} from
  '../cache/system-table-cache-cdc-observation.js';
import {CDC_PROPAGATED_TABLES} from '../cache/cdc-table-policy.js';
import {INITIAL_PARTITION_IDS} from '../bootstrap/system-table-schemas-constants.js';

const PROJECTION_WAIT_OUTCOME = Object.freeze({
  REACHED: 'reached',
  SHUTDOWN: 'shutdown',
  CLIENT_DISCONNECTED: 'client_disconnected',
  POSITION_UNKNOWN: 'position_unknown',
  POSITION_INVALID: 'position_invalid',
  PROJECTION_UNAVAILABLE: 'projection_unavailable',
});
const PROJECTION_WAIT_MESSAGE = Object.freeze({
  [PROJECTION_WAIT_OUTCOME.SHUTDOWN]:
    'Projection wait ended: the CDC integration owner shut down',
  [PROJECTION_WAIT_OUTCOME.CLIENT_DISCONNECTED]:
    'Projection wait ended: the client that asked disconnected',
  [PROJECTION_WAIT_OUTCOME.POSITION_UNKNOWN]:
    'Projection wait refused: the write position carries no origin HLC',
  [PROJECTION_WAIT_OUTCOME.POSITION_INVALID]:
    'Projection wait refused: not a write position',
  [PROJECTION_WAIT_OUTCOME.PROJECTION_UNAVAILABLE]:
    'Projection wait refused: this owner has no observable SystemTableCache',
});
const ABORT_EVENT = 'abort';
const ORIGIN_HLC_FIELDS = Object.freeze(['updated_at_hlc', 'updatedAtHlc']);
const PROTOTYPE_CONSTRUCTOR_NAME = 'constructor';
const ORDER_SAME = 0;

function projectionWaitError(outcome) {
  return Object.assign(new Error(PROJECTION_WAIT_MESSAGE[outcome]),
    {code: outcome});
}

function rowOriginHlc(row) {
  const field = ORIGIN_HLC_FIELDS.find((name) =>
    typeof row?.[name] === 'string' && row[name].length > 0);
  return field === undefined ? null : row[field];
}

// The HLC order of a row's origin against the position's: null when either
// is not an HLC (an unordered row never satisfies a position).
function originOrder(row, positionHlc) {
  const rowHlc = HLCTimestamp.tryFromString(rowOriginHlc(row));
  const target = HLCTimestamp.tryFromString(positionHlc);
  return rowHlc && target ? rowHlc.compare(target) : null;
}

/**
 * Whether the cache has applied the write at `position`.
 * @param {Object} cache - The SystemTableCache.
 * @param {Object} position - {tableName, key, originHlc, deleted?}.
 * @return {boolean}
 */
// Whether this node's cache is current for a propagated table's source (CDC
// Stage 3 position cell): an absence proves a deletion only on a current
// cache. A gapped or position-unknown cache may simply never have received
// the row. Unpositioned tables and caches without a source-order owner have
// no cell and are judged as before. A read-model fact: it grants nothing.
function sourceCurrent(service, tableName) {
  const sourceOrder = service.cacheMutationTarget?.sourceOrder;
  const sourcePartition = INITIAL_PARTITION_IDS[tableName];
  if (!(sourceOrder instanceof SystemTableCacheSourceOrder) ||
      !CDC_PROPAGATED_TABLES.includes(tableName) || typeof sourcePartition !== 'string') {
    return true;
  }
  return sourceOrder.positionOf(sourcePartition).state === SOURCE_POSITION_STATE.CURRENT;
}

function projectionReached(cache, position, current = true) {
  const row = cache.get(position.tableName, position.key) ?? null;
  if (position.deleted === true) {
    const order = row === null ? null : originOrder(row, position.originHlc);
    return (row === null && current) || (order !== null && order > ORDER_SAME);
  }
  const order = row === null ? null : originOrder(row, position.originHlc);
  return order !== null && order >= ORDER_SAME;
}

function positionRefusal(position) {
  if (!position || typeof position.tableName !== 'string' ||
      position.key === undefined || position.key === null) {
    return PROJECTION_WAIT_OUTCOME.POSITION_INVALID;
  }
  return HLCTimestamp.tryFromString(position.originHlc) ? null :
    PROJECTION_WAIT_OUTCOME.POSITION_UNKNOWN;
}

function waitObservation(service, waiter) {
  return {
    tableName: waiter.position.tableName,
    key: waiter.position.key,
    originHlc: waiter.position.originHlc,
    statement: waiter.statement,
    nodeId: service.nodeId,
  };
}

function openProjectionWaiter(service, position, statement = null) {
  const waiter = {position, statement, startedAtMs: service.timeSource.now()};
  service.projectionWaiters ??= new Set();
  service.projectionWaiters.add(waiter);
  service.logger.info(CDC_LOG_MSG.PROJECTION_WAIT_STARTED,
    waitObservation(service, waiter));
  return waiter;
}

function closeProjectionWaiter(service, waiter, outcome) {
  service.projectionWaiters.delete(waiter);
  service.logger.info(CDC_LOG_MSG.PROJECTION_WAIT_ENDED, {
    ...waitObservation(service, waiter),
    outcome,
    waitedMs: service.timeSource.now() - waiter.startedAtMs,
  });
}

class CDCIntegrationServiceProjectionWait {
  /**
   * Wait until this node's SystemTableCache reflects the write at
   * `position`. Ends only when it does or at shutdown.
   * @param {Object} position - {tableName, key, originHlc, deleted?}, as a
   *   routed write answers it.
   * @param {Object} [options]
   * @param {AbortSignal} [options.abortSignal] - The client's session: its
   *   abort ends the wait typed (client_disconnected); the write stays
   *   committed.
   * @param {string} [options.statement] - What waits, for the observable.
   * @return {Promise<Object>} {outcome: 'reached', position}; rejects with
   *   a typed error (code shutdown | client_disconnected | position_unknown |
   *   position_invalid | projection_unavailable).
   */
  async awaitProjectionAt(position, options = {}) {
    const refusal = positionRefusal(position);
    if (refusal !== null) throw projectionWaitError(refusal);
    const cache = this.systemTableCache;
    if (!cache || typeof cache.get !== 'function' ||
        typeof cache.onCacheChange !== 'function') {
      throw projectionWaitError(PROJECTION_WAIT_OUTCOME.PROJECTION_UNAVAILABLE);
    }
    const reached = Object.freeze({outcome: PROJECTION_WAIT_OUTCOME.REACHED,
      position});
    const isReached = () => projectionReached(cache, position,
      sourceCurrent(this, position.tableName));
    if (isReached()) return reached;
    if (options.abortSignal?.aborted === true) {
      throw projectionWaitError(PROJECTION_WAIT_OUTCOME.CLIENT_DISCONNECTED);
    }
    const waiter = openProjectionWaiter(this, position, options.statement);
    return new Promise((resolve, reject) => {
      let settled = false;
      let stopHolding = null;
      let listener = null;
      let onAbort = null;
      let stopCurrent = null;
      const finish = (outcome, settle) => {
        if (settled) return;
        settled = true;
        cache.offCacheChange?.(listener);
        stopCurrent?.();
        options.abortSignal?.removeEventListener(ABORT_EVENT, onAbort);
        stopHolding?.();
        closeProjectionWaiter(this, waiter, outcome);
        settle();
      };
      const end = (outcome) => finish(outcome,
        () => reject(projectionWaitError(outcome)));
      listener = (changedTable) => {
        if (changedTable !== position.tableName || !isReached()) return;
        finish(PROJECTION_WAIT_OUTCOME.REACHED, () => resolve(reached));
      };
      onAbort = () => end(PROJECTION_WAIT_OUTCOME.CLIENT_DISCONNECTED);
      cache.onCacheChange(listener);
      // A deletion awaiting a current cache is woken by the source position
      // becoming current (an image install that changed no row included).
      const sourceOrder = this.cacheMutationTarget?.sourceOrder;
      if (sourceOrder instanceof SystemTableCacheSourceOrder) {
        stopCurrent = sourceOrder.onCurrent(() => listener(position.tableName));
      }
      options.abortSignal?.addEventListener(ABORT_EVENT, onAbort);
      stopHolding = this.holdUntilShutdown(
        () => end(PROJECTION_WAIT_OUTCOME.SHUTDOWN));
    });
  }

  /**
   * The projection waits in progress, for diagnostics: no timer bounds a
   * wait, so a wait that does not end is seen here and by its start line.
   * @return {Object} {activeWaiters, oldestWaitStartedAtMs}.
   */
  getProjectionWaitDiagnostics() {
    const waiters = this.projectionWaiters ?? new Set();
    let oldestWaitStartedAtMs = null;
    for (const waiter of waiters) {
      if (oldestWaitStartedAtMs === null ||
          waiter.startedAtMs < oldestWaitStartedAtMs) {
        oldestWaitStartedAtMs = waiter.startedAtMs;
      }
    }
    return {activeWaiters: waiters.size, oldestWaitStartedAtMs};
  }
}

/**
 * Mix the projection wait onto the target class prototype.
 * @param {Function} targetClass
 */
function applyCDCIntegrationServiceProjectionWait(targetClass) {
  const sourcePrototype = CDCIntegrationServiceProjectionWait.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === PROTOTYPE_CONSTRUCTOR_NAME) continue;
    Object.defineProperty(targetClass.prototype, methodName,
      Object.getOwnPropertyDescriptor(sourcePrototype, methodName));
  }
}

export {
  PROJECTION_WAIT_OUTCOME,
  applyCDCIntegrationServiceProjectionWait,
  projectionWaitError,
};
