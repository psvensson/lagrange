/**
 * Logging Service - Structured logging with pino.
 * Provides centralized logging with buffering during bootstrap.
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 28.1, 28.2, 28.3, 28.4, 28.5
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
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { METRICS_LOG_PREFIX } from '../constants/metrics-constants.js';
import { LOG_LEVELS, LOGGING_DEFAULT, LOGGING_DIAGNOSTICS_DEFAULT, LOGGING_LOG_MSG, LOGGING_PRETTY } from './logging-constants.js';
const LOGGING_DIAGNOSTICS_UNKNOWN_SUBSYSTEM = stryMutAct_9fa48("83502") ? "" : (stryCov_9fa48("83502"), 'unknown');
const LOGGING_LEVEL_FALLBACK = LOGGING_DEFAULT.LEVEL;
const LOGGING_LEVEL_INDEX = Object.freeze(LOG_LEVELS.reduce((result, level, index) => {
  if (stryMutAct_9fa48("83503")) {
    {}
  } else {
    stryCov_9fa48("83503");
    result[level] = index;
    return result;
  }
}, {}));
const LOGGING_METRICS_SUPPRESS_REASON = Object.freeze(stryMutAct_9fa48("83504") ? {} : (stryCov_9fa48("83504"), {
  NONE: null,
  RESOLUTION: stryMutAct_9fa48("83505") ? "" : (stryCov_9fa48("83505"), 'resolution'),
  DETAILED_WINDOW: stryMutAct_9fa48("83506") ? "" : (stryCov_9fa48("83506"), 'detailedWindow')
}));
const LOGGING_METRICS_DETAIL_LEVEL = Object.freeze(stryMutAct_9fa48("83507") ? {} : (stryCov_9fa48("83507"), {
  DETAILED: stryMutAct_9fa48("83508") ? "" : (stryCov_9fa48("83508"), 'detailed'),
  TIER_B_SHORT: stryMutAct_9fa48("83509") ? "" : (stryCov_9fa48("83509"), 'b'),
  TIER_B: stryMutAct_9fa48("83510") ? "" : (stryCov_9fa48("83510"), 'tier_b')
}));

/**
 * LoggingService provides structured logging with bootstrap buffering.
 */
class LoggingService {
  static instance = null;

  /**
   * Create a new LoggingService instance.
   * @private
   */
  constructor() {
    if (stryMutAct_9fa48("83511")) {
      {}
    } else {
      stryCov_9fa48("83511");
      this.buffer = stryMutAct_9fa48("83512") ? ["Stryker was here"] : (stryCov_9fa48("83512"), []);
      this.logsTableReady = stryMutAct_9fa48("83513") ? true : (stryCov_9fa48("83513"), false);
      this.maxBufferSize = LOGGING_DEFAULT.MAX_BUFFER_SIZE;
      this.flushCallback = null;
      this.nodeId = null;
      this.logger = null;
      this.initialized = stryMutAct_9fa48("83514") ? true : (stryCov_9fa48("83514"), false);
      this.showMetricsInConsole = LOGGING_DEFAULT.SHOW_METRICS_IN_CONSOLE;
      this.persistMetricsLogs = LOGGING_DEFAULT.PERSIST_METRICS_LOGS;
      this.metricsDefaultResolutionMs = LOGGING_DEFAULT.METRICS_DEFAULT_RESOLUTION_MS;
      this.metricsDetailedWindowEnabled = LOGGING_DEFAULT.METRICS_DETAILED_WINDOW_ENABLED;
      this.metricsDetailedWindowTtlMs = LOGGING_DEFAULT.METRICS_DETAILED_WINDOW_TTL_MS;
      this.metricsDetailedWindowExpiresAtMs = null;
      this.metricsLastEmissionByTag = new Map();
      this.level = LOGGING_LEVEL_FALLBACK;
      this.levelPriority = this.getLogLevelPriority(LOGGING_LEVEL_FALLBACK);
      this.diagnostics = this.createDiagnosticsState();
    }
  }

  /**
   * Get the singleton instance.
   * @return {LoggingService} The logging service instance.
   */
  static getInstance() {
    if (stryMutAct_9fa48("83515")) {
      {}
    } else {
      stryCov_9fa48("83515");
      if (stryMutAct_9fa48("83518") ? false : stryMutAct_9fa48("83517") ? true : stryMutAct_9fa48("83516") ? LoggingService.instance : (stryCov_9fa48("83516", "83517", "83518"), !LoggingService.instance)) {
        if (stryMutAct_9fa48("83519")) {
          {}
        } else {
          stryCov_9fa48("83519");
          LoggingService.instance = new LoggingService();
        }
      }
      return LoggingService.instance;
    }
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (stryMutAct_9fa48("83520")) {
      {}
    } else {
      stryCov_9fa48("83520");
      LoggingService.instance = null;
    }
  }

  /**
   * Initialize the logging service.
   * @param {Object} options - Configuration options.
   * @param {boolean} [options.showMetricsInConsole] - Enable console output
   *   for `metrics.*` log tags (disabled by default).
   * @param {boolean} [options.persistMetricsLogs] - Persist `metrics.*` logs
   *   into logs-table buffering/write pipeline.
   * @param {number} [options.metricsDefaultResolutionMs] - Default per-tag
   *   emission resolution for `metrics.*` logs.
   * @param {boolean} [options.metricsDetailedWindowEnabled] - Enable
   *   high-detail metrics for a bounded debug window.
   * @param {number} [options.metricsDetailedWindowTtlMs] - TTL in
   *   milliseconds for the high-detail metrics debug window.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("83521")) {
      {}
    } else {
      stryCov_9fa48("83521");
      const config = ConfigurationManager.getInstance();
      this.nodeId = stryMutAct_9fa48("83524") ? (options.nodeId || config.get(CONFIG_KEY.NODE_ID)) && LOGGING_DEFAULT.NODE_ID : stryMutAct_9fa48("83523") ? false : stryMutAct_9fa48("83522") ? true : (stryCov_9fa48("83522", "83523", "83524"), (stryMutAct_9fa48("83526") ? options.nodeId && config.get(CONFIG_KEY.NODE_ID) : stryMutAct_9fa48("83525") ? false : (stryCov_9fa48("83525", "83526"), options.nodeId || config.get(CONFIG_KEY.NODE_ID))) || LOGGING_DEFAULT.NODE_ID);
      this.maxBufferSize = stryMutAct_9fa48("83529") ? (options.bufferSize || config.get(CONFIG_KEY.LOGGING_BUFFER_SIZE)) && LOGGING_DEFAULT.MAX_BUFFER_SIZE : stryMutAct_9fa48("83528") ? false : stryMutAct_9fa48("83527") ? true : (stryCov_9fa48("83527", "83528", "83529"), (stryMutAct_9fa48("83531") ? options.bufferSize && config.get(CONFIG_KEY.LOGGING_BUFFER_SIZE) : stryMutAct_9fa48("83530") ? false : (stryCov_9fa48("83530", "83531"), options.bufferSize || config.get(CONFIG_KEY.LOGGING_BUFFER_SIZE))) || LOGGING_DEFAULT.MAX_BUFFER_SIZE);
      const configuredLevel = stryMutAct_9fa48("83534") ? (options.level || config.get(CONFIG_KEY.LOGGING_LEVEL)) && LOGGING_DEFAULT.LEVEL : stryMutAct_9fa48("83533") ? false : stryMutAct_9fa48("83532") ? true : (stryCov_9fa48("83532", "83533", "83534"), (stryMutAct_9fa48("83536") ? options.level && config.get(CONFIG_KEY.LOGGING_LEVEL) : stryMutAct_9fa48("83535") ? false : (stryCov_9fa48("83535", "83536"), options.level || config.get(CONFIG_KEY.LOGGING_LEVEL))) || LOGGING_DEFAULT.LEVEL);
      this.level = this.normalizeLogLevel(configuredLevel);
      this.levelPriority = this.getLogLevelPriority(this.level);
      const prettyPrint = stryMutAct_9fa48("83537") ? (options.prettyPrint ?? config.get(CONFIG_KEY.LOGGING_PRETTY_PRINT)) && LOGGING_DEFAULT.PRETTY_PRINT : (stryCov_9fa48("83537"), (stryMutAct_9fa48("83538") ? options.prettyPrint && config.get(CONFIG_KEY.LOGGING_PRETTY_PRINT) : (stryCov_9fa48("83538"), options.prettyPrint ?? config.get(CONFIG_KEY.LOGGING_PRETTY_PRINT))) ?? LOGGING_DEFAULT.PRETTY_PRINT);
      this.showMetricsInConsole = stryMutAct_9fa48("83539") ? options.showMetricsInConsole && LOGGING_DEFAULT.SHOW_METRICS_IN_CONSOLE : (stryCov_9fa48("83539"), options.showMetricsInConsole ?? LOGGING_DEFAULT.SHOW_METRICS_IN_CONSOLE);
      this.persistMetricsLogs = stryMutAct_9fa48("83540") ? (options.persistMetricsLogs ?? config.get(CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS)) && LOGGING_DEFAULT.PERSIST_METRICS_LOGS : (stryCov_9fa48("83540"), (stryMutAct_9fa48("83541") ? options.persistMetricsLogs && config.get(CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS) : (stryCov_9fa48("83541"), options.persistMetricsLogs ?? config.get(CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS))) ?? LOGGING_DEFAULT.PERSIST_METRICS_LOGS);
      this.setMetricsDefaultResolutionMs(stryMutAct_9fa48("83542") ? (options.metricsDefaultResolutionMs ?? config.get(CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS)) && LOGGING_DEFAULT.METRICS_DEFAULT_RESOLUTION_MS : (stryCov_9fa48("83542"), (stryMutAct_9fa48("83543") ? options.metricsDefaultResolutionMs && config.get(CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS) : (stryCov_9fa48("83543"), options.metricsDefaultResolutionMs ?? config.get(CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS))) ?? LOGGING_DEFAULT.METRICS_DEFAULT_RESOLUTION_MS));
      this.setMetricsDetailedWindowTtlMs(stryMutAct_9fa48("83544") ? (options.metricsDetailedWindowTtlMs ?? config.get(CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS)) && LOGGING_DEFAULT.METRICS_DETAILED_WINDOW_TTL_MS : (stryCov_9fa48("83544"), (stryMutAct_9fa48("83545") ? options.metricsDetailedWindowTtlMs && config.get(CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS) : (stryCov_9fa48("83545"), options.metricsDetailedWindowTtlMs ?? config.get(CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS))) ?? LOGGING_DEFAULT.METRICS_DETAILED_WINDOW_TTL_MS));
      this.setMetricsDetailedWindowEnabled(stryMutAct_9fa48("83546") ? (options.metricsDetailedWindowEnabled ?? config.get(CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED)) && LOGGING_DEFAULT.METRICS_DETAILED_WINDOW_ENABLED : (stryCov_9fa48("83546"), (stryMutAct_9fa48("83547") ? options.metricsDetailedWindowEnabled && config.get(CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED) : (stryCov_9fa48("83547"), options.metricsDetailedWindowEnabled ?? config.get(CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED))) ?? LOGGING_DEFAULT.METRICS_DETAILED_WINDOW_ENABLED));

      // Configure pino logger
      const pinoOptions = stryMutAct_9fa48("83548") ? {} : (stryCov_9fa48("83548"), {
        level: this.level,
        base: stryMutAct_9fa48("83549") ? {} : (stryCov_9fa48("83549"), {
          nodeId: this.nodeId,
          pid: process.pid
        }),
        timestamp: pino.stdTimeFunctions.isoTime
      });
      if (stryMutAct_9fa48("83551") ? false : stryMutAct_9fa48("83550") ? true : (stryCov_9fa48("83550", "83551"), prettyPrint)) {
        if (stryMutAct_9fa48("83552")) {
          {}
        } else {
          stryCov_9fa48("83552");
          this.logger = pino(pinoOptions, pino.transport(stryMutAct_9fa48("83553") ? {} : (stryCov_9fa48("83553"), {
            target: LOGGING_PRETTY.TARGET,
            options: stryMutAct_9fa48("83554") ? {} : (stryCov_9fa48("83554"), {
              colorize: LOGGING_PRETTY.COLORIZE,
              translateTime: LOGGING_PRETTY.TRANSLATE_TIME,
              singleLine: LOGGING_PRETTY.SINGLE_LINE
            })
          })));
        }
      } else {
        if (stryMutAct_9fa48("83555")) {
          {}
        } else {
          stryCov_9fa48("83555");
          this.logger = pino(pinoOptions);
        }
      }
      this.initialized = stryMutAct_9fa48("83556") ? false : (stryCov_9fa48("83556"), true);
    }
  }

  /**
   * Create diagnostics state counters.
   * @return {Object}
   * @private
   */
  createDiagnosticsState() {
    if (stryMutAct_9fa48("83557")) {
      {}
    } else {
      stryCov_9fa48("83557");
      return stryMutAct_9fa48("83558") ? {} : (stryCov_9fa48("83558"), {
        totalLogs: 0,
        metricsLogs: 0,
        nonMetricsLogs: 0,
        logsSuppressedByLevel: 0,
        metricsSuppressedFromConsole: 0,
        metricsSuppressedFromPersistence: 0,
        metricsSuppressedByResolution: 0,
        metricsSuppressedByDetailedWindow: 0,
        subsystemCounts: new Map(),
        metricTagCounts: new Map()
      });
    }
  }

