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
  getMissingSystemServiceLeaders,
  getMissingSystemServiceLeaderCount,
} from '../cache/leader-readiness-gate.js';
import {
  BOOTSTRAP_ASSIGNMENT_STRATEGY,
  BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT,
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
  BOOTSTRAP_API_LIVENESS,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_PROBE_SCOPE,
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

/**
 * Bootstrap response strategies.
 */
const BootstrapStrategy = BOOTSTRAP_ASSIGNMENT_STRATEGY;
const BOOTSTRAP_REQUIRED_LEADER_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.TABLES,
  TABLES.PARTITIONS,
  TABLES.SERVICES,
  TABLES.MESSAGE_GROUPS,
  TABLES.REPLICA_OPERATIONS,
  TABLES.NODE_ENDPOINTS,
  TABLES.CONFIG,
]);

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
    this.epochManager = options.epochManager || null;
    this.messageRouter = options.messageRouter || null;
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
    this.logger.debug(BOOTSTRAP_API_LOG_MSG.SQL_ENGINE_SET);
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
    if (snapshot.phase !== LIFECYCLE_PHASE.CONTROL_READY) {
      return false;
    }
    if (reasons.length === NUM.ZERO) {
      return false;
    }
    return blockingReasons.length === NUM.ZERO;
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
    if (!this.systemTableCache) {
      return {ready: false};
    }

    const missing = this.normalizeLeaderStatusForBootstrap(
      this.getMissingServiceLeaders(),
    );
    const missingCount = this.countMissingLeaderInfo(missing);
    return {
      ready: missingCount === NUM.ZERO,
      ...missing,
    };
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
      retryAfterMs: Number.isFinite(snapshot.retryAfterMs) ?
        snapshot.retryAfterMs :
        NUM.ZERO,
    };

    if (typeof options.phase === TYPEOF.STRING && options.phase.length > NUM.ZERO) {
      response.phase = options.phase;
    }

    if (typeof snapshot.state === TYPEOF.STRING && snapshot.state.length > NUM.ZERO) {
      response.state = snapshot.state;
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
    const conflictError = this.checkForConflicts(nodeId, nodeAddress);
    if (conflictError) {
      this.logger.warn(BOOTSTRAP_API_LOG_MSG.CONFLICT_DETECTED, {
        nodeId,
        nodeAddress,
        error: conflictError,
      });
      reply.code(HTTP_STATUS.CONFLICT);
      return {error: conflictError};
    }

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
        return {
          ...this.buildBootstrapNotReadyResponse({
            error: BOOTSTRAP_API_ERROR.RAFT_LEADERS_NOT_READY,
            code: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
            reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          }),
          missingPartitionLeaders: leaderStatus.missingPartitionLeaders,
          missingMessageGroupLeaders: leaderStatus.missingMessageGroupLeaders,
          missingPartitionLeaderNodes: leaderStatus.missingPartitionLeaderNodes,
          missingMessageGroupLeaderNodes: leaderStatus.missingMessageGroupLeaderNodes,
        };
      }

      // Determine message group assignment strategy
      const assignment = this.determineMessageGroupAssignment(nodeId);

      // Build complete system table snapshots for the new node
      const systemTableSnapshots = this.buildSystemTableSnapshots();

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

      // Get current assignment epoch if available
      const currentEpoch = this.getCurrentEpoch();
      const latencyTopologyHints = this.getLatencyTopologyHints(nodeId);

      // Node registration happens after WebSocket IDENTIFY + NODE_STATE_UPDATE.
      // System table cache is the source of truth.

      // Build seed node WebSocket address for cross-node communication
      let seedNodeWsAddress = this.seedNodeWsAddress || null;
      if (!seedNodeWsAddress && this.seedNodeAddress &&
          /^wss?:\/\//.test(this.seedNodeAddress)) {
        seedNodeWsAddress = this.seedNodeAddress;
      }
      if (!seedNodeWsAddress && this.wsPort) {
        // Extract host from seedNodeAddress (e.g., 'localhost:8080' -> 'localhost')
        const host = this.seedNodeAddress ?
          this.seedNodeAddress
            .replace(/^https?:\/\//, STRING.EMPTY)
            .replace(/^wss?:\/\//, STRING.EMPTY)
            .split(ADDRESS.PORT_SEPARATOR)[NUM.ZERO] :
          BOOTSTRAP_API_DEFAULT.WS_HOST;
        seedNodeWsAddress = `${PROTOCOL.WS}${host}` +
          `${ADDRESS.PORT_SEPARATOR}${this.wsPort}`;
      }

      const response = {
        success: true,
        seedNodeId: this.seedNodeId,
        seedNodeAddress: this.seedNodeAddress,
        seedNodeWsAddress,
        messageGroupAssignment: assignment,
        systemTableSnapshots,
        readyNodes,
        tablePolicies,
        currentEpoch,
        latencyTopologyHints,
        clusterConfig,
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
    const serviceData = request.body || {};

    this.logger.info(BOOTSTRAP_API_LOG_MSG.RECEIVED_REGISTER_SERVICE, {
      serviceId: serviceData[COLUMN.SERVICE_ID],
      serviceType: serviceData[COLUMN.SERVICE_TYPE],
      nodeId: serviceData[COLUMN.NODE_ID],
      groupId: serviceData[COLUMN.GROUP_ID],
    });

    // Validate required fields
    if (!serviceData[COLUMN.SERVICE_ID]) {
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {success: false, error: BOOTSTRAP_API_ERROR.SERVICE_ID_REQUIRED};
    }

    if (!serviceData[COLUMN.SERVICE_TYPE]) {
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {success: false, error: BOOTSTRAP_API_ERROR.SERVICE_TYPE_REQUIRED};
    }

    if (!serviceData[COLUMN.NODE_ID]) {
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {success: false, error: BOOTSTRAP_API_ERROR.SERVICE_NODE_ID_REQUIRED};
    }

    let handoffContext = null;
    try {
      // Use SQL query engine to insert/update the service
      if (!this.sqlQueryEngine) {
        this.logger.error(BOOTSTRAP_API_LOG_MSG.SQL_ENGINE_MISSING);
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return {success: false, error: BOOTSTRAP_API_ERROR.SQL_ENGINE_UNAVAILABLE};
      }

      handoffContext = await this.startMoveReplicaHandoff(serviceData);

      if (handoffContext) {
        await this.executeMoveReplicaHandoffPhase(
          handoffContext,
          BOOTSTRAP_API_HANDOFF_PHASE.VERIFY_TARGET,
          WORKFLOW_STEP.SYNCING,
          BOOTSTRAP_API_HANDOFF_STATUS.VERIFYING,
          () => this.verifyMoveReplicaHandoffTarget(handoffContext, serviceData),
        );

        await this.executeMoveReplicaHandoffPhase(
          handoffContext,
          BOOTSTRAP_API_HANDOFF_PHASE.REMOVE_SOURCE,
          WORKFLOW_STEP.STOPPING,
          BOOTSTRAP_API_HANDOFF_STATUS.REMOVING,
          () => this.removeLocalSourceReplicaForMoveReplica(serviceData),
        );
      }

      // Use INSERT OR REPLACE to handle both new and existing services
      const sql = BOOTSTRAP_API_SQL.UPSERT_SERVICE;

      const params = [
        serviceData[COLUMN.SERVICE_ID],
        serviceData[COLUMN.SERVICE_TYPE],
        serviceData[COLUMN.NODE_ID],
        serviceData[COLUMN.PARTITION_ID] || null,
        serviceData[COLUMN.GROUP_ID] || null,
        serviceData[COLUMN.REPLICA_ID] || serviceData[COLUMN.SERVICE_ID],
        serviceData[COLUMN.RAFT_ROLE] || RAFT_ROLE.FOLLOWER,
        serviceData[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE,
        serviceData[COLUMN.ADDRESS] || null,
        serviceData[COLUMN.CREATED_AT] || Date.now(),
        serviceData[COLUMN.UPDATED_AT] || Date.now(),
      ];

      const result = await this.sqlQueryEngine.executeQuery(sql, params);

      if (!result.success) {
        throw new Error(result.error || BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_FAILED);
      }

      if (handoffContext) {
        await this.completeMoveReplicaHandoff(handoffContext);
      }

      this.logger.info(BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTERED, {
        serviceId: serviceData[COLUMN.SERVICE_ID],
        serviceType: serviceData[COLUMN.SERVICE_TYPE],
        nodeId: serviceData[COLUMN.NODE_ID],
        groupId: serviceData[COLUMN.GROUP_ID],
        operationId: handoffContext?.operationId || null,
      });

      return {
        success: true,
        serviceId: serviceData[COLUMN.SERVICE_ID],
        operationId: handoffContext?.operationId || null,
      };
    } catch (error) {
      if (handoffContext) {
        await this.failMoveReplicaHandoff(handoffContext, error);
      }
      this.logger.error(BOOTSTRAP_API_LOG_MSG.REGISTER_SERVICE_FAILED, {
        serviceId: serviceData[COLUMN.SERVICE_ID],
        error: error.message,
        stack: error.stack,
      });
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      throw error;
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

    if (!serviceId || !targetNodeId) {
      return false;
    }
    if (serviceType !== SERVICE_TYPE.MESSAGE_GROUP) {
      return false;
    }
    if (targetNodeId === this.seedNodeId) {
      return false;
    }
    return this.messageGroupServices.has(serviceId);
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
  }

  /**
   * Persist a new MOVE_REPLICA handoff operation row.
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

    const result = await this.sqlQueryEngine.executeQuery(
      BOOTSTRAP_API_SQL.INSERT_REPLICA_OPERATION,
      params,
    );
    if (!result.success) {
      throw new Error(result.error || 'Failed to persist MOVE_REPLICA handoff operation');
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

    const result = await this.sqlQueryEngine.executeQuery(
      BOOTSTRAP_API_SQL.UPDATE_REPLICA_OPERATION,
      params,
    );
    if (!result.success) {
      throw new Error(result.error || 'Failed to update MOVE_REPLICA handoff operation');
    }
  }

  /**
   * Start MOVE_REPLICA handoff tracking when applicable.
   * @param {Object} serviceData - Incoming register-service payload.
   * @return {Promise<Object|null>} Handoff context or null.
   * @private
   */
  async startMoveReplicaHandoff(serviceData) {
    if (!this.isMoveReplicaHandoffRequest(serviceData)) {
      return null;
    }

    const handoffContext = this.buildMoveReplicaHandoffContext(serviceData);
    this.recordMoveReplicaHandoffPhase(
      handoffContext,
      BOOTSTRAP_API_HANDOFF_PHASE.PREPARE_TARGET,
      WORKFLOW_STEP.CREATING,
      BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
    );
    await this.insertMoveReplicaHandoffOperation(handoffContext);

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
    await this.updateMoveReplicaHandoffOperation(handoffContext);
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
    await this.updateMoveReplicaHandoffOperation(handoffContext);

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
   * @return {string|null} Error message or null if no conflict.
   */
  checkForConflicts(nodeId, nodeAddress) {
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
      if (!this._isNodeDead(existingNode)) {
        return BOOTSTRAP_API_ERROR.NODE_ID_ALREADY_REGISTERED(nodeId);
      }
      this.logger.info(BOOTSTRAP_API_LOG_MSG.STALE_NODE_REJOIN_ALLOWED, {
        nodeId,
        existingStatus: existingNode[COLUMN.STATUS],
        existingLease: existingNode[COLUMN.READY_LEASE_EXPIRES_AT],
      });
    }

    // Check for address conflicts (skip dead nodes)
    const allNodes = systemTableCache.getAll(TABLES.NODES) || [];
    for (const node of allNodes) {
      if (node[COLUMN.NODE_ADDRESS] === nodeAddress &&
          node[COLUMN.NODE_ID] !== nodeId &&
          !this._isNodeDead(node)) {
        return BOOTSTRAP_API_ERROR.NODE_ADDRESS_IN_USE(nodeAddress);
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
   * Determine message group assignment for a new node.
   * Delegates strategy selection to MessageGroupAssignment (single owner)
   * and augments the result with peer addresses for Raft communication.
   * @param {string} newNodeId - New node ID.
   * @return {Object} Assignment instructions.
   */
  determineMessageGroupAssignment(newNodeId) {
    // Get existing message groups from cache or services
    const messageGroups = this.getMessageGroups();

    this.logger.info(BOOTSTRAP_API_LOG_MSG.JOIN_ASSIGNMENT, {
      newNodeId,
      messageGroupCount: messageGroups.length,
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
    const assignment = mgAssignment.determineAssignment(newNodeId, messageGroups);

    // Augment with peer addresses for Raft communication
    return this.augmentAssignmentWithPeerAddresses(assignment, messageGroups);
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
    if (typeof this.bootstrapService?.waitForPartitionLeadership === TYPEOF.FUNCTION) {
      await this.bootstrapService.waitForPartitionLeadership();
      return;
    }

    const services = this.partitionServices;
    if (!services || services.size === NUM.ZERO) {
      return;
    }

    const partitionIds = new Set();
    for (const service of services.values()) {
      if (service?.partitionId) {
        partitionIds.add(service.partitionId);
      }
    }
    if (partitionIds.size === NUM.ZERO) {
      return;
    }

    const configuredTimeoutMs =
      this.bootstrapService?.config?.leadershipWaitTimeoutMs;
    const timeoutMs = Math.min(
      configuredTimeoutMs || BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.TIMEOUT_CAP_MS,
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.TIMEOUT_CAP_MS,
    );
    let delay = this.bootstrapService?.config?.leadershipWaitInitialDelayMs ||
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.INITIAL_DELAY_MS;
    const maxDelay = this.bootstrapService?.config?.leadershipWaitMaxDelayMs ||
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.MAX_DELAY_MS;
    const backoff = this.bootstrapService?.config?.leadershipWaitBackoffMultiplier ||
      BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.BACKOFF_MULTIPLIER;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const leaders = this.getSystemPartitionLeaders();
      if (Object.keys(leaders).length > NUM.ZERO) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoff, maxDelay);
    }
  }

  /**
   * Get all message groups from system cache.
   * Uses the system cache (fed by CDC) as the single source of truth.
   * @return {Array<Object>} Message groups.
   */
  getMessageGroups() {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    // Get message group services from services table in system cache
    // The system cache is the single source of truth (fed by CDC)
    const services = systemTableCache.getAll(TABLES.SERVICES) || [];
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
    const cachedGroups = systemTableCache.getAll(TABLES.MESSAGE_GROUPS) || [];

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
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    // Get snapshots from cache
    const snapshots = {};
    for (const tableName of CACHE_HYDRATION_TABLES) {
      snapshots[tableName] = systemTableCache.getAll(tableName) || [];
    }

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

    return snapshots;
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
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    return getMissingSystemServiceLeaders(systemTableCache, {
      requireLeaderNodeId: true,
    });
  }

  /**
   * Build partition ID sets for bootstrap leader-readiness checks.
   * Required tables must have routable leaders before /bootstrap succeeds.
   * @return {Object} Known/required partition ID sets.
   * @private
   */
  getLeaderReadinessPartitionSets() {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const partitions = systemTableCache.getAll(TABLES.PARTITIONS) || [];

    const knownPartitionIds = new Set();
    const requiredPartitionIds = new Set();
    const requiredTables = new Set(BOOTSTRAP_REQUIRED_LEADER_TABLES);

    for (const partition of partitions) {
      const partitionId = partition[COLUMN.PARTITION_ID];
      if (!partitionId) {
        continue;
      }
      knownPartitionIds.add(partitionId);

      const tableName = partition[COLUMN.TABLE_ID] || partition.table_name;
      if (requiredTables.has(tableName)) {
        requiredPartitionIds.add(partitionId);
      }
    }

    return {knownPartitionIds, requiredPartitionIds};
  }

  /**
   * Keep missing-partition diagnostics focused on bootstrap-critical tables.
   * Unknown partition IDs are preserved for safety.
   * @param {Array<string>} partitionIds - Missing partition IDs.
   * @return {Array<string>} Filtered missing IDs.
   * @private
   */
  filterMissingRequiredPartitionIds(partitionIds = []) {
    if (!Array.isArray(partitionIds) || partitionIds.length === NUM.ZERO) {
      return [];
    }

    const {
      knownPartitionIds,
      requiredPartitionIds,
    } = this.getLeaderReadinessPartitionSets();

    if (knownPartitionIds.size === NUM.ZERO || requiredPartitionIds.size === NUM.ZERO) {
      return partitionIds;
    }

    return partitionIds.filter((partitionId) =>
      !knownPartitionIds.has(partitionId) || requiredPartitionIds.has(partitionId),
    );
  }

  /**
   * Build cached leader metadata by service type and entity ID.
   * @param {string} serviceType - Service type value.
   * @param {string} idColumn - Column key for entity ID.
   * @return {Map<string, Object>} Entity ID -> metadata flags.
   * @private
   */
  getCachedLeaderMetadataByServiceType(serviceType, idColumn) {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const services = systemTableCache.getAll(TABLES.SERVICES) || [];
    const metadata = new Map();

    for (const service of services) {
      const entityId = service[idColumn];
      if (!entityId ||
          service[COLUMN.SERVICE_TYPE] !== serviceType ||
          service[COLUMN.RAFT_ROLE] !== RAFT_ROLE.LEADER) {
        continue;
      }

      const existing = metadata.get(entityId) || {
        hasLeaderRecord: false,
        hasNodeId: false,
        hasAddress: false,
      };
      existing.hasLeaderRecord = true;
      existing.hasNodeId = existing.hasNodeId || Boolean(service[COLUMN.NODE_ID]);
      existing.hasAddress = existing.hasAddress || Boolean(service[COLUMN.ADDRESS]);
      metadata.set(entityId, existing);
    }

    return metadata;
  }

  /**
   * Determine whether a live service instance is currently leader.
   * @param {Object} service - Service instance.
   * @return {boolean} True when the service is leader.
   * @private
   */
  isLiveServiceLeader(service) {
    if (!service) {
      return false;
    }

    const role = typeof service.getRole === TYPEOF.FUNCTION ?
      service.getRole() :
      service.role;
    return service.isLeader === true ||
      role === RAFT_ROLE.LEADER ||
      (typeof service.isLeaderReplica === TYPEOF.FUNCTION &&
        service.isLeaderReplica());
  }

  /**
   * Build partition leader metadata from live partition services.
   * @return {Map<string, Object>} Partition ID -> leader metadata.
   * @private
   */
  getLivePartitionLeaders() {
    const leaders = new Map();
    if (!this.partitionServices || this.partitionServices.size === NUM.ZERO) {
      return leaders;
    }

    for (const service of this.partitionServices.values()) {
      const partitionId = service?.partitionId;
      if (!partitionId || leaders.has(partitionId) || !this.isLiveServiceLeader(service)) {
        continue;
      }

      const replicaId = service.replicaId || service.service_id;
      const nodeId = service.nodeId || this.seedNodeId;
      const address = service.unifiedAddress ||
        `${nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.PARTITION}` +
        `${ADDRESS.SEPARATOR}${replicaId}`;
      leaders.set(partitionId, {nodeId, address});
    }

    return leaders;
  }

  /**
   * Build message-group leader metadata from live services.
   * @return {Map<string, Object>} Group ID -> leader metadata.
   * @private
   */
  getLiveMessageGroupLeaders() {
    const leaders = new Map();
    if (!this.messageGroupServices || this.messageGroupServices.size === NUM.ZERO) {
      return leaders;
    }

    for (const service of this.messageGroupServices.values()) {
      const groupId = service?.groupId || service?.group_id;
      if (!groupId || leaders.has(groupId) || !this.isLiveServiceLeader(service)) {
        continue;
      }

      const replicaId = service.replicaId || service.service_id;
      const nodeId = service.nodeId || this.seedNodeId;
      const address = service.unifiedAddress ||
        `${nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.MESSAGE_GROUP}` +
        `${ADDRESS.SEPARATOR}${replicaId}`;
      leaders.set(groupId, {nodeId, address});
    }

    return leaders;
  }

  /**
   * Normalize leader readiness diagnostics for /bootstrap gating.
   * @param {Object} missing - Missing-leader diagnostics.
   * @return {Object} Normalized diagnostics.
   * @private
   */
  normalizeLeaderStatusForBootstrap(missing = {}) {
    const cachedPartitionLeaders = this.getCachedLeaderMetadataByServiceType(
      SERVICE_TYPE.PARTITION,
      COLUMN.PARTITION_ID,
    );
    const cachedMessageGroupLeaders = this.getCachedLeaderMetadataByServiceType(
      SERVICE_TYPE.MESSAGE_GROUP,
      COLUMN.GROUP_ID,
    );
    const livePartitionLeaders = this.getLivePartitionLeaders();
    const liveMessageGroupLeaders = this.getLiveMessageGroupLeaders();

    return {
      ...missing,
      missingPartitionLeaders: this.filterMissingRequiredPartitionIds(
        missing.missingPartitionLeaders || [],
      ).filter((partitionId) => {
        const cached = cachedPartitionLeaders.get(partitionId);
        if (!cached || !cached.hasLeaderRecord) {
          return true;
        }
        return !livePartitionLeaders.has(partitionId);
      }),
      missingPartitionLeaderNodes: this.filterMissingRequiredPartitionIds(
        missing.missingPartitionLeaderNodes || [],
      ).filter((partitionId) => {
        const cached = cachedPartitionLeaders.get(partitionId);
        if (!cached || !cached.hasLeaderRecord) {
          return true;
        }
        if (cached.hasNodeId) {
          return false;
        }

        const live = livePartitionLeaders.get(partitionId);
        return !live || !live.nodeId;
      }),
      missingPartitionLeaderAddresses: this.filterMissingRequiredPartitionIds(
        missing.missingPartitionLeaderAddresses || [],
      ).filter((partitionId) => {
        const cached = cachedPartitionLeaders.get(partitionId);
        if (!cached || !cached.hasLeaderRecord) {
          return true;
        }
        if (cached.hasAddress) {
          return false;
        }

        const live = livePartitionLeaders.get(partitionId);
        return !live || !live.address;
      }),
      missingMessageGroupLeaders:
        (missing.missingMessageGroupLeaders || []).filter((groupId) => {
          const cached = cachedMessageGroupLeaders.get(groupId);
          if (!cached || !cached.hasLeaderRecord) {
            return true;
          }
          return !liveMessageGroupLeaders.has(groupId);
        }),
      missingMessageGroupLeaderNodes:
        (missing.missingMessageGroupLeaderNodes || []).filter((groupId) => {
          const cached = cachedMessageGroupLeaders.get(groupId);
          if (!cached || !cached.hasLeaderRecord) {
            return true;
          }
          if (cached.hasNodeId) {
            return false;
          }

          const live = liveMessageGroupLeaders.get(groupId);
          return !live || !live.nodeId;
        }),
      missingMessageGroupLeaderAddresses:
        (missing.missingMessageGroupLeaderAddresses || []).filter((groupId) => {
          const cached = cachedMessageGroupLeaders.get(groupId);
          if (!cached || !cached.hasLeaderRecord) {
            return true;
          }
          if (cached.hasAddress) {
            return false;
          }

          const live = liveMessageGroupLeaders.get(groupId);
          return !live || !live.address;
        }),
    };
  }

  /**
   * Wait for all service raft groups to have leaders with complete routing info.
   * This is critical for bootstrap - joining nodes need complete leader information
   * (raft_role, node_id, address) to route writes correctly.
   * @return {Promise<Object>} Leader readiness status.
   * @private
   */
  async waitForServiceLeaders() {
    const missing = this.normalizeLeaderStatusForBootstrap(
      this.getMissingServiceLeaders(),
    );
    const missingCount = this.countMissingLeaderInfo(missing);

    if (missingCount === NUM.ZERO) {
      this.logger.info(BOOTSTRAP_API_LOG_MSG.LEADERS_READY || 'All service leaders ready', {
        seedNodeId: this.seedNodeId,
        elapsedMs: NUM.ZERO,
      });
      return {ready: true, ...missing};
    }

    this.logger.debug(BOOTSTRAP_API_LOG_MSG.LEADERS_NOT_READY, {
      seedNodeId: this.seedNodeId,
      missingCount,
      ...missing,
    });

    return {ready: false, ...missing};
  }

  /**
   * Count total missing leader information from getMissingServiceLeaders result.
   * Includes leaders without addresses - these are useless for query routing.
   * @param {Object} missing - Result from getMissingServiceLeaders.
   * @return {number} Total count of missing leader info.
   * @private
   */
  countMissingLeaderInfo(missing) {
    return getMissingSystemServiceLeaderCount(missing);
  }

  /**
   * Get system partition leaders for new node to query.
   * Prefer live partition services when available to avoid races with cache updates.
   * @return {Object} Partition leader addresses by table name.
   */
  getSystemPartitionLeaders() {
    const leaders = {};

    // Prefer live partition services when available.
    if (this.partitionServices && this.partitionServices.size > NUM.ZERO) {
      for (const service of this.partitionServices.values()) {
        const tableName = service.tableId || service.tableName;
        if (!tableName || leaders[tableName]) {
          continue;
        }

        const role = typeof service.getRole === TYPEOF.FUNCTION ?
          service.getRole() :
          service.role;
        const isLeader = service.isLeader === true ||
          role === RAFT_ROLE.LEADER ||
          (typeof service.isLeaderReplica === TYPEOF.FUNCTION && service.isLeaderReplica());

        if (!isLeader) {
          continue;
        }

        const nodeId = service.nodeId || this.seedNodeId;
        const replicaId = service.replicaId || service.service_id;
        const address = service.unifiedAddress ||
          `${nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.PARTITION}` +
          `${ADDRESS.SEPARATOR}${replicaId}`;

        leaders[tableName] = {
          partitionId: service.partitionId,
          replicaId,
          nodeId,
          address,
        };
      }

      if (Object.keys(leaders).length > NUM.ZERO) {
        return leaders;
      }
    }

    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    // Get partitions from system cache - the single source of truth
    const partitions = systemTableCache.getAll(TABLES.PARTITIONS) || [];
    const services = systemTableCache.getAll(TABLES.SERVICES) || [];

    for (const partition of partitions) {
      const tableName = partition.table_id || partition.table_name;
      if (!tableName || leaders[tableName]) {
        continue;
      }

      // Find the leader service for this partition
      const leaderService = services.find((service) =>
        service[COLUMN.PARTITION_ID] === partition[COLUMN.PARTITION_ID] &&
        service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
        service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
        service[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
      );

      if (leaderService) {
        leaders[tableName] = {
          partitionId: partition[COLUMN.PARTITION_ID],
          replicaId: leaderService[COLUMN.REPLICA_ID] ||
            leaderService[COLUMN.SERVICE_ID],
          nodeId: leaderService[COLUMN.NODE_ID],
          address: leaderService[COLUMN.ADDRESS],
        };
      }
    }

    return leaders;
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
