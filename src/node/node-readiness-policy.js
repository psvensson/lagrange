import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {SERVICE_STATUS, STATE} from '../constants/index.js';

const LOCAL_STR_READY_LEASE_EXPIRES_AT = 'ready_lease_expires_at';
const LOCAL_STR_READYLEASEEXPIRESAT = 'readyLeaseExpiresAt';
const LOCAL_STR_READYLEASEEXPIRESATMS = 'readyLeaseExpiresAtMs';
const LOCAL_STR_READYLEASEEXPIRES = 'readyLeaseExpires';

const REQUIRE_ACTIVE_STATUS_DEFAULT = true;

function normalizeConnectionState(nodeRow) {
  const rawState = nodeRow?.connection_state ??
    nodeRow?.connectionState ??
    null;
  if (typeof rawState !== 'string') {
    return null;
  }

  const normalizedState = rawState.toLowerCase();
  return normalizedState.length > 0 ? normalizedState : null;
}

function getFiniteNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function hasOwnField(target, fieldName) {
  return Boolean(
    target &&
    typeof target === 'object' &&
    Object.prototype.hasOwnProperty.call(target, fieldName),
  );
}

function hasExplicitReadyLeaseField(nodeRow) {
  return hasOwnField(nodeRow, LOCAL_STR_READY_LEASE_EXPIRES_AT) ||
    hasOwnField(nodeRow, LOCAL_STR_READYLEASEEXPIRESAT) ||
    hasOwnField(nodeRow, LOCAL_STR_READYLEASEEXPIRESATMS) ||
    hasOwnField(nodeRow, LOCAL_STR_READYLEASEEXPIRES);
}

function getNodeHeartbeatWatermark(nodeRow) {
  if (!nodeRow || typeof nodeRow !== 'object') {
    return null;
  }

  return Object.freeze({
    lastHeartbeat: getFiniteNumber(
      nodeRow.last_heartbeat ??
      nodeRow.lastHeartbeat ??
      nodeRow.lastHeartbeatAt,
    ),
    readyLeaseExpiresAt: getFiniteNumber(
      nodeRow.ready_lease_expires_at ??
      nodeRow.readyLeaseExpiresAt ??
      nodeRow.readyLeaseExpiresAtMs ??
      nodeRow.readyLeaseExpires,
    ),
    connectionState: normalizeConnectionState(nodeRow),
  });
}

function compareWatermarkNumber(previousValue, nextValue) {
  if (previousValue === null || nextValue === null || previousValue === nextValue) {
    return 0;
  }
  return nextValue > previousValue ? 1 : -1;
}

function compareReadyLeaseTie(previous, next) {
  if (previous.readyLeaseExpiresAt !== null && next.readyLeaseExpiresAt === null) {
    if (next.connectionState === STATE.CONNECTED ||
        next.connectionState === STATE.READY) {
      return -1;
    }
    if (next.connectionState === STATE.DISCONNECTED) {
      return 1;
    }
  }

  if (previous.readyLeaseExpiresAt === null &&
      next.readyLeaseExpiresAt !== null) {
    return 1;
  }

  return 0;
}

function compareConnectionStateTie(previous, next) {
  if (previous.connectionState === STATE.READY &&
      next.connectionState === STATE.CONNECTED) {
    return -1;
  }
  if (previous.connectionState === STATE.CONNECTED &&
      next.connectionState === STATE.READY) {
    return 1;
  }
  return 0;
}

function compareNodeHeartbeatWatermarks(previousRow, nextRow) {
  const previous = getNodeHeartbeatWatermark(previousRow);
  const next = getNodeHeartbeatWatermark(nextRow);
  if (!previous || !next) {
    return 0;
  }

  const heartbeatComparison = compareWatermarkNumber(
    previous.lastHeartbeat,
    next.lastHeartbeat,
  );
  if (heartbeatComparison !== 0) {
    return heartbeatComparison;
  }

  const readyLeaseComparison = compareWatermarkNumber(
    previous.readyLeaseExpiresAt,
    next.readyLeaseExpiresAt,
  );
  if (readyLeaseComparison !== 0) {
    return readyLeaseComparison;
  }

  if (previous.lastHeartbeat === null ||
      next.lastHeartbeat === null ||
      previous.lastHeartbeat !== next.lastHeartbeat) {
    return 0;
  }

  const readyLeaseTieComparison = compareReadyLeaseTie(previous, next);
  if (readyLeaseTieComparison !== 0) {
    return readyLeaseTieComparison;
  }

  return compareConnectionStateTie(previous, next);
}

function isNodeHeartbeatWatermarkRegression(previousRow, nextRow) {
  return compareNodeHeartbeatWatermarks(previousRow, nextRow) < 0;
}

/**
 * Check if a node record is ready based on lease and state fields.
 * @param {Object} nodeRow - Node row from the nodes table.
 * @param {Object} options - Readiness options.
 * @param {number} options.now - Current timestamp.
 * @param {boolean} options.requireActiveStatus - Require status=active.
 * @return {boolean} True when node row is ready.
 */
function isNodeRecordReady(nodeRow, options = {}) {
  if (!nodeRow) {
    return false;
  }

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const requireActiveStatus =
    options.requireActiveStatus ?? REQUIRE_ACTIVE_STATUS_DEFAULT;

  if (requireActiveStatus && nodeRow.status !== SERVICE_STATUS.ACTIVE) {
    return false;
  }

  const leaseExpiry = Number(nodeRow.ready_lease_expires_at);
  if (!Number.isFinite(leaseExpiry) || leaseExpiry <= now) {
    return false;
  }

  return true;
}

