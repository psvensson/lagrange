/**
 * Straggler Detector - Detects slow partitions and triggers mitigation.
 * Implements straggler detection based on median latency threshold.
 * Requirements: 26.7, 26.10, 26.11
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
import { SERVICE_STATUS, STRING } from '../../constants/index.js';
import { QUERY_CONFIG_KEY, QUERY_DEFAULTS, QUERY_LOG_MSG, QUERY_SUBSYSTEM } from '../query-constants.js';
const MIN_COMPLETIONS_FOR_MEDIAN = 2;
const MEDIAN_DIVISOR = 2;
const PARITY_MODULUS = 2;
const NO_LATENCY_MS = 0;

/**
 * Shared logger initializer for query subsystems.
 * @param {string} subsystem - Subsystem name for the logger.
 * @return {Object} Logger instance or console fallback.
 */
function initQueryLogger(subsystem) {
  if (stryMutAct_9fa48("112674")) {
    {}
  } else {
    stryCov_9fa48("112674");
    try {
      if (stryMutAct_9fa48("112675")) {
        {}
      } else {
        stryCov_9fa48("112675");
        const loggingService = LoggingService.getInstance();
        if (stryMutAct_9fa48("112677") ? false : stryMutAct_9fa48("112676") ? true : (stryCov_9fa48("112676", "112677"), loggingService.isInitialized())) {
          if (stryMutAct_9fa48("112678")) {
            {}
          } else {
            stryCov_9fa48("112678");
            return loggingService.forSubsystem(subsystem);
          }
        }
      }
    } catch (logErr) {
      if (stryMutAct_9fa48("112679")) {
        {}
      } else {
        stryCov_9fa48("112679");
        console.warn(QUERY_LOG_MSG.INIT_LOGGER_FAILED, logErr);
      }
    }
    return console;
  }
}

/**
 * StragglerDetector monitors partition query latencies and detects
 * slow partitions that exceed the threshold (> 2× median latency).
 */
class StragglerDetector {
  /**
   * Create a new straggler detector.
   * @param {Object} options - Configuration options.
   * @param {number} options.thresholdMultiplier - Multiplier for median latency threshold.
   * @param {Function} options.onStragglerDetected - Callback when straggler is detected.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("112680")) {
      {}
    } else {
      stryCov_9fa48("112680");
      this.logger = initQueryLogger(QUERY_SUBSYSTEM.STRAGGLER_DETECTOR);

      // Load configuration
      const config = ConfigurationManager.getInstance();
      this.thresholdMultiplier = stryMutAct_9fa48("112683") ? (options.thresholdMultiplier || config.get(QUERY_CONFIG_KEY.COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER)) && QUERY_DEFAULTS.COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER : stryMutAct_9fa48("112682") ? false : stryMutAct_9fa48("112681") ? true : (stryCov_9fa48("112681", "112682", "112683"), (stryMutAct_9fa48("112685") ? options.thresholdMultiplier && config.get(QUERY_CONFIG_KEY.COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER) : stryMutAct_9fa48("112684") ? false : (stryCov_9fa48("112684", "112685"), options.thresholdMultiplier || config.get(QUERY_CONFIG_KEY.COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER))) || QUERY_DEFAULTS.COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER);
      this.onStragglerDetected = stryMutAct_9fa48("112688") ? options.onStragglerDetected && null : stryMutAct_9fa48("112687") ? false : stryMutAct_9fa48("112686") ? true : (stryCov_9fa48("112686", "112687", "112688"), options.onStragglerDetected || null);

      // Track latencies for median calculation
      this.latencies = new Map(); // partitionId -> latencyMs
      this.completedCount = 0;
      this.detectedStragglers = new Set();
    }
  }

  /**
   * Record a partition query completion.
   * @param {string} partitionId - Partition ID.
   * @param {number} latencyMs - Query latency in milliseconds.
   */
  recordCompletion(partitionId, latencyMs) {
    if (stryMutAct_9fa48("112689")) {
      {}
    } else {
      stryCov_9fa48("112689");
      this.latencies.set(partitionId, latencyMs);
      stryMutAct_9fa48("112690") ? this.completedCount-- : (stryCov_9fa48("112690"), this.completedCount++);
    }
  }

