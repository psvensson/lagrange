/**
 * Join Readiness Evaluator — evaluates whether a joining node has
 * converged to a ready state by inspecting topology, schema versions,
 * endpoint visibility, and routing reachability.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {CONNECTION_STATE} from '../constants/transport.js';
import {
  NODE_STATE,
  NUM,
} from '../constants/index.js';
import {
  JOIN_READINESS_REASON,
  JOIN_READINESS_REPAIR,
} from './node-joining-constants.js';
import {
  createJoinReadinessEvaluatorConvergenceMethods,
} from './join-readiness-convergence-methods.js';
import {
  createJoinReadinessEvaluatorSnapshotMethods,
} from './join-readiness-snapshot-methods.js';
import {
  createJoinReadinessEvaluatorTailMethods,
} from './join-readiness-evaluator-tail-methods.js';

const JOIN_READINESS_REASON_PRECEDENCE = Object.freeze([
  JOIN_READINESS_REASON.ROUTING_NOT_READY,
  JOIN_READINESS_REASON.SCHEMA_VERSION_UNKNOWN,
  JOIN_READINESS_REASON.SCHEMA_VERSION_LAG,
  JOIN_READINESS_REASON.TOPOLOGY_NOT_READY,
]);
const MESH_INELIGIBLE_NODE_STATES = new Set([
  String(NODE_STATE.DRAINING).toLowerCase(),
  String(NODE_STATE.FAILED).toLowerCase(),
  String(NODE_STATE.SHUTTING_DOWN).toLowerCase(),
  String(NODE_STATE.STOPPED).toLowerCase(),
]);
const MESH_CONNECTED_OR_IN_FLIGHT_STATES = new Set([
  CONNECTION_STATE.CONNECTED,
  CONNECTION_STATE.CONNECTING,
  CONNECTION_STATE.RECONNECTING,
]);
const CANONICAL_JOIN_READINESS_LOG_INTERVAL_MS = 5000;
const CANONICAL_JOIN_DISCOVERY_CRITICAL_TABLES = new Set(
  JOIN_READINESS_REPAIR.TABLES.map((tableName) =>
    String(tableName || '').trim().toLowerCase(),
  ).filter((tableName) => tableName.length > NUM.ZERO),
);

/**
 * Evaluates join readiness convergence for a joining node.
 */
class JoinReadinessEvaluator {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - This node's ID.
   * @param {Object} options.config - Joining configuration.
   * @param {Object} options.logger - Logger instance.
   * @param {Function} options.now - Time provider function.
   * @param {Function} options.sleep - Sleep function.
   * @param {Object} options.delegates - Callbacks into the joining service.
   * @param {Function} options.delegates.resolveControlPlaneTargetAddress
   * @param {Function} [options.delegates.resolveControlPlaneTargetAddressCandidates]
   * @param {Function} options.delegates.getMissingSystemServiceLeaders
   * @param {Function} options.delegates.getBlockingSystemServiceLeaders
   * @param {Function} options.delegates.backfillPropagatedCacheTables
   * @param {Function} options.delegates.getMessageRouter
   * @param {Function} options.delegates.getBootstrapResponse
   * @param {Function} options.delegates.getSystemCacheHydrated
   * @param {Function} options.delegates.getJoinReadinessSnapshotProvider
   * @param {Function} options.delegates.getCdcIntegrationService
   * @param {Function} options.delegates.getLogger
   * @param {Function} options.delegates.getConfig
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.now = options.now;
    this.sleep = options.sleep;
    this.delegates = options.delegates || {};

    // Mutable convergence state
    this.lastCanonicalJoinRepairAtMs = NUM.ZERO;
    this.canonicalJoinRepairPromise = null;
    this.lastMeshConnectivityRepairAtMs = NUM.ZERO;
    this.meshConnectivityRepairPromise = null;
    this.lastClusterMeshSignature = null;
    this.lastCanonicalJoinBlockedLogAtMs = NUM.ZERO;
    this.highestObservedSnapshotRevision = null;
    this.highestObservedSnapshotResumeToken = null;
  }
}

Object.defineProperties(
  JoinReadinessEvaluator.prototype,
  createJoinReadinessEvaluatorConvergenceMethods(),
);

Object.defineProperties(
  JoinReadinessEvaluator.prototype,
  createJoinReadinessEvaluatorSnapshotMethods(),
);

Object.assign(
  JoinReadinessEvaluator.prototype,
  createJoinReadinessEvaluatorTailMethods({
    joinReadinessReasonPrecedence: JOIN_READINESS_REASON_PRECEDENCE,
    meshIneligibleNodeStates: MESH_INELIGIBLE_NODE_STATES,
    meshConnectedOrInFlightStates: MESH_CONNECTED_OR_IN_FLIGHT_STATES,
    canonicalJoinReadinessLogIntervalMs:
      CANONICAL_JOIN_READINESS_LOG_INTERVAL_MS,
    canonicalJoinDiscoveryCriticalTables:
      CANONICAL_JOIN_DISCOVERY_CRITICAL_TABLES,
  }),
);

export {JoinReadinessEvaluator};
