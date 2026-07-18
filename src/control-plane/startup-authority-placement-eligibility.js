import {
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../constants/index.js';
import {hasLiveTransportEvidence} from './live-transport-evidence.js';

const EMPTY_STARTUP_AUTHORITY_NODE_ID_SET = new Set();
const EMPTY_STARTUP_AUTHORITY_PLACEMENT_NODE_IDS = Object.freeze([]);

function resolveStartupAuthorityNodeIdSet(startupAuthority) {
  if (startupAuthority?.authorityAvailable !== true) {
    return EMPTY_STARTUP_AUTHORITY_NODE_ID_SET;
  }
  const nodeIds = Array.isArray(startupAuthority.canonicalStartupNodeIds) ?
    startupAuthority.canonicalStartupNodeIds.filter(
      (nodeId) => typeof nodeId === 'string' && nodeId.length > 0,
    ) :
    [];
  return nodeIds.length > 0 ?
    new Set(nodeIds) :
    EMPTY_STARTUP_AUTHORITY_NODE_ID_SET;
}

/**
 * The shared formation-time placement predicate for a node whose public READY
 * lease is still withheld. Startup authority supplies membership, the nodes
 * row supplies ACTIVE + CONNECTED/READY registration, and the live router
 * supplies reachability. Self-inclusion remains an explicit caller choice.
 *
 * @param {Object} options
 * @param {Object} options.node
 * @param {Set<string>} options.startupAuthorityNodeIds
 * @param {Object} options.messageRouter
 * @param {string|null} options.localNodeId
 * @param {boolean} options.includeSelf
 * @return {boolean}
 */
function isStartupAuthorityControlPlanePlacementEligibleNode(options = {}) {
  const node = options.node;
  const nodeId = node?.node_id || node?.nodeId || null;
  if (
    typeof nodeId !== 'string' ||
    nodeId.length === 0 ||
    !(options.startupAuthorityNodeIds instanceof Set) ||
    !options.startupAuthorityNodeIds.has(nodeId) ||
    node?.status !== SERVICE_STATUS.ACTIVE
  ) {
    return false;
  }
  const connectionState = String(
    node.connection_state || node.connectionState || '',
  ).toLowerCase();
  if (
    connectionState !== STATE.CONNECTED &&
    connectionState !== STATE.READY
  ) {
    return false;
  }
  if (nodeId === options.localNodeId) {
    return options.includeSelf === true;
  }
  return hasLiveTransportEvidence(nodeId, {
    messageRouter: options.messageRouter,
  });
}

/**
 * Resolve every cache-backed node admitted by the shared formation predicate.
 *
 * @param {Object} options
 * @param {Object} options.systemTableCache
 * @param {Object} options.startupAuthority
 * @param {Object} options.messageRouter
 * @param {string|null} options.localNodeId
 * @param {boolean} options.includeSelf
 * @return {Array<string>}
 */
function getStartupAuthorityControlPlanePlacementEligibleNodeIds(
  options = {},
) {
  const startupAuthorityNodeIds =
    resolveStartupAuthorityNodeIdSet(options.startupAuthority);
  if (
    startupAuthorityNodeIds.size === 0 ||
    !options.systemTableCache ||
    typeof options.systemTableCache.filter !== 'function'
  ) {
    return EMPTY_STARTUP_AUTHORITY_PLACEMENT_NODE_IDS;
  }
  return options.systemTableCache
    .filter(TABLES.NODES, (node) =>
      isStartupAuthorityControlPlanePlacementEligibleNode({
        node,
        startupAuthorityNodeIds,
        messageRouter: options.messageRouter,
        localNodeId: options.localNodeId || null,
        includeSelf: options.includeSelf === true,
      }),
    )
    .map((node) => node.node_id);
}

export {
  getStartupAuthorityControlPlanePlacementEligibleNodeIds,
  isStartupAuthorityControlPlanePlacementEligibleNode,
  resolveStartupAuthorityNodeIdSet,
};