  /**
   * Calculate the median latency of completed queries.
   * @return {number} Median latency in milliseconds.
   */
  getMedianLatency() {
    if (stryMutAct_9fa48("112691")) {
      {}
    } else {
      stryCov_9fa48("112691");
      const values = stryMutAct_9fa48("112692") ? Array.from(this.latencies.values()) : (stryCov_9fa48("112692"), Array.from(this.latencies.values()).sort(stryMutAct_9fa48("112693") ? () => undefined : (stryCov_9fa48("112693"), (a, b) => stryMutAct_9fa48("112694") ? a + b : (stryCov_9fa48("112694"), a - b))));
      if (stryMutAct_9fa48("112697") ? values.length !== 0 : stryMutAct_9fa48("112696") ? false : stryMutAct_9fa48("112695") ? true : (stryCov_9fa48("112695", "112696", "112697"), values.length === 0)) return NO_LATENCY_MS;
      const mid = Math.floor(stryMutAct_9fa48("112698") ? values.length * MEDIAN_DIVISOR : (stryCov_9fa48("112698"), values.length / MEDIAN_DIVISOR));
      return (stryMutAct_9fa48("112701") ? values.length % PARITY_MODULUS !== 0 : stryMutAct_9fa48("112700") ? false : stryMutAct_9fa48("112699") ? true : (stryCov_9fa48("112699", "112700", "112701"), (stryMutAct_9fa48("112702") ? values.length * PARITY_MODULUS : (stryCov_9fa48("112702"), values.length % PARITY_MODULUS)) === 0)) ? stryMutAct_9fa48("112703") ? (values[mid - 1] + values[mid]) * MEDIAN_DIVISOR : (stryCov_9fa48("112703"), (stryMutAct_9fa48("112704") ? values[mid - 1] - values[mid] : (stryCov_9fa48("112704"), values[stryMutAct_9fa48("112705") ? mid + 1 : (stryCov_9fa48("112705"), mid - 1)] + values[mid])) / MEDIAN_DIVISOR) : values[mid];
    }
  }

  /**
   * Get the straggler threshold based on current median.
   * @return {number} Threshold latency in milliseconds.
   */
  getStragglerThreshold() {
    if (stryMutAct_9fa48("112706")) {
      {}
    } else {
      stryCov_9fa48("112706");
      return stryMutAct_9fa48("112707") ? this.getMedianLatency() / this.thresholdMultiplier : (stryCov_9fa48("112707"), this.getMedianLatency() * this.thresholdMultiplier);
    }
  }