  /**
   * Create a log entry with metadata.
   * @param {string} level - Log level.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   * @return {Object} Log entry object.
   * @private
   */
  createLogEntry(level, message, context = {}) {
    if (stryMutAct_9fa48("83559")) {
      {}
    } else {
      stryCov_9fa48("83559");
      return stryMutAct_9fa48("83560") ? {} : (stryCov_9fa48("83560"), {
        logId: uuidv4(),
        timestamp: Date.now(),
        level: stryMutAct_9fa48("83561") ? level.toLowerCase() : (stryCov_9fa48("83561"), level.toUpperCase()),
        nodeId: this.nodeId,
        subsystem: stryMutAct_9fa48("83564") ? context.subsystem && null : stryMutAct_9fa48("83563") ? false : stryMutAct_9fa48("83562") ? true : (stryCov_9fa48("83562", "83563", "83564"), context.subsystem || null),
        serviceId: stryMutAct_9fa48("83567") ? context.serviceId && null : stryMutAct_9fa48("83566") ? false : stryMutAct_9fa48("83565") ? true : (stryCov_9fa48("83565", "83566", "83567"), context.serviceId || null),
        serviceType: stryMutAct_9fa48("83570") ? context.serviceType && null : stryMutAct_9fa48("83569") ? false : stryMutAct_9fa48("83568") ? true : (stryCov_9fa48("83568", "83569", "83570"), context.serviceType || null),
        message,
        traceId: stryMutAct_9fa48("83573") ? context.traceId && null : stryMutAct_9fa48("83572") ? false : stryMutAct_9fa48("83571") ? true : (stryCov_9fa48("83571", "83572", "83573"), context.traceId || null),
        metadata: context,
        createdAt: Date.now()
      });
    }
  }

  /**
   * Check whether a log message belongs to the metrics namespace.
   * @param {*} message - Log message value.
   * @return {boolean} True when message starts with metrics namespace prefix.
   * @private
   */
  isMetricsLogMessage(message) {
    if (stryMutAct_9fa48("83574")) {
      {}
    } else {
      stryCov_9fa48("83574");
      return stryMutAct_9fa48("83577") ? typeof message === 'string' || message.startsWith(METRICS_LOG_PREFIX) : stryMutAct_9fa48("83576") ? false : stryMutAct_9fa48("83575") ? true : (stryCov_9fa48("83575", "83576", "83577"), (stryMutAct_9fa48("83579") ? typeof message !== 'string' : stryMutAct_9fa48("83578") ? true : (stryCov_9fa48("83578", "83579"), typeof message === (stryMutAct_9fa48("83580") ? "" : (stryCov_9fa48("83580"), 'string')))) && (stryMutAct_9fa48("83581") ? message.endsWith(METRICS_LOG_PREFIX) : (stryCov_9fa48("83581"), message.startsWith(METRICS_LOG_PREFIX))));
    }
  }

