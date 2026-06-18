import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';
import {
  ADMIN_WEBSOCKET_TEST_RUN_ROUTE_METHODS,
} from './admin-websocket-test-run-route-methods.js';

const LOCAL_STR_1BT5T = 'System table cache not initialized';

const {
  ADMIN_CACHE_DUMP,
  ADMIN_CLIENT,
  ADMIN_CONFIG_KEY,
  ADMIN_DEFAULT,
  ADMIN_ERROR_MESSAGE,
  ADMIN_LOCAL_DISPATCH,
  ADMIN_LOG_MSG,
  ADMIN_ROUTE,
  ADMIN_SERVICE_OPERATION,
  ADMIN_STATUS,
  ADMIN_STREAM_LANE_DEFAULT,
  ADMIN_STREAM_LANE_LOAD,
  ADMIN_STREAM_LANE_PROBE,
  ADMIN_STREAM_LANE_SNAPSHOT,
  ADMIN_SUBSYSTEM,
  AdminControlSnapshot,
  AdminDebugHandlers,
  AdminPreflightSnapshot,
  AdminServiceDiscovery,
  AdminTestRunService,
  CACHE_DUMP_TABLES,
  CONTROL_PLANE_WORKLOAD_CLASS,
  ConfigurationManager,
  ControlPlaneSnapshotOwner,
  DebugMetadataStore,
  ERRNO,
  ErrorCode,
  Fastify,
  LOAD_LANE_QUERY_TIMEOUT_CAP_MS,
  LOAD_LANE_READINESS_CACHE_MAX_AGE_MS,
  LOAD_LANE_TABLE_ADMISSION_CACHE_MAX_AGE_MS,
  LoggingService,
  MessageType,
  NUM,
  PressureGovernor,
  TRANSPORT_EVENT,
  TYPEOF,
  TraceCollector,
  buildControlPlaneWorkloadProfile,
  createAdminOperationError,
  getRegisteredControlPlaneSystemTableGateway,
  resolveSqlEngineControlPlaneReadinessService,
  websocket,
} = ADMIN_WEBSOCKET_API_SHARED;

const ADMIN_FIELD = Object.freeze({
  CONFIG_DUMP_TIMEOUT: 'CACHE_DUMP_TIMEOUT_MS',
  DUMP_TIMEOUT_MS: 'cacheDumpTimeoutMs',
  LOCAL_DUMP_HANDLER: 'executeLocalCacheDumpEnvelope',
  LIVE_MAP: 'liveQueryMap',
  MUTATION_TARGET: 'cacheMutationTarget',
  PREFLIGHT_FRESHNESS: 'buildPreflightCacheFreshnessSummary',
  READINESS_LIMIT_MS: 'loadLaneReadinessCacheMaxAgeMs',
  REPAIR_HOOK: 'ensureAuthoritativeDiscoveryCacheRepair',
  REQUEST_CONTEXT: 'query',
  STORAGE_VIEW: 'systemTableCache',
  SUBSCRIBE_CHANGES: 'subscribeToCacheNotifications',
  TABLE_ADMISSION_LIMIT_MS: 'loadLaneTableAdmissionCacheMaxAgeMs',
  TABLE_ADMISSION_VIEW: 'loadLaneTableAdmissionCache',
});
const ADMIN_LOAD_LANE_READINESS_LIMIT_MS =
  LOAD_LANE_READINESS_CACHE_MAX_AGE_MS;
const ADMIN_LOAD_LANE_TABLE_ADMISSION_LIMIT_MS =
  LOAD_LANE_TABLE_ADMISSION_CACHE_MAX_AGE_MS;