  /**
   * Check if a partition is a straggler based on elapsed time.
   * Requirements: 26.10
   * @param {string} partitionId - Partition ID.
   * @param {number} elapsedMs - Elapsed time since query start.
   * @return {boolean} True if partition is a straggler.
   */
  isStraggler(partitionId, elapsedMs) {
    if (stryMutAct_9fa48("112708")) {
      {}
    } else {
      stryCov_9fa48("112708");
      // Need at least some completed queries to calculate median
      if (stryMutAct_9fa48("112712") ? this.completedCount >= MIN_COMPLETIONS_FOR_MEDIAN : stryMutAct_9fa48("112711") ? this.completedCount <= MIN_COMPLETIONS_FOR_MEDIAN : stryMutAct_9fa48("112710") ? false : stryMutAct_9fa48("112709") ? true : (stryCov_9fa48("112709", "112710", "112711", "112712"), this.completedCount < MIN_COMPLETIONS_FOR_MEDIAN)) return stryMutAct_9fa48("112713") ? true : (stryCov_9fa48("112713"), false);
      const threshold = this.getStragglerThreshold();
      if (stryMutAct_9fa48("112716") ? threshold !== NO_LATENCY_MS : stryMutAct_9fa48("112715") ? false : stryMutAct_9fa48("112714") ? true : (stryCov_9fa48("112714", "112715", "112716"), threshold === NO_LATENCY_MS)) return stryMutAct_9fa48("112717") ? true : (stryCov_9fa48("112717"), false);
      const isStraggler = stryMutAct_9fa48("112721") ? elapsedMs <= threshold : stryMutAct_9fa48("112720") ? elapsedMs >= threshold : stryMutAct_9fa48("112719") ? false : stryMutAct_9fa48("112718") ? true : (stryCov_9fa48("112718", "112719", "112720", "112721"), elapsedMs > threshold);
      if (stryMutAct_9fa48("112724") ? isStraggler || !this.detectedStragglers.has(partitionId) : stryMutAct_9fa48("112723") ? false : stryMutAct_9fa48("112722") ? true : (stryCov_9fa48("112722", "112723", "112724"), isStraggler && (stryMutAct_9fa48("112725") ? this.detectedStragglers.has(partitionId) : (stryCov_9fa48("112725"), !this.detectedStragglers.has(partitionId))))) {
        if (stryMutAct_9fa48("112726")) {
          {}
        } else {
          stryCov_9fa48("112726");
          this.detectedStragglers.add(partitionId);
          this.logStragglerDetected(partitionId, elapsedMs, threshold);
          if (stryMutAct_9fa48("112728") ? false : stryMutAct_9fa48("112727") ? true : (stryCov_9fa48("112727", "112728"), this.onStragglerDetected)) {
            if (stryMutAct_9fa48("112729")) {
              {}
            } else {
              stryCov_9fa48("112729");
              this.onStragglerDetected(partitionId, elapsedMs, threshold);
            }
          }
        }
      }
      return isStraggler;
    }
  }

  /**
   * Log straggler detection.
   * Requirements: 26.7
   * @param {string} partitionId - Partition ID.
   * @param {number} elapsedMs - Elapsed time.
   * @param {number} threshold - Threshold that was exceeded.
   * @private
   */
  logStragglerDetected(partitionId, elapsedMs, threshold) {
    if (stryMutAct_9fa48("112730")) {
      {}
    } else {
      stryCov_9fa48("112730");
      this.logger.warn(QUERY_LOG_MSG.STRAGGLER_DETECTED, stryMutAct_9fa48("112731") ? {} : (stryCov_9fa48("112731"), {
        partitionId,
        elapsedMs,
        medianLatencyMs: this.getMedianLatency(),
        thresholdMs: threshold,
        thresholdMultiplier: this.thresholdMultiplier,
        completedPartitions: this.completedCount
      }));
    }
  }

