/**
 * Bootstrap API - REST API for node bootstrap and discovery.
 * Implements /bootstrap endpoint for new node registration.
 *
 * Architecture:
 * - System cache is the single source of truth for all cluster state
 * - Bootstrap response contains default cache-sync table snapshots
 * - Joining nodes hydrate their cache from these snapshots
 * - After hydration, all nodes use system cache for query routing
 *
 * Requirements: 1.2, 7.2, 7.3, 7.4
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
import Fastify from 'fastify';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { assertCritical } from '../utils/assert.js';
import { ADDRESS, COLUMN, ENTITY_TYPE, ERRNO, HTTP_STATUS, HOST, NUM, PROTOCOL, SERVICE_STATUS, SERVICE_TYPE, STRING, TABLES, TYPEOF, WORKFLOW_STEP } from '../constants/index.js';
import { CACHE_HYDRATION_TABLES } from '../cache/cache-constants.js';
import { resolveCanonicalLeaderService } from '../cache/leader-readiness-gate.js';
import { isNodeRecordReady } from '../node/node-readiness-policy.js';
import { BOOTSTRAP_ASSIGNMENT_STRATEGY, BOOTSTRAP_PIPELINE_ERROR_CODE } from './bootstrap-constants.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { NODE_CONFIG_KEY, NODE_DEFAULT } from '../node/node-constants.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { BOOTSTRAP_API_DEFAULT, BOOTSTRAP_API_CLOSE_ERROR_CODE, BOOTSTRAP_API_ERROR, BOOTSTRAP_API_HEALTH_STATUS, BOOTSTRAP_API_HEALTH_STATUS_INITIALIZING, BOOTSTRAP_API_HANDOFF_OPERATION, BOOTSTRAP_API_HANDOFF_PHASE, BOOTSTRAP_API_HANDOFF_STATUS, BOOTSTRAP_API_ASSIGNMENT, BOOTSTRAP_API_LOG_MSG, BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE, BOOTSTRAP_API_ROUTE, BOOTSTRAP_API_SQL, BOOTSTRAP_API_SUBSYSTEM } from './bootstrap-api-constants.js';
import { BootstrapReadinessState } from './bootstrap-readiness-state.js';
import { CONTROL_PLANE_ROLLOUT_REQUIRED, assertRequiredControlPlaneRollout } from '../runtime/control-plane-rollout-controls.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { CONTROL_PLANE_PHASE_SCOPE } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { isRetryableControlPlaneError } from '../control-plane/control-plane-error-classification.js';
import { ServiceRegistrationVisibilityOwner } from './owners/service-registration-visibility-owner.js';
import { ServiceRegistrationHandoffOwner } from './owners/service-registration-handoff-owner.js';
import { ServiceLeaderReadinessOwner } from './owners/service-leader-readiness-owner.js';
import { MoveReplicaAssignmentOwner } from './owners/move-replica-assignment-owner.js';
import { MoveReplicaHandoffOwner } from './owners/move-replica-handoff-owner.js';
import { BootstrapTopologySnapshotOwner } from './owners/bootstrap-topology-snapshot-owner.js';
import { BootstrapJoinAdmissionOwner } from './owners/bootstrap-join-admission-owner.js';
import { BootstrapReadinessOwner } from './owners/bootstrap-readiness-owner.js';
import { BootstrapRequestOwner } from './owners/bootstrap-request-owner.js';
import { BootstrapClusterViewOwner } from './owners/bootstrap-cluster-view-owner.js';

/**
 * Bootstrap response strategies.
 */
const BootstrapStrategy = BOOTSTRAP_ASSIGNMENT_STRATEGY;
/**
 * BootstrapAPI provides REST endpoints for node bootstrap and discovery.
 */
