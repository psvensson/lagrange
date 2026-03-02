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
  CDC_OPERATION,
  COLUMN,
  ERRNO,
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {CONNECTION_STATE, TRANSPORT_EVENT} from '../constants/transport.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';
import {META_SERVICE_ID} from '../constants/wasm-meta.js';
import {createSqlRequest} from '../query/sql-request.js';
import {EXECUTION_MODE} from '../query/sql-adapter-constants.js';
import {guardedAdaptAdminAction} from './admin-api-adapter.js';
import {
  ADMIN_META_ACTION,
  CACHE_DUMP_TABLES,
} from './admin-meta-command-handlers.js';
import {parseLiveSelect} from '../live-query/live-query-service.js';
import {SQLParser} from '../query/sql-parser.js';
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
  ENDPOINT_SYNC_HEALTH,
  ENDPOINT_SYNC_BOOLEAN,
  ENDPOINT_SYNC_UNHEALTHY_POLICY,
} from '../runtime/endpoint-sync-constants.js';
import {buildServiceDiscoveryCatalog} from
  '../runtime/service-discovery-catalog.js';
import {
  DEBUG_METADATA_ERROR_CODE as DEBUG_METADATA_CODE,
  DEBUG_METADATA_ERROR_MSG as DEBUG_METADATA_ERR,
} from '../debug-runtime/debug-metadata-service-constants.js';
import {
  DEBUG_SESSION_STATUS as DEBUG_METADATA_SESSION_STATUS,
} from '../debug-runtime/debug-metadata-constants.js';
import {isLoadReadyReplicaRaftRole} from '../node/replica-state-machine-constants.js';
import {isTerminalStep as isTerminalReplicaOperationStep} from '../rebalancer/replica-status.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
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
  ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT,
  ADMIN_SERVICE_DISCOVERY,
  ADMIN_ROUTE,
  ADMIN_STATUS,
  ADMIN_SUBSYSTEM,
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_STREAM_EVENT,
  CONSISTENCY_MISMATCH_KIND,
} from './admin-constants.js';
import {getSystemCachePrimaryKeyField} from
  '../cache/system-cache-key-descriptor.js';
import {isTableCdcReadinessRelevant} from '../cache/cdc-table-policy.js';

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
const SQL_NORMALIZE_WHITESPACE_PATTERN = /\s+/g;
const SQL_TRAILING_SEMICOLON_PATTERN = /;\s*$/;
const LEADER_RAFT_ROLE = 'leader';
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const STATUS_UNKNOWN = 'unknown';
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SERVICE_DISCOVERY_TABLE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const CDC_TELEMETRY_MODE = Object.freeze({
  STEADY: 'steady',
  CATCHUP: 'catchup',
});
const SERVICE_DISCOVERY_SQL_WITH_TABLE_PATTERN =
  /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*\)$/;
const SERVICE_DISCOVERY_SQL_WITH_TABLE_AND_ID_PATTERN =
  /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*'([a-z0-9_-]+)'\s*\)$/;
const SERVICE_DISCOVERY_READINESS_REASON = Object.freeze({
  ROUTING_NOT_READY: 'routing_not_ready',
  SCHEMA_TABLE_MISSING: 'schema_table_missing',
  SCHEMA_PARTITION_UNAVAILABLE: 'schema_partition_unavailable',
  REPLICA_OPERATIONS_IN_FLIGHT: 'replica_operations_in_flight',
  REPLICA_OPERATION_IN_FLIGHT: 'replica_operation_in_flight',
  REPLICA_OPERATION_FAILED: 'replica_operation_failed',
  LEADERSHIP_UNSTABLE: 'leadership_unstable',
  LOCAL_REPLICA_NOT_VOTER_READY: 'local_replica_not_voter_ready',
  LOCAL_CDC_DIAGNOSTICS_UNAVAILABLE: 'local_cdc_diagnostics_unavailable',
  LOCAL_CDC_SUBSCRIBER_MISSING: 'local_cdc_subscriber_missing',
  LOCAL_CDC_BUFFER_NOT_DRAINED: 'local_cdc_buffer_not_drained',
});
const BENCHMARK_ADMISSION_STATE = Object.freeze({
  READY: 'ready',
  BLOCKED: 'blocked',
});
const BENCHMARK_DEGRADATION_STATE = Object.freeze({
  HEALTHY: 'healthy',
  MOVE_PENDING: 'move_pending',
  MOVE_FAILED: 'move_failed',
  PROMOTION_PENDING: 'promotion_pending',
  PROMOTION_FAILED: 'promotion_failed',
  DRAIN_BLOCKED: 'drain_blocked',
});
const BENCHMARK_DEGRADATION_PRIORITY = Object.freeze({
  [BENCHMARK_DEGRADATION_STATE.HEALTHY]: NUM.ZERO,
  [BENCHMARK_DEGRADATION_STATE.PROMOTION_PENDING]: NUM.ONE,
  [BENCHMARK_DEGRADATION_STATE.MOVE_PENDING]: NUM.TWO,
  [BENCHMARK_DEGRADATION_STATE.DRAIN_BLOCKED]: 3,
  [BENCHMARK_DEGRADATION_STATE.PROMOTION_FAILED]: 4,
  [BENCHMARK_DEGRADATION_STATE.MOVE_FAILED]: 5,
});
const REPLICA_OPERATION_TYPE = Object.freeze({
  ADD: 'ADD',
  REMOVE: 'REMOVE',
  REPLACE: 'REPLACE',
});
const SERVICE_DISCOVERY_SCHEMA_VERSION_FIELD_CANDIDATES = Object.freeze([
  'updated_at_hlc',
  'updatedAtHlc',
  'schema_version',
  'schemaVersion',
  'updated_at',
  'updatedAt',
  'created_at',
  'createdAt',
]);
const ADMIN_LOCAL_DISPATCH = Object.freeze({
  TARGET_ADDRESS: 'local/admin-websocket-api',
});
const AUTHORITATIVE_DISCOVERY_REPAIR = Object.freeze({
  COOLDOWN_MS: 1000,
  QUERY_TIMEOUT_MS: 1500,
  STALE_THRESHOLD_MS: 5000,
  TABLES: Object.freeze([
    TABLES.NODES,
    TABLES.PARTITIONS,
    TABLES.SERVICES,
    TABLES.TABLES,
    TABLES.NODE_ENDPOINTS,
    TABLES.SERVICE_DEFINITIONS,
    TABLES.SERVICE_ENDPOINTS,
    TABLES.REPLICA_OPERATIONS,
  ]),
});
const AUTHORITATIVE_DISCOVERY_CACHE_GAP_REASON_CODES = new Set([
  SERVICE_DISCOVERY_READINESS_REASON.SCHEMA_TABLE_MISSING,
  SERVICE_DISCOVERY_READINESS_REASON.SCHEMA_PARTITION_UNAVAILABLE,
  SERVICE_DISCOVERY_READINESS_REASON.LEADERSHIP_UNSTABLE,
]);

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

function normalizeSql(sql) {
  return String(sql || EMPTY_STRING)
    .trim()
    .replace(SQL_TRAILING_SEMICOLON_PATTERN, EMPTY_STRING)
    .replace(SQL_NORMALIZE_WHITESPACE_PATTERN, ' ')
    .toLowerCase();
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function firstStringField(record, ...keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === TYPEOF.STRING && value.length > NUM.ZERO) {
      return value;
    }
  }
  return null;
}

function hasMeaningfulField(record, ...keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && value !== EMPTY_STRING) {
      return true;
    }
  }
  return false;
}

function normalizeReplicaOperationWorkflowStep(row) {
  return String(firstStringField(
    row,
    'workflow_step',
    'workflowStep',
  ) || EMPTY_STRING).toUpperCase();
}

function isReplicaOperationTerminalSuccess(type, status, workflowStep, hasCompletedAt) {
  if (!type || !status) {
    return false;
  }
  if (status === 'failed' || workflowStep === 'FAILED') {
    return false;
  }
  if (workflowStep && isTerminalReplicaOperationStep(type, workflowStep)) {
    return true;
  }
  if (!hasCompletedAt) {
    return false;
  }
  if (type === REPLICA_OPERATION_TYPE.ADD) {
    return status === 'active';
  }
  return status === 'removed';
}

function normalizeSchemaVersionValue(value) {
  if (typeof value === TYPEOF.STRING) {
    const normalized = value.trim();
    return normalized.length > NUM.ZERO ? normalized : null;
  }
  if (typeof value === TYPEOF.NUMBER && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'bigint') {
    return String(value);
  }
  return null;
}

function compareSchemaVersionValues(left, right) {
  if (left === right) {
    return NUM.ZERO;
  }
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right));
}

function isActiveVoterReadyPartitionReplica(serviceRow) {
  if (!serviceRow || typeof serviceRow !== TYPEOF.OBJECT) {
    return false;
  }
  const serviceType = firstStringField(
    serviceRow,
    COLUMN.SERVICE_TYPE,
    'service_type',
    'serviceType',
    'type',
  );
  if (serviceType !== SERVICE_TYPE_PARTITION) {
    return false;
  }
  const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
  if (String(status || '').toLowerCase() !== STATUS_ACTIVE) {
    return false;
  }
  const raftRole = firstStringField(
    serviceRow,
    COLUMN.RAFT_ROLE,
    'raft_role',
    'raftRole',
  );
  if (!isLoadReadyReplicaRaftRole(raftRole)) {
    return false;
  }
  const address = firstStringField(serviceRow, COLUMN.ADDRESS, 'address');
  return Boolean(address);
}

function selectNewestSchemaVersion(current, candidate) {
  if (!candidate) {
    return current;
  }
  if (!current) {
    return candidate;
  }
  return compareSchemaVersionValues(candidate, current) >= NUM.ZERO ?
    candidate :
    current;
}