  /**
   * Analyze final results and identify all stragglers.
   * @param {Map} partitionLatencies - Map of partitionId to latencyMs.
   * @return {Array} Array of straggler partition IDs.
   */
  analyzeResults(partitionLatencies) {
    if (stryMutAct_9fa48("112732")) {
      {}
    } else {
      stryCov_9fa48("112732");
      const stragglers = stryMutAct_9fa48("112733") ? ["Stryker was here"] : (stryCov_9fa48("112733"), []);
      const threshold = this.getStragglerThreshold();
      if (stryMutAct_9fa48("112736") ? threshold !== NO_LATENCY_MS : stryMutAct_9fa48("112735") ? false : stryMutAct_9fa48("112734") ? true : (stryCov_9fa48("112734", "112735", "112736"), threshold === NO_LATENCY_MS)) return stragglers;
      for (const [partitionId, latencyMs] of partitionLatencies) {
        if (stryMutAct_9fa48("112737")) {
          {}
        } else {
          stryCov_9fa48("112737");
          if (stryMutAct_9fa48("112741") ? latencyMs <= threshold : stryMutAct_9fa48("112740") ? latencyMs >= threshold : stryMutAct_9fa48("112739") ? false : stryMutAct_9fa48("112738") ? true : (stryCov_9fa48("112738", "112739", "112740", "112741"), latencyMs > threshold)) {
            if (stryMutAct_9fa48("112742")) {
              {}
            } else {
              stryCov_9fa48("112742");
              stragglers.push(stryMutAct_9fa48("112743") ? {} : (stryCov_9fa48("112743"), {
                partitionId,
                latencyMs,
                medianLatencyMs: this.getMedianLatency(),
                thresholdMs: threshold,
                excessMs: stryMutAct_9fa48("112744") ? latencyMs + threshold : (stryCov_9fa48("112744"), latencyMs - threshold)
              }));
            }
          }
        }
      }

      // Sort by excess latency (worst stragglers first)
      stryMutAct_9fa48("112745") ? stragglers : (stryCov_9fa48("112745"), stragglers.sort(stryMutAct_9fa48("112746") ? () => undefined : (stryCov_9fa48("112746"), (a, b) => stryMutAct_9fa48("112747") ? b.excessMs + a.excessMs : (stryCov_9fa48("112747"), b.excessMs - a.excessMs))));
      return stragglers;
    }
  }

  /**
   * Get statistics about detected stragglers.
   * @return {Object} Straggler statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("112748")) {
      {}
    } else {
      stryCov_9fa48("112748");
      return stryMutAct_9fa48("112749") ? {} : (stryCov_9fa48("112749"), {
        completedCount: this.completedCount,
        medianLatencyMs: this.getMedianLatency(),
        thresholdMs: this.getStragglerThreshold(),
        thresholdMultiplier: this.thresholdMultiplier,
        detectedStragglerCount: this.detectedStragglers.size,
        detectedStragglers: Array.from(this.detectedStragglers)
      });
    }
  }

  /**
   * Reset the detector for a new query.
   */
  reset() {
    if (stryMutAct_9fa48("112750")) {
      {}
    } else {
      stryCov_9fa48("112750");
      this.latencies.clear();
      this.completedCount = 0;
      this.detectedStragglers.clear();
    }
  }
}

/**
 * SpeculativeExecutor handles speculative execution on alternative replicas.
 * When a straggler is detected, it starts a parallel query on a different replica.
 * Requirements: 26.11
 */
class SpeculativeExecutor {
  /**
   * Create a new speculative executor.
   * @param {Object} options - Configuration options.
   * @param {Object} options.replicaRegistry - Registry of replica services.
   * @param {number} options.delayMs - Delay before starting speculative execution.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("112751")) {
      {}
    } else {
      stryCov_9fa48("112751");
      this.logger = initQueryLogger(QUERY_SUBSYSTEM.SPECULATIVE_EXECUTOR);
      this.replicaRegistry = stryMutAct_9fa48("112754") ? options.replicaRegistry && new Map() : stryMutAct_9fa48("112753") ? false : stryMutAct_9fa48("112752") ? true : (stryCov_9fa48("112752", "112753", "112754"), options.replicaRegistry || new Map());
      const config = ConfigurationManager.getInstance();
      this.delayMs = stryMutAct_9fa48("112757") ? (options.delayMs || config.get(QUERY_CONFIG_KEY.COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS)) && QUERY_DEFAULTS.COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS : stryMutAct_9fa48("112756") ? false : stryMutAct_9fa48("112755") ? true : (stryCov_9fa48("112755", "112756", "112757"), (stryMutAct_9fa48("112759") ? options.delayMs && config.get(QUERY_CONFIG_KEY.COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS) : stryMutAct_9fa48("112758") ? false : (stryCov_9fa48("112758", "112759"), options.delayMs || config.get(QUERY_CONFIG_KEY.COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS))) || QUERY_DEFAULTS.COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS);
      this.enabled = stryMutAct_9fa48("112762") ? config.get(QUERY_CONFIG_KEY.COORDINATOR_SPECULATIVE_EXECUTION_ENABLED) === false : stryMutAct_9fa48("112761") ? false : stryMutAct_9fa48("112760") ? true : (stryCov_9fa48("112760", "112761", "112762"), config.get(QUERY_CONFIG_KEY.COORDINATOR_SPECULATIVE_EXECUTION_ENABLED) !== (stryMutAct_9fa48("112763") ? true : (stryCov_9fa48("112763"), false)));

      // Track active speculative executions
      this.activeExecutions = new Map(); // partitionId -> {promise, abortController}
      this.executionCount = 0;
    }
  }

  /**
   * Set the replica registry.
   * @param {Map|Object} registry - Replica registry.
   */
  setReplicaRegistry(registry) {
    if (stryMutAct_9fa48("112764")) {
      {}
    } else {
      stryCov_9fa48("112764");
      this.replicaRegistry = registry;
    }
  }

