/**
 * Admin WebSocket API — node-local compatibility adapter.
 *
 * This class is a THIN ROUTING ADAPTER on the configured admin WebSocket port.
 * It exists solely to preserve backward compatibility with
 * existing CLI clients. Its responsibilities are:
 *
 *   1. Accept WebSocket connections from admin CLI clients.
 *   2. Validate incoming message envelopes (JSON, required fields).
 *   3. Route query execution through the SQL query engine
 *      (SqlCore), which owns all SQL planning and mutation paths.
 *   4. Forward CDC events from the system table cache to
 *      connected clients for real-time state updates.
 *   5. Return responses in the CLI-compatible envelope format.
 *
 * This adapter MUST NOT:
 *   - Write to partitions directly (all writes go through SqlCore).
 *   - Own or introduce alternative mutation paths.
 *   - Maintain derived state beyond the client connection set.
 *   - Bypass the SQL/CDC ownership contract.
 *
 * Query execution delegates through AdminApiAdapter contract
 * and then into SqlCore.executeRequest(SqlRequest), which
 * routes through the standard SQL/CDC mutation path.
 * Cache reads use the read-only SystemTableCache interface.
 *
 * See architecture.md §AdminWebSocketAPI and §Admin Serviceization.
 *
 * Requirements: 2.4, 13.2
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudget,
  createTimeoutBudgetError,
} from '../control-plane/timeout-budget.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {getRegisteredControlPlaneSystemTableGateway} from
  '../control-plane/control-plane-gateway-registry.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  ERRNO,
  HTTP_STATUS,
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {TRANSPORT_EVENT} from '../constants/transport.js';
import {CancellationToken} from '../query/cancellation-token.js';
import {createSqlRequest} from '../query/sql-request.js';
import {EXECUTION_MODE} from '../query/sql-adapter-constants.js';
import {guardedAdaptAdminAction} from './admin-api-adapter.js';
import {
  ADMIN_META_ACTION,
  CACHE_DUMP_TABLES,
} from './admin-meta-command-handlers.js';
import {parseLiveSelect} from '../live-query/live-query-service.js';
import {AST_TYPE, EXPR_TYPE, SQLParser} from '../query/sql-parser.js';
import {MUTATION_GUARD_MODE} from './admin-mutation-guard.js';
import {
  ADMIN_SERVICE_OPERATION,
  adaptAdminMessageToServiceMessage,
  isAdminMessageDispatchable,
} from './admin-service-message-adapter.js';
import {AdminTestRunService} from './admin-test-run-service.js';
import {DebugMetadataStore} from '../debug-runtime/debug-metadata-service.js';
import {TraceCollector} from '../debug/trace-collector.js';
import {
  ENDPOINT_SYNC_UNHEALTHY_POLICY,
} from '../runtime/endpoint-sync-constants.js';

import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_CLIENT,
  ADMIN_CONTENT_TYPE,
  ADMIN_CONFIG_KEY,
  ADMIN_DEFAULT,
  ADMIN_ENFORCEMENT_MODE,
  ADMIN_ERROR_CODE,
  ADMIN_ERROR_HINT,
  ADMIN_ERROR_MATCH,
  ADMIN_ERROR_MESSAGE,
  ADMIN_LIMIT,
  ADMIN_LOG_MSG,
  ADMIN_MESSAGE_TYPE,
  ADMIN_QUERY_RESULT,
  ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT,
  ADMIN_SERVICE_DISCOVERY,
  ADMIN_ROUTE,
  ADMIN_STATUS,
  ADMIN_SUBSYSTEM,
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_STREAM_EVENT,
} from './admin-constants.js';
import {
  normalizeIdentifier,
  normalizeSql,
} from './admin-helpers.js';
import {evaluateSharedMetadataNodeCoverage} from
  './admin-shared-metadata-consistency.js';
import {
  AdminServiceDiscovery,
  parseDiscoveryBooleanQuery,
  parseDiscoveryListQuery,
  parseServiceDiscoverySqlQuery,
} from './admin-service-discovery.js';
import {AdminPreflightSnapshot} from './admin-preflight-snapshot.js';
import {AdminControlSnapshot} from './admin-control-snapshot.js';
import {AdminDebugHandlers} from './admin-debug-handlers.js';

const MessageType = ADMIN_MESSAGE_TYPE;
const ErrorCode = ADMIN_ERROR_CODE;
const HTTP_HEADER = Object.freeze({
  CACHE_CONTROL: 'Cache-Control',
  CONNECTION: 'Connection',
  CONTENT_TYPE: 'Content-Type',
});
const HTTP_HEADER_VALUE = Object.freeze({
  NO_CACHE: 'no-cache',
  NO_STORE: 'no-store',
  KEEP_ALIVE: 'keep-alive',
});
const ADMIN_STREAM_LANE_DEFAULT = 'default';
const ADMIN_STREAM_LANE_LOAD = 'load';
const ADMIN_STREAM_LANE_PROBE = 'probe';
const ADMIN_STREAM_LANE_SNAPSHOT = 'snapshot';
const LOAD_LANE_READINESS_CACHE_MAX_AGE_MS = 5000;
const SSE_FRAME_PREFIX = 'data: ';
const SSE_FRAME_SUFFIX = '\n\n';
const EMPTY_STRING = '';
const ADMIN_CACHE_OBSERVATION_TABLES =
  new Set([
    ...CACHE_DUMP_TABLES,
    TABLES.NODE_ENDPOINTS,
  ]);

const ADMIN_LOCAL_DISPATCH = Object.freeze({
  TARGET_ADDRESS: 'local/admin-websocket-api',
});


/**
 * Build a typed admin-operation error used for websocket responses.
 * @param {string} errorCode
 * @param {string} message
 * @param {string|null} [hint]
 * @return {Error}
 */
function createAdminOperationError(errorCode, message, hint = null) {
  const error = new Error(message);
  error.adminErrorCode = errorCode;
  error.adminHint = hint;
  return error;
}

/**
 * Resolve one optional positive timeout override from message payload.
 * @param {*} value
 * @return {number|null}
 */
function resolveRequestedQueryTimeoutMs(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }
  const normalizedValue = Math.floor(parsedValue);
  if (normalizedValue <= NUM.ZERO) {
    return null;
  }
  return normalizedValue;
}

/**
 * Build a typed admin-operation error used for websocket responses.
 * administrative SQL/cache operations on the configured admin WebSocket port.
 *
 * All query execution routes through SqlQueryEngine (SqlCore).
 * All cache reads use the read-only SystemTableCache interface.
 * No direct partition writes or alternative mutation paths.
 */
class AdminWebSocketAPI {
  /**
   * Create a new AdminWebSocketAPI.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object|null} [options.cacheMutationTarget] - Writable cache target.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {Object|null} [options.messageRouter] - MessageRouter instance (optional).
   * @param {string} options.nodeId - Node ID.
   * @param {boolean} [options.enableAdminStream] - Enable legacy admin stream.
   */
  constructor(options = {}) {
    this.systemTableCache = options.systemTableCache || null;
    this.cacheMutationTarget = options.cacheMutationTarget || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      getRegisteredControlPlaneSystemTableGateway() ||
      null;
    this.messageRouter = options.messageRouter || null;
    this.nodeId = options.nodeId || ADMIN_DEFAULT.NODE_ID;
    this.enforcementMode = options.enforcementMode ||
      ADMIN_DEFAULT.ENFORCEMENT_MODE;
    this.nowFn = options.nowFn || (() => Date.now());
    this.testRunService = options.testRunService || new AdminTestRunService();
    this.debugMetadataStore = options.debugMetadataStore ||
      (this.sqlQueryEngine ?
        new DebugMetadataStore({sqlQueryEngine: this.sqlQueryEngine}) :
        null);
    this.debugDapRouter = options.debugDapRouter || null;
    this.traceCollector = options.traceCollector || new TraceCollector();
    this.serviceDispatcher =
      options.serviceDispatcher || this.createLocalServiceDispatcher();
    this.serviceDiagnosticsProvider = options.serviceDiagnosticsProvider || null;
    this.partitionServicesProvider =
      typeof options.partitionServicesProvider === TYPEOF.FUNCTION ?
        options.partitionServicesProvider :
        null;
    this.partitionServices =
      options.partitionServices instanceof Map ?
        options.partitionServices :
        null;
    this.liveQueryManager = options.liveQueryManager || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService ||
      this.sqlQueryEngine?.rebalanceCoordinator?.storageAdmissionService
        ?.controlPlaneReadinessService ||
      null;
    this.heartbeatService = options.heartbeatService || null;
    this.loadLaneReadinessCacheMaxAgeMs =
      Number.isFinite(options.loadLaneReadinessCacheMaxAgeMs) &&
        options.loadLaneReadinessCacheMaxAgeMs > NUM.ZERO ?
        Math.floor(options.loadLaneReadinessCacheMaxAgeMs) :
        LOAD_LANE_READINESS_CACHE_MAX_AGE_MS;
    this.enableAdminStream = options.enableAdminStream !== false;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.port = ADMIN_DEFAULT.WEBSOCKET_PORT;
    this.queryTimeoutMs =
      config.get(ADMIN_CONFIG_KEY.QUERY_TIMEOUT_MS) || ADMIN_DEFAULT.QUERY_TIMEOUT_MS;
    this.cacheDumpTimeoutMs =
      config.get(ADMIN_CONFIG_KEY.CACHE_DUMP_TIMEOUT_MS) || ADMIN_DEFAULT.CACHE_DUMP_TIMEOUT_MS;

    // Logging
    this.logger = this.initLogger();

    // Fastify instance
    this.fastify = null;
    this.initialized = false;
    this.listening = false;

    // Connected clients
    this.clients = new Set();

    // Control snapshot delegate
    this.controlSnapshot = new AdminControlSnapshot({
      systemTableCache: this.systemTableCache,
      nodeId: this.nodeId,
      cacheMutationTarget: this.cacheMutationTarget,
      sqlQueryEngine: this.sqlQueryEngine,
      messageRouter: this.messageRouter,
      cdcIntegrationService: this.cdcIntegrationService,
      controlPlaneReadinessService: this.controlPlaneReadinessService,
      heartbeatService: this.heartbeatService,
      ensureAuthoritativeDiscoveryCacheRepair: (opts) =>
        this.serviceDiscovery
          ?.ensureAuthoritativeDiscoveryCacheRepair(opts),
      resolveLocalPartitionServices: () =>
        this.serviceDiscovery.resolveLocalPartitionServices(),
      nowFn: this.nowFn,
    });

    // Preflight critical path snapshot delegate
    this.preflightSnapshot = new AdminPreflightSnapshot({
      systemTableCache: this.systemTableCache,
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
      cacheMutationTarget: this.cacheMutationTarget,
      sqlQueryEngine: this.sqlQueryEngine,
      buildLocalServiceDiscoverySnapshot: (opts) =>
        this.serviceDiscovery
          .buildLocalServiceDiscoverySnapshot(opts),
      ensureAuthoritativeDiscoveryCacheRepair: (opts) =>
        this.serviceDiscovery
          .ensureAuthoritativeDiscoveryCacheRepair(opts),
      buildControlPlaneDiagnosticsSnapshot: () =>
        this.controlSnapshot.buildControlPlaneDiagnosticsSnapshot(),
    });

    // Service discovery delegate
    this.serviceDiscovery = new AdminServiceDiscovery({
      systemTableCache: this.systemTableCache,
      nodeId: this.nodeId,
      logger: this.logger,
      cacheMutationTarget: this.cacheMutationTarget,
      controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
      cdcIntegrationService: this.cdcIntegrationService,
      partitionServicesProvider: this.partitionServicesProvider,
      partitionServices: this.partitionServices,
      sqlQueryEngine: this.sqlQueryEngine,
      buildPreflightCacheFreshnessSummary: (opts) =>
        this.preflightSnapshot.buildPreflightCacheFreshnessSummary(
          opts,
        ),
      buildControlSnapshotReplicaOperationSummary: (rows, opts) =>
        this.controlSnapshot
          .buildControlSnapshotReplicaOperationSummary(rows, opts),
      executeSqlRequestWithTimeout: (req, timeout) =>
        this.executeSqlRequestWithTimeout(req, timeout),
      nowFn: this.nowFn,
    });

    // Debug handlers delegate
    this.debugHandlers = new AdminDebugHandlers({
      debugMetadataStore: this.debugMetadataStore,
      debugDapRouter: this.debugDapRouter,
      traceCollector: this.traceCollector,
      logger: this.logger,
      testRunService: this.testRunService,
    });

    // Subscribe to cache notifications for CDC forwarding (Requirement 2.2)
    this.subscribeToCacheNotifications();
  }

