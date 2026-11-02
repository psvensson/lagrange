/**
 * The one projection wait of the CDC integration owner (quest
 * replica-admission-from-committed-operation, attempt 2): a routed
 * system-table write answers at its commit with its position
 * {tableName, key, originHlc}; a consumer that needs its own node's
 * SystemTableCache to reflect that write waits for that position here. There
 * is no timer: the wait ends when the cache row for the key carries the
 * write's origin HLC or a later one (for a deletion: the row is absent or
 * carries a later origin), or when the owner shuts down (typed). A write is
 * never answered from this projection.
 */

import {HLCTimestamp} from '../hlc/hlc-timestamp.js';

const PROJECTION_WAIT_OUTCOME = Object.freeze({
  REACHED: 'reached',
  SHUTDOWN: 'shutdown',
  POSITION_UNKNOWN: 'position_unknown',
  POSITION_INVALID: 'position_invalid',
  PROJECTION_UNAVAILABLE: 'projection_unavailable',
});
const PROJECTION_WAIT_MESSAGE = Object.freeze({
  [PROJECTION_WAIT_OUTCOME.SHUTDOWN]:
    'Projection wait ended: the CDC integration owner shut down',
  [PROJECTION_WAIT_OUTCOME.POSITION_UNKNOWN]:
    'Projection wait refused: the write position carries no origin HLC',
  [PROJECTION_WAIT_OUTCOME.POSITION_INVALID]:
    'Projection wait refused: not a write position',
  [PROJECTION_WAIT_OUTCOME.PROJECTION_UNAVAILABLE]:
    'Projection wait refused: this owner has no observable SystemTableCache',
});
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
function projectionReached(cache, position) {
  const row = cache.get(position.tableName, position.key) ?? null;
  if (position.deleted === true) {
    const order = row === null ? null : originOrder(row, position.originHlc);
    return row === null || (order !== null && order > ORDER_SAME);
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

class CDCIntegrationServiceProjectionWait {
  /**
   * Wait until this node's SystemTableCache reflects the write at
   * `position`. Ends only when it does or at shutdown.
   * @param {Object} position - {tableName, key, originHlc, deleted?}, as a
   *   routed write answers it.
   * @return {Promise<Object>} {outcome: 'reached', position}; rejects with
   *   a typed error (code shutdown | position_unknown | position_invalid |
   *   projection_unavailable).
   */
  async awaitProjectionAt(position) {
    const refusal = positionRefusal(position);
    if (refusal !== null) throw projectionWaitError(refusal);
    const cache = this.systemTableCache;
    if (!cache || typeof cache.get !== 'function' ||
        typeof cache.onCacheChange !== 'function') {
      throw projectionWaitError(PROJECTION_WAIT_OUTCOME.PROJECTION_UNAVAILABLE);
    }
    const reached = Object.freeze({outcome: PROJECTION_WAIT_OUTCOME.REACHED,
      position});
    if (projectionReached(cache, position)) return reached;
    return new Promise((resolve, reject) => {
      let stopHolding = null;
      let settled = false;
      let listener = null;
      const finish = (settle) => {
        if (settled) return;
        settled = true;
        cache.offCacheChange?.(listener);
        stopHolding?.();
        settle();
      };
      listener = (changedTable) => {
        if (changedTable !== position.tableName ||
            !projectionReached(cache, position)) return;
        finish(() => resolve(reached));
      };
      cache.onCacheChange(listener);
      stopHolding = this.holdUntilShutdown(() => finish(() =>
        reject(projectionWaitError(PROJECTION_WAIT_OUTCOME.SHUTDOWN))));
    });
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