  /**
   * Get alternative replicas for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {Array} Array of replica services.
   * @private
   */
  getAlternativeReplicas(partitionId) {
    if (stryMutAct_9fa48("112765")) {
      {}
    } else {
      stryCov_9fa48("112765");
      let replicas;
      if (stryMutAct_9fa48("112767") ? false : stryMutAct_9fa48("112766") ? true : (stryCov_9fa48("112766", "112767"), this.replicaRegistry instanceof Map)) {
        if (stryMutAct_9fa48("112768")) {
          {}
        } else {
          stryCov_9fa48("112768");
          replicas = this.replicaRegistry.get(partitionId);
        }
      } else {
        if (stryMutAct_9fa48("112769")) {
          {}
        } else {
          stryCov_9fa48("112769");
          replicas = this.replicaRegistry[partitionId];
        }
      }
      return stryMutAct_9fa48("112770") ? replicas || [] : (stryCov_9fa48("112770"), (stryMutAct_9fa48("112773") ? replicas && [] : stryMutAct_9fa48("112772") ? false : stryMutAct_9fa48("112771") ? true : (stryCov_9fa48("112771", "112772", "112773"), replicas || (stryMutAct_9fa48("112774") ? ["Stryker was here"] : (stryCov_9fa48("112774"), [])))).filter(stryMutAct_9fa48("112775") ? () => undefined : (stryCov_9fa48("112775"), r => stryMutAct_9fa48("112778") ? r.status === SERVICE_STATUS.ACTIVE && r.status === undefined : stryMutAct_9fa48("112777") ? false : stryMutAct_9fa48("112776") ? true : (stryCov_9fa48("112776", "112777", "112778"), (stryMutAct_9fa48("112780") ? r.status !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("112779") ? false : (stryCov_9fa48("112779", "112780"), r.status === SERVICE_STATUS.ACTIVE)) || (stryMutAct_9fa48("112782") ? r.status !== undefined : stryMutAct_9fa48("112781") ? false : (stryCov_9fa48("112781", "112782"), r.status === undefined))))));
    }
  }