  /**
   * Determine whether metrics context requests high-detail Tier-B logging.
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  isDetailedMetricsContext(context = {}) {
    if (stryMutAct_9fa48("83582")) {
      {}
    } else {
      stryCov_9fa48("83582");
      if (stryMutAct_9fa48("83585") ? !context && typeof context !== 'object' : stryMutAct_9fa48("83584") ? false : stryMutAct_9fa48("83583") ? true : (stryCov_9fa48("83583", "83584", "83585"), (stryMutAct_9fa48("83586") ? context : (stryCov_9fa48("83586"), !context)) || (stryMutAct_9fa48("83588") ? typeof context === 'object' : stryMutAct_9fa48("83587") ? false : (stryCov_9fa48("83587", "83588"), typeof context !== (stryMutAct_9fa48("83589") ? "" : (stryCov_9fa48("83589"), 'object')))))) {
        if (stryMutAct_9fa48("83590")) {
          {}
        } else {
          stryCov_9fa48("83590");
          return stryMutAct_9fa48("83591") ? true : (stryCov_9fa48("83591"), false);
        }
      }
      if (stryMutAct_9fa48("83594") ? context.metricsDetailed !== true : stryMutAct_9fa48("83593") ? false : stryMutAct_9fa48("83592") ? true : (stryCov_9fa48("83592", "83593", "83594"), context.metricsDetailed === (stryMutAct_9fa48("83595") ? false : (stryCov_9fa48("83595"), true)))) {
        if (stryMutAct_9fa48("83596")) {
          {}
        } else {
          stryCov_9fa48("83596");
          return stryMutAct_9fa48("83597") ? false : (stryCov_9fa48("83597"), true);
        }
      }
      const detailLevel = (stryMutAct_9fa48("83600") ? typeof context.metricsDetailLevel !== 'string' : stryMutAct_9fa48("83599") ? false : stryMutAct_9fa48("83598") ? true : (stryCov_9fa48("83598", "83599", "83600"), typeof context.metricsDetailLevel === (stryMutAct_9fa48("83601") ? "" : (stryCov_9fa48("83601"), 'string')))) ? stryMutAct_9fa48("83602") ? context.metricsDetailLevel.toUpperCase() : (stryCov_9fa48("83602"), context.metricsDetailLevel.toLowerCase()) : null;
      if (stryMutAct_9fa48("83605") ? detailLevel !== LOGGING_METRICS_DETAIL_LEVEL.DETAILED : stryMutAct_9fa48("83604") ? false : stryMutAct_9fa48("83603") ? true : (stryCov_9fa48("83603", "83604", "83605"), detailLevel === LOGGING_METRICS_DETAIL_LEVEL.DETAILED)) {
        if (stryMutAct_9fa48("83606")) {
          {}
        } else {
          stryCov_9fa48("83606");
          return stryMutAct_9fa48("83607") ? false : (stryCov_9fa48("83607"), true);
        }
      }
      const tier = (stryMutAct_9fa48("83610") ? typeof context.metricsTier !== 'string' : stryMutAct_9fa48("83609") ? false : stryMutAct_9fa48("83608") ? true : (stryCov_9fa48("83608", "83609", "83610"), typeof context.metricsTier === (stryMutAct_9fa48("83611") ? "" : (stryCov_9fa48("83611"), 'string')))) ? stryMutAct_9fa48("83612") ? context.metricsTier.toUpperCase() : (stryCov_9fa48("83612"), context.metricsTier.toLowerCase()) : null;
      return stryMutAct_9fa48("83615") ? tier === LOGGING_METRICS_DETAIL_LEVEL.TIER_B && tier === LOGGING_METRICS_DETAIL_LEVEL.TIER_B_SHORT : stryMutAct_9fa48("83614") ? false : stryMutAct_9fa48("83613") ? true : (stryCov_9fa48("83613", "83614", "83615"), (stryMutAct_9fa48("83617") ? tier !== LOGGING_METRICS_DETAIL_LEVEL.TIER_B : stryMutAct_9fa48("83616") ? false : (stryCov_9fa48("83616", "83617"), tier === LOGGING_METRICS_DETAIL_LEVEL.TIER_B)) || (stryMutAct_9fa48("83619") ? tier !== LOGGING_METRICS_DETAIL_LEVEL.TIER_B_SHORT : stryMutAct_9fa48("83618") ? false : (stryCov_9fa48("83618", "83619"), tier === LOGGING_METRICS_DETAIL_LEVEL.TIER_B_SHORT)));
    }
  }

  /**
   * Check if the detailed metrics debug window is currently active.
   * @param {number} [nowMs]
   * @return {boolean}
   * @private
   */
  isMetricsDetailedWindowActive(nowMs = Date.now()) {
    if (stryMutAct_9fa48("83620")) {
      {}
    } else {
      stryCov_9fa48("83620");
      if (stryMutAct_9fa48("83623") ? false : stryMutAct_9fa48("83622") ? true : stryMutAct_9fa48("83621") ? this.metricsDetailedWindowEnabled : (stryCov_9fa48("83621", "83622", "83623"), !this.metricsDetailedWindowEnabled)) {
        if (stryMutAct_9fa48("83624")) {
          {}
        } else {
          stryCov_9fa48("83624");
          return stryMutAct_9fa48("83625") ? true : (stryCov_9fa48("83625"), false);
        }
      }
      if (stryMutAct_9fa48("83628") ? false : stryMutAct_9fa48("83627") ? true : stryMutAct_9fa48("83626") ? Number.isFinite(this.metricsDetailedWindowExpiresAtMs) : (stryCov_9fa48("83626", "83627", "83628"), !Number.isFinite(this.metricsDetailedWindowExpiresAtMs))) {
        if (stryMutAct_9fa48("83629")) {
          {}
        } else {
          stryCov_9fa48("83629");
          return stryMutAct_9fa48("83630") ? true : (stryCov_9fa48("83630"), false);
        }
      }
      if (stryMutAct_9fa48("83634") ? nowMs < this.metricsDetailedWindowExpiresAtMs : stryMutAct_9fa48("83633") ? nowMs > this.metricsDetailedWindowExpiresAtMs : stryMutAct_9fa48("83632") ? false : stryMutAct_9fa48("83631") ? true : (stryCov_9fa48("83631", "83632", "83633", "83634"), nowMs >= this.metricsDetailedWindowExpiresAtMs)) {
        if (stryMutAct_9fa48("83635")) {
          {}
        } else {
          stryCov_9fa48("83635");
          this.metricsDetailedWindowEnabled = stryMutAct_9fa48("83636") ? true : (stryCov_9fa48("83636"), false);
          this.metricsDetailedWindowExpiresAtMs = null;
          return stryMutAct_9fa48("83637") ? true : (stryCov_9fa48("83637"), false);
        }
      }
      return stryMutAct_9fa48("83638") ? false : (stryCov_9fa48("83638"), true);
    }
  }

  /**
   * Return remaining detailed debug window lifetime in milliseconds.
   * @param {number} [nowMs]
   * @return {number}
   * @private
   */
  getMetricsDetailedWindowRemainingMs(nowMs = Date.now()) {
    if (stryMutAct_9fa48("83639")) {
      {}
    } else {
      stryCov_9fa48("83639");
      if (stryMutAct_9fa48("83642") ? false : stryMutAct_9fa48("83641") ? true : stryMutAct_9fa48("83640") ? this.isMetricsDetailedWindowActive(nowMs) : (stryCov_9fa48("83640", "83641", "83642"), !this.isMetricsDetailedWindowActive(nowMs))) {
        if (stryMutAct_9fa48("83643")) {
          {}
        } else {
          stryCov_9fa48("83643");
          return 0;
        }
      }
      return stryMutAct_9fa48("83644") ? Math.min(0, this.metricsDetailedWindowExpiresAtMs - nowMs) : (stryCov_9fa48("83644"), Math.max(0, stryMutAct_9fa48("83645") ? this.metricsDetailedWindowExpiresAtMs + nowMs : (stryCov_9fa48("83645"), this.metricsDetailedWindowExpiresAtMs - nowMs)));
    }
  }

  /**
   * Track last successful metrics emission timestamp for a tag.
   * @param {string} tag
   * @param {number} nowMs
   * @private
   */
  setMetricsTagLastEmission(tag, nowMs) {
    if (stryMutAct_9fa48("83646")) {
      {}
    } else {
      stryCov_9fa48("83646");
      if (stryMutAct_9fa48("83648") ? false : stryMutAct_9fa48("83647") ? true : (stryCov_9fa48("83647", "83648"), this.metricsLastEmissionByTag.has(tag))) {
        if (stryMutAct_9fa48("83649")) {
          {}
        } else {
          stryCov_9fa48("83649");
          this.metricsLastEmissionByTag.set(tag, nowMs);
          return;
        }
      }
      if (stryMutAct_9fa48("83653") ? this.metricsLastEmissionByTag.size < LOGGING_DIAGNOSTICS_DEFAULT.MAX_METRIC_TAG_CARDINALITY : stryMutAct_9fa48("83652") ? this.metricsLastEmissionByTag.size > LOGGING_DIAGNOSTICS_DEFAULT.MAX_METRIC_TAG_CARDINALITY : stryMutAct_9fa48("83651") ? false : stryMutAct_9fa48("83650") ? true : (stryCov_9fa48("83650", "83651", "83652", "83653"), this.metricsLastEmissionByTag.size >= LOGGING_DIAGNOSTICS_DEFAULT.MAX_METRIC_TAG_CARDINALITY)) {
        if (stryMutAct_9fa48("83654")) {
          {}
        } else {
          stryCov_9fa48("83654");
          return;
        }
      }
      this.metricsLastEmissionByTag.set(tag, nowMs);
    }
  }

  /**
   * Resolve whether a metrics log should be emitted in current policy state.
   * @param {string} message
   * @param {Object} context
   * @return {{shouldEmit: boolean, suppressReason: string|null}}
   * @private
   */
  shouldEmitMetricsMessage(message, context = {}) {
    if (stryMutAct_9fa48("83655")) {
      {}
    } else {
      stryCov_9fa48("83655");
      const nowMs = Date.now();
      const detailedWindowActive = this.isMetricsDetailedWindowActive(nowMs);
      const resolutionMs = stryMutAct_9fa48("83656") ? Math.min(0, this.metricsDefaultResolutionMs) : (stryCov_9fa48("83656"), Math.max(0, this.metricsDefaultResolutionMs));
      const lastEmissionMs = (stryMutAct_9fa48("83659") ? !detailedWindowActive || resolutionMs > 0 : stryMutAct_9fa48("83658") ? false : stryMutAct_9fa48("83657") ? true : (stryCov_9fa48("83657", "83658", "83659"), (stryMutAct_9fa48("83660") ? detailedWindowActive : (stryCov_9fa48("83660"), !detailedWindowActive)) && (stryMutAct_9fa48("83663") ? resolutionMs <= 0 : stryMutAct_9fa48("83662") ? resolutionMs >= 0 : stryMutAct_9fa48("83661") ? true : (stryCov_9fa48("83661", "83662", "83663"), resolutionMs > 0)))) ? this.metricsLastEmissionByTag.get(message) : undefined;
      const suppressReason = (stryMutAct_9fa48("83666") ? this.isDetailedMetricsContext(context) || !detailedWindowActive : stryMutAct_9fa48("83665") ? false : stryMutAct_9fa48("83664") ? true : (stryCov_9fa48("83664", "83665", "83666"), this.isDetailedMetricsContext(context) && (stryMutAct_9fa48("83667") ? detailedWindowActive : (stryCov_9fa48("83667"), !detailedWindowActive)))) ? LOGGING_METRICS_SUPPRESS_REASON.DETAILED_WINDOW : (stryMutAct_9fa48("83670") ? !detailedWindowActive && resolutionMs > 0 && Number.isFinite(lastEmissionMs) || nowMs - lastEmissionMs < resolutionMs : stryMutAct_9fa48("83669") ? false : stryMutAct_9fa48("83668") ? true : (stryCov_9fa48("83668", "83669", "83670"), (stryMutAct_9fa48("83672") ? !detailedWindowActive && resolutionMs > 0 || Number.isFinite(lastEmissionMs) : stryMutAct_9fa48("83671") ? true : (stryCov_9fa48("83671", "83672"), (stryMutAct_9fa48("83674") ? !detailedWindowActive || resolutionMs > 0 : stryMutAct_9fa48("83673") ? true : (stryCov_9fa48("83673", "83674"), (stryMutAct_9fa48("83675") ? detailedWindowActive : (stryCov_9fa48("83675"), !detailedWindowActive)) && (stryMutAct_9fa48("83678") ? resolutionMs <= 0 : stryMutAct_9fa48("83677") ? resolutionMs >= 0 : stryMutAct_9fa48("83676") ? true : (stryCov_9fa48("83676", "83677", "83678"), resolutionMs > 0)))) && Number.isFinite(lastEmissionMs))) && (stryMutAct_9fa48("83681") ? nowMs - lastEmissionMs >= resolutionMs : stryMutAct_9fa48("83680") ? nowMs - lastEmissionMs <= resolutionMs : stryMutAct_9fa48("83679") ? true : (stryCov_9fa48("83679", "83680", "83681"), (stryMutAct_9fa48("83682") ? nowMs + lastEmissionMs : (stryCov_9fa48("83682"), nowMs - lastEmissionMs)) < resolutionMs)))) ? LOGGING_METRICS_SUPPRESS_REASON.RESOLUTION : LOGGING_METRICS_SUPPRESS_REASON.NONE;
      const shouldEmit = stryMutAct_9fa48("83685") ? suppressReason !== LOGGING_METRICS_SUPPRESS_REASON.NONE : stryMutAct_9fa48("83684") ? false : stryMutAct_9fa48("83683") ? true : (stryCov_9fa48("83683", "83684", "83685"), suppressReason === LOGGING_METRICS_SUPPRESS_REASON.NONE);
      if (stryMutAct_9fa48("83687") ? false : stryMutAct_9fa48("83686") ? true : (stryCov_9fa48("83686", "83687"), shouldEmit)) {
        if (stryMutAct_9fa48("83688")) {
          {}
        } else {
          stryCov_9fa48("83688");
          this.setMetricsTagLastEmission(message, nowMs);
        }
      }
      return stryMutAct_9fa48("83689") ? {} : (stryCov_9fa48("83689"), {
        shouldEmit,
        suppressReason
      });
    }
  }

