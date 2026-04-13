/**
 * Join Readiness Evaluator — evaluates whether a joining node has
 * converged to a ready state by inspecting topology, schema versions,
 * endpoint visibility, and routing reachability.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { NodeService } from '../node/node-service.js';
import { PRESSURE_WORK_CLASS, PressureGovernor } from '../control-plane/pressure-governor.js';
import { ControlPlaneMessageType, getControlPlaneMessageRequiredTables } from '../control-plane/control-plane-constants.js';
import { getMissingSystemServiceLeaderCount } from '../cache/leader-readiness-gate.js';
import { resolveCanonicalRequiredSchemaVersion, resolveCanonicalAppliedSchemaVersion, normalizeJoinSchemaVersion, compareJoinSchemaVersions } from './join-schema-version-resolver.js';
import { COLUMN, ENDPOINT_STATUS, NODE_STATE, NUM, STATE, TABLES, TRANSPORT_TYPE, TYPEOF } from '../constants/index.js';
import { CONNECTION_STATE } from '../constants/transport.js';
import { ENDPOINT_SYNC_HEALTH } from '../runtime/endpoint-sync-constants.js';
import { META_SERVICE_ID } from '../constants/wasm-meta.js';
import { isReplicaOperationInFlight, normalizeReplicaOperationRecord } from '../rebalancer/replica-operation-liveness.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { normalizeNodeEndpointRow, normalizeNodeRow, normalizeServiceEndpointRow } from '../control-plane/system-row-normalizers.js';
import { subscribeToMessageRouterEvents, subscribeToSystemTableCacheChanges, waitForStartupConvergence } from './shared/startup-convergence-gate.js';
import { getLocalQueryTransportReadiness, isLocalQueryTransportReady } from './shared/local-query-transport-readiness.js';
import { JOIN_MESH_CONNECTIVITY_REPAIR, JOIN_READINESS_DEFAULT_TABLE, JOIN_READINESS_REASON, JOIN_READINESS_REPAIR, JOINING_LOG_MSG } from './node-joining-constants.js';
import { isPriorityControlPlanePartition } from './system-partition-classification.js';
const JOIN_READINESS_REASON_PRECEDENCE = Object.freeze(stryMutAct_9fa48("13795") ? [] : (stryCov_9fa48("13795"), [JOIN_READINESS_REASON.ROUTING_NOT_READY, JOIN_READINESS_REASON.SCHEMA_VERSION_UNKNOWN, JOIN_READINESS_REASON.SCHEMA_VERSION_LAG, JOIN_READINESS_REASON.TOPOLOGY_NOT_READY]));
const MESH_INELIGIBLE_NODE_STATES = new Set(stryMutAct_9fa48("13796") ? [] : (stryCov_9fa48("13796"), [stryMutAct_9fa48("13797") ? String(NODE_STATE.DRAINING).toUpperCase() : (stryCov_9fa48("13797"), String(NODE_STATE.DRAINING).toLowerCase()), stryMutAct_9fa48("13798") ? String(NODE_STATE.FAILED).toUpperCase() : (stryCov_9fa48("13798"), String(NODE_STATE.FAILED).toLowerCase()), stryMutAct_9fa48("13799") ? String(NODE_STATE.SHUTTING_DOWN).toUpperCase() : (stryCov_9fa48("13799"), String(NODE_STATE.SHUTTING_DOWN).toLowerCase()), stryMutAct_9fa48("13800") ? String(NODE_STATE.STOPPED).toUpperCase() : (stryCov_9fa48("13800"), String(NODE_STATE.STOPPED).toLowerCase())]));
const MESH_CONNECTED_OR_IN_FLIGHT_STATES = new Set(stryMutAct_9fa48("13801") ? [] : (stryCov_9fa48("13801"), [CONNECTION_STATE.CONNECTED, CONNECTION_STATE.CONNECTING, CONNECTION_STATE.RECONNECTING]));
const CANONICAL_JOIN_READINESS_LOG_INTERVAL_MS = 5000;
const CANONICAL_JOIN_DISCOVERY_CRITICAL_TABLES = new Set(stryMutAct_9fa48("13802") ? JOIN_READINESS_REPAIR.TABLES.map(tableName => String(tableName || '').trim().toLowerCase()) : (stryCov_9fa48("13802"), JOIN_READINESS_REPAIR.TABLES.map(stryMutAct_9fa48("13803") ? () => undefined : (stryCov_9fa48("13803"), tableName => stryMutAct_9fa48("13805") ? String(tableName || '').toLowerCase() : stryMutAct_9fa48("13804") ? String(tableName || '').trim().toUpperCase() : (stryCov_9fa48("13804", "13805"), String(stryMutAct_9fa48("13808") ? tableName && '' : stryMutAct_9fa48("13807") ? false : stryMutAct_9fa48("13806") ? true : (stryCov_9fa48("13806", "13807", "13808"), tableName || (stryMutAct_9fa48("13809") ? "Stryker was here!" : (stryCov_9fa48("13809"), '')))).trim().toLowerCase()))).filter(stryMutAct_9fa48("13810") ? () => undefined : (stryCov_9fa48("13810"), tableName => stryMutAct_9fa48("13814") ? tableName.length <= NUM.ZERO : stryMutAct_9fa48("13813") ? tableName.length >= NUM.ZERO : stryMutAct_9fa48("13812") ? false : stryMutAct_9fa48("13811") ? true : (stryCov_9fa48("13811", "13812", "13813", "13814"), tableName.length > NUM.ZERO)))));

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
    if (stryMutAct_9fa48("13815")) {
      {}
    } else {
      stryCov_9fa48("13815");
      this.nodeId = options.nodeId;
      this.now = options.now;
      this.sleep = options.sleep;
      this.delegates = stryMutAct_9fa48("13818") ? options.delegates && {} : stryMutAct_9fa48("13817") ? false : stryMutAct_9fa48("13816") ? true : (stryCov_9fa48("13816", "13817", "13818"), options.delegates || {});

      // Mutable convergence state
      this.lastCanonicalJoinRepairAtMs = NUM.ZERO;
      this.canonicalJoinRepairPromise = null;
      this.lastMeshConnectivityRepairAtMs = NUM.ZERO;
      this.meshConnectivityRepairPromise = null;
      this.lastClusterMeshSignature = null;
      this.lastCanonicalJoinBlockedLogAtMs = NUM.ZERO;
    }
  }

  /**
   * Wait for canonical join readiness convergence before transitioning READY.
   * The gate is snapshot-only and mirrors strict pre-load semantics.
   * @return {Promise<void>}
   */
  async waitForCanonicalJoinReadinessConvergence() {
    if (stryMutAct_9fa48("13819")) {
      {}
    } else {
      stryCov_9fa48("13819");
      if (stryMutAct_9fa48("13822") ? this.delegates.getSystemCacheHydrated() === true : stryMutAct_9fa48("13821") ? false : stryMutAct_9fa48("13820") ? true : (stryCov_9fa48("13820", "13821", "13822"), this.delegates.getSystemCacheHydrated() !== (stryMutAct_9fa48("13823") ? false : (stryCov_9fa48("13823"), true)))) {
        if (stryMutAct_9fa48("13824")) {
          {}
        } else {
          stryCov_9fa48("13824");
          return;
        }
      }
      const timeoutMs = this.resolveJoinReadinessTimeoutMs();
      if (stryMutAct_9fa48("13827") ? !Number.isFinite(timeoutMs) && timeoutMs <= NUM.ZERO : stryMutAct_9fa48("13826") ? false : stryMutAct_9fa48("13825") ? true : (stryCov_9fa48("13825", "13826", "13827"), (stryMutAct_9fa48("13828") ? Number.isFinite(timeoutMs) : (stryCov_9fa48("13828"), !Number.isFinite(timeoutMs))) || (stryMutAct_9fa48("13831") ? timeoutMs > NUM.ZERO : stryMutAct_9fa48("13830") ? timeoutMs < NUM.ZERO : stryMutAct_9fa48("13829") ? false : (stryCov_9fa48("13829", "13830", "13831"), timeoutMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("13832")) {
          {}
        } else {
          stryCov_9fa48("13832");
          return;
        }
      }
      const pollIntervalMs = this.resolveJoinReadinessPollIntervalMs();
      let lastSnapshotError = null;
      const result = await waitForStartupConvergence(stryMutAct_9fa48("13833") ? {} : (stryCov_9fa48("13833"), {
        timeoutMs,
        now: this.now,
        subscriptions: stryMutAct_9fa48("13834") ? [] : (stryCov_9fa48("13834"), [stryMutAct_9fa48("13835") ? () => undefined : (stryCov_9fa48("13835"), notify => subscribeToSystemTableCacheChanges(NodeService.getInstance().getSystemTableCache(), notify)), stryMutAct_9fa48("13836") ? () => undefined : (stryCov_9fa48("13836"), notify => subscribeToMessageRouterEvents(stryMutAct_9fa48("13839") ? this.delegates.getMessageRouter?.() && null : stryMutAct_9fa48("13838") ? false : stryMutAct_9fa48("13837") ? true : (stryCov_9fa48("13837", "13838", "13839"), (stryMutAct_9fa48("13840") ? this.delegates.getMessageRouter() : (stryCov_9fa48("13840"), this.delegates.getMessageRouter?.())) || null), notify))]),
        evaluate: async ({
          attempt,
          elapsedMs
        }) => {
          if (stryMutAct_9fa48("13841")) {
            {}
          } else {
            stryCov_9fa48("13841");
            const snapshotResult = await this.collectCanonicalJoinReadinessSnapshot();
            if (stryMutAct_9fa48("13843") ? false : stryMutAct_9fa48("13842") ? true : (stryCov_9fa48("13842", "13843"), snapshotResult.error)) {
              if (stryMutAct_9fa48("13844")) {
                {}
              } else {
                stryCov_9fa48("13844");
                lastSnapshotError = snapshotResult.error;
              }
            }
            const evaluation = this.evaluateCanonicalJoinReadinessSnapshot(snapshotResult.snapshot);
            return stryMutAct_9fa48("13845") ? {} : (stryCov_9fa48("13845"), {
              ready: evaluation.ready,
              evaluation,
              attempts: attempt,
              elapsedMs
            });
          }
        },
        buildProgressSignature: result => {
          if (stryMutAct_9fa48("13846")) {
            {}
          } else {
            stryCov_9fa48("13846");
            const evaluation = stryMutAct_9fa48("13849") ? result?.evaluation && null : stryMutAct_9fa48("13848") ? false : stryMutAct_9fa48("13847") ? true : (stryCov_9fa48("13847", "13848", "13849"), (stryMutAct_9fa48("13850") ? result.evaluation : (stryCov_9fa48("13850"), result?.evaluation)) || null);
            return JSON.stringify(stryMutAct_9fa48("13851") ? {} : (stryCov_9fa48("13851"), {
              reasons: stryMutAct_9fa48("13852") ? [...(evaluation?.reasons || [])] : (stryCov_9fa48("13852"), (stryMutAct_9fa48("13853") ? [] : (stryCov_9fa48("13853"), [...(stryMutAct_9fa48("13856") ? evaluation?.reasons && [] : stryMutAct_9fa48("13855") ? false : stryMutAct_9fa48("13854") ? true : (stryCov_9fa48("13854", "13855", "13856"), (stryMutAct_9fa48("13857") ? evaluation.reasons : (stryCov_9fa48("13857"), evaluation?.reasons)) || (stryMutAct_9fa48("13858") ? ["Stryker was here"] : (stryCov_9fa48("13858"), []))))])).sort()),
              requiredSchemaVersion: stryMutAct_9fa48("13861") ? evaluation?.requiredSchemaVersion && null : stryMutAct_9fa48("13860") ? false : stryMutAct_9fa48("13859") ? true : (stryCov_9fa48("13859", "13860", "13861"), (stryMutAct_9fa48("13862") ? evaluation.requiredSchemaVersion : (stryCov_9fa48("13862"), evaluation?.requiredSchemaVersion)) || null),
              appliedSchemaVersion: stryMutAct_9fa48("13865") ? evaluation?.appliedSchemaVersion && null : stryMutAct_9fa48("13864") ? false : stryMutAct_9fa48("13863") ? true : (stryCov_9fa48("13863", "13864", "13865"), (stryMutAct_9fa48("13866") ? evaluation.appliedSchemaVersion : (stryCov_9fa48("13866"), evaluation?.appliedSchemaVersion)) || null),
              missingLeaders: stryMutAct_9fa48("13869") ? evaluation?.missingLeaders && {} : stryMutAct_9fa48("13868") ? false : stryMutAct_9fa48("13867") ? true : (stryCov_9fa48("13867", "13868", "13869"), (stryMutAct_9fa48("13870") ? evaluation.missingLeaders : (stryCov_9fa48("13870"), evaluation?.missingLeaders)) || {}),
              inFlightReplicaOperations: stryMutAct_9fa48("13873") ? evaluation?.inFlightReplicaOperations && NUM.ZERO : stryMutAct_9fa48("13872") ? false : stryMutAct_9fa48("13871") ? true : (stryCov_9fa48("13871", "13872", "13873"), (stryMutAct_9fa48("13874") ? evaluation.inFlightReplicaOperations : (stryCov_9fa48("13874"), evaluation?.inFlightReplicaOperations)) || NUM.ZERO),
              excludedRemotePriorityControlPlaneCount: stryMutAct_9fa48("13877") ? evaluation?.excludedRemotePriorityControlPlaneCount && NUM.ZERO : stryMutAct_9fa48("13876") ? false : stryMutAct_9fa48("13875") ? true : (stryCov_9fa48("13875", "13876", "13877"), (stryMutAct_9fa48("13878") ? evaluation.excludedRemotePriorityControlPlaneCount : (stryCov_9fa48("13878"), evaluation?.excludedRemotePriorityControlPlaneCount)) || NUM.ZERO),
              missingNodeEndpointNodeIds: stryMutAct_9fa48("13881") ? evaluation?.missingNodeEndpointNodeIds && [] : stryMutAct_9fa48("13880") ? false : stryMutAct_9fa48("13879") ? true : (stryCov_9fa48("13879", "13880", "13881"), (stryMutAct_9fa48("13882") ? evaluation.missingNodeEndpointNodeIds : (stryCov_9fa48("13882"), evaluation?.missingNodeEndpointNodeIds)) || (stryMutAct_9fa48("13883") ? ["Stryker was here"] : (stryCov_9fa48("13883"), []))),
              missingPostgresWireNodeIds: stryMutAct_9fa48("13886") ? evaluation?.missingPostgresWireNodeIds && [] : stryMutAct_9fa48("13885") ? false : stryMutAct_9fa48("13884") ? true : (stryCov_9fa48("13884", "13885", "13886"), (stryMutAct_9fa48("13887") ? evaluation.missingPostgresWireNodeIds : (stryCov_9fa48("13887"), evaluation?.missingPostgresWireNodeIds)) || (stryMutAct_9fa48("13888") ? ["Stryker was here"] : (stryCov_9fa48("13888"), []))),
              snapshotError: stryMutAct_9fa48("13891") ? lastSnapshotError?.message && null : stryMutAct_9fa48("13890") ? false : stryMutAct_9fa48("13889") ? true : (stryCov_9fa48("13889", "13890", "13891"), (stryMutAct_9fa48("13892") ? lastSnapshotError.message : (stryCov_9fa48("13892"), lastSnapshotError?.message)) || null),
              controlPlaneTargetAddress: stryMutAct_9fa48("13895") ? evaluation?.controlPlaneTargetAddress && null : stryMutAct_9fa48("13894") ? false : stryMutAct_9fa48("13893") ? true : (stryCov_9fa48("13893", "13894", "13895"), (stryMutAct_9fa48("13896") ? evaluation.controlPlaneTargetAddress : (stryCov_9fa48("13896"), evaluation?.controlPlaneTargetAddress)) || null),
              controlPlaneTargetCandidates: stryMutAct_9fa48("13899") ? evaluation?.controlPlaneTargetCandidates && [] : stryMutAct_9fa48("13898") ? false : stryMutAct_9fa48("13897") ? true : (stryCov_9fa48("13897", "13898", "13899"), (stryMutAct_9fa48("13900") ? evaluation.controlPlaneTargetCandidates : (stryCov_9fa48("13900"), evaluation?.controlPlaneTargetCandidates)) || (stryMutAct_9fa48("13901") ? ["Stryker was here"] : (stryCov_9fa48("13901"), []))),
              controlPlaneTargetConnectionStates: stryMutAct_9fa48("13904") ? evaluation?.controlPlaneTargetConnectionStates && null : stryMutAct_9fa48("13903") ? false : stryMutAct_9fa48("13902") ? true : (stryCov_9fa48("13902", "13903", "13904"), (stryMutAct_9fa48("13905") ? evaluation.controlPlaneTargetConnectionStates : (stryCov_9fa48("13905"), evaluation?.controlPlaneTargetConnectionStates)) || null),
              topologySnapshotEpoch: stryMutAct_9fa48("13906") ? evaluation?.topologySnapshotEpoch && null : (stryCov_9fa48("13906"), (stryMutAct_9fa48("13907") ? evaluation.topologySnapshotEpoch : (stryCov_9fa48("13907"), evaluation?.topologySnapshotEpoch)) ?? null),
              appliedTopologyEpoch: stryMutAct_9fa48("13908") ? evaluation?.appliedTopologyEpoch && null : (stryCov_9fa48("13908"), (stryMutAct_9fa48("13909") ? evaluation.appliedTopologyEpoch : (stryCov_9fa48("13909"), evaluation?.appliedTopologyEpoch)) ?? null)
            }));
          }
        },
        onBlocked: async (result, context) => {
          if (stryMutAct_9fa48("13910")) {
            {}
          } else {
            stryCov_9fa48("13910");
            const evaluation = stryMutAct_9fa48("13913") ? result?.evaluation && null : stryMutAct_9fa48("13912") ? false : stryMutAct_9fa48("13911") ? true : (stryCov_9fa48("13911", "13912", "13913"), (stryMutAct_9fa48("13914") ? result.evaluation : (stryCov_9fa48("13914"), result?.evaluation)) || null);
            if (stryMutAct_9fa48("13917") ? false : stryMutAct_9fa48("13916") ? true : stryMutAct_9fa48("13915") ? evaluation : (stryCov_9fa48("13915", "13916", "13917"), !evaluation)) {
              if (stryMutAct_9fa48("13918")) {
                {}
              } else {
                stryCov_9fa48("13918");
                return;
              }
            }
            this.logCanonicalJoinReadinessBlocked(evaluation, stryMutAct_9fa48("13919") ? {} : (stryCov_9fa48("13919"), {
              attempts: stryMutAct_9fa48("13922") ? result?.attempts && context.attempt : stryMutAct_9fa48("13921") ? false : stryMutAct_9fa48("13920") ? true : (stryCov_9fa48("13920", "13921", "13922"), (stryMutAct_9fa48("13923") ? result.attempts : (stryCov_9fa48("13923"), result?.attempts)) || context.attempt),
              elapsedMs: context.elapsedMs,
              snapshotError: lastSnapshotError,
              force: context.progressChanged
            }));
            return this.repairCanonicalJoinReadinessIfNeeded(evaluation, pollIntervalMs);
          }
        },
        createTimeoutError: (result, context) => {
          if (stryMutAct_9fa48("13924")) {
            {}
          } else {
            stryCov_9fa48("13924");
            const fallbackEvaluation = this.evaluateCanonicalJoinReadinessSnapshot(stryMutAct_9fa48("13925") ? {} : (stryCov_9fa48("13925"), {
              routingReady: stryMutAct_9fa48("13926") ? true : (stryCov_9fa48("13926"), false),
              topologyReady: stryMutAct_9fa48("13927") ? true : (stryCov_9fa48("13927"), false),
              requiredSchemaVersion: null,
              appliedSchemaVersion: null
            }));
            const terminalEvaluation = stryMutAct_9fa48("13930") ? result?.evaluation && fallbackEvaluation : stryMutAct_9fa48("13929") ? false : stryMutAct_9fa48("13928") ? true : (stryCov_9fa48("13928", "13929", "13930"), (stryMutAct_9fa48("13931") ? result.evaluation : (stryCov_9fa48("13931"), result?.evaluation)) || fallbackEvaluation);
            const attempts = stryMutAct_9fa48("13934") ? (result?.attempts || context.attempt) && NUM.ONE : stryMutAct_9fa48("13933") ? false : stryMutAct_9fa48("13932") ? true : (stryCov_9fa48("13932", "13933", "13934"), (stryMutAct_9fa48("13936") ? result?.attempts && context.attempt : stryMutAct_9fa48("13935") ? false : (stryCov_9fa48("13935", "13936"), (stryMutAct_9fa48("13937") ? result.attempts : (stryCov_9fa48("13937"), result?.attempts)) || context.attempt)) || NUM.ONE);
            const error = new Error((stryMutAct_9fa48("13938") ? `` : (stryCov_9fa48("13938"), `join_readiness_timeout: `)) + (stryMutAct_9fa48("13939") ? `` : (stryCov_9fa48("13939"), `${terminalEvaluation.reasons.join(stryMutAct_9fa48("13940") ? "" : (stryCov_9fa48("13940"), ', '))} `)) + (stryMutAct_9fa48("13941") ? `` : (stryCov_9fa48("13941"), `after ${timeoutMs}ms`)));
            error.code = stryMutAct_9fa48("13942") ? "" : (stryCov_9fa48("13942"), 'JOIN_READINESS_TIMEOUT');
            error.joinReadiness = stryMutAct_9fa48("13943") ? {} : (stryCov_9fa48("13943"), {
              reasons: terminalEvaluation.reasons,
              requiredSchemaVersion: terminalEvaluation.requiredSchemaVersion,
              appliedSchemaVersion: terminalEvaluation.appliedSchemaVersion,
              requiredVsObservedByNode: this.buildJoinSchemaDiagnosticsByNode(terminalEvaluation),
              missingLeaders: terminalEvaluation.missingLeaders,
              inFlightReplicaOperations: terminalEvaluation.inFlightReplicaOperations,
              inFlightReplicaOperationDetails: terminalEvaluation.inFlightReplicaOperationDetails,
              excludedSelfTargetedCount: terminalEvaluation.excludedSelfTargetedCount,
              excludedWarmingTargetCount: terminalEvaluation.excludedWarmingTargetCount,
              excludedNonDiscoveryPartitionCount: terminalEvaluation.excludedNonDiscoveryPartitionCount,
              excludedRemotePriorityControlPlaneCount: terminalEvaluation.excludedRemotePriorityControlPlaneCount,
              excludedRemotePriorityControlPlaneOperationDetails: terminalEvaluation.excludedRemotePriorityControlPlaneOperationDetails,
              missingNodeEndpointNodeIds: terminalEvaluation.missingNodeEndpointNodeIds,
              missingPostgresWireNodeIds: terminalEvaluation.missingPostgresWireNodeIds,
              controlPlaneTargetAddress: terminalEvaluation.controlPlaneTargetAddress,
              controlPlaneTargetCandidates: terminalEvaluation.controlPlaneTargetCandidates,
              controlPlaneTargetConnectionStates: terminalEvaluation.controlPlaneTargetConnectionStates,
              topologySnapshotEpoch: terminalEvaluation.topologySnapshotEpoch,
              appliedTopologyEpoch: terminalEvaluation.appliedTopologyEpoch,
              elapsedMs: context.elapsedMs,
              attempts,
              snapshotError: stryMutAct_9fa48("13946") ? lastSnapshotError?.message && null : stryMutAct_9fa48("13945") ? false : stryMutAct_9fa48("13944") ? true : (stryCov_9fa48("13944", "13945", "13946"), (stryMutAct_9fa48("13947") ? lastSnapshotError.message : (stryCov_9fa48("13947"), lastSnapshotError?.message)) || null),
              timeoutKind: context.timeoutKind,
              lastProgressElapsedMs: context.lastProgressElapsedMs
            });
            this.delegates.getLogger().error(stryMutAct_9fa48("13948") ? "" : (stryCov_9fa48("13948"), 'Join canonical readiness timed out'), stryMutAct_9fa48("13949") ? {} : (stryCov_9fa48("13949"), {
              nodeId: this.nodeId,
              timeoutMs,
              attempts,
              reasons: terminalEvaluation.reasons,
              requiredSchemaVersion: terminalEvaluation.requiredSchemaVersion,
              appliedSchemaVersion: terminalEvaluation.appliedSchemaVersion,
              missingLeaders: terminalEvaluation.missingLeaders,
              inFlightReplicaOperations: terminalEvaluation.inFlightReplicaOperations,
              inFlightReplicaOperationDetails: terminalEvaluation.inFlightReplicaOperationDetails,
              excludedSelfTargetedCount: terminalEvaluation.excludedSelfTargetedCount,
              excludedWarmingTargetCount: terminalEvaluation.excludedWarmingTargetCount,
              excludedNonDiscoveryPartitionCount: terminalEvaluation.excludedNonDiscoveryPartitionCount,
              excludedRemotePriorityControlPlaneCount: terminalEvaluation.excludedRemotePriorityControlPlaneCount,
              excludedRemotePriorityControlPlaneOperationDetails: terminalEvaluation.excludedRemotePriorityControlPlaneOperationDetails,
              missingNodeEndpointNodeIds: terminalEvaluation.missingNodeEndpointNodeIds,
              missingPostgresWireNodeIds: terminalEvaluation.missingPostgresWireNodeIds,
              controlPlaneTargetAddress: terminalEvaluation.controlPlaneTargetAddress,
              controlPlaneTargetCandidates: terminalEvaluation.controlPlaneTargetCandidates,
              controlPlaneTargetConnectionStates: terminalEvaluation.controlPlaneTargetConnectionStates,
              topologySnapshotEpoch: terminalEvaluation.topologySnapshotEpoch,
              appliedTopologyEpoch: terminalEvaluation.appliedTopologyEpoch,
              snapshotError: stryMutAct_9fa48("13952") ? lastSnapshotError?.message && null : stryMutAct_9fa48("13951") ? false : stryMutAct_9fa48("13950") ? true : (stryCov_9fa48("13950", "13951", "13952"), (stryMutAct_9fa48("13953") ? lastSnapshotError.message : (stryCov_9fa48("13953"), lastSnapshotError?.message)) || null),
              timeoutKind: context.timeoutKind,
              lastProgressElapsedMs: context.lastProgressElapsedMs
            }));
            return error;
          }
        }
      }));
      const finalEvaluation = stryMutAct_9fa48("13956") ? result?.evaluation && null : stryMutAct_9fa48("13955") ? false : stryMutAct_9fa48("13954") ? true : (stryCov_9fa48("13954", "13955", "13956"), (stryMutAct_9fa48("13957") ? result.evaluation : (stryCov_9fa48("13957"), result?.evaluation)) || null);
      this.delegates.getLogger().info(stryMutAct_9fa48("13958") ? "" : (stryCov_9fa48("13958"), 'Join canonical readiness converged'), stryMutAct_9fa48("13959") ? {} : (stryCov_9fa48("13959"), {
        nodeId: this.nodeId,
        attempts: stryMutAct_9fa48("13962") ? result?.attempts && NUM.ONE : stryMutAct_9fa48("13961") ? false : stryMutAct_9fa48("13960") ? true : (stryCov_9fa48("13960", "13961", "13962"), (stryMutAct_9fa48("13963") ? result.attempts : (stryCov_9fa48("13963"), result?.attempts)) || NUM.ONE),
        elapsedMs: stryMutAct_9fa48("13966") ? result?.elapsedMs && NUM.ZERO : stryMutAct_9fa48("13965") ? false : stryMutAct_9fa48("13964") ? true : (stryCov_9fa48("13964", "13965", "13966"), (stryMutAct_9fa48("13967") ? result.elapsedMs : (stryCov_9fa48("13967"), result?.elapsedMs)) || NUM.ZERO),
        requiredSchemaVersion: stryMutAct_9fa48("13970") ? finalEvaluation?.requiredSchemaVersion && null : stryMutAct_9fa48("13969") ? false : stryMutAct_9fa48("13968") ? true : (stryCov_9fa48("13968", "13969", "13970"), (stryMutAct_9fa48("13971") ? finalEvaluation.requiredSchemaVersion : (stryCov_9fa48("13971"), finalEvaluation?.requiredSchemaVersion)) || null),
        appliedSchemaVersion: stryMutAct_9fa48("13974") ? finalEvaluation?.appliedSchemaVersion && null : stryMutAct_9fa48("13973") ? false : stryMutAct_9fa48("13972") ? true : (stryCov_9fa48("13972", "13973", "13974"), (stryMutAct_9fa48("13975") ? finalEvaluation.appliedSchemaVersion : (stryCov_9fa48("13975"), finalEvaluation?.appliedSchemaVersion)) || null)
      }));
    }
  }

  /**
   * Resolve join-readiness timeout.
   * @return {number}
   */
  resolveJoinReadinessTimeoutMs() {
    if (stryMutAct_9fa48("13976")) {
      {}
    } else {
      stryCov_9fa48("13976");
      const config = this.delegates.getConfig();
      if (stryMutAct_9fa48("13978") ? false : stryMutAct_9fa48("13977") ? true : (stryCov_9fa48("13977", "13978"), Number.isFinite(config.joinReadinessTimeoutMs))) {
        if (stryMutAct_9fa48("13979")) {
          {}
        } else {
          stryCov_9fa48("13979");
          return stryMutAct_9fa48("13980") ? Math.min(NUM.ZERO, Math.floor(config.joinReadinessTimeoutMs)) : (stryCov_9fa48("13980"), Math.max(NUM.ZERO, Math.floor(config.joinReadinessTimeoutMs)));
        }
      }
      return config.leadershipWaitTimeoutMs;
    }
  }

  /**
   * Resolve join-readiness poll interval.
   * @return {number}
   */
  resolveJoinReadinessPollIntervalMs() {
    if (stryMutAct_9fa48("13981")) {
      {}
    } else {
      stryCov_9fa48("13981");
      const config = this.delegates.getConfig();
      if (stryMutAct_9fa48("13983") ? false : stryMutAct_9fa48("13982") ? true : (stryCov_9fa48("13982", "13983"), Number.isFinite(config.joinReadinessPollIntervalMs))) {
        if (stryMutAct_9fa48("13984")) {
          {}
        } else {
          stryCov_9fa48("13984");
          return stryMutAct_9fa48("13985") ? Math.min(NUM.ONE, Math.floor(config.joinReadinessPollIntervalMs)) : (stryCov_9fa48("13985"), Math.max(NUM.ONE, Math.floor(config.joinReadinessPollIntervalMs)));
        }
      }
      return stryMutAct_9fa48("13986") ? Math.min(NUM.ONE, Math.floor(config.leadershipWaitInitialDelayMs)) : (stryCov_9fa48("13986"), Math.max(NUM.ONE, Math.floor(config.leadershipWaitInitialDelayMs)));
    }
  }

  /**
   * Refresh discovery-critical propagated tables while canonical join
   * readiness is blocked on topology visibility.
   * @param {Object|null} evaluation
   * @param {number} pollIntervalMs
   * @return {Promise<boolean>}
   */
  async repairCanonicalJoinReadinessIfNeeded(evaluation, pollIntervalMs) {
    if (stryMutAct_9fa48("13987")) {
      {}
    } else {
      stryCov_9fa48("13987");
      if (stryMutAct_9fa48("13990") ? (!evaluation || !Array.isArray(evaluation.reasons)) && !evaluation.reasons.includes(JOIN_READINESS_REASON.TOPOLOGY_NOT_READY) : stryMutAct_9fa48("13989") ? false : stryMutAct_9fa48("13988") ? true : (stryCov_9fa48("13988", "13989", "13990"), (stryMutAct_9fa48("13992") ? !evaluation && !Array.isArray(evaluation.reasons) : stryMutAct_9fa48("13991") ? false : (stryCov_9fa48("13991", "13992"), (stryMutAct_9fa48("13993") ? evaluation : (stryCov_9fa48("13993"), !evaluation)) || (stryMutAct_9fa48("13994") ? Array.isArray(evaluation.reasons) : (stryCov_9fa48("13994"), !Array.isArray(evaluation.reasons))))) || (stryMutAct_9fa48("13995") ? evaluation.reasons.includes(JOIN_READINESS_REASON.TOPOLOGY_NOT_READY) : (stryCov_9fa48("13995"), !evaluation.reasons.includes(JOIN_READINESS_REASON.TOPOLOGY_NOT_READY))))) {
        if (stryMutAct_9fa48("13996")) {
          {}
        } else {
          stryCov_9fa48("13996");
          return stryMutAct_9fa48("13997") ? true : (stryCov_9fa48("13997"), false);
        }
      }
      const cdcIntegrationService = this.delegates.getCdcIntegrationService();
      if (stryMutAct_9fa48("14000") ? false : stryMutAct_9fa48("13999") ? true : stryMutAct_9fa48("13998") ? cdcIntegrationService?.sqlQueryEngine : (stryCov_9fa48("13998", "13999", "14000"), !(stryMutAct_9fa48("14001") ? cdcIntegrationService.sqlQueryEngine : (stryCov_9fa48("14001"), cdcIntegrationService?.sqlQueryEngine)))) {
        if (stryMutAct_9fa48("14002")) {
          {}
        } else {
          stryCov_9fa48("14002");
          return stryMutAct_9fa48("14003") ? true : (stryCov_9fa48("14003"), false);
        }
      }
      if (stryMutAct_9fa48("14005") ? false : stryMutAct_9fa48("14004") ? true : (stryCov_9fa48("14004", "14005"), this.canonicalJoinRepairPromise)) {
        if (stryMutAct_9fa48("14006")) {
          {}
        } else {
          stryCov_9fa48("14006");
          return stryMutAct_9fa48("14007") ? true : (stryCov_9fa48("14007"), false);
        }
      }
      if (stryMutAct_9fa48("14009") ? false : stryMutAct_9fa48("14008") ? true : (stryCov_9fa48("14008", "14009"), this.isLocalRouterBackpressured())) {
        if (stryMutAct_9fa48("14010")) {
          {}
        } else {
          stryCov_9fa48("14010");
          return stryMutAct_9fa48("14011") ? true : (stryCov_9fa48("14011"), false);
        }
      }
      const minIntervalMs = stryMutAct_9fa48("14012") ? Math.min(JOIN_READINESS_REPAIR.MIN_INTERVAL_MS, Number.isFinite(pollIntervalMs) ? Math.floor(pollIntervalMs) : NUM.ZERO) : (stryCov_9fa48("14012"), Math.max(JOIN_READINESS_REPAIR.MIN_INTERVAL_MS, Number.isFinite(pollIntervalMs) ? Math.floor(pollIntervalMs) : NUM.ZERO));
      const now = this.now();
      if (stryMutAct_9fa48("14015") ? this.lastCanonicalJoinRepairAtMs > NUM.ZERO || now - this.lastCanonicalJoinRepairAtMs < minIntervalMs : stryMutAct_9fa48("14014") ? false : stryMutAct_9fa48("14013") ? true : (stryCov_9fa48("14013", "14014", "14015"), (stryMutAct_9fa48("14018") ? this.lastCanonicalJoinRepairAtMs <= NUM.ZERO : stryMutAct_9fa48("14017") ? this.lastCanonicalJoinRepairAtMs >= NUM.ZERO : stryMutAct_9fa48("14016") ? true : (stryCov_9fa48("14016", "14017", "14018"), this.lastCanonicalJoinRepairAtMs > NUM.ZERO)) && (stryMutAct_9fa48("14021") ? now - this.lastCanonicalJoinRepairAtMs >= minIntervalMs : stryMutAct_9fa48("14020") ? now - this.lastCanonicalJoinRepairAtMs <= minIntervalMs : stryMutAct_9fa48("14019") ? true : (stryCov_9fa48("14019", "14020", "14021"), (stryMutAct_9fa48("14022") ? now + this.lastCanonicalJoinRepairAtMs : (stryCov_9fa48("14022"), now - this.lastCanonicalJoinRepairAtMs)) < minIntervalMs)))) {
        if (stryMutAct_9fa48("14023")) {
          {}
        } else {
          stryCov_9fa48("14023");
          return stryMutAct_9fa48("14024") ? true : (stryCov_9fa48("14024"), false);
        }
      }
      this.lastCanonicalJoinRepairAtMs = now;
      const repairPromise = this.delegates.backfillPropagatedCacheTables(JOIN_READINESS_REPAIR.TABLES, stryMutAct_9fa48("14025") ? {} : (stryCov_9fa48("14025"), {
        blocking: stryMutAct_9fa48("14026") ? false : (stryCov_9fa48("14026"), true)
      })).catch(error => {
        if (stryMutAct_9fa48("14027")) {
          {}
        } else {
          stryCov_9fa48("14027");
          this.delegates.getLogger().warn(stryMutAct_9fa48("14028") ? "" : (stryCov_9fa48("14028"), 'Canonical join readiness repair backfill failed'), stryMutAct_9fa48("14029") ? {} : (stryCov_9fa48("14029"), {
            nodeId: this.nodeId,
            error: error.message,
            missingNodeEndpointNodeIds: evaluation.missingNodeEndpointNodeIds,
            missingPostgresWireNodeIds: evaluation.missingPostgresWireNodeIds
          }));
        }
      }).finally(() => {
        if (stryMutAct_9fa48("14030")) {
          {}
        } else {
          stryCov_9fa48("14030");
          if (stryMutAct_9fa48("14033") ? this.canonicalJoinRepairPromise !== repairPromise : stryMutAct_9fa48("14032") ? false : stryMutAct_9fa48("14031") ? true : (stryCov_9fa48("14031", "14032", "14033"), this.canonicalJoinRepairPromise === repairPromise)) {
            if (stryMutAct_9fa48("14034")) {
              {}
            } else {
              stryCov_9fa48("14034");
              this.canonicalJoinRepairPromise = null;
            }
          }
        }
      });
      this.canonicalJoinRepairPromise = repairPromise;
      await repairPromise;
      return stryMutAct_9fa48("14035") ? false : (stryCov_9fa48("14035"), true);
    }
  }

  /**
   * Repair mesh-connectivity discovery authority when node rows are visible
   * but canonical websocket endpoints are missing from the propagated cache.
   * @param {string[]|undefined|null} missingNodeIds
   * @return {Promise<boolean>}
   */
  async repairMeshConnectivityAuthorityIfNeeded(missingNodeIds) {
    if (stryMutAct_9fa48("14036")) {
      {}
    } else {
      stryCov_9fa48("14036");
      const normalizedMissingNodeIds = Array.from(new Set(stryMutAct_9fa48("14037") ? (Array.isArray(missingNodeIds) ? missingNodeIds : []).map(nodeId => String(nodeId || '').trim()) : (stryCov_9fa48("14037"), (Array.isArray(missingNodeIds) ? missingNodeIds : stryMutAct_9fa48("14038") ? ["Stryker was here"] : (stryCov_9fa48("14038"), [])).map(stryMutAct_9fa48("14039") ? () => undefined : (stryCov_9fa48("14039"), nodeId => stryMutAct_9fa48("14040") ? String(nodeId || '') : (stryCov_9fa48("14040"), String(stryMutAct_9fa48("14043") ? nodeId && '' : stryMutAct_9fa48("14042") ? false : stryMutAct_9fa48("14041") ? true : (stryCov_9fa48("14041", "14042", "14043"), nodeId || (stryMutAct_9fa48("14044") ? "Stryker was here!" : (stryCov_9fa48("14044"), '')))).trim()))).filter(stryMutAct_9fa48("14045") ? () => undefined : (stryCov_9fa48("14045"), nodeId => stryMutAct_9fa48("14048") ? nodeId.length > NUM.ZERO || nodeId !== this.nodeId : stryMutAct_9fa48("14047") ? false : stryMutAct_9fa48("14046") ? true : (stryCov_9fa48("14046", "14047", "14048"), (stryMutAct_9fa48("14051") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("14050") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("14049") ? true : (stryCov_9fa48("14049", "14050", "14051"), nodeId.length > NUM.ZERO)) && (stryMutAct_9fa48("14053") ? nodeId === this.nodeId : stryMutAct_9fa48("14052") ? true : (stryCov_9fa48("14052", "14053"), nodeId !== this.nodeId))))))));
      if (stryMutAct_9fa48("14056") ? normalizedMissingNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("14055") ? false : stryMutAct_9fa48("14054") ? true : (stryCov_9fa48("14054", "14055", "14056"), normalizedMissingNodeIds.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("14057")) {
          {}
        } else {
          stryCov_9fa48("14057");
          return stryMutAct_9fa48("14058") ? true : (stryCov_9fa48("14058"), false);
        }
      }
      const cdcIntegrationService = stryMutAct_9fa48("14059") ? this.delegates.getCdcIntegrationService() : (stryCov_9fa48("14059"), this.delegates.getCdcIntegrationService?.());
      if (stryMutAct_9fa48("14062") ? false : stryMutAct_9fa48("14061") ? true : stryMutAct_9fa48("14060") ? cdcIntegrationService?.sqlQueryEngine : (stryCov_9fa48("14060", "14061", "14062"), !(stryMutAct_9fa48("14063") ? cdcIntegrationService.sqlQueryEngine : (stryCov_9fa48("14063"), cdcIntegrationService?.sqlQueryEngine)))) {
        if (stryMutAct_9fa48("14064")) {
          {}
        } else {
          stryCov_9fa48("14064");
          return stryMutAct_9fa48("14065") ? true : (stryCov_9fa48("14065"), false);
        }
      }
      if (stryMutAct_9fa48("14067") ? false : stryMutAct_9fa48("14066") ? true : (stryCov_9fa48("14066", "14067"), this.meshConnectivityRepairPromise)) {
        if (stryMutAct_9fa48("14068")) {
          {}
        } else {
          stryCov_9fa48("14068");
          await this.meshConnectivityRepairPromise;
          return stryMutAct_9fa48("14069") ? false : (stryCov_9fa48("14069"), true);
        }
      }
      if (stryMutAct_9fa48("14071") ? false : stryMutAct_9fa48("14070") ? true : (stryCov_9fa48("14070", "14071"), this.isLocalRouterBackpressured())) {
        if (stryMutAct_9fa48("14072")) {
          {}
        } else {
          stryCov_9fa48("14072");
          return stryMutAct_9fa48("14073") ? true : (stryCov_9fa48("14073"), false);
        }
      }
      const now = this.now();
      if (stryMutAct_9fa48("14076") ? this.lastMeshConnectivityRepairAtMs > NUM.ZERO || now - this.lastMeshConnectivityRepairAtMs < JOIN_MESH_CONNECTIVITY_REPAIR.MIN_INTERVAL_MS : stryMutAct_9fa48("14075") ? false : stryMutAct_9fa48("14074") ? true : (stryCov_9fa48("14074", "14075", "14076"), (stryMutAct_9fa48("14079") ? this.lastMeshConnectivityRepairAtMs <= NUM.ZERO : stryMutAct_9fa48("14078") ? this.lastMeshConnectivityRepairAtMs >= NUM.ZERO : stryMutAct_9fa48("14077") ? true : (stryCov_9fa48("14077", "14078", "14079"), this.lastMeshConnectivityRepairAtMs > NUM.ZERO)) && (stryMutAct_9fa48("14082") ? now - this.lastMeshConnectivityRepairAtMs >= JOIN_MESH_CONNECTIVITY_REPAIR.MIN_INTERVAL_MS : stryMutAct_9fa48("14081") ? now - this.lastMeshConnectivityRepairAtMs <= JOIN_MESH_CONNECTIVITY_REPAIR.MIN_INTERVAL_MS : stryMutAct_9fa48("14080") ? true : (stryCov_9fa48("14080", "14081", "14082"), (stryMutAct_9fa48("14083") ? now + this.lastMeshConnectivityRepairAtMs : (stryCov_9fa48("14083"), now - this.lastMeshConnectivityRepairAtMs)) < JOIN_MESH_CONNECTIVITY_REPAIR.MIN_INTERVAL_MS)))) {
        if (stryMutAct_9fa48("14084")) {
          {}
        } else {
          stryCov_9fa48("14084");
          return stryMutAct_9fa48("14085") ? true : (stryCov_9fa48("14085"), false);
        }
      }
      this.lastMeshConnectivityRepairAtMs = now;
      const repairPromise = this.delegates.backfillPropagatedCacheTables(JOIN_MESH_CONNECTIVITY_REPAIR.TABLES, stryMutAct_9fa48("14086") ? {} : (stryCov_9fa48("14086"), {
        blocking: stryMutAct_9fa48("14087") ? false : (stryCov_9fa48("14087"), true),
        preferBootstrapSnapshot: stryMutAct_9fa48("14088") ? true : (stryCov_9fa48("14088"), false),
        deliveryPriority: stryMutAct_9fa48("14089") ? "" : (stryCov_9fa48("14089"), 'critical')
      })).catch(error => {
        if (stryMutAct_9fa48("14090")) {
          {}
        } else {
          stryCov_9fa48("14090");
          this.delegates.getLogger().warn(stryMutAct_9fa48("14091") ? "" : (stryCov_9fa48("14091"), 'Mesh connectivity authority backfill failed'), stryMutAct_9fa48("14092") ? {} : (stryCov_9fa48("14092"), {
            nodeId: this.nodeId,
            error: error.message,
            missingNodeIds: normalizedMissingNodeIds
          }));
        }
      }).finally(() => {
        if (stryMutAct_9fa48("14093")) {
          {}
        } else {
          stryCov_9fa48("14093");
          if (stryMutAct_9fa48("14096") ? this.meshConnectivityRepairPromise !== repairPromise : stryMutAct_9fa48("14095") ? false : stryMutAct_9fa48("14094") ? true : (stryCov_9fa48("14094", "14095", "14096"), this.meshConnectivityRepairPromise === repairPromise)) {
            if (stryMutAct_9fa48("14097")) {
              {}
            } else {
              stryCov_9fa48("14097");
              this.meshConnectivityRepairPromise = null;
            }
          }
        }
      });
      this.meshConnectivityRepairPromise = repairPromise;
      await repairPromise;
      return stryMutAct_9fa48("14098") ? false : (stryCov_9fa48("14098"), true);
    }
  }

  /**
   * Determine whether the local router is currently backpressured.
   * @return {boolean}
   * @private
   */
  isLocalRouterBackpressured() {
    if (stryMutAct_9fa48("14099")) {
      {}
    } else {
      stryCov_9fa48("14099");
      const messageRouter = stryMutAct_9fa48("14102") ? this.delegates.getMessageRouter?.() && null : stryMutAct_9fa48("14101") ? false : stryMutAct_9fa48("14100") ? true : (stryCov_9fa48("14100", "14101", "14102"), (stryMutAct_9fa48("14103") ? this.delegates.getMessageRouter() : (stryCov_9fa48("14103"), this.delegates.getMessageRouter?.())) || null);
      return PressureGovernor.getShared(stryMutAct_9fa48("14104") ? {} : (stryCov_9fa48("14104"), {
        nodeId: this.nodeId,
        messageRouter
      })).isBackpressured(stryMutAct_9fa48("14105") ? {} : (stryCov_9fa48("14105"), {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        resourceKeys: stryMutAct_9fa48("14106") ? [] : (stryCov_9fa48("14106"), [stryMutAct_9fa48("14107") ? "" : (stryCov_9fa48("14107"), 'join:repair')])
      }));
    }
  }

  /**
   * Determine the table scope for canonical join schema checks.
   * @return {string}
   */
  resolveJoinReadinessTableName() {
    if (stryMutAct_9fa48("14108")) {
      {}
    } else {
      stryCov_9fa48("14108");
      const config = this.delegates.getConfig();
      if (stryMutAct_9fa48("14111") ? typeof config.joinReadinessTableName !== TYPEOF.STRING : stryMutAct_9fa48("14110") ? false : stryMutAct_9fa48("14109") ? true : (stryCov_9fa48("14109", "14110", "14111"), typeof config.joinReadinessTableName === TYPEOF.STRING)) {
        if (stryMutAct_9fa48("14112")) {
          {}
        } else {
          stryCov_9fa48("14112");
          const normalized = stryMutAct_9fa48("14114") ? config.joinReadinessTableName.toLowerCase() : stryMutAct_9fa48("14113") ? config.joinReadinessTableName.trim().toUpperCase() : (stryCov_9fa48("14113", "14114"), config.joinReadinessTableName.trim().toLowerCase());
          if (stryMutAct_9fa48("14118") ? normalized.length <= NUM.ZERO : stryMutAct_9fa48("14117") ? normalized.length >= NUM.ZERO : stryMutAct_9fa48("14116") ? false : stryMutAct_9fa48("14115") ? true : (stryCov_9fa48("14115", "14116", "14117", "14118"), normalized.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("14119")) {
              {}
            } else {
              stryCov_9fa48("14119");
              return normalized;
            }
          }
        }
      }
      return JOIN_READINESS_DEFAULT_TABLE;
    }
  }

  /**
   * Collect one canonical join-readiness snapshot.
   * Provider errors are folded into a fail-closed snapshot.
   * @return {Promise<{snapshot: Object, error: Error|null}>}
   */
  async collectCanonicalJoinReadinessSnapshot() {
    if (stryMutAct_9fa48("14120")) {
      {}
    } else {
      stryCov_9fa48("14120");
      const messageRouter = this.delegates.getMessageRouter();
      const context = stryMutAct_9fa48("14121") ? {} : (stryCov_9fa48("14121"), {
        nodeId: this.nodeId,
        tableName: this.resolveJoinReadinessTableName(),
        bootstrapResponse: this.delegates.getBootstrapResponse(),
        systemTableCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter
      });
      try {
        if (stryMutAct_9fa48("14122")) {
          {}
        } else {
          stryCov_9fa48("14122");
          const provider = this.delegates.getJoinReadinessSnapshotProvider();
          const snapshot = provider ? await provider(context) : this.buildCanonicalJoinReadinessSnapshot(context);
          return stryMutAct_9fa48("14123") ? {} : (stryCov_9fa48("14123"), {
            snapshot,
            error: null
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("14124")) {
          {}
        } else {
          stryCov_9fa48("14124");
          return stryMutAct_9fa48("14125") ? {} : (stryCov_9fa48("14125"), {
            snapshot: stryMutAct_9fa48("14126") ? {} : (stryCov_9fa48("14126"), {
              nodeId: this.nodeId,
              tableName: context.tableName,
              routingReady: stryMutAct_9fa48("14127") ? true : (stryCov_9fa48("14127"), false),
              topologyReady: stryMutAct_9fa48("14128") ? true : (stryCov_9fa48("14128"), false),
              requiredSchemaVersion: null,
              appliedSchemaVersion: null
            }),
            error
          });
        }
      }
    }
  }

  /**
   * Build canonical join-readiness snapshot from local control-plane state.
   * This is the owner that combines topology, endpoint visibility, routing,
   * and topology-epoch convergence into one readiness view.
   * @param {Object} context
   * @return {Object}
   */
  buildCanonicalJoinReadinessSnapshot(context = {}) {
    if (stryMutAct_9fa48("14129")) {
      {}
    } else {
      stryCov_9fa48("14129");
      const systemTableCache = stryMutAct_9fa48("14132") ? context.systemTableCache && NodeService.getInstance().getSystemTableCache() : stryMutAct_9fa48("14131") ? false : stryMutAct_9fa48("14130") ? true : (stryCov_9fa48("14130", "14131", "14132"), context.systemTableCache || NodeService.getInstance().getSystemTableCache());
      const tableName = stryMutAct_9fa48("14135") ? context.tableName && this.resolveJoinReadinessTableName() : stryMutAct_9fa48("14134") ? false : stryMutAct_9fa48("14133") ? true : (stryCov_9fa48("14133", "14134", "14135"), context.tableName || this.resolveJoinReadinessTableName());
      const topologySnapshotEpoch = this.resolveBootstrapTopologySnapshotEpoch();
      const appliedTopologyEpoch = this.resolveAppliedTopologyEpoch(systemTableCache);
      const targetCandidates = this.resolveJoinReadinessTargetCandidates();
      const targetAddress = stryMutAct_9fa48("14138") ? targetCandidates[NUM.ZERO] && null : stryMutAct_9fa48("14137") ? false : stryMutAct_9fa48("14136") ? true : (stryCov_9fa48("14136", "14137", "14138"), targetCandidates[NUM.ZERO] || null);
      const routingReady = this.isControlPlaneAddressReachable(targetAddress);
      const topology = this.evaluateCanonicalJoinTopologyReadiness(systemTableCache);
      const endpointVisibility = this.evaluateCanonicalJoinEndpointVisibility(systemTableCache);
      const bootstrapResponse = this.delegates.getBootstrapResponse();
      const requiredSchemaVersion = resolveCanonicalRequiredSchemaVersion(tableName, systemTableCache, stryMutAct_9fa48("14139") ? bootstrapResponse.systemTableSnapshots : (stryCov_9fa48("14139"), bootstrapResponse?.systemTableSnapshots));
      const appliedSchemaVersion = resolveCanonicalAppliedSchemaVersion(tableName, systemTableCache);
      return stryMutAct_9fa48("14140") ? {} : (stryCov_9fa48("14140"), {
        nodeId: this.nodeId,
        tableName,
        routingReady,
        topologyReady: stryMutAct_9fa48("14143") ? topology.ready && endpointVisibility.ready === true || this.isBootstrapTopologyEpochSatisfied({
          topologySnapshotEpoch,
          appliedTopologyEpoch
        }) : stryMutAct_9fa48("14142") ? false : stryMutAct_9fa48("14141") ? true : (stryCov_9fa48("14141", "14142", "14143"), (stryMutAct_9fa48("14145") ? topology.ready || endpointVisibility.ready === true : stryMutAct_9fa48("14144") ? true : (stryCov_9fa48("14144", "14145"), topology.ready && (stryMutAct_9fa48("14147") ? endpointVisibility.ready !== true : stryMutAct_9fa48("14146") ? true : (stryCov_9fa48("14146", "14147"), endpointVisibility.ready === (stryMutAct_9fa48("14148") ? false : (stryCov_9fa48("14148"), true)))))) && this.isBootstrapTopologyEpochSatisfied(stryMutAct_9fa48("14149") ? {} : (stryCov_9fa48("14149"), {
          topologySnapshotEpoch,
          appliedTopologyEpoch
        }))),
        controlPlaneTargetAddress: targetAddress,
        controlPlaneTargetCandidates: targetCandidates,
        controlPlaneTargetConnectionStates: this.resolveControlPlaneTargetConnectionStates(targetCandidates),
        topologySnapshotEpoch,
        appliedTopologyEpoch,
        requiredSchemaVersion,
        appliedSchemaVersion,
        requiredNodeIds: this.resolveJoinReadinessRequiredNodeIds(systemTableCache),
        missingLeaders: topology.missingLeaders,
        inFlightReplicaOperations: topology.inFlightReplicaOperations,
        inFlightReplicaOperationDetails: topology.inFlightReplicaOperationDetails,
        excludedSelfTargetedCount: topology.excludedSelfTargetedCount,
        excludedWarmingTargetCount: topology.excludedWarmingTargetCount,
        excludedNonDiscoveryPartitionCount: topology.excludedNonDiscoveryPartitionCount,
        excludedRemotePriorityControlPlaneCount: topology.excludedRemotePriorityControlPlaneCount,
        excludedRemotePriorityControlPlaneOperationDetails: topology.excludedRemotePriorityControlPlaneOperationDetails,
        missingNodeEndpointNodeIds: endpointVisibility.missingNodeEndpointNodeIds,
        missingPostgresWireNodeIds: endpointVisibility.missingPostgresWireNodeIds
      });
    }
  }

  /**
   * Check whether control-plane target address is currently reachable.
   * @param {string|null} targetAddress
   * @return {boolean}
   */
  isControlPlaneAddressReachable(targetAddress) {
    if (stryMutAct_9fa48("14150")) {
      {}
    } else {
      stryCov_9fa48("14150");
      if (stryMutAct_9fa48("14153") ? typeof targetAddress !== TYPEOF.STRING && targetAddress.length === NUM.ZERO : stryMutAct_9fa48("14152") ? false : stryMutAct_9fa48("14151") ? true : (stryCov_9fa48("14151", "14152", "14153"), (stryMutAct_9fa48("14155") ? typeof targetAddress === TYPEOF.STRING : stryMutAct_9fa48("14154") ? false : (stryCov_9fa48("14154", "14155"), typeof targetAddress !== TYPEOF.STRING)) || (stryMutAct_9fa48("14157") ? targetAddress.length !== NUM.ZERO : stryMutAct_9fa48("14156") ? false : (stryCov_9fa48("14156", "14157"), targetAddress.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("14158")) {
          {}
        } else {
          stryCov_9fa48("14158");
          return stryMutAct_9fa48("14159") ? true : (stryCov_9fa48("14159"), false);
        }
      }
      const match = targetAddress.match(stryMutAct_9fa48("14162") ? /^([/]+)\// : stryMutAct_9fa48("14161") ? /^([^/])\// : stryMutAct_9fa48("14160") ? /([^/]+)\// : (stryCov_9fa48("14160", "14161", "14162"), /^([^/]+)\//));
      const targetNodeId = match ? match[NUM.ONE] : null;
      if (stryMutAct_9fa48("14165") ? false : stryMutAct_9fa48("14164") ? true : stryMutAct_9fa48("14163") ? targetNodeId : (stryCov_9fa48("14163", "14164", "14165"), !targetNodeId)) {
        if (stryMutAct_9fa48("14166")) {
          {}
        } else {
          stryCov_9fa48("14166");
          return stryMutAct_9fa48("14167") ? true : (stryCov_9fa48("14167"), false);
        }
      }
      if (stryMutAct_9fa48("14170") ? targetNodeId !== this.nodeId : stryMutAct_9fa48("14169") ? false : stryMutAct_9fa48("14168") ? true : (stryCov_9fa48("14168", "14169", "14170"), targetNodeId === this.nodeId)) {
        if (stryMutAct_9fa48("14171")) {
          {}
        } else {
          stryCov_9fa48("14171");
          const readiness = getLocalQueryTransportReadiness(stryMutAct_9fa48("14174") ? this.delegates.getMessageRouter?.() && null : stryMutAct_9fa48("14173") ? false : stryMutAct_9fa48("14172") ? true : (stryCov_9fa48("14172", "14173", "14174"), (stryMutAct_9fa48("14175") ? this.delegates.getMessageRouter() : (stryCov_9fa48("14175"), this.delegates.getMessageRouter?.())) || null));
          if (stryMutAct_9fa48("14177") ? false : stryMutAct_9fa48("14176") ? true : (stryCov_9fa48("14176", "14177"), isLocalQueryTransportReady(readiness))) {
            if (stryMutAct_9fa48("14178")) {
              {}
            } else {
              stryCov_9fa48("14178");
              return stryMutAct_9fa48("14179") ? false : (stryCov_9fa48("14179"), true);
            }
          }
          return this.resolveJoinReadinessTargetCandidates().includes(targetAddress);
        }
      }
      const messageRouter = this.delegates.getMessageRouter();
      if (stryMutAct_9fa48("14182") ? typeof messageRouter?.getConnectionState === TYPEOF.FUNCTION : stryMutAct_9fa48("14181") ? false : stryMutAct_9fa48("14180") ? true : (stryCov_9fa48("14180", "14181", "14182"), typeof (stryMutAct_9fa48("14183") ? messageRouter.getConnectionState : (stryCov_9fa48("14183"), messageRouter?.getConnectionState)) !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("14184")) {
          {}
        } else {
          stryCov_9fa48("14184");
          return stryMutAct_9fa48("14185") ? false : (stryCov_9fa48("14185"), true);
        }
      }
      return stryMutAct_9fa48("14188") ? messageRouter.getConnectionState(targetNodeId) !== STATE.CONNECTED : stryMutAct_9fa48("14187") ? false : stryMutAct_9fa48("14186") ? true : (stryCov_9fa48("14186", "14187", "14188"), messageRouter.getConnectionState(targetNodeId) === STATE.CONNECTED);
    }
  }

  /**
   * Resolve ordered control-plane target candidates for readiness checks.
   * Local ingress is included because READY publication is allowed to route
   * through a live local kernel path when available.
   * @return {Array<string>}
   */
  resolveJoinReadinessTargetCandidates() {
    if (stryMutAct_9fa48("14189")) {
      {}
    } else {
      stryCov_9fa48("14189");
      if (stryMutAct_9fa48("14192") ? typeof this.delegates.resolveControlPlaneTargetAddressCandidates !== TYPEOF.FUNCTION : stryMutAct_9fa48("14191") ? false : stryMutAct_9fa48("14190") ? true : (stryCov_9fa48("14190", "14191", "14192"), typeof this.delegates.resolveControlPlaneTargetAddressCandidates === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("14193")) {
          {}
        } else {
          stryCov_9fa48("14193");
          const candidates = this.delegates.resolveControlPlaneTargetAddressCandidates(stryMutAct_9fa48("14194") ? {} : (stryCov_9fa48("14194"), {
            allowBootstrapHints: stryMutAct_9fa48("14195") ? false : (stryCov_9fa48("14195"), true),
            allowSelfTarget: stryMutAct_9fa48("14196") ? false : (stryCov_9fa48("14196"), true),
            localTargetMode: stryMutAct_9fa48("14197") ? "" : (stryCov_9fa48("14197"), 'any_replica'),
            requiredTables: getControlPlaneMessageRequiredTables(ControlPlaneMessageType.NODE_STATE_UPDATE)
          }));
          return Array.isArray(candidates) ? stryMutAct_9fa48("14198") ? [] : (stryCov_9fa48("14198"), [...new Set(stryMutAct_9fa48("14199") ? candidates : (stryCov_9fa48("14199"), candidates.filter(stryMutAct_9fa48("14200") ? () => undefined : (stryCov_9fa48("14200"), value => stryMutAct_9fa48("14203") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("14202") ? false : stryMutAct_9fa48("14201") ? true : (stryCov_9fa48("14201", "14202", "14203"), (stryMutAct_9fa48("14205") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("14204") ? true : (stryCov_9fa48("14204", "14205"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("14208") ? value.length <= NUM.ZERO : stryMutAct_9fa48("14207") ? value.length >= NUM.ZERO : stryMutAct_9fa48("14206") ? true : (stryCov_9fa48("14206", "14207", "14208"), value.length > NUM.ZERO)))))))]) : stryMutAct_9fa48("14209") ? ["Stryker was here"] : (stryCov_9fa48("14209"), []);
        }
      }
      if (stryMutAct_9fa48("14212") ? typeof this.delegates.resolveControlPlaneTargetAddress === TYPEOF.FUNCTION : stryMutAct_9fa48("14211") ? false : stryMutAct_9fa48("14210") ? true : (stryCov_9fa48("14210", "14211", "14212"), typeof this.delegates.resolveControlPlaneTargetAddress !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("14213")) {
          {}
        } else {
          stryCov_9fa48("14213");
          return stryMutAct_9fa48("14214") ? ["Stryker was here"] : (stryCov_9fa48("14214"), []);
        }
      }
      const candidates = stryMutAct_9fa48("14215") ? [] : (stryCov_9fa48("14215"), [this.delegates.resolveControlPlaneTargetAddress(stryMutAct_9fa48("14216") ? {} : (stryCov_9fa48("14216"), {
        allowBootstrapHints: stryMutAct_9fa48("14217") ? true : (stryCov_9fa48("14217"), false),
        allowSelfTarget: stryMutAct_9fa48("14218") ? false : (stryCov_9fa48("14218"), true),
        localTargetMode: stryMutAct_9fa48("14219") ? "" : (stryCov_9fa48("14219"), 'any_replica'),
        requiredTables: getControlPlaneMessageRequiredTables(ControlPlaneMessageType.NODE_STATE_UPDATE)
      })), this.delegates.resolveControlPlaneTargetAddress(stryMutAct_9fa48("14220") ? {} : (stryCov_9fa48("14220"), {
        allowBootstrapHints: stryMutAct_9fa48("14221") ? false : (stryCov_9fa48("14221"), true),
        allowSelfTarget: stryMutAct_9fa48("14222") ? false : (stryCov_9fa48("14222"), true),
        localTargetMode: stryMutAct_9fa48("14223") ? "" : (stryCov_9fa48("14223"), 'any_replica'),
        requiredTables: getControlPlaneMessageRequiredTables(ControlPlaneMessageType.NODE_STATE_UPDATE)
      }))]);
      return stryMutAct_9fa48("14224") ? [] : (stryCov_9fa48("14224"), [...new Set(stryMutAct_9fa48("14225") ? candidates : (stryCov_9fa48("14225"), candidates.filter(stryMutAct_9fa48("14226") ? () => undefined : (stryCov_9fa48("14226"), value => stryMutAct_9fa48("14229") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("14228") ? false : stryMutAct_9fa48("14227") ? true : (stryCov_9fa48("14227", "14228", "14229"), (stryMutAct_9fa48("14231") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("14230") ? true : (stryCov_9fa48("14230", "14231"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("14234") ? value.length <= NUM.ZERO : stryMutAct_9fa48("14233") ? value.length >= NUM.ZERO : stryMutAct_9fa48("14232") ? true : (stryCov_9fa48("14232", "14233", "14234"), value.length > NUM.ZERO)))))))]);
    }
  }

  /**
   * Resolve per-target router connection states for diagnostics.
   * @param {Array<string>} targetCandidates
   * @return {Object|null}
   */
  resolveControlPlaneTargetConnectionStates(targetCandidates) {
    if (stryMutAct_9fa48("14235")) {
      {}
    } else {
      stryCov_9fa48("14235");
      if (stryMutAct_9fa48("14238") ? !Array.isArray(targetCandidates) && targetCandidates.length === NUM.ZERO : stryMutAct_9fa48("14237") ? false : stryMutAct_9fa48("14236") ? true : (stryCov_9fa48("14236", "14237", "14238"), (stryMutAct_9fa48("14239") ? Array.isArray(targetCandidates) : (stryCov_9fa48("14239"), !Array.isArray(targetCandidates))) || (stryMutAct_9fa48("14241") ? targetCandidates.length !== NUM.ZERO : stryMutAct_9fa48("14240") ? false : (stryCov_9fa48("14240", "14241"), targetCandidates.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("14242")) {
          {}
        } else {
          stryCov_9fa48("14242");
          return null;
        }
      }
      const messageRouter = this.delegates.getMessageRouter();
      const connectionStates = {};
      for (const targetAddress of targetCandidates) {
        if (stryMutAct_9fa48("14243")) {
          {}
        } else {
          stryCov_9fa48("14243");
          if (stryMutAct_9fa48("14246") ? typeof targetAddress !== TYPEOF.STRING && targetAddress.length === NUM.ZERO : stryMutAct_9fa48("14245") ? false : stryMutAct_9fa48("14244") ? true : (stryCov_9fa48("14244", "14245", "14246"), (stryMutAct_9fa48("14248") ? typeof targetAddress === TYPEOF.STRING : stryMutAct_9fa48("14247") ? false : (stryCov_9fa48("14247", "14248"), typeof targetAddress !== TYPEOF.STRING)) || (stryMutAct_9fa48("14250") ? targetAddress.length !== NUM.ZERO : stryMutAct_9fa48("14249") ? false : (stryCov_9fa48("14249", "14250"), targetAddress.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("14251")) {
              {}
            } else {
              stryCov_9fa48("14251");
              continue;
            }
          }
          const match = targetAddress.match(stryMutAct_9fa48("14254") ? /^([/]+)\// : stryMutAct_9fa48("14253") ? /^([^/])\// : stryMutAct_9fa48("14252") ? /([^/]+)\// : (stryCov_9fa48("14252", "14253", "14254"), /^([^/]+)\//));
          const targetNodeId = match ? match[NUM.ONE] : null;
          if (stryMutAct_9fa48("14257") ? false : stryMutAct_9fa48("14256") ? true : stryMutAct_9fa48("14255") ? targetNodeId : (stryCov_9fa48("14255", "14256", "14257"), !targetNodeId)) {
            if (stryMutAct_9fa48("14258")) {
              {}
            } else {
              stryCov_9fa48("14258");
              connectionStates[targetAddress] = null;
              continue;
            }
          }
          if (stryMutAct_9fa48("14261") ? targetNodeId !== this.nodeId : stryMutAct_9fa48("14260") ? false : stryMutAct_9fa48("14259") ? true : (stryCov_9fa48("14259", "14260", "14261"), targetNodeId === this.nodeId)) {
            if (stryMutAct_9fa48("14262")) {
              {}
            } else {
              stryCov_9fa48("14262");
              const readiness = getLocalQueryTransportReadiness(stryMutAct_9fa48("14265") ? messageRouter && null : stryMutAct_9fa48("14264") ? false : stryMutAct_9fa48("14263") ? true : (stryCov_9fa48("14263", "14264", "14265"), messageRouter || null));
              connectionStates[targetAddress] = isLocalQueryTransportReady(readiness) ? stryMutAct_9fa48("14266") ? "" : (stryCov_9fa48("14266"), 'self') : stryMutAct_9fa48("14267") ? `` : (stryCov_9fa48("14267"), `self:${stryMutAct_9fa48("14270") ? readiness.state && 'unknown' : stryMutAct_9fa48("14269") ? false : stryMutAct_9fa48("14268") ? true : (stryCov_9fa48("14268", "14269", "14270"), readiness.state || (stryMutAct_9fa48("14271") ? "" : (stryCov_9fa48("14271"), 'unknown')))}`);
              continue;
            }
          }
          if (stryMutAct_9fa48("14274") ? typeof messageRouter?.getConnectionState === TYPEOF.FUNCTION : stryMutAct_9fa48("14273") ? false : stryMutAct_9fa48("14272") ? true : (stryCov_9fa48("14272", "14273", "14274"), typeof (stryMutAct_9fa48("14275") ? messageRouter.getConnectionState : (stryCov_9fa48("14275"), messageRouter?.getConnectionState)) !== TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("14276")) {
              {}
            } else {
              stryCov_9fa48("14276");
              connectionStates[targetAddress] = null;
              continue;
            }
          }
          connectionStates[targetAddress] = stryMutAct_9fa48("14279") ? messageRouter.getConnectionState(targetNodeId) && null : stryMutAct_9fa48("14278") ? false : stryMutAct_9fa48("14277") ? true : (stryCov_9fa48("14277", "14278", "14279"), messageRouter.getConnectionState(targetNodeId) || null);
        }
      }
      return (stryMutAct_9fa48("14283") ? Object.keys(connectionStates).length <= NUM.ZERO : stryMutAct_9fa48("14282") ? Object.keys(connectionStates).length >= NUM.ZERO : stryMutAct_9fa48("14281") ? false : stryMutAct_9fa48("14280") ? true : (stryCov_9fa48("14280", "14281", "14282", "14283"), Object.keys(connectionStates).length > NUM.ZERO)) ? connectionStates : null;
    }
  }

  /**
   * Evaluate topology readiness for canonical join convergence.
   * @param {Object|null} systemTableCache
   * @return {{
   *   ready: boolean,
   *   missingLeaders: Object|null,
   *   inFlightReplicaOperations: number,
   *   inFlightReplicaOperationDetails: Array<Object>,
   *   excludedSelfTargetedCount: number,
   *   excludedWarmingTargetCount: number,
   *   excludedNonDiscoveryPartitionCount: number,
   *   excludedRemotePriorityControlPlaneCount: number,
   *   excludedRemotePriorityControlPlaneOperationDetails: Array<Object>,
   * }}
   */
  evaluateCanonicalJoinTopologyReadiness(systemTableCache) {
    if (stryMutAct_9fa48("14284")) {
      {}
    } else {
      stryCov_9fa48("14284");
      if (stryMutAct_9fa48("14287") ? false : stryMutAct_9fa48("14286") ? true : stryMutAct_9fa48("14285") ? systemTableCache : (stryCov_9fa48("14285", "14286", "14287"), !systemTableCache)) {
        if (stryMutAct_9fa48("14288")) {
          {}
        } else {
          stryCov_9fa48("14288");
          return stryMutAct_9fa48("14289") ? {} : (stryCov_9fa48("14289"), {
            ready: stryMutAct_9fa48("14290") ? true : (stryCov_9fa48("14290"), false),
            missingLeaders: null,
            inFlightReplicaOperations: NUM.ZERO,
            inFlightReplicaOperationDetails: stryMutAct_9fa48("14291") ? ["Stryker was here"] : (stryCov_9fa48("14291"), []),
            excludedSelfTargetedCount: NUM.ZERO,
            excludedWarmingTargetCount: NUM.ZERO,
            excludedNonDiscoveryPartitionCount: NUM.ZERO,
            excludedRemotePriorityControlPlaneCount: NUM.ZERO,
            excludedRemotePriorityControlPlaneOperationDetails: stryMutAct_9fa48("14292") ? ["Stryker was here"] : (stryCov_9fa48("14292"), []),
            missingNodeEndpointNodeIds: stryMutAct_9fa48("14293") ? ["Stryker was here"] : (stryCov_9fa48("14293"), []),
            missingPostgresWireNodeIds: stryMutAct_9fa48("14294") ? ["Stryker was here"] : (stryCov_9fa48("14294"), [])
          });
        }
      }
      let missingLeaders = null;
      let missingCount = Number.POSITIVE_INFINITY;
      try {
        if (stryMutAct_9fa48("14295")) {
          {}
        } else {
          stryCov_9fa48("14295");
          const missing = this.delegates.getMissingSystemServiceLeaders(systemTableCache);
          missingLeaders = this.delegates.getBlockingSystemServiceLeaders(missing, systemTableCache);
          missingCount = getMissingSystemServiceLeaderCount(missingLeaders);
        }
      } catch (_evalErr) {
        if (stryMutAct_9fa48("14296")) {
          {}
        } else {
          stryCov_9fa48("14296");
          missingLeaders = null;
          missingCount = Number.POSITIVE_INFINITY;
        }
      }
      const operationDetails = this.collectCanonicalInFlightReplicaOperationDetails(systemTableCache);
      const inFlightReplicaOperationDetails = operationDetails.inFlightOperations;
      const inFlightReplicaOperations = inFlightReplicaOperationDetails.length;
      const excludedSelfTargetedCount = operationDetails.excludedSelfTargetedCount;
      const excludedWarmingTargetCount = operationDetails.excludedWarmingTargetCount;
      const excludedNonDiscoveryPartitionCount = operationDetails.excludedNonDiscoveryPartitionCount;
      const excludedRemotePriorityControlPlaneCount = operationDetails.excludedRemotePriorityControlPlaneCount;
      return stryMutAct_9fa48("14297") ? {} : (stryCov_9fa48("14297"), {
        ready: stryMutAct_9fa48("14300") ? missingCount === NUM.ZERO || inFlightReplicaOperations === NUM.ZERO : stryMutAct_9fa48("14299") ? false : stryMutAct_9fa48("14298") ? true : (stryCov_9fa48("14298", "14299", "14300"), (stryMutAct_9fa48("14302") ? missingCount !== NUM.ZERO : stryMutAct_9fa48("14301") ? true : (stryCov_9fa48("14301", "14302"), missingCount === NUM.ZERO)) && (stryMutAct_9fa48("14304") ? inFlightReplicaOperations !== NUM.ZERO : stryMutAct_9fa48("14303") ? true : (stryCov_9fa48("14303", "14304"), inFlightReplicaOperations === NUM.ZERO))),
        missingLeaders,
        inFlightReplicaOperations,
        inFlightReplicaOperationDetails,
        excludedSelfTargetedCount,
        excludedWarmingTargetCount,
        excludedNonDiscoveryPartitionCount,
        excludedRemotePriorityControlPlaneCount,
        excludedRemotePriorityControlPlaneOperationDetails: operationDetails.excludedRemotePriorityControlPlaneOperationDetails,
        missingNodeEndpointNodeIds: stryMutAct_9fa48("14305") ? ["Stryker was here"] : (stryCov_9fa48("14305"), []),
        missingPostgresWireNodeIds: stryMutAct_9fa48("14306") ? ["Stryker was here"] : (stryCov_9fa48("14306"), [])
      });
    }
  }

  /**
   * Ensure local discovery-critical endpoint rows cover this joining node.
   * Peer endpoint visibility converges independently and should not block the
   * local node from becoming ready once authoritative topology is otherwise
   * settled.
   * @param {Object|null} systemTableCache
   * @return {{
   *   ready: boolean,
   *   missingNodeEndpointNodeIds: string[],
   *   missingPostgresWireNodeIds: string[],
   * }}
   */
  evaluateCanonicalJoinEndpointVisibility(systemTableCache) {
    if (stryMutAct_9fa48("14307")) {
      {}
    } else {
      stryCov_9fa48("14307");
      if (stryMutAct_9fa48("14310") ? !systemTableCache && typeof systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("14309") ? false : stryMutAct_9fa48("14308") ? true : (stryCov_9fa48("14308", "14309", "14310"), (stryMutAct_9fa48("14311") ? systemTableCache : (stryCov_9fa48("14311"), !systemTableCache)) || (stryMutAct_9fa48("14313") ? typeof systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("14312") ? false : (stryCov_9fa48("14312", "14313"), typeof systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("14314")) {
          {}
        } else {
          stryCov_9fa48("14314");
          return stryMutAct_9fa48("14315") ? {} : (stryCov_9fa48("14315"), {
            ready: stryMutAct_9fa48("14316") ? true : (stryCov_9fa48("14316"), false),
            missingNodeEndpointNodeIds: stryMutAct_9fa48("14317") ? ["Stryker was here"] : (stryCov_9fa48("14317"), []),
            missingPostgresWireNodeIds: stryMutAct_9fa48("14318") ? ["Stryker was here"] : (stryCov_9fa48("14318"), [])
          });
        }
      }
      const requiredNodeIds = stryMutAct_9fa48("14319") ? [] : (stryCov_9fa48("14319"), [this.nodeId]);
      const nodeEndpointRows = stryMutAct_9fa48("14322") ? systemTableCache.getAll(TABLES.NODE_ENDPOINTS) && [] : stryMutAct_9fa48("14321") ? false : stryMutAct_9fa48("14320") ? true : (stryCov_9fa48("14320", "14321", "14322"), systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || (stryMutAct_9fa48("14323") ? ["Stryker was here"] : (stryCov_9fa48("14323"), [])));
      const serviceEndpointRows = stryMutAct_9fa48("14326") ? systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS) && [] : stryMutAct_9fa48("14325") ? false : stryMutAct_9fa48("14324") ? true : (stryCov_9fa48("14324", "14325", "14326"), systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS) || (stryMutAct_9fa48("14327") ? ["Stryker was here"] : (stryCov_9fa48("14327"), [])));
      const visibleNodeEndpointNodeIds = new Set();
      const visiblePostgresWireNodeIds = new Set();
      for (const row of nodeEndpointRows) {
        if (stryMutAct_9fa48("14328")) {
          {}
        } else {
          stryCov_9fa48("14328");
          const normalizedRow = normalizeNodeEndpointRow(row);
          const {
            nodeId,
            transportType,
            status
          } = normalizedRow;
          if (stryMutAct_9fa48("14331") ? nodeId.length !== NUM.ZERO : stryMutAct_9fa48("14330") ? false : stryMutAct_9fa48("14329") ? true : (stryCov_9fa48("14329", "14330", "14331"), nodeId.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("14332")) {
              {}
            } else {
              stryCov_9fa48("14332");
              continue;
            }
          }
          if (stryMutAct_9fa48("14335") ? status === String(ENDPOINT_STATUS.ACTIVE).toLowerCase() : stryMutAct_9fa48("14334") ? false : stryMutAct_9fa48("14333") ? true : (stryCov_9fa48("14333", "14334", "14335"), status !== (stryMutAct_9fa48("14336") ? String(ENDPOINT_STATUS.ACTIVE).toUpperCase() : (stryCov_9fa48("14336"), String(ENDPOINT_STATUS.ACTIVE).toLowerCase())))) {
            if (stryMutAct_9fa48("14337")) {
              {}
            } else {
              stryCov_9fa48("14337");
              continue;
            }
          }
          if (stryMutAct_9fa48("14340") ? transportType === String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() : stryMutAct_9fa48("14339") ? false : stryMutAct_9fa48("14338") ? true : (stryCov_9fa48("14338", "14339", "14340"), transportType !== (stryMutAct_9fa48("14341") ? String(TRANSPORT_TYPE.WEBSOCKET).toUpperCase() : (stryCov_9fa48("14341"), String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase())))) {
            if (stryMutAct_9fa48("14342")) {
              {}
            } else {
              stryCov_9fa48("14342");
              continue;
            }
          }
          visibleNodeEndpointNodeIds.add(nodeId);
        }
      }
      for (const row of serviceEndpointRows) {
        if (stryMutAct_9fa48("14343")) {
          {}
        } else {
          stryCov_9fa48("14343");
          const normalizedRow = normalizeServiceEndpointRow(row);
          const {
            nodeId,
            serviceId,
            healthStatus
          } = normalizedRow;
          if (stryMutAct_9fa48("14346") ? nodeId.length !== NUM.ZERO : stryMutAct_9fa48("14345") ? false : stryMutAct_9fa48("14344") ? true : (stryCov_9fa48("14344", "14345", "14346"), nodeId.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("14347")) {
              {}
            } else {
              stryCov_9fa48("14347");
              continue;
            }
          }
          if (stryMutAct_9fa48("14350") ? serviceId === META_SERVICE_ID.POSTGRES_WIRE : stryMutAct_9fa48("14349") ? false : stryMutAct_9fa48("14348") ? true : (stryCov_9fa48("14348", "14349", "14350"), serviceId !== META_SERVICE_ID.POSTGRES_WIRE)) {
            if (stryMutAct_9fa48("14351")) {
              {}
            } else {
              stryCov_9fa48("14351");
              continue;
            }
          }
          if (stryMutAct_9fa48("14354") ? healthStatus === String(ENDPOINT_SYNC_HEALTH.HEALTHY).toLowerCase() : stryMutAct_9fa48("14353") ? false : stryMutAct_9fa48("14352") ? true : (stryCov_9fa48("14352", "14353", "14354"), healthStatus !== (stryMutAct_9fa48("14355") ? String(ENDPOINT_SYNC_HEALTH.HEALTHY).toUpperCase() : (stryCov_9fa48("14355"), String(ENDPOINT_SYNC_HEALTH.HEALTHY).toLowerCase())))) {
            if (stryMutAct_9fa48("14356")) {
              {}
            } else {
              stryCov_9fa48("14356");
              continue;
            }
          }
          visiblePostgresWireNodeIds.add(nodeId);
        }
      }
      const missingNodeEndpointNodeIds = stryMutAct_9fa48("14357") ? requiredNodeIds : (stryCov_9fa48("14357"), requiredNodeIds.filter(stryMutAct_9fa48("14358") ? () => undefined : (stryCov_9fa48("14358"), nodeId => stryMutAct_9fa48("14359") ? visibleNodeEndpointNodeIds.has(nodeId) : (stryCov_9fa48("14359"), !visibleNodeEndpointNodeIds.has(nodeId)))));
      const missingPostgresWireNodeIds = stryMutAct_9fa48("14360") ? requiredNodeIds : (stryCov_9fa48("14360"), requiredNodeIds.filter(stryMutAct_9fa48("14361") ? () => undefined : (stryCov_9fa48("14361"), nodeId => stryMutAct_9fa48("14362") ? visiblePostgresWireNodeIds.has(nodeId) : (stryCov_9fa48("14362"), !visiblePostgresWireNodeIds.has(nodeId)))));
      return stryMutAct_9fa48("14363") ? {} : (stryCov_9fa48("14363"), {
        ready: stryMutAct_9fa48("14366") ? missingNodeEndpointNodeIds.length === NUM.ZERO || missingPostgresWireNodeIds.length === NUM.ZERO : stryMutAct_9fa48("14365") ? false : stryMutAct_9fa48("14364") ? true : (stryCov_9fa48("14364", "14365", "14366"), (stryMutAct_9fa48("14368") ? missingNodeEndpointNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("14367") ? true : (stryCov_9fa48("14367", "14368"), missingNodeEndpointNodeIds.length === NUM.ZERO)) && (stryMutAct_9fa48("14370") ? missingPostgresWireNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("14369") ? true : (stryCov_9fa48("14369", "14370"), missingPostgresWireNodeIds.length === NUM.ZERO))),
        missingNodeEndpointNodeIds,
        missingPostgresWireNodeIds
      });
    }
  }

  /**
   * Return ACTIVE node ids visible in the local cache.
   * @param {Object|null} systemTableCache
   * @return {string[]}
   */
  getCanonicalJoinActiveNodeIds(systemTableCache) {
    if (stryMutAct_9fa48("14371")) {
      {}
    } else {
      stryCov_9fa48("14371");
      const readinessService = stryMutAct_9fa48("14374") ? this.delegates.getControlPlaneReadinessService?.() && null : stryMutAct_9fa48("14373") ? false : stryMutAct_9fa48("14372") ? true : (stryCov_9fa48("14372", "14373", "14374"), (stryMutAct_9fa48("14375") ? this.delegates.getControlPlaneReadinessService() : (stryCov_9fa48("14375"), this.delegates.getControlPlaneReadinessService?.())) || null);
      if (stryMutAct_9fa48("14378") ? !systemTableCache && typeof systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("14377") ? false : stryMutAct_9fa48("14376") ? true : (stryCov_9fa48("14376", "14377", "14378"), (stryMutAct_9fa48("14379") ? systemTableCache : (stryCov_9fa48("14379"), !systemTableCache)) || (stryMutAct_9fa48("14381") ? typeof systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("14380") ? false : (stryCov_9fa48("14380", "14381"), typeof systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("14382")) {
          {}
        } else {
          stryCov_9fa48("14382");
          if (stryMutAct_9fa48("14385") ? readinessService || typeof readinessService.getStartupAuthoritySnapshotSync === TYPEOF.FUNCTION : stryMutAct_9fa48("14384") ? false : stryMutAct_9fa48("14383") ? true : (stryCov_9fa48("14383", "14384", "14385"), readinessService && (stryMutAct_9fa48("14387") ? typeof readinessService.getStartupAuthoritySnapshotSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("14386") ? true : (stryCov_9fa48("14386", "14387"), typeof readinessService.getStartupAuthoritySnapshotSync === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("14388")) {
              {}
            } else {
              stryCov_9fa48("14388");
              const startupAuthority = readinessService.getStartupAuthoritySnapshotSync(this.nodeId, this.now());
              if (stryMutAct_9fa48("14390") ? false : stryMutAct_9fa48("14389") ? true : (stryCov_9fa48("14389", "14390"), Array.isArray(stryMutAct_9fa48("14391") ? startupAuthority.canonicalStartupNodeIds : (stryCov_9fa48("14391"), startupAuthority?.canonicalStartupNodeIds)))) {
                if (stryMutAct_9fa48("14392")) {
                  {}
                } else {
                  stryCov_9fa48("14392");
                  return stryMutAct_9fa48("14393") ? [] : (stryCov_9fa48("14393"), [...new Set(stryMutAct_9fa48("14394") ? startupAuthority.canonicalStartupNodeIds : (stryCov_9fa48("14394"), startupAuthority.canonicalStartupNodeIds.filter(stryMutAct_9fa48("14395") ? () => undefined : (stryCov_9fa48("14395"), nodeId => stryMutAct_9fa48("14398") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("14397") ? false : stryMutAct_9fa48("14396") ? true : (stryCov_9fa48("14396", "14397", "14398"), (stryMutAct_9fa48("14400") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("14399") ? true : (stryCov_9fa48("14399", "14400"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("14403") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("14402") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("14401") ? true : (stryCov_9fa48("14401", "14402", "14403"), nodeId.length > NUM.ZERO)))))))]);
                }
              }
            }
          }
          return stryMutAct_9fa48("14404") ? ["Stryker was here"] : (stryCov_9fa48("14404"), []);
        }
      }
      const nodeRows = stryMutAct_9fa48("14407") ? systemTableCache.getAll(TABLES.NODES) && [] : stryMutAct_9fa48("14406") ? false : stryMutAct_9fa48("14405") ? true : (stryCov_9fa48("14405", "14406", "14407"), systemTableCache.getAll(TABLES.NODES) || (stryMutAct_9fa48("14408") ? ["Stryker was here"] : (stryCov_9fa48("14408"), [])));
      const activeNodeIds = stryMutAct_9fa48("14409") ? ["Stryker was here"] : (stryCov_9fa48("14409"), []);
      if (stryMutAct_9fa48("14412") ? readinessService || typeof readinessService.getNodeReadinessSync === TYPEOF.FUNCTION : stryMutAct_9fa48("14411") ? false : stryMutAct_9fa48("14410") ? true : (stryCov_9fa48("14410", "14411", "14412"), readinessService && (stryMutAct_9fa48("14414") ? typeof readinessService.getNodeReadinessSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("14413") ? true : (stryCov_9fa48("14413", "14414"), typeof readinessService.getNodeReadinessSync === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("14415")) {
          {}
        } else {
          stryCov_9fa48("14415");
          for (const row of nodeRows) {
            if (stryMutAct_9fa48("14416")) {
              {}
            } else {
              stryCov_9fa48("14416");
              const normalizedRow = normalizeNodeRow(row);
              const {
                nodeId
              } = normalizedRow;
              if (stryMutAct_9fa48("14419") ? nodeId.length !== NUM.ZERO : stryMutAct_9fa48("14418") ? false : stryMutAct_9fa48("14417") ? true : (stryCov_9fa48("14417", "14418", "14419"), nodeId.length === NUM.ZERO)) {
                if (stryMutAct_9fa48("14420")) {
                  {}
                } else {
                  stryCov_9fa48("14420");
                  continue;
                }
              }
              const readiness = readinessService.getNodeReadinessSync(nodeId, stryMutAct_9fa48("14421") ? {} : (stryCov_9fa48("14421"), {
                decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
              }));
              if (stryMutAct_9fa48("14424") ? readiness?.dimensions?.[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] !== true : stryMutAct_9fa48("14423") ? false : stryMutAct_9fa48("14422") ? true : (stryCov_9fa48("14422", "14423", "14424"), (stryMutAct_9fa48("14426") ? readiness.dimensions?.[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] : stryMutAct_9fa48("14425") ? readiness?.dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] : (stryCov_9fa48("14425", "14426"), readiness?.dimensions?.[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE])) === (stryMutAct_9fa48("14427") ? false : (stryCov_9fa48("14427"), true)))) {
                if (stryMutAct_9fa48("14428")) {
                  {}
                } else {
                  stryCov_9fa48("14428");
                  activeNodeIds.push(nodeId);
                }
              }
            }
          }
          if (stryMutAct_9fa48("14432") ? activeNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("14431") ? activeNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("14430") ? false : stryMutAct_9fa48("14429") ? true : (stryCov_9fa48("14429", "14430", "14431", "14432"), activeNodeIds.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("14433")) {
              {}
            } else {
              stryCov_9fa48("14433");
              return activeNodeIds;
            }
          }
          if (stryMutAct_9fa48("14436") ? typeof readinessService.getStartupAuthoritySnapshotSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("14435") ? false : stryMutAct_9fa48("14434") ? true : (stryCov_9fa48("14434", "14435", "14436"), typeof readinessService.getStartupAuthoritySnapshotSync === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("14437")) {
              {}
            } else {
              stryCov_9fa48("14437");
              const startupAuthority = readinessService.getStartupAuthoritySnapshotSync(this.nodeId, this.now());
              if (stryMutAct_9fa48("14439") ? false : stryMutAct_9fa48("14438") ? true : (stryCov_9fa48("14438", "14439"), Array.isArray(stryMutAct_9fa48("14440") ? startupAuthority.canonicalStartupNodeIds : (stryCov_9fa48("14440"), startupAuthority?.canonicalStartupNodeIds)))) {
                if (stryMutAct_9fa48("14441")) {
                  {}
                } else {
                  stryCov_9fa48("14441");
                  return stryMutAct_9fa48("14442") ? [] : (stryCov_9fa48("14442"), [...new Set(stryMutAct_9fa48("14443") ? startupAuthority.canonicalStartupNodeIds : (stryCov_9fa48("14443"), startupAuthority.canonicalStartupNodeIds.filter(stryMutAct_9fa48("14444") ? () => undefined : (stryCov_9fa48("14444"), nodeId => stryMutAct_9fa48("14447") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("14446") ? false : stryMutAct_9fa48("14445") ? true : (stryCov_9fa48("14445", "14446", "14447"), (stryMutAct_9fa48("14449") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("14448") ? true : (stryCov_9fa48("14448", "14449"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("14452") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("14451") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("14450") ? true : (stryCov_9fa48("14450", "14451", "14452"), nodeId.length > NUM.ZERO)))))))]);
                }
              }
            }
          }
        }
      }
      for (const row of nodeRows) {
        if (stryMutAct_9fa48("14453")) {
          {}
        } else {
          stryCov_9fa48("14453");
          const normalizedRow = normalizeNodeRow(row);
          const {
            nodeId,
            status
          } = normalizedRow;
          if (stryMutAct_9fa48("14456") ? nodeId.length !== NUM.ZERO : stryMutAct_9fa48("14455") ? false : stryMutAct_9fa48("14454") ? true : (stryCov_9fa48("14454", "14455", "14456"), nodeId.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("14457")) {
              {}
            } else {
              stryCov_9fa48("14457");
              continue;
            }
          }
          if (stryMutAct_9fa48("14460") ? status === String(NODE_STATE.ACTIVE).toLowerCase() : stryMutAct_9fa48("14459") ? false : stryMutAct_9fa48("14458") ? true : (stryCov_9fa48("14458", "14459", "14460"), status !== (stryMutAct_9fa48("14461") ? String(NODE_STATE.ACTIVE).toUpperCase() : (stryCov_9fa48("14461"), String(NODE_STATE.ACTIVE).toLowerCase())))) {
            if (stryMutAct_9fa48("14462")) {
              {}
            } else {
              stryCov_9fa48("14462");
              continue;
            }
          }
          activeNodeIds.push(nodeId);
        }
      }
      if (stryMutAct_9fa48("14466") ? activeNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("14465") ? activeNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("14464") ? false : stryMutAct_9fa48("14463") ? true : (stryCov_9fa48("14463", "14464", "14465", "14466"), activeNodeIds.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("14467")) {
          {}
        } else {
          stryCov_9fa48("14467");
          return activeNodeIds;
        }
      }
      const bootstrapActiveNodeIds = this.resolveBootstrapTopologySnapshotActiveNodeIds();
      if (stryMutAct_9fa48("14471") ? bootstrapActiveNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("14470") ? bootstrapActiveNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("14469") ? false : stryMutAct_9fa48("14468") ? true : (stryCov_9fa48("14468", "14469", "14470", "14471"), bootstrapActiveNodeIds.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("14472")) {
          {}
        } else {
          stryCov_9fa48("14472");
          return bootstrapActiveNodeIds;
        }
      }
      return stryMutAct_9fa48("14473") ? ["Stryker was here"] : (stryCov_9fa48("14473"), []);
    }
  }

  /**
   * Resolve one node id from a mesh-connectivity row shape.
   * @param {Object|null} row
   * @return {string}
   */
  resolveMeshConnectivityNodeId(row) {
    if (stryMutAct_9fa48("14474")) {
      {}
    } else {
      stryCov_9fa48("14474");
      return normalizeNodeRow(row).nodeId;
    }
  }

  /**
   * Resolve one node status from a mesh-connectivity row shape.
   * @param {Object|null} row
   * @return {string}
   */
  resolveMeshConnectivityNodeStatus(row) {
    if (stryMutAct_9fa48("14475")) {
      {}
    } else {
      stryCov_9fa48("14475");
      return normalizeNodeRow(row).status;
    }
  }

  /**
   * Resolve lifecycle-state tokens relevant to peer mesh eligibility.
   * Mesh reconciliation is a transport concern, so any non-terminal node with
   * authoritative endpoint metadata should be considered connectable.
   * @param {Object|null} row
   * @return {string[]}
   */
  resolveMeshConnectivityLifecycleTokens(row) {
    if (stryMutAct_9fa48("14476")) {
      {}
    } else {
      stryCov_9fa48("14476");
      return Array.from(new Set(stryMutAct_9fa48("14477") ? [row?.[COLUMN.STATUS], row?.status, row?.[COLUMN.CONNECTION_STATE], row?.connection_state, row?.connectionState].map(value => {
        return String(value || '').toLowerCase();
      }) : (stryCov_9fa48("14477"), (stryMutAct_9fa48("14478") ? [] : (stryCov_9fa48("14478"), [stryMutAct_9fa48("14479") ? row[COLUMN.STATUS] : (stryCov_9fa48("14479"), row?.[COLUMN.STATUS]), stryMutAct_9fa48("14480") ? row.status : (stryCov_9fa48("14480"), row?.status), stryMutAct_9fa48("14481") ? row[COLUMN.CONNECTION_STATE] : (stryCov_9fa48("14481"), row?.[COLUMN.CONNECTION_STATE]), stryMutAct_9fa48("14482") ? row.connection_state : (stryCov_9fa48("14482"), row?.connection_state), stryMutAct_9fa48("14483") ? row.connectionState : (stryCov_9fa48("14483"), row?.connectionState)])).map(value => {
        if (stryMutAct_9fa48("14484")) {
          {}
        } else {
          stryCov_9fa48("14484");
          return stryMutAct_9fa48("14485") ? String(value || '').toUpperCase() : (stryCov_9fa48("14485"), String(stryMutAct_9fa48("14488") ? value && '' : stryMutAct_9fa48("14487") ? false : stryMutAct_9fa48("14486") ? true : (stryCov_9fa48("14486", "14487", "14488"), value || (stryMutAct_9fa48("14489") ? "Stryker was here!" : (stryCov_9fa48("14489"), '')))).toLowerCase());
        }
      }).filter(stryMutAct_9fa48("14490") ? () => undefined : (stryCov_9fa48("14490"), value => stryMutAct_9fa48("14494") ? value.length <= NUM.ZERO : stryMutAct_9fa48("14493") ? value.length >= NUM.ZERO : stryMutAct_9fa48("14492") ? false : stryMutAct_9fa48("14491") ? true : (stryCov_9fa48("14491", "14492", "14493", "14494"), value.length > NUM.ZERO))))));
    }
  }

  /**
   * Determine whether a node row should participate in mesh reconciliation.
   * Nodes without lifecycle state are retained so bootstrap snapshots remain
   * usable before canonical readiness data has fully propagated. For steady
   * state, only explicitly terminal lifecycle states are excluded.
   * @param {Object|null} row
   * @return {boolean}
   */
  isMeshEligibleNodeRow(row) {
    if (stryMutAct_9fa48("14495")) {
      {}
    } else {
      stryCov_9fa48("14495");
      const nodeId = this.resolveMeshConnectivityNodeId(row);
      if (stryMutAct_9fa48("14498") ? nodeId.length !== NUM.ZERO : stryMutAct_9fa48("14497") ? false : stryMutAct_9fa48("14496") ? true : (stryCov_9fa48("14496", "14497", "14498"), nodeId.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("14499")) {
          {}
        } else {
          stryCov_9fa48("14499");
          return stryMutAct_9fa48("14500") ? true : (stryCov_9fa48("14500"), false);
        }
      }
      const lifecycleTokens = this.resolveMeshConnectivityLifecycleTokens(row);
      if (stryMutAct_9fa48("14503") ? lifecycleTokens.length !== NUM.ZERO : stryMutAct_9fa48("14502") ? false : stryMutAct_9fa48("14501") ? true : (stryCov_9fa48("14501", "14502", "14503"), lifecycleTokens.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("14504")) {
          {}
        } else {
          stryCov_9fa48("14504");
          return stryMutAct_9fa48("14505") ? false : (stryCov_9fa48("14505"), true);
        }
      }
      return stryMutAct_9fa48("14506") ? lifecycleTokens.some(token => {
        return MESH_INELIGIBLE_NODE_STATES.has(token);
      }) : (stryCov_9fa48("14506"), !(stryMutAct_9fa48("14507") ? lifecycleTokens.every(token => {
        return MESH_INELIGIBLE_NODE_STATES.has(token);
      }) : (stryCov_9fa48("14507"), lifecycleTokens.some(token => {
        if (stryMutAct_9fa48("14508")) {
          {}
        } else {
          stryCov_9fa48("14508");
          return MESH_INELIGIBLE_NODE_STATES.has(token);
        }
      }))));
    }
  }

  /**
   * Resolve node rows used for mesh connectivity.
   * Prefer the authoritative nodes cache over the initial bootstrap snapshot
   * so later joiners are not stranded when membership changes after bootstrap.
   * @return {{source: string, rows: Object[]}}
   */
  resolveMeshConnectivityNodeRows() {
    if (stryMutAct_9fa48("14509")) {
      {}
    } else {
      stryCov_9fa48("14509");
      const bootstrapActiveNodeIds = new Set(this.resolveBootstrapTopologySnapshotActiveNodeIds());
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      if (stryMutAct_9fa48("14512") ? systemTableCache || typeof systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("14511") ? false : stryMutAct_9fa48("14510") ? true : (stryCov_9fa48("14510", "14511", "14512"), systemTableCache && (stryMutAct_9fa48("14514") ? typeof systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("14513") ? true : (stryCov_9fa48("14513", "14514"), typeof systemTableCache.getAll === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("14515")) {
          {}
        } else {
          stryCov_9fa48("14515");
          const cacheRows = stryMutAct_9fa48("14516") ? systemTableCache.getAll(TABLES.NODES) || [] : (stryCov_9fa48("14516"), (stryMutAct_9fa48("14519") ? systemTableCache.getAll(TABLES.NODES) && [] : stryMutAct_9fa48("14518") ? false : stryMutAct_9fa48("14517") ? true : (stryCov_9fa48("14517", "14518", "14519"), systemTableCache.getAll(TABLES.NODES) || (stryMutAct_9fa48("14520") ? ["Stryker was here"] : (stryCov_9fa48("14520"), [])))).filter(row => {
            if (stryMutAct_9fa48("14521")) {
              {}
            } else {
              stryCov_9fa48("14521");
              return this.isMeshEligibleNodeRow(row);
            }
          }));
          if (stryMutAct_9fa48("14525") ? cacheRows.length <= NUM.ZERO : stryMutAct_9fa48("14524") ? cacheRows.length >= NUM.ZERO : stryMutAct_9fa48("14523") ? false : stryMutAct_9fa48("14522") ? true : (stryCov_9fa48("14522", "14523", "14524", "14525"), cacheRows.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("14526")) {
              {}
            } else {
              stryCov_9fa48("14526");
              return stryMutAct_9fa48("14527") ? {} : (stryCov_9fa48("14527"), {
                source: stryMutAct_9fa48("14528") ? "" : (stryCov_9fa48("14528"), 'system_table_cache'),
                rows: cacheRows
              });
            }
          }
        }
      }
      const bootstrapResponse = this.delegates.getBootstrapResponse();
      const snapshotRows = Array.isArray(stryMutAct_9fa48("14530") ? bootstrapResponse.systemTableSnapshots?.nodes : stryMutAct_9fa48("14529") ? bootstrapResponse?.systemTableSnapshots.nodes : (stryCov_9fa48("14529", "14530"), bootstrapResponse?.systemTableSnapshots?.nodes)) ? stryMutAct_9fa48("14531") ? bootstrapResponse.systemTableSnapshots.nodes : (stryCov_9fa48("14531"), bootstrapResponse.systemTableSnapshots.nodes.filter(row => {
        if (stryMutAct_9fa48("14532")) {
          {}
        } else {
          stryCov_9fa48("14532");
          if (stryMutAct_9fa48("14536") ? bootstrapActiveNodeIds.size <= NUM.ZERO : stryMutAct_9fa48("14535") ? bootstrapActiveNodeIds.size >= NUM.ZERO : stryMutAct_9fa48("14534") ? false : stryMutAct_9fa48("14533") ? true : (stryCov_9fa48("14533", "14534", "14535", "14536"), bootstrapActiveNodeIds.size > NUM.ZERO)) {
            if (stryMutAct_9fa48("14537")) {
              {}
            } else {
              stryCov_9fa48("14537");
              const nodeId = this.resolveMeshConnectivityNodeId(row);
              return stryMutAct_9fa48("14540") ? nodeId.length > NUM.ZERO || bootstrapActiveNodeIds.has(nodeId) : stryMutAct_9fa48("14539") ? false : stryMutAct_9fa48("14538") ? true : (stryCov_9fa48("14538", "14539", "14540"), (stryMutAct_9fa48("14543") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("14542") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("14541") ? true : (stryCov_9fa48("14541", "14542", "14543"), nodeId.length > NUM.ZERO)) && bootstrapActiveNodeIds.has(nodeId));
            }
          }
          return this.isMeshEligibleNodeRow(row);
        }
      })) : stryMutAct_9fa48("14544") ? ["Stryker was here"] : (stryCov_9fa48("14544"), []);
      return stryMutAct_9fa48("14545") ? {} : (stryCov_9fa48("14545"), {
        source: stryMutAct_9fa48("14546") ? "" : (stryCov_9fa48("14546"), 'bootstrap_snapshot'),
        rows: snapshotRows
      });
    }
  }

  /**
   * Build a stable mesh-membership signature for connection reconciliation.
   * @param {Array<Object>} nodeRows
   * @return {string}
   */
  buildClusterMeshSignature(nodeRows) {
    if (stryMutAct_9fa48("14547")) {
      {}
    } else {
      stryCov_9fa48("14547");
      if (stryMutAct_9fa48("14550") ? !Array.isArray(nodeRows) && nodeRows.length === NUM.ZERO : stryMutAct_9fa48("14549") ? false : stryMutAct_9fa48("14548") ? true : (stryCov_9fa48("14548", "14549", "14550"), (stryMutAct_9fa48("14551") ? Array.isArray(nodeRows) : (stryCov_9fa48("14551"), !Array.isArray(nodeRows))) || (stryMutAct_9fa48("14553") ? nodeRows.length !== NUM.ZERO : stryMutAct_9fa48("14552") ? false : (stryCov_9fa48("14552", "14553"), nodeRows.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("14554")) {
          {}
        } else {
          stryCov_9fa48("14554");
          return stryMutAct_9fa48("14555") ? "Stryker was here!" : (stryCov_9fa48("14555"), '');
        }
      }
      const members = stryMutAct_9fa48("14557") ? nodeRows.map(row => {
        const nodeId = this.resolveMeshConnectivityNodeId(row);
        if (nodeId.length === NUM.ZERO || nodeId === this.nodeId || !this.isMeshEligibleNodeRow(row)) {
          return null;
        }
        const nodeAddress = String(row?.[COLUMN.NODE_ADDRESS] || row?.node_address || row?.nodeAddress || '');
        const lifecycleSignature = this.resolveMeshConnectivityLifecycleTokens(row).sort().join('+');
        return `${nodeId}|${nodeAddress}|${lifecycleSignature}`;
      }).sort() : stryMutAct_9fa48("14556") ? nodeRows.map(row => {
        const nodeId = this.resolveMeshConnectivityNodeId(row);
        if (nodeId.length === NUM.ZERO || nodeId === this.nodeId || !this.isMeshEligibleNodeRow(row)) {
          return null;
        }
        const nodeAddress = String(row?.[COLUMN.NODE_ADDRESS] || row?.node_address || row?.nodeAddress || '');
        const lifecycleSignature = this.resolveMeshConnectivityLifecycleTokens(row).sort().join('+');
        return `${nodeId}|${nodeAddress}|${lifecycleSignature}`;
      }).filter(Boolean) : (stryCov_9fa48("14556", "14557"), nodeRows.map(row => {
        if (stryMutAct_9fa48("14558")) {
          {}
        } else {
          stryCov_9fa48("14558");
          const nodeId = this.resolveMeshConnectivityNodeId(row);
          if (stryMutAct_9fa48("14561") ? (nodeId.length === NUM.ZERO || nodeId === this.nodeId) && !this.isMeshEligibleNodeRow(row) : stryMutAct_9fa48("14560") ? false : stryMutAct_9fa48("14559") ? true : (stryCov_9fa48("14559", "14560", "14561"), (stryMutAct_9fa48("14563") ? nodeId.length === NUM.ZERO && nodeId === this.nodeId : stryMutAct_9fa48("14562") ? false : (stryCov_9fa48("14562", "14563"), (stryMutAct_9fa48("14565") ? nodeId.length !== NUM.ZERO : stryMutAct_9fa48("14564") ? false : (stryCov_9fa48("14564", "14565"), nodeId.length === NUM.ZERO)) || (stryMutAct_9fa48("14567") ? nodeId !== this.nodeId : stryMutAct_9fa48("14566") ? false : (stryCov_9fa48("14566", "14567"), nodeId === this.nodeId)))) || (stryMutAct_9fa48("14568") ? this.isMeshEligibleNodeRow(row) : (stryCov_9fa48("14568"), !this.isMeshEligibleNodeRow(row))))) {
            if (stryMutAct_9fa48("14569")) {
              {}
            } else {
              stryCov_9fa48("14569");
              return null;
            }
          }
          const nodeAddress = String(stryMutAct_9fa48("14572") ? (row?.[COLUMN.NODE_ADDRESS] || row?.node_address || row?.nodeAddress) && '' : stryMutAct_9fa48("14571") ? false : stryMutAct_9fa48("14570") ? true : (stryCov_9fa48("14570", "14571", "14572"), (stryMutAct_9fa48("14574") ? (row?.[COLUMN.NODE_ADDRESS] || row?.node_address) && row?.nodeAddress : stryMutAct_9fa48("14573") ? false : (stryCov_9fa48("14573", "14574"), (stryMutAct_9fa48("14576") ? row?.[COLUMN.NODE_ADDRESS] && row?.node_address : stryMutAct_9fa48("14575") ? false : (stryCov_9fa48("14575", "14576"), (stryMutAct_9fa48("14577") ? row[COLUMN.NODE_ADDRESS] : (stryCov_9fa48("14577"), row?.[COLUMN.NODE_ADDRESS])) || (stryMutAct_9fa48("14578") ? row.node_address : (stryCov_9fa48("14578"), row?.node_address)))) || (stryMutAct_9fa48("14579") ? row.nodeAddress : (stryCov_9fa48("14579"), row?.nodeAddress)))) || (stryMutAct_9fa48("14580") ? "Stryker was here!" : (stryCov_9fa48("14580"), ''))));
          const lifecycleSignature = stryMutAct_9fa48("14581") ? this.resolveMeshConnectivityLifecycleTokens(row).join('+') : (stryCov_9fa48("14581"), this.resolveMeshConnectivityLifecycleTokens(row).sort().join(stryMutAct_9fa48("14582") ? "" : (stryCov_9fa48("14582"), '+')));
          return stryMutAct_9fa48("14583") ? `` : (stryCov_9fa48("14583"), `${nodeId}|${nodeAddress}|${lifecycleSignature}`);
        }
      }).filter(Boolean).sort());
      return members.join(stryMutAct_9fa48("14584") ? "" : (stryCov_9fa48("14584"), ','));
    }
  }

  /**
   * Determine whether steady-state READY heartbeats need mesh
   * reconciliation.
   * @return {boolean}
   */
  shouldReconnectClusterMesh() {
    if (stryMutAct_9fa48("14585")) {
      {}
    } else {
      stryCov_9fa48("14585");
      const messageRouter = this.delegates.getMessageRouter();
      if (stryMutAct_9fa48("14588") ? false : stryMutAct_9fa48("14587") ? true : stryMutAct_9fa48("14586") ? messageRouter : (stryCov_9fa48("14586", "14587", "14588"), !messageRouter)) {
        if (stryMutAct_9fa48("14589")) {
          {}
        } else {
          stryCov_9fa48("14589");
          return stryMutAct_9fa48("14590") ? true : (stryCov_9fa48("14590"), false);
        }
      }
      const {
        rows: nodesSnapshot
      } = this.resolveMeshConnectivityNodeRows();
      if (stryMutAct_9fa48("14593") ? !Array.isArray(nodesSnapshot) && nodesSnapshot.length === NUM.ZERO : stryMutAct_9fa48("14592") ? false : stryMutAct_9fa48("14591") ? true : (stryCov_9fa48("14591", "14592", "14593"), (stryMutAct_9fa48("14594") ? Array.isArray(nodesSnapshot) : (stryCov_9fa48("14594"), !Array.isArray(nodesSnapshot))) || (stryMutAct_9fa48("14596") ? nodesSnapshot.length !== NUM.ZERO : stryMutAct_9fa48("14595") ? false : (stryCov_9fa48("14595", "14596"), nodesSnapshot.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("14597")) {
          {}
        } else {
          stryCov_9fa48("14597");
          return stryMutAct_9fa48("14598") ? true : (stryCov_9fa48("14598"), false);
        }
      }
      const signature = this.buildClusterMeshSignature(nodesSnapshot);
      if (stryMutAct_9fa48("14601") ? signature === this.lastClusterMeshSignature : stryMutAct_9fa48("14600") ? false : stryMutAct_9fa48("14599") ? true : (stryCov_9fa48("14599", "14600", "14601"), signature !== this.lastClusterMeshSignature)) {
        if (stryMutAct_9fa48("14602")) {
          {}
        } else {
          stryCov_9fa48("14602");
          return stryMutAct_9fa48("14603") ? false : (stryCov_9fa48("14603"), true);
        }
      }
      const hasConnectionState = stryMutAct_9fa48("14606") ? typeof messageRouter.getConnectionState !== TYPEOF.FUNCTION : stryMutAct_9fa48("14605") ? false : stryMutAct_9fa48("14604") ? true : (stryCov_9fa48("14604", "14605", "14606"), typeof messageRouter.getConnectionState === TYPEOF.FUNCTION);
      if (stryMutAct_9fa48("14609") ? false : stryMutAct_9fa48("14608") ? true : stryMutAct_9fa48("14607") ? hasConnectionState : (stryCov_9fa48("14607", "14608", "14609"), !hasConnectionState)) {
        if (stryMutAct_9fa48("14610")) {
          {}
        } else {
          stryCov_9fa48("14610");
          return stryMutAct_9fa48("14611") ? true : (stryCov_9fa48("14611"), false);
        }
      }
      return stryMutAct_9fa48("14612") ? nodesSnapshot.every(node => {
        const nodeId = this.resolveMeshConnectivityNodeId(node);
        return nodeId.length > NUM.ZERO && nodeId !== this.nodeId && !MESH_CONNECTED_OR_IN_FLIGHT_STATES.has(messageRouter.getConnectionState(nodeId));
      }) : (stryCov_9fa48("14612"), nodesSnapshot.some(node => {
        if (stryMutAct_9fa48("14613")) {
          {}
        } else {
          stryCov_9fa48("14613");
          const nodeId = this.resolveMeshConnectivityNodeId(node);
          return stryMutAct_9fa48("14616") ? nodeId.length > NUM.ZERO && nodeId !== this.nodeId || !MESH_CONNECTED_OR_IN_FLIGHT_STATES.has(messageRouter.getConnectionState(nodeId)) : stryMutAct_9fa48("14615") ? false : stryMutAct_9fa48("14614") ? true : (stryCov_9fa48("14614", "14615", "14616"), (stryMutAct_9fa48("14618") ? nodeId.length > NUM.ZERO || nodeId !== this.nodeId : stryMutAct_9fa48("14617") ? true : (stryCov_9fa48("14617", "14618"), (stryMutAct_9fa48("14621") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("14620") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("14619") ? true : (stryCov_9fa48("14619", "14620", "14621"), nodeId.length > NUM.ZERO)) && (stryMutAct_9fa48("14623") ? nodeId === this.nodeId : stryMutAct_9fa48("14622") ? true : (stryCov_9fa48("14622", "14623"), nodeId !== this.nodeId)))) && (stryMutAct_9fa48("14624") ? MESH_CONNECTED_OR_IN_FLIGHT_STATES.has(messageRouter.getConnectionState(nodeId)) : (stryCov_9fa48("14624"), !MESH_CONNECTED_OR_IN_FLIGHT_STATES.has(messageRouter.getConnectionState(nodeId)))));
        }
      }));
    }
  }

  /**
   * Collect non-terminal replica operations from local cache.
   * Self-targeted operations (where targetNodeId matches this node),
   * warming-node-targeted operations (where the target node is NOT in ACTIVE
   * state), partition operations outside the canonical discovery-critical
   * tables, and remote-to-remote priority control-plane recovery on already
   * active peers are excluded to prevent join-readiness deadlock on unrelated
   * recovery work.
   * @param {Object|null} systemTableCache
   * @return {{
   *   inFlightOperations: Array<Object>,
   *   excludedSelfTargetedCount: number,
   *   excludedWarmingTargetCount: number,
   *   excludedNonDiscoveryPartitionCount: number,
   *   excludedRemotePriorityControlPlaneCount: number,
   *   excludedRemotePriorityControlPlaneOperationDetails: Array<Object>,
   * }}
   */
  collectCanonicalInFlightReplicaOperationDetails(systemTableCache) {
    if (stryMutAct_9fa48("14625")) {
      {}
    } else {
      stryCov_9fa48("14625");
      if (stryMutAct_9fa48("14628") ? !systemTableCache && typeof systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("14627") ? false : stryMutAct_9fa48("14626") ? true : (stryCov_9fa48("14626", "14627", "14628"), (stryMutAct_9fa48("14629") ? systemTableCache : (stryCov_9fa48("14629"), !systemTableCache)) || (stryMutAct_9fa48("14631") ? typeof systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("14630") ? false : (stryCov_9fa48("14630", "14631"), typeof systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("14632")) {
          {}
        } else {
          stryCov_9fa48("14632");
          return stryMutAct_9fa48("14633") ? {} : (stryCov_9fa48("14633"), {
            inFlightOperations: stryMutAct_9fa48("14634") ? ["Stryker was here"] : (stryCov_9fa48("14634"), []),
            excludedSelfTargetedCount: NUM.ZERO,
            excludedWarmingTargetCount: NUM.ZERO,
            excludedNonDiscoveryPartitionCount: NUM.ZERO,
            excludedRemotePriorityControlPlaneCount: NUM.ZERO,
            excludedRemotePriorityControlPlaneOperationDetails: stryMutAct_9fa48("14635") ? ["Stryker was here"] : (stryCov_9fa48("14635"), [])
          });
        }
      }
      const activeNodeIds = new Set(this.getCanonicalJoinActiveNodeIds(systemTableCache));
      const discoveryCriticalPartitionIds = this.resolveCanonicalDiscoveryCriticalPartitionIds(systemTableCache);
      const rows = stryMutAct_9fa48("14638") ? systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) && [] : stryMutAct_9fa48("14637") ? false : stryMutAct_9fa48("14636") ? true : (stryCov_9fa48("14636", "14637", "14638"), systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || (stryMutAct_9fa48("14639") ? ["Stryker was here"] : (stryCov_9fa48("14639"), [])));
      const serviceRows = stryMutAct_9fa48("14642") ? systemTableCache.getAll(TABLES.SERVICES) && [] : stryMutAct_9fa48("14641") ? false : stryMutAct_9fa48("14640") ? true : (stryCov_9fa48("14640", "14641", "14642"), systemTableCache.getAll(TABLES.SERVICES) || (stryMutAct_9fa48("14643") ? ["Stryker was here"] : (stryCov_9fa48("14643"), [])));
      const inFlightOperations = stryMutAct_9fa48("14644") ? ["Stryker was here"] : (stryCov_9fa48("14644"), []);
      const excludedRemotePriorityControlPlaneOperationDetails = stryMutAct_9fa48("14645") ? ["Stryker was here"] : (stryCov_9fa48("14645"), []);
      let excludedSelfTargetedCount = NUM.ZERO;
      let excludedWarmingTargetCount = NUM.ZERO;
      let excludedNonDiscoveryPartitionCount = NUM.ZERO;
      let excludedRemotePriorityControlPlaneCount = NUM.ZERO;
      for (const row of rows) {
        if (stryMutAct_9fa48("14646")) {
          {}
        } else {
          stryCov_9fa48("14646");
          const normalizedOperation = normalizeReplicaOperationRecord(row);
          if (stryMutAct_9fa48("14648") ? false : stryMutAct_9fa48("14647") ? true : (stryCov_9fa48("14647", "14648"), isReplicaOperationInFlight(normalizedOperation, stryMutAct_9fa48("14649") ? {} : (stryCov_9fa48("14649"), {
            serviceRows
          })))) {
            if (stryMutAct_9fa48("14650")) {
              {}
            } else {
              stryCov_9fa48("14650");
              if (stryMutAct_9fa48("14653") ? normalizedOperation.targetNodeId !== this.nodeId : stryMutAct_9fa48("14652") ? false : stryMutAct_9fa48("14651") ? true : (stryCov_9fa48("14651", "14652", "14653"), normalizedOperation.targetNodeId === this.nodeId)) {
                if (stryMutAct_9fa48("14654")) {
                  {}
                } else {
                  stryCov_9fa48("14654");
                  stryMutAct_9fa48("14655") ? excludedSelfTargetedCount-- : (stryCov_9fa48("14655"), excludedSelfTargetedCount++);
                  continue;
                }
              }
              if (stryMutAct_9fa48("14658") ? false : stryMutAct_9fa48("14657") ? true : stryMutAct_9fa48("14656") ? activeNodeIds.has(normalizedOperation.targetNodeId) : (stryCov_9fa48("14656", "14657", "14658"), !activeNodeIds.has(normalizedOperation.targetNodeId))) {
                if (stryMutAct_9fa48("14659")) {
                  {}
                } else {
                  stryCov_9fa48("14659");
                  stryMutAct_9fa48("14660") ? excludedWarmingTargetCount-- : (stryCov_9fa48("14660"), excludedWarmingTargetCount++);
                  continue;
                }
              }
              if (stryMutAct_9fa48("14663") ? normalizedOperation.entityType === 'partition' && discoveryCriticalPartitionIds.size > NUM.ZERO && normalizedOperation.partitionGroupId.length > NUM.ZERO || !discoveryCriticalPartitionIds.has(normalizedOperation.partitionGroupId) : stryMutAct_9fa48("14662") ? false : stryMutAct_9fa48("14661") ? true : (stryCov_9fa48("14661", "14662", "14663"), (stryMutAct_9fa48("14665") ? normalizedOperation.entityType === 'partition' && discoveryCriticalPartitionIds.size > NUM.ZERO || normalizedOperation.partitionGroupId.length > NUM.ZERO : stryMutAct_9fa48("14664") ? true : (stryCov_9fa48("14664", "14665"), (stryMutAct_9fa48("14667") ? normalizedOperation.entityType === 'partition' || discoveryCriticalPartitionIds.size > NUM.ZERO : stryMutAct_9fa48("14666") ? true : (stryCov_9fa48("14666", "14667"), (stryMutAct_9fa48("14669") ? normalizedOperation.entityType !== 'partition' : stryMutAct_9fa48("14668") ? true : (stryCov_9fa48("14668", "14669"), normalizedOperation.entityType === (stryMutAct_9fa48("14670") ? "" : (stryCov_9fa48("14670"), 'partition')))) && (stryMutAct_9fa48("14673") ? discoveryCriticalPartitionIds.size <= NUM.ZERO : stryMutAct_9fa48("14672") ? discoveryCriticalPartitionIds.size >= NUM.ZERO : stryMutAct_9fa48("14671") ? true : (stryCov_9fa48("14671", "14672", "14673"), discoveryCriticalPartitionIds.size > NUM.ZERO)))) && (stryMutAct_9fa48("14676") ? normalizedOperation.partitionGroupId.length <= NUM.ZERO : stryMutAct_9fa48("14675") ? normalizedOperation.partitionGroupId.length >= NUM.ZERO : stryMutAct_9fa48("14674") ? true : (stryCov_9fa48("14674", "14675", "14676"), normalizedOperation.partitionGroupId.length > NUM.ZERO)))) && (stryMutAct_9fa48("14677") ? discoveryCriticalPartitionIds.has(normalizedOperation.partitionGroupId) : (stryCov_9fa48("14677"), !discoveryCriticalPartitionIds.has(normalizedOperation.partitionGroupId))))) {
                if (stryMutAct_9fa48("14678")) {
                  {}
                } else {
                  stryCov_9fa48("14678");
                  stryMutAct_9fa48("14679") ? excludedNonDiscoveryPartitionCount-- : (stryCov_9fa48("14679"), excludedNonDiscoveryPartitionCount++);
                  continue;
                }
              }
              const operationDetail = this.buildCanonicalJoinReplicaOperationDetail(normalizedOperation, row);
              if (stryMutAct_9fa48("14681") ? false : stryMutAct_9fa48("14680") ? true : (stryCov_9fa48("14680", "14681"), this.isRemotePriorityControlPlaneRecoveryOperation(normalizedOperation, activeNodeIds, discoveryCriticalPartitionIds))) {
                if (stryMutAct_9fa48("14682")) {
                  {}
                } else {
                  stryCov_9fa48("14682");
                  stryMutAct_9fa48("14683") ? excludedRemotePriorityControlPlaneCount-- : (stryCov_9fa48("14683"), excludedRemotePriorityControlPlaneCount++);
                  excludedRemotePriorityControlPlaneOperationDetails.push(operationDetail);
                  continue;
                }
              }
              inFlightOperations.push(operationDetail);
            }
          }
        }
      }
      return stryMutAct_9fa48("14684") ? {} : (stryCov_9fa48("14684"), {
        inFlightOperations,
        excludedSelfTargetedCount,
        excludedWarmingTargetCount,
        excludedNonDiscoveryPartitionCount,
        excludedRemotePriorityControlPlaneCount,
        excludedRemotePriorityControlPlaneOperationDetails
      });
    }
  }

  /**
   * @param {Object} normalizedOperation
   * @param {Object} row
   * @return {Object}
   */
  buildCanonicalJoinReplicaOperationDetail(normalizedOperation, row) {
    if (stryMutAct_9fa48("14685")) {
      {}
    } else {
      stryCov_9fa48("14685");
      return stryMutAct_9fa48("14686") ? {} : (stryCov_9fa48("14686"), {
        operationId: normalizedOperation.operationId,
        type: normalizedOperation.type,
        partitionId: normalizedOperation.partitionGroupId,
        replicaId: String(stryMutAct_9fa48("14689") ? (row?.replica_id || row?.replicaId) && '' : stryMutAct_9fa48("14688") ? false : stryMutAct_9fa48("14687") ? true : (stryCov_9fa48("14687", "14688", "14689"), (stryMutAct_9fa48("14691") ? row?.replica_id && row?.replicaId : stryMutAct_9fa48("14690") ? false : (stryCov_9fa48("14690", "14691"), (stryMutAct_9fa48("14692") ? row.replica_id : (stryCov_9fa48("14692"), row?.replica_id)) || (stryMutAct_9fa48("14693") ? row.replicaId : (stryCov_9fa48("14693"), row?.replicaId)))) || (stryMutAct_9fa48("14694") ? "Stryker was here!" : (stryCov_9fa48("14694"), '')))),
        sourceNodeId: normalizedOperation.sourceNodeId,
        targetNodeId: normalizedOperation.targetNodeId,
        status: normalizedOperation.status,
        workflowStep: normalizedOperation.workflowStep,
        completedAt: normalizedOperation.completedAt,
        ageMs: normalizedOperation.ageMs
      });
    }
  }

  /**
   * Remote priority control-plane recovery between already-active peers should
   * not strand a different joining node once discovery state is otherwise
   * converged.
   *
   * @param {Object} normalizedOperation
   * @param {Set<string>} activeNodeIds
   * @param {Set<string>} discoveryCriticalPartitionIds
   * @return {boolean}
   */
  isRemotePriorityControlPlaneRecoveryOperation(normalizedOperation, activeNodeIds, discoveryCriticalPartitionIds) {
    if (stryMutAct_9fa48("14695")) {
      {}
    } else {
      stryCov_9fa48("14695");
      if (stryMutAct_9fa48("14698") ? !normalizedOperation && normalizedOperation.entityType !== 'partition' : stryMutAct_9fa48("14697") ? false : stryMutAct_9fa48("14696") ? true : (stryCov_9fa48("14696", "14697", "14698"), (stryMutAct_9fa48("14699") ? normalizedOperation : (stryCov_9fa48("14699"), !normalizedOperation)) || (stryMutAct_9fa48("14701") ? normalizedOperation.entityType === 'partition' : stryMutAct_9fa48("14700") ? false : (stryCov_9fa48("14700", "14701"), normalizedOperation.entityType !== (stryMutAct_9fa48("14702") ? "" : (stryCov_9fa48("14702"), 'partition')))))) {
        if (stryMutAct_9fa48("14703")) {
          {}
        } else {
          stryCov_9fa48("14703");
          return stryMutAct_9fa48("14704") ? true : (stryCov_9fa48("14704"), false);
        }
      }
      const partitionId = normalizedOperation.partitionGroupId;
      if (stryMutAct_9fa48("14707") ? (!partitionId || !discoveryCriticalPartitionIds.has(partitionId)) && !isPriorityControlPlanePartition({
        partitionId
      }) : stryMutAct_9fa48("14706") ? false : stryMutAct_9fa48("14705") ? true : (stryCov_9fa48("14705", "14706", "14707"), (stryMutAct_9fa48("14709") ? !partitionId && !discoveryCriticalPartitionIds.has(partitionId) : stryMutAct_9fa48("14708") ? false : (stryCov_9fa48("14708", "14709"), (stryMutAct_9fa48("14710") ? partitionId : (stryCov_9fa48("14710"), !partitionId)) || (stryMutAct_9fa48("14711") ? discoveryCriticalPartitionIds.has(partitionId) : (stryCov_9fa48("14711"), !discoveryCriticalPartitionIds.has(partitionId))))) || (stryMutAct_9fa48("14712") ? isPriorityControlPlanePartition({
        partitionId
      }) : (stryCov_9fa48("14712"), !isPriorityControlPlanePartition(stryMutAct_9fa48("14713") ? {} : (stryCov_9fa48("14713"), {
        partitionId
      })))))) {
        if (stryMutAct_9fa48("14714")) {
          {}
        } else {
          stryCov_9fa48("14714");
          return stryMutAct_9fa48("14715") ? true : (stryCov_9fa48("14715"), false);
        }
      }
      if (stryMutAct_9fa48("14718") ? normalizedOperation.sourceNodeId === this.nodeId && normalizedOperation.targetNodeId === this.nodeId : stryMutAct_9fa48("14717") ? false : stryMutAct_9fa48("14716") ? true : (stryCov_9fa48("14716", "14717", "14718"), (stryMutAct_9fa48("14720") ? normalizedOperation.sourceNodeId !== this.nodeId : stryMutAct_9fa48("14719") ? false : (stryCov_9fa48("14719", "14720"), normalizedOperation.sourceNodeId === this.nodeId)) || (stryMutAct_9fa48("14722") ? normalizedOperation.targetNodeId !== this.nodeId : stryMutAct_9fa48("14721") ? false : (stryCov_9fa48("14721", "14722"), normalizedOperation.targetNodeId === this.nodeId)))) {
        if (stryMutAct_9fa48("14723")) {
          {}
        } else {
          stryCov_9fa48("14723");
          return stryMutAct_9fa48("14724") ? true : (stryCov_9fa48("14724"), false);
        }
      }
      return stryMutAct_9fa48("14727") ? activeNodeIds.has(normalizedOperation.sourceNodeId) || activeNodeIds.has(normalizedOperation.targetNodeId) : stryMutAct_9fa48("14726") ? false : stryMutAct_9fa48("14725") ? true : (stryCov_9fa48("14725", "14726", "14727"), activeNodeIds.has(normalizedOperation.sourceNodeId) && activeNodeIds.has(normalizedOperation.targetNodeId));
    }
  }

  /**
   * Resolve the partition IDs that remain topology-critical for canonical join
   * readiness. Join convergence must wait on discovery tables, but unrelated
   * transaction-recovery partitions should not strand a joining node.
   * @param {Object|null} systemTableCache
   * @return {Set<string>}
   * @private
   */
  resolveCanonicalDiscoveryCriticalPartitionIds(systemTableCache) {
    if (stryMutAct_9fa48("14728")) {
      {}
    } else {
      stryCov_9fa48("14728");
      const partitionIds = new Set();
      for (const tableName of CANONICAL_JOIN_DISCOVERY_CRITICAL_TABLES) {
        if (stryMutAct_9fa48("14729")) {
          {}
        } else {
          stryCov_9fa48("14729");
          partitionIds.add(stryMutAct_9fa48("14730") ? `` : (stryCov_9fa48("14730"), `${tableName}-p1`));
        }
      }
      if (stryMutAct_9fa48("14733") ? !systemTableCache && typeof systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("14732") ? false : stryMutAct_9fa48("14731") ? true : (stryCov_9fa48("14731", "14732", "14733"), (stryMutAct_9fa48("14734") ? systemTableCache : (stryCov_9fa48("14734"), !systemTableCache)) || (stryMutAct_9fa48("14736") ? typeof systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("14735") ? false : (stryCov_9fa48("14735", "14736"), typeof systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("14737")) {
          {}
        } else {
          stryCov_9fa48("14737");
          return partitionIds;
        }
      }
      const partitionRows = stryMutAct_9fa48("14740") ? systemTableCache.getAll(TABLES.PARTITIONS) && [] : stryMutAct_9fa48("14739") ? false : stryMutAct_9fa48("14738") ? true : (stryCov_9fa48("14738", "14739", "14740"), systemTableCache.getAll(TABLES.PARTITIONS) || (stryMutAct_9fa48("14741") ? ["Stryker was here"] : (stryCov_9fa48("14741"), [])));
      for (const row of partitionRows) {
        if (stryMutAct_9fa48("14742")) {
          {}
        } else {
          stryCov_9fa48("14742");
          const tableName = stryMutAct_9fa48("14744") ? String(row?.[COLUMN.TABLE_NAME] || row?.table_name || row?.tableName || '').toLowerCase() : stryMutAct_9fa48("14743") ? String(row?.[COLUMN.TABLE_NAME] || row?.table_name || row?.tableName || '').trim().toUpperCase() : (stryCov_9fa48("14743", "14744"), String(stryMutAct_9fa48("14747") ? (row?.[COLUMN.TABLE_NAME] || row?.table_name || row?.tableName) && '' : stryMutAct_9fa48("14746") ? false : stryMutAct_9fa48("14745") ? true : (stryCov_9fa48("14745", "14746", "14747"), (stryMutAct_9fa48("14749") ? (row?.[COLUMN.TABLE_NAME] || row?.table_name) && row?.tableName : stryMutAct_9fa48("14748") ? false : (stryCov_9fa48("14748", "14749"), (stryMutAct_9fa48("14751") ? row?.[COLUMN.TABLE_NAME] && row?.table_name : stryMutAct_9fa48("14750") ? false : (stryCov_9fa48("14750", "14751"), (stryMutAct_9fa48("14752") ? row[COLUMN.TABLE_NAME] : (stryCov_9fa48("14752"), row?.[COLUMN.TABLE_NAME])) || (stryMutAct_9fa48("14753") ? row.table_name : (stryCov_9fa48("14753"), row?.table_name)))) || (stryMutAct_9fa48("14754") ? row.tableName : (stryCov_9fa48("14754"), row?.tableName)))) || (stryMutAct_9fa48("14755") ? "Stryker was here!" : (stryCov_9fa48("14755"), '')))).trim().toLowerCase());
          if (stryMutAct_9fa48("14758") ? false : stryMutAct_9fa48("14757") ? true : stryMutAct_9fa48("14756") ? CANONICAL_JOIN_DISCOVERY_CRITICAL_TABLES.has(tableName) : (stryCov_9fa48("14756", "14757", "14758"), !CANONICAL_JOIN_DISCOVERY_CRITICAL_TABLES.has(tableName))) {
            if (stryMutAct_9fa48("14759")) {
              {}
            } else {
              stryCov_9fa48("14759");
              continue;
            }
          }
          const partitionId = stryMutAct_9fa48("14760") ? String(row?.[COLUMN.PARTITION_ID] || row?.partition_id || row?.partitionId || '') : (stryCov_9fa48("14760"), String(stryMutAct_9fa48("14763") ? (row?.[COLUMN.PARTITION_ID] || row?.partition_id || row?.partitionId) && '' : stryMutAct_9fa48("14762") ? false : stryMutAct_9fa48("14761") ? true : (stryCov_9fa48("14761", "14762", "14763"), (stryMutAct_9fa48("14765") ? (row?.[COLUMN.PARTITION_ID] || row?.partition_id) && row?.partitionId : stryMutAct_9fa48("14764") ? false : (stryCov_9fa48("14764", "14765"), (stryMutAct_9fa48("14767") ? row?.[COLUMN.PARTITION_ID] && row?.partition_id : stryMutAct_9fa48("14766") ? false : (stryCov_9fa48("14766", "14767"), (stryMutAct_9fa48("14768") ? row[COLUMN.PARTITION_ID] : (stryCov_9fa48("14768"), row?.[COLUMN.PARTITION_ID])) || (stryMutAct_9fa48("14769") ? row.partition_id : (stryCov_9fa48("14769"), row?.partition_id)))) || (stryMutAct_9fa48("14770") ? row.partitionId : (stryCov_9fa48("14770"), row?.partitionId)))) || (stryMutAct_9fa48("14771") ? "Stryker was here!" : (stryCov_9fa48("14771"), '')))).trim());
          if (stryMutAct_9fa48("14774") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("14773") ? false : stryMutAct_9fa48("14772") ? true : (stryCov_9fa48("14772", "14773", "14774"), partitionId.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("14775")) {
              {}
            } else {
              stryCov_9fa48("14775");
              continue;
            }
          }
          partitionIds.add(partitionId);
        }
      }
      return partitionIds;
    }
  }

  /**
   * Resolve node IDs required for join-readiness diagnostics.
   * @param {Object|null} systemTableCache
   * @return {Array<string>}
   */
  resolveJoinReadinessRequiredNodeIds(systemTableCache) {
    if (stryMutAct_9fa48("14776")) {
      {}
    } else {
      stryCov_9fa48("14776");
      const nodeIds = stryMutAct_9fa48("14777") ? [] : (stryCov_9fa48("14777"), [...new Set(this.getCanonicalJoinActiveNodeIds(systemTableCache))]);
      if (stryMutAct_9fa48("14780") ? false : stryMutAct_9fa48("14779") ? true : stryMutAct_9fa48("14778") ? nodeIds.includes(this.nodeId) : (stryCov_9fa48("14778", "14779", "14780"), !nodeIds.includes(this.nodeId))) {
        if (stryMutAct_9fa48("14781")) {
          {}
        } else {
          stryCov_9fa48("14781");
          nodeIds.push(this.nodeId);
        }
      }
      return nodeIds;
    }
  }

  /**
   * Evaluate one canonical join-readiness snapshot.
   * @param {Object} snapshot
   * @return {Object}
   */
  evaluateCanonicalJoinReadinessSnapshot(snapshot) {
    if (stryMutAct_9fa48("14782")) {
      {}
    } else {
      stryCov_9fa48("14782");
      const normalized = this.normalizeCanonicalJoinReadinessSnapshot(snapshot);
      const reasons = this.classifyCanonicalJoinReadinessReasons(normalized);
      return stryMutAct_9fa48("14783") ? {} : (stryCov_9fa48("14783"), {
        ...normalized,
        reasons,
        ready: stryMutAct_9fa48("14786") ? reasons.length !== NUM.ZERO : stryMutAct_9fa48("14785") ? false : stryMutAct_9fa48("14784") ? true : (stryCov_9fa48("14784", "14785", "14786"), reasons.length === NUM.ZERO)
      });
    }
  }

  /**
   * Classify canonical join-readiness reasons with stable precedence.
   * @param {Object} snapshot
   * @return {Array<string>}
   */
  classifyCanonicalJoinReadinessReasons(snapshot) {
    if (stryMutAct_9fa48("14787")) {
      {}
    } else {
      stryCov_9fa48("14787");
      const reasons = stryMutAct_9fa48("14788") ? ["Stryker was here"] : (stryCov_9fa48("14788"), []);
      if (stryMutAct_9fa48("14791") ? snapshot?.routingReady === true : stryMutAct_9fa48("14790") ? false : stryMutAct_9fa48("14789") ? true : (stryCov_9fa48("14789", "14790", "14791"), (stryMutAct_9fa48("14792") ? snapshot.routingReady : (stryCov_9fa48("14792"), snapshot?.routingReady)) !== (stryMutAct_9fa48("14793") ? false : (stryCov_9fa48("14793"), true)))) {
        if (stryMutAct_9fa48("14794")) {
          {}
        } else {
          stryCov_9fa48("14794");
          reasons.push(JOIN_READINESS_REASON.ROUTING_NOT_READY);
        }
      }
      const requiredVersion = normalizeJoinSchemaVersion(stryMutAct_9fa48("14795") ? snapshot.requiredSchemaVersion : (stryCov_9fa48("14795"), snapshot?.requiredSchemaVersion));
      const appliedVersion = normalizeJoinSchemaVersion(stryMutAct_9fa48("14796") ? snapshot.appliedSchemaVersion : (stryCov_9fa48("14796"), snapshot?.appliedSchemaVersion));
      if (stryMutAct_9fa48("14799") ? !requiredVersion && !appliedVersion : stryMutAct_9fa48("14798") ? false : stryMutAct_9fa48("14797") ? true : (stryCov_9fa48("14797", "14798", "14799"), (stryMutAct_9fa48("14800") ? requiredVersion : (stryCov_9fa48("14800"), !requiredVersion)) || (stryMutAct_9fa48("14801") ? appliedVersion : (stryCov_9fa48("14801"), !appliedVersion)))) {
        if (stryMutAct_9fa48("14802")) {
          {}
        } else {
          stryCov_9fa48("14802");
          reasons.push(JOIN_READINESS_REASON.SCHEMA_VERSION_UNKNOWN);
        }
      } else if (stryMutAct_9fa48("14806") ? compareJoinSchemaVersions(appliedVersion, requiredVersion) >= NUM.ZERO : stryMutAct_9fa48("14805") ? compareJoinSchemaVersions(appliedVersion, requiredVersion) <= NUM.ZERO : stryMutAct_9fa48("14804") ? false : stryMutAct_9fa48("14803") ? true : (stryCov_9fa48("14803", "14804", "14805", "14806"), compareJoinSchemaVersions(appliedVersion, requiredVersion) < NUM.ZERO)) {
        if (stryMutAct_9fa48("14807")) {
          {}
        } else {
          stryCov_9fa48("14807");
          reasons.push(JOIN_READINESS_REASON.SCHEMA_VERSION_LAG);
        }
      }
      if (stryMutAct_9fa48("14810") ? snapshot?.topologyReady === true : stryMutAct_9fa48("14809") ? false : stryMutAct_9fa48("14808") ? true : (stryCov_9fa48("14808", "14809", "14810"), (stryMutAct_9fa48("14811") ? snapshot.topologyReady : (stryCov_9fa48("14811"), snapshot?.topologyReady)) !== (stryMutAct_9fa48("14812") ? false : (stryCov_9fa48("14812"), true)))) {
        if (stryMutAct_9fa48("14813")) {
          {}
        } else {
          stryCov_9fa48("14813");
          reasons.push(JOIN_READINESS_REASON.TOPOLOGY_NOT_READY);
        }
      }
      return stryMutAct_9fa48("14814") ? reasons : (stryCov_9fa48("14814"), reasons.sort((left, right) => {
        if (stryMutAct_9fa48("14815")) {
          {}
        } else {
          stryCov_9fa48("14815");
          const leftRank = this.getJoinReadinessReasonRank(left);
          const rightRank = this.getJoinReadinessReasonRank(right);
          if (stryMutAct_9fa48("14818") ? leftRank === rightRank : stryMutAct_9fa48("14817") ? false : stryMutAct_9fa48("14816") ? true : (stryCov_9fa48("14816", "14817", "14818"), leftRank !== rightRank)) {
            if (stryMutAct_9fa48("14819")) {
              {}
            } else {
              stryCov_9fa48("14819");
              return stryMutAct_9fa48("14820") ? leftRank + rightRank : (stryCov_9fa48("14820"), leftRank - rightRank);
            }
          }
          return String(left).localeCompare(String(right));
        }
      }));
    }
  }

  /**
   * Normalize one canonical join-readiness snapshot.
   * @param {Object} snapshot
   * @return {Object}
   */
  normalizeCanonicalJoinReadinessSnapshot(snapshot) {
    if (stryMutAct_9fa48("14821")) {
      {}
    } else {
      stryCov_9fa48("14821");
      const source = (stryMutAct_9fa48("14824") ? snapshot || typeof snapshot === TYPEOF.OBJECT : stryMutAct_9fa48("14823") ? false : stryMutAct_9fa48("14822") ? true : (stryCov_9fa48("14822", "14823", "14824"), snapshot && (stryMutAct_9fa48("14826") ? typeof snapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("14825") ? true : (stryCov_9fa48("14825", "14826"), typeof snapshot === TYPEOF.OBJECT)))) ? snapshot : {};
      const requiredVersion = normalizeJoinSchemaVersion(source.requiredSchemaVersion);
      const appliedVersion = normalizeJoinSchemaVersion(source.appliedSchemaVersion);
      const requiredNodeIds = Array.isArray(source.requiredNodeIds) ? stryMutAct_9fa48("14827") ? source.requiredNodeIds : (stryCov_9fa48("14827"), source.requiredNodeIds.filter(stryMutAct_9fa48("14828") ? () => undefined : (stryCov_9fa48("14828"), value => stryMutAct_9fa48("14831") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("14830") ? false : stryMutAct_9fa48("14829") ? true : (stryCov_9fa48("14829", "14830", "14831"), (stryMutAct_9fa48("14833") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("14832") ? true : (stryCov_9fa48("14832", "14833"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("14836") ? value.length <= NUM.ZERO : stryMutAct_9fa48("14835") ? value.length >= NUM.ZERO : stryMutAct_9fa48("14834") ? true : (stryCov_9fa48("14834", "14835", "14836"), value.length > NUM.ZERO)))))) : stryMutAct_9fa48("14837") ? [] : (stryCov_9fa48("14837"), [this.nodeId]);
      return stryMutAct_9fa48("14838") ? {} : (stryCov_9fa48("14838"), {
        nodeId: stryMutAct_9fa48("14841") ? source.nodeId && this.nodeId : stryMutAct_9fa48("14840") ? false : stryMutAct_9fa48("14839") ? true : (stryCov_9fa48("14839", "14840", "14841"), source.nodeId || this.nodeId),
        tableName: stryMutAct_9fa48("14844") ? source.tableName && this.resolveJoinReadinessTableName() : stryMutAct_9fa48("14843") ? false : stryMutAct_9fa48("14842") ? true : (stryCov_9fa48("14842", "14843", "14844"), source.tableName || this.resolveJoinReadinessTableName()),
        routingReady: stryMutAct_9fa48("14847") ? source.routingReady !== true : stryMutAct_9fa48("14846") ? false : stryMutAct_9fa48("14845") ? true : (stryCov_9fa48("14845", "14846", "14847"), source.routingReady === (stryMutAct_9fa48("14848") ? false : (stryCov_9fa48("14848"), true))),
        topologyReady: stryMutAct_9fa48("14851") ? source.topologyReady !== true : stryMutAct_9fa48("14850") ? false : stryMutAct_9fa48("14849") ? true : (stryCov_9fa48("14849", "14850", "14851"), source.topologyReady === (stryMutAct_9fa48("14852") ? false : (stryCov_9fa48("14852"), true))),
        requiredSchemaVersion: requiredVersion,
        appliedSchemaVersion: appliedVersion,
        requiredNodeIds,
        topologySnapshotEpoch: Number.isFinite(source.topologySnapshotEpoch) ? stryMutAct_9fa48("14853") ? Math.min(NUM.ZERO, Math.floor(source.topologySnapshotEpoch)) : (stryCov_9fa48("14853"), Math.max(NUM.ZERO, Math.floor(source.topologySnapshotEpoch))) : null,
        appliedTopologyEpoch: Number.isFinite(source.appliedTopologyEpoch) ? stryMutAct_9fa48("14854") ? Math.min(NUM.ZERO, Math.floor(source.appliedTopologyEpoch)) : (stryCov_9fa48("14854"), Math.max(NUM.ZERO, Math.floor(source.appliedTopologyEpoch))) : null,
        missingLeaders: (stryMutAct_9fa48("14857") ? source.missingLeaders || typeof source.missingLeaders === TYPEOF.OBJECT : stryMutAct_9fa48("14856") ? false : stryMutAct_9fa48("14855") ? true : (stryCov_9fa48("14855", "14856", "14857"), source.missingLeaders && (stryMutAct_9fa48("14859") ? typeof source.missingLeaders !== TYPEOF.OBJECT : stryMutAct_9fa48("14858") ? true : (stryCov_9fa48("14858", "14859"), typeof source.missingLeaders === TYPEOF.OBJECT)))) ? source.missingLeaders : null,
        inFlightReplicaOperations: Number.isFinite(source.inFlightReplicaOperations) ? stryMutAct_9fa48("14860") ? Math.min(NUM.ZERO, Math.floor(source.inFlightReplicaOperations)) : (stryCov_9fa48("14860"), Math.max(NUM.ZERO, Math.floor(source.inFlightReplicaOperations))) : NUM.ZERO,
        inFlightReplicaOperationDetails: Array.isArray(source.inFlightReplicaOperationDetails) ? source.inFlightReplicaOperationDetails : stryMutAct_9fa48("14861") ? ["Stryker was here"] : (stryCov_9fa48("14861"), []),
        excludedSelfTargetedCount: Number.isFinite(source.excludedSelfTargetedCount) ? stryMutAct_9fa48("14862") ? Math.min(NUM.ZERO, Math.floor(source.excludedSelfTargetedCount)) : (stryCov_9fa48("14862"), Math.max(NUM.ZERO, Math.floor(source.excludedSelfTargetedCount))) : NUM.ZERO,
        excludedWarmingTargetCount: Number.isFinite(source.excludedWarmingTargetCount) ? stryMutAct_9fa48("14863") ? Math.min(NUM.ZERO, Math.floor(source.excludedWarmingTargetCount)) : (stryCov_9fa48("14863"), Math.max(NUM.ZERO, Math.floor(source.excludedWarmingTargetCount))) : NUM.ZERO,
        excludedNonDiscoveryPartitionCount: Number.isFinite(source.excludedNonDiscoveryPartitionCount) ? stryMutAct_9fa48("14864") ? Math.min(NUM.ZERO, Math.floor(source.excludedNonDiscoveryPartitionCount)) : (stryCov_9fa48("14864"), Math.max(NUM.ZERO, Math.floor(source.excludedNonDiscoveryPartitionCount))) : NUM.ZERO,
        excludedRemotePriorityControlPlaneCount: Number.isFinite(source.excludedRemotePriorityControlPlaneCount) ? stryMutAct_9fa48("14865") ? Math.min(NUM.ZERO, Math.floor(source.excludedRemotePriorityControlPlaneCount)) : (stryCov_9fa48("14865"), Math.max(NUM.ZERO, Math.floor(source.excludedRemotePriorityControlPlaneCount))) : NUM.ZERO,
        excludedRemotePriorityControlPlaneOperationDetails: Array.isArray(source.excludedRemotePriorityControlPlaneOperationDetails) ? source.excludedRemotePriorityControlPlaneOperationDetails : stryMutAct_9fa48("14866") ? ["Stryker was here"] : (stryCov_9fa48("14866"), []),
        missingNodeEndpointNodeIds: Array.isArray(source.missingNodeEndpointNodeIds) ? stryMutAct_9fa48("14867") ? source.missingNodeEndpointNodeIds : (stryCov_9fa48("14867"), source.missingNodeEndpointNodeIds.filter(stryMutAct_9fa48("14868") ? () => undefined : (stryCov_9fa48("14868"), value => stryMutAct_9fa48("14871") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("14870") ? false : stryMutAct_9fa48("14869") ? true : (stryCov_9fa48("14869", "14870", "14871"), (stryMutAct_9fa48("14873") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("14872") ? true : (stryCov_9fa48("14872", "14873"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("14876") ? value.length <= NUM.ZERO : stryMutAct_9fa48("14875") ? value.length >= NUM.ZERO : stryMutAct_9fa48("14874") ? true : (stryCov_9fa48("14874", "14875", "14876"), value.length > NUM.ZERO)))))) : stryMutAct_9fa48("14877") ? ["Stryker was here"] : (stryCov_9fa48("14877"), []),
        missingPostgresWireNodeIds: Array.isArray(source.missingPostgresWireNodeIds) ? stryMutAct_9fa48("14878") ? source.missingPostgresWireNodeIds : (stryCov_9fa48("14878"), source.missingPostgresWireNodeIds.filter(stryMutAct_9fa48("14879") ? () => undefined : (stryCov_9fa48("14879"), value => stryMutAct_9fa48("14882") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("14881") ? false : stryMutAct_9fa48("14880") ? true : (stryCov_9fa48("14880", "14881", "14882"), (stryMutAct_9fa48("14884") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("14883") ? true : (stryCov_9fa48("14883", "14884"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("14887") ? value.length <= NUM.ZERO : stryMutAct_9fa48("14886") ? value.length >= NUM.ZERO : stryMutAct_9fa48("14885") ? true : (stryCov_9fa48("14885", "14886", "14887"), value.length > NUM.ZERO)))))) : stryMutAct_9fa48("14888") ? ["Stryker was here"] : (stryCov_9fa48("14888"), []),
        controlPlaneTargetAddress: (stryMutAct_9fa48("14891") ? typeof source.controlPlaneTargetAddress === TYPEOF.STRING || source.controlPlaneTargetAddress.length > NUM.ZERO : stryMutAct_9fa48("14890") ? false : stryMutAct_9fa48("14889") ? true : (stryCov_9fa48("14889", "14890", "14891"), (stryMutAct_9fa48("14893") ? typeof source.controlPlaneTargetAddress !== TYPEOF.STRING : stryMutAct_9fa48("14892") ? true : (stryCov_9fa48("14892", "14893"), typeof source.controlPlaneTargetAddress === TYPEOF.STRING)) && (stryMutAct_9fa48("14896") ? source.controlPlaneTargetAddress.length <= NUM.ZERO : stryMutAct_9fa48("14895") ? source.controlPlaneTargetAddress.length >= NUM.ZERO : stryMutAct_9fa48("14894") ? true : (stryCov_9fa48("14894", "14895", "14896"), source.controlPlaneTargetAddress.length > NUM.ZERO)))) ? source.controlPlaneTargetAddress : null,
        controlPlaneTargetCandidates: Array.isArray(source.controlPlaneTargetCandidates) ? stryMutAct_9fa48("14897") ? source.controlPlaneTargetCandidates : (stryCov_9fa48("14897"), source.controlPlaneTargetCandidates.filter(stryMutAct_9fa48("14898") ? () => undefined : (stryCov_9fa48("14898"), value => stryMutAct_9fa48("14901") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("14900") ? false : stryMutAct_9fa48("14899") ? true : (stryCov_9fa48("14899", "14900", "14901"), (stryMutAct_9fa48("14903") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("14902") ? true : (stryCov_9fa48("14902", "14903"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("14906") ? value.length <= NUM.ZERO : stryMutAct_9fa48("14905") ? value.length >= NUM.ZERO : stryMutAct_9fa48("14904") ? true : (stryCov_9fa48("14904", "14905", "14906"), value.length > NUM.ZERO)))))) : stryMutAct_9fa48("14907") ? ["Stryker was here"] : (stryCov_9fa48("14907"), []),
        controlPlaneTargetConnectionStates: (stryMutAct_9fa48("14910") ? source.controlPlaneTargetConnectionStates || typeof source.controlPlaneTargetConnectionStates === TYPEOF.OBJECT : stryMutAct_9fa48("14909") ? false : stryMutAct_9fa48("14908") ? true : (stryCov_9fa48("14908", "14909", "14910"), source.controlPlaneTargetConnectionStates && (stryMutAct_9fa48("14912") ? typeof source.controlPlaneTargetConnectionStates !== TYPEOF.OBJECT : stryMutAct_9fa48("14911") ? true : (stryCov_9fa48("14911", "14912"), typeof source.controlPlaneTargetConnectionStates === TYPEOF.OBJECT)))) ? source.controlPlaneTargetConnectionStates : null,
        observedSchemaByNodeId: (stryMutAct_9fa48("14915") ? source.observedSchemaByNodeId || typeof source.observedSchemaByNodeId === TYPEOF.OBJECT : stryMutAct_9fa48("14914") ? false : stryMutAct_9fa48("14913") ? true : (stryCov_9fa48("14913", "14914", "14915"), source.observedSchemaByNodeId && (stryMutAct_9fa48("14917") ? typeof source.observedSchemaByNodeId !== TYPEOF.OBJECT : stryMutAct_9fa48("14916") ? true : (stryCov_9fa48("14916", "14917"), typeof source.observedSchemaByNodeId === TYPEOF.OBJECT)))) ? source.observedSchemaByNodeId : null
      });
    }
  }

  /**
   * Build per-node schema diagnostics for join timeout reporting.
   * @param {Object} evaluation
   * @return {Object}
   */
  buildJoinSchemaDiagnosticsByNode(evaluation) {
    if (stryMutAct_9fa48("14918")) {
      {}
    } else {
      stryCov_9fa48("14918");
      const requiredVersion = stryMutAct_9fa48("14921") ? evaluation?.requiredSchemaVersion && null : stryMutAct_9fa48("14920") ? false : stryMutAct_9fa48("14919") ? true : (stryCov_9fa48("14919", "14920", "14921"), (stryMutAct_9fa48("14922") ? evaluation.requiredSchemaVersion : (stryCov_9fa48("14922"), evaluation?.requiredSchemaVersion)) || null);
      const observedVersion = stryMutAct_9fa48("14925") ? evaluation?.appliedSchemaVersion && null : stryMutAct_9fa48("14924") ? false : stryMutAct_9fa48("14923") ? true : (stryCov_9fa48("14923", "14924", "14925"), (stryMutAct_9fa48("14926") ? evaluation.appliedSchemaVersion : (stryCov_9fa48("14926"), evaluation?.appliedSchemaVersion)) || null);
      const reasons = Array.isArray(stryMutAct_9fa48("14927") ? evaluation.reasons : (stryCov_9fa48("14927"), evaluation?.reasons)) ? evaluation.reasons : stryMutAct_9fa48("14928") ? ["Stryker was here"] : (stryCov_9fa48("14928"), []);
      const requiredNodeIds = (stryMutAct_9fa48("14931") ? Array.isArray(evaluation?.requiredNodeIds) || evaluation.requiredNodeIds.length > NUM.ZERO : stryMutAct_9fa48("14930") ? false : stryMutAct_9fa48("14929") ? true : (stryCov_9fa48("14929", "14930", "14931"), Array.isArray(stryMutAct_9fa48("14932") ? evaluation.requiredNodeIds : (stryCov_9fa48("14932"), evaluation?.requiredNodeIds)) && (stryMutAct_9fa48("14935") ? evaluation.requiredNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("14934") ? evaluation.requiredNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("14933") ? true : (stryCov_9fa48("14933", "14934", "14935"), evaluation.requiredNodeIds.length > NUM.ZERO)))) ? evaluation.requiredNodeIds : stryMutAct_9fa48("14936") ? [] : (stryCov_9fa48("14936"), [this.nodeId]);
      const observedByNodeId = (stryMutAct_9fa48("14939") ? evaluation?.observedSchemaByNodeId || typeof evaluation.observedSchemaByNodeId === TYPEOF.OBJECT : stryMutAct_9fa48("14938") ? false : stryMutAct_9fa48("14937") ? true : (stryCov_9fa48("14937", "14938", "14939"), (stryMutAct_9fa48("14940") ? evaluation.observedSchemaByNodeId : (stryCov_9fa48("14940"), evaluation?.observedSchemaByNodeId)) && (stryMutAct_9fa48("14942") ? typeof evaluation.observedSchemaByNodeId !== TYPEOF.OBJECT : stryMutAct_9fa48("14941") ? true : (stryCov_9fa48("14941", "14942"), typeof evaluation.observedSchemaByNodeId === TYPEOF.OBJECT)))) ? evaluation.observedSchemaByNodeId : {};
      const diagnostics = {};
      for (const nodeId of requiredNodeIds) {
        if (stryMutAct_9fa48("14943")) {
          {}
        } else {
          stryCov_9fa48("14943");
          diagnostics[nodeId] = stryMutAct_9fa48("14944") ? {} : (stryCov_9fa48("14944"), {
            requiredSchemaVersion: requiredVersion,
            observedSchemaVersion: stryMutAct_9fa48("14947") ? normalizeJoinSchemaVersion(observedByNodeId[nodeId]) && observedVersion : stryMutAct_9fa48("14946") ? false : stryMutAct_9fa48("14945") ? true : (stryCov_9fa48("14945", "14946", "14947"), normalizeJoinSchemaVersion(observedByNodeId[nodeId]) || observedVersion),
            unmetReasons: reasons
          });
        }
      }
      return diagnostics;
    }
  }

  /**
   * Emit throttled diagnostics while canonical readiness remains blocked.
   * @param {Object|null} evaluation
   * @param {Object} options
   * @param {number} options.attempts
   * @param {number} options.elapsedMs
   * @param {Error|null} [options.snapshotError]
   * @param {boolean} [options.force=false]
   * @return {void}
   */
  logCanonicalJoinReadinessBlocked(evaluation, options = {}) {
    if (stryMutAct_9fa48("14948")) {
      {}
    } else {
      stryCov_9fa48("14948");
      if (stryMutAct_9fa48("14951") ? !evaluation && evaluation.ready === true : stryMutAct_9fa48("14950") ? false : stryMutAct_9fa48("14949") ? true : (stryCov_9fa48("14949", "14950", "14951"), (stryMutAct_9fa48("14952") ? evaluation : (stryCov_9fa48("14952"), !evaluation)) || (stryMutAct_9fa48("14954") ? evaluation.ready !== true : stryMutAct_9fa48("14953") ? false : (stryCov_9fa48("14953", "14954"), evaluation.ready === (stryMutAct_9fa48("14955") ? false : (stryCov_9fa48("14955"), true)))))) {
        if (stryMutAct_9fa48("14956")) {
          {}
        } else {
          stryCov_9fa48("14956");
          return;
        }
      }
      const nowMs = this.now();
      const force = stryMutAct_9fa48("14959") ? options.force !== true : stryMutAct_9fa48("14958") ? false : stryMutAct_9fa48("14957") ? true : (stryCov_9fa48("14957", "14958", "14959"), options.force === (stryMutAct_9fa48("14960") ? false : (stryCov_9fa48("14960"), true)));
      if (stryMutAct_9fa48("14963") ? !force && this.lastCanonicalJoinBlockedLogAtMs > NUM.ZERO || nowMs - this.lastCanonicalJoinBlockedLogAtMs < CANONICAL_JOIN_READINESS_LOG_INTERVAL_MS : stryMutAct_9fa48("14962") ? false : stryMutAct_9fa48("14961") ? true : (stryCov_9fa48("14961", "14962", "14963"), (stryMutAct_9fa48("14965") ? !force || this.lastCanonicalJoinBlockedLogAtMs > NUM.ZERO : stryMutAct_9fa48("14964") ? true : (stryCov_9fa48("14964", "14965"), (stryMutAct_9fa48("14966") ? force : (stryCov_9fa48("14966"), !force)) && (stryMutAct_9fa48("14969") ? this.lastCanonicalJoinBlockedLogAtMs <= NUM.ZERO : stryMutAct_9fa48("14968") ? this.lastCanonicalJoinBlockedLogAtMs >= NUM.ZERO : stryMutAct_9fa48("14967") ? true : (stryCov_9fa48("14967", "14968", "14969"), this.lastCanonicalJoinBlockedLogAtMs > NUM.ZERO)))) && (stryMutAct_9fa48("14972") ? nowMs - this.lastCanonicalJoinBlockedLogAtMs >= CANONICAL_JOIN_READINESS_LOG_INTERVAL_MS : stryMutAct_9fa48("14971") ? nowMs - this.lastCanonicalJoinBlockedLogAtMs <= CANONICAL_JOIN_READINESS_LOG_INTERVAL_MS : stryMutAct_9fa48("14970") ? true : (stryCov_9fa48("14970", "14971", "14972"), (stryMutAct_9fa48("14973") ? nowMs + this.lastCanonicalJoinBlockedLogAtMs : (stryCov_9fa48("14973"), nowMs - this.lastCanonicalJoinBlockedLogAtMs)) < CANONICAL_JOIN_READINESS_LOG_INTERVAL_MS)))) {
        if (stryMutAct_9fa48("14974")) {
          {}
        } else {
          stryCov_9fa48("14974");
          return;
        }
      }
      this.lastCanonicalJoinBlockedLogAtMs = nowMs;
      this.delegates.getLogger().warn(JOINING_LOG_MSG.CANONICAL_READINESS_BLOCKED, stryMutAct_9fa48("14975") ? {} : (stryCov_9fa48("14975"), {
        nodeId: this.nodeId,
        attempts: Number.isFinite(options.attempts) ? options.attempts : null,
        elapsedMs: Number.isFinite(options.elapsedMs) ? options.elapsedMs : null,
        reasons: evaluation.reasons,
        routingReady: evaluation.routingReady,
        topologyReady: evaluation.topologyReady,
        requiredSchemaVersion: evaluation.requiredSchemaVersion,
        appliedSchemaVersion: evaluation.appliedSchemaVersion,
        missingLeaders: evaluation.missingLeaders,
        inFlightReplicaOperations: evaluation.inFlightReplicaOperations,
        inFlightReplicaOperationDetails: evaluation.inFlightReplicaOperationDetails,
        excludedSelfTargetedCount: evaluation.excludedSelfTargetedCount,
        excludedWarmingTargetCount: evaluation.excludedWarmingTargetCount,
        excludedNonDiscoveryPartitionCount: evaluation.excludedNonDiscoveryPartitionCount,
        excludedRemotePriorityControlPlaneCount: evaluation.excludedRemotePriorityControlPlaneCount,
        excludedRemotePriorityControlPlaneOperationDetails: evaluation.excludedRemotePriorityControlPlaneOperationDetails,
        missingNodeEndpointNodeIds: evaluation.missingNodeEndpointNodeIds,
        missingPostgresWireNodeIds: evaluation.missingPostgresWireNodeIds,
        controlPlaneTargetAddress: evaluation.controlPlaneTargetAddress,
        controlPlaneTargetCandidates: evaluation.controlPlaneTargetCandidates,
        controlPlaneTargetConnectionStates: evaluation.controlPlaneTargetConnectionStates,
        topologySnapshotEpoch: evaluation.topologySnapshotEpoch,
        appliedTopologyEpoch: evaluation.appliedTopologyEpoch,
        snapshotError: stryMutAct_9fa48("14978") ? options.snapshotError?.message && null : stryMutAct_9fa48("14977") ? false : stryMutAct_9fa48("14976") ? true : (stryCov_9fa48("14976", "14977", "14978"), (stryMutAct_9fa48("14979") ? options.snapshotError.message : (stryCov_9fa48("14979"), options.snapshotError?.message)) || null)
      }));
    }
  }

  /**
   * Resolve the published bootstrap topology snapshot metadata.
   * @return {Object|null}
   * @private
   */
  resolveBootstrapTopologySnapshotMeta() {
    if (stryMutAct_9fa48("14980")) {
      {}
    } else {
      stryCov_9fa48("14980");
      const delegateMeta = stryMutAct_9fa48("14981") ? this.delegates.getBootstrapTopologySnapshotMeta() : (stryCov_9fa48("14981"), this.delegates.getBootstrapTopologySnapshotMeta?.());
      if (stryMutAct_9fa48("14984") ? delegateMeta || typeof delegateMeta === TYPEOF.OBJECT : stryMutAct_9fa48("14983") ? false : stryMutAct_9fa48("14982") ? true : (stryCov_9fa48("14982", "14983", "14984"), delegateMeta && (stryMutAct_9fa48("14986") ? typeof delegateMeta !== TYPEOF.OBJECT : stryMutAct_9fa48("14985") ? true : (stryCov_9fa48("14985", "14986"), typeof delegateMeta === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("14987")) {
          {}
        } else {
          stryCov_9fa48("14987");
          return delegateMeta;
        }
      }
      const bootstrapResponse = stryMutAct_9fa48("14988") ? this.delegates.getBootstrapResponse() : (stryCov_9fa48("14988"), this.delegates.getBootstrapResponse?.());
      const responseMeta = stryMutAct_9fa48("14989") ? bootstrapResponse.topologySnapshotMeta : (stryCov_9fa48("14989"), bootstrapResponse?.topologySnapshotMeta);
      return (stryMutAct_9fa48("14992") ? responseMeta || typeof responseMeta === TYPEOF.OBJECT : stryMutAct_9fa48("14991") ? false : stryMutAct_9fa48("14990") ? true : (stryCov_9fa48("14990", "14991", "14992"), responseMeta && (stryMutAct_9fa48("14994") ? typeof responseMeta !== TYPEOF.OBJECT : stryMutAct_9fa48("14993") ? true : (stryCov_9fa48("14993", "14994"), typeof responseMeta === TYPEOF.OBJECT)))) ? responseMeta : null;
    }
  }

  /**
   * Resolve active node IDs published with the bootstrap topology snapshot.
   * @return {Array<string>}
   * @private
   */
  resolveBootstrapTopologySnapshotActiveNodeIds() {
    if (stryMutAct_9fa48("14995")) {
      {}
    } else {
      stryCov_9fa48("14995");
      const topologySnapshotMeta = this.resolveBootstrapTopologySnapshotMeta();
      if (stryMutAct_9fa48("14998") ? false : stryMutAct_9fa48("14997") ? true : stryMutAct_9fa48("14996") ? Array.isArray(topologySnapshotMeta?.activeNodeIds) : (stryCov_9fa48("14996", "14997", "14998"), !Array.isArray(stryMutAct_9fa48("14999") ? topologySnapshotMeta.activeNodeIds : (stryCov_9fa48("14999"), topologySnapshotMeta?.activeNodeIds)))) {
        if (stryMutAct_9fa48("15000")) {
          {}
        } else {
          stryCov_9fa48("15000");
          return stryMutAct_9fa48("15001") ? ["Stryker was here"] : (stryCov_9fa48("15001"), []);
        }
      }
      return stryMutAct_9fa48("15002") ? [] : (stryCov_9fa48("15002"), [...new Set(stryMutAct_9fa48("15003") ? topologySnapshotMeta.activeNodeIds : (stryCov_9fa48("15003"), topologySnapshotMeta.activeNodeIds.filter(stryMutAct_9fa48("15004") ? () => undefined : (stryCov_9fa48("15004"), value => stryMutAct_9fa48("15007") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("15006") ? false : stryMutAct_9fa48("15005") ? true : (stryCov_9fa48("15005", "15006", "15007"), (stryMutAct_9fa48("15009") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("15008") ? true : (stryCov_9fa48("15008", "15009"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("15012") ? value.length <= NUM.ZERO : stryMutAct_9fa48("15011") ? value.length >= NUM.ZERO : stryMutAct_9fa48("15010") ? true : (stryCov_9fa48("15010", "15011", "15012"), value.length > NUM.ZERO)))))))]);
    }
  }

  /**
   * Resolve the published bootstrap topology epoch.
   * @return {number|null}
   * @private
   */
  resolveBootstrapTopologySnapshotEpoch() {
    if (stryMutAct_9fa48("15013")) {
      {}
    } else {
      stryCov_9fa48("15013");
      const delegatedEpoch = stryMutAct_9fa48("15014") ? this.delegates.getBootstrapTopologySnapshotEpoch() : (stryCov_9fa48("15014"), this.delegates.getBootstrapTopologySnapshotEpoch?.());
      if (stryMutAct_9fa48("15016") ? false : stryMutAct_9fa48("15015") ? true : (stryCov_9fa48("15015", "15016"), Number.isFinite(delegatedEpoch))) {
        if (stryMutAct_9fa48("15017")) {
          {}
        } else {
          stryCov_9fa48("15017");
          return stryMutAct_9fa48("15018") ? Math.min(NUM.ZERO, Math.floor(delegatedEpoch)) : (stryCov_9fa48("15018"), Math.max(NUM.ZERO, Math.floor(delegatedEpoch)));
        }
      }
      const topologySnapshotMeta = this.resolveBootstrapTopologySnapshotMeta();
      if (stryMutAct_9fa48("15020") ? false : stryMutAct_9fa48("15019") ? true : (stryCov_9fa48("15019", "15020"), Number.isFinite(stryMutAct_9fa48("15021") ? topologySnapshotMeta.topologyEpoch : (stryCov_9fa48("15021"), topologySnapshotMeta?.topologyEpoch)))) {
        if (stryMutAct_9fa48("15022")) {
          {}
        } else {
          stryCov_9fa48("15022");
          return stryMutAct_9fa48("15023") ? Math.min(NUM.ZERO, Math.floor(topologySnapshotMeta.topologyEpoch)) : (stryCov_9fa48("15023"), Math.max(NUM.ZERO, Math.floor(topologySnapshotMeta.topologyEpoch)));
        }
      }
      const bootstrapResponse = stryMutAct_9fa48("15024") ? this.delegates.getBootstrapResponse() : (stryCov_9fa48("15024"), this.delegates.getBootstrapResponse?.());
      if (stryMutAct_9fa48("15026") ? false : stryMutAct_9fa48("15025") ? true : (stryCov_9fa48("15025", "15026"), Number.isFinite(stryMutAct_9fa48("15028") ? bootstrapResponse.currentEpoch?.epoch : stryMutAct_9fa48("15027") ? bootstrapResponse?.currentEpoch.epoch : (stryCov_9fa48("15027", "15028"), bootstrapResponse?.currentEpoch?.epoch)))) {
        if (stryMutAct_9fa48("15029")) {
          {}
        } else {
          stryCov_9fa48("15029");
          return stryMutAct_9fa48("15030") ? Math.min(NUM.ZERO, Math.floor(bootstrapResponse.currentEpoch.epoch)) : (stryCov_9fa48("15030"), Math.max(NUM.ZERO, Math.floor(bootstrapResponse.currentEpoch.epoch)));
        }
      }
      return null;
    }
  }

  /**
   * Resolve the locally applied topology epoch watermark.
   * @param {Object|null} systemTableCache
   * @return {number}
   * @private
   */
  resolveAppliedTopologyEpoch(systemTableCache) {
    if (stryMutAct_9fa48("15031")) {
      {}
    } else {
      stryCov_9fa48("15031");
      if (stryMutAct_9fa48("15034") ? typeof systemTableCache?.getEpoch !== TYPEOF.FUNCTION : stryMutAct_9fa48("15033") ? false : stryMutAct_9fa48("15032") ? true : (stryCov_9fa48("15032", "15033", "15034"), typeof (stryMutAct_9fa48("15035") ? systemTableCache.getEpoch : (stryCov_9fa48("15035"), systemTableCache?.getEpoch)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("15036")) {
          {}
        } else {
          stryCov_9fa48("15036");
          const cacheEpoch = systemTableCache.getEpoch();
          if (stryMutAct_9fa48("15038") ? false : stryMutAct_9fa48("15037") ? true : (stryCov_9fa48("15037", "15038"), Number.isFinite(cacheEpoch))) {
            if (stryMutAct_9fa48("15039")) {
              {}
            } else {
              stryCov_9fa48("15039");
              return stryMutAct_9fa48("15040") ? Math.min(NUM.ZERO, Math.floor(cacheEpoch)) : (stryCov_9fa48("15040"), Math.max(NUM.ZERO, Math.floor(cacheEpoch)));
            }
          }
        }
      }
      return NUM.ZERO;
    }
  }

  /**
   * Determine whether the local cache has applied the bootstrap topology epoch.
   * @param {Object} options
   * @param {number|null} options.topologySnapshotEpoch
   * @param {number} options.appliedTopologyEpoch
   * @return {boolean}
   * @private
   */
  isBootstrapTopologyEpochSatisfied(options = {}) {
    if (stryMutAct_9fa48("15041")) {
      {}
    } else {
      stryCov_9fa48("15041");
      if (stryMutAct_9fa48("15044") ? false : stryMutAct_9fa48("15043") ? true : stryMutAct_9fa48("15042") ? Number.isFinite(options.topologySnapshotEpoch) : (stryCov_9fa48("15042", "15043", "15044"), !Number.isFinite(options.topologySnapshotEpoch))) {
        if (stryMutAct_9fa48("15045")) {
          {}
        } else {
          stryCov_9fa48("15045");
          return stryMutAct_9fa48("15046") ? false : (stryCov_9fa48("15046"), true);
        }
      }
      return stryMutAct_9fa48("15049") ? Number.isFinite(options.appliedTopologyEpoch) || options.appliedTopologyEpoch >= options.topologySnapshotEpoch : stryMutAct_9fa48("15048") ? false : stryMutAct_9fa48("15047") ? true : (stryCov_9fa48("15047", "15048", "15049"), Number.isFinite(options.appliedTopologyEpoch) && (stryMutAct_9fa48("15052") ? options.appliedTopologyEpoch < options.topologySnapshotEpoch : stryMutAct_9fa48("15051") ? options.appliedTopologyEpoch > options.topologySnapshotEpoch : stryMutAct_9fa48("15050") ? true : (stryCov_9fa48("15050", "15051", "15052"), options.appliedTopologyEpoch >= options.topologySnapshotEpoch)));
    }
  }

  /**
   * Rank one join-readiness reason according to stable precedence.
   * @param {string} reason
   * @return {number}
   */
  getJoinReadinessReasonRank(reason) {
    if (stryMutAct_9fa48("15053")) {
      {}
    } else {
      stryCov_9fa48("15053");
      const index = JOIN_READINESS_REASON_PRECEDENCE.indexOf(reason);
      return (stryMutAct_9fa48("15057") ? index < NUM.ZERO : stryMutAct_9fa48("15056") ? index > NUM.ZERO : stryMutAct_9fa48("15055") ? false : stryMutAct_9fa48("15054") ? true : (stryCov_9fa48("15054", "15055", "15056", "15057"), index >= NUM.ZERO)) ? index : JOIN_READINESS_REASON_PRECEDENCE.length;
    }
  }
}
export { JoinReadinessEvaluator };