  /**
   * Start speculative execution for a straggler partition.
   * Requirements: 26.11
   * @param {string} partitionId - Partition ID.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {Function} executeQuery - Function to execute query on a service.
   * @return {Promise|null} Speculative execution promise or null if not possible.
   */
  startSpeculativeExecution(partitionId, sql, params, executeQuery) {
    if (stryMutAct_9fa48("112783")) {
      {}
    } else {
      stryCov_9fa48("112783");
      if (stryMutAct_9fa48("112786") ? false : stryMutAct_9fa48("112785") ? true : stryMutAct_9fa48("112784") ? this.enabled : (stryCov_9fa48("112784", "112785", "112786"), !this.enabled)) return null;

      // Don't start duplicate speculative executions
      if (stryMutAct_9fa48("112788") ? false : stryMutAct_9fa48("112787") ? true : (stryCov_9fa48("112787", "112788"), this.activeExecutions.has(partitionId))) {
        if (stryMutAct_9fa48("112789")) {
          {}
        } else {
          stryCov_9fa48("112789");
          return this.activeExecutions.get(partitionId).promise;
        }
      }
      const replicas = this.getAlternativeReplicas(partitionId);
      if (stryMutAct_9fa48("112792") ? replicas.length !== 0 : stryMutAct_9fa48("112791") ? false : stryMutAct_9fa48("112790") ? true : (stryCov_9fa48("112790", "112791", "112792"), replicas.length === 0)) {
        if (stryMutAct_9fa48("112793")) {
          {}
        } else {
          stryCov_9fa48("112793");
          this.logger.debug(QUERY_LOG_MSG.NO_ALTERNATIVE_REPLICAS, stryMutAct_9fa48("112794") ? {} : (stryCov_9fa48("112794"), {
            partitionId
          }));
          return null;
        }
      }

      // Select a replica (prefer one that's not the primary)
      const replica = replicas[0];
      this.logger.debug(QUERY_LOG_MSG.SPECULATIVE_EXEC_START, stryMutAct_9fa48("112795") ? {} : (stryCov_9fa48("112795"), {
        partitionId,
        replicaId: stryMutAct_9fa48("112798") ? replica.replicaId && STRING.UNKNOWN : stryMutAct_9fa48("112797") ? false : stryMutAct_9fa48("112796") ? true : (stryCov_9fa48("112796", "112797", "112798"), replica.replicaId || STRING.UNKNOWN)
      }));
      stryMutAct_9fa48("112799") ? this.executionCount-- : (stryCov_9fa48("112799"), this.executionCount++);
      const abortController = stryMutAct_9fa48("112800") ? {} : (stryCov_9fa48("112800"), {
        aborted: stryMutAct_9fa48("112801") ? true : (stryCov_9fa48("112801"), false)
      });
      const promise = this.executeSpeculative(partitionId, replica, sql, params, executeQuery, abortController);
      this.activeExecutions.set(partitionId, stryMutAct_9fa48("112802") ? {} : (stryCov_9fa48("112802"), {
        promise,
        abortController
      }));
      return promise;
    }
  }