  /**
   * Normalize log level input to the canonical lowercase value.
   * @param {string} level
   * @return {string}
   * @private
   */
  normalizeLogLevel(level) {
    if (stryMutAct_9fa48("83690")) {
      {}
    } else {
      stryCov_9fa48("83690");
      if (stryMutAct_9fa48("83693") ? typeof level === 'string' : stryMutAct_9fa48("83692") ? false : stryMutAct_9fa48("83691") ? true : (stryCov_9fa48("83691", "83692", "83693"), typeof level !== (stryMutAct_9fa48("83694") ? "" : (stryCov_9fa48("83694"), 'string')))) {
        if (stryMutAct_9fa48("83695")) {
          {}
        } else {
          stryCov_9fa48("83695");
          return LOGGING_LEVEL_FALLBACK;
        }
      }
      const normalized = stryMutAct_9fa48("83696") ? level.toUpperCase() : (stryCov_9fa48("83696"), level.toLowerCase());
      if (stryMutAct_9fa48("83698") ? false : stryMutAct_9fa48("83697") ? true : (stryCov_9fa48("83697", "83698"), Object.prototype.hasOwnProperty.call(LOGGING_LEVEL_INDEX, normalized))) {
        if (stryMutAct_9fa48("83699")) {
          {}
        } else {
          stryCov_9fa48("83699");
          return normalized;
        }
      }
      return LOGGING_LEVEL_FALLBACK;
    }
  }

  /**
   * Resolve numeric priority for a log level.
   * @param {string} level
   * @return {number}
   * @private
   */
  getLogLevelPriority(level) {
    if (stryMutAct_9fa48("83700")) {
      {}
    } else {
      stryCov_9fa48("83700");
      const normalized = this.normalizeLogLevel(level);
      return LOGGING_LEVEL_INDEX[normalized];
    }
  }

  /**
   * Check whether a log level is enabled by current logger level.
   * @param {string} level
   * @return {boolean}
   * @private
   */
  isLogLevelEnabled(level) {
    if (stryMutAct_9fa48("83701")) {
      {}
    } else {
      stryCov_9fa48("83701");
      return stryMutAct_9fa48("83705") ? this.getLogLevelPriority(level) < this.levelPriority : stryMutAct_9fa48("83704") ? this.getLogLevelPriority(level) > this.levelPriority : stryMutAct_9fa48("83703") ? false : stryMutAct_9fa48("83702") ? true : (stryCov_9fa48("83702", "83703", "83704", "83705"), this.getLogLevelPriority(level) >= this.levelPriority);
    }
  }

  /**
   * Record diagnostics counters for a log invocation.
   * @param {Object} options
   * @param {boolean} options.isLevelEnabled
   * @param {boolean} options.isMetricsMessage
   * @param {boolean} options.shouldWriteToConsole
   * @param {boolean} options.shouldPersist
   * @param {string|null} options.metricsSuppressReason
   * @param {string} options.message
   * @param {Object} options.context
   * @private
   */
  recordDiagnostics(options) {
    if (stryMutAct_9fa48("83706")) {
      {}
    } else {
      stryCov_9fa48("83706");
      const isLevelEnabled = options.isLevelEnabled;
      const isMetricsMessage = options.isMetricsMessage;
      const shouldWriteToConsole = options.shouldWriteToConsole;
      const shouldPersist = options.shouldPersist;
      const metricsSuppressReason = options.metricsSuppressReason;
      const message = options.message;
      const context = stryMutAct_9fa48("83709") ? options.context && {} : stryMutAct_9fa48("83708") ? false : stryMutAct_9fa48("83707") ? true : (stryCov_9fa48("83707", "83708", "83709"), options.context || {});
      if (stryMutAct_9fa48("83712") ? false : stryMutAct_9fa48("83711") ? true : stryMutAct_9fa48("83710") ? isLevelEnabled : (stryCov_9fa48("83710", "83711", "83712"), !isLevelEnabled)) {
        if (stryMutAct_9fa48("83713")) {
          {}
        } else {
          stryCov_9fa48("83713");
          stryMutAct_9fa48("83714") ? this.diagnostics.logsSuppressedByLevel -= 1 : (stryCov_9fa48("83714"), this.diagnostics.logsSuppressedByLevel += 1);
          return;
        }
      }
      stryMutAct_9fa48("83715") ? this.diagnostics.totalLogs -= 1 : (stryCov_9fa48("83715"), this.diagnostics.totalLogs += 1);
      if (stryMutAct_9fa48("83717") ? false : stryMutAct_9fa48("83716") ? true : (stryCov_9fa48("83716", "83717"), isMetricsMessage)) {
        if (stryMutAct_9fa48("83718")) {
          {}
        } else {
          stryCov_9fa48("83718");
          stryMutAct_9fa48("83719") ? this.diagnostics.metricsLogs -= 1 : (stryCov_9fa48("83719"), this.diagnostics.metricsLogs += 1);
          if (stryMutAct_9fa48("83722") ? false : stryMutAct_9fa48("83721") ? true : stryMutAct_9fa48("83720") ? shouldWriteToConsole : (stryCov_9fa48("83720", "83721", "83722"), !shouldWriteToConsole)) {
            if (stryMutAct_9fa48("83723")) {
              {}
            } else {
              stryCov_9fa48("83723");
              stryMutAct_9fa48("83724") ? this.diagnostics.metricsSuppressedFromConsole -= 1 : (stryCov_9fa48("83724"), this.diagnostics.metricsSuppressedFromConsole += 1);
            }
          }
          if (stryMutAct_9fa48("83727") ? false : stryMutAct_9fa48("83726") ? true : stryMutAct_9fa48("83725") ? shouldPersist : (stryCov_9fa48("83725", "83726", "83727"), !shouldPersist)) {
            if (stryMutAct_9fa48("83728")) {
              {}
            } else {
              stryCov_9fa48("83728");
              stryMutAct_9fa48("83729") ? this.diagnostics.metricsSuppressedFromPersistence -= 1 : (stryCov_9fa48("83729"), this.diagnostics.metricsSuppressedFromPersistence += 1);
            }
          }
          if (stryMutAct_9fa48("83732") ? metricsSuppressReason !== LOGGING_METRICS_SUPPRESS_REASON.RESOLUTION : stryMutAct_9fa48("83731") ? false : stryMutAct_9fa48("83730") ? true : (stryCov_9fa48("83730", "83731", "83732"), metricsSuppressReason === LOGGING_METRICS_SUPPRESS_REASON.RESOLUTION)) {
            if (stryMutAct_9fa48("83733")) {
              {}
            } else {
              stryCov_9fa48("83733");
              stryMutAct_9fa48("83734") ? this.diagnostics.metricsSuppressedByResolution -= 1 : (stryCov_9fa48("83734"), this.diagnostics.metricsSuppressedByResolution += 1);
            }
          }
          if (stryMutAct_9fa48("83737") ? metricsSuppressReason !== LOGGING_METRICS_SUPPRESS_REASON.DETAILED_WINDOW : stryMutAct_9fa48("83736") ? false : stryMutAct_9fa48("83735") ? true : (stryCov_9fa48("83735", "83736", "83737"), metricsSuppressReason === LOGGING_METRICS_SUPPRESS_REASON.DETAILED_WINDOW)) {
            if (stryMutAct_9fa48("83738")) {
              {}
            } else {
              stryCov_9fa48("83738");
              stryMutAct_9fa48("83739") ? this.diagnostics.metricsSuppressedByDetailedWindow -= 1 : (stryCov_9fa48("83739"), this.diagnostics.metricsSuppressedByDetailedWindow += 1);
            }
          }
          this.incrementBoundedCounter(this.diagnostics.metricTagCounts, message, LOGGING_DIAGNOSTICS_DEFAULT.MAX_METRIC_TAG_CARDINALITY);
        }
      } else {
        if (stryMutAct_9fa48("83740")) {
          {}
        } else {
          stryCov_9fa48("83740");
          stryMutAct_9fa48("83741") ? this.diagnostics.nonMetricsLogs -= 1 : (stryCov_9fa48("83741"), this.diagnostics.nonMetricsLogs += 1);
        }
      }
      const subsystem = stryMutAct_9fa48("83744") ? context.subsystem && LOGGING_DIAGNOSTICS_UNKNOWN_SUBSYSTEM : stryMutAct_9fa48("83743") ? false : stryMutAct_9fa48("83742") ? true : (stryCov_9fa48("83742", "83743", "83744"), context.subsystem || LOGGING_DIAGNOSTICS_UNKNOWN_SUBSYSTEM);
      this.incrementBoundedCounter(this.diagnostics.subsystemCounts, subsystem, LOGGING_DIAGNOSTICS_DEFAULT.MAX_SUBSYSTEM_CARDINALITY);
    }
  }

