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

import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {
  BOOTSTRAP_ASSIGNMENT_STRATEGY,
} from './bootstrap-constants.js';
import {NODE_CONFIG_KEY, NODE_DEFAULT} from '../node/node-constants.js';
import {
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_CLOSE_ERROR_CODE,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_SUBSYSTEM,
} from './bootstrap-api-constants.js';
import {
  BootstrapReadinessState,
} from './bootstrap-readiness-state.js';
import {
  CONTROL_PLANE_ROLLOUT_REQUIRED,
  assertRequiredControlPlaneRollout,
} from '../runtime/control-plane-rollout-controls.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
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
import {installBootstrapApiAdmissionMethods} from
  './bootstrap-api-admission-methods.js';
import {installBootstrapApiControlPlaneMethods} from
  './bootstrap-api-control-plane-methods.js';
import {installBootstrapApiLeaderReadinessMethods} from
  './bootstrap-api-leader-readiness-methods.js';
import {installBootstrapApiReadinessMethods} from
  './bootstrap-api-readiness-methods.js';
import {installBootstrapApiRegistrationMethods} from
  './bootstrap-api-registration-methods.js';
import {installBootstrapApiServerMethods} from
  './bootstrap-api-server-methods.js';
import {createRequestCellRoutingSurface} from
  '../service/request-cell-routing-surface.js';