function extractSchemaVersionFromRecord(record) {
  if (!record || typeof record !== TYPEOF.OBJECT) {
    return null;
  }
  for (const fieldName of SERVICE_DISCOVERY_SCHEMA_VERSION_FIELD_CANDIDATES) {
    const normalized = normalizeSchemaVersionValue(record[fieldName]);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

/**
 * Parse one comma-separated query parameter into sorted unique values.
 *
 * @param {*} rawValue
 * @return {Array<string>}
 */
function parseDiscoveryListQuery(rawValue) {
  const values = [];

  const collectValues = (inputValue) => {
    if (Array.isArray(inputValue)) {
      for (const item of inputValue) {
        collectValues(item);
      }
      return;
    }
    if (typeof inputValue !== TYPEOF.STRING) {
      return;
    }

    for (const value of inputValue.split(',')) {
      const trimmedValue = value.trim();
      if (trimmedValue.length > NUM.ZERO) {
        values.push(trimmedValue);
      }
    }
  };

  collectValues(rawValue);
  return uniqueSorted(values);
}

/**
 * Parse optional boolean query value with fallback.
 *
 * @param {*} rawValue
 * @param {boolean} fallback
 * @return {boolean}
 */
function parseDiscoveryBooleanQuery(rawValue, fallback) {
  if (typeof rawValue === TYPEOF.BOOLEAN) {
    return rawValue;
  }
  if (typeof rawValue !== TYPEOF.STRING) {
    return fallback;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (normalizedValue === ENDPOINT_SYNC_BOOLEAN.TRUE ||
    normalizedValue === ENDPOINT_SYNC_BOOLEAN.ONE) {
    return true;
  }
  if (normalizedValue === ENDPOINT_SYNC_BOOLEAN.FALSE ||
    normalizedValue === ENDPOINT_SYNC_BOOLEAN.ZERO) {
    return false;
  }
  return fallback;
}

/**
 * Normalize identifier-like values used in discovery scope.
 *
 * @param {*} value
 * @return {string|null}
 */
function normalizeIdentifier(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const trimmedValue = value.trim();
  if (trimmedValue.length === NUM.ZERO) {
    return null;
  }
  if (!IDENTIFIER_PATTERN.test(trimmedValue)) {
    return null;
  }
  return trimmedValue;
}

/**
 * Normalize optional table-id discovery scope value.
 *
 * @param {*} value
 * @return {string|null}
 */
function normalizeDiscoveryTableId(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const trimmedValue = value.trim();
  if (trimmedValue.length === NUM.ZERO) {
    return null;
  }
  if (!SERVICE_DISCOVERY_TABLE_ID_PATTERN.test(trimmedValue)) {
    return null;
  }
  return trimmedValue;
}

/**
 * Parse local service-discovery SQL with optional tableName and tableId args.
 *
 * @param {string} sql
 * @return {{isQuery: boolean, tableName: (string|null), tableId: (string|null)}}
 */
function parseServiceDiscoverySqlQuery(sql) {
  const normalizedSql = normalizeSql(sql);
  if (normalizedSql === normalizeSql(ADMIN_SERVICE_DISCOVERY.QUERY_SQL)) {
    return {
      isQuery: true,
      tableName: null,
      tableId: null,
    };
  }

  const tableAndIdMatch =
    normalizedSql.match(SERVICE_DISCOVERY_SQL_WITH_TABLE_AND_ID_PATTERN);
  if (tableAndIdMatch) {
    return {
      isQuery: true,
      tableName: normalizeIdentifier(tableAndIdMatch[1]),
      tableId: normalizeDiscoveryTableId(tableAndIdMatch[2]),
    };
  }

  const match = normalizedSql.match(SERVICE_DISCOVERY_SQL_WITH_TABLE_PATTERN);
  if (!match) {
    return {
      isQuery: false,
      tableName: null,
      tableId: null,
    };
  }

  return {
    isQuery: true,
    tableName: normalizeIdentifier(match[1]),
    tableId: null,
  };
}

/**
 * AdminWebSocketAPI — node-local compatibility adapter for
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
    this.cacheMutationTarget = options.cacheMutationTarget ||
      (typeof this.systemTableCache?.applySystemTableChange === TYPEOF.FUNCTION ?
        this.systemTableCache :
        null);
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.messageRouter = options.messageRouter || null;
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
    this.authoritativeDiscoveryRepairPromise = null;
    this.lastAuthoritativeDiscoveryRepairAtMs = NUM.ZERO;

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
    if (this.isPreflightCriticalPathSnapshotQuery(sql)) {
      return this.buildPreflightCriticalPathSnapshotQueryResult();
    }
    if (this.isControlSnapshotQuery(sql)) {
      return this.buildControlSnapshotQueryResult();
    }
    const serviceDiscoveryQuery = parseServiceDiscoverySqlQuery(sql);
    if (serviceDiscoveryQuery.isQuery) {
      return this.buildServiceDiscoveryQueryResult({
        tableName: serviceDiscoveryQuery.tableName,
        tableId: serviceDiscoveryQuery.tableId,
      });
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
      const snapshot = this.buildLocalControlSnapshot();
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
      const snapshot = await this.resolveServiceDiscoverySnapshot({
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
    return normalizeSql(sql) ===
      normalizeSql(ADMIN_CONTROL_SNAPSHOT.QUERY_SQL);
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
   * Build local service-discovery snapshot from system cache only.
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildLocalServiceDiscoverySnapshot(options = {}) {
    if (!this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      throw new Error(ADMIN_ERROR_MESSAGE.SERVICE_DISCOVERY_UNAVAILABLE);
    }

    const endpointRows = this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS);
    const definitionRows =
      this.systemTableCache.getAll(TABLES.SERVICE_DEFINITIONS);
    const readinessContext = this.buildServiceDiscoveryReadinessContext(options);
    const discoveredServices = buildServiceDiscoveryCatalog(endpointRows, {
      protocolAllowlist: options.protocolAllowlist || ADMIN_CACHE_DUMP.EMPTY,
      serviceIdAllowlist: options.serviceIdAllowlist || ADMIN_CACHE_DUMP.EMPTY,
      nodeIdAllowlist: options.nodeIdAllowlist || ADMIN_CACHE_DUMP.EMPTY,
      healthyOnly: options.healthyOnly === true,
      unhealthyPolicy: options.unhealthyPolicy,
      definitionRows,
    });
    const services = discoveredServices.map((service) => ({
      ...service,
      replicas: service.replicas.map((replica) => {
        const readiness = this.buildServiceDiscoveryReplicaReadiness(
          replica,
          readinessContext,
        );
        return {
          ...replica,
          readiness,
          benchmarkAdmission: this.buildServiceDiscoveryReplicaBenchmarkAdmission(
            replica,
            readinessContext,
            readiness,
          ),
        };
      }),
    }));
    const replicaCount = services.reduce((count, service) =>
      count + service.observedReplicaCount, NUM.ZERO);

    return {
      schemaVersion: ADMIN_SERVICE_DISCOVERY.SCHEMA_VERSION,
      nodeId: this.nodeId,
      capturedAt: Date.now(),
      serviceCount: services.length,
      replicaCount,
      services,
    };
  }

  /**
   * Resolve local service discovery snapshot with bounded authoritative repair.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  async resolveServiceDiscoverySnapshot(options = {}) {
    const snapshot = this.buildLocalServiceDiscoverySnapshot(options);
    if (!this.shouldAttemptAuthoritativeDiscoveryRepair(snapshot, options)) {
      return snapshot;
    }
    const repair = await this.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'service_discovery_snapshot',
      tableName: options.tableName || null,
      tableId: options.tableId || null,
    });
    if (repair.applied !== true) {
      return snapshot;
    }
    return this.buildLocalServiceDiscoverySnapshot(options);
  }

  /**
   * Determine whether discovery snapshot warrants authoritative cache repair.
   * @param {Object} snapshot
   * @return {boolean}
   * @private
   */
  shouldAttemptAuthoritativeDiscoveryRepair(snapshot, options = {}) {
    if (!this.systemTableCache ||
        !this.cacheMutationTarget ||
        typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION ||
        !this.sqlQueryEngine ||
        typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION) {
      return false;
    }
    if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
      return false;
    }
    const freshness = this.buildPreflightCacheFreshnessSummary({
      capturedAtMs: Date.now(),
    });
    const stalenessMs = Number(freshness?.stalenessMs);
    const cacheRepairEligible =
      !Number.isFinite(stalenessMs) ||
      stalenessMs >= AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS;
    const scopedDiscoveryQuery =
      normalizeIdentifier(options.tableName) !== null ||
      normalizeDiscoveryTableId(options.tableId) !== null;
    if (snapshot.serviceCount === NUM.ZERO || snapshot.replicaCount === NUM.ZERO) {
      if (scopedDiscoveryQuery) {
        return true;
      }
      return cacheRepairEligible;
    }

    const services = Array.isArray(snapshot.services) ? snapshot.services : [];
    let readyReplicaCount = NUM.ZERO;
    for (const service of services) {
      const replicas = Array.isArray(service?.replicas) ? service.replicas : [];
      for (const replica of replicas) {
        const readiness = replica?.readiness || null;
        if (!readiness || typeof readiness !== TYPEOF.OBJECT) {
          continue;
        }
        const reasons = Array.isArray(readiness.reasons) ? readiness.reasons : [];
        if (readiness.benchmarkReady === true || reasons.length === NUM.ZERO) {
          readyReplicaCount += NUM.ONE;
        }
        for (const reason of reasons) {
          const code = String(reason?.code || EMPTY_STRING);
          if (cacheRepairEligible &&
              AUTHORITATIVE_DISCOVERY_CACHE_GAP_REASON_CODES.has(code)) {
            return true;
          }
        }
      }
    }

    if (scopedDiscoveryQuery) {
      return false;
    }

    return cacheRepairEligible && readyReplicaCount === NUM.ZERO;
  }

  /**
   * Build per-replica readiness context from local cache state.
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildServiceDiscoveryReadinessContext(options = {}) {
    const tableName = normalizeIdentifier(options.tableName);
    const tableId = normalizeDiscoveryTableId(options.tableId);
    const nodeRows = this.systemTableCache.getAll(TABLES.NODES);
    const serviceRows = this.systemTableCache.getAll(TABLES.SERVICES);
    const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
    const tableRows = this.systemTableCache.getAll(TABLES.TABLES);
    const replicaOperationRows =
      this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);

    const activeNodeIds = new Set(nodeRows
      .map((row) => ({
        nodeId: firstStringField(row, COLUMN.NODE_ID, 'node_id', 'nodeId', 'id'),
        status: firstStringField(row, COLUMN.STATUS, 'status'),
      }))
      .filter((entry) =>
        entry.nodeId &&
        String(entry.status || '').toLowerCase() === STATUS_ACTIVE)
      .map((entry) => entry.nodeId));

    const tablePartitionContext = this.resolveDiscoveryTablePartitionContext(
      tableName,
      tableId,
      partitionRows,
      tableRows,
    );
    const schemaReady = this.resolveDiscoverySchemaReady(
      tablePartitionContext.partitionIds,
      serviceRows,
    );
    const leadershipStable = this.resolveDiscoveryLeadershipStable(
      tablePartitionContext.partitionIds,
      serviceRows,
    );
    const localTargetReplicaStateByNodeId =
      this.buildDiscoveryLocalTargetReplicaStateByNodeId(
        tablePartitionContext.partitionIds,
        serviceRows,
      );
    const localTargetPartitionIds = this.buildDiscoveryLocalTargetPartitionIds(
      tablePartitionContext.partitionIds,
      serviceRows,
    );
    const localPartitionCdcState = this.buildDiscoveryLocalPartitionCdcState({
      localTargetPartitionIds,
      tableName,
      cdcReadinessApplies: tablePartitionContext.cdcReadinessApplies,
    });
    const replicaOperationSummary =
      this.buildControlSnapshotReplicaOperationSummary(replicaOperationRows, {
        partitionIds: tablePartitionContext.partitionIds,
      });
    const replicaOperationDegradationByNodeId =
      this.buildDiscoveryReplicaOperationDegradationByNodeId(
        replicaOperationRows,
        {
          partitionIds: tablePartitionContext.partitionIds,
        },
      );

    return {
      tableName,
      tableFound: tablePartitionContext.tableFound,
      appliedSchemaVersion: tablePartitionContext.appliedSchemaVersion,
      activeNodeIds,
      schemaReady,
      leadershipStable,
      localTargetReplicaStateByNodeId,
      localPartitionCdcState,
      replicaOpsInFlight: replicaOperationSummary.inFlightCount,
      replicaOperationDegradationByNodeId,
    };
  }

  /**
   * Resolve local active target partition IDs for table-scoped discovery.
   * @param {Set<string>} partitionIds
   * @param {Array<Object>} serviceRows
   * @return {Set<string>}
   * @private
   */
  buildDiscoveryLocalTargetPartitionIds(partitionIds, serviceRows) {
    const localPartitionIds = new Set();
    if (!(partitionIds instanceof Set) || partitionIds.size === NUM.ZERO) {
      return localPartitionIds;
    }

    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'service_type',
        'serviceType',
        'type',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'id',
      );
      if (!partitionId || !partitionIds.has(partitionId)) {
        continue;
      }
      const nodeId = firstStringField(
        serviceRow,
        COLUMN.NODE_ID,
        'node_id',
        'nodeId',
      );
      if (nodeId !== this.nodeId) {
        continue;
      }
      const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
      if (String(status || '').toLowerCase() !== STATUS_ACTIVE) {
        continue;
      }
      localPartitionIds.add(partitionId);
    }
    return localPartitionIds;
  }

  /**
   * Resolve one node-local partition-services registry.
   * @return {Map<string, Object>|null}
   * @private
   */
  resolveLocalPartitionServices() {
    if (this.partitionServicesProvider) {
      const provided = this.partitionServicesProvider();
      return provided instanceof Map ? provided : null;
    }
    return this.partitionServices instanceof Map ?
      this.partitionServices :
      null;
  }

  /**
   * Resolve one local partition service by partition ID.
   * @param {Map<string, Object>|null} partitionServices
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  resolveLocalPartitionService(partitionServices, partitionId) {
    if (!(partitionServices instanceof Map) || !partitionId) {
      return null;
    }
    if (partitionServices.has(partitionId)) {
      return partitionServices.get(partitionId) || null;
    }
    for (const partitionService of partitionServices.values()) {
      if (partitionService?.partitionId === partitionId) {
        return partitionService;
      }
    }
    return null;
  }

  /**
   * Build node-local CDC readiness state for active propagated system-table partitions.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  buildDiscoveryLocalPartitionCdcState(options = {}) {
    const state = {
      applies: false,
      ready: true,
      diagnosticsAvailable: true,
      missingDiagnosticsPartitionIds: [],
      noSubscriberPartitionIds: [],
      bufferedPartitionIds: [],
    };
    const localTargetPartitionIds = options.localTargetPartitionIds;
    const tableName = String(options.tableName || '');
    if (options.cdcReadinessApplies !== true ||
        !isTableCdcReadinessRelevant(tableName) ||
        !(localTargetPartitionIds instanceof Set) ||
        localTargetPartitionIds.size === NUM.ZERO) {
      return state;
    }

    const partitionServices = this.resolveLocalPartitionServices();
    if (!(partitionServices instanceof Map)) {
      return state;
    }

    state.applies = true;
    for (const partitionId of localTargetPartitionIds) {
      const partitionService = this.resolveLocalPartitionService(
        partitionServices,
        partitionId,
      );
      if (!partitionService ||
          typeof partitionService.getCDCSubscriptionDiagnostics !== TYPEOF.FUNCTION) {
        state.ready = false;
        state.diagnosticsAvailable = false;
        state.missingDiagnosticsPartitionIds.push(partitionId);
        continue;
      }

      const diagnostics = partitionService.getCDCSubscriptionDiagnostics();
      if (!diagnostics || typeof diagnostics !== TYPEOF.OBJECT) {
        state.ready = false;
        state.diagnosticsAvailable = false;
        state.missingDiagnosticsPartitionIds.push(partitionId);
        continue;
      }

      const subscriberCount = Number(diagnostics.subscriberCount || NUM.ZERO);
      const bufferedEvents = Number(diagnostics.bufferedEvents || NUM.ZERO);
      const replayInFlight = diagnostics.bufferReplayInFlight === true;
      if (subscriberCount <= NUM.ZERO) {
        state.ready = false;
        state.noSubscriberPartitionIds.push(partitionId);
      }
      if (bufferedEvents > NUM.ZERO || replayInFlight) {
        state.ready = false;
        state.bufferedPartitionIds.push(partitionId);
      }
    }

    state.missingDiagnosticsPartitionIds = uniqueSorted(
      state.missingDiagnosticsPartitionIds,
    );
    state.noSubscriberPartitionIds = uniqueSorted(
      state.noSubscriberPartitionIds,
    );
    state.bufferedPartitionIds = uniqueSorted(
      state.bufferedPartitionIds,
    );
    return state;
  }

  /**
   * Build per-node local target-replica readiness for table-scoped discovery.
   * Nodes without local target replicas are intentionally omitted so routed
   * benchmark traffic can still use them when cluster routing is otherwise
   * healthy.
   *
   * @param {Set<string>} partitionIds
   * @param {Array<Object>} serviceRows
   * @return {Map<string, {nonVoterPartitionIds: Set<string>}>}
   * @private
   */
  buildDiscoveryLocalTargetReplicaStateByNodeId(partitionIds, serviceRows) {
    const stateByNodeId = new Map();
    if (!(partitionIds instanceof Set) || partitionIds.size === NUM.ZERO) {
      return stateByNodeId;
    }

    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'service_type',
        'serviceType',
        'type',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'id',
      );
      if (!partitionId || !partitionIds.has(partitionId)) {
        continue;
      }
      const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
      if (String(status || '').toLowerCase() !== STATUS_ACTIVE) {
        continue;
      }
      const nodeId = firstStringField(
        serviceRow,
        COLUMN.NODE_ID,
        'node_id',
        'nodeId',
      );
      if (!nodeId) {
        continue;
      }

      const nodeState = stateByNodeId.get(nodeId) || {
        nonVoterPartitionIds: new Set(),
        replicaRoles: new Set(),
      };
      const raftRole = String(firstStringField(
        serviceRow,
        COLUMN.RAFT_ROLE,
        'raft_role',
        'raftRole',
      ) || EMPTY_STRING).toLowerCase();
      if (raftRole.length > NUM.ZERO) {
        nodeState.replicaRoles.add(raftRole);
      }
      if (!isActiveVoterReadyPartitionReplica(serviceRow)) {
        nodeState.nonVoterPartitionIds.add(partitionId);
      }
      stateByNodeId.set(nodeId, nodeState);
    }

    return stateByNodeId;
  }

  /**
   * Resolve partition context for optional table-scoped readiness.
   * @param {string|null} tableName
   * @param {string|null} tableId
   * @param {Array<Object>} partitionRows
   * @param {Array<Object>} tableRows
   * @return {{tableFound: boolean, partitionIds: Set<string>, appliedSchemaVersion: string|null, cdcReadinessApplies: boolean}}
   * @private
   */
  resolveDiscoveryTablePartitionContext(tableName, tableId, partitionRows, tableRows) {
    if (!tableName && !tableId) {
      return {
        tableFound: true,
        partitionIds: new Set(),
        appliedSchemaVersion: null,
        cdcReadinessApplies: false,
      };
    }

    const tableIds = new Set();
    let appliedSchemaVersion = null;
    let cdcReadinessApplies = false;
    for (const tableRow of tableRows) {
      const rowTableName = firstStringField(
        tableRow,
        COLUMN.TABLE_NAME,
        'table_name',
        'tableName',
        'name',
      );
      const rowTableId = firstStringField(
        tableRow,
        COLUMN.TABLE_ID,
        'table_id',
        'tableId',
        'id',
      );
      const matchesTableName = tableName && rowTableName === tableName;
      const matchesTableId = tableId && rowTableId === tableId;
      if (!matchesTableName && !matchesTableId) {
        continue;
      }
      if (rowTableId) {
        tableIds.add(rowTableId);
      }
      if (isTableCdcReadinessRelevant(rowTableName)) {
        cdcReadinessApplies = true;
      }
      const rowSchemaVersion = extractSchemaVersionFromRecord(tableRow);
      appliedSchemaVersion = selectNewestSchemaVersion(
        appliedSchemaVersion,
        rowSchemaVersion,
      );
    }
    if (tableId) {
      tableIds.add(tableId);
    }

    const partitionIds = new Set();
    for (const partitionRow of partitionRows) {
      const partitionId = firstStringField(
        partitionRow,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'id',
      );
      if (!partitionId) {
        continue;
      }
      const rowTableName = firstStringField(
        partitionRow,
        COLUMN.TABLE_NAME,
        'table_name',
        'tableName',
        'name',
      );
      const rowTableId = firstStringField(
        partitionRow,
        COLUMN.TABLE_ID,
        'table_id',
        'tableId',
      );
      const matchesTableName = tableName && rowTableName === tableName;
      const matchesTableId = rowTableId && tableIds.has(rowTableId);
      if (matchesTableName || matchesTableId) {
        partitionIds.add(partitionId);
        const rowSchemaVersion = extractSchemaVersionFromRecord(partitionRow);
        appliedSchemaVersion = selectNewestSchemaVersion(
          appliedSchemaVersion,
          rowSchemaVersion,
        );
      }
    }

    return {
      tableFound: partitionIds.size > NUM.ZERO,
      partitionIds,
      appliedSchemaVersion,
      cdcReadinessApplies,
    };
  }

  /**
   * Resolve table-scope schema readiness from active partition coverage.
   * @param {Set<string>} partitionIds
   * @param {Array<Object>} serviceRows
   * @return {boolean}
   * @private
   */
  resolveDiscoverySchemaReady(partitionIds, serviceRows) {
    if (!(partitionIds instanceof Set) || partitionIds.size === NUM.ZERO) {
      return false;
    }

    const readyPartitionIds = new Set();
    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'service_type',
        'serviceType',
        'type',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'id',
      );
      if (!partitionId || !partitionIds.has(partitionId)) {
        continue;
      }
      const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
      if (String(status || '').toLowerCase() !== STATUS_ACTIVE) {
        continue;
      }
      const nodeId = firstStringField(
        serviceRow,
        COLUMN.NODE_ID,
        'node_id',
        'nodeId',
      );
      if (!nodeId) {
        continue;
      }
      readyPartitionIds.add(partitionId);
    }

    return readyPartitionIds.size === partitionIds.size;
  }

  /**
   * Resolve leader-coverage stability for target partitions.
   * @param {Set<string>} partitionIds
   * @param {Array<Object>} serviceRows
   * @return {boolean}
   * @private
   */
  resolveDiscoveryLeadershipStable(partitionIds, serviceRows) {
    if (!(partitionIds instanceof Set) || partitionIds.size === NUM.ZERO) {
      return true;
    }

    const partitionsWithLeaders = new Set();
    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'service_type',
        'serviceType',
        'type',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'id',
      );
      if (!partitionId || !partitionIds.has(partitionId)) {
        continue;
      }
      const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
      if (String(status || '').toLowerCase() !== STATUS_ACTIVE) {
        continue;
      }
      const raftRole = firstStringField(
        serviceRow,
        COLUMN.RAFT_ROLE,
        'raft_role',
        'raftRole',
      );
      if (String(raftRole || '').toLowerCase() !== LEADER_RAFT_ROLE) {
        continue;
      }
      partitionsWithLeaders.add(partitionId);
    }

    return partitionsWithLeaders.size === partitionIds.size;
  }

  /**
   * Build additive canonical readiness block for one discovery replica.
   * @param {Object} replica
   * @param {Object} readinessContext
   * @return {Object}
   * @private
   */
  buildServiceDiscoveryReplicaReadiness(replica, readinessContext) {
    const nodeId = String(replica?.nodeId || '');
    const healthyEndpoint =
      String(replica?.healthStatus || '').toLowerCase() ===
      ENDPOINT_SYNC_HEALTH.HEALTHY;
    const routingReady = healthyEndpoint &&
      readinessContext.activeNodeIds.has(nodeId);
    const schemaReady = readinessContext.tableName ?
      (readinessContext.tableFound &&
        readinessContext.schemaReady === true) :
      true;
    const localTargetReplicaState =
      readinessContext.localTargetReplicaStateByNodeId instanceof Map ?
        readinessContext.localTargetReplicaStateByNodeId.get(nodeId) :
        null;
    const localReplicaReady = !localTargetReplicaState ||
      localTargetReplicaState.nonVoterPartitionIds.size === NUM.ZERO;
    const localPartitionCdcState =
      nodeId === this.nodeId &&
      readinessContext.localPartitionCdcState &&
      typeof readinessContext.localPartitionCdcState === TYPEOF.OBJECT ?
        readinessContext.localPartitionCdcState :
        null;
    const localCdcReady = !localPartitionCdcState ||
      localPartitionCdcState.applies !== true ||
      localPartitionCdcState.ready === true;
    const operationDegradation =
      readinessContext.replicaOperationDegradationByNodeId instanceof Map ?
        readinessContext.replicaOperationDegradationByNodeId.get(nodeId) :
        null;
    const operationDegraded =
      operationDegradation?.degradationState &&
      operationDegradation.degradationState !==
        BENCHMARK_DEGRADATION_STATE.HEALTHY;
    const topologyReady = localReplicaReady &&
      localCdcReady &&
      !operationDegraded &&
      readinessContext.replicaOpsInFlight === NUM.ZERO &&
      readinessContext.leadershipStable === true;
    const benchmarkReady = routingReady && schemaReady && topologyReady;
    const workloadReady = benchmarkReady;
    const reasons = [];

    if (!routingReady) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON.ROUTING_NOT_READY,
        detail: 'endpoint unhealthy or node not ACTIVE',
      });
    }
    if (readinessContext.tableName && !readinessContext.tableFound) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON.SCHEMA_TABLE_MISSING,
        detail: 'table "' + readinessContext.tableName + '" not found',
      });
    } else if (readinessContext.tableName && !schemaReady) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON.SCHEMA_PARTITION_UNAVAILABLE,
        detail: 'table "' + readinessContext.tableName +
          '" not query-ready on node',
      });
    }
    if (readinessContext.replicaOpsInFlight > NUM.ZERO) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON.REPLICA_OPERATIONS_IN_FLIGHT,
        detail: String(readinessContext.replicaOpsInFlight),
      });
    }
    if (operationDegraded &&
        Array.isArray(operationDegradation?.reasons)) {
      for (const reason of operationDegradation.reasons) {
        reasons.push({
          code: reason.code,
          detail: reason.detail,
        });
      }
    }
    if (!readinessContext.leadershipStable) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON.LEADERSHIP_UNSTABLE,
        detail: 'leader coverage incomplete for readiness scope',
      });
    }
    if (!localReplicaReady) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON.LOCAL_REPLICA_NOT_VOTER_READY,
        detail: uniqueSorted([
          ...localTargetReplicaState.nonVoterPartitionIds,
        ]).join(','),
      });
    }
    if (localPartitionCdcState?.applies === true &&
        localPartitionCdcState.diagnosticsAvailable === false &&
        localPartitionCdcState.missingDiagnosticsPartitionIds.length > NUM.ZERO) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON.LOCAL_CDC_DIAGNOSTICS_UNAVAILABLE,
        detail: localPartitionCdcState.missingDiagnosticsPartitionIds.join(','),
      });
    }
    if (localPartitionCdcState?.applies === true &&
        localPartitionCdcState.noSubscriberPartitionIds.length > NUM.ZERO) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON.LOCAL_CDC_SUBSCRIBER_MISSING,
        detail: localPartitionCdcState.noSubscriberPartitionIds.join(','),
      });
    }
    if (localPartitionCdcState?.applies === true &&
        localPartitionCdcState.bufferedPartitionIds.length > NUM.ZERO) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON.LOCAL_CDC_BUFFER_NOT_DRAINED,
        detail: localPartitionCdcState.bufferedPartitionIds.join(','),
      });
    }

    return {
      workloadReady,
      benchmarkReady,
      routingReady,
      schemaReady,
      topologyReady,
      appliedSchemaVersion: readinessContext.tableName ?
        readinessContext.appliedSchemaVersion :
        null,
      replicaOpsInFlight: readinessContext.replicaOpsInFlight,
      leadershipStable: readinessContext.leadershipStable,
      tableName: readinessContext.tableName,
      reasons,
    };
  }

  /**
   * Build canonical benchmark-admission block for one discovery replica.
   * @param {Object} replica
   * @param {Object} readinessContext
   * @param {Object} readiness
   * @return {Object}
   * @private
   */
  buildServiceDiscoveryReplicaBenchmarkAdmission(
    replica,
    readinessContext,
    readiness,
  ) {
    const nodeId = String(replica?.nodeId || EMPTY_STRING);
    const operationDegradation =
      readinessContext.replicaOperationDegradationByNodeId instanceof Map ?
        readinessContext.replicaOperationDegradationByNodeId.get(nodeId) :
        null;
    const localTargetReplicaState =
      readinessContext.localTargetReplicaStateByNodeId instanceof Map ?
        readinessContext.localTargetReplicaStateByNodeId.get(nodeId) :
        null;
    let localReplicaRole = null;
    if (localTargetReplicaState?.replicaRoles instanceof Set &&
        localTargetReplicaState.replicaRoles.size === NUM.ONE) {
      localReplicaRole = [...localTargetReplicaState.replicaRoles][NUM.ZERO];
    } else if (localTargetReplicaState?.replicaRoles instanceof Set &&
        localTargetReplicaState.replicaRoles.size > NUM.ONE) {
      localReplicaRole = 'mixed';
    }

    const reasons = Array.isArray(readiness?.reasons) ?
      readiness.reasons.map((reason) => ({
        code: String(reason?.code || EMPTY_STRING),
        detail:
          typeof reason?.detail === TYPEOF.STRING && reason.detail.length > NUM.ZERO ?
            reason.detail :
            null,
      })) :
      [];

    return {
      tableName: readiness?.tableName || null,
      nodeId,
      state: readiness?.benchmarkReady === true ?
        BENCHMARK_ADMISSION_STATE.READY :
        BENCHMARK_ADMISSION_STATE.BLOCKED,
      degradationState:
        operationDegradation?.degradationState ||
        BENCHMARK_DEGRADATION_STATE.HEALTHY,
      routingReady: readiness?.routingReady === true,
      schemaReady: readiness?.schemaReady === true,
      topologyReady: readiness?.topologyReady === true,
      localReplicaRole,
      degradedByOperationIds:
        Array.isArray(operationDegradation?.operationIds) ?
          [...operationDegradation.operationIds] :
          [],
      reasons,
    };
  }

  /**
   * Build per-node replica-operation degradation state for benchmark admission.
   * @param {Array<Object>} replicaOperationRows
   * @return {Map<string, Object>}
   * @private
   */
  buildDiscoveryReplicaOperationDegradationByNodeId(
    replicaOperationRows = [],
    options = {},
  ) {
    const degradationByNodeId = new Map();
    const scopedPartitionIds = options.partitionIds instanceof Set ?
      options.partitionIds :
      null;
    for (const row of replicaOperationRows) {
      if (!this.isReplicaOperationRelevantToDiscoveryScope(
        row,
        scopedPartitionIds,
      )) {
        continue;
      }
      const operationId = firstStringField(
        row,
        COLUMN.OPERATION_ID,
        'operation_id',
        'operationId',
      );
      const status = String(firstStringField(
        row,
        COLUMN.STATUS,
        'status',
      ) || EMPTY_STRING).toLowerCase();
      const type = String(firstStringField(
        row,
        'type',
        'operation_type',
        'operationType',
      ) || EMPTY_STRING).toUpperCase();
      const workflowStep = normalizeReplicaOperationWorkflowStep(row);
      const hasCompletedAt = hasMeaningfulField(
        row,
        'completed_at',
        'completedAt',
      );
      const nodeIds = uniqueSorted([
        firstStringField(row, 'source_node_id', 'sourceNodeId'),
        firstStringField(row, COLUMN.TARGET_NODE_ID, 'target_node_id', 'targetNodeId'),
      ]);
      if (!operationId || nodeIds.length === NUM.ZERO) {
        continue;
      }
      if (isReplicaOperationTerminalSuccess(type, status, workflowStep, hasCompletedAt)) {
        continue;
      }

      const degradationState = this.resolveReplicaOperationDegradationState(
        type,
        status,
      );
      if (degradationState === BENCHMARK_DEGRADATION_STATE.HEALTHY) {
        continue;
      }
      const reasonCode =
        status === 'failed' ?
          SERVICE_DISCOVERY_READINESS_REASON.REPLICA_OPERATION_FAILED :
          SERVICE_DISCOVERY_READINESS_REASON.REPLICA_OPERATION_IN_FLIGHT;
      const reasonDetail = `${operationId}:${type}:${status}`;

      for (const nodeId of nodeIds) {
        const existing = degradationByNodeId.get(nodeId) || {
          degradationState: BENCHMARK_DEGRADATION_STATE.HEALTHY,
          operationIds: [],
          reasons: [],
        };
        if ((BENCHMARK_DEGRADATION_PRIORITY[degradationState] || NUM.ZERO) >
            (BENCHMARK_DEGRADATION_PRIORITY[existing.degradationState] || NUM.ZERO)) {
          existing.degradationState = degradationState;
        }
        existing.operationIds = uniqueSorted([
          ...existing.operationIds,
          operationId,
        ]);
        if (!existing.reasons.some((reason) =>
          reason.code === reasonCode && reason.detail === reasonDetail)) {
          existing.reasons.push({
            code: reasonCode,
            detail: reasonDetail,
          });
        }
        degradationByNodeId.set(nodeId, existing);
      }
    }
    return degradationByNodeId;
  }

  /**
   * Determine whether one replica operation applies to the discovered scope.
   * Table-scoped discovery should only degrade nodes for operations that touch
   * the discovered table's target partitions.
   * @param {Object} row
   * @param {Set<string>|null} scopedPartitionIds
   * @return {boolean}
   * @private
   */
  isReplicaOperationRelevantToDiscoveryScope(row, scopedPartitionIds) {
    if (!(scopedPartitionIds instanceof Set) || scopedPartitionIds.size === NUM.ZERO) {
      return true;
    }
    const partitionId = firstStringField(
      row,
      COLUMN.PARTITION_ID,
      'partition_id',
      'partitionId',
      'entity_id',
      'entityId',
    );
    return Boolean(partitionId) && scopedPartitionIds.has(partitionId);
  }

  /**
   * Resolve one benchmark degradation state from replica-operation type/status.
   * @param {string} type
   * @param {string} status
   * @return {string}
   * @private
   */
  resolveReplicaOperationDegradationState(type, status) {
    if (!type || !status) {
      return BENCHMARK_DEGRADATION_STATE.HEALTHY;
    }
    const isFailed = status === 'failed';
    if (type === REPLICA_OPERATION_TYPE.REPLACE) {
      return isFailed ?
        BENCHMARK_DEGRADATION_STATE.MOVE_FAILED :
        BENCHMARK_DEGRADATION_STATE.MOVE_PENDING;
    }
    if (type === REPLICA_OPERATION_TYPE.ADD) {
      return isFailed ?
        BENCHMARK_DEGRADATION_STATE.PROMOTION_FAILED :
        BENCHMARK_DEGRADATION_STATE.PROMOTION_PENDING;
    }
    if (type === REPLICA_OPERATION_TYPE.REMOVE) {
      return BENCHMARK_DEGRADATION_STATE.DRAIN_BLOCKED;
    }
    return BENCHMARK_DEGRADATION_STATE.HEALTHY;
  }

  /**
   * Build bounded preflight critical-path snapshot from node-local diagnostics.
   * @return {Object}
   * @private
   */
  buildLocalPreflightCriticalPathSnapshot() {
    const capturedAtMs = Date.now();
    const nodeAddress = this.resolvePreflightSnapshotNodeAddress();
    const routerConnectivity = this.buildPreflightRouterConnectivitySummary();
    const controlPlanePartitions = this.buildPreflightControlPlanePartitionsSummary();
    const cdcHealth = this.buildPreflightCdcHealthSummary();
    const cacheFreshness = this.buildPreflightCacheFreshnessSummary({
      capturedAtMs,
    });
    const rowCounts = this.buildPreflightRowCountsSummary();
    const discovery = this.buildPreflightDiscoverySummary();

    return {
      schemaVersion: ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.SCHEMA_VERSION,
      capturedAtMs,
      nodeId: this.nodeId,
      address: nodeAddress,
      routerConnectivity,
      controlPlanePartitions,
      cdcHealth,
      cacheFreshness,
      rowCounts,
      discovery,
    };
  }

  /**
   * Resolve local preflight critical-path snapshot with bounded authoritative repair.
   * @return {Promise<Object>}
   * @private
   */
  async resolvePreflightCriticalPathSnapshot() {
    const snapshot = this.buildLocalPreflightCriticalPathSnapshot();
    if (!this.shouldAttemptAuthoritativePreflightRepair(snapshot)) {
      return snapshot;
    }
    const repair = await this.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'preflight_critical_path_snapshot',
    });
    if (repair.applied !== true) {
      return snapshot;
    }
    return this.buildLocalPreflightCriticalPathSnapshot();
  }

  /**
   * Determine whether preflight snapshot warrants authoritative cache repair.
   * @param {Object} snapshot
   * @return {boolean}
   * @private
   */
  shouldAttemptAuthoritativePreflightRepair(snapshot) {
    if (!this.systemTableCache ||
        !this.cacheMutationTarget ||
        typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION ||
        !this.sqlQueryEngine ||
        typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION) {
      return false;
    }
    const stalenessMs = Number(snapshot?.cacheFreshness?.stalenessMs);
    if (Number.isFinite(stalenessMs) &&
        stalenessMs >= AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS) {
      return true;
    }
    const selectedNodeIds = Array.isArray(snapshot?.discovery?.selectedNodeIds) ?
      snapshot.discovery.selectedNodeIds :
      ADMIN_CACHE_DUMP.EMPTY;
    const serviceEndpointsCount = Number(snapshot?.rowCounts?.serviceEndpointsCount);
    if (selectedNodeIds.length === NUM.ZERO &&
        Number.isFinite(serviceEndpointsCount) &&
        Math.floor(serviceEndpointsCount) > NUM.ZERO) {
      return true;
    }
    return false;
  }

  /**
   * Resolve best-effort node address for preflight snapshots.
   * @return {string}
   * @private
   */
  resolvePreflightSnapshotNodeAddress() {
    const routerAddress = typeof this.messageRouter?.nodeAddress === TYPEOF.STRING ?
      this.messageRouter.nodeAddress :
      null;
    if (routerAddress) {
      return routerAddress;
    }

    if (this.systemTableCache &&
        typeof this.systemTableCache.getAll === TYPEOF.FUNCTION) {
      const nodes = this.systemTableCache.getAll(TABLES.NODES);
      const localRow = nodes.find((row) =>
        firstStringField(row, COLUMN.NODE_ID, 'id') === this.nodeId,
      );
      const address = firstStringField(localRow, COLUMN.NODE_ADDRESS, 'address');
      if (address) {
        return address;
      }
    }

    return this.nodeId || ADMIN_DEFAULT.NODE_ID;
  }

  /**
   * Summarize message-router connectivity by coarse state buckets.
   * @return {Object}
   * @private
   */
  buildPreflightRouterConnectivitySummary() {
    const defaultSummary = {
      connectedCount: NUM.ZERO,
      reconnectingCount: NUM.ZERO,
      disconnectedCount: NUM.ZERO,
    };
    if (!this.messageRouter ||
        typeof this.messageRouter.getStats !== TYPEOF.FUNCTION) {
      return defaultSummary;
    }

    const stats = this.messageRouter.getStats();
    const connections = stats?.connections && typeof stats.connections === TYPEOF.OBJECT ?
      stats.connections :
      {};
    let connectedCount = NUM.ZERO;
    let reconnectingCount = NUM.ZERO;
    let disconnectedCount = NUM.ZERO;
    for (const [nodeId, info] of Object.entries(connections)) {
      if (!nodeId || nodeId === this.nodeId) {
        continue;
      }
      const state = String(info?.state || EMPTY_STRING)
        .trim()
        .toLowerCase();
      if (state === CONNECTION_STATE.CONNECTED) {
        connectedCount += NUM.ONE;
      } else if (state === CONNECTION_STATE.RECONNECTING) {
        reconnectingCount += NUM.ONE;
      } else {
        disconnectedCount += NUM.ONE;
      }
    }
    return {
      connectedCount,
      reconnectingCount,
      disconnectedCount,
    };
  }

  /**
   * Summarize leadership/health for control-plane partitions required for discovery.
   * @return {Object}
   * @private
   */
  buildPreflightControlPlanePartitionsSummary() {
    const partitionTables = [
      TABLES.NODES,
      TABLES.SERVICES,
      TABLES.NODE_ENDPOINTS,
      TABLES.SERVICE_ENDPOINTS,
    ];
    const summary = {};
    for (const tableName of partitionTables) {
      summary[tableName] = this.buildPreflightControlPlanePartitionEntry(tableName);
    }
    return summary;
  }

  buildPreflightControlPlanePartitionEntry(tableName) {
    const partitionId = INITIAL_PARTITION_IDS[tableName] || null;
    if (!partitionId) {
      return {
        leaderKnown: false,
        leaderNodeId: null,
        isLeaderLocal: false,
        lastErrorCode: 'partition_id_unknown',
      };
    }

    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return {
        leaderKnown: false,
        leaderNodeId: null,
        isLeaderLocal: false,
        lastErrorCode: 'cache_unavailable',
      };
    }

    const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
    const partitionRow = partitionRows.find((row) =>
      row?.[COLUMN.PARTITION_ID] === partitionId,
    );
    if (!partitionRow) {
      return {
        leaderKnown: false,
        leaderNodeId: null,
        isLeaderLocal: false,
        lastErrorCode: 'partition_row_missing',
      };
    }

    const serviceRows = this.systemTableCache.getAll(TABLES.SERVICES);
    const requiresAddress = tableName !== TABLES.SERVICES;
    const leaderService = serviceRows.find((service) => {
      if (service?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE_PARTITION) {
        return false;
      }
      if (service?.[COLUMN.PARTITION_ID] !== partitionId) {
        return false;
      }
      if (String(service?.[COLUMN.RAFT_ROLE] || EMPTY_STRING)
        .toLowerCase() !== LEADER_RAFT_ROLE) {
        return false;
      }
      if (String(service?.[COLUMN.STATUS] || EMPTY_STRING)
        .toLowerCase() !== STATUS_ACTIVE) {
        return false;
      }
      if (requiresAddress && !service?.[COLUMN.ADDRESS]) {
        return false;
      }
      return true;
    });
    if (!leaderService) {
      return {
        leaderKnown: false,
        leaderNodeId: null,
        isLeaderLocal: false,
        lastErrorCode: 'leader_service_missing',
      };
    }

    const leaderNodeId = firstStringField(
      partitionRow,
      COLUMN.LEADER_NODE_ID,
    ) ||
      firstStringField(leaderService, COLUMN.NODE_ID, 'nodeId');
    if (!leaderNodeId) {
      return {
        leaderKnown: false,
        leaderNodeId: null,
        isLeaderLocal: false,
        lastErrorCode: 'leader_node_id_missing',
      };
    }

    return {
      leaderKnown: true,
      leaderNodeId,
      isLeaderLocal: leaderNodeId === this.nodeId,
      lastErrorCode: null,
    };
  }

  /**
   * Summarize CDC/mutation pipeline health.
   * @return {Object}
   * @private
   */
  buildPreflightCdcHealthSummary() {
    let bufferDepth = NUM.ZERO;
    let retryCount = NUM.ZERO;
    if (this.messageRouter &&
        typeof this.messageRouter.getStats === TYPEOF.FUNCTION) {
      const stats = this.messageRouter.getStats();
      const outboundQueues = stats?.outboundQueues &&
        typeof stats.outboundQueues === TYPEOF.OBJECT ?
        stats.outboundQueues :
        {};
      for (const queue of Object.values(outboundQueues)) {
        bufferDepth += Number(queue?.pending || NUM.ZERO);
      }
      const connections = stats?.connections &&
        typeof stats.connections === TYPEOF.OBJECT ?
        stats.connections :
        {};
      for (const conn of Object.values(connections)) {
        retryCount += Number(conn?.reconnectAttempts || NUM.ZERO);
      }
    }
    return {
      bufferDepth: Number.isFinite(bufferDepth) ?
        Math.max(NUM.ZERO, Math.floor(bufferDepth)) :
        NUM.ZERO,
      retryCount: Number.isFinite(retryCount) ?
        Math.max(NUM.ZERO, Math.floor(retryCount)) :
        NUM.ZERO,
      lastErrorCode: null,
      lastForwardAttemptAtMs: null,
    };
  }

  /**
   * Summarize cache freshness/watermark relevant to readiness.
   * @param {Object} options
   * @param {number} options.capturedAtMs
   * @return {Object}
   * @private
   */
  buildPreflightCacheFreshnessSummary(options) {
    const capturedAtMs = Number(options?.capturedAtMs);
    const lastAppliedAtMs = typeof this.systemTableCache?.getLastAppliedAtMs === TYPEOF.FUNCTION ?
      this.systemTableCache.getLastAppliedAtMs(TABLES.SERVICE_ENDPOINTS) :
      null;
    const tableNames = [
      TABLES.SERVICES,
      TABLES.NODE_ENDPOINTS,
      TABLES.SERVICE_ENDPOINTS,
    ];
    const lastAppliedCauseIdByTableName = {};
    for (const tableName of tableNames) {
      lastAppliedCauseIdByTableName[tableName] =
        typeof this.systemTableCache?.getLastAppliedCauseId === TYPEOF.FUNCTION ?
          this.systemTableCache.getLastAppliedCauseId(tableName) :
          null;
    }
    const appliedSchemaVersion = typeof this.systemTableCache?.getAppliedSchemaVersion ===
      TYPEOF.FUNCTION ?
      normalizeSchemaVersionValue(
        this.systemTableCache.getAppliedSchemaVersion(TABLES.SERVICE_ENDPOINTS),
      ) :
      null;
    const numericLastAppliedAtMs = Number(lastAppliedAtMs);
    const hasNumericLastAppliedAtMs =
      lastAppliedAtMs !== null &&
      typeof lastAppliedAtMs !== TYPEOF.UNDEFINED &&
      Number.isFinite(numericLastAppliedAtMs);
    const stalenessMs = Number.isFinite(capturedAtMs) &&
      hasNumericLastAppliedAtMs ?
      Math.max(NUM.ZERO, Math.floor(capturedAtMs - numericLastAppliedAtMs)) :
      null;
    return {
      lastAppliedAtMs: hasNumericLastAppliedAtMs ?
        Math.floor(numericLastAppliedAtMs) :
        null,
      appliedSchemaVersion,
      stalenessMs,
      lastAppliedCauseIdByTableName,
    };
  }

  /**
   * Summarize control-plane row counts relevant to readiness.
   * @return {Object}
   * @private
   */
  buildPreflightRowCountsSummary() {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return {
        sysPostgresWireServiceCount: NUM.ZERO,
        nodeEndpointsCount: NUM.ZERO,
        serviceEndpointsCount: NUM.ZERO,
      };
    }

    const serviceDefinitionRows =
      this.systemTableCache.getAll(TABLES.SERVICE_DEFINITIONS);
    const sysPostgresWireServiceCount = serviceDefinitionRows.filter((row) =>
      row?.[COLUMN.SERVICE_ID] === META_SERVICE_ID.POSTGRES_WIRE,
    ).length;

    const nodeEndpointsCount =
      typeof this.systemTableCache.count === TYPEOF.FUNCTION ?
        this.systemTableCache.count(TABLES.NODE_ENDPOINTS) :
        this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS).length;
    const serviceEndpointsCount =
      typeof this.systemTableCache.count === TYPEOF.FUNCTION ?
        this.systemTableCache.count(TABLES.SERVICE_ENDPOINTS) :
        this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS).length;

    return {
      sysPostgresWireServiceCount,
      nodeEndpointsCount,
      serviceEndpointsCount,
    };
  }

  /**
   * Summarize strict discovery selection/exclusion from local service discovery state.
   * @return {Object}
   * @private
   */
  buildPreflightDiscoverySummary() {
    try {
      const snapshot = this.buildLocalServiceDiscoverySnapshot({
        serviceIdAllowlist: [META_SERVICE_ID.POSTGRES_WIRE],
      });
      const selectedNodeIds = [];
      const excludedByNodeId = {};

      const services = Array.isArray(snapshot?.services) ? snapshot.services : [];
      for (const service of services) {
        const replicas = Array.isArray(service?.replicas) ? service.replicas : [];
        for (const replica of replicas) {
          const nodeId = typeof replica?.nodeId === TYPEOF.STRING ?
            replica.nodeId :
            null;
          if (!nodeId) {
            continue;
          }
          const readiness = replica?.readiness || null;
          const reasons = Array.isArray(readiness?.reasons) ? readiness.reasons : [];
          const reasonCodes = uniqueSorted(reasons
            .map((reason) => String(reason?.code || EMPTY_STRING))
            .filter(Boolean));
          if (reasonCodes.length === NUM.ZERO) {
            selectedNodeIds.push(nodeId);
          } else {
            excludedByNodeId[nodeId] = reasonCodes;
          }
        }
      }

      return {
        selectedNodeIds: uniqueSorted(selectedNodeIds),
        excludedByNodeId,
      };
    } catch (_error) {
      return {
        selectedNodeIds: ADMIN_CACHE_DUMP.EMPTY,
        excludedByNodeId: {},
      };
    }
  }

  /**
   * Perform bounded authoritative cache repair for discovery-critical tables.
   * @param {Object} [options={}]
   * @return {Promise<{applied: boolean, skipped: boolean, tableCount: number}>}
   * @private
   */
  async ensureAuthoritativeDiscoveryCacheRepair(options = {}) {
    if (!this.systemTableCache ||
        !this.cacheMutationTarget ||
        typeof this.cacheMutationTarget.applySystemTableChange !== TYPEOF.FUNCTION ||
        !this.sqlQueryEngine ||
        typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION) {
      return {
        applied: false,
        skipped: true,
        tableCount: NUM.ZERO,
      };
    }

    const now = Date.now();
    if (this.authoritativeDiscoveryRepairPromise) {
      return this.authoritativeDiscoveryRepairPromise;
    }
    if (now - this.lastAuthoritativeDiscoveryRepairAtMs <
      AUTHORITATIVE_DISCOVERY_REPAIR.COOLDOWN_MS) {
      return {
        applied: false,
        skipped: true,
        tableCount: NUM.ZERO,
      };
    }

    const runRepair = async () => {
      const causeId =
        'admin-authoritative-discovery-repair:' +
        String(options.reason || 'unknown') +
        ':' + String(now);
      const queryResults = await Promise.allSettled(
        AUTHORITATIVE_DISCOVERY_REPAIR.TABLES.map(async (tableName) => {
          const queryResult = await this.executeSqlRequestWithTimeout(
            createSqlRequest({
              statement: `SELECT * FROM ${tableName}`,
              parameters: ADMIN_CACHE_DUMP.EMPTY,
              sessionId:
                `${String(options.reason || 'repair')}:${tableName}:${now}`,
              executionMode: EXECUTION_MODE.SQL_STATEMENT,
            }),
            AUTHORITATIVE_DISCOVERY_REPAIR.QUERY_TIMEOUT_MS,
          );
          if (queryResult?.success === false) {
            throw new Error(queryResult.error || 'authoritative_query_failed');
          }
          return {
            tableName,
            rows: Array.isArray(queryResult?.rows) ?
              queryResult.rows :
              ADMIN_CACHE_DUMP.EMPTY,
          };
        }),
      );

      let repairedTableCount = NUM.ZERO;
      let repairedRowCount = NUM.ZERO;
      const errors = [];
      for (const result of queryResults) {
        if (result.status !== 'fulfilled') {
          errors.push(String(result.reason?.message || result.reason || 'unknown_error'));
          continue;
        }
        repairedRowCount += this.applyAuthoritativeSystemTableRows(
          result.value.tableName,
          result.value.rows,
          causeId,
        );
        repairedTableCount += NUM.ONE;
      }

      this.lastAuthoritativeDiscoveryRepairAtMs = Date.now();
      if (errors.length > NUM.ZERO) {
        this.logger.warn('Authoritative discovery cache repair completed with errors', {
          nodeId: this.nodeId,
          reason: options.reason || null,
          tableName: options.tableName || null,
          tableId: options.tableId || null,
          repairedTableCount,
          repairedRowCount,
          errorCount: errors.length,
          errors,
        });
      } else {
        this.logger.info('Authoritative discovery cache repair completed', {
          nodeId: this.nodeId,
          reason: options.reason || null,
          tableName: options.tableName || null,
          tableId: options.tableId || null,
          repairedTableCount,
          repairedRowCount,
        });
      }

      return {
        applied: repairedTableCount > NUM.ZERO,
        skipped: false,
        tableCount: repairedTableCount,
      };
    };

    this.authoritativeDiscoveryRepairPromise = runRepair()
      .finally(() => {
        this.authoritativeDiscoveryRepairPromise = null;
      });
    return this.authoritativeDiscoveryRepairPromise;
  }

  /**
   * Reconcile one cached system table with authoritative query rows.
   * @param {string} tableName
   * @param {Array<Object>} rows
   * @param {string} causeId
   * @return {number}
   * @private
   */
  applyAuthoritativeSystemTableRows(tableName, rows, causeId) {
    const authoritativeRows = Array.isArray(rows) ? rows : ADMIN_CACHE_DUMP.EMPTY;
    const primaryKeyField = getSystemCachePrimaryKeyField(tableName);
    const cachedRows = this.systemTableCache.getAll(tableName);
    const authoritativeKeys = new Set();

    for (const row of authoritativeRows) {
      const key = row?.[primaryKeyField] ?? row?.id;
      if (typeof key === TYPEOF.UNDEFINED || key === null) {
        continue;
      }
      authoritativeKeys.add(key);
      this.cacheMutationTarget.applySystemTableChange(
        tableName,
        CDC_OPERATION.INSERT,
        row,
        {causeId},
      );
    }

    for (const row of cachedRows) {
      const key = row?.[primaryKeyField] ?? row?.id;
      if (typeof key === TYPEOF.UNDEFINED || key === null ||
          authoritativeKeys.has(key)) {
        continue;
      }
      this.cacheMutationTarget.applySystemTableChange(
        tableName,
        CDC_OPERATION.DELETE,
        row,
        {causeId},
      );
    }

    return authoritativeRows.length;
  }

  /**
   * Build canonical query_result payload for preflight critical-path snapshot query.
   * @return {Object}
   * @private
   */
  async buildPreflightCriticalPathSnapshotQueryResult() {
    const snapshot = await this.resolvePreflightCriticalPathSnapshot();
    return {
      success: true,
      rows: [snapshot],
      count: NUM.ONE,
      partitions: ADMIN_CACHE_DUMP.EMPTY,
      tableName: ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.TABLE_NAME,
    };
  }

  /**
   * Build local control snapshot payload from system cache only.
   * @return {Object}
   * @private
   */
  buildLocalControlSnapshot() {
    if (!this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      throw new Error(ADMIN_ERROR_MESSAGE.CONTROL_SNAPSHOT_UNAVAILABLE);
    }

    const nodeRows = this.systemTableCache.getAll(TABLES.NODES);
    const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
    const serviceRows = this.systemTableCache.getAll(TABLES.SERVICES);
    const replicaOperationRows =
      this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);

    const nodeIds = uniqueSorted(nodeRows
      .map((row) => firstStringField(row, COLUMN.NODE_ID, 'id'))
      .filter(Boolean));
    const partitionIds = uniqueSorted(partitionRows
      .map((row) => firstStringField(row, COLUMN.PARTITION_ID, 'id'))
      .filter(Boolean));

    const leaderSummary = this.buildControlSnapshotLeaderSummary(
      partitionRows,
      serviceRows,
    );
    const voterCounts = this.buildControlSnapshotVoterCounts(serviceRows);
    const replicaOperations =
      this.buildControlSnapshotReplicaOperationSummary(replicaOperationRows);

    return {
      schemaVersion: ADMIN_CONTROL_SNAPSHOT.SCHEMA_VERSION,
      nodeId: this.nodeId,
      capturedAt: Date.now(),
      nodes: nodeIds,
      partitions: partitionIds,
      cdcTelemetry: this.buildLocalCdcTelemetry(),
      leaders: leaderSummary.leaders,
      replicaRoles: leaderSummary.replicaRoles,
      replicaRoleDiagnostics: leaderSummary.replicaRoleDiagnostics,
      voterCounts,
      replicaOperations,
    };
  }

  /**
   * Build canonical leader summary from owner rows plus replica-role detail.
   * Canonical leader identity comes from partitions.leader_node_id.
   * Replica rows are attached only as supporting diagnostics.
   * @param {Array<Object>} partitionRows
   * @param {Array<Object>} serviceRows
   * @return {Object}
   * @private
   */
  buildControlSnapshotLeaderSummary(partitionRows = [], serviceRows = []) {
    const leaders = {};
    const replicaRoles = {};
    const replicaLeaderNodeIdsByPartition = new Map();

    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'type',
        'serviceType',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }

      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partitionId',
      );
      if (!partitionId) {
        continue;
      }

      const raftRole = firstStringField(
        serviceRow,
        COLUMN.RAFT_ROLE,
        'raftRole',
      );
      const normalizedRaftRole = String(raftRole || '').toLowerCase();
      if (!normalizedRaftRole) {
        continue;
      }

      const replicaId = firstStringField(
        serviceRow,
        COLUMN.REPLICA_ID,
        COLUMN.SERVICE_ID,
        'replicaId',
        'id',
      );
      if (!replicaId) {
        continue;
      }
      replicaRoles[partitionId] = replicaRoles[partitionId] || {};
      replicaRoles[partitionId][replicaId] = normalizedRaftRole;

      if (normalizedRaftRole !== LEADER_RAFT_ROLE) {
        continue;
      }

      const leaderNodeId = firstStringField(
        serviceRow,
        COLUMN.LEADER_NODE_ID,
        COLUMN.NODE_ID,
        'nodeId',
      );
      if (!leaderNodeId) {
        continue;
      }
      let partitionLeaderNodeIds = replicaLeaderNodeIdsByPartition.get(partitionId);
      if (!partitionLeaderNodeIds) {
        partitionLeaderNodeIds = new Set();
        replicaLeaderNodeIdsByPartition.set(partitionId, partitionLeaderNodeIds);
      }
      partitionLeaderNodeIds.add(leaderNodeId);
    }

    const replicaRoleDiagnostics = {};
    for (const partitionRow of partitionRows) {
      const partitionId = firstStringField(
        partitionRow,
        COLUMN.PARTITION_ID,
        'partitionId',
        'id',
      );
      if (!partitionId) {
        continue;
      }

      const canonicalLeaderNodeId = firstStringField(
        partitionRow,
        COLUMN.LEADER_NODE_ID,
        'leaderNodeId',
      );
      if (canonicalLeaderNodeId) {
        leaders[partitionId] = canonicalLeaderNodeId;
      }

      const replicaLeaderNodeIds = uniqueSorted(Array.from(
        replicaLeaderNodeIdsByPartition.get(partitionId) || [],
      ));
      const inconsistentReplicaRoles = replicaLeaderNodeIds.length > NUM.ONE ||
        (canonicalLeaderNodeId &&
          replicaLeaderNodeIds.length > NUM.ZERO &&
          !replicaLeaderNodeIds.includes(canonicalLeaderNodeId));

      replicaRoleDiagnostics[partitionId] = {
        canonicalLeaderNodeId: canonicalLeaderNodeId || null,
        source: TABLES.PARTITIONS,
        inconsistentReplicaRoles,
        replicaLeaderNodeIds,
        issues: inconsistentReplicaRoles ?
          [CONSISTENCY_MISMATCH_KIND.REPLICA_ROLE] :
          [],
      };
    }

    return {
      leaders,
      replicaRoles,
      replicaRoleDiagnostics,
    };
  }

  /**
   * Build voter-count map per partition from local services rows.
   * @param {Array<Object>} serviceRows
   * @return {Object}
   * @private
   */
  buildControlSnapshotVoterCounts(serviceRows = []) {
    const voterCounts = {};
    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'type',
        'serviceType',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }

      const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
      if (String(status || '').toLowerCase() !== STATUS_ACTIVE) {
        continue;
      }

      const raftRole = firstStringField(serviceRow, COLUMN.RAFT_ROLE, 'raftRole');
      const normalizedRaftRole = String(raftRole || '').toLowerCase();
      if (!normalizedRaftRole || !isLoadReadyReplicaRaftRole(normalizedRaftRole)) {
        continue;
      }

      const address = firstStringField(
        serviceRow,
        COLUMN.ADDRESS,
        'address',
      );
      if (!address) {
        continue;
      }

      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partitionId',
      );
      if (!partitionId) {
        continue;
      }

      voterCounts[partitionId] = (voterCounts[partitionId] || NUM.ZERO) + NUM.ONE;
    }
    return voterCounts;
  }

  /**
   * Build replica operation in-flight summary.
   * @param {Array<Object>} replicaOperationRows
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildControlSnapshotReplicaOperationSummary(replicaOperationRows = [], options = {}) {
    const scopedPartitionIds =
      options.partitionIds instanceof Set && options.partitionIds.size > NUM.ZERO ?
        options.partitionIds :
        null;
    const statusHistogram = {};
    let inFlightCount = NUM.ZERO;
    const partitionGroupInFlight = {};
    for (const row of replicaOperationRows) {
      const partitionGroupId = firstStringField(
        row,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'entity_id',
        'entityId',
      ) || STATUS_UNKNOWN;
      if (scopedPartitionIds && !scopedPartitionIds.has(partitionGroupId)) {
        continue;
      }
      const status = firstStringField(row, COLUMN.STATUS, 'status') ||
        STATUS_UNKNOWN;
      statusHistogram[status] = (statusHistogram[status] || NUM.ZERO) + NUM.ONE;
      if (!ADMIN_CONTROL_SNAPSHOT.IN_FLIGHT_EXCLUDED_STATUSES.includes(status)) {
        inFlightCount += NUM.ONE;
        partitionGroupInFlight[partitionGroupId] =
          (partitionGroupInFlight[partitionGroupId] || NUM.ZERO) + NUM.ONE;
      }
    }

    return {
      inFlightCount,
      statusHistogram,
      partitionGroupInFlight,
    };
  }

  /**
   * Build node-local CDC telemetry with authoritative fallback diagnostics.
   * @return {Object}
   * @private
   */
  buildLocalCdcTelemetry() {
    const partitionServices = this.resolveLocalPartitionServices();
    let subscriberCount = NUM.ZERO;
    let bufferedEvents = NUM.ZERO;
    let catchupLagEvents = NUM.ZERO;
    let catchupThroughputEventsPerSec = NUM.ZERO;
    let catchupDetected = false;

    if (partitionServices instanceof Map) {
      for (const partitionService of partitionServices.values()) {
        if (!partitionService ||
            typeof partitionService.getCDCSubscriptionDiagnostics !== TYPEOF.FUNCTION) {
          continue;
        }
        const diagnostics = partitionService.getCDCSubscriptionDiagnostics();
        if (!diagnostics || typeof diagnostics !== TYPEOF.OBJECT) {
          continue;
        }
        const partitionSubscriberCount = Number(diagnostics.subscriberCount || NUM.ZERO);
        const partitionBufferedEvents = Number(diagnostics.bufferedEvents || NUM.ZERO);
        subscriberCount += partitionSubscriberCount;
        bufferedEvents += partitionBufferedEvents;
        catchupLagEvents = Math.max(catchupLagEvents, partitionBufferedEvents);
        if (partitionBufferedEvents > NUM.ZERO ||
            diagnostics.bufferReplayInFlight === true) {
          catchupDetected = true;
        }
      }
    }

    const authoritativeFallback =
      typeof this.cdcIntegrationService?.getAuthoritativeFallbackDiagnostics ===
        TYPEOF.FUNCTION ?
        this.cdcIntegrationService.getAuthoritativeFallbackDiagnostics() :
        {
          schemaVersion: NUM.ONE,
          nodeId: this.nodeId,
          windowMs: 60 * 1000,
          totalCount: NUM.ZERO,
          windowCount: NUM.ZERO,
          windowRatePerMinute: NUM.ZERO,
          phases: {
            bootstrap: {windowCount: NUM.ZERO, totalCount: NUM.ZERO},
            recovery: {windowCount: NUM.ZERO, totalCount: NUM.ZERO},
            steady_state: {windowCount: NUM.ZERO, totalCount: NUM.ZERO},
          },
          outcomes: {
            recovered: {windowCount: NUM.ZERO, totalCount: NUM.ZERO},
            failed: {windowCount: NUM.ZERO, totalCount: NUM.ZERO},
          },
          byTable: {},
          recentEvents: ADMIN_CACHE_DUMP.EMPTY,
        };

    return {
      subscriberCount,
      bufferedEvents,
      catchupLagEvents,
      catchupThroughputEventsPerSec,
      mode: catchupDetected ?
        CDC_TELEMETRY_MODE.CATCHUP :
        CDC_TELEMETRY_MODE.STEADY,
      authoritativeFallback,
    };
  }

  /**
   * Build canonical query_result payload for control snapshot query.
   * @return {Object}
   * @private
   */
  buildControlSnapshotQueryResult() {
    const snapshot = this.buildLocalControlSnapshot();
    return {
      success: true,
      rows: [snapshot],
      count: NUM.ONE,
      partitions: ADMIN_CACHE_DUMP.EMPTY,
      tableName: ADMIN_CONTROL_SNAPSHOT.TABLE_NAME,
    };
  }

  /**
   * Build canonical query_result payload for local service discovery query.
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  async buildServiceDiscoveryQueryResult(options = {}) {
    const snapshot = await this.resolveServiceDiscoverySnapshot(options);
    return {
      success: true,
      rows: [snapshot],
      count: NUM.ONE,
      partitions: ADMIN_CACHE_DUMP.EMPTY,
      tableName: ADMIN_SERVICE_DISCOVERY.TABLE_NAME,
    };
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
  async executeSqlRequestWithTimeout(sqlRequest, timeoutMs = this.queryTimeoutMs) {
    if (!this.sqlQueryEngine ||
        typeof this.sqlQueryEngine.executeRequest !== TYPEOF.FUNCTION) {
      throw new Error(ADMIN_ERROR_MESSAGE.QUERY_ENGINE_UNAVAILABLE);
    }

    let timeoutId;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(ADMIN_ERROR_MESSAGE.queryTimeout(timeoutMs)));
        }, timeoutMs);
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