  /**
   * Subscribe to cache change notifications.
   * Broadcasts CDC events to all connected clients when cache changes.
   * @private
   */
  subscribeToCacheNotifications() {
    if (this.systemTableCache &&
        typeof this.systemTableCache.onCacheChange === TYPEOF.FUNCTION) {
      this.systemTableCache.onCacheChange(
        (tableName, operation, record) => {
          this.broadcastCDCEvent(tableName, operation, record);
        },
      );
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(ADMIN_SUBSYSTEM.WEBSOCKET_API);
      }
    } catch (_logErr) {
      // Logging not available — fall through to console
    }
    return console;
  }

  /**
   * Initialize and start the WebSocket server.
   * @param {number} port - Port to listen on (optional).
   * @param {Object} [options] - Initialization options.
   * @param {boolean} [options.listen] - Whether to listen on a TCP port.
   * @return {Promise<void>}
   */
  async initialize(port, options = {}) {
    if (this.initialized) {
      return;
    }

    const listenPort = port !== undefined ? port : this.port;
    const shouldListen = options.listen !== false;
    const listenHost = options.host || ADMIN_DEFAULT.HOST;

    this.fastify = Fastify({
      logger: false,
    });

    // Register WebSocket plugin
    await this.fastify.register(websocket);

    // Register routes
    this.registerRoutes();

    if (shouldListen) {
      try {
        await this.fastify.listen({port: listenPort, host: listenHost});
        this.listening = true;
      } catch (err) {
        // Some environments disallow opening listening sockets (eg, unit-test sandboxes).
        // In that case, continue in "ready-only" mode so tests can use fastify.inject()
        // and/or direct handler invocation without binding ports.
        if (err && (err.code === ERRNO.EPERM || err.code === ERRNO.EACCES)) {
          await this.fastify.ready();
          this.listening = false;
        } else {
          throw err;
        }
      }
    } else {
      await this.fastify.ready();
      this.listening = false;
    }

    this.initialized = true;

    this.logger.info(ADMIN_LOG_MSG.STARTED, {
      port: this.listening ? listenPort : null,
      listen: this.listening,
      nodeId: this.nodeId,
    });
  }

  /**
   * Register API routes.
   * @private
   */
  registerRoutes() {
    // Landing page routes.
    this.fastify.get(ADMIN_ROUTE.ROOT, async (_request, reply) => {
      return this.handleDashboardPage(reply);
    });
    this.fastify.get(ADMIN_ROUTE.TEST_DASHBOARD, async (_request, reply) => {
      return this.handleDashboardPage(reply);
    });

    // Health check endpoint
    this.fastify.get(ADMIN_ROUTE.HEALTH, async (_request, _reply) => {
      return {
        status: ADMIN_STATUS.HEALTHY,
        nodeId: this.nodeId,
        connectedClients: this.clients.size,
      };
    });
    this.fastify.get(ADMIN_ROUTE.SERVICE_DIAGNOSTICS, async (_request, reply) => {
      return this.handleServiceDiagnostics(reply);
    });
    this.fastify.get(ADMIN_ROUTE.CDC_DIAGNOSTICS, async (_request, reply) => {
      return this.handleCdcDiagnostics(reply);
    });
    this.fastify.get(ADMIN_ROUTE.PARTITION_DIAGNOSTICS, async (_request, reply) => {
      return this.handlePartitionDiagnostics(reply);
    });
    this.fastify.get(ADMIN_ROUTE.SQL_DIAGNOSTICS, async (_request, reply) => {
      return this.handleSqlDiagnostics(reply);
    });
    this.fastify.get(
      ADMIN_ROUTE.PREFLIGHT_CRITICAL_PATH_SNAPSHOT,
      async (_request, reply) => {
        return this.handlePreflightCriticalPathSnapshot(reply);
      },
    );
    this.fastify.get(ADMIN_ROUTE.CONTROL_SNAPSHOT, async (request, reply) => {
      return this.handleControlSnapshot(request, reply);
    });
    this.fastify.get(ADMIN_ROUTE.SERVICE_DISCOVERY, async (request, reply) => {
      return this.handleServiceDiscovery(request, reply);
    });

    // Test administration endpoints.
    this.fastify.get(ADMIN_ROUTE.TESTS, async (_request, reply) => {
      return this.handleListTests(reply);
    });
    this.fastify.get(ADMIN_ROUTE.TEST_RUNS, async (_request, reply) => {
      return this.handleListRuns(reply);
    });
    this.fastify.get(ADMIN_ROUTE.TEST_RUN_BY_ID, async (request, reply) => {
      return this.handleGetRun(request, reply);
    });
    this.fastify.delete(ADMIN_ROUTE.TEST_RUN_BY_ID, async (request, reply) => {
      return this.handleDeleteRun(request, reply);
    });
    this.fastify.post(ADMIN_ROUTE.TEST_RUNS, async (request, reply) => {
      return this.handleStartRun(request, reply);
    });
    this.fastify.post(ADMIN_ROUTE.TEST_RUN_STOP, async (request, reply) => {
      return this.handleStopRun(request, reply);
    });
    this.fastify.get(ADMIN_ROUTE.TEST_RUN_STREAM, async (request, reply) => {
      return this.handleRunStream(request, reply);
    });
    this.fastify.post(ADMIN_ROUTE.DEBUG_SESSIONS, async (request, reply) => {
      return this.debugHandlers
        .handleCreateDebugSession(request, reply);
    });
    this.fastify.get(
      ADMIN_ROUTE.DEBUG_SESSION_BY_ID,
      async (request, reply) => {
        return this.debugHandlers
          .handleGetDebugSession(request, reply);
      },
    );
    this.fastify.patch(
      ADMIN_ROUTE.DEBUG_SESSION_BY_ID,
      async (request, reply) => {
        return this.debugHandlers
          .handleUpdateDebugSession(request, reply);
      },
    );
    this.fastify.post(
      ADMIN_ROUTE.DEBUG_SESSION_ATTACH,
      async (request, reply) => {
        return this.debugHandlers
          .handleAttachDebugSession(request, reply);
      },
    );
    this.fastify.post(
      ADMIN_ROUTE.DEBUG_SESSION_BREAKPOINTS,
      async (request, reply) => {
        return this.debugHandlers
          .handleWriteDebugBreakpoints(request, reply);
      },
    );
    this.fastify.get(
      ADMIN_ROUTE.DEBUG_SESSION_BREAKPOINTS,
      async (request, reply) => {
        return this.debugHandlers
          .handleListDebugBreakpoints(request, reply);
      },
    );
    this.fastify.post(
      ADMIN_ROUTE.DEBUG_SESSION_SNAPSHOTS,
      async (request, reply) => {
        return this.debugHandlers
          .handleWriteDebugSnapshot(request, reply);
      },
    );
    this.fastify.get(
      ADMIN_ROUTE.DEBUG_SESSION_SNAPSHOTS,
      async (request, reply) => {
        return this.debugHandlers
          .handleListDebugSnapshots(request, reply);
      },
    );
    this.fastify.get(
      ADMIN_ROUTE.DEBUG_SNAPSHOT_BY_ID,
      async (request, reply) => {
        return this.debugHandlers
          .handleGetDebugSnapshot(request, reply);
      },
    );
    this.fastify.post(
      ADMIN_ROUTE.DEBUG_DAP_REQUEST,
      async (request, reply) => {
        return this.debugHandlers
          .handleDebugDapRequest(request, reply);
      },
    );

    this.fastify.get(ADMIN_ROUTE.PLAYBACK_VIEWER, async (_request, reply) => {
      return this.debugHandlers.handlePlaybackViewerPage(reply);
    });
    this.fastify.get(ADMIN_ROUTE.OUTPUT_FILES, async (request, reply) => {
      return this.debugHandlers.handleOutputFile(request, reply);
    });

    if (this.enableAdminStream) {
      // WebSocket endpoint for admin stream
      // Note: @fastify/websocket passes socket directly in newer versions
      this.fastify.register(async (fastify) => {
        fastify.get(ADMIN_ROUTE.STREAM, {websocket: true}, (socket, req) => {
          this.handleConnection(socket, req);
        });
        fastify.get(
          ADMIN_ROUTE.DEBUG_TRACE_STREAM,
          {websocket: true},
          (socket, request) => {
            this.debugHandlers
              .handleDebugTraceConnection(socket, request);
          },
        );
      });
    }
  }

  /**
   * Serve dashboard landing page.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleDashboardPage(reply) {
    try {
      const page = await this.testRunService.readDashboardPage();
      reply
        .code(HTTP_STATUS.OK)
        .header(HTTP_HEADER.CACHE_CONTROL, HTTP_HEADER_VALUE.NO_STORE)
        .type(ADMIN_CONTENT_TYPE.HTML)
        .send(page);
    } catch (error) {
      reply
        .code(HTTP_STATUS.NOT_FOUND)
        .send({
          error: ADMIN_TEST_ERROR_MSG.DASHBOARD_NOT_FOUND,
          details: error.message,
        });
    }
  }

  /**
   * List distributed tests and configs.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleListTests(reply) {
    try {
      const [tests, configs] = await Promise.all([
        this.testRunService.listAvailableTests(),
        this.testRunService.listAvailableConfigs(),
      ]);
      reply.code(HTTP_STATUS.OK).send({
        tests,
        configs,
        defaultConfig: ADMIN_TEST_DEFAULT.CONFIG_FILE,
      });
    } catch (error) {
      reply
        .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .send({error: error.message});
    }
  }

  /**
   * List saved and active test runs.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleListRuns(reply) {
    try {
      const runs = await this.testRunService.listSavedRuns();
      reply.code(HTTP_STATUS.OK).send({runs});
    } catch (error) {
      reply
        .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .send({error: error.message});
    }
  }

  /**
   * Get one test run.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleGetRun(request, reply) {
    const runId = request.params.runId;
    const run = await this.testRunService.getRun(runId);
    if (!run) {
      reply
        .code(HTTP_STATUS.NOT_FOUND)
        .send({error: ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND});
      return;
    }
    reply.code(HTTP_STATUS.OK).send({run});
  }

  /**
   * Start a distributed test run.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleStartRun(request, reply) {
    try {
      const run = await this.testRunService.startRun(request.body || {});
      this.logger.info(ADMIN_LOG_MSG.TEST_RUN_STARTED, {
        runId: run.runId,
        scenario: run.scenario,
        gitHash: run.gitHash,
      });
      reply.code(HTTP_STATUS.OK).send({run});
    } catch (error) {
      reply
        .code(this.resolveTestApiErrorStatus(error))
        .send({error: error.message});
    }
  }

  /**
   * Stop a distributed test run.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleStopRun(request, reply) {
    try {
      const run = await this.testRunService.stopRun(request.params.runId);
      this.logger.info(ADMIN_LOG_MSG.TEST_RUN_STOP_REQUESTED, {
        runId: run.runId,
        scenario: run.scenario,
      });
      reply.code(HTTP_STATUS.OK).send({run});
    } catch (error) {
      reply
        .code(this.resolveTestApiErrorStatus(error))
        .send({error: error.message});
    }
  }

  /**
   * Delete a completed distributed test run.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleDeleteRun(request, reply) {
    try {
      const result = await this.testRunService.deleteRun(request.params.runId);
      this.logger.info(ADMIN_LOG_MSG.TEST_RUN_DELETED, {
        runId: result.runId,
      });
      reply.code(HTTP_STATUS.OK).send(result);
    } catch (error) {
      reply
        .code(this.resolveTestApiErrorStatus(error))
        .send({error: error.message});
    }
  }

  /**
   * Stream live run events using SSE.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleRunStream(request, reply) {
    const runId = request.params.runId;
    const existingRun = await this.testRunService.getRun(runId);
    if (!existingRun) {
      reply
        .code(HTTP_STATUS.NOT_FOUND)
        .send({error: ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND});
      return;
    }

    let subscription = null;
    let closed = false;

    const sendEvent = (eventPayload) => {
      if (closed) {
        return;
      }
      try {
        const frame =
          `${SSE_FRAME_PREFIX}${JSON.stringify(eventPayload)}${SSE_FRAME_SUFFIX}`;
        reply.raw.write(frame);
      } catch (_streamErr) {
        // Stream errors are handled by close listener cleanup.
      }
    };

    subscription = this.testRunService.subscribeToRun(runId, sendEvent);
    if (!subscription) {
      reply.hijack();
      reply.raw.statusCode = HTTP_STATUS.OK;
      reply.raw.setHeader(HTTP_HEADER.CACHE_CONTROL, HTTP_HEADER_VALUE.NO_CACHE);
      reply.raw.setHeader(HTTP_HEADER.CONNECTION, HTTP_HEADER_VALUE.KEEP_ALIVE);
      reply.raw.setHeader(
        HTTP_HEADER.CONTENT_TYPE,
        ADMIN_CONTENT_TYPE.EVENT_STREAM,
      );
      sendEvent({
        type: ADMIN_TEST_STREAM_EVENT.STATUS,
        data: existingRun,
      });
      for (const entry of existingRun.logs || []) {
        sendEvent({
          type: ADMIN_TEST_STREAM_EVENT.LOG,
          data: entry,
        });
      }
      reply.raw.end();
      return;
    }

    reply.hijack();
    reply.raw.statusCode = HTTP_STATUS.OK;
    reply.raw.setHeader(HTTP_HEADER.CACHE_CONTROL, HTTP_HEADER_VALUE.NO_CACHE);
    reply.raw.setHeader(HTTP_HEADER.CONNECTION, HTTP_HEADER_VALUE.KEEP_ALIVE);
    reply.raw.setHeader(
      HTTP_HEADER.CONTENT_TYPE,
      ADMIN_CONTENT_TYPE.EVENT_STREAM,
    );

    this.logger.info(ADMIN_LOG_MSG.TEST_RUN_LOG_STREAM_SUBSCRIBED, {
      runId,
    });

    sendEvent({
      type: ADMIN_TEST_STREAM_EVENT.STATUS,
      data: subscription.run,
    });
    for (const entry of subscription.backlog) {
      sendEvent({
        type: ADMIN_TEST_STREAM_EVENT.LOG,
        data: entry,
      });
    }

    request.raw.on(TRANSPORT_EVENT.CLOSE, () => {
      if (closed) {
        return;
      }
      closed = true;
      subscription.unsubscribe();
      this.logger.info(ADMIN_LOG_MSG.TEST_RUN_LOG_STREAM_UNSUBSCRIBED, {
        runId,
      });
      reply.raw.end();
    });
  }

  /**
   * Resolve status code for admin test API errors.
   * @param {Error} error
   * @return {number}
   * @private
   */
  resolveTestApiErrorStatus(error) {
    const message = error?.message || EMPTY_STRING;
    if (message === ADMIN_TEST_ERROR_MSG.SCENARIO_REQUIRED ||
        message === ADMIN_TEST_ERROR_MSG.RUN_NOT_ACTIVE ||
        message === ADMIN_TEST_ERROR_MSG.RUN_DELETE_ACTIVE ||
        message.startsWith(`${ADMIN_TEST_ERROR_MSG.CONFIG_PREFLIGHT_FAILED}: `)) {
      return HTTP_STATUS.BAD_REQUEST;
    }
    if (message === ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND ||
        message === ADMIN_TEST_ERROR_MSG.SCENARIO_NOT_FOUND ||
        message === ADMIN_TEST_ERROR_MSG.CONFIG_NOT_FOUND) {
      return HTTP_STATUS.NOT_FOUND;
    }
    return HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }

  /**
   * Normalize one admin websocket lane string.
   * @param {*} lane
   * @return {string}
   * @private
   */
  resolveAdminClientLane(lane) {
    if (typeof lane !== TYPEOF.STRING) {
      return ADMIN_STREAM_LANE_DEFAULT;
    }
    const normalized = lane.trim().toLowerCase();
    if (normalized.length === NUM.ZERO) {
      return ADMIN_STREAM_LANE_DEFAULT;
    }
    return normalized;
  }

  /**
   * Handle new WebSocket connection.
   * @param {Object} socket - WebSocket connection.
   * @param {Object} [request] - Fastify request.
   * @private
   */
  handleConnection(socket, request = null) {
    const lane = this.resolveAdminClientLane(
      request?.query?.lane,
    );
    const clientId = `${ADMIN_CLIENT.PREFIX}${Date.now()}-` +
      `${Math.random()
        .toString(ADMIN_CLIENT.RANDOM_BASE)
        .substr(ADMIN_CLIENT.RANDOM_START, ADMIN_CLIENT.RANDOM_LENGTH)}`;

    this.logger.info(ADMIN_LOG_MSG.CLIENT_CONNECTED, {
      clientId,
      lane,
      totalClients: this.clients.size + NUM.ONE,
    });

    // Add to connected clients
    const clientInfo = {
      id: clientId,
      lane,
      socket,
      connectedAt: Date.now(),
      liveQueryMap: new Map(),
    };
    this.clients.add(clientInfo);

    // Send cache dump on connection
    this.sendCacheDump(clientInfo);

    // Handle incoming messages
    socket.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      this.handleMessage(clientInfo, data);
    });

    // Handle disconnection
    socket.on(TRANSPORT_EVENT.CLOSE, () => {
      this.handleDisconnection(clientInfo);
    });

    // Handle errors
    socket.on(TRANSPORT_EVENT.ERROR, (error) => {
      this.logger.error(ADMIN_LOG_MSG.SOCKET_ERROR, {
        clientId,
        error: error.message,
      });
    });
  }

  /**
   * Handle client disconnection.
   * @param {Object} clientInfo - Client information.
   * @private
   */
  handleDisconnection(clientInfo) {
    this.clients.delete(clientInfo);

    if (this.liveQueryManager) {
      this.liveQueryManager.handleClientDisconnection(clientInfo.id);
    }

    this.logger.info(ADMIN_LOG_MSG.CLIENT_DISCONNECTED, {
      clientId: clientInfo.id,
      lane: this.resolveAdminClientLane(clientInfo?.lane),
      totalClients: this.clients.size,
    });
  }

  /**
   * Send cache dump to a client.
   * @param {Object} clientInfo - Client information.
   * @param {Array<string>} [tables] - Optional table filter.
   * @private
   */
  sendCacheDump(clientInfo, tables) {
    const cacheDump = this.buildValidatedCacheDump(tables);
    this.sendCacheDumpPayload(clientInfo, cacheDump);
  }

  /**
   * Build and validate one cache-dump payload.
   * @param {Array<string>} [tables] - Optional table filter.
   * @return {Object}
   * @private
   */
  buildValidatedCacheDump(tables) {
    const cacheDump = this.buildCacheDump(tables);
    const isEmpty = Object.values(cacheDump).every((rows) =>
      Array.isArray(rows) && rows.length === NUM.ZERO,
    );
    if (isEmpty) {
      throw createAdminOperationError(
        ErrorCode.INTERNAL_ERROR,
        ADMIN_ERROR_MESSAGE.SYSTEM_CACHE_EMPTY,
      );
    }
    return cacheDump;
  }

  /**
   * Send one prepared cache-dump payload.
   * @param {Object} clientInfo
   * @param {Object} cacheDump
   * @private
   */
  sendCacheDumpPayload(clientInfo, cacheDump) {
    this.sendToClient(clientInfo, {
      type: MessageType.CACHE_DUMP,
      timestamp: Date.now(),
      nodeId: this.nodeId,
      data: cacheDump,
    });

    this.logger.debug(ADMIN_LOG_MSG.CACHE_DUMP_SENT, {
      clientId: clientInfo.id,
      tableCount: Object.keys(cacheDump).length,
    });
  }

  /**
   * Build cache dump from system table cache.
   * @param {Array<string>} [tables] - Optional table filter.
   * @return {Object} Cache dump with all system tables.
   * @private
   */
  buildCacheDump(tables) {
    const targetTables = tables || CACHE_DUMP_TABLES;
    const dump = {};

    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      throw new Error('System table cache not initialized');
    }

    for (const tableName of targetTables) {
      try {
        dump[tableName] = this.systemTableCache.getAll(tableName);
      } catch (_cacheErr) {
        dump[tableName] = ADMIN_CACHE_DUMP.EMPTY;
      }
    }

    return dump;
  }

  /**
   * Create default local dispatcher implementing canonical dispatch interface.
   * @return {Object}
   * @private
   */
  createLocalServiceDispatcher() {
    return {
      dispatch: async (envelope, context = {}) => {
        const payload = await this.executeLocalServiceEnvelope(envelope, context);
        return {
          envelope,
          target: {
            targetAddress: ADMIN_LOCAL_DISPATCH.TARGET_ADDRESS,
            targetNodeId: this.nodeId,
          },
          delivery: {
            acknowledged: true,
            payload,
          },
        };
      },
    };
  }

  /**
   * Execute one canonical Service_Message envelope locally.
   * @param {Object} envelope
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async executeLocalServiceEnvelope(envelope, context = {}) {
    const operation = envelope?.operation;
    const payload = envelope?.payload || {};

    if (operation === ADMIN_SERVICE_OPERATION.EXECUTE_QUERY) {
      return {
        queryResult: await this.executeLocalQueryEnvelope(payload, context),
      };
    }
    if (operation === ADMIN_SERVICE_OPERATION.EXECUTE_PARTITION_CALLBACK) {
      return {
        queryResult: await this.executeLocalPartitionCallbackEnvelope(
          payload,
          context,
        ),
      };
    }
    if (operation === ADMIN_SERVICE_OPERATION.GET_CACHE_DUMP) {
      return {
        cacheDump: this.executeLocalCacheDumpEnvelope(),
      };
    }

    throw createAdminOperationError(
      ErrorCode.INTERNAL_ERROR,
      `${ADMIN_ERROR_MESSAGE.SERVICE_DISPATCH_OPERATION_UNSUPPORTED}: ${operation}`,
    );
  }

  /**
   * Return true when one request is executing on the load lane.
   * @param {Object} executionContext
   * @return {boolean}
   * @private
   */
  isLoadLaneExecution(executionContext = {}) {
    const lane = this.resolveAdminClientLane(
      executionContext?.clientInfo?.lane,
    );
    return lane === ADMIN_STREAM_LANE_LOAD;
  }

  /**
   * Return true when one request is executing on a local-observation lane.
   * Probe/snapshot lanes must not amplify cluster pressure with
   * authoritative discovery repair.
   * @param {Object} executionContext
   * @return {boolean}
   * @private
   */
  isLocalObservationLaneExecution(executionContext = {}) {
    const lane = this.resolveAdminClientLane(
      executionContext?.clientInfo?.lane,
    );
    return lane === ADMIN_STREAM_LANE_PROBE ||
      lane === ADMIN_STREAM_LANE_SNAPSHOT;
  }

  /**
   * Evaluate node-local pressure for local observation queries.
   * @return {Object|null}
   * @private
   */
  evaluateLocalObservationPressure() {
    if (!this.messageRouter) {
      return null;
    }
    return PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
      now: this.nowFn,
    }).evaluate({
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      resourceKeys: [
        'control-plane:read',
        'control-plane:admin-local-observation',
      ],
      allowDegrade: true,
    });
  }

  /**
   * Resolve execution policy for control-snapshot/service-discovery
   * local observation queries.
   * @param {Object} executionContext
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  resolveLocalObservationExecutionPolicy(
    executionContext = {},
    options = {},
  ) {
    const forceAuthoritativeRepair =
      options.forceAuthoritativeRepair === true;
    if (forceAuthoritativeRepair) {
      return {
        allowAuthoritativeRepair: true,
        allowAuthoritativeReadinessRefresh: true,
        allowStaleReadinessOnCacheChange: false,
      };
    }

    return {
      allowAuthoritativeRepair: false,
      allowAuthoritativeReadinessRefresh: false,
      allowStaleReadinessOnCacheChange: true,
    };
  }

  /**
   * Resolve local readiness snapshot for load-lane admission checks.
   * @return {Object|null}
   * @private
   */
  async resolveLoadLaneReadinessSnapshot() {
    if (!this.controlPlaneReadinessService ||
        typeof this.nodeId !== TYPEOF.STRING ||
        this.nodeId.length === NUM.ZERO) {
      return null;
    }
    if (typeof this.controlPlaneReadinessService.getNodeReadiness ===
        TYPEOF.FUNCTION) {
      return this.controlPlaneReadinessService
        .getNodeReadiness(
          this.nodeId,
          {
            allowAuthoritativeRefresh: true,
            preferBackgroundRefreshOnIneligible: true,
            decisionDimension:
              CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
            maxCachedAgeMs: this.loadLaneReadinessCacheMaxAgeMs,
          },
        );
    }
    if (typeof this.controlPlaneReadinessService.getNodeReadinessSync ===
        TYPEOF.FUNCTION) {
      return this.controlPlaneReadinessService
        .getNodeReadinessSync(this.nodeId);
    }
    return null;
  }

  /**
   * Fail fast for load-lane queries when local routing/member health
   * indicates requests should be shed.
   * @param {Object} executionContext
   * @private
   */
  async assertLoadLaneQueryAdmitted(executionContext = {}) {
    if (!this.isLoadLaneExecution(executionContext)) {
      return;
    }
    const readiness = await this.resolveLoadLaneReadinessSnapshot();
    if (!readiness ||
        typeof readiness !== TYPEOF.OBJECT ||
        !readiness.dimensions ||
        typeof readiness.dimensions !== TYPEOF.OBJECT) {
      return;
    }
    const serveEligible = readiness.dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE
    ] === true;
    if (serveEligible) {
      return;
    }
    const reasonCodes = Array.isArray(readiness.reasons) ?
      readiness.reasons
        .map((reason) => String(reason?.code || '').trim())
        .filter((code) => code.length > NUM.ZERO) :
      [];
    throw createAdminOperationError(
      ErrorCode.INTERNAL_ERROR,
      'serve not ready: load lane admission denied on node ' +
        this.nodeId +
        ' (serveEligible=' + String(serveEligible) +
        ', reasons=' +
        (reasonCodes.length > NUM.ZERO ? reasonCodes.join(',') : 'none') +
        ')',
    );
  }

  /**
   * Execute one simple single-table system observation query from the local
   * cache instead of routing it back through SqlCore.
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Object|null}
   * @private
   */
  tryExecuteLocalSystemTableObservationQuery(sql, params = []) {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION ||
        typeof sql !== TYPEOF.STRING) {
      return null;
    }

    let ast;
    try {
      ast = new SQLParser(sql).parse();
    } catch (_error) {
      return null;
    }

    if (ast?.type !== AST_TYPE.SELECT ||
        !ast.from ||
        ast.from.subquery ||
        (Array.isArray(ast.joins) && ast.joins.length > NUM.ZERO) ||
        ast.distinct === true ||
        ast.groupBy ||
        ast.having ||
        ast.ctes ||
        ast.recursive === true ||
        ast.setOperation) {
      return null;
    }

    const tableName = normalizeIdentifier(ast.from.name);
    if (!tableName ||
        !ADMIN_CACHE_OBSERVATION_TABLES.has(tableName)) {
      return null;
    }

    if (this.shouldRouteSystemTableObservationThroughAuthoritativeRead(
      tableName,
    )) {
      return null;
    }

    try {
      let rows = this.systemTableCache.getAll(tableName);
      rows = Array.isArray(rows) ? rows.map((row) => ({...row})) : [];
      rows = rows.filter((row) =>
        this.evaluateLocalSystemTableObservationExpression(
          ast.where,
          row,
          params,
        ),
      );
      rows = this.sortLocalSystemTableObservationRows(
        rows,
        ast.orderBy,
        params,
      );
      rows = this.limitLocalSystemTableObservationRows(
        rows,
        ast.limit,
      );
      rows = this.projectLocalSystemTableObservationRows(
        rows,
        ast.columns,
        params,
      );
      if (rows === null) {
        return null;
      }
      return {
        success: true,
        rows,
        count: rows.length,
        partitions: this.resolveLocalSystemTableObservationPartitions(
          tableName,
          rows,
        ),
        tableName,
      };
    } catch (_error) {
      return null;
    }
  }

  /**
   * Return true when a local cache observation query should defer to the
   * canonical authoritative read path because the local shared-metadata graph
   * is internally inconsistent.
   * @param {string} tableName
   * @return {boolean}
   * @private
   */
  shouldRouteSystemTableObservationThroughAuthoritativeRead(tableName) {
    if (!tableName ||
        !this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return false;
    }

    if (!ADMIN_CACHE_OBSERVATION_TABLES.has(tableName)) {
      return false;
    }

    const nodeCoverage = evaluateSharedMetadataNodeCoverage({
      nodeRows: this.systemTableCache.getAll(TABLES.NODES),
      serviceRows: this.systemTableCache.getAll(TABLES.SERVICES),
      partitionRows: this.systemTableCache.getAll(TABLES.PARTITIONS),
      nodeEndpointRows: this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS),
    });
    return nodeCoverage.hasCoverageGap === true;
  }

  /**
   * Evaluate one cache-backed WHERE expression against one row.
   * @param {Object|null} expr
   * @param {Object} row
   * @param {Array<*>} params
   * @return {boolean}
   * @private
   */
  evaluateLocalSystemTableObservationExpression(
    expr,
    row,
    params = [],
  ) {
    if (!expr) {
      return true;
    }

    if (expr.type === EXPR_TYPE.BINARY) {
      if (expr.operator === 'AND') {
        return this.evaluateLocalSystemTableObservationExpression(
          expr.left,
          row,
          params,
        ) && this.evaluateLocalSystemTableObservationExpression(
          expr.right,
          row,
          params,
        );
      }
      if (expr.operator === 'OR') {
        return this.evaluateLocalSystemTableObservationExpression(
          expr.left,
          row,
          params,
        ) || this.evaluateLocalSystemTableObservationExpression(
          expr.right,
          row,
          params,
        );
      }

      const leftValue =
        this.resolveLocalSystemTableObservationValue(
          expr.left,
          row,
          params,
        );
      const rightValue =
        this.resolveLocalSystemTableObservationValue(
          expr.right,
          row,
          params,
        );
      const comparison =
        this.compareLocalSystemTableObservationValues(
          leftValue,
          rightValue,
        );

      switch (expr.operator) {
      case '=':
        return comparison === NUM.ZERO;
      case '<>':
        return comparison !== NUM.ZERO;
      case '>':
        return comparison > NUM.ZERO;
      case '>=':
        return comparison >= NUM.ZERO;
      case '<':
        return comparison < NUM.ZERO;
      case '<=':
        return comparison <= NUM.ZERO;
      case 'IS NULL':
        return leftValue === null || leftValue === undefined;
      case 'IS NOT NULL':
        return leftValue !== null && leftValue !== undefined;
      default:
        throw new Error(
          `Unsupported local admin cache operator: ${expr.operator}`,
        );
      }
    }

    if (expr.type === EXPR_TYPE.IN) {
      const candidate =
        this.resolveLocalSystemTableObservationValue(
          expr.expression,
          row,
          params,
        );
      const values = Array.isArray(expr.values) ? expr.values : [];
      const matched = values.some((valueExpr) => {
        const value = this.resolveLocalSystemTableObservationValue(
          valueExpr,
          row,
          params,
        );
        return this.compareLocalSystemTableObservationValues(
          candidate,
          value,
        ) === NUM.ZERO;
      });
      return expr.negated === true ? !matched : matched;
    }

    if (expr.type === EXPR_TYPE.LIKE) {
      const candidate =
        this.resolveLocalSystemTableObservationValue(
          expr.expression,
          row,
          params,
        );
      const pattern =
        this.resolveLocalSystemTableObservationValue(
          expr.pattern,
          row,
          params,
        );
      const matched = this.matchesLocalSystemTableObservationLike(
        candidate,
        pattern,
      );
      return expr.negated === true ? !matched : matched;
    }

    if (expr.type === EXPR_TYPE.UNARY &&
        expr.operator === 'NOT') {
      return !this.evaluateLocalSystemTableObservationExpression(
        expr.operand,
        row,
        params,
      );
    }

    return Boolean(
      this.resolveLocalSystemTableObservationValue(
        expr,
        row,
        params,
      ),
    );
  }

  /**
   * Resolve one supported expression value against one cache row.
   * @param {Object|null} expr
   * @param {Object} row
   * @param {Array<*>} params
   * @return {*}
   * @private
   */
  resolveLocalSystemTableObservationValue(
    expr,
    row,
    params = [],
  ) {
    if (!expr) {
      return null;
    }

    switch (expr.type) {
    case EXPR_TYPE.LITERAL:
      return expr.value;
    case EXPR_TYPE.PARAMETER:
      return params[expr.index];
    case EXPR_TYPE.COLUMN:
      return this.resolveLocalSystemTableObservationValue(
        expr.expression,
        row,
        params,
      );
    case EXPR_TYPE.COLUMN_REF: {
      const directValue = row?.[expr.column];
      if (directValue !== undefined) {
        return directValue;
      }
      const normalizedColumn =
        normalizeIdentifier(expr.column);
      if (!normalizedColumn) {
        return undefined;
      }
      for (const [key, value] of Object.entries(row || {})) {
        if (normalizeIdentifier(key) === normalizedColumn) {
          return value;
        }
      }
      return undefined;
    }
    case EXPR_TYPE.UNARY:
      if (expr.operator === '-') {
        const value = Number(
          this.resolveLocalSystemTableObservationValue(
            expr.operand,
            row,
            params,
          ),
        );
        return Number.isFinite(value) ? -value : null;
      }
      return this.resolveLocalSystemTableObservationValue(
        expr.operand,
        row,
        params,
      );
    default:
      throw new Error(
        `Unsupported local admin cache expression: ${expr.type}`,
      );
    }
  }

  /**
   * Compare two cache observation values.
   * @param {*} left
   * @param {*} right
   * @return {number}
   * @private
   */
  compareLocalSystemTableObservationValues(left, right) {
    if (left === right) {
      return NUM.ZERO;
    }
    if (left === null || left === undefined) {
      return NUM.NEGATIVE_ONE;
    }
    if (right === null || right === undefined) {
      return NUM.ONE;
    }

    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) &&
        Number.isFinite(rightNumber) &&
        String(left).trim().length > NUM.ZERO &&
        String(right).trim().length > NUM.ZERO) {
      return leftNumber - rightNumber;
    }

    return String(left).localeCompare(String(right));
  }

  /**
   * Apply column projection for one local cache query result set.
   * @param {Object[]} rows
   * @param {Object[]|null} columns
   * @param {Array<*>} params
   * @return {Object[]|null}
   * @private
   */
  projectLocalSystemTableObservationRows(
    rows,
    columns,
    params = [],
  ) {
    if (!Array.isArray(columns) ||
        columns.length === NUM.ZERO ||
        columns.some((column) => column?.type === EXPR_TYPE.STAR)) {
      return rows.map((row) => ({...row}));
    }

    const projectedRows = [];
    for (const row of rows) {
      const projected = {};
      for (const column of columns) {
        if (column?.type !== EXPR_TYPE.COLUMN ||
            column.expression?.type !== EXPR_TYPE.COLUMN_REF) {
          return null;
        }
        const key =
          typeof column.alias === TYPEOF.STRING &&
            column.alias.length > NUM.ZERO ?
            column.alias :
            column.expression.column;
        projected[key] =
          this.resolveLocalSystemTableObservationValue(
            column.expression,
            row,
            params,
          );
      }
      projectedRows.push(projected);
    }

    return projectedRows;
  }

  /**
   * Apply ORDER BY clauses for one local cache query result set.
   * @param {Object[]} rows
   * @param {Object[]|null} orderBy
   * @param {Array<*>} params
   * @return {Object[]}
   * @private
   */
  sortLocalSystemTableObservationRows(
    rows,
    orderBy,
    params = [],
  ) {
    if (!Array.isArray(orderBy) ||
        orderBy.length === NUM.ZERO) {
      return rows;
    }

    return [...rows].sort((leftRow, rightRow) => {
      for (const ordering of orderBy) {
        const leftValue =
          this.resolveLocalSystemTableObservationValue(
            ordering.expression,
            leftRow,
            params,
          );
        const rightValue =
          this.resolveLocalSystemTableObservationValue(
            ordering.expression,
            rightRow,
            params,
          );
        const comparison =
          this.compareLocalSystemTableObservationValues(
            leftValue,
            rightValue,
          );
        if (comparison !== NUM.ZERO) {
          return String(ordering.direction || 'ASC')
            .toUpperCase() === 'DESC' ?
            -comparison :
            comparison;
        }
      }
      return NUM.ZERO;
    });
  }

  /**
   * Apply LIMIT/OFFSET clauses for one local cache query result set.
   * @param {Object[]} rows
   * @param {Object|null} limit
   * @return {Object[]}
   * @private
   */
  limitLocalSystemTableObservationRows(rows, limit) {
    if (!limit || typeof limit !== TYPEOF.OBJECT) {
      return rows;
    }

    const count = Number(limit.count);
    const offset = Number(limit.offset);
    const normalizedOffset =
      Number.isFinite(offset) && offset > NUM.ZERO ?
        Math.floor(offset) :
        NUM.ZERO;
    const normalizedCount =
      Number.isFinite(count) && count >= NUM.ZERO ?
        Math.floor(count) :
        null;

    if (normalizedCount === null) {
      return rows.slice(normalizedOffset);
    }

    return rows.slice(
      normalizedOffset,
      normalizedOffset + normalizedCount,
    );
  }

  /**
   * Resolve best-effort partition ids for one local cache result.
   * @param {string} tableName
   * @param {Object[]} rows
   * @return {string[]}
   * @private
   */
  resolveLocalSystemTableObservationPartitions(
    tableName,
    rows,
  ) {
    if (tableName === TABLES.PARTITIONS) {
      return rows
        .map((row) => row?.partition_id || row?.partitionId || null)
        .filter((partitionId) =>
          typeof partitionId === TYPEOF.STRING &&
            partitionId.length > NUM.ZERO,
        );
    }

    if (tableName === TABLES.SERVICES ||
        tableName === TABLES.REPLICA_OPERATIONS) {
      return [...new Set(rows
        .map((row) => row?.partition_id || row?.partitionId || null)
        .filter((partitionId) =>
          typeof partitionId === TYPEOF.STRING &&
            partitionId.length > NUM.ZERO,
        ))];
    }

    if (typeof this.systemTableCache.filter !== TYPEOF.FUNCTION) {
      return ADMIN_CACHE_DUMP.EMPTY;
    }

    return this.systemTableCache.filter(
      TABLES.PARTITIONS,
      (row) => {
        const rowTableName =
          normalizeIdentifier(
            row?.table_name || row?.tableName || null,
          );
        const rowTableId =
          normalizeIdentifier(
            row?.table_id || row?.tableId || null,
          );
        return rowTableName === tableName ||
          rowTableId === tableName;
      },
    ).map((row) => row?.partition_id || row?.partitionId || null)
      .filter((partitionId) =>
        typeof partitionId === TYPEOF.STRING &&
          partitionId.length > NUM.ZERO,
      );
  }

  /**
   * Match one SQL LIKE pattern for local cache observation queries.
   * @param {*} value
   * @param {*} pattern
   * @return {boolean}
   * @private
   */
  matchesLocalSystemTableObservationLike(value, pattern) {
    const normalizedValue = String(value ?? EMPTY_STRING);
    const normalizedPattern = String(pattern ?? EMPTY_STRING)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/%/g, '.*')
      .replace(/_/g, '.');
    return new RegExp(`^${normalizedPattern}$`, 'i')
      .test(normalizedValue);
  }

  /**
   * Execute canonical query operation payload.
   * @param {Object} payload
   * @param {Object} executionContext
   * @return {Promise<Object>}
   * @private
   */
  async executeLocalQueryEnvelope(payload, executionContext = {}) {
    const queryId = payload?.queryId || null;
    const sql = payload?.sql;
    const params = payload?.params || [];
    const timeoutMs = resolveRequestedQueryTimeoutMs(payload?.timeoutMs);

    if (!queryId) {
      throw createAdminOperationError(
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_QUERY_ID,
        ADMIN_ERROR_HINT.MISSING_QUERY_ID,
      );
    }
    if (!sql || typeof sql !== TYPEOF.STRING) {
      throw createAdminOperationError(
        ErrorCode.SYNTAX_ERROR,
        ADMIN_ERROR_MESSAGE.MISSING_SQL,
        ADMIN_ERROR_HINT.MISSING_SQL,
      );
    }
    await this.assertLoadLaneQueryAdmitted(executionContext);
    if (this.isPreflightCriticalPathSnapshotQuery(sql)) {
      return this.buildPreflightCriticalPathSnapshotQueryResult();
    }
    const controlSnapshotQuery =
      this.parseControlSnapshotQuery(sql);
    if (controlSnapshotQuery.isQuery) {
      const observationPolicy =
        this.resolveLocalObservationExecutionPolicy(
          executionContext,
          {
            forceAuthoritativeRepair:
              controlSnapshotQuery.forceAuthoritativeRepair,
          },
        );
      return this.buildControlSnapshotQueryResult({
        forceAuthoritativeRepair:
          controlSnapshotQuery.forceAuthoritativeRepair,
        allowAuthoritativeRepair:
          observationPolicy.allowAuthoritativeRepair,
        allowAuthoritativeReadinessRefresh:
          observationPolicy.allowAuthoritativeReadinessRefresh,
        allowStaleReadinessOnCacheChange:
          observationPolicy.allowStaleReadinessOnCacheChange,
      });
    }
    const serviceDiscoveryQuery = parseServiceDiscoverySqlQuery(sql);
    if (serviceDiscoveryQuery.isQuery) {
      const observationPolicy =
        this.resolveLocalObservationExecutionPolicy(
          executionContext,
        );
      return this.serviceDiscovery
        .buildServiceDiscoveryQueryResult({
          tableName: serviceDiscoveryQuery.tableName,
          tableId: serviceDiscoveryQuery.tableId,
          allowAuthoritativeRepair:
            observationPolicy.allowAuthoritativeRepair,
        });
    }
    const localSystemTableObservation =
      this.tryExecuteLocalSystemTableObservationQuery(
        sql,
        params,
      );
    if (localSystemTableObservation) {
      return localSystemTableObservation;
    }

    const routed = guardedAdaptAdminAction(
      ADMIN_META_ACTION.EXECUTE_QUERY,
      {sql, queryParams: params},
      this.systemTableCache,
      this.resolveMutationGuardMode(),
    );
    if (!routed.success) {
      throw createAdminOperationError(
        routed.code || ErrorCode.INTERNAL_ERROR,
        routed.error || ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE,
      );
    }

    const result = await this.executeQueryWithTimeout(
      routed.sql,
      routed.params || [],
      queryId,
      timeoutMs,
    );
    if (routed.warning) {
      result.warning = routed.warning;
    }
    return result;
  }

  /**
   * Execute canonical partition-callback payload.
   * @param {Object} payload
   * @param {Object} _executionContext
   * @return {Promise<Object>}
   * @private
   */
  async executeLocalPartitionCallbackEnvelope(
    payload,
    _executionContext = {},
  ) {
    const queryId = payload?.queryId || null;
    const statement = payload?.statement;
    const parameters = payload?.parameters || [];
    const callbackModuleRef = payload?.callbackModuleRef;
    const callbackExport = payload?.callbackExport;
    const runtimeKind = payload?.runtimeKind;
    const timeoutMs = resolveRequestedQueryTimeoutMs(payload?.timeoutMs);

    if (!queryId) {
      throw createAdminOperationError(
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_QUERY_ID,
        ADMIN_ERROR_HINT.MISSING_QUERY_ID,
      );
    }
    if (!statement || typeof statement !== TYPEOF.STRING) {
      throw createAdminOperationError(
        ErrorCode.SYNTAX_ERROR,
        ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_STATEMENT,
        ADMIN_ERROR_HINT.MISSING_CALLBACK_STATEMENT,
      );
    }
    if (!callbackModuleRef || typeof callbackModuleRef !== TYPEOF.STRING) {
      throw createAdminOperationError(
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_MODULE_REF,
        ADMIN_ERROR_HINT.MISSING_CALLBACK_MODULE_REF,
      );
    }
    if (!callbackExport || typeof callbackExport !== TYPEOF.STRING) {
      throw createAdminOperationError(
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_EXPORT,
        ADMIN_ERROR_HINT.MISSING_CALLBACK_EXPORT,
      );
    }
    if (!runtimeKind || typeof runtimeKind !== TYPEOF.STRING) {
      throw createAdminOperationError(
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_CALLBACK_RUNTIME_KIND,
        ADMIN_ERROR_HINT.MISSING_CALLBACK_RUNTIME_KIND,
      );
    }

    return this.executeSqlRequestWithTimeout(
      createSqlRequest({
        statement,
        parameters,
        sessionId: queryId,
        executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
        callbackModuleRef,
        callbackExport,
        runtimeKind,
      }),
      timeoutMs === null ? undefined : timeoutMs,
    );
  }

  /**
   * Execute canonical cache-dump operation payload.
   * @return {Object}
   * @private
   */
  executeLocalCacheDumpEnvelope() {
    const routed = guardedAdaptAdminAction(
      ADMIN_META_ACTION.GET_CACHE_DUMP,
      {},
      this.systemTableCache,
      this.resolveMutationGuardMode(),
    );
    if (!routed.success) {
      throw createAdminOperationError(
        routed.code || ErrorCode.INTERNAL_ERROR,
        routed.error || ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE,
      );
    }
    return this.buildValidatedCacheDump(routed.tables);
  }

  /**
   * Handle incoming message from client.
   * @param {Object} clientInfo - Client information.
   * @param {Buffer|string} data - Message data.
   * @private
   */
  handleMessage(clientInfo, data) {
    let message;

    try {
      const messageStr = data.toString();
      message = JSON.parse(messageStr);
    } catch (_error) {
      this.sendError(clientInfo, null, ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.INVALID_JSON, ADMIN_ERROR_HINT.INVALID_JSON);
      return;
    }

    if (!message || typeof message.type !== TYPEOF.STRING) {
      this.sendError(clientInfo, null, ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_TYPE, ADMIN_ERROR_HINT.MISSING_TYPE);
      return;
    }

    this.logger.debug(ADMIN_LOG_MSG.RECEIVED_MESSAGE, {
      clientId: clientInfo.id,
      type: message.type,
    });

    switch (message.type) {
    case MessageType.QUERY:
      this.handleDispatchableAdminMessage(clientInfo, message);
      break;

    case MessageType.PARTITION_CALLBACK:
      this.handleDispatchableAdminMessage(clientInfo, message);
      break;

    case MessageType.REFRESH:
      this.handleDispatchableAdminMessage(clientInfo, message);
      break;

    case MessageType.LIVE_QUERY_SUBSCRIBE:
      this.handleLiveQuerySubscribe(clientInfo, message);
      break;

    case MessageType.LIVE_QUERY_UNSUBSCRIBE:
      this.handleLiveQueryUnsubscribe(clientInfo, message);
      break;

    default:
      // Ignore unknown message types (Requirement 32.38)
      this.logger.debug(ADMIN_LOG_MSG.UNKNOWN_MESSAGE, {
        clientId: clientInfo.id,
        type: message.type,
      });
      break;
    }
  }

  /**
   * Handle live query subscribe request.
   * Parses the LIVE SELECT SQL, registers with the server-side
   * LiveQueryManager, and bridges CDC events to the client socket.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Subscribe message.
   * @private
   */
  async handleLiveQuerySubscribe(clientInfo, message) {
    const subscriptionId = message.subscriptionId;
    const sql = message.sql;

    if (!subscriptionId) {
      this.sendError(clientInfo, null, ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.LIVE_QUERY_MISSING_SUBSCRIPTION_ID,
        ADMIN_ERROR_HINT.LIVE_QUERY_MISSING_SUBSCRIPTION_ID);
      return;
    }
    if (!sql || typeof sql !== TYPEOF.STRING) {
      this.sendError(clientInfo, null, ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.LIVE_QUERY_MISSING_SQL,
        ADMIN_ERROR_HINT.LIVE_QUERY_MISSING_SQL);
      return;
    }
    if (!this.liveQueryManager) {
      this.sendError(clientInfo, null, ErrorCode.INTERNAL_ERROR,
        ADMIN_ERROR_MESSAGE.LIVE_QUERY_MANAGER_UNAVAILABLE);
      return;
    }

    try {
      const parsed = parseLiveSelect(sql);
      const selectSql = parsed.isLive ? parsed.sql : sql;
      const parser = new SQLParser(selectSql);
      const ast = parser.parse();

      const registrationResult = {partitions: []};
      const liveClient = {
        id: clientInfo.id,
        send: (data) => {
          const payload = typeof data === TYPEOF.STRING ?
            JSON.parse(data) : data;
          const innerType = payload.type;
          this.sendToClient(clientInfo, {
            type: MessageType.LIVE_QUERY_EVENT,
            subscriptionId,
            eventType: innerType,
            data: payload.row || payload.new || payload.rows || null,
            oldData: payload.old || null,
            queryId: payload.queryId || null,
            partitions: registrationResult.partitions || [],
          });
        },
      };

      const result = await this.liveQueryManager.registerLiveQuery(
        ast, liveClient,
      );
      registrationResult.partitions = result.partitions || [];

      clientInfo.liveQueryMap.set(subscriptionId, result.queryId);

      this.sendToClient(clientInfo, {
        type: MessageType.LIVE_QUERY_EVENT,
        subscriptionId,
        queryId: result.queryId,
        partitions: result.partitions,
        expiresAt: result.expiresAt,
      });

      this.logger.info(ADMIN_LOG_MSG.LIVE_QUERY_SUBSCRIBED, {
        clientId: clientInfo.id,
        subscriptionId,
        queryId: result.queryId,
      });
    } catch (error) {
      this.logger.error(ADMIN_LOG_MSG.LIVE_QUERY_SUBSCRIBE_FAILED, {
        clientId: clientInfo.id,
        subscriptionId,
        error: error.message,
      });
      this.sendError(clientInfo, null, ErrorCode.INTERNAL_ERROR,
        `${ADMIN_ERROR_MESSAGE.LIVE_QUERY_PARSE_FAILED}: ${error.message}`);
    }
  }

  /**
   * Handle live query unsubscribe request.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Unsubscribe message.
   * @private
   */
  handleLiveQueryUnsubscribe(clientInfo, message) {
    const subscriptionId = message.subscriptionId;
    if (!subscriptionId) {
      return;
    }

    const queryId = clientInfo.liveQueryMap.get(subscriptionId);
    if (queryId && this.liveQueryManager) {
      this.liveQueryManager.unregisterLiveQuery(queryId, clientInfo.id);
      clientInfo.liveQueryMap.delete(subscriptionId);

      this.logger.info(ADMIN_LOG_MSG.LIVE_QUERY_UNSUBSCRIBED, {
        clientId: clientInfo.id,
        subscriptionId,
        queryId,
      });
    }
  }

  /**
   * Handle one dispatchable admin message by first translating to
   * canonical Service_Message envelope.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Admin websocket message.
   * @return {Promise<void>}
   * @private
   */
  async handleDispatchableAdminMessage(clientInfo, message) {
    if (!isAdminMessageDispatchable(message.type)) {
      return;
    }

    const envelope = adaptAdminMessageToServiceMessage(message, {
      clientId: clientInfo.id,
      lane: this.resolveAdminClientLane(clientInfo?.lane),
      tenantId: message.tenantId || null,
      principal: message.principal || null,
      traceId: message.traceId || null,
    });
    await this.handleServiceDispatchEnvelope(clientInfo, message, envelope);
  }

  /**
   * Handle dispatchable admin messages through ServiceDispatcher.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Admin websocket message.
   * @private
   */
  async handleServiceDispatchMessage(clientInfo, message) {
    const envelope = adaptAdminMessageToServiceMessage(message, {
      clientId: clientInfo.id,
      lane: this.resolveAdminClientLane(clientInfo?.lane),
      tenantId: message.tenantId || null,
      principal: message.principal || null,
      traceId: message.traceId || null,
    });
    return this.handleServiceDispatchEnvelope(clientInfo, message, envelope);
  }

  /**
   * Dispatch one canonical envelope through the shared service dispatcher.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Original admin websocket message.
   * @param {Object} envelope - Canonical service-message envelope.
   * @return {Promise<void>}
   * @private
   */
  async handleServiceDispatchEnvelope(clientInfo, message, envelope) {
    const queryId = message.queryId || message.messageId || null;

    try {
      const dispatchResult = await this.serviceDispatcher.dispatch(
        envelope,
        {
          clientInfo,
          nodeId: this.nodeId,
          traceId: envelope.traceId || null,
          tenantId: envelope.tenantId || null,
          principal: envelope.principal || null,
        },
      );

      const deliveryPayload = dispatchResult.delivery?.payload || {};
      const operation = dispatchResult.envelope.operation;

      if (operation === ADMIN_SERVICE_OPERATION.GET_CACHE_DUMP) {
        const cacheDump = deliveryPayload.cacheDump || deliveryPayload.data || null;
        if (!cacheDump || typeof cacheDump !== TYPEOF.OBJECT) {
          throw new Error(ADMIN_ERROR_MESSAGE.SYSTEM_CACHE_EMPTY);
        }
        this.sendCacheDumpPayload(clientInfo, cacheDump);
        return;
      }

      if (deliveryPayload.queryResult &&
        typeof deliveryPayload.queryResult === TYPEOF.OBJECT) {
        this.sendQueryResult(
          clientInfo,
          queryId || envelope.messageId,
          deliveryPayload.queryResult,
        );
        return;
      }

      const deliveryResults = Array.isArray(deliveryPayload.results) ?
        deliveryPayload.results :
        [];
      this.sendQueryResult(clientInfo, queryId || envelope.messageId, {
        operation,
        results: deliveryResults,
        count: deliveryResults.length,
      });
    } catch (error) {
      const errorCode = this.getErrorCode(error);
      this.sendError(clientInfo, queryId, errorCode, error.message, error.adminHint);
    }
  }

  /**
   * Resolve unified lifecycle diagnostics report payload.
   * @return {Object|null}
   * @private
   */
  resolveServiceDiagnosticsReport() {
    if (!this.serviceDiagnosticsProvider ||
      typeof this.serviceDiagnosticsProvider !== TYPEOF.FUNCTION) {
      return null;
    }

    const report = this.serviceDiagnosticsProvider();
    if (!report || typeof report !== TYPEOF.OBJECT) {
      return null;
    }
    return report;
  }

  /**
   * Handle lifecycle/reconciler diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleServiceDiagnostics(reply) {
    const report = this.resolveServiceDiagnosticsReport();
    if (!report) {
      reply
        .code(HTTP_STATUS.SERVICE_UNAVAILABLE)
        .send({error: ADMIN_ERROR_MESSAGE.SERVICE_DIAGNOSTICS_UNAVAILABLE});
      return;
    }

    reply.code(HTTP_STATUS.OK).send({
      nodeId: this.nodeId,
      timestamp: Date.now(),
      diagnostics: report,
    });
  }

  /**
   * Handle local CDC diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleCdcDiagnostics(reply) {
    try {
      const diagnostics = this.buildLocalCdcDiagnostics();
      reply.code(HTTP_STATUS.OK).send(diagnostics);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  }

  /**
   * Handle local partition diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handlePartitionDiagnostics(reply) {
    try {
      const diagnostics = this.buildLocalPartitionDiagnostics();
      reply.code(HTTP_STATUS.OK).send(diagnostics);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  }

  /**
   * Handle local SQL diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleSqlDiagnostics(reply) {
    try {
      const diagnostics = this.buildLocalSqlDiagnostics();
      reply.code(HTTP_STATUS.OK).send(diagnostics);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  }

  /**
   * Handle preflight critical-path snapshot diagnostics route.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handlePreflightCriticalPathSnapshot(reply) {
    try {
      const snapshot = await this.resolvePreflightCriticalPathSnapshot();
      reply.code(HTTP_STATUS.OK).send(snapshot);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  }

  /**
   * Handle local control snapshot route.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleControlSnapshot(request, reply) {
    const scope = String(
      request?.query?.[ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_KEY] ||
      ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_LOCAL,
    )
      .trim()
      .toLowerCase();
    if (scope !== ADMIN_CONTROL_SNAPSHOT.QUERY_SCOPE_LOCAL) {
      reply.code(HTTP_STATUS.BAD_REQUEST).send({
        error: ADMIN_ERROR_MESSAGE.CONTROL_SNAPSHOT_SCOPE_UNSUPPORTED,
      });
      return;
    }
    try {
      const snapshot = await this.buildLocalControlSnapshot();
      reply.code(HTTP_STATUS.OK).send(snapshot);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  }

  /**
   * Handle local service-discovery route.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleServiceDiscovery(request, reply) {
    const protocolAllowlist = parseDiscoveryListQuery(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_PROTOCOL_KEY],
    );
    const serviceIdAllowlist = parseDiscoveryListQuery(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_SERVICE_ID_KEY],
    );
    const nodeIdAllowlist = parseDiscoveryListQuery(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_NODE_ID_KEY],
    );
    const healthyOnly = parseDiscoveryBooleanQuery(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_HEALTHY_ONLY_KEY],
      false,
    );
    const unhealthyPolicyRaw =
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_UNHEALTHY_POLICY_KEY];
    const unhealthyPolicy =
      String(unhealthyPolicyRaw || ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY)
        .trim()
        .toLowerCase();
    const tableName = normalizeIdentifier(
      request?.query?.[ADMIN_SERVICE_DISCOVERY.QUERY_TABLE_NAME_KEY],
    );
    const resolvedUnhealthyPolicy =
      unhealthyPolicy === ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE ?
        ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE :
        ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY;

    try {
      const snapshot = await this.serviceDiscovery
        .resolveServiceDiscoverySnapshot({
          protocolAllowlist,
          serviceIdAllowlist,
          nodeIdAllowlist,
          tableName,
          healthyOnly,
          unhealthyPolicy: resolvedUnhealthyPolicy,
        });
      reply.code(HTTP_STATUS.OK).send(snapshot);
    } catch (error) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: error.message,
      });
    }
  }

  /**
   * Determine whether one SQL statement requests preflight critical path snapshot.
   * @param {string} sql
   * @return {boolean}
   * @private
   */
  isPreflightCriticalPathSnapshotQuery(sql) {
    return normalizeSql(sql) ===
      normalizeSql(ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.QUERY_SQL);
  }

  /**
   * Determine whether one SQL statement requests local control snapshot.
   * @param {string} sql
   * @return {boolean}
   * @private
   */
  isControlSnapshotQuery(sql) {
    return this.parseControlSnapshotQuery(sql).isQuery;
  }

  /**
   * Parse one local control snapshot SQL query.
   * @param {string} sql
   * @return {Object}
   * @private
   */
  parseControlSnapshotQuery(sql) {
    const normalizedSql = normalizeSql(sql);
    if (normalizedSql ===
      normalizeSql(ADMIN_CONTROL_SNAPSHOT.QUERY_SQL)) {
      return {
        isQuery: true,
        forceAuthoritativeRepair: false,
      };
    }
    if (normalizedSql ===
      normalizeSql(ADMIN_CONTROL_SNAPSHOT.QUERY_SQL_FORCE_REPAIR)) {
      return {
        isQuery: true,
        forceAuthoritativeRepair: true,
      };
    }
    return {
      isQuery: false,
      forceAuthoritativeRepair: false,
    };
  }

  /**
   * Determine whether one SQL statement requests local service discovery.
   * @param {string} sql
   * @return {boolean}
   * @private
   */
  isServiceDiscoveryQuery(sql) {
    return parseServiceDiscoverySqlQuery(sql).isQuery;
  }

  /**
   * Delegate: build service discovery query result.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async buildServiceDiscoveryQueryResult(options = {}) {
    return this.serviceDiscovery
      .buildServiceDiscoveryQueryResult(options);
  }

  /**
   * Delegate: resolve service discovery snapshot.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async resolveServiceDiscoverySnapshot(options = {}) {
    return this.serviceDiscovery
      .resolveServiceDiscoverySnapshot(options);
  }

  /**
   * Delegate: build service discovery replica readiness.
   * @param {Object} replica
   * @param {Object} readinessContext
   * @return {Object}
   */
  buildServiceDiscoveryReplicaReadiness(replica, readinessContext) {
    return this.serviceDiscovery
      .buildServiceDiscoveryReplicaReadiness(
        replica, readinessContext,
      );
  }


  /**
   * Delegate: build local preflight critical-path snapshot.
   * @return {Promise<Object>}
   */
  async buildLocalPreflightCriticalPathSnapshot() {
    return this.preflightSnapshot
      .buildLocalPreflightCriticalPathSnapshot();
  }

  /**
   * Delegate: resolve preflight critical-path snapshot.
   * @return {Promise<Object>}
   */
  async resolvePreflightCriticalPathSnapshot() {
    return this.preflightSnapshot
      .resolvePreflightCriticalPathSnapshot();
  }

  /**
   * Delegate: build preflight critical-path snapshot query result.
   * @return {Promise<Object>}
   */
  async buildPreflightCriticalPathSnapshotQueryResult() {
    return this.preflightSnapshot
      .buildPreflightCriticalPathSnapshotQueryResult();
  }

  /**
   * Delegate: build preflight cache freshness summary.
   * @param {Object} options
   * @return {Object}
   */
  buildPreflightCacheFreshnessSummary(options) {
    return this.preflightSnapshot
      .buildPreflightCacheFreshnessSummary(options);
  }

  /**
   * Delegate: build local control snapshot.
   * @return {Promise<Object>}
   */
  async buildLocalControlSnapshot() {
    if (typeof this.controlSnapshot.resolveLocalControlSnapshot ===
      TYPEOF.FUNCTION) {
      return this.controlSnapshot.resolveLocalControlSnapshot();
    }
    return this.controlSnapshot.buildLocalControlSnapshot();
  }

  /**
   * Delegate: build control snapshot leader summary.
   * @param {Array<Object>} partitionRows
   * @param {Array<Object>} serviceRows
   * @return {Object}
   */
  buildControlSnapshotLeaderSummary(
    partitionRows = [], serviceRows = [],
  ) {
    return this.controlSnapshot
      .buildControlSnapshotLeaderSummary(
        partitionRows, serviceRows,
      );
  }

  /**
   * Delegate: build control snapshot voter counts.
   * @param {Array<Object>} serviceRows
   * @return {Object}
   */
  buildControlSnapshotVoterCounts(serviceRows = []) {
    return this.controlSnapshot
      .buildControlSnapshotVoterCounts(serviceRows);
  }

  /**
   * Delegate: build control snapshot replica operation summary.
   * @param {Array<Object>} replicaOperationRows
   * @param {Object} [options={}]
   * @return {Object}
   */
  buildControlSnapshotReplicaOperationSummary(
    replicaOperationRows = [], options = {},
  ) {
    return this.controlSnapshot
      .buildControlSnapshotReplicaOperationSummary(
        replicaOperationRows, options,
      );
  }

  /**
   * Delegate: build local CDC telemetry.
   * @return {Object}
   */
  buildLocalCdcTelemetry() {
    return this.controlSnapshot.buildLocalCdcTelemetry();
  }

  /**
   * Delegate: build local CDC diagnostics.
   * @return {Object}
   */
  buildLocalCdcDiagnostics() {
    return this.controlSnapshot
      .buildLocalCdcDiagnostics();
  }

  /**
   * Delegate: build local partition diagnostics.
   * @return {Object}
   */
  buildLocalPartitionDiagnostics() {
    return this.controlSnapshot
      .buildLocalPartitionDiagnostics();
  }

  /**
   * Delegate: build local SQL diagnostics.
   * @return {Object}
   */
  buildLocalSqlDiagnostics() {
    return this.controlSnapshot
      .buildLocalSqlDiagnostics();
  }

  /**
   * Delegate: build control snapshot query result.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async buildControlSnapshotQueryResult(options = {}) {
    return this.controlSnapshot
      .buildControlSnapshotQueryResult(options);
  }

  /**
   * Handle query message.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Query message.
   * @private
   */
  async handleQueryMessage(clientInfo, message) {
    const queryId = message.queryId || null;
    const payload = {
      queryId,
      sql: message.sql,
      params: message.params || [],
      timeoutMs: resolveRequestedQueryTimeoutMs(message.timeoutMs),
    };

    this.logger.debug(ADMIN_LOG_MSG.EXECUTING_QUERY, {
      clientId: clientInfo.id,
      queryId,
      sql: typeof payload.sql === TYPEOF.STRING ?
        payload.sql.substring(NUM.ZERO, ADMIN_LIMIT.SQL_PREVIEW_LENGTH) :
        null,
    });

    try {
      const result = await this.executeLocalQueryEnvelope(payload);
      this.sendQueryResult(clientInfo, queryId, result);
    } catch (error) {
      const errorCode = this.getErrorCode(error);
      this.sendError(clientInfo, queryId, errorCode, error.message, error.adminHint);
    }
  }

  /**
   * Handle partition callback execution message.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Callback message.
   * @private
   */
  async handlePartitionCallbackMessage(clientInfo, message) {
    const queryId = message.queryId || null;
    const payload = {
      queryId,
      statement: message.statement || message.sql,
      parameters: message.parameters || message.params || [],
      callbackModuleRef: message.callbackModuleRef,
      callbackExport: message.callbackExport,
      runtimeKind: message.runtimeKind,
      timeoutMs: resolveRequestedQueryTimeoutMs(message.timeoutMs),
    };

    this.logger.debug(ADMIN_LOG_MSG.EXECUTING_QUERY, {
      clientId: clientInfo.id,
      queryId,
      sql: typeof payload.statement === TYPEOF.STRING ?
        payload.statement.substring(NUM.ZERO, ADMIN_LIMIT.SQL_PREVIEW_LENGTH) :
        null,
      executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
      callbackModuleRef: payload.callbackModuleRef,
      callbackExport: payload.callbackExport,
      runtimeKind: payload.runtimeKind,
    });

    try {
      const result = await this.executeLocalPartitionCallbackEnvelope(payload);
      this.sendQueryResult(clientInfo, queryId, result);
    } catch (error) {
      const errorCode = this.getErrorCode(error);
      this.sendError(clientInfo, queryId, errorCode, error.message, error.adminHint);
    }
  }

  /**
   * Execute query with timeout.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {string} queryId - Query ID.
   * @param {number|null} [timeoutMs] - Optional timeout override.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeQueryWithTimeout(sql, params, queryId, timeoutMs = null) {
    const requestedTimeoutMs = resolveRequestedQueryTimeoutMs(timeoutMs);
    return this.executeSqlRequestWithTimeout(
      createSqlRequest({
        statement: sql,
        parameters: params,
        sessionId: queryId,
        executionMode: EXECUTION_MODE.SQL_STATEMENT,
      }),
      requestedTimeoutMs === null ? undefined : requestedTimeoutMs,
    );
  }

  /**
   * Execute canonical SQL request with timeout.
   * @param {Object} sqlRequest - Canonical SqlRequest.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSqlRequestWithTimeout(sqlRequest, timeoutMs = this.queryTimeoutMs) {
    if (!this.sqlQueryEngine ||
        typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION) {
      throw new Error(ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE);
    }

    const timeoutBudget = createTimeoutBudget({
      configuredBudgetMs: timeoutMs,
      now: this.nowFn,
    });
    const cancellationToken =
      sqlRequest?.cancellationToken ||
      new CancellationToken();
    const requestWithControl = {
      ...sqlRequest,
      timeoutMs,
      cancellationToken,
    };
    let timeoutId;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          cancellationToken.cancel(
            ADMIN_ERROR_MESSAGE.queryTimeout(timeoutMs),
          );
          reject(createTimeoutBudgetError({
            message: ADMIN_ERROR_MESSAGE.queryTimeout(timeoutMs),
            budget: timeoutBudget,
            classification: TIMEOUT_BUDGET_CLASSIFICATION.QUERY_TIMEOUT,
            nestedOperation: 'admin_sql_query',
            now: this.nowFn,
          }));
        }, timeoutMs);
      });

      const queryPromise = this.sqlQueryEngine.executeRequest(requestWithControl);

      return await Promise.race([queryPromise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Resolve guard mode for adapter routing based on enforcement mode.
   * @return {string} MUTATION_GUARD_MODE value.
   * @private
   */
  resolveMutationGuardMode() {
    if (this.enforcementMode === ADMIN_ENFORCEMENT_MODE.ENFORCE) {
      return MUTATION_GUARD_MODE.REJECT;
    }
    return MUTATION_GUARD_MODE.WARN;
  }

  /**
   * Send query result to client.
   * @param {Object} clientInfo - Client information.
   * @param {string} queryId - Query ID.
   * @param {Object} result - Query result.
   * @private
   */
  sendQueryResult(clientInfo, queryId, result) {
    const message = {
      type: MessageType.QUERY_RESULT,
      queryId,
      timestamp: Date.now(),
    };
    const operation = typeof result?.operation === TYPEOF.STRING ?
      result.operation.trim().toLowerCase() :
      EMPTY_STRING;
    const isWriteOperation = operation === 'insert' ||
      operation === 'update' ||
      operation === 'delete';
    const hasAffectedRows = Number.isFinite(Number(result?.affectedRows));
    const hasRowPayload = result.rows !== undefined ||
      result.results !== undefined;

    if (result.success === false) {
      message.error = result.error;
      message.errorCode = result.errorCode || ErrorCode.INTERNAL_ERROR;
      if (result.hint) {
        message.hint = result.hint;
      }
    } else if (result.hostResult ||
      result.executionMode === EXECUTION_MODE.PARTITION_CALLBACK) {
      message.operation = EXECUTION_MODE.PARTITION_CALLBACK;
      message.results = Array.isArray(result.results) ?
        result.results : ADMIN_CACHE_DUMP.EMPTY;
      message.hostResult = result.hostResult || null;
      message.callbackModuleRef = result.callbackModuleRef || null;
      message.callbackExport = result.callbackExport || null;
    } else if (isWriteOperation || hasAffectedRows) {
      message.operation = result.operation || null;
      const parsedAffectedRows = Number(result.affectedRows);
      message.affectedRows = Number.isFinite(parsedAffectedRows) ?
        parsedAffectedRows :
        ADMIN_QUERY_RESULT.AFFECTED_ROWS_DEFAULT;
      message.partitions = result.partitions || ADMIN_CACHE_DUMP.EMPTY;
      message.tableName = result.tableName || null;
      if (hasRowPayload) {
        message.results = result.rows || result.results || ADMIN_CACHE_DUMP.EMPTY;
        message.count = message.results.length;
      }
    } else if (hasRowPayload) {
      // SELECT query result - handle both 'rows' and 'results' field names
      message.results = result.rows || result.results || ADMIN_CACHE_DUMP.EMPTY;
      message.count = result.count !== undefined ?
        result.count : message.results.length;
      message.partitions = result.partitions || ADMIN_CACHE_DUMP.EMPTY;
      message.tableName = result.tableName || null;
    } else {
      // Write operation result (INSERT, UPDATE, DELETE)
      message.operation = result.operation;
      message.affectedRows = result.affectedRows || ADMIN_QUERY_RESULT.AFFECTED_ROWS_DEFAULT;
      message.partitions = result.partitions || ADMIN_CACHE_DUMP.EMPTY;
      message.tableName = result.tableName || null;
    }

    if (result.warning) {
      message.warning = result.warning;
    }

    this.sendToClient(clientInfo, message);

    this.logger.debug(ADMIN_LOG_MSG.QUERY_RESULT_SENT, {
      clientId: clientInfo.id,
      queryId,
      success: result.success !== false,
    });
  }

  /**
   * Handle refresh message (request new cache dump).
   * @param {Object} clientInfo - Client information.
   * @param {Object} _message - Refresh message.
   * @private
   */
  handleRefreshMessage(clientInfo, _message) {
    this.logger.debug(ADMIN_LOG_MSG.REFRESH_REQUESTED, {
      clientId: clientInfo.id,
    });

    try {
      this.sendCacheDumpPayload(clientInfo, this.executeLocalCacheDumpEnvelope());
    } catch (error) {
      const errorCode = this.getErrorCode(error);
      this.sendError(clientInfo, null, errorCode, error.message, error.adminHint);
    }
  }

  /**
   * Send error to client.
   * @param {Object} clientInfo - Client information.
   * @param {string|null} queryId - Query ID (if applicable).
   * @param {string} errorCode - Error code.
   * @param {string} errorMessage - Error message.
   * @param {string} hint - Optional hint for resolution.
   * @private
   */
  sendError(clientInfo, queryId, errorCode, errorMessage, hint) {
    const message = {
      type: queryId ? MessageType.QUERY_RESULT : MessageType.ERROR,
      timestamp: Date.now(),
      error: errorMessage,
      errorCode,
    };

    if (queryId) {
      message.queryId = queryId;
    }

    if (hint) {
      message.hint = hint;
    }

    this.sendToClient(clientInfo, message);
  }

  /**
   * Send message to a specific client.
   * @param {Object} clientInfo - Client information.
   * @param {Object} message - Message to send.
   * @private
   */
  sendToClient(clientInfo, message) {
    try {
      const json = JSON.stringify(message);
      clientInfo.socket.send(json);
    } catch (error) {
      this.logger.error(ADMIN_LOG_MSG.SEND_FAILED, {
        clientId: clientInfo.id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Broadcast CDC event to all connected clients.
   * @param {string} tableName - Table name.
   * @param {string} operation - CDC operation (insert, update, delete).
   * @param {Object} record - Record data.
   */
  broadcastCDCEvent(tableName, operation, record) {
    const message = {
      type: MessageType.CDC_EVENT,
      timestamp: Date.now(),
      table: tableName,
      operation: operation.toLowerCase(),
      record,
    };

    for (const clientInfo of this.clients) {
      this.sendToClient(clientInfo, message);
    }
  }

  /**
   * Get error code from error.
   * @param {Error} error - Error object.
   * @return {string} Error code.
   * @private
   */
  getErrorCode(error) {
    if (error && typeof error.adminErrorCode === TYPEOF.STRING) {
      return error.adminErrorCode;
    }
    const message = error.message.toLowerCase();

    if (message.includes(ADMIN_ERROR_MATCH.PARSE) ||
        message.includes(ADMIN_ERROR_MATCH.SYNTAX)) {
      return ErrorCode.SYNTAX_ERROR;
    }
    if (message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND) ||
        message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND_CODE)) {
      return ErrorCode.TABLE_NOT_FOUND;
    }
    if (message.includes(ADMIN_ERROR_MATCH.TIMEOUT)) {
      return ErrorCode.TIMEOUT;
    }

    return ErrorCode.INTERNAL_ERROR;
  }

  /**
   * Set the system table cache.
   * @param {Object} cache - System table cache.
   */
  setSystemTableCache(cache) {
    this.systemTableCache = cache;
    // Subscribe to cache notifications when cache is set (Requirement 2.2)
    this.subscribeToCacheNotifications();
  }

  /**
   * Set the SQL query engine.
   * @param {Object} engine - SQL query engine.
   */
  setSQLQueryEngine(engine) {
    this.sqlQueryEngine = engine;
    if (this.debugMetadataStore &&
      typeof this.debugMetadataStore.setSqlQueryEngine === TYPEOF.FUNCTION) {
      this.debugMetadataStore.setSqlQueryEngine(engine);
      return;
    }
    if (!this.debugMetadataStore && engine) {
      this.debugMetadataStore = new DebugMetadataStore({
        sqlQueryEngine: engine,
      });
      this.debugHandlers.debugMetadataStore =
        this.debugMetadataStore;
    }
  }

  /**
   * Get the number of connected clients.
   * @return {number} Number of connected clients.
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Get the Fastify instance.
   * @return {Object} Fastify instance.
   */
  getFastify() {
    return this.fastify;
  }

  /**
   * Check if the API is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Returns whether the API is bound to a TCP port.
   * @return {boolean}
   */
  isListening() {
    return this.listening;
  }

  /**
   * Shutdown the WebSocket server.
   * @return {Promise<void>}
   */
  async shutdown() {
    // Close all client connections
    for (const clientInfo of this.clients) {
      try {
        clientInfo.socket.close();
      } catch (_closeErr) {
        // Ignore close errors during shutdown
      }
    }
    this.clients.clear();

    if (this.fastify) {
      const server = this.fastify.server;
      // Close all active connections immediately
      if (server && typeof server.closeAllConnections === TYPEOF.FUNCTION) {
        server.closeAllConnections();
      }
      await this.fastify.close();
      // Ensure underlying HTTP server is fully closed
      if (server && typeof server.close === TYPEOF.FUNCTION) {
        await new Promise((resolve) => {
          server.close((error) => {
            if (error && error.code !== ERRNO.NOT_RUNNING) {
              this.logger.warn(ADMIN_LOG_MSG.SERVER_CLOSE_ERROR, {
                error: error.message,
              });
            }
            resolve();
          });
        });
      }
      // Unref the server to allow process exit
      if (server && typeof server.unref === TYPEOF.FUNCTION) {
        server.unref();
      }
      this.fastify = null;
    }

    this.initialized = false;

    this.logger.info(ADMIN_LOG_MSG.SHUTDOWN, {
      nodeId: this.nodeId,
    });
  }
}

export {AdminWebSocketAPI, MessageType, ErrorCode};
