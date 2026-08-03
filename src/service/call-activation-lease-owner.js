/**
 * Data-local call activation leases (sole owner of the lease grammar).
 *
 * A lease row is a BOUNDED demand signal: "a call shard resolved to this
 * node needs a ready Cell of this service there". The call invocation
 * owner publishes it when host-restricted route selection fails typed
 * HOST_CELL_UNAVAILABLE; the placement planner consumes LIVE leases as
 * deterministic activation pins. The invoker never schedules anything —
 * the planner remains the only placement decider, and an expired lease
 * simply stops pinning so the existing surplus cure reclaims the
 * activated replica.
 *
 * The demand is system-derived (from canonical partition topology), never
 * caller placement: the caller cannot name a node, only a Binding.
 */

import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';

const ACTIVATION_LEASE_ID_SEPARATOR = '@';
const SQL_SINGLE_QUOTE_ESCAPE = '\'\'';
const ACTIVATION_LEASE_INSERT_COLUMNS =
  '(lease_id, service_id, node_id, lease_expires_at, requested_at) ' +
  'VALUES ';
const CALL_ACTIVATION_LEASE_MESSAGE = Object.freeze({
  CONSTRUCTOR_REQUIRES:
    'createCallActivationLeaseOwner requires executeInternal, leaseMs, ' +
    'and nowProvider',
  PUBLISH_REQUIRES:
    'publishActivationLease requires a service id and a node id',
});

function sqlLiteral(value) {
  return typeof value === 'number' && Number.isFinite(value) ?
    String(value) :
    `'${String(value).replace(/'/g, SQL_SINGLE_QUOTE_ESCAPE)}'`;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function buildActivationLeaseId(serviceId, nodeId) {
  return `${serviceId}${ACTIVATION_LEASE_ID_SEPARATOR}${nodeId}`;
}

/**
 * Planner-side pure reader: the node ids of this service's LIVE
 * activation leases, deduplicated. Reads only the canonical CDC-fed
 * cache rows — no parallel state.
 *
 * @param {object} options {systemTableCache, serviceId, nowMs}
 * @return {string[]} sorted live pinned node ids
 */
function liveActivationPinNodeIds({systemTableCache, serviceId, nowMs}) {
  const rows =
    systemTableCache?.getAll?.(SYSTEM_TABLE_NAME.CALL_ACTIVATION_LEASES) ||
    [];
  const nodes = new Set();
  for (const row of rows) {
    if (row?.service_id === serviceId &&
        isNonEmptyString(row?.node_id) &&
        Number(row?.lease_expires_at) > nowMs) {
      nodes.add(row.node_id);
    }
  }
  return [...nodes].sort();
}

function createCallActivationLeaseOwner(options = {}) {
  const executeInternal = options.executeInternal;
  const leaseMs = options.leaseMs;
  const nowProvider = options.nowProvider;
  if (typeof executeInternal !== 'function' ||
      !Number.isFinite(leaseMs) || leaseMs <= 0 ||
      typeof nowProvider !== 'function') {
    throw new TypeError(CALL_ACTIVATION_LEASE_MESSAGE.CONSTRUCTOR_REQUIRES);
  }
  const table = SYSTEM_TABLE_NAME.CALL_ACTIVATION_LEASES;

  async function readLease(leaseId) {
    const result = await executeInternal(
      `SELECT lease_id, lease_expires_at FROM ${table} ` +
      `WHERE lease_id = ${sqlLiteral(leaseId)}`,
      [],
    );
    const rows = result?.results || result?.rows || [];
    return rows[0] || null;
  }

  /**
   * Publish or refresh the bounded activation lease for (service, node).
   * Refresh-first keeps the write a guarded single-row UPDATE on the hot
   * path; the INSERT happens only for a genuinely new demand target.
   *
   * @param {string} serviceId Binding-derived service definition id
   * @param {string} nodeId the shard host node needing a ready Cell
   * @return {Promise<object>} frozen {leaseId, leaseExpiresAt}
   */
  async function publishActivationLease(serviceId, nodeId) {
    if (!isNonEmptyString(serviceId) || !isNonEmptyString(nodeId)) {
      throw new TypeError(CALL_ACTIVATION_LEASE_MESSAGE.PUBLISH_REQUIRES);
    }
    const leaseId = buildActivationLeaseId(serviceId, nodeId);
    const requestedAt = Number(nowProvider());
    const leaseExpiresAt = requestedAt + leaseMs;
    await executeInternal(
      `UPDATE ${table} SET ` +
      `lease_expires_at = ${leaseExpiresAt}, ` +
      `requested_at = ${requestedAt} ` +
      `WHERE lease_id = ${sqlLiteral(leaseId)}`,
      [],
    );
    if (!(await readLease(leaseId))) {
      try {
        await executeInternal(
          `INSERT INTO ${table} ` +
          ACTIVATION_LEASE_INSERT_COLUMNS +
          `(${sqlLiteral(leaseId)}, ${sqlLiteral(serviceId)}, ` +
          `${sqlLiteral(nodeId)}, ${leaseExpiresAt}, ${requestedAt})`,
          [],
        );
      } catch (insertError) {
        // Two concurrent publishers can race this INSERT; the loser's
        // duplicate-key failure is benign exactly when the row now
        // exists (the winner's lease covers the same demand). Anything
        // else is a real failure and propagates.
        if (!(await readLease(leaseId))) {
          throw insertError;
        }
      }
    }
    return Object.freeze({leaseExpiresAt, leaseId});
  }

  return Object.freeze({publishActivationLease});
}

export {
  buildActivationLeaseId,
  createCallActivationLeaseOwner,
  liveActivationPinNodeIds,
};
