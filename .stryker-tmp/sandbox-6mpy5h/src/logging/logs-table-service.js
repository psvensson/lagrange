/**
 * Logs Table Service - Manages writing logs to the logs system table.
 * Handles flushing buffered logs after bootstrap completes.
 * Requirements: 27.1, 27.3, 28.1, 28.2, 28.3, 28.4, 28.5
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
import { EventEmitter } from 'events';
import { LoggingService } from './logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { METRICS_LOG_PREFIX } from '../constants/metrics-constants.js';
import { LOGGING_ERROR_MSG, LOGGING_LOG_MSG, LOG_LEVEL_ORDER, LOGS_TABLE_DEFAULT } from './logging-constants.js';
import { WORK_CLASS, WORK_CLASS_SCHEDULER_ERROR, WorkClassScheduler } from '../runtime/work-class-scheduler.js';
import { PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor } from '../control-plane/pressure-governor.js';
import { createSystemMetadataOwnerRequiredError } from '../control-plane/system-metadata-access-error.js';
import { CONTROL_PLANE_ROLLOUT_REQUIRED, assertRequiredControlPlaneRollout } from '../runtime/control-plane-rollout-controls.js';
const LOGGING_METRIC_PREFIX = stryMutAct_9fa48("84146") ? "" : (stryCov_9fa48("84146"), 'metrics.logging.');
const LOGS_TABLE_METRIC_PREFIX = stryMutAct_9fa48("84147") ? "" : (stryCov_9fa48("84147"), 'metrics.logs_table.');
const LOG_RETENTION_METRIC_PREFIX = stryMutAct_9fa48("84148") ? "" : (stryCov_9fa48("84148"), 'metrics.log_retention.');
const LOG_QUERY_METRIC_PREFIX = stryMutAct_9fa48("84149") ? "" : (stryCov_9fa48("84149"), 'metrics.log_query.');
const LOGGING_PIPELINE_METRIC_PREFIX = Object.freeze(stryMutAct_9fa48("84150") ? {} : (stryCov_9fa48("84150"), {
  LOGGING: LOGGING_METRIC_PREFIX,
  LOGS_TABLE: LOGS_TABLE_METRIC_PREFIX,
  LOG_RETENTION: LOG_RETENTION_METRIC_PREFIX,
  LOG_QUERY: LOG_QUERY_METRIC_PREFIX
}));
const LOGGING_PIPELINE_METRIC_PREFIXES = Object.freeze(Object.values(LOGGING_PIPELINE_METRIC_PREFIX));
const LOGS_TABLE_CONNECTED_EVENT = stryMutAct_9fa48("84151") ? "" : (stryCov_9fa48("84151"), 'connected');
const LOGS_TABLE_FLUSHED_EVENT = stryMutAct_9fa48("84152") ? "" : (stryCov_9fa48("84152"), 'flushed');
const LOGS_TABLE_EVENT = Object.freeze(stryMutAct_9fa48("84153") ? {} : (stryCov_9fa48("84153"), {
  CONNECTED: LOGS_TABLE_CONNECTED_EVENT,
  FLUSHED: LOGS_TABLE_FLUSHED_EVENT
}));
const LOGS_TABLE_FLUSH_MODE = stryMutAct_9fa48("84154") ? "" : (stryCov_9fa48("84154"), 'background');
const LOGS_TABLE_CONNECT_METRIC = stryMutAct_9fa48("84155") ? "" : (stryCov_9fa48("84155"), 'metrics.logging.logs_table_connect.start');
const LOGS_TABLE_OWNER = stryMutAct_9fa48("84156") ? "" : (stryCov_9fa48("84156"), 'LogsTableService');
const MIN_CHUNK_SIZE = 1;
const MIN_YIELD_MS = 0;
const MIN_SLEEP_MS = 1;
const LOG_PRESSURE_FAMILY = Object.freeze(stryMutAct_9fa48("84157") ? {} : (stryCov_9fa48("84157"), {
  CONNECTION_CLOSED: stryMutAct_9fa48("84158") ? "" : (stryCov_9fa48("84158"), 'connection_closed'),
  NO_CONNECTION: stryMutAct_9fa48("84159") ? "" : (stryCov_9fa48("84159"), 'no_connection'),
  MESSAGE_TIMEOUT: stryMutAct_9fa48("84160") ? "" : (stryCov_9fa48("84160"), 'message_timeout'),
  QUERY_ROUTING_FAILED: stryMutAct_9fa48("84161") ? "" : (stryCov_9fa48("84161"), 'query_routing_failed'),
  PARTICIPANT_FAILURE: stryMutAct_9fa48("84162") ? "" : (stryCov_9fa48("84162"), 'participant_failure'),
  FORWARD_WRITE_FAILED: stryMutAct_9fa48("84163") ? "" : (stryCov_9fa48("84163"), 'forward_write_failed')
}));

/**
 * LogsTableService manages writing log entries to the logs system table.
 * It integrates with LoggingService to flush buffered entries after bootstrap.
 */
class LogsTableService extends EventEmitter {
  static instance = null;

  /**
   * Create a new LogsTableService.
   * @param {Object} options - Configuration options.
   * @private
   */
  constructor(options = {}) {
    super();
    this.rolloutControls = assertRequiredControlPlaneRollout(stryMutAct_9fa48("84164") ? {} : (stryCov_9fa48("84164"), {
      owner: LOGS_TABLE_OWNER,
      controls: options.rolloutControls,
      required: CONTROL_PLANE_ROLLOUT_REQUIRED.LOGS_TABLE_SERVICE
    }));
    this.logsOwner = stryMutAct_9fa48("84167") ? options.logsOwner && null : stryMutAct_9fa48("84166") ? false : stryMutAct_9fa48("84165") ? true : (stryCov_9fa48("84165", "84166", "84167"), options.logsOwner || null);
    this.messageRouter = stryMutAct_9fa48("84170") ? options.messageRouter && null : stryMutAct_9fa48("84169") ? false : stryMutAct_9fa48("84168") ? true : (stryCov_9fa48("84168", "84169", "84170"), options.messageRouter || null);
    this.pressureGovernor = stryMutAct_9fa48("84173") ? options.pressureGovernor && null : stryMutAct_9fa48("84172") ? false : stryMutAct_9fa48("84171") ? true : (stryCov_9fa48("84171", "84172", "84173"), options.pressureGovernor || null);

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.batchSize = stryMutAct_9fa48("84176") ? (options.batchSize || config.get(CONFIG_KEY.LOGGING_BATCH_SIZE)) && LOGS_TABLE_DEFAULT.BATCH_SIZE : stryMutAct_9fa48("84175") ? false : stryMutAct_9fa48("84174") ? true : (stryCov_9fa48("84174", "84175", "84176"), (stryMutAct_9fa48("84178") ? options.batchSize && config.get(CONFIG_KEY.LOGGING_BATCH_SIZE) : stryMutAct_9fa48("84177") ? false : (stryCov_9fa48("84177", "84178"), options.batchSize || config.get(CONFIG_KEY.LOGGING_BATCH_SIZE))) || LOGS_TABLE_DEFAULT.BATCH_SIZE);
    this.flushIntervalMs = stryMutAct_9fa48("84181") ? (options.flushIntervalMs || config.get(CONFIG_KEY.LOGGING_FLUSH_INTERVAL_MS)) && LOGS_TABLE_DEFAULT.FLUSH_INTERVAL_MS : stryMutAct_9fa48("84180") ? false : stryMutAct_9fa48("84179") ? true : (stryCov_9fa48("84179", "84180", "84181"), (stryMutAct_9fa48("84183") ? options.flushIntervalMs && config.get(CONFIG_KEY.LOGGING_FLUSH_INTERVAL_MS) : stryMutAct_9fa48("84182") ? false : (stryCov_9fa48("84182", "84183"), options.flushIntervalMs || config.get(CONFIG_KEY.LOGGING_FLUSH_INTERVAL_MS))) || LOGS_TABLE_DEFAULT.FLUSH_INTERVAL_MS);
    this.maxRetries = stryMutAct_9fa48("84186") ? (options.maxRetries || config.get(CONFIG_KEY.LOGGING_MAX_RETRIES)) && LOGS_TABLE_DEFAULT.MAX_RETRIES : stryMutAct_9fa48("84185") ? false : stryMutAct_9fa48("84184") ? true : (stryCov_9fa48("84184", "84185", "84186"), (stryMutAct_9fa48("84188") ? options.maxRetries && config.get(CONFIG_KEY.LOGGING_MAX_RETRIES) : stryMutAct_9fa48("84187") ? false : (stryCov_9fa48("84187", "84188"), options.maxRetries || config.get(CONFIG_KEY.LOGGING_MAX_RETRIES))) || LOGS_TABLE_DEFAULT.MAX_RETRIES);
    this.retryDelayMs = stryMutAct_9fa48("84191") ? (options.retryDelayMs || config.get(CONFIG_KEY.LOGGING_RETRY_DELAY_MS)) && LOGS_TABLE_DEFAULT.RETRY_DELAY_MS : stryMutAct_9fa48("84190") ? false : stryMutAct_9fa48("84189") ? true : (stryCov_9fa48("84189", "84190", "84191"), (stryMutAct_9fa48("84193") ? options.retryDelayMs && config.get(CONFIG_KEY.LOGGING_RETRY_DELAY_MS) : stryMutAct_9fa48("84192") ? false : (stryCov_9fa48("84192", "84193"), options.retryDelayMs || config.get(CONFIG_KEY.LOGGING_RETRY_DELAY_MS))) || LOGS_TABLE_DEFAULT.RETRY_DELAY_MS);
    this.flushChunkSize = (stryMutAct_9fa48("84196") ? Number.isFinite(options.flushChunkSize) || options.flushChunkSize > 0 : stryMutAct_9fa48("84195") ? false : stryMutAct_9fa48("84194") ? true : (stryCov_9fa48("84194", "84195", "84196"), Number.isFinite(options.flushChunkSize) && (stryMutAct_9fa48("84199") ? options.flushChunkSize <= 0 : stryMutAct_9fa48("84198") ? options.flushChunkSize >= 0 : stryMutAct_9fa48("84197") ? true : (stryCov_9fa48("84197", "84198", "84199"), options.flushChunkSize > 0)))) ? Math.floor(options.flushChunkSize) : LOGS_TABLE_DEFAULT.FLUSH_CHUNK_SIZE;
    this.flushYieldMs = (stryMutAct_9fa48("84202") ? Number.isFinite(options.flushYieldMs) || options.flushYieldMs >= 0 : stryMutAct_9fa48("84201") ? false : stryMutAct_9fa48("84200") ? true : (stryCov_9fa48("84200", "84201", "84202"), Number.isFinite(options.flushYieldMs) && (stryMutAct_9fa48("84205") ? options.flushYieldMs < 0 : stryMutAct_9fa48("84204") ? options.flushYieldMs > 0 : stryMutAct_9fa48("84203") ? true : (stryCov_9fa48("84203", "84204", "84205"), options.flushYieldMs >= 0)))) ? Math.floor(options.flushYieldMs) : LOGS_TABLE_DEFAULT.FLUSH_YIELD_MS;
    this.maxPendingWrites = (stryMutAct_9fa48("84208") ? Number.isFinite(options.maxPendingWrites) || options.maxPendingWrites > 0 : stryMutAct_9fa48("84207") ? false : stryMutAct_9fa48("84206") ? true : (stryCov_9fa48("84206", "84207", "84208"), Number.isFinite(options.maxPendingWrites) && (stryMutAct_9fa48("84211") ? options.maxPendingWrites <= 0 : stryMutAct_9fa48("84210") ? options.maxPendingWrites >= 0 : stryMutAct_9fa48("84209") ? true : (stryCov_9fa48("84209", "84210", "84211"), options.maxPendingWrites > 0)))) ? Math.floor(options.maxPendingWrites) : LOGS_TABLE_DEFAULT.MAX_PENDING_WRITES;
    this.pressureHighWatermark = (stryMutAct_9fa48("84214") ? Number.isFinite(options.pressureHighWatermark) || options.pressureHighWatermark > 0 : stryMutAct_9fa48("84213") ? false : stryMutAct_9fa48("84212") ? true : (stryCov_9fa48("84212", "84213", "84214"), Number.isFinite(options.pressureHighWatermark) && (stryMutAct_9fa48("84217") ? options.pressureHighWatermark <= 0 : stryMutAct_9fa48("84216") ? options.pressureHighWatermark >= 0 : stryMutAct_9fa48("84215") ? true : (stryCov_9fa48("84215", "84216", "84217"), options.pressureHighWatermark > 0)))) ? stryMutAct_9fa48("84218") ? Math.max(this.maxPendingWrites, Math.floor(options.pressureHighWatermark)) : (stryCov_9fa48("84218"), Math.min(this.maxPendingWrites, Math.floor(options.pressureHighWatermark))) : stryMutAct_9fa48("84219") ? Math.max(this.maxPendingWrites, LOGS_TABLE_DEFAULT.PRESSURE_HIGH_WATERMARK) : (stryCov_9fa48("84219"), Math.min(this.maxPendingWrites, LOGS_TABLE_DEFAULT.PRESSURE_HIGH_WATERMARK));
    this.pressureRetainedPendingWrites = (stryMutAct_9fa48("84222") ? Number.isFinite(options.pressureRetainedPendingWrites) || options.pressureRetainedPendingWrites > 0 : stryMutAct_9fa48("84221") ? false : stryMutAct_9fa48("84220") ? true : (stryCov_9fa48("84220", "84221", "84222"), Number.isFinite(options.pressureRetainedPendingWrites) && (stryMutAct_9fa48("84225") ? options.pressureRetainedPendingWrites <= 0 : stryMutAct_9fa48("84224") ? options.pressureRetainedPendingWrites >= 0 : stryMutAct_9fa48("84223") ? true : (stryCov_9fa48("84223", "84224", "84225"), options.pressureRetainedPendingWrites > 0)))) ? stryMutAct_9fa48("84226") ? Math.max(this.maxPendingWrites, Math.floor(options.pressureRetainedPendingWrites)) : (stryCov_9fa48("84226"), Math.min(this.maxPendingWrites, Math.floor(options.pressureRetainedPendingWrites))) : stryMutAct_9fa48("84227") ? Math.max(this.maxPendingWrites, LOGS_TABLE_DEFAULT.PRESSURE_RETAINED_PENDING_WRITES) : (stryCov_9fa48("84227"), Math.min(this.maxPendingWrites, LOGS_TABLE_DEFAULT.PRESSURE_RETAINED_PENDING_WRITES));
    this.pressureDeferBackoffMultiplier = (stryMutAct_9fa48("84230") ? Number.isFinite(options.pressureDeferBackoffMultiplier) || options.pressureDeferBackoffMultiplier >= 1 : stryMutAct_9fa48("84229") ? false : stryMutAct_9fa48("84228") ? true : (stryCov_9fa48("84228", "84229", "84230"), Number.isFinite(options.pressureDeferBackoffMultiplier) && (stryMutAct_9fa48("84233") ? options.pressureDeferBackoffMultiplier < 1 : stryMutAct_9fa48("84232") ? options.pressureDeferBackoffMultiplier > 1 : stryMutAct_9fa48("84231") ? true : (stryCov_9fa48("84231", "84232", "84233"), options.pressureDeferBackoffMultiplier >= 1)))) ? options.pressureDeferBackoffMultiplier : LOGS_TABLE_DEFAULT.PRESSURE_DEFER_BACKOFF_MULTIPLIER;
    this.pressureMaxRetryDelayMs = (stryMutAct_9fa48("84236") ? Number.isFinite(options.pressureMaxRetryDelayMs) || options.pressureMaxRetryDelayMs > 0 : stryMutAct_9fa48("84235") ? false : stryMutAct_9fa48("84234") ? true : (stryCov_9fa48("84234", "84235", "84236"), Number.isFinite(options.pressureMaxRetryDelayMs) && (stryMutAct_9fa48("84239") ? options.pressureMaxRetryDelayMs <= 0 : stryMutAct_9fa48("84238") ? options.pressureMaxRetryDelayMs >= 0 : stryMutAct_9fa48("84237") ? true : (stryCov_9fa48("84237", "84238", "84239"), options.pressureMaxRetryDelayMs > 0)))) ? Math.floor(options.pressureMaxRetryDelayMs) : LOGS_TABLE_DEFAULT.PRESSURE_MAX_RETRY_DELAY_MS;
    this.workClassScheduler = stryMutAct_9fa48("84242") ? options.workClassScheduler && new WorkClassScheduler() : stryMutAct_9fa48("84241") ? false : stryMutAct_9fa48("84240") ? true : (stryCov_9fa48("84240", "84241", "84242"), options.workClassScheduler || new WorkClassScheduler());
    this.now = (stryMutAct_9fa48("84245") ? typeof options.now !== 'function' : stryMutAct_9fa48("84244") ? false : stryMutAct_9fa48("84243") ? true : (stryCov_9fa48("84243", "84244", "84245"), typeof options.now === (stryMutAct_9fa48("84246") ? "" : (stryCov_9fa48("84246"), 'function')))) ? options.now : stryMutAct_9fa48("84247") ? () => undefined : (stryCov_9fa48("84247"), () => Date.now());
    this.setTimeoutFn = (stryMutAct_9fa48("84250") ? typeof options.setTimeoutFn !== 'function' : stryMutAct_9fa48("84249") ? false : stryMutAct_9fa48("84248") ? true : (stryCov_9fa48("84248", "84249", "84250"), typeof options.setTimeoutFn === (stryMutAct_9fa48("84251") ? "" : (stryCov_9fa48("84251"), 'function')))) ? options.setTimeoutFn : setTimeout;
    this.clearTimeoutFn = (stryMutAct_9fa48("84254") ? typeof options.clearTimeoutFn !== 'function' : stryMutAct_9fa48("84253") ? false : stryMutAct_9fa48("84252") ? true : (stryCov_9fa48("84252", "84253", "84254"), typeof options.clearTimeoutFn === (stryMutAct_9fa48("84255") ? "" : (stryCov_9fa48("84255"), 'function')))) ? options.clearTimeoutFn : clearTimeout;
    this.setIntervalFn = (stryMutAct_9fa48("84258") ? typeof options.setIntervalFn !== 'function' : stryMutAct_9fa48("84257") ? false : stryMutAct_9fa48("84256") ? true : (stryCov_9fa48("84256", "84257", "84258"), typeof options.setIntervalFn === (stryMutAct_9fa48("84259") ? "" : (stryCov_9fa48("84259"), 'function')))) ? options.setIntervalFn : setInterval;
    this.clearIntervalFn = (stryMutAct_9fa48("84262") ? typeof options.clearIntervalFn !== 'function' : stryMutAct_9fa48("84261") ? false : stryMutAct_9fa48("84260") ? true : (stryCov_9fa48("84260", "84261", "84262"), typeof options.clearIntervalFn === (stryMutAct_9fa48("84263") ? "" : (stryCov_9fa48("84263"), 'function')))) ? options.clearIntervalFn : clearInterval;

    // State
    this.initialized = stryMutAct_9fa48("84264") ? true : (stryCov_9fa48("84264"), false);
    this.pendingWrites = stryMutAct_9fa48("84265") ? ["Stryker was here"] : (stryCov_9fa48("84265"), []);
    this.flushTimer = null;
    this.flushContinuationTimer = null;
    this.flushContinuationDueAtMs = null;
    this.flushWorkScheduled = stryMutAct_9fa48("84266") ? true : (stryCov_9fa48("84266"), false);
    this.isWriting = stryMutAct_9fa48("84267") ? true : (stryCov_9fa48("84267"), false);
    this.isShuttingDown = stryMutAct_9fa48("84268") ? true : (stryCov_9fa48("84268"), false);
    this.writeDeferredUntilMs = 0;
    this.writeCount = 0;
    this.errorCount = 0;
    this.droppedWrites = 0;
    this.selfLoopPreventedWrites = 0;
    this.consecutiveDeferredWriteFailures = 0;
    this.pendingWriteGrowthCount = 0;
    this.retainedBacklogGrowthCount = 0;

    // Logging (use console until we're fully initialized to avoid recursion)
    this.logger = console;
  }

