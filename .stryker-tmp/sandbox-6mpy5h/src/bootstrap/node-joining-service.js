/**
 * Node Joining Service - Handles new node joining an existing cluster.
 *
 * Bootstrap Process:
 * 1. Contact seed node via HTTP to get bootstrap response
 * 2. Bootstrap response contains default cache-sync table snapshots
 * 3. Hydrate local system cache from snapshots
 * 4. System cache becomes single source of truth for query routing
 * 5. Subscribe to CDC events to keep cache updated
 * 6. Register node in cluster via system cache routing
 *
 * System Cache Architecture:
 * - All cluster state stored in system tables
 * - System cache populated from bootstrap snapshots
 * - CDC events keep cache synchronized across all nodes
 * - All queries route through system cache (no bootstrap directories)
 * - Cache provides partition locations and leader addresses
 *
 * Requirements: 4.1, 4.6, 4.7, 7.8, 7.10, 7.11, 7.14
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
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { LoggingService } from '../logging/logging-service.js';
import { assertCritical } from '../utils/assert.js';
import { NodeService } from '../node/node-service.js';
import { ReplicaHandlerSetup } from './shared/replica-handler-setup.js';
import { CDCIntegrationSetup } from './shared/cdc-integration-setup.js';
import { ControlPlaneSetup } from './shared/control-plane-setup.js';
import { LatencyTopologySetup } from './shared/latency-topology-setup.js';
import { HEARTBEAT_STATE } from '../control-plane/heartbeat-service-constants.js';
import { LEASE_STATE } from '../control-plane/lease-service-constants.js';
import { waitForLocalQueryTransportReadiness } from './shared/local-query-transport-readiness.js';
import { waitForMetadataPublicationReadiness } from './traffic-readiness-utils.js';
import { BootstrapMessageGroupSelectionOwner } from './owners/bootstrap-message-group-selection-owner.js';
import { PartitionService } from '../partition/partition-service.js';
import { NodeLifecycleStateMachine, NodeState } from '../node/node-lifecycle-state-machine.js';
import { CACHE_DEFAULT, CACHE_HYDRATION_TABLES, CDC_PROPAGATED_TABLES } from '../cache/cache-constants.js';
import { CDCPipelineReadinessGate } from '../cdc/cdc-pipeline-readiness-gate.js';
import { CDC_LIFECYCLE_LOG_MSG } from '../constants/cdc-lifecycle-constants.js';
import { getSystemCachePrimaryKeyFieldOrFallback } from '../cache/system-cache-key-descriptor.js';
import { SQLQueryEngine } from '../query/sql-query-engine.js';
import { wireMigrationWorkflowOwners } from '../migration/migration-composition.js';
import { TablePolicyService } from '../policy/table-policy-service.js';
import { NodeStorageBudgetSetup } from './shared/node-storage-budget-setup.js';
import { PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor } from '../control-plane/pressure-governor.js';
import { resolveMembershipJoinIntentType, MembershipLifecycleController } from '../control-plane/membership-lifecycle-controller.js';
import { BOOTSTRAP_EVENT, BOOTSTRAP_SUBSYSTEM, JOIN_DELEGATE_BUNDLE, JOIN_PLAN_SEGMENT, JOINING_PHASE, JOINING_PHASE_TO_SUB_PHASE } from './bootstrap-constants.js';
import { CDC_REESTABLISHMENT, CDC_SUBSCRIPTION_STATUS, JOIN_BACKFILL_QUERY, JOINING_DEFAULT, JOINING_ERROR_MSG, JOINING_ERROR_NAME, JOINING_HTTP, JOINING_LOG_MSG, JOIN_READINESS_REPAIR, JOINING_UNIFIED_RECONCILE } from './node-joining-constants.js';
import { createRuntimeStartupWiring } from '../runtime/runtime-startup-wiring.js';
import { WORK_CLASS, WorkClassScheduler } from '../runtime/work-class-scheduler.js';
import { JoinReadinessEvaluator } from './join-readiness-evaluator.js';
import { JoinCleanupHandler } from './join-cleanup-handler.js';
import { ContactSeedPhase, parseBootstrapError as _parseBootstrapError, formatLeaderMetadataDetails as _formatLeaderMetadataDetails, resolveSeedContactRetryAfterMs as _resolveSeedContactRetryAfterMs } from './phases/contact-seed-phase.js';
import { ConnectWebSocketPhase, deriveWsAddressFromNodeAddress as _deriveWsAddressFromNodeAddress } from './phases/connect-websocket-phase.js';
import { QuerySystemStatePhase } from './phases/query-system-state-phase.js';
import { WaitForLeadershipPhase } from './phases/wait-for-leadership-phase.js';
import { CreateMessageGroupPhase } from './phases/create-message-group-phase.js';
import { CONTROL_PLANE_ROLLOUT_REQUIRED, assertRequiredControlPlaneRollout } from '../runtime/control-plane-rollout-controls.js';
import { RPCClient } from '../transport/rpc-client.js';
import { ControlPlaneMessageType, ControlPlaneField, DEFAULT_NODE_CAPABILITIES, getControlPlaneMessageRequiredTables } from '../control-plane/control-plane-constants.js';
import { ControlPlaneKernelIngress } from '../control-plane/control-plane-kernel-ingress.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { getControlPlaneRetryAfterMs, isRetryableControlPlaneError } from '../control-plane/control-plane-error-classification.js';
import { STORAGE_DEFAULT } from '../storage/storage-constants.js';
import { COLUMN, NUM, SERVICE_DESCRIPTOR_FIELD, SERVICE_LIFECYCLE_STATE, SERVICE_STATUS, SERVICE_TYPE, STATE, STRING, TABLES, TYPEOF, TIME_MS, UNIFIED_SERVICE_TYPE } from '../constants/index.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { CDC_EVENT } from '../cdc/cdc-constants.js';
import { createJoiningPhaseOwners } from './owners/join-phase-owners.js';
import { StartupRuntimeHandoffOwner } from './owners/startup-runtime-handoff-owner.js';
import { JoinMessageGroupRuntimeOwner } from './owners/join-message-group-runtime-owner.js';
import { StartupPipelineRunner } from './pipeline/startup-pipeline-runner.js';
import { createJoinStartupPlan, assertJoinPlanSegments } from './pipeline/join-startup-plan.js';
import { PgWireStartupSafetyGate } from './pgwire-startup-safety-gate.js';
import { RuntimeServiceHandlerSetup } from './shared/runtime-service-handler-setup.js';
import { MessageGroupServiceHandlerSetup } from './shared/message-group-service-handler-setup.js';
import { activateMessageGroupServiceRows } from './shared/message-group-service-activation.js';
import { activatePartitionServiceRows } from './shared/partition-service-activation.js';
import { activateSteadyStateRuntimeHandoff } from './shared/startup-sql-runtime-handoff.js';
import { StartupServiceLifecycleOwner } from './shared/startup-service-lifecycle-owner.js';
import { StartupRuntimeSurfaceOwner } from './shared/startup-runtime-surface-owner.js';
import { extractJoinSchemaVersionFromRecord, compareJoinSchemaVersions } from './join-schema-version-resolver.js';
import { JoinCoordinator } from './join-coordinator.js';
import { JOIN_CHECKPOINT, JoinSessionStore } from './join-session-store.js';
import { STARTUP_JOIN_MODE } from './rejoin-hints-constants.js';
import { buildDurableRejoinPartitionRestorePlans } from './shared/durable-rejoin-partition-restore-planner.js';
import { formatReplicatedServiceAddress } from '../service/replicated-service-topology.js';
import { ReplicaStatus } from '../rebalancer/replica-status.js';
const NODE_JOINING_SERVICE_LITERAL = Object.freeze(stryMutAct_9fa48("16336") ? {} : (stryCov_9fa48("16336"), {
  NODEJOININGSERVICE: stryMutAct_9fa48("16337") ? "" : (stryCov_9fa48("16337"), 'NodeJoiningService'),
  CREATERUNTIMESTARTUPWIRING: stryMutAct_9fa48("16338") ? "" : (stryCov_9fa48("16338"), 'createRuntimeStartupWiring'),
  DEFERRED_CREATE_SELF_HOSTED_MESSAGE_GROUP_METADATA_PUBLICATION_FAILED: stryMutAct_9fa48("16339") ? "" : (stryCov_9fa48("16339"), 'Deferred CREATE_SELF_HOSTED message-group metadata publication failed'),
  LATENCYTOPOLOGYSETUP: stryMutAct_9fa48("16340") ? "" : (stryCov_9fa48("16340"), 'LatencyTopologySetup'),
  JOIN_RECONCILER_MUST_BE_INITIALIZED_BEFORE_RECONCILIATION: stryMutAct_9fa48("16341") ? "" : (stryCov_9fa48("16341"), 'Join reconciler must be initialized before reconciliation'),
  LOCAL_QUERY_DATA_PLANE_TRANSPORT_IS_NOT_READY: stryMutAct_9fa48("16342") ? "" : (stryCov_9fa48("16342"), 'Local query/data-plane transport is not ready'),
  LOCAL_QUERY_TRANSPORT: stryMutAct_9fa48("16343") ? "" : (stryCov_9fa48("16343"), 'local_query_transport'),
  LIFECYCLE_METADATA_PUBLICATION_READINESS_IS_NOT_SATISFIED: stryMutAct_9fa48("16344") ? "" : (stryCov_9fa48("16344"), 'Lifecycle metadata publication readiness is not satisfied'),
  METADATA_PUBLICATION_READINESS: stryMutAct_9fa48("16345") ? "" : (stryCov_9fa48("16345"), 'metadata_publication_readiness'),
  DEFERRING_JOIN_PARTITION_SERVICE_ROW_ACTIVATION: stryMutAct_9fa48("16346") ? "" : (stryCov_9fa48("16346"), 'Deferring join partition service row activation'),
  ANY_REPLICA: stryMutAct_9fa48("16347") ? "" : (stryCov_9fa48("16347"), 'any_replica'),
  NO_CONNECTION_TO_NODE: stryMutAct_9fa48("16348") ? "" : (stryCov_9fa48("16348"), 'No connection to node'),
  CONNECTION_TO_NODE: stryMutAct_9fa48("16349") ? "" : (stryCov_9fa48("16349"), 'Connection to node'),
  CLOSED: stryMutAct_9fa48("16350") ? "" : (stryCov_9fa48("16350"), 'closed'),
  MESSAGE_TIMEOUT: stryMutAct_9fa48("16351") ? "" : (stryCov_9fa48("16351"), 'Message timeout'),
  NO_HANDLER_REGISTERED_FOR_ADDRESS: stryMutAct_9fa48("16352") ? "" : (stryCov_9fa48("16352"), 'No handler registered for address'),
  OBJECT: stryMutAct_9fa48("16353") ? "" : (stryCov_9fa48("16353"), 'object'),
  CONTROL_PLANE_MESSAGE_WAS_NOT_ACKNOWLEDGED: stryMutAct_9fa48("16354") ? "" : (stryCov_9fa48("16354"), 'control-plane message was not acknowledged'),
  FAILED: stryMutAct_9fa48("16355") ? "" : (stryCov_9fa48("16355"), 'failed'),
  SHUTTING_DOWN: stryMutAct_9fa48("16356") ? "" : (stryCov_9fa48("16356"), 'shutting_down'),
  STOPPED: stryMutAct_9fa48("16357") ? "" : (stryCov_9fa48("16357"), 'stopped'),
  VALUE: stryMutAct_9fa48("16358") ? "" : (stryCov_9fa48("16358"), ', '),
  VALUE_2: stryMutAct_9fa48("16359") ? "" : (stryCov_9fa48("16359"), '|'),
  JOIN_BACKFILL: stryMutAct_9fa48("16360") ? "" : (stryCov_9fa48("16360"), 'join:backfill'),
  CONTROL_PLANE_READ: stryMutAct_9fa48("16361") ? "" : (stryCov_9fa48("16361"), 'control-plane:read'),
  CRITICAL: stryMutAct_9fa48("16362") ? "" : (stryCov_9fa48("16362"), 'critical'),
  BACKGROUND: stryMutAct_9fa48("16363") ? "" : (stryCov_9fa48("16363"), 'background'),
  JOIN_BACKFILL_DETECTED_REPLICA_DIVERGENCE: stryMutAct_9fa48("16364") ? "" : (stryCov_9fa48("16364"), 'Join backfill detected replica divergence'),
  QUERY_FAILED: stryMutAct_9fa48("16365") ? "" : (stryCov_9fa48("16365"), 'query failed'),
  RESTORED_DURABLE_LOCAL_PARTITION_SERVICES_FROM_CACHED_TOPOLOGY: stryMutAct_9fa48("16366") ? "" : (stryCov_9fa48("16366"), 'Restored durable local partition services from cached topology'),
  SUBSCRIBETOCDC_NOT_AVAILABLE: stryMutAct_9fa48("16367") ? "" : (stryCov_9fa48("16367"), 'subscribeToCDC not available'),
  CONTROL_PLANE_INITIALIZED_BY_OWNER: stryMutAct_9fa48("16368") ? "" : (stryCov_9fa48("16368"), 'Control plane initialized by owner'),
  CONTROLPLANESETUP: stryMutAct_9fa48("16369") ? "" : (stryCov_9fa48("16369"), 'ControlPlaneSetup'),
  CDC_INTEGRATION_INITIALIZED_BY_OWNER: stryMutAct_9fa48("16370") ? "" : (stryCov_9fa48("16370"), 'CDC integration initialized by owner'),
  CDCINTEGRATIONSETUP: stryMutAct_9fa48("16371") ? "" : (stryCov_9fa48("16371"), 'CDCIntegrationSetup'),
  NORMAL: stryMutAct_9fa48("16372") ? "" : (stryCov_9fa48("16372"), 'normal')
}));
const JoiningPhase = JOINING_PHASE;
const JoiningEvent = BOOTSTRAP_EVENT;
const JOIN_SESSION_PHASE = Object.freeze(stryMutAct_9fa48("16373") ? {} : (stryCov_9fa48("16373"), {
  SEED_CONTACTED: stryMutAct_9fa48("16374") ? "" : (stryCov_9fa48("16374"), 'join_session:seed_contacted'),
  INFRASTRUCTURE_READY: stryMutAct_9fa48("16375") ? "" : (stryCov_9fa48("16375"), 'join_session:infrastructure_ready'),
  MEMBERSHIP_WRITTEN: stryMutAct_9fa48("16376") ? "" : (stryCov_9fa48("16376"), 'join_session:membership_written'),
  READY_LEASE_ASSIGNED: stryMutAct_9fa48("16377") ? "" : (stryCov_9fa48("16377"), 'join_session:ready_lease_assigned'),
  FINALIZED: stryMutAct_9fa48("16378") ? "" : (stryCov_9fa48("16378"), 'join_session:finalized')
}));
import { shouldAttachPartitionCdcPropagation } from './shared/cdc-propagation-filter.js';
import { canonicalizeSystemTableRow } from '../control-plane/system-row-normalizers.js'; /**
                                                                                         * NodeJoiningService handles the process of a new node joining an existing cluster.
                                                                                         */
class NodeJoiningService extends EventEmitter {
  /**
  * Create a new NodeJoiningService.
  * @param {Object} options - Configuration options.
  * @param {string} options.nodeId - This node's ID (generated if not provided).
  * @param {string} options.nodeAddress - This node's address.
  * @param {string} options.seedNodeAddress - Seed node address to contact.
  * @param {string} options.seedNodeWsAddress - Seed node WebSocket address.
  * @param {number} options.wsPort - WebSocket port for this node.
  * @param {string} options.dataDir - Base data directory for partition storage.
  * @param {Function} [options.httpPost] - Optional HTTP POST implementation override (for tests).
  */
  constructor(options = {}) {
    if (stryMutAct_9fa48("16379")) {
      {}
    } else {
      stryCov_9fa48("16379");
      super();
      this.rolloutControls = assertRequiredControlPlaneRollout(stryMutAct_9fa48("16380") ? {} : (stryCov_9fa48("16380"), {
        owner: NODE_JOINING_SERVICE_LITERAL.NODEJOININGSERVICE,
        controls: options.rolloutControls,
        required: CONTROL_PLANE_ROLLOUT_REQUIRED.NODE_JOINING_SERVICE
      }));
      this.nodeId = stryMutAct_9fa48("16383") ? options.nodeId && uuidv4() : stryMutAct_9fa48("16382") ? false : stryMutAct_9fa48("16381") ? true : (stryCov_9fa48("16381", "16382", "16383"), options.nodeId || uuidv4());
      this.nodeAddress = stryMutAct_9fa48("16386") ? options.nodeAddress && null : stryMutAct_9fa48("16385") ? false : stryMutAct_9fa48("16384") ? true : (stryCov_9fa48("16384", "16385", "16386"), options.nodeAddress || null);
      this.advertisedNodeWsAddress = stryMutAct_9fa48("16389") ? options.advertisedNodeWsAddress && null : stryMutAct_9fa48("16388") ? false : stryMutAct_9fa48("16387") ? true : (stryCov_9fa48("16387", "16388", "16389"), options.advertisedNodeWsAddress || null);
      this.seedNodeAddress = stryMutAct_9fa48("16392") ? options.seedNodeAddress && null : stryMutAct_9fa48("16391") ? false : stryMutAct_9fa48("16390") ? true : (stryCov_9fa48("16390", "16391", "16392"), options.seedNodeAddress || null);
      this.seedNodeWsAddress = stryMutAct_9fa48("16395") ? options.seedNodeWsAddress && null : stryMutAct_9fa48("16394") ? false : stryMutAct_9fa48("16393") ? true : (stryCov_9fa48("16393", "16394", "16395"), options.seedNodeWsAddress || null);
      this.seedNodeId = null; // Allow explicit 0 to mean "do not start a WebSocket server" (useful in tests/sandboxes).
      this.wsPort = stryMutAct_9fa48("16396") ? options.wsPort && null : (stryCov_9fa48("16396"), options.wsPort ?? null);
      this.dataDir = stryMutAct_9fa48("16399") ? options.dataDir && STORAGE_DEFAULT.DATA_DIR : stryMutAct_9fa48("16398") ? false : stryMutAct_9fa48("16397") ? true : (stryCov_9fa48("16397", "16398", "16399"), options.dataDir || STORAGE_DEFAULT.DATA_DIR);
      this.config = stryMutAct_9fa48("16400") ? {} : (stryCov_9fa48("16400"), {
        ...JOINING_DEFAULT,
        ...options.config
      });
      this.config.replicaStaggerDelayMs = Number.isFinite(this.config.replicaStaggerDelayMs) ? stryMutAct_9fa48("16401") ? Math.min(NUM.ZERO, this.config.replicaStaggerDelayMs) : (stryCov_9fa48("16401"), Math.max(NUM.ZERO, this.config.replicaStaggerDelayMs)) : JOINING_DEFAULT.replicaStaggerDelayMs;
      this.config.heartbeatIntervalMs = Number.isFinite(this.config.heartbeatIntervalMs) ? stryMutAct_9fa48("16402") ? Math.min(NUM.HUNDRED, this.config.heartbeatIntervalMs) : (stryCov_9fa48("16402"), Math.max(NUM.HUNDRED, this.config.heartbeatIntervalMs)) : JOINING_DEFAULT.heartbeatIntervalMs;
      this.config.leadershipWaitJitterRatio = Number.isFinite(this.config.leadershipWaitJitterRatio) ? stryMutAct_9fa48("16403") ? Math.max(NUM.ONE, Math.max(NUM.ZERO, this.config.leadershipWaitJitterRatio)) : (stryCov_9fa48("16403"), Math.min(NUM.ONE, stryMutAct_9fa48("16404") ? Math.min(NUM.ZERO, this.config.leadershipWaitJitterRatio) : (stryCov_9fa48("16404"), Math.max(NUM.ZERO, this.config.leadershipWaitJitterRatio)))) : JOINING_DEFAULT.leadershipWaitJitterRatio;
      this.workClassScheduler = stryMutAct_9fa48("16407") ? options.workClassScheduler && new WorkClassScheduler() : stryMutAct_9fa48("16406") ? false : stryMutAct_9fa48("16405") ? true : (stryCov_9fa48("16405", "16406", "16407"), options.workClassScheduler || new WorkClassScheduler());
      this.random = (stryMutAct_9fa48("16410") ? typeof options.random !== TYPEOF.FUNCTION : stryMutAct_9fa48("16409") ? false : stryMutAct_9fa48("16408") ? true : (stryCov_9fa48("16408", "16409", "16410"), typeof options.random === TYPEOF.FUNCTION)) ? options.random : Math.random;
      this.now = (stryMutAct_9fa48("16413") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("16412") ? false : stryMutAct_9fa48("16411") ? true : (stryCov_9fa48("16411", "16412", "16413"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("16414") ? () => undefined : (stryCov_9fa48("16414"), () => Date.now());
      this.sleep = (stryMutAct_9fa48("16417") ? typeof options.sleep !== TYPEOF.FUNCTION : stryMutAct_9fa48("16416") ? false : stryMutAct_9fa48("16415") ? true : (stryCov_9fa48("16415", "16416", "16417"), typeof options.sleep === TYPEOF.FUNCTION)) ? options.sleep : stryMutAct_9fa48("16418") ? () => undefined : (stryCov_9fa48("16418"), delayMs => new Promise(stryMutAct_9fa48("16419") ? () => undefined : (stryCov_9fa48("16419"), resolve => setTimeout(resolve, delayMs))));
      this.joinSessionId = (stryMutAct_9fa48("16422") ? typeof options.joinSessionId === TYPEOF.STRING || options.joinSessionId.length > NUM.ZERO : stryMutAct_9fa48("16421") ? false : stryMutAct_9fa48("16420") ? true : (stryCov_9fa48("16420", "16421", "16422"), (stryMutAct_9fa48("16424") ? typeof options.joinSessionId !== TYPEOF.STRING : stryMutAct_9fa48("16423") ? true : (stryCov_9fa48("16423", "16424"), typeof options.joinSessionId === TYPEOF.STRING)) && (stryMutAct_9fa48("16427") ? options.joinSessionId.length <= NUM.ZERO : stryMutAct_9fa48("16426") ? options.joinSessionId.length >= NUM.ZERO : stryMutAct_9fa48("16425") ? true : (stryCov_9fa48("16425", "16426", "16427"), options.joinSessionId.length > NUM.ZERO)))) ? options.joinSessionId : uuidv4();
      const defaultJoinSessionStore = options.joinSessionStore instanceof JoinSessionStore ? options.joinSessionStore : new JoinSessionStore(stryMutAct_9fa48("16428") ? {} : (stryCov_9fa48("16428"), {
        now: this.now
      }));
      this.joinCoordinator = options.joinCoordinator instanceof JoinCoordinator ? options.joinCoordinator : new JoinCoordinator(stryMutAct_9fa48("16429") ? {} : (stryCov_9fa48("16429"), {
        joinSessionStore: defaultJoinSessionStore
      }));
      this.onLocalAdminRuntimeReady = (stryMutAct_9fa48("16432") ? typeof options.onLocalAdminRuntimeReady !== TYPEOF.FUNCTION : stryMutAct_9fa48("16431") ? false : stryMutAct_9fa48("16430") ? true : (stryCov_9fa48("16430", "16431", "16432"), typeof options.onLocalAdminRuntimeReady === TYPEOF.FUNCTION)) ? options.onLocalAdminRuntimeReady : null;
      this.localAdminRuntimeReadyNotified = stryMutAct_9fa48("16433") ? true : (stryCov_9fa48("16433"), false);
      this.joinSessionStore = this.joinCoordinator.joinSessionStore;
      this.joinReadinessSnapshotProvider = (stryMutAct_9fa48("16436") ? typeof options.joinReadinessSnapshotProvider !== TYPEOF.FUNCTION : stryMutAct_9fa48("16435") ? false : stryMutAct_9fa48("16434") ? true : (stryCov_9fa48("16434", "16435", "16436"), typeof options.joinReadinessSnapshotProvider === TYPEOF.FUNCTION)) ? options.joinReadinessSnapshotProvider : null;
      this.bootstrapReadinessState = stryMutAct_9fa48("16439") ? options.readinessState && null : stryMutAct_9fa48("16438") ? false : stryMutAct_9fa48("16437") ? true : (stryCov_9fa48("16437", "16438", "16439"), options.readinessState || null);
      this.startupMode = (stryMutAct_9fa48("16442") ? typeof options.startupMode === TYPEOF.STRING || options.startupMode.length > NUM.ZERO : stryMutAct_9fa48("16441") ? false : stryMutAct_9fa48("16440") ? true : (stryCov_9fa48("16440", "16441", "16442"), (stryMutAct_9fa48("16444") ? typeof options.startupMode !== TYPEOF.STRING : stryMutAct_9fa48("16443") ? true : (stryCov_9fa48("16443", "16444"), typeof options.startupMode === TYPEOF.STRING)) && (stryMutAct_9fa48("16447") ? options.startupMode.length <= NUM.ZERO : stryMutAct_9fa48("16446") ? options.startupMode.length >= NUM.ZERO : stryMutAct_9fa48("16445") ? true : (stryCov_9fa48("16445", "16446", "16447"), options.startupMode.length > NUM.ZERO)))) ? options.startupMode : STARTUP_JOIN_MODE.FRESH_JOIN;
      this.membershipLifecycleController = (stryMutAct_9fa48("16450") ? options.membershipLifecycleController || typeof options.membershipLifecycleController.submitJoinIntent === TYPEOF.FUNCTION : stryMutAct_9fa48("16449") ? false : stryMutAct_9fa48("16448") ? true : (stryCov_9fa48("16448", "16449", "16450"), options.membershipLifecycleController && (stryMutAct_9fa48("16452") ? typeof options.membershipLifecycleController.submitJoinIntent !== TYPEOF.FUNCTION : stryMutAct_9fa48("16451") ? true : (stryCov_9fa48("16451", "16452"), typeof options.membershipLifecycleController.submitJoinIntent === TYPEOF.FUNCTION)))) ? options.membershipLifecycleController : new MembershipLifecycleController(stryMutAct_9fa48("16453") ? {} : (stryCov_9fa48("16453"), {
        nodeId: this.nodeId,
        startupMode: this.startupMode,
        now: this.now
      })); // Allow tests to bypass real network I/O by providing an in-process HTTP POST.
      this.httpPostImpl = (stryMutAct_9fa48("16456") ? typeof options.httpPost !== TYPEOF.FUNCTION : stryMutAct_9fa48("16455") ? false : stryMutAct_9fa48("16454") ? true : (stryCov_9fa48("16454", "16455", "16456"), typeof options.httpPost === TYPEOF.FUNCTION)) ? options.httpPost : this.httpPost.bind(this); // Services created during joining
      this.messageGroupServices = new Map();
      this.messageGroupSelectionOwner = new BootstrapMessageGroupSelectionOwner(stryMutAct_9fa48("16457") ? {} : (stryCov_9fa48("16457"), {
        delegates: stryMutAct_9fa48("16458") ? {} : (stryCov_9fa48("16458"), {
          getMessageGroupServices: stryMutAct_9fa48("16459") ? () => undefined : (stryCov_9fa48("16459"), () => this.messageGroupServices)
        })
      }));
      this.partitionServices = new Map();
      this.transport = null; // MessageRouter for unified local/remote message routing
      this.messageRouter = null; // Unified lifecycle desired-state descriptors for join-created services.
      this.joinDesiredServiceDefinitions = new Map(); // Join replica creation options keyed by canonical serviceId.
      this.joinReplicaOptionsByServiceId = new Map(); // Track message-group replicas created for deferred election start.
      this.joinMessageGroupReplicas = stryMutAct_9fa48("16460") ? ["Stryker was here"] : (stryCov_9fa48("16460"), []);
      this.inFlightBackfillsByKey = new Map(); // Unified lifecycle owners for joining message-group startup.
      this.serviceLifecycleManager = null;
      this.serviceReconciler = null; // Replica handler for CREATE_REPLICA/REMOVE_REPLICA execution
      this.replicaHandler = null; // Replica state machine for tracking replica lifecycle states
      this.replicaStateMachine = null; // Decomposed control plane services
      this.heartbeatService = null;
      this.leaseService = null;
      this.endpointService = null;
      this.dispatchService = null;
      this.rebalanceCoordinator = null; // Unified runtime ownership wiring.
      const runtimeWiring = createRuntimeStartupWiring(stryMutAct_9fa48("16461") ? {} : (stryCov_9fa48("16461"), {
        ociFeatureGateEnabled: Boolean(options.ociFeatureGateEnabled)
      }));
      const self = this;
      this.runtimeDependencyOwner = stryMutAct_9fa48("16462") ? {} : (stryCov_9fa48("16462"), {
        runtimeDriverRegistry: runtimeWiring.runtimeDriverRegistry,
        serviceRuntimeLifecycle: runtimeWiring.serviceRuntimeLifecycle,
        get logger() {
          if (stryMutAct_9fa48("16463")) {
            {}
          } else {
            stryCov_9fa48("16463");
            return self.logger;
          }
        },
        get transport() {
          if (stryMutAct_9fa48("16464")) {
            {}
          } else {
            stryCov_9fa48("16464");
            return self.transport;
          }
        },
        get messageRouter() {
          if (stryMutAct_9fa48("16465")) {
            {}
          } else {
            stryCov_9fa48("16465");
            return self.messageRouter;
          }
        },
        get rpcClient() {
          if (stryMutAct_9fa48("16466")) {
            {}
          } else {
            stryCov_9fa48("16466");
            return self.rpcClient;
          }
        },
        get cdcIntegrationService() {
          if (stryMutAct_9fa48("16467")) {
            {}
          } else {
            stryCov_9fa48("16467");
            return self.cdcIntegrationService;
          }
        },
        get replicaHandler() {
          if (stryMutAct_9fa48("16468")) {
            {}
          } else {
            stryCov_9fa48("16468");
            return self.replicaHandler;
          }
        },
        get replicaStateMachine() {
          if (stryMutAct_9fa48("16469")) {
            {}
          } else {
            stryCov_9fa48("16469");
            return self.replicaStateMachine;
          }
        },
        get heartbeatService() {
          if (stryMutAct_9fa48("16470")) {
            {}
          } else {
            stryCov_9fa48("16470");
            return self.heartbeatService;
          }
        },
        get leaseService() {
          if (stryMutAct_9fa48("16471")) {
            {}
          } else {
            stryCov_9fa48("16471");
            return self.leaseService;
          }
        },
        get endpointService() {
          if (stryMutAct_9fa48("16472")) {
            {}
          } else {
            stryCov_9fa48("16472");
            return self.endpointService;
          }
        },
        get dispatchService() {
          if (stryMutAct_9fa48("16473")) {
            {}
          } else {
            stryCov_9fa48("16473");
            return self.dispatchService;
          }
        },
        get tablePolicyService() {
          if (stryMutAct_9fa48("16474")) {
            {}
          } else {
            stryCov_9fa48("16474");
            return self.tablePolicyService;
          }
        },
        get latencyTopology() {
          if (stryMutAct_9fa48("16475")) {
            {}
          } else {
            stryCov_9fa48("16475");
            return self.latencyTopology;
          }
        },
        get runtimeServiceHandler() {
          if (stryMutAct_9fa48("16476")) {
            {}
          } else {
            stryCov_9fa48("16476");
            return self.runtimeServiceHandler;
          }
        },
        get rebalanceCoordinator() {
          if (stryMutAct_9fa48("16477")) {
            {}
          } else {
            stryCov_9fa48("16477");
            return self.rebalanceCoordinator;
          }
        },
        get controlPlaneReadinessService() {
          if (stryMutAct_9fa48("16478")) {
            {}
          } else {
            stryCov_9fa48("16478");
            return stryMutAct_9fa48("16481") ? self.rebalanceCoordinator?.controlPlaneReadinessService && null : stryMutAct_9fa48("16480") ? false : stryMutAct_9fa48("16479") ? true : (stryCov_9fa48("16479", "16480", "16481"), (stryMutAct_9fa48("16482") ? self.rebalanceCoordinator.controlPlaneReadinessService : (stryCov_9fa48("16482"), self.rebalanceCoordinator?.controlPlaneReadinessService)) || null);
          }
        },
        get bootstrapReadinessState() {
          if (stryMutAct_9fa48("16483")) {
            {}
          } else {
            stryCov_9fa48("16483");
            return self.joinReadinessState;
          }
        },
        get serviceLifecycleManager() {
          if (stryMutAct_9fa48("16484")) {
            {}
          } else {
            stryCov_9fa48("16484");
            return self.serviceLifecycleManager;
          }
        },
        get serviceReconciler() {
          if (stryMutAct_9fa48("16485")) {
            {}
          } else {
            stryCov_9fa48("16485");
            return self.serviceReconciler;
          }
        }
      });
      Object.defineProperties(this, stryMutAct_9fa48("16486") ? {} : (stryCov_9fa48("16486"), {
        runtimeDriverRegistry: stryMutAct_9fa48("16487") ? {} : (stryCov_9fa48("16487"), {
          configurable: stryMutAct_9fa48("16488") ? false : (stryCov_9fa48("16488"), true),
          enumerable: stryMutAct_9fa48("16489") ? false : (stryCov_9fa48("16489"), true),
          get: stryMutAct_9fa48("16490") ? () => undefined : (stryCov_9fa48("16490"), () => this.runtimeDependencyOwner.runtimeDriverRegistry)
        }),
        serviceRuntimeLifecycle: stryMutAct_9fa48("16491") ? {} : (stryCov_9fa48("16491"), {
          configurable: stryMutAct_9fa48("16492") ? false : (stryCov_9fa48("16492"), true),
          enumerable: stryMutAct_9fa48("16493") ? false : (stryCov_9fa48("16493"), true),
          get: stryMutAct_9fa48("16494") ? () => undefined : (stryCov_9fa48("16494"), () => this.runtimeDependencyOwner.serviceRuntimeLifecycle)
        })
      }));
      this.runtimeDrivers = runtimeWiring.drivers; // RPC client for control plane dispatch
      this.rpcClient = null; // CDC integration service for system table writes
      this.cdcIntegrationService = null; // Storage budget owner for node registration
      this.nodeStorageBudgetService = null; // Table policy service for partition placement decisions
      this.tablePolicyService = null;
      this.latencyTopology = null; // Track system cache hydration state for rebalancer initialization
      this.systemCacheHydrated = stryMutAct_9fa48("16495") ? true : (stryCov_9fa48("16495"), false);
      this.bootstrapTopologySnapshotMeta = null;
      this.bootstrapTopologySnapshotHydratedAtMs = null; // Track CDC subscription status
      this.cdcSubscriptionsActive = stryMutAct_9fa48("16496") ? true : (stryCov_9fa48("16496"), false); // Control plane target address for control messages
      this.controlPlaneTargetAddress = null;
      this.messageGroupServiceHandler = null;
      this.controlPlaneKernelIngress = options.controlPlaneKernelIngress instanceof ControlPlaneKernelIngress ? options.controlPlaneKernelIngress : new ControlPlaneKernelIngress(stryMutAct_9fa48("16497") ? {} : (stryCov_9fa48("16497"), {
        nodeId: this.nodeId,
        getBootstrapResponse: stryMutAct_9fa48("16498") ? () => undefined : (stryCov_9fa48("16498"), () => this.bootstrapResponse),
        getSeedNodeId: stryMutAct_9fa48("16499") ? () => undefined : (stryCov_9fa48("16499"), () => this.seedNodeId),
        getMessageRouter: stryMutAct_9fa48("16500") ? () => undefined : (stryCov_9fa48("16500"), () => this.messageRouter),
        getMessageGroupServices: stryMutAct_9fa48("16501") ? () => undefined : (stryCov_9fa48("16501"), () => this.messageGroupServices)
      }));
      this.pendingClusterMeshReconciliation = null; // Node lifecycle state machine for explicit state transitions
      // Requirements: 2.1, 2.2, 2.3, 2.4
      this.lifecycleStateMachine = new NodeLifecycleStateMachine(stryMutAct_9fa48("16502") ? {} : (stryCov_9fa48("16502"), {
        nodeId: this.nodeId,
        initialState: NodeState.STARTING
      })); // Bootstrap response from seed node
      this.bootstrapResponse = null; // Joining state
      this.phase = JoiningPhase.NOT_STARTED;
      this.startTime = null;
      this.phaseStartTime = null; // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.NODE_JOINING);
      this.logger.debug(JOINING_LOG_MSG.RUNTIME_WIRING_READY, stryMutAct_9fa48("16503") ? {} : (stryCov_9fa48("16503"), {
        nodeId: this.nodeId,
        owner: NODE_JOINING_SERVICE_LITERAL.CREATERUNTIMESTARTUPWIRING,
        runtimeDriverCount: Object.keys(this.runtimeDrivers).length,
        ociFeatureGateEnabled: Boolean(options.ociFeatureGateEnabled)
      }));
      this.runtimeHandoffOwner = new StartupRuntimeHandoffOwner(stryMutAct_9fa48("16504") ? {} : (stryCov_9fa48("16504"), {
        delegates: stryMutAct_9fa48("16505") ? {} : (stryCov_9fa48("16505"), {
          getCompatibilityService: stryMutAct_9fa48("16506") ? () => undefined : (stryCov_9fa48("16506"), () => this),
          getLeaseService: stryMutAct_9fa48("16507") ? () => undefined : (stryCov_9fa48("16507"), () => this.leaseService),
          getLeaseRunningState: stryMutAct_9fa48("16508") ? () => undefined : (stryCov_9fa48("16508"), () => LEASE_STATE.RUNNING),
          getHeartbeatService: stryMutAct_9fa48("16509") ? () => undefined : (stryCov_9fa48("16509"), () => this.heartbeatService),
          getHeartbeatRunningState: stryMutAct_9fa48("16510") ? () => undefined : (stryCov_9fa48("16510"), () => HEARTBEAT_STATE.RUNNING),
          buildHeartbeatStartOptions: stryMutAct_9fa48("16511") ? () => undefined : (stryCov_9fa48("16511"), () => this.buildControlPlaneHeartbeatStartOptions()),
          activateDistributedTransactionRecoveryOnWriterActivation: stryMutAct_9fa48("16512") ? true : (stryCov_9fa48("16512"), false),
          activateDistributedTransactionRecovery: () => {
            if (stryMutAct_9fa48("16513")) {
              {}
            } else {
              stryCov_9fa48("16513");
              const sqlQueryEngine = stryMutAct_9fa48("16514") ? this.cdcIntegrationService.sqlQueryEngine : (stryCov_9fa48("16514"), this.cdcIntegrationService?.sqlQueryEngine);
              if (stryMutAct_9fa48("16517") ? typeof sqlQueryEngine?.activateDistributedTransactionRecovery === TYPEOF.FUNCTION : stryMutAct_9fa48("16516") ? false : stryMutAct_9fa48("16515") ? true : (stryCov_9fa48("16515", "16516", "16517"), typeof (stryMutAct_9fa48("16518") ? sqlQueryEngine.activateDistributedTransactionRecovery : (stryCov_9fa48("16518"), sqlQueryEngine?.activateDistributedTransactionRecovery)) !== TYPEOF.FUNCTION)) {
                if (stryMutAct_9fa48("16519")) {
                  {}
                } else {
                  stryCov_9fa48("16519");
                  return;
                }
              }
              void sqlQueryEngine.activateDistributedTransactionRecovery();
            }
          },
          flushDeferredCreateSelfHostedMetadata: () => {
            if (stryMutAct_9fa48("16520")) {
              {}
            } else {
              stryCov_9fa48("16520");
              if (stryMutAct_9fa48("16523") ? typeof this.createMessageGroupPhase?.flushDeferredCreateSelfHostedMetadata === TYPEOF.FUNCTION : stryMutAct_9fa48("16522") ? false : stryMutAct_9fa48("16521") ? true : (stryCov_9fa48("16521", "16522", "16523"), typeof (stryMutAct_9fa48("16524") ? this.createMessageGroupPhase.flushDeferredCreateSelfHostedMetadata : (stryCov_9fa48("16524"), this.createMessageGroupPhase?.flushDeferredCreateSelfHostedMetadata)) !== TYPEOF.FUNCTION)) {
                if (stryMutAct_9fa48("16525")) {
                  {}
                } else {
                  stryCov_9fa48("16525");
                  return;
                }
              }
              void this.createMessageGroupPhase.flushDeferredCreateSelfHostedMetadata().catch(error => {
                if (stryMutAct_9fa48("16526")) {
                  {}
                } else {
                  stryCov_9fa48("16526");
                  this.logger.warn(NODE_JOINING_SERVICE_LITERAL.DEFERRED_CREATE_SELF_HOSTED_MESSAGE_GROUP_METADATA_PUBLICATION_FAILED, stryMutAct_9fa48("16527") ? {} : (stryCov_9fa48("16527"), {
                    nodeId: this.nodeId,
                    error: stryMutAct_9fa48("16530") ? error?.message && String(error) : stryMutAct_9fa48("16529") ? false : stryMutAct_9fa48("16528") ? true : (stryCov_9fa48("16528", "16529", "16530"), (stryMutAct_9fa48("16531") ? error.message : (stryCov_9fa48("16531"), error?.message)) || String(error))
                  }));
                }
              });
            }
          },
          startLatencyTopologyLifecycle: () => {
            if (stryMutAct_9fa48("16532")) {
              {}
            } else {
              stryCov_9fa48("16532");
              const topologyOwners = assertCritical(this.latencyTopology, JOINING_ERROR_MSG.LATENCY_TOPOLOGY_MISSING);
              LatencyTopologySetup.start(topologyOwners);
              this.logger.info(JOINING_LOG_MSG.LATENCY_TOPOLOGY_STARTED, stryMutAct_9fa48("16533") ? {} : (stryCov_9fa48("16533"), {
                nodeId: this.nodeId,
                owner: NODE_JOINING_SERVICE_LITERAL.LATENCYTOPOLOGYSETUP
              }));
            }
          },
          onControlPlaneBackgroundWritersActivated: () => {
            if (stryMutAct_9fa48("16534")) {
              {}
            } else {
              stryCov_9fa48("16534");
              this.logger.info(JOINING_LOG_MSG.CONTROL_PLANE_BACKGROUND_WRITERS_ACTIVE, stryMutAct_9fa48("16535") ? {} : (stryCov_9fa48("16535"), {
                nodeId: this.nodeId
              }));
            }
          }
        })
      }));
      this.joiningPhaseOwners = createJoiningPhaseOwners(this); // Join readiness evaluator (extracted helper)
      this.joinReadinessEvaluator = new JoinReadinessEvaluator(stryMutAct_9fa48("16536") ? {} : (stryCov_9fa48("16536"), {
        nodeId: this.nodeId,
        now: this.now,
        sleep: this.sleep,
        delegates: stryMutAct_9fa48("16537") ? {} : (stryCov_9fa48("16537"), {
          resolveControlPlaneTargetAddress: stryMutAct_9fa48("16538") ? () => undefined : (stryCov_9fa48("16538"), opts => this.resolveControlPlaneTargetAddress(opts)),
          resolveControlPlaneTargetAddressCandidates: stryMutAct_9fa48("16539") ? () => undefined : (stryCov_9fa48("16539"), opts => this.resolveControlPlaneTargetAddressCandidates(opts)),
          getMissingSystemServiceLeaders: stryMutAct_9fa48("16540") ? () => undefined : (stryCov_9fa48("16540"), cache => this.waitForLeadershipPhase.getMissingSystemServiceLeaders(cache)),
          getBlockingSystemServiceLeaders: stryMutAct_9fa48("16541") ? () => undefined : (stryCov_9fa48("16541"), (missing, cache) => this.waitForLeadershipPhase.getBlockingSystemServiceLeaders(missing, cache)),
          backfillPropagatedCacheTables: stryMutAct_9fa48("16542") ? () => undefined : (stryCov_9fa48("16542"), (tables, backfillOptions) => this.backfillPropagatedCacheTablesFromAuthoritativeState(tables, backfillOptions)),
          getMessageRouter: stryMutAct_9fa48("16543") ? () => undefined : (stryCov_9fa48("16543"), () => this.messageRouter),
          getBootstrapResponse: stryMutAct_9fa48("16544") ? () => undefined : (stryCov_9fa48("16544"), () => this.bootstrapResponse),
          getBootstrapTopologySnapshotMeta: stryMutAct_9fa48("16545") ? () => undefined : (stryCov_9fa48("16545"), () => this.bootstrapTopologySnapshotMeta),
          getBootstrapTopologySnapshotActiveNodeIds: () => {
            if (stryMutAct_9fa48("16546")) {
              {}
            } else {
              stryCov_9fa48("16546");
              const topologySnapshotMeta = stryMutAct_9fa48("16549") ? (this.bootstrapTopologySnapshotMeta || this.bootstrapResponse?.topologySnapshotMeta) && null : stryMutAct_9fa48("16548") ? false : stryMutAct_9fa48("16547") ? true : (stryCov_9fa48("16547", "16548", "16549"), (stryMutAct_9fa48("16551") ? this.bootstrapTopologySnapshotMeta && this.bootstrapResponse?.topologySnapshotMeta : stryMutAct_9fa48("16550") ? false : (stryCov_9fa48("16550", "16551"), this.bootstrapTopologySnapshotMeta || (stryMutAct_9fa48("16552") ? this.bootstrapResponse.topologySnapshotMeta : (stryCov_9fa48("16552"), this.bootstrapResponse?.topologySnapshotMeta)))) || null);
              return Array.isArray(stryMutAct_9fa48("16553") ? topologySnapshotMeta.activeNodeIds : (stryCov_9fa48("16553"), topologySnapshotMeta?.activeNodeIds)) ? topologySnapshotMeta.activeNodeIds : stryMutAct_9fa48("16554") ? ["Stryker was here"] : (stryCov_9fa48("16554"), []);
            }
          },
          getBootstrapTopologySnapshotEpoch: () => {
            if (stryMutAct_9fa48("16555")) {
              {}
            } else {
              stryCov_9fa48("16555");
              const topologySnapshotMeta = stryMutAct_9fa48("16558") ? (this.bootstrapTopologySnapshotMeta || this.bootstrapResponse?.topologySnapshotMeta) && null : stryMutAct_9fa48("16557") ? false : stryMutAct_9fa48("16556") ? true : (stryCov_9fa48("16556", "16557", "16558"), (stryMutAct_9fa48("16560") ? this.bootstrapTopologySnapshotMeta && this.bootstrapResponse?.topologySnapshotMeta : stryMutAct_9fa48("16559") ? false : (stryCov_9fa48("16559", "16560"), this.bootstrapTopologySnapshotMeta || (stryMutAct_9fa48("16561") ? this.bootstrapResponse.topologySnapshotMeta : (stryCov_9fa48("16561"), this.bootstrapResponse?.topologySnapshotMeta)))) || null);
              if (stryMutAct_9fa48("16563") ? false : stryMutAct_9fa48("16562") ? true : (stryCov_9fa48("16562", "16563"), Number.isFinite(stryMutAct_9fa48("16564") ? topologySnapshotMeta.topologyEpoch : (stryCov_9fa48("16564"), topologySnapshotMeta?.topologyEpoch)))) {
                if (stryMutAct_9fa48("16565")) {
                  {}
                } else {
                  stryCov_9fa48("16565");
                  return topologySnapshotMeta.topologyEpoch;
                }
              }
              if (stryMutAct_9fa48("16567") ? false : stryMutAct_9fa48("16566") ? true : (stryCov_9fa48("16566", "16567"), Number.isFinite(stryMutAct_9fa48("16569") ? this.bootstrapResponse.currentEpoch?.epoch : stryMutAct_9fa48("16568") ? this.bootstrapResponse?.currentEpoch.epoch : (stryCov_9fa48("16568", "16569"), this.bootstrapResponse?.currentEpoch?.epoch)))) {
                if (stryMutAct_9fa48("16570")) {
                  {}
                } else {
                  stryCov_9fa48("16570");
                  return this.bootstrapResponse.currentEpoch.epoch;
                }
              }
              return null;
            }
          },
          getBootstrapTopologySnapshotHydratedAtMs: stryMutAct_9fa48("16571") ? () => undefined : (stryCov_9fa48("16571"), () => this.bootstrapTopologySnapshotHydratedAtMs),
          getSystemCacheHydrated: stryMutAct_9fa48("16572") ? () => undefined : (stryCov_9fa48("16572"), () => this.systemCacheHydrated),
          getControlPlaneReadinessService: stryMutAct_9fa48("16573") ? () => undefined : (stryCov_9fa48("16573"), () => stryMutAct_9fa48("16576") ? this.rebalanceCoordinator?.controlPlaneReadinessService && null : stryMutAct_9fa48("16575") ? false : stryMutAct_9fa48("16574") ? true : (stryCov_9fa48("16574", "16575", "16576"), (stryMutAct_9fa48("16577") ? this.rebalanceCoordinator.controlPlaneReadinessService : (stryCov_9fa48("16577"), this.rebalanceCoordinator?.controlPlaneReadinessService)) || null)),
          getJoinReadinessSnapshotProvider: stryMutAct_9fa48("16578") ? () => undefined : (stryCov_9fa48("16578"), () => this.joinReadinessSnapshotProvider),
          getCdcIntegrationService: stryMutAct_9fa48("16579") ? () => undefined : (stryCov_9fa48("16579"), () => this.cdcIntegrationService),
          getLogger: stryMutAct_9fa48("16580") ? () => undefined : (stryCov_9fa48("16580"), () => this.logger),
          getConfig: stryMutAct_9fa48("16581") ? () => undefined : (stryCov_9fa48("16581"), () => this.config)
        })
      })); // Contact seed phase (extracted helper)
      this.contactSeedPhase = new ContactSeedPhase(stryMutAct_9fa48("16582") ? {} : (stryCov_9fa48("16582"), {
        nodeId: this.nodeId,
        delegates: stryMutAct_9fa48("16583") ? {} : (stryCov_9fa48("16583"), {
          getSeedNodeAddress: stryMutAct_9fa48("16584") ? () => undefined : (stryCov_9fa48("16584"), () => this.seedNodeAddress),
          getNodeAddress: stryMutAct_9fa48("16585") ? () => undefined : (stryCov_9fa48("16585"), () => this.nodeAddress),
          getJoinStartupMode: stryMutAct_9fa48("16586") ? () => undefined : (stryCov_9fa48("16586"), () => this.startupMode),
          getLogger: stryMutAct_9fa48("16587") ? () => undefined : (stryCov_9fa48("16587"), () => this.logger),
          getConfig: stryMutAct_9fa48("16588") ? () => undefined : (stryCov_9fa48("16588"), () => this.config),
          getNow: stryMutAct_9fa48("16589") ? () => undefined : (stryCov_9fa48("16589"), () => this.now),
          getSleep: stryMutAct_9fa48("16590") ? () => undefined : (stryCov_9fa48("16590"), () => this.sleep),
          getRandom: stryMutAct_9fa48("16591") ? () => undefined : (stryCov_9fa48("16591"), () => this.random),
          getHttpPostImpl: stryMutAct_9fa48("16592") ? () => undefined : (stryCov_9fa48("16592"), () => this.httpPostImpl),
          getBootstrapResponse: stryMutAct_9fa48("16593") ? () => undefined : (stryCov_9fa48("16593"), () => this.bootstrapResponse),
          setBootstrapResponse: v => {
            if (stryMutAct_9fa48("16594")) {
              {}
            } else {
              stryCov_9fa48("16594");
              this.bootstrapResponse = v;
            }
          },
          getSeedNodeId: stryMutAct_9fa48("16595") ? () => undefined : (stryCov_9fa48("16595"), () => this.seedNodeId),
          setSeedNodeId: v => {
            if (stryMutAct_9fa48("16596")) {
              {}
            } else {
              stryCov_9fa48("16596");
              this.seedNodeId = v;
            }
          },
          getSeedNodeWsAddress: stryMutAct_9fa48("16597") ? () => undefined : (stryCov_9fa48("16597"), () => this.seedNodeWsAddress),
          setSeedNodeWsAddress: v => {
            if (stryMutAct_9fa48("16598")) {
              {}
            } else {
              stryCov_9fa48("16598");
              this.seedNodeWsAddress = v;
            }
          }
        })
      })); // Connect WebSocket phase (extracted helper)
      this.connectWebSocketPhase = new ConnectWebSocketPhase(stryMutAct_9fa48("16599") ? {} : (stryCov_9fa48("16599"), {
        nodeId: this.nodeId,
        delegates: stryMutAct_9fa48("16600") ? {} : (stryCov_9fa48("16600"), {
          getWsPort: stryMutAct_9fa48("16601") ? () => undefined : (stryCov_9fa48("16601"), () => stryMutAct_9fa48("16602") ? this.wsPort && this.config.wsPort : (stryCov_9fa48("16602"), this.wsPort ?? this.config.wsPort)),
          getNodeAddress: stryMutAct_9fa48("16603") ? () => undefined : (stryCov_9fa48("16603"), () => this.nodeAddress),
          getAdvertisedNodeWsAddress: stryMutAct_9fa48("16604") ? () => undefined : (stryCov_9fa48("16604"), () => this.advertisedNodeWsAddress),
          getLogger: stryMutAct_9fa48("16605") ? () => undefined : (stryCov_9fa48("16605"), () => this.logger),
          getIdentifyPayload: stryMutAct_9fa48("16606") ? () => undefined : (stryCov_9fa48("16606"), () => this.getIdentifyBootstrapPayload()),
          getNow: stryMutAct_9fa48("16607") ? () => undefined : (stryCov_9fa48("16607"), () => this.now),
          getSleep: stryMutAct_9fa48("16608") ? () => undefined : (stryCov_9fa48("16608"), () => this.sleep),
          resolveJoinRetryPolicy: stryMutAct_9fa48("16609") ? () => undefined : (stryCov_9fa48("16609"), () => this.resolveJoinRetryPolicy()),
          computeSeedContactRetryDelayMs: stryMutAct_9fa48("16610") ? () => undefined : (stryCov_9fa48("16610"), opts => this.computeSeedContactRetryDelayMs(opts)),
          getMessageRouter: stryMutAct_9fa48("16611") ? () => undefined : (stryCov_9fa48("16611"), () => this.messageRouter),
          setMessageRouter: v => {
            if (stryMutAct_9fa48("16612")) {
              {}
            } else {
              stryCov_9fa48("16612");
              this.messageRouter = v;
            }
          },
          setTransport: v => {
            if (stryMutAct_9fa48("16613")) {
              {}
            } else {
              stryCov_9fa48("16613");
              this.transport = v;
            }
          },
          getLeaderMessageGroupService: stryMutAct_9fa48("16614") ? () => undefined : (stryCov_9fa48("16614"), () => this.getLeaderMessageGroupService()),
          resolveQueryTransportMessageGroupSelection: stryMutAct_9fa48("16615") ? () => undefined : (stryCov_9fa48("16615"), () => this.resolveQueryTransportMessageGroupSelection()),
          initializeJoiningLifecycleOwners: stryMutAct_9fa48("16616") ? () => undefined : (stryCov_9fa48("16616"), () => this.initializeJoiningLifecycleOwners()),
          triggerJoinReconciler: stryMutAct_9fa48("16617") ? () => undefined : (stryCov_9fa48("16617"), reason => this.triggerJoinReconciler(reason)),
          ensureBootstrapSnapshotHydrated: async () => {
            if (stryMutAct_9fa48("16618")) {
              {}
            } else {
              stryCov_9fa48("16618");
              if (stryMutAct_9fa48("16620") ? false : stryMutAct_9fa48("16619") ? true : (stryCov_9fa48("16619", "16620"), this.systemCacheHydrated)) {
                if (stryMutAct_9fa48("16621")) {
                  {}
                } else {
                  stryCov_9fa48("16621");
                  return;
                }
              }
              await this.hydrateSystemCacheFromBootstrap();
              this.systemCacheHydrated = stryMutAct_9fa48("16622") ? false : (stryCov_9fa48("16622"), true);
            }
          },
          getSeedNodeWsAddress: stryMutAct_9fa48("16623") ? () => undefined : (stryCov_9fa48("16623"), () => this.seedNodeWsAddress),
          getSeedNodeId: stryMutAct_9fa48("16624") ? () => undefined : (stryCov_9fa48("16624"), () => this.seedNodeId),
          getBootstrapResponse: stryMutAct_9fa48("16625") ? () => undefined : (stryCov_9fa48("16625"), () => this.bootstrapResponse),
          getSystemTableCache: stryMutAct_9fa48("16626") ? () => undefined : (stryCov_9fa48("16626"), () => NodeService.getInstance().getSystemTableCache()),
          sendControlPlaneNodeStateUpdate: stryMutAct_9fa48("16627") ? () => undefined : (stryCov_9fa48("16627"), opts => this.sendControlPlaneNodeStateUpdate(opts)),
          shouldRetryControlPlaneNodeStateUpdate: stryMutAct_9fa48("16628") ? () => undefined : (stryCov_9fa48("16628"), error => this.shouldRetryControlPlaneNodeStateUpdate(error)),
          getNodeCapabilities: stryMutAct_9fa48("16629") ? () => undefined : (stryCov_9fa48("16629"), () => this.getNodeCapabilities()),
          resolveMeshConnectivityNodeRows: stryMutAct_9fa48("16630") ? () => undefined : (stryCov_9fa48("16630"), () => this.joinReadinessEvaluator.resolveMeshConnectivityNodeRows()),
          repairMeshConnectivityAuthorityIfNeeded: stryMutAct_9fa48("16631") ? () => undefined : (stryCov_9fa48("16631"), missingNodeIds => this.joinReadinessEvaluator.repairMeshConnectivityAuthorityIfNeeded(missingNodeIds)),
          buildClusterMeshSignature: stryMutAct_9fa48("16632") ? () => undefined : (stryCov_9fa48("16632"), rows => this.joinReadinessEvaluator.buildClusterMeshSignature(rows)),
          setLastClusterMeshSignature: sig => {
            if (stryMutAct_9fa48("16633")) {
              {}
            } else {
              stryCov_9fa48("16633");
              this.joinReadinessEvaluator.lastClusterMeshSignature = sig;
            }
          }
        })
      })); // Build concern-scoped delegate bundles for extracted phase modules.
      // Each bundle groups delegates by concern (D2.2) so owners receive
      // only the dependencies they need.
      this._joinDelegateBundles = this._buildJoinDelegateBundles(); // Join cleanup handler (extracted helper)
      // Uses cleanupOnly composition so it receives cleanup + readiness
      // delegates but not phase execution or runtime wiring (D2.2).
      this.joinCleanupHandler = new JoinCleanupHandler(stryMutAct_9fa48("16634") ? {} : (stryCov_9fa48("16634"), {
        nodeId: this.nodeId,
        delegates: this._composeJoinDelegates(this._joinDelegateBundles, stryMutAct_9fa48("16635") ? {} : (stryCov_9fa48("16635"), {
          cleanupOnly: stryMutAct_9fa48("16636") ? false : (stryCov_9fa48("16636"), true)
        }))
      })); // Query system state phase (extracted helper)
      this.querySystemStatePhase = new QuerySystemStatePhase(stryMutAct_9fa48("16637") ? {} : (stryCov_9fa48("16637"), {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        advertisedNodeWsAddress: this.advertisedNodeWsAddress,
        delegates: stryMutAct_9fa48("16638") ? {} : (stryCov_9fa48("16638"), {
          getLogger: stryMutAct_9fa48("16639") ? () => undefined : (stryCov_9fa48("16639"), () => this.logger),
          getConfig: stryMutAct_9fa48("16640") ? () => undefined : (stryCov_9fa48("16640"), () => this.config),
          getNow: stryMutAct_9fa48("16641") ? () => undefined : (stryCov_9fa48("16641"), () => this.now),
          getSleep: stryMutAct_9fa48("16642") ? () => undefined : (stryCov_9fa48("16642"), () => this.sleep),
          getWsPort: stryMutAct_9fa48("16643") ? () => undefined : (stryCov_9fa48("16643"), () => stryMutAct_9fa48("16644") ? this.wsPort && this.config.wsPort : (stryCov_9fa48("16644"), this.wsPort ?? this.config.wsPort)),
          getBootstrapResponse: stryMutAct_9fa48("16645") ? () => undefined : (stryCov_9fa48("16645"), () => this.bootstrapResponse),
          setBootstrapTopologySnapshotMeta: value => {
            if (stryMutAct_9fa48("16646")) {
              {}
            } else {
              stryCov_9fa48("16646");
              this.bootstrapTopologySnapshotMeta = (stryMutAct_9fa48("16649") ? value || typeof value === TYPEOF.OBJECT : stryMutAct_9fa48("16648") ? false : stryMutAct_9fa48("16647") ? true : (stryCov_9fa48("16647", "16648", "16649"), value && (stryMutAct_9fa48("16651") ? typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("16650") ? true : (stryCov_9fa48("16650", "16651"), typeof value === TYPEOF.OBJECT)))) ? value : null;
            }
          },
          setBootstrapTopologySnapshotHydratedAtMs: value => {
            if (stryMutAct_9fa48("16652")) {
              {}
            } else {
              stryCov_9fa48("16652");
              this.bootstrapTopologySnapshotHydratedAtMs = Number.isFinite(value) ? value : null;
            }
          },
          getLifecycleStateMachine: stryMutAct_9fa48("16653") ? () => undefined : (stryCov_9fa48("16653"), () => this.lifecycleStateMachine),
          getSeedNodeId: stryMutAct_9fa48("16654") ? () => undefined : (stryCov_9fa48("16654"), () => this.seedNodeId),
          getMessageRouter: stryMutAct_9fa48("16655") ? () => undefined : (stryCov_9fa48("16655"), () => this.messageRouter),
          getCdcIntegrationService: stryMutAct_9fa48("16656") ? () => undefined : (stryCov_9fa48("16656"), () => this.cdcIntegrationService),
          getSystemCacheHydrated: stryMutAct_9fa48("16657") ? () => undefined : (stryCov_9fa48("16657"), () => this.systemCacheHydrated),
          setSystemCacheHydrated: v => {
            if (stryMutAct_9fa48("16658")) {
              {}
            } else {
              stryCov_9fa48("16658");
              this.systemCacheHydrated = v;
            }
          },
          getCdcSubscriptionsActive: stryMutAct_9fa48("16659") ? () => undefined : (stryCov_9fa48("16659"), () => this.cdcSubscriptionsActive),
          getPartitionServices: stryMutAct_9fa48("16660") ? () => undefined : (stryCov_9fa48("16660"), () => this.partitionServices),
          getMessageGroupServices: stryMutAct_9fa48("16661") ? () => undefined : (stryCov_9fa48("16661"), () => this.messageGroupServices),
          getNodeStorageBudgetService: stryMutAct_9fa48("16662") ? () => undefined : (stryCov_9fa48("16662"), () => this.getNodeStorageBudgetService()),
          getSystemTableCache: stryMutAct_9fa48("16663") ? () => undefined : (stryCov_9fa48("16663"), () => NodeService.getInstance().getSystemTableCache()),
          ensureLatencyTopologyOwners: stryMutAct_9fa48("16664") ? () => undefined : (stryCov_9fa48("16664"), () => this.ensureLatencyTopologyOwners()),
          ensureTablePolicyService: cache => {
            if (stryMutAct_9fa48("16665")) {
              {}
            } else {
              stryCov_9fa48("16665");
              if (stryMutAct_9fa48("16668") ? false : stryMutAct_9fa48("16667") ? true : stryMutAct_9fa48("16666") ? this.tablePolicyService : (stryCov_9fa48("16666", "16667", "16668"), !this.tablePolicyService)) {
                if (stryMutAct_9fa48("16669")) {
                  {}
                } else {
                  stryCov_9fa48("16669");
                  this.tablePolicyService = new TablePolicyService(stryMutAct_9fa48("16670") ? {} : (stryCov_9fa48("16670"), {
                    systemTableCache: cache,
                    cdcIntegrationService: this.cdcIntegrationService
                  }));
                  this.tablePolicyService.initialize();
                }
              }
            }
          },
          restoreDurableRejoinLocalPartitionServices: stryMutAct_9fa48("16671") ? () => undefined : (stryCov_9fa48("16671"), cache => this.restoreDurableRejoinLocalPartitionServices(cache)),
          applySystemCacheToPartitions: cache => {
            if (stryMutAct_9fa48("16672")) {
              {}
            } else {
              stryCov_9fa48("16672");
              for (const partition of this.partitionServices.values()) {
                if (stryMutAct_9fa48("16673")) {
                  {}
                } else {
                  stryCov_9fa48("16673");
                  partition.setSystemTableCache(cache);
                  partition.setTablePolicyService(this.tablePolicyService);
                }
              }
            }
          },
          waitForSystemServiceLeaders: stryMutAct_9fa48("16674") ? () => undefined : (stryCov_9fa48("16674"), cache => this.waitForLeadershipPhase.waitForSystemServiceLeaders(cache)),
          registerCreateSelfHostedMetadata: stryMutAct_9fa48("16675") ? () => undefined : (stryCov_9fa48("16675"), () => this.registerCreateSelfHostedMetadata()),
          registerNodeInCluster: stryMutAct_9fa48("16676") ? () => undefined : (stryCov_9fa48("16676"), () => this.registerNodeInCluster()),
          sendControlPlaneNodeStateUpdate: stryMutAct_9fa48("16677") ? () => undefined : (stryCov_9fa48("16677"), options => this.sendControlPlaneNodeStateUpdate(options)),
          getJoinLifecycleIntentType: stryMutAct_9fa48("16678") ? () => undefined : (stryCov_9fa48("16678"), () => resolveMembershipJoinIntentType(this.startupMode)),
          getJoinStartupMode: stryMutAct_9fa48("16679") ? () => undefined : (stryCov_9fa48("16679"), () => this.startupMode),
          getNodeCapabilities: stryMutAct_9fa48("16680") ? () => undefined : (stryCov_9fa48("16680"), () => this.getNodeCapabilities()),
          subscribeToCDCEvents: stryMutAct_9fa48("16681") ? () => undefined : (stryCov_9fa48("16681"), () => this.subscribeToCDCEvents()),
          createCdcPipelineReadinessGate: stryMutAct_9fa48("16682") ? () => undefined : (stryCov_9fa48("16682"), cache => this.createCdcPipelineReadinessGate(cache)),
          backfillPropagatedCacheTablesFromAuthoritativeState: stryMutAct_9fa48("16683") ? () => undefined : (stryCov_9fa48("16683"), tableNames => this.backfillPropagatedCacheTablesFromAuthoritativeState(tableNames)),
          triggerJoinReconciler: stryMutAct_9fa48("16684") ? () => undefined : (stryCov_9fa48("16684"), reason => this.triggerJoinReconciler(reason)),
          stopJoiningLifecycleOwners: stryMutAct_9fa48("16685") ? () => undefined : (stryCov_9fa48("16685"), () => this.stopJoiningLifecycleOwners())
        })
      })); // Wait for leadership phase (extracted helper)
      this.waitForLeadershipPhase = new WaitForLeadershipPhase(stryMutAct_9fa48("16686") ? {} : (stryCov_9fa48("16686"), {
        nodeId: this.nodeId,
        delegates: stryMutAct_9fa48("16687") ? {} : (stryCov_9fa48("16687"), {
          getLogger: stryMutAct_9fa48("16688") ? () => undefined : (stryCov_9fa48("16688"), () => this.logger),
          getConfig: stryMutAct_9fa48("16689") ? () => undefined : (stryCov_9fa48("16689"), () => this.config),
          getNow: stryMutAct_9fa48("16690") ? () => undefined : (stryCov_9fa48("16690"), () => this.now),
          getSleep: stryMutAct_9fa48("16691") ? () => undefined : (stryCov_9fa48("16691"), () => this.sleep),
          getSystemTableCache: stryMutAct_9fa48("16692") ? () => undefined : (stryCov_9fa48("16692"), () => NodeService.getInstance().getSystemTableCache()),
          getMessageGroupServicesSize: stryMutAct_9fa48("16693") ? () => undefined : (stryCov_9fa48("16693"), () => this.messageGroupServices.size),
          getMessageGroupServices: stryMutAct_9fa48("16694") ? () => undefined : (stryCov_9fa48("16694"), () => this.messageGroupServices),
          hasMessageGroupLeaderInCache: stryMutAct_9fa48("16695") ? () => undefined : (stryCov_9fa48("16695"), cache => this.hasMessageGroupLeaderInCache(cache)),
          getBootstrapResponse: stryMutAct_9fa48("16696") ? () => undefined : (stryCov_9fa48("16696"), () => this.bootstrapResponse)
        })
      })); // Create message group phase (extracted helper)
      this.createMessageGroupPhase = new CreateMessageGroupPhase(stryMutAct_9fa48("16697") ? {} : (stryCov_9fa48("16697"), {
        nodeId: this.nodeId,
        delegates: stryMutAct_9fa48("16698") ? {} : (stryCov_9fa48("16698"), {
          getLogger: stryMutAct_9fa48("16699") ? () => undefined : (stryCov_9fa48("16699"), () => this.logger),
          getConfig: stryMutAct_9fa48("16700") ? () => undefined : (stryCov_9fa48("16700"), () => this.config),
          getNow: stryMutAct_9fa48("16701") ? () => undefined : (stryCov_9fa48("16701"), () => this.now),
          getSleep: stryMutAct_9fa48("16702") ? () => undefined : (stryCov_9fa48("16702"), () => this.sleep),
          getMessageRouter: stryMutAct_9fa48("16703") ? () => undefined : (stryCov_9fa48("16703"), () => this.messageRouter),
          getMessageGroupServices: stryMutAct_9fa48("16704") ? () => undefined : (stryCov_9fa48("16704"), () => this.messageGroupServices),
          getJoinMessageGroupReplicas: stryMutAct_9fa48("16705") ? () => undefined : (stryCov_9fa48("16705"), () => this.joinMessageGroupReplicas),
          pushJoinMessageGroupReplica: replica => {
            if (stryMutAct_9fa48("16706")) {
              {}
            } else {
              stryCov_9fa48("16706");
              this.joinMessageGroupReplicas.push(replica);
            }
          },
          removeJoinMessageGroupReplica: replica => {
            if (stryMutAct_9fa48("16707")) {
              {}
            } else {
              stryCov_9fa48("16707");
              this.joinMessageGroupReplicas = stryMutAct_9fa48("16708") ? this.joinMessageGroupReplicas : (stryCov_9fa48("16708"), this.joinMessageGroupReplicas.filter(stryMutAct_9fa48("16709") ? () => undefined : (stryCov_9fa48("16709"), s => stryMutAct_9fa48("16712") ? s === replica : stryMutAct_9fa48("16711") ? false : stryMutAct_9fa48("16710") ? true : (stryCov_9fa48("16710", "16711", "16712"), s !== replica))));
            }
          },
          resetJoinMessageGroupReplicas: () => {
            if (stryMutAct_9fa48("16713")) {
              {}
            } else {
              stryCov_9fa48("16713");
              this.joinMessageGroupReplicas = stryMutAct_9fa48("16714") ? ["Stryker was here"] : (stryCov_9fa48("16714"), []);
            }
          },
          resolveJoinReplicaOptions: stryMutAct_9fa48("16715") ? () => undefined : (stryCov_9fa48("16715"), (id, type) => this.resolveJoinReplicaOptions(id, type)),
          assertReplicaStartupOwnership: stryMutAct_9fa48("16716") ? () => undefined : (stryCov_9fa48("16716"), id => this.assertReplicaStartupOwnership(id)),
          queueJoinServiceReplica: stryMutAct_9fa48("16717") ? () => undefined : (stryCov_9fa48("16717"), (desc, opts) => this.queueJoinServiceReplica(desc, opts)),
          createJoinServiceDescriptor: stryMutAct_9fa48("16718") ? () => undefined : (stryCov_9fa48("16718"), (type, id) => this.createJoinServiceDescriptor(type, id)),
          triggerJoinReconciler: stryMutAct_9fa48("16719") ? () => undefined : (stryCov_9fa48("16719"), reason => this.triggerJoinReconciler(reason)),
          getBootstrapResponse: stryMutAct_9fa48("16720") ? () => undefined : (stryCov_9fa48("16720"), () => this.bootstrapResponse),
          getBootstrapReadinessState: stryMutAct_9fa48("16721") ? () => undefined : (stryCov_9fa48("16721"), () => this.bootstrapReadinessState),
          getSeedNodeId: stryMutAct_9fa48("16722") ? () => undefined : (stryCov_9fa48("16722"), () => this.seedNodeId),
          getSeedNodeAddress: stryMutAct_9fa48("16723") ? () => undefined : (stryCov_9fa48("16723"), () => this.seedNodeAddress),
          getHttpPostImpl: stryMutAct_9fa48("16724") ? () => undefined : (stryCov_9fa48("16724"), () => this.httpPostImpl),
          resolveJoinRetryPolicy: stryMutAct_9fa48("16725") ? () => undefined : (stryCov_9fa48("16725"), () => this.resolveJoinRetryPolicy()),
          classifySeedContactFailure: stryMutAct_9fa48("16726") ? () => undefined : (stryCov_9fa48("16726"), (err, msg) => this.classifySeedContactFailure(err, msg)),
          computeSeedContactRetryDelayMs: stryMutAct_9fa48("16727") ? () => undefined : (stryCov_9fa48("16727"), opts => this.computeSeedContactRetryDelayMs(opts)),
          upsertSystemTableRow: stryMutAct_9fa48("16728") ? () => undefined : (stryCov_9fa48("16728"), (table, data) => this.upsertSystemTableRow(table, data)),
          upsertSystemTableRowWithRetry: stryMutAct_9fa48("16729") ? () => undefined : (stryCov_9fa48("16729"), (table, data, options) => this.upsertSystemTableRowWithRetry(table, data, options)),
          seedJoinTimeCacheRow: stryMutAct_9fa48("16730") ? () => undefined : (stryCov_9fa48("16730"), (table, data) => this.seedJoinTimeCacheRow(table, data)),
          registerMessageGroupService: stryMutAct_9fa48("16731") ? () => undefined : (stryCov_9fa48("16731"), (gId, rId, svc, opts) => this.registerMessageGroupService(gId, rId, svc, opts))
        })
      })); // Join message group phase (extracted helper)
      this.joinMessageGroupRuntimeOwner = new JoinMessageGroupRuntimeOwner(stryMutAct_9fa48("16732") ? {} : (stryCov_9fa48("16732"), {
        nodeId: this.nodeId,
        delegates: stryMutAct_9fa48("16733") ? {} : (stryCov_9fa48("16733"), {
          getLogger: stryMutAct_9fa48("16734") ? () => undefined : (stryCov_9fa48("16734"), () => this.logger),
          getMessageRouter: stryMutAct_9fa48("16735") ? () => undefined : (stryCov_9fa48("16735"), () => this.messageRouter),
          getMessageGroupServices: stryMutAct_9fa48("16736") ? () => undefined : (stryCov_9fa48("16736"), () => this.messageGroupServices),
          getBootstrapResponse: stryMutAct_9fa48("16737") ? () => undefined : (stryCov_9fa48("16737"), () => this.bootstrapResponse),
          queueJoinServiceReplica: stryMutAct_9fa48("16738") ? () => undefined : (stryCov_9fa48("16738"), (desc, opts) => this.queueJoinServiceReplica(desc, opts)),
          createJoinServiceDescriptor: stryMutAct_9fa48("16739") ? () => undefined : (stryCov_9fa48("16739"), (type, id) => this.createJoinServiceDescriptor(type, id)),
          triggerJoinReconciler: stryMutAct_9fa48("16740") ? () => undefined : (stryCov_9fa48("16740"), reason => this.triggerJoinReconciler(reason)),
          registerMessageGroupService: stryMutAct_9fa48("16741") ? () => undefined : (stryCov_9fa48("16741"), (gId, rId, svc, opts) => this.registerMessageGroupService(gId, rId, svc, opts))
        })
      })); // Error tracking
      this.lastError = null; // Tracks join phases completed before JOINING state for
      // retroactive sub-phase application (D5.1, Req 4.1).
      this._completedJoinPhases = stryMutAct_9fa48("16742") ? ["Stryker was here"] : (stryCov_9fa48("16742"), []);
      this.startupServiceLifecycleOwner = new StartupServiceLifecycleOwner(stryMutAct_9fa48("16743") ? {} : (stryCov_9fa48("16743"), {
        reconcilerRequiredError: NODE_JOINING_SERVICE_LITERAL.JOIN_RECONCILER_MUST_BE_INITIALIZED_BEFORE_RECONCILIATION,
        delegates: stryMutAct_9fa48("16744") ? {} : (stryCov_9fa48("16744"), {
          getNodeId: stryMutAct_9fa48("16745") ? () => undefined : (stryCov_9fa48("16745"), () => this.nodeId),
          getPhase: stryMutAct_9fa48("16746") ? () => undefined : (stryCov_9fa48("16746"), () => this.phase),
          getServiceLifecycleManager: stryMutAct_9fa48("16747") ? () => undefined : (stryCov_9fa48("16747"), () => this.serviceLifecycleManager),
          setServiceLifecycleManager: value => {
            if (stryMutAct_9fa48("16748")) {
              {}
            } else {
              stryCov_9fa48("16748");
              this.serviceLifecycleManager = value;
            }
          },
          getServiceReconciler: stryMutAct_9fa48("16749") ? () => undefined : (stryCov_9fa48("16749"), () => this.serviceReconciler),
          setServiceReconciler: value => {
            if (stryMutAct_9fa48("16750")) {
              {}
            } else {
              stryCov_9fa48("16750");
              this.serviceReconciler = value;
            }
          },
          createMessageGroupReplica: stryMutAct_9fa48("16751") ? () => undefined : (stryCov_9fa48("16751"), context => this.createJoinMessageGroupReplica(context)),
          startMessageGroupReplica: stryMutAct_9fa48("16752") ? () => undefined : (stryCov_9fa48("16752"), (replicaHandle, context) => this.startJoinMessageGroupReplica(replicaHandle, context)),
          stopMessageGroupReplica: stryMutAct_9fa48("16753") ? () => undefined : (stryCov_9fa48("16753"), (replicaHandle, context) => this.stopJoinMessageGroupReplica(replicaHandle, context)),
          createPartitionReplica: stryMutAct_9fa48("16754") ? () => undefined : (stryCov_9fa48("16754"), context => this.createJoinPartitionReplica(context)),
          startPartitionReplica: stryMutAct_9fa48("16755") ? () => undefined : (stryCov_9fa48("16755"), (replicaHandle, context) => this.startJoinPartitionReplica(replicaHandle, context)),
          stopPartitionReplica: stryMutAct_9fa48("16756") ? () => undefined : (stryCov_9fa48("16756"), (replicaHandle, context) => this.stopJoinPartitionReplica(replicaHandle, context)),
          getServiceRuntimeLifecycle: stryMutAct_9fa48("16757") ? () => undefined : (stryCov_9fa48("16757"), () => this.serviceRuntimeLifecycle),
          readDesiredState: stryMutAct_9fa48("16758") ? () => undefined : (stryCov_9fa48("16758"), () => stryMutAct_9fa48("16759") ? [] : (stryCov_9fa48("16759"), [...this.joinDesiredServiceDefinitions.values()])),
          readActualState: stryMutAct_9fa48("16760") ? () => undefined : (stryCov_9fa48("16760"), () => this.buildJoinActualStateRows()),
          getCheckIntervalMs: stryMutAct_9fa48("16761") ? () => undefined : (stryCov_9fa48("16761"), () => JOINING_UNIFIED_RECONCILE.CHECK_INTERVAL_MS),
          clearDesiredState: () => {
            if (stryMutAct_9fa48("16762")) {
              {}
            } else {
              stryCov_9fa48("16762");
              this.joinDesiredServiceDefinitions.clear();
              this.joinReplicaOptionsByServiceId.clear();
              this.joinMessageGroupReplicas = stryMutAct_9fa48("16763") ? ["Stryker was here"] : (stryCov_9fa48("16763"), []);
            }
          }
        })
      }));
      this.runtimeSurfaceOwner = new StartupRuntimeSurfaceOwner(stryMutAct_9fa48("16764") ? {} : (stryCov_9fa48("16764"), {
        delegates: stryMutAct_9fa48("16765") ? {} : (stryCov_9fa48("16765"), {
          getNodeId: stryMutAct_9fa48("16766") ? () => undefined : (stryCov_9fa48("16766"), () => this.nodeId),
          getOwner: stryMutAct_9fa48("16767") ? () => undefined : (stryCov_9fa48("16767"), () => this),
          getOnLocalAdminRuntimeReady: stryMutAct_9fa48("16768") ? () => undefined : (stryCov_9fa48("16768"), () => this.onLocalAdminRuntimeReady),
          getLocalAdminRuntimeReadyNotified: stryMutAct_9fa48("16769") ? () => undefined : (stryCov_9fa48("16769"), () => this.localAdminRuntimeReadyNotified),
          setLocalAdminRuntimeReadyNotified: value => {
            if (stryMutAct_9fa48("16770")) {
              {}
            } else {
              stryCov_9fa48("16770");
              this.localAdminRuntimeReadyNotified = value;
            }
          },
          getSystemTableCache: stryMutAct_9fa48("16771") ? () => undefined : (stryCov_9fa48("16771"), () => NodeService.getInstance().getSystemTableCache()),
          getCacheMutationTarget: stryMutAct_9fa48("16772") ? () => undefined : (stryCov_9fa48("16772"), () => NodeService.getInstance().getSystemTableCache()),
          getMessageRouter: stryMutAct_9fa48("16773") ? () => undefined : (stryCov_9fa48("16773"), () => this.messageRouter),
          getPartitionServices: stryMutAct_9fa48("16774") ? () => undefined : (stryCov_9fa48("16774"), () => this.partitionServices),
          getMessageGroupServices: stryMutAct_9fa48("16775") ? () => undefined : (stryCov_9fa48("16775"), () => this.messageGroupServices),
          getTablePolicyService: stryMutAct_9fa48("16776") ? () => undefined : (stryCov_9fa48("16776"), () => this.tablePolicyService),
          getRebalanceCoordinator: stryMutAct_9fa48("16777") ? () => undefined : (stryCov_9fa48("16777"), () => this.rebalanceCoordinator)
        })
      }));
    }
  } /**
    * Build concern-scoped delegate bundles for join bootstrap (D2.2).
    *
    * Splits the monolithic join delegate surface into four bundles:
    * - phaseExecution: core accessors, service collections, lifecycle
    *   owners, and phase helper callbacks needed during phase execution
    * - readiness: lifecycle state machine and readiness state accessors
    * - cleanup: resource teardown helpers and state mutators for cleanup
    * - runtimeWiring: post-phase wiring accessors for runtime owners
    *
    * @return {Object} Keyed by JOIN_DELEGATE_BUNDLE concern names.
    */
  _buildJoinDelegateBundles() {
    if (stryMutAct_9fa48("16778")) {
      {}
    } else {
      stryCov_9fa48("16778");
      return stryMutAct_9fa48("16779") ? {} : (stryCov_9fa48("16779"), {
        [JOIN_DELEGATE_BUNDLE.PHASE_EXECUTION]: this._buildJoinPhaseExecutionDelegates(),
        [JOIN_DELEGATE_BUNDLE.READINESS]: this._buildJoinReadinessDelegates(),
        [JOIN_DELEGATE_BUNDLE.CLEANUP]: this._buildJoinCleanupDelegates(),
        [JOIN_DELEGATE_BUNDLE.RUNTIME_WIRING]: this._buildJoinRuntimeWiringDelegates()
      });
    }
  } /**
    * Compose join delegates from bundles for a specific consumer.
    *
    * @param {Object} bundles - Output of _buildJoinDelegateBundles().
    * @param {Object} [options={}] - Composition options.
    * @param {boolean} [options.cleanupOnly=false] - When true, returns
    *   only cleanup + readiness delegates (for JoinCleanupHandler).
    * @return {Object} Merged delegate map.
    */
  _composeJoinDelegates(bundles, options = {}) {
    if (stryMutAct_9fa48("16780")) {
      {}
    } else {
      stryCov_9fa48("16780");
      if (stryMutAct_9fa48("16782") ? false : stryMutAct_9fa48("16781") ? true : (stryCov_9fa48("16781", "16782"), options.cleanupOnly)) {
        if (stryMutAct_9fa48("16783")) {
          {}
        } else {
          stryCov_9fa48("16783");
          return stryMutAct_9fa48("16784") ? {} : (stryCov_9fa48("16784"), {
            ...bundles[JOIN_DELEGATE_BUNDLE.CLEANUP],
            ...bundles[JOIN_DELEGATE_BUNDLE.READINESS]
          });
        }
      }
      return stryMutAct_9fa48("16785") ? {} : (stryCov_9fa48("16785"), {
        ...bundles[JOIN_DELEGATE_BUNDLE.PHASE_EXECUTION],
        ...bundles[JOIN_DELEGATE_BUNDLE.READINESS],
        ...bundles[JOIN_DELEGATE_BUNDLE.CLEANUP],
        ...bundles[JOIN_DELEGATE_BUNDLE.RUNTIME_WIRING]
      });
    }
  } /**
    * Phase execution delegates for join bootstrap.
    * Core accessors, service collections, lifecycle owners, and
    * phase helper callbacks needed during phase execution.
    * @return {Object} Phase execution delegate map.
    * @private
    */
  _buildJoinPhaseExecutionDelegates() {
    if (stryMutAct_9fa48("16786")) {
      {}
    } else {
      stryCov_9fa48("16786");
      const self = this;
      return stryMutAct_9fa48("16787") ? {} : (stryCov_9fa48("16787"), {
        // -- Core accessors --
        getNodeId: stryMutAct_9fa48("16788") ? () => undefined : (stryCov_9fa48("16788"), () => self.nodeId),
        getNodeAddress: stryMutAct_9fa48("16789") ? () => undefined : (stryCov_9fa48("16789"), () => self.nodeAddress),
        getAdvertisedNodeWsAddress: stryMutAct_9fa48("16790") ? () => undefined : (stryCov_9fa48("16790"), () => self.advertisedNodeWsAddress),
        getWsPort: stryMutAct_9fa48("16791") ? () => undefined : (stryCov_9fa48("16791"), () => stryMutAct_9fa48("16792") ? self.wsPort && self.config.wsPort : (stryCov_9fa48("16792"), self.wsPort ?? self.config.wsPort)),
        getConfig: stryMutAct_9fa48("16793") ? () => undefined : (stryCov_9fa48("16793"), () => self.config),
        getLogger: stryMutAct_9fa48("16794") ? () => undefined : (stryCov_9fa48("16794"), () => self.logger),
        getNow: stryMutAct_9fa48("16795") ? () => undefined : (stryCov_9fa48("16795"), () => self.now),
        getSleep: stryMutAct_9fa48("16796") ? () => undefined : (stryCov_9fa48("16796"), () => self.sleep),
        getRandom: stryMutAct_9fa48("16797") ? () => undefined : (stryCov_9fa48("16797"), () => self.random),
        getPhase: stryMutAct_9fa48("16798") ? () => undefined : (stryCov_9fa48("16798"), () => self.phase),
        getStartTime: stryMutAct_9fa48("16799") ? () => undefined : (stryCov_9fa48("16799"), () => self.startTime),
        getHttpPostImpl: stryMutAct_9fa48("16800") ? () => undefined : (stryCov_9fa48("16800"), () => self.httpPostImpl),
        // -- Service collections --
        getMessageRouter: stryMutAct_9fa48("16801") ? () => undefined : (stryCov_9fa48("16801"), () => self.messageRouter),
        getTransport: stryMutAct_9fa48("16802") ? () => undefined : (stryCov_9fa48("16802"), () => self.transport),
        getMessageGroupServices: stryMutAct_9fa48("16803") ? () => undefined : (stryCov_9fa48("16803"), () => self.messageGroupServices),
        getPartitionServices: stryMutAct_9fa48("16804") ? () => undefined : (stryCov_9fa48("16804"), () => self.partitionServices),
        getJoinMessageGroupReplicas: stryMutAct_9fa48("16805") ? () => undefined : (stryCov_9fa48("16805"), () => self.joinMessageGroupReplicas),
        // -- Bootstrap response --
        getBootstrapResponse: stryMutAct_9fa48("16806") ? () => undefined : (stryCov_9fa48("16806"), () => self.bootstrapResponse),
        setBootstrapResponse: v => {
          if (stryMutAct_9fa48("16807")) {
            {}
          } else {
            stryCov_9fa48("16807");
            self.bootstrapResponse = v;
          }
        },
        getSeedNodeAddress: stryMutAct_9fa48("16808") ? () => undefined : (stryCov_9fa48("16808"), () => self.seedNodeAddress),
        getSeedNodeId: stryMutAct_9fa48("16809") ? () => undefined : (stryCov_9fa48("16809"), () => self.seedNodeId),
        setSeedNodeId: v => {
          if (stryMutAct_9fa48("16810")) {
            {}
          } else {
            stryCov_9fa48("16810");
            self.seedNodeId = v;
          }
        },
        getSeedNodeWsAddress: stryMutAct_9fa48("16811") ? () => undefined : (stryCov_9fa48("16811"), () => self.seedNodeWsAddress),
        setSeedNodeWsAddress: v => {
          if (stryMutAct_9fa48("16812")) {
            {}
          } else {
            stryCov_9fa48("16812");
            self.seedNodeWsAddress = v;
          }
        },
        // -- State mutators --
        setMessageRouter: v => {
          if (stryMutAct_9fa48("16813")) {
            {}
          } else {
            stryCov_9fa48("16813");
            self.messageRouter = v;
          }
        },
        setTransport: v => {
          if (stryMutAct_9fa48("16814")) {
            {}
          } else {
            stryCov_9fa48("16814");
            self.transport = v;
          }
        },
        pushJoinMessageGroupReplica: replica => {
          if (stryMutAct_9fa48("16815")) {
            {}
          } else {
            stryCov_9fa48("16815");
            self.joinMessageGroupReplicas.push(replica);
          }
        },
        removeJoinMessageGroupReplica: replica => {
          if (stryMutAct_9fa48("16816")) {
            {}
          } else {
            stryCov_9fa48("16816");
            self.joinMessageGroupReplicas = stryMutAct_9fa48("16817") ? self.joinMessageGroupReplicas : (stryCov_9fa48("16817"), self.joinMessageGroupReplicas.filter(stryMutAct_9fa48("16818") ? () => undefined : (stryCov_9fa48("16818"), s => stryMutAct_9fa48("16821") ? s === replica : stryMutAct_9fa48("16820") ? false : stryMutAct_9fa48("16819") ? true : (stryCov_9fa48("16819", "16820", "16821"), s !== replica))));
          }
        },
        resetJoinMessageGroupReplicas: () => {
          if (stryMutAct_9fa48("16822")) {
            {}
          } else {
            stryCov_9fa48("16822");
            self.joinMessageGroupReplicas = stryMutAct_9fa48("16823") ? ["Stryker was here"] : (stryCov_9fa48("16823"), []);
          }
        },
        // -- Phase helper callbacks (D2.3: direct owner invocation) --
        resolveJoinReplicaOptions: stryMutAct_9fa48("16824") ? () => undefined : (stryCov_9fa48("16824"), (id, type) => self.resolveJoinReplicaOptions(id, type)),
        assertReplicaStartupOwnership: stryMutAct_9fa48("16825") ? () => undefined : (stryCov_9fa48("16825"), id => self.assertReplicaStartupOwnership(id)),
        queueJoinServiceReplica: stryMutAct_9fa48("16826") ? () => undefined : (stryCov_9fa48("16826"), (desc, opts) => self.queueJoinServiceReplica(desc, opts)),
        createJoinServiceDescriptor: stryMutAct_9fa48("16827") ? () => undefined : (stryCov_9fa48("16827"), (type, id) => self.createJoinServiceDescriptor(type, id)),
        triggerJoinReconciler: stryMutAct_9fa48("16828") ? () => undefined : (stryCov_9fa48("16828"), reason => self.triggerJoinReconciler(reason)),
        resolveJoinRetryPolicy: stryMutAct_9fa48("16829") ? () => undefined : (stryCov_9fa48("16829"), () => self.resolveJoinRetryPolicy()),
        classifySeedContactFailure: stryMutAct_9fa48("16830") ? () => undefined : (stryCov_9fa48("16830"), (err, msg) => self.classifySeedContactFailure(err, msg)),
        computeSeedContactRetryDelayMs: stryMutAct_9fa48("16831") ? () => undefined : (stryCov_9fa48("16831"), opts => self.computeSeedContactRetryDelayMs(opts)),
        upsertSystemTableRow: stryMutAct_9fa48("16832") ? () => undefined : (stryCov_9fa48("16832"), (table, data) => self.upsertSystemTableRow(table, data)),
        registerMessageGroupService: stryMutAct_9fa48("16833") ? () => undefined : (stryCov_9fa48("16833"), (gId, rId, svc, opts) => self.registerMessageGroupService(gId, rId, svc, opts)),
        getIdentifyPayload: stryMutAct_9fa48("16834") ? () => undefined : (stryCov_9fa48("16834"), () => self.getIdentifyBootstrapPayload()),
        getNodeCapabilities: stryMutAct_9fa48("16835") ? () => undefined : (stryCov_9fa48("16835"), () => self.getNodeCapabilities()),
        getLeaderMessageGroupService: stryMutAct_9fa48("16836") ? () => undefined : (stryCov_9fa48("16836"), () => self.getLeaderMessageGroupService()),
        initializeJoiningLifecycleOwners: stryMutAct_9fa48("16837") ? () => undefined : (stryCov_9fa48("16837"), () => self.initializeJoiningLifecycleOwners()),
        ensureBootstrapSnapshotHydrated: async () => {
          if (stryMutAct_9fa48("16838")) {
            {}
          } else {
            stryCov_9fa48("16838");
            if (stryMutAct_9fa48("16840") ? false : stryMutAct_9fa48("16839") ? true : (stryCov_9fa48("16839", "16840"), self.systemCacheHydrated)) {
              if (stryMutAct_9fa48("16841")) {
                {}
              } else {
                stryCov_9fa48("16841");
                return;
              }
            }
            await self.hydrateSystemCacheFromBootstrap();
            self.systemCacheHydrated = stryMutAct_9fa48("16842") ? false : (stryCov_9fa48("16842"), true);
          }
        },
        sendControlPlaneNodeStateUpdate: stryMutAct_9fa48("16843") ? () => undefined : (stryCov_9fa48("16843"), opts => self.sendControlPlaneNodeStateUpdate(opts)),
        shouldRetryControlPlaneNodeStateUpdate: stryMutAct_9fa48("16844") ? () => undefined : (stryCov_9fa48("16844"), error => self.shouldRetryControlPlaneNodeStateUpdate(error)),
        resolveMeshConnectivityNodeRows: stryMutAct_9fa48("16845") ? () => undefined : (stryCov_9fa48("16845"), () => self.joinReadinessEvaluator.resolveMeshConnectivityNodeRows()),
        buildClusterMeshSignature: stryMutAct_9fa48("16846") ? () => undefined : (stryCov_9fa48("16846"), rows => self.joinReadinessEvaluator.buildClusterMeshSignature(rows)),
        setLastClusterMeshSignature: sig => {
          if (stryMutAct_9fa48("16847")) {
            {}
          } else {
            stryCov_9fa48("16847");
            self.joinReadinessEvaluator.lastClusterMeshSignature = sig;
          }
        },
        hasMessageGroupLeaderInCache: stryMutAct_9fa48("16848") ? () => undefined : (stryCov_9fa48("16848"), cache => self.hasMessageGroupLeaderInCache(cache)),
        getMessageGroupServicesSize: stryMutAct_9fa48("16849") ? () => undefined : (stryCov_9fa48("16849"), () => self.messageGroupServices.size),
        emit: stryMutAct_9fa48("16850") ? () => undefined : (stryCov_9fa48("16850"), (event, data) => self.emit(event, data))
      });
    }
  } /**
    * Readiness delegates for join bootstrap.
    * Lifecycle state machine and readiness state accessors.
    * @return {Object} Readiness delegate map.
    * @private
    */
  _buildJoinReadinessDelegates() {
    if (stryMutAct_9fa48("16851")) {
      {}
    } else {
      stryCov_9fa48("16851");
      const self = this;
      return stryMutAct_9fa48("16852") ? {} : (stryCov_9fa48("16852"), {
        getLifecycleStateMachine: stryMutAct_9fa48("16853") ? () => undefined : (stryCov_9fa48("16853"), () => self.lifecycleStateMachine),
        getBootstrapReadinessState: stryMutAct_9fa48("16854") ? () => undefined : (stryCov_9fa48("16854"), () => self.bootstrapReadinessState)
      });
    }
  } /**
    * Cleanup delegates for join bootstrap.
    * Resource teardown helpers and state mutators for cleanup.
    * @return {Object} Cleanup delegate map.
    * @private
    */
  _buildJoinCleanupDelegates() {
    if (stryMutAct_9fa48("16855")) {
      {}
    } else {
      stryCov_9fa48("16855");
      const self = this;
      return stryMutAct_9fa48("16856") ? {} : (stryCov_9fa48("16856"), {
        // -- Core accessors needed for cleanup diagnostics --
        getNodeId: stryMutAct_9fa48("16857") ? () => undefined : (stryCov_9fa48("16857"), () => self.nodeId),
        getLogger: stryMutAct_9fa48("16858") ? () => undefined : (stryCov_9fa48("16858"), () => self.logger),
        getNow: stryMutAct_9fa48("16859") ? () => undefined : (stryCov_9fa48("16859"), () => self.now),
        getPhase: stryMutAct_9fa48("16860") ? () => undefined : (stryCov_9fa48("16860"), () => self.phase),
        getStartTime: stryMutAct_9fa48("16861") ? () => undefined : (stryCov_9fa48("16861"), () => self.startTime),
        // -- Service collections --
        getMessageGroupServices: stryMutAct_9fa48("16862") ? () => undefined : (stryCov_9fa48("16862"), () => self.messageGroupServices),
        getPartitionServices: stryMutAct_9fa48("16863") ? () => undefined : (stryCov_9fa48("16863"), () => self.partitionServices),
        getMessageRouter: stryMutAct_9fa48("16864") ? () => undefined : (stryCov_9fa48("16864"), () => self.messageRouter),
        getTransport: stryMutAct_9fa48("16865") ? () => undefined : (stryCov_9fa48("16865"), () => self.transport),
        getBootstrapResponse: stryMutAct_9fa48("16866") ? () => undefined : (stryCov_9fa48("16866"), () => self.bootstrapResponse),
        // -- State mutators --
        setPhase: p => {
          if (stryMutAct_9fa48("16867")) {
            {}
          } else {
            stryCov_9fa48("16867");
            self.phase = p;
          }
        },
        setLastError: e => {
          if (stryMutAct_9fa48("16868")) {
            {}
          } else {
            stryCov_9fa48("16868");
            self.lastError = e;
          }
        },
        getLastError: stryMutAct_9fa48("16869") ? () => undefined : (stryCov_9fa48("16869"), () => self.lastError),
        setTransport: v => {
          if (stryMutAct_9fa48("16870")) {
            {}
          } else {
            stryCov_9fa48("16870");
            self.transport = v;
          }
        },
        setMessageRouter: v => {
          if (stryMutAct_9fa48("16871")) {
            {}
          } else {
            stryCov_9fa48("16871");
            self.messageRouter = v;
          }
        },
        // -- Membership state --
        getRegisteredJoinNodeId: () => {
          if (stryMutAct_9fa48("16872")) {
            {}
          } else {
            stryCov_9fa48("16872");
            const systemTableCache = NodeService.getInstance().getSystemTableCache();
            const nodeRow = stryMutAct_9fa48("16874") ? systemTableCache.get?.(TABLES.NODES, self.nodeId) : stryMutAct_9fa48("16873") ? systemTableCache?.get(TABLES.NODES, self.nodeId) : (stryCov_9fa48("16873", "16874"), systemTableCache?.get?.(TABLES.NODES, self.nodeId));
            return nodeRow ? self.nodeId : null;
          }
        },
        getJoinLifecycleIntentType: stryMutAct_9fa48("16875") ? () => undefined : (stryCov_9fa48("16875"), () => resolveMembershipJoinIntentType(self.startupMode)),
        // -- Resource teardown helpers --
        getCdcIntegrationService: stryMutAct_9fa48("16876") ? () => undefined : (stryCov_9fa48("16876"), () => self.cdcIntegrationService),
        setCdcIntegrationService: v => {
          if (stryMutAct_9fa48("16877")) {
            {}
          } else {
            stryCov_9fa48("16877");
            self.cdcIntegrationService = v;
          }
        },
        getRebalanceCoordinator: stryMutAct_9fa48("16878") ? () => undefined : (stryCov_9fa48("16878"), () => self.rebalanceCoordinator),
        setRebalanceCoordinator: v => {
          if (stryMutAct_9fa48("16879")) {
            {}
          } else {
            stryCov_9fa48("16879");
            self.rebalanceCoordinator = v;
          }
        },
        getLatencyTopology: stryMutAct_9fa48("16880") ? () => undefined : (stryCov_9fa48("16880"), () => self.latencyTopology),
        setLatencyTopology: v => {
          if (stryMutAct_9fa48("16881")) {
            {}
          } else {
            stryCov_9fa48("16881");
            self.latencyTopology = v;
          }
        },
        getReplicaStateMachine: stryMutAct_9fa48("16882") ? () => undefined : (stryCov_9fa48("16882"), () => self.replicaStateMachine),
        setReplicaStateMachine: v => {
          if (stryMutAct_9fa48("16883")) {
            {}
          } else {
            stryCov_9fa48("16883");
            self.replicaStateMachine = v;
          }
        },
        getRpcClient: stryMutAct_9fa48("16884") ? () => undefined : (stryCov_9fa48("16884"), () => self.rpcClient),
        setRpcClient: v => {
          if (stryMutAct_9fa48("16885")) {
            {}
          } else {
            stryCov_9fa48("16885");
            self.rpcClient = v;
          }
        },
        getHeartbeatService: stryMutAct_9fa48("16886") ? () => undefined : (stryCov_9fa48("16886"), () => self.heartbeatService),
        setHeartbeatService: v => {
          if (stryMutAct_9fa48("16887")) {
            {}
          } else {
            stryCov_9fa48("16887");
            self.heartbeatService = v;
          }
        },
        getLeaseService: stryMutAct_9fa48("16888") ? () => undefined : (stryCov_9fa48("16888"), () => self.leaseService),
        setLeaseService: v => {
          if (stryMutAct_9fa48("16889")) {
            {}
          } else {
            stryCov_9fa48("16889");
            self.leaseService = v;
          }
        },
        getEndpointService: stryMutAct_9fa48("16890") ? () => undefined : (stryCov_9fa48("16890"), () => self.endpointService),
        setEndpointService: v => {
          if (stryMutAct_9fa48("16891")) {
            {}
          } else {
            stryCov_9fa48("16891");
            self.endpointService = v;
          }
        },
        getDispatchService: stryMutAct_9fa48("16892") ? () => undefined : (stryCov_9fa48("16892"), () => self.dispatchService),
        setDispatchService: v => {
          if (stryMutAct_9fa48("16893")) {
            {}
          } else {
            stryCov_9fa48("16893");
            self.dispatchService = v;
          }
        },
        getReplicaHandler: stryMutAct_9fa48("16894") ? () => undefined : (stryCov_9fa48("16894"), () => self.replicaHandler),
        setReplicaHandler: v => {
          if (stryMutAct_9fa48("16895")) {
            {}
          } else {
            stryCov_9fa48("16895");
            self.replicaHandler = v;
          }
        },
        sendControlPlaneNodeStateUpdate: stryMutAct_9fa48("16896") ? () => undefined : (stryCov_9fa48("16896"), options => self.sendControlPlaneNodeStateUpdate(options)),
        stopJoiningLifecycleOwners: stryMutAct_9fa48("16897") ? () => undefined : (stryCov_9fa48("16897"), () => self.stopJoiningLifecycleOwners()),
        emit: stryMutAct_9fa48("16898") ? () => undefined : (stryCov_9fa48("16898"), (event, data) => self.emit(event, data))
      });
    }
  } /**
    * Runtime wiring delegates for join bootstrap.
    * Post-phase wiring accessors for runtime owners.
    * @return {Object} Runtime wiring delegate map.
    * @private
    */
  _buildJoinRuntimeWiringDelegates() {
    if (stryMutAct_9fa48("16899")) {
      {}
    } else {
      stryCov_9fa48("16899");
      const self = this;
      return stryMutAct_9fa48("16900") ? {} : (stryCov_9fa48("16900"), {
        getSystemTableCache: stryMutAct_9fa48("16901") ? () => undefined : (stryCov_9fa48("16901"), () => NodeService.getInstance().getSystemTableCache()),
        getMessageRouter: stryMutAct_9fa48("16902") ? () => undefined : (stryCov_9fa48("16902"), () => self.messageRouter),
        getRebalanceCoordinator: stryMutAct_9fa48("16903") ? () => undefined : (stryCov_9fa48("16903"), () => self.rebalanceCoordinator),
        getCdcIntegrationService: stryMutAct_9fa48("16904") ? () => undefined : (stryCov_9fa48("16904"), () => self.cdcIntegrationService)
      });
    }
  } /**
    * Execute checkpointed join infrastructure setup after the seed contact
    * step has completed.
    * @param {StartupPipelineRunner} startupPipelineRunner
    * @param {Object} joinPlan
    * @return {Promise<void>}
    * @private
    */
  async runJoinInfrastructurePhases(startupPipelineRunner, joinPlan) {
    if (stryMutAct_9fa48("16905")) {
      {}
    } else {
      stryCov_9fa48("16905");
      const infraPhases = joinPlan.segments[JOIN_PLAN_SEGMENT.INFRASTRUCTURE];
      await startupPipelineRunner.run(stryMutAct_9fa48("16906") ? {} : (stryCov_9fa48("16906"), {
        phases: stryMutAct_9fa48("16907") ? infraPhases : (stryCov_9fa48("16907"), infraPhases.slice(NUM.ZERO, NUM.ONE))
      }));
      this.lifecycleStateMachine.transition(NodeState.DISCOVERING);
      await startupPipelineRunner.run(stryMutAct_9fa48("16908") ? {} : (stryCov_9fa48("16908"), {
        phases: stryMutAct_9fa48("16909") ? infraPhases : (stryCov_9fa48("16909"), infraPhases.slice(NUM.ONE))
      }));
      await this.initializeJoinInfrastructure();
      await this.notifyLocalAdminRuntimeReady();
      this.lifecycleStateMachine.transition(NodeState.JOINING);
      this._applyDeferredJoinSubPhases();
    }
  } /**
    * Apply sub-phase transitions for join phases that completed
    * before the lifecycle state machine reached JOINING state.
    * Walks through deferred phases in order so the sub-phase chain
    * is consistent with the declarative map (D5.1, Req 4.1, 4.4).
    * @private
    */
  _applyDeferredJoinSubPhases() {
    if (stryMutAct_9fa48("16910")) {
      {}
    } else {
      stryCov_9fa48("16910");
      for (const phaseName of this._completedJoinPhases) {
        if (stryMutAct_9fa48("16911")) {
          {}
        } else {
          stryCov_9fa48("16911");
          const subPhase = JOINING_PHASE_TO_SUB_PHASE[phaseName];
          if (stryMutAct_9fa48("16913") ? false : stryMutAct_9fa48("16912") ? true : (stryCov_9fa48("16912", "16913"), subPhase)) {
            if (stryMutAct_9fa48("16914")) {
              {}
            } else {
              stryCov_9fa48("16914");
              this.lifecycleStateMachine.transitionSubPhase(subPhase);
            }
          }
        }
      }
      this._completedJoinPhases = stryMutAct_9fa48("16915") ? ["Stryker was here"] : (stryCov_9fa48("16915"), []);
    }
  } /**
    * Initialize join-owned infrastructure after message-group establishment.
    * @return {Promise<void>}
    * @private
    */
  async initializeJoinInfrastructure() {
    if (stryMutAct_9fa48("16916")) {
      {}
    } else {
      stryCov_9fa48("16916");
      // Initialize ReplicaHandler BEFORE registering node in cluster
      // because node registration can trigger CREATE_REPLICA traffic.
      if (stryMutAct_9fa48("16919") ? false : stryMutAct_9fa48("16918") ? true : stryMutAct_9fa48("16917") ? this.rpcClient : (stryCov_9fa48("16917", "16918", "16919"), !this.rpcClient)) {
        if (stryMutAct_9fa48("16920")) {
          {}
        } else {
          stryCov_9fa48("16920");
          const leaderMessageGroup = assertCritical(this.getLeaderMessageGroupService(), JOINING_ERROR_MSG.MESSAGE_GROUP_LEADER_REQUIRED);
          this.rpcClient = new RPCClient(stryMutAct_9fa48("16921") ? {} : (stryCov_9fa48("16921"), {
            messageGroupService: leaderMessageGroup
          }));
        }
      }
      this.createCdcIntegrationService();
      this.ensureLatencyTopologyOwners();
      this.initializeReplicaHandler();
      this.initializeMessageGroupServiceHandler();
      await this.initializeControlPlaneService();
      this.initializeRuntimeServiceHandler();
      this.openExternalTransportAdmission();
    }
  } /**
    * Open remote transport admission after join-owned runtime handlers exist.
    * Self-routing remains available earlier during bootstrap discovery.
    * @return {void}
    * @private
    */
  openExternalTransportAdmission() {
    if (stryMutAct_9fa48("16922")) {
      {}
    } else {
      stryCov_9fa48("16922");
      if (stryMutAct_9fa48("16925") ? this.messageRouter || typeof this.messageRouter.setExternalAdmissionEnabled === TYPEOF.FUNCTION : stryMutAct_9fa48("16924") ? false : stryMutAct_9fa48("16923") ? true : (stryCov_9fa48("16923", "16924", "16925"), this.messageRouter && (stryMutAct_9fa48("16927") ? typeof this.messageRouter.setExternalAdmissionEnabled !== TYPEOF.FUNCTION : stryMutAct_9fa48("16926") ? true : (stryCov_9fa48("16926", "16927"), typeof this.messageRouter.setExternalAdmissionEnabled === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("16928")) {
          {}
        } else {
          stryCov_9fa48("16928");
          this.messageRouter.setExternalAdmissionEnabled(stryMutAct_9fa48("16929") ? false : (stryCov_9fa48("16929"), true));
        }
      }
    }
  } /**
    * Notify one startup-owned hook that cache-backed local admin surfaces can
    * come online before full join publication completes.
    * @return {Promise<void>}
    * @private
    */
  async notifyLocalAdminRuntimeReady() {
    if (stryMutAct_9fa48("16930")) {
      {}
    } else {
      stryCov_9fa48("16930");
      await this.runtimeSurfaceOwner.notifyLocalAdminRuntimeReady();
    }
  } /**
    * Determine whether join-owned runtime infrastructure is already available
    * locally and can be reused for the current session.
    * @return {boolean}
    * @private
    */
  hasJoinInfrastructureReady() {
    if (stryMutAct_9fa48("16931")) {
      {}
    } else {
      stryCov_9fa48("16931");
      return Boolean(stryMutAct_9fa48("16934") ? this.bootstrapResponse && this.messageRouter && this.hasOperationalMessageGroup() && this.rpcClient && this.cdcIntegrationService || this.heartbeatService : stryMutAct_9fa48("16933") ? false : stryMutAct_9fa48("16932") ? true : (stryCov_9fa48("16932", "16933", "16934"), (stryMutAct_9fa48("16936") ? this.bootstrapResponse && this.messageRouter && this.hasOperationalMessageGroup() && this.rpcClient || this.cdcIntegrationService : stryMutAct_9fa48("16935") ? true : (stryCov_9fa48("16935", "16936"), (stryMutAct_9fa48("16938") ? this.bootstrapResponse && this.messageRouter && this.hasOperationalMessageGroup() || this.rpcClient : stryMutAct_9fa48("16937") ? true : (stryCov_9fa48("16937", "16938"), (stryMutAct_9fa48("16940") ? this.bootstrapResponse && this.messageRouter || this.hasOperationalMessageGroup() : stryMutAct_9fa48("16939") ? true : (stryCov_9fa48("16939", "16940"), (stryMutAct_9fa48("16942") ? this.bootstrapResponse || this.messageRouter : stryMutAct_9fa48("16941") ? true : (stryCov_9fa48("16941", "16942"), this.bootstrapResponse && this.messageRouter)) && this.hasOperationalMessageGroup())) && this.rpcClient)) && this.cdcIntegrationService)) && this.heartbeatService));
    }
  } /**
    * Complete successful join finalization and emit the completion event.
    * @return {void}
    * @private
    */
  completeSuccessfulJoin() {
    if (stryMutAct_9fa48("16943")) {
      {}
    } else {
      stryCov_9fa48("16943");
      this.lifecycleStateMachine.transition(NodeState.READY);
      for (const messageGroupService of this.messageGroupServices.values()) {
        if (stryMutAct_9fa48("16944")) {
          {}
        } else {
          stryCov_9fa48("16944");
          if (stryMutAct_9fa48("16947") ? typeof messageGroupService?.completeJoinConvergence !== TYPEOF.FUNCTION : stryMutAct_9fa48("16946") ? false : stryMutAct_9fa48("16945") ? true : (stryCov_9fa48("16945", "16946", "16947"), typeof (stryMutAct_9fa48("16948") ? messageGroupService.completeJoinConvergence : (stryCov_9fa48("16948"), messageGroupService?.completeJoinConvergence)) === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("16949")) {
              {}
            } else {
              stryCov_9fa48("16949");
              messageGroupService.completeJoinConvergence();
            }
          }
        }
      }
      activateSteadyStateRuntimeHandoff(stryMutAct_9fa48("16950") ? {} : (stryCov_9fa48("16950"), {
        owner: this.runtimeHandoffOwner,
        activateControlPlaneBackgroundWriters: stryMutAct_9fa48("16951") ? false : (stryCov_9fa48("16951"), true),
        flushDeferredCreateSelfHostedMetadata: stryMutAct_9fa48("16952") ? false : (stryCov_9fa48("16952"), true),
        activateDistributedTransactionRecovery: stryMutAct_9fa48("16953") ? false : (stryCov_9fa48("16953"), true),
        startLatencyTopologyLifecycle: stryMutAct_9fa48("16954") ? false : (stryCov_9fa48("16954"), true)
      }));
      this.phase = JoiningPhase.COMPLETE;
      const duration = stryMutAct_9fa48("16955") ? this.now() + this.startTime : (stryCov_9fa48("16955"), this.now() - this.startTime);
      this.logger.info(JOINING_LOG_MSG.COMPLETED, stryMutAct_9fa48("16956") ? {} : (stryCov_9fa48("16956"), {
        nodeId: this.nodeId,
        duration,
        messageGroupCount: this.messageGroupServices.size,
        lifecycleState: this.lifecycleStateMachine.getState()
      }));
      this.emit(JoiningEvent.COMPLETE, stryMutAct_9fa48("16957") ? {} : (stryCov_9fa48("16957"), {
        nodeId: this.nodeId,
        duration,
        messageGroupServices: this.messageGroupServices,
        transport: this.transport,
        messageRouter: this.messageRouter,
        lifecycleState: this.lifecycleStateMachine.getState()
      }));
    }
  } /**
    * Build checkpointed join steps for durable join progression.
    * @param {StartupPipelineRunner} startupPipelineRunner
    * @param {Object} joinPlan
    * @return {Array<Object>}
    * @private
    */
  buildJoinCheckpointSteps(startupPipelineRunner, joinPlan) {
    if (stryMutAct_9fa48("16958")) {
      {}
    } else {
      stryCov_9fa48("16958");
      return stryMutAct_9fa48("16959") ? [] : (stryCov_9fa48("16959"), [stryMutAct_9fa48("16960") ? {} : (stryCov_9fa48("16960"), {
        checkpoint: JOIN_CHECKPOINT.SEED_CONTACTED,
        phase: JOIN_SESSION_PHASE.SEED_CONTACTED,
        segment: JOIN_PLAN_SEGMENT.SEED_CONTACT,
        shouldRerun: () => {
          if (stryMutAct_9fa48("16961")) {
            {}
          } else {
            stryCov_9fa48("16961");
            return stryMutAct_9fa48("16964") ? (!this.bootstrapResponse || !this.seedNodeId) && !this.seedNodeWsAddress : stryMutAct_9fa48("16963") ? false : stryMutAct_9fa48("16962") ? true : (stryCov_9fa48("16962", "16963", "16964"), (stryMutAct_9fa48("16966") ? !this.bootstrapResponse && !this.seedNodeId : stryMutAct_9fa48("16965") ? false : (stryCov_9fa48("16965", "16966"), (stryMutAct_9fa48("16967") ? this.bootstrapResponse : (stryCov_9fa48("16967"), !this.bootstrapResponse)) || (stryMutAct_9fa48("16968") ? this.seedNodeId : (stryCov_9fa48("16968"), !this.seedNodeId)))) || (stryMutAct_9fa48("16969") ? this.seedNodeWsAddress : (stryCov_9fa48("16969"), !this.seedNodeWsAddress)));
          }
        },
        run: async () => {
          if (stryMutAct_9fa48("16970")) {
            {}
          } else {
            stryCov_9fa48("16970");
            await startupPipelineRunner.run(stryMutAct_9fa48("16971") ? {} : (stryCov_9fa48("16971"), {
              phases: joinPlan.segments[JOIN_PLAN_SEGMENT.SEED_CONTACT]
            }));
          }
        }
      }), stryMutAct_9fa48("16972") ? {} : (stryCov_9fa48("16972"), {
        checkpoint: JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
        phase: JOIN_SESSION_PHASE.INFRASTRUCTURE_READY,
        segment: JOIN_PLAN_SEGMENT.INFRASTRUCTURE,
        shouldRerun: stryMutAct_9fa48("16973") ? () => undefined : (stryCov_9fa48("16973"), () => stryMutAct_9fa48("16974") ? this.hasJoinInfrastructureReady() : (stryCov_9fa48("16974"), !this.hasJoinInfrastructureReady())),
        run: async () => {
          if (stryMutAct_9fa48("16975")) {
            {}
          } else {
            stryCov_9fa48("16975");
            await this.runJoinInfrastructurePhases(startupPipelineRunner, joinPlan);
          }
        }
      }), stryMutAct_9fa48("16976") ? {} : (stryCov_9fa48("16976"), {
        checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
        phase: JOIN_SESSION_PHASE.MEMBERSHIP_WRITTEN,
        segment: JOIN_PLAN_SEGMENT.MEMBERSHIP,
        run: async () => {
          if (stryMutAct_9fa48("16977")) {
            {}
          } else {
            stryCov_9fa48("16977");
            await startupPipelineRunner.run(stryMutAct_9fa48("16978") ? {} : (stryCov_9fa48("16978"), {
              phases: joinPlan.segments[JOIN_PLAN_SEGMENT.MEMBERSHIP]
            }));
            await this.activateMessageGroupServiceRows();
            this.startJoinOpportunisticBackfill();
          }
        }
      }), stryMutAct_9fa48("16979") ? {} : (stryCov_9fa48("16979"), {
        checkpoint: JOIN_CHECKPOINT.READY_LEASE_ASSIGNED,
        phase: JOIN_SESSION_PHASE.READY_LEASE_ASSIGNED,
        segment: JOIN_PLAN_SEGMENT.READINESS,
        run: async () => {
          if (stryMutAct_9fa48("16980")) {
            {}
          } else {
            stryCov_9fa48("16980");
            await startupPipelineRunner.run(stryMutAct_9fa48("16981") ? {} : (stryCov_9fa48("16981"), {
              phases: joinPlan.segments[JOIN_PLAN_SEGMENT.READINESS]
            }));
            await this.signalReadyForReplicas();
          }
        }
      }), stryMutAct_9fa48("16982") ? {} : (stryCov_9fa48("16982"), {
        checkpoint: JOIN_CHECKPOINT.FINALIZED,
        phase: JOIN_SESSION_PHASE.FINALIZED,
        segment: JOIN_PLAN_SEGMENT.READINESS,
        shouldRerun: () => {
          if (stryMutAct_9fa48("16983")) {
            {}
          } else {
            stryCov_9fa48("16983");
            return stryMutAct_9fa48("16986") ? (this.phase !== JoiningPhase.COMPLETE || this.lifecycleStateMachine.getState() !== NodeState.READY) && this.hasActiveControlPlaneBackgroundWriters() !== true : stryMutAct_9fa48("16985") ? false : stryMutAct_9fa48("16984") ? true : (stryCov_9fa48("16984", "16985", "16986"), (stryMutAct_9fa48("16988") ? this.phase !== JoiningPhase.COMPLETE && this.lifecycleStateMachine.getState() !== NodeState.READY : stryMutAct_9fa48("16987") ? false : (stryCov_9fa48("16987", "16988"), (stryMutAct_9fa48("16990") ? this.phase === JoiningPhase.COMPLETE : stryMutAct_9fa48("16989") ? false : (stryCov_9fa48("16989", "16990"), this.phase !== JoiningPhase.COMPLETE)) || (stryMutAct_9fa48("16992") ? this.lifecycleStateMachine.getState() === NodeState.READY : stryMutAct_9fa48("16991") ? false : (stryCov_9fa48("16991", "16992"), this.lifecycleStateMachine.getState() !== NodeState.READY)))) || (stryMutAct_9fa48("16994") ? this.hasActiveControlPlaneBackgroundWriters() === true : stryMutAct_9fa48("16993") ? false : (stryCov_9fa48("16993", "16994"), this.hasActiveControlPlaneBackgroundWriters() !== (stryMutAct_9fa48("16995") ? false : (stryCov_9fa48("16995"), true)))));
          }
        },
        run: async () => {
          if (stryMutAct_9fa48("16996")) {
            {}
          } else {
            stryCov_9fa48("16996");
            this.completeSuccessfulJoin();
          }
        }
      })]);
    }
  } /**
    * Execute the full joining process.
    * Requirements: 4.1, 4.6, 4.7, 8.1, 8.2, 8.3 - Bootstrap sequence with lifecycle states.
    * @return {Promise<Object>} Joining result.
    */
  async join() {
    if (stryMutAct_9fa48("16997")) {
      {}
    } else {
      stryCov_9fa48("16997");
      this.startTime = this.now();
      const membershipLifecycleIntent = await this.membershipLifecycleController.submitJoinIntent(stryMutAct_9fa48("16998") ? {} : (stryCov_9fa48("16998"), {
        nodeId: this.nodeId,
        joinSessionId: this.joinSessionId,
        nodeAddress: this.nodeAddress,
        seedNodeAddress: this.seedNodeAddress,
        startupMode: this.startupMode
      }));
      const membershipLifecycleIntentType = stryMutAct_9fa48("17001") ? membershipLifecycleIntent?.intentType && resolveMembershipJoinIntentType(this.startupMode) : stryMutAct_9fa48("17000") ? false : stryMutAct_9fa48("16999") ? true : (stryCov_9fa48("16999", "17000", "17001"), (stryMutAct_9fa48("17002") ? membershipLifecycleIntent.intentType : (stryCov_9fa48("17002"), membershipLifecycleIntent?.intentType)) || resolveMembershipJoinIntentType(this.startupMode));
      this.logger.info(JOINING_LOG_MSG.STARTING, stryMutAct_9fa48("17003") ? {} : (stryCov_9fa48("17003"), {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        seedNodeAddress: this.seedNodeAddress,
        lifecycleState: this.lifecycleStateMachine.getState(),
        joinSessionId: this.joinSessionId,
        membershipLifecycleIntentType
      }));
      const resumePolicy = this.resolveRetryableJoinResumePolicy();
      let attempt = NUM.ZERO;
      while (stryMutAct_9fa48("17005") ? false : stryMutAct_9fa48("17004") ? false : (stryCov_9fa48("17004", "17005"), true)) {
        if (stryMutAct_9fa48("17006")) {
          {}
        } else {
          stryCov_9fa48("17006");
          stryMutAct_9fa48("17007") ? attempt -= NUM.ONE : (stryCov_9fa48("17007"), attempt += NUM.ONE);
          this.resetLifecycleStateForRetryableResumeAttempt(attempt);
          try {
            if (stryMutAct_9fa48("17008")) {
              {}
            } else {
              stryCov_9fa48("17008");
              if (stryMutAct_9fa48("17011") ? this.lifecycleStateMachine.getState() === NodeState.CONNECTING : stryMutAct_9fa48("17010") ? false : stryMutAct_9fa48("17009") ? true : (stryCov_9fa48("17009", "17010", "17011"), this.lifecycleStateMachine.getState() !== NodeState.CONNECTING)) {
                if (stryMutAct_9fa48("17012")) {
                  {}
                } else {
                  stryCov_9fa48("17012");
                  this.lifecycleStateMachine.transition(NodeState.CONNECTING);
                }
              }
              const startupPipelineRunner = new StartupPipelineRunner(stryMutAct_9fa48("17013") ? {} : (stryCov_9fa48("17013"), {
                logger: this.logger,
                eventSink: this
              }));
              const joinPlan = createJoinStartupPlan(this);
              assertJoinPlanSegments(joinPlan);
              await this.joinCoordinator.run(stryMutAct_9fa48("17014") ? {} : (stryCov_9fa48("17014"), {
                nodeId: this.nodeId,
                sessionId: this.joinSessionId,
                steps: this.buildJoinCheckpointSteps(startupPipelineRunner, joinPlan)
              }));
              return stryMutAct_9fa48("17015") ? {} : (stryCov_9fa48("17015"), {
                success: stryMutAct_9fa48("17016") ? false : (stryCov_9fa48("17016"), true),
                nodeId: this.nodeId,
                duration: stryMutAct_9fa48("17017") ? this.now() + this.startTime : (stryCov_9fa48("17017"), this.now() - this.startTime),
                messageGroupServices: this.messageGroupServices,
                partitionServices: this.partitionServices,
                replicaHandler: this.replicaHandler,
                replicaStateMachine: this.replicaStateMachine,
                transport: this.transport,
                messageRouter: this.messageRouter,
                bootstrapResponse: this.bootstrapResponse,
                lifecycleStateMachine: this.lifecycleStateMachine
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("17018")) {
              {}
            } else {
              stryCov_9fa48("17018");
              const failureResult = await this.handleJoiningFailure(error);
              if (stryMutAct_9fa48("17021") ? false : stryMutAct_9fa48("17020") ? true : stryMutAct_9fa48("17019") ? this.shouldAutoResumeRetryableJoinFailure(error, failureResult, attempt, resumePolicy) : (stryCov_9fa48("17019", "17020", "17021"), !this.shouldAutoResumeRetryableJoinFailure(error, failureResult, attempt, resumePolicy))) {
                if (stryMutAct_9fa48("17022")) {
                  {}
                } else {
                  stryCov_9fa48("17022");
                  return failureResult;
                }
              }
              const delayMs = this.computeRetryableJoinResumeDelayMs(error, attempt, resumePolicy);
              this.logger.warn(JOINING_LOG_MSG.RETRYABLE_FAILURE_RESUMING, stryMutAct_9fa48("17023") ? {} : (stryCov_9fa48("17023"), {
                nodeId: this.nodeId,
                joinSessionId: this.joinSessionId,
                attempt,
                maxAttempts: resumePolicy.maxAttempts,
                retryAfterMs: delayMs,
                phase: failureResult.phase,
                error: failureResult.error
              }));
              await this.sleep(delayMs);
            }
          }
        }
      }
    }
  } /**
    * Retryable join-resume attempts must re-enter lifecycle transitions from a
    * valid bootstrap root state. Failed-attempt cleanup intentionally drives
    * the previous lifecycle machine to STOPPED, which is terminal by contract.
    * Reset only when resuming in-process so a retry does not fail closed on an
    * invalid STOPPED -> CONNECTING transition.
    *
    * @param {number} attempt
    * @return {void}
    */
  resetLifecycleStateForRetryableResumeAttempt(attempt) {
    if (stryMutAct_9fa48("17024")) {
      {}
    } else {
      stryCov_9fa48("17024");
      if (stryMutAct_9fa48("17028") ? attempt > NUM.ONE : stryMutAct_9fa48("17027") ? attempt < NUM.ONE : stryMutAct_9fa48("17026") ? false : stryMutAct_9fa48("17025") ? true : (stryCov_9fa48("17025", "17026", "17027", "17028"), attempt <= NUM.ONE)) {
        if (stryMutAct_9fa48("17029")) {
          {}
        } else {
          stryCov_9fa48("17029");
          return;
        }
      }
      if (stryMutAct_9fa48("17032") ? !this.lifecycleStateMachine && typeof this.lifecycleStateMachine.getState !== TYPEOF.FUNCTION : stryMutAct_9fa48("17031") ? false : stryMutAct_9fa48("17030") ? true : (stryCov_9fa48("17030", "17031", "17032"), (stryMutAct_9fa48("17033") ? this.lifecycleStateMachine : (stryCov_9fa48("17033"), !this.lifecycleStateMachine)) || (stryMutAct_9fa48("17035") ? typeof this.lifecycleStateMachine.getState === TYPEOF.FUNCTION : stryMutAct_9fa48("17034") ? false : (stryCov_9fa48("17034", "17035"), typeof this.lifecycleStateMachine.getState !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("17036")) {
          {}
        } else {
          stryCov_9fa48("17036");
          return;
        }
      }
      const currentState = this.lifecycleStateMachine.getState();
      if (stryMutAct_9fa48("17039") ? currentState === NodeState.STOPPED : stryMutAct_9fa48("17038") ? false : stryMutAct_9fa48("17037") ? true : (stryCov_9fa48("17037", "17038", "17039"), currentState !== NodeState.STOPPED)) {
        if (stryMutAct_9fa48("17040")) {
          {}
        } else {
          stryCov_9fa48("17040");
          return;
        }
      }
      this.lifecycleStateMachine = new NodeLifecycleStateMachine(stryMutAct_9fa48("17041") ? {} : (stryCov_9fa48("17041"), {
        nodeId: this.nodeId,
        initialState: NodeState.STARTING,
        now: this.now
      }));
      this._completedJoinPhases = stryMutAct_9fa48("17042") ? ["Stryker was here"] : (stryCov_9fa48("17042"), []);
      this.phase = JoiningPhase.NOT_STARTED;
      this.logger.info(JOINING_LOG_MSG.RETRYABLE_FAILURE_LIFECYCLE_RESET, stryMutAct_9fa48("17043") ? {} : (stryCov_9fa48("17043"), {
        nodeId: this.nodeId,
        joinSessionId: this.joinSessionId,
        attempt,
        previousState: currentState,
        nextState: NodeState.STARTING
      }));
    }
  }
  resolveRetryableJoinResumePolicy() {
    if (stryMutAct_9fa48("17044")) {
      {}
    } else {
      stryCov_9fa48("17044");
      const joinRetryPolicy = this.resolveJoinRetryPolicy();
      const joinHttpTimeoutMs = Number.isFinite(this.config.httpTimeoutMs) ? stryMutAct_9fa48("17045") ? Math.min(NUM.ZERO, Math.floor(this.config.httpTimeoutMs)) : (stryCov_9fa48("17045"), Math.max(NUM.ZERO, Math.floor(this.config.httpTimeoutMs))) : JOINING_DEFAULT.httpTimeoutMs;
      const minimumMaxElapsedMs = stryMutAct_9fa48("17046") ? Math.min(NUM.ZERO, joinRetryPolicy.retryTimeoutMs + joinHttpTimeoutMs) : (stryCov_9fa48("17046"), Math.max(NUM.ZERO, stryMutAct_9fa48("17047") ? joinRetryPolicy.retryTimeoutMs - joinHttpTimeoutMs : (stryCov_9fa48("17047"), joinRetryPolicy.retryTimeoutMs + joinHttpTimeoutMs)));
      return stryMutAct_9fa48("17048") ? {} : (stryCov_9fa48("17048"), {
        enabled: stryMutAct_9fa48("17051") ? this.config.autoResumeRetryableFailures !== true : stryMutAct_9fa48("17050") ? false : stryMutAct_9fa48("17049") ? true : (stryCov_9fa48("17049", "17050", "17051"), this.config.autoResumeRetryableFailures === (stryMutAct_9fa48("17052") ? false : (stryCov_9fa48("17052"), true))),
        maxAttempts: Number.isFinite(this.config.retryableFailureResumeMaxAttempts) ? stryMutAct_9fa48("17053") ? Math.min(NUM.ONE, Math.floor(this.config.retryableFailureResumeMaxAttempts)) : (stryCov_9fa48("17053"), Math.max(NUM.ONE, Math.floor(this.config.retryableFailureResumeMaxAttempts))) : JOINING_DEFAULT.retryableFailureResumeMaxAttempts,
        baseDelayMs: Number.isFinite(this.config.retryableFailureResumeBaseDelayMs) ? stryMutAct_9fa48("17054") ? Math.min(NUM.ONE, Math.floor(this.config.retryableFailureResumeBaseDelayMs)) : (stryCov_9fa48("17054"), Math.max(NUM.ONE, Math.floor(this.config.retryableFailureResumeBaseDelayMs))) : JOINING_DEFAULT.retryableFailureResumeBaseDelayMs,
        maxDelayMs: Number.isFinite(this.config.retryableFailureResumeMaxDelayMs) ? stryMutAct_9fa48("17055") ? Math.min(NUM.ONE, Math.floor(this.config.retryableFailureResumeMaxDelayMs)) : (stryCov_9fa48("17055"), Math.max(NUM.ONE, Math.floor(this.config.retryableFailureResumeMaxDelayMs))) : JOINING_DEFAULT.retryableFailureResumeMaxDelayMs,
        maxElapsedMs: Number.isFinite(this.config.retryableFailureResumeMaxElapsedMs) ? stryMutAct_9fa48("17056") ? Math.min(minimumMaxElapsedMs, Math.floor(this.config.retryableFailureResumeMaxElapsedMs)) : (stryCov_9fa48("17056"), Math.max(minimumMaxElapsedMs, Math.floor(this.config.retryableFailureResumeMaxElapsedMs))) : stryMutAct_9fa48("17057") ? Math.min(JOINING_DEFAULT.retryableFailureResumeMaxElapsedMs, minimumMaxElapsedMs) : (stryCov_9fa48("17057"), Math.max(JOINING_DEFAULT.retryableFailureResumeMaxElapsedMs, minimumMaxElapsedMs))
      });
    }
  }
  shouldAutoResumeRetryableJoinFailure(error, failureResult, attempt, policy) {
    if (stryMutAct_9fa48("17058")) {
      {}
    } else {
      stryCov_9fa48("17058");
      if (stryMutAct_9fa48("17061") ? policy?.enabled === true : stryMutAct_9fa48("17060") ? false : stryMutAct_9fa48("17059") ? true : (stryCov_9fa48("17059", "17060", "17061"), (stryMutAct_9fa48("17062") ? policy.enabled : (stryCov_9fa48("17062"), policy?.enabled)) !== (stryMutAct_9fa48("17063") ? false : (stryCov_9fa48("17063"), true)))) {
        if (stryMutAct_9fa48("17064")) {
          {}
        } else {
          stryCov_9fa48("17064");
          return stryMutAct_9fa48("17065") ? true : (stryCov_9fa48("17065"), false);
        }
      }
      if (stryMutAct_9fa48("17068") ? error?.name !== JOINING_ERROR_NAME.ABORT : stryMutAct_9fa48("17067") ? false : stryMutAct_9fa48("17066") ? true : (stryCov_9fa48("17066", "17067", "17068"), (stryMutAct_9fa48("17069") ? error.name : (stryCov_9fa48("17069"), error?.name)) === JOINING_ERROR_NAME.ABORT)) {
        if (stryMutAct_9fa48("17070")) {
          {}
        } else {
          stryCov_9fa48("17070");
          return stryMutAct_9fa48("17071") ? true : (stryCov_9fa48("17071"), false);
        }
      }
      const elapsedMs = stryMutAct_9fa48("17072") ? this.now() + this.startTime : (stryCov_9fa48("17072"), this.now() - this.startTime);
      if (stryMutAct_9fa48("17075") ? attempt >= policy.maxAttempts && elapsedMs >= policy.maxElapsedMs : stryMutAct_9fa48("17074") ? false : stryMutAct_9fa48("17073") ? true : (stryCov_9fa48("17073", "17074", "17075"), (stryMutAct_9fa48("17078") ? attempt < policy.maxAttempts : stryMutAct_9fa48("17077") ? attempt > policy.maxAttempts : stryMutAct_9fa48("17076") ? false : (stryCov_9fa48("17076", "17077", "17078"), attempt >= policy.maxAttempts)) || (stryMutAct_9fa48("17081") ? elapsedMs < policy.maxElapsedMs : stryMutAct_9fa48("17080") ? elapsedMs > policy.maxElapsedMs : stryMutAct_9fa48("17079") ? false : (stryCov_9fa48("17079", "17080", "17081"), elapsedMs >= policy.maxElapsedMs)))) {
        if (stryMutAct_9fa48("17082")) {
          {}
        } else {
          stryCov_9fa48("17082");
          this.logger.warn(JOINING_LOG_MSG.RETRYABLE_FAILURE_RESUME_EXHAUSTED, stryMutAct_9fa48("17083") ? {} : (stryCov_9fa48("17083"), {
            nodeId: this.nodeId,
            joinSessionId: this.joinSessionId,
            attempt,
            maxAttempts: policy.maxAttempts,
            elapsedMs,
            maxElapsedMs: policy.maxElapsedMs,
            phase: stryMutAct_9fa48("17086") ? failureResult?.phase && this.getPhase() : stryMutAct_9fa48("17085") ? false : stryMutAct_9fa48("17084") ? true : (stryCov_9fa48("17084", "17085", "17086"), (stryMutAct_9fa48("17087") ? failureResult.phase : (stryCov_9fa48("17087"), failureResult?.phase)) || this.getPhase()),
            error: stryMutAct_9fa48("17090") ? (failureResult?.error || error?.message) && null : stryMutAct_9fa48("17089") ? false : stryMutAct_9fa48("17088") ? true : (stryCov_9fa48("17088", "17089", "17090"), (stryMutAct_9fa48("17092") ? failureResult?.error && error?.message : stryMutAct_9fa48("17091") ? false : (stryCov_9fa48("17091", "17092"), (stryMutAct_9fa48("17093") ? failureResult.error : (stryCov_9fa48("17093"), failureResult?.error)) || (stryMutAct_9fa48("17094") ? error.message : (stryCov_9fa48("17094"), error?.message)))) || null)
          }));
          return stryMutAct_9fa48("17095") ? true : (stryCov_9fa48("17095"), false);
        }
      }
      return isRetryableControlPlaneError(error);
    }
  }
  computeRetryableJoinResumeDelayMs(error, attempt, policy) {
    if (stryMutAct_9fa48("17096")) {
      {}
    } else {
      stryCov_9fa48("17096");
      const hintedDelayMs = getControlPlaneRetryAfterMs(error);
      if (stryMutAct_9fa48("17100") ? hintedDelayMs <= NUM.ZERO : stryMutAct_9fa48("17099") ? hintedDelayMs >= NUM.ZERO : stryMutAct_9fa48("17098") ? false : stryMutAct_9fa48("17097") ? true : (stryCov_9fa48("17097", "17098", "17099", "17100"), hintedDelayMs > NUM.ZERO)) {
        if (stryMutAct_9fa48("17101")) {
          {}
        } else {
          stryCov_9fa48("17101");
          return stryMutAct_9fa48("17102") ? Math.max(policy.maxDelayMs, hintedDelayMs) : (stryCov_9fa48("17102"), Math.min(policy.maxDelayMs, hintedDelayMs));
        }
      }
      const exponentialDelayMs = stryMutAct_9fa48("17103") ? policy.baseDelayMs / NUM.TWO ** Math.max(NUM.ZERO, attempt - NUM.ONE) : (stryCov_9fa48("17103"), policy.baseDelayMs * NUM.TWO ** (stryMutAct_9fa48("17104") ? Math.min(NUM.ZERO, attempt - NUM.ONE) : (stryCov_9fa48("17104"), Math.max(NUM.ZERO, stryMutAct_9fa48("17105") ? attempt + NUM.ONE : (stryCov_9fa48("17105"), attempt - NUM.ONE)))));
      return stryMutAct_9fa48("17106") ? Math.max(policy.maxDelayMs, exponentialDelayMs) : (stryCov_9fa48("17106"), Math.min(policy.maxDelayMs, exponentialDelayMs));
    }
  } /**
    * Wait for local query/data-plane transport readiness before
    * advertising READY through the control plane.
    * @return {Promise<void>}
    * @private
    */
  async awaitLocalQueryTransportReadinessForReadySignal() {
    if (stryMutAct_9fa48("17107")) {
      {}
    } else {
      stryCov_9fa48("17107");
      await waitForLocalQueryTransportReadiness(stryMutAct_9fa48("17108") ? {} : (stryCov_9fa48("17108"), {
        messageRouter: this.messageRouter,
        sleep: stryMutAct_9fa48("17109") ? () => undefined : (stryCov_9fa48("17109"), delayMs => this.sleep(delayMs)),
        maxAttempts: this.config.readySignalMaxAttempts,
        initialDelayMs: this.config.readySignalRetryDelayMs,
        maxDelayMs: this.config.readySignalRetryMaxDelayMs,
        backoffMultiplier: this.config.readySignalRetryBackoffMultiplier,
        onRetry: ({
          attempt,
          maxAttempts,
          delayMs,
          readiness
        }) => {
          if (stryMutAct_9fa48("17110")) {
            {}
          } else {
            stryCov_9fa48("17110");
            this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_RETRYING, stryMutAct_9fa48("17111") ? {} : (stryCov_9fa48("17111"), {
              nodeId: this.nodeId,
              attempt,
              maxAttempts,
              nextDelayMs: delayMs,
              error: stryMutAct_9fa48("17114") ? readiness?.reason && NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_DATA_PLANE_TRANSPORT_IS_NOT_READY : stryMutAct_9fa48("17113") ? false : stryMutAct_9fa48("17112") ? true : (stryCov_9fa48("17112", "17113", "17114"), (stryMutAct_9fa48("17115") ? readiness.reason : (stryCov_9fa48("17115"), readiness?.reason)) || NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_DATA_PLANE_TRANSPORT_IS_NOT_READY),
              gate: NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_TRANSPORT,
              localQueryTransport: readiness
            }));
          }
        }
      }));
    }
  } /**
    * Wait for canonical lifecycle metadata-publication readiness before
    * advertising READY through the control plane.
    * @return {Promise<void>}
    * @private
    */
  async awaitMetadataPublicationReadinessForReadySignal() {
    if (stryMutAct_9fa48("17116")) {
      {}
    } else {
      stryCov_9fa48("17116");
      await waitForMetadataPublicationReadiness(stryMutAct_9fa48("17117") ? {} : (stryCov_9fa48("17117"), {
        readinessState: this.bootstrapReadinessState,
        sleep: stryMutAct_9fa48("17118") ? () => undefined : (stryCov_9fa48("17118"), delayMs => this.sleep(delayMs)),
        maxAttempts: this.config.readySignalMaxAttempts,
        initialDelayMs: this.config.readySignalRetryDelayMs,
        maxDelayMs: this.config.readySignalRetryMaxDelayMs,
        backoffMultiplier: this.config.readySignalRetryBackoffMultiplier,
        onRetry: ({
          attempt,
          maxAttempts,
          delayMs,
          snapshot
        }) => {
          if (stryMutAct_9fa48("17119")) {
            {}
          } else {
            stryCov_9fa48("17119");
            this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_RETRYING, stryMutAct_9fa48("17120") ? {} : (stryCov_9fa48("17120"), {
              nodeId: this.nodeId,
              attempt,
              maxAttempts,
              nextDelayMs: delayMs,
              error: NODE_JOINING_SERVICE_LITERAL.LIFECYCLE_METADATA_PUBLICATION_READINESS_IS_NOT_SATISFIED,
              gate: NODE_JOINING_SERVICE_LITERAL.METADATA_PUBLICATION_READINESS,
              lifecycleReadiness: stryMutAct_9fa48("17123") ? snapshot && null : stryMutAct_9fa48("17122") ? false : stryMutAct_9fa48("17121") ? true : (stryCov_9fa48("17121", "17122", "17123"), snapshot || null)
            }));
          }
        }
      }));
    }
  } /**
    * Signal readiness to accept replica assignments.
    * @return {Promise<void>}
    * @private
    */
  async signalReadyForReplicas() {
    if (stryMutAct_9fa48("17124")) {
      {}
    } else {
      stryCov_9fa48("17124");
      // Gate: verify CDC subscriptions are active before advertising
      // readiness. If not confirmed within timeout, proceed with
      // degraded status rather than blocking indefinitely (Req 5.3).
      await this.awaitCdcSubscriptionsForReadiness();
      try {
        if (stryMutAct_9fa48("17125")) {
          {}
        } else {
          stryCov_9fa48("17125");
          await this.awaitLocalQueryTransportReadinessForReadySignal();
        }
      } catch (error) {
        if (stryMutAct_9fa48("17126")) {
          {}
        } else {
          stryCov_9fa48("17126");
          this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_FAILED, stryMutAct_9fa48("17127") ? {} : (stryCov_9fa48("17127"), {
            nodeId: this.nodeId,
            error: stryMutAct_9fa48("17130") ? error?.message && NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_DATA_PLANE_TRANSPORT_IS_NOT_READY : stryMutAct_9fa48("17129") ? false : stryMutAct_9fa48("17128") ? true : (stryCov_9fa48("17128", "17129", "17130"), (stryMutAct_9fa48("17131") ? error.message : (stryCov_9fa48("17131"), error?.message)) || NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_DATA_PLANE_TRANSPORT_IS_NOT_READY),
            gate: NODE_JOINING_SERVICE_LITERAL.LOCAL_QUERY_TRANSPORT,
            localQueryTransport: stryMutAct_9fa48("17134") ? error?.localQueryTransport && null : stryMutAct_9fa48("17133") ? false : stryMutAct_9fa48("17132") ? true : (stryCov_9fa48("17132", "17133", "17134"), (stryMutAct_9fa48("17135") ? error.localQueryTransport : (stryCov_9fa48("17135"), error?.localQueryTransport)) || null)
          }));
          throw error;
        }
      }
      try {
        if (stryMutAct_9fa48("17136")) {
          {}
        } else {
          stryCov_9fa48("17136");
          await this.awaitMetadataPublicationReadinessForReadySignal();
        }
      } catch (error) {
        if (stryMutAct_9fa48("17137")) {
          {}
        } else {
          stryCov_9fa48("17137");
          this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_FAILED, stryMutAct_9fa48("17138") ? {} : (stryCov_9fa48("17138"), {
            nodeId: this.nodeId,
            error: stryMutAct_9fa48("17141") ? error?.message && NODE_JOINING_SERVICE_LITERAL.LIFECYCLE_METADATA_PUBLICATION_READINESS_IS_NOT_SATISFIED : stryMutAct_9fa48("17140") ? false : stryMutAct_9fa48("17139") ? true : (stryCov_9fa48("17139", "17140", "17141"), (stryMutAct_9fa48("17142") ? error.message : (stryCov_9fa48("17142"), error?.message)) || NODE_JOINING_SERVICE_LITERAL.LIFECYCLE_METADATA_PUBLICATION_READINESS_IS_NOT_SATISFIED),
            gate: NODE_JOINING_SERVICE_LITERAL.METADATA_PUBLICATION_READINESS,
            lifecycleReadiness: stryMutAct_9fa48("17145") ? error?.lifecycleReadiness && null : stryMutAct_9fa48("17144") ? false : stryMutAct_9fa48("17143") ? true : (stryCov_9fa48("17143", "17144", "17145"), (stryMutAct_9fa48("17146") ? error.lifecycleReadiness : (stryCov_9fa48("17146"), error?.lifecycleReadiness)) || null)
          }));
          throw error;
        }
      }
      const heartbeat = assertCritical(this.heartbeatService, JOINING_ERROR_MSG.CONTROL_PLANE_SERVICE_REQUIRED);
      const nodeService = NodeService.getInstance();
      const capabilities = this.getNodeCapabilities();
      const stats = await nodeService.getNodeStats();
      const heartbeatPayload = stryMutAct_9fa48("17147") ? {} : (stryCov_9fa48("17147"), {
        cpu: stryMutAct_9fa48("17148") ? {} : (stryCov_9fa48("17148"), {
          count: stryMutAct_9fa48("17149") ? stats.cpu.count : (stryCov_9fa48("17149"), stats.cpu?.count),
          usagePercent: stryMutAct_9fa48("17150") ? stats.cpu.usagePercent : (stryCov_9fa48("17150"), stats.cpu?.usagePercent)
        }),
        memory: stryMutAct_9fa48("17151") ? {} : (stryCov_9fa48("17151"), {
          totalBytes: stryMutAct_9fa48("17152") ? stats.memory.totalBytes : (stryCov_9fa48("17152"), stats.memory?.totalBytes),
          usagePercent: stryMutAct_9fa48("17153") ? stats.memory.usagePercent : (stryCov_9fa48("17153"), stats.memory?.usagePercent)
        }),
        diskGb: stats.diskGb,
        diskUsagePercent: stats.diskUsagePercent
      });
      const maxAttempts = Number.isFinite(this.config.readySignalMaxAttempts) ? stryMutAct_9fa48("17154") ? Math.min(NUM.ONE, Math.floor(this.config.readySignalMaxAttempts)) : (stryCov_9fa48("17154"), Math.max(NUM.ONE, Math.floor(this.config.readySignalMaxAttempts))) : JOINING_DEFAULT.readySignalMaxAttempts;
      const maxDelayMs = Number.isFinite(this.config.readySignalRetryMaxDelayMs) ? stryMutAct_9fa48("17155") ? Math.min(NUM.ONE, Math.floor(this.config.readySignalRetryMaxDelayMs)) : (stryCov_9fa48("17155"), Math.max(NUM.ONE, Math.floor(this.config.readySignalRetryMaxDelayMs))) : JOINING_DEFAULT.readySignalRetryMaxDelayMs;
      const backoffMultiplier = (stryMutAct_9fa48("17158") ? Number.isFinite(this.config.readySignalRetryBackoffMultiplier) || this.config.readySignalRetryBackoffMultiplier > NUM.ZERO : stryMutAct_9fa48("17157") ? false : stryMutAct_9fa48("17156") ? true : (stryCov_9fa48("17156", "17157", "17158"), Number.isFinite(this.config.readySignalRetryBackoffMultiplier) && (stryMutAct_9fa48("17161") ? this.config.readySignalRetryBackoffMultiplier <= NUM.ZERO : stryMutAct_9fa48("17160") ? this.config.readySignalRetryBackoffMultiplier >= NUM.ZERO : stryMutAct_9fa48("17159") ? true : (stryCov_9fa48("17159", "17160", "17161"), this.config.readySignalRetryBackoffMultiplier > NUM.ZERO)))) ? this.config.readySignalRetryBackoffMultiplier : JOINING_DEFAULT.readySignalRetryBackoffMultiplier;
      let delayMs = Number.isFinite(this.config.readySignalRetryDelayMs) ? stryMutAct_9fa48("17162") ? Math.min(NUM.ONE, Math.floor(this.config.readySignalRetryDelayMs)) : (stryCov_9fa48("17162"), Math.max(NUM.ONE, Math.floor(this.config.readySignalRetryDelayMs))) : JOINING_DEFAULT.readySignalRetryDelayMs;
      let lastError = null;
      for (let attempt = NUM.ONE; stryMutAct_9fa48("17165") ? attempt > maxAttempts : stryMutAct_9fa48("17164") ? attempt < maxAttempts : stryMutAct_9fa48("17163") ? false : (stryCov_9fa48("17163", "17164", "17165"), attempt <= maxAttempts); stryMutAct_9fa48("17166") ? attempt-- : (stryCov_9fa48("17166"), attempt++)) {
        if (stryMutAct_9fa48("17167")) {
          {}
        } else {
          stryCov_9fa48("17167");
          try {
            if (stryMutAct_9fa48("17168")) {
              {}
            } else {
              stryCov_9fa48("17168");
              await heartbeat.sendHeartbeat(heartbeatPayload, capabilities);
              this.logger.info(JOINING_LOG_MSG.READY_SIGNAL_SUCCESS, stryMutAct_9fa48("17169") ? {} : (stryCov_9fa48("17169"), {
                nodeId: this.nodeId,
                attempt,
                maxAttempts
              }));
              return;
            }
          } catch (error) {
            if (stryMutAct_9fa48("17170")) {
              {}
            } else {
              stryCov_9fa48("17170");
              lastError = error;
              if (stryMutAct_9fa48("17174") ? attempt < maxAttempts : stryMutAct_9fa48("17173") ? attempt > maxAttempts : stryMutAct_9fa48("17172") ? false : stryMutAct_9fa48("17171") ? true : (stryCov_9fa48("17171", "17172", "17173", "17174"), attempt >= maxAttempts)) {
                if (stryMutAct_9fa48("17175")) {
                  {}
                } else {
                  stryCov_9fa48("17175");
                  break;
                }
              }
              this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_RETRYING, stryMutAct_9fa48("17176") ? {} : (stryCov_9fa48("17176"), {
                nodeId: this.nodeId,
                attempt,
                maxAttempts,
                nextDelayMs: delayMs,
                error: error.message
              }));
              await this.sleep(delayMs);
              delayMs = stryMutAct_9fa48("17177") ? Math.max(Math.floor(delayMs * backoffMultiplier), maxDelayMs) : (stryCov_9fa48("17177"), Math.min(Math.floor(stryMutAct_9fa48("17178") ? delayMs / backoffMultiplier : (stryCov_9fa48("17178"), delayMs * backoffMultiplier)), maxDelayMs));
            }
          }
        }
      }
      this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_FAILED, stryMutAct_9fa48("17179") ? {} : (stryCov_9fa48("17179"), {
        nodeId: this.nodeId,
        attempts: maxAttempts,
        error: stryMutAct_9fa48("17182") ? lastError?.message && STRING.UNKNOWN : stryMutAct_9fa48("17181") ? false : stryMutAct_9fa48("17180") ? true : (stryCov_9fa48("17180", "17181", "17182"), (stryMutAct_9fa48("17183") ? lastError.message : (stryCov_9fa48("17183"), lastError?.message)) || STRING.UNKNOWN)
      }));
      throw lastError;
    }
  } /**
    * Wait for CDC subscriptions to become active before advertising
    * node readiness. If subscriptions are not confirmed within the
    * re-establishment timeout, log a degraded-status warning and
    * proceed so the node is not blocked indefinitely.
    * @return {Promise<void>}
    * @private
    */
  async awaitCdcSubscriptionsForReadiness() {
    if (stryMutAct_9fa48("17184")) {
      {}
    } else {
      stryCov_9fa48("17184");
      if (stryMutAct_9fa48("17187") ? this.cdcSubscriptionsActive !== true : stryMutAct_9fa48("17186") ? false : stryMutAct_9fa48("17185") ? true : (stryCov_9fa48("17185", "17186", "17187"), this.cdcSubscriptionsActive === (stryMutAct_9fa48("17188") ? false : (stryCov_9fa48("17188"), true)))) {
        if (stryMutAct_9fa48("17189")) {
          {}
        } else {
          stryCov_9fa48("17189");
          this.logger.info(JOINING_LOG_MSG.CDC_READINESS_GATE_PASSED, stryMutAct_9fa48("17190") ? {} : (stryCov_9fa48("17190"), {
            nodeId: this.nodeId
          }));
          return;
        }
      }
      const timeoutMs = CDC_REESTABLISHMENT.TIMEOUT_MS;
      const pollMs = CDC_REESTABLISHMENT.READINESS_GATE_POLL_MS;
      const startMs = this.now();
      this.logger.info(JOINING_LOG_MSG.CDC_READINESS_GATE_WAITING, stryMutAct_9fa48("17191") ? {} : (stryCov_9fa48("17191"), {
        nodeId: this.nodeId,
        timeoutMs
      }));
      while (stryMutAct_9fa48("17194") ? this.now() - startMs >= timeoutMs : stryMutAct_9fa48("17193") ? this.now() - startMs <= timeoutMs : stryMutAct_9fa48("17192") ? false : (stryCov_9fa48("17192", "17193", "17194"), (stryMutAct_9fa48("17195") ? this.now() + startMs : (stryCov_9fa48("17195"), this.now() - startMs)) < timeoutMs)) {
        if (stryMutAct_9fa48("17196")) {
          {}
        } else {
          stryCov_9fa48("17196");
          if (stryMutAct_9fa48("17199") ? this.cdcSubscriptionsActive !== true : stryMutAct_9fa48("17198") ? false : stryMutAct_9fa48("17197") ? true : (stryCov_9fa48("17197", "17198", "17199"), this.cdcSubscriptionsActive === (stryMutAct_9fa48("17200") ? false : (stryCov_9fa48("17200"), true)))) {
            if (stryMutAct_9fa48("17201")) {
              {}
            } else {
              stryCov_9fa48("17201");
              this.logger.info(JOINING_LOG_MSG.CDC_READINESS_GATE_PASSED, stryMutAct_9fa48("17202") ? {} : (stryCov_9fa48("17202"), {
                nodeId: this.nodeId,
                elapsedMs: stryMutAct_9fa48("17203") ? this.now() + startMs : (stryCov_9fa48("17203"), this.now() - startMs)
              }));
              return;
            }
          }
          await this.sleep(pollMs);
        }
      }
      this.logger.warn(JOINING_LOG_MSG.CDC_READINESS_GATE_DEGRADED, stryMutAct_9fa48("17204") ? {} : (stryCov_9fa48("17204"), {
        nodeId: this.nodeId,
        timeoutMs,
        elapsedMs: stryMutAct_9fa48("17205") ? this.now() + startMs : (stryCov_9fa48("17205"), this.now() - startMs)
      }));
    }
  } /**
    * Disable control-plane heartbeat reporting when a caller explicitly wants
    * direct CDC heartbeats to be the active publication path.
    * @return {void}
    * @private
    */
  disableSteadyStateControlPlaneReporter() {
    if (stryMutAct_9fa48("17206")) {
      {}
    } else {
      stryCov_9fa48("17206");
      if (stryMutAct_9fa48("17209") ? this.startupMode !== STARTUP_JOIN_MODE.DURABLE_REJOIN : stryMutAct_9fa48("17208") ? false : stryMutAct_9fa48("17207") ? true : (stryCov_9fa48("17207", "17208", "17209"), this.startupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN)) {
        if (stryMutAct_9fa48("17210")) {
          {}
        } else {
          stryCov_9fa48("17210");
          return;
        }
      }
      if (stryMutAct_9fa48("17213") ? typeof this.heartbeatService?.setNodeStateReporter === TYPEOF.FUNCTION : stryMutAct_9fa48("17212") ? false : stryMutAct_9fa48("17211") ? true : (stryCov_9fa48("17211", "17212", "17213"), typeof (stryMutAct_9fa48("17214") ? this.heartbeatService.setNodeStateReporter : (stryCov_9fa48("17214"), this.heartbeatService?.setNodeStateReporter)) !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("17215")) {
          {}
        } else {
          stryCov_9fa48("17215");
          return;
        }
      }
      this.heartbeatService.setNodeStateReporter(null);
    }
  }
  resolveControlPlaneNodeStateUpdateTimeoutMs(options = {}) {
    if (stryMutAct_9fa48("17216")) {
      {}
    } else {
      stryCov_9fa48("17216");
      const explicitTimeoutMs = Number(options.timeoutMs);
      if (stryMutAct_9fa48("17219") ? Number.isFinite(explicitTimeoutMs) || explicitTimeoutMs > NUM.ZERO : stryMutAct_9fa48("17218") ? false : stryMutAct_9fa48("17217") ? true : (stryCov_9fa48("17217", "17218", "17219"), Number.isFinite(explicitTimeoutMs) && (stryMutAct_9fa48("17222") ? explicitTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("17221") ? explicitTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("17220") ? true : (stryCov_9fa48("17220", "17221", "17222"), explicitTimeoutMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("17223")) {
          {}
        } else {
          stryCov_9fa48("17223");
          return Math.floor(explicitTimeoutMs);
        }
      }
      const leadershipWaitTimeoutMs = Number(stryMutAct_9fa48("17224") ? this.config.leadershipWaitTimeoutMs : (stryCov_9fa48("17224"), this.config?.leadershipWaitTimeoutMs));
      if (stryMutAct_9fa48("17227") ? Number.isFinite(leadershipWaitTimeoutMs) || leadershipWaitTimeoutMs > NUM.ZERO : stryMutAct_9fa48("17226") ? false : stryMutAct_9fa48("17225") ? true : (stryCov_9fa48("17225", "17226", "17227"), Number.isFinite(leadershipWaitTimeoutMs) && (stryMutAct_9fa48("17230") ? leadershipWaitTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("17229") ? leadershipWaitTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("17228") ? true : (stryCov_9fa48("17228", "17229", "17230"), leadershipWaitTimeoutMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("17231")) {
          {}
        } else {
          stryCov_9fa48("17231");
          return Math.floor(leadershipWaitTimeoutMs);
        }
      }
      const httpTimeoutMs = Number(stryMutAct_9fa48("17232") ? this.config.httpTimeoutMs : (stryCov_9fa48("17232"), this.config?.httpTimeoutMs));
      if (stryMutAct_9fa48("17235") ? Number.isFinite(httpTimeoutMs) || httpTimeoutMs > NUM.ZERO : stryMutAct_9fa48("17234") ? false : stryMutAct_9fa48("17233") ? true : (stryCov_9fa48("17233", "17234", "17235"), Number.isFinite(httpTimeoutMs) && (stryMutAct_9fa48("17238") ? httpTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("17237") ? httpTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("17236") ? true : (stryCov_9fa48("17236", "17237", "17238"), httpTimeoutMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("17239")) {
          {}
        } else {
          stryCov_9fa48("17239");
          return Math.floor(httpTimeoutMs);
        }
      }
      return null;
    }
  } /**
    * Activate non-critical periodic control-plane writers once the joining
    * node reaches READY.
    * @return {void}
    * @private
    */
  activateControlPlaneBackgroundWriters() {
    if (stryMutAct_9fa48("17240")) {
      {}
    } else {
      stryCov_9fa48("17240");
      return this.runtimeHandoffOwner.activateControlPlaneBackgroundWriters();
    }
  } /**
    * Activate steady-state distributed transaction recovery after the node has
    * crossed the READY cutover. Join-time query engines intentionally defer
    * recovery replay until this point to avoid querying through an incomplete
    * self-hosted control-plane path during restart hydration.
    *
    * @return {void}
    * @private
    */
  activateDistributedTransactionRecovery() {
    if (stryMutAct_9fa48("17241")) {
      {}
    } else {
      stryCov_9fa48("17241");
      return this.runtimeHandoffOwner.activateDistributedTransactionRecovery();
    }
  }
  hasActiveControlPlaneBackgroundWriters() {
    if (stryMutAct_9fa48("17242")) {
      {}
    } else {
      stryCov_9fa48("17242");
      return this.runtimeHandoffOwner.hasActiveControlPlaneBackgroundWriters();
    }
  }
  buildControlPlaneHeartbeatStartOptions() {
    if (stryMutAct_9fa48("17243")) {
      {}
    } else {
      stryCov_9fa48("17243");
      return stryMutAct_9fa48("17244") ? {} : (stryCov_9fa48("17244"), {
        getStats: stryMutAct_9fa48("17245") ? () => undefined : (stryCov_9fa48("17245"), () => NodeService.getInstance().getNodeStats()),
        capabilities: this.getNodeCapabilities()
      });
    }
  } /**
    * Flush staged CREATE_SELF_HOSTED message-group metadata after the READY
    * cutover. This is intentionally non-blocking.
    *
    * @return {void}
    * @private
    */
  flushDeferredCreateSelfHostedMetadata() {
    if (stryMutAct_9fa48("17246")) {
      {}
    } else {
      stryCov_9fa48("17246");
      return this.runtimeHandoffOwner.flushDeferredCreateSelfHostedMetadata();
    }
  } /**
    * Execute a joining phase with logging and timing.
    * @param {string} phaseName - Phase name.
    * @param {Function} phaseFunction - Phase implementation function.
    * @return {Promise<void>}
    * @private
    */
  async executePhase(phaseName, phaseFunction) {
    if (stryMutAct_9fa48("17247")) {
      {}
    } else {
      stryCov_9fa48("17247");
      const subPhase = JOINING_PHASE_TO_SUB_PHASE[phaseName];
      if (stryMutAct_9fa48("17249") ? false : stryMutAct_9fa48("17248") ? true : (stryCov_9fa48("17248", "17249"), subPhase)) {
        if (stryMutAct_9fa48("17250")) {
          {}
        } else {
          stryCov_9fa48("17250");
          if (stryMutAct_9fa48("17253") ? this.lifecycleStateMachine.getState() !== NodeState.JOINING : stryMutAct_9fa48("17252") ? false : stryMutAct_9fa48("17251") ? true : (stryCov_9fa48("17251", "17252", "17253"), this.lifecycleStateMachine.getState() === NodeState.JOINING)) {
            if (stryMutAct_9fa48("17254")) {
              {}
            } else {
              stryCov_9fa48("17254");
              const currentSubPhase = this.lifecycleStateMachine.getSubPhase();
              if (stryMutAct_9fa48("17257") ? currentSubPhase === subPhase : stryMutAct_9fa48("17256") ? false : stryMutAct_9fa48("17255") ? true : (stryCov_9fa48("17255", "17256", "17257"), currentSubPhase !== subPhase)) {
                if (stryMutAct_9fa48("17258")) {
                  {}
                } else {
                  stryCov_9fa48("17258");
                  this.lifecycleStateMachine.transitionSubPhase(subPhase);
                }
              }
            }
          } else {
            if (stryMutAct_9fa48("17259")) {
              {}
            } else {
              stryCov_9fa48("17259");
              this._completedJoinPhases.push(phaseName);
            }
          }
        }
      }
      this.phase = phaseName;
      this.phaseStartTime = this.now();
      const state = this.lifecycleStateMachine.getState();
      const activeSubPhase = stryMutAct_9fa48("17262") ? this.lifecycleStateMachine.getSubPhase() && null : stryMutAct_9fa48("17261") ? false : stryMutAct_9fa48("17260") ? true : (stryCov_9fa48("17260", "17261", "17262"), this.lifecycleStateMachine.getSubPhase() || null);
      this.logger.info(JOINING_LOG_MSG.PHASE_STARTING, stryMutAct_9fa48("17263") ? {} : (stryCov_9fa48("17263"), {
        nodeId: this.nodeId,
        state,
        phase: phaseName,
        subPhase: activeSubPhase
      }));
      this.emit(JoiningEvent.PHASE_START, stryMutAct_9fa48("17264") ? {} : (stryCov_9fa48("17264"), {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase
      }));
      try {
        if (stryMutAct_9fa48("17265")) {
          {}
        } else {
          stryCov_9fa48("17265");
          await this.workClassScheduler.enqueue(WORK_CLASS.A, async () => {
            if (stryMutAct_9fa48("17266")) {
              {}
            } else {
              stryCov_9fa48("17266");
              await phaseFunction();
            }
          });
          const phaseDuration = stryMutAct_9fa48("17267") ? this.now() + this.phaseStartTime : (stryCov_9fa48("17267"), this.now() - this.phaseStartTime);
          this.logger.info(JOINING_LOG_MSG.PHASE_COMPLETED, stryMutAct_9fa48("17268") ? {} : (stryCov_9fa48("17268"), {
            nodeId: this.nodeId,
            state,
            phase: phaseName,
            subPhase: activeSubPhase,
            duration: phaseDuration
          }));
          this.emit(JoiningEvent.PHASE_COMPLETE, stryMutAct_9fa48("17269") ? {} : (stryCov_9fa48("17269"), {
            phase: phaseName,
            nodeId: this.nodeId,
            state,
            subPhase: activeSubPhase,
            duration: phaseDuration
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("17270")) {
          {}
        } else {
          stryCov_9fa48("17270");
          const phaseDuration = stryMutAct_9fa48("17271") ? this.now() + this.phaseStartTime : (stryCov_9fa48("17271"), this.now() - this.phaseStartTime);
          this.logger.error(JOINING_LOG_MSG.PHASE_FAILED, stryMutAct_9fa48("17272") ? {} : (stryCov_9fa48("17272"), {
            nodeId: this.nodeId,
            state,
            phase: phaseName,
            subPhase: activeSubPhase,
            duration: phaseDuration,
            error: error.message,
            stack: error.stack,
            joinReadiness: stryMutAct_9fa48("17275") ? error?.joinReadiness && null : stryMutAct_9fa48("17274") ? false : stryMutAct_9fa48("17273") ? true : (stryCov_9fa48("17273", "17274", "17275"), (stryMutAct_9fa48("17276") ? error.joinReadiness : (stryCov_9fa48("17276"), error?.joinReadiness)) || null)
          }));
          this.emit(JoiningEvent.PHASE_FAILED, stryMutAct_9fa48("17277") ? {} : (stryCov_9fa48("17277"), {
            phase: phaseName,
            nodeId: this.nodeId,
            state,
            subPhase: activeSubPhase,
            duration: phaseDuration,
            error: error.message
          }));
          throw error;
        }
      }
    }
  } /**
    * Phase 1: Contact seed node via HTTP.
    * @return {Promise<void>}
    * @private
    */
  async phaseContactSeed() {
    if (stryMutAct_9fa48("17278")) {
      {}
    } else {
      stryCov_9fa48("17278");
      return this.contactSeedPhase.phaseContactSeed();
    }
  } /**
    * Resolve bounded retry policy for join-time HTTP operations.
    * @return {Object}
    * @private
    */
  resolveJoinRetryPolicy() {
    if (stryMutAct_9fa48("17279")) {
      {}
    } else {
      stryCov_9fa48("17279");
      return this.contactSeedPhase.resolveJoinRetryPolicy();
    }
  } /**
    * Classify one seed contact failure for retry/backoff behavior.
    * @param {Error} error
    * @param {string} retryableTimeoutErrorMessage
    * @return {Object}
    * @private
    */
  classifySeedContactFailure(error, retryableTimeoutErrorMessage) {
    if (stryMutAct_9fa48("17280")) {
      {}
    } else {
      stryCov_9fa48("17280");
      return this.contactSeedPhase.classifySeedContactFailure(error, retryableTimeoutErrorMessage);
    }
  } /**
    * Compute retry delay using bootstrap hints + bounded jitter.
    * @param {Object} options
    * @param {number} options.baseDelayMs
    * @param {number} options.maxDelayMs
    * @param {number|null} options.retryAfterMs
    * @return {number}
    * @private
    */
  computeSeedContactRetryDelayMs(options = {}) {
    if (stryMutAct_9fa48("17281")) {
      {}
    } else {
      stryCov_9fa48("17281");
      return this.contactSeedPhase.computeSeedContactRetryDelayMs(options);
    }
  } /**
    * Apply bounded symmetric jitter to one retry delay.
    * @param {number} delayMs
    * @param {number} maxDelayMs
    * @return {number}
    * @private
    */
  applySeedContactRetryJitter(delayMs, maxDelayMs) {
    if (stryMutAct_9fa48("17282")) {
      {}
    } else {
      stryCov_9fa48("17282");
      return this.contactSeedPhase.applySeedContactRetryJitter(delayMs, maxDelayMs);
    }
  } /**
    * Resolve retry hint (ms) from parsed body and transport metadata.
    * @param {Error} error
    * @param {Object|null} parsedError
    * @return {number|null}
    * @private
    */
  resolveSeedContactRetryAfterMs(error, parsedError) {
    if (stryMutAct_9fa48("17283")) {
      {}
    } else {
      stryCov_9fa48("17283");
      return _resolveSeedContactRetryAfterMs(error, parsedError);
    }
  } /**
    * Parse bootstrap HTTP error bodies from the default HTTP client.
    * @param {Error} error
    * @return {Object|null}
    * @private
    */
  parseBootstrapError(error) {
    if (stryMutAct_9fa48("17284")) {
      {}
    } else {
      stryCov_9fa48("17284");
      return _parseBootstrapError(error);
    }
  } /**
    * Build a consistent error message for bootstrap failures.
    * @param {Object} response
    * @return {string}
    * @private
    */
  buildBootstrapFailureError(response) {
    if (stryMutAct_9fa48("17285")) {
      {}
    } else {
      stryCov_9fa48("17285");
      return this.contactSeedPhase.buildBootstrapFailureError(response);
    }
  } /**
    * Format leader metadata details for error reporting.
    * @param {Object} details
    * @return {string}
    * @private
    */
  formatLeaderMetadataDetails(details) {
    if (stryMutAct_9fa48("17286")) {
      {}
    } else {
      stryCov_9fa48("17286");
      return _formatLeaderMetadataDetails(details);
    }
  } /**
    * Build a canonical descriptor for join-managed unified lifecycle replicas.
    * @param {string} serviceType
    * @param {string} serviceId
    * @return {Object}
    * @private
    */
  createJoinServiceDescriptor(serviceType, serviceId) {
    if (stryMutAct_9fa48("17287")) {
      {}
    } else {
      stryCov_9fa48("17287");
      return stryMutAct_9fa48("17288") ? {} : (stryCov_9fa48("17288"), {
        [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
        [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: serviceType,
        [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: this.nodeId,
        [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: serviceId,
        [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]: NUM.ONE,
        [SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND]: JOINING_UNIFIED_RECONCILE.RUNTIME_KIND,
        [SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF]: null,
        [SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG]: null
      });
    }
  } /**
    * Queue one join replica for desired-state reconciliation.
    * @param {Object} descriptor
    * @param {Object} options
    * @return {void}
    * @private
    */
  queueJoinServiceReplica(descriptor, options) {
    if (stryMutAct_9fa48("17289")) {
      {}
    } else {
      stryCov_9fa48("17289");
      const serviceId = descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
      this.joinDesiredServiceDefinitions.set(serviceId, descriptor);
      this.joinReplicaOptionsByServiceId.set(serviceId, options);
    }
  } /**
    * Resolve join replica options for one serviceId.
    * @param {string} serviceId
    * @param {string} serviceType
    * @return {Object}
    * @private
    */
  resolveJoinReplicaOptions(serviceId, serviceType) {
    if (stryMutAct_9fa48("17290")) {
      {}
    } else {
      stryCov_9fa48("17290");
      const options = stryMutAct_9fa48("17293") ? this.joinReplicaOptionsByServiceId.get(serviceId) && null : stryMutAct_9fa48("17292") ? false : stryMutAct_9fa48("17291") ? true : (stryCov_9fa48("17291", "17292", "17293"), this.joinReplicaOptionsByServiceId.get(serviceId) || null);
      assertCritical(options, stryMutAct_9fa48("17294") ? `` : (stryCov_9fa48("17294"), `Missing join replica options for ${serviceId}`));
      assertCritical(stryMutAct_9fa48("17297") ? options.serviceType !== serviceType : stryMutAct_9fa48("17296") ? false : stryMutAct_9fa48("17295") ? true : (stryCov_9fa48("17295", "17296", "17297"), options.serviceType === serviceType), stryMutAct_9fa48("17298") ? `` : (stryCov_9fa48("17298"), `Join replica type mismatch for ${serviceId}: expected ${serviceType}`));
      return options;
    }
  } /**
    * Build local actual-state rows for join reconciliation.
    * @return {Object[]}
    * @private
    */
  buildJoinActualStateRows() {
    if (stryMutAct_9fa48("17299")) {
      {}
    } else {
      stryCov_9fa48("17299");
      if (stryMutAct_9fa48("17302") ? false : stryMutAct_9fa48("17301") ? true : stryMutAct_9fa48("17300") ? this.serviceLifecycleManager : (stryCov_9fa48("17300", "17301", "17302"), !this.serviceLifecycleManager)) {
        if (stryMutAct_9fa48("17303")) {
          {}
        } else {
          stryCov_9fa48("17303");
          return stryMutAct_9fa48("17304") ? ["Stryker was here"] : (stryCov_9fa48("17304"), []);
        }
      }
      const rows = stryMutAct_9fa48("17305") ? ["Stryker was here"] : (stryCov_9fa48("17305"), []);
      for (const replicaId of this.messageGroupServices.keys()) {
        if (stryMutAct_9fa48("17306")) {
          {}
        } else {
          stryCov_9fa48("17306");
          const handle = this.createJoinServiceDescriptor(UNIFIED_SERVICE_TYPE.MESSAGE_GROUP, replicaId);
          rows.push(stryMutAct_9fa48("17307") ? {} : (stryCov_9fa48("17307"), {
            ...handle,
            [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]: this.serviceLifecycleManager.getReplicaState(handle)
          }));
        }
      }
      for (const replicaId of this.partitionServices.keys()) {
        if (stryMutAct_9fa48("17308")) {
          {}
        } else {
          stryCov_9fa48("17308");
          const handle = this.createJoinServiceDescriptor(UNIFIED_SERVICE_TYPE.PARTITION, replicaId);
          rows.push(stryMutAct_9fa48("17309") ? {} : (stryCov_9fa48("17309"), {
            ...handle,
            [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]: this.serviceLifecycleManager.getReplicaState(handle)
          }));
        }
      }
      return rows;
    }
  } /**
    * Initialize unified lifecycle owners for join-time service startup.
    * @return {Promise<void>}
    * @private
    */
  async initializeJoiningLifecycleOwners() {
    if (stryMutAct_9fa48("17310")) {
      {}
    } else {
      stryCov_9fa48("17310");
      await this.startupServiceLifecycleOwner.ensureOwners();
    }
  } /**
    * Trigger one join reconciliation cycle.
    * @param {string} reason
    * @return {Promise<void>}
    * @private
    */
  async triggerJoinReconciler(reason) {
    if (stryMutAct_9fa48("17311")) {
      {}
    } else {
      stryCov_9fa48("17311");
      await this.startupServiceLifecycleOwner.triggerReconciler(reason);
    }
  } /**
    * Stop unified lifecycle owners and clear join desired-state catalogs.
    * @return {void}
    * @private
    */
  stopJoiningLifecycleOwners() {
    if (stryMutAct_9fa48("17312")) {
      {}
    } else {
      stryCov_9fa48("17312");
      this.startupServiceLifecycleOwner.stopOwners();
    }
  } /**
    * Unified lifecycle create hook for join message-group replicas.
    * @param {Object} context
    * @return {Promise<Object>}
    * @private
    */
  async createJoinMessageGroupReplica(context) {
    if (stryMutAct_9fa48("17313")) {
      {}
    } else {
      stryCov_9fa48("17313");
      return this.createMessageGroupPhase.createJoinMessageGroupReplica(context);
    }
  } /**
    * Unified lifecycle create hook for join partition replicas.
    * @param {Object} context
    * @return {Promise<Object>}
    * @private
    */
  async createJoinPartitionReplica(context) {
    if (stryMutAct_9fa48("17314")) {
      {}
    } else {
      stryCov_9fa48("17314");
      const definition = stryMutAct_9fa48("17317") ? context?.definition && {} : stryMutAct_9fa48("17316") ? false : stryMutAct_9fa48("17315") ? true : (stryCov_9fa48("17315", "17316", "17317"), (stryMutAct_9fa48("17318") ? context.definition : (stryCov_9fa48("17318"), context?.definition)) || {});
      const directOptions = stryMutAct_9fa48("17321") ? context?.replicaOptions && null : stryMutAct_9fa48("17320") ? false : stryMutAct_9fa48("17319") ? true : (stryCov_9fa48("17319", "17320", "17321"), (stryMutAct_9fa48("17322") ? context.replicaOptions : (stryCov_9fa48("17322"), context?.replicaOptions)) || null);
      const serviceId = stryMutAct_9fa48("17325") ? directOptions?.replicaId && definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : stryMutAct_9fa48("17324") ? false : stryMutAct_9fa48("17323") ? true : (stryCov_9fa48("17323", "17324", "17325"), (stryMutAct_9fa48("17326") ? directOptions.replicaId : (stryCov_9fa48("17326"), directOptions?.replicaId)) || definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]);
      const options = stryMutAct_9fa48("17329") ? directOptions && this.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION) : stryMutAct_9fa48("17328") ? false : stryMutAct_9fa48("17327") ? true : (stryCov_9fa48("17327", "17328", "17329"), directOptions || this.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION));
      if (stryMutAct_9fa48("17331") ? false : stryMutAct_9fa48("17330") ? true : (stryCov_9fa48("17330", "17331"), this.partitionServices.has(options.replicaId))) {
        if (stryMutAct_9fa48("17332")) {
          {}
        } else {
          stryCov_9fa48("17332");
          return stryMutAct_9fa48("17333") ? {} : (stryCov_9fa48("17333"), {
            status: SERVICE_LIFECYCLE_STATE.CREATED
          });
        }
      }
      if (stryMutAct_9fa48("17337") ? options.createDelayMs <= NUM.ZERO : stryMutAct_9fa48("17336") ? options.createDelayMs >= NUM.ZERO : stryMutAct_9fa48("17335") ? false : stryMutAct_9fa48("17334") ? true : (stryCov_9fa48("17334", "17335", "17336", "17337"), options.createDelayMs > NUM.ZERO)) {
        if (stryMutAct_9fa48("17338")) {
          {}
        } else {
          stryCov_9fa48("17338");
          await this.sleep(options.createDelayMs);
        }
      }
      await this.createJoinLocalPartitionService(options);
      return stryMutAct_9fa48("17339") ? {} : (stryCov_9fa48("17339"), {
        status: SERVICE_LIFECYCLE_STATE.CREATED
      });
    }
  } /**
    * Unified lifecycle start hook for join partition replicas.
    * @param {Object} replicaHandle
    * @param {Object} context
    * @return {Promise<Object>}
    * @private
    */
  async startJoinPartitionReplica(replicaHandle, context) {
    if (stryMutAct_9fa48("17340")) {
      {}
    } else {
      stryCov_9fa48("17340");
      const directOptions = stryMutAct_9fa48("17343") ? context?.replicaOptions && null : stryMutAct_9fa48("17342") ? false : stryMutAct_9fa48("17341") ? true : (stryCov_9fa48("17341", "17342", "17343"), (stryMutAct_9fa48("17344") ? context.replicaOptions : (stryCov_9fa48("17344"), context?.replicaOptions)) || null);
      const serviceId = stryMutAct_9fa48("17347") ? (directOptions?.replicaId || replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]) && replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : stryMutAct_9fa48("17346") ? false : stryMutAct_9fa48("17345") ? true : (stryCov_9fa48("17345", "17346", "17347"), (stryMutAct_9fa48("17349") ? directOptions?.replicaId && replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : stryMutAct_9fa48("17348") ? false : (stryCov_9fa48("17348", "17349"), (stryMutAct_9fa48("17350") ? directOptions.replicaId : (stryCov_9fa48("17350"), directOptions?.replicaId)) || replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID])) || replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]);
      const options = stryMutAct_9fa48("17353") ? directOptions && this.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION) : stryMutAct_9fa48("17352") ? false : stryMutAct_9fa48("17351") ? true : (stryCov_9fa48("17351", "17352", "17353"), directOptions || this.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION));
      const partition = this.partitionServices.get(options.replicaId);
      assertCritical(partition, stryMutAct_9fa48("17354") ? `` : (stryCov_9fa48("17354"), `Join partition replica ${options.replicaId} missing at start`));
      if (stryMutAct_9fa48("17357") ? !options.deferElection || typeof partition.startElection === TYPEOF.FUNCTION : stryMutAct_9fa48("17356") ? false : stryMutAct_9fa48("17355") ? true : (stryCov_9fa48("17355", "17356", "17357"), (stryMutAct_9fa48("17358") ? options.deferElection : (stryCov_9fa48("17358"), !options.deferElection)) && (stryMutAct_9fa48("17360") ? typeof partition.startElection !== TYPEOF.FUNCTION : stryMutAct_9fa48("17359") ? true : (stryCov_9fa48("17359", "17360"), typeof partition.startElection === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("17361")) {
          {}
        } else {
          stryCov_9fa48("17361");
          partition.startElection();
        }
      }
      return stryMutAct_9fa48("17362") ? {} : (stryCov_9fa48("17362"), {
        status: SERVICE_LIFECYCLE_STATE.RUNNING,
        deferred: Boolean(options.deferElection)
      });
    }
  } /**
    * Unified lifecycle stop hook for join partition replicas.
    * @param {Object} replicaHandle
    * @param {Object} context
    * @return {Promise<Object>}
    * @private
    */
  async stopJoinPartitionReplica(replicaHandle, context) {
    if (stryMutAct_9fa48("17363")) {
      {}
    } else {
      stryCov_9fa48("17363");
      const directOptions = stryMutAct_9fa48("17366") ? context?.replicaOptions && null : stryMutAct_9fa48("17365") ? false : stryMutAct_9fa48("17364") ? true : (stryCov_9fa48("17364", "17365", "17366"), (stryMutAct_9fa48("17367") ? context.replicaOptions : (stryCov_9fa48("17367"), context?.replicaOptions)) || null);
      const serviceId = stryMutAct_9fa48("17370") ? (directOptions?.replicaId || replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]) && replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : stryMutAct_9fa48("17369") ? false : stryMutAct_9fa48("17368") ? true : (stryCov_9fa48("17368", "17369", "17370"), (stryMutAct_9fa48("17372") ? directOptions?.replicaId && replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] : stryMutAct_9fa48("17371") ? false : (stryCov_9fa48("17371", "17372"), (stryMutAct_9fa48("17373") ? directOptions.replicaId : (stryCov_9fa48("17373"), directOptions?.replicaId)) || replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID])) || replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]);
      const options = stryMutAct_9fa48("17376") ? directOptions && this.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION) : stryMutAct_9fa48("17375") ? false : stryMutAct_9fa48("17374") ? true : (stryCov_9fa48("17374", "17375", "17376"), directOptions || this.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION));
      const partition = this.partitionServices.get(options.replicaId);
      if (stryMutAct_9fa48("17379") ? false : stryMutAct_9fa48("17378") ? true : stryMutAct_9fa48("17377") ? partition : (stryCov_9fa48("17377", "17378", "17379"), !partition)) {
        if (stryMutAct_9fa48("17380")) {
          {}
        } else {
          stryCov_9fa48("17380");
          return stryMutAct_9fa48("17381") ? {} : (stryCov_9fa48("17381"), {
            status: SERVICE_LIFECYCLE_STATE.STOPPED
          });
        }
      }
      if (stryMutAct_9fa48("17384") ? typeof partition.shutdown !== TYPEOF.FUNCTION : stryMutAct_9fa48("17383") ? false : stryMutAct_9fa48("17382") ? true : (stryCov_9fa48("17382", "17383", "17384"), typeof partition.shutdown === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("17385")) {
          {}
        } else {
          stryCov_9fa48("17385");
          await partition.shutdown();
        }
      }
      const unifiedAddress = (stryMutAct_9fa48("17388") ? typeof partition.getUnifiedAddress !== TYPEOF.FUNCTION : stryMutAct_9fa48("17387") ? false : stryMutAct_9fa48("17386") ? true : (stryCov_9fa48("17386", "17387", "17388"), typeof partition.getUnifiedAddress === TYPEOF.FUNCTION)) ? partition.getUnifiedAddress() : formatReplicatedServiceAddress(SERVICE_TYPE.PARTITION, this.nodeId, options.replicaId);
      stryMutAct_9fa48("17390") ? this.messageRouter.unregister?.(unifiedAddress) : stryMutAct_9fa48("17389") ? this.messageRouter?.unregister(unifiedAddress) : (stryCov_9fa48("17389", "17390"), this.messageRouter?.unregister?.(unifiedAddress));
      this.partitionServices.delete(options.replicaId);
      stryMutAct_9fa48("17393") ? this.replicaHandler.localServices?.delete?.(options.replicaId) : stryMutAct_9fa48("17392") ? this.replicaHandler?.localServices.delete?.(options.replicaId) : stryMutAct_9fa48("17391") ? this.replicaHandler?.localServices?.delete(options.replicaId) : (stryCov_9fa48("17391", "17392", "17393"), this.replicaHandler?.localServices?.delete?.(options.replicaId));
      stryMutAct_9fa48("17396") ? this.replicaHandler.localReplicas?.delete?.(options.replicaId) : stryMutAct_9fa48("17395") ? this.replicaHandler?.localReplicas.delete?.(options.replicaId) : stryMutAct_9fa48("17394") ? this.replicaHandler?.localReplicas?.delete(options.replicaId) : (stryCov_9fa48("17394", "17395", "17396"), this.replicaHandler?.localReplicas?.delete?.(options.replicaId));
      return stryMutAct_9fa48("17397") ? {} : (stryCov_9fa48("17397"), {
        status: SERVICE_LIFECYCLE_STATE.STOPPED
      });
    }
  } /**
    * Unified lifecycle start hook for join message-group replicas.
    * @param {Object} replicaHandle
    * @param {Object} _context
    * @return {Promise<Object>}
    * @private
    */
  async startJoinMessageGroupReplica(replicaHandle, _context) {
    if (stryMutAct_9fa48("17398")) {
      {}
    } else {
      stryCov_9fa48("17398");
      return this.createMessageGroupPhase.startJoinMessageGroupReplica(replicaHandle, _context);
    }
  } /**
    * Unified lifecycle stop hook for join message-group replicas.
    * @param {Object} replicaHandle
    * @param {Object} _context
    * @return {Promise<Object>}
    * @private
    */
  async stopJoinMessageGroupReplica(replicaHandle, _context) {
    if (stryMutAct_9fa48("17399")) {
      {}
    } else {
      stryCov_9fa48("17399");
      return this.createMessageGroupPhase.stopJoinMessageGroupReplica(replicaHandle, _context);
    }
  } /**
    * Compatibility shim for deferred self-hosted join elections.
    * Replica create/start ownership remains in unified lifecycle adapters.
    * @param {string} groupId - Message group ID.
    * @return {void}
    * @private
    */
  startDeferredJoinMessageGroupElections(groupId) {
    if (stryMutAct_9fa48("17400")) {
      {}
    } else {
      stryCov_9fa48("17400");
      return this.createMessageGroupPhase.startDeferredJoinMessageGroupElections(groupId);
    }
  } /**
    * Phase 3a: Create self-hosted message group (3 replicas on this node).
    * Requirements: 8.3 - Services created AFTER self-connection established.
    * @param {Object} assignment - Assignment instructions.
    * @return {Promise<void>}
    * @private
    */
  async phaseCreateSelfHostedMessageGroup(assignment) {
    if (stryMutAct_9fa48("17401")) {
      {}
    } else {
      stryCov_9fa48("17401");
      return this.createMessageGroupPhase.phaseCreateSelfHostedMessageGroup(assignment);
    }
  } /**
    * Get the leader message group service for sending lifecycle messages.
    * Returns the first local ingress-ready leader, or an ingress-ready relay
    * replica when the leader is remote.
    * @return {Object|null} Message group service or null.
    * @private
    */
  resolveOperationalMessageGroupSelection(options = {}) {
    if (stryMutAct_9fa48("17402")) {
      {}
    } else {
      stryCov_9fa48("17402");
      const requiredTables = (stryMutAct_9fa48("17405") ? Array.isArray(options.requiredTables) || options.requiredTables.length > 0 : stryMutAct_9fa48("17404") ? false : stryMutAct_9fa48("17403") ? true : (stryCov_9fa48("17403", "17404", "17405"), Array.isArray(options.requiredTables) && (stryMutAct_9fa48("17408") ? options.requiredTables.length <= 0 : stryMutAct_9fa48("17407") ? options.requiredTables.length >= 0 : stryMutAct_9fa48("17406") ? true : (stryCov_9fa48("17406", "17407", "17408"), options.requiredTables.length > 0)))) ? options.requiredTables : getControlPlaneMessageRequiredTables(ControlPlaneMessageType.NODE_STATE_UPDATE);
      return this.messageGroupSelectionOwner.resolveOperationalMessageGroupSelection(stryMutAct_9fa48("17409") ? {} : (stryCov_9fa48("17409"), {
        ...options,
        requiredTables
      }));
    }
  } /**
    * Resolve the local message-group transport used for query/data-plane
    * participation. This deliberately avoids control-plane metadata-ingress
    * gating so bootstrap reads can proceed during join convergence.
    * @return {Object}
    * @private
    */
  resolveQueryTransportMessageGroupSelection() {
    if (stryMutAct_9fa48("17410")) {
      {}
    } else {
      stryCov_9fa48("17410");
      return this.messageGroupSelectionOwner.resolveQueryTransportMessageGroupSelection();
    }
  } /**
    * Resolve operational ingress after authoritative strict-forward repair for
    * system-table CDC during join convergence.
    * @param {Object} [options]
    * @param {Array<string>} [options.requiredTables]
    * @return {Promise<Object>}
    * @private
    */
  async resolveOperationalMessageGroupSelectionAsync(options = {}) {
    if (stryMutAct_9fa48("17411")) {
      {}
    } else {
      stryCov_9fa48("17411");
      const requiredTables = (stryMutAct_9fa48("17414") ? Array.isArray(options.requiredTables) || options.requiredTables.length > 0 : stryMutAct_9fa48("17413") ? false : stryMutAct_9fa48("17412") ? true : (stryCov_9fa48("17412", "17413", "17414"), Array.isArray(options.requiredTables) && (stryMutAct_9fa48("17417") ? options.requiredTables.length <= 0 : stryMutAct_9fa48("17416") ? options.requiredTables.length >= 0 : stryMutAct_9fa48("17415") ? true : (stryCov_9fa48("17415", "17416", "17417"), options.requiredTables.length > 0)))) ? options.requiredTables : getControlPlaneMessageRequiredTables(ControlPlaneMessageType.NODE_STATE_UPDATE);
      return this.messageGroupSelectionOwner.resolveOperationalMessageGroupSelectionAsync(stryMutAct_9fa48("17418") ? {} : (stryCov_9fa48("17418"), {
        ...options,
        requiredTables
      }));
    }
  } /**
    * Get the operational message-group service for sending lifecycle messages.
    * Returns the first local ingress-ready leader, or an ingress-ready relay
    * replica when the leader is remote.
    * @param {Object} [options]
    * @param {Array<string>} [options.requiredTables]
    * @return {Object|null} Message group service or null.
    * @private
    */
  getLeaderMessageGroupService(options = {}) {
    if (stryMutAct_9fa48("17419")) {
      {}
    } else {
      stryCov_9fa48("17419");
      return this.resolveOperationalMessageGroupSelection(options).service;
    }
  }
  buildMessageGroupOwnerNotReadyError(selection = {}, options = {}) {
    if (stryMutAct_9fa48("17420")) {
      {}
    } else {
      stryCov_9fa48("17420");
      return this.messageGroupSelectionOwner.buildMessageGroupOwnerNotReadyError(selection, options);
    }
  } /**
    * Resolve the message-group service to use for partition CDC propagation.
    * Prefers the current operational ingress and falls back to the captured
    * subscription ingress when it still satisfies metadata-ingress readiness.
    * @param {Object|null} preferredMessageGroupService
    * @param {Object} [options]
    * @param {Array<string>} [options.requiredTables]
    * @return {Promise<Object|null>}
    */
  async resolveCdcPropagationMessageGroup(preferredMessageGroupService, options = {}) {
    if (stryMutAct_9fa48("17421")) {
      {}
    } else {
      stryCov_9fa48("17421");
      const selection = await this.resolveOperationalMessageGroupSelectionAsync(stryMutAct_9fa48("17422") ? {} : (stryCov_9fa48("17422"), {
        requiredTables: Array.isArray(options.requiredTables) ? options.requiredTables : stryMutAct_9fa48("17423") ? ["Stryker was here"] : (stryCov_9fa48("17423"), []),
        preferredService: preferredMessageGroupService
      }));
      return stryMutAct_9fa48("17426") ? selection.service && null : stryMutAct_9fa48("17425") ? false : stryMutAct_9fa48("17424") ? true : (stryCov_9fa48("17424", "17425", "17426"), selection.service || null);
    }
  } /**
    * Enforce single-owner invariant before starting a local message-group replica.
    * Unauthorized duplicate startup must fail fast.
    * @param {string} replicaId
    * @return {void}
    * @private
    */
  assertReplicaStartupOwnership(replicaId) {
    if (stryMutAct_9fa48("17427")) {
      {}
    } else {
      stryCov_9fa48("17427");
      return this.joinMessageGroupRuntimeOwner.assertReplicaStartupOwnership(replicaId);
    }
  } /**
    * Phase 3b: Join existing message group by moving a replica.
    * Requirements: 8.3 - Services created AFTER self-connection established.
    * @param {Object} assignment - Assignment instructions.
    * @return {Promise<void>}
    * @private
    */
  async phaseJoinExistingMessageGroup(assignment) {
    if (stryMutAct_9fa48("17428")) {
      {}
    } else {
      stryCov_9fa48("17428");
      return this.joinMessageGroupRuntimeOwner.phaseJoinExistingMessageGroup(assignment);
    }
  } /**
    * Register a message group service in the cluster's services table.
    * This ensures other nodes can discover this replica.
    * @param {string} groupId - Message group ID.
    * @param {string} replicaId - Replica ID.
    * @param {MessageGroupService} service - The message group service.
    * @return {Promise<void>}
    * @private
    */
  async registerMessageGroupService(groupId, replicaId, service, options = {}) {
    if (stryMutAct_9fa48("17429")) {
      {}
    } else {
      stryCov_9fa48("17429");
      return this.createMessageGroupPhase.registerMessageGroupService(groupId, replicaId, service, options);
    }
  }
  hasPublishedLocalServiceEndpoints() {
    if (stryMutAct_9fa48("17430")) {
      {}
    } else {
      stryCov_9fa48("17430");
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const localEndpointRows = stryMutAct_9fa48("17433") ? systemTableCache?.filter?.(TABLES.SERVICE_ENDPOINTS, row => row?.[COLUMN.NODE_ID] === this.nodeId) && (systemTableCache?.getAll?.(TABLES.SERVICE_ENDPOINTS) || []).filter(row => row?.[COLUMN.NODE_ID] === this.nodeId) : stryMutAct_9fa48("17432") ? false : stryMutAct_9fa48("17431") ? true : (stryCov_9fa48("17431", "17432", "17433"), (stryMutAct_9fa48("17436") ? systemTableCache.filter?.(TABLES.SERVICE_ENDPOINTS, row => row?.[COLUMN.NODE_ID] === this.nodeId) : stryMutAct_9fa48("17435") ? systemTableCache?.filter(TABLES.SERVICE_ENDPOINTS, row => row?.[COLUMN.NODE_ID] === this.nodeId) : stryMutAct_9fa48("17434") ? systemTableCache : (stryCov_9fa48("17434", "17435", "17436"), systemTableCache?.filter?.(TABLES.SERVICE_ENDPOINTS, stryMutAct_9fa48("17437") ? () => undefined : (stryCov_9fa48("17437"), row => stryMutAct_9fa48("17440") ? row?.[COLUMN.NODE_ID] !== this.nodeId : stryMutAct_9fa48("17439") ? false : stryMutAct_9fa48("17438") ? true : (stryCov_9fa48("17438", "17439", "17440"), (stryMutAct_9fa48("17441") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("17441"), row?.[COLUMN.NODE_ID])) === this.nodeId))))) || (stryMutAct_9fa48("17442") ? systemTableCache?.getAll?.(TABLES.SERVICE_ENDPOINTS) || [] : (stryCov_9fa48("17442"), (stryMutAct_9fa48("17445") ? systemTableCache?.getAll?.(TABLES.SERVICE_ENDPOINTS) && [] : stryMutAct_9fa48("17444") ? false : stryMutAct_9fa48("17443") ? true : (stryCov_9fa48("17443", "17444", "17445"), (stryMutAct_9fa48("17447") ? systemTableCache.getAll?.(TABLES.SERVICE_ENDPOINTS) : stryMutAct_9fa48("17446") ? systemTableCache?.getAll(TABLES.SERVICE_ENDPOINTS) : (stryCov_9fa48("17446", "17447"), systemTableCache?.getAll?.(TABLES.SERVICE_ENDPOINTS))) || (stryMutAct_9fa48("17448") ? ["Stryker was here"] : (stryCov_9fa48("17448"), [])))).filter(stryMutAct_9fa48("17449") ? () => undefined : (stryCov_9fa48("17449"), row => stryMutAct_9fa48("17452") ? row?.[COLUMN.NODE_ID] !== this.nodeId : stryMutAct_9fa48("17451") ? false : stryMutAct_9fa48("17450") ? true : (stryCov_9fa48("17450", "17451", "17452"), (stryMutAct_9fa48("17453") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("17453"), row?.[COLUMN.NODE_ID])) === this.nodeId))))));
      return stryMutAct_9fa48("17457") ? localEndpointRows.length <= NUM.ZERO : stryMutAct_9fa48("17456") ? localEndpointRows.length >= NUM.ZERO : stryMutAct_9fa48("17455") ? false : stryMutAct_9fa48("17454") ? true : (stryCov_9fa48("17454", "17455", "17456", "17457"), localEndpointRows.length > NUM.ZERO);
    }
  }
  getRegisteredJoinNodeId() {
    if (stryMutAct_9fa48("17458")) {
      {}
    } else {
      stryCov_9fa48("17458");
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const nodeRow = stryMutAct_9fa48("17460") ? systemTableCache.get?.(TABLES.NODES, this.nodeId) : stryMutAct_9fa48("17459") ? systemTableCache?.get(TABLES.NODES, this.nodeId) : (stryCov_9fa48("17459", "17460"), systemTableCache?.get?.(TABLES.NODES, this.nodeId));
      return nodeRow ? this.nodeId : null;
    }
  }
  async activateMessageGroupServiceRows() {
    if (stryMutAct_9fa48("17461")) {
      {}
    } else {
      stryCov_9fa48("17461");
      return activateMessageGroupServiceRows(stryMutAct_9fa48("17462") ? {} : (stryCov_9fa48("17462"), {
        nodeId: this.nodeId,
        activateReplica: async ({
          groupId,
          replicaId,
          service
        }) => {
          if (stryMutAct_9fa48("17463")) {
            {}
          } else {
            stryCov_9fa48("17463");
            await this.registerMessageGroupService(groupId, replicaId, service, stryMutAct_9fa48("17464") ? {} : (stryCov_9fa48("17464"), {
              status: SERVICE_STATUS.ACTIVE
            }));
          }
        },
        messageRouter: this.messageRouter,
        messageGroupServiceHandler: this.messageGroupServiceHandler,
        endpointsPublished: this.hasPublishedLocalServiceEndpoints(),
        messageGroupServices: this.messageGroupServices
      }));
    }
  }
  async activateJoinPartitionServiceRows(replicaIds = null) {
    if (stryMutAct_9fa48("17465")) {
      {}
    } else {
      stryCov_9fa48("17465");
      const partitionServices = (stryMutAct_9fa48("17468") ? replicaIds != null : stryMutAct_9fa48("17467") ? false : stryMutAct_9fa48("17466") ? true : (stryCov_9fa48("17466", "17467", "17468"), replicaIds == null)) ? this.partitionServices : new Map(stryMutAct_9fa48("17469") ? replicaIds.map(replicaId => [replicaId, this.partitionServices.get(replicaId)]) : (stryCov_9fa48("17469"), replicaIds.map(stryMutAct_9fa48("17470") ? () => undefined : (stryCov_9fa48("17470"), replicaId => stryMutAct_9fa48("17471") ? [] : (stryCov_9fa48("17471"), [replicaId, this.partitionServices.get(replicaId)]))).filter(stryMutAct_9fa48("17472") ? () => undefined : (stryCov_9fa48("17472"), ([, service]) => stryMutAct_9fa48("17475") ? service == null : stryMutAct_9fa48("17474") ? false : stryMutAct_9fa48("17473") ? true : (stryCov_9fa48("17473", "17474", "17475"), service != null)))));
      return activatePartitionServiceRows(stryMutAct_9fa48("17476") ? {} : (stryCov_9fa48("17476"), {
        nodeId: this.nodeId,
        systemTableWriter: this.createCdcIntegrationService(),
        messageRouter: this.messageRouter,
        deferTransientFailures: stryMutAct_9fa48("17477") ? false : (stryCov_9fa48("17477"), true),
        onDeferredActivation: ({
          partitionId,
          replicaId,
          error
        }) => {
          if (stryMutAct_9fa48("17478")) {
            {}
          } else {
            stryCov_9fa48("17478");
            this.logger.warn(NODE_JOINING_SERVICE_LITERAL.DEFERRING_JOIN_PARTITION_SERVICE_ROW_ACTIVATION, stryMutAct_9fa48("17479") ? {} : (stryCov_9fa48("17479"), {
              nodeId: this.nodeId,
              partitionId,
              replicaId,
              error: stryMutAct_9fa48("17482") ? error?.message && String(error) : stryMutAct_9fa48("17481") ? false : stryMutAct_9fa48("17480") ? true : (stryCov_9fa48("17480", "17481", "17482"), (stryMutAct_9fa48("17483") ? error.message : (stryCov_9fa48("17483"), error?.message)) || String(error))
            }));
          }
        },
        partitionServices
      }));
    }
  }
  startJoinOpportunisticBackfill() {
    if (stryMutAct_9fa48("17484")) {
      {}
    } else {
      stryCov_9fa48("17484");
      return this.querySystemStatePhase.startJoinOpportunisticBackfill();
    }
  } /**
    * Persist metadata required for CREATE_SELF_HOSTED joins.
    * Ensures message_groups and per-replica services rows are present before
    * join can complete successfully.
    * @return {Promise<void>}
    * @private
    */
  async registerCreateSelfHostedMetadata() {
    if (stryMutAct_9fa48("17485")) {
      {}
    } else {
      stryCov_9fa48("17485");
      return this.createMessageGroupPhase.registerCreateSelfHostedMetadata();
    }
  } /**
    * Phase 3: Wait for message group leadership establishment.
    * @return {Promise<void>}
    * @private
    */
  async phaseWaitForLeadership() {
    if (stryMutAct_9fa48("17486")) {
      {}
    } else {
      stryCov_9fa48("17486");
      return this.waitForLeadershipPhase.phaseWaitForLeadership();
    }
  } /**
    * Build bootstrap payload for IDENTIFY message.
    * @return {Object|null} Identify bootstrap payload.
    * @private
    */
  getIdentifyBootstrapPayload() {
    if (stryMutAct_9fa48("17487")) {
      {}
    } else {
      stryCov_9fa48("17487");
      if (stryMutAct_9fa48("17490") ? false : stryMutAct_9fa48("17489") ? true : stryMutAct_9fa48("17488") ? this.bootstrapResponse : (stryCov_9fa48("17488", "17489", "17490"), !this.bootstrapResponse)) {
        if (stryMutAct_9fa48("17491")) {
          {}
        } else {
          stryCov_9fa48("17491");
          return null;
        }
      }
      return stryMutAct_9fa48("17492") ? {} : (stryCov_9fa48("17492"), {
        seedNodeId: this.seedNodeId,
        seedNodeWsAddress: this.seedNodeWsAddress,
        messageGroupAssignment: this.bootstrapResponse.messageGroupAssignment,
        partitionLeaders: this.bootstrapResponse.partitionLeaders,
        latencyTopologyHints: this.bootstrapResponse.latencyTopologyHints,
        clusterConfig: this.bootstrapResponse.clusterConfig,
        timestamp: this.bootstrapResponse.timestamp
      });
    }
  } /**
    * Get the default node capabilities for control plane registration.
    * @return {Array<string>} Capabilities list.
    * @private
    */
  getNodeCapabilities() {
    if (stryMutAct_9fa48("17493")) {
      {}
    } else {
      stryCov_9fa48("17493");
      return stryMutAct_9fa48("17494") ? [] : (stryCov_9fa48("17494"), [...DEFAULT_NODE_CAPABILITIES]);
    }
  } /**
    * Resolve the control plane message target address.
    * Prefer authoritative services-table metadata. Bootstrap peer hints are
    * used only when authoritative metadata is not yet available.
    * @param {Object} [options] - Resolution options.
    * @param {boolean} [options.allowBootstrapHints=true] - Allow hint fallback.
    * @param {boolean} [options.allowSelfTarget=false] - Allow local message-group targets.
    * @return {string|null} Target address or null.
    * @private
    */
  resolveControlPlaneTargetAddress(options = {}) {
    if (stryMutAct_9fa48("17495")) {
      {}
    } else {
      stryCov_9fa48("17495");
      return stryMutAct_9fa48("17498") ? this.resolveControlPlaneTargetAddressCandidates(options)[NUM.ZERO] && null : stryMutAct_9fa48("17497") ? false : stryMutAct_9fa48("17496") ? true : (stryCov_9fa48("17496", "17497", "17498"), this.resolveControlPlaneTargetAddressCandidates(options)[NUM.ZERO] || null);
    }
  } /**
    * Resolve ordered control-plane target candidates.
    * Prefer local authoritative ingress, then remote authoritative ingress,
    * then bootstrap hints as a last resort.
    * @param {Object} [options] - Resolution options.
    * @param {boolean} [options.allowBootstrapHints=true] - Allow hint fallback.
    * @param {boolean} [options.allowSelfTarget=false] - Allow local targets.
    * @return {Array<string>} Ordered unique target addresses.
    * @private
    */
  resolveControlPlaneTargetAddressCandidates(options = {}) {
    if (stryMutAct_9fa48("17499")) {
      {}
    } else {
      stryCov_9fa48("17499");
      return this.controlPlaneKernelIngress.resolveTargetCandidates(options);
    }
  } /**
    * Resolve ordered target candidates for one NODE_STATE_UPDATE publication.
    * READY heartbeat publications prefer remote authoritative ingress first so
    * a newly self-hosted local ingress replica does not trap liveness updates
    * behind its own still-converging metadata path. Earlier lifecycle updates
    * keep the existing local-first behavior, and READY heartbeats still retain
    * local fallback when no remote ingress is reachable.
    * @param {Object} [options]
    * @param {string} [options.state]
    * @param {number} [options.heartbeatAt]
    * @return {Array<string>}
    * @private
    */
  resolveNodeStateUpdateTargetCandidates(options = {}) {
    if (stryMutAct_9fa48("17500")) {
      {}
    } else {
      stryCov_9fa48("17500");
      return this.controlPlaneKernelIngress.resolveNodeStateUpdateTargetCandidates(stryMutAct_9fa48("17501") ? {} : (stryCov_9fa48("17501"), {
        ...options,
        allowBootstrapHints: stryMutAct_9fa48("17502") ? false : (stryCov_9fa48("17502"), true),
        localTargetMode: NODE_JOINING_SERVICE_LITERAL.ANY_REPLICA,
        requiredTables: getControlPlaneMessageRequiredTables(ControlPlaneMessageType.NODE_STATE_UPDATE)
      }));
    }
  } /**
    * Determine whether a control-plane publication failure should be retried
    * against a different target address.
    * @param {?Error} error
    * @return {boolean}
    * @private
    */
  shouldRetryControlPlaneNodeStateUpdate(error) {
    if (stryMutAct_9fa48("17503")) {
      {}
    } else {
      stryCov_9fa48("17503");
      const message = (stryMutAct_9fa48("17506") ? typeof error?.message !== TYPEOF.STRING : stryMutAct_9fa48("17505") ? false : stryMutAct_9fa48("17504") ? true : (stryCov_9fa48("17504", "17505", "17506"), typeof (stryMutAct_9fa48("17507") ? error.message : (stryCov_9fa48("17507"), error?.message)) === TYPEOF.STRING)) ? error.message : stryMutAct_9fa48("17508") ? "Stryker was here!" : (stryCov_9fa48("17508"), '');
      return stryMutAct_9fa48("17511") ? (message.includes(NODE_JOINING_SERVICE_LITERAL.NO_CONNECTION_TO_NODE) || message.includes(NODE_JOINING_SERVICE_LITERAL.CONNECTION_TO_NODE) && message.includes(NODE_JOINING_SERVICE_LITERAL.CLOSED) || message.includes(NODE_JOINING_SERVICE_LITERAL.MESSAGE_TIMEOUT) || message.includes(NODE_JOINING_SERVICE_LITERAL.NO_HANDLER_REGISTERED_FOR_ADDRESS)) && message.includes(JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING) : stryMutAct_9fa48("17510") ? false : stryMutAct_9fa48("17509") ? true : (stryCov_9fa48("17509", "17510", "17511"), (stryMutAct_9fa48("17513") ? (message.includes(NODE_JOINING_SERVICE_LITERAL.NO_CONNECTION_TO_NODE) || message.includes(NODE_JOINING_SERVICE_LITERAL.CONNECTION_TO_NODE) && message.includes(NODE_JOINING_SERVICE_LITERAL.CLOSED) || message.includes(NODE_JOINING_SERVICE_LITERAL.MESSAGE_TIMEOUT)) && message.includes(NODE_JOINING_SERVICE_LITERAL.NO_HANDLER_REGISTERED_FOR_ADDRESS) : stryMutAct_9fa48("17512") ? false : (stryCov_9fa48("17512", "17513"), (stryMutAct_9fa48("17515") ? (message.includes(NODE_JOINING_SERVICE_LITERAL.NO_CONNECTION_TO_NODE) || message.includes(NODE_JOINING_SERVICE_LITERAL.CONNECTION_TO_NODE) && message.includes(NODE_JOINING_SERVICE_LITERAL.CLOSED)) && message.includes(NODE_JOINING_SERVICE_LITERAL.MESSAGE_TIMEOUT) : stryMutAct_9fa48("17514") ? false : (stryCov_9fa48("17514", "17515"), (stryMutAct_9fa48("17517") ? message.includes(NODE_JOINING_SERVICE_LITERAL.NO_CONNECTION_TO_NODE) && message.includes(NODE_JOINING_SERVICE_LITERAL.CONNECTION_TO_NODE) && message.includes(NODE_JOINING_SERVICE_LITERAL.CLOSED) : stryMutAct_9fa48("17516") ? false : (stryCov_9fa48("17516", "17517"), message.includes(NODE_JOINING_SERVICE_LITERAL.NO_CONNECTION_TO_NODE) || (stryMutAct_9fa48("17519") ? message.includes(NODE_JOINING_SERVICE_LITERAL.CONNECTION_TO_NODE) || message.includes(NODE_JOINING_SERVICE_LITERAL.CLOSED) : stryMutAct_9fa48("17518") ? false : (stryCov_9fa48("17518", "17519"), message.includes(NODE_JOINING_SERVICE_LITERAL.CONNECTION_TO_NODE) && message.includes(NODE_JOINING_SERVICE_LITERAL.CLOSED))))) || message.includes(NODE_JOINING_SERVICE_LITERAL.MESSAGE_TIMEOUT))) || message.includes(NODE_JOINING_SERVICE_LITERAL.NO_HANDLER_REGISTERED_FOR_ADDRESS))) || message.includes(JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING));
    }
  } /**
    * Send a NODE_STATE_UPDATE control-plane message through the current
    * authoritative target address.
    * @param {Object} options - Node state payload.
    * @param {string} options.state - Node connection state.
    * @param {Array<string>|string} [options.capabilities] - Node capabilities.
    * @param {number} [options.heartbeatAt] - Heartbeat timestamp.
    * @param {number} [options.readyLeaseExpiresAt] - Lease expiry timestamp.
    * @param {boolean} [options.heartbeatOnly] - Set for liveness-only updates.
    * @param {Object} [options.nodeRow] - Full node row payload.
    * @return {Promise<void>}
    * @private
    */
  async sendControlPlaneNodeStateUpdate(options = {}) {
    if (stryMutAct_9fa48("17520")) {
      {}
    } else {
      stryCov_9fa48("17520");
      const state = options.state;
      if (stryMutAct_9fa48("17523") ? false : stryMutAct_9fa48("17522") ? true : stryMutAct_9fa48("17521") ? state : (stryCov_9fa48("17521", "17522", "17523"), !state)) {
        if (stryMutAct_9fa48("17524")) {
          {}
        } else {
          stryCov_9fa48("17524");
          return;
        }
      }
      this.triggerBackgroundClusterMeshReconciliation(state);
      let targetCandidates =
      // NODE_STATE_UPDATE is idempotent, but it still produces canonical
      // metadata writes. Prefer ingress that is already authoritative for
      // steady READY heartbeat publications, while retaining local fallback.
      this.resolveNodeStateUpdateTargetCandidates(stryMutAct_9fa48("17525") ? {} : (stryCov_9fa48("17525"), {
        state,
        heartbeatAt: options.heartbeatAt
      }));
      if (stryMutAct_9fa48("17528") ? false : stryMutAct_9fa48("17527") ? true : stryMutAct_9fa48("17526") ? Array.isArray(targetCandidates) : (stryCov_9fa48("17526", "17527", "17528"), !Array.isArray(targetCandidates))) {
        if (stryMutAct_9fa48("17529")) {
          {}
        } else {
          stryCov_9fa48("17529");
          targetCandidates = stryMutAct_9fa48("17530") ? ["Stryker was here"] : (stryCov_9fa48("17530"), []);
        }
      }
      if (stryMutAct_9fa48("17533") ? targetCandidates.length === NUM.ZERO || typeof this.resolveControlPlaneTargetAddressCandidates === TYPEOF.FUNCTION : stryMutAct_9fa48("17532") ? false : stryMutAct_9fa48("17531") ? true : (stryCov_9fa48("17531", "17532", "17533"), (stryMutAct_9fa48("17535") ? targetCandidates.length !== NUM.ZERO : stryMutAct_9fa48("17534") ? true : (stryCov_9fa48("17534", "17535"), targetCandidates.length === NUM.ZERO)) && (stryMutAct_9fa48("17537") ? typeof this.resolveControlPlaneTargetAddressCandidates !== TYPEOF.FUNCTION : stryMutAct_9fa48("17536") ? true : (stryCov_9fa48("17536", "17537"), typeof this.resolveControlPlaneTargetAddressCandidates === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("17538")) {
          {}
        } else {
          stryCov_9fa48("17538");
          const legacyTargetCandidates = this.resolveControlPlaneTargetAddressCandidates(stryMutAct_9fa48("17539") ? {} : (stryCov_9fa48("17539"), {
            allowBootstrapHints: stryMutAct_9fa48("17540") ? false : (stryCov_9fa48("17540"), true),
            allowSelfTarget: stryMutAct_9fa48("17541") ? true : (stryCov_9fa48("17541"), false)
          }));
          if (stryMutAct_9fa48("17543") ? false : stryMutAct_9fa48("17542") ? true : (stryCov_9fa48("17542", "17543"), Array.isArray(legacyTargetCandidates))) {
            if (stryMutAct_9fa48("17544")) {
              {}
            } else {
              stryCov_9fa48("17544");
              targetCandidates = stryMutAct_9fa48("17545") ? legacyTargetCandidates : (stryCov_9fa48("17545"), legacyTargetCandidates.filter((candidate, index, list) => {
                if (stryMutAct_9fa48("17546")) {
                  {}
                } else {
                  stryCov_9fa48("17546");
                  return stryMutAct_9fa48("17549") ? list.indexOf(candidate) !== index : stryMutAct_9fa48("17548") ? false : stryMutAct_9fa48("17547") ? true : (stryCov_9fa48("17547", "17548", "17549"), list.indexOf(candidate) === index);
                }
              }));
            }
          }
        }
      }
      if (stryMutAct_9fa48("17552") ? targetCandidates.length !== NUM.ZERO : stryMutAct_9fa48("17551") ? false : stryMutAct_9fa48("17550") ? true : (stryCov_9fa48("17550", "17551", "17552"), targetCandidates.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("17553")) {
          {}
        } else {
          stryCov_9fa48("17553");
          this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_TARGET_MISSING, stryMutAct_9fa48("17554") ? {} : (stryCov_9fa48("17554"), {
            nodeId: this.nodeId,
            state
          }));
          throw new Error(JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING);
        }
      }
      const message = stryMutAct_9fa48("17555") ? {} : (stryCov_9fa48("17555"), {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: this.nodeId,
        [ControlPlaneField.NODE_ADDRESS]: this.nodeAddress,
        [ControlPlaneField.CAPABILITIES]: stryMutAct_9fa48("17556") ? options.capabilities && this.getNodeCapabilities() : (stryCov_9fa48("17556"), options.capabilities ?? this.getNodeCapabilities()),
        [ControlPlaneField.STATE]: state
      });
      if (stryMutAct_9fa48("17559") ? options.heartbeatOnly !== true : stryMutAct_9fa48("17558") ? false : stryMutAct_9fa48("17557") ? true : (stryCov_9fa48("17557", "17558", "17559"), options.heartbeatOnly === (stryMutAct_9fa48("17560") ? false : (stryCov_9fa48("17560"), true)))) {
        if (stryMutAct_9fa48("17561")) {
          {}
        } else {
          stryCov_9fa48("17561");
          message[ControlPlaneField.HEARTBEAT_ONLY] = stryMutAct_9fa48("17562") ? false : (stryCov_9fa48("17562"), true);
        }
      }
      if (stryMutAct_9fa48("17564") ? false : stryMutAct_9fa48("17563") ? true : (stryCov_9fa48("17563", "17564"), Number.isFinite(options.heartbeatAt))) {
        if (stryMutAct_9fa48("17565")) {
          {}
        } else {
          stryCov_9fa48("17565");
          message[ControlPlaneField.HEARTBEAT_AT] = options.heartbeatAt;
        }
      }
      if (stryMutAct_9fa48("17567") ? false : stryMutAct_9fa48("17566") ? true : (stryCov_9fa48("17566", "17567"), Number.isFinite(options.readyLeaseExpiresAt))) {
        if (stryMutAct_9fa48("17568")) {
          {}
        } else {
          stryCov_9fa48("17568");
          message[ControlPlaneField.READY_LEASE_EXPIRES_AT] = options.readyLeaseExpiresAt;
        }
      }
      if (stryMutAct_9fa48("17571") ? options.nodeRow || typeof options.nodeRow === NODE_JOINING_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("17570") ? false : stryMutAct_9fa48("17569") ? true : (stryCov_9fa48("17569", "17570", "17571"), options.nodeRow && (stryMutAct_9fa48("17573") ? typeof options.nodeRow !== NODE_JOINING_SERVICE_LITERAL.OBJECT : stryMutAct_9fa48("17572") ? true : (stryCov_9fa48("17572", "17573"), typeof options.nodeRow === NODE_JOINING_SERVICE_LITERAL.OBJECT)))) {
        if (stryMutAct_9fa48("17574")) {
          {}
        } else {
          stryCov_9fa48("17574");
          message[ControlPlaneField.NODE_ROW] = options.nodeRow;
        }
      }
      let lastError = null;
      for (let attempt = NUM.ZERO; stryMutAct_9fa48("17577") ? attempt >= targetCandidates.length : stryMutAct_9fa48("17576") ? attempt <= targetCandidates.length : stryMutAct_9fa48("17575") ? false : (stryCov_9fa48("17575", "17576", "17577"), attempt < targetCandidates.length); stryMutAct_9fa48("17578") ? attempt-- : (stryCov_9fa48("17578"), attempt++)) {
        if (stryMutAct_9fa48("17579")) {
          {}
        } else {
          stryCov_9fa48("17579");
          const targetAddress = targetCandidates[attempt];
          if (stryMutAct_9fa48("17582") ? this.controlPlaneTargetAddress || this.controlPlaneTargetAddress !== targetAddress : stryMutAct_9fa48("17581") ? false : stryMutAct_9fa48("17580") ? true : (stryCov_9fa48("17580", "17581", "17582"), this.controlPlaneTargetAddress && (stryMutAct_9fa48("17584") ? this.controlPlaneTargetAddress === targetAddress : stryMutAct_9fa48("17583") ? true : (stryCov_9fa48("17583", "17584"), this.controlPlaneTargetAddress !== targetAddress)))) {
            if (stryMutAct_9fa48("17585")) {
              {}
            } else {
              stryCov_9fa48("17585");
              this.logger.info(JOINING_LOG_MSG.CONTROL_PLANE_TARGET_UPDATED, stryMutAct_9fa48("17586") ? {} : (stryCov_9fa48("17586"), {
                nodeId: this.nodeId,
                previousTargetAddress: this.controlPlaneTargetAddress,
                targetAddress,
                state
              }));
            }
          }
          this.controlPlaneTargetAddress = targetAddress;
          const targetAddressParts = String(targetAddress).split(stryMutAct_9fa48("17587") ? "" : (stryCov_9fa48("17587"), '/'));
          const publicationDiagnostics = stryMutAct_9fa48("17588") ? {} : (stryCov_9fa48("17588"), {
            publicationPath: stryMutAct_9fa48("17589") ? "" : (stryCov_9fa48("17589"), 'node_state_reporter'),
            targetAddress,
            targetNodeId: stryMutAct_9fa48("17592") ? targetAddressParts[0] && null : stryMutAct_9fa48("17591") ? false : stryMutAct_9fa48("17590") ? true : (stryCov_9fa48("17590", "17591", "17592"), targetAddressParts[0] || null),
            targetServiceType: stryMutAct_9fa48("17595") ? targetAddressParts[1] && null : stryMutAct_9fa48("17594") ? false : stryMutAct_9fa48("17593") ? true : (stryCov_9fa48("17593", "17594", "17595"), targetAddressParts[1] || null),
            targetServiceId: stryMutAct_9fa48("17598") ? targetAddressParts.slice(2).join('/') && null : stryMutAct_9fa48("17597") ? false : stryMutAct_9fa48("17596") ? true : (stryCov_9fa48("17596", "17597", "17598"), (stryMutAct_9fa48("17599") ? targetAddressParts.join('/') : (stryCov_9fa48("17599"), targetAddressParts.slice(2).join(stryMutAct_9fa48("17600") ? "" : (stryCov_9fa48("17600"), '/')))) || null)
          });
          try {
            if (stryMutAct_9fa48("17601")) {
              {}
            } else {
              stryCov_9fa48("17601");
              const deliveryTimeoutMs = this.resolveControlPlaneNodeStateUpdateTimeoutMs(options);
              const deliveryResult = await this.messageRouter.deliver(targetAddress, message, stryMutAct_9fa48("17602") ? {} : (stryCov_9fa48("17602"), {
                deliveryPriority: options.heartbeatOnly ? stryMutAct_9fa48("17603") ? "" : (stryCov_9fa48("17603"), 'background') : stryMutAct_9fa48("17604") ? "" : (stryCov_9fa48("17604"), 'critical'),
                timeoutMs: deliveryTimeoutMs
              }));
              if (stryMutAct_9fa48("17607") ? deliveryResult?.acknowledged === true : stryMutAct_9fa48("17606") ? false : stryMutAct_9fa48("17605") ? true : (stryCov_9fa48("17605", "17606", "17607"), (stryMutAct_9fa48("17608") ? deliveryResult.acknowledged : (stryCov_9fa48("17608"), deliveryResult?.acknowledged)) !== (stryMutAct_9fa48("17609") ? false : (stryCov_9fa48("17609"), true)))) {
                if (stryMutAct_9fa48("17610")) {
                  {}
                } else {
                  stryCov_9fa48("17610");
                  throw new Error(stryMutAct_9fa48("17613") ? deliveryResult?.error && NODE_JOINING_SERVICE_LITERAL.CONTROL_PLANE_MESSAGE_WAS_NOT_ACKNOWLEDGED : stryMutAct_9fa48("17612") ? false : stryMutAct_9fa48("17611") ? true : (stryCov_9fa48("17611", "17612", "17613"), (stryMutAct_9fa48("17614") ? deliveryResult.error : (stryCov_9fa48("17614"), deliveryResult?.error)) || NODE_JOINING_SERVICE_LITERAL.CONTROL_PLANE_MESSAGE_WAS_NOT_ACKNOWLEDGED));
                }
              }
              if (stryMutAct_9fa48("17617") ? deliveryResult?.noHandler !== true : stryMutAct_9fa48("17616") ? false : stryMutAct_9fa48("17615") ? true : (stryCov_9fa48("17615", "17616", "17617"), (stryMutAct_9fa48("17618") ? deliveryResult.noHandler : (stryCov_9fa48("17618"), deliveryResult?.noHandler)) === (stryMutAct_9fa48("17619") ? false : (stryCov_9fa48("17619"), true)))) {
                if (stryMutAct_9fa48("17620")) {
                  {}
                } else {
                  stryCov_9fa48("17620");
                  throw new Error(stryMutAct_9fa48("17623") ? deliveryResult?.error && `No handler registered for address ${targetAddress}` : stryMutAct_9fa48("17622") ? false : stryMutAct_9fa48("17621") ? true : (stryCov_9fa48("17621", "17622", "17623"), (stryMutAct_9fa48("17624") ? deliveryResult.error : (stryCov_9fa48("17624"), deliveryResult?.error)) || (stryMutAct_9fa48("17625") ? `` : (stryCov_9fa48("17625"), `No handler registered for address ${targetAddress}`))));
                }
              }
              this.logger.info(JOINING_LOG_MSG.NODE_STATE_UPDATE_SENT, stryMutAct_9fa48("17626") ? {} : (stryCov_9fa48("17626"), {
                nodeId: this.nodeId,
                targetAddress,
                state
              }));
              if (stryMutAct_9fa48("17629") ? typeof this.controlPlaneKernelIngress?.noteSuccessfulTarget !== TYPEOF.FUNCTION : stryMutAct_9fa48("17628") ? false : stryMutAct_9fa48("17627") ? true : (stryCov_9fa48("17627", "17628", "17629"), typeof (stryMutAct_9fa48("17630") ? this.controlPlaneKernelIngress.noteSuccessfulTarget : (stryCov_9fa48("17630"), this.controlPlaneKernelIngress?.noteSuccessfulTarget)) === TYPEOF.FUNCTION)) {
                if (stryMutAct_9fa48("17631")) {
                  {}
                } else {
                  stryCov_9fa48("17631");
                  this.controlPlaneKernelIngress.noteSuccessfulTarget(targetAddress);
                }
              }
              return publicationDiagnostics;
            }
          } catch (error) {
            if (stryMutAct_9fa48("17632")) {
              {}
            } else {
              stryCov_9fa48("17632");
              error.publicationDiagnostics = publicationDiagnostics;
              lastError = error;
              const isFinalAttempt = stryMutAct_9fa48("17636") ? attempt < targetCandidates.length - NUM.ONE : stryMutAct_9fa48("17635") ? attempt > targetCandidates.length - NUM.ONE : stryMutAct_9fa48("17634") ? false : stryMutAct_9fa48("17633") ? true : (stryCov_9fa48("17633", "17634", "17635", "17636"), attempt >= (stryMutAct_9fa48("17637") ? targetCandidates.length + NUM.ONE : (stryCov_9fa48("17637"), targetCandidates.length - NUM.ONE)));
              const shouldRetry = stryMutAct_9fa48("17640") ? !isFinalAttempt || this.shouldRetryControlPlaneNodeStateUpdate(error) : stryMutAct_9fa48("17639") ? false : stryMutAct_9fa48("17638") ? true : (stryCov_9fa48("17638", "17639", "17640"), (stryMutAct_9fa48("17641") ? isFinalAttempt : (stryCov_9fa48("17641"), !isFinalAttempt)) && this.shouldRetryControlPlaneNodeStateUpdate(error));
              if (stryMutAct_9fa48("17643") ? false : stryMutAct_9fa48("17642") ? true : (stryCov_9fa48("17642", "17643"), shouldRetry)) {
                if (stryMutAct_9fa48("17644")) {
                  {}
                } else {
                  stryCov_9fa48("17644");
                  if (stryMutAct_9fa48("17647") ? typeof this.controlPlaneKernelIngress?.invalidateTarget !== TYPEOF.FUNCTION : stryMutAct_9fa48("17646") ? false : stryMutAct_9fa48("17645") ? true : (stryCov_9fa48("17645", "17646", "17647"), typeof (stryMutAct_9fa48("17648") ? this.controlPlaneKernelIngress.invalidateTarget : (stryCov_9fa48("17648"), this.controlPlaneKernelIngress?.invalidateTarget)) === TYPEOF.FUNCTION)) {
                    if (stryMutAct_9fa48("17649")) {
                      {}
                    } else {
                      stryCov_9fa48("17649");
                      this.controlPlaneKernelIngress.invalidateTarget(targetAddress);
                    }
                  }
                  this.logger.warn(JOINING_LOG_MSG.NODE_STATE_UPDATE_RETRYING, stryMutAct_9fa48("17650") ? {} : (stryCov_9fa48("17650"), {
                    nodeId: this.nodeId,
                    targetAddress,
                    nextTargetAddress: targetCandidates[stryMutAct_9fa48("17651") ? attempt - NUM.ONE : (stryCov_9fa48("17651"), attempt + NUM.ONE)],
                    state,
                    attempt: stryMutAct_9fa48("17652") ? attempt - NUM.ONE : (stryCov_9fa48("17652"), attempt + NUM.ONE),
                    maxAttempts: targetCandidates.length,
                    error: error.message
                  }));
                  this.controlPlaneTargetAddress = null;
                  continue;
                }
              }
              this.logger.error(JOINING_LOG_MSG.NODE_STATE_UPDATE_FAILED, stryMutAct_9fa48("17653") ? {} : (stryCov_9fa48("17653"), {
                nodeId: this.nodeId,
                targetAddress,
                state,
                error: error.message
              }));
              const wrappedError = new Error(JOINING_ERROR_MSG.controlPlaneMessageFailed(error.message));
              wrappedError.cause = error;
              wrappedError.publicationDiagnostics = publicationDiagnostics;
              throw wrappedError;
            }
          }
        }
      }
      throw lastError;
    }
  } /**
    * Reconcile peer mesh connectivity without blocking node-state publication.
    * Control-plane publication is a liveness signal and should not wait on
    * best-effort background connection maintenance.
    * @param {string} state - Node connection state being reported.
    * @return {void}
    * @private
    */
  triggerBackgroundClusterMeshReconciliation(state) {
    if (stryMutAct_9fa48("17654")) {
      {}
    } else {
      stryCov_9fa48("17654");
      const normalizedState = stryMutAct_9fa48("17655") ? String(state || '').toUpperCase() : (stryCov_9fa48("17655"), String(stryMutAct_9fa48("17658") ? state && '' : stryMutAct_9fa48("17657") ? false : stryMutAct_9fa48("17656") ? true : (stryCov_9fa48("17656", "17657", "17658"), state || (stryMutAct_9fa48("17659") ? "Stryker was here!" : (stryCov_9fa48("17659"), '')))).toLowerCase());
      if (stryMutAct_9fa48("17662") ? (!this.messageRouter || normalizedState === STATE.DISCONNECTED || normalizedState === NODE_JOINING_SERVICE_LITERAL.FAILED || normalizedState === NODE_JOINING_SERVICE_LITERAL.SHUTTING_DOWN || normalizedState === NODE_JOINING_SERVICE_LITERAL.STOPPED) && !this.joinReadinessEvaluator.shouldReconnectClusterMesh() : stryMutAct_9fa48("17661") ? false : stryMutAct_9fa48("17660") ? true : (stryCov_9fa48("17660", "17661", "17662"), (stryMutAct_9fa48("17664") ? (!this.messageRouter || normalizedState === STATE.DISCONNECTED || normalizedState === NODE_JOINING_SERVICE_LITERAL.FAILED || normalizedState === NODE_JOINING_SERVICE_LITERAL.SHUTTING_DOWN) && normalizedState === NODE_JOINING_SERVICE_LITERAL.STOPPED : stryMutAct_9fa48("17663") ? false : (stryCov_9fa48("17663", "17664"), (stryMutAct_9fa48("17666") ? (!this.messageRouter || normalizedState === STATE.DISCONNECTED || normalizedState === NODE_JOINING_SERVICE_LITERAL.FAILED) && normalizedState === NODE_JOINING_SERVICE_LITERAL.SHUTTING_DOWN : stryMutAct_9fa48("17665") ? false : (stryCov_9fa48("17665", "17666"), (stryMutAct_9fa48("17668") ? (!this.messageRouter || normalizedState === STATE.DISCONNECTED) && normalizedState === NODE_JOINING_SERVICE_LITERAL.FAILED : stryMutAct_9fa48("17667") ? false : (stryCov_9fa48("17667", "17668"), (stryMutAct_9fa48("17670") ? !this.messageRouter && normalizedState === STATE.DISCONNECTED : stryMutAct_9fa48("17669") ? false : (stryCov_9fa48("17669", "17670"), (stryMutAct_9fa48("17671") ? this.messageRouter : (stryCov_9fa48("17671"), !this.messageRouter)) || (stryMutAct_9fa48("17673") ? normalizedState !== STATE.DISCONNECTED : stryMutAct_9fa48("17672") ? false : (stryCov_9fa48("17672", "17673"), normalizedState === STATE.DISCONNECTED)))) || (stryMutAct_9fa48("17675") ? normalizedState !== NODE_JOINING_SERVICE_LITERAL.FAILED : stryMutAct_9fa48("17674") ? false : (stryCov_9fa48("17674", "17675"), normalizedState === NODE_JOINING_SERVICE_LITERAL.FAILED)))) || (stryMutAct_9fa48("17677") ? normalizedState !== NODE_JOINING_SERVICE_LITERAL.SHUTTING_DOWN : stryMutAct_9fa48("17676") ? false : (stryCov_9fa48("17676", "17677"), normalizedState === NODE_JOINING_SERVICE_LITERAL.SHUTTING_DOWN)))) || (stryMutAct_9fa48("17679") ? normalizedState !== NODE_JOINING_SERVICE_LITERAL.STOPPED : stryMutAct_9fa48("17678") ? false : (stryCov_9fa48("17678", "17679"), normalizedState === NODE_JOINING_SERVICE_LITERAL.STOPPED)))) || (stryMutAct_9fa48("17680") ? this.joinReadinessEvaluator.shouldReconnectClusterMesh() : (stryCov_9fa48("17680"), !this.joinReadinessEvaluator.shouldReconnectClusterMesh())))) {
        if (stryMutAct_9fa48("17681")) {
          {}
        } else {
          stryCov_9fa48("17681");
          return;
        }
      }
      if (stryMutAct_9fa48("17683") ? false : stryMutAct_9fa48("17682") ? true : (stryCov_9fa48("17682", "17683"), this.pendingClusterMeshReconciliation)) {
        if (stryMutAct_9fa48("17684")) {
          {}
        } else {
          stryCov_9fa48("17684");
          return;
        }
      }
      const reconciliation = Promise.resolve().then(stryMutAct_9fa48("17685") ? () => undefined : (stryCov_9fa48("17685"), () => this.connectToClusterNodes())).catch(error => {
        if (stryMutAct_9fa48("17686")) {
          {}
        } else {
          stryCov_9fa48("17686");
          this.logger.warn(stryMutAct_9fa48("17687") ? "" : (stryCov_9fa48("17687"), 'Failed to reconcile cluster mesh during node-state publication'), stryMutAct_9fa48("17688") ? {} : (stryCov_9fa48("17688"), {
            nodeId: this.nodeId,
            state,
            error: error.message
          }));
        }
      }).finally(() => {
        if (stryMutAct_9fa48("17689")) {
          {}
        } else {
          stryCov_9fa48("17689");
          if (stryMutAct_9fa48("17692") ? this.pendingClusterMeshReconciliation !== reconciliation : stryMutAct_9fa48("17691") ? false : stryMutAct_9fa48("17690") ? true : (stryCov_9fa48("17690", "17691", "17692"), this.pendingClusterMeshReconciliation === reconciliation)) {
            if (stryMutAct_9fa48("17693")) {
              {}
            } else {
              stryCov_9fa48("17693");
              this.pendingClusterMeshReconciliation = null;
            }
          }
        }
      });
      this.pendingClusterMeshReconciliation = reconciliation;
    }
  } /**
    * Phase 2: Connect to seed node via WebSocket for cross-node communication.
    * Requirements: 8.1, 8.2, 8.3, 8.4 - Bootstrap sequence: server → self-connect → services.
    * @return {Promise<void>}
    * @private
    */
  async phaseConnectWebSocket() {
    if (stryMutAct_9fa48("17694")) {
      {}
    } else {
      stryCov_9fa48("17694");
      return this.connectWebSocketPhase.phaseConnectWebSocket();
    }
  } /**
    * Connect to all cluster nodes for full mesh connectivity.
    * Skips nodes we're already connected to (checked via messageRouter).
    * All nodes are equal peers - no special treatment for any node.
    * @return {Promise<void>}
    * @private
    */
  async connectToClusterNodes() {
    if (stryMutAct_9fa48("17695")) {
      {}
    } else {
      stryCov_9fa48("17695");
      return this.connectWebSocketPhase.connectToClusterNodes();
    }
  } /**
    * Derive WebSocket address from node REST address.
    * @param {string} nodeAddress - Node address in format "hostname:port".
    * @return {string|null} WebSocket address or null if cannot derive.
    * @private
    */
  deriveWsAddressFromNodeAddress(nodeAddress) {
    if (stryMutAct_9fa48("17696")) {
      {}
    } else {
      stryCov_9fa48("17696");
      return _deriveWsAddressFromNodeAddress(nodeAddress);
    }
  } /**
    * Hydrate system cache from bootstrap response snapshots.
    * Delegates to QuerySystemStatePhase.
    * @return {Promise<void>}
    * @private
    */
  async hydrateSystemCacheFromBootstrap() {
    if (stryMutAct_9fa48("17697")) {
      {}
    } else {
      stryCov_9fa48("17697");
      return this.querySystemStatePhase.hydrateSystemCacheFromBootstrap();
    }
  } /**
    * Resolve the cache operation for a bootstrap snapshot record.
    * Delegates to QuerySystemStatePhase.
    * @param {Object} systemTableCache - System table cache.
    * @param {string} tableName - System table name.
    * @param {Object} record - Snapshot row.
    * @return {string|null} CDC operation or null when row should be skipped.
    * @private
    */
  getSnapshotHydrationOperation(systemTableCache, tableName, record) {
    if (stryMutAct_9fa48("17698")) {
      {}
    } else {
      stryCov_9fa48("17698");
      return this.querySystemStatePhase.getSnapshotHydrationOperation(systemTableCache, tableName, record);
    }
  } /**
    * Phase 5: Query system partitions for cluster state and register this node.
    * Delegates to QuerySystemStatePhase.
    * @return {Promise<void>}
    * @private
    */
  async phaseQuerySystemState() {
    if (stryMutAct_9fa48("17699")) {
      {}
    } else {
      stryCov_9fa48("17699");
      return this.querySystemStatePhase.phaseQuerySystemState();
    }
  } /**
    * Register this node in the cluster's nodes table.
    * Delegates to QuerySystemStatePhase.
    * @return {Promise<void>}
    * @private
    */
  async registerNodeInCluster() {
    if (stryMutAct_9fa48("17700")) {
      {}
    } else {
      stryCov_9fa48("17700");
      return this.querySystemStatePhase.registerNodeInCluster();
    }
  } /**
    * Register the WebSocket endpoint for this node.
    * Delegates to QuerySystemStatePhase.
    * @param {number} now - Current timestamp.
    * @return {Promise<Object>}
    * @private
    */
  async registerNodeEndpoint(now) {
    if (stryMutAct_9fa48("17701")) {
      {}
    } else {
      stryCov_9fa48("17701");
      return this.querySystemStatePhase.registerNodeEndpoint(now);
    }
  } /**
    * Register built-in meta service endpoints for this joining node.
    * Delegates to QuerySystemStatePhase.
    * @return {Promise<Array<Object>>}
    * @private
    */
  async registerMetaServiceEndpoints() {
    if (stryMutAct_9fa48("17702")) {
      {}
    } else {
      stryCov_9fa48("17702");
      return this.querySystemStatePhase.registerMetaServiceEndpoints();
    }
  } /**
    * Upsert a system-table row through CDC integration service.
    * Delegates to QuerySystemStatePhase.
    * @param {string} tableName - System table name.
    * @param {Object} rowData - Row payload.
    * @return {Promise<Object>} Upsert result.
    * @private
    */
  async upsertSystemTableRow(tableName, rowData) {
    if (stryMutAct_9fa48("17703")) {
      {}
    } else {
      stryCov_9fa48("17703");
      return this.querySystemStatePhase.upsertSystemTableRow(tableName, rowData);
    }
  } /**
    * Upsert a system-table row through the shared retryable join-time
    * control-plane publication path.
    * Delegates to QuerySystemStatePhase.
    * @param {string} tableName
    * @param {Object} rowData
    * @param {Object} [options={}]
    * @return {Promise<Object>}
    * @private
    */
  async upsertSystemTableRowWithRetry(tableName, rowData, options = {}) {
    if (stryMutAct_9fa48("17704")) {
      {}
    } else {
      stryCov_9fa48("17704");
      return this.querySystemStatePhase.upsertSystemTableRowWithRetry(tableName, rowData, options);
    }
  } /**
    * Determine whether join-time upserts can require local cache visibility.
    * Delegates to QuerySystemStatePhase.
    * @return {Object|undefined}
    * @private
    */
  getJoinTimeUpsertOptions() {
    if (stryMutAct_9fa48("17705")) {
      {}
    } else {
      stryCov_9fa48("17705");
      return this.querySystemStatePhase.getJoinTimeUpsertOptions();
    }
  } /**
    * Seed successful join-time control-plane writes into the local cache.
    * Delegates to QuerySystemStatePhase.
    * @param {string} tableName
    * @param {Object|null} rowData
    * @return {void}
    * @private
    */
  seedJoinTimeCacheRow(tableName, rowData) {
    if (stryMutAct_9fa48("17706")) {
      {}
    } else {
      stryCov_9fa48("17706");
      return this.querySystemStatePhase.seedJoinTimeCacheRow(tableName, rowData);
    }
  } /**
    * Subscribe to CDC events for default cache-sync tables.
    * This keeps the system cache updated as cluster state changes.
    * The subscription is wrapped in a bounded retry loop with
    * structured diagnostics. The total time is bounded by
    * CDC_REESTABLISHMENT.TIMEOUT_MS.
    * Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.4
    * @return {Promise<void>}
    * @private
    */
  async subscribeToCDCEvents() {
    if (stryMutAct_9fa48("17707")) {
      {}
    } else {
      stryCov_9fa48("17707");
      if (stryMutAct_9fa48("17710") ? false : stryMutAct_9fa48("17709") ? true : stryMutAct_9fa48("17708") ? this.cdcIntegrationService : (stryCov_9fa48("17708", "17709", "17710"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("17711")) {
          {}
        } else {
          stryCov_9fa48("17711");
          const error = new Error(JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(stryMutAct_9fa48("17712") ? "" : (stryCov_9fa48("17712"), 'default cache-sync tables'), stryMutAct_9fa48("17713") ? "" : (stryCov_9fa48("17713"), 'CDC integration service not available')));
          this.logger.error(JOINING_LOG_MSG.CDC_SUBSCRIPTION_FAILED, stryMutAct_9fa48("17714") ? {} : (stryCov_9fa48("17714"), {
            nodeId: this.nodeId,
            error: error.message
          }));
          throw error;
        }
      }
      const systemTables = CACHE_HYDRATION_TABLES;
      this.logger.info(JOINING_LOG_MSG.CDC_INTEGRATION_CREATE, stryMutAct_9fa48("17715") ? {} : (stryCov_9fa48("17715"), {
        nodeId: this.nodeId,
        tables: systemTables
      }));
      const startMs = this.now();
      const timeoutMs = CDC_REESTABLISHMENT.TIMEOUT_MS;
      const maxRetries = CDC_REESTABLISHMENT.MAX_RETRIES;
      const retryDelayMs = CDC_REESTABLISHMENT.RETRY_DELAY_MS; // Subscribe to all CDC events (insert, update, delete, upsert)
      // The CDCIntegrationService emits these events when system
      // tables change. The system cache is automatically updated by
      // the cache hydration service.
      const cdcEventHandler = event => {
        if (stryMutAct_9fa48("17716")) {
          {}
        } else {
          stryCov_9fa48("17716");
          this.logger.debug(JOINING_LOG_MSG.CDC_EVENT_RECEIVED, stryMutAct_9fa48("17717") ? {} : (stryCov_9fa48("17717"), {
            nodeId: this.nodeId,
            tableName: event.tableName,
            operation: stryMutAct_9fa48("17720") ? event.operation && STRING.UNKNOWN : stryMutAct_9fa48("17719") ? false : stryMutAct_9fa48("17718") ? true : (stryCov_9fa48("17718", "17719", "17720"), event.operation || STRING.UNKNOWN)
          }));
          this.handleMeshConnectivityCDCEvent(event);
        }
      };
      const eventTypes = stryMutAct_9fa48("17721") ? [] : (stryCov_9fa48("17721"), [CDC_EVENT.INSERT, CDC_EVENT.UPDATE, CDC_EVENT.DELETE, CDC_EVENT.UPSERT]); // Periodic diagnostic emission during CDC recovery
      // (Requirement 8.2). Cleared in finally block so it
      // is always cleaned up on success, failure, or timeout.
      const diagnosticIntervalMs = CDC_REESTABLISHMENT.DIAGNOSTIC_INTERVAL_MS;
      const diagnosticInterval = setInterval(() => {
        if (stryMutAct_9fa48("17722")) {
          {}
        } else {
          stryCov_9fa48("17722");
          const leaderService = this.getLeaderMessageGroupService();
          const messageGroupLeader = leaderService ? stryMutAct_9fa48("17723") ? {} : (stryCov_9fa48("17723"), {
            nodeId: stryMutAct_9fa48("17726") ? leaderService.nodeId && null : stryMutAct_9fa48("17725") ? false : stryMutAct_9fa48("17724") ? true : (stryCov_9fa48("17724", "17725", "17726"), leaderService.nodeId || null),
            groupId: stryMutAct_9fa48("17729") ? leaderService.groupId && null : stryMutAct_9fa48("17728") ? false : stryMutAct_9fa48("17727") ? true : (stryCov_9fa48("17727", "17728", "17729"), leaderService.groupId || null),
            isLeader: (stryMutAct_9fa48("17732") ? typeof leaderService.isLeaderReplica !== TYPEOF.FUNCTION : stryMutAct_9fa48("17731") ? false : stryMutAct_9fa48("17730") ? true : (stryCov_9fa48("17730", "17731", "17732"), typeof leaderService.isLeaderReplica === TYPEOF.FUNCTION)) ? leaderService.isLeaderReplica() : null
          }) : null;
          this.logger.info(JOINING_LOG_MSG.CDC_RECOVERY_DIAGNOSTICS, stryMutAct_9fa48("17733") ? {} : (stryCov_9fa48("17733"), {
            nodeId: this.nodeId,
            subscriptionStatus: this.getCdcSubscriptionStatus(),
            messageGroupLeader,
            elapsedMs: stryMutAct_9fa48("17734") ? this.now() + startMs : (stryCov_9fa48("17734"), this.now() - startMs)
          }));
        }
      }, diagnosticIntervalMs); // Bounded retry loop for CDC subscription establishment
      let subscribed = stryMutAct_9fa48("17735") ? true : (stryCov_9fa48("17735"), false);
      try {
        if (stryMutAct_9fa48("17736")) {
          {}
        } else {
          stryCov_9fa48("17736");
          for (let attempt = NUM.ZERO; stryMutAct_9fa48("17739") ? attempt > maxRetries : stryMutAct_9fa48("17738") ? attempt < maxRetries : stryMutAct_9fa48("17737") ? false : (stryCov_9fa48("17737", "17738", "17739"), attempt <= maxRetries); stryMutAct_9fa48("17740") ? attempt-- : (stryCov_9fa48("17740"), attempt++)) {
            if (stryMutAct_9fa48("17741")) {
              {}
            } else {
              stryCov_9fa48("17741");
              const elapsedMs = stryMutAct_9fa48("17742") ? this.now() + startMs : (stryCov_9fa48("17742"), this.now() - startMs);
              const remainingBudgetMs = stryMutAct_9fa48("17743") ? timeoutMs + elapsedMs : (stryCov_9fa48("17743"), timeoutMs - elapsedMs); // Respect overall timeout budget (§1.9)
              if (stryMutAct_9fa48("17747") ? remainingBudgetMs > NUM.ZERO : stryMutAct_9fa48("17746") ? remainingBudgetMs < NUM.ZERO : stryMutAct_9fa48("17745") ? false : stryMutAct_9fa48("17744") ? true : (stryCov_9fa48("17744", "17745", "17746", "17747"), remainingBudgetMs <= NUM.ZERO)) {
                if (stryMutAct_9fa48("17748")) {
                  {}
                } else {
                  stryCov_9fa48("17748");
                  this.logger.warn(JOINING_LOG_MSG.CDC_REESTABLISHMENT_TIMEOUT, stryMutAct_9fa48("17749") ? {} : (stryCov_9fa48("17749"), {
                    nodeId: this.nodeId,
                    tables: systemTables,
                    attempt,
                    maxRetries,
                    elapsedMs
                  }));
                  break;
                }
              }
              try {
                if (stryMutAct_9fa48("17750")) {
                  {}
                } else {
                  stryCov_9fa48("17750");
                  for (const eventType of eventTypes) {
                    if (stryMutAct_9fa48("17751")) {
                      {}
                    } else {
                      stryCov_9fa48("17751");
                      this.cdcIntegrationService.on(eventType, cdcEventHandler);
                    }
                  } // Verify listeners were registered
                  const subscriptionStatus = {};
                  for (const eventType of eventTypes) {
                    if (stryMutAct_9fa48("17752")) {
                      {}
                    } else {
                      stryCov_9fa48("17752");
                      const listenerCount = this.cdcIntegrationService.listenerCount(eventType);
                      subscriptionStatus[eventType] = listenerCount;
                      if (stryMutAct_9fa48("17755") ? listenerCount !== NUM.ZERO : stryMutAct_9fa48("17754") ? false : stryMutAct_9fa48("17753") ? true : (stryCov_9fa48("17753", "17754", "17755"), listenerCount === NUM.ZERO)) {
                        if (stryMutAct_9fa48("17756")) {
                          {}
                        } else {
                          stryCov_9fa48("17756");
                          throw new Error(JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(systemTables.join(NODE_JOINING_SERVICE_LITERAL.VALUE), stryMutAct_9fa48("17757") ? `` : (stryCov_9fa48("17757"), `no listeners for ${eventType}`)));
                        }
                      }
                    }
                  }
                  subscribed = stryMutAct_9fa48("17758") ? false : (stryCov_9fa48("17758"), true);
                  this.logger.info(JOINING_LOG_MSG.CDC_REESTABLISHMENT_COMPLETE, stryMutAct_9fa48("17759") ? {} : (stryCov_9fa48("17759"), {
                    nodeId: this.nodeId,
                    tableCount: systemTables.length,
                    elapsedMs: stryMutAct_9fa48("17760") ? this.now() + startMs : (stryCov_9fa48("17760"), this.now() - startMs),
                    subscriptionStatus
                  }));
                  break;
                }
              } catch (error) {
                if (stryMutAct_9fa48("17761")) {
                  {}
                } else {
                  stryCov_9fa48("17761");
                  // Remove partially registered listeners before
                  // retry
                  for (const eventType of eventTypes) {
                    if (stryMutAct_9fa48("17762")) {
                      {}
                    } else {
                      stryCov_9fa48("17762");
                      this.cdcIntegrationService.removeListener(eventType, cdcEventHandler);
                    }
                  }
                  const currentElapsedMs = stryMutAct_9fa48("17763") ? this.now() + startMs : (stryCov_9fa48("17763"), this.now() - startMs);
                  const currentRemainingMs = stryMutAct_9fa48("17764") ? timeoutMs + currentElapsedMs : (stryCov_9fa48("17764"), timeoutMs - currentElapsedMs);
                  this.logger.warn(JOINING_LOG_MSG.CDC_SUBSCRIPTION_RETRY, stryMutAct_9fa48("17765") ? {} : (stryCov_9fa48("17765"), {
                    nodeId: this.nodeId,
                    tables: systemTables,
                    error: error.message,
                    attempt: stryMutAct_9fa48("17766") ? attempt - NUM.ONE : (stryCov_9fa48("17766"), attempt + NUM.ONE),
                    maxRetries,
                    remainingBudgetMs: currentRemainingMs
                  }));
                  if (stryMutAct_9fa48("17769") ? attempt < maxRetries || currentRemainingMs > NUM.ZERO : stryMutAct_9fa48("17768") ? false : stryMutAct_9fa48("17767") ? true : (stryCov_9fa48("17767", "17768", "17769"), (stryMutAct_9fa48("17772") ? attempt >= maxRetries : stryMutAct_9fa48("17771") ? attempt <= maxRetries : stryMutAct_9fa48("17770") ? true : (stryCov_9fa48("17770", "17771", "17772"), attempt < maxRetries)) && (stryMutAct_9fa48("17775") ? currentRemainingMs <= NUM.ZERO : stryMutAct_9fa48("17774") ? currentRemainingMs >= NUM.ZERO : stryMutAct_9fa48("17773") ? true : (stryCov_9fa48("17773", "17774", "17775"), currentRemainingMs > NUM.ZERO)))) {
                    if (stryMutAct_9fa48("17776")) {
                      {}
                    } else {
                      stryCov_9fa48("17776");
                      const waitMs = stryMutAct_9fa48("17777") ? Math.max(retryDelayMs, currentRemainingMs) : (stryCov_9fa48("17777"), Math.min(retryDelayMs, currentRemainingMs));
                      await this.sleep(waitMs);
                    }
                  }
                }
              }
            }
          }
        }
      } finally {
        if (stryMutAct_9fa48("17778")) {
          {}
        } else {
          stryCov_9fa48("17778");
          clearInterval(diagnosticInterval);
        }
      } // Build final subscription status for logging
      const finalStatus = {};
      for (const eventType of eventTypes) {
        if (stryMutAct_9fa48("17779")) {
          {}
        } else {
          stryCov_9fa48("17779");
          finalStatus[eventType] = this.cdcIntegrationService.listenerCount(eventType);
        }
      }
      if (stryMutAct_9fa48("17782") ? false : stryMutAct_9fa48("17781") ? true : stryMutAct_9fa48("17780") ? subscribed : (stryCov_9fa48("17780", "17781", "17782"), !subscribed)) {
        if (stryMutAct_9fa48("17783")) {
          {}
        } else {
          stryCov_9fa48("17783");
          // All retries exhausted or timeout expired
          this.logger.warn(JOINING_LOG_MSG.CDC_SUBSCRIPTION_RETRY_EXHAUSTED, stryMutAct_9fa48("17784") ? {} : (stryCov_9fa48("17784"), {
            nodeId: this.nodeId,
            tables: systemTables,
            elapsedMs: stryMutAct_9fa48("17785") ? this.now() + startMs : (stryCov_9fa48("17785"), this.now() - startMs),
            maxRetries,
            subscriptionStatus: finalStatus
          }));
        }
      }
      this.logger.info(JOINING_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, stryMutAct_9fa48("17786") ? {} : (stryCov_9fa48("17786"), {
        nodeId: this.nodeId,
        eventTypes,
        tableCount: systemTables.length,
        subscriptionStatus: finalStatus
      })); // Mark CDC subscriptions as active even if retries were
      // exhausted — partial progress is better than blocking
      // indefinitely. Task 6.4 gates readiness on full status.
      this.cdcSubscriptionsActive = stryMutAct_9fa48("17787") ? false : (stryCov_9fa48("17787"), true);
    }
  } /**
    * Determine whether one CDC event affects peer mesh-connectivity authority.
    * Mesh connectivity should react to canonical peer membership and endpoint
    * publication, not only to local join-state publication.
    * @param {Object|null} event
    * @return {boolean}
    * @private
    */
  isMeshConnectivityCDCEvent(event) {
    if (stryMutAct_9fa48("17788")) {
      {}
    } else {
      stryCov_9fa48("17788");
      const tableName = String(stryMutAct_9fa48("17791") ? event?.tableName && '' : stryMutAct_9fa48("17790") ? false : stryMutAct_9fa48("17789") ? true : (stryCov_9fa48("17789", "17790", "17791"), (stryMutAct_9fa48("17792") ? event.tableName : (stryCov_9fa48("17792"), event?.tableName)) || (stryMutAct_9fa48("17793") ? "Stryker was here!" : (stryCov_9fa48("17793"), ''))));
      if (stryMutAct_9fa48("17796") ? tableName !== TABLES.NODES || tableName !== TABLES.NODE_ENDPOINTS : stryMutAct_9fa48("17795") ? false : stryMutAct_9fa48("17794") ? true : (stryCov_9fa48("17794", "17795", "17796"), (stryMutAct_9fa48("17798") ? tableName === TABLES.NODES : stryMutAct_9fa48("17797") ? true : (stryCov_9fa48("17797", "17798"), tableName !== TABLES.NODES)) && (stryMutAct_9fa48("17800") ? tableName === TABLES.NODE_ENDPOINTS : stryMutAct_9fa48("17799") ? true : (stryCov_9fa48("17799", "17800"), tableName !== TABLES.NODE_ENDPOINTS)))) {
        if (stryMutAct_9fa48("17801")) {
          {}
        } else {
          stryCov_9fa48("17801");
          return stryMutAct_9fa48("17802") ? true : (stryCov_9fa48("17802"), false);
        }
      }
      const operation = stryMutAct_9fa48("17803") ? String(event?.operation || '').toUpperCase() : (stryCov_9fa48("17803"), String(stryMutAct_9fa48("17806") ? event?.operation && '' : stryMutAct_9fa48("17805") ? false : stryMutAct_9fa48("17804") ? true : (stryCov_9fa48("17804", "17805", "17806"), (stryMutAct_9fa48("17807") ? event.operation : (stryCov_9fa48("17807"), event?.operation)) || (stryMutAct_9fa48("17808") ? "Stryker was here!" : (stryCov_9fa48("17808"), '')))).toLowerCase());
      return stryMutAct_9fa48("17811") ? (operation === CDC_EVENT.INSERT || operation === CDC_EVENT.UPDATE || operation === CDC_EVENT.UPSERT) && operation === CDC_EVENT.DELETE : stryMutAct_9fa48("17810") ? false : stryMutAct_9fa48("17809") ? true : (stryCov_9fa48("17809", "17810", "17811"), (stryMutAct_9fa48("17813") ? (operation === CDC_EVENT.INSERT || operation === CDC_EVENT.UPDATE) && operation === CDC_EVENT.UPSERT : stryMutAct_9fa48("17812") ? false : (stryCov_9fa48("17812", "17813"), (stryMutAct_9fa48("17815") ? operation === CDC_EVENT.INSERT && operation === CDC_EVENT.UPDATE : stryMutAct_9fa48("17814") ? false : (stryCov_9fa48("17814", "17815"), (stryMutAct_9fa48("17817") ? operation !== CDC_EVENT.INSERT : stryMutAct_9fa48("17816") ? false : (stryCov_9fa48("17816", "17817"), operation === CDC_EVENT.INSERT)) || (stryMutAct_9fa48("17819") ? operation !== CDC_EVENT.UPDATE : stryMutAct_9fa48("17818") ? false : (stryCov_9fa48("17818", "17819"), operation === CDC_EVENT.UPDATE)))) || (stryMutAct_9fa48("17821") ? operation !== CDC_EVENT.UPSERT : stryMutAct_9fa48("17820") ? false : (stryCov_9fa48("17820", "17821"), operation === CDC_EVENT.UPSERT)))) || (stryMutAct_9fa48("17823") ? operation !== CDC_EVENT.DELETE : stryMutAct_9fa48("17822") ? false : (stryCov_9fa48("17822", "17823"), operation === CDC_EVENT.DELETE)));
    }
  } /**
    * Trigger best-effort peer mesh reconciliation when authoritative peer
    * visibility changes in CDC. This keeps peer dialing bound to the same
    * owner-path regardless of whether connectivity changes originate from join,
    * restart, or concurrent peer publication.
    * @param {Object|null} event
    * @return {void}
    * @private
    */
  handleMeshConnectivityCDCEvent(event) {
    if (stryMutAct_9fa48("17824")) {
      {}
    } else {
      stryCov_9fa48("17824");
      if (stryMutAct_9fa48("17827") ? !this.isMeshConnectivityCDCEvent(event) && !this.joinReadinessEvaluator.shouldReconnectClusterMesh() : stryMutAct_9fa48("17826") ? false : stryMutAct_9fa48("17825") ? true : (stryCov_9fa48("17825", "17826", "17827"), (stryMutAct_9fa48("17828") ? this.isMeshConnectivityCDCEvent(event) : (stryCov_9fa48("17828"), !this.isMeshConnectivityCDCEvent(event))) || (stryMutAct_9fa48("17829") ? this.joinReadinessEvaluator.shouldReconnectClusterMesh() : (stryCov_9fa48("17829"), !this.joinReadinessEvaluator.shouldReconnectClusterMesh())))) {
        if (stryMutAct_9fa48("17830")) {
          {}
        } else {
          stryCov_9fa48("17830");
          return;
        }
      }
      const normalizedOperation = stryMutAct_9fa48("17831") ? String(event?.operation || STRING.UNKNOWN).toUpperCase() : (stryCov_9fa48("17831"), String(stryMutAct_9fa48("17834") ? event?.operation && STRING.UNKNOWN : stryMutAct_9fa48("17833") ? false : stryMutAct_9fa48("17832") ? true : (stryCov_9fa48("17832", "17833", "17834"), (stryMutAct_9fa48("17835") ? event.operation : (stryCov_9fa48("17835"), event?.operation)) || STRING.UNKNOWN)).toLowerCase());
      this.triggerBackgroundClusterMeshReconciliation(stryMutAct_9fa48("17836") ? `` : (stryCov_9fa48("17836"), `cdc:${event.tableName}:${normalizedOperation}`));
    }
  } /**
    * Return per-table CDC subscription status.
    *
    * Reads from existing subscription state on
    * `this.cdcIntegrationService` (EventEmitter listener counts)
    * and `this.cdcSubscriptionsActive`. Does not create new state.
    *
    * @return {object} Diagnostic snapshot with:
    *   - `active` {boolean} whether subscriptions are active
    *   - `tables` {Array<object>} per-table status entries
    *   - `eventTypes` {object} per-event-type listener counts
    */
  getCdcSubscriptionStatus() {
    if (stryMutAct_9fa48("17837")) {
      {}
    } else {
      stryCov_9fa48("17837");
      const tables = CACHE_HYDRATION_TABLES;
      const active = stryMutAct_9fa48("17840") ? this.cdcSubscriptionsActive !== true : stryMutAct_9fa48("17839") ? false : stryMutAct_9fa48("17838") ? true : (stryCov_9fa48("17838", "17839", "17840"), this.cdcSubscriptionsActive === (stryMutAct_9fa48("17841") ? false : (stryCov_9fa48("17841"), true)));
      const eventTypes = stryMutAct_9fa48("17842") ? [] : (stryCov_9fa48("17842"), [CDC_EVENT.INSERT, CDC_EVENT.UPDATE, CDC_EVENT.DELETE, CDC_EVENT.UPSERT]); // Per-event-type listener counts from the integration
      // service (single source of truth — §1.4).
      const eventListenerCounts = {};
      for (const eventType of eventTypes) {
        if (stryMutAct_9fa48("17843")) {
          {}
        } else {
          stryCov_9fa48("17843");
          eventListenerCounts[eventType] = this.cdcIntegrationService ? this.cdcIntegrationService.listenerCount(eventType) : NUM.ZERO;
        }
      } // Derive overall subscription health: at least one
      // listener on every event type means subscribed.
      const hasAllListeners = stryMutAct_9fa48("17844") ? eventTypes.some(et => eventListenerCounts[et] > NUM.ZERO) : (stryCov_9fa48("17844"), eventTypes.every(stryMutAct_9fa48("17845") ? () => undefined : (stryCov_9fa48("17845"), et => stryMutAct_9fa48("17849") ? eventListenerCounts[et] <= NUM.ZERO : stryMutAct_9fa48("17848") ? eventListenerCounts[et] >= NUM.ZERO : stryMutAct_9fa48("17847") ? false : stryMutAct_9fa48("17846") ? true : (stryCov_9fa48("17846", "17847", "17848", "17849"), eventListenerCounts[et] > NUM.ZERO)))); // Build per-table status. All tables share the same
      // event-level listeners so the status is uniform, but
      // the per-table shape is required by the diagnostic
      // contract (Requirement 8.1).
      const tableStatuses = tables.map(tableName => {
        if (stryMutAct_9fa48("17850")) {
          {}
        } else {
          stryCov_9fa48("17850");
          let status;
          if (stryMutAct_9fa48("17853") ? active || hasAllListeners : stryMutAct_9fa48("17852") ? false : stryMutAct_9fa48("17851") ? true : (stryCov_9fa48("17851", "17852", "17853"), active && hasAllListeners)) {
            if (stryMutAct_9fa48("17854")) {
              {}
            } else {
              stryCov_9fa48("17854");
              status = CDC_SUBSCRIPTION_STATUS.SUBSCRIBED;
            }
          } else if (stryMutAct_9fa48("17857") ? !active || !hasAllListeners : stryMutAct_9fa48("17856") ? false : stryMutAct_9fa48("17855") ? true : (stryCov_9fa48("17855", "17856", "17857"), (stryMutAct_9fa48("17858") ? active : (stryCov_9fa48("17858"), !active)) && (stryMutAct_9fa48("17859") ? hasAllListeners : (stryCov_9fa48("17859"), !hasAllListeners)))) {
            if (stryMutAct_9fa48("17860")) {
              {}
            } else {
              stryCov_9fa48("17860");
              status = CDC_SUBSCRIPTION_STATUS.FAILED;
            }
          } else {
            if (stryMutAct_9fa48("17861")) {
              {}
            } else {
              stryCov_9fa48("17861");
              status = CDC_SUBSCRIPTION_STATUS.PENDING;
            }
          }
          return stryMutAct_9fa48("17862") ? {} : (stryCov_9fa48("17862"), {
            tableName,
            status
          });
        }
      });
      return stryMutAct_9fa48("17863") ? {} : (stryCov_9fa48("17863"), {
        active,
        tables: tableStatuses,
        eventTypes: eventListenerCounts
      });
    }
  } /**
    * Backfill propagated cache tables from authoritative routed reads.
    *
    * This closes the blind window between the initial bootstrap snapshot and
    * the moment CDC subscriptions become active, during which discovery rows
    * written by concurrently joining peers could otherwise be missed forever.
    *
    * @return {Promise<void>}
    * @private
    */
  async backfillPropagatedCacheTablesFromAuthoritativeState(tableNames = CACHE_HYDRATION_TABLES, options = {}) {
    if (stryMutAct_9fa48("17864")) {
      {}
    } else {
      stryCov_9fa48("17864");
      const propagatedTables = this.normalizeAuthoritativeBackfillTableNames(tableNames);
      const requestKey = this.buildAuthoritativeBackfillRequestKey(propagatedTables);
      const existingBackfill = this.inFlightBackfillsByKey.get(requestKey);
      if (stryMutAct_9fa48("17866") ? false : stryMutAct_9fa48("17865") ? true : (stryCov_9fa48("17865", "17866"), existingBackfill)) {
        if (stryMutAct_9fa48("17867")) {
          {}
        } else {
          stryCov_9fa48("17867");
          return existingBackfill;
        }
      }
      const backfillOptions = this.resolveAuthoritativeBackfillOptions(propagatedTables, options);
      const sqlQueryEngine = assertCritical(stryMutAct_9fa48("17868") ? this.cdcIntegrationService.sqlQueryEngine : (stryCov_9fa48("17868"), this.cdcIntegrationService?.sqlQueryEngine), JOINING_ERROR_MSG.STATE_QUERY_ENGINE_REQUIRED);
      const systemTableCache = assertCritical(NodeService.getInstance().getSystemTableCache(), JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED);
      const backfillPromise = (async () => {
        if (stryMutAct_9fa48("17869")) {
          {}
        } else {
          stryCov_9fa48("17869");
          let totalRowsApplied = NUM.ZERO;
          const tableRowCounts = {};
          for (const tableName of propagatedTables) {
            if (stryMutAct_9fa48("17870")) {
              {}
            } else {
              stryCov_9fa48("17870");
              const rows = await this.resolveAuthoritativeBackfillRows(sqlQueryEngine, tableName, backfillOptions);
              tableRowCounts[tableName] = rows.length;
              for (const row of rows) {
                if (stryMutAct_9fa48("17871")) {
                  {}
                } else {
                  stryCov_9fa48("17871");
                  const operation = this.getSnapshotHydrationOperation(systemTableCache, tableName, row);
                  if (stryMutAct_9fa48("17874") ? false : stryMutAct_9fa48("17873") ? true : stryMutAct_9fa48("17872") ? operation : (stryCov_9fa48("17872", "17873", "17874"), !operation)) {
                    if (stryMutAct_9fa48("17875")) {
                      {}
                    } else {
                      stryCov_9fa48("17875");
                      continue;
                    }
                  }
                  systemTableCache.applySystemTableChange(tableName, operation, row);
                  stryMutAct_9fa48("17876") ? totalRowsApplied -= NUM.ONE : (stryCov_9fa48("17876"), totalRowsApplied += NUM.ONE);
                }
              }
            }
          }
          this.logger.info(stryMutAct_9fa48("17877") ? "" : (stryCov_9fa48("17877"), 'Backfilled propagated cache tables from authoritative state'), stryMutAct_9fa48("17878") ? {} : (stryCov_9fa48("17878"), {
            nodeId: this.nodeId,
            tableCount: propagatedTables.length,
            totalRowsApplied,
            tableRowCounts,
            deliveryPriority: backfillOptions.deliveryPriority,
            pressureDegraded: backfillOptions.pressureDegraded,
            pressureAction: backfillOptions.pressureAction,
            pressureReason: backfillOptions.pressureReason,
            allowReplicaFanout: backfillOptions.allowReplicaFanout
          }));
        }
      })().finally(() => {
        if (stryMutAct_9fa48("17879")) {
          {}
        } else {
          stryCov_9fa48("17879");
          if (stryMutAct_9fa48("17882") ? this.inFlightBackfillsByKey.get(requestKey) !== backfillPromise : stryMutAct_9fa48("17881") ? false : stryMutAct_9fa48("17880") ? true : (stryCov_9fa48("17880", "17881", "17882"), this.inFlightBackfillsByKey.get(requestKey) === backfillPromise)) {
            if (stryMutAct_9fa48("17883")) {
              {}
            } else {
              stryCov_9fa48("17883");
              this.inFlightBackfillsByKey.delete(requestKey);
            }
          }
        }
      });
      this.inFlightBackfillsByKey.set(requestKey, backfillPromise);
      return backfillPromise;
    }
  } /**
    * Normalize the authoritative backfill table list.
    * @param {Array<string>|undefined|null} tableNames
    * @return {Array<string>}
    * @private
    */
  normalizeAuthoritativeBackfillTableNames(tableNames) {
    if (stryMutAct_9fa48("17884")) {
      {}
    } else {
      stryCov_9fa48("17884");
      return (stryMutAct_9fa48("17887") ? Array.isArray(tableNames) || tableNames.length > NUM.ZERO : stryMutAct_9fa48("17886") ? false : stryMutAct_9fa48("17885") ? true : (stryCov_9fa48("17885", "17886", "17887"), Array.isArray(tableNames) && (stryMutAct_9fa48("17890") ? tableNames.length <= NUM.ZERO : stryMutAct_9fa48("17889") ? tableNames.length >= NUM.ZERO : stryMutAct_9fa48("17888") ? true : (stryCov_9fa48("17888", "17889", "17890"), tableNames.length > NUM.ZERO)))) ? stryMutAct_9fa48("17891") ? [] : (stryCov_9fa48("17891"), [...new Set(tableNames)]) : stryMutAct_9fa48("17892") ? [] : (stryCov_9fa48("17892"), [...CACHE_HYDRATION_TABLES]);
    }
  } /**
    * Build a canonical in-flight key for one authoritative backfill request.
    * @param {Array<string>} tableNames
    * @return {string}
    * @private
    */
  buildAuthoritativeBackfillRequestKey(tableNames) {
    if (stryMutAct_9fa48("17893")) {
      {}
    } else {
      stryCov_9fa48("17893");
      return stryMutAct_9fa48("17894") ? [...tableNames].join(NODE_JOINING_SERVICE_LITERAL.VALUE_2) : (stryCov_9fa48("17894"), (stryMutAct_9fa48("17895") ? [] : (stryCov_9fa48("17895"), [...tableNames])).sort().join(NODE_JOINING_SERVICE_LITERAL.VALUE_2));
    }
  } /**
    * Resolve one shared-pressure decision for authoritative join backfill.
    * @param {Array<string>} tableNames
    * @param {Object} [options={}]
    * @return {Object}
    * @private
    */
  evaluateAuthoritativeBackfillPressure(tableNames, options = {}) {
    if (stryMutAct_9fa48("17896")) {
      {}
    } else {
      stryCov_9fa48("17896");
      const blockingTableSet = new Set(JOIN_READINESS_REPAIR.TABLES);
      const blocking = (stryMutAct_9fa48("17899") ? typeof options.blocking !== TYPEOF.BOOLEAN : stryMutAct_9fa48("17898") ? false : stryMutAct_9fa48("17897") ? true : (stryCov_9fa48("17897", "17898", "17899"), typeof options.blocking === TYPEOF.BOOLEAN)) ? options.blocking : stryMutAct_9fa48("17900") ? tableNames.every(tableName => blockingTableSet.has(tableName)) : (stryCov_9fa48("17900"), tableNames.some(stryMutAct_9fa48("17901") ? () => undefined : (stryCov_9fa48("17901"), tableName => blockingTableSet.has(tableName))));
      return PressureGovernor.getShared(stryMutAct_9fa48("17902") ? {} : (stryCov_9fa48("17902"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter
      })).evaluate(stryMutAct_9fa48("17903") ? {} : (stryCov_9fa48("17903"), {
        workClass: blocking ? PRESSURE_WORK_CLASS.INTERACTIVE : PRESSURE_WORK_CLASS.BACKGROUND,
        resourceKeys: stryMutAct_9fa48("17904") ? [] : (stryCov_9fa48("17904"), [NODE_JOINING_SERVICE_LITERAL.JOIN_BACKFILL, NODE_JOINING_SERVICE_LITERAL.CONTROL_PLANE_READ, ...tableNames.map(stryMutAct_9fa48("17905") ? () => undefined : (stryCov_9fa48("17905"), tableName => stryMutAct_9fa48("17906") ? `` : (stryCov_9fa48("17906"), `control-plane:table:${tableName}`)))]),
        allowDegrade: stryMutAct_9fa48("17907") ? true : (stryCov_9fa48("17907"), false),
        allowDefer: stryMutAct_9fa48("17908") ? false : (stryCov_9fa48("17908"), true),
        retryAfterMs: stryMutAct_9fa48("17909") ? options.pressureRetryAfterMs : (stryCov_9fa48("17909"), options?.pressureRetryAfterMs)
      }));
    }
  } /**
    * Resolve owner options for one authoritative backfill pass.
    * @param {Array<string>} tableNames
    * @param {Object} options
    * @return {Object}
    * @private
    */
  resolveAuthoritativeBackfillOptions(tableNames, options = {}) {
    if (stryMutAct_9fa48("17910")) {
      {}
    } else {
      stryCov_9fa48("17910");
      const blockingTableSet = new Set(JOIN_READINESS_REPAIR.TABLES);
      const blocking = (stryMutAct_9fa48("17913") ? typeof options.blocking !== TYPEOF.BOOLEAN : stryMutAct_9fa48("17912") ? false : stryMutAct_9fa48("17911") ? true : (stryCov_9fa48("17911", "17912", "17913"), typeof options.blocking === TYPEOF.BOOLEAN)) ? options.blocking : stryMutAct_9fa48("17914") ? tableNames.every(tableName => blockingTableSet.has(tableName)) : (stryCov_9fa48("17914"), tableNames.some(stryMutAct_9fa48("17915") ? () => undefined : (stryCov_9fa48("17915"), tableName => blockingTableSet.has(tableName))));
      const pressureDecision = this.evaluateAuthoritativeBackfillPressure(tableNames, options);
      const pressureDegraded = stryMutAct_9fa48("17918") ? options.pressureDegraded === true && pressureDecision?.action !== PRESSURE_GOVERNOR_ACTION.ALLOW : stryMutAct_9fa48("17917") ? false : stryMutAct_9fa48("17916") ? true : (stryCov_9fa48("17916", "17917", "17918"), (stryMutAct_9fa48("17920") ? options.pressureDegraded !== true : stryMutAct_9fa48("17919") ? false : (stryCov_9fa48("17919", "17920"), options.pressureDegraded === (stryMutAct_9fa48("17921") ? false : (stryCov_9fa48("17921"), true)))) || (stryMutAct_9fa48("17923") ? pressureDecision?.action === PRESSURE_GOVERNOR_ACTION.ALLOW : stryMutAct_9fa48("17922") ? false : (stryCov_9fa48("17922", "17923"), (stryMutAct_9fa48("17924") ? pressureDecision.action : (stryCov_9fa48("17924"), pressureDecision?.action)) !== PRESSURE_GOVERNOR_ACTION.ALLOW)));
      return stryMutAct_9fa48("17925") ? {} : (stryCov_9fa48("17925"), {
        blocking,
        deliveryPriority: (stryMutAct_9fa48("17928") ? typeof options.deliveryPriority === TYPEOF.STRING || options.deliveryPriority.length > NUM.ZERO : stryMutAct_9fa48("17927") ? false : stryMutAct_9fa48("17926") ? true : (stryCov_9fa48("17926", "17927", "17928"), (stryMutAct_9fa48("17930") ? typeof options.deliveryPriority !== TYPEOF.STRING : stryMutAct_9fa48("17929") ? true : (stryCov_9fa48("17929", "17930"), typeof options.deliveryPriority === TYPEOF.STRING)) && (stryMutAct_9fa48("17933") ? options.deliveryPriority.length <= NUM.ZERO : stryMutAct_9fa48("17932") ? options.deliveryPriority.length >= NUM.ZERO : stryMutAct_9fa48("17931") ? true : (stryCov_9fa48("17931", "17932", "17933"), options.deliveryPriority.length > NUM.ZERO)))) ? options.deliveryPriority : blocking ? NODE_JOINING_SERVICE_LITERAL.CRITICAL : NODE_JOINING_SERVICE_LITERAL.BACKGROUND,
        queryTimeoutMs: this.resolveAuthoritativeBackfillQueryTimeoutMs(options),
        preferBootstrapSnapshot: (stryMutAct_9fa48("17936") ? typeof options.preferBootstrapSnapshot !== TYPEOF.BOOLEAN : stryMutAct_9fa48("17935") ? false : stryMutAct_9fa48("17934") ? true : (stryCov_9fa48("17934", "17935", "17936"), typeof options.preferBootstrapSnapshot === TYPEOF.BOOLEAN)) ? options.preferBootstrapSnapshot : blocking,
        allowReplicaFanout: (stryMutAct_9fa48("17939") ? typeof options.allowReplicaFanout !== TYPEOF.BOOLEAN : stryMutAct_9fa48("17938") ? false : stryMutAct_9fa48("17937") ? true : (stryCov_9fa48("17937", "17938", "17939"), typeof options.allowReplicaFanout === TYPEOF.BOOLEAN)) ? options.allowReplicaFanout : stryMutAct_9fa48("17940") ? pressureDegraded : (stryCov_9fa48("17940"), !pressureDegraded),
        pressureDegraded,
        pressureAction: stryMutAct_9fa48("17943") ? pressureDecision?.action && null : stryMutAct_9fa48("17942") ? false : stryMutAct_9fa48("17941") ? true : (stryCov_9fa48("17941", "17942", "17943"), (stryMutAct_9fa48("17944") ? pressureDecision.action : (stryCov_9fa48("17944"), pressureDecision?.action)) || null),
        pressureReason: stryMutAct_9fa48("17947") ? pressureDecision?.reason && null : stryMutAct_9fa48("17946") ? false : stryMutAct_9fa48("17945") ? true : (stryCov_9fa48("17945", "17946", "17947"), (stryMutAct_9fa48("17948") ? pressureDecision.reason : (stryCov_9fa48("17948"), pressureDecision?.reason)) || null),
        pressureSummary: stryMutAct_9fa48("17951") ? pressureDecision?.summary && null : stryMutAct_9fa48("17950") ? false : stryMutAct_9fa48("17949") ? true : (stryCov_9fa48("17949", "17950", "17951"), (stryMutAct_9fa48("17952") ? pressureDecision.summary : (stryCov_9fa48("17952"), pressureDecision?.summary)) || null)
      });
    }
  } /**
    * Resolve the timeout budget for authoritative join backfill reads.
    * Backfill runs inside the querying_state phase and should inherit the
    * broader join-readiness budget rather than the shorter seed-contact HTTP
    * timeout.
    * @param {Object} [options={}]
    * @return {number}
    * @private
    */
  resolveAuthoritativeBackfillQueryTimeoutMs(options = {}) {
    if (stryMutAct_9fa48("17953")) {
      {}
    } else {
      stryCov_9fa48("17953");
      if (stryMutAct_9fa48("17956") ? Number.isFinite(options.queryTimeoutMs) || options.queryTimeoutMs > NUM.ZERO : stryMutAct_9fa48("17955") ? false : stryMutAct_9fa48("17954") ? true : (stryCov_9fa48("17954", "17955", "17956"), Number.isFinite(options.queryTimeoutMs) && (stryMutAct_9fa48("17959") ? options.queryTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("17958") ? options.queryTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("17957") ? true : (stryCov_9fa48("17957", "17958", "17959"), options.queryTimeoutMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("17960")) {
          {}
        } else {
          stryCov_9fa48("17960");
          return Math.floor(options.queryTimeoutMs);
        }
      }
      if (stryMutAct_9fa48("17963") ? Number.isFinite(this.config?.leadershipWaitTimeoutMs) || this.config.leadershipWaitTimeoutMs > NUM.ZERO : stryMutAct_9fa48("17962") ? false : stryMutAct_9fa48("17961") ? true : (stryCov_9fa48("17961", "17962", "17963"), Number.isFinite(stryMutAct_9fa48("17964") ? this.config.leadershipWaitTimeoutMs : (stryCov_9fa48("17964"), this.config?.leadershipWaitTimeoutMs)) && (stryMutAct_9fa48("17967") ? this.config.leadershipWaitTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("17966") ? this.config.leadershipWaitTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("17965") ? true : (stryCov_9fa48("17965", "17966", "17967"), this.config.leadershipWaitTimeoutMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("17968")) {
          {}
        } else {
          stryCov_9fa48("17968");
          return Math.floor(this.config.leadershipWaitTimeoutMs);
        }
      }
      if (stryMutAct_9fa48("17971") ? Number.isFinite(this.config?.httpTimeoutMs) || this.config.httpTimeoutMs > NUM.ZERO : stryMutAct_9fa48("17970") ? false : stryMutAct_9fa48("17969") ? true : (stryCov_9fa48("17969", "17970", "17971"), Number.isFinite(stryMutAct_9fa48("17972") ? this.config.httpTimeoutMs : (stryCov_9fa48("17972"), this.config?.httpTimeoutMs)) && (stryMutAct_9fa48("17975") ? this.config.httpTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("17974") ? this.config.httpTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("17973") ? true : (stryCov_9fa48("17973", "17974", "17975"), this.config.httpTimeoutMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("17976")) {
          {}
        } else {
          stryCov_9fa48("17976");
          return Math.floor(this.config.httpTimeoutMs);
        }
      }
      return JOINING_DEFAULT.leadershipWaitTimeoutMs;
    }
  } /**
    * Resolve one propagated-table snapshot for join backfill.
    * Merges routed SQL reads with direct replica fanout so a stale replica
    * cannot silently hide rows during a multi-node join burst.
    * @param {Object} sqlQueryEngine
    * @param {string} tableName
    * @return {Promise<Object[]>}
    * @private
    */
  async resolveAuthoritativeBackfillRows(sqlQueryEngine, tableName, options = {}) {
    if (stryMutAct_9fa48("17977")) {
      {}
    } else {
      stryCov_9fa48("17977");
      const sql = stryMutAct_9fa48("17978") ? `` : (stryCov_9fa48("17978"), `SELECT * FROM ${tableName}`);
      const rowSets = stryMutAct_9fa48("17979") ? ["Stryker was here"] : (stryCov_9fa48("17979"), []);
      const systemTableSnapshots = stryMutAct_9fa48("17982") ? this.bootstrapResponse?.systemTableSnapshots && null : stryMutAct_9fa48("17981") ? false : stryMutAct_9fa48("17980") ? true : (stryCov_9fa48("17980", "17981", "17982"), (stryMutAct_9fa48("17983") ? this.bootstrapResponse.systemTableSnapshots : (stryCov_9fa48("17983"), this.bootstrapResponse?.systemTableSnapshots)) || null);
      const hasBootstrapSnapshot = stryMutAct_9fa48("17986") ? systemTableSnapshots !== null && typeof systemTableSnapshots === TYPEOF.OBJECT || Object.prototype.hasOwnProperty.call(systemTableSnapshots, tableName) : stryMutAct_9fa48("17985") ? false : stryMutAct_9fa48("17984") ? true : (stryCov_9fa48("17984", "17985", "17986"), (stryMutAct_9fa48("17988") ? systemTableSnapshots !== null || typeof systemTableSnapshots === TYPEOF.OBJECT : stryMutAct_9fa48("17987") ? true : (stryCov_9fa48("17987", "17988"), (stryMutAct_9fa48("17990") ? systemTableSnapshots === null : stryMutAct_9fa48("17989") ? true : (stryCov_9fa48("17989", "17990"), systemTableSnapshots !== null)) && (stryMutAct_9fa48("17992") ? typeof systemTableSnapshots !== TYPEOF.OBJECT : stryMutAct_9fa48("17991") ? true : (stryCov_9fa48("17991", "17992"), typeof systemTableSnapshots === TYPEOF.OBJECT)))) && Object.prototype.hasOwnProperty.call(systemTableSnapshots, tableName));
      const bootstrapSnapshotRows = Array.isArray(stryMutAct_9fa48("17993") ? systemTableSnapshots[tableName] : (stryCov_9fa48("17993"), systemTableSnapshots?.[tableName])) ? systemTableSnapshots[tableName] : stryMutAct_9fa48("17994") ? ["Stryker was here"] : (stryCov_9fa48("17994"), []);
      if (stryMutAct_9fa48("17996") ? false : stryMutAct_9fa48("17995") ? true : (stryCov_9fa48("17995", "17996"), hasBootstrapSnapshot)) {
        if (stryMutAct_9fa48("17997")) {
          {}
        } else {
          stryCov_9fa48("17997");
          rowSets.push(bootstrapSnapshotRows);
        }
      }
      if (stryMutAct_9fa48("18000") ? options.preferBootstrapSnapshot === true || hasBootstrapSnapshot : stryMutAct_9fa48("17999") ? false : stryMutAct_9fa48("17998") ? true : (stryCov_9fa48("17998", "17999", "18000"), (stryMutAct_9fa48("18002") ? options.preferBootstrapSnapshot !== true : stryMutAct_9fa48("18001") ? true : (stryCov_9fa48("18001", "18002"), options.preferBootstrapSnapshot === (stryMutAct_9fa48("18003") ? false : (stryCov_9fa48("18003"), true)))) && hasBootstrapSnapshot)) {
        if (stryMutAct_9fa48("18004")) {
          {}
        } else {
          stryCov_9fa48("18004");
          return this.mergeBackfillRowSets(tableName, rowSets);
        }
      }
      const routedResult = await sqlQueryEngine.executeQuery(sql, stryMutAct_9fa48("18005") ? ["Stryker was here"] : (stryCov_9fa48("18005"), []), stryMutAct_9fa48("18006") ? {} : (stryCov_9fa48("18006"), {
        deliveryPriority: options.deliveryPriority,
        timeoutMs: options.queryTimeoutMs
      }));
      if (stryMutAct_9fa48("18009") ? routedResult.success : stryMutAct_9fa48("18008") ? false : stryMutAct_9fa48("18007") ? true : (stryCov_9fa48("18007", "18008", "18009"), routedResult?.success)) {
        if (stryMutAct_9fa48("18010")) {
          {}
        } else {
          stryCov_9fa48("18010");
          rowSets.push(Array.isArray(routedResult.rows) ? routedResult.rows : stryMutAct_9fa48("18011") ? ["Stryker was here"] : (stryCov_9fa48("18011"), []));
        }
      }
      const replicaQuery = await this.queryBackfillRowsAcrossReplicas(sqlQueryEngine, tableName, sql, options);
      if (stryMutAct_9fa48("18014") ? replicaQuery || replicaQuery.rowSets.length > NUM.ZERO : stryMutAct_9fa48("18013") ? false : stryMutAct_9fa48("18012") ? true : (stryCov_9fa48("18012", "18013", "18014"), replicaQuery && (stryMutAct_9fa48("18017") ? replicaQuery.rowSets.length <= NUM.ZERO : stryMutAct_9fa48("18016") ? replicaQuery.rowSets.length >= NUM.ZERO : stryMutAct_9fa48("18015") ? true : (stryCov_9fa48("18015", "18016", "18017"), replicaQuery.rowSets.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("18018")) {
          {}
        } else {
          stryCov_9fa48("18018");
          rowSets.push(...replicaQuery.rowSets);
          const observedCounts = replicaQuery.rowSets.map(stryMutAct_9fa48("18019") ? () => undefined : (stryCov_9fa48("18019"), rows => rows.length));
          const mergedCount = this.mergeBackfillRowSets(tableName, replicaQuery.rowSets).length;
          const minReplicaCount = stryMutAct_9fa48("18020") ? Math.max(...observedCounts) : (stryCov_9fa48("18020"), Math.min(...observedCounts));
          const maxReplicaCount = stryMutAct_9fa48("18021") ? Math.min(...observedCounts) : (stryCov_9fa48("18021"), Math.max(...observedCounts));
          if (stryMutAct_9fa48("18024") ? minReplicaCount !== maxReplicaCount && mergedCount > maxReplicaCount : stryMutAct_9fa48("18023") ? false : stryMutAct_9fa48("18022") ? true : (stryCov_9fa48("18022", "18023", "18024"), (stryMutAct_9fa48("18026") ? minReplicaCount === maxReplicaCount : stryMutAct_9fa48("18025") ? false : (stryCov_9fa48("18025", "18026"), minReplicaCount !== maxReplicaCount)) || (stryMutAct_9fa48("18029") ? mergedCount <= maxReplicaCount : stryMutAct_9fa48("18028") ? mergedCount >= maxReplicaCount : stryMutAct_9fa48("18027") ? false : (stryCov_9fa48("18027", "18028", "18029"), mergedCount > maxReplicaCount)))) {
            if (stryMutAct_9fa48("18030")) {
              {}
            } else {
              stryCov_9fa48("18030");
              this.logger.warn(NODE_JOINING_SERVICE_LITERAL.JOIN_BACKFILL_DETECTED_REPLICA_DIVERGENCE, stryMutAct_9fa48("18031") ? {} : (stryCov_9fa48("18031"), {
                nodeId: this.nodeId,
                tableName,
                partitionId: replicaQuery.partitionId,
                replicaCount: replicaQuery.rowSets.length,
                observedCounts,
                mergedCount
              }));
            }
          }
        }
      }
      if (stryMutAct_9fa48("18034") ? rowSets.length !== NUM.ZERO : stryMutAct_9fa48("18033") ? false : stryMutAct_9fa48("18032") ? true : (stryCov_9fa48("18032", "18033", "18034"), rowSets.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("18035")) {
          {}
        } else {
          stryCov_9fa48("18035");
          throw new Error((stryMutAct_9fa48("18036") ? `` : (stryCov_9fa48("18036"), `Failed to backfill propagated table ${tableName}: `)) + (stryMutAct_9fa48("18037") ? `` : (stryCov_9fa48("18037"), `${stryMutAct_9fa48("18040") ? routedResult?.error && NODE_JOINING_SERVICE_LITERAL.QUERY_FAILED : stryMutAct_9fa48("18039") ? false : stryMutAct_9fa48("18038") ? true : (stryCov_9fa48("18038", "18039", "18040"), (stryMutAct_9fa48("18041") ? routedResult.error : (stryCov_9fa48("18041"), routedResult?.error)) || NODE_JOINING_SERVICE_LITERAL.QUERY_FAILED)}`)));
        }
      }
      return this.mergeBackfillRowSets(tableName, rowSets);
    }
  } /**
    * Query all known routable replicas for one propagated table and return
    * successful row sets. This is used only during join-time cache repair.
    * @param {Object} sqlQueryEngine
    * @param {string} tableName
    * @param {string} sql
    * @return {Promise<{partitionId: string, rowSets: Object[][]}|null>}
    * @private
    */
  async queryBackfillRowsAcrossReplicas(sqlQueryEngine, tableName, sql, options = {}) {
    if (stryMutAct_9fa48("18042")) {
      {}
    } else {
      stryCov_9fa48("18042");
      if (stryMutAct_9fa48("18045") ? options.allowReplicaFanout !== false : stryMutAct_9fa48("18044") ? false : stryMutAct_9fa48("18043") ? true : (stryCov_9fa48("18043", "18044", "18045"), options.allowReplicaFanout === (stryMutAct_9fa48("18046") ? true : (stryCov_9fa48("18046"), false)))) {
        if (stryMutAct_9fa48("18047")) {
          {}
        } else {
          stryCov_9fa48("18047");
          return null;
        }
      }
      const partitions = (stryMutAct_9fa48("18050") ? typeof sqlQueryEngine?.getTablePartitions !== TYPEOF.FUNCTION : stryMutAct_9fa48("18049") ? false : stryMutAct_9fa48("18048") ? true : (stryCov_9fa48("18048", "18049", "18050"), typeof (stryMutAct_9fa48("18051") ? sqlQueryEngine.getTablePartitions : (stryCov_9fa48("18051"), sqlQueryEngine?.getTablePartitions)) === TYPEOF.FUNCTION)) ? sqlQueryEngine.getTablePartitions(tableName) : stryMutAct_9fa48("18052") ? ["Stryker was here"] : (stryCov_9fa48("18052"), []);
      if (stryMutAct_9fa48("18055") ? !Array.isArray(partitions) && partitions.length !== NUM.ONE : stryMutAct_9fa48("18054") ? false : stryMutAct_9fa48("18053") ? true : (stryCov_9fa48("18053", "18054", "18055"), (stryMutAct_9fa48("18056") ? Array.isArray(partitions) : (stryCov_9fa48("18056"), !Array.isArray(partitions))) || (stryMutAct_9fa48("18058") ? partitions.length === NUM.ONE : stryMutAct_9fa48("18057") ? false : (stryCov_9fa48("18057", "18058"), partitions.length !== NUM.ONE)))) {
        if (stryMutAct_9fa48("18059")) {
          {}
        } else {
          stryCov_9fa48("18059");
          return null;
        }
      }
      const partitionId = stryMutAct_9fa48("18062") ? (partitions[0]?.partition_id || partitions[0]?.partitionId) && null : stryMutAct_9fa48("18061") ? false : stryMutAct_9fa48("18060") ? true : (stryCov_9fa48("18060", "18061", "18062"), (stryMutAct_9fa48("18064") ? partitions[0]?.partition_id && partitions[0]?.partitionId : stryMutAct_9fa48("18063") ? false : (stryCov_9fa48("18063", "18064"), (stryMutAct_9fa48("18065") ? partitions[0].partition_id : (stryCov_9fa48("18065"), partitions[0]?.partition_id)) || (stryMutAct_9fa48("18066") ? partitions[0].partitionId : (stryCov_9fa48("18066"), partitions[0]?.partitionId)))) || null);
      if (stryMutAct_9fa48("18069") ? false : stryMutAct_9fa48("18068") ? true : stryMutAct_9fa48("18067") ? partitionId : (stryCov_9fa48("18067", "18068", "18069"), !partitionId)) {
        if (stryMutAct_9fa48("18070")) {
          {}
        } else {
          stryCov_9fa48("18070");
          return null;
        }
      }
      const queryExecutor = stryMutAct_9fa48("18073") ? sqlQueryEngine?.queryExecutor && null : stryMutAct_9fa48("18072") ? false : stryMutAct_9fa48("18071") ? true : (stryCov_9fa48("18071", "18072", "18073"), (stryMutAct_9fa48("18074") ? sqlQueryEngine.queryExecutor : (stryCov_9fa48("18074"), sqlQueryEngine?.queryExecutor)) || null);
      const partitionServices = (stryMutAct_9fa48("18077") ? typeof queryExecutor?.getRoutablePartitionServices !== TYPEOF.FUNCTION : stryMutAct_9fa48("18076") ? false : stryMutAct_9fa48("18075") ? true : (stryCov_9fa48("18075", "18076", "18077"), typeof (stryMutAct_9fa48("18078") ? queryExecutor.getRoutablePartitionServices : (stryCov_9fa48("18078"), queryExecutor?.getRoutablePartitionServices)) === TYPEOF.FUNCTION)) ? queryExecutor.getRoutablePartitionServices(partitionId) : stryMutAct_9fa48("18079") ? ["Stryker was here"] : (stryCov_9fa48("18079"), []);
      if (stryMutAct_9fa48("18082") ? !Array.isArray(partitionServices) && partitionServices.length === NUM.ZERO : stryMutAct_9fa48("18081") ? false : stryMutAct_9fa48("18080") ? true : (stryCov_9fa48("18080", "18081", "18082"), (stryMutAct_9fa48("18083") ? Array.isArray(partitionServices) : (stryCov_9fa48("18083"), !Array.isArray(partitionServices))) || (stryMutAct_9fa48("18085") ? partitionServices.length !== NUM.ZERO : stryMutAct_9fa48("18084") ? false : (stryCov_9fa48("18084", "18085"), partitionServices.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("18086")) {
          {}
        } else {
          stryCov_9fa48("18086");
          return null;
        }
      }
      const seenAddresses = new Set();
      const deliveryTargets = stryMutAct_9fa48("18087") ? ["Stryker was here"] : (stryCov_9fa48("18087"), []);
      for (const service of partitionServices) {
        if (stryMutAct_9fa48("18088")) {
          {}
        } else {
          stryCov_9fa48("18088");
          const address = stryMutAct_9fa48("18091") ? service?.address && null : stryMutAct_9fa48("18090") ? false : stryMutAct_9fa48("18089") ? true : (stryCov_9fa48("18089", "18090", "18091"), (stryMutAct_9fa48("18092") ? service.address : (stryCov_9fa48("18092"), service?.address)) || null);
          if (stryMutAct_9fa48("18095") ? (typeof address !== TYPEOF.STRING || address.length === NUM.ZERO) && seenAddresses.has(address) : stryMutAct_9fa48("18094") ? false : stryMutAct_9fa48("18093") ? true : (stryCov_9fa48("18093", "18094", "18095"), (stryMutAct_9fa48("18097") ? typeof address !== TYPEOF.STRING && address.length === NUM.ZERO : stryMutAct_9fa48("18096") ? false : (stryCov_9fa48("18096", "18097"), (stryMutAct_9fa48("18099") ? typeof address === TYPEOF.STRING : stryMutAct_9fa48("18098") ? false : (stryCov_9fa48("18098", "18099"), typeof address !== TYPEOF.STRING)) || (stryMutAct_9fa48("18101") ? address.length !== NUM.ZERO : stryMutAct_9fa48("18100") ? false : (stryCov_9fa48("18100", "18101"), address.length === NUM.ZERO)))) || seenAddresses.has(address))) {
            if (stryMutAct_9fa48("18102")) {
              {}
            } else {
              stryCov_9fa48("18102");
              continue;
            }
          }
          seenAddresses.add(address);
          deliveryTargets.push(address);
        }
      }
      if (stryMutAct_9fa48("18105") ? deliveryTargets.length !== NUM.ZERO : stryMutAct_9fa48("18104") ? false : stryMutAct_9fa48("18103") ? true : (stryCov_9fa48("18103", "18104", "18105"), deliveryTargets.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("18106")) {
          {}
        } else {
          stryCov_9fa48("18106");
          return null;
        }
      }
      const messageRouter = stryMutAct_9fa48("18109") ? (queryExecutor?.messageRouter || this.messageRouter) && null : stryMutAct_9fa48("18108") ? false : stryMutAct_9fa48("18107") ? true : (stryCov_9fa48("18107", "18108", "18109"), (stryMutAct_9fa48("18111") ? queryExecutor?.messageRouter && this.messageRouter : stryMutAct_9fa48("18110") ? false : (stryCov_9fa48("18110", "18111"), (stryMutAct_9fa48("18112") ? queryExecutor.messageRouter : (stryCov_9fa48("18112"), queryExecutor?.messageRouter)) || this.messageRouter)) || null);
      if (stryMutAct_9fa48("18115") ? !messageRouter && typeof messageRouter.deliver !== TYPEOF.FUNCTION : stryMutAct_9fa48("18114") ? false : stryMutAct_9fa48("18113") ? true : (stryCov_9fa48("18113", "18114", "18115"), (stryMutAct_9fa48("18116") ? messageRouter : (stryCov_9fa48("18116"), !messageRouter)) || (stryMutAct_9fa48("18118") ? typeof messageRouter.deliver === TYPEOF.FUNCTION : stryMutAct_9fa48("18117") ? false : (stryCov_9fa48("18117", "18118"), typeof messageRouter.deliver !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("18119")) {
          {}
        } else {
          stryCov_9fa48("18119");
          return null;
        }
      }
      const replicaResults = stryMutAct_9fa48("18120") ? ["Stryker was here"] : (stryCov_9fa48("18120"), []);
      for (const address of deliveryTargets) {
        if (stryMutAct_9fa48("18121")) {
          {}
        } else {
          stryCov_9fa48("18121");
          replicaResults.push(await this.queryBackfillReplicaAddress(messageRouter, address, sql, options));
        }
      }
      const rowSets = stryMutAct_9fa48("18122") ? replicaResults.map(result => result.rows) : (stryCov_9fa48("18122"), replicaResults.filter(stryMutAct_9fa48("18123") ? () => undefined : (stryCov_9fa48("18123"), result => result.success)).map(stryMutAct_9fa48("18124") ? () => undefined : (stryCov_9fa48("18124"), result => result.rows)));
      return (stryMutAct_9fa48("18128") ? rowSets.length <= NUM.ZERO : stryMutAct_9fa48("18127") ? rowSets.length >= NUM.ZERO : stryMutAct_9fa48("18126") ? false : stryMutAct_9fa48("18125") ? true : (stryCov_9fa48("18125", "18126", "18127", "18128"), rowSets.length > NUM.ZERO)) ? stryMutAct_9fa48("18129") ? {} : (stryCov_9fa48("18129"), {
        partitionId,
        rowSets
      }) : null;
    }
  } /**
    * Query one partition replica address for join backfill.
    * @param {Object} messageRouter
    * @param {string} address
    * @param {string} sql
    * @return {Promise<{success: boolean, rows: Object[], error?: string}>}
    * @private
    */
  async queryBackfillReplicaAddress(messageRouter, address, sql, options = {}, seenAddresses = new Set()) {
    if (stryMutAct_9fa48("18130")) {
      {}
    } else {
      stryCov_9fa48("18130");
      if (stryMutAct_9fa48("18132") ? false : stryMutAct_9fa48("18131") ? true : (stryCov_9fa48("18131", "18132"), seenAddresses.has(address))) {
        if (stryMutAct_9fa48("18133")) {
          {}
        } else {
          stryCov_9fa48("18133");
          return stryMutAct_9fa48("18134") ? {} : (stryCov_9fa48("18134"), {
            success: stryMutAct_9fa48("18135") ? true : (stryCov_9fa48("18135"), false),
            rows: stryMutAct_9fa48("18136") ? ["Stryker was here"] : (stryCov_9fa48("18136"), []),
            error: stryMutAct_9fa48("18137") ? `` : (stryCov_9fa48("18137"), `redirect loop detected for ${address}`)
          });
        }
      }
      const nextSeenAddresses = new Set(seenAddresses);
      nextSeenAddresses.add(address);
      try {
        if (stryMutAct_9fa48("18138")) {
          {}
        } else {
          stryCov_9fa48("18138");
          const response = await messageRouter.deliver(address, stryMutAct_9fa48("18139") ? {} : (stryCov_9fa48("18139"), {
            type: JOIN_BACKFILL_QUERY.MESSAGE_TYPE,
            sql,
            params: stryMutAct_9fa48("18140") ? ["Stryker was here"] : (stryCov_9fa48("18140"), [])
          }), stryMutAct_9fa48("18141") ? {} : (stryCov_9fa48("18141"), {
            deliveryPriority: options.deliveryPriority
          }));
          if (stryMutAct_9fa48("18144") ? response?.redirect === JOIN_BACKFILL_QUERY.RESPONSE_TYPE.LEADER_REDIRECT || response?.leaderAddress : stryMutAct_9fa48("18143") ? false : stryMutAct_9fa48("18142") ? true : (stryCov_9fa48("18142", "18143", "18144"), (stryMutAct_9fa48("18146") ? response?.redirect !== JOIN_BACKFILL_QUERY.RESPONSE_TYPE.LEADER_REDIRECT : stryMutAct_9fa48("18145") ? true : (stryCov_9fa48("18145", "18146"), (stryMutAct_9fa48("18147") ? response.redirect : (stryCov_9fa48("18147"), response?.redirect)) === JOIN_BACKFILL_QUERY.RESPONSE_TYPE.LEADER_REDIRECT)) && (stryMutAct_9fa48("18148") ? response.leaderAddress : (stryCov_9fa48("18148"), response?.leaderAddress)))) {
            if (stryMutAct_9fa48("18149")) {
              {}
            } else {
              stryCov_9fa48("18149");
              return this.queryBackfillReplicaAddress(messageRouter, response.leaderAddress, sql, options, nextSeenAddresses);
            }
          }
          if (stryMutAct_9fa48("18152") ? response?.acknowledged || response?.success : stryMutAct_9fa48("18151") ? false : stryMutAct_9fa48("18150") ? true : (stryCov_9fa48("18150", "18151", "18152"), (stryMutAct_9fa48("18153") ? response.acknowledged : (stryCov_9fa48("18153"), response?.acknowledged)) && (stryMutAct_9fa48("18154") ? response.success : (stryCov_9fa48("18154"), response?.success)))) {
            if (stryMutAct_9fa48("18155")) {
              {}
            } else {
              stryCov_9fa48("18155");
              return stryMutAct_9fa48("18156") ? {} : (stryCov_9fa48("18156"), {
                success: stryMutAct_9fa48("18157") ? false : (stryCov_9fa48("18157"), true),
                rows: Array.isArray(response.rows) ? response.rows : stryMutAct_9fa48("18158") ? ["Stryker was here"] : (stryCov_9fa48("18158"), [])
              });
            }
          }
          return stryMutAct_9fa48("18159") ? {} : (stryCov_9fa48("18159"), {
            success: stryMutAct_9fa48("18160") ? true : (stryCov_9fa48("18160"), false),
            rows: stryMutAct_9fa48("18161") ? ["Stryker was here"] : (stryCov_9fa48("18161"), []),
            error: stryMutAct_9fa48("18164") ? response?.error && NODE_JOINING_SERVICE_LITERAL.QUERY_FAILED : stryMutAct_9fa48("18163") ? false : stryMutAct_9fa48("18162") ? true : (stryCov_9fa48("18162", "18163", "18164"), (stryMutAct_9fa48("18165") ? response.error : (stryCov_9fa48("18165"), response?.error)) || NODE_JOINING_SERVICE_LITERAL.QUERY_FAILED)
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("18166")) {
          {}
        } else {
          stryCov_9fa48("18166");
          return stryMutAct_9fa48("18167") ? {} : (stryCov_9fa48("18167"), {
            success: stryMutAct_9fa48("18168") ? true : (stryCov_9fa48("18168"), false),
            rows: stryMutAct_9fa48("18169") ? ["Stryker was here"] : (stryCov_9fa48("18169"), []),
            error: error.message
          });
        }
      }
    }
  } /**
    * Merge replicated row sets by primary key, preferring the freshest row.
    * @param {string} tableName
    * @param {Object[][]} rowSets
    * @return {Object[]}
    * @private
    */
  mergeBackfillRowSets(tableName, rowSets) {
    if (stryMutAct_9fa48("18170")) {
      {}
    } else {
      stryCov_9fa48("18170");
      const keyField = getSystemCachePrimaryKeyFieldOrFallback(tableName, CACHE_DEFAULT.PRIMARY_KEY_FALLBACK);
      const mergedRows = new Map();
      for (const rowSet of rowSets) {
        if (stryMutAct_9fa48("18171")) {
          {}
        } else {
          stryCov_9fa48("18171");
          const rows = Array.isArray(rowSet) ? rowSet : stryMutAct_9fa48("18172") ? ["Stryker was here"] : (stryCov_9fa48("18172"), []);
          for (const row of rows) {
            if (stryMutAct_9fa48("18173")) {
              {}
            } else {
              stryCov_9fa48("18173");
              const canonicalRow = canonicalizeSystemTableRow(tableName, row);
              const key = stryMutAct_9fa48("18174") ? canonicalRow?.[keyField] && canonicalRow?.[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK] : (stryCov_9fa48("18174"), (stryMutAct_9fa48("18175") ? canonicalRow[keyField] : (stryCov_9fa48("18175"), canonicalRow?.[keyField])) ?? (stryMutAct_9fa48("18176") ? canonicalRow[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK] : (stryCov_9fa48("18176"), canonicalRow?.[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK])));
              if (stryMutAct_9fa48("18179") ? typeof key === TYPEOF.UNDEFINED && key === null : stryMutAct_9fa48("18178") ? false : stryMutAct_9fa48("18177") ? true : (stryCov_9fa48("18177", "18178", "18179"), (stryMutAct_9fa48("18181") ? typeof key !== TYPEOF.UNDEFINED : stryMutAct_9fa48("18180") ? false : (stryCov_9fa48("18180", "18181"), typeof key === TYPEOF.UNDEFINED)) || (stryMutAct_9fa48("18183") ? key !== null : stryMutAct_9fa48("18182") ? false : (stryCov_9fa48("18182", "18183"), key === null)))) {
                if (stryMutAct_9fa48("18184")) {
                  {}
                } else {
                  stryCov_9fa48("18184");
                  continue;
                }
              }
              const existing = mergedRows.get(key);
              if (stryMutAct_9fa48("18187") ? !existing && this.isBackfillRowNewer(canonicalRow, existing) : stryMutAct_9fa48("18186") ? false : stryMutAct_9fa48("18185") ? true : (stryCov_9fa48("18185", "18186", "18187"), (stryMutAct_9fa48("18188") ? existing : (stryCov_9fa48("18188"), !existing)) || this.isBackfillRowNewer(canonicalRow, existing))) {
                if (stryMutAct_9fa48("18189")) {
                  {}
                } else {
                  stryCov_9fa48("18189");
                  mergedRows.set(key, canonicalRow);
                }
              }
            }
          }
        }
      }
      return stryMutAct_9fa48("18190") ? [] : (stryCov_9fa48("18190"), [...mergedRows.values()]);
    }
  } /**
    * Prefer the row with the newest schema/version watermark.
    * @param {Object} candidate
    * @param {Object} existing
    * @return {boolean}
    * @private
    */
  isBackfillRowNewer(candidate, existing) {
    if (stryMutAct_9fa48("18191")) {
      {}
    } else {
      stryCov_9fa48("18191");
      const candidateVersion = extractJoinSchemaVersionFromRecord(candidate);
      const existingVersion = extractJoinSchemaVersionFromRecord(existing);
      if (stryMutAct_9fa48("18194") ? candidateVersion || existingVersion : stryMutAct_9fa48("18193") ? false : stryMutAct_9fa48("18192") ? true : (stryCov_9fa48("18192", "18193", "18194"), candidateVersion && existingVersion)) {
        if (stryMutAct_9fa48("18195")) {
          {}
        } else {
          stryCov_9fa48("18195");
          return stryMutAct_9fa48("18199") ? compareJoinSchemaVersions(candidateVersion, existingVersion) <= NUM.ZERO : stryMutAct_9fa48("18198") ? compareJoinSchemaVersions(candidateVersion, existingVersion) >= NUM.ZERO : stryMutAct_9fa48("18197") ? false : stryMutAct_9fa48("18196") ? true : (stryCov_9fa48("18196", "18197", "18198", "18199"), compareJoinSchemaVersions(candidateVersion, existingVersion) > NUM.ZERO);
        }
      }
      if (stryMutAct_9fa48("18202") ? candidateVersion || !existingVersion : stryMutAct_9fa48("18201") ? false : stryMutAct_9fa48("18200") ? true : (stryCov_9fa48("18200", "18201", "18202"), candidateVersion && (stryMutAct_9fa48("18203") ? existingVersion : (stryCov_9fa48("18203"), !existingVersion)))) {
        if (stryMutAct_9fa48("18204")) {
          {}
        } else {
          stryCov_9fa48("18204");
          return stryMutAct_9fa48("18205") ? false : (stryCov_9fa48("18205"), true);
        }
      }
      if (stryMutAct_9fa48("18208") ? !candidateVersion || existingVersion : stryMutAct_9fa48("18207") ? false : stryMutAct_9fa48("18206") ? true : (stryCov_9fa48("18206", "18207", "18208"), (stryMutAct_9fa48("18209") ? candidateVersion : (stryCov_9fa48("18209"), !candidateVersion)) && existingVersion)) {
        if (stryMutAct_9fa48("18210")) {
          {}
        } else {
          stryCov_9fa48("18210");
          return stryMutAct_9fa48("18211") ? true : (stryCov_9fa48("18211"), false);
        }
      }
      return stryMutAct_9fa48("18215") ? JSON.stringify(candidate).length <= JSON.stringify(existing).length : stryMutAct_9fa48("18214") ? JSON.stringify(candidate).length >= JSON.stringify(existing).length : stryMutAct_9fa48("18213") ? false : stryMutAct_9fa48("18212") ? true : (stryCov_9fa48("18212", "18213", "18214", "18215"), JSON.stringify(candidate).length > JSON.stringify(existing).length);
    }
  } /**
    * Make an HTTP POST request.
    * @param {string} url - URL to post to.
    * @param {Object} body - Request body.
    * @return {Promise<Object>} Response body.
    * @private
    */
  async httpPost(url, body) {
    if (stryMutAct_9fa48("18216")) {
      {}
    } else {
      stryCov_9fa48("18216");
      // AbortController is a global in Node.js 22+
      const controller = new globalThis.AbortController();
      const timeoutId = setTimeout(stryMutAct_9fa48("18217") ? () => undefined : (stryCov_9fa48("18217"), () => controller.abort()), this.config.httpTimeoutMs);
      try {
        if (stryMutAct_9fa48("18218")) {
          {}
        } else {
          stryCov_9fa48("18218");
          const response = await fetch(url, stryMutAct_9fa48("18219") ? {} : (stryCov_9fa48("18219"), {
            method: JOINING_HTTP.METHOD_POST,
            headers: stryMutAct_9fa48("18220") ? {} : (stryCov_9fa48("18220"), {
              [JOINING_HTTP.HEADER_CONTENT_TYPE]: JOINING_HTTP.CONTENT_TYPE_JSON,
              [JOINING_HTTP.HEADER_CONNECTION]: JOINING_HTTP.CONNECTION_CLOSE
            }),
            body: JSON.stringify(body),
            signal: controller.signal
          }));
          clearTimeout(timeoutId);
          if (stryMutAct_9fa48("18223") ? false : stryMutAct_9fa48("18222") ? true : stryMutAct_9fa48("18221") ? response.ok : (stryCov_9fa48("18221", "18222", "18223"), !response.ok)) {
            if (stryMutAct_9fa48("18224")) {
              {}
            } else {
              stryCov_9fa48("18224");
              const retryAfterHeader = response.headers.get(JOINING_HTTP.HEADER_RETRY_AFTER);
              const errorBody = await response.text();
              let parsedBody = null;
              try {
                if (stryMutAct_9fa48("18225")) {
                  {}
                } else {
                  stryCov_9fa48("18225");
                  parsedBody = JSON.parse(errorBody);
                }
              } catch (_parseError) {
                if (stryMutAct_9fa48("18226")) {
                  {}
                } else {
                  stryCov_9fa48("18226");
                  parsedBody = null;
                }
              }
              const httpStatusError = JOINING_ERROR_MSG.httpStatus;
              const error = new Error(httpStatusError(response.status, errorBody));
              error.statusCode = response.status;
              error.responseBody = errorBody;
              error.responseJson = parsedBody;
              const retryAfterHintMs = this.parseRetryAfterHeaderMs(retryAfterHeader);
              const retryAfterBodyMs = Number.isFinite(stryMutAct_9fa48("18227") ? parsedBody.retryAfterMs : (stryCov_9fa48("18227"), parsedBody?.retryAfterMs)) ? Math.floor(parsedBody.retryAfterMs) : null;
              const retryAfterMs = (stryMutAct_9fa48("18230") ? Number.isFinite(retryAfterHintMs) || Number.isFinite(retryAfterBodyMs) : stryMutAct_9fa48("18229") ? false : stryMutAct_9fa48("18228") ? true : (stryCov_9fa48("18228", "18229", "18230"), Number.isFinite(retryAfterHintMs) && Number.isFinite(retryAfterBodyMs))) ? stryMutAct_9fa48("18231") ? Math.min(retryAfterHintMs, retryAfterBodyMs) : (stryCov_9fa48("18231"), Math.max(retryAfterHintMs, retryAfterBodyMs)) : Number.isFinite(retryAfterHintMs) ? retryAfterHintMs : retryAfterBodyMs;
              if (stryMutAct_9fa48("18233") ? false : stryMutAct_9fa48("18232") ? true : (stryCov_9fa48("18232", "18233"), Number.isFinite(retryAfterMs))) {
                if (stryMutAct_9fa48("18234")) {
                  {}
                } else {
                  stryCov_9fa48("18234");
                  error.retryAfterMs = retryAfterMs;
                }
              }
              throw error;
            }
          }
          return await response.json();
        }
      } catch (error) {
        if (stryMutAct_9fa48("18235")) {
          {}
        } else {
          stryCov_9fa48("18235");
          clearTimeout(timeoutId);
          if (stryMutAct_9fa48("18238") ? error.name !== JOINING_ERROR_NAME.ABORT : stryMutAct_9fa48("18237") ? false : stryMutAct_9fa48("18236") ? true : (stryCov_9fa48("18236", "18237", "18238"), error.name === JOINING_ERROR_NAME.ABORT)) {
            if (stryMutAct_9fa48("18239")) {
              {}
            } else {
              stryCov_9fa48("18239");
              const httpTimeoutError = JOINING_ERROR_MSG.httpTimeout;
              throw new Error(httpTimeoutError(this.config.httpTimeoutMs));
            }
          }
          throw error;
        }
      }
    }
  } /**
    * Parse Retry-After header into milliseconds when possible.
    * Supports delta-seconds and HTTP date formats.
    * @param {string|null} retryAfterHeader
    * @return {number|null}
    * @private
    */
  parseRetryAfterHeaderMs(retryAfterHeader) {
    if (stryMutAct_9fa48("18240")) {
      {}
    } else {
      stryCov_9fa48("18240");
      if (stryMutAct_9fa48("18243") ? typeof retryAfterHeader !== TYPEOF.STRING && retryAfterHeader.length === NUM.ZERO : stryMutAct_9fa48("18242") ? false : stryMutAct_9fa48("18241") ? true : (stryCov_9fa48("18241", "18242", "18243"), (stryMutAct_9fa48("18245") ? typeof retryAfterHeader === TYPEOF.STRING : stryMutAct_9fa48("18244") ? false : (stryCov_9fa48("18244", "18245"), typeof retryAfterHeader !== TYPEOF.STRING)) || (stryMutAct_9fa48("18247") ? retryAfterHeader.length !== NUM.ZERO : stryMutAct_9fa48("18246") ? false : (stryCov_9fa48("18246", "18247"), retryAfterHeader.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("18248")) {
          {}
        } else {
          stryCov_9fa48("18248");
          return null;
        }
      }
      const deltaSeconds = Number(retryAfterHeader);
      if (stryMutAct_9fa48("18251") ? Number.isFinite(deltaSeconds) || deltaSeconds >= NUM.ZERO : stryMutAct_9fa48("18250") ? false : stryMutAct_9fa48("18249") ? true : (stryCov_9fa48("18249", "18250", "18251"), Number.isFinite(deltaSeconds) && (stryMutAct_9fa48("18254") ? deltaSeconds < NUM.ZERO : stryMutAct_9fa48("18253") ? deltaSeconds > NUM.ZERO : stryMutAct_9fa48("18252") ? true : (stryCov_9fa48("18252", "18253", "18254"), deltaSeconds >= NUM.ZERO)))) {
        if (stryMutAct_9fa48("18255")) {
          {}
        } else {
          stryCov_9fa48("18255");
          return Math.floor(stryMutAct_9fa48("18256") ? deltaSeconds / TIME_MS.SECOND : (stryCov_9fa48("18256"), deltaSeconds * TIME_MS.SECOND));
        }
      }
      const retryAtMs = Date.parse(retryAfterHeader);
      if (stryMutAct_9fa48("18259") ? false : stryMutAct_9fa48("18258") ? true : stryMutAct_9fa48("18257") ? Number.isFinite(retryAtMs) : (stryCov_9fa48("18257", "18258", "18259"), !Number.isFinite(retryAtMs))) {
        if (stryMutAct_9fa48("18260")) {
          {}
        } else {
          stryCov_9fa48("18260");
          return null;
        }
      }
      return stryMutAct_9fa48("18261") ? Math.min(NUM.ZERO, retryAtMs - this.now()) : (stryCov_9fa48("18261"), Math.max(NUM.ZERO, stryMutAct_9fa48("18262") ? retryAtMs + this.now() : (stryCov_9fa48("18262"), retryAtMs - this.now())));
    }
  } /**
    * Create the shared CDC pipeline readiness gate.
    * Tests override this to inject manual time instead of wall-clock waits.
    * @param {Object} systemTableCache
    * @return {CDCPipelineReadinessGate}
    */
  createCdcPipelineReadinessGate(systemTableCache) {
    if (stryMutAct_9fa48("18263")) {
      {}
    } else {
      stryCov_9fa48("18263");
      return new CDCPipelineReadinessGate(stryMutAct_9fa48("18264") ? {} : (stryCov_9fa48("18264"), {
        systemTableCache,
        cdcPropagatedTables: CDC_PROPAGATED_TABLES,
        now: stryMutAct_9fa48("18265") ? () => undefined : (stryCov_9fa48("18265"), () => this.now()),
        sleep: stryMutAct_9fa48("18266") ? () => undefined : (stryCov_9fa48("18266"), delayMs => this.sleep(delayMs))
      }));
    }
  } /**
    * Handle joining failure.
    * @param {Error} error - The error that caused failure.
    * @return {Object} Failure result.
    * @private
    */
  async handleJoiningFailure(error) {
    if (stryMutAct_9fa48("18267")) {
      {}
    } else {
      stryCov_9fa48("18267");
      return this.joinCleanupHandler.handleJoiningFailure(error);
    }
  } /**
    * Clean up a failed join in reverse phase order.
    * Each cleanup step undoes the work of the corresponding join phase.
    * Errors are logged but never thrown — cleanup is best-effort.
    * @param {string} failedPhase - The JOINING_PHASE that failed.
    * @param {Object} cleanupContext - Tracking info for cleanup.
    * @param {string} cleanupContext.registeredNodeId - Node ID if
    *   registered before failure.
    * @param {string[]} cleanupContext.createdServiceIds - Service IDs
    *   created before failure.
    * @param {string[]} cleanupContext.createdMessageGroupIds - Message
    *   group IDs created before failure.
    * @return {Promise<void>}
    */
  async cleanupFailedJoin(failedPhase, cleanupContext) {
    if (stryMutAct_9fa48("18268")) {
      {}
    } else {
      stryCov_9fa48("18268");
      return this.joinCleanupHandler.cleanupFailedJoin(failedPhase, cleanupContext);
    }
  } /**
    * Execute a single join cleanup step. Each step is wrapped in
    * try/catch so that cleanup errors are logged but never thrown.
    * @param {string} step - The cleanup step to execute.
    * @param {Object} cleanupContext - Cleanup context.
    * @return {Promise<string>} Cleanup result constant.
    * @private
    */
  async _executeJoinCleanupStep(step, cleanupContext) {
    if (stryMutAct_9fa48("18269")) {
      {}
    } else {
      stryCov_9fa48("18269");
      return this.joinCleanupHandler._executeJoinCleanupStep(step, cleanupContext);
    }
  } /**
    * Cleanup step: remove self from nodes table and remove
    * service entries created during join.
    * @param {Object} cleanupContext - Cleanup context.
    * @return {Promise<string>} Cleanup result constant.
    * @private
    */
  async _cleanupQueryingState(cleanupContext) {
    if (stryMutAct_9fa48("18270")) {
      {}
    } else {
      stryCov_9fa48("18270");
      return this.joinCleanupHandler._cleanupQueryingState(cleanupContext);
    }
  } /**
    * Cleanup step: stop message group services that were
    * waiting for leadership.
    * @return {Promise<string>} Cleanup result constant.
    * @private
    */
  async _cleanupWaitingLeadership() {
    if (stryMutAct_9fa48("18271")) {
      {}
    } else {
      stryCov_9fa48("18271");
      return this.joinCleanupHandler._cleanupWaitingLeadership();
    }
  } /**
    * Cleanup step: stop message group replicas and remove
    * their service entries.
    * @param {Object} cleanupContext - Cleanup context.
    * @return {Promise<string>} Cleanup result constant.
    * @private
    */
  async _cleanupMessageGroup(cleanupContext) {
    if (stryMutAct_9fa48("18272")) {
      {}
    } else {
      stryCov_9fa48("18272");
      return this.joinCleanupHandler._cleanupMessageGroup(cleanupContext);
    }
  } /**
    * Cleanup step: disconnect from seed node and stop
    * the message router.
    * @return {Promise<string>} Cleanup result constant.
    * @private
    */
  async _cleanupConnectingWebSocket() {
    if (stryMutAct_9fa48("18273")) {
      {}
    } else {
      stryCov_9fa48("18273");
      return this.joinCleanupHandler._cleanupConnectingWebSocket();
    }
  } /**
    * Clean up partially initialized services.
    * @return {Promise<void>}
    * @private
    */
  async cleanup() {
    if (stryMutAct_9fa48("18274")) {
      {}
    } else {
      stryCov_9fa48("18274");
      return this.joinCleanupHandler.cleanup();
    }
  } /**
    * Restore durable local partition runtimes from hydrated system metadata
    * before join admission writes depend on canonical partition leadership.
    * @param {Object} systemTableCache
    * @return {Promise<Object[]>}
    * @private
    */
  async restoreDurableRejoinLocalPartitionServices(systemTableCache) {
    if (stryMutAct_9fa48("18275")) {
      {}
    } else {
      stryCov_9fa48("18275");
      if (stryMutAct_9fa48("18278") ? this.startupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN : stryMutAct_9fa48("18277") ? false : stryMutAct_9fa48("18276") ? true : (stryCov_9fa48("18276", "18277", "18278"), this.startupMode !== STARTUP_JOIN_MODE.DURABLE_REJOIN)) {
        if (stryMutAct_9fa48("18279")) {
          {}
        } else {
          stryCov_9fa48("18279");
          return stryMutAct_9fa48("18280") ? ["Stryker was here"] : (stryCov_9fa48("18280"), []);
        }
      }
      const restorePlans = buildDurableRejoinPartitionRestorePlans(stryMutAct_9fa48("18281") ? {} : (stryCov_9fa48("18281"), {
        systemTableCache,
        nodeId: this.nodeId,
        dataDir: this.dataDir
      }));
      if (stryMutAct_9fa48("18284") ? restorePlans.length !== NUM.ZERO : stryMutAct_9fa48("18283") ? false : stryMutAct_9fa48("18282") ? true : (stryCov_9fa48("18282", "18283", "18284"), restorePlans.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("18285")) {
          {}
        } else {
          stryCov_9fa48("18285");
          return stryMutAct_9fa48("18286") ? ["Stryker was here"] : (stryCov_9fa48("18286"), []);
        }
      }
      await this.initializeJoiningLifecycleOwners();
      for (const restorePlan of restorePlans) {
        if (stryMutAct_9fa48("18287")) {
          {}
        } else {
          stryCov_9fa48("18287");
          this.queueJoinServiceReplica(this.createJoinServiceDescriptor(UNIFIED_SERVICE_TYPE.PARTITION, restorePlan.replicaId), restorePlan);
        }
      }
      await this.triggerJoinReconciler(JOINING_UNIFIED_RECONCILE.HYDRATION_REASON);
      await this.activateJoinPartitionServiceRows(restorePlans.map(stryMutAct_9fa48("18288") ? () => undefined : (stryCov_9fa48("18288"), ({
        replicaId
      }) => replicaId)));
      this.startDurableRejoinLocalPartitionElections(restorePlans);
      this.logger.info(NODE_JOINING_SERVICE_LITERAL.RESTORED_DURABLE_LOCAL_PARTITION_SERVICES_FROM_CACHED_TOPOLOGY, stryMutAct_9fa48("18289") ? {} : (stryCov_9fa48("18289"), {
        nodeId: this.nodeId,
        restoredReplicaCount: restorePlans.length,
        restoredPartitionIds: restorePlans.map(stryMutAct_9fa48("18290") ? () => undefined : (stryCov_9fa48("18290"), ({
          partitionId
        }) => partitionId))
      }));
      return restorePlans;
    }
  } /**
    * Start elections for restored durable partition replicas once the batch
    * has been recreated locally.
    * @param {Object[]} restorePlans
    * @return {void}
    * @private
    */
  startDurableRejoinLocalPartitionElections(restorePlans = stryMutAct_9fa48("18291") ? ["Stryker was here"] : (stryCov_9fa48("18291"), [])) {
    if (stryMutAct_9fa48("18292")) {
      {}
    } else {
      stryCov_9fa48("18292");
      for (const restorePlan of restorePlans) {
        if (stryMutAct_9fa48("18293")) {
          {}
        } else {
          stryCov_9fa48("18293");
          const replicaId = stryMutAct_9fa48("18294") ? restorePlan.replicaId : (stryCov_9fa48("18294"), restorePlan?.replicaId);
          if (stryMutAct_9fa48("18297") ? typeof replicaId !== TYPEOF.STRING && replicaId.length === NUM.ZERO : stryMutAct_9fa48("18296") ? false : stryMutAct_9fa48("18295") ? true : (stryCov_9fa48("18295", "18296", "18297"), (stryMutAct_9fa48("18299") ? typeof replicaId === TYPEOF.STRING : stryMutAct_9fa48("18298") ? false : (stryCov_9fa48("18298", "18299"), typeof replicaId !== TYPEOF.STRING)) || (stryMutAct_9fa48("18301") ? replicaId.length !== NUM.ZERO : stryMutAct_9fa48("18300") ? false : (stryCov_9fa48("18300", "18301"), replicaId.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("18302")) {
              {}
            } else {
              stryCov_9fa48("18302");
              continue;
            }
          }
          const partition = this.partitionServices.get(replicaId);
          if (stryMutAct_9fa48("18305") ? typeof partition?.startElection !== TYPEOF.FUNCTION : stryMutAct_9fa48("18304") ? false : stryMutAct_9fa48("18303") ? true : (stryCov_9fa48("18303", "18304", "18305"), typeof (stryMutAct_9fa48("18306") ? partition.startElection : (stryCov_9fa48("18306"), partition?.startElection)) === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("18307")) {
              {}
            } else {
              stryCov_9fa48("18307");
              partition.startElection();
            }
          }
        }
      }
    }
  } /**
    * Initialize the ReplicaHandler to handle CREATE_REPLICA/REMOVE_REPLICA.
    * Requirements: 3.1, 3.2 - Use MessageRouter directly for all communication.
    * @private
    */
  initializeReplicaHandler() {
    if (stryMutAct_9fa48("18308")) {
      {}
    } else {
      stryCov_9fa48("18308");
      const messageGroupService = this.getLeaderMessageGroupService();
      if (stryMutAct_9fa48("18311") ? false : stryMutAct_9fa48("18310") ? true : stryMutAct_9fa48("18309") ? this.messageRouter : (stryCov_9fa48("18309", "18310", "18311"), !this.messageRouter)) {
        if (stryMutAct_9fa48("18312")) {
          {}
        } else {
          stryCov_9fa48("18312");
          this.logger.error(JOINING_LOG_MSG.REPLICA_HANDLER_ROUTER_MISSING, stryMutAct_9fa48("18313") ? {} : (stryCov_9fa48("18313"), {
            nodeId: this.nodeId
          }));
          throw new Error(JOINING_ERROR_MSG.REPLICA_HANDLER_ROUTER_REQUIRED);
        }
      }
      const cdcIntegrationService = this.createCdcIntegrationService();
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      if (stryMutAct_9fa48("18316") ? false : stryMutAct_9fa48("18315") ? true : stryMutAct_9fa48("18314") ? this.tablePolicyService : (stryCov_9fa48("18314", "18315", "18316"), !this.tablePolicyService)) {
        if (stryMutAct_9fa48("18317")) {
          {}
        } else {
          stryCov_9fa48("18317");
          this.tablePolicyService = new TablePolicyService(stryMutAct_9fa48("18318") ? {} : (stryCov_9fa48("18318"), {
            systemTableCache: systemTableCache,
            cdcIntegrationService: cdcIntegrationService
          }));
          this.tablePolicyService.initialize();
        }
      }
      const createPartitionService = stryMutAct_9fa48("18319") ? () => undefined : (stryCov_9fa48("18319"), (() => {
        const createPartitionService = async options => this.createJoinLocalPartitionService(stryMutAct_9fa48("18320") ? {} : (stryCov_9fa48("18320"), {
          ...options,
          messageGroupService
        }));
        return createPartitionService;
      })()); // Use shared ReplicaHandlerSetup component
      const {
        replicaHandler,
        replicaStateMachine
      } = ReplicaHandlerSetup.create(stryMutAct_9fa48("18321") ? {} : (stryCov_9fa48("18321"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        cdcIntegrationService: cdcIntegrationService,
        systemTableCache: systemTableCache,
        createPartitionService: createPartitionService,
        dataDir: this.dataDir,
        rpcClient: this.rpcClient
      }));
      this.replicaHandler = replicaHandler;
      this.replicaStateMachine = replicaStateMachine;
      this.logger.info(JOINING_LOG_MSG.REPLICA_HANDLER_READY, stryMutAct_9fa48("18322") ? {} : (stryCov_9fa48("18322"), {
        nodeId: this.nodeId,
        hasMessageGroupService: stryMutAct_9fa48("18323") ? !messageGroupService : (stryCov_9fa48("18323"), !(stryMutAct_9fa48("18324") ? messageGroupService : (stryCov_9fa48("18324"), !messageGroupService)))
      }));
    }
  } /**
    * Create and initialize one local partition service on the join path.
    * Shared by the replica handler and durable-rejoin restore lifecycle.
    * @param {Object} options
    * @return {Promise<PartitionService>}
    * @private
    */
  async createJoinLocalPartitionService(options) {
    if (stryMutAct_9fa48("18325")) {
      {}
    } else {
      stryCov_9fa48("18325");
      const cdcIntegrationService = this.createCdcIntegrationService();
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      if (stryMutAct_9fa48("18328") ? false : stryMutAct_9fa48("18327") ? true : stryMutAct_9fa48("18326") ? this.tablePolicyService : (stryCov_9fa48("18326", "18327", "18328"), !this.tablePolicyService)) {
        if (stryMutAct_9fa48("18329")) {
          {}
        } else {
          stryCov_9fa48("18329");
          this.tablePolicyService = new TablePolicyService(stryMutAct_9fa48("18330") ? {} : (stryCov_9fa48("18330"), {
            systemTableCache,
            cdcIntegrationService
          }));
          this.tablePolicyService.initialize();
        }
      }
      const cacheForPartition = this.systemCacheHydrated ? systemTableCache : null;
      const messageGroupService = stryMutAct_9fa48("18333") ? options.messageGroupService && this.getLeaderMessageGroupService() : stryMutAct_9fa48("18332") ? false : stryMutAct_9fa48("18331") ? true : (stryCov_9fa48("18331", "18332", "18333"), options.messageGroupService || this.getLeaderMessageGroupService());
      const partition = new PartitionService(stryMutAct_9fa48("18334") ? {} : (stryCov_9fa48("18334"), {
        ...options,
        transport: this.transport,
        messageGroupService,
        messageRouter: this.messageRouter,
        rebalanceCoordinator: this.rebalanceCoordinator,
        replicaStateMachine: this.replicaStateMachine,
        systemTableCache: cacheForPartition,
        cdcIntegrationService,
        sqlQueryEngine: stryMutAct_9fa48("18337") ? cdcIntegrationService?.sqlQueryEngine && null : stryMutAct_9fa48("18336") ? false : stryMutAct_9fa48("18335") ? true : (stryCov_9fa48("18335", "18336", "18337"), (stryMutAct_9fa48("18338") ? cdcIntegrationService.sqlQueryEngine : (stryCov_9fa48("18338"), cdcIntegrationService?.sqlQueryEngine)) || null),
        tablePolicyService: this.tablePolicyService,
        bootstrapReadinessState: this.bootstrapReadinessState
      }));
      await partition.initialize();
      this.partitionServices.set(options.replicaId, partition);
      this.trackJoinPartitionReplica(options.replicaId, options.partitionId, partition);
      const tableName = options.tableName;
      if (stryMutAct_9fa48("18341") ? tableName || shouldAttachPartitionCdcPropagation(tableName) : stryMutAct_9fa48("18340") ? false : stryMutAct_9fa48("18339") ? true : (stryCov_9fa48("18339", "18340", "18341"), tableName && shouldAttachPartitionCdcPropagation(tableName))) {
        if (stryMutAct_9fa48("18342")) {
          {}
        } else {
          stryCov_9fa48("18342");
          const subscriptionSelection = await this.resolveOperationalMessageGroupSelectionAsync(stryMutAct_9fa48("18343") ? {} : (stryCov_9fa48("18343"), {
            requiredTables: stryMutAct_9fa48("18344") ? [] : (stryCov_9fa48("18344"), [tableName])
          }));
          const subscriptionMessageGroupService = subscriptionSelection.service;
          if (stryMutAct_9fa48("18347") ? false : stryMutAct_9fa48("18346") ? true : stryMutAct_9fa48("18345") ? subscriptionMessageGroupService : (stryCov_9fa48("18345", "18346", "18347"), !subscriptionMessageGroupService)) {
            if (stryMutAct_9fa48("18348")) {
              {}
            } else {
              stryCov_9fa48("18348");
              throw this.buildMessageGroupOwnerNotReadyError(subscriptionSelection, stryMutAct_9fa48("18349") ? {} : (stryCov_9fa48("18349"), {
                message: (stryMutAct_9fa48("18350") ? `` : (stryCov_9fa48("18350"), `Operational message-group ingress not ready `)) + (stryMutAct_9fa48("18351") ? `` : (stryCov_9fa48("18351"), `for ${tableName} CDC subscription`))
              }));
            }
          }
          await subscriptionMessageGroupService.subscribeToCDC(tableName);
          const subscriberId = (stryMutAct_9fa48("18352") ? [] : (stryCov_9fa48("18352"), [stryMutAct_9fa48("18353") ? "" : (stryCov_9fa48("18353"), 'joining'), this.nodeId, tableName, options.replicaId, stryMutAct_9fa48("18356") ? subscriptionMessageGroupService?.groupId && 'message-group' : stryMutAct_9fa48("18355") ? false : stryMutAct_9fa48("18354") ? true : (stryCov_9fa48("18354", "18355", "18356"), (stryMutAct_9fa48("18357") ? subscriptionMessageGroupService.groupId : (stryCov_9fa48("18357"), subscriptionMessageGroupService?.groupId)) || (stryMutAct_9fa48("18358") ? "" : (stryCov_9fa48("18358"), 'message-group')))])).join(stryMutAct_9fa48("18359") ? "" : (stryCov_9fa48("18359"), ':'));
          const cdcSubscriber = async cdcEvent => {
            if (stryMutAct_9fa48("18360")) {
              {}
            } else {
              stryCov_9fa48("18360");
              if (stryMutAct_9fa48("18363") ? cdcEvent.tableName !== tableName : stryMutAct_9fa48("18362") ? false : stryMutAct_9fa48("18361") ? true : (stryCov_9fa48("18361", "18362", "18363"), cdcEvent.tableName === tableName)) {
                if (stryMutAct_9fa48("18364")) {
                  {}
                } else {
                  stryCov_9fa48("18364");
                  this.logger.debug(JOINING_LOG_MSG.CDC_EVENT_RECEIVED, stryMutAct_9fa48("18365") ? {} : (stryCov_9fa48("18365"), {
                    tableName: cdcEvent.tableName,
                    operation: cdcEvent.operation,
                    partitionId: options.partitionId,
                    replicaId: options.replicaId
                  }));
                  const propagationMessageGroupService = await this.resolveCdcPropagationMessageGroup(subscriptionMessageGroupService, stryMutAct_9fa48("18366") ? {} : (stryCov_9fa48("18366"), {
                    requiredTables: stryMutAct_9fa48("18367") ? [] : (stryCov_9fa48("18367"), [tableName])
                  }));
                  if (stryMutAct_9fa48("18370") ? false : stryMutAct_9fa48("18369") ? true : stryMutAct_9fa48("18368") ? propagationMessageGroupService : (stryCov_9fa48("18368", "18369", "18370"), !propagationMessageGroupService)) {
                    if (stryMutAct_9fa48("18371")) {
                      {}
                    } else {
                      stryCov_9fa48("18371");
                      const propagationSelection = await this.resolveOperationalMessageGroupSelectionAsync(stryMutAct_9fa48("18372") ? {} : (stryCov_9fa48("18372"), {
                        requiredTables: stryMutAct_9fa48("18373") ? [] : (stryCov_9fa48("18373"), [tableName]),
                        preferredService: subscriptionMessageGroupService
                      }));
                      throw this.buildMessageGroupOwnerNotReadyError(propagationSelection, stryMutAct_9fa48("18374") ? {} : (stryCov_9fa48("18374"), {
                        message: (stryMutAct_9fa48("18375") ? `` : (stryCov_9fa48("18375"), `Operational message-group ingress not ready `)) + (stryMutAct_9fa48("18376") ? `` : (stryCov_9fa48("18376"), `for ${tableName} CDC propagation`))
                      }));
                    }
                  }
                  await this.propagatePartitionCDCEvent(propagationMessageGroupService, cdcEvent);
                }
              }
            }
          };
          const handshake = await partition.subscribeToCDCWithHandshake(cdcSubscriber, stryMutAct_9fa48("18377") ? {} : (stryCov_9fa48("18377"), {
            subscriberId
          }));
          this.logger.debug(JOINING_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, stryMutAct_9fa48("18378") ? {} : (stryCov_9fa48("18378"), {
            tableName,
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            subscriberId: handshake.subscriberId,
            subscriptionEpoch: handshake.subscriptionEpoch,
            catchupMode: handshake.catchup.mode,
            bufferedEventsReplayed: handshake.catchup.bufferedEventsReplayed
          }));
        }
      }
      return partition;
    }
  } /**
    * Register one locally restored partition with replica-handler recovery state.
    * @param {string} replicaId
    * @param {string} partitionId
    * @param {Object} partition
    * @return {void}
    * @private
    */
  trackJoinPartitionReplica(replicaId, partitionId, partition) {
    if (stryMutAct_9fa48("18379")) {
      {}
    } else {
      stryCov_9fa48("18379");
      if (stryMutAct_9fa48("18382") ? false : stryMutAct_9fa48("18381") ? true : stryMutAct_9fa48("18380") ? this.replicaHandler : (stryCov_9fa48("18380", "18381", "18382"), !this.replicaHandler)) {
        if (stryMutAct_9fa48("18383")) {
          {}
        } else {
          stryCov_9fa48("18383");
          return;
        }
      }
      stryMutAct_9fa48("18385") ? this.replicaHandler.localServices.set?.(replicaId, partition) : stryMutAct_9fa48("18384") ? this.replicaHandler.localServices?.set(replicaId, partition) : (stryCov_9fa48("18384", "18385"), this.replicaHandler.localServices?.set?.(replicaId, partition));
      stryMutAct_9fa48("18386") ? this.replicaHandler.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.ACTIVE,
        service: partition
      }) : (stryCov_9fa48("18386"), this.replicaHandler.setLocalReplica?.(replicaId, stryMutAct_9fa48("18387") ? {} : (stryCov_9fa48("18387"), {
        replicaId,
        partitionId,
        status: ReplicaStatus.ACTIVE,
        service: partition
      })));
      stryMutAct_9fa48("18389") ? this.replicaHandler.replicaStateMachine.registerReplicaSnapshot?.(replicaId, {
        partitionId,
        nodeId: this.nodeId,
        state: ReplicaStatus.ACTIVE,
        serviceId: replicaId,
        serviceType: SERVICE_TYPE.PARTITION,
        serviceAddress: typeof partition?.getUnifiedAddress === TYPEOF.FUNCTION ? partition.getUnifiedAddress() : formatReplicatedServiceAddress(SERVICE_TYPE.PARTITION, this.nodeId, replicaId)
      }) : stryMutAct_9fa48("18388") ? this.replicaHandler.replicaStateMachine?.registerReplicaSnapshot(replicaId, {
        partitionId,
        nodeId: this.nodeId,
        state: ReplicaStatus.ACTIVE,
        serviceId: replicaId,
        serviceType: SERVICE_TYPE.PARTITION,
        serviceAddress: typeof partition?.getUnifiedAddress === TYPEOF.FUNCTION ? partition.getUnifiedAddress() : formatReplicatedServiceAddress(SERVICE_TYPE.PARTITION, this.nodeId, replicaId)
      }) : (stryCov_9fa48("18388", "18389"), this.replicaHandler.replicaStateMachine?.registerReplicaSnapshot?.(replicaId, stryMutAct_9fa48("18390") ? {} : (stryCov_9fa48("18390"), {
        partitionId,
        nodeId: this.nodeId,
        state: ReplicaStatus.ACTIVE,
        serviceId: replicaId,
        serviceType: SERVICE_TYPE.PARTITION,
        serviceAddress: (stryMutAct_9fa48("18393") ? typeof partition?.getUnifiedAddress !== TYPEOF.FUNCTION : stryMutAct_9fa48("18392") ? false : stryMutAct_9fa48("18391") ? true : (stryCov_9fa48("18391", "18392", "18393"), typeof (stryMutAct_9fa48("18394") ? partition.getUnifiedAddress : (stryCov_9fa48("18394"), partition?.getUnifiedAddress)) === TYPEOF.FUNCTION)) ? partition.getUnifiedAddress() : formatReplicatedServiceAddress(SERVICE_TYPE.PARTITION, this.nodeId, replicaId)
      })));
    }
  } /**
    * Initialize the control plane service for ordered registration and dispatch.
    * @private
    */
  async initializeControlPlaneService() {
    if (stryMutAct_9fa48("18395")) {
      {}
    } else {
      stryCov_9fa48("18395");
      if (stryMutAct_9fa48("18397") ? false : stryMutAct_9fa48("18396") ? true : (stryCov_9fa48("18396", "18397"), this.heartbeatService)) {
        if (stryMutAct_9fa48("18398")) {
          {}
        } else {
          stryCov_9fa48("18398");
          return;
        }
      }
      const leaderMessageGroup = assertCritical(this.getLeaderMessageGroupService(), JOINING_ERROR_MSG.MESSAGE_GROUP_LEADER_REQUIRED);
      const systemTableCache = stryMutAct_9fa48("18401") ? leaderMessageGroup.systemTableCache && NodeService.getInstance().getSystemTableCache() : stryMutAct_9fa48("18400") ? false : stryMutAct_9fa48("18399") ? true : (stryCov_9fa48("18399", "18400", "18401"), leaderMessageGroup.systemTableCache || NodeService.getInstance().getSystemTableCache());
      const cdcIntegrationService = this.createCdcIntegrationService();
      if (stryMutAct_9fa48("18404") ? false : stryMutAct_9fa48("18403") ? true : stryMutAct_9fa48("18402") ? this.tablePolicyService : (stryCov_9fa48("18402", "18403", "18404"), !this.tablePolicyService)) {
        if (stryMutAct_9fa48("18405")) {
          {}
        } else {
          stryCov_9fa48("18405");
          this.tablePolicyService = new TablePolicyService(stryMutAct_9fa48("18406") ? {} : (stryCov_9fa48("18406"), {
            systemTableCache,
            cdcIntegrationService
          }));
          this.tablePolicyService.initialize();
        }
      } else {
        if (stryMutAct_9fa48("18407")) {
          {}
        } else {
          stryCov_9fa48("18407");
          this.tablePolicyService.systemTableCache = systemTableCache;
          this.tablePolicyService.cdcIntegrationService = cdcIntegrationService;
        }
      }
      for (const messageGroupService of this.messageGroupServices.values()) {
        if (stryMutAct_9fa48("18408")) {
          {}
        } else {
          stryCov_9fa48("18408");
          assertCritical(stryMutAct_9fa48("18411") ? messageGroupService || typeof messageGroupService.subscribeToCDC === TYPEOF.FUNCTION : stryMutAct_9fa48("18410") ? false : stryMutAct_9fa48("18409") ? true : (stryCov_9fa48("18409", "18410", "18411"), messageGroupService && (stryMutAct_9fa48("18413") ? typeof messageGroupService.subscribeToCDC !== TYPEOF.FUNCTION : stryMutAct_9fa48("18412") ? true : (stryCov_9fa48("18412", "18413"), typeof messageGroupService.subscribeToCDC === TYPEOF.FUNCTION))), JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(STRING.UNKNOWN, NODE_JOINING_SERVICE_LITERAL.SUBSCRIBETOCDC_NOT_AVAILABLE));
          for (const tableName of CACHE_HYDRATION_TABLES) {
            if (stryMutAct_9fa48("18414")) {
              {}
            } else {
              stryCov_9fa48("18414");
              try {
                if (stryMutAct_9fa48("18415")) {
                  {}
                } else {
                  stryCov_9fa48("18415");
                  await messageGroupService.subscribeToCDC(tableName);
                }
              } catch (error) {
                if (stryMutAct_9fa48("18416")) {
                  {}
                } else {
                  stryCov_9fa48("18416");
                  this.logger.error(JOINING_LOG_MSG.CDC_SUBSCRIPTION_FAILED, stryMutAct_9fa48("18417") ? {} : (stryCov_9fa48("18417"), {
                    nodeId: this.nodeId,
                    tableName,
                    error: error.message
                  }));
                  throw new Error(JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(tableName, error.message));
                }
              }
            }
          }
        }
      }
      const controlPlane = await ControlPlaneSetup.create(stryMutAct_9fa48("18418") ? {} : (stryCov_9fa48("18418"), {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        advertisedNodeWsAddress: this.advertisedNodeWsAddress,
        messageRouter: this.messageRouter,
        cdcIntegrationService,
        cdcGroupPropagationService: stryMutAct_9fa48("18421") ? this.latencyTopology?.cdcGroupPropagationService && null : stryMutAct_9fa48("18420") ? false : stryMutAct_9fa48("18419") ? true : (stryCov_9fa48("18419", "18420", "18421"), (stryMutAct_9fa48("18422") ? this.latencyTopology.cdcGroupPropagationService : (stryCov_9fa48("18422"), this.latencyTopology?.cdcGroupPropagationService)) || null),
        systemTableCache,
        tablePolicyService: this.tablePolicyService,
        messageGroupServices: this.messageGroupServices,
        rebalanceCoordinator: this.rebalanceCoordinator,
        bootstrapReadinessState: this.bootstrapReadinessState
      }));
      this.heartbeatService = controlPlane.heartbeatService;
      if (stryMutAct_9fa48("18425") ? typeof this.heartbeatService?.setNodeStateReporter !== TYPEOF.FUNCTION : stryMutAct_9fa48("18424") ? false : stryMutAct_9fa48("18423") ? true : (stryCov_9fa48("18423", "18424", "18425"), typeof (stryMutAct_9fa48("18426") ? this.heartbeatService.setNodeStateReporter : (stryCov_9fa48("18426"), this.heartbeatService?.setNodeStateReporter)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("18427")) {
          {}
        } else {
          stryCov_9fa48("18427");
          this.heartbeatService.setNodeStateReporter(async (payload = {}) => {
            if (stryMutAct_9fa48("18428")) {
              {}
            } else {
              stryCov_9fa48("18428");
              return this.sendControlPlaneNodeStateUpdate(stryMutAct_9fa48("18429") ? {} : (stryCov_9fa48("18429"), {
                state: payload.state,
                capabilities: payload.capabilities,
                heartbeatAt: payload.heartbeatAt,
                readyLeaseExpiresAt: payload.readyLeaseExpiresAt,
                heartbeatOnly: stryMutAct_9fa48("18430") ? false : (stryCov_9fa48("18430"), true),
                nodeRow: payload.nodeRow
              }));
            }
          });
        }
      }
      this.leaseService = controlPlane.leaseService;
      this.endpointService = controlPlane.endpointService;
      this.dispatchService = controlPlane.dispatchService;
      this.rebalanceCoordinator = controlPlane.rebalanceCoordinator;
      this.runtimeSurfaceOwner.bindControlPlaneServices();
      this.logger.info(NODE_JOINING_SERVICE_LITERAL.CONTROL_PLANE_INITIALIZED_BY_OWNER, stryMutAct_9fa48("18431") ? {} : (stryCov_9fa48("18431"), {
        nodeId: this.nodeId,
        owner: NODE_JOINING_SERVICE_LITERAL.CONTROLPLANESETUP,
        messageGroupCount: this.messageGroupServices.size
      }));
    }
  } /**
    * Initialize the RuntimeServiceHandler behind the PG wire safety
    * gate. The gate ensures control-plane readiness before allowing
    * runtime-service replica operations. Startup failure is isolated
    * so join completes even if PG wire fails.
    *
    * Requirements: 11.2, 11.3, 11.4
    * @private
    */
  initializeRuntimeServiceHandler() {
    if (stryMutAct_9fa48("18432")) {
      {}
    } else {
      stryCov_9fa48("18432");
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const gate = new PgWireStartupSafetyGate(stryMutAct_9fa48("18433") ? {} : (stryCov_9fa48("18433"), {
        nodeId: this.nodeId,
        serviceLifecycleManager: this.serviceLifecycleManager,
        systemTableCache,
        heartbeatService: this.heartbeatService
      }));
      const result = gate.guardedSetup(() => {
        if (stryMutAct_9fa48("18434")) {
          {}
        } else {
          stryCov_9fa48("18434");
          return RuntimeServiceHandlerSetup.create(stryMutAct_9fa48("18435") ? {} : (stryCov_9fa48("18435"), {
            nodeId: this.nodeId,
            messageRouter: this.messageRouter,
            cdcIntegrationService: this.cdcIntegrationService,
            systemTableCache,
            serviceLifecycleManager: this.serviceLifecycleManager,
            rpcClient: this.rpcClient
          }));
        }
      });
      if (stryMutAct_9fa48("18437") ? false : stryMutAct_9fa48("18436") ? true : (stryCov_9fa48("18436", "18437"), result)) {
        if (stryMutAct_9fa48("18438")) {
          {}
        } else {
          stryCov_9fa48("18438");
          this.runtimeServiceHandler = result.runtimeServiceHandler;
        }
      }
    }
  } /**
    * Initialize the MessageGroupServiceHandler for control-plane
    * message-group replica operations.
    * @private
    */
  initializeMessageGroupServiceHandler() {
    if (stryMutAct_9fa48("18439")) {
      {}
    } else {
      stryCov_9fa48("18439");
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const descriptorForReplica = stryMutAct_9fa48("18440") ? () => undefined : (stryCov_9fa48("18440"), (() => {
        const descriptorForReplica = replicaId => stryMutAct_9fa48("18441") ? {} : (stryCov_9fa48("18441"), {
          serviceId: replicaId,
          serviceType: stryMutAct_9fa48("18442") ? "" : (stryCov_9fa48("18442"), 'message_group'),
          replicaId
        });
        return descriptorForReplica;
      })());
      const result = MessageGroupServiceHandlerSetup.create(stryMutAct_9fa48("18443") ? {} : (stryCov_9fa48("18443"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        cdcIntegrationService: this.cdcIntegrationService,
        systemTableCache,
        createMessageGroupReplica: async options => {
          if (stryMutAct_9fa48("18444")) {
            {}
          } else {
            stryCov_9fa48("18444");
            return this.createJoinMessageGroupReplica(stryMutAct_9fa48("18445") ? {} : (stryCov_9fa48("18445"), {
              definition: descriptorForReplica(options.replicaId),
              replicaOptions: options
            }));
          }
        },
        startMessageGroupReplica: async options => {
          if (stryMutAct_9fa48("18446")) {
            {}
          } else {
            stryCov_9fa48("18446");
            return this.startJoinMessageGroupReplica(descriptorForReplica(options.replicaId), stryMutAct_9fa48("18447") ? {} : (stryCov_9fa48("18447"), {
              replicaOptions: options
            }));
          }
        },
        stopMessageGroupReplica: async options => {
          if (stryMutAct_9fa48("18448")) {
            {}
          } else {
            stryCov_9fa48("18448");
            return this.stopJoinMessageGroupReplica(descriptorForReplica(options.replicaId), stryMutAct_9fa48("18449") ? {} : (stryCov_9fa48("18449"), {
              replicaOptions: options
            }));
          }
        },
        resolveLocalMessageGroupReplica: stryMutAct_9fa48("18450") ? () => undefined : (stryCov_9fa48("18450"), replicaId => stryMutAct_9fa48("18453") ? this.messageGroupServices.get(replicaId) && null : stryMutAct_9fa48("18452") ? false : stryMutAct_9fa48("18451") ? true : (stryCov_9fa48("18451", "18452", "18453"), this.messageGroupServices.get(replicaId) || null)),
        rpcClient: this.rpcClient
      }));
      if (stryMutAct_9fa48("18455") ? false : stryMutAct_9fa48("18454") ? true : (stryCov_9fa48("18454", "18455"), result)) {
        if (stryMutAct_9fa48("18456")) {
          {}
        } else {
          stryCov_9fa48("18456");
          this.messageGroupServiceHandler = result.messageGroupServiceHandler;
        }
      }
    }
  } /**
    * Create a CDC integration service for the joining node.
    * Routes system table writes through SQL query engine which transparently
    * routes to partition leaders via message router.
    * The system cache will be populated later during phaseQuerySystemState().
    * @return {CDCIntegrationService} The CDC integration service.
    * @private
    */
  createCdcIntegrationService() {
    if (stryMutAct_9fa48("18457")) {
      {}
    } else {
      stryCov_9fa48("18457");
      if (stryMutAct_9fa48("18459") ? false : stryMutAct_9fa48("18458") ? true : (stryCov_9fa48("18458", "18459"), this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("18460")) {
          {}
        } else {
          stryCov_9fa48("18460");
          return this.cdcIntegrationService;
        }
      }
      const seedNodeId = assertCritical(this.seedNodeId, JOINING_ERROR_MSG.SEED_NODE_ID_REQUIRED);
      this.logger.debug(JOINING_LOG_MSG.CDC_INTEGRATION_CREATE, stryMutAct_9fa48("18461") ? {} : (stryCov_9fa48("18461"), {
        nodeId: this.nodeId,
        seedNodeId
      })); // Get system table cache from message group services
      let systemTableCache = null;
      let cacheMutationTarget = null;
      for (const mgService of this.messageGroupServices.values()) {
        if (stryMutAct_9fa48("18462")) {
          {}
        } else {
          stryCov_9fa48("18462");
          // Get the read-only wrapper for the query engine
          if (stryMutAct_9fa48("18464") ? false : stryMutAct_9fa48("18463") ? true : (stryCov_9fa48("18463", "18464"), mgService.getReadOnlyCache)) {
            if (stryMutAct_9fa48("18465")) {
              {}
            } else {
              stryCov_9fa48("18465");
              systemTableCache = mgService.getReadOnlyCache();
            }
          } else if (stryMutAct_9fa48("18467") ? false : stryMutAct_9fa48("18466") ? true : (stryCov_9fa48("18466", "18467"), mgService.systemTableCache)) {
            if (stryMutAct_9fa48("18468")) {
              {}
            } else {
              stryCov_9fa48("18468");
              systemTableCache = mgService.systemTableCache;
            }
          }
          if (stryMutAct_9fa48("18470") ? false : stryMutAct_9fa48("18469") ? true : (stryCov_9fa48("18469", "18470"), mgService.getWritableCache)) {
            if (stryMutAct_9fa48("18471")) {
              {}
            } else {
              stryCov_9fa48("18471");
              cacheMutationTarget = mgService.getWritableCache();
            }
          } else if (stryMutAct_9fa48("18473") ? false : stryMutAct_9fa48("18472") ? true : (stryCov_9fa48("18472", "18473"), mgService.systemTableCache)) {
            if (stryMutAct_9fa48("18474")) {
              {}
            } else {
              stryCov_9fa48("18474");
              cacheMutationTarget = mgService.systemTableCache;
            }
          }
          break;
        }
      }
      if (stryMutAct_9fa48("18477") ? false : stryMutAct_9fa48("18476") ? true : stryMutAct_9fa48("18475") ? systemTableCache : (stryCov_9fa48("18475", "18476", "18477"), !systemTableCache)) {
        if (stryMutAct_9fa48("18478")) {
          {}
        } else {
          stryCov_9fa48("18478");
          systemTableCache = NodeService.getInstance().getSystemTableCache();
        }
      }
      if (stryMutAct_9fa48("18481") ? false : stryMutAct_9fa48("18480") ? true : stryMutAct_9fa48("18479") ? cacheMutationTarget : (stryCov_9fa48("18479", "18480", "18481"), !cacheMutationTarget)) {
        if (stryMutAct_9fa48("18482")) {
          {}
        } else {
          stryCov_9fa48("18482");
          cacheMutationTarget = NodeService.getInstance().getSystemTableCache();
        }
      }
      assertCritical(systemTableCache, JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED);
      assertCritical(this.messageRouter, JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED); // Create SQL query engine with message router for transparent remote routing
      // The query engine will route queries to remote partitions via message router
      // System cache will be populated during phaseQuerySystemState()
      const sqlQueryEngine = new SQLQueryEngine(stryMutAct_9fa48("18483") ? {} : (stryCov_9fa48("18483"), {
        systemCache: systemTableCache,
        messageRouter: this.messageRouter,
        nodeId: this.nodeId,
        rebalanceCoordinator: this.rebalanceCoordinator,
        controlPlaneReadinessService: stryMutAct_9fa48("18486") ? this.rebalanceCoordinator?.controlPlaneReadinessService && null : stryMutAct_9fa48("18485") ? false : stryMutAct_9fa48("18484") ? true : (stryCov_9fa48("18484", "18485", "18486"), (stryMutAct_9fa48("18487") ? this.rebalanceCoordinator.controlPlaneReadinessService : (stryCov_9fa48("18487"), this.rebalanceCoordinator?.controlPlaneReadinessService)) || null),
        defaultRoutingReadinessDimension: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        migrationAutoWire: stryMutAct_9fa48("18488") ? true : (stryCov_9fa48("18488"), false),
        autoStartDistributedTransactionRecovery: stryMutAct_9fa48("18489") ? true : (stryCov_9fa48("18489"), false)
      }));
      sqlQueryEngine.seedBootstrapRoutingOverlayFromSnapshots(stryMutAct_9fa48("18492") ? this.bootstrapResponse?.systemTableSnapshots && null : stryMutAct_9fa48("18491") ? false : stryMutAct_9fa48("18490") ? true : (stryCov_9fa48("18490", "18491", "18492"), (stryMutAct_9fa48("18493") ? this.bootstrapResponse.systemTableSnapshots : (stryCov_9fa48("18493"), this.bootstrapResponse?.systemTableSnapshots)) || null));
      wireMigrationWorkflowOwners(stryMutAct_9fa48("18494") ? {} : (stryCov_9fa48("18494"), {
        sqlCore: sqlQueryEngine,
        systemTableCache,
        transactionCoordinator: sqlQueryEngine.transactionCoordinator,
        logger: this.logger,
        now: stryMutAct_9fa48("18495") ? () => undefined : (stryCov_9fa48("18495"), () => Date.now())
      }));
      const cdcIntegrationService = CDCIntegrationSetup.createForNormal(stryMutAct_9fa48("18496") ? {} : (stryCov_9fa48("18496"), {
        nodeId: this.nodeId,
        sqlQueryEngine,
        systemTableCache,
        messageRouter: this.messageRouter,
        cacheMutationTarget,
        partitionServicesProvider: stryMutAct_9fa48("18497") ? () => undefined : (stryCov_9fa48("18497"), () => this.partitionServices)
      }));
      sqlQueryEngine.setCDCIntegrationService(cdcIntegrationService);
      for (const messageGroup of this.messageGroupServices.values()) {
        if (stryMutAct_9fa48("18498")) {
          {}
        } else {
          stryCov_9fa48("18498");
          if (stryMutAct_9fa48("18500") ? false : stryMutAct_9fa48("18499") ? true : (stryCov_9fa48("18499", "18500"), messageGroup.setCdcIntegrationService)) {
            if (stryMutAct_9fa48("18501")) {
              {}
            } else {
              stryCov_9fa48("18501");
              messageGroup.setCdcIntegrationService(cdcIntegrationService);
            }
          }
        }
      }
      this.cdcIntegrationService = cdcIntegrationService;
      this.logger.debug(NODE_JOINING_SERVICE_LITERAL.CDC_INTEGRATION_INITIALIZED_BY_OWNER, stryMutAct_9fa48("18502") ? {} : (stryCov_9fa48("18502"), {
        nodeId: this.nodeId,
        owner: NODE_JOINING_SERVICE_LITERAL.CDCINTEGRATIONSETUP,
        mode: NODE_JOINING_SERVICE_LITERAL.NORMAL
      }));
      return cdcIntegrationService;
    }
  } /**
    * Ensure latency topology owners are initialized.
    * @return {Object}
    * @private
    */
  ensureLatencyTopologyOwners() {
    if (stryMutAct_9fa48("18503")) {
      {}
    } else {
      stryCov_9fa48("18503");
      if (stryMutAct_9fa48("18505") ? false : stryMutAct_9fa48("18504") ? true : (stryCov_9fa48("18504", "18505"), this.latencyTopology)) {
        if (stryMutAct_9fa48("18506")) {
          {}
        } else {
          stryCov_9fa48("18506");
          return this.latencyTopology;
        }
      }
      this.latencyTopology = LatencyTopologySetup.create(stryMutAct_9fa48("18507") ? {} : (stryCov_9fa48("18507"), {
        nodeId: this.nodeId,
        systemTableCache: NodeService.getInstance().getSystemTableCache(),
        cdcIntegrationService: this.cdcIntegrationService,
        messageRouter: this.messageRouter
      }));
      this.latencyTopology.latencyTreeService.start(stryMutAct_9fa48("18508") ? {} : (stryCov_9fa48("18508"), {
        recomputeImmediately: stryMutAct_9fa48("18509") ? false : (stryCov_9fa48("18509"), true)
      }));
      this.latencyTopology.cdcGroupPropagationService.start();
      this.logger.info(JOINING_LOG_MSG.LATENCY_TOPOLOGY_READY, stryMutAct_9fa48("18510") ? {} : (stryCov_9fa48("18510"), {
        nodeId: this.nodeId,
        owner: NODE_JOINING_SERVICE_LITERAL.LATENCYTOPOLOGYSETUP
      }));
      return this.latencyTopology;
    }
  } /**
    * Start latency topology lifecycle owners.
    * This is intentionally non-blocking relative to READY transition.
    * @private
    */
  startLatencyTopologyLifecycle() {
    if (stryMutAct_9fa48("18511")) {
      {}
    } else {
      stryCov_9fa48("18511");
      return this.runtimeHandoffOwner.startLatencyTopologyLifecycle();
    }
  } /**
    * Propagate partition CDC via topology-owned propagation path.
    * @param {Object} messageGroupService
    * @param {Object} cdcEvent
    * @return {Promise<Object>}
    * @private
    */
  async propagatePartitionCDCEvent(messageGroupService, cdcEvent) {
    if (stryMutAct_9fa48("18512")) {
      {}
    } else {
      stryCov_9fa48("18512");
      const topologyOwners = assertCritical(this.latencyTopology, JOINING_ERROR_MSG.LATENCY_TOPOLOGY_MISSING);
      return topologyOwners.cdcGroupPropagationService.propagateCDCEvent(stryMutAct_9fa48("18513") ? {} : (stryCov_9fa48("18513"), {
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation,
        data: cdcEvent.data,
        sourceMessageGroupService: messageGroupService
      }));
    }
  } /**
    * Get the node storage budget service.
    * @return {NodeStorageBudgetService}
    * @private
    */
  getNodeStorageBudgetService() {
    if (stryMutAct_9fa48("18514")) {
      {}
    } else {
      stryCov_9fa48("18514");
      if (stryMutAct_9fa48("18516") ? false : stryMutAct_9fa48("18515") ? true : (stryCov_9fa48("18515", "18516"), this.nodeStorageBudgetService)) {
        if (stryMutAct_9fa48("18517")) {
          {}
        } else {
          stryCov_9fa48("18517");
          return this.nodeStorageBudgetService;
        }
      }
      const service = NodeStorageBudgetSetup.create(stryMutAct_9fa48("18518") ? {} : (stryCov_9fa48("18518"), {
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService
      }));
      this.nodeStorageBudgetService = service;
      return service;
    }
  } /**
    * Get the current joining phase.
    * @return {string} Current phase.
    */
  getPhase() {
    if (stryMutAct_9fa48("18519")) {
      {}
    } else {
      stryCov_9fa48("18519");
      return this.phase;
    }
  } /**
    * Get joining status.
    * @return {Object} Joining status.
    */
  getStatus() {
    if (stryMutAct_9fa48("18520")) {
      {}
    } else {
      stryCov_9fa48("18520");
      return stryMutAct_9fa48("18521") ? {} : (stryCov_9fa48("18521"), {
        nodeId: this.nodeId,
        phase: this.phase,
        lifecycleState: this.lifecycleStateMachine.getState(),
        startTime: this.startTime,
        duration: this.startTime ? stryMutAct_9fa48("18522") ? this.now() + this.startTime : (stryCov_9fa48("18522"), this.now() - this.startTime) : NUM.ZERO,
        messageGroupCount: this.messageGroupServices.size,
        lastError: stryMutAct_9fa48("18525") ? this.lastError?.message && null : stryMutAct_9fa48("18524") ? false : stryMutAct_9fa48("18523") ? true : (stryCov_9fa48("18523", "18524", "18525"), (stryMutAct_9fa48("18526") ? this.lastError.message : (stryCov_9fa48("18526"), this.lastError?.message)) || null)
      });
    }
  } /**
    * Get the node lifecycle state machine.
    * @return {NodeLifecycleStateMachine} The lifecycle state machine.
    */
  getLifecycleStateMachine() {
    if (stryMutAct_9fa48("18527")) {
      {}
    } else {
      stryCov_9fa48("18527");
      return this.lifecycleStateMachine;
    }
  } /**
    * Check if joining has local message group replica with leadership.
    * @return {boolean} True if has operational message group.
    */
  hasOperationalMessageGroup() {
    if (stryMutAct_9fa48("18528")) {
      {}
    } else {
      stryCov_9fa48("18528");
      return stryMutAct_9fa48("18531") ? this.getLeaderMessageGroupService() === null : stryMutAct_9fa48("18530") ? false : stryMutAct_9fa48("18529") ? true : (stryCov_9fa48("18529", "18530", "18531"), this.getLeaderMessageGroupService() !== null);
    }
  } /**
    * Check if any joined message group has a leader in the system cache.
    * @param {Object} systemTableCache - System table cache.
    * @return {boolean} True if cache reports a leader for any joined group.
    * @private
    */
  hasMessageGroupLeaderInCache(systemTableCache) {
    if (stryMutAct_9fa48("18532")) {
      {}
    } else {
      stryCov_9fa48("18532");
      if (stryMutAct_9fa48("18535") ? false : stryMutAct_9fa48("18534") ? true : stryMutAct_9fa48("18533") ? systemTableCache : (stryCov_9fa48("18533", "18534", "18535"), !systemTableCache)) {
        if (stryMutAct_9fa48("18536")) {
          {}
        } else {
          stryCov_9fa48("18536");
          return stryMutAct_9fa48("18537") ? true : (stryCov_9fa48("18537"), false);
        }
      }
      const groupIds = new Set();
      for (const service of this.messageGroupServices.values()) {
        if (stryMutAct_9fa48("18538")) {
          {}
        } else {
          stryCov_9fa48("18538");
          if (stryMutAct_9fa48("18541") ? service.groupId : stryMutAct_9fa48("18540") ? false : stryMutAct_9fa48("18539") ? true : (stryCov_9fa48("18539", "18540", "18541"), service?.groupId)) {
            if (stryMutAct_9fa48("18542")) {
              {}
            } else {
              stryCov_9fa48("18542");
              groupIds.add(service.groupId);
            }
          }
        }
      }
      if (stryMutAct_9fa48("18545") ? groupIds.size !== NUM.ZERO : stryMutAct_9fa48("18544") ? false : stryMutAct_9fa48("18543") ? true : (stryCov_9fa48("18543", "18544", "18545"), groupIds.size === NUM.ZERO)) {
        if (stryMutAct_9fa48("18546")) {
          {}
        } else {
          stryCov_9fa48("18546");
          return stryMutAct_9fa48("18547") ? true : (stryCov_9fa48("18547"), false);
        }
      }
      const services = (stryMutAct_9fa48("18550") ? typeof systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("18549") ? false : stryMutAct_9fa48("18548") ? true : (stryCov_9fa48("18548", "18549", "18550"), typeof systemTableCache.filter === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("18551") ? systemTableCache : (stryCov_9fa48("18551"), systemTableCache.filter(TABLES.SERVICES, stryMutAct_9fa48("18552") ? () => undefined : (stryCov_9fa48("18552"), service => stryMutAct_9fa48("18555") ? service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP && groupIds.has(service?.[COLUMN.GROUP_ID]) || service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("18554") ? false : stryMutAct_9fa48("18553") ? true : (stryCov_9fa48("18553", "18554", "18555"), (stryMutAct_9fa48("18557") ? service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP || groupIds.has(service?.[COLUMN.GROUP_ID]) : stryMutAct_9fa48("18556") ? true : (stryCov_9fa48("18556", "18557"), (stryMutAct_9fa48("18559") ? service?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("18558") ? true : (stryCov_9fa48("18558", "18559"), (stryMutAct_9fa48("18560") ? service[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("18560"), service?.[COLUMN.SERVICE_TYPE])) === SERVICE_TYPE.MESSAGE_GROUP)) && groupIds.has(stryMutAct_9fa48("18561") ? service[COLUMN.GROUP_ID] : (stryCov_9fa48("18561"), service?.[COLUMN.GROUP_ID])))) && (stryMutAct_9fa48("18563") ? service?.[COLUMN.STATUS] !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("18562") ? true : (stryCov_9fa48("18562", "18563"), (stryMutAct_9fa48("18564") ? service[COLUMN.STATUS] : (stryCov_9fa48("18564"), service?.[COLUMN.STATUS])) === SERVICE_STATUS.ACTIVE)))))) : stryMutAct_9fa48("18565") ? systemTableCache.getAll?.(TABLES.SERVICES) || [] : (stryCov_9fa48("18565"), (stryMutAct_9fa48("18568") ? systemTableCache.getAll?.(TABLES.SERVICES) && [] : stryMutAct_9fa48("18567") ? false : stryMutAct_9fa48("18566") ? true : (stryCov_9fa48("18566", "18567", "18568"), (stryMutAct_9fa48("18569") ? systemTableCache.getAll(TABLES.SERVICES) : (stryCov_9fa48("18569"), systemTableCache.getAll?.(TABLES.SERVICES))) || (stryMutAct_9fa48("18570") ? ["Stryker was here"] : (stryCov_9fa48("18570"), [])))).filter(stryMutAct_9fa48("18571") ? () => undefined : (stryCov_9fa48("18571"), service => stryMutAct_9fa48("18574") ? service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP && groupIds.has(service?.[COLUMN.GROUP_ID]) || service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("18573") ? false : stryMutAct_9fa48("18572") ? true : (stryCov_9fa48("18572", "18573", "18574"), (stryMutAct_9fa48("18576") ? service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP || groupIds.has(service?.[COLUMN.GROUP_ID]) : stryMutAct_9fa48("18575") ? true : (stryCov_9fa48("18575", "18576"), (stryMutAct_9fa48("18578") ? service?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("18577") ? true : (stryCov_9fa48("18577", "18578"), (stryMutAct_9fa48("18579") ? service[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("18579"), service?.[COLUMN.SERVICE_TYPE])) === SERVICE_TYPE.MESSAGE_GROUP)) && groupIds.has(stryMutAct_9fa48("18580") ? service[COLUMN.GROUP_ID] : (stryCov_9fa48("18580"), service?.[COLUMN.GROUP_ID])))) && (stryMutAct_9fa48("18582") ? service?.[COLUMN.STATUS] !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("18581") ? true : (stryCov_9fa48("18581", "18582"), (stryMutAct_9fa48("18583") ? service[COLUMN.STATUS] : (stryCov_9fa48("18583"), service?.[COLUMN.STATUS])) === SERVICE_STATUS.ACTIVE))))));
      if (stryMutAct_9fa48("18586") ? services.length !== NUM.ZERO : stryMutAct_9fa48("18585") ? false : stryMutAct_9fa48("18584") ? true : (stryCov_9fa48("18584", "18585", "18586"), services.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("18587")) {
          {}
        } else {
          stryCov_9fa48("18587");
          return stryMutAct_9fa48("18588") ? true : (stryCov_9fa48("18588"), false);
        }
      }
      const groupRows = (stryMutAct_9fa48("18591") ? typeof systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("18590") ? false : stryMutAct_9fa48("18589") ? true : (stryCov_9fa48("18589", "18590", "18591"), typeof systemTableCache.filter === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("18592") ? systemTableCache : (stryCov_9fa48("18592"), systemTableCache.filter(TABLES.MESSAGE_GROUPS, stryMutAct_9fa48("18593") ? () => undefined : (stryCov_9fa48("18593"), group => groupIds.has(stryMutAct_9fa48("18594") ? group[COLUMN.GROUP_ID] : (stryCov_9fa48("18594"), group?.[COLUMN.GROUP_ID]))))) : stryMutAct_9fa48("18595") ? systemTableCache.getAll?.(TABLES.MESSAGE_GROUPS) || [] : (stryCov_9fa48("18595"), (stryMutAct_9fa48("18598") ? systemTableCache.getAll?.(TABLES.MESSAGE_GROUPS) && [] : stryMutAct_9fa48("18597") ? false : stryMutAct_9fa48("18596") ? true : (stryCov_9fa48("18596", "18597", "18598"), (stryMutAct_9fa48("18599") ? systemTableCache.getAll(TABLES.MESSAGE_GROUPS) : (stryCov_9fa48("18599"), systemTableCache.getAll?.(TABLES.MESSAGE_GROUPS))) || (stryMutAct_9fa48("18600") ? ["Stryker was here"] : (stryCov_9fa48("18600"), [])))).filter(stryMutAct_9fa48("18601") ? () => undefined : (stryCov_9fa48("18601"), group => groupIds.has(stryMutAct_9fa48("18602") ? group[COLUMN.GROUP_ID] : (stryCov_9fa48("18602"), group?.[COLUMN.GROUP_ID])))));
      const activeServiceExistsForLeaderNode = stryMutAct_9fa48("18603") ? groupRows.every(group => {
        const leaderNodeId = group?.[COLUMN.LEADER_NODE_ID] || group?.leader_node_id || group?.leaderNodeId || null;
        if (typeof leaderNodeId !== TYPEOF.STRING || leaderNodeId.length === NUM.ZERO) {
          return false;
        }
        return services.some(service => service?.[COLUMN.GROUP_ID] === group?.[COLUMN.GROUP_ID] && service?.[COLUMN.NODE_ID] === leaderNodeId);
      }) : (stryCov_9fa48("18603"), groupRows.some(group => {
        if (stryMutAct_9fa48("18604")) {
          {}
        } else {
          stryCov_9fa48("18604");
          const leaderNodeId = stryMutAct_9fa48("18607") ? (group?.[COLUMN.LEADER_NODE_ID] || group?.leader_node_id || group?.leaderNodeId) && null : stryMutAct_9fa48("18606") ? false : stryMutAct_9fa48("18605") ? true : (stryCov_9fa48("18605", "18606", "18607"), (stryMutAct_9fa48("18609") ? (group?.[COLUMN.LEADER_NODE_ID] || group?.leader_node_id) && group?.leaderNodeId : stryMutAct_9fa48("18608") ? false : (stryCov_9fa48("18608", "18609"), (stryMutAct_9fa48("18611") ? group?.[COLUMN.LEADER_NODE_ID] && group?.leader_node_id : stryMutAct_9fa48("18610") ? false : (stryCov_9fa48("18610", "18611"), (stryMutAct_9fa48("18612") ? group[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("18612"), group?.[COLUMN.LEADER_NODE_ID])) || (stryMutAct_9fa48("18613") ? group.leader_node_id : (stryCov_9fa48("18613"), group?.leader_node_id)))) || (stryMutAct_9fa48("18614") ? group.leaderNodeId : (stryCov_9fa48("18614"), group?.leaderNodeId)))) || null);
          if (stryMutAct_9fa48("18617") ? typeof leaderNodeId !== TYPEOF.STRING && leaderNodeId.length === NUM.ZERO : stryMutAct_9fa48("18616") ? false : stryMutAct_9fa48("18615") ? true : (stryCov_9fa48("18615", "18616", "18617"), (stryMutAct_9fa48("18619") ? typeof leaderNodeId === TYPEOF.STRING : stryMutAct_9fa48("18618") ? false : (stryCov_9fa48("18618", "18619"), typeof leaderNodeId !== TYPEOF.STRING)) || (stryMutAct_9fa48("18621") ? leaderNodeId.length !== NUM.ZERO : stryMutAct_9fa48("18620") ? false : (stryCov_9fa48("18620", "18621"), leaderNodeId.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("18622")) {
              {}
            } else {
              stryCov_9fa48("18622");
              return stryMutAct_9fa48("18623") ? true : (stryCov_9fa48("18623"), false);
            }
          }
          return stryMutAct_9fa48("18624") ? services.every(service => service?.[COLUMN.GROUP_ID] === group?.[COLUMN.GROUP_ID] && service?.[COLUMN.NODE_ID] === leaderNodeId) : (stryCov_9fa48("18624"), services.some(stryMutAct_9fa48("18625") ? () => undefined : (stryCov_9fa48("18625"), service => stryMutAct_9fa48("18628") ? service?.[COLUMN.GROUP_ID] === group?.[COLUMN.GROUP_ID] || service?.[COLUMN.NODE_ID] === leaderNodeId : stryMutAct_9fa48("18627") ? false : stryMutAct_9fa48("18626") ? true : (stryCov_9fa48("18626", "18627", "18628"), (stryMutAct_9fa48("18630") ? service?.[COLUMN.GROUP_ID] !== group?.[COLUMN.GROUP_ID] : stryMutAct_9fa48("18629") ? true : (stryCov_9fa48("18629", "18630"), (stryMutAct_9fa48("18631") ? service[COLUMN.GROUP_ID] : (stryCov_9fa48("18631"), service?.[COLUMN.GROUP_ID])) === (stryMutAct_9fa48("18632") ? group[COLUMN.GROUP_ID] : (stryCov_9fa48("18632"), group?.[COLUMN.GROUP_ID])))) && (stryMutAct_9fa48("18634") ? service?.[COLUMN.NODE_ID] !== leaderNodeId : stryMutAct_9fa48("18633") ? true : (stryCov_9fa48("18633", "18634"), (stryMutAct_9fa48("18635") ? service[COLUMN.NODE_ID] : (stryCov_9fa48("18635"), service?.[COLUMN.NODE_ID])) === leaderNodeId))))));
        }
      }));
      if (stryMutAct_9fa48("18637") ? false : stryMutAct_9fa48("18636") ? true : (stryCov_9fa48("18636", "18637"), activeServiceExistsForLeaderNode)) {
        if (stryMutAct_9fa48("18638")) {
          {}
        } else {
          stryCov_9fa48("18638");
          return stryMutAct_9fa48("18639") ? false : (stryCov_9fa48("18639"), true);
        }
      }
      return stryMutAct_9fa48("18640") ? services.every(service => {
        return service?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER;
      }) : (stryCov_9fa48("18640"), services.some(service => {
        if (stryMutAct_9fa48("18641")) {
          {}
        } else {
          stryCov_9fa48("18641");
          return stryMutAct_9fa48("18644") ? service?.[COLUMN.RAFT_ROLE] !== RAFT_ROLE.LEADER : stryMutAct_9fa48("18643") ? false : stryMutAct_9fa48("18642") ? true : (stryCov_9fa48("18642", "18643", "18644"), (stryMutAct_9fa48("18645") ? service[COLUMN.RAFT_ROLE] : (stryCov_9fa48("18645"), service?.[COLUMN.RAFT_ROLE])) === RAFT_ROLE.LEADER);
        }
      }));
    }
  } /**
    * Sleep for a specified duration.
    * @param {number} ms - Milliseconds to sleep.
    * @return {Promise<void>}
    * @private
    */
  sleep(ms) {
    if (stryMutAct_9fa48("18646")) {
      {}
    } else {
      stryCov_9fa48("18646");
      return new Promise(stryMutAct_9fa48("18647") ? () => undefined : (stryCov_9fa48("18647"), resolve => setTimeout(resolve, ms)));
    }
  }
}
export { NodeJoiningService, JoiningPhase, NodeState };