class BootstrapAPI {
  /**
   * Create a new BootstrapAPI.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - System table cache for lookups.
   * @param {string} options.seedNodeId - Seed node ID.
   * @param {string} options.seedNodeAddress - Seed node address.
   * @param {string} [options.seedNodeWsAddress] - Seed node WebSocket address.
   * @param {number} options.wsPort - WebSocket port for cross-node communication.
   * @param {Map} options.messageGroupServices - Message group services map.
   * @param {Map} options.partitionServices - Partition services map.
   * @param {Object} options.replicaHandler - Replica handler.
  * @param {Object} [options.bootstrapStartupAdapter] - Narrow startup adapter.
  * @param {Object} [options.runtimeOwner] - Dedicated steady-state runtime owner.
  * @param {BootstrapService} [options.bootstrapService] - Legacy startup adapter.
   * @param {Object} [options.epochManager] - Assignment epoch manager.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("11132")) {
      {}
    } else {
      stryCov_9fa48("11132");
      this.rolloutControls = assertRequiredControlPlaneRollout(stryMutAct_9fa48("11133") ? {} : (stryCov_9fa48("11133"), {
        owner: stryMutAct_9fa48("11134") ? "" : (stryCov_9fa48("11134"), 'BootstrapAPI'),
        controls: options.rolloutControls,
        required: CONTROL_PLANE_ROLLOUT_REQUIRED.BOOTSTRAP_API
      }));
      this.controlPlaneWriteHealthProvider = (stryMutAct_9fa48("11137") ? typeof options.controlPlaneWriteHealthProvider !== TYPEOF.FUNCTION : stryMutAct_9fa48("11136") ? false : stryMutAct_9fa48("11135") ? true : (stryCov_9fa48("11135", "11136", "11137"), typeof options.controlPlaneWriteHealthProvider === TYPEOF.FUNCTION)) ? options.controlPlaneWriteHealthProvider : null;
      this.bootstrapStartupAdapter = stryMutAct_9fa48("11140") ? (options.bootstrapStartupAdapter || options.bootstrapService) && null : stryMutAct_9fa48("11139") ? false : stryMutAct_9fa48("11138") ? true : (stryCov_9fa48("11138", "11139", "11140"), (stryMutAct_9fa48("11142") ? options.bootstrapStartupAdapter && options.bootstrapService : stryMutAct_9fa48("11141") ? false : (stryCov_9fa48("11141", "11142"), options.bootstrapStartupAdapter || options.bootstrapService)) || null);
      this.runtimeOwner = stryMutAct_9fa48("11145") ? (options.runtimeOwner || this.bootstrapStartupAdapter?.runtimeDependencyOwner || options.bootstrapService?.runtimeDependencyOwner) && null : stryMutAct_9fa48("11144") ? false : stryMutAct_9fa48("11143") ? true : (stryCov_9fa48("11143", "11144", "11145"), (stryMutAct_9fa48("11147") ? (options.runtimeOwner || this.bootstrapStartupAdapter?.runtimeDependencyOwner) && options.bootstrapService?.runtimeDependencyOwner : stryMutAct_9fa48("11146") ? false : (stryCov_9fa48("11146", "11147"), (stryMutAct_9fa48("11149") ? options.runtimeOwner && this.bootstrapStartupAdapter?.runtimeDependencyOwner : stryMutAct_9fa48("11148") ? false : (stryCov_9fa48("11148", "11149"), options.runtimeOwner || (stryMutAct_9fa48("11150") ? this.bootstrapStartupAdapter.runtimeDependencyOwner : (stryCov_9fa48("11150"), this.bootstrapStartupAdapter?.runtimeDependencyOwner)))) || (stryMutAct_9fa48("11151") ? options.bootstrapService.runtimeDependencyOwner : (stryCov_9fa48("11151"), options.bootstrapService?.runtimeDependencyOwner)))) || null);
      this.startupRecoveryCoordinator = stryMutAct_9fa48("11154") ? (options.startupRecoveryCoordinator || this.runtimeOwner?.rebalanceCoordinator?.startupRecoveryCoordinator) && null : stryMutAct_9fa48("11153") ? false : stryMutAct_9fa48("11152") ? true : (stryCov_9fa48("11152", "11153", "11154"), (stryMutAct_9fa48("11156") ? options.startupRecoveryCoordinator && this.runtimeOwner?.rebalanceCoordinator?.startupRecoveryCoordinator : stryMutAct_9fa48("11155") ? false : (stryCov_9fa48("11155", "11156"), options.startupRecoveryCoordinator || (stryMutAct_9fa48("11158") ? this.runtimeOwner.rebalanceCoordinator?.startupRecoveryCoordinator : stryMutAct_9fa48("11157") ? this.runtimeOwner?.rebalanceCoordinator.startupRecoveryCoordinator : (stryCov_9fa48("11157", "11158"), this.runtimeOwner?.rebalanceCoordinator?.startupRecoveryCoordinator)))) || null);
      this.systemTableCache = stryMutAct_9fa48("11161") ? options.systemTableCache && null : stryMutAct_9fa48("11160") ? false : stryMutAct_9fa48("11159") ? true : (stryCov_9fa48("11159", "11160", "11161"), options.systemTableCache || null);
      this.seedNodeId = stryMutAct_9fa48("11164") ? options.seedNodeId && null : stryMutAct_9fa48("11163") ? false : stryMutAct_9fa48("11162") ? true : (stryCov_9fa48("11162", "11163", "11164"), options.seedNodeId || null);
      this.seedNodeAddress = stryMutAct_9fa48("11167") ? options.seedNodeAddress && null : stryMutAct_9fa48("11166") ? false : stryMutAct_9fa48("11165") ? true : (stryCov_9fa48("11165", "11166", "11167"), options.seedNodeAddress || null);
      this.seedNodeWsAddress = stryMutAct_9fa48("11170") ? options.seedNodeWsAddress && null : stryMutAct_9fa48("11169") ? false : stryMutAct_9fa48("11168") ? true : (stryCov_9fa48("11168", "11169", "11170"), options.seedNodeWsAddress || null);
      this.wsPort = stryMutAct_9fa48("11173") ? options.wsPort && null : stryMutAct_9fa48("11172") ? false : stryMutAct_9fa48("11171") ? true : (stryCov_9fa48("11171", "11172", "11173"), options.wsPort || null);
      this.messageGroupServices = stryMutAct_9fa48("11176") ? options.messageGroupServices && new Map() : stryMutAct_9fa48("11175") ? false : stryMutAct_9fa48("11174") ? true : (stryCov_9fa48("11174", "11175", "11176"), options.messageGroupServices || new Map());
      this.partitionServices = stryMutAct_9fa48("11179") ? options.partitionServices && new Map() : stryMutAct_9fa48("11178") ? false : stryMutAct_9fa48("11177") ? true : (stryCov_9fa48("11177", "11178", "11179"), options.partitionServices || new Map());
      this.replicaHandler = stryMutAct_9fa48("11182") ? options.replicaHandler && null : stryMutAct_9fa48("11181") ? false : stryMutAct_9fa48("11180") ? true : (stryCov_9fa48("11180", "11181", "11182"), options.replicaHandler || null);
      this.sqlQueryEngine = stryMutAct_9fa48("11185") ? options.sqlQueryEngine && null : stryMutAct_9fa48("11184") ? false : stryMutAct_9fa48("11183") ? true : (stryCov_9fa48("11183", "11184", "11185"), options.sqlQueryEngine || null);
      this.cdcIntegrationService = stryMutAct_9fa48("11188") ? (options.cdcIntegrationService || this.runtimeOwner?.cdcIntegrationService) && null : stryMutAct_9fa48("11187") ? false : stryMutAct_9fa48("11186") ? true : (stryCov_9fa48("11186", "11187", "11188"), (stryMutAct_9fa48("11190") ? options.cdcIntegrationService && this.runtimeOwner?.cdcIntegrationService : stryMutAct_9fa48("11189") ? false : (stryCov_9fa48("11189", "11190"), options.cdcIntegrationService || (stryMutAct_9fa48("11191") ? this.runtimeOwner.cdcIntegrationService : (stryCov_9fa48("11191"), this.runtimeOwner?.cdcIntegrationService)))) || null);
      this.controlPlaneReadinessService = stryMutAct_9fa48("11194") ? (options.controlPlaneReadinessService || this.runtimeOwner?.controlPlaneReadinessService) && null : stryMutAct_9fa48("11193") ? false : stryMutAct_9fa48("11192") ? true : (stryCov_9fa48("11192", "11193", "11194"), (stryMutAct_9fa48("11196") ? options.controlPlaneReadinessService && this.runtimeOwner?.controlPlaneReadinessService : stryMutAct_9fa48("11195") ? false : (stryCov_9fa48("11195", "11196"), options.controlPlaneReadinessService || (stryMutAct_9fa48("11197") ? this.runtimeOwner.controlPlaneReadinessService : (stryCov_9fa48("11197"), this.runtimeOwner?.controlPlaneReadinessService)))) || null);
      this.epochManager = stryMutAct_9fa48("11200") ? options.epochManager && null : stryMutAct_9fa48("11199") ? false : stryMutAct_9fa48("11198") ? true : (stryCov_9fa48("11198", "11199", "11200"), options.epochManager || null);
      this.messageRouter = stryMutAct_9fa48("11203") ? options.messageRouter && null : stryMutAct_9fa48("11202") ? false : stryMutAct_9fa48("11201") ? true : (stryCov_9fa48("11201", "11202", "11203"), options.messageRouter || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("11206") ? options.controlPlaneSystemTableGateway && createControlPlaneRuntimeBundle({
        nodeId: this.seedNodeId || BOOTSTRAP_API_SUBSYSTEM,
        getSqlQueryEngine: () => this.sqlQueryEngine,
        getCdcIntegrationService: () => this.getCdcIntegrationService(),
        getSystemTableCache: () => this.getSystemTableCache(),
        getMessageRouter: () => this.messageRouter
      }).controlPlaneSystemTableGateway : stryMutAct_9fa48("11205") ? false : stryMutAct_9fa48("11204") ? true : (stryCov_9fa48("11204", "11205", "11206"), options.controlPlaneSystemTableGateway || createControlPlaneRuntimeBundle(stryMutAct_9fa48("11207") ? {} : (stryCov_9fa48("11207"), {
        nodeId: stryMutAct_9fa48("11210") ? this.seedNodeId && BOOTSTRAP_API_SUBSYSTEM : stryMutAct_9fa48("11209") ? false : stryMutAct_9fa48("11208") ? true : (stryCov_9fa48("11208", "11209", "11210"), this.seedNodeId || BOOTSTRAP_API_SUBSYSTEM),
        getSqlQueryEngine: stryMutAct_9fa48("11211") ? () => undefined : (stryCov_9fa48("11211"), () => this.sqlQueryEngine),
        getCdcIntegrationService: stryMutAct_9fa48("11212") ? () => undefined : (stryCov_9fa48("11212"), () => this.getCdcIntegrationService()),
        getSystemTableCache: stryMutAct_9fa48("11213") ? () => undefined : (stryCov_9fa48("11213"), () => this.getSystemTableCache()),
        getMessageRouter: stryMutAct_9fa48("11214") ? () => undefined : (stryCov_9fa48("11214"), () => this.messageRouter)
      })).controlPlaneSystemTableGateway);
      this.authoritativeControlPlaneView = stryMutAct_9fa48("11217") ? options.authoritativeControlPlaneView && null : stryMutAct_9fa48("11216") ? false : stryMutAct_9fa48("11215") ? true : (stryCov_9fa48("11215", "11216", "11217"), options.authoritativeControlPlaneView || null);
      this.maxConcurrentBootstrapRequests = (stryMutAct_9fa48("11220") ? Number.isFinite(options.maxConcurrentBootstrapRequests) || options.maxConcurrentBootstrapRequests > NUM.ZERO : stryMutAct_9fa48("11219") ? false : stryMutAct_9fa48("11218") ? true : (stryCov_9fa48("11218", "11219", "11220"), Number.isFinite(options.maxConcurrentBootstrapRequests) && (stryMutAct_9fa48("11223") ? options.maxConcurrentBootstrapRequests <= NUM.ZERO : stryMutAct_9fa48("11222") ? options.maxConcurrentBootstrapRequests >= NUM.ZERO : stryMutAct_9fa48("11221") ? true : (stryCov_9fa48("11221", "11222", "11223"), options.maxConcurrentBootstrapRequests > NUM.ZERO)))) ? Math.floor(options.maxConcurrentBootstrapRequests) : BOOTSTRAP_API_DEFAULT.MAX_CONCURRENT_BOOTSTRAP_REQUESTS;
      this.bootstrapAdmissionRetryAfterMs = (stryMutAct_9fa48("11226") ? Number.isFinite(options.bootstrapAdmissionRetryAfterMs) || options.bootstrapAdmissionRetryAfterMs > NUM.ZERO : stryMutAct_9fa48("11225") ? false : stryMutAct_9fa48("11224") ? true : (stryCov_9fa48("11224", "11225", "11226"), Number.isFinite(options.bootstrapAdmissionRetryAfterMs) && (stryMutAct_9fa48("11229") ? options.bootstrapAdmissionRetryAfterMs <= NUM.ZERO : stryMutAct_9fa48("11228") ? options.bootstrapAdmissionRetryAfterMs >= NUM.ZERO : stryMutAct_9fa48("11227") ? true : (stryCov_9fa48("11227", "11228", "11229"), options.bootstrapAdmissionRetryAfterMs > NUM.ZERO)))) ? Math.floor(options.bootstrapAdmissionRetryAfterMs) : BOOTSTRAP_API_DEFAULT.BOOTSTRAP_ADMISSION_RETRY_AFTER_MS;
      this.inFlightBootstrapRequestCount = NUM.ZERO;
      this.moveReplicaAssignmentLeaseMs = Number.isFinite(options.moveReplicaAssignmentLeaseMs) ? stryMutAct_9fa48("11230") ? Math.min(NUM.ONE, Math.floor(options.moveReplicaAssignmentLeaseMs)) : (stryCov_9fa48("11230"), Math.max(NUM.ONE, Math.floor(options.moveReplicaAssignmentLeaseMs))) : BOOTSTRAP_API_DEFAULT.MOVE_REPLICA_ASSIGNMENT_LEASE_MS;
      this.moveReplicaAssignmentSweepIntervalMs = Number.isFinite(options.moveReplicaAssignmentSweepIntervalMs) ? stryMutAct_9fa48("11231") ? Math.min(NUM.ONE, Math.floor(options.moveReplicaAssignmentSweepIntervalMs)) : (stryCov_9fa48("11231"), Math.max(NUM.ONE, Math.floor(options.moveReplicaAssignmentSweepIntervalMs))) : BOOTSTRAP_API_DEFAULT.MOVE_REPLICA_ASSIGNMENT_SWEEP_INTERVAL_MS;
      this.ownsMoveReplicaAssignmentLifecycle = (stryMutAct_9fa48("11234") ? typeof options.ownsMoveReplicaAssignmentLifecycle !== TYPEOF.BOOLEAN : stryMutAct_9fa48("11233") ? false : stryMutAct_9fa48("11232") ? true : (stryCov_9fa48("11232", "11233", "11234"), typeof options.ownsMoveReplicaAssignmentLifecycle === TYPEOF.BOOLEAN)) ? options.ownsMoveReplicaAssignmentLifecycle : Boolean(stryMutAct_9fa48("11237") ? options.bootstrapStartupAdapter && options.bootstrapService : stryMutAct_9fa48("11236") ? false : stryMutAct_9fa48("11235") ? true : (stryCov_9fa48("11235", "11236", "11237"), options.bootstrapStartupAdapter || options.bootstrapService));
      this.moveReplicaAssignmentReservations = new Map();
      this.moveReplicaAssignmentSweepTimer = null;
      this.readinessState = stryMutAct_9fa48("11240") ? options.readinessState && new BootstrapReadinessState({
        readyStableWindowMs: options.readyStableWindowMs,
        demotionFailureThreshold: options.demotionFailureThreshold,
        retryAfterMs: options.retryAfterMs
      }) : stryMutAct_9fa48("11239") ? false : stryMutAct_9fa48("11238") ? true : (stryCov_9fa48("11238", "11239", "11240"), options.readinessState || new BootstrapReadinessState(stryMutAct_9fa48("11241") ? {} : (stryCov_9fa48("11241"), {
        readyStableWindowMs: options.readyStableWindowMs,
        demotionFailureThreshold: options.demotionFailureThreshold,
        retryAfterMs: options.retryAfterMs
      })));

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.port = stryMutAct_9fa48("11244") ? config.get(NODE_CONFIG_KEY.REST_API_PORT) && NODE_DEFAULT.REST_API_PORT : stryMutAct_9fa48("11243") ? false : stryMutAct_9fa48("11242") ? true : (stryCov_9fa48("11242", "11243", "11244"), config.get(NODE_CONFIG_KEY.REST_API_PORT) || NODE_DEFAULT.REST_API_PORT);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(BOOTSTRAP_API_SUBSYSTEM) : console;
      this.serviceRegistrationVisibilityOwner = new ServiceRegistrationVisibilityOwner(stryMutAct_9fa48("11245") ? {} : (stryCov_9fa48("11245"), {
        delegates: stryMutAct_9fa48("11246") ? {} : (stryCov_9fa48("11246"), {
          getSystemTableCache: stryMutAct_9fa48("11247") ? () => undefined : (stryCov_9fa48("11247"), () => this.getSystemTableCache()),
          executeBootstrapControlPlaneQuery: stryMutAct_9fa48("11248") ? () => undefined : (stryCov_9fa48("11248"), (sql, params) => this.executeBootstrapControlPlaneQuery(sql, params)),
          getCdcIntegrationService: stryMutAct_9fa48("11249") ? () => undefined : (stryCov_9fa48("11249"), () => this.getCdcIntegrationService()),
          buildRegisterServiceValidationError: stryMutAct_9fa48("11250") ? () => undefined : (stryCov_9fa48("11250"), (...args) => this.buildRegisterServiceValidationError(...args)),
          getLogger: stryMutAct_9fa48("11251") ? () => undefined : (stryCov_9fa48("11251"), () => this.logger)
        })
      }));
      this.moveReplicaHandoffOwner = new MoveReplicaHandoffOwner(stryMutAct_9fa48("11252") ? {} : (stryCov_9fa48("11252"), {
        delegates: stryMutAct_9fa48("11253") ? {} : (stryCov_9fa48("11253"), {
          getLogger: stryMutAct_9fa48("11254") ? () => undefined : (stryCov_9fa48("11254"), () => this.logger),
          getSeedNodeId: stryMutAct_9fa48("11255") ? () => undefined : (stryCov_9fa48("11255"), () => this.seedNodeId),
          getSeedNodeAddress: stryMutAct_9fa48("11256") ? () => undefined : (stryCov_9fa48("11256"), () => this.seedNodeAddress),
          getSystemTableCache: stryMutAct_9fa48("11257") ? () => undefined : (stryCov_9fa48("11257"), () => this.getSystemTableCache()),
          getMessageGroupServices: stryMutAct_9fa48("11258") ? () => undefined : (stryCov_9fa48("11258"), () => this.messageGroupServices),
          getMessageRouter: stryMutAct_9fa48("11259") ? () => undefined : (stryCov_9fa48("11259"), () => stryMutAct_9fa48("11262") ? (this.messageRouter || this.runtimeOwner?.messageRouter || this.bootstrapStartupAdapter?.messageRouter) && null : stryMutAct_9fa48("11261") ? false : stryMutAct_9fa48("11260") ? true : (stryCov_9fa48("11260", "11261", "11262"), (stryMutAct_9fa48("11264") ? (this.messageRouter || this.runtimeOwner?.messageRouter) && this.bootstrapStartupAdapter?.messageRouter : stryMutAct_9fa48("11263") ? false : (stryCov_9fa48("11263", "11264"), (stryMutAct_9fa48("11266") ? this.messageRouter && this.runtimeOwner?.messageRouter : stryMutAct_9fa48("11265") ? false : (stryCov_9fa48("11265", "11266"), this.messageRouter || (stryMutAct_9fa48("11267") ? this.runtimeOwner.messageRouter : (stryCov_9fa48("11267"), this.runtimeOwner?.messageRouter)))) || (stryMutAct_9fa48("11268") ? this.bootstrapStartupAdapter.messageRouter : (stryCov_9fa48("11268"), this.bootstrapStartupAdapter?.messageRouter)))) || null)),
          getMoveReplicaAssignmentReservations: stryMutAct_9fa48("11269") ? () => undefined : (stryCov_9fa48("11269"), () => this.moveReplicaAssignmentReservations),
          buildRegisterServiceValidationError: stryMutAct_9fa48("11270") ? () => undefined : (stryCov_9fa48("11270"), (...args) => this.buildRegisterServiceValidationError(...args)),
          buildRegisteredServiceMutationRow: stryMutAct_9fa48("11271") ? () => undefined : (stryCov_9fa48("11271"), serviceData => this.buildRegisteredServiceMutationRow(serviceData)),
          executeBootstrapControlPlaneMutation: stryMutAct_9fa48("11272") ? () => undefined : (stryCov_9fa48("11272"), (operation, options) => this.executeBootstrapControlPlaneMutation(operation, options)),
          buildBootstrapControlPlaneQueryError: stryMutAct_9fa48("11273") ? () => undefined : (stryCov_9fa48("11273"), (result, fallbackMessage) => this.buildBootstrapControlPlaneQueryError(result, fallbackMessage)),
          waitForRegisteredServiceCacheVisibility: stryMutAct_9fa48("11274") ? () => undefined : (stryCov_9fa48("11274"), expectedService => this.waitForRegisteredServiceCacheVisibility(expectedService)),
          insertMoveReplicaHandoffOperation: stryMutAct_9fa48("11275") ? () => undefined : (stryCov_9fa48("11275"), handoffContext => this.insertMoveReplicaHandoffOperation(handoffContext)),
          updateMoveReplicaHandoffOperation: stryMutAct_9fa48("11276") ? () => undefined : (stryCov_9fa48("11276"), handoffContext => this.updateMoveReplicaHandoffOperation(handoffContext))
        })
      }));
      this.serviceRegistrationHandoffOwner = new ServiceRegistrationHandoffOwner(stryMutAct_9fa48("11277") ? {} : (stryCov_9fa48("11277"), {
        delegates: stryMutAct_9fa48("11278") ? {} : (stryCov_9fa48("11278"), {
          getLogger: stryMutAct_9fa48("11279") ? () => undefined : (stryCov_9fa48("11279"), () => this.logger),
          getSqlQueryEngine: stryMutAct_9fa48("11280") ? () => undefined : (stryCov_9fa48("11280"), () => this.sqlQueryEngine),
          validateMoveReplicaAssignmentToken: stryMutAct_9fa48("11281") ? () => undefined : (stryCov_9fa48("11281"), serviceData => this.validateMoveReplicaAssignmentToken(serviceData)),
          assertSingleOwnerReplicaRegistration: stryMutAct_9fa48("11282") ? () => undefined : (stryCov_9fa48("11282"), (serviceData, assignmentContext) => this.assertSingleOwnerReplicaRegistration(serviceData, assignmentContext)),
          startMoveReplicaHandoff: stryMutAct_9fa48("11283") ? () => undefined : (stryCov_9fa48("11283"), (serviceData, assignmentContext) => this.startMoveReplicaHandoff(serviceData, assignmentContext)),
          readCurrentRegisteredServiceRow: stryMutAct_9fa48("11284") ? () => undefined : (stryCov_9fa48("11284"), serviceId => this.readCurrentRegisteredServiceRow(serviceId)),
          executeMoveReplicaHandoffPhase: stryMutAct_9fa48("11285") ? () => undefined : (stryCov_9fa48("11285"), (...args) => this.executeMoveReplicaHandoffPhase(...args)),
          verifyMoveReplicaHandoffTarget: stryMutAct_9fa48("11286") ? () => undefined : (stryCov_9fa48("11286"), (handoffContext, serviceData) => this.verifyMoveReplicaHandoffTarget(handoffContext, serviceData)),
          buildRegisteredServiceMutationRow: stryMutAct_9fa48("11287") ? () => undefined : (stryCov_9fa48("11287"), serviceData => this.buildRegisteredServiceMutationRow(serviceData)),
          executeBootstrapControlPlaneMutation: stryMutAct_9fa48("11288") ? () => undefined : (stryCov_9fa48("11288"), (operation, options) => this.executeBootstrapControlPlaneMutation(operation, options)),
          buildBootstrapControlPlaneQueryError: stryMutAct_9fa48("11289") ? () => undefined : (stryCov_9fa48("11289"), (result, fallbackMessage) => this.buildBootstrapControlPlaneQueryError(result, fallbackMessage)),
          buildBootstrapControlPlaneMutationError: stryMutAct_9fa48("11290") ? () => undefined : (stryCov_9fa48("11290"), (error, tableName, fallbackMessage) => this.buildBootstrapControlPlaneMutationError(error, tableName, fallbackMessage)),
          buildExpectedRegisteredServiceData: stryMutAct_9fa48("11291") ? () => undefined : (stryCov_9fa48("11291"), serviceData => this.buildExpectedRegisteredServiceData(serviceData)),
          waitForRegisteredServiceCacheVisibility: stryMutAct_9fa48("11292") ? () => undefined : (stryCov_9fa48("11292"), expectedService => this.waitForRegisteredServiceCacheVisibility(expectedService)),
          removeLocalSourceReplicaForMoveReplica: stryMutAct_9fa48("11293") ? () => undefined : (stryCov_9fa48("11293"), serviceData => this.removeLocalSourceReplicaForMoveReplica(serviceData)),
          completeMoveReplicaHandoff: stryMutAct_9fa48("11294") ? () => undefined : (stryCov_9fa48("11294"), handoffContext => this.completeMoveReplicaHandoff(handoffContext)),
          restoreRegisteredServiceRowAfterFailedHandoff: stryMutAct_9fa48("11295") ? () => undefined : (stryCov_9fa48("11295"), (previousServiceRow, requestedServiceData, error) => this.restoreRegisteredServiceRowAfterFailedHandoff(previousServiceRow, requestedServiceData, error)),
          shouldPreserveMoveReplicaHandoffReservation: stryMutAct_9fa48("11296") ? () => undefined : (stryCov_9fa48("11296"), (handoffContext, error, sourceRemovalCompleted) => this.shouldPreserveMoveReplicaHandoffReservation(handoffContext, error, sourceRemovalCompleted)),
          failMoveReplicaHandoff: stryMutAct_9fa48("11297") ? () => undefined : (stryCov_9fa48("11297"), (handoffContext, error) => this.failMoveReplicaHandoff(handoffContext, error))
        })
      }));
      this.moveReplicaAssignmentOwner = new MoveReplicaAssignmentOwner(stryMutAct_9fa48("11298") ? {} : (stryCov_9fa48("11298"), {
        delegates: stryMutAct_9fa48("11299") ? {} : (stryCov_9fa48("11299"), {
          getSeedNodeId: stryMutAct_9fa48("11300") ? () => undefined : (stryCov_9fa48("11300"), () => this.seedNodeId),
          getSystemTableCache: stryMutAct_9fa48("11301") ? () => undefined : (stryCov_9fa48("11301"), () => this.getSystemTableCache()),
          getMessageGroupServices: stryMutAct_9fa48("11302") ? () => undefined : (stryCov_9fa48("11302"), () => this.messageGroupServices),
          getSqlQueryEngine: stryMutAct_9fa48("11303") ? () => undefined : (stryCov_9fa48("11303"), () => this.sqlQueryEngine),
          getLogger: stryMutAct_9fa48("11304") ? () => undefined : (stryCov_9fa48("11304"), () => this.logger),
          getMessageRouter: stryMutAct_9fa48("11305") ? () => undefined : (stryCov_9fa48("11305"), () => stryMutAct_9fa48("11308") ? (this.messageRouter || this.runtimeOwner?.messageRouter || this.bootstrapStartupAdapter?.messageRouter) && null : stryMutAct_9fa48("11307") ? false : stryMutAct_9fa48("11306") ? true : (stryCov_9fa48("11306", "11307", "11308"), (stryMutAct_9fa48("11310") ? (this.messageRouter || this.runtimeOwner?.messageRouter) && this.bootstrapStartupAdapter?.messageRouter : stryMutAct_9fa48("11309") ? false : (stryCov_9fa48("11309", "11310"), (stryMutAct_9fa48("11312") ? this.messageRouter && this.runtimeOwner?.messageRouter : stryMutAct_9fa48("11311") ? false : (stryCov_9fa48("11311", "11312"), this.messageRouter || (stryMutAct_9fa48("11313") ? this.runtimeOwner.messageRouter : (stryCov_9fa48("11313"), this.runtimeOwner?.messageRouter)))) || (stryMutAct_9fa48("11314") ? this.bootstrapStartupAdapter.messageRouter : (stryCov_9fa48("11314"), this.bootstrapStartupAdapter?.messageRouter)))) || null)),
          getMoveReplicaAssignmentReservations: stryMutAct_9fa48("11315") ? () => undefined : (stryCov_9fa48("11315"), () => this.moveReplicaAssignmentReservations),
          getMoveReplicaAssignmentLeaseMs: stryMutAct_9fa48("11316") ? () => undefined : (stryCov_9fa48("11316"), () => this.moveReplicaAssignmentLeaseMs),
          getMoveReplicaAssignmentSweepIntervalMs: stryMutAct_9fa48("11317") ? () => undefined : (stryCov_9fa48("11317"), () => this.moveReplicaAssignmentSweepIntervalMs),
          getBootstrapAdmissionRetryAfterMs: stryMutAct_9fa48("11318") ? () => undefined : (stryCov_9fa48("11318"), () => this.bootstrapAdmissionRetryAfterMs),
          executeBootstrapControlPlaneQuery: stryMutAct_9fa48("11319") ? () => undefined : (stryCov_9fa48("11319"), (sql, params) => this.executeBootstrapControlPlaneQuery(sql, params)),
          executeBootstrapControlPlaneMutation: stryMutAct_9fa48("11320") ? () => undefined : (stryCov_9fa48("11320"), (mutation, mutationOptions) => this.executeBootstrapControlPlaneMutation(mutation, mutationOptions)),
          buildBootstrapControlPlaneQueryError: stryMutAct_9fa48("11321") ? () => undefined : (stryCov_9fa48("11321"), (result, message) => this.buildBootstrapControlPlaneQueryError(result, message)),
          buildRegisterServiceValidationError: stryMutAct_9fa48("11322") ? () => undefined : (stryCov_9fa48("11322"), (statusCode, message, code, options) => this.buildRegisterServiceValidationError(statusCode, message, code, options))
        })
      }));
      this.bootstrapTopologySnapshotOwner = new BootstrapTopologySnapshotOwner(stryMutAct_9fa48("11323") ? {} : (stryCov_9fa48("11323"), {
        delegates: stryMutAct_9fa48("11324") ? {} : (stryCov_9fa48("11324"), {
          getSystemTableCache: stryMutAct_9fa48("11325") ? () => undefined : (stryCov_9fa48("11325"), () => this.getSystemTableCache()),
          getPartitionServices: stryMutAct_9fa48("11326") ? () => undefined : (stryCov_9fa48("11326"), () => this.partitionServices),
          getSeedNodeId: stryMutAct_9fa48("11327") ? () => undefined : (stryCov_9fa48("11327"), () => this.seedNodeId),
          getLogger: stryMutAct_9fa48("11328") ? () => undefined : (stryCov_9fa48("11328"), () => this.logger),
          getCurrentEpoch: stryMutAct_9fa48("11329") ? () => undefined : (stryCov_9fa48("11329"), () => this.getCurrentEpoch())
        })
      }));
      if (stryMutAct_9fa48("11332") ? typeof this.sqlQueryEngine?.queryExecutor?.setBootstrapTopologySnapshotOwner !== 'function' : stryMutAct_9fa48("11331") ? false : stryMutAct_9fa48("11330") ? true : (stryCov_9fa48("11330", "11331", "11332"), typeof (stryMutAct_9fa48("11334") ? this.sqlQueryEngine.queryExecutor?.setBootstrapTopologySnapshotOwner : stryMutAct_9fa48("11333") ? this.sqlQueryEngine?.queryExecutor.setBootstrapTopologySnapshotOwner : (stryCov_9fa48("11333", "11334"), this.sqlQueryEngine?.queryExecutor?.setBootstrapTopologySnapshotOwner)) === (stryMutAct_9fa48("11335") ? "" : (stryCov_9fa48("11335"), 'function')))) {
        if (stryMutAct_9fa48("11336")) {
          {}
        } else {
          stryCov_9fa48("11336");
          this.sqlQueryEngine.queryExecutor.setBootstrapTopologySnapshotOwner(this.bootstrapTopologySnapshotOwner);
        }
      }
      this.bootstrapJoinAdmissionOwner = new BootstrapJoinAdmissionOwner(stryMutAct_9fa48("11337") ? {} : (stryCov_9fa48("11337"), {
        delegates: stryMutAct_9fa48("11338") ? {} : (stryCov_9fa48("11338"), {
          getSeedNodeId: stryMutAct_9fa48("11339") ? () => undefined : (stryCov_9fa48("11339"), () => this.seedNodeId),
          getSeedNodeAddress: stryMutAct_9fa48("11340") ? () => undefined : (stryCov_9fa48("11340"), () => this.seedNodeAddress),
          getSystemTableCache: stryMutAct_9fa48("11341") ? () => undefined : (stryCov_9fa48("11341"), () => this.getSystemTableCache()),
          getLogger: stryMutAct_9fa48("11342") ? () => undefined : (stryCov_9fa48("11342"), () => this.logger),
          getCdcIntegrationService: stryMutAct_9fa48("11343") ? () => undefined : (stryCov_9fa48("11343"), () => this.getCdcIntegrationService()),
          getMessageRouter: stryMutAct_9fa48("11344") ? () => undefined : (stryCov_9fa48("11344"), () => stryMutAct_9fa48("11347") ? (this.messageRouter || this.runtimeOwner?.messageRouter || this.bootstrapStartupAdapter?.messageRouter) && null : stryMutAct_9fa48("11346") ? false : stryMutAct_9fa48("11345") ? true : (stryCov_9fa48("11345", "11346", "11347"), (stryMutAct_9fa48("11349") ? (this.messageRouter || this.runtimeOwner?.messageRouter) && this.bootstrapStartupAdapter?.messageRouter : stryMutAct_9fa48("11348") ? false : (stryCov_9fa48("11348", "11349"), (stryMutAct_9fa48("11351") ? this.messageRouter && this.runtimeOwner?.messageRouter : stryMutAct_9fa48("11350") ? false : (stryCov_9fa48("11350", "11351"), this.messageRouter || (stryMutAct_9fa48("11352") ? this.runtimeOwner.messageRouter : (stryCov_9fa48("11352"), this.runtimeOwner?.messageRouter)))) || (stryMutAct_9fa48("11353") ? this.bootstrapStartupAdapter.messageRouter : (stryCov_9fa48("11353"), this.bootstrapStartupAdapter?.messageRouter)))) || null)),
          getAuthoritativeControlPlaneViewInstance: stryMutAct_9fa48("11354") ? () => undefined : (stryCov_9fa48("11354"), () => this.authoritativeControlPlaneView),
          setAuthoritativeControlPlaneViewInstance: view => {
            if (stryMutAct_9fa48("11355")) {
              {}
            } else {
              stryCov_9fa48("11355");
              this.authoritativeControlPlaneView = stryMutAct_9fa48("11358") ? view && null : stryMutAct_9fa48("11357") ? false : stryMutAct_9fa48("11356") ? true : (stryCov_9fa48("11356", "11357", "11358"), view || null);
            }
          },
          getBootstrapAuthoritativeTableRows: stryMutAct_9fa48("11359") ? () => undefined : (stryCov_9fa48("11359"), tableName => this.getBootstrapAuthoritativeTableRows(tableName)),
          expireMoveReplicaAssignmentReservations: stryMutAct_9fa48("11360") ? () => undefined : (stryCov_9fa48("11360"), () => this.expireMoveReplicaAssignmentReservations()),
          getActiveMoveReplicaAssignmentReservations: stryMutAct_9fa48("11361") ? () => undefined : (stryCov_9fa48("11361"), () => this.getActiveMoveReplicaAssignmentReservations()),
          getBlockingMoveReplicaBootstrapAdmissions: stryMutAct_9fa48("11362") ? () => undefined : (stryCov_9fa48("11362"), now => this.getBlockingMoveReplicaBootstrapAdmissions(now)),
          getMoveReplicaBootstrapExclusionReservations: stryMutAct_9fa48("11363") ? () => undefined : (stryCov_9fa48("11363"), now => this.moveReplicaAssignmentOwner.getMoveReplicaBootstrapExclusionReservations(now)),
          reserveMoveReplicaAssignment: stryMutAct_9fa48("11364") ? () => undefined : (stryCov_9fa48("11364"), (targetNodeId, assignment) => this.reserveMoveReplicaAssignment(targetNodeId, assignment))
        })
      }));
      this.bootstrapReadinessOwner = new BootstrapReadinessOwner(stryMutAct_9fa48("11365") ? {} : (stryCov_9fa48("11365"), {
        delegates: stryMutAct_9fa48("11366") ? {} : (stryCov_9fa48("11366"), {
          getSeedNodeId: stryMutAct_9fa48("11367") ? () => undefined : (stryCov_9fa48("11367"), () => this.seedNodeId),
          getReadinessState: stryMutAct_9fa48("11368") ? () => undefined : (stryCov_9fa48("11368"), () => this.readinessState),
          getBootstrapService: stryMutAct_9fa48("11369") ? () => undefined : (stryCov_9fa48("11369"), () => this.bootstrapStartupAdapter),
          getMessageRouter: stryMutAct_9fa48("11370") ? () => undefined : (stryCov_9fa48("11370"), () => this.messageRouter),
          getSqlQueryEngine: stryMutAct_9fa48("11371") ? () => undefined : (stryCov_9fa48("11371"), () => this.sqlQueryEngine),
          getControlPlaneReadinessService: stryMutAct_9fa48("11372") ? () => undefined : (stryCov_9fa48("11372"), () => stryMutAct_9fa48("11375") ? (this.controlPlaneReadinessService || this.runtimeOwner?.controlPlaneReadinessService) && null : stryMutAct_9fa48("11374") ? false : stryMutAct_9fa48("11373") ? true : (stryCov_9fa48("11373", "11374", "11375"), (stryMutAct_9fa48("11377") ? this.controlPlaneReadinessService && this.runtimeOwner?.controlPlaneReadinessService : stryMutAct_9fa48("11376") ? false : (stryCov_9fa48("11376", "11377"), this.controlPlaneReadinessService || (stryMutAct_9fa48("11378") ? this.runtimeOwner.controlPlaneReadinessService : (stryCov_9fa48("11378"), this.runtimeOwner?.controlPlaneReadinessService)))) || null)),
          getControlPlaneWriteHealthProvider: stryMutAct_9fa48("11379") ? () => undefined : (stryCov_9fa48("11379"), () => this.controlPlaneWriteHealthProvider),
          getStartupRecoveryCoordinator: stryMutAct_9fa48("11380") ? () => undefined : (stryCov_9fa48("11380"), () => this.startupRecoveryCoordinator),
          getLeaderReadinessStatusForProbe: stryMutAct_9fa48("11381") ? () => undefined : (stryCov_9fa48("11381"), () => this.getLeaderReadinessStatusForProbe()),
          getLogger: stryMutAct_9fa48("11382") ? () => undefined : (stryCov_9fa48("11382"), () => this.logger)
        })
      }));
      this.bootstrapRequestOwner = new BootstrapRequestOwner(stryMutAct_9fa48("11383") ? {} : (stryCov_9fa48("11383"), {
        delegates: stryMutAct_9fa48("11384") ? {} : (stryCov_9fa48("11384"), {
          getLogger: stryMutAct_9fa48("11385") ? () => undefined : (stryCov_9fa48("11385"), () => this.logger),
          getSeedNodeId: stryMutAct_9fa48("11386") ? () => undefined : (stryCov_9fa48("11386"), () => this.seedNodeId),
          getSeedNodeAddress: stryMutAct_9fa48("11387") ? () => undefined : (stryCov_9fa48("11387"), () => this.seedNodeAddress),
          getSeedNodeWsAddress: stryMutAct_9fa48("11388") ? () => undefined : (stryCov_9fa48("11388"), () => this.seedNodeWsAddress),
          getWsPort: stryMutAct_9fa48("11389") ? () => undefined : (stryCov_9fa48("11389"), () => this.wsPort),
          getBootstrapService: stryMutAct_9fa48("11390") ? () => undefined : (stryCov_9fa48("11390"), () => this.bootstrapStartupAdapter),
          getMaxConcurrentBootstrapRequests: stryMutAct_9fa48("11391") ? () => undefined : (stryCov_9fa48("11391"), () => this.maxConcurrentBootstrapRequests),
          getBootstrapAdmissionRetryAfterMs: stryMutAct_9fa48("11392") ? () => undefined : (stryCov_9fa48("11392"), () => this.bootstrapAdmissionRetryAfterMs),
          getInFlightBootstrapRequestCount: stryMutAct_9fa48("11393") ? () => undefined : (stryCov_9fa48("11393"), () => this.inFlightBootstrapRequestCount),
          setInFlightBootstrapRequestCount: count => {
            if (stryMutAct_9fa48("11394")) {
              {}
            } else {
              stryCov_9fa48("11394");
              this.inFlightBootstrapRequestCount = count;
            }
          },
          validateBootstrapRequest: stryMutAct_9fa48("11395") ? () => undefined : (stryCov_9fa48("11395"), (nodeId, nodeAddress) => this.validateBootstrapRequest(nodeId, nodeAddress)),
          checkForConflicts: stryMutAct_9fa48("11396") ? () => undefined : (stryCov_9fa48("11396"), (nodeId, nodeAddress) => this.checkForConflicts(nodeId, nodeAddress)),
          getBlockingMoveReplicaBootstrapAdmissions: stryMutAct_9fa48("11397") ? () => undefined : (stryCov_9fa48("11397"), now => this.getBlockingMoveReplicaBootstrapAdmissions(now)),
          resolveMoveReplicaBootstrapAdmissionRetryAfterMs: stryMutAct_9fa48("11398") ? () => undefined : (stryCov_9fa48("11398"), (reservation, now) => this.resolveMoveReplicaBootstrapAdmissionRetryAfterMs(reservation, now)),
          buildBootstrapNotReadyResponse: stryMutAct_9fa48("11399") ? () => undefined : (stryCov_9fa48("11399"), options => this.buildBootstrapNotReadyResponse(options)),
          waitForServiceLeaders: stryMutAct_9fa48("11400") ? () => undefined : (stryCov_9fa48("11400"), options => this.waitForServiceLeaders(options)),
          determineAndReserveMessageGroupAssignment: stryMutAct_9fa48("11401") ? () => undefined : (stryCov_9fa48("11401"), (nodeId, options) => this.determineAndReserveMessageGroupAssignment(nodeId, options)),
          getCurrentEpoch: stryMutAct_9fa48("11402") ? () => undefined : (stryCov_9fa48("11402"), () => this.getCurrentEpoch()),
          buildBootstrapTopologySnapshotEnvelope: stryMutAct_9fa48("11403") ? () => undefined : (stryCov_9fa48("11403"), options => this.buildBootstrapTopologySnapshotEnvelope(options)),
          getClusterConfiguration: stryMutAct_9fa48("11404") ? () => undefined : (stryCov_9fa48("11404"), () => this.getClusterConfiguration()),
          getReadyNodes: stryMutAct_9fa48("11405") ? () => undefined : (stryCov_9fa48("11405"), options => this.getReadyNodes(options)),
          getTablePolicies: stryMutAct_9fa48("11406") ? () => undefined : (stryCov_9fa48("11406"), () => this.getTablePolicies()),
          getLatencyTopologyHints: stryMutAct_9fa48("11407") ? () => undefined : (stryCov_9fa48("11407"), nodeId => this.getLatencyTopologyHints(nodeId))
        })
      }));
      this.bootstrapClusterViewOwner = new BootstrapClusterViewOwner(stryMutAct_9fa48("11408") ? {} : (stryCov_9fa48("11408"), {
        delegates: stryMutAct_9fa48("11409") ? {} : (stryCov_9fa48("11409"), {
          getSystemTableCache: stryMutAct_9fa48("11410") ? () => undefined : (stryCov_9fa48("11410"), () => this.getSystemTableCache()),
          getSeedNodeId: stryMutAct_9fa48("11411") ? () => undefined : (stryCov_9fa48("11411"), () => this.seedNodeId),
          getSeedNodeAddress: stryMutAct_9fa48("11412") ? () => undefined : (stryCov_9fa48("11412"), () => this.seedNodeAddress),
          getMessageGroups: stryMutAct_9fa48("11413") ? () => undefined : (stryCov_9fa48("11413"), () => this.getMessageGroups()),
          getControlPlaneReadinessService: stryMutAct_9fa48("11414") ? () => undefined : (stryCov_9fa48("11414"), () => stryMutAct_9fa48("11417") ? (this.controlPlaneReadinessService || this.runtimeOwner?.controlPlaneReadinessService) && null : stryMutAct_9fa48("11416") ? false : stryMutAct_9fa48("11415") ? true : (stryCov_9fa48("11415", "11416", "11417"), (stryMutAct_9fa48("11419") ? this.controlPlaneReadinessService && this.runtimeOwner?.controlPlaneReadinessService : stryMutAct_9fa48("11418") ? false : (stryCov_9fa48("11418", "11419"), this.controlPlaneReadinessService || (stryMutAct_9fa48("11420") ? this.runtimeOwner.controlPlaneReadinessService : (stryCov_9fa48("11420"), this.runtimeOwner?.controlPlaneReadinessService)))) || null)),
          getEpochManager: stryMutAct_9fa48("11421") ? () => undefined : (stryCov_9fa48("11421"), () => stryMutAct_9fa48("11424") ? this.epochManager && this.bootstrapStartupAdapter?.getEpochManager?.() : stryMutAct_9fa48("11423") ? false : stryMutAct_9fa48("11422") ? true : (stryCov_9fa48("11422", "11423", "11424"), this.epochManager || (stryMutAct_9fa48("11426") ? this.bootstrapStartupAdapter.getEpochManager?.() : stryMutAct_9fa48("11425") ? this.bootstrapStartupAdapter?.getEpochManager() : (stryCov_9fa48("11425", "11426"), this.bootstrapStartupAdapter?.getEpochManager?.()))))
        })
      }));
      this.serviceLeaderReadinessOwner = new ServiceLeaderReadinessOwner(stryMutAct_9fa48("11427") ? {} : (stryCov_9fa48("11427"), {
        delegates: stryMutAct_9fa48("11428") ? {} : (stryCov_9fa48("11428"), {
          getSystemTableCache: stryMutAct_9fa48("11429") ? () => undefined : (stryCov_9fa48("11429"), () => this.getSystemTableCache()),
          getPartitionServices: stryMutAct_9fa48("11430") ? () => undefined : (stryCov_9fa48("11430"), () => this.partitionServices),
          getBootstrapService: stryMutAct_9fa48("11431") ? () => undefined : (stryCov_9fa48("11431"), () => this.bootstrapStartupAdapter),
          getSeedNodeId: stryMutAct_9fa48("11432") ? () => undefined : (stryCov_9fa48("11432"), () => this.seedNodeId),
          getMissingServiceLeaders: stryMutAct_9fa48("11433") ? () => undefined : (stryCov_9fa48("11433"), () => (stryMutAct_9fa48("11436") ? this.getMissingServiceLeaders !== BootstrapAPI.prototype.getMissingServiceLeaders : stryMutAct_9fa48("11435") ? false : stryMutAct_9fa48("11434") ? true : (stryCov_9fa48("11434", "11435", "11436"), this.getMissingServiceLeaders === BootstrapAPI.prototype.getMissingServiceLeaders)) ? null : this.getMissingServiceLeaders()),
          getLogger: stryMutAct_9fa48("11437") ? () => undefined : (stryCov_9fa48("11437"), () => this.logger)
        })
      }));

      // Fastify instance
      this.fastify = null;
      this.initialized = stryMutAct_9fa48("11438") ? true : (stryCov_9fa48("11438"), false);
    }
  }

  /**
   * Set the SQL query engine for distributed queries.
   * Called after initialization when the engine becomes available.
   * @param {Object} sqlQueryEngine - SQL query engine instance.
   */
  setSqlQueryEngine(sqlQueryEngine) {
    if (stryMutAct_9fa48("11439")) {
      {}
    } else {
      stryCov_9fa48("11439");
      this.sqlQueryEngine = sqlQueryEngine;
      if (stryMutAct_9fa48("11442") ? typeof this.sqlQueryEngine?.queryExecutor?.setBootstrapTopologySnapshotOwner !== 'function' : stryMutAct_9fa48("11441") ? false : stryMutAct_9fa48("11440") ? true : (stryCov_9fa48("11440", "11441", "11442"), typeof (stryMutAct_9fa48("11444") ? this.sqlQueryEngine.queryExecutor?.setBootstrapTopologySnapshotOwner : stryMutAct_9fa48("11443") ? this.sqlQueryEngine?.queryExecutor.setBootstrapTopologySnapshotOwner : (stryCov_9fa48("11443", "11444"), this.sqlQueryEngine?.queryExecutor?.setBootstrapTopologySnapshotOwner)) === (stryMutAct_9fa48("11445") ? "" : (stryCov_9fa48("11445"), 'function')))) {
        if (stryMutAct_9fa48("11446")) {
          {}
        } else {
          stryCov_9fa48("11446");
          this.sqlQueryEngine.queryExecutor.setBootstrapTopologySnapshotOwner(this.bootstrapTopologySnapshotOwner);
        }
      }
      if (stryMutAct_9fa48("11449") ? this.partitionServices || typeof this.partitionServices.values === 'function' : stryMutAct_9fa48("11448") ? false : stryMutAct_9fa48("11447") ? true : (stryCov_9fa48("11447", "11448", "11449"), this.partitionServices && (stryMutAct_9fa48("11451") ? typeof this.partitionServices.values !== 'function' : stryMutAct_9fa48("11450") ? true : (stryCov_9fa48("11450", "11451"), typeof this.partitionServices.values === (stryMutAct_9fa48("11452") ? "" : (stryCov_9fa48("11452"), 'function')))))) {
        if (stryMutAct_9fa48("11453")) {
          {}
        } else {
          stryCov_9fa48("11453");
          for (const partitionService of this.partitionServices.values()) {
            if (stryMutAct_9fa48("11454")) {
              {}
            } else {
              stryCov_9fa48("11454");
              if (stryMutAct_9fa48("11457") ? !partitionService && typeof partitionService !== 'object' : stryMutAct_9fa48("11456") ? false : stryMutAct_9fa48("11455") ? true : (stryCov_9fa48("11455", "11456", "11457"), (stryMutAct_9fa48("11458") ? partitionService : (stryCov_9fa48("11458"), !partitionService)) || (stryMutAct_9fa48("11460") ? typeof partitionService === 'object' : stryMutAct_9fa48("11459") ? false : (stryCov_9fa48("11459", "11460"), typeof partitionService !== (stryMutAct_9fa48("11461") ? "" : (stryCov_9fa48("11461"), 'object')))))) {
                if (stryMutAct_9fa48("11462")) {
                  {}
                } else {
                  stryCov_9fa48("11462");
                  continue;
                }
              }
              if (stryMutAct_9fa48("11465") ? typeof partitionService.setSqlQueryEngine !== 'function' : stryMutAct_9fa48("11464") ? false : stryMutAct_9fa48("11463") ? true : (stryCov_9fa48("11463", "11464", "11465"), typeof partitionService.setSqlQueryEngine === (stryMutAct_9fa48("11466") ? "" : (stryCov_9fa48("11466"), 'function')))) {
                if (stryMutAct_9fa48("11467")) {
                  {}
                } else {
                  stryCov_9fa48("11467");
                  partitionService.setSqlQueryEngine(sqlQueryEngine);
                  continue;
                }
              }
              partitionService.sqlQueryEngine = sqlQueryEngine;
            }
          }
        }
      }
      this.logger.debug(BOOTSTRAP_API_LOG_MSG.SQL_ENGINE_SET);
    }
  }

