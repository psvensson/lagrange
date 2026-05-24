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

class AdminWebSocketAPISegment1 {
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
    this.loadLaneReadinessCacheMaxAgeMs =
      Number.isFinite(options.loadLaneReadinessCacheMaxAgeMs) &&
      options.loadLaneReadinessCacheMaxAgeMs > NUM.ZERO ?
        Math.floor(options.loadLaneReadinessCacheMaxAgeMs) :
        LOAD_LANE_READINESS_CACHE_MAX_AGE_MS;
    this.loadLaneTableAdmissionCacheMaxAgeMs =
      Number.isFinite(options.loadLaneTableAdmissionCacheMaxAgeMs) &&
      options.loadLaneTableAdmissionCacheMaxAgeMs > NUM.ZERO ?
        Math.floor(options.loadLaneTableAdmissionCacheMaxAgeMs) :
        Math.min(
          this.loadLaneReadinessCacheMaxAgeMs,
          LOAD_LANE_TABLE_ADMISSION_CACHE_MAX_AGE_MS,
        );
    this.loadLaneQueryTimeoutCapMs =
      Number.isFinite(options.loadLaneQueryTimeoutCapMs) &&
      options.loadLaneQueryTimeoutCapMs > NUM.ZERO ?
        Math.floor(options.loadLaneQueryTimeoutCapMs) :
        LOAD_LANE_QUERY_TIMEOUT_CAP_MS;
    this.loadLaneTableAdmissionCache = new Map();
    this.enableAdminStream = options.enableAdminStream !== false;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.port = ADMIN_DEFAULT.WEBSOCKET_PORT;
    this.queryTimeoutMs =
      config.get(ADMIN_CONFIG_KEY.QUERY_TIMEOUT_MS) ||
      ADMIN_DEFAULT.QUERY_TIMEOUT_MS;
    this.cacheDumpTimeoutMs =
      config.get(ADMIN_CONFIG_KEY.CACHE_DUMP_TIMEOUT_MS) ||
      ADMIN_DEFAULT.CACHE_DUMP_TIMEOUT_MS;

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
      controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
      controlPlaneReadinessService: this.controlPlaneReadinessService,
      startupRecoveryCoordinator: options.startupRecoveryCoordinator || null,
      bootstrapReadinessState: options.bootstrapReadinessState || null,
      heartbeatService: this.heartbeatService,
      ensureAuthoritativeDiscoveryCacheRepair: (opts) =>
        this.serviceDiscovery?.ensureAuthoritativeDiscoveryCacheRepair(opts),
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
        this.serviceDiscovery.buildLocalServiceDiscoverySnapshot(opts),
      ensureAuthoritativeDiscoveryCacheRepair: (opts) =>
        this.serviceDiscovery.ensureAuthoritativeDiscoveryCacheRepair(opts),
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
        this.preflightSnapshot.buildPreflightCacheFreshnessSummary(opts),
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
    if (
      this.systemTableCache &&
      typeof this.systemTableCache.onCacheChange === TYPEOF.FUNCTION
    ) {
      this.systemTableCache.onCacheChange((tableName, operation, record) => {
        this.broadcastCDCEvent(tableName, operation, record);
      });
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
            this.debugHandlers.handleDebugTraceConnection(socket, request);
          },
        );
      });
    }
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
    const lane = this.resolveAdminClientLane(request?.query?.lane);
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

  /**
   * Create default local dispatcher implementing canonical dispatch interface.
   * @return {Object}
   * @private
   */
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
    return (
      lane === ADMIN_STREAM_LANE_PROBE || lane === ADMIN_STREAM_LANE_SNAPSHOT
    );
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

  /**
   * Resolve execution policy for control-snapshot/service-discovery
   * local observation queries.
   * @param {Object} executionContext
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
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

  /**
   * Resolve local readiness snapshot for load-lane admission checks.
   * @return {Object|null}
   * @private
   */
}

Object.assign(
  AdminWebSocketAPISegment1.prototype,
  ADMIN_WEBSOCKET_TEST_RUN_ROUTE_METHODS,
);

export {AdminWebSocketAPISegment1};
