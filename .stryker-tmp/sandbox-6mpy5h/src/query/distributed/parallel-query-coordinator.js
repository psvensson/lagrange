/**
 * Parallel Query Coordinator - Executes queries across partitions in parallel.
 * Implements resource limits, timeout mechanisms, straggler detection,
 * speculative execution, and streaming aggregation.
 * Requirements: 26.1, 26.2, 26.3, 26.7, 26.8, 26.9, 26.10, 26.11, 26.12
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { LoggingService } from '../../logging/logging-service.js';
import { ConfigurationManager } from '../../config/configuration-manager.js';
import { METRICS_LOG_TAG, NUM, TABLES, TYPEOF } from '../../constants/index.js';
import { QUERY_CONFIG_KEY, QUERY_DEFAULTS, QUERY_ERROR_MSG, QUERY_LOG_MSG, QUERY_STATUS, QUERY_SUBSYSTEM } from '../query-constants.js';
const QUERY_ID_PREFIX = stryMutAct_9fa48("112160") ? "" : (stryCov_9fa48("112160"), 'q-');
const QUERY_CANCELLED_ERROR = stryMutAct_9fa48("112161") ? "" : (stryCov_9fa48("112161"), 'Query cancelled');
const RESULT_ESTIMATE = Object.freeze(stryMutAct_9fa48("112162") ? {} : (stryCov_9fa48("112162"), {
  UTF16_BYTES_PER_CHAR: NUM.TWO,
  FALLBACK_ROW_BYTES: NUM.HUNDRED
}));
const REPLICA_STATUS = Object.freeze(stryMutAct_9fa48("112163") ? {} : (stryCov_9fa48("112163"), {
  ACTIVE: stryMutAct_9fa48("112164") ? "" : (stryCov_9fa48("112164"), 'active')
}));
function normalizeRetryAfterMs(value) {
  if (stryMutAct_9fa48("112165")) {
    {}
  } else {
    stryCov_9fa48("112165");
    return (stryMutAct_9fa48("112168") ? Number.isFinite(value) || value >= NUM.ZERO : stryMutAct_9fa48("112167") ? false : stryMutAct_9fa48("112166") ? true : (stryCov_9fa48("112166", "112167", "112168"), Number.isFinite(value) && (stryMutAct_9fa48("112171") ? value < NUM.ZERO : stryMutAct_9fa48("112170") ? value > NUM.ZERO : stryMutAct_9fa48("112169") ? true : (stryCov_9fa48("112169", "112170", "112171"), value >= NUM.ZERO)))) ? Math.floor(value) : null;
  }
}
function normalizeFailureString(value) {
  if (stryMutAct_9fa48("112172")) {
    {}
  } else {
    stryCov_9fa48("112172");
    return (stryMutAct_9fa48("112175") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("112174") ? false : stryMutAct_9fa48("112173") ? true : (stryCov_9fa48("112173", "112174", "112175"), (stryMutAct_9fa48("112177") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("112176") ? true : (stryCov_9fa48("112176", "112177"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("112180") ? value.length <= NUM.ZERO : stryMutAct_9fa48("112179") ? value.length >= NUM.ZERO : stryMutAct_9fa48("112178") ? true : (stryCov_9fa48("112178", "112179", "112180"), value.length > NUM.ZERO)))) ? value : null;
  }
}
function resolveFailureBackpressureState(diagnostics = {}) {
  if (stryMutAct_9fa48("112181")) {
    {}
  } else {
    stryCov_9fa48("112181");
    if (stryMutAct_9fa48("112184") ? typeof diagnostics?.backpressured !== TYPEOF.BOOLEAN : stryMutAct_9fa48("112183") ? false : stryMutAct_9fa48("112182") ? true : (stryCov_9fa48("112182", "112183", "112184"), typeof (stryMutAct_9fa48("112185") ? diagnostics.backpressured : (stryCov_9fa48("112185"), diagnostics?.backpressured)) === TYPEOF.BOOLEAN)) {
      if (stryMutAct_9fa48("112186")) {
        {}
      } else {
        stryCov_9fa48("112186");
        return diagnostics.backpressured;
      }
    }
    if (stryMutAct_9fa48("112189") ? diagnostics?.deferRetry !== true : stryMutAct_9fa48("112188") ? false : stryMutAct_9fa48("112187") ? true : (stryCov_9fa48("112187", "112188", "112189"), (stryMutAct_9fa48("112190") ? diagnostics.deferRetry : (stryCov_9fa48("112190"), diagnostics?.deferRetry)) === (stryMutAct_9fa48("112191") ? false : (stryCov_9fa48("112191"), true)))) {
      if (stryMutAct_9fa48("112192")) {
        {}
      } else {
        stryCov_9fa48("112192");
        return stryMutAct_9fa48("112193") ? false : (stryCov_9fa48("112193"), true);
      }
    }
    return stryMutAct_9fa48("112196") ? Number.isFinite(diagnostics?.retryAfterMs) || diagnostics.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("112195") ? false : stryMutAct_9fa48("112194") ? true : (stryCov_9fa48("112194", "112195", "112196"), Number.isFinite(stryMutAct_9fa48("112197") ? diagnostics.retryAfterMs : (stryCov_9fa48("112197"), diagnostics?.retryAfterMs)) && (stryMutAct_9fa48("112200") ? diagnostics.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("112199") ? diagnostics.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("112198") ? true : (stryCov_9fa48("112198", "112199", "112200"), diagnostics.retryAfterMs > NUM.ZERO)));
  }
}

/**
 * Tracks execution metrics for a single partition query.
 */
class PartitionQueryMetrics {
  /**
   * Create partition query metrics.
   * @param {string} partitionId - Partition ID.
   */
  constructor(partitionId) {
    if (stryMutAct_9fa48("112201")) {
      {}
    } else {
      stryCov_9fa48("112201");
      this.partitionId = partitionId;
      this.startTime = null;
      this.endTime = null;
      this.latencyMs = null;
      this.rowCount = NUM.ZERO;
      this.bytesRead = NUM.ZERO;
      this.status = QUERY_STATUS.PENDING; // pending, running, completed, failed, timeout
      this.error = null;
      this.isSpeculative = stryMutAct_9fa48("112202") ? true : (stryCov_9fa48("112202"), false);
      this.errorCode = null;
      this.retryAfterMs = null;
      this.deferRetry = stryMutAct_9fa48("112203") ? true : (stryCov_9fa48("112203"), false);
      this.participantNodeId = null;
      this.participantAddress = null;
      this.backpressured = stryMutAct_9fa48("112204") ? true : (stryCov_9fa48("112204"), false);
      this.failedTable = null;
    }
  }

  /**
   * Mark query as started.
   */
  start() {
    if (stryMutAct_9fa48("112205")) {
      {}
    } else {
      stryCov_9fa48("112205");
      this.startTime = Date.now();
      this.status = QUERY_STATUS.RUNNING;
    }
  }

  /**
   * Mark query as completed.
   * @param {number} rowCount - Number of rows returned.
   * @param {number} bytesRead - Estimated bytes read.
   */
  complete(rowCount, bytesRead = NUM.ZERO) {
    if (stryMutAct_9fa48("112206")) {
      {}
    } else {
      stryCov_9fa48("112206");
      this.endTime = Date.now();
      this.latencyMs = stryMutAct_9fa48("112207") ? this.endTime + this.startTime : (stryCov_9fa48("112207"), this.endTime - this.startTime);
      this.rowCount = rowCount;
      this.bytesRead = bytesRead;
      this.status = QUERY_STATUS.COMPLETED;
    }
  }

  /**
   * Mark query as failed.
   * @param {Error} error - Error that occurred.
   */
  fail(error, diagnostics = {}) {
    if (stryMutAct_9fa48("112208")) {
      {}
    } else {
      stryCov_9fa48("112208");
      this.endTime = Date.now();
      this.latencyMs = stryMutAct_9fa48("112209") ? this.endTime + this.startTime : (stryCov_9fa48("112209"), this.endTime - this.startTime);
      this.status = QUERY_STATUS.FAILED;
      this.error = error.message;
      this.errorCode = normalizeFailureString(stryMutAct_9fa48("112210") ? diagnostics.errorCode : (stryCov_9fa48("112210"), diagnostics?.errorCode));
      this.retryAfterMs = normalizeRetryAfterMs(stryMutAct_9fa48("112211") ? diagnostics.retryAfterMs : (stryCov_9fa48("112211"), diagnostics?.retryAfterMs));
      this.deferRetry = stryMutAct_9fa48("112214") ? diagnostics?.deferRetry !== true : stryMutAct_9fa48("112213") ? false : stryMutAct_9fa48("112212") ? true : (stryCov_9fa48("112212", "112213", "112214"), (stryMutAct_9fa48("112215") ? diagnostics.deferRetry : (stryCov_9fa48("112215"), diagnostics?.deferRetry)) === (stryMutAct_9fa48("112216") ? false : (stryCov_9fa48("112216"), true)));
      this.participantNodeId = normalizeFailureString(stryMutAct_9fa48("112217") ? diagnostics.participantNodeId : (stryCov_9fa48("112217"), diagnostics?.participantNodeId));
      this.participantAddress = normalizeFailureString(stryMutAct_9fa48("112218") ? diagnostics.participantAddress : (stryCov_9fa48("112218"), diagnostics?.participantAddress));
      this.backpressured = resolveFailureBackpressureState(diagnostics);
      this.failedTable = normalizeFailureString(stryMutAct_9fa48("112219") ? diagnostics.failedTable : (stryCov_9fa48("112219"), diagnostics?.failedTable));
    }
  }

  /**
   * Mark query as timed out.
   */
  timeout() {
    if (stryMutAct_9fa48("112220")) {
      {}
    } else {
      stryCov_9fa48("112220");
      this.endTime = Date.now();
      this.latencyMs = stryMutAct_9fa48("112221") ? this.endTime + this.startTime : (stryCov_9fa48("112221"), this.endTime - this.startTime);
      this.status = QUERY_STATUS.TIMEOUT;
    }
  }
}

/**
 * Tracks overall query execution metrics.
 */
