/**
 * Admin WebSocket API — node-local compatibility adapter.
 *
 * This class is a THIN ROUTING ADAPTER on fixed port 8081.
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
import {ERRNO, NUM, TABLES, TYPEOF} from '../constants/index.js';
import {TRANSPORT_EVENT} from '../constants/transport.js';
import {createSqlRequest} from '../query/sql-request.js';
import {EXECUTION_MODE} from '../query/sql-adapter-constants.js';
import {guardedAdaptAdminAction} from './admin-api-adapter.js';
import {
  ADMIN_META_ACTION,
  CACHE_DUMP_TABLES,
} from './admin-meta-command-handlers.js';
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
  DEBUG_METADATA_ERROR_CODE as DEBUG_METADATA_CODE,
  DEBUG_METADATA_ERROR_MSG as DEBUG_METADATA_ERR,
} from '../debug-runtime/debug-metadata-service-constants.js';
import {
  DEBUG_SESSION_STATUS as DEBUG_METADATA_SESSION_STATUS,
} from '../debug-runtime/debug-metadata-constants.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CLIENT,
  ADMIN_CONTENT_TYPE,
  ADMIN_CONFIG_KEY,
  ADMIN_DEBUG_ERROR_MSG,
  ADMIN_DEFAULT,
  ADMIN_ENFORCEMENT_MODE,
  ADMIN_ERROR_CODE,
  ADMIN_ERROR_HINT,
  ADMIN_ERROR_MATCH,
  ADMIN_ERROR_MESSAGE,
  ADMIN_HEADER,
  ADMIN_LIMIT,
  ADMIN_LOG_MSG,
  ADMIN_MESSAGE_TYPE,
  ADMIN_QUERY_RESULT,
  ADMIN_ROUTE,
  ADMIN_STATUS,
  ADMIN_SUBSYSTEM,
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_STREAM_EVENT,
} from './admin-constants.js';

const MessageType = ADMIN_MESSAGE_TYPE;
const ErrorCode = ADMIN_ERROR_CODE;
const HTTP_STATUS = Object.freeze({
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
});
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
const SSE_FRAME_PREFIX = 'data: ';
const SSE_FRAME_SUFFIX = '\n\n';
const EMPTY_STRING = '';
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
 * AdminWebSocketAPI — node-local compatibility adapter for
 * administrative SQL/cache operations on fixed port 8081.
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
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {string} options.nodeId - Node ID.
   * @param {boolean} [options.enableAdminStream] - Enable legacy admin stream.
   */
  constructor(options = {}) {
    this.systemTableCache = options.systemTableCache || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.nodeId = options.nodeId || ADMIN_DEFAULT.NODE_ID;
    this.enforcementMode = options.enforcementMode ||
      ADMIN_DEFAULT.ENFORCEMENT_MODE;
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
    } catch {
      // Logging not available
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
      return this.handleCreateDebugSession(request, reply);
    });
    this.fastify.get(ADMIN_ROUTE.DEBUG_SESSION_BY_ID, async (request, reply) => {
      return this.handleGetDebugSession(request, reply);
    });
    this.fastify.patch(ADMIN_ROUTE.DEBUG_SESSION_BY_ID, async (request, reply) => {
      return this.handleUpdateDebugSession(request, reply);
    });
    this.fastify.post(ADMIN_ROUTE.DEBUG_SESSION_ATTACH, async (request, reply) => {
      return this.handleAttachDebugSession(request, reply);
    });
    this.fastify.post(
      ADMIN_ROUTE.DEBUG_SESSION_BREAKPOINTS,
      async (request, reply) => {
        return this.handleWriteDebugBreakpoints(request, reply);
      },
    );
    this.fastify.get(
      ADMIN_ROUTE.DEBUG_SESSION_BREAKPOINTS,
      async (request, reply) => {
        return this.handleListDebugBreakpoints(request, reply);
      },
    );
    this.fastify.post(
      ADMIN_ROUTE.DEBUG_SESSION_SNAPSHOTS,
      async (request, reply) => {
        return this.handleWriteDebugSnapshot(request, reply);
      },
    );
    this.fastify.get(
      ADMIN_ROUTE.DEBUG_SESSION_SNAPSHOTS,
      async (request, reply) => {
        return this.handleListDebugSnapshots(request, reply);
      },
    );
    this.fastify.get(ADMIN_ROUTE.DEBUG_SNAPSHOT_BY_ID, async (request, reply) => {
      return this.handleGetDebugSnapshot(request, reply);
    });
    this.fastify.post(ADMIN_ROUTE.DEBUG_DAP_REQUEST, async (request, reply) => {
      return this.handleDebugDapRequest(request, reply);
    });

    this.fastify.get(ADMIN_ROUTE.PLAYBACK_VIEWER, async (_request, reply) => {
      return this.handlePlaybackViewerPage(reply);
    });
    this.fastify.get(ADMIN_ROUTE.OUTPUT_FILES, async (request, reply) => {
      return this.handleOutputFile(request, reply);
    });

    if (this.enableAdminStream) {
      // WebSocket endpoint for admin stream
      // Note: @fastify/websocket passes socket directly in newer versions
      this.fastify.register(async (fastify) => {
        fastify.get(ADMIN_ROUTE.STREAM, {websocket: true}, (socket, _req) => {
          this.handleConnection(socket);
        });
        fastify.get(
          ADMIN_ROUTE.DEBUG_TRACE_STREAM,
          {websocket: true},
          (socket, request) => {
            this.handleDebugTraceConnection(socket, request);
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
        .code(HTTP_STATUS.INTERNAL_ERROR)
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
        .code(HTTP_STATUS.INTERNAL_ERROR)
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
      } catch {
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
   * Create debug session metadata.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleCreateDebugSession(request, reply) {
    const securityContext = this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const session = await store.createSession({
        securityContext,
        ...(request.body || {}),
      });
      reply.code(HTTP_STATUS.OK).send({session});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Get one debug session by ID.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleGetDebugSession(request, reply) {
    const securityContext = this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const session = await store.getSession({
        securityContext,
        sessionId: request.params.sessionId,
      });
      if (!session) {
        reply.code(HTTP_STATUS.NOT_FOUND).send({
          error: DEBUG_METADATA_ERR.SESSION_NOT_FOUND,
        });
        return;
      }
      reply.code(HTTP_STATUS.OK).send({session});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Update or detach an existing debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleUpdateDebugSession(request, reply) {
    const securityContext = this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    const body = request.body || {};
    const isDetachRequest = body.detach === true ||
      body.status === DEBUG_METADATA_SESSION_STATUS.DETACHED;

    try {
      const session = isDetachRequest ?
        await store.detachSession({
          securityContext,
          sessionId: request.params.sessionId,
          ...body,
        }) :
        await store.updateSession({
          securityContext,
          sessionId: request.params.sessionId,
          ...body,
        });
      reply.code(HTTP_STATUS.OK).send({session});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Attach a debugger to an existing session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleAttachDebugSession(request, reply) {
    const securityContext = this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const session = await store.attachSession({
        securityContext,
        sessionId: request.params.sessionId,
      });
      reply.code(HTTP_STATUS.OK).send({session});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Persist breakpoints for a debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleWriteDebugBreakpoints(request, reply) {
    const securityContext = this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const breakpoints = await store.writeBreakpoints({
        securityContext,
        sessionId: request.params.sessionId,
        ...(request.body || {}),
      });
      reply.code(HTTP_STATUS.OK).send({breakpoints});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * List breakpoints for a debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleListDebugBreakpoints(request, reply) {
    const securityContext = this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const breakpoints = await store.listBreakpoints({
        securityContext,
        sessionId: request.params.sessionId,
        limit: parseRequestLimit(request.query?.limit),
      });
      reply.code(HTTP_STATUS.OK).send({breakpoints});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Persist one snapshot artifact for a debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleWriteDebugSnapshot(request, reply) {
    const securityContext = this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const snapshot = await store.writeSnapshot({
        securityContext,
        sessionId: request.params.sessionId,
        ...(request.body || {}),
      });
      reply.code(HTTP_STATUS.OK).send({
        snapshot: normalizeSnapshotApiPayload(snapshot),
      });
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * List snapshots for a debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleListDebugSnapshots(request, reply) {
    const securityContext = this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const snapshots = await store.listSnapshots({
        securityContext,
        sessionId: request.params.sessionId,
        limit: parseRequestLimit(request.query?.limit),
      });
      reply.code(HTTP_STATUS.OK).send({
        snapshots: snapshots.map((snapshot) =>
          normalizeSnapshotApiPayload(snapshot),
        ),
      });
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Fetch one snapshot by snapshotId.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleGetDebugSnapshot(request, reply) {
    const securityContext = this.resolveDebugSecurityContext(request, reply);
    const store = this.requireDebugMetadataStore(reply);
    if (!securityContext || !store) {
      return;
    }

    try {
      const snapshot = await store.getSnapshot({
        securityContext,
        snapshotId: request.params.snapshotId,
        sessionId: request.query?.sessionId || null,
        includeEnvelope: request.query?.includeEnvelope !== 'false',
      });
      if (!snapshot) {
        reply.code(HTTP_STATUS.NOT_FOUND).send({
          error: DEBUG_METADATA_ERR.SNAPSHOT_NOT_FOUND,
        });
        return;
      }
      reply.code(HTTP_STATUS.OK).send({
        snapshot: normalizeSnapshotApiPayload(snapshot),
      });
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Route one DAP request through admin ingress ownership.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleDebugDapRequest(request, reply) {
    const securityContext = this.resolveDebugSecurityContext(request, reply);
    if (!securityContext) {
      return;
    }

    if (!this.debugDapRouter ||
      typeof this.debugDapRouter.handleRequest !== TYPEOF.FUNCTION) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: ADMIN_DEBUG_ERROR_MSG.DAP_UNAVAILABLE,
      });
      return;
    }

    try {
      const response = await this.debugDapRouter.handleRequest({
        securityContext,
        ...(request.body || {}),
      });
      reply.code(HTTP_STATUS.OK).send({response});
    } catch (error) {
      reply.code(this.resolveDebugApiErrorStatus(error)).send({
        error: error.message,
        code: error.code || null,
      });
    }
  }

  /**
   * Serve shared playback viewer page.
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handlePlaybackViewerPage(reply) {
    try {
      const page = await this.testRunService.readPlaybackViewer();
      reply
        .code(HTTP_STATUS.OK)
        .header(HTTP_HEADER.CACHE_CONTROL, HTTP_HEADER_VALUE.NO_STORE)
        .type(ADMIN_CONTENT_TYPE.HTML)
        .send(page);
    } catch (error) {
      reply
        .code(HTTP_STATUS.NOT_FOUND)
        .send({
          error: ADMIN_TEST_ERROR_MSG.PLAYBACK_VIEWER_NOT_FOUND,
          details: error.message,
        });
    }
  }

  /**
   * Serve files under test-output for report/playback assets.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   * @private
   */
  async handleOutputFile(request, reply) {
    const wildcardPath = request.params['*'];
    const filePayload = await this.testRunService.readOutputAsset(wildcardPath);
    if (!filePayload) {
      reply
        .code(HTTP_STATUS.NOT_FOUND)
        .send({error: ADMIN_TEST_ERROR_MSG.OUTPUT_PATH_INVALID});
      return;
    }

    reply
      .code(HTTP_STATUS.OK)
      .type(filePayload.contentType)
      .send(filePayload.body);
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
    return HTTP_STATUS.INTERNAL_ERROR;
  }

  /**
   * Resolve security context from debug route headers.
   * @param {Object} request
   * @param {Object} reply
   * @return {Object|null}
   * @private
   */
  resolveDebugSecurityContext(request, reply) {
    const tenantId = request.headers[ADMIN_HEADER.TENANT_ID];
    const principal = request.headers[ADMIN_HEADER.PRINCIPAL];
    if (!tenantId || !principal) {
      reply.code(HTTP_STATUS.UNAUTHORIZED).send({
        error: ADMIN_DEBUG_ERROR_MSG.SECURITY_CONTEXT_REQUIRED,
      });
      return null;
    }

    const rolesHeader = request.headers[ADMIN_HEADER.ROLES];
    return {
      tenantId,
      principal,
      roles: parseHeaderRoles(rolesHeader),
    };
  }

  /**
   * @param {Object} reply
   * @return {DebugMetadataStore|null}
   * @private
   */
  requireDebugMetadataStore(reply) {
    if (!this.debugMetadataStore) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        error: ADMIN_DEBUG_ERROR_MSG.SERVICE_UNAVAILABLE,
      });
      return null;
    }
    return this.debugMetadataStore;
  }

  /**
   * Resolve debug API HTTP status from error code.
   * @param {Error} error
   * @return {number}
   * @private
   */
  resolveDebugApiErrorStatus(error) {
    switch (error?.code) {
    case DEBUG_METADATA_CODE.INVALID_CONTEXT:
      return HTTP_STATUS.UNAUTHORIZED;
    case DEBUG_METADATA_CODE.UNAUTHORIZED:
      return HTTP_STATUS.FORBIDDEN;
    case DEBUG_METADATA_CODE.ENGINE_REQUIRED:
      return HTTP_STATUS.SERVICE_UNAVAILABLE;
    case DEBUG_METADATA_CODE.INVALID_REQUEST:
    case DEBUG_METADATA_CODE.BREAKPOINTS_REQUIRED:
      return HTTP_STATUS.BAD_REQUEST;
    case DEBUG_METADATA_CODE.SESSION_NOT_FOUND:
    case DEBUG_METADATA_CODE.SNAPSHOT_NOT_FOUND:
      return HTTP_STATUS.NOT_FOUND;
    default:
      return HTTP_STATUS.INTERNAL_ERROR;
    }
  }

  /**
   * Handle one trace-stream websocket connection.
   * @param {Object} socket - WebSocket connection.
   * @param {Object} request - Fastify request.
   */
  handleDebugTraceConnection(socket, request) {
    const filter = buildTraceStreamFilter(request?.query || {});
    const subscription = this.traceCollector.subscribe(socket, filter);
    let closed = false;

    this.logger.info(ADMIN_LOG_MSG.TRACE_STREAM_SUBSCRIBED, {
      subscriberId: subscription.subscriberId,
      filter,
    });

    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      subscription.unsubscribe();
      this.logger.info(ADMIN_LOG_MSG.TRACE_STREAM_UNSUBSCRIBED, {
        subscriberId: subscription.subscriberId,
      });
    };

    socket.on(TRANSPORT_EVENT.CLOSE, cleanup);
    socket.on(TRANSPORT_EVENT.ERROR, cleanup);
  }

  /**
   * Handle new WebSocket connection.
   * @param {Object} socket - WebSocket connection.
   * @private
   */
  handleConnection(socket) {
    const clientId = `${ADMIN_CLIENT.PREFIX}${Date.now()}-` +
      `${Math.random()
        .toString(ADMIN_CLIENT.RANDOM_BASE)
        .substr(ADMIN_CLIENT.RANDOM_START, ADMIN_CLIENT.RANDOM_LENGTH)}`;

    this.logger.info(ADMIN_LOG_MSG.CLIENT_CONNECTED, {
      clientId,
      totalClients: this.clients.size + NUM.ONE,
    });

    // Add to connected clients
    const clientInfo = {
      id: clientId,
      socket,
      connectedAt: Date.now(),
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

    this.logger.info(ADMIN_LOG_MSG.CLIENT_DISCONNECTED, {
      clientId: clientInfo.id,
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
      } catch {
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
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async executeLocalServiceEnvelope(envelope, _context) {
    const operation = envelope?.operation;
    const payload = envelope?.payload || {};

    if (operation === ADMIN_SERVICE_OPERATION.EXECUTE_QUERY) {
      return {
        queryResult: await this.executeLocalQueryEnvelope(payload),
      };
    }
    if (operation === ADMIN_SERVICE_OPERATION.EXECUTE_PARTITION_CALLBACK) {
      return {
        queryResult: await this.executeLocalPartitionCallbackEnvelope(payload),
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
   * Execute canonical query operation payload.
   * @param {Object} payload
   * @return {Promise<Object>}
   * @private
   */
  async executeLocalQueryEnvelope(payload) {
    const queryId = payload?.queryId || null;
    const sql = payload?.sql;
    const params = payload?.params || [];

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
    );
    if (routed.warning) {
      result.warning = routed.warning;
    }
    return result;
  }

  /**
   * Execute canonical partition-callback payload.
   * @param {Object} payload
   * @return {Promise<Object>}
   * @private
   */
  async executeLocalPartitionCallbackEnvelope(payload) {
    const queryId = payload?.queryId || null;
    const statement = payload?.statement;
    const parameters = payload?.parameters || [];
    const callbackModuleRef = payload?.callbackModuleRef;
    const callbackExport = payload?.callbackExport;
    const runtimeKind = payload?.runtimeKind;

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

    return this.executeSqlRequestWithTimeout(createSqlRequest({
      statement,
      parameters,
      sessionId: queryId,
      executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
      callbackModuleRef,
      callbackExport,
      runtimeKind,
    }));
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
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeQueryWithTimeout(sql, params, queryId) {
    return this.executeSqlRequestWithTimeout(createSqlRequest({
      statement: sql,
      parameters: params,
      sessionId: queryId,
      executionMode: EXECUTION_MODE.SQL_STATEMENT,
    }));
  }

  /**
   * Execute canonical SQL request with timeout.
   * @param {Object} sqlRequest - Canonical SqlRequest.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSqlRequestWithTimeout(sqlRequest) {
    if (!this.sqlQueryEngine ||
        typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION) {
      throw new Error(ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE);
    }

    let timeoutId;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(ADMIN_ERROR_MESSAGE.queryTimeout(this.queryTimeoutMs)));
        }, this.queryTimeoutMs);
      });

      const queryPromise = this.sqlQueryEngine.executeRequest(sqlRequest);

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
    } else if (result.rows !== undefined || result.results !== undefined) {
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
      } catch {
        // Ignore close errors
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

/**
 * Parse comma-separated role header to string array.
 * @param {*} rolesHeader
 * @return {Array<string>}
 */
function parseHeaderRoles(rolesHeader) {
  if (typeof rolesHeader !== TYPEOF.STRING) {
    return [];
  }
  return rolesHeader.split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > NUM.ZERO);
}

/**
 * Parse limit query parameter.
 * @param {*} limitParam
 * @return {number|undefined}
 */
function parseRequestLimit(limitParam) {
  if (typeof limitParam === TYPEOF.STRING) {
    const parsed = Number.parseInt(limitParam, 10);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
  if (Number.isInteger(limitParam)) {
    return limitParam;
  }
  return undefined;
}

/**
 * Build trace stream subscription filter from query params.
 * @param {Object} query
 * @return {Object}
 */
function buildTraceStreamFilter(query) {
  const filter = {};
  const lineagePrefix = normalizeQueryFilterValue(query.lineagePrefix);
  const level = normalizeQueryFilterValue(query.level);
  const nodeId = normalizeQueryFilterValue(query.nodeId);
  const source = normalizeQueryFilterValue(query.source);
  const levels = parseTraceLevels(query.levels);

  if (lineagePrefix) {
    filter.lineagePrefix = lineagePrefix;
  }
  if (level) {
    filter.level = level;
  }
  if (nodeId) {
    filter.nodeId = nodeId;
  }
  if (source) {
    filter.source = source;
  }
  if (levels.length > NUM.ZERO) {
    filter.levels = levels;
  }

  return filter;
}

/**
 * Parse comma-separated trace levels query parameter.
 * @param {*} levelsParam
 * @return {Array<string>}
 */
function parseTraceLevels(levelsParam) {
  if (typeof levelsParam !== TYPEOF.STRING) {
    return [];
  }
  return levelsParam.split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > NUM.ZERO);
}

/**
 * Parse one query filter value to trimmed string.
 * @param {*} value
 * @return {string|null}
 */
function normalizeQueryFilterValue(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > NUM.ZERO ? trimmed : null;
}

/**
 * Convert snapshot payload to JSON-safe response.
 * @param {Object} snapshot
 * @return {Object}
 */
function normalizeSnapshotApiPayload(snapshot) {
  if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
    return snapshot;
  }
  if (!snapshot.envelope || !Buffer.isBuffer(snapshot.envelope)) {
    return snapshot;
  }

  return {
    ...snapshot,
    envelopeBase64: snapshot.envelope.toString('base64'),
    envelope: undefined,
  };
}

export {AdminWebSocketAPI, MessageType, ErrorCode};