  /**
   * Increment a bounded map counter.
   * @param {Map<string, number>} map
   * @param {string} key
   * @param {number} maxCardinality
   * @private
   */
  incrementBoundedCounter(map, key, maxCardinality) {
    if (stryMutAct_9fa48("83745")) {
      {}
    } else {
      stryCov_9fa48("83745");
      if (stryMutAct_9fa48("83747") ? false : stryMutAct_9fa48("83746") ? true : (stryCov_9fa48("83746", "83747"), map.has(key))) {
        if (stryMutAct_9fa48("83748")) {
          {}
        } else {
          stryCov_9fa48("83748");
          map.set(key, stryMutAct_9fa48("83749") ? map.get(key) - 1 : (stryCov_9fa48("83749"), map.get(key) + 1));
          return;
        }
      }
      if (stryMutAct_9fa48("83753") ? map.size < maxCardinality : stryMutAct_9fa48("83752") ? map.size > maxCardinality : stryMutAct_9fa48("83751") ? false : stryMutAct_9fa48("83750") ? true : (stryCov_9fa48("83750", "83751", "83752", "83753"), map.size >= maxCardinality)) {
        if (stryMutAct_9fa48("83754")) {
          {}
        } else {
          stryCov_9fa48("83754");
          return;
        }
      }
      map.set(key, 1);
    }
  }

  /**
   * Convert counter map to sorted top entries.
   * @param {Map<string, number>} map
   * @param {string} fieldName
   * @return {Object[]}
   * @private
   */
  getTopCounterEntries(map, fieldName) {
    if (stryMutAct_9fa48("83755")) {
      {}
    } else {
      stryCov_9fa48("83755");
      return stryMutAct_9fa48("83757") ? [...map.entries()].slice(0, LOGGING_DIAGNOSTICS_DEFAULT.TOP_LIMIT).map(([name, count]) => ({
        [fieldName]: name,
        count
      })) : stryMutAct_9fa48("83756") ? [...map.entries()].sort((left, right) => right[1] - left[1]).map(([name, count]) => ({
        [fieldName]: name,
        count
      })) : (stryCov_9fa48("83756", "83757"), (stryMutAct_9fa48("83758") ? [] : (stryCov_9fa48("83758"), [...map.entries()])).sort(stryMutAct_9fa48("83759") ? () => undefined : (stryCov_9fa48("83759"), (left, right) => stryMutAct_9fa48("83760") ? right[1] + left[1] : (stryCov_9fa48("83760"), right[1] - left[1]))).slice(0, LOGGING_DIAGNOSTICS_DEFAULT.TOP_LIMIT).map(stryMutAct_9fa48("83761") ? () => undefined : (stryCov_9fa48("83761"), ([name, count]) => stryMutAct_9fa48("83762") ? {} : (stryCov_9fa48("83762"), {
        [fieldName]: name,
        count
      }))));
    }
  }

  /**
   * Get logging diagnostics counters.
   * @return {Object}
   */
  getDiagnosticsStats() {
    if (stryMutAct_9fa48("83763")) {
      {}
    } else {
      stryCov_9fa48("83763");
      return stryMutAct_9fa48("83764") ? {} : (stryCov_9fa48("83764"), {
        totalLogs: this.diagnostics.totalLogs,
        metricsLogs: this.diagnostics.metricsLogs,
        nonMetricsLogs: this.diagnostics.nonMetricsLogs,
        logsSuppressedByLevel: this.diagnostics.logsSuppressedByLevel,
        metricsSuppressedFromConsole: this.diagnostics.metricsSuppressedFromConsole,
        metricsSuppressedFromPersistence: this.diagnostics.metricsSuppressedFromPersistence,
        metricsSuppressedByResolution: this.diagnostics.metricsSuppressedByResolution,
        metricsSuppressedByDetailedWindow: this.diagnostics.metricsSuppressedByDetailedWindow,
        level: this.level,
        persistMetricsLogs: this.persistMetricsLogs,
        showMetricsInConsole: this.showMetricsInConsole,
        metricsDefaultResolutionMs: this.metricsDefaultResolutionMs,
        metricsDetailedWindowEnabled: this.metricsDetailedWindowEnabled,
        metricsDetailedWindowTtlMs: this.metricsDetailedWindowTtlMs,
        metricsDetailedWindowRemainingMs: this.getMetricsDetailedWindowRemainingMs(),
        bufferSize: this.buffer.length,
        logsTableReady: this.logsTableReady,
        topSubsystems: this.getTopCounterEntries(this.diagnostics.subsystemCounts, stryMutAct_9fa48("83765") ? "" : (stryCov_9fa48("83765"), 'subsystem')),
        topMetricTags: this.getTopCounterEntries(this.diagnostics.metricTagCounts, stryMutAct_9fa48("83766") ? "" : (stryCov_9fa48("83766"), 'tag'))
      });
    }
  }