const ADMIN_SERVICE_ENVELOPE_HANDLER = Object.freeze({
  [ADMIN_SERVICE_OPERATION.EXECUTE_QUERY]: async (api, payload, context) => ({
    queryResult: await api.executeLocalQueryEnvelope(payload, context),
  }),
  [ADMIN_SERVICE_OPERATION.EXECUTE_PARTITION_CALLBACK]:
    async (api, payload, context) => ({
      queryResult: await api.executeLocalPartitionCallbackEnvelope(
        payload,
        context,
      ),
    }),
  [ADMIN_SERVICE_OPERATION.GET_CACHE_DUMP]: (api) => ({
    cacheDump: api[ADMIN_FIELD.LOCAL_DUMP_HANDLER](),
  }),
});

class AdminWebSocketAPIBase {
  constructor(options = {}) {
    this[ADMIN_FIELD.STORAGE_VIEW] =
      options[ADMIN_FIELD.STORAGE_VIEW] || null;
    this[ADMIN_FIELD.MUTATION_TARGET] =
      options[ADMIN_FIELD.MUTATION_TARGET] || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      getRegisteredControlPlaneSystemTableGateway() ||
      null;
    this.messageRouter = options.messageRouter || null;
    this.nodeId = options.nodeId || ADMIN_DEFAULT.NODE_ID;
    this.enforcementMode =
      options.enforcementMode || ADMIN_DEFAULT.ENFORCEMENT_MODE;
    this.nowFn = options.nowFn || (() => Date.now());
    this.testRunService = options.testRunService || new AdminTestRunService();
    this.debugMetadataStore =
      options.debugMetadataStore ||
      (this.sqlQueryEngine ?
        new DebugMetadataStore({sqlQueryEngine: this.sqlQueryEngine}) :
        null);
    this.debugDapRouter = options.debugDapRouter || null;
    this.traceCollector = options.traceCollector || new TraceCollector();
    this.serviceDispatcher =
      options.serviceDispatcher || this.createLocalServiceDispatcher();
    this.serviceDiagnosticsProvider =
      options.serviceDiagnosticsProvider || null;
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
      resolveSqlEngineControlPlaneReadinessService(this.sqlQueryEngine) ||
      null;
    this.heartbeatService = options.heartbeatService || null;
    this[ADMIN_FIELD.READINESS_LIMIT_MS] =
      Number.isFinite(options[ADMIN_FIELD.READINESS_LIMIT_MS]) &&
      options[ADMIN_FIELD.READINESS_LIMIT_MS] > NUM.ZERO ?
        Math.floor(options[ADMIN_FIELD.READINESS_LIMIT_MS]) :
        ADMIN_LOAD_LANE_READINESS_LIMIT_MS;
    this[ADMIN_FIELD.TABLE_ADMISSION_LIMIT_MS] =
      Number.isFinite(options[ADMIN_FIELD.TABLE_ADMISSION_LIMIT_MS]) &&
      options[ADMIN_FIELD.TABLE_ADMISSION_LIMIT_MS] > NUM.ZERO ?
        Math.floor(options[ADMIN_FIELD.TABLE_ADMISSION_LIMIT_MS]) :
        Math.min(
          this[ADMIN_FIELD.READINESS_LIMIT_MS],
          ADMIN_LOAD_LANE_TABLE_ADMISSION_LIMIT_MS,
        );
    this.loadLaneQueryTimeoutCapMs =
      Number.isFinite(options.loadLaneQueryTimeoutCapMs) &&
      options.loadLaneQueryTimeoutCapMs > NUM.ZERO ?
        Math.floor(options.loadLaneQueryTimeoutCapMs) :
        LOAD_LANE_QUERY_TIMEOUT_CAP_MS;
    this[ADMIN_FIELD.TABLE_ADMISSION_VIEW] = new Map();
    this.enableAdminStream = options.enableAdminStream !== false;
    const config = ConfigurationManager.getInstance();
    this.port = ADMIN_DEFAULT.WEBSOCKET_PORT;
    this.queryTimeoutMs =
      config.get(ADMIN_CONFIG_KEY.QUERY_TIMEOUT_MS) ||
      ADMIN_DEFAULT.QUERY_TIMEOUT_MS;
    this[ADMIN_FIELD.DUMP_TIMEOUT_MS] =
      config.get(ADMIN_CONFIG_KEY[ADMIN_FIELD.CONFIG_DUMP_TIMEOUT]) ||
      ADMIN_DEFAULT[ADMIN_FIELD.CONFIG_DUMP_TIMEOUT];
    this.logger = this.initLogger();
    this.fastify = null;
    this.initialized = false;
    this.listening = false;
    this.clients = new Set();
    this.controlSnapshot = new AdminControlSnapshot({
      [ADMIN_FIELD.STORAGE_VIEW]: this[ADMIN_FIELD.STORAGE_VIEW],
      nodeId: this.nodeId,
      [ADMIN_FIELD.MUTATION_TARGET]: this[ADMIN_FIELD.MUTATION_TARGET],
      sqlQueryEngine: this.sqlQueryEngine,
      messageRouter: this.messageRouter,
      cdcIntegrationService: this.cdcIntegrationService,
      controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
      controlPlaneReadinessService: this.controlPlaneReadinessService,
      startupRecoveryCoordinator: options.startupRecoveryCoordinator || null,
      bootstrapReadinessState: options.bootstrapReadinessState || null,
      heartbeatService: this.heartbeatService,
      [ADMIN_FIELD.REPAIR_HOOK]: (opts) =>
        this.serviceDiscovery?.[ADMIN_FIELD.REPAIR_HOOK](opts),
      resolveLocalPartitionServices: () =>
        this.serviceDiscovery.resolveLocalPartitionServices(),
      nowFn: this.nowFn,
    });
    this.preflightSnapshot = new AdminPreflightSnapshot({
      [ADMIN_FIELD.STORAGE_VIEW]: this[ADMIN_FIELD.STORAGE_VIEW],
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
      [ADMIN_FIELD.MUTATION_TARGET]: this[ADMIN_FIELD.MUTATION_TARGET],
      sqlQueryEngine: this.sqlQueryEngine,
      buildLocalServiceDiscoverySnapshot: (opts) =>
        this.serviceDiscovery.buildLocalServiceDiscoverySnapshot(opts),
      [ADMIN_FIELD.REPAIR_HOOK]: (opts) =>
        this.serviceDiscovery[ADMIN_FIELD.REPAIR_HOOK](opts),
      buildControlPlaneDiagnosticsSnapshot: () =>
        this.controlSnapshot.buildControlPlaneDiagnosticsSnapshot(),
    });
    this.serviceDiscovery = new AdminServiceDiscovery({
      [ADMIN_FIELD.STORAGE_VIEW]: this[ADMIN_FIELD.STORAGE_VIEW],
      nodeId: this.nodeId,
      logger: this.logger,
      [ADMIN_FIELD.MUTATION_TARGET]: this[ADMIN_FIELD.MUTATION_TARGET],
      controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
      cdcIntegrationService: this.cdcIntegrationService,
      partitionServicesProvider: this.partitionServicesProvider,
      partitionServices: this.partitionServices,
      sqlQueryEngine: this.sqlQueryEngine,
      [ADMIN_FIELD.PREFLIGHT_FRESHNESS]: (opts) =>
        this.preflightSnapshot[ADMIN_FIELD.PREFLIGHT_FRESHNESS](opts),
      buildControlSnapshotReplicaOperationSummary: (rows, opts) =>
        this.controlSnapshot.buildControlSnapshotReplicaOperationSummary(
          rows,
          opts,
        ),
      executeSqlRequestWithTimeout: (req, timeout) =>
        this.executeSqlRequestWithTimeout(req, timeout),
      nowFn: this.nowFn,
    });

    this.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: this.controlSnapshot,
      serviceDiscovery: this.serviceDiscovery,
    });
    this.controlSnapshot.controlPlaneSnapshotOwner =
      this.controlPlaneSnapshotOwner;
    this.serviceDiscovery.controlPlaneSnapshotOwner =
      this.controlPlaneSnapshotOwner;
    this.debugHandlers = new AdminDebugHandlers({
      debugMetadataStore: this.debugMetadataStore,
      debugDapRouter: this.debugDapRouter,
      traceCollector: this.traceCollector,
      logger: this.logger,
      testRunService: this.testRunService,
    });

    this[ADMIN_FIELD.SUBSCRIBE_CHANGES]();
  }
  subscribeToCacheNotifications() {
    if (
      this.systemTableCache &&
      typeof this.systemTableCache.onCacheChange === TYPEOF.FUNCTION
    ) {
      this.systemTableCache.onCacheChange((tableName, operation, record) => {
        this.broadcastCDCEvent(tableName, operation, record);
      });
    }
  }
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(ADMIN_SUBSYSTEM.WEBSOCKET_API);
      }
    } catch (_logErr) {
    }
    return console;
  }
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
    await this.fastify.register(websocket);
    this.registerRoutes();

    if (shouldListen) {
      try {
        await this.fastify.listen({port: listenPort, host: listenHost});
        this.listening = true;
      } catch (err) {
        if (err && (err.code === ERRNO.EPERM || err.code === ERRNO.EACCES)) {
          await this.fastify.ready();
          this.listening = false;
        } else {
          if (err && err.code === ERRNO.EADDRINUSE) {
            // A still-draining prior listener on this admin port is transient:
            // tag the bind conflict retryable so the join re-attempt loop backs
            // off and rebinds once the OS releases the socket, instead of
            // classifying the bind as fatal and exiting the node — which drops
            // the rejoiner from membership and surfaces downstream as
            // publication_missing_active_node for that node.
            err.retryable = true;
          }
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
  registerRoutes() {
    this.fastify.get(ADMIN_ROUTE.ROOT, async (_request, reply) => {
      return this.handleDashboardPage(reply);
    });
    this.fastify.get(ADMIN_ROUTE.TEST_DASHBOARD, async (_request, reply) => {
      return this.handleDashboardPage(reply);
    });
    this.fastify.get(ADMIN_ROUTE.HEALTH, async (_request, _reply) => {
      return {
        status: ADMIN_STATUS.HEALTHY,
        nodeId: this.nodeId,
        connectedClients: this.clients.size,
      };
    });
    this.fastify.get(
      ADMIN_ROUTE.SERVICE_DIAGNOSTICS,
      async (_request, reply) => {
        return this.handleServiceDiagnostics(reply);
      },
    );
    this.fastify.get(ADMIN_ROUTE.CDC_DIAGNOSTICS, async (_request, reply) => {
      return this.handleCdcDiagnostics(reply);
    });
    this.fastify.get(
      ADMIN_ROUTE.PARTITION_DIAGNOSTICS,
      async (_request, reply) => {
        return this.handlePartitionDiagnostics(reply);
      },
    );
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
      return this.debugHandlers.handleCreateDebugSession(request, reply);
    });
    this.fastify.get(
      ADMIN_ROUTE.DEBUG_SESSION_BY_ID,
      async (request, reply) => {
        return this.debugHandlers.handleGetDebugSession(request, reply);
      },
    );
    this.fastify.patch(
      ADMIN_ROUTE.DEBUG_SESSION_BY_ID,
      async (request, reply) => {
        return this.debugHandlers.handleUpdateDebugSession(request, reply);
      },
    );
    this.fastify.post(
      ADMIN_ROUTE.DEBUG_SESSION_ATTACH,
      async (request, reply) => {
        return this.debugHandlers.handleAttachDebugSession(request, reply);
      },
    );
    this.fastify.post(
      ADMIN_ROUTE.DEBUG_SESSION_BREAKPOINTS,
      async (request, reply) => {
        return this.debugHandlers.handleWriteDebugBreakpoints(request, reply);
      },
    );
    this.fastify.get(
      ADMIN_ROUTE.DEBUG_SESSION_BREAKPOINTS,
      async (request, reply) => {
        return this.debugHandlers.handleListDebugBreakpoints(request, reply);
      },
    );
    this.fastify.post(
      ADMIN_ROUTE.DEBUG_SESSION_SNAPSHOTS,
      async (request, reply) => {
        return this.debugHandlers.handleWriteDebugSnapshot(request, reply);
      },
    );
    this.fastify.get(
      ADMIN_ROUTE.DEBUG_SESSION_SNAPSHOTS,
      async (request, reply) => {
        return this.debugHandlers.handleListDebugSnapshots(request, reply);
      },
    );
    this.fastify.get(
      ADMIN_ROUTE.DEBUG_SNAPSHOT_BY_ID,
      async (request, reply) => {
        return this.debugHandlers.handleGetDebugSnapshot(request, reply);
      },
    );
    this.fastify.post(ADMIN_ROUTE.DEBUG_DAP_REQUEST, async (request, reply) => {
      return this.debugHandlers.handleDebugDapRequest(request, reply);
    });

    this.fastify.get(ADMIN_ROUTE.PLAYBACK_VIEWER, async (_request, reply) => {
      return this.debugHandlers.handlePlaybackViewerPage(reply);
    });
    this.fastify.get(ADMIN_ROUTE.OUTPUT_FILES, async (request, reply) => {
      return this.debugHandlers.handleOutputFile(request, reply);
    });

    if (this.enableAdminStream) {
      this.fastify.register(async (fastify) => {
        fastify.get(ADMIN_ROUTE.STREAM, {websocket: true}, (socket, req) => {
          this.handleConnection(socket, req);
        });
        fastify.get(
          ADMIN_ROUTE.DEBUG_TRACE_STREAM,
          {websocket: true},
          (socket, request) => {
            this.debugHandlers.handleDebugTraceConnection(socket, request);
          },
        );
      });
    }
  }
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
  handleConnection(socket, request = null) {
    const lane =
      this.resolveAdminClientLane(request?.[ADMIN_FIELD.REQUEST_CONTEXT]?.lane);
    const clientId =
      `${ADMIN_CLIENT.PREFIX}${Date.now()}-` +
      `${Math.random()
        .toString(ADMIN_CLIENT.RANDOM_BASE)
        .substr(ADMIN_CLIENT.RANDOM_START, ADMIN_CLIENT.RANDOM_LENGTH)}`;

    this.logger.info(ADMIN_LOG_MSG.CLIENT_CONNECTED, {
      clientId,
      lane,
      totalClients: this.clients.size + NUM.ONE,
    });
    const clientInfo = {
      id: clientId,
      lane,
      socket,
      connectedAt: Date.now(),
      [ADMIN_FIELD.LIVE_MAP]: new Map(),
    };
    this.clients.add(clientInfo);
    this.sendCacheDump(clientInfo);
    socket.on(TRANSPORT_EVENT.MESSAGE, (data) => {
      this.handleMessage(clientInfo, data);
    });
    socket.on(TRANSPORT_EVENT.CLOSE, () => {
      this.handleDisconnection(clientInfo);
    });
    socket.on(TRANSPORT_EVENT.ERROR, (error) => {
      this.logger.error(ADMIN_LOG_MSG.SOCKET_ERROR, {
        clientId,
        error: error.message,
      });
      try {
        socket.terminate();
      } catch (_err) {}
    });
  }
  handleDisconnection(clientInfo) {
    this.clients.delete(clientInfo);

    if (clientInfo.socket) {
      try {
        clientInfo.socket.terminate();
      } catch (_err) {}
    }

    if (this.liveQueryManager) {
      this.liveQueryManager.handleClientDisconnection(clientInfo.id);
    }

    this.logger.info(ADMIN_LOG_MSG.CLIENT_DISCONNECTED, {
      clientId: clientInfo.id,
      lane: this.resolveAdminClientLane(clientInfo?.lane),
      totalClients: this.clients.size,
    });
  }
  sendCacheDump(clientInfo, tables) {
    const cacheDump = this.buildValidatedCacheDump(tables);
    this.sendCacheDumpPayload(clientInfo, cacheDump);
  }
  buildValidatedCacheDump(tables) {
    const cacheDump = this.buildCacheDump(tables);
    const isEmpty = Object.values(cacheDump).every(
      (rows) => Array.isArray(rows) && rows.length === NUM.ZERO,
    );
    if (isEmpty) {
      throw createAdminOperationError(
        ErrorCode.INTERNAL_ERROR,
        ADMIN_ERROR_MESSAGE.SYSTEM_CACHE_EMPTY,
      );
    }
    return cacheDump;
  }
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
  buildCacheDump(tables) {
    const targetTables = tables || CACHE_DUMP_TABLES;
    const dump = {};

    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION
    ) {
      throw new Error(LOCAL_STR_1BT5T);
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
  createLocalServiceDispatcher() {
    return {
      dispatch: async (envelope, context = {}) => {
        const payload = await this.executeLocalServiceEnvelope(
          envelope,
          context,
        );
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
  async executeLocalServiceEnvelope(envelope, context = {}) {
    const operation = envelope?.operation;
    const payload = envelope?.payload || {};
    const handler = ADMIN_SERVICE_ENVELOPE_HANDLER[operation];

    if (handler) {
      return handler(this, payload, context);
    }

    throw createAdminOperationError(
      ErrorCode.INTERNAL_ERROR,
      `${ADMIN_ERROR_MESSAGE.SERVICE_DISPATCH_OPERATION_UNSUPPORTED}: ${operation}`,
    );
  }
  isLoadLaneExecution(executionContext = {}) {
    const lane = this.resolveAdminClientLane(
      executionContext?.clientInfo?.lane,
    );
    return lane === ADMIN_STREAM_LANE_LOAD;
  }
  isLocalObservationLaneExecution(executionContext = {}) {
    const lane = this.resolveAdminClientLane(
      executionContext?.clientInfo?.lane,
    );
    return (
      lane === ADMIN_STREAM_LANE_PROBE || lane === ADMIN_STREAM_LANE_SNAPSHOT
    );
  }
  evaluateLocalObservationPressure() {
    if (!this.messageRouter) {
      return null;
    }
    const workloadProfile = buildControlPlaneWorkloadProfile(
      CONTROL_PLANE_WORKLOAD_CLASS.ADMIN_DIAGNOSTIC_READ,
      {
        additionalResourceKeys: ['control-plane:admin-local-observation'],
      },
    );
    return PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
      now: this.nowFn,
    }).evaluate({
      workClass: workloadProfile.workClass,
      resourceKeys: workloadProfile.resourceKeys,
      allowDegrade: workloadProfile.allowPressureDegrade,
    });
  }
  resolveLocalObservationExecutionPolicy(_executionContext = {}, options = {}) {
    const forceAuthoritativeRepair = options.forceAuthoritativeRepair === true;
    if (forceAuthoritativeRepair) {
      return {
        allowAuthoritativeRepair: true,
        allowAuthoritativeReadinessRefresh: false,
        allowStaleReadinessOnCacheChange: true,
        allowAuthoritativePublishedMembershipRecovery: true,
      };
    }

    return {
      allowAuthoritativeRepair: false,
      allowAuthoritativeReadinessRefresh: false,
      allowStaleReadinessOnCacheChange: true,
      allowAuthoritativePublishedMembershipRecovery: false,
    };
  }
}

Object.assign(
  AdminWebSocketAPIBase.prototype,
  ADMIN_WEBSOCKET_TEST_RUN_ROUTE_METHODS,
);

export {AdminWebSocketAPIBase};