const LOCAL_STR_BOOTSTRAPAPI = 'BootstrapAPI';
const LOCAL_STR_FUNCTION = 'function';

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
    this.rolloutControls = assertRequiredControlPlaneRollout({
      owner: LOCAL_STR_BOOTSTRAPAPI,
      controls: options.rolloutControls,
      required: CONTROL_PLANE_ROLLOUT_REQUIRED.BOOTSTRAP_API,
    });
    this.controlPlaneWriteHealthProvider =
      typeof options.controlPlaneWriteHealthProvider === 'function' ?
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
        options.maxConcurrentBootstrapRequests > 0 ?
        Math.floor(options.maxConcurrentBootstrapRequests) :
        BOOTSTRAP_API_DEFAULT.MAX_CONCURRENT_BOOTSTRAP_REQUESTS;
    this.bootstrapAdmissionRetryAfterMs =
      Number.isFinite(options.bootstrapAdmissionRetryAfterMs) &&
        options.bootstrapAdmissionRetryAfterMs > 0 ?
        Math.floor(options.bootstrapAdmissionRetryAfterMs) :
        BOOTSTRAP_API_DEFAULT.BOOTSTRAP_ADMISSION_RETRY_AFTER_MS;
    this.bootstrapAdmissionLeaseMs =
      Number.isFinite(options.bootstrapAdmissionLeaseMs) &&
        options.bootstrapAdmissionLeaseMs > 0 ?
        Math.floor(options.bootstrapAdmissionLeaseMs) :
        BOOTSTRAP_API_DEFAULT.BOOTSTRAP_ADMISSION_LEASE_MS;
    this.bootstrapRequestExecutionBudgetMs =
      Number.isFinite(options.bootstrapRequestExecutionBudgetMs) &&
        options.bootstrapRequestExecutionBudgetMs > 0 ?
        Math.floor(options.bootstrapRequestExecutionBudgetMs) :
        BOOTSTRAP_API_DEFAULT.BOOTSTRAP_REQUEST_EXECUTION_BUDGET_MS;
    this.inFlightBootstrapRequestCount = 0;
    this.bootstrapAdmissionLeases = new Map();
    this.bootstrapAdmissionPeerHints = new Map();
    this.bootstrapAdmissionSequence = 0;
    this.moveReplicaAssignmentLeaseMs = Number.isFinite(options.moveReplicaAssignmentLeaseMs) ?
      Math.max(1, Math.floor(options.moveReplicaAssignmentLeaseMs)) :
      BOOTSTRAP_API_DEFAULT.MOVE_REPLICA_ASSIGNMENT_LEASE_MS;
    this.moveReplicaAssignmentSweepIntervalMs =
      Number.isFinite(options.moveReplicaAssignmentSweepIntervalMs) ?
        Math.max(1, Math.floor(options.moveReplicaAssignmentSweepIntervalMs)) :
        BOOTSTRAP_API_DEFAULT.MOVE_REPLICA_ASSIGNMENT_SWEEP_INTERVAL_MS;
    this.ownsMoveReplicaAssignmentLifecycle =
      typeof options.ownsMoveReplicaAssignmentLifecycle === 'boolean' ?
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
    this.requestCellRoutingSurface =
      options.requestCellRoutingSurface ||
      createRequestCellRoutingSurface({
        authenticateRequest: options.requestCellAuthenticateRequest,
        authorize: options.requestCellAuthorize,
        deadlineMs: options.requestCellDeadlineMs,
        env: options.requestCellEnv,
        logger: this.logger,
        maxAttempts: options.requestCellMaxAttempts,
        maxInFlight: options.requestCellMaxInFlight,
        maxInFlightPerTarget:
          options.requestCellMaxInFlightPerTarget,
        messageRouterProvider: () => this.messageRouter,
        systemTableCacheProvider: () => this.getSystemTableCache(),
      });
    this.requestCellHttpAdapter =
      options.requestCellHttpAdapter ||
      this.requestCellRoutingSurface.httpAdapter;
    this.serviceRegistrationVisibilityOwner =
      new ServiceRegistrationVisibilityOwner({
        delegates: {
          getSystemTableCache: () => this.getSystemTableCache(),
          executeBootstrapControlPlaneQuery: (sql, params, options) =>
            this.executeBootstrapControlPlaneQuery(sql, params, options),
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
          executeBootstrapControlPlaneQuery: (sql, params, options) =>
            this.executeBootstrapControlPlaneQuery(sql, params, options),
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
      ?.setBootstrapTopologySnapshotOwner === LOCAL_STR_FUNCTION) {
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
          getBootstrapAdmissionTableRows: (tableName) =>
            this.getBootstrapAdmissionTableRows(tableName),
          expireMoveReplicaAssignmentReservations: (options) =>
            this.expireMoveReplicaAssignmentReservations(options),
          getActiveMoveReplicaAssignmentReservations: (options) =>
            this.getActiveMoveReplicaAssignmentReservations(options),
          getBlockingMoveReplicaBootstrapAdmissions: (now) =>
            this.getBlockingMoveReplicaBootstrapAdmissions(now),
          getMoveReplicaBootstrapExclusionReservations: (now, options) =>
            this.moveReplicaAssignmentOwner
              .getMoveReplicaBootstrapExclusionReservations(now, options),
          reserveMoveReplicaAssignment: (targetNodeId, assignment, options) =>
            this.reserveMoveReplicaAssignment(
              targetNodeId,
              assignment,
              options,
            ),
          getBootstrapAdmissionRetryAfterMs: () =>
            this.bootstrapAdmissionRetryAfterMs,
        },
      });
    this.bootstrapReadinessOwner =
      new BootstrapReadinessOwner({
        delegates: {
          getSeedNodeId: () => this.seedNodeId,
          getReadinessState: () => this.readinessState,
          getBootstrapService: () => this.bootstrapStartupAdapter,
          getMessageRouter: () =>
            this.messageRouter ||
            this.runtimeOwner?.messageRouter ||
            this.bootstrapStartupAdapter?.messageRouter ||
            null,
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
          getBootstrapJoinAdmissionSnapshot: () =>
            this.getBootstrapJoinAdmissionSnapshot(),
          getMaxConcurrentBootstrapRequests: () =>
            this.maxConcurrentBootstrapRequests,
          getBootstrapAdmissionRetryAfterMs: () =>
            this.bootstrapAdmissionRetryAfterMs,
          getBootstrapRequestExecutionBudgetMs: () =>
            this.bootstrapRequestExecutionBudgetMs,
          getBootstrapAdmissionLeaseMs: () =>
            this.bootstrapAdmissionLeaseMs,
          expireStaleBootstrapAdmissions: (now) =>
            this.expireStaleBootstrapAdmissions(now),
          acquireBootstrapAdmission: (snapshot) =>
            this.acquireBootstrapAdmission(snapshot),
          releaseBootstrapAdmission: (admission) =>
            this.releaseBootstrapAdmission(admission),
          getInFlightBootstrapRequestCount: () =>
            this.inFlightBootstrapRequestCount,
          setInFlightBootstrapRequestCount: (count) => {
            this.inFlightBootstrapRequestCount = count;
          },
          getBootstrapAdmissionPeerHints: () =>
            this.getBootstrapAdmissionPeerHints(),
          validateBootstrapRequest: (nodeId, nodeAddress) =>
            this.validateBootstrapRequest(nodeId, nodeAddress),
          checkForConflicts: (nodeId, nodeAddress, options) =>
            this.checkForConflicts(nodeId, nodeAddress, options),
          getBlockingMoveReplicaBootstrapAdmissions: (now, options) =>
            this.getBlockingMoveReplicaBootstrapAdmissions(now, options),
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
          getStartupAuthoritySnapshotForBootstrapResponse: (observedAt) =>
            this.getStartupAuthoritySnapshotForBootstrapResponse(observedAt),
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
          // Keep the miss-path refresh on the same canonical authority already
          // owned by BootstrapAPI; the readiness owner must not construct a
          // second cache or routing authority.
          getAuthoritativeControlPlaneView: () =>
            this.getAuthoritativeControlPlaneView(),
        },
      });

    // Fastify instance
    this.fastify = null;
    this.initialized = false;
  }
}

installBootstrapApiControlPlaneMethods(BootstrapAPI);
installBootstrapApiServerMethods(BootstrapAPI);
installBootstrapApiReadinessMethods(BootstrapAPI);
installBootstrapApiAdmissionMethods(BootstrapAPI);
installBootstrapApiRegistrationMethods(BootstrapAPI);

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

installBootstrapApiLeaderReadinessMethods(BootstrapAPI);

export {BootstrapAPI, BootstrapStrategy};