  /**
   * Get the singleton instance.
   * @return {LogsTableService} The logs table service instance.
   */
  static getInstance(options = {}) {
    if (stryMutAct_9fa48("84269")) {
      {}
    } else {
      stryCov_9fa48("84269");
      if (stryMutAct_9fa48("84272") ? false : stryMutAct_9fa48("84271") ? true : stryMutAct_9fa48("84270") ? LogsTableService.instance : (stryCov_9fa48("84270", "84271", "84272"), !LogsTableService.instance)) {
        if (stryMutAct_9fa48("84273")) {
          {}
        } else {
          stryCov_9fa48("84273");
          LogsTableService.instance = new LogsTableService(options);
        }
      }
      return LogsTableService.instance;
    }
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (stryMutAct_9fa48("84274")) {
      {}
    } else {
      stryCov_9fa48("84274");
      const instance = LogsTableService.instance;
      if (stryMutAct_9fa48("84277") ? false : stryMutAct_9fa48("84276") ? true : stryMutAct_9fa48("84275") ? instance : (stryCov_9fa48("84275", "84276", "84277"), !instance)) {
        if (stryMutAct_9fa48("84278")) {
          {}
        } else {
          stryCov_9fa48("84278");
          return;
        }
      }

      // Reset must be synchronous for test teardown reliability.
      // Avoid launching async shutdown work that can outlive the test process.
      instance.isShuttingDown = stryMutAct_9fa48("84279") ? false : (stryCov_9fa48("84279"), true);
      instance.stopFlushTimer();
      instance.pendingWrites = stryMutAct_9fa48("84280") ? ["Stryker was here"] : (stryCov_9fa48("84280"), []);
      instance.flushWorkScheduled = stryMutAct_9fa48("84281") ? true : (stryCov_9fa48("84281"), false);
      instance.isWriting = stryMutAct_9fa48("84282") ? true : (stryCov_9fa48("84282"), false);
      instance.flushContinuationDueAtMs = null;
      instance.writeDeferredUntilMs = 0;
      instance.initialized = stryMutAct_9fa48("84283") ? true : (stryCov_9fa48("84283"), false);
      instance.isShuttingDown = stryMutAct_9fa48("84284") ? true : (stryCov_9fa48("84284"), false);
      instance.consecutiveDeferredWriteFailures = 0;
      instance.pendingWriteGrowthCount = 0;
      instance.retainedBacklogGrowthCount = 0;
      instance.removeAllListeners();
      LogsTableService.instance = null;
    }
  }

  /**
   * Initialize the logs table service.
   * @param {Object} options - Initialization options.
   * @param {Object} options.logsOwner - Semantic owner for logs-table writes.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("84285")) {
      {}
    } else {
      stryCov_9fa48("84285");
      if (stryMutAct_9fa48("84287") ? false : stryMutAct_9fa48("84286") ? true : (stryCov_9fa48("84286", "84287"), this.initialized)) {
        if (stryMutAct_9fa48("84288")) {
          {}
        } else {
          stryCov_9fa48("84288");
          return;
        }
      }
      if (stryMutAct_9fa48("84290") ? false : stryMutAct_9fa48("84289") ? true : (stryCov_9fa48("84289", "84290"), options.logsOwner)) {
        if (stryMutAct_9fa48("84291")) {
          {}
        } else {
          stryCov_9fa48("84291");
          this.logsOwner = options.logsOwner;
        }
      }
      if (stryMutAct_9fa48("84293") ? false : stryMutAct_9fa48("84292") ? true : (stryCov_9fa48("84292", "84293"), Object.prototype.hasOwnProperty.call(options, stryMutAct_9fa48("84294") ? "" : (stryCov_9fa48("84294"), 'messageRouter')))) {
        if (stryMutAct_9fa48("84295")) {
          {}
        } else {
          stryCov_9fa48("84295");
          this.messageRouter = stryMutAct_9fa48("84298") ? options.messageRouter && null : stryMutAct_9fa48("84297") ? false : stryMutAct_9fa48("84296") ? true : (stryCov_9fa48("84296", "84297", "84298"), options.messageRouter || null);
        }
      }
      if (stryMutAct_9fa48("84300") ? false : stryMutAct_9fa48("84299") ? true : (stryCov_9fa48("84299", "84300"), Object.prototype.hasOwnProperty.call(options, stryMutAct_9fa48("84301") ? "" : (stryCov_9fa48("84301"), 'pressureGovernor')))) {
        if (stryMutAct_9fa48("84302")) {
          {}
        } else {
          stryCov_9fa48("84302");
          this.pressureGovernor = stryMutAct_9fa48("84305") ? options.pressureGovernor && null : stryMutAct_9fa48("84304") ? false : stryMutAct_9fa48("84303") ? true : (stryCov_9fa48("84303", "84304", "84305"), options.pressureGovernor || null);
        }
      }

      // Start periodic flush timer
      this.startFlushTimer();
      this.initialized = stryMutAct_9fa48("84306") ? false : (stryCov_9fa48("84306"), true);
      this.logger.log(LOGGING_LOG_MSG.LOGS_TABLE_SERVICE_INITIALIZED);
    }
  }

  /**
   * Connect to the logging service and register as the write callback.
   * This should be called after bootstrap completes and logs table is ready.
   * @return {Promise<number>} Number of buffered entries flushed.
   */
  async connectToLoggingService() {
    if (stryMutAct_9fa48("84307")) {
      {}
    } else {
      stryCov_9fa48("84307");
      const loggingService = LoggingService.getInstance();
      if (stryMutAct_9fa48("84310") ? false : stryMutAct_9fa48("84309") ? true : stryMutAct_9fa48("84308") ? loggingService.isInitialized() : (stryCov_9fa48("84308", "84309", "84310"), !loggingService.isInitialized())) {
        if (stryMutAct_9fa48("84311")) {
          {}
        } else {
          stryCov_9fa48("84311");
          throw new Error(LOGGING_ERROR_MSG.LOGGING_SERVICE_REQUIRED);
        }
      }
      const bufferedEntries = loggingService.getBufferSize();
      const useThrottledStartupDrain = stryMutAct_9fa48("84315") ? bufferedEntries < LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_THRESHOLD : stryMutAct_9fa48("84314") ? bufferedEntries > LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_THRESHOLD : stryMutAct_9fa48("84313") ? false : stryMutAct_9fa48("84312") ? true : (stryCov_9fa48("84312", "84313", "84314", "84315"), bufferedEntries >= LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_THRESHOLD);
      const backgroundChunkSize = stryMutAct_9fa48("84316") ? Math.min(MIN_CHUNK_SIZE, useThrottledStartupDrain ? LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_CHUNK_SIZE : Math.min(this.batchSize, LOGS_TABLE_DEFAULT.BACKGROUND_FLUSH_CHUNK_SIZE)) : (stryCov_9fa48("84316"), Math.max(MIN_CHUNK_SIZE, useThrottledStartupDrain ? LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_CHUNK_SIZE : stryMutAct_9fa48("84317") ? Math.max(this.batchSize, LOGS_TABLE_DEFAULT.BACKGROUND_FLUSH_CHUNK_SIZE) : (stryCov_9fa48("84317"), Math.min(this.batchSize, LOGS_TABLE_DEFAULT.BACKGROUND_FLUSH_CHUNK_SIZE))));
      const backgroundYieldMs = stryMutAct_9fa48("84318") ? Math.min(MIN_YIELD_MS, useThrottledStartupDrain ? LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_YIELD_MS : LOGS_TABLE_DEFAULT.BACKGROUND_FLUSH_YIELD_MS) : (stryCov_9fa48("84318"), Math.max(MIN_YIELD_MS, useThrottledStartupDrain ? LOGS_TABLE_DEFAULT.STARTUP_THROTTLED_BACKGROUND_FLUSH_YIELD_MS : LOGS_TABLE_DEFAULT.BACKGROUND_FLUSH_YIELD_MS));
      this.logger.log(LOGS_TABLE_CONNECT_METRIC, stryMutAct_9fa48("84319") ? {} : (stryCov_9fa48("84319"), {
        bufferedEntries,
        flushMode: LOGS_TABLE_FLUSH_MODE,
        chunkSize: backgroundChunkSize,
        yieldMs: backgroundYieldMs
      }));

      // Register our write callback with the logging service
      const flushedCount = await loggingService.onLogsTableReady(stryMutAct_9fa48("84320") ? () => undefined : (stryCov_9fa48("84320"), entry => this.writeLogEntry(entry)), stryMutAct_9fa48("84321") ? {} : (stryCov_9fa48("84321"), {
        flushMode: LOGS_TABLE_FLUSH_MODE,
        chunkSize: backgroundChunkSize,
        yieldMs: backgroundYieldMs
      }));
      this.logger.log(LOGGING_LOG_MSG.connectedLoggingService(flushedCount));
      this.emit(LOGS_TABLE_EVENT.CONNECTED, stryMutAct_9fa48("84322") ? {} : (stryCov_9fa48("84322"), {
        flushedCount
      }));
      return flushedCount;
    }
  }

