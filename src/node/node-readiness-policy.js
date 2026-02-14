import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {NUM, STATE, TYPEOF} from '../constants/index.js';

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
  const requireActiveStatus = options.requireActiveStatus !== false;

  if (requireActiveStatus && nodeRow.status !== STATE.ACTIVE) {
    return false;
  }

  const leaseExpiry = Number(nodeRow.ready_lease_expires_at);
  if (!Number.isFinite(leaseExpiry) || leaseExpiry <= now) {
    return false;
  }

  return true;
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
  if (!cache || typeof cache.get !== TYPEOF.FUNCTION) {
    return false;
  }

  const nodeRow = cache.get(SystemTableName.NODES, nodeId);
  if (!isNodeRecordReady(nodeRow, options)) {
    return false;
  }

  const router = options.messageRouter;
  if (!router || typeof router.getConnectionState !== TYPEOF.FUNCTION) {
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
      typeof router.isOutboundQueueAvailable === TYPEOF.FUNCTION &&
      !router.isOutboundQueueAvailable(options.nodeId)) {
    return false;
  }

  if (options.enableReadinessPing &&
      typeof router.pingNode === TYPEOF.FUNCTION) {
    const pingTimeout = Number.isFinite(options.readinessPingTimeoutMs) ?
      options.readinessPingTimeoutMs :
      NUM.ZERO;
    const ok = await router.pingNode(options.nodeId, pingTimeout);
    if (!ok) {
      return false;
    }
  }

  return true;
}

export {
  isNodeRecordReady,
  isNodeReadyWithConnection,
  isNodeReadyWithTransport,
};