class QueryExecutionMetrics {
  /**
   * Create query execution metrics.
   * @param {string} queryId - Query ID.
   * @param {number} partitionCount - Number of partitions.
   */
  constructor(queryId, partitionCount) {
    if (stryMutAct_9fa48("112222")) {
      {}
    } else {
      stryCov_9fa48("112222");
      this.queryId = queryId;
      this.partitionCount = partitionCount;
      this.startTime = Date.now();
      this.endTime = null;
      this.totalLatencyMs = null;
      this.partitionMetrics = new Map();
      this.totalRows = NUM.ZERO;
      this.totalBytes = NUM.ZERO;
      this.stragglers = stryMutAct_9fa48("112223") ? ["Stryker was here"] : (stryCov_9fa48("112223"), []);
      this.speculativeExecutions = NUM.ZERO;
    }
  }

  /**
   * Add partition metrics.
   * @param {PartitionQueryMetrics} metrics - Partition metrics.
   */
  addPartitionMetrics(metrics) {
    if (stryMutAct_9fa48("112224")) {
      {}
    } else {
      stryCov_9fa48("112224");
      this.partitionMetrics.set(metrics.partitionId, metrics);
      if (stryMutAct_9fa48("112227") ? metrics.status !== QUERY_STATUS.COMPLETED : stryMutAct_9fa48("112226") ? false : stryMutAct_9fa48("112225") ? true : (stryCov_9fa48("112225", "112226", "112227"), metrics.status === QUERY_STATUS.COMPLETED)) {
        if (stryMutAct_9fa48("112228")) {
          {}
        } else {
          stryCov_9fa48("112228");
          stryMutAct_9fa48("112229") ? this.totalRows -= metrics.rowCount : (stryCov_9fa48("112229"), this.totalRows += metrics.rowCount);
          stryMutAct_9fa48("112230") ? this.totalBytes -= metrics.bytesRead : (stryCov_9fa48("112230"), this.totalBytes += metrics.bytesRead);
        }
      }
    }
  }

  /**
   * Calculate median latency of completed partitions.
   * @return {number} Median latency in ms.
   */
  getMedianLatency() {
    if (stryMutAct_9fa48("112231")) {
      {}
    } else {
      stryCov_9fa48("112231");
      const latencies = stryMutAct_9fa48("112233") ? Array.from(this.partitionMetrics.values()).map(m => m.latencyMs).sort((a, b) => a - b) : stryMutAct_9fa48("112232") ? Array.from(this.partitionMetrics.values()).filter(m => m.status === QUERY_STATUS.COMPLETED && m.latencyMs !== null).map(m => m.latencyMs) : (stryCov_9fa48("112232", "112233"), Array.from(this.partitionMetrics.values()).filter(stryMutAct_9fa48("112234") ? () => undefined : (stryCov_9fa48("112234"), m => stryMutAct_9fa48("112237") ? m.status === QUERY_STATUS.COMPLETED || m.latencyMs !== null : stryMutAct_9fa48("112236") ? false : stryMutAct_9fa48("112235") ? true : (stryCov_9fa48("112235", "112236", "112237"), (stryMutAct_9fa48("112239") ? m.status !== QUERY_STATUS.COMPLETED : stryMutAct_9fa48("112238") ? true : (stryCov_9fa48("112238", "112239"), m.status === QUERY_STATUS.COMPLETED)) && (stryMutAct_9fa48("112241") ? m.latencyMs === null : stryMutAct_9fa48("112240") ? true : (stryCov_9fa48("112240", "112241"), m.latencyMs !== null))))).map(stryMutAct_9fa48("112242") ? () => undefined : (stryCov_9fa48("112242"), m => m.latencyMs)).sort(stryMutAct_9fa48("112243") ? () => undefined : (stryCov_9fa48("112243"), (a, b) => stryMutAct_9fa48("112244") ? a + b : (stryCov_9fa48("112244"), a - b))));
      if (stryMutAct_9fa48("112247") ? latencies.length !== NUM.ZERO : stryMutAct_9fa48("112246") ? false : stryMutAct_9fa48("112245") ? true : (stryCov_9fa48("112245", "112246", "112247"), latencies.length === NUM.ZERO)) return NUM.ZERO;
      const mid = Math.floor(stryMutAct_9fa48("112248") ? latencies.length * NUM.TWO : (stryCov_9fa48("112248"), latencies.length / NUM.TWO));
      return (stryMutAct_9fa48("112251") ? latencies.length % NUM.TWO !== NUM.ZERO : stryMutAct_9fa48("112250") ? false : stryMutAct_9fa48("112249") ? true : (stryCov_9fa48("112249", "112250", "112251"), (stryMutAct_9fa48("112252") ? latencies.length * NUM.TWO : (stryCov_9fa48("112252"), latencies.length % NUM.TWO)) === NUM.ZERO)) ? stryMutAct_9fa48("112253") ? (latencies[mid - NUM.ONE] + latencies[mid]) * NUM.TWO : (stryCov_9fa48("112253"), (stryMutAct_9fa48("112254") ? latencies[mid - NUM.ONE] - latencies[mid] : (stryCov_9fa48("112254"), latencies[stryMutAct_9fa48("112255") ? mid + NUM.ONE : (stryCov_9fa48("112255"), mid - NUM.ONE)] + latencies[mid])) / NUM.TWO) : latencies[mid];
    }
  }

  /**
   * Finalize metrics.
   */
  finalize() {
    if (stryMutAct_9fa48("112256")) {
      {}
    } else {
      stryCov_9fa48("112256");
      this.endTime = Date.now();
      this.totalLatencyMs = stryMutAct_9fa48("112257") ? this.endTime + this.startTime : (stryCov_9fa48("112257"), this.endTime - this.startTime);
    }
  }
}

/**
 * ParallelQueryCoordinator handles parallel query execution across partitions
 * with resource limits, timeout mechanisms, and straggler detection.
 */
class ParallelQueryCoordinator {
  /**
   * Create a new parallel query coordinator.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache for partition lookups.
   * @param {Object} options.replicaRegistry - Registry of replica services.
   * @param {string} options.nodeId - Node ID for logging.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("112258")) {
      {}
    } else {
      stryCov_9fa48("112258");
      this.systemCache = stryMutAct_9fa48("112261") ? options.systemCache && null : stryMutAct_9fa48("112260") ? false : stryMutAct_9fa48("112259") ? true : (stryCov_9fa48("112259", "112260", "112261"), options.systemCache || null);
      this.replicaRegistry = stryMutAct_9fa48("112264") ? options.replicaRegistry && new Map() : stryMutAct_9fa48("112263") ? false : stryMutAct_9fa48("112262") ? true : (stryCov_9fa48("112262", "112263", "112264"), options.replicaRegistry || new Map());
      this.partitionQueryExecutor = stryMutAct_9fa48("112267") ? options.partitionQueryExecutor && null : stryMutAct_9fa48("112266") ? false : stryMutAct_9fa48("112265") ? true : (stryCov_9fa48("112265", "112266", "112267"), options.partitionQueryExecutor || null);
      this.nodeId = stryMutAct_9fa48("112270") ? options.nodeId && QUERY_SUBSYSTEM.PARALLEL_QUERY_COORDINATOR : stryMutAct_9fa48("112269") ? false : stryMutAct_9fa48("112268") ? true : (stryCov_9fa48("112268", "112269", "112270"), options.nodeId || QUERY_SUBSYSTEM.PARALLEL_QUERY_COORDINATOR);
      this.logger = this.initLogger();

      // Load configuration
      const config = ConfigurationManager.getInstance();
      this.maxParallelPartitions = stryMutAct_9fa48("112273") ? config.get(QUERY_CONFIG_KEY.COORDINATOR_MAX_PARALLEL_PARTITIONS) && QUERY_DEFAULTS.COORDINATOR_MAX_PARALLEL_PARTITIONS : stryMutAct_9fa48("112272") ? false : stryMutAct_9fa48("112271") ? true : (stryCov_9fa48("112271", "112272", "112273"), config.get(QUERY_CONFIG_KEY.COORDINATOR_MAX_PARALLEL_PARTITIONS) || QUERY_DEFAULTS.COORDINATOR_MAX_PARALLEL_PARTITIONS);
      this.maxConcurrentConnections = stryMutAct_9fa48("112276") ? config.get(QUERY_CONFIG_KEY.COORDINATOR_MAX_CONCURRENT_CONNECTIONS) && QUERY_DEFAULTS.COORDINATOR_MAX_CONCURRENT_CONNECTIONS : stryMutAct_9fa48("112275") ? false : stryMutAct_9fa48("112274") ? true : (stryCov_9fa48("112274", "112275", "112276"), config.get(QUERY_CONFIG_KEY.COORDINATOR_MAX_CONCURRENT_CONNECTIONS) || QUERY_DEFAULTS.COORDINATOR_MAX_CONCURRENT_CONNECTIONS);
      this.maxResultBufferBytes = stryMutAct_9fa48("112279") ? config.get(QUERY_CONFIG_KEY.COORDINATOR_MAX_RESULT_BUFFER_BYTES) && QUERY_DEFAULTS.COORDINATOR_MAX_RESULT_BUFFER_BYTES : stryMutAct_9fa48("112278") ? false : stryMutAct_9fa48("112277") ? true : (stryCov_9fa48("112277", "112278", "112279"), config.get(QUERY_CONFIG_KEY.COORDINATOR_MAX_RESULT_BUFFER_BYTES) || QUERY_DEFAULTS.COORDINATOR_MAX_RESULT_BUFFER_BYTES);
      this.queryTimeoutMs = stryMutAct_9fa48("112282") ? config.get(QUERY_CONFIG_KEY.COORDINATOR_QUERY_TIMEOUT_MS) && QUERY_DEFAULTS.COORDINATOR_QUERY_TIMEOUT_MS : stryMutAct_9fa48("112281") ? false : stryMutAct_9fa48("112280") ? true : (stryCov_9fa48("112280", "112281", "112282"), config.get(QUERY_CONFIG_KEY.COORDINATOR_QUERY_TIMEOUT_MS) || QUERY_DEFAULTS.COORDINATOR_QUERY_TIMEOUT_MS);
      this.stragglerThresholdMultiplier = stryMutAct_9fa48("112285") ? config.get(QUERY_CONFIG_KEY.COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER) && QUERY_DEFAULTS.COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER : stryMutAct_9fa48("112284") ? false : stryMutAct_9fa48("112283") ? true : (stryCov_9fa48("112283", "112284", "112285"), config.get(QUERY_CONFIG_KEY.COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER) || QUERY_DEFAULTS.COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER);
      this.speculativeExecutionEnabled = stryMutAct_9fa48("112288") ? config.get(QUERY_CONFIG_KEY.COORDINATOR_SPECULATIVE_EXECUTION_ENABLED) === false : stryMutAct_9fa48("112287") ? false : stryMutAct_9fa48("112286") ? true : (stryCov_9fa48("112286", "112287", "112288"), config.get(QUERY_CONFIG_KEY.COORDINATOR_SPECULATIVE_EXECUTION_ENABLED) !== (stryMutAct_9fa48("112289") ? true : (stryCov_9fa48("112289"), false)));
      this.speculativeExecutionDelayMs = stryMutAct_9fa48("112292") ? config.get(QUERY_CONFIG_KEY.COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS) && QUERY_DEFAULTS.COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS : stryMutAct_9fa48("112291") ? false : stryMutAct_9fa48("112290") ? true : (stryCov_9fa48("112290", "112291", "112292"), config.get(QUERY_CONFIG_KEY.COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS) || QUERY_DEFAULTS.COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS);
      this.streamingEnabled = stryMutAct_9fa48("112295") ? config.get(QUERY_CONFIG_KEY.COORDINATOR_STREAMING_ENABLED) === false : stryMutAct_9fa48("112294") ? false : stryMutAct_9fa48("112293") ? true : (stryCov_9fa48("112293", "112294", "112295"), config.get(QUERY_CONFIG_KEY.COORDINATOR_STREAMING_ENABLED) !== (stryMutAct_9fa48("112296") ? true : (stryCov_9fa48("112296"), false)));
      this.streamingChunkSize = stryMutAct_9fa48("112299") ? config.get(QUERY_CONFIG_KEY.COORDINATOR_STREAMING_CHUNK_SIZE) && QUERY_DEFAULTS.COORDINATOR_STREAMING_CHUNK_SIZE : stryMutAct_9fa48("112298") ? false : stryMutAct_9fa48("112297") ? true : (stryCov_9fa48("112297", "112298", "112299"), config.get(QUERY_CONFIG_KEY.COORDINATOR_STREAMING_CHUNK_SIZE) || QUERY_DEFAULTS.COORDINATOR_STREAMING_CHUNK_SIZE);
      if (stryMutAct_9fa48("112301") ? false : stryMutAct_9fa48("112300") ? true : (stryCov_9fa48("112300", "112301"), this.partitionQueryExecutor)) {
        if (stryMutAct_9fa48("112302")) {
          {}
        } else {
          stryCov_9fa48("112302");
          this.speculativeExecutionEnabled = stryMutAct_9fa48("112303") ? true : (stryCov_9fa48("112303"), false);
        }
      }

      // Track active queries for resource management
      this.activeConnections = NUM.ZERO;
      this.queryCounter = NUM.ZERO;
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("112304")) {
      {}
    } else {
      stryCov_9fa48("112304");
      try {
        if (stryMutAct_9fa48("112305")) {
          {}
        } else {
          stryCov_9fa48("112305");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("112307") ? false : stryMutAct_9fa48("112306") ? true : (stryCov_9fa48("112306", "112307"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("112308")) {
              {}
            } else {
              stryCov_9fa48("112308");
              return loggingService.forSubsystem(QUERY_SUBSYSTEM.PARALLEL_QUERY_COORDINATOR);
            }
          }
        }
      } catch (logErr) {
        if (stryMutAct_9fa48("112309")) {
          {}
        } else {
          stryCov_9fa48("112309");
          console.warn(QUERY_LOG_MSG.INIT_LOGGER_FAILED, logErr.message);
        }
      }
      return console;
    }
  }

  /**
   * Set the system cache.
   * @param {Object} cache - System table cache.
   */
  setSystemCache(cache) {
    if (stryMutAct_9fa48("112310")) {
      {}
    } else {
      stryCov_9fa48("112310");
      this.systemCache = cache;
    }
  }