  /**
   * Write a log entry to the logs system table.
   * @param {Object} entry - Log entry to write.
   * @return {Promise<void>}
   */
  async writeLogEntry(entry) {
    if (stryMutAct_9fa48("84323")) {
      {}
    } else {
      stryCov_9fa48("84323");
      if (stryMutAct_9fa48("84326") ? (!entry || !this.initialized) && this.isShuttingDown : stryMutAct_9fa48("84325") ? false : stryMutAct_9fa48("84324") ? true : (stryCov_9fa48("84324", "84325", "84326"), (stryMutAct_9fa48("84328") ? !entry && !this.initialized : stryMutAct_9fa48("84327") ? false : (stryCov_9fa48("84327", "84328"), (stryMutAct_9fa48("84329") ? entry : (stryCov_9fa48("84329"), !entry)) || (stryMutAct_9fa48("84330") ? this.initialized : (stryCov_9fa48("84330"), !this.initialized)))) || this.isShuttingDown)) {
        if (stryMutAct_9fa48("84331")) {
          {}
        } else {
          stryCov_9fa48("84331");
          return;
        }
      }
      if (stryMutAct_9fa48("84333") ? false : stryMutAct_9fa48("84332") ? true : (stryCov_9fa48("84332", "84333"), this.isLoggingPipelineMetricsEntry(entry))) {
        if (stryMutAct_9fa48("84334")) {
          {}
        } else {
          stryCov_9fa48("84334");
          stryMutAct_9fa48("84335") ? this.selfLoopPreventedWrites -= 1 : (stryCov_9fa48("84335"), this.selfLoopPreventedWrites += 1);
          return;
        }
      }
      this.applySharedPressureDeferWindow();
      if (stryMutAct_9fa48("84337") ? false : stryMutAct_9fa48("84336") ? true : (stryCov_9fa48("84336", "84337"), this.isPressureModeActive())) {
        if (stryMutAct_9fa48("84338")) {
          {}
        } else {
          stryCov_9fa48("84338");
          if (stryMutAct_9fa48("84341") ? this.shouldApplyRetainedBacklogCap() || this.pendingWrites.length >= this.getRetainedPressureBacklogCap() : stryMutAct_9fa48("84340") ? false : stryMutAct_9fa48("84339") ? true : (stryCov_9fa48("84339", "84340", "84341"), this.shouldApplyRetainedBacklogCap() && (stryMutAct_9fa48("84344") ? this.pendingWrites.length < this.getRetainedPressureBacklogCap() : stryMutAct_9fa48("84343") ? this.pendingWrites.length > this.getRetainedPressureBacklogCap() : stryMutAct_9fa48("84342") ? true : (stryCov_9fa48("84342", "84343", "84344"), this.pendingWrites.length >= this.getRetainedPressureBacklogCap())))) {
            if (stryMutAct_9fa48("84345")) {
              {}
            } else {
              stryCov_9fa48("84345");
              const droppedPendingEntry = this.dropPendingQueuedEntryForAdmission(entry);
              if (stryMutAct_9fa48("84348") ? !droppedPendingEntry && this.shouldDropEntryUnderPressure(entry) : stryMutAct_9fa48("84347") ? false : stryMutAct_9fa48("84346") ? true : (stryCov_9fa48("84346", "84347", "84348"), (stryMutAct_9fa48("84349") ? droppedPendingEntry : (stryCov_9fa48("84349"), !droppedPendingEntry)) || this.shouldDropEntryUnderPressure(entry))) {
                if (stryMutAct_9fa48("84350")) {
                  {}
                } else {
                  stryCov_9fa48("84350");
                  this.recordDroppedWrite();
                  return;
                }
              }
            }
          }
          if (stryMutAct_9fa48("84352") ? false : stryMutAct_9fa48("84351") ? true : (stryCov_9fa48("84351", "84352"), this.shouldDropEntryUnderPressure(entry))) {
            if (stryMutAct_9fa48("84353")) {
              {}
            } else {
              stryCov_9fa48("84353");
              this.recordDroppedWrite();
              return;
            }
          }
        }
      }
      if (stryMutAct_9fa48("84357") ? this.pendingWrites.length < this.maxPendingWrites : stryMutAct_9fa48("84356") ? this.pendingWrites.length > this.maxPendingWrites : stryMutAct_9fa48("84355") ? false : stryMutAct_9fa48("84354") ? true : (stryCov_9fa48("84354", "84355", "84356", "84357"), this.pendingWrites.length >= this.maxPendingWrites)) {
        if (stryMutAct_9fa48("84358")) {
          {}
        } else {
          stryCov_9fa48("84358");
          if (stryMutAct_9fa48("84360") ? false : stryMutAct_9fa48("84359") ? true : (stryCov_9fa48("84359", "84360"), this.isMetricsLogEntry(entry))) {
            if (stryMutAct_9fa48("84361")) {
              {}
            } else {
              stryCov_9fa48("84361");
              this.recordDroppedWrite();
              return;
            }
          }
          const droppedPendingEntry = this.dropPendingQueuedEntryForAdmission(entry);
          if (stryMutAct_9fa48("84364") ? false : stryMutAct_9fa48("84363") ? true : stryMutAct_9fa48("84362") ? droppedPendingEntry : (stryCov_9fa48("84362", "84363", "84364"), !droppedPendingEntry)) {
            if (stryMutAct_9fa48("84365")) {
              {}
            } else {
              stryCov_9fa48("84365");
              this.recordDroppedWrite();
              return;
            }
          }
        }
      }

      // Add to pending writes
      this.pendingWrites.push(entry);
      this.incrementBoundedCounter(stryMutAct_9fa48("84366") ? "" : (stryCov_9fa48("84366"), 'pendingWriteGrowthCount'));

      // Flush if batch size reached
      if (stryMutAct_9fa48("84370") ? this.pendingWrites.length < this.batchSize : stryMutAct_9fa48("84369") ? this.pendingWrites.length > this.batchSize : stryMutAct_9fa48("84368") ? false : stryMutAct_9fa48("84367") ? true : (stryCov_9fa48("84367", "84368", "84369", "84370"), this.pendingWrites.length >= this.batchSize)) {
        if (stryMutAct_9fa48("84371")) {
          {}
        } else {
          stryCov_9fa48("84371");
          await this.flush(stryMutAct_9fa48("84372") ? {} : (stryCov_9fa48("84372"), {
            maxEntries: this.flushChunkSize,
            yieldPending: stryMutAct_9fa48("84373") ? false : (stryCov_9fa48("84373"), true)
          }));
        }
      }
    }
  }