  /**
   * Execute speculative query.
   * @param {string} partitionId - Partition ID.
   * @param {Object} replica - Replica service.
   * @param {string} sql - SQL query.
   * @param {Array} params - Query parameters.
   * @param {Function} executeQuery - Function to execute query.
   * @param {Object} abortController - Abort controller.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSpeculative(partitionId, replica, sql, params, executeQuery, abortController) {
    if (stryMutAct_9fa48("112803")) {
      {}
    } else {
      stryCov_9fa48("112803");
      try {
        if (stryMutAct_9fa48("112804")) {
          {}
        } else {
          stryCov_9fa48("112804");
          // Small delay before starting speculative execution
          await new Promise(stryMutAct_9fa48("112805") ? () => undefined : (stryCov_9fa48("112805"), resolve => setTimeout(resolve, this.delayMs)));
          if (stryMutAct_9fa48("112807") ? false : stryMutAct_9fa48("112806") ? true : (stryCov_9fa48("112806", "112807"), abortController.aborted)) {
            if (stryMutAct_9fa48("112808")) {
              {}
            } else {
              stryCov_9fa48("112808");
              return stryMutAct_9fa48("112809") ? {} : (stryCov_9fa48("112809"), {
                partitionId,
                success: stryMutAct_9fa48("112810") ? true : (stryCov_9fa48("112810"), false),
                aborted: stryMutAct_9fa48("112811") ? false : (stryCov_9fa48("112811"), true),
                rows: stryMutAct_9fa48("112812") ? ["Stryker was here"] : (stryCov_9fa48("112812"), [])
              });
            }
          }
          const result = await executeQuery(replica, sql, params);
          return stryMutAct_9fa48("112813") ? {} : (stryCov_9fa48("112813"), {
            partitionId,
            success: stryMutAct_9fa48("112814") ? false : (stryCov_9fa48("112814"), true),
            rows: stryMutAct_9fa48("112817") ? result.rows && [] : stryMutAct_9fa48("112816") ? false : stryMutAct_9fa48("112815") ? true : (stryCov_9fa48("112815", "112816", "112817"), result.rows || (stryMutAct_9fa48("112818") ? ["Stryker was here"] : (stryCov_9fa48("112818"), []))),
            changes: result.changes,
            speculative: stryMutAct_9fa48("112819") ? false : (stryCov_9fa48("112819"), true)
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("112820")) {
          {}
        } else {
          stryCov_9fa48("112820");
          this.logger.debug(QUERY_LOG_MSG.SPECULATIVE_EXEC_FAILED, stryMutAct_9fa48("112821") ? {} : (stryCov_9fa48("112821"), {
            partitionId,
            error: error.message
          }));
          return stryMutAct_9fa48("112822") ? {} : (stryCov_9fa48("112822"), {
            partitionId,
            success: stryMutAct_9fa48("112823") ? true : (stryCov_9fa48("112823"), false),
            error: error.message,
            rows: stryMutAct_9fa48("112824") ? ["Stryker was here"] : (stryCov_9fa48("112824"), []),
            speculative: stryMutAct_9fa48("112825") ? false : (stryCov_9fa48("112825"), true)
          });
        }
      } finally {
        if (stryMutAct_9fa48("112826")) {
          {}
        } else {
          stryCov_9fa48("112826");
          this.activeExecutions.delete(partitionId);
        }
      }
    }
  }

  /**
   * Cancel speculative execution for a partition.
   * @param {string} partitionId - Partition ID.
   */
  cancelExecution(partitionId) {
    if (stryMutAct_9fa48("112827")) {
      {}
    } else {
      stryCov_9fa48("112827");
      const execution = this.activeExecutions.get(partitionId);
      if (stryMutAct_9fa48("112829") ? false : stryMutAct_9fa48("112828") ? true : (stryCov_9fa48("112828", "112829"), execution)) {
        if (stryMutAct_9fa48("112830")) {
          {}
        } else {
          stryCov_9fa48("112830");
          execution.abortController.aborted = stryMutAct_9fa48("112831") ? false : (stryCov_9fa48("112831"), true);
          this.activeExecutions.delete(partitionId);
        }
      }
    }
  }

  /**
   * Cancel all active speculative executions.
   */
  cancelAll() {
    if (stryMutAct_9fa48("112832")) {
      {}
    } else {
      stryCov_9fa48("112832");
      for (const [partitionId, execution] of this.activeExecutions) {
        if (stryMutAct_9fa48("112833")) {
          {}
        } else {
          stryCov_9fa48("112833");
          execution.abortController.aborted = stryMutAct_9fa48("112834") ? false : (stryCov_9fa48("112834"), true);
          this.activeExecutions.delete(partitionId);
        }
      }
    }
  }

  /**
   * Get statistics about speculative executions.
   * @return {Object} Execution statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("112835")) {
      {}
    } else {
      stryCov_9fa48("112835");
      return stryMutAct_9fa48("112836") ? {} : (stryCov_9fa48("112836"), {
        enabled: this.enabled,
        delayMs: this.delayMs,
        totalExecutions: this.executionCount,
        activeExecutions: this.activeExecutions.size
      });
    }
  }

  /**
   * Reset the executor for a new query.
   */
  reset() {
    if (stryMutAct_9fa48("112837")) {
      {}
    } else {
      stryCov_9fa48("112837");
      this.cancelAll();
      this.executionCount = 0;
    }
  }
}
export { StragglerDetector, SpeculativeExecutor };