  /**
   * Log a message at the specified level.
   * @param {string} level - Log level.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  log(level, message, context = {}) {
    if (stryMutAct_9fa48("83767")) {
      {}
    } else {
      stryCov_9fa48("83767");
      const normalizedLevel = this.normalizeLogLevel(level);
      const isLevelEnabled = this.isLogLevelEnabled(normalizedLevel);
      const isMetricsMessage = this.isMetricsLogMessage(message);
      const metricsPolicy = (stryMutAct_9fa48("83770") ? isLevelEnabled || isMetricsMessage : stryMutAct_9fa48("83769") ? false : stryMutAct_9fa48("83768") ? true : (stryCov_9fa48("83768", "83769", "83770"), isLevelEnabled && isMetricsMessage)) ? this.shouldEmitMetricsMessage(message, context) : stryMutAct_9fa48("83771") ? {} : (stryCov_9fa48("83771"), {
        shouldEmit: stryMutAct_9fa48("83772") ? false : (stryCov_9fa48("83772"), true),
        suppressReason: LOGGING_METRICS_SUPPRESS_REASON.NONE
      });
      const shouldWriteToConsole = stryMutAct_9fa48("83775") ? isLevelEnabled || !isMetricsMessage || this.showMetricsInConsole && metricsPolicy.shouldEmit : stryMutAct_9fa48("83774") ? false : stryMutAct_9fa48("83773") ? true : (stryCov_9fa48("83773", "83774", "83775"), isLevelEnabled && (stryMutAct_9fa48("83777") ? !isMetricsMessage && this.showMetricsInConsole && metricsPolicy.shouldEmit : stryMutAct_9fa48("83776") ? true : (stryCov_9fa48("83776", "83777"), (stryMutAct_9fa48("83778") ? isMetricsMessage : (stryCov_9fa48("83778"), !isMetricsMessage)) || (stryMutAct_9fa48("83780") ? this.showMetricsInConsole || metricsPolicy.shouldEmit : stryMutAct_9fa48("83779") ? false : (stryCov_9fa48("83779", "83780"), this.showMetricsInConsole && metricsPolicy.shouldEmit)))));
      const shouldPersist = stryMutAct_9fa48("83783") ? isLevelEnabled || !isMetricsMessage || this.persistMetricsLogs && metricsPolicy.shouldEmit : stryMutAct_9fa48("83782") ? false : stryMutAct_9fa48("83781") ? true : (stryCov_9fa48("83781", "83782", "83783"), isLevelEnabled && (stryMutAct_9fa48("83785") ? !isMetricsMessage && this.persistMetricsLogs && metricsPolicy.shouldEmit : stryMutAct_9fa48("83784") ? true : (stryCov_9fa48("83784", "83785"), (stryMutAct_9fa48("83786") ? isMetricsMessage : (stryCov_9fa48("83786"), !isMetricsMessage)) || (stryMutAct_9fa48("83788") ? this.persistMetricsLogs || metricsPolicy.shouldEmit : stryMutAct_9fa48("83787") ? false : (stryCov_9fa48("83787", "83788"), this.persistMetricsLogs && metricsPolicy.shouldEmit)))));
      this.recordDiagnostics(stryMutAct_9fa48("83789") ? {} : (stryCov_9fa48("83789"), {
        isLevelEnabled,
        isMetricsMessage,
        shouldWriteToConsole,
        shouldPersist,
        metricsSuppressReason: metricsPolicy.suppressReason,
        message,
        context
      }));
      if (stryMutAct_9fa48("83792") ? false : stryMutAct_9fa48("83791") ? true : stryMutAct_9fa48("83790") ? this.initialized : (stryCov_9fa48("83790", "83791", "83792"), !this.initialized)) {
        if (stryMutAct_9fa48("83793")) {
          {}
        } else {
          stryCov_9fa48("83793");
          // Fallback to console during pre-initialization
          if (stryMutAct_9fa48("83795") ? false : stryMutAct_9fa48("83794") ? true : (stryCov_9fa48("83794", "83795"), shouldWriteToConsole)) {
            if (stryMutAct_9fa48("83796")) {
              {}
            } else {
              stryCov_9fa48("83796");
              console.log(JSON.stringify(stryMutAct_9fa48("83797") ? {} : (stryCov_9fa48("83797"), {
                level: normalizedLevel,
                message,
                ...context
              })));
            }
          }
          return;
        }
      }

      // Log to pino
      if (stryMutAct_9fa48("83799") ? false : stryMutAct_9fa48("83798") ? true : (stryCov_9fa48("83798", "83799"), shouldWriteToConsole)) {
        if (stryMutAct_9fa48("83800")) {
          {}
        } else {
          stryCov_9fa48("83800");
          this.logger[normalizedLevel](stryMutAct_9fa48("83801") ? {} : (stryCov_9fa48("83801"), {
            ...context,
            nodeId: this.nodeId
          }), message);
        }
      }
      if (stryMutAct_9fa48("83804") ? false : stryMutAct_9fa48("83803") ? true : stryMutAct_9fa48("83802") ? shouldPersist : (stryCov_9fa48("83802", "83803", "83804"), !shouldPersist)) {
        if (stryMutAct_9fa48("83805")) {
          {}
        } else {
          stryCov_9fa48("83805");
          return;
        }
      }
      const entry = this.createLogEntry(normalizedLevel, message, context);

      // Buffer during bootstrap
      if (stryMutAct_9fa48("83808") ? false : stryMutAct_9fa48("83807") ? true : stryMutAct_9fa48("83806") ? this.logsTableReady : (stryCov_9fa48("83806", "83807", "83808"), !this.logsTableReady)) {
        if (stryMutAct_9fa48("83809")) {
          {}
        } else {
          stryCov_9fa48("83809");
          this.buffer.push(entry);

          // Prevent unbounded growth
          if (stryMutAct_9fa48("83813") ? this.buffer.length <= this.maxBufferSize : stryMutAct_9fa48("83812") ? this.buffer.length >= this.maxBufferSize : stryMutAct_9fa48("83811") ? false : stryMutAct_9fa48("83810") ? true : (stryCov_9fa48("83810", "83811", "83812", "83813"), this.buffer.length > this.maxBufferSize)) {
            if (stryMutAct_9fa48("83814")) {
              {}
            } else {
              stryCov_9fa48("83814");
              this.buffer.shift();
            }
          }
        }
      } else if (stryMutAct_9fa48("83816") ? false : stryMutAct_9fa48("83815") ? true : (stryCov_9fa48("83815", "83816"), this.flushCallback)) {
        if (stryMutAct_9fa48("83817")) {
          {}
        } else {
          stryCov_9fa48("83817");
          // Write to logs table
          this.flushCallback(entry);
        }
      }
    }
  }

  /**
   * Log a trace message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  trace(message, context = {}) {
    if (stryMutAct_9fa48("83818")) {
      {}
    } else {
      stryCov_9fa48("83818");
      this.log(stryMutAct_9fa48("83819") ? "" : (stryCov_9fa48("83819"), 'trace'), message, context);
    }
  }

  /**
   * Log a debug message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  debug(message, context = {}) {
    if (stryMutAct_9fa48("83820")) {
      {}
    } else {
      stryCov_9fa48("83820");
      this.log(stryMutAct_9fa48("83821") ? "" : (stryCov_9fa48("83821"), 'debug'), message, context);
    }
  }

  /**
   * Log an info message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  info(message, context = {}) {
    if (stryMutAct_9fa48("83822")) {
      {}
    } else {
      stryCov_9fa48("83822");
      this.log(stryMutAct_9fa48("83823") ? "" : (stryCov_9fa48("83823"), 'info'), message, context);
    }
  }

  /**
   * Log a warning message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  warn(message, context = {}) {
    if (stryMutAct_9fa48("83824")) {
      {}
    } else {
      stryCov_9fa48("83824");
      this.log(stryMutAct_9fa48("83825") ? "" : (stryCov_9fa48("83825"), 'warn'), message, context);
    }
  }

  /**
   * Log an error message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  error(message, context = {}) {
    if (stryMutAct_9fa48("83826")) {
      {}
    } else {
      stryCov_9fa48("83826");
      this.log(stryMutAct_9fa48("83827") ? "" : (stryCov_9fa48("83827"), 'error'), message, context);
    }
  }

  /**
   * Log a fatal message.
   * @param {string} message - Log message.
   * @param {Object} context - Additional context.
   */
  fatal(message, context = {}) {
    if (stryMutAct_9fa48("83828")) {
      {}
    } else {
      stryCov_9fa48("83828");
      this.log(stryMutAct_9fa48("83829") ? "" : (stryCov_9fa48("83829"), 'fatal'), message, context);
    }
  }

  /**
   * Create a child logger with additional context.
   * @param {Object} bindings - Additional bindings for the child logger.
   * @return {Object} Child logger interface.
   */
  child(bindings) {
    if (stryMutAct_9fa48("83830")) {
      {}
    } else {
      stryCov_9fa48("83830");
      const childContext = stryMutAct_9fa48("83831") ? {} : (stryCov_9fa48("83831"), {
        ...bindings
      });
      const parent = this;
      return stryMutAct_9fa48("83832") ? {} : (stryCov_9fa48("83832"), {
        trace: stryMutAct_9fa48("83833") ? () => undefined : (stryCov_9fa48("83833"), (msg, ctx = {}) => parent.trace(msg, stryMutAct_9fa48("83834") ? {} : (stryCov_9fa48("83834"), {
          ...childContext,
          ...ctx
        }))),
        debug: stryMutAct_9fa48("83835") ? () => undefined : (stryCov_9fa48("83835"), (msg, ctx = {}) => parent.debug(msg, stryMutAct_9fa48("83836") ? {} : (stryCov_9fa48("83836"), {
          ...childContext,
          ...ctx
        }))),
        info: stryMutAct_9fa48("83837") ? () => undefined : (stryCov_9fa48("83837"), (msg, ctx = {}) => parent.info(msg, stryMutAct_9fa48("83838") ? {} : (stryCov_9fa48("83838"), {
          ...childContext,
          ...ctx
        }))),
        warn: stryMutAct_9fa48("83839") ? () => undefined : (stryCov_9fa48("83839"), (msg, ctx = {}) => parent.warn(msg, stryMutAct_9fa48("83840") ? {} : (stryCov_9fa48("83840"), {
          ...childContext,
          ...ctx
        }))),
        error: stryMutAct_9fa48("83841") ? () => undefined : (stryCov_9fa48("83841"), (msg, ctx = {}) => parent.error(msg, stryMutAct_9fa48("83842") ? {} : (stryCov_9fa48("83842"), {
          ...childContext,
          ...ctx
        }))),
        fatal: stryMutAct_9fa48("83843") ? () => undefined : (stryCov_9fa48("83843"), (msg, ctx = {}) => parent.fatal(msg, stryMutAct_9fa48("83844") ? {} : (stryCov_9fa48("83844"), {
          ...childContext,
          ...ctx
        }))),
        child: stryMutAct_9fa48("83845") ? () => undefined : (stryCov_9fa48("83845"), moreBindings => parent.child(stryMutAct_9fa48("83846") ? {} : (stryCov_9fa48("83846"), {
          ...childContext,
          ...moreBindings
        })))
      });
    }
  }

  /**
   * Create a logger for a specific subsystem.
   * This makes it easy to filter logs by subsystem name.
   * @param {string} subsystemName - Name of the subsystem (e.g., 'config', 'hlc', 'raft').
   * @return {Object} Subsystem-specific logger interface.
   */
  forSubsystem(subsystemName) {
    if (stryMutAct_9fa48("83847")) {
      {}
    } else {
      stryCov_9fa48("83847");
      return this.child(stryMutAct_9fa48("83848") ? {} : (stryCov_9fa48("83848"), {
        subsystem: subsystemName
      }));
    }
  }

  /**
   * Mark the logs table as ready and flush buffered entries.
   * @param {Function} writeCallback - Callback to write entries to logs table.
   * @return {Promise<number>} Number of entries flushed.
   */
  async onLogsTableReady(writeCallback, options = {}) {
    if (stryMutAct_9fa48("83849")) {
      {}
    } else {
      stryCov_9fa48("83849");
      return this.onLogsTableReadyWithOptions(writeCallback, options);
    }
  }