  /**
   * Flush pending log entries to the logs table.
   * @param {Object} [options] - Flush behavior options.
   * @param {number} [options.maxEntries] - Max entries to process in this pass.
   * @param {boolean} [options.yieldPending] - Schedule continuation when pending entries remain.
   * @return {Promise<number>} Number of entries written.
   */
  async flush(options = {}) {
    if (stryMutAct_9fa48("84374")) {
      {}
    } else {
      stryCov_9fa48("84374");
      if (stryMutAct_9fa48("84376") ? false : stryMutAct_9fa48("84375") ? true : (stryCov_9fa48("84375", "84376"), this.isWriteDeferred())) {
        if (stryMutAct_9fa48("84377")) {
          {}
        } else {
          stryCov_9fa48("84377");
          this.scheduleContinuationFlush(this.getRemainingWriteDeferMs());
          return 0;
        }
      }
      const scheduleThroughWorkClass = stryMutAct_9fa48("84380") ? options.scheduleThroughWorkClass === false : stryMutAct_9fa48("84379") ? false : stryMutAct_9fa48("84378") ? true : (stryCov_9fa48("84378", "84379", "84380"), options.scheduleThroughWorkClass !== (stryMutAct_9fa48("84381") ? true : (stryCov_9fa48("84381"), false)));
      if (stryMutAct_9fa48("84384") ? scheduleThroughWorkClass && this.workClassScheduler || !this.isShuttingDown : stryMutAct_9fa48("84383") ? false : stryMutAct_9fa48("84382") ? true : (stryCov_9fa48("84382", "84383", "84384"), (stryMutAct_9fa48("84386") ? scheduleThroughWorkClass || this.workClassScheduler : stryMutAct_9fa48("84385") ? true : (stryCov_9fa48("84385", "84386"), scheduleThroughWorkClass && this.workClassScheduler)) && (stryMutAct_9fa48("84387") ? this.isShuttingDown : (stryCov_9fa48("84387"), !this.isShuttingDown)))) {
        if (stryMutAct_9fa48("84388")) {
          {}
        } else {
          stryCov_9fa48("84388");
          if (stryMutAct_9fa48("84390") ? false : stryMutAct_9fa48("84389") ? true : (stryCov_9fa48("84389", "84390"), this.flushWorkScheduled)) {
            if (stryMutAct_9fa48("84391")) {
              {}
            } else {
              stryCov_9fa48("84391");
              return 0;
            }
          }
          this.flushWorkScheduled = stryMutAct_9fa48("84392") ? false : (stryCov_9fa48("84392"), true);
          try {
            if (stryMutAct_9fa48("84393")) {
              {}
            } else {
              stryCov_9fa48("84393");
              return await this.workClassScheduler.enqueue(WORK_CLASS.C, async () => {
                if (stryMutAct_9fa48("84394")) {
                  {}
                } else {
                  stryCov_9fa48("84394");
                  return this.flush(stryMutAct_9fa48("84395") ? {} : (stryCov_9fa48("84395"), {
                    ...options,
                    scheduleThroughWorkClass: stryMutAct_9fa48("84396") ? true : (stryCov_9fa48("84396"), false)
                  }));
                }
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("84397")) {
              {}
            } else {
              stryCov_9fa48("84397");
              if (stryMutAct_9fa48("84400") ? error?.code !== WORK_CLASS_SCHEDULER_ERROR.WORK_CLASS_C_SHED : stryMutAct_9fa48("84399") ? false : stryMutAct_9fa48("84398") ? true : (stryCov_9fa48("84398", "84399", "84400"), (stryMutAct_9fa48("84401") ? error.code : (stryCov_9fa48("84401"), error?.code)) === WORK_CLASS_SCHEDULER_ERROR.WORK_CLASS_C_SHED)) {
                if (stryMutAct_9fa48("84402")) {
                  {}
                } else {
                  stryCov_9fa48("84402");
                  this.recordDroppedWrite();
                  return 0;
                }
              }
              throw error;
            }
          } finally {
            if (stryMutAct_9fa48("84403")) {
              {}
            } else {
              stryCov_9fa48("84403");
              this.flushWorkScheduled = stryMutAct_9fa48("84404") ? true : (stryCov_9fa48("84404"), false);
            }
          }
        }
      }
      if (stryMutAct_9fa48("84407") ? this.isWriting && this.pendingWrites.length === 0 : stryMutAct_9fa48("84406") ? false : stryMutAct_9fa48("84405") ? true : (stryCov_9fa48("84405", "84406", "84407"), this.isWriting || (stryMutAct_9fa48("84409") ? this.pendingWrites.length !== 0 : stryMutAct_9fa48("84408") ? false : (stryCov_9fa48("84408", "84409"), this.pendingWrites.length === 0)))) {
        if (stryMutAct_9fa48("84410")) {
          {}
        } else {
          stryCov_9fa48("84410");
          return 0;
        }
      }
      const maxEntries = (stryMutAct_9fa48("84413") ? Number.isFinite(options.maxEntries) || options.maxEntries > 0 : stryMutAct_9fa48("84412") ? false : stryMutAct_9fa48("84411") ? true : (stryCov_9fa48("84411", "84412", "84413"), Number.isFinite(options.maxEntries) && (stryMutAct_9fa48("84416") ? options.maxEntries <= 0 : stryMutAct_9fa48("84415") ? options.maxEntries >= 0 : stryMutAct_9fa48("84414") ? true : (stryCov_9fa48("84414", "84415", "84416"), options.maxEntries > 0)))) ? Math.floor(options.maxEntries) : this.pendingWrites.length;
      const yieldPending = stryMutAct_9fa48("84419") ? options.yieldPending !== true : stryMutAct_9fa48("84418") ? false : stryMutAct_9fa48("84417") ? true : (stryCov_9fa48("84417", "84418", "84419"), options.yieldPending === (stryMutAct_9fa48("84420") ? false : (stryCov_9fa48("84420"), true)));
      this.isWriting = stryMutAct_9fa48("84421") ? false : (stryCov_9fa48("84421"), true);
      const entriesToWrite = this.pendingWrites.splice(0, maxEntries);
      let writtenCount = 0;
      try {
        if (stryMutAct_9fa48("84422")) {
          {}
        } else {
          stryCov_9fa48("84422");
          for (let index = 0; stryMutAct_9fa48("84425") ? index >= entriesToWrite.length : stryMutAct_9fa48("84424") ? index <= entriesToWrite.length : stryMutAct_9fa48("84423") ? false : (stryCov_9fa48("84423", "84424", "84425"), index < entriesToWrite.length); stryMutAct_9fa48("84426") ? index -= 1 : (stryCov_9fa48("84426"), index += 1)) {
            if (stryMutAct_9fa48("84427")) {
              {}
            } else {
              stryCov_9fa48("84427");
              const entry = entriesToWrite[index];
              try {
                if (stryMutAct_9fa48("84428")) {
                  {}
                } else {
                  stryCov_9fa48("84428");
                  const success = await this.writeEntryWithRetry(entry);
                  if (stryMutAct_9fa48("84430") ? false : stryMutAct_9fa48("84429") ? true : (stryCov_9fa48("84429", "84430"), success)) {
                    if (stryMutAct_9fa48("84431")) {
                      {}
                    } else {
                      stryCov_9fa48("84431");
                      this.consecutiveDeferredWriteFailures = 0;
                      stryMutAct_9fa48("84432") ? writtenCount-- : (stryCov_9fa48("84432"), writtenCount++);
                      stryMutAct_9fa48("84433") ? this.writeCount-- : (stryCov_9fa48("84433"), this.writeCount++);
                    }
                  } else {
                    if (stryMutAct_9fa48("84434")) {
                      {}
                    } else {
                      stryCov_9fa48("84434");
                      stryMutAct_9fa48("84435") ? this.errorCount-- : (stryCov_9fa48("84435"), this.errorCount++);
                    }
                  }
                }
              } catch (writeError) {
                if (stryMutAct_9fa48("84436")) {
                  {}
                } else {
                  stryCov_9fa48("84436");
                  if (stryMutAct_9fa48("84438") ? false : stryMutAct_9fa48("84437") ? true : (stryCov_9fa48("84437", "84438"), this.shouldDeferWriteError(writeError))) {
                    if (stryMutAct_9fa48("84439")) {
                      {}
                    } else {
                      stryCov_9fa48("84439");
                      stryMutAct_9fa48("84440") ? this.errorCount-- : (stryCov_9fa48("84440"), this.errorCount++);
                      this.deferPendingWrites(stryMutAct_9fa48("84441") ? entriesToWrite : (stryCov_9fa48("84441"), entriesToWrite.slice(index)), writeError);
                      break;
                    }
                  }
                  stryMutAct_9fa48("84442") ? this.errorCount-- : (stryCov_9fa48("84442"), this.errorCount++);
                  console.warn(LOGGING_ERROR_MSG.WRITE_ENTRY_FAILED, writeError);
                }
              }
            }
          }
          if (stryMutAct_9fa48("84446") ? writtenCount <= 0 : stryMutAct_9fa48("84445") ? writtenCount >= 0 : stryMutAct_9fa48("84444") ? false : stryMutAct_9fa48("84443") ? true : (stryCov_9fa48("84443", "84444", "84445", "84446"), writtenCount > 0)) {
            if (stryMutAct_9fa48("84447")) {
              {}
            } else {
              stryCov_9fa48("84447");
              this.emit(LOGS_TABLE_EVENT.FLUSHED, stryMutAct_9fa48("84448") ? {} : (stryCov_9fa48("84448"), {
                count: writtenCount
              }));
            }
          }
        }
      } finally {
        if (stryMutAct_9fa48("84449")) {
          {}
        } else {
          stryCov_9fa48("84449");
          this.isWriting = stryMutAct_9fa48("84450") ? true : (stryCov_9fa48("84450"), false);
          if (stryMutAct_9fa48("84453") ? yieldPending && this.pendingWrites.length > 0 || !this.isWriteDeferred() : stryMutAct_9fa48("84452") ? false : stryMutAct_9fa48("84451") ? true : (stryCov_9fa48("84451", "84452", "84453"), (stryMutAct_9fa48("84455") ? yieldPending || this.pendingWrites.length > 0 : stryMutAct_9fa48("84454") ? true : (stryCov_9fa48("84454", "84455"), yieldPending && (stryMutAct_9fa48("84458") ? this.pendingWrites.length <= 0 : stryMutAct_9fa48("84457") ? this.pendingWrites.length >= 0 : stryMutAct_9fa48("84456") ? true : (stryCov_9fa48("84456", "84457", "84458"), this.pendingWrites.length > 0)))) && (stryMutAct_9fa48("84459") ? this.isWriteDeferred() : (stryCov_9fa48("84459"), !this.isWriteDeferred())))) {
            if (stryMutAct_9fa48("84460")) {
              {}
            } else {
              stryCov_9fa48("84460");
              this.scheduleContinuationFlush();
            }
          }
        }
      }
      return writtenCount;
    }
  }

  /**
   * Schedule a continuation flush for pending queued entries.
   * @private
   */
  scheduleContinuationFlush(delayOverrideMs = this.flushYieldMs) {
    if (stryMutAct_9fa48("84461")) {
      {}
    } else {
      stryCov_9fa48("84461");
      const delayMs = (stryMutAct_9fa48("84464") ? Number.isFinite(delayOverrideMs) || delayOverrideMs >= MIN_YIELD_MS : stryMutAct_9fa48("84463") ? false : stryMutAct_9fa48("84462") ? true : (stryCov_9fa48("84462", "84463", "84464"), Number.isFinite(delayOverrideMs) && (stryMutAct_9fa48("84467") ? delayOverrideMs < MIN_YIELD_MS : stryMutAct_9fa48("84466") ? delayOverrideMs > MIN_YIELD_MS : stryMutAct_9fa48("84465") ? true : (stryCov_9fa48("84465", "84466", "84467"), delayOverrideMs >= MIN_YIELD_MS)))) ? Math.floor(delayOverrideMs) : this.flushYieldMs;
      const dueAtMs = stryMutAct_9fa48("84468") ? this.now() - delayMs : (stryCov_9fa48("84468"), this.now() + delayMs);
      if (stryMutAct_9fa48("84471") ? this.flushContinuationTimer && Number.isFinite(this.flushContinuationDueAtMs) || this.flushContinuationDueAtMs <= dueAtMs : stryMutAct_9fa48("84470") ? false : stryMutAct_9fa48("84469") ? true : (stryCov_9fa48("84469", "84470", "84471"), (stryMutAct_9fa48("84473") ? this.flushContinuationTimer || Number.isFinite(this.flushContinuationDueAtMs) : stryMutAct_9fa48("84472") ? true : (stryCov_9fa48("84472", "84473"), this.flushContinuationTimer && Number.isFinite(this.flushContinuationDueAtMs))) && (stryMutAct_9fa48("84476") ? this.flushContinuationDueAtMs > dueAtMs : stryMutAct_9fa48("84475") ? this.flushContinuationDueAtMs < dueAtMs : stryMutAct_9fa48("84474") ? true : (stryCov_9fa48("84474", "84475", "84476"), this.flushContinuationDueAtMs <= dueAtMs)))) {
        if (stryMutAct_9fa48("84477")) {
          {}
        } else {
          stryCov_9fa48("84477");
          return;
        }
      }
      if (stryMutAct_9fa48("84479") ? false : stryMutAct_9fa48("84478") ? true : (stryCov_9fa48("84478", "84479"), this.flushContinuationTimer)) {
        if (stryMutAct_9fa48("84480")) {
          {}
        } else {
          stryCov_9fa48("84480");
          this.clearTimeoutFn(this.flushContinuationTimer);
        }
      }
      this.flushContinuationDueAtMs = dueAtMs;
      this.flushContinuationTimer = this.setTimeoutFn(() => {
        if (stryMutAct_9fa48("84481")) {
          {}
        } else {
          stryCov_9fa48("84481");
          this.flushContinuationTimer = null;
          this.flushContinuationDueAtMs = null;
          this.flush(stryMutAct_9fa48("84482") ? {} : (stryCov_9fa48("84482"), {
            maxEntries: this.flushChunkSize,
            yieldPending: stryMutAct_9fa48("84483") ? false : (stryCov_9fa48("84483"), true)
          })).catch(error => {
            if (stryMutAct_9fa48("84484")) {
              {}
            } else {
              stryCov_9fa48("84484");
              console.error(LOGGING_ERROR_MSG.PERIODIC_FLUSH_FAILED, error.message);
            }
          });
        }
      }, delayMs);
      if (stryMutAct_9fa48("84486") ? false : stryMutAct_9fa48("84485") ? true : (stryCov_9fa48("84485", "84486"), this.flushContinuationTimer.unref)) {
        if (stryMutAct_9fa48("84487")) {
          {}
        } else {
          stryCov_9fa48("84487");
          this.flushContinuationTimer.unref();
        }
      }
    }
  }

  /**
   * Write a single entry with retry logic.
   * @param {Object} entry - Log entry to write.
   * @return {Promise<boolean>} True if write succeeded.
   * @private
   */
  async writeEntryWithRetry(entry) {
    if (stryMutAct_9fa48("84488")) {
      {}
    } else {
      stryCov_9fa48("84488");
      let lastError = null;
      for (let attempt = 0; stryMutAct_9fa48("84491") ? attempt >= this.maxRetries : stryMutAct_9fa48("84490") ? attempt <= this.maxRetries : stryMutAct_9fa48("84489") ? false : (stryCov_9fa48("84489", "84490", "84491"), attempt < this.maxRetries); stryMutAct_9fa48("84492") ? attempt-- : (stryCov_9fa48("84492"), attempt++)) {
        if (stryMutAct_9fa48("84493")) {
          {}
        } else {
          stryCov_9fa48("84493");
          try {
            if (stryMutAct_9fa48("84494")) {
              {}
            } else {
              stryCov_9fa48("84494");
              await this.writeEntryToTable(entry);
              return stryMutAct_9fa48("84495") ? false : (stryCov_9fa48("84495"), true);
            }
          } catch (error) {
            if (stryMutAct_9fa48("84496")) {
              {}
            } else {
              stryCov_9fa48("84496");
              lastError = error;
              if (stryMutAct_9fa48("84498") ? false : stryMutAct_9fa48("84497") ? true : (stryCov_9fa48("84497", "84498"), this.shouldDeferWriteError(error))) {
                if (stryMutAct_9fa48("84499")) {
                  {}
                } else {
                  stryCov_9fa48("84499");
                  throw error;
                }
              }
              if (stryMutAct_9fa48("84503") ? attempt >= this.maxRetries - 1 : stryMutAct_9fa48("84502") ? attempt <= this.maxRetries - 1 : stryMutAct_9fa48("84501") ? false : stryMutAct_9fa48("84500") ? true : (stryCov_9fa48("84500", "84501", "84502", "84503"), attempt < (stryMutAct_9fa48("84504") ? this.maxRetries + 1 : (stryCov_9fa48("84504"), this.maxRetries - 1)))) {
                if (stryMutAct_9fa48("84505")) {
                  {}
                } else {
                  stryCov_9fa48("84505");
                  await this.sleep(stryMutAct_9fa48("84506") ? this.retryDelayMs / (attempt + 1) : (stryCov_9fa48("84506"), this.retryDelayMs * (stryMutAct_9fa48("84507") ? attempt - 1 : (stryCov_9fa48("84507"), attempt + 1))));
                }
              }
            }
          }
        }
      }
      const error = stryMutAct_9fa48("84510") ? lastError && new Error(LOGGING_ERROR_MSG.WRITE_ENTRY_FAILED) : stryMutAct_9fa48("84509") ? false : stryMutAct_9fa48("84508") ? true : (stryCov_9fa48("84508", "84509", "84510"), lastError || new Error(LOGGING_ERROR_MSG.WRITE_ENTRY_FAILED));
      throw error;
    }
  }

  /**
   * Write a single entry to the logs table.
   * @param {Object} entry - Log entry to write.
   * @return {Promise<void>}
   * @private
   */
  async writeEntryToTable(entry) {
    if (stryMutAct_9fa48("84511")) {
      {}
    } else {
      stryCov_9fa48("84511");
      const row = stryMutAct_9fa48("84512") ? {} : (stryCov_9fa48("84512"), {
        log_id: entry.logId,
        timestamp: entry.timestamp,
        level: entry.level,
        node_id: entry.nodeId,
        service_id: stryMutAct_9fa48("84515") ? entry.serviceId && null : stryMutAct_9fa48("84514") ? false : stryMutAct_9fa48("84513") ? true : (stryCov_9fa48("84513", "84514", "84515"), entry.serviceId || null),
        service_type: stryMutAct_9fa48("84518") ? entry.serviceType && null : stryMutAct_9fa48("84517") ? false : stryMutAct_9fa48("84516") ? true : (stryCov_9fa48("84516", "84517", "84518"), entry.serviceType || null),
        message: entry.message,
        trace_id: stryMutAct_9fa48("84521") ? entry.traceId && null : stryMutAct_9fa48("84520") ? false : stryMutAct_9fa48("84519") ? true : (stryCov_9fa48("84519", "84520", "84521"), entry.traceId || null),
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        created_at: stryMutAct_9fa48("84524") ? entry.createdAt && Date.now() : stryMutAct_9fa48("84523") ? false : stryMutAct_9fa48("84522") ? true : (stryCov_9fa48("84522", "84523", "84524"), entry.createdAt || Date.now())
      });

      // Log rows are append-only (write-once, never updated). UPSERT is used
      // solely for idempotent replay of duplicate log_id values; it effectively
      // acts as INSERT since no fields are ever mutated after creation.
      if (stryMutAct_9fa48("84526") ? false : stryMutAct_9fa48("84525") ? true : (stryCov_9fa48("84525", "84526"), this.logsOwner)) {
        if (stryMutAct_9fa48("84527")) {
          {}
        } else {
          stryCov_9fa48("84527");
          await this.logsOwner.upsertLog(row, stryMutAct_9fa48("84528") ? {} : (stryCov_9fa48("84528"), {
            workClass: PRESSURE_WORK_CLASS.BACKGROUND,
            deliveryPriority: stryMutAct_9fa48("84529") ? "" : (stryCov_9fa48("84529"), 'background'),
            allowPressureDefer: stryMutAct_9fa48("84530") ? false : (stryCov_9fa48("84530"), true),
            pressureRetryAfterMs: this.retryDelayMs
          }));
          return;
        }
      }
      throw createSystemMetadataOwnerRequiredError(stryMutAct_9fa48("84531") ? {} : (stryCov_9fa48("84531"), {
        serviceName: LOGS_TABLE_OWNER,
        ownerName: stryMutAct_9fa48("84532") ? "" : (stryCov_9fa48("84532"), 'logsOwner'),
        tableName: stryMutAct_9fa48("84533") ? "" : (stryCov_9fa48("84533"), 'logs'),
        operation: stryMutAct_9fa48("84534") ? "" : (stryCov_9fa48("84534"), 'write'),
        message: LOGGING_ERROR_MSG.OWNER_REQUIRED
      }));
    }
  }

  /**
   * Check whether logs-table writes are currently in a defer window.
   * @return {boolean}
   * @private
   */
  isWriteDeferred() {
    if (stryMutAct_9fa48("84535")) {
      {}
    } else {
      stryCov_9fa48("84535");
      if (stryMutAct_9fa48("84538") ? !Number.isFinite(this.writeDeferredUntilMs) && this.writeDeferredUntilMs <= 0 : stryMutAct_9fa48("84537") ? false : stryMutAct_9fa48("84536") ? true : (stryCov_9fa48("84536", "84537", "84538"), (stryMutAct_9fa48("84539") ? Number.isFinite(this.writeDeferredUntilMs) : (stryCov_9fa48("84539"), !Number.isFinite(this.writeDeferredUntilMs))) || (stryMutAct_9fa48("84542") ? this.writeDeferredUntilMs > 0 : stryMutAct_9fa48("84541") ? this.writeDeferredUntilMs < 0 : stryMutAct_9fa48("84540") ? false : (stryCov_9fa48("84540", "84541", "84542"), this.writeDeferredUntilMs <= 0)))) {
        if (stryMutAct_9fa48("84543")) {
          {}
        } else {
          stryCov_9fa48("84543");
          return stryMutAct_9fa48("84544") ? true : (stryCov_9fa48("84544"), false);
        }
      }
      if (stryMutAct_9fa48("84548") ? this.now() < this.writeDeferredUntilMs : stryMutAct_9fa48("84547") ? this.now() > this.writeDeferredUntilMs : stryMutAct_9fa48("84546") ? false : stryMutAct_9fa48("84545") ? true : (stryCov_9fa48("84545", "84546", "84547", "84548"), this.now() >= this.writeDeferredUntilMs)) {
        if (stryMutAct_9fa48("84549")) {
          {}
        } else {
          stryCov_9fa48("84549");
          this.writeDeferredUntilMs = 0;
          return stryMutAct_9fa48("84550") ? true : (stryCov_9fa48("84550"), false);
        }
      }
      return stryMutAct_9fa48("84551") ? false : (stryCov_9fa48("84551"), true);
    }
  }

  /**
   * Return remaining defer time for the logs-table writer.
   * @return {number}
   * @private
   */
  getRemainingWriteDeferMs() {
    if (stryMutAct_9fa48("84552")) {
      {}
    } else {
      stryCov_9fa48("84552");
      if (stryMutAct_9fa48("84555") ? false : stryMutAct_9fa48("84554") ? true : stryMutAct_9fa48("84553") ? this.isWriteDeferred() : (stryCov_9fa48("84553", "84554", "84555"), !this.isWriteDeferred())) {
        if (stryMutAct_9fa48("84556")) {
          {}
        } else {
          stryCov_9fa48("84556");
          return 0;
        }
      }
      return stryMutAct_9fa48("84557") ? Math.min(MIN_SLEEP_MS, this.writeDeferredUntilMs - this.now()) : (stryCov_9fa48("84557"), Math.max(MIN_SLEEP_MS, stryMutAct_9fa48("84558") ? this.writeDeferredUntilMs + this.now() : (stryCov_9fa48("84558"), this.writeDeferredUntilMs - this.now())));
    }
  }

  /**
   * Determine whether one logs-table write failure should defer the owner
   * instead of retrying every buffered entry inline.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  shouldDeferWriteError(error) {
    if (stryMutAct_9fa48("84559")) {
      {}
    } else {
      stryCov_9fa48("84559");
      if (stryMutAct_9fa48("84562") ? false : stryMutAct_9fa48("84561") ? true : stryMutAct_9fa48("84560") ? error : (stryCov_9fa48("84560", "84561", "84562"), !error)) {
        if (stryMutAct_9fa48("84563")) {
          {}
        } else {
          stryCov_9fa48("84563");
          return stryMutAct_9fa48("84564") ? true : (stryCov_9fa48("84564"), false);
        }
      }
      if (stryMutAct_9fa48("84567") ? error?.deferRetry === true && error?.code === 'CONTROL_PLANE_PRESSURE_DEGRADED' : stryMutAct_9fa48("84566") ? false : stryMutAct_9fa48("84565") ? true : (stryCov_9fa48("84565", "84566", "84567"), (stryMutAct_9fa48("84569") ? error?.deferRetry !== true : stryMutAct_9fa48("84568") ? false : (stryCov_9fa48("84568", "84569"), (stryMutAct_9fa48("84570") ? error.deferRetry : (stryCov_9fa48("84570"), error?.deferRetry)) === (stryMutAct_9fa48("84571") ? false : (stryCov_9fa48("84571"), true)))) || (stryMutAct_9fa48("84573") ? error?.code !== 'CONTROL_PLANE_PRESSURE_DEGRADED' : stryMutAct_9fa48("84572") ? false : (stryCov_9fa48("84572", "84573"), (stryMutAct_9fa48("84574") ? error.code : (stryCov_9fa48("84574"), error?.code)) === (stryMutAct_9fa48("84575") ? "" : (stryCov_9fa48("84575"), 'CONTROL_PLANE_PRESSURE_DEGRADED')))))) {
        if (stryMutAct_9fa48("84576")) {
          {}
        } else {
          stryCov_9fa48("84576");
          return stryMutAct_9fa48("84577") ? false : (stryCov_9fa48("84577"), true);
        }
      }
      if (stryMutAct_9fa48("84580") ? Number.isFinite(error?.retryAfterMs) || error.retryAfterMs > 0 : stryMutAct_9fa48("84579") ? false : stryMutAct_9fa48("84578") ? true : (stryCov_9fa48("84578", "84579", "84580"), Number.isFinite(stryMutAct_9fa48("84581") ? error.retryAfterMs : (stryCov_9fa48("84581"), error?.retryAfterMs)) && (stryMutAct_9fa48("84584") ? error.retryAfterMs <= 0 : stryMutAct_9fa48("84583") ? error.retryAfterMs >= 0 : stryMutAct_9fa48("84582") ? true : (stryCov_9fa48("84582", "84583", "84584"), error.retryAfterMs > 0)))) {
        if (stryMutAct_9fa48("84585")) {
          {}
        } else {
          stryCov_9fa48("84585");
          return stryMutAct_9fa48("84586") ? false : (stryCov_9fa48("84586"), true);
        }
      }
      const message = stryMutAct_9fa48("84589") ? error?.message && String(error) : stryMutAct_9fa48("84588") ? false : stryMutAct_9fa48("84587") ? true : (stryCov_9fa48("84587", "84588", "84589"), (stryMutAct_9fa48("84590") ? error.message : (stryCov_9fa48("84590"), error?.message)) || String(error));
      return stryMutAct_9fa48("84593") ? (message.includes('Distributed operation failed due to participant failures') || message.includes('Connection to node') && message.includes('closed') || message.includes('No connection to node') || message.includes('Message timeout') || message.includes('Query routing failed')) && message.includes('Failed to forward write to leader') : stryMutAct_9fa48("84592") ? false : stryMutAct_9fa48("84591") ? true : (stryCov_9fa48("84591", "84592", "84593"), (stryMutAct_9fa48("84595") ? (message.includes('Distributed operation failed due to participant failures') || message.includes('Connection to node') && message.includes('closed') || message.includes('No connection to node') || message.includes('Message timeout')) && message.includes('Query routing failed') : stryMutAct_9fa48("84594") ? false : (stryCov_9fa48("84594", "84595"), (stryMutAct_9fa48("84597") ? (message.includes('Distributed operation failed due to participant failures') || message.includes('Connection to node') && message.includes('closed') || message.includes('No connection to node')) && message.includes('Message timeout') : stryMutAct_9fa48("84596") ? false : (stryCov_9fa48("84596", "84597"), (stryMutAct_9fa48("84599") ? (message.includes('Distributed operation failed due to participant failures') || message.includes('Connection to node') && message.includes('closed')) && message.includes('No connection to node') : stryMutAct_9fa48("84598") ? false : (stryCov_9fa48("84598", "84599"), (stryMutAct_9fa48("84601") ? message.includes('Distributed operation failed due to participant failures') && message.includes('Connection to node') && message.includes('closed') : stryMutAct_9fa48("84600") ? false : (stryCov_9fa48("84600", "84601"), message.includes(stryMutAct_9fa48("84602") ? "" : (stryCov_9fa48("84602"), 'Distributed operation failed due to participant failures')) || (stryMutAct_9fa48("84604") ? message.includes('Connection to node') || message.includes('closed') : stryMutAct_9fa48("84603") ? false : (stryCov_9fa48("84603", "84604"), message.includes(stryMutAct_9fa48("84605") ? "" : (stryCov_9fa48("84605"), 'Connection to node')) && message.includes(stryMutAct_9fa48("84606") ? "" : (stryCov_9fa48("84606"), 'closed')))))) || message.includes(stryMutAct_9fa48("84607") ? "" : (stryCov_9fa48("84607"), 'No connection to node')))) || message.includes(stryMutAct_9fa48("84608") ? "" : (stryCov_9fa48("84608"), 'Message timeout')))) || message.includes(stryMutAct_9fa48("84609") ? "" : (stryCov_9fa48("84609"), 'Query routing failed')))) || message.includes(stryMutAct_9fa48("84610") ? "" : (stryCov_9fa48("84610"), 'Failed to forward write to leader')));
    }
  }

  /**
   * Resolve one defer delay after a transient logs-table write failure.
   * @param {Error} error
   * @return {number}
   * @private
   */
  resolveWriteDeferMs(error) {
    if (stryMutAct_9fa48("84611")) {
      {}
    } else {
      stryCov_9fa48("84611");
      const baseRetryAfterMs = (stryMutAct_9fa48("84614") ? Number.isFinite(error?.retryAfterMs) || error.retryAfterMs > 0 : stryMutAct_9fa48("84613") ? false : stryMutAct_9fa48("84612") ? true : (stryCov_9fa48("84612", "84613", "84614"), Number.isFinite(stryMutAct_9fa48("84615") ? error.retryAfterMs : (stryCov_9fa48("84615"), error?.retryAfterMs)) && (stryMutAct_9fa48("84618") ? error.retryAfterMs <= 0 : stryMutAct_9fa48("84617") ? error.retryAfterMs >= 0 : stryMutAct_9fa48("84616") ? true : (stryCov_9fa48("84616", "84617", "84618"), error.retryAfterMs > 0)))) ? stryMutAct_9fa48("84619") ? Math.min(MIN_SLEEP_MS, Math.floor(error.retryAfterMs)) : (stryCov_9fa48("84619"), Math.max(MIN_SLEEP_MS, Math.floor(error.retryAfterMs))) : stryMutAct_9fa48("84620") ? Math.min(MIN_SLEEP_MS, this.retryDelayMs) : (stryCov_9fa48("84620"), Math.max(MIN_SLEEP_MS, this.retryDelayMs));
      const exponent = stryMutAct_9fa48("84621") ? Math.min(0, this.consecutiveDeferredWriteFailures - 1) : (stryCov_9fa48("84621"), Math.max(0, stryMutAct_9fa48("84622") ? this.consecutiveDeferredWriteFailures + 1 : (stryCov_9fa48("84622"), this.consecutiveDeferredWriteFailures - 1)));
      const scaledRetryAfterMs = stryMutAct_9fa48("84623") ? baseRetryAfterMs / this.pressureDeferBackoffMultiplier ** exponent : (stryCov_9fa48("84623"), baseRetryAfterMs * this.pressureDeferBackoffMultiplier ** exponent);
      return stryMutAct_9fa48("84624") ? Math.max(this.pressureMaxRetryDelayMs, Math.max(MIN_SLEEP_MS, Math.floor(scaledRetryAfterMs))) : (stryCov_9fa48("84624"), Math.min(this.pressureMaxRetryDelayMs, stryMutAct_9fa48("84625") ? Math.min(MIN_SLEEP_MS, Math.floor(scaledRetryAfterMs)) : (stryCov_9fa48("84625"), Math.max(MIN_SLEEP_MS, Math.floor(scaledRetryAfterMs)))));
    }
  }

  /**
   * Requeue the remaining batch and pause the logs-table writer briefly after
   * one transient control-plane failure.
   * @param {Array<Object>} entries
   * @param {Error} error
   * @private
   */
  deferPendingWrites(entries, error) {
    if (stryMutAct_9fa48("84626")) {
      {}
    } else {
      stryCov_9fa48("84626");
      const requeuedEntries = Array.isArray(entries) ? entries.length : 0;
      if (stryMutAct_9fa48("84629") ? Array.isArray(entries) || entries.length > 0 : stryMutAct_9fa48("84628") ? false : stryMutAct_9fa48("84627") ? true : (stryCov_9fa48("84627", "84628", "84629"), Array.isArray(entries) && (stryMutAct_9fa48("84632") ? entries.length <= 0 : stryMutAct_9fa48("84631") ? entries.length >= 0 : stryMutAct_9fa48("84630") ? true : (stryCov_9fa48("84630", "84631", "84632"), entries.length > 0)))) {
        if (stryMutAct_9fa48("84633")) {
          {}
        } else {
          stryCov_9fa48("84633");
          this.pendingWrites = entries.concat(this.pendingWrites);
        }
      }
      stryMutAct_9fa48("84634") ? this.consecutiveDeferredWriteFailures -= 1 : (stryCov_9fa48("84634"), this.consecutiveDeferredWriteFailures += 1);
      const droppedEntries = this.trimPendingWritesUnderPressure();
      const retryAfterMs = this.resolveWriteDeferMs(error);
      const desiredUntilMs = stryMutAct_9fa48("84635") ? this.now() - retryAfterMs : (stryCov_9fa48("84635"), this.now() + retryAfterMs);
      this.writeDeferredUntilMs = stryMutAct_9fa48("84636") ? Math.min(this.writeDeferredUntilMs || 0, desiredUntilMs) : (stryCov_9fa48("84636"), Math.max(stryMutAct_9fa48("84639") ? this.writeDeferredUntilMs && 0 : stryMutAct_9fa48("84638") ? false : stryMutAct_9fa48("84637") ? true : (stryCov_9fa48("84637", "84638", "84639"), this.writeDeferredUntilMs || 0), desiredUntilMs));
      this.scheduleContinuationFlush(retryAfterMs);
      console.warn(LOGGING_LOG_MSG.logsWriteDeferred(retryAfterMs, this.pendingWrites.length), stryMutAct_9fa48("84640") ? {} : (stryCov_9fa48("84640"), {
        error: stryMutAct_9fa48("84643") ? error?.message && String(error) : stryMutAct_9fa48("84642") ? false : stryMutAct_9fa48("84641") ? true : (stryCov_9fa48("84641", "84642", "84643"), (stryMutAct_9fa48("84644") ? error.message : (stryCov_9fa48("84644"), error?.message)) || String(error)),
        retryAfterMs,
        pendingWrites: this.pendingWrites.length,
        retainedPressureBacklogCap: this.getRetainedPressureBacklogCap(),
        maxPendingWrites: this.maxPendingWrites,
        isWriting: stryMutAct_9fa48("84645") ? true : (stryCov_9fa48("84645"), false),
        requeuedEntries,
        droppedEntries
      }));
    }
  }

  /**
   * Start the periodic flush timer.
   * @private
   */
  startFlushTimer() {
    if (stryMutAct_9fa48("84646")) {
      {}
    } else {
      stryCov_9fa48("84646");
      if (stryMutAct_9fa48("84648") ? false : stryMutAct_9fa48("84647") ? true : (stryCov_9fa48("84647", "84648"), this.flushTimer)) {
        if (stryMutAct_9fa48("84649")) {
          {}
        } else {
          stryCov_9fa48("84649");
          return;
        }
      }
      this.flushTimer = this.setIntervalFn(() => {
        if (stryMutAct_9fa48("84650")) {
          {}
        } else {
          stryCov_9fa48("84650");
          this.flush().catch(error => {
            if (stryMutAct_9fa48("84651")) {
              {}
            } else {
              stryCov_9fa48("84651");
              console.error(LOGGING_ERROR_MSG.PERIODIC_FLUSH_FAILED, error.message);
            }
          });
        }
      }, this.flushIntervalMs);

      // Don't prevent process exit
      if (stryMutAct_9fa48("84653") ? false : stryMutAct_9fa48("84652") ? true : (stryCov_9fa48("84652", "84653"), this.flushTimer.unref)) {
        if (stryMutAct_9fa48("84654")) {
          {}
        } else {
          stryCov_9fa48("84654");
          this.flushTimer.unref();
        }
      }
    }
  }

  /**
   * Stop the periodic flush timer.
   * @private
   */
  stopFlushTimer() {
    if (stryMutAct_9fa48("84655")) {
      {}
    } else {
      stryCov_9fa48("84655");
      if (stryMutAct_9fa48("84657") ? false : stryMutAct_9fa48("84656") ? true : (stryCov_9fa48("84656", "84657"), this.flushTimer)) {
        if (stryMutAct_9fa48("84658")) {
          {}
        } else {
          stryCov_9fa48("84658");
          this.clearIntervalFn(this.flushTimer);
          this.flushTimer = null;
        }
      }
      if (stryMutAct_9fa48("84660") ? false : stryMutAct_9fa48("84659") ? true : (stryCov_9fa48("84659", "84660"), this.flushContinuationTimer)) {
        if (stryMutAct_9fa48("84661")) {
          {}
        } else {
          stryCov_9fa48("84661");
          this.clearTimeoutFn(this.flushContinuationTimer);
          this.flushContinuationTimer = null;
        }
      }
      this.flushContinuationDueAtMs = null;
    }
  }

  /**
   * Get service statistics.
   * @return {Object} Service statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("84662")) {
      {}
    } else {
      stryCov_9fa48("84662");
      return stryMutAct_9fa48("84663") ? {} : (stryCov_9fa48("84663"), {
        initialized: this.initialized,
        pendingWrites: this.pendingWrites.length,
        writeCount: this.writeCount,
        errorCount: this.errorCount,
        isWriting: this.isWriting,
        writeDeferredUntilMs: this.writeDeferredUntilMs,
        flushChunkSize: this.flushChunkSize,
        flushYieldMs: this.flushYieldMs,
        maxPendingWrites: this.maxPendingWrites,
        retainedPressureBacklogCap: this.getRetainedPressureBacklogCap(),
        pressureHighWatermark: this.pressureHighWatermark,
        pressureRetainedPendingWrites: this.pressureRetainedPendingWrites,
        droppedWrites: this.droppedWrites,
        selfLoopPreventedWrites: this.selfLoopPreventedWrites,
        flushWorkScheduled: this.flushWorkScheduled,
        workClassSchedulerEnabled: Boolean(this.workClassScheduler),
        consecutiveDeferredWriteFailures: this.consecutiveDeferredWriteFailures,
        pendingWriteGrowthCount: this.pendingWriteGrowthCount,
        retainedBacklogGrowthCount: this.retainedBacklogGrowthCount,
        sharedPressureBackpressured: this.isSharedPressureBackpressured()
      });
    }
  }

  /**
   * Return the shared pressure governor for background log persistence.
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (stryMutAct_9fa48("84664")) {
      {}
    } else {
      stryCov_9fa48("84664");
      if (stryMutAct_9fa48("84666") ? false : stryMutAct_9fa48("84665") ? true : (stryCov_9fa48("84665", "84666"), this.pressureGovernor)) {
        if (stryMutAct_9fa48("84667")) {
          {}
        } else {
          stryCov_9fa48("84667");
          stryMutAct_9fa48("84668") ? this.pressureGovernor.configure({
            messageRouter: this.messageRouter || null,
            logger: this.logger
          }) : (stryCov_9fa48("84668"), this.pressureGovernor.configure?.(stryMutAct_9fa48("84669") ? {} : (stryCov_9fa48("84669"), {
            messageRouter: stryMutAct_9fa48("84672") ? this.messageRouter && null : stryMutAct_9fa48("84671") ? false : stryMutAct_9fa48("84670") ? true : (stryCov_9fa48("84670", "84671", "84672"), this.messageRouter || null),
            logger: this.logger
          })));
          return this.pressureGovernor;
        }
      }
      const config = ConfigurationManager.getInstance();
      this.pressureGovernor = PressureGovernor.getShared(stryMutAct_9fa48("84673") ? {} : (stryCov_9fa48("84673"), {
        nodeId: config.get(CONFIG_KEY.NODE_ID),
        messageRouter: stryMutAct_9fa48("84676") ? this.messageRouter && null : stryMutAct_9fa48("84675") ? false : stryMutAct_9fa48("84674") ? true : (stryCov_9fa48("84674", "84675", "84676"), this.messageRouter || null),
        logger: this.logger
      }));
      return this.pressureGovernor;
    }
  }

  /**
   * Evaluate the shared pressure policy for one background log write and arm a
   * bounded defer window when transport is already hot.
   * @private
   */
  applySharedPressureDeferWindow() {
    if (stryMutAct_9fa48("84677")) {
      {}
    } else {
      stryCov_9fa48("84677");
      const decision = this.getPressureGovernor().evaluate(stryMutAct_9fa48("84678") ? {} : (stryCov_9fa48("84678"), {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        resourceKeys: stryMutAct_9fa48("84679") ? [] : (stryCov_9fa48("84679"), [stryMutAct_9fa48("84680") ? "" : (stryCov_9fa48("84680"), 'control-plane:write'), stryMutAct_9fa48("84681") ? "" : (stryCov_9fa48("84681"), 'control-plane:table:logs'), stryMutAct_9fa48("84682") ? "" : (stryCov_9fa48("84682"), 'transport:logs-writer')]),
        allowDegrade: stryMutAct_9fa48("84683") ? false : (stryCov_9fa48("84683"), true),
        allowDefer: stryMutAct_9fa48("84684") ? false : (stryCov_9fa48("84684"), true),
        retryAfterMs: this.retryDelayMs
      }));
      if (stryMutAct_9fa48("84687") ? decision?.action !== PRESSURE_GOVERNOR_ACTION.DEFER || decision?.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("84686") ? false : stryMutAct_9fa48("84685") ? true : (stryCov_9fa48("84685", "84686", "84687"), (stryMutAct_9fa48("84689") ? decision?.action === PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("84688") ? true : (stryCov_9fa48("84688", "84689"), (stryMutAct_9fa48("84690") ? decision.action : (stryCov_9fa48("84690"), decision?.action)) !== PRESSURE_GOVERNOR_ACTION.DEFER)) && (stryMutAct_9fa48("84692") ? decision?.action === PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("84691") ? true : (stryCov_9fa48("84691", "84692"), (stryMutAct_9fa48("84693") ? decision.action : (stryCov_9fa48("84693"), decision?.action)) !== PRESSURE_GOVERNOR_ACTION.DEGRADE)))) {
        if (stryMutAct_9fa48("84694")) {
          {}
        } else {
          stryCov_9fa48("84694");
          return;
        }
      }
      const retryAfterMs = (stryMutAct_9fa48("84697") ? Number.isFinite(decision?.retryAfterMs) || decision.retryAfterMs > 0 : stryMutAct_9fa48("84696") ? false : stryMutAct_9fa48("84695") ? true : (stryCov_9fa48("84695", "84696", "84697"), Number.isFinite(stryMutAct_9fa48("84698") ? decision.retryAfterMs : (stryCov_9fa48("84698"), decision?.retryAfterMs)) && (stryMutAct_9fa48("84701") ? decision.retryAfterMs <= 0 : stryMutAct_9fa48("84700") ? decision.retryAfterMs >= 0 : stryMutAct_9fa48("84699") ? true : (stryCov_9fa48("84699", "84700", "84701"), decision.retryAfterMs > 0)))) ? Math.floor(decision.retryAfterMs) : stryMutAct_9fa48("84702") ? Math.min(MIN_SLEEP_MS, this.retryDelayMs) : (stryCov_9fa48("84702"), Math.max(MIN_SLEEP_MS, this.retryDelayMs));
      this.writeDeferredUntilMs = stryMutAct_9fa48("84703") ? Math.min(this.writeDeferredUntilMs || 0, this.now() + retryAfterMs) : (stryCov_9fa48("84703"), Math.max(stryMutAct_9fa48("84706") ? this.writeDeferredUntilMs && 0 : stryMutAct_9fa48("84705") ? false : stryMutAct_9fa48("84704") ? true : (stryCov_9fa48("84704", "84705", "84706"), this.writeDeferredUntilMs || 0), stryMutAct_9fa48("84707") ? this.now() - retryAfterMs : (stryCov_9fa48("84707"), this.now() + retryAfterMs)));
      this.trimPendingWritesUnderPressure();
      this.scheduleContinuationFlush(retryAfterMs);
    }
  }

  /**
   * Whether the shared pressure policy currently sees transport backpressure.
   * @return {boolean}
   * @private
   */
  isSharedPressureBackpressured() {
    if (stryMutAct_9fa48("84708")) {
      {}
    } else {
      stryCov_9fa48("84708");
      return this.getPressureGovernor().isBackpressured(stryMutAct_9fa48("84709") ? {} : (stryCov_9fa48("84709"), {
        resourceKeys: stryMutAct_9fa48("84710") ? [] : (stryCov_9fa48("84710"), [stryMutAct_9fa48("84711") ? "" : (stryCov_9fa48("84711"), 'control-plane:write'), stryMutAct_9fa48("84712") ? "" : (stryCov_9fa48("84712"), 'control-plane:table:logs'), stryMutAct_9fa48("84713") ? "" : (stryCov_9fa48("84713"), 'transport:logs-writer')])
      }));
    }
  }

  /**
   * Check whether an entry is metrics namespace log.
   * @param {Object} entry - Log entry.
   * @return {boolean}
   * @private
   */
  isMetricsLogEntry(entry) {
    if (stryMutAct_9fa48("84714")) {
      {}
    } else {
      stryCov_9fa48("84714");
      return stryMutAct_9fa48("84717") ? typeof entry?.message === 'string' || entry.message.startsWith(METRICS_LOG_PREFIX) : stryMutAct_9fa48("84716") ? false : stryMutAct_9fa48("84715") ? true : (stryCov_9fa48("84715", "84716", "84717"), (stryMutAct_9fa48("84719") ? typeof entry?.message !== 'string' : stryMutAct_9fa48("84718") ? true : (stryCov_9fa48("84718", "84719"), typeof (stryMutAct_9fa48("84720") ? entry.message : (stryCov_9fa48("84720"), entry?.message)) === (stryMutAct_9fa48("84721") ? "" : (stryCov_9fa48("84721"), 'string')))) && (stryMutAct_9fa48("84722") ? entry.message.endsWith(METRICS_LOG_PREFIX) : (stryCov_9fa48("84722"), entry.message.startsWith(METRICS_LOG_PREFIX))));
    }
  }

  /**
   * Return normalized priority for one log entry.
   * Higher values are more important.
   * @param {Object} entry
   * @return {number}
   * @private
   */
  getLogPriority(entry) {
    if (stryMutAct_9fa48("84723")) {
      {}
    } else {
      stryCov_9fa48("84723");
      const normalizedLevel = stryMutAct_9fa48("84724") ? String(entry?.level || 'INFO').toLowerCase() : (stryCov_9fa48("84724"), String(stryMutAct_9fa48("84727") ? entry?.level && 'INFO' : stryMutAct_9fa48("84726") ? false : stryMutAct_9fa48("84725") ? true : (stryCov_9fa48("84725", "84726", "84727"), (stryMutAct_9fa48("84728") ? entry.level : (stryCov_9fa48("84728"), entry?.level)) || (stryMutAct_9fa48("84729") ? "" : (stryCov_9fa48("84729"), 'INFO')))).toUpperCase());
      return Number.isInteger(LOG_LEVEL_ORDER[normalizedLevel]) ? LOG_LEVEL_ORDER[normalizedLevel] : LOG_LEVEL_ORDER.INFO;
    }
  }

  /**
   * Determine whether the logs-table writer is in sustained pressure mode.
   * @return {boolean}
   * @private
   */
  isPressureModeActive() {
    if (stryMutAct_9fa48("84730")) {
      {}
    } else {
      stryCov_9fa48("84730");
      return stryMutAct_9fa48("84733") ? this.isWriteDeferred() && this.pendingWrites.length >= this.pressureHighWatermark : stryMutAct_9fa48("84732") ? false : stryMutAct_9fa48("84731") ? true : (stryCov_9fa48("84731", "84732", "84733"), this.isWriteDeferred() || (stryMutAct_9fa48("84736") ? this.pendingWrites.length < this.pressureHighWatermark : stryMutAct_9fa48("84735") ? this.pendingWrites.length > this.pressureHighWatermark : stryMutAct_9fa48("84734") ? false : (stryCov_9fa48("84734", "84735", "84736"), this.pendingWrites.length >= this.pressureHighWatermark)));
    }
  }

  /**
   * Return the retained backlog cap applied while the writer is deferred.
   * @return {number}
   * @private
   */
  getRetainedPressureBacklogCap() {
    if (stryMutAct_9fa48("84737")) {
      {}
    } else {
      stryCov_9fa48("84737");
      return stryMutAct_9fa48("84738") ? Math.min(MIN_CHUNK_SIZE, Math.min(this.maxPendingWrites, this.pressureHighWatermark, this.pressureRetainedPendingWrites)) : (stryCov_9fa48("84738"), Math.max(MIN_CHUNK_SIZE, stryMutAct_9fa48("84739") ? Math.max(this.maxPendingWrites, this.pressureHighWatermark, this.pressureRetainedPendingWrites) : (stryCov_9fa48("84739"), Math.min(this.maxPendingWrites, this.pressureHighWatermark, this.pressureRetainedPendingWrites))));
    }
  }

  /**
   * Determine whether the deferred-pressure backlog cap should be applied.
   * @return {boolean}
   * @private
   */
  shouldApplyRetainedBacklogCap() {
    if (stryMutAct_9fa48("84740")) {
      {}
    } else {
      stryCov_9fa48("84740");
      return this.isWriteDeferred();
    }
  }

  /**
   * Build a stable fingerprint used to collapse repeated pressure logs.
   * @param {Object} entry
   * @return {string|null}
   * @private
   */
  buildPressureFingerprint(entry) {
    if (stryMutAct_9fa48("84741")) {
      {}
    } else {
      stryCov_9fa48("84741");
      const message = (stryMutAct_9fa48("84744") ? typeof entry?.message !== 'string' : stryMutAct_9fa48("84743") ? false : stryMutAct_9fa48("84742") ? true : (stryCov_9fa48("84742", "84743", "84744"), typeof (stryMutAct_9fa48("84745") ? entry.message : (stryCov_9fa48("84745"), entry?.message)) === (stryMutAct_9fa48("84746") ? "" : (stryCov_9fa48("84746"), 'string')))) ? stryMutAct_9fa48("84747") ? entry.message : (stryCov_9fa48("84747"), entry.message.trim()) : stryMutAct_9fa48("84748") ? "Stryker was here!" : (stryCov_9fa48("84748"), '');
      if (stryMutAct_9fa48("84751") ? false : stryMutAct_9fa48("84750") ? true : stryMutAct_9fa48("84749") ? message : (stryCov_9fa48("84749", "84750", "84751"), !message)) {
        if (stryMutAct_9fa48("84752")) {
          {}
        } else {
          stryCov_9fa48("84752");
          return null;
        }
      }
      const metadata = (stryMutAct_9fa48("84755") ? entry?.metadata || typeof entry.metadata === 'object' : stryMutAct_9fa48("84754") ? false : stryMutAct_9fa48("84753") ? true : (stryCov_9fa48("84753", "84754", "84755"), (stryMutAct_9fa48("84756") ? entry.metadata : (stryCov_9fa48("84756"), entry?.metadata)) && (stryMutAct_9fa48("84758") ? typeof entry.metadata !== 'object' : stryMutAct_9fa48("84757") ? true : (stryCov_9fa48("84757", "84758"), typeof entry.metadata === (stryMutAct_9fa48("84759") ? "" : (stryCov_9fa48("84759"), 'object')))))) ? entry.metadata : {};
      const subsystem = (stryMutAct_9fa48("84762") ? typeof metadata.subsystem !== 'string' : stryMutAct_9fa48("84761") ? false : stryMutAct_9fa48("84760") ? true : (stryCov_9fa48("84760", "84761", "84762"), typeof metadata.subsystem === (stryMutAct_9fa48("84763") ? "" : (stryCov_9fa48("84763"), 'string')))) ? metadata.subsystem : stryMutAct_9fa48("84764") ? "Stryker was here!" : (stryCov_9fa48("84764"), '');
      const partitionId = (stryMutAct_9fa48("84767") ? typeof metadata.partitionId !== 'string' : stryMutAct_9fa48("84766") ? false : stryMutAct_9fa48("84765") ? true : (stryCov_9fa48("84765", "84766", "84767"), typeof metadata.partitionId === (stryMutAct_9fa48("84768") ? "" : (stryCov_9fa48("84768"), 'string')))) ? metadata.partitionId : stryMutAct_9fa48("84769") ? "Stryker was here!" : (stryCov_9fa48("84769"), '');
      const tableName = (stryMutAct_9fa48("84772") ? typeof metadata.tableName !== 'string' : stryMutAct_9fa48("84771") ? false : stryMutAct_9fa48("84770") ? true : (stryCov_9fa48("84770", "84771", "84772"), typeof metadata.tableName === (stryMutAct_9fa48("84773") ? "" : (stryCov_9fa48("84773"), 'string')))) ? metadata.tableName : stryMutAct_9fa48("84774") ? "Stryker was here!" : (stryCov_9fa48("84774"), '');
      const transientFamily = this.resolveTransientPressureFamily(message, stryMutAct_9fa48("84777") ? (partitionId || tableName) && '' : stryMutAct_9fa48("84776") ? false : stryMutAct_9fa48("84775") ? true : (stryCov_9fa48("84775", "84776", "84777"), (stryMutAct_9fa48("84779") ? partitionId && tableName : stryMutAct_9fa48("84778") ? false : (stryCov_9fa48("84778", "84779"), partitionId || tableName)) || (stryMutAct_9fa48("84780") ? "Stryker was here!" : (stryCov_9fa48("84780"), ''))));
      return (stryMutAct_9fa48("84781") ? [] : (stryCov_9fa48("84781"), [stryMutAct_9fa48("84782") ? String(entry?.level || 'INFO').toLowerCase() : (stryCov_9fa48("84782"), String(stryMutAct_9fa48("84785") ? entry?.level && 'INFO' : stryMutAct_9fa48("84784") ? false : stryMutAct_9fa48("84783") ? true : (stryCov_9fa48("84783", "84784", "84785"), (stryMutAct_9fa48("84786") ? entry.level : (stryCov_9fa48("84786"), entry?.level)) || (stryMutAct_9fa48("84787") ? "" : (stryCov_9fa48("84787"), 'INFO')))).toUpperCase()), stryMutAct_9fa48("84790") ? entry?.nodeId && '' : stryMutAct_9fa48("84789") ? false : stryMutAct_9fa48("84788") ? true : (stryCov_9fa48("84788", "84789", "84790"), (stryMutAct_9fa48("84791") ? entry.nodeId : (stryCov_9fa48("84791"), entry?.nodeId)) || (stryMutAct_9fa48("84792") ? "Stryker was here!" : (stryCov_9fa48("84792"), ''))), subsystem, stryMutAct_9fa48("84795") ? transientFamily && message : stryMutAct_9fa48("84794") ? false : stryMutAct_9fa48("84793") ? true : (stryCov_9fa48("84793", "84794", "84795"), transientFamily || message)])).join(stryMutAct_9fa48("84796") ? "" : (stryCov_9fa48("84796"), '|'));
    }
  }

  /**
   * Collapse repeated transport/control-plane outage noise to a stable family
   * so pressure mode keeps one exemplar per affected subsystem/resource.
   * @param {string} message
   * @param {string} resourceId
   * @return {string|null}
   * @private
   */
  resolveTransientPressureFamily(message, resourceId = stryMutAct_9fa48("84797") ? "Stryker was here!" : (stryCov_9fa48("84797"), '')) {
    if (stryMutAct_9fa48("84798")) {
      {}
    } else {
      stryCov_9fa48("84798");
      if (stryMutAct_9fa48("84801") ? typeof message !== 'string' && message.length === 0 : stryMutAct_9fa48("84800") ? false : stryMutAct_9fa48("84799") ? true : (stryCov_9fa48("84799", "84800", "84801"), (stryMutAct_9fa48("84803") ? typeof message === 'string' : stryMutAct_9fa48("84802") ? false : (stryCov_9fa48("84802", "84803"), typeof message !== (stryMutAct_9fa48("84804") ? "" : (stryCov_9fa48("84804"), 'string')))) || (stryMutAct_9fa48("84806") ? message.length !== 0 : stryMutAct_9fa48("84805") ? false : (stryCov_9fa48("84805", "84806"), message.length === 0)))) {
        if (stryMutAct_9fa48("84807")) {
          {}
        } else {
          stryCov_9fa48("84807");
          return null;
        }
      }
      const normalizedResourceId = (stryMutAct_9fa48("84810") ? typeof resourceId !== 'string' : stryMutAct_9fa48("84809") ? false : stryMutAct_9fa48("84808") ? true : (stryCov_9fa48("84808", "84809", "84810"), typeof resourceId === (stryMutAct_9fa48("84811") ? "" : (stryCov_9fa48("84811"), 'string')))) ? stryMutAct_9fa48("84812") ? resourceId : (stryCov_9fa48("84812"), resourceId.trim()) : stryMutAct_9fa48("84813") ? "Stryker was here!" : (stryCov_9fa48("84813"), '');
      const suffix = stryMutAct_9fa48("84816") ? normalizedResourceId && 'shared' : stryMutAct_9fa48("84815") ? false : stryMutAct_9fa48("84814") ? true : (stryCov_9fa48("84814", "84815", "84816"), normalizedResourceId || (stryMutAct_9fa48("84817") ? "" : (stryCov_9fa48("84817"), 'shared')));
      if (stryMutAct_9fa48("84819") ? false : stryMutAct_9fa48("84818") ? true : (stryCov_9fa48("84818", "84819"), message.includes(stryMutAct_9fa48("84820") ? "" : (stryCov_9fa48("84820"), 'Distributed operation failed due to participant failures')))) {
        if (stryMutAct_9fa48("84821")) {
          {}
        } else {
          stryCov_9fa48("84821");
          return stryMutAct_9fa48("84822") ? `` : (stryCov_9fa48("84822"), `${LOG_PRESSURE_FAMILY.PARTICIPANT_FAILURE}:${suffix}`);
        }
      }
      if (stryMutAct_9fa48("84825") ? message.includes('Connection to node') || message.includes('closed') : stryMutAct_9fa48("84824") ? false : stryMutAct_9fa48("84823") ? true : (stryCov_9fa48("84823", "84824", "84825"), message.includes(stryMutAct_9fa48("84826") ? "" : (stryCov_9fa48("84826"), 'Connection to node')) && message.includes(stryMutAct_9fa48("84827") ? "" : (stryCov_9fa48("84827"), 'closed')))) {
        if (stryMutAct_9fa48("84828")) {
          {}
        } else {
          stryCov_9fa48("84828");
          return stryMutAct_9fa48("84829") ? `` : (stryCov_9fa48("84829"), `${LOG_PRESSURE_FAMILY.CONNECTION_CLOSED}:${suffix}`);
        }
      }
      if (stryMutAct_9fa48("84831") ? false : stryMutAct_9fa48("84830") ? true : (stryCov_9fa48("84830", "84831"), message.includes(stryMutAct_9fa48("84832") ? "" : (stryCov_9fa48("84832"), 'No connection to node')))) {
        if (stryMutAct_9fa48("84833")) {
          {}
        } else {
          stryCov_9fa48("84833");
          return stryMutAct_9fa48("84834") ? `` : (stryCov_9fa48("84834"), `${LOG_PRESSURE_FAMILY.NO_CONNECTION}:${suffix}`);
        }
      }
      if (stryMutAct_9fa48("84836") ? false : stryMutAct_9fa48("84835") ? true : (stryCov_9fa48("84835", "84836"), message.includes(stryMutAct_9fa48("84837") ? "" : (stryCov_9fa48("84837"), 'Message timeout')))) {
        if (stryMutAct_9fa48("84838")) {
          {}
        } else {
          stryCov_9fa48("84838");
          return stryMutAct_9fa48("84839") ? `` : (stryCov_9fa48("84839"), `${LOG_PRESSURE_FAMILY.MESSAGE_TIMEOUT}:${suffix}`);
        }
      }
      if (stryMutAct_9fa48("84841") ? false : stryMutAct_9fa48("84840") ? true : (stryCov_9fa48("84840", "84841"), message.includes(stryMutAct_9fa48("84842") ? "" : (stryCov_9fa48("84842"), 'Query routing failed')))) {
        if (stryMutAct_9fa48("84843")) {
          {}
        } else {
          stryCov_9fa48("84843");
          return stryMutAct_9fa48("84844") ? `` : (stryCov_9fa48("84844"), `${LOG_PRESSURE_FAMILY.QUERY_ROUTING_FAILED}:${suffix}`);
        }
      }
      if (stryMutAct_9fa48("84846") ? false : stryMutAct_9fa48("84845") ? true : (stryCov_9fa48("84845", "84846"), message.includes(stryMutAct_9fa48("84847") ? "" : (stryCov_9fa48("84847"), 'Failed to forward write to leader')))) {
        if (stryMutAct_9fa48("84848")) {
          {}
        } else {
          stryCov_9fa48("84848");
          return stryMutAct_9fa48("84849") ? `` : (stryCov_9fa48("84849"), `${LOG_PRESSURE_FAMILY.FORWARD_WRITE_FAILED}:${suffix}`);
        }
      }
      return null;
    }
  }

  /**
   * Check whether a pressure-equivalent entry is already queued.
   * @param {Object} entry
   * @return {boolean}
   * @private
   */
  hasPendingPressureEquivalentEntry(entry) {
    if (stryMutAct_9fa48("84850")) {
      {}
    } else {
      stryCov_9fa48("84850");
      const fingerprint = this.buildPressureFingerprint(entry);
      if (stryMutAct_9fa48("84853") ? false : stryMutAct_9fa48("84852") ? true : stryMutAct_9fa48("84851") ? fingerprint : (stryCov_9fa48("84851", "84852", "84853"), !fingerprint)) {
        if (stryMutAct_9fa48("84854")) {
          {}
        } else {
          stryCov_9fa48("84854");
          return stryMutAct_9fa48("84855") ? true : (stryCov_9fa48("84855"), false);
        }
      }
      for (const pendingEntry of this.pendingWrites) {
        if (stryMutAct_9fa48("84856")) {
          {}
        } else {
          stryCov_9fa48("84856");
          if (stryMutAct_9fa48("84859") ? this.buildPressureFingerprint(pendingEntry) !== fingerprint : stryMutAct_9fa48("84858") ? false : stryMutAct_9fa48("84857") ? true : (stryCov_9fa48("84857", "84858", "84859"), this.buildPressureFingerprint(pendingEntry) === fingerprint)) {
            if (stryMutAct_9fa48("84860")) {
              {}
            } else {
              stryCov_9fa48("84860");
              return stryMutAct_9fa48("84861") ? false : (stryCov_9fa48("84861"), true);
            }
          }
        }
      }
      return stryMutAct_9fa48("84862") ? true : (stryCov_9fa48("84862"), false);
    }
  }

  /**
   * Determine whether an incoming entry should be dropped while the owner is
   * pressure-deferred or the queue is already hot.
   * @param {Object} entry
   * @return {boolean}
   * @private
   */
  shouldDropEntryUnderPressure(entry) {
    if (stryMutAct_9fa48("84863")) {
      {}
    } else {
      stryCov_9fa48("84863");
      if (stryMutAct_9fa48("84866") ? this.shouldApplyRetainedBacklogCap() && this.pendingWrites.length >= this.getRetainedPressureBacklogCap() || this.getLogPriority(entry) < LOG_LEVEL_ORDER.ERROR : stryMutAct_9fa48("84865") ? false : stryMutAct_9fa48("84864") ? true : (stryCov_9fa48("84864", "84865", "84866"), (stryMutAct_9fa48("84868") ? this.shouldApplyRetainedBacklogCap() || this.pendingWrites.length >= this.getRetainedPressureBacklogCap() : stryMutAct_9fa48("84867") ? true : (stryCov_9fa48("84867", "84868"), this.shouldApplyRetainedBacklogCap() && (stryMutAct_9fa48("84871") ? this.pendingWrites.length < this.getRetainedPressureBacklogCap() : stryMutAct_9fa48("84870") ? this.pendingWrites.length > this.getRetainedPressureBacklogCap() : stryMutAct_9fa48("84869") ? true : (stryCov_9fa48("84869", "84870", "84871"), this.pendingWrites.length >= this.getRetainedPressureBacklogCap())))) && (stryMutAct_9fa48("84874") ? this.getLogPriority(entry) >= LOG_LEVEL_ORDER.ERROR : stryMutAct_9fa48("84873") ? this.getLogPriority(entry) <= LOG_LEVEL_ORDER.ERROR : stryMutAct_9fa48("84872") ? true : (stryCov_9fa48("84872", "84873", "84874"), this.getLogPriority(entry) < LOG_LEVEL_ORDER.ERROR)))) {
        if (stryMutAct_9fa48("84875")) {
          {}
        } else {
          stryCov_9fa48("84875");
          return stryMutAct_9fa48("84876") ? false : (stryCov_9fa48("84876"), true);
        }
      }
      if (stryMutAct_9fa48("84878") ? false : stryMutAct_9fa48("84877") ? true : (stryCov_9fa48("84877", "84878"), this.isMetricsLogEntry(entry))) {
        if (stryMutAct_9fa48("84879")) {
          {}
        } else {
          stryCov_9fa48("84879");
          return stryMutAct_9fa48("84880") ? false : (stryCov_9fa48("84880"), true);
        }
      }
      if (stryMutAct_9fa48("84884") ? this.getLogPriority(entry) > LOG_LEVEL_ORDER.INFO : stryMutAct_9fa48("84883") ? this.getLogPriority(entry) < LOG_LEVEL_ORDER.INFO : stryMutAct_9fa48("84882") ? false : stryMutAct_9fa48("84881") ? true : (stryCov_9fa48("84881", "84882", "84883", "84884"), this.getLogPriority(entry) <= LOG_LEVEL_ORDER.INFO)) {
        if (stryMutAct_9fa48("84885")) {
          {}
        } else {
          stryCov_9fa48("84885");
          return stryMutAct_9fa48("84886") ? false : (stryCov_9fa48("84886"), true);
        }
      }
      return this.hasPendingPressureEquivalentEntry(entry);
    }
  }

  /**
   * Check whether an entry is a logging-pipeline metrics event.
   * These entries are dropped to prevent metrics->logging recursion.
   * @param {Object} entry - Log entry.
   * @return {boolean}
   * @private
   */
  isLoggingPipelineMetricsEntry(entry) {
    if (stryMutAct_9fa48("84887")) {
      {}
    } else {
      stryCov_9fa48("84887");
      const message = (stryMutAct_9fa48("84890") ? typeof entry?.message !== 'string' : stryMutAct_9fa48("84889") ? false : stryMutAct_9fa48("84888") ? true : (stryCov_9fa48("84888", "84889", "84890"), typeof (stryMutAct_9fa48("84891") ? entry.message : (stryCov_9fa48("84891"), entry?.message)) === (stryMutAct_9fa48("84892") ? "" : (stryCov_9fa48("84892"), 'string')))) ? entry.message : stryMutAct_9fa48("84893") ? "Stryker was here!" : (stryCov_9fa48("84893"), '');
      if (stryMutAct_9fa48("84896") ? false : stryMutAct_9fa48("84895") ? true : stryMutAct_9fa48("84894") ? message : (stryCov_9fa48("84894", "84895", "84896"), !message)) {
        if (stryMutAct_9fa48("84897")) {
          {}
        } else {
          stryCov_9fa48("84897");
          return stryMutAct_9fa48("84898") ? true : (stryCov_9fa48("84898"), false);
        }
      }
      for (const prefix of LOGGING_PIPELINE_METRIC_PREFIXES) {
        if (stryMutAct_9fa48("84899")) {
          {}
        } else {
          stryCov_9fa48("84899");
          if (stryMutAct_9fa48("84902") ? message.endsWith(prefix) : stryMutAct_9fa48("84901") ? false : stryMutAct_9fa48("84900") ? true : (stryCov_9fa48("84900", "84901", "84902"), message.startsWith(prefix))) {
            if (stryMutAct_9fa48("84903")) {
              {}
            } else {
              stryCov_9fa48("84903");
              return stryMutAct_9fa48("84904") ? false : (stryCov_9fa48("84904"), true);
            }
          }
        }
      }
      return stryMutAct_9fa48("84905") ? true : (stryCov_9fa48("84905"), false);
    }
  }

  /**
   * Drop one queued metrics log entry to make room for non-metrics logs.
   * @return {boolean} True when a metrics entry was dropped.
   * @private
   */
  dropPendingMetricsLogEntry() {
    if (stryMutAct_9fa48("84906")) {
      {}
    } else {
      stryCov_9fa48("84906");
      for (let index = 0; stryMutAct_9fa48("84909") ? index >= this.pendingWrites.length : stryMutAct_9fa48("84908") ? index <= this.pendingWrites.length : stryMutAct_9fa48("84907") ? false : (stryCov_9fa48("84907", "84908", "84909"), index < this.pendingWrites.length); stryMutAct_9fa48("84910") ? index-- : (stryCov_9fa48("84910"), index++)) {
        if (stryMutAct_9fa48("84911")) {
          {}
        } else {
          stryCov_9fa48("84911");
          const entry = this.pendingWrites[index];
          if (stryMutAct_9fa48("84914") ? false : stryMutAct_9fa48("84913") ? true : stryMutAct_9fa48("84912") ? this.isMetricsLogEntry(entry) : (stryCov_9fa48("84912", "84913", "84914"), !this.isMetricsLogEntry(entry))) {
            if (stryMutAct_9fa48("84915")) {
              {}
            } else {
              stryCov_9fa48("84915");
              continue;
            }
          }
          this.pendingWrites.splice(index, 1);
          this.recordDroppedWrite();
          return stryMutAct_9fa48("84916") ? false : (stryCov_9fa48("84916"), true);
        }
      }
      return stryMutAct_9fa48("84917") ? true : (stryCov_9fa48("84917"), false);
    }
  }

  /**
   * Drop one queued entry so a more important incoming entry can be admitted.
   * Prefer dropping metrics, then lower-priority entries, then duplicates.
   * @param {Object} incomingEntry
   * @return {boolean}
   * @private
   */
  dropPendingQueuedEntryForAdmission(incomingEntry) {
    if (stryMutAct_9fa48("84918")) {
      {}
    } else {
      stryCov_9fa48("84918");
      if (stryMutAct_9fa48("84920") ? false : stryMutAct_9fa48("84919") ? true : (stryCov_9fa48("84919", "84920"), this.dropPendingMetricsLogEntry())) {
        if (stryMutAct_9fa48("84921")) {
          {}
        } else {
          stryCov_9fa48("84921");
          return stryMutAct_9fa48("84922") ? false : (stryCov_9fa48("84922"), true);
        }
      }
      const incomingPriority = this.getLogPriority(incomingEntry);
      for (let index = 0; stryMutAct_9fa48("84925") ? index >= this.pendingWrites.length : stryMutAct_9fa48("84924") ? index <= this.pendingWrites.length : stryMutAct_9fa48("84923") ? false : (stryCov_9fa48("84923", "84924", "84925"), index < this.pendingWrites.length); stryMutAct_9fa48("84926") ? index-- : (stryCov_9fa48("84926"), index++)) {
        if (stryMutAct_9fa48("84927")) {
          {}
        } else {
          stryCov_9fa48("84927");
          const pendingEntry = this.pendingWrites[index];
          if (stryMutAct_9fa48("84931") ? this.getLogPriority(pendingEntry) < incomingPriority : stryMutAct_9fa48("84930") ? this.getLogPriority(pendingEntry) > incomingPriority : stryMutAct_9fa48("84929") ? false : stryMutAct_9fa48("84928") ? true : (stryCov_9fa48("84928", "84929", "84930", "84931"), this.getLogPriority(pendingEntry) >= incomingPriority)) {
            if (stryMutAct_9fa48("84932")) {
              {}
            } else {
              stryCov_9fa48("84932");
              continue;
            }
          }
          this.pendingWrites.splice(index, 1);
          this.recordDroppedWrite();
          return stryMutAct_9fa48("84933") ? false : (stryCov_9fa48("84933"), true);
        }
      }
      const incomingFingerprint = this.buildPressureFingerprint(incomingEntry);
      if (stryMutAct_9fa48("84936") ? false : stryMutAct_9fa48("84935") ? true : stryMutAct_9fa48("84934") ? incomingFingerprint : (stryCov_9fa48("84934", "84935", "84936"), !incomingFingerprint)) {
        if (stryMutAct_9fa48("84937")) {
          {}
        } else {
          stryCov_9fa48("84937");
          return stryMutAct_9fa48("84938") ? true : (stryCov_9fa48("84938"), false);
        }
      }
      for (let index = 0; stryMutAct_9fa48("84941") ? index >= this.pendingWrites.length : stryMutAct_9fa48("84940") ? index <= this.pendingWrites.length : stryMutAct_9fa48("84939") ? false : (stryCov_9fa48("84939", "84940", "84941"), index < this.pendingWrites.length); stryMutAct_9fa48("84942") ? index-- : (stryCov_9fa48("84942"), index++)) {
        if (stryMutAct_9fa48("84943")) {
          {}
        } else {
          stryCov_9fa48("84943");
          const pendingEntry = this.pendingWrites[index];
          if (stryMutAct_9fa48("84946") ? this.buildPressureFingerprint(pendingEntry) === incomingFingerprint : stryMutAct_9fa48("84945") ? false : stryMutAct_9fa48("84944") ? true : (stryCov_9fa48("84944", "84945", "84946"), this.buildPressureFingerprint(pendingEntry) !== incomingFingerprint)) {
            if (stryMutAct_9fa48("84947")) {
              {}
            } else {
              stryCov_9fa48("84947");
              continue;
            }
          }
          this.pendingWrites.splice(index, 1);
          this.recordDroppedWrite();
          return stryMutAct_9fa48("84948") ? false : (stryCov_9fa48("84948"), true);
        }
      }
      return stryMutAct_9fa48("84949") ? true : (stryCov_9fa48("84949"), false);
    }
  }

  /**
   * Trim retained backlog aggressively during defer windows so the writer does
   * not keep retaining outage noise while the control plane is unavailable.
   * @private
   */
  trimPendingWritesUnderPressure() {
    if (stryMutAct_9fa48("84950")) {
      {}
    } else {
      stryCov_9fa48("84950");
      const retainedCap = this.getRetainedPressureBacklogCap();
      let droppedCount = 0;
      while (stryMutAct_9fa48("84953") ? this.pendingWrites.length <= retainedCap : stryMutAct_9fa48("84952") ? this.pendingWrites.length >= retainedCap : stryMutAct_9fa48("84951") ? false : (stryCov_9fa48("84951", "84952", "84953"), this.pendingWrites.length > retainedCap)) {
        if (stryMutAct_9fa48("84954")) {
          {}
        } else {
          stryCov_9fa48("84954");
          const dropIndex = this.findPendingTrimDropIndex();
          if (stryMutAct_9fa48("84958") ? dropIndex >= 0 : stryMutAct_9fa48("84957") ? dropIndex <= 0 : stryMutAct_9fa48("84956") ? false : stryMutAct_9fa48("84955") ? true : (stryCov_9fa48("84955", "84956", "84957", "84958"), dropIndex < 0)) {
            if (stryMutAct_9fa48("84959")) {
              {}
            } else {
              stryCov_9fa48("84959");
              break;
            }
          }
          this.pendingWrites.splice(dropIndex, 1);
          this.recordDroppedWrite();
          stryMutAct_9fa48("84960") ? droppedCount -= 1 : (stryCov_9fa48("84960"), droppedCount += 1);
        }
      }
      if (stryMutAct_9fa48("84964") ? droppedCount <= 0 : stryMutAct_9fa48("84963") ? droppedCount >= 0 : stryMutAct_9fa48("84962") ? false : stryMutAct_9fa48("84961") ? true : (stryCov_9fa48("84961", "84962", "84963", "84964"), droppedCount > 0)) {
        if (stryMutAct_9fa48("84965")) {
          {}
        } else {
          stryCov_9fa48("84965");
          this.incrementBoundedCounter(stryMutAct_9fa48("84966") ? "" : (stryCov_9fa48("84966"), 'retainedBacklogGrowthCount'), droppedCount);
        }
      }
      return droppedCount;
    }
  }

  /**
   * Select one queued entry to evict while trimming deferred-pressure backlog.
   * Prefer metrics, then duplicate fingerprints, then the oldest lowest-
   * priority entry.
   * @return {number}
   * @private
   */
  findPendingTrimDropIndex() {
    if (stryMutAct_9fa48("84967")) {
      {}
    } else {
      stryCov_9fa48("84967");
      const seenFingerprints = new Set();
      let lowestPriorityIndex = stryMutAct_9fa48("84968") ? +1 : (stryCov_9fa48("84968"), -1);
      let lowestPriority = Number.POSITIVE_INFINITY;
      for (let index = 0; stryMutAct_9fa48("84971") ? index >= this.pendingWrites.length : stryMutAct_9fa48("84970") ? index <= this.pendingWrites.length : stryMutAct_9fa48("84969") ? false : (stryCov_9fa48("84969", "84970", "84971"), index < this.pendingWrites.length); stryMutAct_9fa48("84972") ? index -= 1 : (stryCov_9fa48("84972"), index += 1)) {
        if (stryMutAct_9fa48("84973")) {
          {}
        } else {
          stryCov_9fa48("84973");
          const entry = this.pendingWrites[index];
          if (stryMutAct_9fa48("84975") ? false : stryMutAct_9fa48("84974") ? true : (stryCov_9fa48("84974", "84975"), this.isMetricsLogEntry(entry))) {
            if (stryMutAct_9fa48("84976")) {
              {}
            } else {
              stryCov_9fa48("84976");
              return index;
            }
          }
          const fingerprint = this.buildPressureFingerprint(entry);
          if (stryMutAct_9fa48("84978") ? false : stryMutAct_9fa48("84977") ? true : (stryCov_9fa48("84977", "84978"), fingerprint)) {
            if (stryMutAct_9fa48("84979")) {
              {}
            } else {
              stryCov_9fa48("84979");
              if (stryMutAct_9fa48("84981") ? false : stryMutAct_9fa48("84980") ? true : (stryCov_9fa48("84980", "84981"), seenFingerprints.has(fingerprint))) {
                if (stryMutAct_9fa48("84982")) {
                  {}
                } else {
                  stryCov_9fa48("84982");
                  return index;
                }
              }
              seenFingerprints.add(fingerprint);
            }
          }
          const priority = this.getLogPriority(entry);
          if (stryMutAct_9fa48("84986") ? priority >= lowestPriority : stryMutAct_9fa48("84985") ? priority <= lowestPriority : stryMutAct_9fa48("84984") ? false : stryMutAct_9fa48("84983") ? true : (stryCov_9fa48("84983", "84984", "84985", "84986"), priority < lowestPriority)) {
            if (stryMutAct_9fa48("84987")) {
              {}
            } else {
              stryCov_9fa48("84987");
              lowestPriority = priority;
              lowestPriorityIndex = index;
            }
          }
        }
      }
      return lowestPriorityIndex;
    }
  }

  /**
   * Update drop counters and emit throttled warning log.
   * @private
   */
  recordDroppedWrite() {
    if (stryMutAct_9fa48("84988")) {
      {}
    } else {
      stryCov_9fa48("84988");
      stryMutAct_9fa48("84989") ? this.droppedWrites -= 1 : (stryCov_9fa48("84989"), this.droppedWrites += 1);
      if (stryMutAct_9fa48("84992") ? this.droppedWrites === 1 && this.droppedWrites % LOGS_TABLE_DEFAULT.BACKPRESSURE_WARNING_INTERVAL === 0 : stryMutAct_9fa48("84991") ? false : stryMutAct_9fa48("84990") ? true : (stryCov_9fa48("84990", "84991", "84992"), (stryMutAct_9fa48("84994") ? this.droppedWrites !== 1 : stryMutAct_9fa48("84993") ? false : (stryCov_9fa48("84993", "84994"), this.droppedWrites === 1)) || (stryMutAct_9fa48("84996") ? this.droppedWrites % LOGS_TABLE_DEFAULT.BACKPRESSURE_WARNING_INTERVAL !== 0 : stryMutAct_9fa48("84995") ? false : (stryCov_9fa48("84995", "84996"), (stryMutAct_9fa48("84997") ? this.droppedWrites * LOGS_TABLE_DEFAULT.BACKPRESSURE_WARNING_INTERVAL : (stryCov_9fa48("84997"), this.droppedWrites % LOGS_TABLE_DEFAULT.BACKPRESSURE_WARNING_INTERVAL)) === 0)))) {
        if (stryMutAct_9fa48("84998")) {
          {}
        } else {
          stryCov_9fa48("84998");
          this.logger.warn(LOGGING_LOG_MSG.logsDroppedByBackpressure(this.droppedWrites, this.maxPendingWrites));
        }
      }
    }
  }

  /**
   * Increment a bounded diagnostic counter.
   * @param {string} fieldName
   * @param {number} [delta=1]
   * @private
   */
  incrementBoundedCounter(fieldName, delta = 1) {
    if (stryMutAct_9fa48("84999")) {
      {}
    } else {
      stryCov_9fa48("84999");
      if (stryMutAct_9fa48("85002") ? typeof fieldName !== 'string' && fieldName.length === 0 : stryMutAct_9fa48("85001") ? false : stryMutAct_9fa48("85000") ? true : (stryCov_9fa48("85000", "85001", "85002"), (stryMutAct_9fa48("85004") ? typeof fieldName === 'string' : stryMutAct_9fa48("85003") ? false : (stryCov_9fa48("85003", "85004"), typeof fieldName !== (stryMutAct_9fa48("85005") ? "" : (stryCov_9fa48("85005"), 'string')))) || (stryMutAct_9fa48("85007") ? fieldName.length !== 0 : stryMutAct_9fa48("85006") ? false : (stryCov_9fa48("85006", "85007"), fieldName.length === 0)))) {
        if (stryMutAct_9fa48("85008")) {
          {}
        } else {
          stryCov_9fa48("85008");
          return;
        }
      }
      if (stryMutAct_9fa48("85011") ? !Number.isFinite(delta) && delta <= 0 : stryMutAct_9fa48("85010") ? false : stryMutAct_9fa48("85009") ? true : (stryCov_9fa48("85009", "85010", "85011"), (stryMutAct_9fa48("85012") ? Number.isFinite(delta) : (stryCov_9fa48("85012"), !Number.isFinite(delta))) || (stryMutAct_9fa48("85015") ? delta > 0 : stryMutAct_9fa48("85014") ? delta < 0 : stryMutAct_9fa48("85013") ? false : (stryCov_9fa48("85013", "85014", "85015"), delta <= 0)))) {
        if (stryMutAct_9fa48("85016")) {
          {}
        } else {
          stryCov_9fa48("85016");
          return;
        }
      }
      const currentValue = Number.isFinite(this[fieldName]) ? this[fieldName] : 0;
      this[fieldName] = stryMutAct_9fa48("85017") ? Math.max(Number.MAX_SAFE_INTEGER, currentValue + Math.max(MIN_CHUNK_SIZE, Math.floor(delta))) : (stryCov_9fa48("85017"), Math.min(Number.MAX_SAFE_INTEGER, stryMutAct_9fa48("85018") ? currentValue - Math.max(MIN_CHUNK_SIZE, Math.floor(delta)) : (stryCov_9fa48("85018"), currentValue + (stryMutAct_9fa48("85019") ? Math.min(MIN_CHUNK_SIZE, Math.floor(delta)) : (stryCov_9fa48("85019"), Math.max(MIN_CHUNK_SIZE, Math.floor(delta)))))));
    }
  }

  /**
   * Check if the service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("85020")) {
      {}
    } else {
      stryCov_9fa48("85020");
      return this.initialized;
    }
  }

  /**
   * Shutdown the service.
   * Flushes any pending writes before shutting down.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("85021")) {
      {}
    } else {
      stryCov_9fa48("85021");
      this.isShuttingDown = stryMutAct_9fa48("85022") ? false : (stryCov_9fa48("85022"), true);
      this.stopFlushTimer();

      // Final drain. Avoid busy-spinning while an in-flight write is active.
      // Use direct flush mode so shutdown does not depend on class-C scheduling.
      while (stryMutAct_9fa48("85024") ? this.pendingWrites.length > 0 && this.isWriting : stryMutAct_9fa48("85023") ? false : (stryCov_9fa48("85023", "85024"), (stryMutAct_9fa48("85027") ? this.pendingWrites.length <= 0 : stryMutAct_9fa48("85026") ? this.pendingWrites.length >= 0 : stryMutAct_9fa48("85025") ? false : (stryCov_9fa48("85025", "85026", "85027"), this.pendingWrites.length > 0)) || this.isWriting)) {
        if (stryMutAct_9fa48("85028")) {
          {}
        } else {
          stryCov_9fa48("85028");
          if (stryMutAct_9fa48("85030") ? false : stryMutAct_9fa48("85029") ? true : (stryCov_9fa48("85029", "85030"), this.isWriting)) {
            if (stryMutAct_9fa48("85031")) {
              {}
            } else {
              stryCov_9fa48("85031");
              await this.sleep(stryMutAct_9fa48("85032") ? Math.min(MIN_SLEEP_MS, this.flushYieldMs) : (stryCov_9fa48("85032"), Math.max(MIN_SLEEP_MS, this.flushYieldMs)));
              continue;
            }
          }
          if (stryMutAct_9fa48("85034") ? false : stryMutAct_9fa48("85033") ? true : (stryCov_9fa48("85033", "85034"), this.isWriteDeferred())) {
            if (stryMutAct_9fa48("85035")) {
              {}
            } else {
              stryCov_9fa48("85035");
              await this.sleep(this.getRemainingWriteDeferMs());
              continue;
            }
          }
          await this.flush(stryMutAct_9fa48("85036") ? {} : (stryCov_9fa48("85036"), {
            scheduleThroughWorkClass: stryMutAct_9fa48("85037") ? true : (stryCov_9fa48("85037"), false),
            maxEntries: this.flushChunkSize,
            yieldPending: stryMutAct_9fa48("85038") ? true : (stryCov_9fa48("85038"), false)
          }));
        }
      }
      this.initialized = stryMutAct_9fa48("85039") ? true : (stryCov_9fa48("85039"), false);
      this.isShuttingDown = stryMutAct_9fa48("85040") ? true : (stryCov_9fa48("85040"), false);
      this.removeAllListeners();
      this.logger.log(LOGGING_LOG_MSG.LOGS_TABLE_SERVICE_SHUTDOWN);
    }
  }

  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @private
   */
  sleep(ms) {
    if (stryMutAct_9fa48("85041")) {
      {}
    } else {
      stryCov_9fa48("85041");
      return new Promise(stryMutAct_9fa48("85042") ? () => undefined : (stryCov_9fa48("85042"), resolve => this.setTimeoutFn(resolve, ms)));
    }
  }
}
export { LogsTableService, LOGS_TABLE_DEFAULT };