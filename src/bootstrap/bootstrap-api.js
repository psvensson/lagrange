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

import Fastify from 'fastify';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {assertCritical} from '../utils/assert.js';
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  ERRNO,
  HTTP_STATUS,
  HOST,
  NUM,
  PROTOCOL,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STRING,
  TABLES,
  TYPEOF,
  WORKFLOW_STEP,
} from '../constants/index.js';
import {CACHE_HYDRATION_TABLES} from '../cache/cache-constants.js';
import {
  resolveCanonicalLeaderService,
} from '../cache/leader-readiness-gate.js';
import {
  isNodeRecordReady,
} from '../node/node-readiness-policy.js';
import {
  BOOTSTRAP_ASSIGNMENT_STRATEGY,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from './bootstrap-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {NODE_CONFIG_KEY, NODE_DEFAULT} from '../node/node-constants.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_CLOSE_ERROR_CODE,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_HEALTH_STATUS,
  BOOTSTRAP_API_HEALTH_STATUS_INITIALIZING,
  BOOTSTRAP_API_HANDOFF_OPERATION,
  BOOTSTRAP_API_HANDOFF_PHASE,
  BOOTSTRAP_API_HANDOFF_STATUS,
  BOOTSTRAP_API_ASSIGNMENT,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE,
  BOOTSTRAP_API_ROUTE,
  BOOTSTRAP_API_SQL,
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
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {
  PRESSURE_WORK_CLASS,
} from '../control-plane/pressure-governor.js';
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
   * @param {BootstrapService} options.bootstrapService - Bootstrap service for rebalancing.
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
    this.systemTableCache = options.systemTableCache || null;
    this.seedNodeId = options.seedNodeId || null;
    this.seedNodeAddress = options.seedNodeAddress || null;
    this.seedNodeWsAddress = options.seedNodeWsAddress || null;
    this.wsPort = options.wsPort || null;
    this.messageGroupServices = options.messageGroupServices || new Map();
    this.partitionServices = options.partitionServices || new Map();
    this.replicaHandler = options.replicaHandler || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.bootstrapService = options.bootstrapService || null;
    this.cdcIntegrationService = options.cdcIntegrationService ||
      this.bootstrapService?.cdcIntegrationService ||
      null;
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService ||
      this.bootstrapService?.controlPlaneReadinessService ||
      null;
    this.epochManager = options.epochManager || null;
    this.messageRouter = options.messageRouter || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      createControlPlaneRuntimeBundle({
        nodeId: this.seedNodeId || BOOTSTRAP_API_SUBSYSTEM,
        getSqlQueryEngine: () => this.sqlQueryEngine,
        getCdcIntegrationService: () => this.getCdcIntegrationService(),
        getSystemTableCache: () => this.systemTableCache,
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
        Boolean(options.bootstrapService);
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
          getSystemTableCache: () => this.systemTableCache,
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
          getSystemTableCache: () => this.systemTableCache,
          getMessageGroupServices: () => this.messageGroupServices,
          getMessageRouter: () =>
            this.messageRouter || this.bootstrapService?.messageRouter || null,
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
          getSqlQueryEngine: () => this.sqlQueryEngine,
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
          getSystemTableCache: () => this.systemTableCache,
          getMessageGroupServices: () => this.messageGroupServices,
          getSqlQueryEngine: () => this.sqlQueryEngine,
          getLogger: () => this.logger,
          getMessageRouter: () =>
            this.messageRouter || this.bootstrapService?.messageRouter || null,
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
          getSystemTableCache: () => this.systemTableCache,
          getPartitionServices: () => this.partitionServices,
          getSeedNodeId: () => this.seedNodeId,
          getLogger: () => this.logger,
          getCurrentEpoch: () => this.getCurrentEpoch(),
        },
      });
    this.bootstrapJoinAdmissionOwner =
      new BootstrapJoinAdmissionOwner({
        delegates: {
          getSeedNodeId: () => this.seedNodeId,
          getSeedNodeAddress: () => this.seedNodeAddress,
          getSystemTableCache: () => this.systemTableCache,
          getLogger: () => this.logger,
          getCdcIntegrationService: () => this.getCdcIntegrationService(),
          getMessageRouter: () =>
            this.messageRouter || this.bootstrapService?.messageRouter || null,
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
          reserveMoveReplicaAssignment: (targetNodeId, assignment) =>
            this.reserveMoveReplicaAssignment(targetNodeId, assignment),
        },
      });
    this.bootstrapReadinessOwner =
      new BootstrapReadinessOwner({
        delegates: {
          getSeedNodeId: () => this.seedNodeId,
          getReadinessState: () => this.readinessState,
          getBootstrapService: () => this.bootstrapService,
          getMessageRouter: () => this.messageRouter,
          getSqlQueryEngine: () => this.sqlQueryEngine,
          getControlPlaneWriteHealthProvider: () =>
            this.controlPlaneWriteHealthProvider,
          getLeaderReadinessStatusForProbe: () =>
            this.getLeaderReadinessStatusForProbe(),
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
          getBootstrapService: () => this.bootstrapService,
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
          waitForServiceLeaders: () => this.waitForServiceLeaders(),
          determineAndReserveMessageGroupAssignment: (nodeId) =>
            this.determineAndReserveMessageGroupAssignment(nodeId),
          getCurrentEpoch: () => this.getCurrentEpoch(),
          buildBootstrapTopologySnapshotEnvelope: (options) =>
            this.buildBootstrapTopologySnapshotEnvelope(options),
          getClusterConfiguration: () => this.getClusterConfiguration(),
          getReadyNodes: () => this.getReadyNodes(),
          getTablePolicies: () => this.getTablePolicies(),
          getLatencyTopologyHints: (nodeId) =>
            this.getLatencyTopologyHints(nodeId),
        },
      });
    this.bootstrapClusterViewOwner =
      new BootstrapClusterViewOwner({
        delegates: {
          getSystemTableCache: () => this.systemTableCache,
          getSeedNodeId: () => this.seedNodeId,
          getSeedNodeAddress: () => this.seedNodeAddress,
          getMessageGroups: () => this.getMessageGroups(),
          getControlPlaneReadinessService: () =>
            this.controlPlaneReadinessService ||
            this.bootstrapService?.controlPlaneReadinessService ||
            null,
          getEpochManager: () =>
            this.epochManager || this.bootstrapService?.getEpochManager?.(),
        },
      });
    this.serviceLeaderReadinessOwner =
      new ServiceLeaderReadinessOwner({
        delegates: {
          getSystemTableCache: () => this.systemTableCache,
          getPartitionServices: () => this.partitionServices,
          getBootstrapService: () => this.bootstrapService,
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
      this.bootstrapService?.cdcIntegrationService ||
      null;
  }

  /**
   * Execute one bootstrap-owned control-plane query using repair-eligible
   * routing semantics.
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
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      deliveryPriority: 'critical',
      enforcePressureAdmission: true,
      allowPressureDefer: true,
      allowPressureDegrade: false,
      pressureRetryAfterMs: this.bootstrapAdmissionRetryAfterMs,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
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
    return controlPlaneSystemTableGateway.submitMutation(mutation, {
      owner: BOOTSTRAP_API_SUBSYSTEM,
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      deliveryPriority: 'critical',
      allowPressureDefer: true,
      allowPressureDegrade: false,
      pressureRetryAfterMs: this.bootstrapAdmissionRetryAfterMs,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      ...options,
    });
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
      error.details = {
        pressureAction: result?.pressureAction || null,
        pressureReason: result?.pressureReason || null,
        pressureSummary: result?.pressureSummary || null,
        tableName: result?.tableName || null,
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
      if (!this.sqlQueryEngine) {
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

  /**
   * Lookup one move-assignment reservation by assignment ID.
   * @param {string} assignmentId
   * @return {Promise<Object|null>}
   * @private
   */
  async getMoveReplicaAssignmentReservationById(assignmentId) {
    return this.moveReplicaAssignmentOwner
      .getMoveReplicaAssignmentReservationById(assignmentId);
  }

  /**
   * Validate MOVE_REPLICA assignment token on register-service.
   * @param {Object} serviceData
   * @return {Promise<Object|null>}
   * @private
   */
  async validateMoveReplicaAssignmentToken(serviceData) {
    return this.moveReplicaAssignmentOwner
      .validateMoveReplicaAssignmentToken(serviceData);
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
    return this.moveReplicaAssignmentOwner
      .shouldRenewMoveReplicaAssignmentReservation(reservation, now);
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
  async renewMoveReplicaAssignmentReservation(
    reservation,
    options = {},
  ) {
    return this.moveReplicaAssignmentOwner
      .renewMoveReplicaAssignmentReservation(reservation, options);
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
    return this.moveReplicaAssignmentOwner
      .isMoveReplicaAssignmentSourceReplicaPresentLocally(reservation);
  }

  /**
   * Evaluate canonical ownership signals for one MOVE_REPLICA reservation.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {Object}
   * @private
   */
  evaluateMoveReplicaAssignmentReservationOwnership(
    reservation,
    now = Date.now(),
  ) {
    return this.moveReplicaAssignmentOwner
      .evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
  }

  /**
   * Check whether an expired reservation still matches the source owner that
   * originally granted the handoff.
   * @param {Object} reservation
   * @return {boolean}
   * @private
   */
  canReviveExpiredMoveReplicaAssignmentReservation(reservation) {
    return this.moveReplicaAssignmentOwner
      .canReviveExpiredMoveReplicaAssignmentReservation(reservation);
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
    return this.moveReplicaAssignmentOwner
      .hasViableMoveReplicaAssignmentSource(reservation, now);
  }

  /**
   * Resolve one non-terminal reservation invalidation reason.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {string|null}
   * @private
   */
  getMoveReplicaAssignmentReservationInvalidationReason(
    reservation,
    now = Date.now(),
  ) {
    return this.moveReplicaAssignmentOwner
      .getMoveReplicaAssignmentReservationInvalidationReason(
        reservation,
        now,
      );
  }

  /**
   * Determine whether one non-terminal reservation has already converged to
   * canonical target ownership and should be reconciled into a committed row.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  shouldReconcileMoveReplicaAssignmentReservationToCommitted(
    reservation,
    now = Date.now(),
  ) {
    return this.moveReplicaAssignmentOwner
      .shouldReconcileMoveReplicaAssignmentReservationToCommitted(
        reservation,
        now,
      );
  }

  /**
   * Enforce one active owner row per message-group replica registration.
   * @param {Object} serviceData
   * @param {Object|null} assignmentContext
   * @return {void}
   * @private
   */
  assertSingleOwnerReplicaRegistration(serviceData, assignmentContext) {
    return this.moveReplicaHandoffOwner
      .assertSingleOwnerReplicaRegistration(serviceData, assignmentContext);
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
    return this.moveReplicaHandoffOwner
      .isCanonicalGroupHomeNode(groupId, nodeId);
  }

  buildReplicaOperationMutationRow(operationContext) {
    return {
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
      lease_expires_at: operationContext.leaseExpiresAt ?? null,
      error_message: operationContext.errorMessage,
      steps_history: JSON.stringify(operationContext.stepsHistory || []),
      entity_type: operationContext.entityType,
      entity_id: operationContext.entityId,
    };
  }

  buildReplicaOperationMutationData(operationContext) {
    return {
      status: operationContext.status,
      workflow_step: operationContext.workflowStep,
      updated_at: operationContext.updatedAt,
      completed_at: operationContext.completedAt,
      lease_expires_at: operationContext.leaseExpiresAt ?? null,
      error_message: operationContext.errorMessage,
      steps_history: JSON.stringify(operationContext.stepsHistory || []),
    };
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
    const result = await this.executeBootstrapControlPlaneMutation({
      operation: 'insert',
      tableName: TABLES.REPLICA_OPERATIONS,
      row: this.buildReplicaOperationMutationRow(handoffContext),
    });
    if (!result.success) {
      throw this.buildBootstrapControlPlaneQueryError(
        result,
        'Failed to persist MOVE_REPLICA handoff operation',
      );
    }
  }

  /**
   * Persist updates to an existing MOVE_REPLICA handoff operation row.
   * @param {Object} handoffContext - Operation context.
   * @return {Promise<void>}
   * @private
   */
  async updateMoveReplicaHandoffOperation(handoffContext) {
    const result = await this.executeBootstrapControlPlaneMutation({
      operation: 'update',
      tableName: TABLES.REPLICA_OPERATIONS,
      whereClause: {
        operation_id: handoffContext.operationId,
      },
      data: this.buildReplicaOperationMutationData(handoffContext),
    });
    if (!result.success) {
      throw this.buildBootstrapControlPlaneQueryError(
        result,
        'Failed to update MOVE_REPLICA handoff operation',
      );
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
    if (!this.isMoveReplicaHandoffRequest(serviceData)) {
      return null;
    }
    return this.moveReplicaHandoffOwner
      .startMoveReplicaHandoff(serviceData, assignmentContext);
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
  async executeMoveReplicaHandoffPhase(
    handoffContext,
    phase,
    workflowStep,
    status,
    executor,
  ) {
    return this.moveReplicaHandoffOwner
      .executeMoveReplicaHandoffPhase(
        handoffContext,
        phase,
        workflowStep,
        status,
        executor,
      );
  }

  /**
   * Verify the MOVE_REPLICA target metadata before source removal.
   * @param {Object} handoffContext - Operation context.
   * @param {Object} serviceData - Incoming register-service payload.
   * @return {void}
   * @private
   */
  verifyMoveReplicaHandoffTarget(handoffContext, serviceData) {
    return this.moveReplicaHandoffOwner
      .verifyMoveReplicaHandoffTarget(handoffContext, serviceData);
  }

  /**
   * Mark MOVE_REPLICA handoff as committed.
   * @param {Object} handoffContext - Operation context.
   * @return {Promise<void>}
   * @private
   */
  async completeMoveReplicaHandoff(handoffContext) {
    return this.moveReplicaHandoffOwner
      .completeMoveReplicaHandoff(handoffContext);
  }

  /**
   * Mark MOVE_REPLICA handoff as failed.
   * @param {Object} handoffContext - Operation context.
   * @param {Error} error - Failure reason.
   * @return {Promise<void>}
   * @private
   */
  async failMoveReplicaHandoff(handoffContext, error) {
    return this.moveReplicaHandoffOwner
      .failMoveReplicaHandoff(handoffContext, error);
  }

  /**
   * Remove a local message-group source replica before committing MOVE_REPLICA
   * ownership metadata to another node.
   * @param {Object} serviceData - Incoming register-service payload.
   * @return {Promise<void>}
   * @private
   */
  async removeLocalSourceReplicaForMoveReplica(serviceData) {
    return this.moveReplicaHandoffOwner
      .removeLocalSourceReplicaForMoveReplica(serviceData);
  }

  /**
   * Get the leader partition info for a specific table.
   * Uses ONLY the system cache - no fallbacks.
   * @param {string} tableName - Table name.
   * @return {Object|null} Leader partition info or null.
   * @private
   */
  getLeaderPartitionForTable(tableName) {
    return this.bootstrapJoinAdmissionOwner
      .getLeaderPartitionForTable(tableName);
  }

  /**
   * Validate bootstrap request parameters.
   * @param {string} nodeId - Node ID from request.
   * @param {string} nodeAddress - Node address from request.
   * @return {string|null} Error message or null if valid.
   */
  validateBootstrapRequest(nodeId, nodeAddress) {
    return this.bootstrapJoinAdmissionOwner
      .validateBootstrapRequest(nodeId, nodeAddress);
  }

  /**
   * Check for node ID or address conflicts using system table cache.
   * @param {string} nodeId - Node ID to check.
   * @param {string} nodeAddress - Node address to check.
   * @return {Promise<string|null>} Error message or null if no conflict.
   */
  async checkForConflicts(nodeId, nodeAddress) {
    return this.bootstrapJoinAdmissionOwner
      .checkForConflicts(nodeId, nodeAddress);
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
    return this.bootstrapJoinAdmissionOwner.isNodeDead(nodeRecord);
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
    return this.bootstrapJoinAdmissionOwner
      .readAuthoritativeNodeRow(nodeId);
  }

  /**
   * Resolve the canonical control-plane view when the bootstrap owner can
   * execute authoritative system-table reads.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */
  getAuthoritativeControlPlaneView() {
    return this.bootstrapJoinAdmissionOwner
      .getAuthoritativeControlPlaneView();
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
    return this.bootstrapJoinAdmissionOwner
      .determineMessageGroupAssignment(newNodeId, options);
  }

  /**
   * Serialize MOVE_REPLICA assignment reservation so concurrent bootstrap
   * requests cannot reserve the same replica.
   * @param {Function} action
   * @return {Promise<*>}
   * @private
   */
  async withMoveReplicaAssignmentReservationLock(action) {
    return this.bootstrapJoinAdmissionOwner
      .withMoveReplicaAssignmentReservationLock(action);
  }

  /**
   * Determine assignment and reserve MOVE_REPLICA ownership atomically before
   * responding to bootstrap.
   * @param {string} newNodeId
   * @return {Promise<Object>}
   * @private
   */
  async determineAndReserveMessageGroupAssignment(newNodeId) {
    return this.bootstrapJoinAdmissionOwner
      .determineAndReserveMessageGroupAssignment(newNodeId);
  }

  /**
   * Convert persisted replica operation row into move-assignment reservation.
   * @param {Object} row
   * @return {Object|null}
   * @private
   */
  normalizeMoveReplicaAssignmentReservationRow(row) {
    return this.moveReplicaAssignmentOwner
      .normalizeMoveReplicaAssignmentReservationRow(row);
  }

  /**
   * Return active move-assignment reservations from in-memory + persisted state.
   * @return {Promise<Array<Object>>}
   * @private
   */
  async getActiveMoveReplicaAssignmentReservations() {
    return this.moveReplicaAssignmentOwner
      .getActiveMoveReplicaAssignmentReservations();
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
    return this.moveReplicaAssignmentOwner
      .getBlockingMoveReplicaBootstrapAdmissions(now);
  }

  /**
   * Determine whether one MOVE_REPLICA reservation should block a new
   * bootstrap admission.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  isMoveReplicaBootstrapAdmissionBlocked(
    reservation,
    now = Date.now(),
  ) {
    return this.moveReplicaAssignmentOwner
      .isMoveReplicaBootstrapAdmissionBlocked(reservation, now);
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
  isMoveReplicaAssignmentReservationOpen(
    reservation,
    now = Date.now(),
  ) {
    return this.moveReplicaAssignmentOwner
      .isMoveReplicaAssignmentReservationOpen(reservation, now);
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
  isCommittedMoveReplicaHandoffStabilizing(
    reservation,
    now = Date.now(),
  ) {
    return this.moveReplicaAssignmentOwner
      .isCommittedMoveReplicaHandoffStabilizing(reservation, now);
  }

  /**
   * Determine whether the canonical target of a committed MOVE_REPLICA
   * handoff is locally ready.
   * @param {Object} reservation
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  isMoveReplicaAssignmentTargetReady(
    reservation,
    now = Date.now(),
  ) {
    return this.moveReplicaAssignmentOwner
      .isMoveReplicaAssignmentTargetReady(reservation, now);
  }

  /**
   * Resolve one bounded retry hint for bootstrap admission blocked by an
   * unsettled MOVE_REPLICA handoff.
   * @param {Object|null} reservation
   * @param {number} [now=Date.now()]
   * @return {number}
   * @private
   */
  resolveMoveReplicaBootstrapAdmissionRetryAfterMs(
    reservation,
    now = Date.now(),
  ) {
    return this.moveReplicaAssignmentOwner
      .resolveMoveReplicaBootstrapAdmissionRetryAfterMs(
        reservation,
        now,
      );
  }

  /**
   * Check whether one reservation is currently active.
   * @param {Object} reservation
   * @param {number} now
   * @return {boolean}
   * @private
   */
  isMoveReplicaAssignmentReservationActive(reservation, now = Date.now()) {
    return this.moveReplicaAssignmentOwner
      .isMoveReplicaAssignmentReservationActive(reservation, now);
  }

  /**
   * Expire stale reservations so replicas become assignable again.
   * @return {Promise<void>}
   * @private
   */
  async expireMoveReplicaAssignmentReservations() {
    return this.moveReplicaAssignmentOwner
      .expireMoveReplicaAssignmentReservations();
  }

  /**
   * Start background sweeping for stranded MOVE_REPLICA reservations.
   * @private
   */
  startMoveReplicaAssignmentSweep() {
    if (!this.ownsMoveReplicaAssignmentLifecycle) {
      return;
    }
    if (this.moveReplicaAssignmentSweepTimer ||
        this.moveReplicaAssignmentSweepIntervalMs <= NUM.ZERO) {
      return;
    }

    this.moveReplicaAssignmentSweepTimer = setInterval(() => {
      void this.expireMoveReplicaAssignmentReservations().catch((error) => {
        this.logger.warn(
          BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_SWEEP_FAILED,
          {error: error.message},
        );
      });
    }, this.moveReplicaAssignmentSweepIntervalMs);

    if (typeof this.moveReplicaAssignmentSweepTimer.unref === TYPEOF.FUNCTION) {
      this.moveReplicaAssignmentSweepTimer.unref();
    }
  }

  /**
   * Stop background sweeping for MOVE_REPLICA reservations.
   * @private
   */
  stopMoveReplicaAssignmentSweep() {
    if (!this.moveReplicaAssignmentSweepTimer) {
      return;
    }
    clearInterval(this.moveReplicaAssignmentSweepTimer);
    this.moveReplicaAssignmentSweepTimer = null;
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
    return this.moveReplicaAssignmentOwner
      .reserveMoveReplicaAssignment(targetNodeId, assignment);
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
  async markMoveReplicaAssignmentReservationTerminal(
    assignmentId,
    status,
    workflowStep,
    errorMessage = null,
  ) {
    return this.moveReplicaAssignmentOwner
      .markMoveReplicaAssignmentReservationTerminal(
        assignmentId,
        status,
        workflowStep,
        errorMessage,
      );
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
  async reconcileMoveReplicaAssignmentReservationToCommitted(
    reservation,
    now = Date.now(),
  ) {
    return this.moveReplicaAssignmentOwner
      .reconcileMoveReplicaAssignmentReservationToCommitted(
        reservation,
        now,
      );
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
    return this.bootstrapJoinAdmissionOwner
      .augmentAssignmentWithPeerAddresses(assignment, messageGroups);
  }

  /**
   * Wait for partition leaders when live services are available.
   * @return {Promise<void>}
   * @private
   */
  async waitForPartitionLeaders() {
    return this.serviceLeaderReadinessOwner.waitForPartitionLeaders();
  }

  /**
   * Get all message groups from system cache.
   * Uses the system cache (fed by CDC) as the single source of truth.
   * @return {Array<Object>} Message groups.
   */
  getMessageGroups() {
    return this.bootstrapJoinAdmissionOwner.getMessageGroups();
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
    return this.bootstrapTopologySnapshotOwner
      .getBootstrapAuthoritativeTableRows(tableName);
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
    return this.bootstrapTopologySnapshotOwner
      .buildSystemTableSnapshots();
  }

  /**
   * Build the bootstrap topology snapshot envelope published to joiners.
   * @param {Object} [options]
   * @param {Object|null} [options.currentEpoch]
   * @return {{systemTableSnapshots: Object, topologySnapshotMeta: Object}}
   */
  buildBootstrapTopologySnapshotEnvelope(options = {}) {
    return this.bootstrapTopologySnapshotOwner
      .buildBootstrapTopologySnapshotEnvelope(options);
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
  resolveAuthoritativeSystemTableSnapshotRows(tableName, cacheRows = []) {
    return this.bootstrapTopologySnapshotOwner
      .resolveAuthoritativeSystemTableSnapshotRows(tableName, cacheRows);
  }

  /**
   * Read one system table directly from local partition replicas.
   * @param {string} tableName
   * @return {Object[][]}
   * @private
   */
  queryLocalAuthoritativePartitionRowSets(tableName) {
    return this.bootstrapTopologySnapshotOwner
      .queryLocalAuthoritativePartitionRowSets(tableName);
  }

  /**
   * Merge direct replica row sets by canonical primary key.
   * @param {string} tableName
   * @param {Object[][]} rowSets
   * @return {Object[]}
   * @private
   */
  mergeAuthoritativeSystemTableRowSets(tableName, rowSets) {
    return this.bootstrapTopologySnapshotOwner
      .mergeAuthoritativeSystemTableRowSets(tableName, rowSets);
  }

  /**
   * Prefer the freshest row when merging authoritative replica snapshots.
   * @param {Object} candidate
   * @param {Object} existing
   * @return {boolean}
   * @private
   */
  isAuthoritativeSnapshotRowNewer(candidate, existing) {
    return this.bootstrapTopologySnapshotOwner
      .isAuthoritativeSnapshotRowNewer(candidate, existing);
  }

  /**
   * Build latency topology hints for joining node bootstrap.
   * @param {string} nodeId - Joining node ID.
   * @return {Object}
   * @private
   */
  getLatencyTopologyHints(nodeId) {
    return this.bootstrapTopologySnapshotOwner
      .getLatencyTopologyHints(nodeId);
  }

  /**
   * Get service groups that are missing a leader.
   * @return {Object} Missing leader info by service type.
   * @private
   */
  getMissingServiceLeaders() {
    return this.serviceLeaderReadinessOwner.getMissingServiceLeaders();
  }

  /**
   * Build partition ID sets for bootstrap leader-readiness checks.
   * Required tables must have routable leaders before /bootstrap succeeds.
   * @return {Object} Known/required partition ID sets.
   * @private
   */
  getLeaderReadinessPartitionSets() {
    return this.serviceLeaderReadinessOwner.getLeaderReadinessPartitionSets();
  }

  /**
   * Build partition ID sets for one leader-readiness requirement set.
   * Required tables must have routable leaders before the owning concern
   * is considered fully ready.
   * @param {Array<string>} requiredTablesList
   * @return {Object} Known/required partition ID sets.
   * @private
   */
  getLeaderReadinessPartitionSetsForTables(requiredTablesList = []) {
    return this.serviceLeaderReadinessOwner
      .getLeaderReadinessPartitionSetsForTables(requiredTablesList);
  }

  /**
   * Keep missing-partition diagnostics focused on bootstrap-critical tables.
   * Unknown partition IDs are preserved for safety.
   * @param {Array<string>} partitionIds - Missing partition IDs.
   * @param {Array<string>} [requiredTablesList]
   * @return {Array<string>} Filtered missing IDs.
   * @private
   */
  filterMissingRequiredPartitionIds(
      partitionIds = [],
      requiredTablesList,
  ) {
    return this.serviceLeaderReadinessOwner
      .filterMissingRequiredPartitionIds(partitionIds, requiredTablesList);
  }

  /**
   * Build cached leader metadata by service type and entity ID.
   * @param {string} serviceType - Service type value.
   * @param {string} idColumn - Column key for entity ID.
   * @return {Map<string, Object>} Entity ID -> metadata flags.
   * @private
   */
  getCachedLeaderMetadataByServiceType(serviceType, idColumn) {
    return this.serviceLeaderReadinessOwner
      .getCachedLeaderMetadataByServiceType(serviceType, idColumn);
  }

  /**
   * Determine whether a live service instance is currently leader.
   * @param {Object} service - Service instance.
   * @return {boolean} True when the service is leader.
   * @private
   */
  isLiveServiceLeader(service) {
    return this.serviceLeaderReadinessOwner.isLiveServiceLeader(service);
  }

  /**
   * Normalize leader readiness diagnostics for one required-table set.
   * @param {Object} missing - Missing-leader diagnostics.
   * @param {Array<string>} [requiredTablesList]
   * @return {Object} Normalized diagnostics.
   * @private
   */
  normalizeLeaderStatusForRequiredTables(
      missing = {},
      requiredTablesList,
  ) {
    return this.serviceLeaderReadinessOwner
      .normalizeLeaderStatusForRequiredTables(missing, requiredTablesList);
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
    return this.serviceLeaderReadinessOwner
      .getBlockingLeaderStatusForReadiness(missing);
  }

  /**
   * Wait for all service raft groups to have leaders with complete routing info.
   * This is critical for bootstrap - joining nodes need complete leader information
   * (raft_role, node_id, address) to route writes correctly.
   * @return {Promise<Object>} Leader readiness status.
   * @private
   */
  async waitForServiceLeaders() {
    return this.serviceLeaderReadinessOwner.waitForServiceLeaders();
  }

  /**
   * Count total missing leader information from getMissingServiceLeaders result.
   * Includes leaders without addresses - these are useless for query routing.
   * @param {Object} missing - Result from getMissingServiceLeaders.
   * @return {number} Total count of missing leader info.
   * @private
   */
  countMissingLeaderInfo(missing) {
    return this.serviceLeaderReadinessOwner.countMissingLeaderInfo(missing);
  }

  /**
   * Get system partition leaders for new node to query.
   * Prefer live partition services when available to avoid races with cache updates.
   * Cache fallback is strict: partitions.leader_node_id must map to an active
   * partition service on that node.
   * @return {Object} Partition leader addresses by table name.
   */
  getSystemPartitionLeaders() {
    return this.serviceLeaderReadinessOwner.getSystemPartitionLeaders();
  }

  /**
   * Get the list of ready node IDs from the system cache.
   * Always includes the seed node since it's responding to the bootstrap request.
   * Uses ONLY the system cache - no fallbacks.
   * @return {string[]} Ready node IDs.
   */
  getReadyNodes() {
    return this.bootstrapClusterViewOwner
      .getReadyNodes();
  }

  /**
   * Get table policies from the system tables.
   * Uses ONLY the system cache - no fallbacks.
   * @return {Object} Table policies keyed by table name.
   */
  getTablePolicies() {
    return this.bootstrapClusterViewOwner
      .getTablePolicies();
  }

  /**
   * Get the current assignment epoch from the seed node.
   * @return {Object|null} Current epoch data or null if unavailable.
   */
  getCurrentEpoch() {
    return this.bootstrapClusterViewOwner
      .getCurrentEpoch();
  }

  /**
   * Get cluster configuration for new node.
   * @return {Object} Cluster configuration.
   */
  getClusterConfiguration() {
    return this.bootstrapClusterViewOwner
      .getClusterConfiguration();
  }

  /**
   * Get current cluster state.
   * @return {Object} Cluster state.
   */
  getClusterState() {
    return this.bootstrapClusterViewOwner
      .getClusterState();
  }

  /**
   * Update node status - unsupported, status updates should go through CDC.
   * @param {string} _nodeId - Node ID (unused).
   * @param {string} _status - New status (unused).
   */
  updateNodeStatus(_nodeId, _status) {
    this.logger.error(BOOTSTRAP_API_LOG_MSG.UPDATE_NODE_STATUS_UNSUPPORTED);
    throw new Error(BOOTSTRAP_API_ERROR.UPDATE_NODE_STATUS_UNSUPPORTED);
  }

  /**
   * Get the Fastify instance.
   * @return {Object} Fastify instance.
   */
  getFastify() {
    return this.fastify;
  }

  /**
   * Get the ReplicaHandler instance.
   * @return {Object|null} Replica handler or null.
   */
  getReplicaHandler() {
    return this.replicaHandler;
  }

  /**
   * Check if the API is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Shutdown the API server.
   * @return {Promise<void>}
   */
  async shutdown() {
    this.stopMoveReplicaAssignmentSweep();

    if (this.fastify) {
      const server = this.fastify.server;
      if (server && typeof server.closeAllConnections === TYPEOF.FUNCTION) {
        server.closeAllConnections();
      }
      await this.fastify.close();
      if (server && typeof server.close === TYPEOF.FUNCTION) {
        await new Promise((resolve) => {
          server.close((error) => {
            if (error && error.code !== BOOTSTRAP_API_CLOSE_ERROR_CODE) {
              this.logger.warn(BOOTSTRAP_API_LOG_MSG.SERVER_CLOSE_ERROR, {
                error: error.message,
              });
            }
            resolve();
          });
        });
      }
      if (server && typeof server.unref === TYPEOF.FUNCTION) {
        server.unref();
      }
      this.fastify = null;
    }

    this.initialized = false;

    this.logger.info(BOOTSTRAP_API_LOG_MSG.SHUTDOWN, {
      seedNodeId: this.seedNodeId,
    });
  }
}

export {BootstrapAPI, BootstrapStrategy};