  /**
   * Set the canonical CDC integration dependency used by bootstrap-owned
   * mutation ingress and authoritative repair/read helpers.
   * @param {Object|null} cdcIntegrationService
   */
  setCdcIntegrationService(cdcIntegrationService) {
    if (stryMutAct_9fa48("11468")) {
      {}
    } else {
      stryCov_9fa48("11468");
      this.cdcIntegrationService = stryMutAct_9fa48("11471") ? cdcIntegrationService && null : stryMutAct_9fa48("11470") ? false : stryMutAct_9fa48("11469") ? true : (stryCov_9fa48("11469", "11470", "11471"), cdcIntegrationService || null);
      if (stryMutAct_9fa48("11474") ? this.authoritativeControlPlaneView || this.authoritativeControlPlaneView.cdcIntegrationService !== this.cdcIntegrationService : stryMutAct_9fa48("11473") ? false : stryMutAct_9fa48("11472") ? true : (stryCov_9fa48("11472", "11473", "11474"), this.authoritativeControlPlaneView && (stryMutAct_9fa48("11476") ? this.authoritativeControlPlaneView.cdcIntegrationService === this.cdcIntegrationService : stryMutAct_9fa48("11475") ? true : (stryCov_9fa48("11475", "11476"), this.authoritativeControlPlaneView.cdcIntegrationService !== this.cdcIntegrationService)))) {
        if (stryMutAct_9fa48("11477")) {
          {}
        } else {
          stryCov_9fa48("11477");
          this.authoritativeControlPlaneView = null;
        }
      }
    }
  }

  /**
   * Resolve the canonical CDC integration dependency used by bootstrap-owned
   * control-plane reads, writes, and cache repair.
   * @return {Object|null}
   * @private
   */
  getCdcIntegrationService() {
    if (stryMutAct_9fa48("11478")) {
      {}
    } else {
      stryCov_9fa48("11478");
      return stryMutAct_9fa48("11481") ? (this.cdcIntegrationService || this.runtimeOwner?.cdcIntegrationService) && null : stryMutAct_9fa48("11480") ? false : stryMutAct_9fa48("11479") ? true : (stryCov_9fa48("11479", "11480", "11481"), (stryMutAct_9fa48("11483") ? this.cdcIntegrationService && this.runtimeOwner?.cdcIntegrationService : stryMutAct_9fa48("11482") ? false : (stryCov_9fa48("11482", "11483"), this.cdcIntegrationService || (stryMutAct_9fa48("11484") ? this.runtimeOwner.cdcIntegrationService : (stryCov_9fa48("11484"), this.runtimeOwner?.cdcIntegrationService)))) || null);
    }
  }

  /**
   * Resolve the live system-table cache for bootstrap-owned reads.
   * Prefer the explicitly hydrated cache, then fall back to the runtime owner
   * or legacy startup adapter when the bootstrap API outlives startup wiring.
   * @return {Object|null}
   * @private
   */
  getSystemTableCache() {
    if (stryMutAct_9fa48("11485")) {
      {}
    } else {
      stryCov_9fa48("11485");
      return stryMutAct_9fa48("11488") ? (this.systemTableCache || this.runtimeOwner?.systemTableCache || this.bootstrapStartupAdapter?.getSystemTableCache?.() || this.bootstrapStartupAdapter?.systemTableCache) && null : stryMutAct_9fa48("11487") ? false : stryMutAct_9fa48("11486") ? true : (stryCov_9fa48("11486", "11487", "11488"), (stryMutAct_9fa48("11490") ? (this.systemTableCache || this.runtimeOwner?.systemTableCache || this.bootstrapStartupAdapter?.getSystemTableCache?.()) && this.bootstrapStartupAdapter?.systemTableCache : stryMutAct_9fa48("11489") ? false : (stryCov_9fa48("11489", "11490"), (stryMutAct_9fa48("11492") ? (this.systemTableCache || this.runtimeOwner?.systemTableCache) && this.bootstrapStartupAdapter?.getSystemTableCache?.() : stryMutAct_9fa48("11491") ? false : (stryCov_9fa48("11491", "11492"), (stryMutAct_9fa48("11494") ? this.systemTableCache && this.runtimeOwner?.systemTableCache : stryMutAct_9fa48("11493") ? false : (stryCov_9fa48("11493", "11494"), this.systemTableCache || (stryMutAct_9fa48("11495") ? this.runtimeOwner.systemTableCache : (stryCov_9fa48("11495"), this.runtimeOwner?.systemTableCache)))) || (stryMutAct_9fa48("11497") ? this.bootstrapStartupAdapter.getSystemTableCache?.() : stryMutAct_9fa48("11496") ? this.bootstrapStartupAdapter?.getSystemTableCache() : (stryCov_9fa48("11496", "11497"), this.bootstrapStartupAdapter?.getSystemTableCache?.())))) || (stryMutAct_9fa48("11498") ? this.bootstrapStartupAdapter.systemTableCache : (stryCov_9fa48("11498"), this.bootstrapStartupAdapter?.systemTableCache)))) || null);
    }
  }

