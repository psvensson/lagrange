/**
 * Bootstrap API - REST API for node bootstrap and discovery.
 * Implements /bootstrap endpoint for new node registration.
 *
 * Architecture:
 * - `systemTableCache` is the raw observed cluster view
 * - `BootstrapTopologySnapshotOwner` publishes the stabilized authority view
 *   used for bootstrap topology answers during convergence
 * - Bootstrap response contains default cache-sync table snapshots derived
 *   from that published authority view
 * - Joining nodes hydrate their cache from these snapshots
 * - After hydration, steady-state partition enumeration uses system cache,
 *   while canonical leader decisions for critical partitions may still route
 *   through the bootstrap authority owner
 *
 * Requirements: 1.2, 7.2, 7.3, 7.4
 */

import Fastify from 'fastify';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  COLUMN,
  ERRNO,
  HTTP_STATUS,
  HOST,
  NUM,
  SERVICE_STATUS,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {
  BOOTSTRAP_ASSIGNMENT_STRATEGY,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from './bootstrap-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {NODE_CONFIG_KEY, NODE_DEFAULT} from '../node/node-constants.js';
import {
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_CLOSE_ERROR_CODE,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_HEALTH_STATUS,
  BOOTSTRAP_API_HEALTH_STATUS_INITIALIZING,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_ROUTE,
  BOOTSTRAP_API_SUBSYSTEM,
} from './bootstrap-api-constants.js';
import {
  BootstrapReadinessState,
} from './bootstrap-readiness-state.js';
import {
  CONTROL_PLANE_ROLLOUT_REQUIRED,
  assertRequiredControlPlaneRollout,
} from '../runtime/control-plane-rollout-controls.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';
import {
  CONTROL_PLANE_PHASE_SCOPE,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {ServiceRegistrationVisibilityOwner} from
  './owners/service-registration-visibility-owner.js';
import {ServiceRegistrationHandoffOwner} from
  './owners/service-registration-handoff-owner.js';
import {ServiceLeaderReadinessOwner} from
  './owners/service-leader-readiness-owner.js';
import {MoveReplicaAssignmentOwner} from
  './owners/move-replica-assignment-owner.js';
import {MoveReplicaHandoffOwner} from
  './owners/move-replica-handoff-owner.js';
import {BootstrapTopologySnapshotOwner} from
  './owners/bootstrap-topology-snapshot-owner.js';
import {BootstrapJoinAdmissionOwner} from
  './owners/bootstrap-join-admission-owner.js';
import {BootstrapReadinessOwner} from
  './owners/bootstrap-readiness-owner.js';
import {BootstrapRequestOwner} from
  './owners/bootstrap-request-owner.js';
import {BootstrapClusterViewOwner} from
  './owners/bootstrap-cluster-view-owner.js';
import {createBootstrapApiRuntimeMethods} from
  './bootstrap-api-runtime-methods.js';

/**
 * Bootstrap response strategies.
 */
const BootstrapStrategy = BOOTSTRAP_ASSIGNMENT_STRATEGY;
const BOOTSTRAP_CONTROL_PLANE_READ_PROFILE =
  buildControlPlaneWorkloadProfile(
    CONTROL_PLANE_WORKLOAD_CLASS.BOOTSTRAP_CONTROL_PLANE_READ,
  );
const BOOTSTRAP_CONTROL_PLANE_MUTATION_PROFILE =
  buildControlPlaneWorkloadProfile(
    CONTROL_PLANE_WORKLOAD_CLASS.BOOTSTRAP_CONTROL_PLANE_MUTATION,
  );
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
    this.rolloutControls = assertRequiredControlPlaneRollout({
      owner: 'BootstrapAPI',
      controls: options.rolloutControls,
      required: CONTROL_PLANE_ROLLOUT_REQUIRED.BOOTSTRAP_API,
    });
    this.controlPlaneWriteHealthProvider =
      typeof options.controlPlaneWriteHealthProvider === TYPEOF.FUNCTION ?
        options.controlPlaneWriteHealthProvider :
        null;
    this.bootstrapStartupAdapter =
      options.bootstrapStartupAdapter || options.bootstrapService || null;
    this.runtimeOwner =
      options.runtimeOwner ||
      this.bootstrapStartupAdapter?.runtimeDependencyOwner ||
      options.bootstrapService?.runtimeDependencyOwner ||
      null;
    this.startupRecoveryCoordinator =
      options.startupRecoveryCoordinator ||
      this.runtimeOwner?.rebalanceCoordinator?.startupRecoveryCoordinator ||
      null;
    this.systemTableCache = options.systemTableCache || null;
    this.seedNodeId = options.seedNodeId || null;
    this.seedNodeAddress = options.seedNodeAddress || null;
    this.seedNodeWsAddress = options.seedNodeWsAddress || null;
    this.wsPort = options.wsPort || null;
    this.messageGroupServices = options.messageGroupServices || new Map();
    this.partitionServices = options.partitionServices || new Map();
    this.replicaHandler = options.replicaHandler || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.cdcIntegrationService = options.cdcIntegrationService ||
      this.runtimeOwner?.cdcIntegrationService ||
      null;
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService ||
      this.runtimeOwner?.controlPlaneReadinessService ||
      this.bootstrapStartupAdapter?.rebalanceCoordinator
        ?.controlPlaneReadinessService ||
      this.bootstrapStartupAdapter?.controlPlaneReadinessService ||
      null;
    this.epochManager = options.epochManager || null;
    this.messageRouter = options.messageRouter || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      createControlPlaneRuntimeBundle({
        nodeId: this.seedNodeId || BOOTSTRAP_API_SUBSYSTEM,
        getSqlQueryEngine: () => this.getSqlQueryEngine(),
        getCdcIntegrationService: () => this.getCdcIntegrationService(),
        getSystemTableCache: () => this.getSystemTableCache(),
        getMessageRouter: () => this.messageRouter,
      }).controlPlaneSystemTableGateway;
    this.authoritativeControlPlaneView =
      options.authoritativeControlPlaneView || null;
    this.maxConcurrentBootstrapRequests =
      Number.isFinite(options.maxConcurrentBootstrapRequests) &&
        options.maxConcurrentBootstrapRequests > NUM.ZERO ?
        Math.floor(options.maxConcurrentBootstrapRequests) :
        BOOTSTRAP_API_DEFAULT.MAX_CONCURRENT_BOOTSTRAP_REQUESTS;
    this.bootstrapAdmissionRetryAfterMs =
      Number.isFinite(options.bootstrapAdmissionRetryAfterMs) &&
        options.bootstrapAdmissionRetryAfterMs > NUM.ZERO ?
        Math.floor(options.bootstrapAdmissionRetryAfterMs) :
        BOOTSTRAP_API_DEFAULT.BOOTSTRAP_ADMISSION_RETRY_AFTER_MS;
    this.inFlightBootstrapRequestCount = NUM.ZERO;
    this.moveReplicaAssignmentLeaseMs = Number.isFinite(options.moveReplicaAssignmentLeaseMs) ?
      Math.max(NUM.ONE, Math.floor(options.moveReplicaAssignmentLeaseMs)) :
      BOOTSTRAP_API_DEFAULT.MOVE_REPLICA_ASSIGNMENT_LEASE_MS;
    this.moveReplicaAssignmentSweepIntervalMs =
      Number.isFinite(options.moveReplicaAssignmentSweepIntervalMs) ?
        Math.max(NUM.ONE, Math.floor(options.moveReplicaAssignmentSweepIntervalMs)) :
        BOOTSTRAP_API_DEFAULT.MOVE_REPLICA_ASSIGNMENT_SWEEP_INTERVAL_MS;
    this.ownsMoveReplicaAssignmentLifecycle =
      typeof options.ownsMoveReplicaAssignmentLifecycle === TYPEOF.BOOLEAN ?
        options.ownsMoveReplicaAssignmentLifecycle :
        Boolean(options.bootstrapStartupAdapter || options.bootstrapService);
    this.moveReplicaAssignmentReservations = new Map();
    this.moveReplicaAssignmentSweepTimer = null;
    this.readinessState = options.readinessState ||
      new BootstrapReadinessState({
        readyStableWindowMs: options.readyStableWindowMs,
        demotionFailureThreshold: options.demotionFailureThreshold,
        retryAfterMs: options.retryAfterMs,
      });

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.port = config.get(NODE_CONFIG_KEY.REST_API_PORT) ||
      NODE_DEFAULT.REST_API_PORT;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(BOOTSTRAP_API_SUBSYSTEM) : console;
    this.serviceRegistrationVisibilityOwner =
      new ServiceRegistrationVisibilityOwner({
        delegates: {
          getSystemTableCache: () => this.getSystemTableCache(),
          executeBootstrapControlPlaneQuery: (sql, params) =>
            this.executeBootstrapControlPlaneQuery(sql, params),
          getCdcIntegrationService: () => this.getCdcIntegrationService(),
          buildRegisterServiceValidationError: (...args) =>
            this.buildRegisterServiceValidationError(...args),
          getLogger: () => this.logger,
        },
      });
    this.moveReplicaHandoffOwner =
      new MoveReplicaHandoffOwner({
        delegates: {
          getLogger: () => this.logger,
          getSeedNodeId: () => this.seedNodeId,
          getSeedNodeAddress: () => this.seedNodeAddress,
          getSystemTableCache: () => this.getSystemTableCache(),
          getMessageGroupServices: () => this.messageGroupServices,
          getMessageRouter: () =>
            this.messageRouter ||
            this.runtimeOwner?.messageRouter ||
            this.bootstrapStartupAdapter?.messageRouter ||
            null,
          getMoveReplicaAssignmentReservations: () =>
            this.moveReplicaAssignmentReservations,
          buildRegisterServiceValidationError: (...args) =>
            this.buildRegisterServiceValidationError(...args),
          buildRegisteredServiceMutationRow: (serviceData) =>
            this.buildRegisteredServiceMutationRow(serviceData),
          executeBootstrapControlPlaneMutation: (operation, options) =>
            this.executeBootstrapControlPlaneMutation(operation, options),
          buildBootstrapControlPlaneQueryError: (result, fallbackMessage) =>
            this.buildBootstrapControlPlaneQueryError(result, fallbackMessage),
          waitForRegisteredServiceCacheVisibility: (expectedService) =>
            this.waitForRegisteredServiceCacheVisibility(expectedService),
          insertMoveReplicaHandoffOperation: (handoffContext) =>
            this.insertMoveReplicaHandoffOperation(handoffContext),
          updateMoveReplicaHandoffOperation: (handoffContext) =>
            this.updateMoveReplicaHandoffOperation(handoffContext),
        },
      });
    this.serviceRegistrationHandoffOwner =
      new ServiceRegistrationHandoffOwner({
        delegates: {
          getLogger: () => this.logger,
          getSqlQueryEngine: () => this.getSqlQueryEngine(),
          validateMoveReplicaAssignmentToken: (serviceData) =>
            this.validateMoveReplicaAssignmentToken(serviceData),
          assertSingleOwnerReplicaRegistration: (serviceData, assignmentContext) =>
            this.assertSingleOwnerReplicaRegistration(
              serviceData,
              assignmentContext,
            ),
          startMoveReplicaHandoff: (serviceData, assignmentContext) =>
            this.startMoveReplicaHandoff(serviceData, assignmentContext),
          readCurrentRegisteredServiceRow: (serviceId) =>
            this.readCurrentRegisteredServiceRow(serviceId),
          executeMoveReplicaHandoffPhase: (...args) =>
            this.executeMoveReplicaHandoffPhase(...args),
          verifyMoveReplicaHandoffTarget: (handoffContext, serviceData) =>
            this.verifyMoveReplicaHandoffTarget(handoffContext, serviceData),
          buildRegisteredServiceMutationRow: (serviceData) =>
            this.buildRegisteredServiceMutationRow(serviceData),
          executeBootstrapControlPlaneMutation: (operation, options) =>
            this.executeBootstrapControlPlaneMutation(operation, options),
          buildBootstrapControlPlaneQueryError: (result, fallbackMessage) =>
            this.buildBootstrapControlPlaneQueryError(result, fallbackMessage),
          buildBootstrapControlPlaneMutationError: (error, tableName, fallbackMessage) =>
            this.buildBootstrapControlPlaneMutationError(
              error,
              tableName,
              fallbackMessage,
            ),
          buildExpectedRegisteredServiceData: (serviceData) =>
            this.buildExpectedRegisteredServiceData(serviceData),
          waitForRegisteredServiceCacheVisibility: (expectedService) =>
            this.waitForRegisteredServiceCacheVisibility(expectedService),
          removeLocalSourceReplicaForMoveReplica: (serviceData) =>
            this.removeLocalSourceReplicaForMoveReplica(serviceData),
          completeMoveReplicaHandoff: (handoffContext) =>
            this.completeMoveReplicaHandoff(handoffContext),
          restoreRegisteredServiceRowAfterFailedHandoff:
            (previousServiceRow, requestedServiceData, error) =>
              this.restoreRegisteredServiceRowAfterFailedHandoff(
                previousServiceRow,
                requestedServiceData,
                error,
              ),
          shouldPreserveMoveReplicaHandoffReservation:
            (handoffContext, error, sourceRemovalCompleted) =>
              this.shouldPreserveMoveReplicaHandoffReservation(
                handoffContext,
                error,
                sourceRemovalCompleted,
              ),
          failMoveReplicaHandoff: (handoffContext, error) =>
            this.failMoveReplicaHandoff(handoffContext, error),
        },
      });
    this.moveReplicaAssignmentOwner =
      new MoveReplicaAssignmentOwner({
        delegates: {
          getSeedNodeId: () => this.seedNodeId,
          getSystemTableCache: () => this.getSystemTableCache(),
          getBootstrapAuthoritativeTableRows: (tableName) =>
            this.getBootstrapAuthoritativeTableRows(tableName),
          isBootstrapAuthoritativeTableRowNewer: (candidate, existing) =>
            this.isAuthoritativeSnapshotRowNewer(candidate, existing),
          getMessageGroupServices: () => this.messageGroupServices,
          getSqlQueryEngine: () => this.getSqlQueryEngine(),
          getLogger: () => this.logger,
          getMessageRouter: () =>
            this.messageRouter ||
            this.runtimeOwner?.messageRouter ||
            this.bootstrapStartupAdapter?.messageRouter ||
            null,
          getMoveReplicaAssignmentReservations: () =>
            this.moveReplicaAssignmentReservations,
          getMoveReplicaAssignmentLeaseMs: () =>
            this.moveReplicaAssignmentLeaseMs,
          getMoveReplicaAssignmentSweepIntervalMs: () =>
            this.moveReplicaAssignmentSweepIntervalMs,
          getBootstrapAdmissionRetryAfterMs: () =>
            this.bootstrapAdmissionRetryAfterMs,
          executeBootstrapControlPlaneQuery: (sql, params) =>
            this.executeBootstrapControlPlaneQuery(sql, params),
          executeBootstrapControlPlaneMutation: (mutation, mutationOptions) =>
            this.executeBootstrapControlPlaneMutation(
              mutation,
              mutationOptions,
            ),
          buildBootstrapControlPlaneQueryError: (result, message) =>
            this.buildBootstrapControlPlaneQueryError(result, message),
          buildRegisterServiceValidationError:
            (statusCode, message, code, options) =>
              this.buildRegisterServiceValidationError(
                statusCode,
                message,
                code,
                options,
              ),
        },
      });
    this.bootstrapTopologySnapshotOwner =
      new BootstrapTopologySnapshotOwner({
        delegates: {
          getSystemTableCache: () => this.getSystemTableCache(),
          getPartitionServices: () => this.partitionServices,
          getSeedNodeId: () => this.seedNodeId,
          getLogger: () => this.logger,
          getCurrentEpoch: () => this.getCurrentEpoch(),
        },
      });
    if (typeof this.sqlQueryEngine?.queryExecutor
      ?.setBootstrapTopologySnapshotOwner === 'function') {
      this.sqlQueryEngine.queryExecutor.setBootstrapTopologySnapshotOwner(
        this.bootstrapTopologySnapshotOwner,
      );
    }
    this.bootstrapJoinAdmissionOwner =
      new BootstrapJoinAdmissionOwner({
        delegates: {
          getSeedNodeId: () => this.seedNodeId,
          getSeedNodeAddress: () => this.seedNodeAddress,
          getSystemTableCache: () => this.getSystemTableCache(),
          getLogger: () => this.logger,
          getCdcIntegrationService: () => this.getCdcIntegrationService(),
          getMessageRouter: () =>
            this.messageRouter ||
            this.runtimeOwner?.messageRouter ||
            this.bootstrapStartupAdapter?.messageRouter ||
            null,
          getAuthoritativeControlPlaneViewInstance: () =>
            this.authoritativeControlPlaneView,
          setAuthoritativeControlPlaneViewInstance: (view) => {
            this.authoritativeControlPlaneView = view || null;
          },
          getBootstrapAuthoritativeTableRows: (tableName) =>
            this.getBootstrapAuthoritativeTableRows(tableName),
          expireMoveReplicaAssignmentReservations: () =>
            this.expireMoveReplicaAssignmentReservations(),
          getActiveMoveReplicaAssignmentReservations: () =>
            this.getActiveMoveReplicaAssignmentReservations(),
          getBlockingMoveReplicaBootstrapAdmissions: (now) =>
            this.getBlockingMoveReplicaBootstrapAdmissions(now),
          getMoveReplicaBootstrapExclusionReservations: (now) =>
            this.moveReplicaAssignmentOwner
              .getMoveReplicaBootstrapExclusionReservations(now),
          reserveMoveReplicaAssignment: (targetNodeId, assignment) =>
            this.reserveMoveReplicaAssignment(targetNodeId, assignment),
        },
      });
    this.bootstrapReadinessOwner =
      new BootstrapReadinessOwner({
        delegates: {
          getSeedNodeId: () => this.seedNodeId,
          getReadinessState: () => this.readinessState,
          getBootstrapService: () => this.bootstrapStartupAdapter,
          getMessageRouter: () => this.messageRouter,
          getSqlQueryEngine: () => this.getSqlQueryEngine(),
          getControlPlaneReadinessService: () =>
            this.getControlPlaneReadinessService(),
          getControlPlaneWriteHealthProvider: () =>
            this.controlPlaneWriteHealthProvider,
          getStartupRecoveryCoordinator: () =>
            this.startupRecoveryCoordinator,
          getLeaderReadinessStatusForProbe: () =>
            this.getLeaderReadinessStatusForProbe(),
          getLogger: () => this.logger,
        },
      });
    this.bootstrapRequestOwner =
      new BootstrapRequestOwner({
        delegates: {
          getLogger: () => this.logger,
          getSeedNodeId: () => this.seedNodeId,
          getSeedNodeAddress: () => this.seedNodeAddress,
          getSeedNodeWsAddress: () => this.seedNodeWsAddress,
          getWsPort: () => this.wsPort,
          getBootstrapService: () => this.bootstrapStartupAdapter,
          getMaxConcurrentBootstrapRequests: () =>
            this.maxConcurrentBootstrapRequests,
          getBootstrapAdmissionRetryAfterMs: () =>
            this.bootstrapAdmissionRetryAfterMs,
          getInFlightBootstrapRequestCount: () =>
            this.inFlightBootstrapRequestCount,
          setInFlightBootstrapRequestCount: (count) => {
            this.inFlightBootstrapRequestCount = count;
          },
          validateBootstrapRequest: (nodeId, nodeAddress) =>
            this.validateBootstrapRequest(nodeId, nodeAddress),
          checkForConflicts: (nodeId, nodeAddress) =>
            this.checkForConflicts(nodeId, nodeAddress),
          getBlockingMoveReplicaBootstrapAdmissions: (now) =>
            this.getBlockingMoveReplicaBootstrapAdmissions(now),
          resolveMoveReplicaBootstrapAdmissionRetryAfterMs:
            (reservation, now) =>
              this.resolveMoveReplicaBootstrapAdmissionRetryAfterMs(
                reservation,
                now,
              ),
          buildBootstrapNotReadyResponse: (options) =>
            this.buildBootstrapNotReadyResponse(options),
          waitForServiceLeaders: (options) => this.waitForServiceLeaders(options),
          determineAndReserveMessageGroupAssignment: (nodeId, options) =>
            this.determineAndReserveMessageGroupAssignment(nodeId, options),
          getCurrentEpoch: () => this.getCurrentEpoch(),
          buildBootstrapResponseTopologySnapshotEnvelope: (options) =>
            this.buildBootstrapResponseTopologySnapshotEnvelope(options),
          getClusterConfiguration: () => this.getClusterConfiguration(),
          getReadyNodes: (options) => this.getReadyNodes(options),
          getTablePolicies: () => this.getTablePolicies(),
          getLatencyTopologyHints: (nodeId) =>
            this.getLatencyTopologyHints(nodeId),
        },
      });
    this.bootstrapClusterViewOwner =
      new BootstrapClusterViewOwner({
        delegates: {
          getSystemTableCache: () => this.getSystemTableCache(),
          getSeedNodeId: () => this.seedNodeId,
          getSeedNodeAddress: () => this.seedNodeAddress,
          getMessageGroups: () => this.getMessageGroups(),
          getControlPlaneReadinessService: () =>
            this.getControlPlaneReadinessService(),
          getEpochManager: () =>
            this.epochManager || this.bootstrapStartupAdapter?.getEpochManager?.(),
        },
      });
    this.serviceLeaderReadinessOwner =
      new ServiceLeaderReadinessOwner({
        delegates: {
          getSystemTableCache: () => this.getSystemTableCache(),
          getPartitionServices: () => this.partitionServices,
          getBootstrapService: () => this.bootstrapStartupAdapter,
          getSeedNodeId: () => this.seedNodeId,
          getMissingServiceLeaders: () =>
            this.getMissingServiceLeaders ===
              BootstrapAPI.prototype.getMissingServiceLeaders ?
              null :
              this.getMissingServiceLeaders(),
          getLogger: () => this.logger,
        },
      });

    // Fastify instance
    this.fastify = null;
    this.initialized = false;
  }

  /**
   * Set the SQL query engine for distributed queries.
   * Called after initialization when the engine becomes available.
   * @param {Object} sqlQueryEngine - SQL query engine instance.
   */
  setSqlQueryEngine(sqlQueryEngine) {
    this.sqlQueryEngine = sqlQueryEngine;
    if (typeof this.sqlQueryEngine?.queryExecutor
      ?.setBootstrapTopologySnapshotOwner === 'function') {
      this.sqlQueryEngine.queryExecutor.setBootstrapTopologySnapshotOwner(
        this.bootstrapTopologySnapshotOwner,
      );
    }
    if (this.partitionServices &&
        typeof this.partitionServices.values === 'function') {
      for (const partitionService of this.partitionServices.values()) {
        if (!partitionService || typeof partitionService !== 'object') {
          continue;
        }
        if (typeof partitionService.setSqlQueryEngine === 'function') {
          partitionService.setSqlQueryEngine(sqlQueryEngine);
          continue;
        }
        partitionService.sqlQueryEngine = sqlQueryEngine;
      }
    }
    this.logger.debug(BOOTSTRAP_API_LOG_MSG.SQL_ENGINE_SET);
  }

  /**
   * Set the canonical CDC integration dependency used by bootstrap-owned
   * mutation ingress and authoritative repair/read helpers.
   * @param {Object|null} cdcIntegrationService
   */
  setCdcIntegrationService(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService || null;
    if (this.authoritativeControlPlaneView &&
        this.authoritativeControlPlaneView.cdcIntegrationService !==
          this.cdcIntegrationService) {
      this.authoritativeControlPlaneView = null;
    }
  }

  /**
   * Resolve the canonical CDC integration dependency used by bootstrap-owned
   * control-plane reads, writes, and cache repair.
   * @return {Object|null}
   * @private
   */
  getCdcIntegrationService() {
    return this.cdcIntegrationService ||
      this.runtimeOwner?.cdcIntegrationService ||
      null;
  }

  /**
   * Resolve the live SQL engine for bootstrap-owned reads, writes, and probes.
   * Prefer the explicitly hydrated engine, then fall back to the runtime owner
   * or CDC integration service when the bootstrap API outlives startup-time
   * attachment ordering.
   * @return {Object|null}
   * @private
   */
  getSqlQueryEngine() {
    return this.sqlQueryEngine ||
      this.runtimeOwner?.getSqlQueryEngine?.() ||
      this.runtimeOwner?.sqlQueryEngine ||
      this.getCdcIntegrationService()?.sqlQueryEngine ||
      this.bootstrapStartupAdapter?.getSqlQueryEngine?.() ||
      this.bootstrapStartupAdapter?.sqlQueryEngine ||
      null;
  }

  /**
   * Resolve the live system-table cache for bootstrap-owned reads.
   * Prefer the explicitly hydrated cache, then fall back to the runtime owner
   * or legacy startup adapter when the bootstrap API outlives startup wiring.
   * @return {Object|null}
   * @private
   */
  getSystemTableCache() {
    return this.systemTableCache ||
      this.runtimeOwner?.systemTableCache ||
      this.bootstrapStartupAdapter?.getSystemTableCache?.() ||
      this.bootstrapStartupAdapter?.systemTableCache ||
      null;
  }

  /**
   * Execute one bootstrap-owned control-plane query using
   * control-plane-recovery eligibility semantics.
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @return {Promise<Object>}
   * @private
   */
  async executeBootstrapControlPlaneQuery(sql, params = []) {
    const controlPlaneSystemTableGateway =
      this.getControlPlaneSystemTableGateway();
    if (!controlPlaneSystemTableGateway ||
        typeof controlPlaneSystemTableGateway.executeQuery !== TYPEOF.FUNCTION) {
      throw new Error(BOOTSTRAP_API_ERROR.SQL_ENGINE_UNAVAILABLE);
    }
    return controlPlaneSystemTableGateway.executeQuery(sql, params, {
      owner: BOOTSTRAP_API_SUBSYSTEM,
      workloadClass: BOOTSTRAP_CONTROL_PLANE_READ_PROFILE.workloadClass,
      workClass: BOOTSTRAP_CONTROL_PLANE_READ_PROFILE.workClass,
      deliveryPriority: 'critical',
      enforcePressureAdmission: true,
      allowPressureDefer:
        BOOTSTRAP_CONTROL_PLANE_READ_PROFILE.allowPressureDefer,
      allowPressureDegrade:
        BOOTSTRAP_CONTROL_PLANE_READ_PROFILE.allowPressureDegrade,
      resourceKeys: BOOTSTRAP_CONTROL_PLANE_READ_PROFILE.resourceKeys,
      pressureRetryAfterMs: this.bootstrapAdmissionRetryAfterMs,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    });
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
    const controlPlaneSystemTableGateway =
      this.getControlPlaneSystemTableGateway();
    if (!controlPlaneSystemTableGateway ||
        typeof controlPlaneSystemTableGateway.submitMutation !== TYPEOF.FUNCTION) {
      throw new Error(BOOTSTRAP_API_ERROR.SQL_ENGINE_UNAVAILABLE);
    }
    const result = await controlPlaneSystemTableGateway.submitMutation(mutation, {
      owner: BOOTSTRAP_API_SUBSYSTEM,
      workloadClass:
        BOOTSTRAP_CONTROL_PLANE_MUTATION_PROFILE.workloadClass,
      workClass: BOOTSTRAP_CONTROL_PLANE_MUTATION_PROFILE.workClass,
      deliveryPriority: 'critical',
      allowPressureDefer:
        BOOTSTRAP_CONTROL_PLANE_MUTATION_PROFILE.allowPressureDefer,
      allowPressureDegrade:
        BOOTSTRAP_CONTROL_PLANE_MUTATION_PROFILE.allowPressureDegrade,
      resourceKeys: BOOTSTRAP_CONTROL_PLANE_MUTATION_PROFILE.resourceKeys,
      pressureRetryAfterMs: this.bootstrapAdmissionRetryAfterMs,
      phaseScope: CONTROL_PLANE_PHASE_SCOPE.BOOTSTRAP,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      ...options,
    });
    if (result?.success !== false) {
      this.bootstrapTopologySnapshotOwner
        ?.invalidateAuthoritativeSystemTableSnapshotRows();
    }
    return result;
  }

  /**
   * Resolve the canonical shared-metadata query gateway for bootstrap-owned
   * control-plane reads and writes.
   * @return {ControlPlaneSystemTableGateway|null}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    return this.controlPlaneSystemTableGateway;
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
    if (!result || result.success !== false) {
      return false;
    }
    return isRetryableControlPlaneError(result);
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
    const message =
      typeof result?.error === TYPEOF.STRING && result.error.length > NUM.ZERO ?
        result.error :
        fallbackMessage;
    if (this.isRetryableBootstrapControlPlaneQueryFailure(result)) {
      const error = new Error(message);
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      error.errorCode =
        typeof result?.errorCode === TYPEOF.STRING &&
          result.errorCode.length > NUM.ZERO ?
          result.errorCode :
          BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY;
      const retryAfterMs = Number.isFinite(result?.retryAfterMs) ?
        Math.max(NUM.ZERO, Math.floor(result.retryAfterMs)) :
        this.bootstrapAdmissionRetryAfterMs;
      error.retryAfterMs = retryAfterMs;
      const pressure =
        typeof result?.pressureAction === TYPEOF.STRING &&
          result.pressureAction.length > NUM.ZERO ||
          typeof result?.pressureReason === TYPEOF.STRING &&
          result.pressureReason.length > NUM.ZERO ||
          typeof result?.pressureSummary === TYPEOF.STRING &&
          result.pressureSummary.length > NUM.ZERO ?
          Object.freeze({
            state: 'present',
            ...(typeof result?.pressureAction === TYPEOF.STRING &&
              result.pressureAction.length > NUM.ZERO ?
              {
                action: result.pressureAction,
              } :
              {}),
            ...(typeof result?.pressureReason === TYPEOF.STRING &&
              result.pressureReason.length > NUM.ZERO ?
              {
                reason: result.pressureReason,
              } :
              {}),
            ...(typeof result?.pressureSummary === TYPEOF.STRING &&
              result.pressureSummary.length > NUM.ZERO ?
              {
                summary: result.pressureSummary,
              } :
              {}),
          }) :
          Object.freeze({
            state: 'none',
          });
      error.details = {
        pressure,
        ...(pressure.state === 'present' && pressure.action ?
          {
            pressureAction: pressure.action,
          } :
          {}),
        ...(pressure.state === 'present' && pressure.reason ?
          {
            pressureReason: pressure.reason,
          } :
          {}),
        ...(pressure.state === 'present' && pressure.summary ?
          {
            pressureSummary: pressure.summary,
          } :
          {}),
        ...(typeof result?.tableName === TYPEOF.STRING &&
          result.tableName.length > NUM.ZERO ?
          {
            tableName: result.tableName,
          } :
          {}),
      };
      return error;
    }
    return new Error(message);
  }

  /**
   * Initialize and start the API server.
   * @param {number} port - Port to listen on (optional, 0 for random port).
   * @param {Object} [options] - Initialization options.
   * @param {boolean} [options.listen] - Whether to listen on a TCP port.
   * @return {Promise<void>}
   */
  async initialize(port, options = {}) {
    if (this.initialized) {
      return;
    }

    // Use provided port (including 0 for random), or fall back to configured port
    const listenPort = port !== undefined ? port : this.port;
    const shouldListen = options.listen !== false;

    this.fastify = Fastify({
      logger: false, // We use our own logger
    });

    this.startMoveReplicaAssignmentSweep();

    // Register routes
    this.registerRoutes();

    // Start server if required
    if (shouldListen) {
      try {
        await this.fastify.listen({port: listenPort, host: HOST.ANY});
      } catch (err) {
        // Some sandboxes disallow binding to 0.0.0.0; fall back to localhost.
        if (err && (err.code === ERRNO.EPERM || err.code === ERRNO.EACCES)) {
          await this.fastify.listen({port: listenPort, host: HOST.LOCALHOST});
        } else {
          throw err;
        }
      }
    } else {
      await this.fastify.ready();
    }
    this.initialized = true;

    this.logger.info(BOOTSTRAP_API_LOG_MSG.STARTED, {
      port: shouldListen ? listenPort : null,
      listen: shouldListen,
      seedNodeId: this.seedNodeId,
    });
  }

  /**
   * Register API routes.
   * @private
   */
  registerRoutes() {
    // Process liveness probe (does not assert join readiness).
    this.fastify.get(BOOTSTRAP_API_ROUTE.LIVEZ, async (_request, reply) => {
      return this.handleLivenessProbeRequest(reply);
    });

    // One-time startup completion probe.
    this.fastify.get(BOOTSTRAP_API_ROUTE.STARTUPZ, async (_request, reply) => {
      return this.handleStartupProbeRequest(reply);
    });

    // Readiness probe for join/admin traffic.
    this.fastify.get(BOOTSTRAP_API_ROUTE.READYZ, async (_request, reply) => {
      return this.handleReadinessProbeRequest(reply);
    });

    // Lightweight bootstrap-join readiness probe.
    this.fastify.get(BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY, async (_request, reply) => {
      return this.handleBootstrapReadinessProbeRequest(reply);
    });

    // Health check endpoint
    this.fastify.get(BOOTSTRAP_API_ROUTE.HEALTH, async (_request, reply) => {
      if (!this.getSqlQueryEngine()) {
        this.logger.debug('metrics.bootstrap_api.health.initializing', {
          seedNodeId: this.seedNodeId,
          sqlEngineReady: false,
        });
        reply.code(HTTP_STATUS.OK);
        return {
          status: BOOTSTRAP_API_HEALTH_STATUS_INITIALIZING,
          nodeId: this.seedNodeId,
          ready: false,
        };
      }
      return {
        status: BOOTSTRAP_API_HEALTH_STATUS,
        nodeId: this.seedNodeId,
        ready: true,
      };
    });

    // Bootstrap endpoint for new node registration
    this.fastify.post(BOOTSTRAP_API_ROUTE.BOOTSTRAP, async (request, reply) => {
      return this.handleBootstrapRequest(request, reply);
    });

    // Register service endpoint - inserts service into services system table
    this.fastify.post(BOOTSTRAP_API_ROUTE.REGISTER_SERVICE, async (request, reply) => {
      return this.handleRegisterServiceRequest(request, reply);
    });

    // Get cluster state endpoint
    this.fastify.get(BOOTSTRAP_API_ROUTE.CLUSTER_STATE, async (_request, _reply) => {
      return this.getClusterState();
    });
  }

  /**
   * Handle process liveness probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleLivenessProbeRequest(reply) {
    return this.bootstrapReadinessOwner
      .handleLivenessProbeRequest(reply);
  }

  /**
   * Handle startup completion probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleStartupProbeRequest(reply) {
    return this.bootstrapReadinessOwner
      .handleStartupProbeRequest(reply);
  }

  /**
   * Handle general readiness probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleReadinessProbeRequest(reply) {
    return this.bootstrapReadinessOwner
      .handleReadinessProbeRequest(reply);
  }

  /**
   * Handle lightweight bootstrap-join readiness probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleBootstrapReadinessProbeRequest(reply) {
    return this.bootstrapReadinessOwner
      .handleBootstrapReadinessProbeRequest(reply);
  }

  /**
   * Resolve readiness projection for one probe scope.
   * @param {Object} snapshot
   * @param {string} scope
   * @return {Object}
   */
  resolveReadinessSnapshotForScope(snapshot, scope) {
    return this.bootstrapReadinessOwner
      .resolveReadinessSnapshotForScope(snapshot, scope);
  }

  /**
   * Determine whether bootstrap join scope can project ready=true.
   * @param {Object} snapshot
   * @param {Array<string>} reasons
   * @param {Array<string>} blockingReasons
   * @return {boolean}
   */
  canProjectBootstrapJoinReadiness(snapshot, reasons, blockingReasons) {
    return this.bootstrapReadinessOwner
      .canProjectBootstrapJoinReadiness(
        snapshot,
        reasons,
        blockingReasons,
      );
  }

  /**
   * Build canonical readiness probe response body.
   * @param {Object} snapshot - Current readiness snapshot.
   * @param {Object} options
   * @param {string} [options.scope] - Optional readiness scope.
   * @return {Object}
   */
  buildReadinessProbeResponse(snapshot, options = {}) {
    return this.bootstrapReadinessOwner
      .buildReadinessProbeResponse(snapshot, options);
  }

  /**
   * Evaluate readiness owner after updating dependency signals.
   * @return {Object} Current readiness snapshot.
   */
  evaluateReadinessSnapshot() {
    return this.bootstrapReadinessOwner
      .evaluateReadinessSnapshot();
  }

  /**
   * Resolve health status of background control-plane writers.
   * @return {{healthy: boolean, reasonCode: string, details: Object|null}}
   */
  getControlPlaneWriteHealth() {
    return this.bootstrapReadinessOwner
      .getControlPlaneWriteHealth();
  }

  /**
   * Resolve the current control-plane readiness service.
   * @return {Object|null}
   */
  getControlPlaneReadinessService() {
    return this.controlPlaneReadinessService ||
      this.runtimeOwner?.controlPlaneReadinessService ||
      this.bootstrapStartupAdapter?.rebalanceCoordinator
        ?.controlPlaneReadinessService ||
      this.bootstrapStartupAdapter?.controlPlaneReadinessService ||
      null;
  }

  /**
   * Build startup-probe reasons from readiness snapshot.
   * @param {Object} snapshot
   * @param {boolean} started
   * @return {string[]}
   */
  getStartupProbeReasons(snapshot, started) {
    return this.bootstrapReadinessOwner
      .getStartupProbeReasons(snapshot, started);
  }

  /**
   * Determine whether startup bootstrap has completed.
   * @return {boolean}
   */
  isStartupComplete() {
    return this.bootstrapReadinessOwner
      .isStartupComplete();
  }

  /**
   * Determine whether runtime wiring is available for join-safe traffic.
   * @return {boolean}
   */
  isRuntimeWiringReady() {
    return this.bootstrapReadinessOwner
      .isRuntimeWiringReady();
  }

  /**
   * Determine whether SQL dependency is available for bootstrap operations.
   * @return {boolean}
   */
  isSqlEngineDependencyReady() {
    return this.bootstrapReadinessOwner
      .isSqlEngineDependencyReady();
  }

  /**
   * Build current leader-readiness status for probe projection.
   * @return {Object}
   */
  getLeaderReadinessStatusForProbe() {
    return this.serviceLeaderReadinessOwner
      .getLeaderReadinessStatusForProbe();
  }

  /**
   * Record one probe response in readiness metrics when owner supports it.
   * @param {string} endpoint
   * @param {number} statusCode
   */
  recordReadinessProbeResult(endpoint, statusCode) {
    return this.bootstrapReadinessOwner
      .recordReadinessProbeResult(endpoint, statusCode);
  }

  /**
   * Mark lifecycle readiness as draining and immediately non-ready.
   * @param {Object} [options]
   * @param {number} [options.drainDeadlineMs]
   * @param {string} [options.reasonCode]
   * @return {Object}
   */
  markDraining(options = {}) {
    return this.bootstrapReadinessOwner
      .markDraining(options);
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
    return this.bootstrapReadinessOwner
      .buildBootstrapNotReadyResponse(options);
  }

  /**
   * Return best-effort readiness snapshot for operation diagnostics.
   * @return {Object}
   */
  getReadinessSnapshotForDiagnostics() {
    return this.bootstrapReadinessOwner
      .getReadinessSnapshotForDiagnostics();
  }

  /**
   * Merge readiness reasons with one required reason code.
   * @param {Array<string>} reasons
   * @param {string} reasonCode
   * @return {Array<string>}
   */
  mergeReadinessReasons(reasons, reasonCode) {
    return this.bootstrapReadinessOwner
      .mergeReadinessReasons(reasons, reasonCode);
  }

  /**
   * Handle bootstrap request from a new node.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<Object>} Bootstrap response.
   */
  async handleBootstrapRequest(request, reply) {
    return this.bootstrapRequestOwner
      .handleBootstrapRequest(request, reply);
  }

  /**
   * Handle register node request - inserts node into nodes system table.
   * Uses SQL query engine to route to the correct partition leader.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<Object>} Registration response.
   */
  async handleRegisterNodeRequest(request, reply) {
    this.logger.warn(BOOTSTRAP_API_LOG_MSG.REGISTER_NODE_UNSUPPORTED, {
      seedNodeId: this.seedNodeId,
    });
    reply.code(HTTP_STATUS.GONE);
    throw new Error(BOOTSTRAP_API_ERROR.REGISTER_NODE_UNSUPPORTED);
  }

  /**
   * Handle register-service request from a joining node.
   * Inserts the service into the services system table.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<Object>} Registration response.
   */
  async handleRegisterServiceRequest(request, reply) {
    return this.serviceRegistrationHandoffOwner
      .handleRegisterServiceRequest(request, reply);
  }

  /**
   * Decide whether one register-service handoff failure is retryable.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  isRetryableMoveReplicaHandoffError(error) {
    if (!error) {
      return false;
    }
    if (error?.errorCode ===
      BOOTSTRAP_PIPELINE_ERROR_CODE
        .SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT) {
      return true;
    }
    if (Number.isFinite(error?.statusCode) &&
        Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE) {
      return true;
    }
    return Number.isFinite(error?.retryAfterMs);
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
  shouldPreserveMoveReplicaHandoffReservation(
    handoffContext,
    error,
    sourceRemovalCompleted,
  ) {
    return this.moveReplicaHandoffOwner
      .shouldPreserveMoveReplicaHandoffReservation(
        handoffContext,
        error,
        sourceRemovalCompleted,
      );
  }

  /**
   * Build canonical expected service row data for registration visibility checks.
   * @param {Object} serviceData - register-service payload.
   * @return {Object} Expected service row shape in system cache.
   * @private
   */
  buildExpectedRegisteredServiceData(serviceData) {
    const serviceId = serviceData[COLUMN.SERVICE_ID];
    return {
      [COLUMN.SERVICE_ID]: serviceId,
      [COLUMN.SERVICE_TYPE]: serviceData[COLUMN.SERVICE_TYPE],
      [COLUMN.NODE_ID]: serviceData[COLUMN.NODE_ID],
      [COLUMN.GROUP_ID]: serviceData[COLUMN.GROUP_ID] || null,
      [COLUMN.REPLICA_ID]: serviceData[COLUMN.REPLICA_ID] || serviceId,
      [COLUMN.RAFT_ROLE]: serviceData[COLUMN.RAFT_ROLE] || RAFT_ROLE.FOLLOWER,
      [COLUMN.STATUS]: serviceData[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: serviceData[COLUMN.ADDRESS] || null,
    };
  }

  /**
   * Build the canonical services row persisted by /register-service.
   * @param {Object} serviceData
   * @return {Object}
   * @private
   */
  buildRegisteredServiceMutationRow(serviceData) {
    const serviceId = serviceData[COLUMN.SERVICE_ID];
    return {
      [COLUMN.SERVICE_ID]: serviceId,
      [COLUMN.SERVICE_TYPE]: serviceData[COLUMN.SERVICE_TYPE],
      [COLUMN.NODE_ID]: serviceData[COLUMN.NODE_ID],
      [COLUMN.PARTITION_ID]: serviceData[COLUMN.PARTITION_ID] || null,
      [COLUMN.GROUP_ID]: serviceData[COLUMN.GROUP_ID] || null,
      [COLUMN.REPLICA_ID]: serviceData[COLUMN.REPLICA_ID] || serviceId,
      [COLUMN.RAFT_ROLE]: serviceData[COLUMN.RAFT_ROLE] || RAFT_ROLE.FOLLOWER,
      [COLUMN.STATUS]: serviceData[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: serviceData[COLUMN.ADDRESS] || null,
      [COLUMN.CREATED_AT]: serviceData[COLUMN.CREATED_AT] || Date.now(),
      [COLUMN.UPDATED_AT]: serviceData[COLUMN.UPDATED_AT] || Date.now(),
    };
  }

  /**
   * Normalize one bootstrap mutation failure to the shared typed retry surface.
   * @param {Error} error
   * @param {string} tableName
   * @param {string} fallbackMessage
   * @return {Error}
   * @private
   */
  buildBootstrapControlPlaneMutationError(
    error,
    tableName,
    fallbackMessage,
  ) {
    return this.buildBootstrapControlPlaneQueryError({
      success: false,
      error: error?.message || fallbackMessage,
      errorCode:
        typeof error?.errorCode === TYPEOF.STRING &&
          error.errorCode.length > NUM.ZERO ?
          error.errorCode :
          (
            typeof error?.code === TYPEOF.STRING && error.code.length > NUM.ZERO ?
              error.code :
              null
          ),
      retryAfterMs:
        Number.isFinite(error?.retryAfterMs) ?
          Math.max(NUM.ZERO, Math.floor(error.retryAfterMs)) :
          null,
      pressureAction:
        typeof error?.pressureAction === TYPEOF.STRING ?
          error.pressureAction :
          null,
      pressureReason:
        typeof error?.pressureReason === TYPEOF.STRING ?
          error.pressureReason :
          null,
      pressureSummary:
        error?.pressureSummary && typeof error.pressureSummary === TYPEOF.OBJECT ?
          error.pressureSummary :
          null,
      tableName,
    }, fallbackMessage);
  }

  /**
   * Check whether services cache reflects the expected registered owner row.
   * @param {Object} expectedService - Canonical expected service row.
   * @return {Promise<boolean>} True when cache/storage row matches expected registration.
   * @private
   */
  async isRegisteredServiceVisibleInCache(expectedService) {
    return this.serviceRegistrationVisibilityOwner
      .isRegisteredServiceVisibleInCache(expectedService);
  }

  /**
   * Build one compact service snapshot for cache visibility diagnostics.
   * @param {Object|null} serviceRow - One service row from cache or expected payload.
   * @return {Object|null}
   * @private
   */
  buildRegisteredServiceVisibilitySnapshot(serviceRow) {
    return this.serviceRegistrationVisibilityOwner
      .buildRegisteredServiceVisibilitySnapshot(serviceRow);
  }

  /**
   * Compute field-level mismatch list between observed and expected service rows.
   * @param {Object} observedService - Observed row from cache/storage.
   * @param {Object} expectedService - Canonical expected row.
   * @return {Array<string>} List of mismatched field names.
   * @private
   */
  getRegisteredServiceMismatchFields(observedService, expectedService) {
    return this.serviceRegistrationVisibilityOwner
      .getRegisteredServiceMismatchFields(observedService, expectedService);
  }

  /**
   * Read one services row from authoritative storage by service_id.
   * @param {string} serviceId - Service identifier.
   * @return {Promise<{row: Object|null, error: string|null}>}
   * @private
   */
  async readRegisteredServiceFromStorage(serviceId) {
    return this.serviceRegistrationVisibilityOwner
      .readRegisteredServiceFromStorage(serviceId);
  }

  /**
   * Evaluate services cache visibility for one register-service write.
   * @param {Object} expectedService - Canonical expected service row.
   * @return {Promise<{visible: boolean, diagnostics: Object}>}
   * @private
   */
  async evaluateRegisteredServiceCacheVisibility(expectedService) {
    return this.serviceRegistrationVisibilityOwner
      .evaluateRegisteredServiceCacheVisibility(expectedService);
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
    return this.serviceRegistrationVisibilityOwner
      .maybeRepairRegisteredServiceCacheVisibility(expectedService, diagnostics);
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
  buildRegisteredServiceVisibilityTimeoutDiagnostics(
    expectedService,
    lastDiagnostics,
    timeoutMs,
    elapsedMs,
  ) {
    return this.serviceRegistrationVisibilityOwner
      .buildRegisteredServiceVisibilityTimeoutDiagnostics(
        expectedService,
        lastDiagnostics,
        timeoutMs,
        elapsedMs,
      );
  }

  /**
   * Wait for register-service write to become visible in seed system cache.
   * This prevents stale assignment snapshots on immediately subsequent joins.
   * @param {Object} expectedService - Canonical expected service row.
   * @return {Promise<void>}
   * @private
   */
  async waitForRegisteredServiceCacheVisibility(expectedService) {
    return this.serviceRegistrationVisibilityOwner
      .waitForRegisteredServiceCacheVisibility(expectedService);
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
    return this.serviceRegistrationVisibilityOwner
      .readCurrentRegisteredServiceRow(serviceId);
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
  async restoreRegisteredServiceRowAfterFailedHandoff(
    previousServiceRow,
    requestedServiceData,
    error,
  ) {
    return this.moveReplicaHandoffOwner
      .restoreRegisteredServiceRowAfterFailedHandoff(
        previousServiceRow,
        requestedServiceData,
        error,
      );
  }

  /**
   * Determine whether this register-service request is a MOVE_REPLICA handoff.
   * @param {Object} serviceData - Incoming register-service payload.
   * @return {boolean} True when handoff tracking should be enabled.
   * @private
   */
  isMoveReplicaHandoffRequest(serviceData) {
    return this.moveReplicaAssignmentOwner
      .isMoveReplicaHandoffRequest(serviceData);
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
    const error = new Error(message);
    error.statusCode = statusCode;
    error.errorCode = code;
    if (Number.isFinite(options.retryAfterMs)) {
      error.retryAfterMs = Math.max(
        NUM.ZERO,
        Math.floor(options.retryAfterMs),
      );
    }
    if (options.details && typeof options.details === TYPEOF.OBJECT) {
      error.details = options.details;
    }
    return error;
  }
}

Object.assign(
  BootstrapAPI.prototype,
  createBootstrapApiRuntimeMethods({
    bootstrapApiCloseErrorCode: BOOTSTRAP_API_CLOSE_ERROR_CODE,
    bootstrapApiError: BOOTSTRAP_API_ERROR,
    bootstrapApiLogMsg: BOOTSTRAP_API_LOG_MSG,
    num: NUM,
    tables: TABLES,
    typeofToken: TYPEOF,
  }),
);

export {BootstrapAPI, BootstrapStrategy};
