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
import { NUM } from '../constants/index.js';
const LOG_LEVELS = Object.freeze(stryMutAct_9fa48("83413") ? [] : (stryCov_9fa48("83413"), [stryMutAct_9fa48("83414") ? "" : (stryCov_9fa48("83414"), 'trace'), stryMutAct_9fa48("83415") ? "" : (stryCov_9fa48("83415"), 'debug'), stryMutAct_9fa48("83416") ? "" : (stryCov_9fa48("83416"), 'info'), stryMutAct_9fa48("83417") ? "" : (stryCov_9fa48("83417"), 'warn'), stryMutAct_9fa48("83418") ? "" : (stryCov_9fa48("83418"), 'error'), stryMutAct_9fa48("83419") ? "" : (stryCov_9fa48("83419"), 'fatal')]));
const LOGGING_DEFAULT = Object.freeze(stryMutAct_9fa48("83420") ? {} : (stryCov_9fa48("83420"), {
  NODE_ID: stryMutAct_9fa48("83421") ? "" : (stryCov_9fa48("83421"), 'unknown'),
  LEVEL: stryMutAct_9fa48("83422") ? "" : (stryCov_9fa48("83422"), 'info'),
  MAX_BUFFER_SIZE: NUM.THOUSAND,
  PRETTY_PRINT: stryMutAct_9fa48("83423") ? true : (stryCov_9fa48("83423"), false),
  SHOW_METRICS_IN_CONSOLE: stryMutAct_9fa48("83424") ? true : (stryCov_9fa48("83424"), false),
  PERSIST_METRICS_LOGS: stryMutAct_9fa48("83425") ? true : (stryCov_9fa48("83425"), false),
  METRICS_DEFAULT_RESOLUTION_MS: NUM.THIRTY_THOUSAND,
  METRICS_DETAILED_WINDOW_ENABLED: stryMutAct_9fa48("83426") ? true : (stryCov_9fa48("83426"), false),
  METRICS_DETAILED_WINDOW_TTL_MS: 300000
}));
const LOGGING_DIAGNOSTICS_DEFAULT = Object.freeze(stryMutAct_9fa48("83427") ? {} : (stryCov_9fa48("83427"), {
  TOP_LIMIT: NUM.TEN,
  MAX_SUBSYSTEM_CARDINALITY: NUM.THOUSAND,
  MAX_METRIC_TAG_CARDINALITY: NUM.HUNDRED
}));
const LOGGING_PRETTY = Object.freeze(stryMutAct_9fa48("83428") ? {} : (stryCov_9fa48("83428"), {
  TARGET: stryMutAct_9fa48("83429") ? "" : (stryCov_9fa48("83429"), 'pino-pretty'),
  TRANSLATE_TIME: stryMutAct_9fa48("83430") ? "" : (stryCov_9fa48("83430"), 'SYS:standard'),
  COLORIZE: stryMutAct_9fa48("83431") ? false : (stryCov_9fa48("83431"), true),
  SINGLE_LINE: stryMutAct_9fa48("83432") ? false : (stryCov_9fa48("83432"), true)
}));
const LOGGING_LOG_MSG = Object.freeze(stryMutAct_9fa48("83433") ? {} : (stryCov_9fa48("83433"), {
  LOGS_TABLE_READY: stryMutAct_9fa48("83434") ? "" : (stryCov_9fa48("83434"), 'Logs table ready, flushing buffer'),
  LOGS_TABLE_SERVICE_INITIALIZED: stryMutAct_9fa48("83435") ? "" : (stryCov_9fa48("83435"), 'LogsTableService initialized'),
  LOGS_TABLE_SERVICE_SHUTDOWN: stryMutAct_9fa48("83436") ? "" : (stryCov_9fa48("83436"), 'LogsTableService shutdown'),
  logsDroppedByBackpressure: stryMutAct_9fa48("83437") ? () => undefined : (stryCov_9fa48("83437"), (dropped, maxPendingWrites) => stryMutAct_9fa48("83438") ? `` : (stryCov_9fa48("83438"), `LogsTableService dropped ${dropped} logs (maxPendingWrites=${maxPendingWrites})`)),
  logsWriteDeferred: stryMutAct_9fa48("83439") ? () => undefined : (stryCov_9fa48("83439"), (retryAfterMs, pendingWrites) => (stryMutAct_9fa48("83440") ? `` : (stryCov_9fa48("83440"), `LogsTableService deferred background writes for ${retryAfterMs}ms `)) + (stryMutAct_9fa48("83441") ? `` : (stryCov_9fa48("83441"), `(pendingWrites=${pendingWrites})`))),
  connectedLoggingService: stryMutAct_9fa48("83442") ? () => undefined : (stryCov_9fa48("83442"), count => stryMutAct_9fa48("83443") ? `` : (stryCov_9fa48("83443"), `Connected to LoggingService, flushed ${count} buffered entries`))
}));
const LOGGING_ERROR_MSG = Object.freeze(stryMutAct_9fa48("83444") ? {} : (stryCov_9fa48("83444"), {
  LOGGING_SERVICE_REQUIRED: stryMutAct_9fa48("83445") ? "" : (stryCov_9fa48("83445"), 'LoggingService must be initialized first'),
  WRITE_ENTRY_FAILED: stryMutAct_9fa48("83446") ? "" : (stryCov_9fa48("83446"), 'Failed to write log entry after retries:'),
  PERIODIC_FLUSH_FAILED: stryMutAct_9fa48("83447") ? "" : (stryCov_9fa48("83447"), 'Periodic flush failed:'),
  OWNER_REQUIRED: stryMutAct_9fa48("83448") ? "" : (stryCov_9fa48("83448"), 'LogsTableService requires logsOwner'),
  NO_WRITE_MECHANISM: stryMutAct_9fa48("83449") ? "" : (stryCov_9fa48("83449"), 'No write mechanism available for logs table')
}));
const LOG_QUERY_DEFAULT = Object.freeze(stryMutAct_9fa48("83450") ? {} : (stryCov_9fa48("83450"), {
  DEFAULT_LIMIT: NUM.HUNDRED,
  MAX_LIMIT: stryMutAct_9fa48("83451") ? NUM.THOUSAND / NUM.TEN : (stryCov_9fa48("83451"), NUM.THOUSAND * NUM.TEN),
  DEFAULT_TIME_RANGE_MS: stryMutAct_9fa48("83452") ? 60 * 60 / NUM.THOUSAND : (stryCov_9fa48("83452"), (stryMutAct_9fa48("83453") ? 60 / 60 : (stryCov_9fa48("83453"), 60 * 60)) * NUM.THOUSAND)
}));
const LOG_LEVEL_ORDER = Object.freeze(stryMutAct_9fa48("83454") ? {} : (stryCov_9fa48("83454"), {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  FATAL: 5
}));
const LOG_QUERY_LOG_MSG = Object.freeze(stryMutAct_9fa48("83455") ? {} : (stryCov_9fa48("83455"), {
  INITIALIZED: stryMutAct_9fa48("83456") ? "" : (stryCov_9fa48("83456"), 'LogQueryService initialized'),
  SHUTDOWN: stryMutAct_9fa48("83457") ? "" : (stryCov_9fa48("83457"), 'LogQueryService shutdown'),
  QUERY_EXECUTION_FAILED: stryMutAct_9fa48("83458") ? "" : (stryCov_9fa48("83458"), 'LogQueryService query execution failed')
}));
const LOG_QUERY_ERROR_MSG = Object.freeze(stryMutAct_9fa48("83459") ? {} : (stryCov_9fa48("83459"), {
  ENGINE_NOT_AVAILABLE: stryMutAct_9fa48("83460") ? "" : (stryCov_9fa48("83460"), 'SQL query engine not available'),
  invalidOrderBy: stryMutAct_9fa48("83461") ? () => undefined : (stryCov_9fa48("83461"), orderBy => stryMutAct_9fa48("83462") ? `` : (stryCov_9fa48("83462"), `Invalid orderBy column: ${orderBy}`)),
  invalidOrderDir: stryMutAct_9fa48("83463") ? () => undefined : (stryCov_9fa48("83463"), orderDir => stryMutAct_9fa48("83464") ? `` : (stryCov_9fa48("83464"), `Invalid orderDir value: ${orderDir}`))
}));
const LOG_QUERY_ERROR_CODE = Object.freeze(stryMutAct_9fa48("83465") ? {} : (stryCov_9fa48("83465"), {
  ENGINE_NOT_AVAILABLE: stryMutAct_9fa48("83466") ? "" : (stryCov_9fa48("83466"), 'ENGINE_NOT_AVAILABLE'),
  QUERY_FAILED: stryMutAct_9fa48("83467") ? "" : (stryCov_9fa48("83467"), 'QUERY_FAILED')
}));
const LOG_RETENTION_DEFAULT = Object.freeze(stryMutAct_9fa48("83468") ? {} : (stryCov_9fa48("83468"), {
  RETENTION_PERIOD_MS: stryMutAct_9fa48("83469") ? 7 * 24 * 60 * 60 / NUM.THOUSAND : (stryCov_9fa48("83469"), (stryMutAct_9fa48("83470") ? 7 * 24 * 60 / 60 : (stryCov_9fa48("83470"), (stryMutAct_9fa48("83471") ? 7 * 24 / 60 : (stryCov_9fa48("83471"), (stryMutAct_9fa48("83472") ? 7 / 24 : (stryCov_9fa48("83472"), 7 * 24)) * 60)) * 60)) * NUM.THOUSAND),
  CLEANUP_INTERVAL_MS: stryMutAct_9fa48("83473") ? 60 * 60 / NUM.THOUSAND : (stryCov_9fa48("83473"), (stryMutAct_9fa48("83474") ? 60 / 60 : (stryCov_9fa48("83474"), 60 * 60)) * NUM.THOUSAND),
  BATCH_SIZE: NUM.THOUSAND,
  MAX_DELETES_PER_RUN: stryMutAct_9fa48("83475") ? NUM.THOUSAND / NUM.TEN : (stryCov_9fa48("83475"), NUM.THOUSAND * NUM.TEN)
}));
const LOG_RETENTION_LOG_MSG = Object.freeze(stryMutAct_9fa48("83476") ? {} : (stryCov_9fa48("83476"), {
  INITIALIZED: stryMutAct_9fa48("83477") ? "" : (stryCov_9fa48("83477"), 'LogRetentionService initialized'),
  SHUTDOWN: stryMutAct_9fa48("83478") ? "" : (stryCov_9fa48("83478"), 'LogRetentionService shutdown'),
  SCHEDULER_START: stryMutAct_9fa48("83479") ? () => undefined : (stryCov_9fa48("83479"), intervalMs => stryMutAct_9fa48("83480") ? `` : (stryCov_9fa48("83480"), `Starting log retention scheduler (interval: ${intervalMs}ms)`)),
  SCHEDULER_STOPPED: stryMutAct_9fa48("83481") ? "" : (stryCov_9fa48("83481"), 'Log retention scheduler stopped'),
  RUNNING_CLEANUP: stryMutAct_9fa48("83482") ? () => undefined : (stryCov_9fa48("83482"), cutoffIso => stryMutAct_9fa48("83483") ? `` : (stryCov_9fa48("83483"), `Running log cleanup (cutoff: ${cutoffIso})`)),
  CLEANUP_COMPLETED: stryMutAct_9fa48("83484") ? () => undefined : (stryCov_9fa48("83484"), (deleted, durationMs) => stryMutAct_9fa48("83485") ? `` : (stryCov_9fa48("83485"), `Log cleanup completed: ${deleted} entries deleted in ${durationMs}ms`)),
  RETENTION_SET: stryMutAct_9fa48("83486") ? () => undefined : (stryCov_9fa48("83486"), periodMs => stryMutAct_9fa48("83487") ? `` : (stryCov_9fa48("83487"), `Retention period set to ${periodMs}ms`))
}));
const LOG_RETENTION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("83488") ? {} : (stryCov_9fa48("83488"), {
  INITIAL_CLEANUP_FAILED: stryMutAct_9fa48("83489") ? "" : (stryCov_9fa48("83489"), 'Initial cleanup failed:'),
  SCHEDULED_CLEANUP_FAILED: stryMutAct_9fa48("83490") ? "" : (stryCov_9fa48("83490"), 'Scheduled cleanup failed:'),
  CLEANUP_FAILED: stryMutAct_9fa48("83491") ? "" : (stryCov_9fa48("83491"), 'Log cleanup failed:'),
  CLEANUP_IN_PROGRESS: stryMutAct_9fa48("83492") ? "" : (stryCov_9fa48("83492"), 'Cleanup already in progress'),
  ENGINE_NOT_AVAILABLE: stryMutAct_9fa48("83493") ? "" : (stryCov_9fa48("83493"), 'SQL query engine not available'),
  RETENTION_PERIOD_NEGATIVE: stryMutAct_9fa48("83494") ? "" : (stryCov_9fa48("83494"), 'Retention period must be non-negative')
}));
const LOGS_TABLE_DEFAULT = Object.freeze(stryMutAct_9fa48("83495") ? {} : (stryCov_9fa48("83495"), {
  BATCH_SIZE: NUM.HUNDRED,
  FLUSH_INTERVAL_MS: stryMutAct_9fa48("83496") ? NUM.FIVE / NUM.THOUSAND : (stryCov_9fa48("83496"), NUM.FIVE * NUM.THOUSAND),
  FLUSH_CHUNK_SIZE: NUM.ONE,
  FLUSH_YIELD_MS: NUM.FIVE,
  MAX_RETRIES: NUM.THREE,
  RETRY_DELAY_MS: NUM.THOUSAND,
  MAX_PENDING_WRITES: NUM.TEN_THOUSAND,
  PRESSURE_HIGH_WATERMARK: 512,
  PRESSURE_RETAINED_PENDING_WRITES: 128,
  PRESSURE_DEFER_BACKOFF_MULTIPLIER: NUM.TWO,
  PRESSURE_MAX_RETRY_DELAY_MS: stryMutAct_9fa48("83497") ? NUM.TEN / NUM.THOUSAND : (stryCov_9fa48("83497"), NUM.TEN * NUM.THOUSAND),
  BACKPRESSURE_WARNING_INTERVAL: NUM.THOUSAND,
  STARTUP_THROTTLED_BACKGROUND_FLUSH_THRESHOLD: NUM.HUNDRED,
  STARTUP_THROTTLED_BACKGROUND_FLUSH_CHUNK_SIZE: NUM.ONE,
  STARTUP_THROTTLED_BACKGROUND_FLUSH_YIELD_MS: 50,
  BACKGROUND_FLUSH_CHUNK_SIZE: stryMutAct_9fa48("83498") ? NUM.TEN / NUM.TWO : (stryCov_9fa48("83498"), NUM.TEN * NUM.TWO),
  BACKGROUND_FLUSH_YIELD_MS: NUM.FIVE
}));
const LOGGING_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("83499") ? {} : (stryCov_9fa48("83499"), {
  MAIN: stryMutAct_9fa48("83500") ? "" : (stryCov_9fa48("83500"), 'main'),
  CONFIG: stryMutAct_9fa48("83501") ? "" : (stryCov_9fa48("83501"), 'config')
}));
export { LOG_LEVELS, LOGGING_DEFAULT, LOGGING_DIAGNOSTICS_DEFAULT, LOGGING_ERROR_MSG, LOGGING_LOG_MSG, LOGGING_PRETTY, LOGGING_SUBSYSTEM, LOG_LEVEL_ORDER, LOG_QUERY_DEFAULT, LOG_QUERY_ERROR_CODE, LOG_QUERY_ERROR_MSG, LOG_QUERY_LOG_MSG, LOG_RETENTION_DEFAULT, LOG_RETENTION_ERROR_MSG, LOG_RETENTION_LOG_MSG, LOGS_TABLE_DEFAULT };