  /**
   * Execute one bootstrap-owned control-plane query using
   * control-plane-recovery eligibility semantics.
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @return {Promise<Object>}
   * @private
   */
  async executeBootstrapControlPlaneQuery(sql, params = stryMutAct_9fa48("11499") ? ["Stryker was here"] : (stryCov_9fa48("11499"), [])) {
    if (stryMutAct_9fa48("11500")) {
      {}
    } else {
      stryCov_9fa48("11500");
      const controlPlaneSystemTableGateway = this.getControlPlaneSystemTableGateway();
      if (stryMutAct_9fa48("11503") ? !controlPlaneSystemTableGateway && typeof controlPlaneSystemTableGateway.executeQuery !== TYPEOF.FUNCTION : stryMutAct_9fa48("11502") ? false : stryMutAct_9fa48("11501") ? true : (stryCov_9fa48("11501", "11502", "11503"), (stryMutAct_9fa48("11504") ? controlPlaneSystemTableGateway : (stryCov_9fa48("11504"), !controlPlaneSystemTableGateway)) || (stryMutAct_9fa48("11506") ? typeof controlPlaneSystemTableGateway.executeQuery === TYPEOF.FUNCTION : stryMutAct_9fa48("11505") ? false : (stryCov_9fa48("11505", "11506"), typeof controlPlaneSystemTableGateway.executeQuery !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("11507")) {
          {}
        } else {
          stryCov_9fa48("11507");
          throw new Error(BOOTSTRAP_API_ERROR.SQL_ENGINE_UNAVAILABLE);
        }
      }
      return controlPlaneSystemTableGateway.executeQuery(sql, params, stryMutAct_9fa48("11508") ? {} : (stryCov_9fa48("11508"), {
        owner: BOOTSTRAP_API_SUBSYSTEM,
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        deliveryPriority: stryMutAct_9fa48("11509") ? "" : (stryCov_9fa48("11509"), 'critical'),
        enforcePressureAdmission: stryMutAct_9fa48("11510") ? false : (stryCov_9fa48("11510"), true),
        allowPressureDefer: stryMutAct_9fa48("11511") ? false : (stryCov_9fa48("11511"), true),
        allowPressureDegrade: stryMutAct_9fa48("11512") ? true : (stryCov_9fa48("11512"), false),
        pressureRetryAfterMs: this.bootstrapAdmissionRetryAfterMs,
        routingReadinessDimension: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
      }));
    }
  }

  /**
   * Execute one bootstrap-owned control-plane mutation through the canonical
   * gateway mutation ingress.
   * @param {Object} mutation
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  async executeBootstrapControlPlaneMutation(mutation, options = {}) {
    if (stryMutAct_9fa48("11513")) {
      {}
    } else {
      stryCov_9fa48("11513");
      const controlPlaneSystemTableGateway = this.getControlPlaneSystemTableGateway();
      if (stryMutAct_9fa48("11516") ? !controlPlaneSystemTableGateway && typeof controlPlaneSystemTableGateway.submitMutation !== TYPEOF.FUNCTION : stryMutAct_9fa48("11515") ? false : stryMutAct_9fa48("11514") ? true : (stryCov_9fa48("11514", "11515", "11516"), (stryMutAct_9fa48("11517") ? controlPlaneSystemTableGateway : (stryCov_9fa48("11517"), !controlPlaneSystemTableGateway)) || (stryMutAct_9fa48("11519") ? typeof controlPlaneSystemTableGateway.submitMutation === TYPEOF.FUNCTION : stryMutAct_9fa48("11518") ? false : (stryCov_9fa48("11518", "11519"), typeof controlPlaneSystemTableGateway.submitMutation !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("11520")) {
          {}
        } else {
          stryCov_9fa48("11520");
          throw new Error(BOOTSTRAP_API_ERROR.SQL_ENGINE_UNAVAILABLE);
        }
      }
      return controlPlaneSystemTableGateway.submitMutation(mutation, stryMutAct_9fa48("11521") ? {} : (stryCov_9fa48("11521"), {
        owner: BOOTSTRAP_API_SUBSYSTEM,
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        deliveryPriority: stryMutAct_9fa48("11522") ? "" : (stryCov_9fa48("11522"), 'critical'),
        allowPressureDefer: stryMutAct_9fa48("11523") ? false : (stryCov_9fa48("11523"), true),
        allowPressureDegrade: stryMutAct_9fa48("11524") ? true : (stryCov_9fa48("11524"), false),
        pressureRetryAfterMs: this.bootstrapAdmissionRetryAfterMs,
        phaseScope: CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP,
        routingReadinessDimension: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        ...options
      }));
    }
  }

  /**
   * Resolve the canonical shared-metadata query gateway for bootstrap-owned
   * control-plane reads and writes.
   * @return {ControlPlaneSystemTableGateway|null}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("11525")) {
      {}
    } else {
      stryCov_9fa48("11525");
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Determine whether one bootstrap-owned control-plane query failure should
   * slow producers down with a typed retry surface rather than surfacing as
   * a terminal internal error.
   * @param {Object|null} result
   * @return {boolean}
   * @private
   */
  isRetryableBootstrapControlPlaneQueryFailure(result) {
    if (stryMutAct_9fa48("11526")) {
      {}
    } else {
      stryCov_9fa48("11526");
      if (stryMutAct_9fa48("11529") ? !result && result.success !== false : stryMutAct_9fa48("11528") ? false : stryMutAct_9fa48("11527") ? true : (stryCov_9fa48("11527", "11528", "11529"), (stryMutAct_9fa48("11530") ? result : (stryCov_9fa48("11530"), !result)) || (stryMutAct_9fa48("11532") ? result.success === false : stryMutAct_9fa48("11531") ? false : (stryCov_9fa48("11531", "11532"), result.success !== (stryMutAct_9fa48("11533") ? true : (stryCov_9fa48("11533"), false)))))) {
        if (stryMutAct_9fa48("11534")) {
          {}
        } else {
          stryCov_9fa48("11534");
          return stryMutAct_9fa48("11535") ? true : (stryCov_9fa48("11535"), false);
        }
      }
      return isRetryableControlPlaneError(result);
    }
  }

  /**
   * Build one typed retry/defer error for bootstrap-owned control-plane query
   * failures.
   * @param {Object} result
   * @param {string} fallbackMessage
   * @return {Error}
   * @private
   */
  buildBootstrapControlPlaneQueryError(result, fallbackMessage) {
    if (stryMutAct_9fa48("11536")) {
      {}
    } else {
      stryCov_9fa48("11536");
      const message = (stryMutAct_9fa48("11539") ? typeof result?.error === TYPEOF.STRING || result.error.length > NUM.ZERO : stryMutAct_9fa48("11538") ? false : stryMutAct_9fa48("11537") ? true : (stryCov_9fa48("11537", "11538", "11539"), (stryMutAct_9fa48("11541") ? typeof result?.error !== TYPEOF.STRING : stryMutAct_9fa48("11540") ? true : (stryCov_9fa48("11540", "11541"), typeof (stryMutAct_9fa48("11542") ? result.error : (stryCov_9fa48("11542"), result?.error)) === TYPEOF.STRING)) && (stryMutAct_9fa48("11545") ? result.error.length <= NUM.ZERO : stryMutAct_9fa48("11544") ? result.error.length >= NUM.ZERO : stryMutAct_9fa48("11543") ? true : (stryCov_9fa48("11543", "11544", "11545"), result.error.length > NUM.ZERO)))) ? result.error : fallbackMessage;
      if (stryMutAct_9fa48("11547") ? false : stryMutAct_9fa48("11546") ? true : (stryCov_9fa48("11546", "11547"), this.isRetryableBootstrapControlPlaneQueryFailure(result))) {
        if (stryMutAct_9fa48("11548")) {
          {}
        } else {
          stryCov_9fa48("11548");
          const error = new Error(message);
          error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
          error.errorCode = (stryMutAct_9fa48("11551") ? typeof result?.errorCode === TYPEOF.STRING || result.errorCode.length > NUM.ZERO : stryMutAct_9fa48("11550") ? false : stryMutAct_9fa48("11549") ? true : (stryCov_9fa48("11549", "11550", "11551"), (stryMutAct_9fa48("11553") ? typeof result?.errorCode !== TYPEOF.STRING : stryMutAct_9fa48("11552") ? true : (stryCov_9fa48("11552", "11553"), typeof (stryMutAct_9fa48("11554") ? result.errorCode : (stryCov_9fa48("11554"), result?.errorCode)) === TYPEOF.STRING)) && (stryMutAct_9fa48("11557") ? result.errorCode.length <= NUM.ZERO : stryMutAct_9fa48("11556") ? result.errorCode.length >= NUM.ZERO : stryMutAct_9fa48("11555") ? true : (stryCov_9fa48("11555", "11556", "11557"), result.errorCode.length > NUM.ZERO)))) ? result.errorCode : BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY;
          const retryAfterMs = Number.isFinite(stryMutAct_9fa48("11558") ? result.retryAfterMs : (stryCov_9fa48("11558"), result?.retryAfterMs)) ? stryMutAct_9fa48("11559") ? Math.min(NUM.ZERO, Math.floor(result.retryAfterMs)) : (stryCov_9fa48("11559"), Math.max(NUM.ZERO, Math.floor(result.retryAfterMs))) : this.bootstrapAdmissionRetryAfterMs;
          error.retryAfterMs = retryAfterMs;
          const pressure = (stryMutAct_9fa48("11562") ? (typeof result?.pressureAction === TYPEOF.STRING && result.pressureAction.length > NUM.ZERO || typeof result?.pressureReason === TYPEOF.STRING && result.pressureReason.length > NUM.ZERO) && typeof result?.pressureSummary === TYPEOF.STRING && result.pressureSummary.length > NUM.ZERO : stryMutAct_9fa48("11561") ? false : stryMutAct_9fa48("11560") ? true : (stryCov_9fa48("11560", "11561", "11562"), (stryMutAct_9fa48("11564") ? typeof result?.pressureAction === TYPEOF.STRING && result.pressureAction.length > NUM.ZERO && typeof result?.pressureReason === TYPEOF.STRING && result.pressureReason.length > NUM.ZERO : stryMutAct_9fa48("11563") ? false : (stryCov_9fa48("11563", "11564"), (stryMutAct_9fa48("11566") ? typeof result?.pressureAction === TYPEOF.STRING || result.pressureAction.length > NUM.ZERO : stryMutAct_9fa48("11565") ? false : (stryCov_9fa48("11565", "11566"), (stryMutAct_9fa48("11568") ? typeof result?.pressureAction !== TYPEOF.STRING : stryMutAct_9fa48("11567") ? true : (stryCov_9fa48("11567", "11568"), typeof (stryMutAct_9fa48("11569") ? result.pressureAction : (stryCov_9fa48("11569"), result?.pressureAction)) === TYPEOF.STRING)) && (stryMutAct_9fa48("11572") ? result.pressureAction.length <= NUM.ZERO : stryMutAct_9fa48("11571") ? result.pressureAction.length >= NUM.ZERO : stryMutAct_9fa48("11570") ? true : (stryCov_9fa48("11570", "11571", "11572"), result.pressureAction.length > NUM.ZERO)))) || (stryMutAct_9fa48("11574") ? typeof result?.pressureReason === TYPEOF.STRING || result.pressureReason.length > NUM.ZERO : stryMutAct_9fa48("11573") ? false : (stryCov_9fa48("11573", "11574"), (stryMutAct_9fa48("11576") ? typeof result?.pressureReason !== TYPEOF.STRING : stryMutAct_9fa48("11575") ? true : (stryCov_9fa48("11575", "11576"), typeof (stryMutAct_9fa48("11577") ? result.pressureReason : (stryCov_9fa48("11577"), result?.pressureReason)) === TYPEOF.STRING)) && (stryMutAct_9fa48("11580") ? result.pressureReason.length <= NUM.ZERO : stryMutAct_9fa48("11579") ? result.pressureReason.length >= NUM.ZERO : stryMutAct_9fa48("11578") ? true : (stryCov_9fa48("11578", "11579", "11580"), result.pressureReason.length > NUM.ZERO)))))) || (stryMutAct_9fa48("11582") ? typeof result?.pressureSummary === TYPEOF.STRING || result.pressureSummary.length > NUM.ZERO : stryMutAct_9fa48("11581") ? false : (stryCov_9fa48("11581", "11582"), (stryMutAct_9fa48("11584") ? typeof result?.pressureSummary !== TYPEOF.STRING : stryMutAct_9fa48("11583") ? true : (stryCov_9fa48("11583", "11584"), typeof (stryMutAct_9fa48("11585") ? result.pressureSummary : (stryCov_9fa48("11585"), result?.pressureSummary)) === TYPEOF.STRING)) && (stryMutAct_9fa48("11588") ? result.pressureSummary.length <= NUM.ZERO : stryMutAct_9fa48("11587") ? result.pressureSummary.length >= NUM.ZERO : stryMutAct_9fa48("11586") ? true : (stryCov_9fa48("11586", "11587", "11588"), result.pressureSummary.length > NUM.ZERO)))))) ? Object.freeze(stryMutAct_9fa48("11589") ? {} : (stryCov_9fa48("11589"), {
            state: stryMutAct_9fa48("11590") ? "" : (stryCov_9fa48("11590"), 'present'),
            ...((stryMutAct_9fa48("11593") ? typeof result?.pressureAction === TYPEOF.STRING || result.pressureAction.length > NUM.ZERO : stryMutAct_9fa48("11592") ? false : stryMutAct_9fa48("11591") ? true : (stryCov_9fa48("11591", "11592", "11593"), (stryMutAct_9fa48("11595") ? typeof result?.pressureAction !== TYPEOF.STRING : stryMutAct_9fa48("11594") ? true : (stryCov_9fa48("11594", "11595"), typeof (stryMutAct_9fa48("11596") ? result.pressureAction : (stryCov_9fa48("11596"), result?.pressureAction)) === TYPEOF.STRING)) && (stryMutAct_9fa48("11599") ? result.pressureAction.length <= NUM.ZERO : stryMutAct_9fa48("11598") ? result.pressureAction.length >= NUM.ZERO : stryMutAct_9fa48("11597") ? true : (stryCov_9fa48("11597", "11598", "11599"), result.pressureAction.length > NUM.ZERO)))) ? stryMutAct_9fa48("11600") ? {} : (stryCov_9fa48("11600"), {
              action: result.pressureAction
            }) : {}),
            ...((stryMutAct_9fa48("11603") ? typeof result?.pressureReason === TYPEOF.STRING || result.pressureReason.length > NUM.ZERO : stryMutAct_9fa48("11602") ? false : stryMutAct_9fa48("11601") ? true : (stryCov_9fa48("11601", "11602", "11603"), (stryMutAct_9fa48("11605") ? typeof result?.pressureReason !== TYPEOF.STRING : stryMutAct_9fa48("11604") ? true : (stryCov_9fa48("11604", "11605"), typeof (stryMutAct_9fa48("11606") ? result.pressureReason : (stryCov_9fa48("11606"), result?.pressureReason)) === TYPEOF.STRING)) && (stryMutAct_9fa48("11609") ? result.pressureReason.length <= NUM.ZERO : stryMutAct_9fa48("11608") ? result.pressureReason.length >= NUM.ZERO : stryMutAct_9fa48("11607") ? true : (stryCov_9fa48("11607", "11608", "11609"), result.pressureReason.length > NUM.ZERO)))) ? stryMutAct_9fa48("11610") ? {} : (stryCov_9fa48("11610"), {
              reason: result.pressureReason
            }) : {}),
            ...((stryMutAct_9fa48("11613") ? typeof result?.pressureSummary === TYPEOF.STRING || result.pressureSummary.length > NUM.ZERO : stryMutAct_9fa48("11612") ? false : stryMutAct_9fa48("11611") ? true : (stryCov_9fa48("11611", "11612", "11613"), (stryMutAct_9fa48("11615") ? typeof result?.pressureSummary !== TYPEOF.STRING : stryMutAct_9fa48("11614") ? true : (stryCov_9fa48("11614", "11615"), typeof (stryMutAct_9fa48("11616") ? result.pressureSummary : (stryCov_9fa48("11616"), result?.pressureSummary)) === TYPEOF.STRING)) && (stryMutAct_9fa48("11619") ? result.pressureSummary.length <= NUM.ZERO : stryMutAct_9fa48("11618") ? result.pressureSummary.length >= NUM.ZERO : stryMutAct_9fa48("11617") ? true : (stryCov_9fa48("11617", "11618", "11619"), result.pressureSummary.length > NUM.ZERO)))) ? stryMutAct_9fa48("11620") ? {} : (stryCov_9fa48("11620"), {
              summary: result.pressureSummary
            }) : {})
          })) : Object.freeze(stryMutAct_9fa48("11621") ? {} : (stryCov_9fa48("11621"), {
            state: stryMutAct_9fa48("11622") ? "" : (stryCov_9fa48("11622"), 'none')
          }));
          error.details = stryMutAct_9fa48("11623") ? {} : (stryCov_9fa48("11623"), {
            pressure,
            ...((stryMutAct_9fa48("11626") ? pressure.state === 'present' || pressure.action : stryMutAct_9fa48("11625") ? false : stryMutAct_9fa48("11624") ? true : (stryCov_9fa48("11624", "11625", "11626"), (stryMutAct_9fa48("11628") ? pressure.state !== 'present' : stryMutAct_9fa48("11627") ? true : (stryCov_9fa48("11627", "11628"), pressure.state === (stryMutAct_9fa48("11629") ? "" : (stryCov_9fa48("11629"), 'present')))) && pressure.action)) ? stryMutAct_9fa48("11630") ? {} : (stryCov_9fa48("11630"), {
              pressureAction: pressure.action
            }) : {}),
            ...((stryMutAct_9fa48("11633") ? pressure.state === 'present' || pressure.reason : stryMutAct_9fa48("11632") ? false : stryMutAct_9fa48("11631") ? true : (stryCov_9fa48("11631", "11632", "11633"), (stryMutAct_9fa48("11635") ? pressure.state !== 'present' : stryMutAct_9fa48("11634") ? true : (stryCov_9fa48("11634", "11635"), pressure.state === (stryMutAct_9fa48("11636") ? "" : (stryCov_9fa48("11636"), 'present')))) && pressure.reason)) ? stryMutAct_9fa48("11637") ? {} : (stryCov_9fa48("11637"), {
              pressureReason: pressure.reason
            }) : {}),
            ...((stryMutAct_9fa48("11640") ? pressure.state === 'present' || pressure.summary : stryMutAct_9fa48("11639") ? false : stryMutAct_9fa48("11638") ? true : (stryCov_9fa48("11638", "11639", "11640"), (stryMutAct_9fa48("11642") ? pressure.state !== 'present' : stryMutAct_9fa48("11641") ? true : (stryCov_9fa48("11641", "11642"), pressure.state === (stryMutAct_9fa48("11643") ? "" : (stryCov_9fa48("11643"), 'present')))) && pressure.summary)) ? stryMutAct_9fa48("11644") ? {} : (stryCov_9fa48("11644"), {
              pressureSummary: pressure.summary
            }) : {}),
            ...((stryMutAct_9fa48("11647") ? typeof result?.tableName === TYPEOF.STRING || result.tableName.length > NUM.ZERO : stryMutAct_9fa48("11646") ? false : stryMutAct_9fa48("11645") ? true : (stryCov_9fa48("11645", "11646", "11647"), (stryMutAct_9fa48("11649") ? typeof result?.tableName !== TYPEOF.STRING : stryMutAct_9fa48("11648") ? true : (stryCov_9fa48("11648", "11649"), typeof (stryMutAct_9fa48("11650") ? result.tableName : (stryCov_9fa48("11650"), result?.tableName)) === TYPEOF.STRING)) && (stryMutAct_9fa48("11653") ? result.tableName.length <= NUM.ZERO : stryMutAct_9fa48("11652") ? result.tableName.length >= NUM.ZERO : stryMutAct_9fa48("11651") ? true : (stryCov_9fa48("11651", "11652", "11653"), result.tableName.length > NUM.ZERO)))) ? stryMutAct_9fa48("11654") ? {} : (stryCov_9fa48("11654"), {
              tableName: result.tableName
            }) : {})
          });
          return error;
        }
      }
      return new Error(message);
    }
  }

  /**
   * Initialize and start the API server.
   * @param {number} port - Port to listen on (optional, 0 for random port).
   * @param {Object} [options] - Initialization options.
   * @param {boolean} [options.listen] - Whether to listen on a TCP port.
   * @return {Promise<void>}
   */
  async initialize(port, options = {}) {
    if (stryMutAct_9fa48("11655")) {
      {}
    } else {
      stryCov_9fa48("11655");
      if (stryMutAct_9fa48("11657") ? false : stryMutAct_9fa48("11656") ? true : (stryCov_9fa48("11656", "11657"), this.initialized)) {
        if (stryMutAct_9fa48("11658")) {
          {}
        } else {
          stryCov_9fa48("11658");
          return;
        }
      }

      // Use provided port (including 0 for random), or fall back to configured port
      const listenPort = (stryMutAct_9fa48("11661") ? port === undefined : stryMutAct_9fa48("11660") ? false : stryMutAct_9fa48("11659") ? true : (stryCov_9fa48("11659", "11660", "11661"), port !== undefined)) ? port : this.port;
      const shouldListen = stryMutAct_9fa48("11664") ? options.listen === false : stryMutAct_9fa48("11663") ? false : stryMutAct_9fa48("11662") ? true : (stryCov_9fa48("11662", "11663", "11664"), options.listen !== (stryMutAct_9fa48("11665") ? true : (stryCov_9fa48("11665"), false)));
      this.fastify = Fastify(stryMutAct_9fa48("11666") ? {} : (stryCov_9fa48("11666"), {
        logger: stryMutAct_9fa48("11667") ? true : (stryCov_9fa48("11667"), false) // We use our own logger
      }));
      this.startMoveReplicaAssignmentSweep();

      // Register routes
      this.registerRoutes();

      // Start server if required
      if (stryMutAct_9fa48("11669") ? false : stryMutAct_9fa48("11668") ? true : (stryCov_9fa48("11668", "11669"), shouldListen)) {
        if (stryMutAct_9fa48("11670")) {
          {}
        } else {
          stryCov_9fa48("11670");
          try {
            if (stryMutAct_9fa48("11671")) {
              {}
            } else {
              stryCov_9fa48("11671");
              await this.fastify.listen(stryMutAct_9fa48("11672") ? {} : (stryCov_9fa48("11672"), {
                port: listenPort,
                host: HOST.ANY
              }));
            }
          } catch (err) {
            if (stryMutAct_9fa48("11673")) {
              {}
            } else {
              stryCov_9fa48("11673");
              // Some sandboxes disallow binding to 0.0.0.0; fall back to localhost.
              if (stryMutAct_9fa48("11676") ? err || err.code === ERRNO.EPERM || err.code === ERRNO.EACCES : stryMutAct_9fa48("11675") ? false : stryMutAct_9fa48("11674") ? true : (stryCov_9fa48("11674", "11675", "11676"), err && (stryMutAct_9fa48("11678") ? err.code === ERRNO.EPERM && err.code === ERRNO.EACCES : stryMutAct_9fa48("11677") ? true : (stryCov_9fa48("11677", "11678"), (stryMutAct_9fa48("11680") ? err.code !== ERRNO.EPERM : stryMutAct_9fa48("11679") ? false : (stryCov_9fa48("11679", "11680"), err.code === ERRNO.EPERM)) || (stryMutAct_9fa48("11682") ? err.code !== ERRNO.EACCES : stryMutAct_9fa48("11681") ? false : (stryCov_9fa48("11681", "11682"), err.code === ERRNO.EACCES)))))) {
                if (stryMutAct_9fa48("11683")) {
                  {}
                } else {
                  stryCov_9fa48("11683");
                  await this.fastify.listen(stryMutAct_9fa48("11684") ? {} : (stryCov_9fa48("11684"), {
                    port: listenPort,
                    host: HOST.LOCALHOST
                  }));
                }
              } else {
                if (stryMutAct_9fa48("11685")) {
                  {}
                } else {
                  stryCov_9fa48("11685");
                  throw err;
                }
              }
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("11686")) {
          {}
        } else {
          stryCov_9fa48("11686");
          await this.fastify.ready();
        }
      }
      this.initialized = stryMutAct_9fa48("11687") ? false : (stryCov_9fa48("11687"), true);
      this.logger.info(BOOTSTRAP_API_LOG_MSG.STARTED, stryMutAct_9fa48("11688") ? {} : (stryCov_9fa48("11688"), {
        port: shouldListen ? listenPort : null,
        listen: shouldListen,
        seedNodeId: this.seedNodeId
      }));
    }
  }

  /**
   * Register API routes.
   * @private
   */
  registerRoutes() {
    if (stryMutAct_9fa48("11689")) {
      {}
    } else {
      stryCov_9fa48("11689");
      // Process liveness probe (does not assert join readiness).
      this.fastify.get(BOOTSTRAP_API_ROUTE.LIVEZ, async (_request, reply) => {
        if (stryMutAct_9fa48("11690")) {
          {}
        } else {
          stryCov_9fa48("11690");
          return this.handleLivenessProbeRequest(reply);
        }
      });

      // One-time startup completion probe.
      this.fastify.get(BOOTSTRAP_API_ROUTE.STARTUPZ, async (_request, reply) => {
        if (stryMutAct_9fa48("11691")) {
          {}
        } else {
          stryCov_9fa48("11691");
          return this.handleStartupProbeRequest(reply);
        }
      });

      // Readiness probe for join/admin traffic.
      this.fastify.get(BOOTSTRAP_API_ROUTE.READYZ, async (_request, reply) => {
        if (stryMutAct_9fa48("11692")) {
          {}
        } else {
          stryCov_9fa48("11692");
          return this.handleReadinessProbeRequest(reply);
        }
      });

      // Lightweight bootstrap-join readiness probe.
      this.fastify.get(BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY, async (_request, reply) => {
        if (stryMutAct_9fa48("11693")) {
          {}
        } else {
          stryCov_9fa48("11693");
          return this.handleBootstrapReadinessProbeRequest(reply);
        }
      });

      // Health check endpoint
      this.fastify.get(BOOTSTRAP_API_ROUTE.HEALTH, async (_request, reply) => {
        if (stryMutAct_9fa48("11694")) {
          {}
        } else {
          stryCov_9fa48("11694");
          if (stryMutAct_9fa48("11697") ? false : stryMutAct_9fa48("11696") ? true : stryMutAct_9fa48("11695") ? this.sqlQueryEngine : (stryCov_9fa48("11695", "11696", "11697"), !this.sqlQueryEngine)) {
            if (stryMutAct_9fa48("11698")) {
              {}
            } else {
              stryCov_9fa48("11698");
              this.logger.debug(stryMutAct_9fa48("11699") ? "" : (stryCov_9fa48("11699"), 'metrics.bootstrap_api.health.initializing'), stryMutAct_9fa48("11700") ? {} : (stryCov_9fa48("11700"), {
                seedNodeId: this.seedNodeId,
                sqlEngineReady: stryMutAct_9fa48("11701") ? true : (stryCov_9fa48("11701"), false)
              }));
              reply.code(HTTP_STATUS.OK);
              return stryMutAct_9fa48("11702") ? {} : (stryCov_9fa48("11702"), {
                status: BOOTSTRAP_API_HEALTH_STATUS_INITIALIZING,
                nodeId: this.seedNodeId,
                ready: stryMutAct_9fa48("11703") ? true : (stryCov_9fa48("11703"), false)
              });
            }
          }
          return stryMutAct_9fa48("11704") ? {} : (stryCov_9fa48("11704"), {
            status: BOOTSTRAP_API_HEALTH_STATUS,
            nodeId: this.seedNodeId,
            ready: stryMutAct_9fa48("11705") ? false : (stryCov_9fa48("11705"), true)
          });
        }
      });

      // Bootstrap endpoint for new node registration
      this.fastify.post(BOOTSTRAP_API_ROUTE.BOOTSTRAP, async (request, reply) => {
        if (stryMutAct_9fa48("11706")) {
          {}
        } else {
          stryCov_9fa48("11706");
          return this.handleBootstrapRequest(request, reply);
        }
      });

      // Register service endpoint - inserts service into services system table
      this.fastify.post(BOOTSTRAP_API_ROUTE.REGISTER_SERVICE, async (request, reply) => {
        if (stryMutAct_9fa48("11707")) {
          {}
        } else {
          stryCov_9fa48("11707");
          return this.handleRegisterServiceRequest(request, reply);
        }
      });

      // Get cluster state endpoint
      this.fastify.get(BOOTSTRAP_API_ROUTE.CLUSTER_STATE, async (_request, _reply) => {
        if (stryMutAct_9fa48("11708")) {
          {}
        } else {
          stryCov_9fa48("11708");
          return this.getClusterState();
        }
      });
    }
  }

  /**
   * Handle process liveness probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleLivenessProbeRequest(reply) {
    if (stryMutAct_9fa48("11709")) {
      {}
    } else {
      stryCov_9fa48("11709");
      return this.bootstrapReadinessOwner.handleLivenessProbeRequest(reply);
    }
  }

  /**
   * Handle startup completion probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleStartupProbeRequest(reply) {
    if (stryMutAct_9fa48("11710")) {
      {}
    } else {
      stryCov_9fa48("11710");
      return this.bootstrapReadinessOwner.handleStartupProbeRequest(reply);
    }
  }

  /**
   * Handle general readiness probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleReadinessProbeRequest(reply) {
    if (stryMutAct_9fa48("11711")) {
      {}
    } else {
      stryCov_9fa48("11711");
      return this.bootstrapReadinessOwner.handleReadinessProbeRequest(reply);
    }
  }

  /**
   * Handle lightweight bootstrap-join readiness probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleBootstrapReadinessProbeRequest(reply) {
    if (stryMutAct_9fa48("11712")) {
      {}
    } else {
      stryCov_9fa48("11712");
      return this.bootstrapReadinessOwner.handleBootstrapReadinessProbeRequest(reply);
    }
  }

  /**
   * Resolve readiness projection for one probe scope.
   * @param {Object} snapshot
   * @param {string} scope
   * @return {Object}
   */
  resolveReadinessSnapshotForScope(snapshot, scope) {
    if (stryMutAct_9fa48("11713")) {
      {}
    } else {
      stryCov_9fa48("11713");
      return this.bootstrapReadinessOwner.resolveReadinessSnapshotForScope(snapshot, scope);
    }
  }

  /**
   * Determine whether bootstrap join scope can project ready=true.
   * @param {Object} snapshot
   * @param {Array<string>} reasons
   * @param {Array<string>} blockingReasons
   * @return {boolean}
   */
  canProjectBootstrapJoinReadiness(snapshot, reasons, blockingReasons) {
    if (stryMutAct_9fa48("11714")) {
      {}
    } else {
      stryCov_9fa48("11714");
      return this.bootstrapReadinessOwner.canProjectBootstrapJoinReadiness(snapshot, reasons, blockingReasons);
    }
  }

  /**
   * Build canonical readiness probe response body.
   * @param {Object} snapshot - Current readiness snapshot.
   * @param {Object} options
   * @param {string} [options.scope] - Optional readiness scope.
   * @return {Object}
   */
  buildReadinessProbeResponse(snapshot, options = {}) {
    if (stryMutAct_9fa48("11715")) {
      {}
    } else {
      stryCov_9fa48("11715");
      return this.bootstrapReadinessOwner.buildReadinessProbeResponse(snapshot, options);
    }
  }

  /**
   * Evaluate readiness owner after updating dependency signals.
   * @return {Object} Current readiness snapshot.
   */
  evaluateReadinessSnapshot() {
    if (stryMutAct_9fa48("11716")) {
      {}
    } else {
      stryCov_9fa48("11716");
      return this.bootstrapReadinessOwner.evaluateReadinessSnapshot();
    }
  }

  /**
   * Resolve health status of background control-plane writers.
   * @return {{healthy: boolean, reasonCode: string, details: Object|null}}
   */
  getControlPlaneWriteHealth() {
    if (stryMutAct_9fa48("11717")) {
      {}
    } else {
      stryCov_9fa48("11717");
      return this.bootstrapReadinessOwner.getControlPlaneWriteHealth();
    }
  }

  /**
   * Build startup-probe reasons from readiness snapshot.
   * @param {Object} snapshot
   * @param {boolean} started
   * @return {string[]}
   */
  getStartupProbeReasons(snapshot, started) {
    if (stryMutAct_9fa48("11718")) {
      {}
    } else {
      stryCov_9fa48("11718");
      return this.bootstrapReadinessOwner.getStartupProbeReasons(snapshot, started);
    }
  }

  /**
   * Determine whether startup bootstrap has completed.
   * @return {boolean}
   */
  isStartupComplete() {
    if (stryMutAct_9fa48("11719")) {
      {}
    } else {
      stryCov_9fa48("11719");
      return this.bootstrapReadinessOwner.isStartupComplete();
    }
  }

  /**
   * Determine whether runtime wiring is available for join-safe traffic.
   * @return {boolean}
   */
  isRuntimeWiringReady() {
    if (stryMutAct_9fa48("11720")) {
      {}
    } else {
      stryCov_9fa48("11720");
      return this.bootstrapReadinessOwner.isRuntimeWiringReady();
    }
  }

  /**
   * Determine whether SQL dependency is available for bootstrap operations.
   * @return {boolean}
   */
  isSqlEngineDependencyReady() {
    if (stryMutAct_9fa48("11721")) {
      {}
    } else {
      stryCov_9fa48("11721");
      return this.bootstrapReadinessOwner.isSqlEngineDependencyReady();
    }
  }

  /**
   * Build current leader-readiness status for probe projection.
   * @return {Object}
   */
  getLeaderReadinessStatusForProbe() {
    if (stryMutAct_9fa48("11722")) {
      {}
    } else {
      stryCov_9fa48("11722");
      return this.serviceLeaderReadinessOwner.getLeaderReadinessStatusForProbe();
    }
  }

  /**
   * Record one probe response in readiness metrics when owner supports it.
   * @param {string} endpoint
   * @param {number} statusCode
   */
  recordReadinessProbeResult(endpoint, statusCode) {
    if (stryMutAct_9fa48("11723")) {
      {}
    } else {
      stryCov_9fa48("11723");
      return this.bootstrapReadinessOwner.recordReadinessProbeResult(endpoint, statusCode);
    }
  }

  /**
   * Mark lifecycle readiness as draining and immediately non-ready.
   * @param {Object} [options]
   * @param {number} [options.drainDeadlineMs]
   * @param {string} [options.reasonCode]
   * @return {Object}
   */
  markDraining(options = {}) {
    if (stryMutAct_9fa48("11724")) {
      {}
    } else {
      stryCov_9fa48("11724");
      return this.bootstrapReadinessOwner.markDraining(options);
    }
  }

  /**
   * Build standardized not-ready payload for POST /bootstrap responses.
   * Keeps compatibility fields while adding retry guidance.
   * @param {Object} options
   * @param {string} options.error
   * @param {string} options.code
   * @param {string} [options.phase]
   * @param {string} [options.reasonCode]
   * @return {Object}
   */
  buildBootstrapNotReadyResponse(options = {}) {
    if (stryMutAct_9fa48("11725")) {
      {}
    } else {
      stryCov_9fa48("11725");
      return this.bootstrapReadinessOwner.buildBootstrapNotReadyResponse(options);
    }
  }

  /**
   * Return best-effort readiness snapshot for operation diagnostics.
   * @return {Object}
   */
  getReadinessSnapshotForDiagnostics() {
    if (stryMutAct_9fa48("11726")) {
      {}
    } else {
      stryCov_9fa48("11726");
      return this.bootstrapReadinessOwner.getReadinessSnapshotForDiagnostics();
    }
  }

  /**
   * Merge readiness reasons with one required reason code.
   * @param {Array<string>} reasons
   * @param {string} reasonCode
   * @return {Array<string>}
   */
  mergeReadinessReasons(reasons, reasonCode) {
    if (stryMutAct_9fa48("11727")) {
      {}
    } else {
      stryCov_9fa48("11727");
      return this.bootstrapReadinessOwner.mergeReadinessReasons(reasons, reasonCode);
    }
  }

  /**
   * Handle bootstrap request from a new node.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<Object>} Bootstrap response.
   */
  async handleBootstrapRequest(request, reply) {
    if (stryMutAct_9fa48("11728")) {
      {}
    } else {
      stryCov_9fa48("11728");
      return this.bootstrapRequestOwner.handleBootstrapRequest(request, reply);
    }
  }

  /**
   * Handle register node request - inserts node into nodes system table.
   * Uses SQL query engine to route to the correct partition leader.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<Object>} Registration response.
   */
  async handleRegisterNodeRequest(request, reply) {
    if (stryMutAct_9fa48("11729")) {
      {}
    } else {
      stryCov_9fa48("11729");
      this.logger.warn(BOOTSTRAP_API_LOG_MSG.REGISTER_NODE_UNSUPPORTED, stryMutAct_9fa48("11730") ? {} : (stryCov_9fa48("11730"), {
        seedNodeId: this.seedNodeId
      }));
      reply.code(HTTP_STATUS.GONE);
      throw new Error(BOOTSTRAP_API_ERROR.REGISTER_NODE_UNSUPPORTED);
    }
  }

  /**
   * Handle register-service request from a joining node.
   * Inserts the service into the services system table.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<Object>} Registration response.
   */
  async handleRegisterServiceRequest(request, reply) {
    if (stryMutAct_9fa48("11731")) {
      {}
    } else {
      stryCov_9fa48("11731");
      return this.serviceRegistrationHandoffOwner.handleRegisterServiceRequest(request, reply);
    }
  }

  /**
   * Decide whether one register-service handoff failure is retryable.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  isRetryableMoveReplicaHandoffError(error) {
    if (stryMutAct_9fa48("11732")) {
      {}
    } else {
      stryCov_9fa48("11732");
      if (stryMutAct_9fa48("11735") ? false : stryMutAct_9fa48("11734") ? true : stryMutAct_9fa48("11733") ? error : (stryCov_9fa48("11733", "11734", "11735"), !error)) {
        if (stryMutAct_9fa48("11736")) {
          {}
        } else {
          stryCov_9fa48("11736");
          return stryMutAct_9fa48("11737") ? true : (stryCov_9fa48("11737"), false);
        }
      }
      if (stryMutAct_9fa48("11740") ? error?.errorCode !== BOOTSTRAP_PIPELINE_ERROR_CODE.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT : stryMutAct_9fa48("11739") ? false : stryMutAct_9fa48("11738") ? true : (stryCov_9fa48("11738", "11739", "11740"), (stryMutAct_9fa48("11741") ? error.errorCode : (stryCov_9fa48("11741"), error?.errorCode)) === BOOTSTRAP_PIPELINE_ERROR_CODE.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT)) {
        if (stryMutAct_9fa48("11742")) {
          {}
        } else {
          stryCov_9fa48("11742");
          return stryMutAct_9fa48("11743") ? false : (stryCov_9fa48("11743"), true);
        }
      }
      if (stryMutAct_9fa48("11746") ? Number.isFinite(error?.statusCode) || Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE : stryMutAct_9fa48("11745") ? false : stryMutAct_9fa48("11744") ? true : (stryCov_9fa48("11744", "11745", "11746"), Number.isFinite(stryMutAct_9fa48("11747") ? error.statusCode : (stryCov_9fa48("11747"), error?.statusCode)) && (stryMutAct_9fa48("11749") ? Math.floor(error.statusCode) !== HTTP_STATUS.SERVICE_UNAVAILABLE : stryMutAct_9fa48("11748") ? true : (stryCov_9fa48("11748", "11749"), Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE)))) {
        if (stryMutAct_9fa48("11750")) {
          {}
        } else {
          stryCov_9fa48("11750");
          return stryMutAct_9fa48("11751") ? false : (stryCov_9fa48("11751"), true);
        }
      }
      return Number.isFinite(stryMutAct_9fa48("11752") ? error.retryAfterMs : (stryCov_9fa48("11752"), error?.retryAfterMs));
    }
  }

  /**
   * Decide whether a MOVE_REPLICA handoff must remain active after a
   * retryable target-registration failure.
   * @param {Object|null} handoffContext
   * @param {Error} error
   * @param {boolean} sourceRemovalCompleted
   * @return {boolean}
   * @private
   */
  shouldPreserveMoveReplicaHandoffReservation(handoffContext, error, sourceRemovalCompleted) {
    if (stryMutAct_9fa48("11753")) {
      {}
    } else {
      stryCov_9fa48("11753");
      return this.moveReplicaHandoffOwner.shouldPreserveMoveReplicaHandoffReservation(handoffContext, error, sourceRemovalCompleted);
    }
  }

  /**
   * Build canonical expected service row data for registration visibility checks.
   * @param {Object} serviceData - register-service payload.
   * @return {Object} Expected service row shape in system cache.
   * @private
   */
  buildExpectedRegisteredServiceData(serviceData) {
    if (stryMutAct_9fa48("11754")) {
      {}
    } else {
      stryCov_9fa48("11754");
      const serviceId = serviceData[COLUMN.SERVICE_ID];
      return stryMutAct_9fa48("11755") ? {} : (stryCov_9fa48("11755"), {
        [COLUMN.SERVICE_ID]: serviceId,
        [COLUMN.SERVICE_TYPE]: serviceData[COLUMN.SERVICE_TYPE],
        [COLUMN.NODE_ID]: serviceData[COLUMN.NODE_ID],
        [COLUMN.GROUP_ID]: stryMutAct_9fa48("11758") ? serviceData[COLUMN.GROUP_ID] && null : stryMutAct_9fa48("11757") ? false : stryMutAct_9fa48("11756") ? true : (stryCov_9fa48("11756", "11757", "11758"), serviceData[COLUMN.GROUP_ID] || null),
        [COLUMN.REPLICA_ID]: stryMutAct_9fa48("11761") ? serviceData[COLUMN.REPLICA_ID] && serviceId : stryMutAct_9fa48("11760") ? false : stryMutAct_9fa48("11759") ? true : (stryCov_9fa48("11759", "11760", "11761"), serviceData[COLUMN.REPLICA_ID] || serviceId),
        [COLUMN.RAFT_ROLE]: stryMutAct_9fa48("11764") ? serviceData[COLUMN.RAFT_ROLE] && RAFT_ROLE.FOLLOWER : stryMutAct_9fa48("11763") ? false : stryMutAct_9fa48("11762") ? true : (stryCov_9fa48("11762", "11763", "11764"), serviceData[COLUMN.RAFT_ROLE] || RAFT_ROLE.FOLLOWER),
        [COLUMN.STATUS]: stryMutAct_9fa48("11767") ? serviceData[COLUMN.STATUS] && SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("11766") ? false : stryMutAct_9fa48("11765") ? true : (stryCov_9fa48("11765", "11766", "11767"), serviceData[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE),
        [COLUMN.ADDRESS]: stryMutAct_9fa48("11770") ? serviceData[COLUMN.ADDRESS] && null : stryMutAct_9fa48("11769") ? false : stryMutAct_9fa48("11768") ? true : (stryCov_9fa48("11768", "11769", "11770"), serviceData[COLUMN.ADDRESS] || null)
      });
    }
  }

  /**
   * Build the canonical services row persisted by /register-service.
   * @param {Object} serviceData
   * @return {Object}
   * @private
   */
  buildRegisteredServiceMutationRow(serviceData) {
    if (stryMutAct_9fa48("11771")) {
      {}
    } else {
      stryCov_9fa48("11771");
      const serviceId = serviceData[COLUMN.SERVICE_ID];
      return stryMutAct_9fa48("11772") ? {} : (stryCov_9fa48("11772"), {
        [COLUMN.SERVICE_ID]: serviceId,
        [COLUMN.SERVICE_TYPE]: serviceData[COLUMN.SERVICE_TYPE],
        [COLUMN.NODE_ID]: serviceData[COLUMN.NODE_ID],
        [COLUMN.PARTITION_ID]: stryMutAct_9fa48("11775") ? serviceData[COLUMN.PARTITION_ID] && null : stryMutAct_9fa48("11774") ? false : stryMutAct_9fa48("11773") ? true : (stryCov_9fa48("11773", "11774", "11775"), serviceData[COLUMN.PARTITION_ID] || null),
        [COLUMN.GROUP_ID]: stryMutAct_9fa48("11778") ? serviceData[COLUMN.GROUP_ID] && null : stryMutAct_9fa48("11777") ? false : stryMutAct_9fa48("11776") ? true : (stryCov_9fa48("11776", "11777", "11778"), serviceData[COLUMN.GROUP_ID] || null),
        [COLUMN.REPLICA_ID]: stryMutAct_9fa48("11781") ? serviceData[COLUMN.REPLICA_ID] && serviceId : stryMutAct_9fa48("11780") ? false : stryMutAct_9fa48("11779") ? true : (stryCov_9fa48("11779", "11780", "11781"), serviceData[COLUMN.REPLICA_ID] || serviceId),
        [COLUMN.RAFT_ROLE]: stryMutAct_9fa48("11784") ? serviceData[COLUMN.RAFT_ROLE] && RAFT_ROLE.FOLLOWER : stryMutAct_9fa48("11783") ? false : stryMutAct_9fa48("11782") ? true : (stryCov_9fa48("11782", "11783", "11784"), serviceData[COLUMN.RAFT_ROLE] || RAFT_ROLE.FOLLOWER),
        [COLUMN.STATUS]: stryMutAct_9fa48("11787") ? serviceData[COLUMN.STATUS] && SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("11786") ? false : stryMutAct_9fa48("11785") ? true : (stryCov_9fa48("11785", "11786", "11787"), serviceData[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE),
        [COLUMN.ADDRESS]: stryMutAct_9fa48("11790") ? serviceData[COLUMN.ADDRESS] && null : stryMutAct_9fa48("11789") ? false : stryMutAct_9fa48("11788") ? true : (stryCov_9fa48("11788", "11789", "11790"), serviceData[COLUMN.ADDRESS] || null),
        [COLUMN.CREATED_AT]: stryMutAct_9fa48("11793") ? serviceData[COLUMN.CREATED_AT] && Date.now() : stryMutAct_9fa48("11792") ? false : stryMutAct_9fa48("11791") ? true : (stryCov_9fa48("11791", "11792", "11793"), serviceData[COLUMN.CREATED_AT] || Date.now()),
        [COLUMN.UPDATED_AT]: stryMutAct_9fa48("11796") ? serviceData[COLUMN.UPDATED_AT] && Date.now() : stryMutAct_9fa48("11795") ? false : stryMutAct_9fa48("11794") ? true : (stryCov_9fa48("11794", "11795", "11796"), serviceData[COLUMN.UPDATED_AT] || Date.now())
      });
    }
  }

  /**
   * Normalize one bootstrap mutation failure to the shared typed retry surface.
   * @param {Error} error
   * @param {string} tableName
   * @param {string} fallbackMessage
   * @return {Error}
   * @private
   */
  buildBootstrapControlPlaneMutationError(error, tableName, fallbackMessage) {
    if (stryMutAct_9fa48("11797")) {
      {}
    } else {
      stryCov_9fa48("11797");
      return this.buildBootstrapControlPlaneQueryError(stryMutAct_9fa48("11798") ? {} : (stryCov_9fa48("11798"), {
        success: stryMutAct_9fa48("11799") ? true : (stryCov_9fa48("11799"), false),
        error: stryMutAct_9fa48("11802") ? error?.message && fallbackMessage : stryMutAct_9fa48("11801") ? false : stryMutAct_9fa48("11800") ? true : (stryCov_9fa48("11800", "11801", "11802"), (stryMutAct_9fa48("11803") ? error.message : (stryCov_9fa48("11803"), error?.message)) || fallbackMessage),
        errorCode: (stryMutAct_9fa48("11806") ? typeof error?.errorCode === TYPEOF.STRING || error.errorCode.length > NUM.ZERO : stryMutAct_9fa48("11805") ? false : stryMutAct_9fa48("11804") ? true : (stryCov_9fa48("11804", "11805", "11806"), (stryMutAct_9fa48("11808") ? typeof error?.errorCode !== TYPEOF.STRING : stryMutAct_9fa48("11807") ? true : (stryCov_9fa48("11807", "11808"), typeof (stryMutAct_9fa48("11809") ? error.errorCode : (stryCov_9fa48("11809"), error?.errorCode)) === TYPEOF.STRING)) && (stryMutAct_9fa48("11812") ? error.errorCode.length <= NUM.ZERO : stryMutAct_9fa48("11811") ? error.errorCode.length >= NUM.ZERO : stryMutAct_9fa48("11810") ? true : (stryCov_9fa48("11810", "11811", "11812"), error.errorCode.length > NUM.ZERO)))) ? error.errorCode : (stryMutAct_9fa48("11815") ? typeof error?.code === TYPEOF.STRING || error.code.length > NUM.ZERO : stryMutAct_9fa48("11814") ? false : stryMutAct_9fa48("11813") ? true : (stryCov_9fa48("11813", "11814", "11815"), (stryMutAct_9fa48("11817") ? typeof error?.code !== TYPEOF.STRING : stryMutAct_9fa48("11816") ? true : (stryCov_9fa48("11816", "11817"), typeof (stryMutAct_9fa48("11818") ? error.code : (stryCov_9fa48("11818"), error?.code)) === TYPEOF.STRING)) && (stryMutAct_9fa48("11821") ? error.code.length <= NUM.ZERO : stryMutAct_9fa48("11820") ? error.code.length >= NUM.ZERO : stryMutAct_9fa48("11819") ? true : (stryCov_9fa48("11819", "11820", "11821"), error.code.length > NUM.ZERO)))) ? error.code : null,
        retryAfterMs: Number.isFinite(stryMutAct_9fa48("11822") ? error.retryAfterMs : (stryCov_9fa48("11822"), error?.retryAfterMs)) ? stryMutAct_9fa48("11823") ? Math.min(NUM.ZERO, Math.floor(error.retryAfterMs)) : (stryCov_9fa48("11823"), Math.max(NUM.ZERO, Math.floor(error.retryAfterMs))) : null,
        pressureAction: (stryMutAct_9fa48("11826") ? typeof error?.pressureAction !== TYPEOF.STRING : stryMutAct_9fa48("11825") ? false : stryMutAct_9fa48("11824") ? true : (stryCov_9fa48("11824", "11825", "11826"), typeof (stryMutAct_9fa48("11827") ? error.pressureAction : (stryCov_9fa48("11827"), error?.pressureAction)) === TYPEOF.STRING)) ? error.pressureAction : null,
        pressureReason: (stryMutAct_9fa48("11830") ? typeof error?.pressureReason !== TYPEOF.STRING : stryMutAct_9fa48("11829") ? false : stryMutAct_9fa48("11828") ? true : (stryCov_9fa48("11828", "11829", "11830"), typeof (stryMutAct_9fa48("11831") ? error.pressureReason : (stryCov_9fa48("11831"), error?.pressureReason)) === TYPEOF.STRING)) ? error.pressureReason : null,
        pressureSummary: (stryMutAct_9fa48("11834") ? error?.pressureSummary || typeof error.pressureSummary === TYPEOF.OBJECT : stryMutAct_9fa48("11833") ? false : stryMutAct_9fa48("11832") ? true : (stryCov_9fa48("11832", "11833", "11834"), (stryMutAct_9fa48("11835") ? error.pressureSummary : (stryCov_9fa48("11835"), error?.pressureSummary)) && (stryMutAct_9fa48("11837") ? typeof error.pressureSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("11836") ? true : (stryCov_9fa48("11836", "11837"), typeof error.pressureSummary === TYPEOF.OBJECT)))) ? error.pressureSummary : null,
        tableName
      }), fallbackMessage);
    }
  }

  /**
   * Check whether services cache reflects the expected registered owner row.
   * @param {Object} expectedService - Canonical expected service row.
   * @return {Promise<boolean>} True when cache/storage row matches expected registration.
   * @private
   */
  async isRegisteredServiceVisibleInCache(expectedService) {
    if (stryMutAct_9fa48("11838")) {
      {}
    } else {
      stryCov_9fa48("11838");
      return this.serviceRegistrationVisibilityOwner.isRegisteredServiceVisibleInCache(expectedService);
    }
  }

  /**
   * Build one compact service snapshot for cache visibility diagnostics.
   * @param {Object|null} serviceRow - One service row from cache or expected payload.
   * @return {Object|null}
   * @private
   */
  buildRegisteredServiceVisibilitySnapshot(serviceRow) {
    if (stryMutAct_9fa48("11839")) {
      {}
    } else {
      stryCov_9fa48("11839");
      return this.serviceRegistrationVisibilityOwner.buildRegisteredServiceVisibilitySnapshot(serviceRow);
    }
  }

  /**
   * Compute field-level mismatch list between observed and expected service rows.
   * @param {Object} observedService - Observed row from cache/storage.
   * @param {Object} expectedService - Canonical expected row.
   * @return {Array<string>} List of mismatched field names.
   * @private
   */
  getRegisteredServiceMismatchFields(observedService, expectedService) {
    if (stryMutAct_9fa48("11840")) {
      {}
    } else {
      stryCov_9fa48("11840");
      return this.serviceRegistrationVisibilityOwner.getRegisteredServiceMismatchFields(observedService, expectedService);
    }
  }

  /**
   * Read one services row from authoritative storage by service_id.
   * @param {string} serviceId - Service identifier.
   * @return {Promise<{row: Object|null, error: string|null}>}
   * @private
   */
  async readRegisteredServiceFromStorage(serviceId) {
    if (stryMutAct_9fa48("11841")) {
      {}
    } else {
      stryCov_9fa48("11841");
      return this.serviceRegistrationVisibilityOwner.readRegisteredServiceFromStorage(serviceId);
    }
  }

  /**
   * Evaluate services cache visibility for one register-service write.
   * @param {Object} expectedService - Canonical expected service row.
   * @return {Promise<{visible: boolean, diagnostics: Object}>}
   * @private
   */
  async evaluateRegisteredServiceCacheVisibility(expectedService) {
    if (stryMutAct_9fa48("11842")) {
      {}
    } else {
      stryCov_9fa48("11842");
      return this.serviceRegistrationVisibilityOwner.evaluateRegisteredServiceCacheVisibility(expectedService);
    }
  }

  /**
   * Repair one services-cache visibility hole through the canonical CDC
   * authoritative repair helper when storage already reflects the row.
   * @param {Object} expectedService
   * @param {Object|null} diagnostics
   * @return {Promise<boolean>}
   * @private
   */
  async maybeRepairRegisteredServiceCacheVisibility(expectedService, diagnostics) {
    if (stryMutAct_9fa48("11843")) {
      {}
    } else {
      stryCov_9fa48("11843");
      return this.serviceRegistrationVisibilityOwner.maybeRepairRegisteredServiceCacheVisibility(expectedService, diagnostics);
    }
  }

  /**
   * Build timeout diagnostics for one failed cache visibility wait.
   * @param {Object} expectedService
   * @param {Object|null} lastDiagnostics
   * @param {number} timeoutMs
   * @param {number} elapsedMs
   * @return {Object}
   * @private
   */
  buildRegisteredServiceVisibilityTimeoutDiagnostics(expectedService, lastDiagnostics, timeoutMs, elapsedMs) {
    if (stryMutAct_9fa48("11844")) {
      {}
    } else {
      stryCov_9fa48("11844");
      return this.serviceRegistrationVisibilityOwner.buildRegisteredServiceVisibilityTimeoutDiagnostics(expectedService, lastDiagnostics, timeoutMs, elapsedMs);
    }
  }

  /**
   * Wait for register-service write to become visible in seed system cache.
   * This prevents stale assignment snapshots on immediately subsequent joins.
   * @param {Object} expectedService - Canonical expected service row.
   * @return {Promise<void>}
   * @private
   */
  async waitForRegisteredServiceCacheVisibility(expectedService) {
    if (stryMutAct_9fa48("11845")) {
      {}
    } else {
      stryCov_9fa48("11845");
      return this.serviceRegistrationVisibilityOwner.waitForRegisteredServiceCacheVisibility(expectedService);
    }
  }

  /**
   * Read the current registered services row from cache or authoritative
   * storage so MOVE_REPLICA handoff can restore the prior owner when target
   * visibility never converges.
   * @param {string} serviceId
   * @return {Promise<Object|null>}
   * @private
   */
  async readCurrentRegisteredServiceRow(serviceId) {
    if (stryMutAct_9fa48("11846")) {
      {}
    } else {
      stryCov_9fa48("11846");
      return this.serviceRegistrationVisibilityOwner.readCurrentRegisteredServiceRow(serviceId);
    }
  }

  /**
   * Restore the prior services row when a MOVE_REPLICA target write was issued
   * but the source replica has not yet been removed.
   * @param {?Object} previousServiceRow
   * @param {Object} requestedServiceData
   * @param {Error} error
   * @return {Promise<void>}
   * @private
   */
  async restoreRegisteredServiceRowAfterFailedHandoff(previousServiceRow, requestedServiceData, error) {
    if (stryMutAct_9fa48("11847")) {
      {}
    } else {
      stryCov_9fa48("11847");
      return this.moveReplicaHandoffOwner.restoreRegisteredServiceRowAfterFailedHandoff(previousServiceRow, requestedServiceData, error);
    }
  }

  /**
   * Determine whether this register-service request is a MOVE_REPLICA handoff.
   * @param {Object} serviceData - Incoming register-service payload.
   * @return {boolean} True when handoff tracking should be enabled.
   * @private
   */
  isMoveReplicaHandoffRequest(serviceData) {
    if (stryMutAct_9fa48("11848")) {
      {}
    } else {
      stryCov_9fa48("11848");
      return this.moveReplicaAssignmentOwner.isMoveReplicaHandoffRequest(serviceData);
    }
  }

  /**
   * Build one typed register-service validation error.
   * @param {number} statusCode
   * @param {string} message
   * @param {string} code
   * @param {Object} [options]
   * @param {number} [options.retryAfterMs]
   * @param {Object} [options.details]
   * @return {Error}
   * @private
   */
  buildRegisterServiceValidationError(statusCode, message, code, options = {}) {
    if (stryMutAct_9fa48("11849")) {
      {}
    } else {
      stryCov_9fa48("11849");
      const error = new Error(message);
      error.statusCode = statusCode;
      error.errorCode = code;
      if (stryMutAct_9fa48("11851") ? false : stryMutAct_9fa48("11850") ? true : (stryCov_9fa48("11850", "11851"), Number.isFinite(options.retryAfterMs))) {
        if (stryMutAct_9fa48("11852")) {
          {}
        } else {
          stryCov_9fa48("11852");
          error.retryAfterMs = stryMutAct_9fa48("11853") ? Math.min(NUM.ZERO, Math.floor(options.retryAfterMs)) : (stryCov_9fa48("11853"), Math.max(NUM.ZERO, Math.floor(options.retryAfterMs)));
        }
      }
      if (stryMutAct_9fa48("11856") ? options.details || typeof options.details === TYPEOF.OBJECT : stryMutAct_9fa48("11855") ? false : stryMutAct_9fa48("11854") ? true : (stryCov_9fa48("11854", "11855", "11856"), options.details && (stryMutAct_9fa48("11858") ? typeof options.details !== TYPEOF.OBJECT : stryMutAct_9fa48("11857") ? true : (stryCov_9fa48("11857", "11858"), typeof options.details === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("11859")) {
          {}
        } else {
          stryCov_9fa48("11859");
          error.details = options.details;
        }
      }
      return error;
    }
  }

  /**
   * Lookup one move-assignment reservation by assignment ID.
   * @param {string} assignmentId
   * @return {Promise<Object|null>}
   * @private
   */
  async getMoveReplicaAssignmentReservationById(assignmentId) {
    if (stryMutAct_9fa48("11860")) {
      {}
    } else {
      stryCov_9fa48("11860");
      return this.moveReplicaAssignmentOwner.getMoveReplicaAssignmentReservationById(assignmentId);
    }
  }

  /**
   * Validate MOVE_REPLICA assignment token on register-service.
   * @param {Object} serviceData
   * @return {Promise<Object|null>}
   * @private
   */
  async validateMoveReplicaAssignmentToken(serviceData) {
    if (stryMutAct_9fa48("11861")) {
      {}
    } else {
      stryCov_9fa48("11861");
      return this.moveReplicaAssignmentOwner.validateMoveReplicaAssignmentToken(serviceData);
    }
  }

  /**
   * Return whether one active reservation should be renewed before it expires.
   * Keeps long-running join/register retries alive without waiting for the
   * token to become invalid first.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  shouldRenewMoveReplicaAssignmentReservation(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("11862")) {
      {}
    } else {
      stryCov_9fa48("11862");
      return this.moveReplicaAssignmentOwner.shouldRenewMoveReplicaAssignmentReservation(reservation, now);
    }
  }

  /**
   * Renew or revive a MOVE_REPLICA reservation when the original handoff
   * is still the canonical pending move for this replica.
   * @param {Object} reservation
   * @param {Object} [options]
   * @param {number} [options.now=Date.now()]
   * @param {boolean} [options.force=false]
   * @param {string} [options.phase='lease_renewed']
   * @return {Promise<Object|null>}
   * @private
   */
  async renewMoveReplicaAssignmentReservation(reservation, options = {}) {
    if (stryMutAct_9fa48("11863")) {
      {}
    } else {
      stryCov_9fa48("11863");
      return this.moveReplicaAssignmentOwner.renewMoveReplicaAssignmentReservation(reservation, options);
    }
  }

  /**
   * Return whether the source replica still exists locally on the seed.
   * MOVE_REPLICA reservations only originate from seed-owned source replicas,
   * so local replica absence is one authoritative signal that source removal
   * has already completed.
   * @param {Object} reservation
   * @return {boolean}
   * @private
   */
  isMoveReplicaAssignmentSourceReplicaPresentLocally(reservation) {
    if (stryMutAct_9fa48("11864")) {
      {}
    } else {
      stryCov_9fa48("11864");
      return this.moveReplicaAssignmentOwner.isMoveReplicaAssignmentSourceReplicaPresentLocally(reservation);
    }
  }

  /**
   * Evaluate canonical ownership signals for one MOVE_REPLICA reservation.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {Object}
   * @private
   */
  evaluateMoveReplicaAssignmentReservationOwnership(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("11865")) {
      {}
    } else {
      stryCov_9fa48("11865");
      return this.moveReplicaAssignmentOwner.evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
    }
  }

  /**
   * Check whether an expired reservation still matches the source owner that
   * originally granted the handoff.
   * @param {Object} reservation
   * @return {boolean}
   * @private
   */
  canReviveExpiredMoveReplicaAssignmentReservation(reservation) {
    if (stryMutAct_9fa48("11866")) {
      {}
    } else {
      stryCov_9fa48("11866");
      return this.moveReplicaAssignmentOwner.canReviveExpiredMoveReplicaAssignmentReservation(reservation);
    }
  }

  /**
   * Check whether a reservation source still has a viable owner path.
   * A bootstrap MOVE_REPLICA reservation is no longer actionable when the
   * recorded source node has lost readiness while the source replica still
   * appears to belong to it.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  hasViableMoveReplicaAssignmentSource(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("11867")) {
      {}
    } else {
      stryCov_9fa48("11867");
      return this.moveReplicaAssignmentOwner.hasViableMoveReplicaAssignmentSource(reservation, now);
    }
  }

  /**
   * Resolve one non-terminal reservation invalidation reason.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {string|null}
   * @private
   */
  getMoveReplicaAssignmentReservationInvalidationReason(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("11868")) {
      {}
    } else {
      stryCov_9fa48("11868");
      return this.moveReplicaAssignmentOwner.getMoveReplicaAssignmentReservationInvalidationReason(reservation, now);
    }
  }

  /**
   * Determine whether one non-terminal reservation has already converged to
   * canonical target ownership and should be reconciled into a committed row.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  shouldReconcileMoveReplicaAssignmentReservationToCommitted(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("11869")) {
      {}
    } else {
      stryCov_9fa48("11869");
      return this.moveReplicaAssignmentOwner.shouldReconcileMoveReplicaAssignmentReservationToCommitted(reservation, now);
    }
  }

  /**
   * Enforce one active owner row per message-group replica registration.
   * @param {Object} serviceData
   * @param {Object|null} assignmentContext
   * @return {void}
   * @private
   */
  assertSingleOwnerReplicaRegistration(serviceData, assignmentContext) {
    if (stryMutAct_9fa48("11870")) {
      {}
    } else {
      stryCov_9fa48("11870");
      return this.moveReplicaHandoffOwner.assertSingleOwnerReplicaRegistration(serviceData, assignmentContext);
    }
  }

  /**
   * Check whether a node is the canonical home for a self-hosted
   * message group. The canonical group ID is deterministically
   * derived from the node ID by MessageGroupAssignment, so a
   * match proves the node originally created the group.
   * @param {string|null} groupId - Group ID from the service row.
   * @param {string|null} nodeId - Target node ID.
   * @return {boolean} True if the node is the canonical home.
   */
  isCanonicalGroupHomeNode(groupId, nodeId) {
    if (stryMutAct_9fa48("11871")) {
      {}
    } else {
      stryCov_9fa48("11871");
      return this.moveReplicaHandoffOwner.isCanonicalGroupHomeNode(groupId, nodeId);
    }
  }
  buildReplicaOperationMutationRow(operationContext) {
    if (stryMutAct_9fa48("11872")) {
      {}
    } else {
      stryCov_9fa48("11872");
      return stryMutAct_9fa48("11873") ? {} : (stryCov_9fa48("11873"), {
        operation_id: operationContext.operationId,
        type: operationContext.type,
        partition_id: operationContext.partitionId,
        replica_id: operationContext.replicaId,
        source_node_id: operationContext.sourceNodeId,
        target_node_id: operationContext.targetNodeId,
        status: operationContext.status,
        workflow_step: operationContext.workflowStep,
        created_at: operationContext.createdAt,
        updated_at: operationContext.updatedAt,
        completed_at: operationContext.completedAt,
        lease_expires_at: stryMutAct_9fa48("11874") ? operationContext.leaseExpiresAt && null : (stryCov_9fa48("11874"), operationContext.leaseExpiresAt ?? null),
        error_message: operationContext.errorMessage,
        steps_history: JSON.stringify(stryMutAct_9fa48("11877") ? operationContext.stepsHistory && [] : stryMutAct_9fa48("11876") ? false : stryMutAct_9fa48("11875") ? true : (stryCov_9fa48("11875", "11876", "11877"), operationContext.stepsHistory || (stryMutAct_9fa48("11878") ? ["Stryker was here"] : (stryCov_9fa48("11878"), [])))),
        entity_type: operationContext.entityType,
        entity_id: operationContext.entityId
      });
    }
  }
  buildReplicaOperationMutationData(operationContext) {
    if (stryMutAct_9fa48("11879")) {
      {}
    } else {
      stryCov_9fa48("11879");
      return stryMutAct_9fa48("11880") ? {} : (stryCov_9fa48("11880"), {
        status: operationContext.status,
        workflow_step: operationContext.workflowStep,
        updated_at: operationContext.updatedAt,
        completed_at: operationContext.completedAt,
        lease_expires_at: stryMutAct_9fa48("11881") ? operationContext.leaseExpiresAt && null : (stryCov_9fa48("11881"), operationContext.leaseExpiresAt ?? null),
        error_message: operationContext.errorMessage,
        steps_history: JSON.stringify(stryMutAct_9fa48("11884") ? operationContext.stepsHistory && [] : stryMutAct_9fa48("11883") ? false : stryMutAct_9fa48("11882") ? true : (stryCov_9fa48("11882", "11883", "11884"), operationContext.stepsHistory || (stryMutAct_9fa48("11885") ? ["Stryker was here"] : (stryCov_9fa48("11885"), []))))
      });
    }
  }

  /**
   * Persist a new MOVE_REPLICA handoff operation row.
   *
   * OWNERSHIP BOUNDARY: BootstrapAPI owns the MOVE_REPLICA handoff
   * and MOVE_ASSIGNMENT reservation lifecycle as a separate ownership
   * domain from RebalanceCoordinator. This is an explicit exception
   * to the single-writer contract for replica_operations:
   *
   * - BootstrapAPI owns rows with type = 'ADD' (handoff) and
   *   type = 'MOVE_ASSIGNMENT' (reservation) created during node join.
   * - RebalanceCoordinator owns all other replica_operations rows
   *   (ADD/REMOVE/REPLACE for steady-state rebalancing).
   * - The two domains are distinguished by operation type and
   *   creation context (bootstrap vs steady-state).
   * - BootstrapAPI MUST NOT create or mutate coordinator-owned rows.
   * - RebalanceCoordinator MUST NOT create or mutate bootstrap-owned
   *   handoff/reservation rows.
   *
   * @param {Object} handoffContext - Operation context.
   * @return {Promise<void>}
   * @private
   */
  async insertMoveReplicaHandoffOperation(handoffContext) {
    if (stryMutAct_9fa48("11886")) {
      {}
    } else {
      stryCov_9fa48("11886");
      const result = await this.executeBootstrapControlPlaneMutation(stryMutAct_9fa48("11887") ? {} : (stryCov_9fa48("11887"), {
        operation: stryMutAct_9fa48("11888") ? "" : (stryCov_9fa48("11888"), 'insert'),
        tableName: TABLES.REPLICA_OPERATIONS,
        row: this.buildReplicaOperationMutationRow(handoffContext)
      }));
      if (stryMutAct_9fa48("11891") ? false : stryMutAct_9fa48("11890") ? true : stryMutAct_9fa48("11889") ? result.success : (stryCov_9fa48("11889", "11890", "11891"), !result.success)) {
        if (stryMutAct_9fa48("11892")) {
          {}
        } else {
          stryCov_9fa48("11892");
          throw this.buildBootstrapControlPlaneQueryError(result, stryMutAct_9fa48("11893") ? "" : (stryCov_9fa48("11893"), 'Failed to persist MOVE_REPLICA handoff operation'));
        }
      }
    }
  }

  /**
   * Persist updates to an existing MOVE_REPLICA handoff operation row.
   * @param {Object} handoffContext - Operation context.
   * @return {Promise<void>}
   * @private
   */
  async updateMoveReplicaHandoffOperation(handoffContext) {
    if (stryMutAct_9fa48("11894")) {
      {}
    } else {
      stryCov_9fa48("11894");
      const result = await this.executeBootstrapControlPlaneMutation(stryMutAct_9fa48("11895") ? {} : (stryCov_9fa48("11895"), {
        operation: stryMutAct_9fa48("11896") ? "" : (stryCov_9fa48("11896"), 'update'),
        tableName: TABLES.REPLICA_OPERATIONS,
        whereClause: stryMutAct_9fa48("11897") ? {} : (stryCov_9fa48("11897"), {
          operation_id: handoffContext.operationId
        }),
        data: this.buildReplicaOperationMutationData(handoffContext)
      }));
      if (stryMutAct_9fa48("11900") ? false : stryMutAct_9fa48("11899") ? true : stryMutAct_9fa48("11898") ? result.success : (stryCov_9fa48("11898", "11899", "11900"), !result.success)) {
        if (stryMutAct_9fa48("11901")) {
          {}
        } else {
          stryCov_9fa48("11901");
          throw this.buildBootstrapControlPlaneQueryError(result, stryMutAct_9fa48("11902") ? "" : (stryCov_9fa48("11902"), 'Failed to update MOVE_REPLICA handoff operation'));
        }
      }
    }
  }

  /**
   * Start MOVE_REPLICA handoff tracking when applicable.
   * @param {Object} serviceData - Incoming register-service payload.
   * @param {Object|null} assignmentContext - Validated assignment reservation.
   * @return {Promise<Object|null>} Handoff context or null.
   * @private
   */
  async startMoveReplicaHandoff(serviceData, assignmentContext = null) {
    if (stryMutAct_9fa48("11903")) {
      {}
    } else {
      stryCov_9fa48("11903");
      if (stryMutAct_9fa48("11906") ? false : stryMutAct_9fa48("11905") ? true : stryMutAct_9fa48("11904") ? this.isMoveReplicaHandoffRequest(serviceData) : (stryCov_9fa48("11904", "11905", "11906"), !this.isMoveReplicaHandoffRequest(serviceData))) {
        if (stryMutAct_9fa48("11907")) {
          {}
        } else {
          stryCov_9fa48("11907");
          return null;
        }
      }
      return this.moveReplicaHandoffOwner.startMoveReplicaHandoff(serviceData, assignmentContext);
    }
  }

  /**
   * Execute and persist a MOVE_REPLICA handoff phase.
   * @param {Object} handoffContext - Operation context.
   * @param {string} phase - Handoff phase identifier.
   * @param {string} workflowStep - Workflow step value.
   * @param {string} status - Replica operation status.
   * @param {Function} executor - Phase action.
   * @return {Promise<void>}
   * @private
   */
  async executeMoveReplicaHandoffPhase(handoffContext, phase, workflowStep, status, executor) {
    if (stryMutAct_9fa48("11908")) {
      {}
    } else {
      stryCov_9fa48("11908");
      return this.moveReplicaHandoffOwner.executeMoveReplicaHandoffPhase(handoffContext, phase, workflowStep, status, executor);
    }
  }

  /**
   * Verify the MOVE_REPLICA target metadata before source removal.
   * @param {Object} handoffContext - Operation context.
   * @param {Object} serviceData - Incoming register-service payload.
   * @return {void}
   * @private
   */
  verifyMoveReplicaHandoffTarget(handoffContext, serviceData) {
    if (stryMutAct_9fa48("11909")) {
      {}
    } else {
      stryCov_9fa48("11909");
      return this.moveReplicaHandoffOwner.verifyMoveReplicaHandoffTarget(handoffContext, serviceData);
    }
  }

  /**
   * Mark MOVE_REPLICA handoff as committed.
   * @param {Object} handoffContext - Operation context.
   * @return {Promise<void>}
   * @private
   */
  async completeMoveReplicaHandoff(handoffContext) {
    if (stryMutAct_9fa48("11910")) {
      {}
    } else {
      stryCov_9fa48("11910");
      return this.moveReplicaHandoffOwner.completeMoveReplicaHandoff(handoffContext);
    }
  }

  /**
   * Mark MOVE_REPLICA handoff as failed.
   * @param {Object} handoffContext - Operation context.
   * @param {Error} error - Failure reason.
   * @return {Promise<void>}
   * @private
   */
  async failMoveReplicaHandoff(handoffContext, error) {
    if (stryMutAct_9fa48("11911")) {
      {}
    } else {
      stryCov_9fa48("11911");
      return this.moveReplicaHandoffOwner.failMoveReplicaHandoff(handoffContext, error);
    }
  }

  /**
   * Remove a local message-group source replica before committing MOVE_REPLICA
   * ownership metadata to another node.
   * @param {Object} serviceData - Incoming register-service payload.
   * @return {Promise<void>}
   * @private
   */
  async removeLocalSourceReplicaForMoveReplica(serviceData) {
    if (stryMutAct_9fa48("11912")) {
      {}
    } else {
      stryCov_9fa48("11912");
      return this.moveReplicaHandoffOwner.removeLocalSourceReplicaForMoveReplica(serviceData);
    }
  }

  /**
   * Get the leader partition info for a specific table.
   * Uses ONLY the system cache - no fallbacks.
   * @param {string} tableName - Table name.
   * @return {Object|null} Leader partition info or null.
   * @private
   */
  getLeaderPartitionForTable(tableName) {
    if (stryMutAct_9fa48("11913")) {
      {}
    } else {
      stryCov_9fa48("11913");
      return this.bootstrapJoinAdmissionOwner.getLeaderPartitionForTable(tableName);
    }
  }

  /**
   * Validate bootstrap request parameters.
   * @param {string} nodeId - Node ID from request.
   * @param {string} nodeAddress - Node address from request.
   * @return {string|null} Error message or null if valid.
   */
  validateBootstrapRequest(nodeId, nodeAddress) {
    if (stryMutAct_9fa48("11914")) {
      {}
    } else {
      stryCov_9fa48("11914");
      return this.bootstrapJoinAdmissionOwner.validateBootstrapRequest(nodeId, nodeAddress);
    }
  }

  /**
   * Check for node ID or address conflicts using system table cache.
   * @param {string} nodeId - Node ID to check.
   * @param {string} nodeAddress - Node address to check.
   * @return {Promise<string|null>} Error message or null if no conflict.
   */
  async checkForConflicts(nodeId, nodeAddress) {
    if (stryMutAct_9fa48("11915")) {
      {}
    } else {
      stryCov_9fa48("11915");
      return this.bootstrapJoinAdmissionOwner.checkForConflicts(nodeId, nodeAddress);
    }
  }

  /**
   * Determine whether a node record represents a dead node that
   * is eligible for re-registration. A node is dead when its
   * status is terminal OR its ready lease has expired.
   * @param {Object} nodeRecord - Row from the nodes table.
   * @return {boolean} True if the node is considered dead.
   * @private
   */
  _isNodeDead(nodeRecord) {
    if (stryMutAct_9fa48("11916")) {
      {}
    } else {
      stryCov_9fa48("11916");
      return this.bootstrapJoinAdmissionOwner.isNodeDead(nodeRecord);
    }
  }

  /**
   * Read one canonical nodes row when authoritative control-plane reads
   * are available. Successful empty reads are treated as cache-stale absence;
   * read failures fall back to cache semantics.
   * @param {string} nodeId
   * @return {Promise<{available: boolean, row: Object|null}>}
   * @private
   */
  async readAuthoritativeNodeRow(nodeId) {
    if (stryMutAct_9fa48("11917")) {
      {}
    } else {
      stryCov_9fa48("11917");
      return this.bootstrapJoinAdmissionOwner.readAuthoritativeNodeRow(nodeId);
    }
  }

  /**
   * Resolve the canonical control-plane view when the bootstrap owner can
   * execute authoritative system-table reads.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */
  getAuthoritativeControlPlaneView() {
    if (stryMutAct_9fa48("11918")) {
      {}
    } else {
      stryCov_9fa48("11918");
      return this.bootstrapJoinAdmissionOwner.getAuthoritativeControlPlaneView();
    }
  }

  /**
   * Determine message group assignment for a new node.
   * Delegates strategy selection to MessageGroupAssignment (single owner)
   * and augments the result with peer addresses for Raft communication.
   * @param {string} newNodeId - New node ID.
   * @param {Object} [options]
   * @param {Set<string>} [options.excludedReplicaIds]
   * @return {Object} Assignment instructions.
   */
  determineMessageGroupAssignment(newNodeId, options = {}) {
    if (stryMutAct_9fa48("11919")) {
      {}
    } else {
      stryCov_9fa48("11919");
      return this.bootstrapJoinAdmissionOwner.determineMessageGroupAssignment(newNodeId, options);
    }
  }

  /**
   * Serialize MOVE_REPLICA assignment reservation so concurrent bootstrap
   * requests cannot reserve the same replica.
   * @param {Function} action
   * @return {Promise<*>}
   * @private
   */
  async withMoveReplicaAssignmentReservationLock(action) {
    if (stryMutAct_9fa48("11920")) {
      {}
    } else {
      stryCov_9fa48("11920");
      return this.bootstrapJoinAdmissionOwner.withMoveReplicaAssignmentReservationLock(action);
    }
  }

  /**
   * Determine assignment and reserve MOVE_REPLICA ownership atomically before
   * responding to bootstrap.
   * @param {string} newNodeId
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  async determineAndReserveMessageGroupAssignment(newNodeId, options = {}) {
    if (stryMutAct_9fa48("11921")) {
      {}
    } else {
      stryCov_9fa48("11921");
      return this.bootstrapJoinAdmissionOwner.determineAndReserveMessageGroupAssignment(newNodeId, options);
    }
  }

  /**
   * Convert persisted replica operation row into move-assignment reservation.
   * @param {Object} row
   * @return {Object|null}
   * @private
   */
  normalizeMoveReplicaAssignmentReservationRow(row) {
    if (stryMutAct_9fa48("11922")) {
      {}
    } else {
      stryCov_9fa48("11922");
      return this.moveReplicaAssignmentOwner.normalizeMoveReplicaAssignmentReservationRow(row);
    }
  }

  /**
   * Return active move-assignment reservations from in-memory + persisted state.
   * @return {Promise<Array<Object>>}
   * @private
   */
  async getActiveMoveReplicaAssignmentReservations() {
    if (stryMutAct_9fa48("11923")) {
      {}
    } else {
      stryCov_9fa48("11923");
      return this.moveReplicaAssignmentOwner.getActiveMoveReplicaAssignmentReservations();
    }
  }

  /**
   * Return one set of MOVE_REPLICA reservations that should defer new
   * bootstrap admissions because the canonical handoff has not stabilized yet.
   * This includes in-flight reservations and recently committed handoffs whose
   * target node is not ready yet.
   * @param {number} [now=Date.now()]
   * @return {Promise<Array<Object>>}
   * @private
   */
  async getBlockingMoveReplicaBootstrapAdmissions(now = Date.now()) {
    if (stryMutAct_9fa48("11924")) {
      {}
    } else {
      stryCov_9fa48("11924");
      return this.moveReplicaAssignmentOwner.getBlockingMoveReplicaBootstrapAdmissions(now);
    }
  }

  /**
   * Determine whether one MOVE_REPLICA reservation should block a new
   * bootstrap admission.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  isMoveReplicaBootstrapAdmissionBlocked(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("11925")) {
      {}
    } else {
      stryCov_9fa48("11925");
      return this.moveReplicaAssignmentOwner.isMoveReplicaBootstrapAdmissionBlocked(reservation, now);
    }
  }

  /**
   * A non-terminal MOVE_REPLICA handoff remains exclusive for new bootstrap
   * admissions until it either commits or is explicitly invalidated. Lease
   * expiry only affects token freshness; it must not make the replica
   * assignable again while the original handoff is still open.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  isMoveReplicaAssignmentReservationOpen(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("11926")) {
      {}
    } else {
      stryCov_9fa48("11926");
      return this.moveReplicaAssignmentOwner.isMoveReplicaAssignmentReservationOpen(reservation, now);
    }
  }

  /**
   * A committed handoff still blocks new bootstrap admissions until the target
   * node is actually ready and the canonical service row points at it. This
   * prevents the seed from starting a second control-plane handoff while the
   * first moved replica is still converging.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  isCommittedMoveReplicaHandoffStabilizing(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("11927")) {
      {}
    } else {
      stryCov_9fa48("11927");
      return this.moveReplicaAssignmentOwner.isCommittedMoveReplicaHandoffStabilizing(reservation, now);
    }
  }

  /**
   * Determine whether the canonical target of a committed MOVE_REPLICA
   * handoff is locally ready.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  isMoveReplicaAssignmentTargetReady(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("11928")) {
      {}
    } else {
      stryCov_9fa48("11928");
      return this.moveReplicaAssignmentOwner.isMoveReplicaAssignmentTargetReady(reservation, now);
    }
  }

  /**
   * Resolve one bounded retry hint for bootstrap admission blocked by an
   * unsettled MOVE_REPLICA handoff.
   * @param {Object|null} reservation
   * @param {number} [now=Date.now()]
   * @return {number}
   * @private
   */
  resolveMoveReplicaBootstrapAdmissionRetryAfterMs(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("11929")) {
      {}
    } else {
      stryCov_9fa48("11929");
      return this.moveReplicaAssignmentOwner.resolveMoveReplicaBootstrapAdmissionRetryAfterMs(reservation, now);
    }
  }

  /**
   * Check whether one reservation is currently active.
   * @param {Object} reservation
   * @param {number} now
   * @return {boolean}
   * @private
   */
  isMoveReplicaAssignmentReservationActive(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("11930")) {
      {}
    } else {
      stryCov_9fa48("11930");
      return this.moveReplicaAssignmentOwner.isMoveReplicaAssignmentReservationActive(reservation, now);
    }
  }

  /**
   * Expire stale reservations so replicas become assignable again.
   * @return {Promise<void>}
   * @private
   */
  async expireMoveReplicaAssignmentReservations() {
    if (stryMutAct_9fa48("11931")) {
      {}
    } else {
      stryCov_9fa48("11931");
      return this.moveReplicaAssignmentOwner.expireMoveReplicaAssignmentReservations();
    }
  }

  /**
   * Start background sweeping for stranded MOVE_REPLICA reservations.
   * @private
   */
  startMoveReplicaAssignmentSweep() {
    if (stryMutAct_9fa48("11932")) {
      {}
    } else {
      stryCov_9fa48("11932");
      if (stryMutAct_9fa48("11935") ? false : stryMutAct_9fa48("11934") ? true : stryMutAct_9fa48("11933") ? this.ownsMoveReplicaAssignmentLifecycle : (stryCov_9fa48("11933", "11934", "11935"), !this.ownsMoveReplicaAssignmentLifecycle)) {
        if (stryMutAct_9fa48("11936")) {
          {}
        } else {
          stryCov_9fa48("11936");
          return;
        }
      }
      if (stryMutAct_9fa48("11939") ? this.moveReplicaAssignmentSweepTimer && this.moveReplicaAssignmentSweepIntervalMs <= NUM.ZERO : stryMutAct_9fa48("11938") ? false : stryMutAct_9fa48("11937") ? true : (stryCov_9fa48("11937", "11938", "11939"), this.moveReplicaAssignmentSweepTimer || (stryMutAct_9fa48("11942") ? this.moveReplicaAssignmentSweepIntervalMs > NUM.ZERO : stryMutAct_9fa48("11941") ? this.moveReplicaAssignmentSweepIntervalMs < NUM.ZERO : stryMutAct_9fa48("11940") ? false : (stryCov_9fa48("11940", "11941", "11942"), this.moveReplicaAssignmentSweepIntervalMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("11943")) {
          {}
        } else {
          stryCov_9fa48("11943");
          return;
        }
      }
      this.moveReplicaAssignmentSweepTimer = setInterval(() => {
        if (stryMutAct_9fa48("11944")) {
          {}
        } else {
          stryCov_9fa48("11944");
          void this.expireMoveReplicaAssignmentReservations().catch(error => {
            if (stryMutAct_9fa48("11945")) {
              {}
            } else {
              stryCov_9fa48("11945");
              this.logger.warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_SWEEP_FAILED, stryMutAct_9fa48("11946") ? {} : (stryCov_9fa48("11946"), {
                error: error.message
              }));
            }
          });
        }
      }, this.moveReplicaAssignmentSweepIntervalMs);
      if (stryMutAct_9fa48("11949") ? typeof this.moveReplicaAssignmentSweepTimer.unref !== TYPEOF.FUNCTION : stryMutAct_9fa48("11948") ? false : stryMutAct_9fa48("11947") ? true : (stryCov_9fa48("11947", "11948", "11949"), typeof this.moveReplicaAssignmentSweepTimer.unref === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("11950")) {
          {}
        } else {
          stryCov_9fa48("11950");
          this.moveReplicaAssignmentSweepTimer.unref();
        }
      }
    }
  }

  /**
   * Stop background sweeping for MOVE_REPLICA reservations.
   * @private
   */
  stopMoveReplicaAssignmentSweep() {
    if (stryMutAct_9fa48("11951")) {
      {}
    } else {
      stryCov_9fa48("11951");
      if (stryMutAct_9fa48("11954") ? false : stryMutAct_9fa48("11953") ? true : stryMutAct_9fa48("11952") ? this.moveReplicaAssignmentSweepTimer : (stryCov_9fa48("11952", "11953", "11954"), !this.moveReplicaAssignmentSweepTimer)) {
        if (stryMutAct_9fa48("11955")) {
          {}
        } else {
          stryCov_9fa48("11955");
          return;
        }
      }
      clearInterval(this.moveReplicaAssignmentSweepTimer);
      this.moveReplicaAssignmentSweepTimer = null;
    }
  }

  /**
   * Persist and cache one MOVE_REPLICA assignment reservation.
   *
   * OWNERSHIP BOUNDARY: See insertMoveReplicaHandoffOperation for the
   * full boundary contract. This method creates MOVE_ASSIGNMENT rows
   * owned by the bootstrap handoff domain.
   *
   * @param {string} targetNodeId
   * @param {Object} assignment
   * @return {Promise<Object>}
   * @private
   */
  async reserveMoveReplicaAssignment(targetNodeId, assignment) {
    if (stryMutAct_9fa48("11956")) {
      {}
    } else {
      stryCov_9fa48("11956");
      return this.moveReplicaAssignmentOwner.reserveMoveReplicaAssignment(targetNodeId, assignment);
    }
  }

  /**
   * Mark reservation row terminal and clear in-memory ownership lock.
   * @param {string} assignmentId
   * @param {string} status
   * @param {string} workflowStep
   * @param {string} errorMessage
   * @return {Promise<void>}
   * @private
   */
  async markMoveReplicaAssignmentReservationTerminal(assignmentId, status, workflowStep, errorMessage = null) {
    if (stryMutAct_9fa48("11957")) {
      {}
    } else {
      stryCov_9fa48("11957");
      return this.moveReplicaAssignmentOwner.markMoveReplicaAssignmentReservationTerminal(assignmentId, status, workflowStep, errorMessage);
    }
  }

  /**
   * Reconcile one non-terminal reservation into its observed committed state
   * once canonical ownership has already moved to the target and the source
   * replica is gone locally.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {Promise<void>}
   * @private
   */
  async reconcileMoveReplicaAssignmentReservationToCommitted(reservation, now = Date.now()) {
    if (stryMutAct_9fa48("11958")) {
      {}
    } else {
      stryCov_9fa48("11958");
      return this.moveReplicaAssignmentOwner.reconcileMoveReplicaAssignmentReservationToCommitted(reservation, now);
    }
  }

  /**
   * Augment a MessageGroupAssignment result with peer addresses
   * needed for Raft communication during bootstrap.
   * @param {Object} assignment - Base assignment from MessageGroupAssignment.
   * @param {Array<Object>} messageGroups - Existing message groups.
   * @return {Object} Assignment with peer addresses added.
   * @private
   */
  augmentAssignmentWithPeerAddresses(assignment, messageGroups) {
    if (stryMutAct_9fa48("11959")) {
      {}
    } else {
      stryCov_9fa48("11959");
      return this.bootstrapJoinAdmissionOwner.augmentAssignmentWithPeerAddresses(assignment, messageGroups);
    }
  }

  /**
   * Wait for partition leaders when live services are available.
   * @return {Promise<void>}
   * @private
   */
  async waitForPartitionLeaders() {
    if (stryMutAct_9fa48("11960")) {
      {}
    } else {
      stryCov_9fa48("11960");
      return this.serviceLeaderReadinessOwner.waitForPartitionLeaders();
    }
  }

  /**
   * Get all message groups from system cache.
   * Uses the system cache (fed by CDC) as the single source of truth.
   * @return {Array<Object>} Message groups.
   */
  getMessageGroups() {
    if (stryMutAct_9fa48("11961")) {
      {}
    } else {
      stryCov_9fa48("11961");
      return this.bootstrapJoinAdmissionOwner.getMessageGroups();
    }
  }

  /**
   * Resolve bootstrap-owned system-table rows from the same authoritative
   * source used when publishing bootstrap topology snapshots. This keeps
   * assignment selection, peer-address derivation, and bootstrap snapshot
   * publication on one canonical topology view.
   * @param {string} tableName
   * @return {Object[]}
   * @private
   */
  getBootstrapAuthoritativeTableRows(tableName) {
    if (stryMutAct_9fa48("11962")) {
      {}
    } else {
      stryCov_9fa48("11962");
      return this.bootstrapTopologySnapshotOwner.getBootstrapAuthoritativeTableRows(tableName);
    }
  }

  /**
   * Build complete system table snapshots for bootstrap response.
   * Reads all system tables from system cache and returns complete snapshots.
   *
   * System Cache Seeding Architecture:
   * - System cache is the single source of truth for cluster state
   * - Bootstrap response includes complete snapshots of default cache-sync tables:
   *   * nodes - All registered nodes with addresses and status
   *   * partitions - All partitions with key ranges and replica counts
   *   * services - All services (partition/message group replicas) with addresses and Raft roles
   *   * tables - All user tables with schemas and policies
   *   * message_groups - All message groups with replica counts
   *   * replica_operations - Any pending replica operations
   *   * indices, config, live_queries, contexts, code - additional system metadata
   * - High-volume logs table is intentionally excluded from default snapshots
   * - Joining nodes hydrate their cache from these snapshots
   * - After hydration, joining nodes can immediately read and write to system tables
   * - No bootstrap directories needed - system cache provides all routing information
   *
   * @return {Object} System table snapshots with arrays for each table.
   */
  buildSystemTableSnapshots() {
    if (stryMutAct_9fa48("11963")) {
      {}
    } else {
      stryCov_9fa48("11963");
      return this.bootstrapTopologySnapshotOwner.buildSystemTableSnapshots();
    }
  }

  /**
   * Build the bootstrap topology snapshot envelope published to joiners.
   * @param {Object} [options]
   * @param {Object|null} [options.currentEpoch]
   * @return {{systemTableSnapshots: Object, topologySnapshotMeta: Object}}
   */
  buildBootstrapTopologySnapshotEnvelope(options = {}) {
    if (stryMutAct_9fa48("11964")) {
      {}
    } else {
      stryCov_9fa48("11964");
      return this.bootstrapTopologySnapshotOwner.buildBootstrapTopologySnapshotEnvelope(options);
    }
  }

  /**
   * Prefer direct local partition reads over cache snapshots when available.
   * This keeps bootstrap snapshots authoritative even when cache propagation
   * briefly lags committed partition state during a multi-node join burst.
   * @param {string} tableName
   * @param {Object[]} cacheRows
   * @return {Object[]}
   * @private
   */
  resolveAuthoritativeSystemTableSnapshotRows(tableName, cacheRows = stryMutAct_9fa48("11965") ? ["Stryker was here"] : (stryCov_9fa48("11965"), [])) {
    if (stryMutAct_9fa48("11966")) {
      {}
    } else {
      stryCov_9fa48("11966");
      return this.bootstrapTopologySnapshotOwner.resolveAuthoritativeSystemTableSnapshotRows(tableName, cacheRows);
    }
  }

  /**
   * Read one system table directly from local partition replicas.
   * @param {string} tableName
   * @return {Object[][]}
   * @private
   */
  queryLocalAuthoritativePartitionRowSets(tableName) {
    if (stryMutAct_9fa48("11967")) {
      {}
    } else {
      stryCov_9fa48("11967");
      return this.bootstrapTopologySnapshotOwner.queryLocalAuthoritativePartitionRowSets(tableName);
    }
  }

  /**
   * Merge direct replica row sets by canonical primary key.
   * @param {string} tableName
   * @param {Object[][]} rowSets
   * @return {Object[]}
   * @private
   */
  mergeAuthoritativeSystemTableRowSets(tableName, rowSets) {
    if (stryMutAct_9fa48("11968")) {
      {}
    } else {
      stryCov_9fa48("11968");
      return this.bootstrapTopologySnapshotOwner.mergeAuthoritativeSystemTableRowSets(tableName, rowSets);
    }
  }

  /**
   * Prefer the freshest row when merging authoritative replica snapshots.
   * @param {Object} candidate
   * @param {Object} existing
   * @return {boolean}
   * @private
   */
  isAuthoritativeSnapshotRowNewer(candidate, existing) {
    if (stryMutAct_9fa48("11969")) {
      {}
    } else {
      stryCov_9fa48("11969");
      return this.bootstrapTopologySnapshotOwner.isAuthoritativeSnapshotRowNewer(candidate, existing);
    }
  }

  /**
   * Build latency topology hints for joining node bootstrap.
   * @param {string} nodeId - Joining node ID.
   * @return {Object}
   * @private
   */
  getLatencyTopologyHints(nodeId) {
    if (stryMutAct_9fa48("11970")) {
      {}
    } else {
      stryCov_9fa48("11970");
      return this.bootstrapTopologySnapshotOwner.getLatencyTopologyHints(nodeId);
    }
  }

  /**
   * Get service groups that are missing a leader.
   * @return {Object} Missing leader info by service type.
   * @private
   */
  getMissingServiceLeaders() {
    if (stryMutAct_9fa48("11971")) {
      {}
    } else {
      stryCov_9fa48("11971");
      return this.serviceLeaderReadinessOwner.getMissingServiceLeaders();
    }
  }

  /**
   * Build partition ID sets for bootstrap leader-readiness checks.
   * Required tables must have routable leaders before /bootstrap succeeds.
   * @return {Object} Known/required partition ID sets.
   * @private
   */
  getLeaderReadinessPartitionSets() {
    if (stryMutAct_9fa48("11972")) {
      {}
    } else {
      stryCov_9fa48("11972");
      return this.serviceLeaderReadinessOwner.getLeaderReadinessPartitionSets();
    }
  }

  /**
   * Build partition ID sets for one leader-readiness requirement set.
   * Required tables must have routable leaders before the owning concern
   * is considered fully ready.
   * @param {Array<string>} requiredTablesList
   * @return {Object} Known/required partition ID sets.
   * @private
   */
  getLeaderReadinessPartitionSetsForTables(requiredTablesList = stryMutAct_9fa48("11973") ? ["Stryker was here"] : (stryCov_9fa48("11973"), [])) {
    if (stryMutAct_9fa48("11974")) {
      {}
    } else {
      stryCov_9fa48("11974");
      return this.serviceLeaderReadinessOwner.getLeaderReadinessPartitionSetsForTables(requiredTablesList);
    }
  }

  /**
   * Keep missing-partition diagnostics focused on bootstrap-critical tables.
   * Unknown partition IDs are preserved for safety.
   * @param {Array<string>} partitionIds - Missing partition IDs.
   * @param {Array<string>} [requiredTablesList]
   * @return {Array<string>} Filtered missing IDs.
   * @private
   */
  filterMissingRequiredPartitionIds(partitionIds = stryMutAct_9fa48("11975") ? ["Stryker was here"] : (stryCov_9fa48("11975"), []), requiredTablesList) {
    if (stryMutAct_9fa48("11976")) {
      {}
    } else {
      stryCov_9fa48("11976");
      return this.serviceLeaderReadinessOwner.filterMissingRequiredPartitionIds(partitionIds, requiredTablesList);
    }
  }

  /**
   * Build cached leader metadata by service type and entity ID.
   * @param {string} serviceType - Service type value.
   * @param {string} idColumn - Column key for entity ID.
   * @return {Map<string, Object>} Entity ID -> metadata flags.
   * @private
   */
  getCachedLeaderMetadataByServiceType(serviceType, idColumn) {
    if (stryMutAct_9fa48("11977")) {
      {}
    } else {
      stryCov_9fa48("11977");
      return this.serviceLeaderReadinessOwner.getCachedLeaderMetadataByServiceType(serviceType, idColumn);
    }
  }

  /**
   * Determine whether a live service instance is currently leader.
   * @param {Object} service - Service instance.
   * @return {boolean} True when the service is leader.
   * @private
   */
  isLiveServiceLeader(service) {
    if (stryMutAct_9fa48("11978")) {
      {}
    } else {
      stryCov_9fa48("11978");
      return this.serviceLeaderReadinessOwner.isLiveServiceLeader(service);
    }
  }

  /**
   * Normalize leader readiness diagnostics for one required-table set.
   * @param {Object} missing - Missing-leader diagnostics.
   * @param {Array<string>} [requiredTablesList]
   * @return {Object} Normalized diagnostics.
   * @private
   */
  normalizeLeaderStatusForRequiredTables(missing = {}, requiredTablesList) {
    if (stryMutAct_9fa48("11979")) {
      {}
    } else {
      stryCov_9fa48("11979");
      return this.serviceLeaderReadinessOwner.normalizeLeaderStatusForRequiredTables(missing, requiredTablesList);
    }
  }

  /**
   * Keep bootstrap gating focused on partition leader metadata.
   * Message-group leader rows can lag during restart and move-replica
   * recovery without preventing a node from receiving bootstrap state.
   * @param {Object} missing - Normalized missing-leader diagnostics.
   * @return {Object} Blocking subset for POST /bootstrap.
   * @private
   */
  getBlockingLeaderStatusForReadiness(missing = {}) {
    if (stryMutAct_9fa48("11980")) {
      {}
    } else {
      stryCov_9fa48("11980");
      return this.serviceLeaderReadinessOwner.getBlockingLeaderStatusForReadiness(missing);
    }
  }

  /**
   * Wait for all service raft groups to have leaders with complete routing info.
   * This is critical for bootstrap - joining nodes need complete leader information
   * (raft_role, node_id, address) to route writes correctly.
   * @return {Promise<Object>} Leader readiness status.
   * @private
   */
  async waitForServiceLeaders(options = {}) {
    if (stryMutAct_9fa48("11981")) {
      {}
    } else {
      stryCov_9fa48("11981");
      return this.serviceLeaderReadinessOwner.waitForServiceLeaders(options);
    }
  }

  /**
   * Count total missing leader information from getMissingServiceLeaders result.
   * Includes leaders without addresses - these are useless for query routing.
   * @param {Object} missing - Result from getMissingServiceLeaders.
   * @return {number} Total count of missing leader info.
   * @private
   */
  countMissingLeaderInfo(missing) {
    if (stryMutAct_9fa48("11982")) {
      {}
    } else {
      stryCov_9fa48("11982");
      return this.serviceLeaderReadinessOwner.countMissingLeaderInfo(missing);
    }
  }

  /**
   * Get system partition leaders for new node to query.
   * Prefer live partition services when available to avoid races with cache updates.
   * Cache fallback is strict: partitions.leader_node_id must map to an active
   * partition service on that node.
   * @return {Object} Partition leader addresses by table name.
   */
  getSystemPartitionLeaders() {
    if (stryMutAct_9fa48("11983")) {
      {}
    } else {
      stryCov_9fa48("11983");
      return this.serviceLeaderReadinessOwner.getSystemPartitionLeaders();
    }
  }

  /**
   * Get the list of ready node IDs from the system cache.
   * Always includes the seed node since it's responding to the bootstrap request.
   * Uses ONLY the system cache - no fallbacks.
   * @return {string[]} Ready node IDs.
   */
  getReadyNodes(options = {}) {
    if (stryMutAct_9fa48("11984")) {
      {}
    } else {
      stryCov_9fa48("11984");
      return this.bootstrapClusterViewOwner.getReadyNodes(options);
    }
  }

  /**
   * Get table policies from the system tables.
   * Uses ONLY the system cache - no fallbacks.
   * @return {Object} Table policies keyed by table name.
   */
  getTablePolicies() {
    if (stryMutAct_9fa48("11985")) {
      {}
    } else {
      stryCov_9fa48("11985");
      return this.bootstrapClusterViewOwner.getTablePolicies();
    }
  }

  /**
   * Get the current assignment epoch from the seed node.
   * @return {Object|null} Current epoch data or null if unavailable.
   */
  getCurrentEpoch() {
    if (stryMutAct_9fa48("11986")) {
      {}
    } else {
      stryCov_9fa48("11986");
      return this.bootstrapClusterViewOwner.getCurrentEpoch();
    }
  }

  /**
   * Get cluster configuration for new node.
   * @return {Object} Cluster configuration.
   */
  getClusterConfiguration() {
    if (stryMutAct_9fa48("11987")) {
      {}
    } else {
      stryCov_9fa48("11987");
      return this.bootstrapClusterViewOwner.getClusterConfiguration();
    }
  }

  /**
   * Get current cluster state.
   * @return {Object} Cluster state.
   */
  getClusterState() {
    if (stryMutAct_9fa48("11988")) {
      {}
    } else {
      stryCov_9fa48("11988");
      return this.bootstrapClusterViewOwner.getClusterState();
    }
  }

  /**
   * Update node status - unsupported, status updates should go through CDC.
   * @param {string} _nodeId - Node ID (unused).
   * @param {string} _status - New status (unused).
   */
  updateNodeStatus(_nodeId, _status) {
    if (stryMutAct_9fa48("11989")) {
      {}
    } else {
      stryCov_9fa48("11989");
      this.logger.error(BOOTSTRAP_API_LOG_MSG.UPDATE_NODE_STATUS_UNSUPPORTED);
      throw new Error(BOOTSTRAP_API_ERROR.UPDATE_NODE_STATUS_UNSUPPORTED);
    }
  }

  /**
   * Get the Fastify instance.
   * @return {Object} Fastify instance.
   */
  getFastify() {
    if (stryMutAct_9fa48("11990")) {
      {}
    } else {
      stryCov_9fa48("11990");
      return this.fastify;
    }
  }

  /**
   * Get the ReplicaHandler instance.
   * @return {Object|null} Replica handler or null.
   */
  getReplicaHandler() {
    if (stryMutAct_9fa48("11991")) {
      {}
    } else {
      stryCov_9fa48("11991");
      return this.replicaHandler;
    }
  }

  /**
   * Check if the API is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("11992")) {
      {}
    } else {
      stryCov_9fa48("11992");
      return this.initialized;
    }
  }

  /**
   * Shutdown the API server.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("11993")) {
      {}
    } else {
      stryCov_9fa48("11993");
      this.stopMoveReplicaAssignmentSweep();
      const wasInitialized = stryMutAct_9fa48("11996") ? this.initialized !== true : stryMutAct_9fa48("11995") ? false : stryMutAct_9fa48("11994") ? true : (stryCov_9fa48("11994", "11995", "11996"), this.initialized === (stryMutAct_9fa48("11997") ? false : (stryCov_9fa48("11997"), true)));
      const hadFastify = Boolean(this.fastify);
      const serverListening = stryMutAct_9fa48("12000") ? this.fastify?.server?.listening !== true : stryMutAct_9fa48("11999") ? false : stryMutAct_9fa48("11998") ? true : (stryCov_9fa48("11998", "11999", "12000"), (stryMutAct_9fa48("12002") ? this.fastify.server?.listening : stryMutAct_9fa48("12001") ? this.fastify?.server.listening : (stryCov_9fa48("12001", "12002"), this.fastify?.server?.listening)) === (stryMutAct_9fa48("12003") ? false : (stryCov_9fa48("12003"), true)));
      if (stryMutAct_9fa48("12005") ? false : stryMutAct_9fa48("12004") ? true : (stryCov_9fa48("12004", "12005"), this.fastify)) {
        if (stryMutAct_9fa48("12006")) {
          {}
        } else {
          stryCov_9fa48("12006");
          const server = this.fastify.server;
          if (stryMutAct_9fa48("12009") ? server || typeof server.closeAllConnections === TYPEOF.FUNCTION : stryMutAct_9fa48("12008") ? false : stryMutAct_9fa48("12007") ? true : (stryCov_9fa48("12007", "12008", "12009"), server && (stryMutAct_9fa48("12011") ? typeof server.closeAllConnections !== TYPEOF.FUNCTION : stryMutAct_9fa48("12010") ? true : (stryCov_9fa48("12010", "12011"), typeof server.closeAllConnections === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("12012")) {
              {}
            } else {
              stryCov_9fa48("12012");
              server.closeAllConnections();
            }
          }
          await this.fastify.close();
          if (stryMutAct_9fa48("12015") ? server || typeof server.close === TYPEOF.FUNCTION : stryMutAct_9fa48("12014") ? false : stryMutAct_9fa48("12013") ? true : (stryCov_9fa48("12013", "12014", "12015"), server && (stryMutAct_9fa48("12017") ? typeof server.close !== TYPEOF.FUNCTION : stryMutAct_9fa48("12016") ? true : (stryCov_9fa48("12016", "12017"), typeof server.close === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("12018")) {
              {}
            } else {
              stryCov_9fa48("12018");
              await new Promise(resolve => {
                if (stryMutAct_9fa48("12019")) {
                  {}
                } else {
                  stryCov_9fa48("12019");
                  server.close(error => {
                    if (stryMutAct_9fa48("12020")) {
                      {}
                    } else {
                      stryCov_9fa48("12020");
                      if (stryMutAct_9fa48("12023") ? error || error.code !== BOOTSTRAP_API_CLOSE_ERROR_CODE : stryMutAct_9fa48("12022") ? false : stryMutAct_9fa48("12021") ? true : (stryCov_9fa48("12021", "12022", "12023"), error && (stryMutAct_9fa48("12025") ? error.code === BOOTSTRAP_API_CLOSE_ERROR_CODE : stryMutAct_9fa48("12024") ? true : (stryCov_9fa48("12024", "12025"), error.code !== BOOTSTRAP_API_CLOSE_ERROR_CODE)))) {
                        if (stryMutAct_9fa48("12026")) {
                          {}
                        } else {
                          stryCov_9fa48("12026");
                          this.logger.warn(BOOTSTRAP_API_LOG_MSG.SERVER_CLOSE_ERROR, stryMutAct_9fa48("12027") ? {} : (stryCov_9fa48("12027"), {
                            error: error.message
                          }));
                        }
                      }
                      resolve();
                    }
                  });
                }
              });
            }
          }
          if (stryMutAct_9fa48("12030") ? server || typeof server.unref === TYPEOF.FUNCTION : stryMutAct_9fa48("12029") ? false : stryMutAct_9fa48("12028") ? true : (stryCov_9fa48("12028", "12029", "12030"), server && (stryMutAct_9fa48("12032") ? typeof server.unref !== TYPEOF.FUNCTION : stryMutAct_9fa48("12031") ? true : (stryCov_9fa48("12031", "12032"), typeof server.unref === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("12033")) {
              {}
            } else {
              stryCov_9fa48("12033");
              server.unref();
            }
          }
          this.fastify = null;
        }
      }
      this.initialized = stryMutAct_9fa48("12034") ? true : (stryCov_9fa48("12034"), false);
      this.logger.info(BOOTSTRAP_API_LOG_MSG.SHUTDOWN, stryMutAct_9fa48("12035") ? {} : (stryCov_9fa48("12035"), {
        seedNodeId: this.seedNodeId,
        wasInitialized,
        hadFastify,
        serverListening
      }));
    }
  }
}
export { BootstrapAPI, BootstrapStrategy };