  /**
   * Set the replica registry.
   * @param {Map|Object} registry - Replica registry.
   */
  setReplicaRegistry(registry) {
    if (stryMutAct_9fa48("112311")) {
      {}
    } else {
      stryCov_9fa48("112311");
      this.replicaRegistry = registry;
    }
  }

  /**
   * Get a partition by ID from system cache.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Partition info or null.
   * @private
   */
  getPartition(partitionId) {
    if (stryMutAct_9fa48("112312")) {
      {}
    } else {
      stryCov_9fa48("112312");
      if (stryMutAct_9fa48("112315") ? false : stryMutAct_9fa48("112314") ? true : stryMutAct_9fa48("112313") ? this.systemCache : (stryCov_9fa48("112313", "112314", "112315"), !this.systemCache)) {
        if (stryMutAct_9fa48("112316")) {
          {}
        } else {
          stryCov_9fa48("112316");
          return null;
        }
      }
      if (stryMutAct_9fa48("112319") ? typeof this.systemCache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("112318") ? false : stryMutAct_9fa48("112317") ? true : (stryCov_9fa48("112317", "112318", "112319"), typeof this.systemCache.get === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("112320")) {
          {}
        } else {
          stryCov_9fa48("112320");
          return this.systemCache.get(TABLES.PARTITIONS, partitionId);
        }
      }
      if (stryMutAct_9fa48("112323") ? typeof this.systemCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("112322") ? false : stryMutAct_9fa48("112321") ? true : (stryCov_9fa48("112321", "112322", "112323"), typeof this.systemCache.filter === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("112324")) {
          {}
        } else {
          stryCov_9fa48("112324");
          const matches = stryMutAct_9fa48("112325") ? this.systemCache : (stryCov_9fa48("112325"), this.systemCache.filter(TABLES.PARTITIONS, stryMutAct_9fa48("112326") ? () => undefined : (stryCov_9fa48("112326"), partition => stryMutAct_9fa48("112329") ? partition.partition_id !== partitionId : stryMutAct_9fa48("112328") ? false : stryMutAct_9fa48("112327") ? true : (stryCov_9fa48("112327", "112328", "112329"), partition.partition_id === partitionId))));
          return stryMutAct_9fa48("112332") ? matches[NUM.ZERO] && null : stryMutAct_9fa48("112331") ? false : stryMutAct_9fa48("112330") ? true : (stryCov_9fa48("112330", "112331", "112332"), matches[NUM.ZERO] || null);
        }
      }
      if (stryMutAct_9fa48("112335") ? typeof this.systemCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("112334") ? false : stryMutAct_9fa48("112333") ? true : (stryCov_9fa48("112333", "112334", "112335"), typeof this.systemCache.getAll === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("112336")) {
          {}
        } else {
          stryCov_9fa48("112336");
          const partitions = stryMutAct_9fa48("112339") ? this.systemCache.getAll(TABLES.PARTITIONS) && [] : stryMutAct_9fa48("112338") ? false : stryMutAct_9fa48("112337") ? true : (stryCov_9fa48("112337", "112338", "112339"), this.systemCache.getAll(TABLES.PARTITIONS) || (stryMutAct_9fa48("112340") ? ["Stryker was here"] : (stryCov_9fa48("112340"), [])));
          return stryMutAct_9fa48("112343") ? partitions.find(partition => partition.partition_id === partitionId) && null : stryMutAct_9fa48("112342") ? false : stryMutAct_9fa48("112341") ? true : (stryCov_9fa48("112341", "112342", "112343"), partitions.find(stryMutAct_9fa48("112344") ? () => undefined : (stryCov_9fa48("112344"), partition => stryMutAct_9fa48("112347") ? partition.partition_id !== partitionId : stryMutAct_9fa48("112346") ? false : stryMutAct_9fa48("112345") ? true : (stryCov_9fa48("112345", "112346", "112347"), partition.partition_id === partitionId))) || null);
        }
      }
      return null;
    }
  }

  /**
   * Get alternative replicas for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {Array} Array of replica services.
   * @private
   */
  getAlternativeReplicas(partitionId) {
    if (stryMutAct_9fa48("112348")) {
      {}
    } else {
      stryCov_9fa48("112348");
      let replicas;
      if (stryMutAct_9fa48("112350") ? false : stryMutAct_9fa48("112349") ? true : (stryCov_9fa48("112349", "112350"), this.replicaRegistry instanceof Map)) {
        if (stryMutAct_9fa48("112351")) {
          {}
        } else {
          stryCov_9fa48("112351");
          replicas = this.replicaRegistry.get(partitionId);
        }
      } else {
        if (stryMutAct_9fa48("112352")) {
          {}
        } else {
          stryCov_9fa48("112352");
          replicas = this.replicaRegistry[partitionId];
        }
      }
      return stryMutAct_9fa48("112355") ? replicas && [] : stryMutAct_9fa48("112354") ? false : stryMutAct_9fa48("112353") ? true : (stryCov_9fa48("112353", "112354", "112355"), replicas || (stryMutAct_9fa48("112356") ? ["Stryker was here"] : (stryCov_9fa48("112356"), [])));
    }
  }

