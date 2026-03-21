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
import {v4 as uuidv4, validate as uuidValidate} from 'uuid';
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
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../cache/system-cache-key-descriptor.js';
import {
  resolveCanonicalLeaderService,
} from '../cache/leader-readiness-gate.js';
import {
  isNodeRecordReady,
} from '../node/node-readiness-policy.js';
import {
  BOOTSTRAP_ASSIGNMENT_STRATEGY,
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from './bootstrap-constants.js';
import {NODE_STATE} from '../constants/node-state.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {NODE_CONFIG_KEY, NODE_DEFAULT} from '../node/node-constants.js';
import {CONFIG_CATEGORY, CONFIG_KEY} from '../config/config-constants.js';
import {
  BOOTSTRAP_API_CLUSTER_STATE,
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_CLOSE_ERROR_CODE,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_HEALTH_STATUS,
  BOOTSTRAP_API_HEALTH_STATUS_INITIALIZING,
  BOOTSTRAP_API_HANDOFF_OPERATION,
  BOOTSTRAP_API_HANDOFF_PHASE,
  BOOTSTRAP_API_HANDOFF_STATUS,
  BOOTSTRAP_API_ASSIGNMENT,
  BOOTSTRAP_API_LIVENESS,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_PROBE_SCOPE,
  BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE,
  BOOTSTRAP_API_ROUTE,
  BOOTSTRAP_API_SQL,
  BOOTSTRAP_API_SUBSYSTEM,
} from './bootstrap-api-constants.js';
import {MessageGroupAssignment} from './message-group-assignment.js';
import {
  BootstrapReadinessState,
} from './bootstrap-readiness-state.js';
import {
  READINESS_DEPENDENCY,
} from './bootstrap-readiness-state-constants.js';
import {
  LIFECYCLE_DEPENDENCY_CLASS,
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from './lifecycle-controller-constants.js';
import {
  CONTROL_PLANE_ROLLOUT_REQUIRED,
  assertRequiredControlPlaneRollout,
} from '../runtime/control-plane-rollout-controls.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {AuthoritativeControlPlaneView} from
  '../control-plane/authoritative-control-plane-view.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {
  PRESSURE_WORK_CLASS,
} from '../control-plane/pressure-governor.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {
  buildBootstrapTopologySnapshotEnvelope,
} from './bootstrap-topology-snapshot.js';
import {resolveAdvertisedWebSocketAddress} from
  '../transport/node-address-resolution.js';
import {ServiceRegistrationVisibilityOwner} from
  './owners/service-registration-visibility-owner.js';
import {ServiceRegistrationHandoffOwner} from
  './owners/service-registration-handoff-owner.js';
import {ServiceLeaderReadinessOwner} from
  './owners/service-leader-readiness-owner.js';

/**
 * Bootstrap response strategies.
 */
const BootstrapStrategy = BOOTSTRAP_ASSIGNMENT_STRATEGY;
/**
 * Node statuses that indicate the node is dead and eligible
 * for re-registration via the bootstrap API.
 */
const REJOIN_TERMINAL_STATES = Object.freeze(new Set([
  NODE_STATE.STOPPED,
  NODE_STATE.FAILED,
  NODE_STATE.SHUTTING_DOWN,
]));

const READINESS_DEPENDENCY_NAME = Object.freeze({
  SQL_ENGINE_READY: 'sql_engine_ready',
  LEADER_METADATA_READY: 'leader_metadata_ready',
  RUNTIME_WIRING_READY: 'runtime_wiring_ready',
  CONTROL_PLANE_WRITE_HEALTH: 'control_plane_write_health',
});