/**
 * Check whether a node row represented a ready heartbeat when it was written.
 * This avoids reclassifying delayed lease-refresh CDC events as fresh
 * not-ready to ready transitions after wall-clock time has advanced.
 * @param {Object} nodeRow - Node row from the nodes table.
 * @param {Object} options - Readiness options.
 * @param {number} options.now - Current timestamp fallback when heartbeat time
 *   is unavailable.
 * @param {boolean} options.requireActiveStatus - Require status=active.
 * @return {boolean} True when the row encoded a ready heartbeat at write time.
 */
function wasNodeRecordReadyWhenWritten(nodeRow, options = {}) {
  if (!nodeRow) {
    return false;
  }

  const requireActiveStatus =
    options.requireActiveStatus ?? REQUIRE_ACTIVE_STATUS_DEFAULT;
  if (requireActiveStatus && nodeRow.status !== SERVICE_STATUS.ACTIVE) {
    return false;
  }

  const leaseExpiry = Number(nodeRow.ready_lease_expires_at);
  if (!Number.isFinite(leaseExpiry)) {
    return false;
  }

  const heartbeatAt = Number(nodeRow.last_heartbeat);
  if (Number.isFinite(heartbeatAt)) {
    return leaseExpiry > heartbeatAt;
  }

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  return leaseExpiry > now;
}

/**
 * Check whether a node row carries an explicit owner-authored "not ready yet"
 * watermark by clearing the ready lease field entirely.
 *
 * This is distinct from an expired finite lease:
 * - expired finite leases can be stale cache evidence during topology change
 * - an explicit null/cleared lease is a fresh owner signal that readiness was
 *   intentionally revoked and must not be overridden by transport grace
 *
 * @param {Object} nodeRow - Node row from the nodes table.
 * @param {Object} options - Readiness options.
 * @param {boolean} options.requireActiveStatus - Require status=active.
 * @return {boolean} True when the owner explicitly cleared the ready lease.
 */
function isNodeReadyLeaseExplicitlyCleared(nodeRow, options = {}) {
  if (!nodeRow || !hasExplicitReadyLeaseField(nodeRow)) {
    return false;
  }

  const requireActiveStatus =
    options.requireActiveStatus ?? REQUIRE_ACTIVE_STATUS_DEFAULT;
  if (requireActiveStatus && nodeRow.status !== SERVICE_STATUS.ACTIVE) {
    return false;
  }

  return !Number.isFinite(Number(
    nodeRow.ready_lease_expires_at ??
    nodeRow.readyLeaseExpiresAt ??
    nodeRow.readyLeaseExpiresAtMs ??
    nodeRow.readyLeaseExpires,
  ));
}

/**
 * Check node readiness using nodes table + router connection state.
 * @param {Object} options - Readiness options.
 * @param {string} options.nodeId - Node ID.
 * @param {Object} options.systemTableCache - System table cache.
 * @param {Object} options.messageRouter - Message router.
 * @param {number} options.now - Current timestamp.
 * @param {boolean} options.requireActiveStatus - Require status=active.
 * @return {boolean} True when node is ready and connected.
 */
function isNodeReadyWithConnection(options = {}) {
  const nodeId = options.nodeId;
  if (!nodeId) {
    return false;
  }

  const cache = options.systemTableCache;
  if (!cache || typeof cache.get !== 'function') {
    return false;
  }

  const nodeRow = cache.get(SYSTEM_TABLE_NAME.NODES, nodeId);
  if (!isNodeRecordReady(nodeRow, options)) {
    return false;
  }

  const router = options.messageRouter;
  if (!router || typeof router.getConnectionState !== 'function') {
    return false;
  }

  return router.getConnectionState(nodeId) === STATE.CONNECTED;
}

/**
 * Check node readiness with optional transport-level checks.
 * @param {Object} options - Readiness options.
 * @param {boolean} options.requireOutboundQueue - Require outbound queue.
 * @param {boolean} options.enableReadinessPing - Require ping success.
 * @param {number} options.readinessPingTimeoutMs - Ping timeout.
 * @return {Promise<boolean>} True when node is transport-ready.
 */
async function isNodeReadyWithTransport(options = {}) {
  if (!isNodeReadyWithConnection(options)) {
    return false;
  }

  const router = options.messageRouter;
  if (options.requireOutboundQueue &&
      typeof router.isOutboundQueueAvailable === 'function' &&
      !router.isOutboundQueueAvailable(options.nodeId)) {
    return false;
  }

  if (options.enableReadinessPing &&
      typeof router.pingNode === 'function') {
    const pingTimeout = Number.isFinite(options.readinessPingTimeoutMs) ?
      options.readinessPingTimeoutMs :
      0;
    const ok = await router.pingNode(options.nodeId, pingTimeout);
    if (!ok) {
      return false;
    }
  }

  return true;
}

export {
  compareNodeHeartbeatWatermarks,
  getNodeHeartbeatWatermark,
  isNodeHeartbeatWatermarkRegression,
  isNodeRecordReady,
  isNodeReadyLeaseExplicitlyCleared,
  isNodeReadyWithConnection,
  isNodeReadyWithTransport,
  wasNodeRecordReadyWhenWritten,
};