  /**
   * Execute a query across multiple partitions in parallel.
   * Implements resource limits, timeout, and straggler detection.
   * Requirements: 26.1, 26.2, 26.3, 26.8, 26.12
   * @param {string} sql - SQL query to execute.
   * @param {Array} partitionIds - Partition IDs to query.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options.
   * @return {Promise<Object>} Query result with metrics.
   */
  async executeParallel(sql, partitionIds, params = stryMutAct_9fa48("112357") ? ["Stryker was here"] : (stryCov_9fa48("112357"), []), options = {}) {
    if (stryMutAct_9fa48("112358")) {
      {}
    } else {
      stryCov_9fa48("112358");
      const queryId = stryMutAct_9fa48("112359") ? `` : (stryCov_9fa48("112359"), `${QUERY_ID_PREFIX}${stryMutAct_9fa48("112360") ? --this.queryCounter : (stryCov_9fa48("112360"), ++this.queryCounter)}-${Date.now()}`);
      const metrics = new QueryExecutionMetrics(queryId, partitionIds.length);

      // Validate resource limits
      this.validateResourceLimits(partitionIds.length);
      this.logger.debug(QUERY_LOG_MSG.PARALLEL_QUERY_START, stryMutAct_9fa48("112361") ? {} : (stryCov_9fa48("112361"), {
        queryId,
        partitionCount: partitionIds.length,
        originalCount: partitionIds.length
      }));
      try {
        if (stryMutAct_9fa48("112362")) {
          {}
        } else {
          stryCov_9fa48("112362");
          // Execute on all partitions with timeout and straggler detection
          const results = await this.executeWithTimeoutAndStragglers(sql, partitionIds, params, metrics, options);

          // Validate result buffer size
          this.validateResultBufferSize(results, metrics);
          metrics.finalize();
          const formatted = this.formatMetrics(metrics);
          try {
            if (stryMutAct_9fa48("112363")) {
              {}
            } else {
              stryCov_9fa48("112363");
              const latencies = stryMutAct_9fa48("112364") ? formatted.partitionLatencies.map(p => p.latencyMs) : (stryCov_9fa48("112364"), formatted.partitionLatencies.map(stryMutAct_9fa48("112365") ? () => undefined : (stryCov_9fa48("112365"), p => p.latencyMs)).filter(stryMutAct_9fa48("112366") ? () => undefined : (stryCov_9fa48("112366"), l => stryMutAct_9fa48("112369") ? l !== null || l !== undefined : stryMutAct_9fa48("112368") ? false : stryMutAct_9fa48("112367") ? true : (stryCov_9fa48("112367", "112368", "112369"), (stryMutAct_9fa48("112371") ? l === null : stryMutAct_9fa48("112370") ? true : (stryCov_9fa48("112370", "112371"), l !== null)) && (stryMutAct_9fa48("112373") ? l === undefined : stryMutAct_9fa48("112372") ? true : (stryCov_9fa48("112372", "112373"), l !== undefined))))));
              const maxPartitionLatencyMs = (stryMutAct_9fa48("112377") ? latencies.length <= NUM.ZERO : stryMutAct_9fa48("112376") ? latencies.length >= NUM.ZERO : stryMutAct_9fa48("112375") ? false : stryMutAct_9fa48("112374") ? true : (stryCov_9fa48("112374", "112375", "112376", "112377"), latencies.length > NUM.ZERO)) ? stryMutAct_9fa48("112378") ? Math.min(...latencies) : (stryCov_9fa48("112378"), Math.max(...latencies)) : NUM.ZERO;
              this.logger.info(METRICS_LOG_TAG.FANOUT_COMPLETE, stryMutAct_9fa48("112379") ? {} : (stryCov_9fa48("112379"), {
                queryId: formatted.queryId,
                partitionCount: formatted.partitionCount,
                totalLatencyMs: formatted.totalLatencyMs,
                medianLatencyMs: formatted.medianLatencyMs,
                maxPartitionLatencyMs,
                totalRows: formatted.totalRows,
                totalBytes: formatted.totalBytes,
                stragglerCount: formatted.stragglers.length,
                speculativeExecutions: formatted.speculativeExecutions
              }));
            }
          } catch (metricsErr) {
            if (stryMutAct_9fa48("112380")) {
              {}
            } else {
              stryCov_9fa48("112380");
              this.logger.warn(QUERY_LOG_MSG.PARALLEL_QUERY_FAILED, stryMutAct_9fa48("112381") ? {} : (stryCov_9fa48("112381"), {
                queryId,
                error: metricsErr.message
              }));
            }
          }
          return stryMutAct_9fa48("112382") ? {} : (stryCov_9fa48("112382"), {
            success: stryMutAct_9fa48("112383") ? false : (stryCov_9fa48("112383"), true),
            results,
            metrics: formatted,
            partitions: partitionIds
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("112384")) {
          {}
        } else {
          stryCov_9fa48("112384");
          metrics.finalize();
          this.logger.error(QUERY_LOG_MSG.PARALLEL_QUERY_FAILED, stryMutAct_9fa48("112385") ? {} : (stryCov_9fa48("112385"), {
            queryId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Validate resource limits before query execution.
   * Requirements: 26.2, 26.8
   * @param {number} partitionCount - Number of partitions.
   * @throws {Error} If resource limits would be exceeded.
   * @private
   */
  validateResourceLimits(partitionCount) {
    if (stryMutAct_9fa48("112386")) {
      {}
    } else {
      stryCov_9fa48("112386");
      const peakConnections = stryMutAct_9fa48("112387") ? Math.max(partitionCount, this.maxParallelPartitions) : (stryCov_9fa48("112387"), Math.min(partitionCount, this.maxParallelPartitions));
      // Check concurrent connections limit
      if (stryMutAct_9fa48("112391") ? this.activeConnections + peakConnections <= this.maxConcurrentConnections : stryMutAct_9fa48("112390") ? this.activeConnections + peakConnections >= this.maxConcurrentConnections : stryMutAct_9fa48("112389") ? false : stryMutAct_9fa48("112388") ? true : (stryCov_9fa48("112388", "112389", "112390", "112391"), (stryMutAct_9fa48("112392") ? this.activeConnections - peakConnections : (stryCov_9fa48("112392"), this.activeConnections + peakConnections)) > this.maxConcurrentConnections)) {
        if (stryMutAct_9fa48("112393")) {
          {}
        } else {
          stryCov_9fa48("112393");
          throw new Error((stryMutAct_9fa48("112394") ? `` : (stryCov_9fa48("112394"), `${QUERY_ERROR_MSG.MAX_CONNECTIONS_PREFIX}`)) + (stryMutAct_9fa48("112395") ? `` : (stryCov_9fa48("112395"), `${stryMutAct_9fa48("112396") ? this.activeConnections - peakConnections : (stryCov_9fa48("112396"), this.activeConnections + peakConnections)} > ${this.maxConcurrentConnections}`)));
        }
      }
    }
  }

  /**
   * Build deterministic partition chunks for bounded parallel execution.
   * @param {Array} partitionIds - Ordered partition IDs.
   * @return {Array<Array<string>>} Ordered chunk list.
   * @private
   */
  buildPartitionChunks(partitionIds) {
    if (stryMutAct_9fa48("112397")) {
      {}
    } else {
      stryCov_9fa48("112397");
      const chunkSize = stryMutAct_9fa48("112398") ? Math.min(this.maxParallelPartitions, NUM.ONE) : (stryCov_9fa48("112398"), Math.max(this.maxParallelPartitions, NUM.ONE));
      const chunks = stryMutAct_9fa48("112399") ? ["Stryker was here"] : (stryCov_9fa48("112399"), []);
      for (let index = 0; stryMutAct_9fa48("112402") ? index >= partitionIds.length : stryMutAct_9fa48("112401") ? index <= partitionIds.length : stryMutAct_9fa48("112400") ? false : (stryCov_9fa48("112400", "112401", "112402"), index < partitionIds.length); stryMutAct_9fa48("112403") ? index -= chunkSize : (stryCov_9fa48("112403"), index += chunkSize)) {
        if (stryMutAct_9fa48("112404")) {
          {}
        } else {
          stryCov_9fa48("112404");
          chunks.push(stryMutAct_9fa48("112405") ? partitionIds : (stryCov_9fa48("112405"), partitionIds.slice(index, stryMutAct_9fa48("112406") ? index - chunkSize : (stryCov_9fa48("112406"), index + chunkSize))));
        }
      }
      return chunks;
    }
  }

  /**
   * Execute query with timeout and straggler detection.
   * Requirements: 26.1, 26.10, 26.11, 26.12
   * @param {string} sql - SQL query.
   * @param {Array} partitionIds - Partition IDs.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Object} options - Execution options.
   * @return {Promise<Array>} Array of partition results.
   * @private
   */
  async executeWithTimeoutAndStragglers(sql, partitionIds, params, metrics, options) {
    if (stryMutAct_9fa48("112407")) {
      {}
    } else {
      stryCov_9fa48("112407");
      const partitionChunks = this.buildPartitionChunks(partitionIds);
      const allResults = stryMutAct_9fa48("112408") ? ["Stryker was here"] : (stryCov_9fa48("112408"), []);
      for (const partitionChunk of partitionChunks) {
        if (stryMutAct_9fa48("112409")) {
          {}
        } else {
          stryCov_9fa48("112409");
          const chunkResults = await this.executeChunkWithTimeoutAndStragglers(sql, partitionChunk, params, metrics, options);
          allResults.push(...chunkResults);
        }
      }
      return allResults;
    }
  }

  /**
   * Execute one partition chunk with timeout and straggler detection.
   * @param {string} sql - SQL query.
   * @param {Array<string>} partitionIds - Partition chunk.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Object} options - Execution options.
   * @return {Promise<Array>} Array of partition results for this chunk.
   * @private
   */
  async executeChunkWithTimeoutAndStragglers(sql, partitionIds, params, metrics, options) {
    if (stryMutAct_9fa48("112410")) {
      {}
    } else {
      stryCov_9fa48("112410");
      stryMutAct_9fa48("112411") ? this.activeConnections -= partitionIds.length : (stryCov_9fa48("112411"), this.activeConnections += partitionIds.length);
      let timeoutId = null;
      const effectiveTimeoutMs = this.resolveTimeoutMs(stryMutAct_9fa48("112412") ? options.timeoutMs : (stryCov_9fa48("112412"), options?.timeoutMs));
      const cancellationPromise = this.createCancellationPromise(stryMutAct_9fa48("112415") ? options?.cancellationToken && null : stryMutAct_9fa48("112414") ? false : stryMutAct_9fa48("112413") ? true : (stryCov_9fa48("112413", "112414", "112415"), (stryMutAct_9fa48("112416") ? options.cancellationToken : (stryCov_9fa48("112416"), options?.cancellationToken)) || null));
      try {
        if (stryMutAct_9fa48("112417")) {
          {}
        } else {
          stryCov_9fa48("112417");
          // Create execution promises for each partition
          const executionPromises = partitionIds.map(stryMutAct_9fa48("112418") ? () => undefined : (stryCov_9fa48("112418"), partitionId => this.executeOnPartitionWithMetrics(sql, partitionId, params, metrics, options)));

          // Create timeout promise with clearable timer
          const timeoutPromise = new Promise((_, reject) => {
            if (stryMutAct_9fa48("112419")) {
              {}
            } else {
              stryCov_9fa48("112419");
              timeoutId = setTimeout(() => {
                if (stryMutAct_9fa48("112420")) {
                  {}
                } else {
                  stryCov_9fa48("112420");
                  reject(new Error((stryMutAct_9fa48("112421") ? `` : (stryCov_9fa48("112421"), `${QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_PREFIX}`)) + (stryMutAct_9fa48("112422") ? `` : (stryCov_9fa48("112422"), `${effectiveTimeoutMs}${QUERY_ERROR_MSG.QUERY_TIMEOUT_AFTER_SUFFIX}`))));
                }
              }, effectiveTimeoutMs);
            }
          });

          // Execute with straggler detection if enabled
          if (stryMutAct_9fa48("112425") ? this.speculativeExecutionEnabled || partitionIds.length > NUM.ONE : stryMutAct_9fa48("112424") ? false : stryMutAct_9fa48("112423") ? true : (stryCov_9fa48("112423", "112424", "112425"), this.speculativeExecutionEnabled && (stryMutAct_9fa48("112428") ? partitionIds.length <= NUM.ONE : stryMutAct_9fa48("112427") ? partitionIds.length >= NUM.ONE : stryMutAct_9fa48("112426") ? true : (stryCov_9fa48("112426", "112427", "112428"), partitionIds.length > NUM.ONE)))) {
            if (stryMutAct_9fa48("112429")) {
              {}
            } else {
              stryCov_9fa48("112429");
              const result = await this.executeWithSpeculativeExecution(executionPromises, partitionIds, sql, params, metrics, timeoutPromise, cancellationPromise);
              // Clear timeout after speculative execution completes
              if (stryMutAct_9fa48("112432") ? timeoutId === null : stryMutAct_9fa48("112431") ? false : stryMutAct_9fa48("112430") ? true : (stryCov_9fa48("112430", "112431", "112432"), timeoutId !== null)) {
                if (stryMutAct_9fa48("112433")) {
                  {}
                } else {
                  stryCov_9fa48("112433");
                  clearTimeout(timeoutId);
                  timeoutId = null;
                }
              }
              return result;
            }
          }

          // Simple parallel execution with timeout
          const racePromises = stryMutAct_9fa48("112434") ? [] : (stryCov_9fa48("112434"), [Promise.all(executionPromises), timeoutPromise]);
          if (stryMutAct_9fa48("112436") ? false : stryMutAct_9fa48("112435") ? true : (stryCov_9fa48("112435", "112436"), cancellationPromise)) {
            if (stryMutAct_9fa48("112437")) {
              {}
            } else {
              stryCov_9fa48("112437");
              racePromises.push(cancellationPromise);
            }
          }
          const results = await Promise.race(racePromises);

          // Detect and log stragglers
          this.detectAndLogStragglers(metrics);
          return results;
        }
      } finally {
        if (stryMutAct_9fa48("112438")) {
          {}
        } else {
          stryCov_9fa48("112438");
          // Clear timeout to prevent keeping process alive
          if (stryMutAct_9fa48("112441") ? timeoutId === null : stryMutAct_9fa48("112440") ? false : stryMutAct_9fa48("112439") ? true : (stryCov_9fa48("112439", "112440", "112441"), timeoutId !== null)) {
            if (stryMutAct_9fa48("112442")) {
              {}
            } else {
              stryCov_9fa48("112442");
              clearTimeout(timeoutId);
            }
          }
          stryMutAct_9fa48("112443") ? this.activeConnections += partitionIds.length : (stryCov_9fa48("112443"), this.activeConnections -= partitionIds.length);
        }
      }
    }
  }

  /**
   * Execute with speculative execution for stragglers.
   * Requirements: 26.10, 26.11
   * @param {Array} executionPromises - Original execution promises.
   * @param {Array} partitionIds - Partition IDs.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Promise} timeoutPromise - Timeout promise.
   * @param {Promise|null} cancellationPromise - Cancellation promise.
   * @return {Promise<Array>} Array of partition results.
   * @private
   */
  async executeWithSpeculativeExecution(executionPromises, partitionIds, sql, params, metrics, timeoutPromise, cancellationPromise) {
    if (stryMutAct_9fa48("112444")) {
      {}
    } else {
      stryCov_9fa48("112444");
      const results = new Map();
      const pendingPartitions = new Set(partitionIds);
      const speculativePromises = new Map();

      // Wrap each promise to track completion
      const wrappedPromises = executionPromises.map((promise, index) => {
        if (stryMutAct_9fa48("112445")) {
          {}
        } else {
          stryCov_9fa48("112445");
          const partitionId = partitionIds[index];
          return promise.then(result => {
            if (stryMutAct_9fa48("112446")) {
              {}
            } else {
              stryCov_9fa48("112446");
              results.set(partitionId, result);
              pendingPartitions.delete(partitionId);
              return stryMutAct_9fa48("112447") ? {} : (stryCov_9fa48("112447"), {
                partitionId,
                result
              });
            }
          });
        }
      });

      // Start a timer to check for stragglers
      const stragglerCheckInterval = setInterval(() => {
        if (stryMutAct_9fa48("112448")) {
          {}
        } else {
          stryCov_9fa48("112448");
          const medianLatency = metrics.getMedianLatency();
          if (stryMutAct_9fa48("112451") ? medianLatency > NUM.ZERO || pendingPartitions.size > NUM.ZERO : stryMutAct_9fa48("112450") ? false : stryMutAct_9fa48("112449") ? true : (stryCov_9fa48("112449", "112450", "112451"), (stryMutAct_9fa48("112454") ? medianLatency <= NUM.ZERO : stryMutAct_9fa48("112453") ? medianLatency >= NUM.ZERO : stryMutAct_9fa48("112452") ? true : (stryCov_9fa48("112452", "112453", "112454"), medianLatency > NUM.ZERO)) && (stryMutAct_9fa48("112457") ? pendingPartitions.size <= NUM.ZERO : stryMutAct_9fa48("112456") ? pendingPartitions.size >= NUM.ZERO : stryMutAct_9fa48("112455") ? true : (stryCov_9fa48("112455", "112456", "112457"), pendingPartitions.size > NUM.ZERO)))) {
            if (stryMutAct_9fa48("112458")) {
              {}
            } else {
              stryCov_9fa48("112458");
              const stragglerThreshold = stryMutAct_9fa48("112459") ? medianLatency / this.stragglerThresholdMultiplier : (stryCov_9fa48("112459"), medianLatency * this.stragglerThresholdMultiplier);
              for (const partitionId of pendingPartitions) {
                if (stryMutAct_9fa48("112460")) {
                  {}
                } else {
                  stryCov_9fa48("112460");
                  const partitionMetrics = metrics.partitionMetrics.get(partitionId);
                  if (stryMutAct_9fa48("112463") ? partitionMetrics || partitionMetrics.startTime : stryMutAct_9fa48("112462") ? false : stryMutAct_9fa48("112461") ? true : (stryCov_9fa48("112461", "112462", "112463"), partitionMetrics && partitionMetrics.startTime)) {
                    if (stryMutAct_9fa48("112464")) {
                      {}
                    } else {
                      stryCov_9fa48("112464");
                      const elapsed = stryMutAct_9fa48("112465") ? Date.now() + partitionMetrics.startTime : (stryCov_9fa48("112465"), Date.now() - partitionMetrics.startTime);
                      if (stryMutAct_9fa48("112468") ? elapsed > stragglerThreshold || !speculativePromises.has(partitionId) : stryMutAct_9fa48("112467") ? false : stryMutAct_9fa48("112466") ? true : (stryCov_9fa48("112466", "112467", "112468"), (stryMutAct_9fa48("112471") ? elapsed <= stragglerThreshold : stryMutAct_9fa48("112470") ? elapsed >= stragglerThreshold : stryMutAct_9fa48("112469") ? true : (stryCov_9fa48("112469", "112470", "112471"), elapsed > stragglerThreshold)) && (stryMutAct_9fa48("112472") ? speculativePromises.has(partitionId) : (stryCov_9fa48("112472"), !speculativePromises.has(partitionId))))) {
                        if (stryMutAct_9fa48("112473")) {
                          {}
                        } else {
                          stryCov_9fa48("112473");
                          // Start speculative execution on alternative replica
                          this.startSpeculativeExecution(partitionId, sql, params, metrics, speculativePromises, results, pendingPartitions);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }, this.speculativeExecutionDelayMs);
      try {
        if (stryMutAct_9fa48("112474")) {
          {}
        } else {
          stryCov_9fa48("112474");
          // Wait for all original promises or timeout
          const racePromises = stryMutAct_9fa48("112475") ? [] : (stryCov_9fa48("112475"), [Promise.all(wrappedPromises), timeoutPromise]);
          if (stryMutAct_9fa48("112477") ? false : stryMutAct_9fa48("112476") ? true : (stryCov_9fa48("112476", "112477"), cancellationPromise)) {
            if (stryMutAct_9fa48("112478")) {
              {}
            } else {
              stryCov_9fa48("112478");
              racePromises.push(cancellationPromise);
            }
          }
          await Promise.race(racePromises);

          // Detect and log stragglers
          this.detectAndLogStragglers(metrics);
          return partitionIds.map(stryMutAct_9fa48("112479") ? () => undefined : (stryCov_9fa48("112479"), id => results.get(id)));
        }
      } finally {
        if (stryMutAct_9fa48("112480")) {
          {}
        } else {
          stryCov_9fa48("112480");
          clearInterval(stragglerCheckInterval);
          // Cancel any pending speculative executions
          for (const [, controller] of speculativePromises) {
            if (stryMutAct_9fa48("112481")) {
              {}
            } else {
              stryCov_9fa48("112481");
              if (stryMutAct_9fa48("112484") ? controller || controller.abort : stryMutAct_9fa48("112483") ? false : stryMutAct_9fa48("112482") ? true : (stryCov_9fa48("112482", "112483", "112484"), controller && controller.abort)) {
                if (stryMutAct_9fa48("112485")) {
                  {}
                } else {
                  stryCov_9fa48("112485");
                  controller.abort();
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Start speculative execution on an alternative replica.
   * Requirements: 26.11
   * @param {string} partitionId - Partition ID.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @param {Map} speculativePromises - Map of speculative promises.
   * @param {Map} results - Results map.
   * @param {Set} pendingPartitions - Set of pending partitions.
   * @private
   */
  startSpeculativeExecution(partitionId, sql, params, metrics, speculativePromises, results, pendingPartitions) {
    if (stryMutAct_9fa48("112486")) {
      {}
    } else {
      stryCov_9fa48("112486");
      const replicas = this.getAlternativeReplicas(partitionId);
      if (stryMutAct_9fa48("112489") ? replicas.length !== NUM.ZERO : stryMutAct_9fa48("112488") ? false : stryMutAct_9fa48("112487") ? true : (stryCov_9fa48("112487", "112488", "112489"), replicas.length === NUM.ZERO)) return;

      // Select a different replica
      const alternativeReplica = replicas.find(stryMutAct_9fa48("112490") ? () => undefined : (stryCov_9fa48("112490"), r => stryMutAct_9fa48("112493") ? r.status === REPLICA_STATUS.ACTIVE && r.status === undefined : stryMutAct_9fa48("112492") ? false : stryMutAct_9fa48("112491") ? true : (stryCov_9fa48("112491", "112492", "112493"), (stryMutAct_9fa48("112495") ? r.status !== REPLICA_STATUS.ACTIVE : stryMutAct_9fa48("112494") ? false : (stryCov_9fa48("112494", "112495"), r.status === REPLICA_STATUS.ACTIVE)) || (stryMutAct_9fa48("112497") ? r.status !== undefined : stryMutAct_9fa48("112496") ? false : (stryCov_9fa48("112496", "112497"), r.status === undefined)))));
      if (stryMutAct_9fa48("112500") ? false : stryMutAct_9fa48("112499") ? true : stryMutAct_9fa48("112498") ? alternativeReplica : (stryCov_9fa48("112498", "112499", "112500"), !alternativeReplica)) return;
      this.logger.debug(QUERY_LOG_MSG.SPECULATIVE_EXEC_START, stryMutAct_9fa48("112501") ? {} : (stryCov_9fa48("112501"), {
        partitionId,
        replicaId: alternativeReplica.replicaId
      }));
      stryMutAct_9fa48("112502") ? metrics.speculativeExecutions-- : (stryCov_9fa48("112502"), metrics.speculativeExecutions++);
      metrics.stragglers.push(partitionId);
      const speculativeMetrics = new PartitionQueryMetrics(partitionId);
      speculativeMetrics.isSpeculative = stryMutAct_9fa48("112503") ? false : (stryCov_9fa48("112503"), true);
      speculativeMetrics.start();
      const speculativePromise = this.executeQueryOnService(alternativeReplica, sql, params).then(result => {
        if (stryMutAct_9fa48("112504")) {
          {}
        } else {
          stryCov_9fa48("112504");
          speculativeMetrics.complete(stryMutAct_9fa48("112507") ? result.rows?.length && NUM.ZERO : stryMutAct_9fa48("112506") ? false : stryMutAct_9fa48("112505") ? true : (stryCov_9fa48("112505", "112506", "112507"), (stryMutAct_9fa48("112508") ? result.rows.length : (stryCov_9fa48("112508"), result.rows?.length)) || NUM.ZERO));
          if (stryMutAct_9fa48("112511") ? false : stryMutAct_9fa48("112510") ? true : stryMutAct_9fa48("112509") ? results.has(partitionId) : (stryCov_9fa48("112509", "112510", "112511"), !results.has(partitionId))) {
            if (stryMutAct_9fa48("112512")) {
              {}
            } else {
              stryCov_9fa48("112512");
              results.set(partitionId, result);
              pendingPartitions.delete(partitionId);
            }
          }
          return result;
        }
      }).catch(error => {
        if (stryMutAct_9fa48("112513")) {
          {}
        } else {
          stryCov_9fa48("112513");
          speculativeMetrics.fail(error);
          return stryMutAct_9fa48("112514") ? {} : (stryCov_9fa48("112514"), {
            success: stryMutAct_9fa48("112515") ? true : (stryCov_9fa48("112515"), false),
            error: error.message,
            rows: stryMutAct_9fa48("112516") ? ["Stryker was here"] : (stryCov_9fa48("112516"), [])
          });
        }
      });
      speculativePromises.set(partitionId, stryMutAct_9fa48("112517") ? {} : (stryCov_9fa48("112517"), {
        promise: speculativePromise
      }));
    }
  }

  /**
   * Normalize one partition-execution failure snapshot.
   * @param {string} partitionId - Partition ID.
   * @param {PartitionQueryMetrics} partitionMetrics - Partition metrics.
   * @param {Object} failure - Failure-like object or error.
   * @param {string} fallbackErrorMessage - Fallback error text.
   * @return {Object} Normalized failure snapshot.
   * @private
   */
  normalizePartitionExecutionFailureSnapshot(partitionId, partitionMetrics, failure, fallbackErrorMessage) {
    if (stryMutAct_9fa48("112518")) {
      {}
    } else {
      stryCov_9fa48("112518");
      return stryMutAct_9fa48("112519") ? {} : (stryCov_9fa48("112519"), {
        partitionId,
        status: partitionMetrics.status,
        error: stryMutAct_9fa48("112522") ? (normalizeFailureString(failure?.error) || normalizeFailureString(failure?.message)) && fallbackErrorMessage : stryMutAct_9fa48("112521") ? false : stryMutAct_9fa48("112520") ? true : (stryCov_9fa48("112520", "112521", "112522"), (stryMutAct_9fa48("112524") ? normalizeFailureString(failure?.error) && normalizeFailureString(failure?.message) : stryMutAct_9fa48("112523") ? false : (stryCov_9fa48("112523", "112524"), normalizeFailureString(stryMutAct_9fa48("112525") ? failure.error : (stryCov_9fa48("112525"), failure?.error)) || normalizeFailureString(stryMutAct_9fa48("112526") ? failure.message : (stryCov_9fa48("112526"), failure?.message)))) || fallbackErrorMessage),
        errorCode: normalizeFailureString(stryMutAct_9fa48("112529") ? failure?.errorCode && failure?.code : stryMutAct_9fa48("112528") ? false : stryMutAct_9fa48("112527") ? true : (stryCov_9fa48("112527", "112528", "112529"), (stryMutAct_9fa48("112530") ? failure.errorCode : (stryCov_9fa48("112530"), failure?.errorCode)) || (stryMutAct_9fa48("112531") ? failure.code : (stryCov_9fa48("112531"), failure?.code)))),
        retryAfterMs: normalizeRetryAfterMs(stryMutAct_9fa48("112532") ? failure.retryAfterMs : (stryCov_9fa48("112532"), failure?.retryAfterMs)),
        deferRetry: stryMutAct_9fa48("112535") ? failure?.deferRetry !== true : stryMutAct_9fa48("112534") ? false : stryMutAct_9fa48("112533") ? true : (stryCov_9fa48("112533", "112534", "112535"), (stryMutAct_9fa48("112536") ? failure.deferRetry : (stryCov_9fa48("112536"), failure?.deferRetry)) === (stryMutAct_9fa48("112537") ? false : (stryCov_9fa48("112537"), true))),
        participantNodeId: normalizeFailureString(stryMutAct_9fa48("112538") ? failure.participantNodeId : (stryCov_9fa48("112538"), failure?.participantNodeId)),
        participantAddress: normalizeFailureString(stryMutAct_9fa48("112539") ? failure.participantAddress : (stryCov_9fa48("112539"), failure?.participantAddress)),
        backpressured: resolveFailureBackpressureState(failure),
        failedTable: normalizeFailureString(stryMutAct_9fa48("112540") ? failure.failedTable : (stryCov_9fa48("112540"), failure?.failedTable)),
        durationMs: partitionMetrics.latencyMs,
        rows: stryMutAct_9fa48("112543") ? failure?.rows && [] : stryMutAct_9fa48("112542") ? false : stryMutAct_9fa48("112541") ? true : (stryCov_9fa48("112541", "112542", "112543"), (stryMutAct_9fa48("112544") ? failure.rows : (stryCov_9fa48("112544"), failure?.rows)) || (stryMutAct_9fa48("112545") ? ["Stryker was here"] : (stryCov_9fa48("112545"), [])))
      });
    }
  }

  /**
   * Build the canonical partition-execution failure outcome.
   * @param {Object} snapshot - Normalized failure snapshot.
   * @return {Object} Failure result.
   * @private
   */
  buildPartitionExecutionFailureOutcome(snapshot) {
    if (stryMutAct_9fa48("112546")) {
      {}
    } else {
      stryCov_9fa48("112546");
      return stryMutAct_9fa48("112547") ? {} : (stryCov_9fa48("112547"), {
        partitionId: snapshot.partitionId,
        success: stryMutAct_9fa48("112548") ? true : (stryCov_9fa48("112548"), false),
        status: snapshot.status,
        error: snapshot.error,
        errorCode: snapshot.errorCode,
        retryAfterMs: snapshot.retryAfterMs,
        deferRetry: snapshot.deferRetry,
        participantNodeId: snapshot.participantNodeId,
        participantAddress: snapshot.participantAddress,
        backpressured: snapshot.backpressured,
        failedTable: snapshot.failedTable,
        durationMs: snapshot.durationMs,
        rows: snapshot.rows
      });
    }
  }

  /**
   * Build the canonical partition-execution success outcome.
   * @param {string} partitionId - Partition ID.
   * @param {PartitionQueryMetrics} partitionMetrics - Partition metrics.
   * @param {Object} result - Query result.
   * @return {Object} Success result.
   * @private
   */
  buildPartitionExecutionSuccessOutcome(partitionId, partitionMetrics, result) {
    if (stryMutAct_9fa48("112549")) {
      {}
    } else {
      stryCov_9fa48("112549");
      return stryMutAct_9fa48("112550") ? {} : (stryCov_9fa48("112550"), {
        partitionId,
        success: stryMutAct_9fa48("112551") ? false : (stryCov_9fa48("112551"), true),
        status: partitionMetrics.status,
        rows: stryMutAct_9fa48("112554") ? result.rows && [] : stryMutAct_9fa48("112553") ? false : stryMutAct_9fa48("112552") ? true : (stryCov_9fa48("112552", "112553", "112554"), result.rows || (stryMutAct_9fa48("112555") ? ["Stryker was here"] : (stryCov_9fa48("112555"), []))),
        changes: result.changes
      });
    }
  }

  /**
   * Execute query on a single partition with metrics tracking.
   * @param {string} sql - SQL query.
   * @param {string} partitionId - Partition ID.
   * @param {Array} params - Query parameters.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @return {Promise<Object>} Partition result.
   * @private
   */
  async executeOnPartitionWithMetrics(sql, partitionId, params, metrics, options = {}) {
    if (stryMutAct_9fa48("112556")) {
      {}
    } else {
      stryCov_9fa48("112556");
      const partitionMetrics = new PartitionQueryMetrics(partitionId);
      partitionMetrics.start();
      const partition = this.partitionQueryExecutor ? null : this.getPartition(partitionId);
      if (stryMutAct_9fa48("112559") ? !this.partitionQueryExecutor || !partition : stryMutAct_9fa48("112558") ? false : stryMutAct_9fa48("112557") ? true : (stryCov_9fa48("112557", "112558", "112559"), (stryMutAct_9fa48("112560") ? this.partitionQueryExecutor : (stryCov_9fa48("112560"), !this.partitionQueryExecutor)) && (stryMutAct_9fa48("112561") ? partition : (stryCov_9fa48("112561"), !partition)))) {
        if (stryMutAct_9fa48("112562")) {
          {}
        } else {
          stryCov_9fa48("112562");
          partitionMetrics.fail(new Error(QUERY_ERROR_MSG.PARTITION_NOT_FOUND));
          metrics.addPartitionMetrics(partitionMetrics);
          return this.buildPartitionExecutionFailureOutcome(this.normalizePartitionExecutionFailureSnapshot(partitionId, partitionMetrics, stryMutAct_9fa48("112563") ? {} : (stryCov_9fa48("112563"), {
            error: QUERY_ERROR_MSG.PARTITION_NOT_FOUND
          }), QUERY_ERROR_MSG.PARTITION_NOT_FOUND));
        }
      }
      try {
        if (stryMutAct_9fa48("112564")) {
          {}
        } else {
          stryCov_9fa48("112564");
          const result = await this.executeQueryOnService(partition, sql, params, partitionId, options);
          if (stryMutAct_9fa48("112567") ? result || result.success === false : stryMutAct_9fa48("112566") ? false : stryMutAct_9fa48("112565") ? true : (stryCov_9fa48("112565", "112566", "112567"), result && (stryMutAct_9fa48("112569") ? result.success !== false : stryMutAct_9fa48("112568") ? true : (stryCov_9fa48("112568", "112569"), result.success === (stryMutAct_9fa48("112570") ? true : (stryCov_9fa48("112570"), false)))))) {
            if (stryMutAct_9fa48("112571")) {
              {}
            } else {
              stryCov_9fa48("112571");
              partitionMetrics.fail(new Error(stryMutAct_9fa48("112574") ? result.error && QUERY_ERROR_MSG.QUERY_ROUTING_FAILED : stryMutAct_9fa48("112573") ? false : stryMutAct_9fa48("112572") ? true : (stryCov_9fa48("112572", "112573", "112574"), result.error || QUERY_ERROR_MSG.QUERY_ROUTING_FAILED)), result);
              metrics.addPartitionMetrics(partitionMetrics);
              return this.buildPartitionExecutionFailureOutcome(this.normalizePartitionExecutionFailureSnapshot(partitionId, partitionMetrics, result, QUERY_ERROR_MSG.QUERY_ROUTING_FAILED));
            }
          }
          const rowCount = stryMutAct_9fa48("112577") ? result.rows?.length && NUM.ZERO : stryMutAct_9fa48("112576") ? false : stryMutAct_9fa48("112575") ? true : (stryCov_9fa48("112575", "112576", "112577"), (stryMutAct_9fa48("112578") ? result.rows.length : (stryCov_9fa48("112578"), result.rows?.length)) || NUM.ZERO);
          const bytesRead = this.estimateResultBytes(result.rows);
          partitionMetrics.complete(rowCount, bytesRead);
          metrics.addPartitionMetrics(partitionMetrics);
          return this.buildPartitionExecutionSuccessOutcome(partitionId, partitionMetrics, result);
        }
      } catch (error) {
        if (stryMutAct_9fa48("112579")) {
          {}
        } else {
          stryCov_9fa48("112579");
          partitionMetrics.fail(error, error);
          metrics.addPartitionMetrics(partitionMetrics);
          return this.buildPartitionExecutionFailureOutcome(this.normalizePartitionExecutionFailureSnapshot(partitionId, partitionMetrics, error, error.message));
        }
      }
    }
  }

  /**
   * Execute query on a service.
   * @param {Object} service - Partition or replica service.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeQueryOnService(service, sql, params, partitionId, options = {}) {
    if (stryMutAct_9fa48("112580")) {
      {}
    } else {
      stryCov_9fa48("112580");
      if (stryMutAct_9fa48("112582") ? false : stryMutAct_9fa48("112581") ? true : (stryCov_9fa48("112581", "112582"), this.partitionQueryExecutor)) {
        if (stryMutAct_9fa48("112583")) {
          {}
        } else {
          stryCov_9fa48("112583");
          return this.partitionQueryExecutor(sql, partitionId, params, options);
        }
      }
      if (stryMutAct_9fa48("112586") ? typeof service.executeQuery !== TYPEOF.FUNCTION : stryMutAct_9fa48("112585") ? false : stryMutAct_9fa48("112584") ? true : (stryCov_9fa48("112584", "112585", "112586"), typeof service.executeQuery === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("112587")) {
          {}
        } else {
          stryCov_9fa48("112587");
          return service.executeQuery(sql, params);
        }
      }
      throw new Error(QUERY_ERROR_MSG.SERVICE_EXECUTE_UNSUPPORTED);
    }
  }

  /**
   * Resolve effective timeout from optional override.
   * @param {number|undefined|null} timeoutMs
   * @return {number}
   * @private
   */
  resolveTimeoutMs(timeoutMs) {
    if (stryMutAct_9fa48("112588")) {
      {}
    } else {
      stryCov_9fa48("112588");
      if (stryMutAct_9fa48("112591") ? Number.isFinite(timeoutMs) || timeoutMs > NUM.ZERO : stryMutAct_9fa48("112590") ? false : stryMutAct_9fa48("112589") ? true : (stryCov_9fa48("112589", "112590", "112591"), Number.isFinite(timeoutMs) && (stryMutAct_9fa48("112594") ? timeoutMs <= NUM.ZERO : stryMutAct_9fa48("112593") ? timeoutMs >= NUM.ZERO : stryMutAct_9fa48("112592") ? true : (stryCov_9fa48("112592", "112593", "112594"), timeoutMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("112595")) {
          {}
        } else {
          stryCov_9fa48("112595");
          return Math.floor(timeoutMs);
        }
      }
      return this.queryTimeoutMs;
    }
  }

  /**
   * Build cancellation promise for cooperative aborts.
   * @param {Object|null} cancellationToken
   * @return {Promise<never>|null}
   * @private
   */
  createCancellationPromise(cancellationToken) {
    if (stryMutAct_9fa48("112596")) {
      {}
    } else {
      stryCov_9fa48("112596");
      if (stryMutAct_9fa48("112599") ? !cancellationToken && typeof cancellationToken.onCancel !== TYPEOF.FUNCTION : stryMutAct_9fa48("112598") ? false : stryMutAct_9fa48("112597") ? true : (stryCov_9fa48("112597", "112598", "112599"), (stryMutAct_9fa48("112600") ? cancellationToken : (stryCov_9fa48("112600"), !cancellationToken)) || (stryMutAct_9fa48("112602") ? typeof cancellationToken.onCancel === TYPEOF.FUNCTION : stryMutAct_9fa48("112601") ? false : (stryCov_9fa48("112601", "112602"), typeof cancellationToken.onCancel !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("112603")) {
          {}
        } else {
          stryCov_9fa48("112603");
          return null;
        }
      }
      return new Promise((_, reject) => {
        if (stryMutAct_9fa48("112604")) {
          {}
        } else {
          stryCov_9fa48("112604");
          const rejectWithReason = reason => {
            if (stryMutAct_9fa48("112605")) {
              {}
            } else {
              stryCov_9fa48("112605");
              reject(new Error(stryMutAct_9fa48("112608") ? reason && QUERY_CANCELLED_ERROR : stryMutAct_9fa48("112607") ? false : stryMutAct_9fa48("112606") ? true : (stryCov_9fa48("112606", "112607", "112608"), reason || QUERY_CANCELLED_ERROR)));
            }
          };
          cancellationToken.onCancel(rejectWithReason);
          if (stryMutAct_9fa48("112611") ? typeof cancellationToken.isCancelled === TYPEOF.FUNCTION || cancellationToken.isCancelled() : stryMutAct_9fa48("112610") ? false : stryMutAct_9fa48("112609") ? true : (stryCov_9fa48("112609", "112610", "112611"), (stryMutAct_9fa48("112613") ? typeof cancellationToken.isCancelled !== TYPEOF.FUNCTION : stryMutAct_9fa48("112612") ? true : (stryCov_9fa48("112612", "112613"), typeof cancellationToken.isCancelled === TYPEOF.FUNCTION)) && cancellationToken.isCancelled())) {
            if (stryMutAct_9fa48("112614")) {
              {}
            } else {
              stryCov_9fa48("112614");
              const reason = (stryMutAct_9fa48("112617") ? typeof cancellationToken.getReason !== TYPEOF.FUNCTION : stryMutAct_9fa48("112616") ? false : stryMutAct_9fa48("112615") ? true : (stryCov_9fa48("112615", "112616", "112617"), typeof cancellationToken.getReason === TYPEOF.FUNCTION)) ? cancellationToken.getReason() : null;
              rejectWithReason(reason);
            }
          }
        }
      });
    }
  }

  /**
   * Estimate bytes in result rows.
   * @param {Array} rows - Result rows.
   * @return {number} Estimated bytes.
   * @private
   */
  estimateResultBytes(rows) {
    if (stryMutAct_9fa48("112618")) {
      {}
    } else {
      stryCov_9fa48("112618");
      if (stryMutAct_9fa48("112621") ? !rows && rows.length === NUM.ZERO : stryMutAct_9fa48("112620") ? false : stryMutAct_9fa48("112619") ? true : (stryCov_9fa48("112619", "112620", "112621"), (stryMutAct_9fa48("112622") ? rows : (stryCov_9fa48("112622"), !rows)) || (stryMutAct_9fa48("112624") ? rows.length !== NUM.ZERO : stryMutAct_9fa48("112623") ? false : (stryCov_9fa48("112623", "112624"), rows.length === NUM.ZERO)))) return NUM.ZERO;
      // Rough estimate: JSON stringify length * 2 for UTF-16
      try {
        if (stryMutAct_9fa48("112625")) {
          {}
        } else {
          stryCov_9fa48("112625");
          return stryMutAct_9fa48("112626") ? JSON.stringify(rows).length / RESULT_ESTIMATE.UTF16_BYTES_PER_CHAR : (stryCov_9fa48("112626"), JSON.stringify(rows).length * RESULT_ESTIMATE.UTF16_BYTES_PER_CHAR);
        }
      } catch (_estimateErr) {
        if (stryMutAct_9fa48("112627")) {
          {}
        } else {
          stryCov_9fa48("112627");
          return stryMutAct_9fa48("112628") ? rows.length / RESULT_ESTIMATE.FALLBACK_ROW_BYTES : (stryCov_9fa48("112628"), rows.length * RESULT_ESTIMATE.FALLBACK_ROW_BYTES);
        }
      }
    }
  }

  /**
   * Validate result buffer size.
   * Requirements: 26.3
   * @param {Array} results - Query results.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @throws {Error} If result buffer exceeds limit.
   * @private
   */
  validateResultBufferSize(results, metrics) {
    if (stryMutAct_9fa48("112629")) {
      {}
    } else {
      stryCov_9fa48("112629");
      if (stryMutAct_9fa48("112633") ? metrics.totalBytes <= this.maxResultBufferBytes : stryMutAct_9fa48("112632") ? metrics.totalBytes >= this.maxResultBufferBytes : stryMutAct_9fa48("112631") ? false : stryMutAct_9fa48("112630") ? true : (stryCov_9fa48("112630", "112631", "112632", "112633"), metrics.totalBytes > this.maxResultBufferBytes)) {
        if (stryMutAct_9fa48("112634")) {
          {}
        } else {
          stryCov_9fa48("112634");
          throw new Error((stryMutAct_9fa48("112635") ? `` : (stryCov_9fa48("112635"), `${QUERY_ERROR_MSG.RESULT_BUFFER_LIMIT_PREFIX}`)) + (stryMutAct_9fa48("112636") ? `` : (stryCov_9fa48("112636"), `${metrics.totalBytes} > ${this.maxResultBufferBytes}`)));
        }
      }
    }
  }

  /**
   * Detect and log straggler partitions.
   * Requirements: 26.7, 26.10
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @private
   */
  detectAndLogStragglers(metrics) {
    if (stryMutAct_9fa48("112637")) {
      {}
    } else {
      stryCov_9fa48("112637");
      const medianLatency = metrics.getMedianLatency();
      if (stryMutAct_9fa48("112640") ? medianLatency !== NUM.ZERO : stryMutAct_9fa48("112639") ? false : stryMutAct_9fa48("112638") ? true : (stryCov_9fa48("112638", "112639", "112640"), medianLatency === NUM.ZERO)) return;
      const stragglerThreshold = stryMutAct_9fa48("112641") ? medianLatency / this.stragglerThresholdMultiplier : (stryCov_9fa48("112641"), medianLatency * this.stragglerThresholdMultiplier);
      for (const [partitionId, partitionMetrics] of metrics.partitionMetrics) {
        if (stryMutAct_9fa48("112642")) {
          {}
        } else {
          stryCov_9fa48("112642");
          if (stryMutAct_9fa48("112645") ? partitionMetrics.latencyMs !== null || partitionMetrics.latencyMs > stragglerThreshold : stryMutAct_9fa48("112644") ? false : stryMutAct_9fa48("112643") ? true : (stryCov_9fa48("112643", "112644", "112645"), (stryMutAct_9fa48("112647") ? partitionMetrics.latencyMs === null : stryMutAct_9fa48("112646") ? true : (stryCov_9fa48("112646", "112647"), partitionMetrics.latencyMs !== null)) && (stryMutAct_9fa48("112650") ? partitionMetrics.latencyMs <= stragglerThreshold : stryMutAct_9fa48("112649") ? partitionMetrics.latencyMs >= stragglerThreshold : stryMutAct_9fa48("112648") ? true : (stryCov_9fa48("112648", "112649", "112650"), partitionMetrics.latencyMs > stragglerThreshold)))) {
            if (stryMutAct_9fa48("112651")) {
              {}
            } else {
              stryCov_9fa48("112651");
              if (stryMutAct_9fa48("112654") ? false : stryMutAct_9fa48("112653") ? true : stryMutAct_9fa48("112652") ? metrics.stragglers.includes(partitionId) : (stryCov_9fa48("112652", "112653", "112654"), !metrics.stragglers.includes(partitionId))) {
                if (stryMutAct_9fa48("112655")) {
                  {}
                } else {
                  stryCov_9fa48("112655");
                  metrics.stragglers.push(partitionId);
                }
              }
              this.logger.warn(QUERY_LOG_MSG.STRAGGLER_DETECTED, stryMutAct_9fa48("112656") ? {} : (stryCov_9fa48("112656"), {
                partitionId,
                latencyMs: partitionMetrics.latencyMs,
                medianLatencyMs: medianLatency,
                threshold: stragglerThreshold,
                multiplier: this.stragglerThresholdMultiplier
              }));
            }
          }
        }
      }
    }
  }

  /**
   * Format metrics for response.
   * @param {QueryExecutionMetrics} metrics - Metrics tracker.
   * @return {Object} Formatted metrics.
   * @private
   */
  formatMetrics(metrics) {
    if (stryMutAct_9fa48("112657")) {
      {}
    } else {
      stryCov_9fa48("112657");
      const participantFailures = stryMutAct_9fa48("112658") ? Array.from(metrics.partitionMetrics.values()).map(metric => ({
        partitionId: metric.partitionId,
        participantNodeId: metric.participantNodeId,
        participantAddress: metric.participantAddress,
        errorCode: metric.errorCode,
        error: metric.error,
        durationMs: metric.latencyMs,
        retryAfterMs: metric.retryAfterMs,
        deferRetry: metric.deferRetry,
        backpressured: metric.backpressured,
        failedTable: metric.failedTable
      })) : (stryCov_9fa48("112658"), Array.from(metrics.partitionMetrics.values()).filter(stryMutAct_9fa48("112659") ? () => undefined : (stryCov_9fa48("112659"), metric => stryMutAct_9fa48("112662") ? metric.status !== QUERY_STATUS.FAILED : stryMutAct_9fa48("112661") ? false : stryMutAct_9fa48("112660") ? true : (stryCov_9fa48("112660", "112661", "112662"), metric.status === QUERY_STATUS.FAILED))).map(stryMutAct_9fa48("112663") ? () => undefined : (stryCov_9fa48("112663"), metric => stryMutAct_9fa48("112664") ? {} : (stryCov_9fa48("112664"), {
        partitionId: metric.partitionId,
        participantNodeId: metric.participantNodeId,
        participantAddress: metric.participantAddress,
        errorCode: metric.errorCode,
        error: metric.error,
        durationMs: metric.latencyMs,
        retryAfterMs: metric.retryAfterMs,
        deferRetry: metric.deferRetry,
        backpressured: metric.backpressured,
        failedTable: metric.failedTable
      }))));
      return stryMutAct_9fa48("112665") ? {} : (stryCov_9fa48("112665"), {
        queryId: metrics.queryId,
        partitionCount: metrics.partitionCount,
        totalLatencyMs: metrics.totalLatencyMs,
        medianLatencyMs: metrics.getMedianLatency(),
        totalRows: metrics.totalRows,
        totalBytes: metrics.totalBytes,
        stragglers: metrics.stragglers,
        speculativeExecutions: metrics.speculativeExecutions,
        participantFailures,
        firstFailedParticipant: (stryMutAct_9fa48("112669") ? participantFailures.length <= NUM.ZERO : stryMutAct_9fa48("112668") ? participantFailures.length >= NUM.ZERO : stryMutAct_9fa48("112667") ? false : stryMutAct_9fa48("112666") ? true : (stryCov_9fa48("112666", "112667", "112668", "112669"), participantFailures.length > NUM.ZERO)) ? participantFailures[NUM.ZERO] : null,
        partitionLatencies: Array.from(metrics.partitionMetrics.values()).map(stryMutAct_9fa48("112670") ? () => undefined : (stryCov_9fa48("112670"), m => stryMutAct_9fa48("112671") ? {} : (stryCov_9fa48("112671"), {
          partitionId: m.partitionId,
          latencyMs: m.latencyMs,
          status: m.status,
          rowCount: m.rowCount
        })))
      });
    }
  }

  /**
   * Get current resource usage.
   * @return {Object} Resource usage stats.
   */
  getResourceUsage() {
    if (stryMutAct_9fa48("112672")) {
      {}
    } else {
      stryCov_9fa48("112672");
      return stryMutAct_9fa48("112673") ? {} : (stryCov_9fa48("112673"), {
        activeConnections: this.activeConnections,
        maxConcurrentConnections: this.maxConcurrentConnections,
        maxParallelPartitions: this.maxParallelPartitions,
        maxResultBufferBytes: this.maxResultBufferBytes
      });
    }
  }
}
export { ParallelQueryCoordinator, PartitionQueryMetrics, QueryExecutionMetrics };