  /**
   * Mark logs table ready and flush buffered entries.
   * @param {Function} writeCallback - Callback to write entries to logs table.
   * @param {Object} [options] - Flush options.
   * @param {'sync'|'background'} [options.flushMode='sync'] - Flush mode.
   * @param {number} [options.chunkSize=100] - Background chunk size.
   * @param {number} [options.yieldMs=0] - Delay between background chunks.
   * @return {Promise<number>} Number of entries scheduled/flushed.
   */
  async onLogsTableReadyWithOptions(writeCallback, options = {}) {
    if (stryMutAct_9fa48("83850")) {
      {}
    } else {
      stryCov_9fa48("83850");
      this.logsTableReady = stryMutAct_9fa48("83851") ? false : (stryCov_9fa48("83851"), true);
      this.flushCallback = writeCallback;
      const flushMode = (stryMutAct_9fa48("83854") ? options.flushMode !== 'background' : stryMutAct_9fa48("83853") ? false : stryMutAct_9fa48("83852") ? true : (stryCov_9fa48("83852", "83853", "83854"), options.flushMode === (stryMutAct_9fa48("83855") ? "" : (stryCov_9fa48("83855"), 'background')))) ? stryMutAct_9fa48("83856") ? "" : (stryCov_9fa48("83856"), 'background') : stryMutAct_9fa48("83857") ? "" : (stryCov_9fa48("83857"), 'sync');
      const bufferedEntries = this.buffer.length;
      this.info(LOGGING_LOG_MSG.LOGS_TABLE_READY, stryMutAct_9fa48("83858") ? {} : (stryCov_9fa48("83858"), {
        bufferedEntries,
        flushMode
      }));

      // Detach current buffer snapshot to avoid blocking bootstrap pathways.
      // New entries are routed through flushCallback because logsTableReady=true.
      const entriesToFlush = this.buffer;
      this.buffer = stryMutAct_9fa48("83859") ? ["Stryker was here"] : (stryCov_9fa48("83859"), []);
      const flushedCount = entriesToFlush.length;
      if (stryMutAct_9fa48("83862") ? flushMode === 'background' && flushedCount > 0 || writeCallback : stryMutAct_9fa48("83861") ? false : stryMutAct_9fa48("83860") ? true : (stryCov_9fa48("83860", "83861", "83862"), (stryMutAct_9fa48("83864") ? flushMode === 'background' || flushedCount > 0 : stryMutAct_9fa48("83863") ? true : (stryCov_9fa48("83863", "83864"), (stryMutAct_9fa48("83866") ? flushMode !== 'background' : stryMutAct_9fa48("83865") ? true : (stryCov_9fa48("83865", "83866"), flushMode === (stryMutAct_9fa48("83867") ? "" : (stryCov_9fa48("83867"), 'background')))) && (stryMutAct_9fa48("83870") ? flushedCount <= 0 : stryMutAct_9fa48("83869") ? flushedCount >= 0 : stryMutAct_9fa48("83868") ? true : (stryCov_9fa48("83868", "83869", "83870"), flushedCount > 0)))) && writeCallback)) {
        if (stryMutAct_9fa48("83871")) {
          {}
        } else {
          stryCov_9fa48("83871");
          this.flushBufferedEntriesInBackground(writeCallback, entriesToFlush, options);
          return flushedCount;
        }
      }
      for (const entry of entriesToFlush) {
        if (stryMutAct_9fa48("83872")) {
          {}
        } else {
          stryCov_9fa48("83872");
          if (stryMutAct_9fa48("83874") ? false : stryMutAct_9fa48("83873") ? true : (stryCov_9fa48("83873", "83874"), writeCallback)) {
            if (stryMutAct_9fa48("83875")) {
              {}
            } else {
              stryCov_9fa48("83875");
              await writeCallback(entry);
            }
          }
        }
      }
      return flushedCount;
    }
  }