const BOOTSTRAP_JOIN_NON_BLOCKING_REASONS = Object.freeze([
  BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
]);

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
    this.moveReplicaAssignmentReservationLock = Promise.resolve();
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
    const statusCode = HTTP_STATUS.OK;
    const response = {
      alive: BOOTSTRAP_API_LIVENESS.ALIVE,
      state: BOOTSTRAP_API_LIVENESS.STATE_RUNNING,
      nodeId: this.seedNodeId,
      timestamp: Date.now(),
    };
    this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.LIVEZ, statusCode);
    reply.code(statusCode);
    return response;
  }

  /**
   * Handle startup completion probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleStartupProbeRequest(reply) {
    const snapshot = this.evaluateReadinessSnapshot();
    const started = this.isStartupComplete();
    const statusCode = started ?
      HTTP_STATUS.OK :
      HTTP_STATUS.SERVICE_UNAVAILABLE;
    const reasons = this.getStartupProbeReasons(snapshot, started);
    const response = {
      started,
      phase: typeof snapshot.phase === TYPEOF.STRING ?
        snapshot.phase :
        LIFECYCLE_PHASE.INIT,
      state: snapshot.state,
      reasons,
      timestamp: snapshot.timestamp,
    };

    if (!started) {
      response.retryAfterMs = snapshot.retryAfterMs;
    }

    this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.STARTUPZ, statusCode);
    reply.code(statusCode);
    return response;
  }

  /**
   * Handle general readiness probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleReadinessProbeRequest(reply) {
    const snapshot = this.evaluateReadinessSnapshot();
    const statusCode = snapshot.ready ?
      HTTP_STATUS.OK :
      HTTP_STATUS.SERVICE_UNAVAILABLE;
    const response = this.buildReadinessProbeResponse(snapshot);

    this.recordReadinessProbeResult(BOOTSTRAP_API_ROUTE.READYZ, statusCode);
    reply.code(statusCode);
    return response;
  }

  /**
   * Handle lightweight bootstrap-join readiness probe.
   * @param {Object} reply - Fastify reply.
   * @return {Object} Probe payload.
   */
  handleBootstrapReadinessProbeRequest(reply) {
    const snapshot = this.resolveReadinessSnapshotForScope(
      this.evaluateReadinessSnapshot(),
      BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN,
    );
    const statusCode = snapshot.ready ?
      HTTP_STATUS.OK :
      HTTP_STATUS.SERVICE_UNAVAILABLE;
    const response = this.buildReadinessProbeResponse(snapshot, {
      scope: BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN,
    });

    this.recordReadinessProbeResult(
      BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY,
      statusCode,
    );
    reply.code(statusCode);
    return response;
  }

  /**
   * Resolve readiness projection for one probe scope.
   * @param {Object} snapshot
   * @param {string} scope
   * @return {Object}
   */
  resolveReadinessSnapshotForScope(snapshot, scope) {
    if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
      return snapshot;
    }
    if (scope !== BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN ||
        snapshot.ready === true) {
      return snapshot;
    }

    const reasons = Array.isArray(snapshot.reasons) ? snapshot.reasons : [];
    const blockingReasons = reasons.filter((reason) =>
      !BOOTSTRAP_JOIN_NON_BLOCKING_REASONS.includes(reason),
    );
    const canProjectReady = this.canProjectBootstrapJoinReadiness(
      snapshot,
      reasons,
      blockingReasons,
    );
    if (!canProjectReady) {
      return snapshot;
    }

    return {
      ...snapshot,
      ready: true,
      reasons: [],
      retryAfterMs: NUM.ZERO,
    };
  }

  /**
   * Determine whether bootstrap join scope can project ready=true.
   * @param {Object} snapshot
   * @param {Array<string>} reasons
   * @param {Array<string>} blockingReasons
   * @return {boolean}
   */
  canProjectBootstrapJoinReadiness(snapshot, reasons, blockingReasons) {
    if (snapshot.draining === true) {
      return false;
    }
    if (snapshot.phase === LIFECYCLE_PHASE.CONTROL_READY) {
      if (reasons.length === NUM.ZERO) {
        return false;
      }
      return blockingReasons.length === NUM.ZERO;
    }

    if (snapshot.phase === LIFECYCLE_PHASE.JOIN_READY) {
      return reasons.length === NUM.ONE &&
        reasons[NUM.ZERO] ===
          LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING;
    }

    return false;
  }

  /**
   * Build canonical readiness probe response body.
   * @param {Object} snapshot - Current readiness snapshot.
   * @param {Object} options
   * @param {string} [options.scope] - Optional readiness scope.
   * @return {Object}
   */
  buildReadinessProbeResponse(snapshot, options = {}) {
    const response = {
      ready: snapshot.ready === true,
      phase: typeof snapshot.phase === TYPEOF.STRING ?
        snapshot.phase :
        LIFECYCLE_PHASE.INIT,
      state: snapshot.state,
      reasons: Array.isArray(snapshot.reasons) ? snapshot.reasons : [],
      timestamp: snapshot.timestamp,
    };
    if (snapshot.draining === true) {
      response.draining = true;
    }
    if (Number.isFinite(snapshot.drainDeadlineMs)) {
      response.drainDeadlineMs = Math.floor(snapshot.drainDeadlineMs);
    }
    if (Number.isFinite(snapshot.retryAfterMs)) {
      response.retryAfterMs = snapshot.retryAfterMs;
    }
    if (typeof options.scope === TYPEOF.STRING && options.scope.length > NUM.ZERO) {
      response.scope = options.scope;
    }
    return response;
  }

  /**
   * Evaluate readiness owner after updating dependency signals.
   * @return {Object} Current readiness snapshot.
   */
  evaluateReadinessSnapshot() {
    if (!this.readinessState || typeof this.readinessState.setDependency !== TYPEOF.FUNCTION) {
      if (typeof this.readinessState?.evaluate === TYPEOF.FUNCTION) {
        return this.readinessState.evaluate();
      }
      if (typeof this.readinessState?.getSnapshot === TYPEOF.FUNCTION) {
        return this.readinessState.getSnapshot();
      }
      return {
        ready: false,
        phase: LIFECYCLE_PHASE.INIT,
        state: BOOTSTRAP_PHASE.NOT_STARTED,
        reasons: [BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE],
        retryAfterMs: NUM.ZERO,
        timestamp: Date.now(),
      };
    }

    const startupComplete = this.isStartupComplete();
    this.readinessState.setDependency(
      READINESS_DEPENDENCY.STARTUP_COMPLETE,
      startupComplete,
      {
        reasonCode: BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
        details: {
          phase: this.bootstrapService?.phase || null,
        },
      },
    );

    this.readinessState.setDependency(
      READINESS_DEPENDENCY_NAME.SQL_ENGINE_READY,
      this.isSqlEngineDependencyReady(),
      {
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE,
      },
    );

    const leaderStatus = this.getLeaderReadinessStatusForProbe();
    this.readinessState.setDependency(
      READINESS_DEPENDENCY_NAME.LEADER_METADATA_READY,
      leaderStatus.ready === true,
      {
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
        details: leaderStatus,
      },
    );

    this.readinessState.setDependency(
      READINESS_DEPENDENCY_NAME.RUNTIME_WIRING_READY,
      this.isRuntimeWiringReady(),
      {
        reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      },
    );

    const controlPlaneWriteHealth = this.getControlPlaneWriteHealth();
    this.readinessState.setDependency(
      READINESS_DEPENDENCY_NAME.CONTROL_PLANE_WRITE_HEALTH,
      controlPlaneWriteHealth.healthy === true,
      {
        reasonCode: controlPlaneWriteHealth.reasonCode,
        details: controlPlaneWriteHealth.details,
        classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
      },
    );

    return this.readinessState.evaluate();
  }

  /**
   * Resolve health status of background control-plane writers.
   * @return {{healthy: boolean, reasonCode: string, details: Object|null}}
   */
  getControlPlaneWriteHealth() {
    if (typeof this.controlPlaneWriteHealthProvider !== TYPEOF.FUNCTION) {
      return {
        healthy: true,
        reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
        details: null,
      };
    }

    try {
      const health = this.controlPlaneWriteHealthProvider() || {};
      const healthy = health.healthy !== false;
      return {
        healthy,
        reasonCode:
          typeof health.reasonCode === TYPEOF.STRING &&
            health.reasonCode.length > NUM.ZERO ?
            health.reasonCode :
            LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
        details:
          health.details && typeof health.details === TYPEOF.OBJECT ?
            health.details :
            null,
      };
    } catch (error) {
      return {
        healthy: false,
        reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
        details: {
          error: error?.message || String(error),
        },
      };
    }
  }

  /**
   * Build startup-probe reasons from readiness snapshot.
   * @param {Object} snapshot
   * @param {boolean} started
   * @return {string[]}
   */
  getStartupProbeReasons(snapshot, started) {
    if (started) {
      return [];
    }

    const reasons = Array.isArray(snapshot?.reasons) ?
      [...snapshot.reasons] :
      [];
    if (!reasons.includes(BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE)) {
      reasons.unshift(BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE);
    }
    return reasons;
  }

  /**
   * Determine whether startup bootstrap has completed.
   * @return {boolean}
   */
  isStartupComplete() {
    if (!this.bootstrapService) {
      return true;
    }
    return this.bootstrapService.phase === BOOTSTRAP_PHASE.COMPLETE;
  }

  /**
   * Determine whether runtime wiring is available for join-safe traffic.
   * @return {boolean}
   */
  isRuntimeWiringReady() {
    if (!this.bootstrapService) {
      return true;
    }
    return Boolean(this.messageRouter || this.bootstrapService?.messageRouter);
  }

  /**
   * Determine whether SQL dependency is available for bootstrap operations.
   * @return {boolean}
   */
  isSqlEngineDependencyReady() {
    if (!this.bootstrapService) {
      return true;
    }
    return Boolean(this.sqlQueryEngine);
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
    if (typeof this.readinessState?.recordProbeResult !== TYPEOF.FUNCTION) {
      return;
    }
    this.readinessState.recordProbeResult(endpoint, statusCode);
  }

  /**
   * Mark lifecycle readiness as draining and immediately non-ready.
   * @param {Object} [options]
   * @param {number} [options.drainDeadlineMs]
   * @param {string} [options.reasonCode]
   * @return {Object}
   */
  markDraining(options = {}) {
    if (typeof this.readinessState?.beginDrain === TYPEOF.FUNCTION) {
      return this.readinessState.beginDrain({
        drainDeadlineMs: options.drainDeadlineMs,
        reasonCode: options.reasonCode || LIFECYCLE_REASON.NODE_DRAINING,
      });
    }

    if (typeof this.readinessState?.transitionTo === TYPEOF.FUNCTION) {
      return this.readinessState.transitionTo('DEGRADED', {
        ready: false,
        reasons: [options.reasonCode || LIFECYCLE_REASON.NODE_DRAINING],
      });
    }

    return this.getReadinessSnapshotForDiagnostics();
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
    const snapshot = this.getReadinessSnapshotForDiagnostics();
    const reasons = this.mergeReadinessReasons(
      snapshot.reasons,
      options.reasonCode,
    );
    const response = {
      success: false,
      error: options.error,
      code: options.code,
      reasons,
      retryAfterMs: Number.isFinite(options.retryAfterMs) ?
        Math.max(NUM.ZERO, Math.floor(options.retryAfterMs)) :
        (Number.isFinite(snapshot.retryAfterMs) ?
          snapshot.retryAfterMs :
          NUM.ZERO),
    };

    if (typeof options.phase === TYPEOF.STRING && options.phase.length > NUM.ZERO) {
      response.phase = options.phase;
    }

    if (typeof snapshot.state === TYPEOF.STRING && snapshot.state.length > NUM.ZERO) {
      response.state = snapshot.state;
    }

    if (options.leaderReadiness &&
        typeof options.leaderReadiness === TYPEOF.OBJECT) {
      response.leaderReadiness = {
        ...options.leaderReadiness,
      };
      for (const field of [
        'missingPartitionLeaders',
        'missingPartitionLeaderNodes',
        'missingPartitionLeaderAddresses',
        'missingMessageGroupLeaders',
        'missingMessageGroupLeaderNodes',
        'missingMessageGroupLeaderAddresses',
      ]) {
        if (!Array.isArray(options.leaderReadiness[field])) {
          continue;
        }
        response[field] = [...options.leaderReadiness[field]];
      }
    }

    return response;
  }

  /**
   * Return best-effort readiness snapshot for operation diagnostics.
   * @return {Object}
   */
  getReadinessSnapshotForDiagnostics() {
    try {
      return this.evaluateReadinessSnapshot();
    } catch (_error) {
      const fallbackSnapshot = typeof this.readinessState?.getSnapshot === TYPEOF.FUNCTION ?
        this.readinessState.getSnapshot() :
        null;
      if (fallbackSnapshot) {
        return fallbackSnapshot;
      }
      return {
        ready: false,
        phase: LIFECYCLE_PHASE.INIT,
        state: BOOTSTRAP_PHASE.NOT_STARTED,
        reasons: [],
        retryAfterMs: NUM.ZERO,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Merge readiness reasons with one required reason code.
   * @param {Array<string>} reasons
   * @param {string} reasonCode
   * @return {Array<string>}
   */
  mergeReadinessReasons(reasons, reasonCode) {
    const merged = Array.isArray(reasons) ?
      [...reasons] :
      [];
    if (typeof reasonCode !== TYPEOF.STRING || reasonCode.length === NUM.ZERO) {
      return merged;
    }
    if (!merged.includes(reasonCode)) {
      merged.push(reasonCode);
    }
    return merged;
  }

  /**
   * Handle bootstrap request from a new node.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<Object>} Bootstrap response.
   */
  async handleBootstrapRequest(request, reply) {
    const {nodeId, nodeAddress} = request.body || {};

    this.logger.info(BOOTSTRAP_API_LOG_MSG.RECEIVED_BOOTSTRAP_REQUEST, {
      nodeId,
      nodeAddress,
      seedNodeId: this.seedNodeId,
    });

    // Validate request
    const validationError = this.validateBootstrapRequest(nodeId, nodeAddress);
    if (validationError) {
      this.logger.warn(BOOTSTRAP_API_LOG_MSG.VALIDATION_FAILED, {
        nodeId,
        nodeAddress,
        error: validationError,
      });
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {error: validationError};
    }

    if (this.bootstrapService &&
        this.bootstrapService.phase !== BOOTSTRAP_PHASE.COMPLETE) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
      return this.buildBootstrapNotReadyResponse({
        error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        phase: this.bootstrapService.phase,
        reasonCode: BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
      });
    }

    // Check for conflicts
    const conflictError = await this.checkForConflicts(nodeId, nodeAddress);
    if (conflictError) {
      this.logger.warn(BOOTSTRAP_API_LOG_MSG.CONFLICT_DETECTED, {
        nodeId,
        nodeAddress,
        error: conflictError,
      });
      reply.code(HTTP_STATUS.CONFLICT);
      return {error: conflictError};
    }

    const now = Date.now();
    const blockingMoveReplicaAdmissions =
      await this.getBlockingMoveReplicaBootstrapAdmissions(now);
    if (blockingMoveReplicaAdmissions.length > NUM.ZERO) {
      const blockingReservation = blockingMoveReplicaAdmissions[NUM.ZERO];
      const retryAfterMs =
        this.resolveMoveReplicaBootstrapAdmissionRetryAfterMs(
          blockingReservation,
          now,
        );
      this.logger.warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_ADMISSION_DEFERRED, {
        nodeId,
        nodeAddress,
        seedNodeId: this.seedNodeId,
        admissionBlock: 'move_replica_handoff_stabilizing',
        assignmentId: blockingReservation.assignmentId,
        replicaId: blockingReservation.replicaId,
        groupId: blockingReservation.groupId || null,
        sourceNodeId: blockingReservation.sourceNodeId || null,
        targetNodeId: blockingReservation.targetNodeId,
        retryAfterMs,
      });
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
      return this.buildBootstrapNotReadyResponse({
        error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        reasonCode:
          BOOTSTRAP_API_PROBE_REASON.MOVE_REPLICA_HANDOFF_STABILIZING,
        retryAfterMs,
      });
    }

    if (this.inFlightBootstrapRequestCount >=
        this.maxConcurrentBootstrapRequests) {
      this.logger.warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_ADMISSION_DEFERRED, {
        nodeId,
        nodeAddress,
        seedNodeId: this.seedNodeId,
        inFlightBootstrapRequests: this.inFlightBootstrapRequestCount,
        maxConcurrentBootstrapRequests: this.maxConcurrentBootstrapRequests,
        retryAfterMs: this.bootstrapAdmissionRetryAfterMs,
      });
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
      return this.buildBootstrapNotReadyResponse({
        error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        reasonCode: BOOTSTRAP_API_PROBE_REASON.JOIN_ADMISSION_BACKPRESSURED,
        retryAfterMs: this.bootstrapAdmissionRetryAfterMs,
      });
    }

    this.inFlightBootstrapRequestCount += 1;
    try {
      const leaderStatus = await this.waitForServiceLeaders();
      if (!leaderStatus.ready) {
        this.logger.warn(BOOTSTRAP_API_LOG_MSG.LEADERS_NOT_READY, {
          nodeId,
          missingPartitionLeaders: leaderStatus.missingPartitionLeaders,
          missingMessageGroupLeaders: leaderStatus.missingMessageGroupLeaders,
          missingPartitionLeaderNodes: leaderStatus.missingPartitionLeaderNodes,
          missingMessageGroupLeaderNodes: leaderStatus.missingMessageGroupLeaderNodes,
        });
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return this.buildBootstrapNotReadyResponse({
          error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
          code: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          leaderReadiness: leaderStatus,
        });
      }

      // Determine message group assignment strategy
      const assignment = await this.determineAndReserveMessageGroupAssignment(nodeId);

      // Get current assignment epoch if available
      const currentEpoch = this.getCurrentEpoch();
      const {
        systemTableSnapshots,
        topologySnapshotMeta,
      } = this.buildBootstrapTopologySnapshotEnvelope({
        currentEpoch,
      });

      // Get cluster configuration
      const clusterConfig = this.getClusterConfiguration();

      // Get ready nodes for pull-based assignment
      const readyNodes = this.getReadyNodes();

      this.logger.info(BOOTSTRAP_API_LOG_MSG.READY_NODES_FOR_BOOTSTRAP, {
        nodeId,
        readyNodesCount: readyNodes.length,
        readyNodes,
        seedNodeId: this.seedNodeId,
      });

      // Get table policies for assignment validation
      const tablePolicies = this.getTablePolicies();
      const latencyTopologyHints = this.getLatencyTopologyHints(nodeId);

      // Node registration happens after WebSocket IDENTIFY + NODE_STATE_UPDATE.
      // System table cache is the source of truth.

      // Build seed node WebSocket address for cross-node communication
      const seedNodeWsAddress = resolveAdvertisedWebSocketAddress({
        advertisedAddress: this.seedNodeWsAddress,
        nodeAddress: this.seedNodeAddress ||
          BOOTSTRAP_API_DEFAULT.WS_HOST,
        wsPort: this.wsPort || null,
      });

      const response = {
        success: true,
        seedNodeId: this.seedNodeId,
        seedNodeAddress: this.seedNodeAddress,
        seedNodeWsAddress,
        messageGroupAssignment: assignment,
        systemTableSnapshots,
        topologySnapshotMeta,
        readyNodes,
        tablePolicies,
        currentEpoch,
        latencyTopologyHints,
        clusterConfig,
        leaderReadiness: {
          ready: leaderStatus.ready === true,
          missingPartitionLeaders: leaderStatus.missingPartitionLeaders || [],
          missingPartitionLeaderNodes:
            leaderStatus.missingPartitionLeaderNodes || [],
          missingPartitionLeaderAddresses:
            leaderStatus.missingPartitionLeaderAddresses || [],
          missingMessageGroupLeaders:
            leaderStatus.missingMessageGroupLeaders || [],
          missingMessageGroupLeaderNodes:
            leaderStatus.missingMessageGroupLeaderNodes || [],
          missingMessageGroupLeaderAddresses:
            leaderStatus.missingMessageGroupLeaderAddresses || [],
        },
        timestamp: Date.now(),
      };

      this.logger.info(BOOTSTRAP_API_LOG_MSG.RESPONSE_PREPARED, {
        nodeId,
        strategy: assignment.strategy,
        groupId: assignment.groupId,
      });

      return response;
    } catch (error) {
      this.logger.error(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_FAILED, {
        nodeId,
        nodeAddress,
        error: error.message,
        stack: error.stack,
      });
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      throw error;
    } finally {
      this.inFlightBootstrapRequestCount = Math.max(
        NUM.ZERO,
        this.inFlightBootstrapRequestCount - NUM.ONE,
      );
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
    if (!handoffContext || sourceRemovalCompleted === true) {
      return false;
    }
    return this.isRetryableMoveReplicaHandoffError(error);
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
    if (!previousServiceRow ||
        typeof previousServiceRow !== TYPEOF.OBJECT) {
      return;
    }

    try {
      const rollbackResult = await this.executeBootstrapControlPlaneMutation({
        operation: 'upsert',
        tableName: TABLES.SERVICES,
        row: this.buildRegisteredServiceMutationRow(previousServiceRow),
      }, {
        skipCacheWait: true,
      });
      if (rollbackResult?.success === false) {
        throw this.buildBootstrapControlPlaneQueryError(
          rollbackResult,
          BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_FAILED,
        );
      }
      await this.waitForRegisteredServiceCacheVisibility(previousServiceRow);
      this.logger.warn('Restored previous service owner after failed MOVE_REPLICA target registration', {
        serviceId: requestedServiceData?.[COLUMN.SERVICE_ID] || null,
        targetNodeId: requestedServiceData?.[COLUMN.NODE_ID] || null,
        restoredNodeId: previousServiceRow?.[COLUMN.NODE_ID] || null,
        error: error?.message || String(error),
      });
    } catch (rollbackError) {
      this.logger.error('Failed to restore previous service owner after MOVE_REPLICA target registration failure', {
        serviceId: requestedServiceData?.[COLUMN.SERVICE_ID] || null,
        targetNodeId: requestedServiceData?.[COLUMN.NODE_ID] || null,
        restoredNodeId: previousServiceRow?.[COLUMN.NODE_ID] || null,
        error: rollbackError?.message || String(rollbackError),
        originalError: error?.message || String(error),
      });
    }
  }

  /**
   * Determine whether this register-service request is a MOVE_REPLICA handoff.
   * @param {Object} serviceData - Incoming register-service payload.
   * @return {boolean} True when handoff tracking should be enabled.
   * @private
   */
  isMoveReplicaHandoffRequest(serviceData) {
    const serviceId = serviceData?.[COLUMN.SERVICE_ID];
    const serviceType = serviceData?.[COLUMN.SERVICE_TYPE];
    const targetNodeId = serviceData?.[COLUMN.NODE_ID];
    const assignmentId = serviceData?.[BOOTSTRAP_API_ASSIGNMENT.FIELD_ID];

    if (!serviceId || !targetNodeId) {
      return false;
    }
    if (serviceType !== SERVICE_TYPE.MESSAGE_GROUP) {
      return false;
    }
    if (targetNodeId === this.seedNodeId) {
      return false;
    }
    if (typeof assignmentId === TYPEOF.STRING &&
        assignmentId.length > NUM.ZERO) {
      return true;
    }
    return this.messageGroupServices.has(serviceId);
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
    const cached = this.normalizeMoveReplicaAssignmentReservationRow(
      this.moveReplicaAssignmentReservations.get(assignmentId),
    );
    if (cached) {
      return {
        reservation: cached,
        lookupUnavailable: false,
        error: null,
      };
    }

    const cachedRow = this.normalizeMoveReplicaAssignmentReservationRow(
      this.systemTableCache?.get(TABLES.REPLICA_OPERATIONS, assignmentId),
    );
    if (cachedRow) {
      this.moveReplicaAssignmentReservations.set(assignmentId, cachedRow);
      return {
        reservation: cachedRow,
        lookupUnavailable: false,
        error: null,
      };
    }

    if (!this.sqlQueryEngine) {
      return {
        reservation: null,
        lookupUnavailable: false,
        error: null,
      };
    }

    let queryResult = null;
    try {
      queryResult = await this.executeBootstrapControlPlaneQuery(
        BOOTSTRAP_API_SQL.SELECT_REPLICA_OPERATION_BY_ID,
        [assignmentId],
      );
    } catch (error) {
      return {
        reservation: null,
        lookupUnavailable: true,
        error: error?.message || String(error),
      };
    }
    if (queryResult?.success === false) {
      return {
        reservation: null,
        lookupUnavailable: true,
        error:
          queryResult.error ||
          BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE,
      };
    }
    const row = Array.isArray(queryResult?.rows) ? queryResult.rows[NUM.ZERO] : null;
    if (!row) {
      return {
        reservation: null,
        lookupUnavailable: false,
        error: null,
      };
    }
    const type = row.type || row.operation_type || null;
    if (type !== BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE) {
      return {
        reservation: null,
        lookupUnavailable: false,
        error: null,
      };
    }
    const normalized = this.normalizeMoveReplicaAssignmentReservationRow(row);
    if (!normalized) {
      return {
        reservation: null,
        lookupUnavailable: false,
        error: null,
      };
    }
    this.moveReplicaAssignmentReservations.set(assignmentId, normalized);
    return {
      reservation: normalized,
      lookupUnavailable: false,
      error: null,
    };
  }

  /**
   * Validate MOVE_REPLICA assignment token on register-service.
   * @param {Object} serviceData
   * @return {Promise<Object|null>}
   * @private
   */
  async validateMoveReplicaAssignmentToken(serviceData) {
    if (!this.isMoveReplicaHandoffRequest(serviceData)) {
      return null;
    }

    const assignmentId = serviceData[BOOTSTRAP_API_ASSIGNMENT.FIELD_ID];
    if (typeof assignmentId !== TYPEOF.STRING || assignmentId.length === NUM.ZERO) {
      throw this.buildRegisterServiceValidationError(
        HTTP_STATUS.BAD_REQUEST,
        BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_REQUIRED,
        BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_REQUIRED,
      );
    }

    const reservationLookup =
      await this.getMoveReplicaAssignmentReservationById(assignmentId);
    if (reservationLookup.lookupUnavailable) {
      throw this.buildRegisterServiceValidationError(
        HTTP_STATUS.SERVICE_UNAVAILABLE,
        BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE,
        BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE
          .ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE,
        {
          retryAfterMs: this.moveReplicaAssignmentSweepIntervalMs,
          details: {
            assignmentId,
            cause:
              reservationLookup.error ||
              BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_LOOKUP_UNAVAILABLE,
          },
        },
      );
    }
    const reservation = reservationLookup.reservation;
    if (!reservation) {
      throw this.buildRegisterServiceValidationError(
        HTTP_STATUS.CONFLICT,
        BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_UNKNOWN,
        BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_UNKNOWN,
      );
    }

    if (BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status)) {
      throw this.buildRegisterServiceValidationError(
        HTTP_STATUS.CONFLICT,
        BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_UNKNOWN,
        BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_UNKNOWN,
      );
    }

    const requestedReplicaId = serviceData[COLUMN.REPLICA_ID] || serviceData[COLUMN.SERVICE_ID];
    const requestedNodeId = serviceData[COLUMN.NODE_ID];
    if (reservation.replicaId !== requestedReplicaId ||
        reservation.targetNodeId !== requestedNodeId ||
        (reservation.groupId && serviceData[COLUMN.GROUP_ID] &&
          reservation.groupId !== serviceData[COLUMN.GROUP_ID])) {
      throw this.buildRegisterServiceValidationError(
        HTTP_STATUS.CONFLICT,
        BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_MISMATCH,
        BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_MISMATCH,
      );
    }

    const now = Date.now();
    if (!Number.isFinite(reservation.leaseExpiresAt) || reservation.leaseExpiresAt <= now) {
      const renewedReservation =
        await this.renewMoveReplicaAssignmentReservation(
          reservation,
          {
            now,
            force: true,
            phase: 'lease_renewed',
          },
        );
      if (renewedReservation) {
        return renewedReservation;
      }
      await this.markMoveReplicaAssignmentReservationTerminal(
        assignmentId,
        BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
        WORKFLOW_STEP.FAILED,
        'assignment token expired',
      );
      throw this.buildRegisterServiceValidationError(
        HTTP_STATUS.CONFLICT,
        BOOTSTRAP_API_ERROR.ASSIGNMENT_TOKEN_EXPIRED,
        BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.ASSIGNMENT_TOKEN_EXPIRED,
      );
    }

    return this.renewMoveReplicaAssignmentReservation(
      reservation,
      {
        now,
        force: false,
        phase: 'validated',
      },
    );
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
    if (!Number.isFinite(reservation?.leaseExpiresAt)) {
      return false;
    }
    const renewalWindowMs = Math.max(
      NUM.ONE,
      Math.floor(this.moveReplicaAssignmentLeaseMs / NUM.TWO),
    );
    return reservation.leaseExpiresAt - now <= renewalWindowMs;
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
    const now = Number.isFinite(options.now) ?
      Math.floor(options.now) :
      Date.now();
    const force = options.force === true;
    const phase = typeof options.phase === TYPEOF.STRING &&
      options.phase.length > NUM.ZERO ?
      options.phase :
      'lease_renewed';

    if (force) {
      if (!this.canReviveExpiredMoveReplicaAssignmentReservation(reservation)) {
        return null;
      }
    } else if (!this.shouldRenewMoveReplicaAssignmentReservation(
      reservation,
      now,
    )) {
      return reservation;
    }

    const leaseExpiresAt = now + this.moveReplicaAssignmentLeaseMs;
    const status = reservation.status || BOOTSTRAP_API_HANDOFF_STATUS.PREPARING;
    const step = WORKFLOW_STEP.PENDING;
    const existingStepsHistory = Array.isArray(reservation.stepsHistory) ?
      reservation.stepsHistory :
      [];
    const stepsHistory = [
      ...existingStepsHistory,
      {
        phase,
        step,
        status,
        timestamp: now,
        leaseExpiresAt,
      },
    ];
    const renewedReservation = {
      ...reservation,
      status,
      leaseExpiresAt,
      updatedAt: now,
      stepsHistory,
    };

    this.moveReplicaAssignmentReservations.set(
      renewedReservation.assignmentId,
      renewedReservation,
    );

    if (this.sqlQueryEngine) {
      try {
        const updateResult = await this.executeBootstrapControlPlaneQuery(
          BOOTSTRAP_API_SQL.UPDATE_REPLICA_OPERATION,
          [
            status,
            step,
            now,
            leaseExpiresAt,
            null,
            JSON.stringify(stepsHistory),
            renewedReservation.assignmentId,
          ],
        );
        if (updateResult?.success === false) {
          this.logger.warn(
            BOOTSTRAP_API_LOG_MSG
              .MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED,
            {
              assignmentId: renewedReservation.assignmentId,
              status,
              error:
                updateResult.error ||
                'failed to persist MOVE_REPLICA assignment lease renewal',
            },
          );
          return force ? null : reservation;
        }
      } catch (renewalWriteError) {
        this.logger.warn(
          BOOTSTRAP_API_LOG_MSG
            .MOVE_REPLICA_ASSIGNMENT_RENEWAL_WRITE_FAILED,
          {
            assignmentId: renewedReservation.assignmentId,
            status,
            error: renewalWriteError.message,
          },
        );
      }
    }

    this.logger.info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RENEWED, {
      assignmentId: renewedReservation.assignmentId,
      replicaId: renewedReservation.replicaId,
      targetNodeId: renewedReservation.targetNodeId,
      sourceNodeId: renewedReservation.sourceNodeId,
      phase,
      leaseExpiresAt,
    });

    return renewedReservation;
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
    if (!reservation?.replicaId) {
      return false;
    }
    if (reservation.sourceNodeId &&
        reservation.sourceNodeId !== this.seedNodeId) {
      return false;
    }
    return this.messageGroupServices?.has?.(reservation.replicaId) === true;
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
    const existingRow =
      this.systemTableCache?.get(TABLES.SERVICES, reservation?.replicaId) || null;
    const existingNodeId = existingRow?.[COLUMN.NODE_ID] || null;
    const existingStatus = String(
      existingRow?.[COLUMN.STATUS] || STRING.UNKNOWN,
    ).toLowerCase();
    const hasActiveServiceOwner = existingStatus === SERVICE_STATUS.ACTIVE;
    const sourceOwnsActiveReplica = hasActiveServiceOwner &&
      existingNodeId === (reservation?.sourceNodeId || null);
    const targetOwnsActiveReplica = hasActiveServiceOwner &&
      existingNodeId === (reservation?.targetNodeId || null);
    const sourceNodeRow = reservation?.sourceNodeId ?
      this.systemTableCache?.get(TABLES.NODES, reservation.sourceNodeId) || null :
      null;
    const targetNodeRow = reservation?.targetNodeId ?
      this.systemTableCache?.get(TABLES.NODES, reservation.targetNodeId) || null :
      null;
    const sourceNodeReady = !sourceNodeRow ||
      isNodeRecordReady(sourceNodeRow, {now});
    const targetNodeReady = !!targetNodeRow &&
      isNodeRecordReady(targetNodeRow, {now});
    const sourceReplicaPresentLocally =
      this.isMoveReplicaAssignmentSourceReplicaPresentLocally(reservation);
    const continuingTargetAdoption = targetOwnsActiveReplica &&
      sourceReplicaPresentLocally;
    const observedCommitted = targetOwnsActiveReplica &&
      !sourceReplicaPresentLocally;

    return {
      existingRow,
      existingNodeId,
      existingStatus,
      hasActiveServiceOwner,
      sourceOwnsActiveReplica,
      targetOwnsActiveReplica,
      sourceNodeReady,
      targetNodeReady,
      sourceReplicaPresentLocally,
      continuingTargetAdoption,
      observedCommitted,
    };
  }

  /**
   * Check whether an expired reservation still matches the source owner that
   * originally granted the handoff.
   * @param {Object} reservation
   * @return {boolean}
   * @private
   */
  canReviveExpiredMoveReplicaAssignmentReservation(reservation) {
    if (!reservation?.replicaId || !reservation?.targetNodeId) {
      return false;
    }
    if (BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status)) {
      return false;
    }
    const ownership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(reservation);
    if (!ownership.hasActiveServiceOwner || ownership.observedCommitted) {
      return false;
    }
    return ownership.sourceOwnsActiveReplica ||
      ownership.continuingTargetAdoption;
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
    if (!reservation?.replicaId) {
      return false;
    }
    const ownership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(
        reservation,
        now,
      );
    if (ownership.observedCommitted) {
      return false;
    }

    // Local replica presence combined with source node readiness
    // is authoritative evidence the source is viable, even when
    // CDC propagation delay causes the cache service row to be
    // missing or stale.  This prevents the sweep from terminating
    // reservations under load while still invalidating them when
    // the source node genuinely loses readiness.
    if (ownership.sourceReplicaPresentLocally &&
        ownership.sourceNodeReady) {
      return true;
    }

    if (!ownership.hasActiveServiceOwner) {
      return false;
    }

    if (!reservation.sourceNodeId) {
      return ownership.continuingTargetAdoption ||
        ownership.targetOwnsActiveReplica;
    }

    if (ownership.continuingTargetAdoption) {
      return true;
    }

    if (!ownership.sourceOwnsActiveReplica) {
      return false;
    }
    return ownership.sourceNodeReady;
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
    if (!reservation ||
        typeof reservation.assignmentId !== TYPEOF.STRING ||
        reservation.assignmentId.length === NUM.ZERO) {
      return 'invalid_reservation';
    }
    if (!reservation.replicaId || !reservation.targetNodeId) {
      return 'missing_assignment_fields';
    }
    if (BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(reservation.status)) {
      return 'terminal';
    }
    if (!BOOTSTRAP_API_ASSIGNMENT.ACTIVE_RESERVATION_STATUSES.includes(
      reservation.status,
    )) {
      return 'inactive_status';
    }
    const ownership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(
        reservation,
        now,
      );
    if (ownership.observedCommitted) {
      return null;
    }
    if (!Number.isFinite(reservation.leaseExpiresAt)) {
      return 'missing_lease';
    }
    if (reservation.leaseExpiresAt <= now) {
      return 'lease_expired';
    }
    if (!this.hasViableMoveReplicaAssignmentSource(reservation, now)) {
      return 'source_owner_unavailable';
    }
    return null;
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
    if (!reservation ||
        BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(
          reservation.status,
        )) {
      return false;
    }
    return this.evaluateMoveReplicaAssignmentReservationOwnership(
      reservation,
      now,
    ).observedCommitted;
  }

  /**
   * Enforce one active owner row per message-group replica registration.
   * @param {Object} serviceData
   * @param {Object|null} assignmentContext
   * @return {void}
   * @private
   */
  assertSingleOwnerReplicaRegistration(serviceData, assignmentContext) {
    if (serviceData?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP) {
      return;
    }

    const serviceId = serviceData?.[COLUMN.SERVICE_ID];
    const targetNodeId = serviceData?.[COLUMN.NODE_ID];
    const existingRow = this.systemTableCache?.get(TABLES.SERVICES, serviceId);
    if (!existingRow) {
      return;
    }

    const existingNodeId = existingRow[COLUMN.NODE_ID] || null;
    const existingStatus = String(existingRow[COLUMN.STATUS] || STRING.UNKNOWN).toLowerCase();
    if (!existingNodeId ||
      existingNodeId === targetNodeId ||
      existingStatus !== SERVICE_STATUS.ACTIVE) {
      return;
    }

    const assignmentMatchesConflict = assignmentContext &&
      assignmentContext.replicaId === serviceId &&
      assignmentContext.targetNodeId === targetNodeId &&
      assignmentContext.sourceNodeId === existingNodeId;
    if (assignmentMatchesConflict) {
      return;
    }

    // Allow a restarting node to reclaim its self-hosted message
    // group. When a node restarts with CREATE_SELF_HOSTED, it
    // generates deterministic replica IDs that may collide with
    // replicas previously moved to other nodes. The canonical
    // home node (whose ID derives the group ID) is allowed to
    // reclaim those replicas.
    if (this.isCanonicalGroupHomeNode(
      serviceData?.[COLUMN.GROUP_ID], targetNodeId,
    )) {
      return;
    }

    throw this.buildRegisterServiceValidationError(
      HTTP_STATUS.CONFLICT,
      BOOTSTRAP_API_ERROR.REPLICA_OWNER_CONFLICT,
      BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.REPLICA_OWNER_CONFLICT,
    );
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
    if (!groupId || !nodeId) {
      return false;
    }
    const mgAssignment = new MessageGroupAssignment({
      seedNodeAddress: this.seedNodeAddress,
    });
    const canonicalGroupId = mgAssignment.generateGroupId(nodeId);
    return groupId === canonicalGroupId;
  }

  /**
   * Build operation context for MOVE_REPLICA handoff tracking.
   * @param {Object} serviceData - Incoming register-service payload.
   * @return {Object} Handoff context.
   * @private
   */
  buildMoveReplicaHandoffContext(serviceData) {
    const serviceId = serviceData[COLUMN.SERVICE_ID];
    const existing = this.systemTableCache?.get(TABLES.SERVICES, serviceId) || {};
    const now = Date.now();
    const groupId = serviceData[COLUMN.GROUP_ID] || existing[COLUMN.GROUP_ID] || serviceId;
    const sourceNodeId = existing[COLUMN.NODE_ID] || this.seedNodeId;
    const targetNodeId = serviceData[COLUMN.NODE_ID];

    return {
      operationId: uuidv4(),
      type: BOOTSTRAP_API_HANDOFF_OPERATION.TYPE,
      partitionId: groupId,
      entityType: SERVICE_TYPE.MESSAGE_GROUP,
      entityId: groupId,
      replicaId: serviceId,
      sourceNodeId,
      targetNodeId,
      status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      workflowStep: WORKFLOW_STEP.CREATING,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      errorMessage: null,
      stepsHistory: [],
    };
  }

  /**
   * Build handoff context from a pre-reserved assignment token.
   * @param {Object} serviceData
   * @param {Object} assignmentContext
   * @return {Object}
   * @private
   */
  buildMoveReplicaHandoffContextFromAssignment(serviceData, assignmentContext) {
    const now = Date.now();
    const groupId = serviceData[COLUMN.GROUP_ID] || assignmentContext.groupId || null;
    const existingStepsHistory = Array.isArray(assignmentContext?.stepsHistory) ?
      assignmentContext.stepsHistory.map((step) => ({...step})) :
      [];
    return {
      operationId: assignmentContext.assignmentId,
      type: BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE,
      partitionId: groupId,
      entityType: SERVICE_TYPE.MESSAGE_GROUP,
      entityId: groupId,
      replicaId: assignmentContext.replicaId,
      sourceNodeId: assignmentContext.sourceNodeId || this.seedNodeId,
      targetNodeId: assignmentContext.targetNodeId,
      status: assignmentContext.status || BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
      workflowStep: WORKFLOW_STEP.PENDING,
      createdAt: now,
      updatedAt: now,
      completedAt: Number.isFinite(assignmentContext.leaseExpiresAt) ?
        Math.floor(assignmentContext.leaseExpiresAt) :
        null,
      errorMessage: null,
      stepsHistory: existingStepsHistory,
    };
  }

  /**
   * Record handoff phase transition in the operation context.
   * @param {Object} handoffContext - Operation context.
   * @param {string} phase - Handoff phase identifier.
   * @param {string} workflowStep - Workflow step value.
   * @param {string} status - Replica operation status.
   * @private
   */
  recordMoveReplicaHandoffPhase(handoffContext, phase, workflowStep, status) {
    const now = Date.now();
    handoffContext.workflowStep = workflowStep;
    handoffContext.status = status;
    handoffContext.updatedAt = now;
    handoffContext.stepsHistory.push({
      phase,
      step: workflowStep,
      status,
      timestamp: now,
    });

    const existingReservation =
      this.moveReplicaAssignmentReservations.get(handoffContext.operationId);
    if (existingReservation) {
      this.moveReplicaAssignmentReservations.set(handoffContext.operationId, {
        ...existingReservation,
        status,
        updatedAt: now,
        stepsHistory: handoffContext.stepsHistory,
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
    const params = [
      handoffContext.operationId,
      handoffContext.type,
      handoffContext.partitionId,
      handoffContext.replicaId,
      handoffContext.sourceNodeId,
      handoffContext.targetNodeId,
      handoffContext.status,
      handoffContext.workflowStep,
      handoffContext.createdAt,
      handoffContext.updatedAt,
      handoffContext.completedAt,
      handoffContext.errorMessage,
      JSON.stringify(handoffContext.stepsHistory),
      handoffContext.entityType,
      handoffContext.entityId,
    ];

      const result = await this.executeBootstrapControlPlaneQuery(
        BOOTSTRAP_API_SQL.INSERT_REPLICA_OPERATION,
        params,
      );
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
    const params = [
      handoffContext.status,
      handoffContext.workflowStep,
      handoffContext.updatedAt,
      handoffContext.completedAt,
      handoffContext.errorMessage,
      JSON.stringify(handoffContext.stepsHistory),
      handoffContext.operationId,
    ];

    const result = await this.executeBootstrapControlPlaneQuery(
      BOOTSTRAP_API_SQL.UPDATE_REPLICA_OPERATION,
      params,
    );
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

    const handoffContext = assignmentContext ?
      this.buildMoveReplicaHandoffContextFromAssignment(
        serviceData,
        assignmentContext,
      ) :
      this.buildMoveReplicaHandoffContext(serviceData);
    this.recordMoveReplicaHandoffPhase(
      handoffContext,
      BOOTSTRAP_API_HANDOFF_PHASE.PREPARE_TARGET,
      WORKFLOW_STEP.CREATING,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
    );
    if (assignmentContext) {
      try {
        await this.updateMoveReplicaHandoffOperation(handoffContext);
      } catch (handoffWriteError) {
        this.logger.warn(
          BOOTSTRAP_API_LOG_MSG
            .MOVE_REPLICA_HANDOFF_INITIATION_WRITE_FAILED,
          {
            operationId: handoffContext.operationId,
            assignmentId: assignmentContext.assignmentId,
            error: handoffWriteError.message,
          },
        );
      }
      this.moveReplicaAssignmentReservations.set(
        assignmentContext.assignmentId,
        {
          ...assignmentContext,
          status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
          updatedAt: handoffContext.updatedAt,
          leaseExpiresAt: handoffContext.completedAt,
          stepsHistory: handoffContext.stepsHistory,
        },
      );
    } else {
      await this.insertMoveReplicaHandoffOperation(handoffContext);
    }

    this.logger.info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_STARTED, {
      operationId: handoffContext.operationId,
      serviceId: handoffContext.replicaId,
      sourceNodeId: handoffContext.sourceNodeId,
      targetNodeId: handoffContext.targetNodeId,
    });

    return handoffContext;
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
    this.recordMoveReplicaHandoffPhase(handoffContext, phase, workflowStep, status);
    try {
      await this.updateMoveReplicaHandoffOperation(handoffContext);
    } catch (phaseWriteError) {
      this.logger.warn(
        BOOTSTRAP_API_LOG_MSG
          .MOVE_REPLICA_HANDOFF_INITIATION_WRITE_FAILED,
        {
          operationId: handoffContext.operationId,
          phase,
          error: phaseWriteError.message,
        },
      );
    }
    await executor();

    this.logger.info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_PHASE_APPLIED, {
      operationId: handoffContext.operationId,
      phase,
      workflowStep,
      status,
      serviceId: handoffContext.replicaId,
    });
  }

  /**
   * Verify the MOVE_REPLICA target metadata before source removal.
   * @param {Object} handoffContext - Operation context.
   * @param {Object} serviceData - Incoming register-service payload.
   * @return {void}
   * @private
   */
  verifyMoveReplicaHandoffTarget(handoffContext, serviceData) {
    if (handoffContext.sourceNodeId === handoffContext.targetNodeId) {
      throw new Error('MOVE_REPLICA target node must differ from source node');
    }

    const expectedAddress = `${handoffContext.targetNodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${handoffContext.replicaId}`;
    const suppliedAddress = serviceData[COLUMN.ADDRESS];
    if (suppliedAddress && suppliedAddress !== expectedAddress) {
      throw new Error('MOVE_REPLICA target address mismatch');
    }
  }

  /**
   * Mark MOVE_REPLICA handoff as committed.
   * @param {Object} handoffContext - Operation context.
   * @return {Promise<void>}
   * @private
   */
  async completeMoveReplicaHandoff(handoffContext) {
    this.recordMoveReplicaHandoffPhase(
      handoffContext,
      BOOTSTRAP_API_HANDOFF_PHASE.COMMIT_METADATA,
      WORKFLOW_STEP.ACTIVE,
      BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
    );
    handoffContext.completedAt = handoffContext.updatedAt;
    handoffContext.errorMessage = null;
    try {
      await this.updateMoveReplicaHandoffOperation(handoffContext);
    } catch (completionWriteError) {
      this.logger.warn(
        BOOTSTRAP_API_LOG_MSG
          .MOVE_REPLICA_HANDOFF_INITIATION_WRITE_FAILED,
        {
          operationId: handoffContext.operationId,
          phase: BOOTSTRAP_API_HANDOFF_PHASE.COMMIT_METADATA,
          error: completionWriteError.message,
        },
      );
    }
    this.moveReplicaAssignmentReservations.set(handoffContext.operationId, {
      ...(this.moveReplicaAssignmentReservations.get(handoffContext.operationId) || {}),
      assignmentId: handoffContext.operationId,
      replicaId: handoffContext.replicaId,
      sourceNodeId: handoffContext.sourceNodeId,
      targetNodeId: handoffContext.targetNodeId,
      groupId: handoffContext.partitionId,
      status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
      leaseExpiresAt: handoffContext.completedAt,
      updatedAt: handoffContext.updatedAt,
      stepsHistory: handoffContext.stepsHistory,
    });

    this.logger.info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_COMPLETED, {
      operationId: handoffContext.operationId,
      serviceId: handoffContext.replicaId,
      sourceNodeId: handoffContext.sourceNodeId,
      targetNodeId: handoffContext.targetNodeId,
    });
  }

  /**
   * Mark MOVE_REPLICA handoff as failed.
   * @param {Object} handoffContext - Operation context.
   * @param {Error} error - Failure reason.
   * @return {Promise<void>}
   * @private
   */
  async failMoveReplicaHandoff(handoffContext, error) {
    try {
      this.recordMoveReplicaHandoffPhase(
        handoffContext,
        BOOTSTRAP_API_HANDOFF_PHASE.FAILED,
        WORKFLOW_STEP.FAILED,
        BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
      );
      handoffContext.completedAt = handoffContext.updatedAt;
      handoffContext.errorMessage = error?.message || 'unknown MOVE_REPLICA handoff failure';
      await this.updateMoveReplicaHandoffOperation(handoffContext);
      this.moveReplicaAssignmentReservations.set(handoffContext.operationId, {
        ...(this.moveReplicaAssignmentReservations.get(handoffContext.operationId) || {}),
        assignmentId: handoffContext.operationId,
        replicaId: handoffContext.replicaId,
        sourceNodeId: handoffContext.sourceNodeId,
        targetNodeId: handoffContext.targetNodeId,
        groupId: handoffContext.partitionId,
        status: BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
        leaseExpiresAt: handoffContext.completedAt,
        updatedAt: handoffContext.updatedAt,
        stepsHistory: handoffContext.stepsHistory,
      });
    } catch (persistError) {
      this.logger.error(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_FAILED, {
        operationId: handoffContext.operationId,
        serviceId: handoffContext.replicaId,
        error: persistError.message,
      });
      return;
    }

    this.logger.error(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_HANDOFF_FAILED, {
      operationId: handoffContext.operationId,
      serviceId: handoffContext.replicaId,
      sourceNodeId: handoffContext.sourceNodeId,
      targetNodeId: handoffContext.targetNodeId,
      error: error?.message || null,
    });
  }

  /**
   * Remove a local message-group source replica before committing MOVE_REPLICA
   * ownership metadata to another node.
   * @param {Object} serviceData - Incoming register-service payload.
   * @return {Promise<void>}
   * @private
   */
  async removeLocalSourceReplicaForMoveReplica(serviceData) {
    const serviceId = serviceData?.[COLUMN.SERVICE_ID];
    const serviceType = serviceData?.[COLUMN.SERVICE_TYPE];
    const targetNodeId = serviceData?.[COLUMN.NODE_ID];

    if (!serviceId || !targetNodeId) {
      return;
    }

    if (serviceType !== SERVICE_TYPE.MESSAGE_GROUP) {
      return;
    }

    if (targetNodeId === this.seedNodeId) {
      return;
    }

    const localService = this.messageGroupServices.get(serviceId);
    if (!localService) {
      return;
    }

    const existingService = this.systemTableCache?.get(TABLES.SERVICES, serviceId);
    const localAddress = localService.unifiedAddress ||
      existingService?.[COLUMN.ADDRESS] ||
      `${this.seedNodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${serviceId}`;

    this.logger.info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_SOURCE_REMOVAL_START, {
      serviceId,
      sourceNodeId: this.seedNodeId,
      targetNodeId,
      localAddress,
    });

    try {
      if (typeof localService.shutdown === TYPEOF.FUNCTION) {
        await localService.shutdown();
      }
      this.messageGroupServices.delete(serviceId);

      const messageRouter = this.messageRouter || this.bootstrapService?.messageRouter;
      if (messageRouter && typeof messageRouter.unregister === TYPEOF.FUNCTION) {
        messageRouter.unregister(localAddress);
      }

      this.logger.info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_SOURCE_REMOVED, {
        serviceId,
        sourceNodeId: this.seedNodeId,
        targetNodeId,
        localAddress,
      });
    } catch (error) {
      this.logger.error(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_SOURCE_REMOVAL_FAILED, {
        serviceId,
        sourceNodeId: this.seedNodeId,
        targetNodeId,
        error: error.message,
      });
      throw error;
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
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    // Get partition from system cache - the single source of truth
    const partitions = systemTableCache.filter(TABLES.PARTITIONS, (p) =>
      p.table_id === tableName || p.table_name === tableName,
    ) || [];

    if (partitions.length === NUM.ZERO) {
      return null;
    }

    const partition = partitions[NUM.ZERO];

    // Find the leader service
    const services = systemTableCache.filter(TABLES.SERVICES, (service) =>
      service[COLUMN.PARTITION_ID] === partition[COLUMN.PARTITION_ID] &&
      service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
      service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
      service[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
    ) || [];

    if (services.length === NUM.ZERO) {
      return null;
    }

    return {
      partitionId: partition[COLUMN.PARTITION_ID],
      tableName: tableName,
      leaderNodeId: services[NUM.ZERO][COLUMN.NODE_ID],
      replicaId: services[NUM.ZERO][COLUMN.REPLICA_ID] ||
        services[NUM.ZERO][COLUMN.SERVICE_ID],
      address: services[NUM.ZERO][COLUMN.ADDRESS],
    };
  }

  /**
   * Validate bootstrap request parameters.
   * @param {string} nodeId - Node ID from request.
   * @param {string} nodeAddress - Node address from request.
   * @return {string|null} Error message or null if valid.
   */
  validateBootstrapRequest(nodeId, nodeAddress) {
    if (!nodeId) {
      return BOOTSTRAP_API_ERROR.NODE_ID_REQUIRED;
    }

    if (!uuidValidate(nodeId)) {
      return BOOTSTRAP_API_ERROR.NODE_ID_INVALID;
    }

    if (!nodeAddress) {
      return BOOTSTRAP_API_ERROR.NODE_ADDRESS_REQUIRED;
    }

    if (typeof nodeAddress !== TYPEOF.STRING || nodeAddress.length === NUM.ZERO) {
      return BOOTSTRAP_API_ERROR.NODE_ADDRESS_INVALID;
    }

    return null;
  }

  /**
   * Check for node ID or address conflicts using system table cache.
   * @param {string} nodeId - Node ID to check.
   * @param {string} nodeAddress - Node address to check.
   * @return {Promise<string|null>} Error message or null if no conflict.
   */
  async checkForConflicts(nodeId, nodeAddress) {
    const nodeIdAlreadyRegistered = BOOTSTRAP_API_ERROR.NODE_ID_ALREADY_REGISTERED;
    const nodeAddressInUse = BOOTSTRAP_API_ERROR.NODE_ADDRESS_IN_USE;
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    // Check if this is the seed node
    if (nodeId === this.seedNodeId) {
      return BOOTSTRAP_API_ERROR.SEED_NODE_ID_CONFLICT;
    }

    // Check against seed node address
    if (nodeAddress === this.seedNodeAddress) {
      return BOOTSTRAP_API_ERROR.SEED_NODE_ADDRESS_CONFLICT;
    }

    // Check system table cache for existing nodes
    // Check if node ID already exists
    const existingNode = systemTableCache.get(TABLES.NODES, nodeId);
    if (existingNode) {
      const authoritativeExistingNode =
        await this.readAuthoritativeNodeRow(nodeId);
      const effectiveExistingNode =
        authoritativeExistingNode.available ?
          authoritativeExistingNode.row :
          existingNode;
      const existingNodeAddress =
        effectiveExistingNode?.[COLUMN.NODE_ADDRESS] ??
        effectiveExistingNode?.node_address ??
        null;
      if (existingNodeAddress === nodeAddress) {
        this.logger.info(BOOTSTRAP_API_LOG_MSG.IDEMPOTENT_NODE_REJOIN_ALLOWED, {
          nodeId,
          nodeAddress,
          authoritativeOverride:
            authoritativeExistingNode.available === true,
        });
        return null;
      }
      if (effectiveExistingNode && !this._isNodeDead(effectiveExistingNode)) {
        return nodeIdAlreadyRegistered(nodeId);
      }
      this.logger.info(BOOTSTRAP_API_LOG_MSG.STALE_NODE_REJOIN_ALLOWED, {
        nodeId,
        existingStatus:
          effectiveExistingNode?.[COLUMN.STATUS] ?? null,
        existingLease:
          effectiveExistingNode?.[COLUMN.READY_LEASE_EXPIRES_AT] ?? null,
        authoritativeOverride:
          authoritativeExistingNode.available === true,
      });
    }

    // Check for address conflicts (skip dead nodes)
    const allNodes = systemTableCache.getAll(TABLES.NODES) || [];
    for (const node of allNodes) {
      if (node[COLUMN.NODE_ADDRESS] === nodeAddress &&
          node[COLUMN.NODE_ID] !== nodeId &&
          !this._isNodeDead(node)) {
        return nodeAddressInUse(nodeAddress);
      }
    }

    return null;
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
    const status = nodeRecord[COLUMN.STATUS];
    if (REJOIN_TERMINAL_STATES.has(status)) {
      return true;
    }
    const leaseExpiry = Number(
      nodeRecord[COLUMN.READY_LEASE_EXPIRES_AT],
    );
    if (Number.isFinite(leaseExpiry) && leaseExpiry <= Date.now()) {
      return true;
    }
    return false;
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
    const view = this.getAuthoritativeControlPlaneView();
    if (!view?.canRead()) {
      return {
        available: false,
        row: null,
      };
    }

    try {
      const result = await view.readRows(
        TABLES.NODES,
        `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`,
        [nodeId],
      );
      if (result?.success !== true) {
        return {
          available: false,
          row: null,
        };
      }
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const row = rows.find((candidate) => {
        return candidate?.[COLUMN.NODE_ID] === nodeId ||
          candidate?.node_id === nodeId;
      }) || rows[NUM.ZERO] || null;
      return {
        available: true,
        row,
      };
    } catch (_error) {
      return {
        available: false,
        row: null,
      };
    }
  }

  /**
   * Resolve the canonical control-plane view when the bootstrap owner can
   * execute authoritative system-table reads.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */
  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    const cdcIntegrationService = this.getCdcIntegrationService();
    if (!cdcIntegrationService) {
      return null;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.seedNodeId || 'bootstrap-api',
      cdcIntegrationService,
      messageRouter: this.messageRouter || this.bootstrapService?.messageRouter || null,
    });
    return this.authoritativeControlPlaneView;
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
    // Get existing message groups from cache or services
    const messageGroups = this.getMessageGroups();
    const excludedSourceNodeIds = new Set(
      options.excludedSourceNodeIds instanceof Set ?
        options.excludedSourceNodeIds :
        [],
    );

    // BootstrapAPI can only complete MOVE_REPLICA handoff from a source
    // replica it owns locally on the seed. Remote source replicas are not
    // actionable during /register-service because source removal is local-only.
    if (typeof this.seedNodeId === TYPEOF.STRING &&
        this.seedNodeId.length > NUM.ZERO) {
      for (const group of messageGroups) {
        for (const replica of group?.replicas || []) {
          const replicaNodeId = replica?.node_id;
          if (!replicaNodeId || replicaNodeId === this.seedNodeId) {
            continue;
          }
          excludedSourceNodeIds.add(replicaNodeId);
        }
      }
    }

    this.logger.info(BOOTSTRAP_API_LOG_MSG.JOIN_ASSIGNMENT, {
      newNodeId,
      messageGroupCount: messageGroups.length,
      excludedSourceNodeCount: excludedSourceNodeIds.size,
      messageGroups: messageGroups.map((g) => ({
        groupId: g.group_id,
        replicaCount: g.replicas?.length || NUM.ZERO,
        replicas: g.replicas?.map((r) => ({
          replicaId: r.replica_id,
          nodeId: r.node_id,
          address: r.address,
        })),
      })),
    });

    // Delegate strategy selection to MessageGroupAssignment (single owner)
    const mgAssignment = new MessageGroupAssignment({
      seedNodeAddress: this.seedNodeAddress,
    });
    const assignment = mgAssignment.determineAssignment(
      newNodeId,
      messageGroups,
      {
        excludedReplicaIds: options.excludedReplicaIds,
        excludedSourceNodeIds,
      },
    );

    // Augment with peer addresses for Raft communication
    return this.augmentAssignmentWithPeerAddresses(assignment, messageGroups);
  }

  /**
   * Serialize MOVE_REPLICA assignment reservation so concurrent bootstrap
   * requests cannot reserve the same replica.
   * @param {Function} action
   * @return {Promise<*>}
   * @private
   */
  async withMoveReplicaAssignmentReservationLock(action) {
    const previousLock = this.moveReplicaAssignmentReservationLock;
    let releaseLock;
    this.moveReplicaAssignmentReservationLock = new Promise((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;
    try {
      return await action();
    } finally {
      releaseLock();
    }
  }

  /**
   * Determine assignment and reserve MOVE_REPLICA ownership atomically before
   * responding to bootstrap.
   * @param {string} newNodeId
   * @return {Promise<Object>}
   * @private
   */
  async determineAndReserveMessageGroupAssignment(newNodeId) {
    return this.withMoveReplicaAssignmentReservationLock(async () => {
      await this.expireMoveReplicaAssignmentReservations();
      const activeReservations = await this.getActiveMoveReplicaAssignmentReservations();
      const excludedReplicaIds = new Set(
        activeReservations.map((reservation) => reservation.replicaId),
      );
      const assignment = this.determineMessageGroupAssignment(newNodeId, {
        excludedReplicaIds,
      });

      if (assignment.strategy !== BootstrapStrategy.MOVE_REPLICA) {
        return assignment;
      }

      const reservation = await this.reserveMoveReplicaAssignment(
        newNodeId,
        assignment,
      );
      return {
        ...assignment,
        assignmentId: reservation.assignmentId,
        assignmentLeaseExpiresAt: reservation.leaseExpiresAt,
      };
    });
  }

  /**
   * Convert persisted replica operation row into move-assignment reservation.
   * @param {Object} row
   * @return {Object|null}
   * @private
   */
  normalizeMoveReplicaAssignmentReservationRow(row) {
    if (!row || typeof row !== TYPEOF.OBJECT) {
      return null;
    }
    const assignmentId = row[COLUMN.OPERATION_ID] || row.operation_id || row.operationId;
    const normalizedAssignmentId = assignmentId || row.assignmentId || null;
    const replicaId =
      row[COLUMN.REPLICA_ID] || row.replica_id || row.replicaId || null;
    const targetNodeId =
      row[COLUMN.TARGET_NODE_ID] || row.target_node_id || row.targetNodeId ||
      null;
    const sourceNodeId =
      row.source_node_id || row.sourceNodeId || row.sourceNode || row.sourceNodeId || null;
    const groupId = row[COLUMN.PARTITION_ID] || row.partition_id || row.partitionId || null;
    const status = String(row[COLUMN.STATUS] || row.status || STRING.UNKNOWN)
      .toLowerCase();
    const leaseRaw = row.completed_at ?? row.completedAt ?? row.leaseExpiresAt ?? null;
    const leaseExpiresAt = Number.isFinite(Number(leaseRaw)) ?
      Math.floor(Number(leaseRaw)) :
      null;
    const updatedAtRaw = row[COLUMN.UPDATED_AT] ?? row.updated_at ?? row.updatedAt;
    const updatedAt = Number.isFinite(Number(updatedAtRaw)) ?
      Math.floor(Number(updatedAtRaw)) :
      Date.now();
    const stepsHistoryRaw = row.steps_history ?? row.stepsHistory ?? null;
    let stepsHistory = [];
    if (Array.isArray(stepsHistoryRaw)) {
      stepsHistory = stepsHistoryRaw;
    } else if (typeof stepsHistoryRaw === TYPEOF.STRING &&
        stepsHistoryRaw.length > NUM.ZERO) {
      try {
        const parsedStepsHistory = JSON.parse(stepsHistoryRaw);
        if (Array.isArray(parsedStepsHistory)) {
          stepsHistory = parsedStepsHistory;
        }
      } catch (_error) {
        stepsHistory = [];
      }
    }

    if (!normalizedAssignmentId || !replicaId || !targetNodeId) {
      return null;
    }

    return {
      assignmentId: normalizedAssignmentId,
      replicaId,
      sourceNodeId,
      targetNodeId,
      groupId,
      status,
      leaseExpiresAt,
      updatedAt,
      stepsHistory,
    };
  }

  /**
   * Return active move-assignment reservations from in-memory + persisted state.
   * @return {Promise<Array<Object>>}
   * @private
   */
  async getActiveMoveReplicaAssignmentReservations() {
    const now = Date.now();
    const byAssignmentId = new Map();

    for (const reservation of this.moveReplicaAssignmentReservations.values()) {
      const normalized = this.normalizeMoveReplicaAssignmentReservationRow(reservation);
      if (!normalized) {
        continue;
      }
      if (!this.isMoveReplicaAssignmentReservationActive(normalized, now)) {
        continue;
      }
      byAssignmentId.set(normalized.assignmentId, normalized);
    }

    if (this.sqlQueryEngine) {
      const queryResult = await this.executeBootstrapControlPlaneQuery(
        BOOTSTRAP_API_SQL.SELECT_MOVE_ASSIGNMENT_RESERVATIONS,
        [BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE],
      );
      if (queryResult?.success !== false) {
        const rows = Array.isArray(queryResult?.rows) ? queryResult.rows : [];
        for (const row of rows) {
          const normalized = this.normalizeMoveReplicaAssignmentReservationRow(row);
          if (!normalized) {
            continue;
          }
          if (!this.isMoveReplicaAssignmentReservationActive(normalized, now)) {
            continue;
          }
          byAssignmentId.set(normalized.assignmentId, normalized);
          this.moveReplicaAssignmentReservations.set(normalized.assignmentId, normalized);
        }
      }
    }

    return [...byAssignmentId.values()];
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
    const reservations = [];
    const byAssignmentId = new Map();
    const pushReservation = (reservation) => {
      const normalized =
        this.normalizeMoveReplicaAssignmentReservationRow(reservation);
      if (!normalized) {
        return;
      }
      byAssignmentId.set(normalized.assignmentId, normalized);
    };

    for (const reservation of this.moveReplicaAssignmentReservations.values()) {
      pushReservation(reservation);
    }

    if (this.sqlQueryEngine) {
      const queryResult = await this.executeBootstrapControlPlaneQuery(
        BOOTSTRAP_API_SQL.SELECT_MOVE_ASSIGNMENT_RESERVATIONS,
        [BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE],
      );
      if (queryResult?.success !== false) {
        const rows = Array.isArray(queryResult?.rows) ? queryResult.rows : [];
        for (const row of rows) {
          pushReservation(row);
        }
      }
    }

    for (const reservation of byAssignmentId.values()) {
      if (!this.isMoveReplicaBootstrapAdmissionBlocked(reservation, now)) {
        continue;
      }
      reservations.push(reservation);
    }

    reservations.sort((left, right) => {
      const leftUpdatedAt = Number.isFinite(left?.updatedAt) ?
        left.updatedAt :
        NUM.ZERO;
      const rightUpdatedAt = Number.isFinite(right?.updatedAt) ?
        right.updatedAt :
        NUM.ZERO;
      return leftUpdatedAt - rightUpdatedAt;
    });

    return reservations;
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
    if (this.isMoveReplicaAssignmentReservationOpen(reservation, now)) {
      return true;
    }
    return this.isCommittedMoveReplicaHandoffStabilizing(
      reservation,
      now,
    );
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
    if (!reservation ||
        typeof reservation.assignmentId !== TYPEOF.STRING ||
        reservation.assignmentId.length === NUM.ZERO) {
      return false;
    }
    if (!reservation.replicaId || !reservation.targetNodeId) {
      return false;
    }
    if (BOOTSTRAP_API_ASSIGNMENT.TERMINAL_STATUSES.includes(
      reservation.status,
    )) {
      return false;
    }
    if (!BOOTSTRAP_API_ASSIGNMENT.ACTIVE_RESERVATION_STATUSES.includes(
      reservation.status,
    )) {
      return false;
    }
    const ownership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(
        reservation,
        now,
      );
    if (ownership.observedCommitted) {
      return false;
    }
    if (ownership.continuingTargetAdoption) {
      return true;
    }
    return this.hasViableMoveReplicaAssignmentSource(reservation, now);
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
    if (!reservation) {
      return false;
    }
    const observedOwnership =
      this.evaluateMoveReplicaAssignmentReservationOwnership(
        reservation,
        now,
      );
    const logicallyCommitted =
      reservation.status === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED ||
      observedOwnership.observedCommitted;
    if (!logicallyCommitted) {
      return false;
    }

    const stabilizationExpiresAt = Number.isFinite(reservation.updatedAt) ?
      reservation.updatedAt + this.moveReplicaAssignmentLeaseMs :
      null;
    if (!Number.isFinite(stabilizationExpiresAt) ||
        stabilizationExpiresAt <= now) {
      return false;
    }

    return !this.isMoveReplicaAssignmentTargetReady(reservation, now);
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
    if (!reservation?.targetNodeId || !reservation?.replicaId) {
      return false;
    }

    const targetNodeRow =
      this.systemTableCache?.get(TABLES.NODES, reservation.targetNodeId) || null;
    if (!targetNodeRow || !isNodeRecordReady(targetNodeRow, {now})) {
      return false;
    }

    const existingServiceRow =
      this.systemTableCache?.get(TABLES.SERVICES, reservation.replicaId) || null;
    const existingNodeId = existingServiceRow?.[COLUMN.NODE_ID] || null;
    const existingStatus = String(
      existingServiceRow?.[COLUMN.STATUS] || STRING.UNKNOWN,
    ).toLowerCase();

    return existingNodeId === reservation.targetNodeId &&
      existingStatus === SERVICE_STATUS.ACTIVE;
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
    const admissionFloor = Number.isFinite(this.bootstrapAdmissionRetryAfterMs) &&
      this.bootstrapAdmissionRetryAfterMs > NUM.ZERO ?
      this.bootstrapAdmissionRetryAfterMs :
      BOOTSTRAP_API_DEFAULT.BOOTSTRAP_ADMISSION_RETRY_AFTER_MS;
    const sweepInterval = Number.isFinite(this.moveReplicaAssignmentSweepIntervalMs) &&
      this.moveReplicaAssignmentSweepIntervalMs > NUM.ZERO ?
      this.moveReplicaAssignmentSweepIntervalMs :
      admissionFloor;

    if (!reservation) {
      return admissionFloor;
    }

    const blockingUntilMs =
      reservation.status === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED &&
        Number.isFinite(reservation.updatedAt) ?
        reservation.updatedAt + this.moveReplicaAssignmentLeaseMs :
        reservation.leaseExpiresAt;
    if (!Number.isFinite(blockingUntilMs)) {
      return Math.max(admissionFloor, sweepInterval);
    }

    const remainingMs = Math.max(NUM.ZERO, blockingUntilMs - now);
    if (remainingMs === NUM.ZERO) {
      return admissionFloor;
    }

    return Math.max(
      admissionFloor,
      Math.min(sweepInterval, remainingMs),
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
    return this.getMoveReplicaAssignmentReservationInvalidationReason(
      reservation,
      now,
    ) === null;
  }

  /**
   * Expire stale reservations so replicas become assignable again.
   * @return {Promise<void>}
   * @private
   */
  async expireMoveReplicaAssignmentReservations() {
    const now = Date.now();
    const reservations = [];
    const seenAssignmentIds = new Set();

    const pushReservation = (reservation) => {
      const normalized = this.normalizeMoveReplicaAssignmentReservationRow(reservation);
      if (!normalized) {
        return;
      }
      if (seenAssignmentIds.has(normalized.assignmentId)) {
        return;
      }
      seenAssignmentIds.add(normalized.assignmentId);
      reservations.push(normalized);
    };

    for (const reservation of this.moveReplicaAssignmentReservations.values()) {
      pushReservation(reservation);
    }

    if (this.sqlQueryEngine) {
      const queryResult = await this.executeBootstrapControlPlaneQuery(
        BOOTSTRAP_API_SQL.SELECT_MOVE_ASSIGNMENT_RESERVATIONS,
        [BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE],
      );
      if (queryResult?.success !== false) {
        const rows = Array.isArray(queryResult?.rows) ? queryResult.rows : [];
        for (const row of rows) {
          pushReservation(row);
        }
      }
    }

    for (const reservation of reservations) {
      if (this.shouldReconcileMoveReplicaAssignmentReservationToCommitted(
        reservation,
        now,
      )) {
        await this.reconcileMoveReplicaAssignmentReservationToCommitted(
          reservation,
          now,
        );
        continue;
      }
      const invalidationReason =
        this.getMoveReplicaAssignmentReservationInvalidationReason(
          reservation,
          now,
        );
      if (invalidationReason === null) {
        continue;
      }
      if (invalidationReason === 'terminal' ||
          invalidationReason === 'inactive_status' ||
          invalidationReason === 'invalid_reservation') {
        this.moveReplicaAssignmentReservations.delete(reservation.assignmentId);
        continue;
      }
      if (invalidationReason === 'lease_expired') {
        // Keep expired reservations non-terminal here so a delayed but still
        // canonical target may revive the handoff during register-service.
        this.moveReplicaAssignmentReservations.set(
          reservation.assignmentId,
          reservation,
        );
        continue;
      }
      this.moveReplicaAssignmentReservations.set(
        reservation.assignmentId,
        reservation,
      );
      await this.markMoveReplicaAssignmentReservationTerminal(
        reservation.assignmentId,
        BOOTSTRAP_API_HANDOFF_STATUS.FAILED,
        WORKFLOW_STEP.FAILED,
        invalidationReason === 'source_owner_unavailable' ?
          'assignment source owner unavailable' :
          'assignment reservation invalid',
      );
      this.logger.info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_EXPIRED, {
        assignmentId: reservation.assignmentId,
        replicaId: reservation.replicaId,
        targetNodeId: reservation.targetNodeId,
        invalidationReason,
      });
    }
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
    const replicaId = assignment?.replicaToMove;
    if (!replicaId) {
      throw new Error('MOVE_REPLICA reservation requires replicaToMove');
    }

    const activeReservations = await this.getActiveMoveReplicaAssignmentReservations();
    const conflictingReservation = activeReservations.find((reservation) =>
      reservation.replicaId === replicaId,
    );
    if (conflictingReservation) {
      this.logger.warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_CONFLICT, {
        requestedNodeId: targetNodeId,
        replicaId,
        conflictingAssignmentId: conflictingReservation.assignmentId,
        conflictingTargetNodeId: conflictingReservation.targetNodeId,
      });
      throw new Error('MOVE_REPLICA reservation conflict');
    }

    const now = Date.now();
    const assignmentId = uuidv4();
    const leaseExpiresAt = now + this.moveReplicaAssignmentLeaseMs;
    const reservation = {
      assignmentId,
      replicaId,
      sourceNodeId: assignment.sourceNodeId || null,
      targetNodeId,
      groupId: assignment.groupId || null,
      status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      leaseExpiresAt,
      updatedAt: now,
    };

    if (this.sqlQueryEngine) {
      const stepsHistory = [{
        phase: 'reserved',
        step: WORKFLOW_STEP.PENDING,
        status: reservation.status,
        timestamp: now,
        leaseExpiresAt,
      }];
      const params = [
        assignmentId,
        BOOTSTRAP_API_ASSIGNMENT.OPERATION_TYPE,
        assignment.groupId || null,
        replicaId,
        assignment.sourceNodeId || null,
        targetNodeId,
        reservation.status,
        WORKFLOW_STEP.PENDING,
        now,
        now,
        leaseExpiresAt,
        null,
        JSON.stringify(stepsHistory),
        SERVICE_TYPE.MESSAGE_GROUP,
        assignment.groupId || null,
      ];
      const persistResult = await this.executeBootstrapControlPlaneQuery(
        BOOTSTRAP_API_SQL.INSERT_REPLICA_OPERATION,
        params,
      );
      if (persistResult?.success === false) {
        throw this.buildBootstrapControlPlaneQueryError(
          persistResult,
          'Failed to persist MOVE_REPLICA assignment reservation',
        );
      }
    }

    this.moveReplicaAssignmentReservations.set(assignmentId, reservation);
    this.logger.info(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RESERVED, {
      assignmentId,
      replicaId,
      targetNodeId,
      sourceNodeId: reservation.sourceNodeId,
      leaseExpiresAt,
    });
    return reservation;
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
    const existing = this.moveReplicaAssignmentReservations.get(assignmentId);
    const now = Date.now();
    const nextReservation = {
      ...(existing || {}),
      assignmentId,
      status,
      updatedAt: now,
      leaseExpiresAt: now,
    };
    this.moveReplicaAssignmentReservations.set(assignmentId, nextReservation);

    if (this.sqlQueryEngine) {
      const updateResult = await this.executeBootstrapControlPlaneQuery(
        BOOTSTRAP_API_SQL.UPDATE_REPLICA_OPERATION,
        [
          status,
          workflowStep,
          now,
          now,
          errorMessage,
          JSON.stringify(existing?.stepsHistory || []),
          assignmentId,
        ],
      );
      if (updateResult?.success === false) {
        this.logger.warn(BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED, {
          assignmentId,
          status,
          error: updateResult.error || 'failed to persist reservation terminal status',
        });
      }
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
  async reconcileMoveReplicaAssignmentReservationToCommitted(
    reservation,
    now = Date.now(),
  ) {
    if (!reservation?.assignmentId) {
      return;
    }

    const existingStepsHistory = Array.isArray(reservation.stepsHistory) ?
      reservation.stepsHistory :
      [];
    const lastStep = existingStepsHistory[existingStepsHistory.length - 1] || null;
    const stepsHistory = lastStep?.phase === 'observed_committed' &&
      lastStep?.step === WORKFLOW_STEP.ACTIVE &&
      lastStep?.status === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED ?
      existingStepsHistory :
      [
        ...existingStepsHistory,
        {
          phase: 'observed_committed',
          step: WORKFLOW_STEP.ACTIVE,
          status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
          timestamp: now,
        },
      ];

    const nextReservation = {
      ...reservation,
      status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
      leaseExpiresAt: now,
      updatedAt: now,
      stepsHistory,
    };
    this.moveReplicaAssignmentReservations.set(
      reservation.assignmentId,
      nextReservation,
    );

    if (this.sqlQueryEngine) {
      const updateResult = await this.executeBootstrapControlPlaneQuery(
        BOOTSTRAP_API_SQL.UPDATE_REPLICA_OPERATION,
        [
          BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
          WORKFLOW_STEP.ACTIVE,
          now,
          now,
          null,
          JSON.stringify(stepsHistory),
          reservation.assignmentId,
        ],
      );
      if (updateResult?.success === false) {
        this.logger.warn(
          BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_VALIDATION_FAILED,
          {
            assignmentId: reservation.assignmentId,
            status: BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
            error:
              updateResult.error ||
              'failed to reconcile MOVE_REPLICA assignment to committed state',
          },
        );
        return;
      }
    }

    this.logger.info(
      BOOTSTRAP_API_LOG_MSG.MOVE_REPLICA_ASSIGNMENT_RECONCILED,
      {
        assignmentId: reservation.assignmentId,
        replicaId: reservation.replicaId,
        targetNodeId: reservation.targetNodeId,
        sourceNodeId: reservation.sourceNodeId || null,
      },
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
    if (assignment.strategy === BootstrapStrategy.MOVE_REPLICA) {
      // Find the group to extract peer addresses
      const group = messageGroups.find(
        (g) => g.group_id === assignment.groupId,
      );
      const replicas = group?.replicas || [];
      const peerAddresses = replicas.map((r) =>
        `${r.node_id}${ADDRESS.SEPARATOR}${ENTITY_TYPE.MESSAGE_GROUP}` +
        `${ADDRESS.SEPARATOR}${r.replica_id}`,
      );

      this.logger.info(BOOTSTRAP_API_LOG_MSG.JOIN_MOVABLE_REPLICA, {
        groupId: assignment.groupId,
        sourceNodeId: assignment.sourceNodeId,
        replicaToMove: assignment.replicaToMove,
        peerIds: assignment.existingPeerIds,
        peerAddresses,
        replicaAddresses: assignment.replicaAddresses,
      });

      return {
        ...assignment,
        peerAddresses,
      };
    }

    // CREATE_SELF_HOSTED: include peer addresses from an existing group
    // so the joining node can reach the control plane.
    const fallbackGroup = messageGroups.find((group) =>
      Array.isArray(group.replicas) && group.replicas.length > NUM.ZERO,
    ) || messageGroups[NUM.ZERO];

    if (fallbackGroup && Array.isArray(fallbackGroup.replicas)) {
      const replicas = fallbackGroup.replicas;
      return {
        ...assignment,
        existingPeerIds: replicas.map((r) => r.replica_id),
        replicaAddresses: replicas.map((r) => r.address),
        peerAddresses: replicas.map((r) =>
          `${r.node_id}${ADDRESS.SEPARATOR}${ENTITY_TYPE.MESSAGE_GROUP}` +
          `${ADDRESS.SEPARATOR}${r.replica_id}`,
        ),
        replicaNodeMap: Object.fromEntries(
          replicas.map((r) => [r.replica_id, r.node_id]),
        ),
      };
    }

    return assignment;
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
    // Bootstrap assignment and bootstrap snapshot publication must observe the
    // same canonical row source. Prefer local authoritative partition rows
    // over cache state so a lagging seed cache cannot reserve a replica that
    // bootstrap snapshots already expose as moved.
    const services = this.getBootstrapAuthoritativeTableRows(TABLES.SERVICES);
    const messageGroupServices = services.filter((service) =>
      service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP,
    );

    // Group services by group_id to build message groups
    const groupsFromServices = new Map();
    for (const service of messageGroupServices) {
      const groupId = service[COLUMN.GROUP_ID];
      if (!groupId) {
        continue;
      }

      if (!groupsFromServices.has(groupId)) {
        groupsFromServices.set(groupId, {
          group_id: groupId,
          replicas: [],
          replica_count: NUM.ZERO,
        });
      }

      const group = groupsFromServices.get(groupId);
      group.replicas.push({
        replica_id: service[COLUMN.REPLICA_ID] || service[COLUMN.SERVICE_ID],
        node_id: service[COLUMN.NODE_ID],
        address: service[COLUMN.ADDRESS],
        raft_role: service[COLUMN.RAFT_ROLE],
      });
      group.replica_count = group.replicas.length;
    }

    // If we found groups from services, return them
    if (groupsFromServices.size > NUM.ZERO) {
      return Array.from(groupsFromServices.values());
    }

    // Fall back to message_groups table (may be empty for MOVE_REPLICA tests)
    const cachedGroups =
      this.getBootstrapAuthoritativeTableRows(TABLES.MESSAGE_GROUPS);

    return cachedGroups.map((group) => {
      const replicas = messageGroupServices
        .filter((service) =>
          service[COLUMN.GROUP_ID] === group[COLUMN.GROUP_ID],
        )
        .map((service) => ({
          replica_id: service[COLUMN.REPLICA_ID] || service[COLUMN.SERVICE_ID],
          node_id: service[COLUMN.NODE_ID],
          address: service[COLUMN.ADDRESS],
          raft_role: service[COLUMN.RAFT_ROLE],
        }));

      return {
        ...group,
        replicas,
      };
    });
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
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const cacheRows = systemTableCache.getAll(tableName) || [];
    const rows = this.resolveAuthoritativeSystemTableSnapshotRows(
      tableName,
      cacheRows,
    );
    return Array.isArray(rows) ? rows : [];
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
    return this.buildBootstrapTopologySnapshotEnvelope()
      .systemTableSnapshots;
  }

  /**
   * Build the bootstrap topology snapshot envelope published to joiners.
   * @param {Object} [options]
   * @param {Object|null} [options.currentEpoch]
   * @return {{systemTableSnapshots: Object, topologySnapshotMeta: Object}}
   */
  buildBootstrapTopologySnapshotEnvelope(options = {}) {
    const currentEpoch =
      options.currentEpoch === undefined ?
        this.getCurrentEpoch() :
        options.currentEpoch;
    const envelope = buildBootstrapTopologySnapshotEnvelope({
      systemTableCache: assertCritical(
        this.systemTableCache,
        BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
      ),
      currentEpoch,
      resolveSnapshotRows: (tableName, cacheRows) =>
        this.resolveAuthoritativeSystemTableSnapshotRows(
          tableName,
          cacheRows,
        ),
    });

    const snapshots = envelope.systemTableSnapshots;

    // Verify that we have partition leaders in the services table
    // Joining nodes need this information to write to system tables
    const serviceSnapshot = snapshots[TABLES.SERVICES] || [];
    const leaders = serviceSnapshot.filter((service) =>
      service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
      service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
      service[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
    );

    if (leaders.length === NUM.ZERO) {
      this.logger.warn('No partition leaders found in system cache', {
        seedNodeId: this.seedNodeId,
        totalServices: serviceSnapshot.length,
      });
    }

    return envelope;
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
    const localRowSets = this.queryLocalAuthoritativePartitionRowSets(tableName);
    if (localRowSets.length === NUM.ZERO) {
      return cacheRows;
    }

    const mergedRows = this.mergeAuthoritativeSystemTableRowSets(
      tableName,
      localRowSets,
    );
    if (mergedRows.length !== cacheRows.length) {
      this.logger.warn(
        'Bootstrap snapshot diverged from local authoritative partition state',
        {
          seedNodeId: this.seedNodeId,
          tableName,
          cacheRowCount: cacheRows.length,
          authoritativeRowCount: mergedRows.length,
          replicaCount: localRowSets.length,
        },
      );
    }

    return mergedRows;
  }

  /**
   * Read one system table directly from local partition replicas.
   * @param {string} tableName
   * @return {Object[][]}
   * @private
   */
  queryLocalAuthoritativePartitionRowSets(tableName) {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    if (!this.partitionServices || this.partitionServices.size === NUM.ZERO) {
      return [];
    }

    const partitionRows =
      typeof systemTableCache.filter === TYPEOF.FUNCTION ?
        systemTableCache.filter(TABLES.PARTITIONS, (row) => {
          const rowTableName = row?.[COLUMN.TABLE_NAME] || row?.table_name || row?.tableName;
          const rowTableId = row?.[COLUMN.TABLE_ID] || row?.table_id || row?.tableId;
          return rowTableName === tableName || rowTableId === tableName;
        }) :
        [];
    const partitionIds = [...new Set(partitionRows
      .map((row) => row?.[COLUMN.PARTITION_ID] || row?.partition_id || row?.partitionId)
      .filter((value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO),
    )];
    if (partitionIds.length === NUM.ZERO) {
      return [];
    }

    const rowSets = [];
    const sql = `SELECT * FROM ${tableName}`;
    for (const partitionId of partitionIds) {
      for (const service of this.partitionServices.values()) {
        if (service?.partitionId !== partitionId ||
            service?.initialized !== true ||
            typeof service?.db?.prepare !== TYPEOF.FUNCTION) {
          continue;
        }
        try {
          const rows = service.db.prepare(sql).all();
          rowSets.push(Array.isArray(rows) ? rows : []);
        } catch (error) {
          this.logger.warn(
            'Failed to read authoritative snapshot rows from local partition',
            {
              seedNodeId: this.seedNodeId,
              tableName,
              partitionId,
              replicaId: service?.replicaId || service?.service_id || null,
              error: error.message,
            },
          );
        }
      }
    }

    return rowSets;
  }

  /**
   * Merge direct replica row sets by canonical primary key.
   * @param {string} tableName
   * @param {Object[][]} rowSets
   * @return {Object[]}
   * @private
   */
  mergeAuthoritativeSystemTableRowSets(tableName, rowSets) {
    const keyField = getSystemCachePrimaryKeyFieldOrFallback(tableName, 'id');
    const mergedRows = new Map();

    for (const rowSet of rowSets) {
      const rows = Array.isArray(rowSet) ? rowSet : [];
      for (const row of rows) {
        const key = row?.[keyField] ?? row?.id;
        if (typeof key === TYPEOF.UNDEFINED || key === null) {
          continue;
        }
        const existing = mergedRows.get(key);
        if (!existing || this.isAuthoritativeSnapshotRowNewer(row, existing)) {
          mergedRows.set(key, row);
        }
      }
    }

    return [...mergedRows.values()];
  }

  /**
   * Prefer the freshest row when merging authoritative replica snapshots.
   * @param {Object} candidate
   * @param {Object} existing
   * @return {boolean}
   * @private
   */
  isAuthoritativeSnapshotRowNewer(candidate, existing) {
    const candidateUpdatedAt =
      Number(candidate?.[COLUMN.UPDATED_AT] ?? candidate?.updated_at ?? candidate?.updatedAt);
    const existingUpdatedAt =
      Number(existing?.[COLUMN.UPDATED_AT] ?? existing?.updated_at ?? existing?.updatedAt);
    if (Number.isFinite(candidateUpdatedAt) && Number.isFinite(existingUpdatedAt)) {
      return candidateUpdatedAt > existingUpdatedAt;
    }
    if (Number.isFinite(candidateUpdatedAt) && !Number.isFinite(existingUpdatedAt)) {
      return true;
    }

    const candidateCreatedAt =
      Number(candidate?.[COLUMN.CREATED_AT] ?? candidate?.created_at ?? candidate?.createdAt);
    const existingCreatedAt =
      Number(existing?.[COLUMN.CREATED_AT] ?? existing?.created_at ?? existing?.createdAt);
    if (Number.isFinite(candidateCreatedAt) && Number.isFinite(existingCreatedAt)) {
      return candidateCreatedAt > existingCreatedAt;
    }
    if (Number.isFinite(candidateCreatedAt) && !Number.isFinite(existingCreatedAt)) {
      return true;
    }

    return JSON.stringify(candidate).length > JSON.stringify(existing).length;
  }

  /**
   * Build latency topology hints for joining node bootstrap.
   * @param {string} nodeId - Joining node ID.
   * @return {Object}
   * @private
   */
  getLatencyTopologyHints(nodeId) {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const config = ConfigurationManager.getInstance();
    const propagationMode = config.get(CONFIG_KEY.LATENCY_PROPAGATION_MODE) || null;
    const joiningNode = systemTableCache.get(TABLES.NODES, nodeId) || null;
    const groups = systemTableCache.getAll(TABLES.LATENCY_GROUPS) || [];
    const interGroupLatencies =
      systemTableCache.getAll(TABLES.INTER_GROUP_LATENCIES) || [];

    return {
      suggestedGroupId: joiningNode?.[COLUMN.LATENCY_GROUP_ID] || null,
      groupCount: groups.length,
      interGroupEdgeCount: interGroupLatencies.length,
      propagationMode,
      timestamp: Date.now(),
    };
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
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const readyNodes = systemTableCache.getReadyNodes();

    // Always include seed node - it's responding to this request so it's available
    // The seed node's heartbeat may have failed to update its lease, but it's clearly
    // operational if it's processing this bootstrap request
    if (this.seedNodeId && !readyNodes.includes(this.seedNodeId)) {
      readyNodes.push(this.seedNodeId);
    }

    return readyNodes;
  }

  /**
   * Get table policies from the system tables.
   * Uses ONLY the system cache - no fallbacks.
   * @return {Object} Table policies keyed by table name.
   */
  getTablePolicies() {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const tables = systemTableCache.getAll(TABLES.TABLES) || [];
    const policies = {};

    for (const table of tables) {
      const tableName = table.table_id || table.table_name;
      if (!tableName) {
        continue;
      }

      let policy = table.table_policies;
      if (typeof policy === TYPEOF.STRING && policy.length > NUM.ZERO) {
        try {
          policy = JSON.parse(policy);
        } catch (error) {
          throw new Error(
            `Invalid table policy for ${tableName}: ${error.message}`,
          );
        }
      }

      policies[tableName] = policy || {};
    }

    return policies;
  }

  /**
   * Get the current assignment epoch from the seed node.
   * @return {Object|null} Current epoch data or null if unavailable.
   */
  getCurrentEpoch() {
    const epochManager = this.epochManager ||
      this.bootstrapService?.getEpochManager?.();
    if (!epochManager) {
      return null;
    }

    const epoch = epochManager.getCurrentEpoch();
    return typeof epoch?.toObject === TYPEOF.FUNCTION ? epoch.toObject() : epoch;
  }

  /**
   * Get cluster configuration for new node.
   * @return {Object} Cluster configuration.
   */
  getClusterConfiguration() {
    const config = ConfigurationManager.getInstance();

    return {
      raft: config.getCategory(CONFIG_CATEGORY.RAFT),
      messageGroup: config.getCategory(CONFIG_CATEGORY.MESSAGE_GROUP),
      partition: config.getCategory(CONFIG_CATEGORY.PARTITION),
      logging: config.getCategory(CONFIG_CATEGORY.LOGGING),
    };
  }

  /**
   * Get current cluster state.
   * @return {Object} Cluster state.
   */
  getClusterState() {
    const nodes = [];
    const messageGroups = [];

    // Add seed node
    nodes.push({
      nodeId: this.seedNodeId,
      nodeAddress: this.seedNodeAddress,
      status: SERVICE_STATUS.ACTIVE,
      isSeed: true,
    });

    // Add nodes from system table cache (source of truth)
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const allNodes = systemTableCache.getAll(TABLES.NODES) || [];
    for (const node of allNodes) {
      // Skip seed node (already added)
      if (node.node_id === this.seedNodeId) {
        continue;
      }
      nodes.push({
        nodeId: node.node_id,
        nodeAddress: node.node_address,
        status: node.status || BOOTSTRAP_API_CLUSTER_STATE.UNKNOWN,
        isSeed: false,
      });
    }

    // Get message groups
    const groups = this.getMessageGroups();
    for (const group of groups) {
      messageGroups.push({
        groupId: group.group_id,
        replicaCount: group.replicas?.length || NUM.ZERO,
        replicas: group.replicas || [],
      });
    }

    return {
      seedNodeId: this.seedNodeId,
      nodeCount: nodes.length,
      nodes,
      messageGroupCount: messageGroups.length,
      messageGroups,
      timestamp: Date.now(),
    };
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