  /**
   * Flush buffered entries asynchronously in chunks.
   * @param {Function} writeCallback
   * @param {Array<Object>} entries
   * @param {Object} options
   * @private
   */
  flushBufferedEntriesInBackground(writeCallback, entries, options = {}) {
    if (stryMutAct_9fa48("83876")) {
      {}
    } else {
      stryCov_9fa48("83876");
      const chunkSize = (stryMutAct_9fa48("83879") ? Number.isFinite(options.chunkSize) || options.chunkSize > 0 : stryMutAct_9fa48("83878") ? false : stryMutAct_9fa48("83877") ? true : (stryCov_9fa48("83877", "83878", "83879"), Number.isFinite(options.chunkSize) && (stryMutAct_9fa48("83882") ? options.chunkSize <= 0 : stryMutAct_9fa48("83881") ? options.chunkSize >= 0 : stryMutAct_9fa48("83880") ? true : (stryCov_9fa48("83880", "83881", "83882"), options.chunkSize > 0)))) ? Math.floor(options.chunkSize) : 100;
      const yieldMs = (stryMutAct_9fa48("83885") ? Number.isFinite(options.yieldMs) || options.yieldMs >= 0 : stryMutAct_9fa48("83884") ? false : stryMutAct_9fa48("83883") ? true : (stryCov_9fa48("83883", "83884", "83885"), Number.isFinite(options.yieldMs) && (stryMutAct_9fa48("83888") ? options.yieldMs < 0 : stryMutAct_9fa48("83887") ? options.yieldMs > 0 : stryMutAct_9fa48("83886") ? true : (stryCov_9fa48("83886", "83887", "83888"), options.yieldMs >= 0)))) ? Math.floor(options.yieldMs) : 0;
      const startedAt = Date.now();
      let index = 0;
      let nextProgressMark = stryMutAct_9fa48("83889") ? chunkSize / 10 : (stryCov_9fa48("83889"), chunkSize * 10);
      this.info(stryMutAct_9fa48("83890") ? "" : (stryCov_9fa48("83890"), 'metrics.logging.buffer_flush.background.started'), stryMutAct_9fa48("83891") ? {} : (stryCov_9fa48("83891"), {
        bufferedEntries: entries.length,
        chunkSize,
        yieldMs
      }));
      const scheduleNext = () => {
        if (stryMutAct_9fa48("83892")) {
          {}
        } else {
          stryCov_9fa48("83892");
          const timer = setTimeout(() => {
            if (stryMutAct_9fa48("83893")) {
              {}
            } else {
              stryCov_9fa48("83893");
              void processChunk();
            }
          }, yieldMs);
          if (stryMutAct_9fa48("83896") ? typeof timer.unref !== 'function' : stryMutAct_9fa48("83895") ? false : stryMutAct_9fa48("83894") ? true : (stryCov_9fa48("83894", "83895", "83896"), typeof timer.unref === (stryMutAct_9fa48("83897") ? "" : (stryCov_9fa48("83897"), 'function')))) {
            if (stryMutAct_9fa48("83898")) {
              {}
            } else {
              stryCov_9fa48("83898");
              timer.unref();
            }
          }
        }
      };
      const processChunk = async () => {
        if (stryMutAct_9fa48("83899")) {
          {}
        } else {
          stryCov_9fa48("83899");
          try {
            if (stryMutAct_9fa48("83900")) {
              {}
            } else {
              stryCov_9fa48("83900");
              let processedInChunk = 0;
              while (stryMutAct_9fa48("83902") ? index < entries.length || processedInChunk < chunkSize : stryMutAct_9fa48("83901") ? false : (stryCov_9fa48("83901", "83902"), (stryMutAct_9fa48("83905") ? index >= entries.length : stryMutAct_9fa48("83904") ? index <= entries.length : stryMutAct_9fa48("83903") ? true : (stryCov_9fa48("83903", "83904", "83905"), index < entries.length)) && (stryMutAct_9fa48("83908") ? processedInChunk >= chunkSize : stryMutAct_9fa48("83907") ? processedInChunk <= chunkSize : stryMutAct_9fa48("83906") ? true : (stryCov_9fa48("83906", "83907", "83908"), processedInChunk < chunkSize)))) {
                if (stryMutAct_9fa48("83909")) {
                  {}
                } else {
                  stryCov_9fa48("83909");
                  await writeCallback(entries[index]);
                  stryMutAct_9fa48("83910") ? index-- : (stryCov_9fa48("83910"), index++);
                  stryMutAct_9fa48("83911") ? processedInChunk-- : (stryCov_9fa48("83911"), processedInChunk++);
                }
              }
              if (stryMutAct_9fa48("83914") ? index >= nextProgressMark || index < entries.length : stryMutAct_9fa48("83913") ? false : stryMutAct_9fa48("83912") ? true : (stryCov_9fa48("83912", "83913", "83914"), (stryMutAct_9fa48("83917") ? index < nextProgressMark : stryMutAct_9fa48("83916") ? index > nextProgressMark : stryMutAct_9fa48("83915") ? true : (stryCov_9fa48("83915", "83916", "83917"), index >= nextProgressMark)) && (stryMutAct_9fa48("83920") ? index >= entries.length : stryMutAct_9fa48("83919") ? index <= entries.length : stryMutAct_9fa48("83918") ? true : (stryCov_9fa48("83918", "83919", "83920"), index < entries.length)))) {
                if (stryMutAct_9fa48("83921")) {
                  {}
                } else {
                  stryCov_9fa48("83921");
                  this.debug(stryMutAct_9fa48("83922") ? "" : (stryCov_9fa48("83922"), 'metrics.logging.buffer_flush.background.progress'), stryMutAct_9fa48("83923") ? {} : (stryCov_9fa48("83923"), {
                    processedEntries: index,
                    totalEntries: entries.length,
                    durationMs: stryMutAct_9fa48("83924") ? Date.now() + startedAt : (stryCov_9fa48("83924"), Date.now() - startedAt)
                  }));
                  stryMutAct_9fa48("83925") ? nextProgressMark -= chunkSize * 10 : (stryCov_9fa48("83925"), nextProgressMark += stryMutAct_9fa48("83926") ? chunkSize / 10 : (stryCov_9fa48("83926"), chunkSize * 10));
                }
              }
              if (stryMutAct_9fa48("83930") ? index >= entries.length : stryMutAct_9fa48("83929") ? index <= entries.length : stryMutAct_9fa48("83928") ? false : stryMutAct_9fa48("83927") ? true : (stryCov_9fa48("83927", "83928", "83929", "83930"), index < entries.length)) {
                if (stryMutAct_9fa48("83931")) {
                  {}
                } else {
                  stryCov_9fa48("83931");
                  scheduleNext();
                  return;
                }
              }
              this.info(stryMutAct_9fa48("83932") ? "" : (stryCov_9fa48("83932"), 'metrics.logging.buffer_flush.background.completed'), stryMutAct_9fa48("83933") ? {} : (stryCov_9fa48("83933"), {
                bufferedEntries: entries.length,
                durationMs: stryMutAct_9fa48("83934") ? Date.now() + startedAt : (stryCov_9fa48("83934"), Date.now() - startedAt)
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("83935")) {
              {}
            } else {
              stryCov_9fa48("83935");
              this.error(stryMutAct_9fa48("83936") ? "" : (stryCov_9fa48("83936"), 'Background logs buffer flush failed'), stryMutAct_9fa48("83937") ? {} : (stryCov_9fa48("83937"), {
                error: error.message,
                processedEntries: index,
                totalEntries: entries.length,
                durationMs: stryMutAct_9fa48("83938") ? Date.now() + startedAt : (stryCov_9fa48("83938"), Date.now() - startedAt)
              }));
            }
          }
        }
      };
      scheduleNext();
    }
  }

  /**
   * Get the current buffer size.
   * @return {number} Number of buffered entries.
   */
  getBufferSize() {
    if (stryMutAct_9fa48("83939")) {
      {}
    } else {
      stryCov_9fa48("83939");
      return this.buffer.length;
    }
  }

  /**
   * Check if the logs table is ready.
   * @return {boolean} True if logs table is ready.
   */
  isLogsTableReady() {
    if (stryMutAct_9fa48("83940")) {
      {}
    } else {
      stryCov_9fa48("83940");
      return this.logsTableReady;
    }
  }

  /**
   * Check if the service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("83941")) {
      {}
    } else {
      stryCov_9fa48("83941");
      return this.initialized;
    }
  }

  /**
   * Get the node ID.
   * @return {string} The node ID.
   */
  getNodeId() {
    if (stryMutAct_9fa48("83942")) {
      {}
    } else {
      stryCov_9fa48("83942");
      return this.nodeId;
    }
  }

  /**
   * Get the underlying pino logger.
   * @return {Object} The pino logger instance.
   */
  getPinoLogger() {
    if (stryMutAct_9fa48("83943")) {
      {}
    } else {
      stryCov_9fa48("83943");
      return this.logger;
    }
  }

  /**
   * Update metrics persistence toggle at runtime.
   * @param {boolean} persistMetricsLogs - True to persist metrics logs.
   * @return {boolean} True when the update was applied.
   */
  setPersistMetricsLogs(persistMetricsLogs) {
    if (stryMutAct_9fa48("83944")) {
      {}
    } else {
      stryCov_9fa48("83944");
      if (stryMutAct_9fa48("83947") ? typeof persistMetricsLogs === 'boolean' : stryMutAct_9fa48("83946") ? false : stryMutAct_9fa48("83945") ? true : (stryCov_9fa48("83945", "83946", "83947"), typeof persistMetricsLogs !== (stryMutAct_9fa48("83948") ? "" : (stryCov_9fa48("83948"), 'boolean')))) {
        if (stryMutAct_9fa48("83949")) {
          {}
        } else {
          stryCov_9fa48("83949");
          return stryMutAct_9fa48("83950") ? true : (stryCov_9fa48("83950"), false);
        }
      }
      this.persistMetricsLogs = persistMetricsLogs;
      return stryMutAct_9fa48("83951") ? false : (stryCov_9fa48("83951"), true);
    }
  }

  /**
   * Update default metrics emission resolution at runtime.
   * @param {number} metricsDefaultResolutionMs
   * @return {boolean} True when the update was applied.
   */
  setMetricsDefaultResolutionMs(metricsDefaultResolutionMs) {
    if (stryMutAct_9fa48("83952")) {
      {}
    } else {
      stryCov_9fa48("83952");
      if (stryMutAct_9fa48("83955") ? !Number.isFinite(metricsDefaultResolutionMs) && metricsDefaultResolutionMs < 0 : stryMutAct_9fa48("83954") ? false : stryMutAct_9fa48("83953") ? true : (stryCov_9fa48("83953", "83954", "83955"), (stryMutAct_9fa48("83956") ? Number.isFinite(metricsDefaultResolutionMs) : (stryCov_9fa48("83956"), !Number.isFinite(metricsDefaultResolutionMs))) || (stryMutAct_9fa48("83959") ? metricsDefaultResolutionMs >= 0 : stryMutAct_9fa48("83958") ? metricsDefaultResolutionMs <= 0 : stryMutAct_9fa48("83957") ? false : (stryCov_9fa48("83957", "83958", "83959"), metricsDefaultResolutionMs < 0)))) {
        if (stryMutAct_9fa48("83960")) {
          {}
        } else {
          stryCov_9fa48("83960");
          return stryMutAct_9fa48("83961") ? true : (stryCov_9fa48("83961"), false);
        }
      }
      this.metricsDefaultResolutionMs = Math.floor(metricsDefaultResolutionMs);
      return stryMutAct_9fa48("83962") ? false : (stryCov_9fa48("83962"), true);
    }
  }

  /**
   * Update detailed metrics window TTL at runtime.
   * @param {number} metricsDetailedWindowTtlMs
   * @return {boolean} True when the update was applied.
   */
  setMetricsDetailedWindowTtlMs(metricsDetailedWindowTtlMs) {
    if (stryMutAct_9fa48("83963")) {
      {}
    } else {
      stryCov_9fa48("83963");
      if (stryMutAct_9fa48("83966") ? !Number.isFinite(metricsDetailedWindowTtlMs) && metricsDetailedWindowTtlMs < 1000 : stryMutAct_9fa48("83965") ? false : stryMutAct_9fa48("83964") ? true : (stryCov_9fa48("83964", "83965", "83966"), (stryMutAct_9fa48("83967") ? Number.isFinite(metricsDetailedWindowTtlMs) : (stryCov_9fa48("83967"), !Number.isFinite(metricsDetailedWindowTtlMs))) || (stryMutAct_9fa48("83970") ? metricsDetailedWindowTtlMs >= 1000 : stryMutAct_9fa48("83969") ? metricsDetailedWindowTtlMs <= 1000 : stryMutAct_9fa48("83968") ? false : (stryCov_9fa48("83968", "83969", "83970"), metricsDetailedWindowTtlMs < 1000)))) {
        if (stryMutAct_9fa48("83971")) {
          {}
        } else {
          stryCov_9fa48("83971");
          return stryMutAct_9fa48("83972") ? true : (stryCov_9fa48("83972"), false);
        }
      }
      this.metricsDetailedWindowTtlMs = Math.floor(metricsDetailedWindowTtlMs);
      if (stryMutAct_9fa48("83974") ? false : stryMutAct_9fa48("83973") ? true : (stryCov_9fa48("83973", "83974"), this.metricsDetailedWindowEnabled)) {
        if (stryMutAct_9fa48("83975")) {
          {}
        } else {
          stryCov_9fa48("83975");
          this.metricsDetailedWindowExpiresAtMs = stryMutAct_9fa48("83976") ? Date.now() - this.metricsDetailedWindowTtlMs : (stryCov_9fa48("83976"), Date.now() + this.metricsDetailedWindowTtlMs);
        }
      }
      return stryMutAct_9fa48("83977") ? false : (stryCov_9fa48("83977"), true);
    }
  }

  /**
   * Enable or disable detailed Tier-B metrics emission window.
   * @param {boolean} metricsDetailedWindowEnabled
   * @return {boolean} True when the update was applied.
   */
  setMetricsDetailedWindowEnabled(metricsDetailedWindowEnabled) {
    if (stryMutAct_9fa48("83978")) {
      {}
    } else {
      stryCov_9fa48("83978");
      if (stryMutAct_9fa48("83981") ? typeof metricsDetailedWindowEnabled === 'boolean' : stryMutAct_9fa48("83980") ? false : stryMutAct_9fa48("83979") ? true : (stryCov_9fa48("83979", "83980", "83981"), typeof metricsDetailedWindowEnabled !== (stryMutAct_9fa48("83982") ? "" : (stryCov_9fa48("83982"), 'boolean')))) {
        if (stryMutAct_9fa48("83983")) {
          {}
        } else {
          stryCov_9fa48("83983");
          return stryMutAct_9fa48("83984") ? true : (stryCov_9fa48("83984"), false);
        }
      }
      this.metricsDetailedWindowEnabled = metricsDetailedWindowEnabled;
      if (stryMutAct_9fa48("83986") ? false : stryMutAct_9fa48("83985") ? true : (stryCov_9fa48("83985", "83986"), metricsDetailedWindowEnabled)) {
        if (stryMutAct_9fa48("83987")) {
          {}
        } else {
          stryCov_9fa48("83987");
          this.metricsDetailedWindowExpiresAtMs = stryMutAct_9fa48("83988") ? Date.now() - this.metricsDetailedWindowTtlMs : (stryCov_9fa48("83988"), Date.now() + this.metricsDetailedWindowTtlMs);
        }
      } else {
        if (stryMutAct_9fa48("83989")) {
          {}
        } else {
          stryCov_9fa48("83989");
          this.metricsDetailedWindowExpiresAtMs = null;
        }
      }
      return stryMutAct_9fa48("83990") ? false : (stryCov_9fa48("83990"), true);
    }
  }

  /**
   * Shutdown the logging service.
   * Flushes any pending logs and releases resources.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("83991")) {
      {}
    } else {
      stryCov_9fa48("83991");
      if (stryMutAct_9fa48("83994") ? this.logger || typeof this.logger.flush === 'function' : stryMutAct_9fa48("83993") ? false : stryMutAct_9fa48("83992") ? true : (stryCov_9fa48("83992", "83993", "83994"), this.logger && (stryMutAct_9fa48("83996") ? typeof this.logger.flush !== 'function' : stryMutAct_9fa48("83995") ? true : (stryCov_9fa48("83995", "83996"), typeof this.logger.flush === (stryMutAct_9fa48("83997") ? "" : (stryCov_9fa48("83997"), 'function')))))) {
        if (stryMutAct_9fa48("83998")) {
          {}
        } else {
          stryCov_9fa48("83998");
          this.logger.flush();
        }
      }
      this.initialized = stryMutAct_9fa48("83999") ? true : (stryCov_9fa48("83999"), false);
    }
  }
}
export { LoggingService, LOG_LEVELS };