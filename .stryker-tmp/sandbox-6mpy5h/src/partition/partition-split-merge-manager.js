/**
 * Partition Split/Merge Manager - Handles partition splitting and merging operations.
 * Implements split at median PRIMARY KEY and merge of adjacent partitions.
 * Requirements: 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 20.4, 20.8, 20.9, 31.7, 31.8, 31.9,
 *               31.10, 31.12, 31.13, 31.14, 31.15
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
import { v4 as uuidv4 } from 'uuid';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { LoggingService } from '../logging/logging-service.js';
import { NUM, SERVICE_TYPE } from '../constants/index.js';
import { PARTITION_TRANSITION_STATE, PARTITION_SUBSYSTEM, SPLIT_MERGE_DEFAULT, SPLIT_MERGE_ERROR_MSG, SPLIT_MERGE_EVENT, SPLIT_MERGE_ID, SPLIT_MERGE_LOG_MSG, SPLIT_MERGE_REASON, SPLIT_MERGE_SQL, SPLIT_MERGE_STATE } from './partition-constants.js';
import { ADMISSION_DECISION, STORAGE_CAPACITY_CONFIG_KEY, STORAGE_CAPACITY_DEFAULT } from '../rebalancer/storage-capacity-constants.js';
import { PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor } from '../control-plane/pressure-governor.js';
import { KeyRange } from './key-range-manager.js';
const OperationState = SPLIT_MERGE_STATE;
const DEFAULT_SPLIT_STORAGE_THRESHOLD = SPLIT_MERGE_DEFAULT.SPLIT_STORAGE_THRESHOLD_BYTES;
const DEFAULT_SPLIT_TRAFFIC_THRESHOLD = SPLIT_MERGE_DEFAULT.SPLIT_TRAFFIC_THRESHOLD_QPM;
const DEFAULT_MERGE_STORAGE_THRESHOLD = SPLIT_MERGE_DEFAULT.MERGE_STORAGE_THRESHOLD_BYTES;
const DEFAULT_MERGE_TRAFFIC_THRESHOLD = SPLIT_MERGE_DEFAULT.MERGE_TRAFFIC_THRESHOLD_QPM;
const DEFAULT_EVALUATION_INTERVAL_MS = SPLIT_MERGE_DEFAULT.EVALUATION_INTERVAL_MS;
const DEFAULT_MAX_AUTO_EXECUTE_SPLITS_PER_EVALUATION = 1;
const DEFAULT_REACTIVE_EVALUATION_DEBOUNCE_MS = 1000;
const DEFAULT_EVALUATION_TRIGGER = stryMutAct_9fa48("106045") ? "" : (stryCov_9fa48("106045"), 'direct_call');
const REACTIVE_EVALUATION_TRIGGER = stryMutAct_9fa48("106046") ? "" : (stryCov_9fa48("106046"), 'reactive_request');
const PERIODIC_EVALUATION_TRIGGER = stryMutAct_9fa48("106047") ? "" : (stryCov_9fa48("106047"), 'periodic_timer');

/**
 * Clone one list of string-like values into a stable diagnostics array.
 * @param {Array<*>} values
 * @return {Array<string>}
 */
function cloneStringArray(values) {
  if (stryMutAct_9fa48("106048")) {
    {}
  } else {
    stryCov_9fa48("106048");
    if (stryMutAct_9fa48("106051") ? false : stryMutAct_9fa48("106050") ? true : stryMutAct_9fa48("106049") ? Array.isArray(values) : (stryCov_9fa48("106049", "106050", "106051"), !Array.isArray(values))) {
      if (stryMutAct_9fa48("106052")) {
        {}
      } else {
        stryCov_9fa48("106052");
        return stryMutAct_9fa48("106053") ? ["Stryker was here"] : (stryCov_9fa48("106053"), []);
      }
    }
    const cloned = stryMutAct_9fa48("106054") ? ["Stryker was here"] : (stryCov_9fa48("106054"), []);
    for (const value of values) {
      if (stryMutAct_9fa48("106055")) {
        {}
      } else {
        stryCov_9fa48("106055");
        const normalizedValue = String(stryMutAct_9fa48("106058") ? value && '' : stryMutAct_9fa48("106057") ? false : stryMutAct_9fa48("106056") ? true : (stryCov_9fa48("106056", "106057", "106058"), value || (stryMutAct_9fa48("106059") ? "Stryker was here!" : (stryCov_9fa48("106059"), ''))));
        if (stryMutAct_9fa48("106062") ? !normalizedValue && cloned.includes(normalizedValue) : stryMutAct_9fa48("106061") ? false : stryMutAct_9fa48("106060") ? true : (stryCov_9fa48("106060", "106061", "106062"), (stryMutAct_9fa48("106063") ? normalizedValue : (stryCov_9fa48("106063"), !normalizedValue)) || cloned.includes(normalizedValue))) {
          if (stryMutAct_9fa48("106064")) {
            {}
          } else {
            stryCov_9fa48("106064");
            continue;
          }
        }
        cloned.push(normalizedValue);
      }
    }
    return cloned;
  }
}

/**
 * PartitionSplitMergeManager handles automatic partition splitting and merging
 * based on storage and traffic thresholds.
 */
class PartitionSplitMergeManager extends EventEmitter {
  /**
   * Create a new PartitionSplitMergeManager.
   * @param {Object} options - Configuration options.
   * @param {Object} options.keyRangeManager - KeyRangeManager instance.
   * @param {Function} options.getPartitionMetrics - Function to get partition metrics.
   * @param {Object} options.tablePolicyService - TablePolicyService for policy lookup.
   * @param {Function} options.createPartition - Function to create a new partition.
   * @param {Function} options.deletePartition - Function to delete a partition.
   */
  /**
     * Create a new PartitionSplitMergeManager.
     * @param {Object} options - Configuration options.
     * @param {Object} options.keyRangeManager - KeyRangeManager instance.
     * @param {Function} options.getPartitionMetrics - Function to get metrics.
     * @param {Object} options.tablePolicyService - TablePolicyService instance.
     * @param {Function} options.createPartition - Create a new partition.
     * @param {Function} options.deletePartition - Delete a partition.
     * @param {Object} [options.storageAdmissionService] - Admission gate.
     * @param {Object} [options.storageAccountingService] - Accounting owner.
     */
  constructor(options = {}) {
    if (stryMutAct_9fa48("106065")) {
      {}
    } else {
      stryCov_9fa48("106065");
      super();
      this.keyRangeManager = stryMutAct_9fa48("106068") ? options.keyRangeManager && null : stryMutAct_9fa48("106067") ? false : stryMutAct_9fa48("106066") ? true : (stryCov_9fa48("106066", "106067", "106068"), options.keyRangeManager || null);
      this.getPartitionMetrics = stryMutAct_9fa48("106071") ? options.getPartitionMetrics && (() => ({})) : stryMutAct_9fa48("106070") ? false : stryMutAct_9fa48("106069") ? true : (stryCov_9fa48("106069", "106070", "106071"), options.getPartitionMetrics || (stryMutAct_9fa48("106072") ? () => undefined : (stryCov_9fa48("106072"), () => ({}))));
      this.listPartitions = stryMutAct_9fa48("106075") ? options.listPartitions && null : stryMutAct_9fa48("106074") ? false : stryMutAct_9fa48("106073") ? true : (stryCov_9fa48("106073", "106074", "106075"), options.listPartitions || null);
      this.tablePolicyService = stryMutAct_9fa48("106078") ? options.tablePolicyService && null : stryMutAct_9fa48("106077") ? false : stryMutAct_9fa48("106076") ? true : (stryCov_9fa48("106076", "106077", "106078"), options.tablePolicyService || null);
      this.createPartition = stryMutAct_9fa48("106081") ? options.createPartition && (() => {}) : stryMutAct_9fa48("106080") ? false : stryMutAct_9fa48("106079") ? true : (stryCov_9fa48("106079", "106080", "106081"), options.createPartition || (() => {}));
      this.deletePartition = stryMutAct_9fa48("106084") ? options.deletePartition && (() => {}) : stryMutAct_9fa48("106083") ? false : stryMutAct_9fa48("106082") ? true : (stryCov_9fa48("106082", "106083", "106084"), options.deletePartition || (() => {}));
      this.executeSplitCandidate = stryMutAct_9fa48("106087") ? options.executeSplitCandidate && null : stryMutAct_9fa48("106086") ? false : stryMutAct_9fa48("106085") ? true : (stryCov_9fa48("106085", "106086", "106087"), options.executeSplitCandidate || null);
      this.executeMergeCandidate = stryMutAct_9fa48("106090") ? options.executeMergeCandidate && null : stryMutAct_9fa48("106089") ? false : stryMutAct_9fa48("106088") ? true : (stryCov_9fa48("106088", "106089", "106090"), options.executeMergeCandidate || null);
      this.autoExecuteCandidates = stryMutAct_9fa48("106093") ? options.autoExecuteCandidates === false : stryMutAct_9fa48("106092") ? false : stryMutAct_9fa48("106091") ? true : (stryCov_9fa48("106091", "106092", "106093"), options.autoExecuteCandidates !== (stryMutAct_9fa48("106094") ? true : (stryCov_9fa48("106094"), false)));
      this.maxAutoExecuteSplitsPerEvaluation = (stryMutAct_9fa48("106097") ? Number.isInteger(options.maxAutoExecuteSplitsPerEvaluation) || options.maxAutoExecuteSplitsPerEvaluation >= NUM.ZERO : stryMutAct_9fa48("106096") ? false : stryMutAct_9fa48("106095") ? true : (stryCov_9fa48("106095", "106096", "106097"), Number.isInteger(options.maxAutoExecuteSplitsPerEvaluation) && (stryMutAct_9fa48("106100") ? options.maxAutoExecuteSplitsPerEvaluation < NUM.ZERO : stryMutAct_9fa48("106099") ? options.maxAutoExecuteSplitsPerEvaluation > NUM.ZERO : stryMutAct_9fa48("106098") ? true : (stryCov_9fa48("106098", "106099", "106100"), options.maxAutoExecuteSplitsPerEvaluation >= NUM.ZERO)))) ? options.maxAutoExecuteSplitsPerEvaluation : DEFAULT_MAX_AUTO_EXECUTE_SPLITS_PER_EVALUATION;
      this.storageAdmissionService = stryMutAct_9fa48("106103") ? options.storageAdmissionService && null : stryMutAct_9fa48("106102") ? false : stryMutAct_9fa48("106101") ? true : (stryCov_9fa48("106101", "106102", "106103"), options.storageAdmissionService || null);
      this.storageAccountingService = stryMutAct_9fa48("106106") ? options.storageAccountingService && null : stryMutAct_9fa48("106105") ? false : stryMutAct_9fa48("106104") ? true : (stryCov_9fa48("106104", "106105", "106106"), options.storageAccountingService || null);
      this.nodeId = stryMutAct_9fa48("106109") ? options.nodeId && null : stryMutAct_9fa48("106108") ? false : stryMutAct_9fa48("106107") ? true : (stryCov_9fa48("106107", "106108", "106109"), options.nodeId || null);
      this.messageRouter = stryMutAct_9fa48("106112") ? options.messageRouter && null : stryMutAct_9fa48("106111") ? false : stryMutAct_9fa48("106110") ? true : (stryCov_9fa48("106110", "106111", "106112"), options.messageRouter || null);
      this.pressureGovernor = stryMutAct_9fa48("106115") ? options.pressureGovernor && null : stryMutAct_9fa48("106114") ? false : stryMutAct_9fa48("106113") ? true : (stryCov_9fa48("106113", "106114", "106115"), options.pressureGovernor || null);

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.splitStorageThreshold = stryMutAct_9fa48("106118") ? config.get(CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_BYTES) && SPLIT_MERGE_DEFAULT.SPLIT_STORAGE_THRESHOLD_BYTES : stryMutAct_9fa48("106117") ? false : stryMutAct_9fa48("106116") ? true : (stryCov_9fa48("106116", "106117", "106118"), config.get(CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_BYTES) || SPLIT_MERGE_DEFAULT.SPLIT_STORAGE_THRESHOLD_BYTES);
      this.splitTrafficThreshold = stryMutAct_9fa48("106121") ? config.get(CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_QPM) && SPLIT_MERGE_DEFAULT.SPLIT_TRAFFIC_THRESHOLD_QPM : stryMutAct_9fa48("106120") ? false : stryMutAct_9fa48("106119") ? true : (stryCov_9fa48("106119", "106120", "106121"), config.get(CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_QPM) || SPLIT_MERGE_DEFAULT.SPLIT_TRAFFIC_THRESHOLD_QPM);
      this.mergeStorageThreshold = stryMutAct_9fa48("106124") ? config.get(CONFIG_KEY.PARTITION_MERGE_THRESHOLD_BYTES) && SPLIT_MERGE_DEFAULT.MERGE_STORAGE_THRESHOLD_BYTES : stryMutAct_9fa48("106123") ? false : stryMutAct_9fa48("106122") ? true : (stryCov_9fa48("106122", "106123", "106124"), config.get(CONFIG_KEY.PARTITION_MERGE_THRESHOLD_BYTES) || SPLIT_MERGE_DEFAULT.MERGE_STORAGE_THRESHOLD_BYTES);
      this.mergeTrafficThreshold = stryMutAct_9fa48("106127") ? config.get(CONFIG_KEY.PARTITION_MERGE_THRESHOLD_QPM) && SPLIT_MERGE_DEFAULT.MERGE_TRAFFIC_THRESHOLD_QPM : stryMutAct_9fa48("106126") ? false : stryMutAct_9fa48("106125") ? true : (stryCov_9fa48("106125", "106126", "106127"), config.get(CONFIG_KEY.PARTITION_MERGE_THRESHOLD_QPM) || SPLIT_MERGE_DEFAULT.MERGE_TRAFFIC_THRESHOLD_QPM);
      this.evaluationIntervalMs = stryMutAct_9fa48("106130") ? config.get(CONFIG_KEY.PARTITION_EVALUATION_INTERVAL_MS) && SPLIT_MERGE_DEFAULT.EVALUATION_INTERVAL_MS : stryMutAct_9fa48("106129") ? false : stryMutAct_9fa48("106128") ? true : (stryCov_9fa48("106128", "106129", "106130"), config.get(CONFIG_KEY.PARTITION_EVALUATION_INTERVAL_MS) || SPLIT_MERGE_DEFAULT.EVALUATION_INTERVAL_MS);
      this.splitAmplificationFactor = this.getNumericConfig(config, STORAGE_CAPACITY_CONFIG_KEY.SPLIT_AMPLIFICATION_FACTOR, STORAGE_CAPACITY_DEFAULT.SPLIT_AMPLIFICATION_FACTOR);

      // State
      this.state = OperationState.IDLE;
      this.evaluationTimer = null;
      this.allowManagedSplitDuringEvaluation = stryMutAct_9fa48("106131") ? true : (stryCov_9fa48("106131"), false);
      this.reactiveEvaluationDebounceMs = (stryMutAct_9fa48("106134") ? Number.isInteger(options.reactiveEvaluationDebounceMs) || options.reactiveEvaluationDebounceMs >= NUM.ZERO : stryMutAct_9fa48("106133") ? false : stryMutAct_9fa48("106132") ? true : (stryCov_9fa48("106132", "106133", "106134"), Number.isInteger(options.reactiveEvaluationDebounceMs) && (stryMutAct_9fa48("106137") ? options.reactiveEvaluationDebounceMs < NUM.ZERO : stryMutAct_9fa48("106136") ? options.reactiveEvaluationDebounceMs > NUM.ZERO : stryMutAct_9fa48("106135") ? true : (stryCov_9fa48("106135", "106136", "106137"), options.reactiveEvaluationDebounceMs >= NUM.ZERO)))) ? options.reactiveEvaluationDebounceMs : DEFAULT_REACTIVE_EVALUATION_DEBOUNCE_MS;
      this.requestedEvaluation = null;
      this.requestedEvaluationTimer = null;
      this.requestedEvaluationDueAtMs = null;
      this.deferredRetryEvaluation = null;
      this.deferredRetryEvaluationDueAtMs = null;
      this.deferredRetryEvaluationTimer = null;
      this.isShutdown = stryMutAct_9fa48("106138") ? true : (stryCov_9fa48("106138"), false);
      this.lastEvaluationRequestedAtMs = null;
      this.lastEvaluationStartedAtMs = null;
      this.lastEvaluationCompletedAtMs = null;
      this.lastEvaluationDurationMs = null;
      this.lastEvaluationError = null;
      this.lastEvaluationSummary = null;
      this.lastEvaluationTrigger = null;
      this.lastEvaluationReasonCodes = stryMutAct_9fa48("106139") ? ["Stryker was here"] : (stryCov_9fa48("106139"), []);
      this.lastEvaluationPartitionIds = stryMutAct_9fa48("106140") ? ["Stryker was here"] : (stryCov_9fa48("106140"), []);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(PARTITION_SUBSYSTEM.SPLIT_MERGE) : console;
    }
  }

  /**
   * Resolve the shared pressure-governor owner for this node.
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (stryMutAct_9fa48("106141")) {
      {}
    } else {
      stryCov_9fa48("106141");
      if (stryMutAct_9fa48("106143") ? false : stryMutAct_9fa48("106142") ? true : (stryCov_9fa48("106142", "106143"), this.pressureGovernor)) {
        if (stryMutAct_9fa48("106144")) {
          {}
        } else {
          stryCov_9fa48("106144");
          stryMutAct_9fa48("106145") ? this.pressureGovernor.configure({
            messageRouter: this.messageRouter
          }) : (stryCov_9fa48("106145"), this.pressureGovernor.configure?.(stryMutAct_9fa48("106146") ? {} : (stryCov_9fa48("106146"), {
            messageRouter: this.messageRouter
          })));
          return this.pressureGovernor;
        }
      }
      this.pressureGovernor = PressureGovernor.getShared(stryMutAct_9fa48("106147") ? {} : (stryCov_9fa48("106147"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter
      }));
      return this.pressureGovernor;
    }
  }

  /**
   * Evaluate seed-local background split work against the canonical governor.
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  evaluateSplitPressure(options = {}) {
    if (stryMutAct_9fa48("106148")) {
      {}
    } else {
      stryCov_9fa48("106148");
      return this.getPressureGovernor().evaluate(stryMutAct_9fa48("106149") ? {} : (stryCov_9fa48("106149"), {
        workClass: stryMutAct_9fa48("106152") ? options.workClass && PRESSURE_WORK_CLASS.BACKGROUND : stryMutAct_9fa48("106151") ? false : stryMutAct_9fa48("106150") ? true : (stryCov_9fa48("106150", "106151", "106152"), options.workClass || PRESSURE_WORK_CLASS.BACKGROUND),
        resourceKeys: stryMutAct_9fa48("106153") ? [] : (stryCov_9fa48("106153"), [stryMutAct_9fa48("106154") ? "" : (stryCov_9fa48("106154"), 'partition:split:evaluation'), stryMutAct_9fa48("106155") ? "" : (stryCov_9fa48("106155"), 'control-plane:write')]),
        allowDegrade: stryMutAct_9fa48("106156") ? true : (stryCov_9fa48("106156"), false),
        allowDefer: stryMutAct_9fa48("106157") ? false : (stryCov_9fa48("106157"), true),
        retryAfterMs: options.retryAfterMs
      }));
    }
  }

  /**
   * Build a typed split execution deferral caused by node-local pressure.
   * @param {string} partitionId
   * @param {Object} decision
   * @return {Object}
   * @private
   */
  buildPressureDeferredExecution(partitionId, decision) {
    if (stryMutAct_9fa48("106158")) {
      {}
    } else {
      stryCov_9fa48("106158");
      const retryAfterMs = Number.isFinite(stryMutAct_9fa48("106159") ? decision.retryAfterMs : (stryCov_9fa48("106159"), decision?.retryAfterMs)) ? decision.retryAfterMs : NUM.ZERO;
      const nextAttemptAt = (stryMutAct_9fa48("106163") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("106162") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("106161") ? false : stryMutAct_9fa48("106160") ? true : (stryCov_9fa48("106160", "106161", "106162", "106163"), retryAfterMs > NUM.ZERO)) ? new Date(stryMutAct_9fa48("106164") ? Date.now() - retryAfterMs : (stryCov_9fa48("106164"), Date.now() + retryAfterMs)).toISOString() : null;
      return stryMutAct_9fa48("106165") ? {} : (stryCov_9fa48("106165"), {
        success: stryMutAct_9fa48("106166") ? true : (stryCov_9fa48("106166"), false),
        partitionId,
        state: PARTITION_TRANSITION_STATE.DEFERRED,
        error: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE,
        retryScheduled: stryMutAct_9fa48("106169") ? nextAttemptAt === null : stryMutAct_9fa48("106168") ? false : stryMutAct_9fa48("106167") ? true : (stryCov_9fa48("106167", "106168", "106169"), nextAttemptAt !== null),
        nextAttemptAt,
        retry: stryMutAct_9fa48("106170") ? {} : (stryCov_9fa48("106170"), {
          nextAttemptAt,
          backoffMs: retryAfterMs,
          scheduledState: PARTITION_TRANSITION_STATE.DEFERRED
        }),
        pressureAction: stryMutAct_9fa48("106173") ? decision?.action && null : stryMutAct_9fa48("106172") ? false : stryMutAct_9fa48("106171") ? true : (stryCov_9fa48("106171", "106172", "106173"), (stryMutAct_9fa48("106174") ? decision.action : (stryCov_9fa48("106174"), decision?.action)) || null),
        pressureSummary: stryMutAct_9fa48("106177") ? decision?.summary && null : stryMutAct_9fa48("106176") ? false : stryMutAct_9fa48("106175") ? true : (stryCov_9fa48("106175", "106176", "106177"), (stryMutAct_9fa48("106178") ? decision.summary : (stryCov_9fa48("106178"), decision?.summary)) || null)
      });
    }
  }

  /**
   * Get the table policy for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Object>} Table policy.
   */
  async getTablePolicy(partitionId) {
    if (stryMutAct_9fa48("106179")) {
      {}
    } else {
      stryCov_9fa48("106179");
      if (stryMutAct_9fa48("106181") ? false : stryMutAct_9fa48("106180") ? true : (stryCov_9fa48("106180", "106181"), this.tablePolicyService)) {
        if (stryMutAct_9fa48("106182")) {
          {}
        } else {
          stryCov_9fa48("106182");
          return this.tablePolicyService.getPolicyForPartition(partitionId);
        }
      }
      return {};
    }
  }

  /**
   * Resolve a numeric config value with fallback.
   * @param {Object} config - ConfigurationManager instance.
   * @param {string} key - Config key.
   * @param {number} fallback - Default value.
   * @return {number}
   * @private
   */
  getNumericConfig(config, key, fallback) {
    if (stryMutAct_9fa48("106183")) {
      {}
    } else {
      stryCov_9fa48("106183");
      const value = config.get(key);
      if (stryMutAct_9fa48("106186") ? typeof value === 'number' || Number.isFinite(value) : stryMutAct_9fa48("106185") ? false : stryMutAct_9fa48("106184") ? true : (stryCov_9fa48("106184", "106185", "106186"), (stryMutAct_9fa48("106188") ? typeof value !== 'number' : stryMutAct_9fa48("106187") ? true : (stryCov_9fa48("106187", "106188"), typeof value === (stryMutAct_9fa48("106189") ? "" : (stryCov_9fa48("106189"), 'number')))) && Number.isFinite(value))) {
        if (stryMutAct_9fa48("106190")) {
          {}
        } else {
          stryCov_9fa48("106190");
          return value;
        }
      }
      return fallback;
    }
  }

  /**
   * List partitions eligible for evaluation.
   * Falls back to KeyRangeManager partition IDs for legacy/unit-test paths.
   * @return {Promise<Array>} Partition descriptors or partition IDs.
   * @private
   */
  async loadEvaluationPartitions() {
    if (stryMutAct_9fa48("106191")) {
      {}
    } else {
      stryCov_9fa48("106191");
      if (stryMutAct_9fa48("106194") ? typeof this.listPartitions !== 'function' : stryMutAct_9fa48("106193") ? false : stryMutAct_9fa48("106192") ? true : (stryCov_9fa48("106192", "106193", "106194"), typeof this.listPartitions === (stryMutAct_9fa48("106195") ? "" : (stryCov_9fa48("106195"), 'function')))) {
        if (stryMutAct_9fa48("106196")) {
          {}
        } else {
          stryCov_9fa48("106196");
          const partitions = await this.listPartitions();
          return Array.isArray(partitions) ? partitions : stryMutAct_9fa48("106197") ? ["Stryker was here"] : (stryCov_9fa48("106197"), []);
        }
      }
      if (stryMutAct_9fa48("106200") ? false : stryMutAct_9fa48("106199") ? true : stryMutAct_9fa48("106198") ? this.keyRangeManager : (stryCov_9fa48("106198", "106199", "106200"), !this.keyRangeManager)) {
        if (stryMutAct_9fa48("106201")) {
          {}
        } else {
          stryCov_9fa48("106201");
          return stryMutAct_9fa48("106202") ? ["Stryker was here"] : (stryCov_9fa48("106202"), []);
        }
      }
      return this.keyRangeManager.getAllPartitions();
    }
  }

  /**
   * Normalize a partition identifier from either a string or row object.
   * @param {string|Object} partition - Partition descriptor.
   * @return {string|null} Partition ID.
   * @private
   */
  getPartitionId(partition) {
    if (stryMutAct_9fa48("106203")) {
      {}
    } else {
      stryCov_9fa48("106203");
      if (stryMutAct_9fa48("106206") ? typeof partition !== 'string' : stryMutAct_9fa48("106205") ? false : stryMutAct_9fa48("106204") ? true : (stryCov_9fa48("106204", "106205", "106206"), typeof partition === (stryMutAct_9fa48("106207") ? "" : (stryCov_9fa48("106207"), 'string')))) {
        if (stryMutAct_9fa48("106208")) {
          {}
        } else {
          stryCov_9fa48("106208");
          return partition;
        }
      }
      if (stryMutAct_9fa48("106211") ? !partition && typeof partition !== 'object' : stryMutAct_9fa48("106210") ? false : stryMutAct_9fa48("106209") ? true : (stryCov_9fa48("106209", "106210", "106211"), (stryMutAct_9fa48("106212") ? partition : (stryCov_9fa48("106212"), !partition)) || (stryMutAct_9fa48("106214") ? typeof partition === 'object' : stryMutAct_9fa48("106213") ? false : (stryCov_9fa48("106213", "106214"), typeof partition !== (stryMutAct_9fa48("106215") ? "" : (stryCov_9fa48("106215"), 'object')))))) {
        if (stryMutAct_9fa48("106216")) {
          {}
        } else {
          stryCov_9fa48("106216");
          return null;
        }
      }
      return stryMutAct_9fa48("106219") ? (partition.partition_id || partition.partitionId) && null : stryMutAct_9fa48("106218") ? false : stryMutAct_9fa48("106217") ? true : (stryCov_9fa48("106217", "106218", "106219"), (stryMutAct_9fa48("106221") ? partition.partition_id && partition.partitionId : stryMutAct_9fa48("106220") ? false : (stryCov_9fa48("106220", "106221"), partition.partition_id || partition.partitionId)) || null);
    }
  }

  /**
   * Resolve table ID for grouping partition rows.
   * @param {Object} partition - Partition descriptor.
   * @return {string|null} Table ID.
   * @private
   */
  getPartitionTableId(partition) {
    if (stryMutAct_9fa48("106222")) {
      {}
    } else {
      stryCov_9fa48("106222");
      if (stryMutAct_9fa48("106225") ? !partition && typeof partition !== 'object' : stryMutAct_9fa48("106224") ? false : stryMutAct_9fa48("106223") ? true : (stryCov_9fa48("106223", "106224", "106225"), (stryMutAct_9fa48("106226") ? partition : (stryCov_9fa48("106226"), !partition)) || (stryMutAct_9fa48("106228") ? typeof partition === 'object' : stryMutAct_9fa48("106227") ? false : (stryCov_9fa48("106227", "106228"), typeof partition !== (stryMutAct_9fa48("106229") ? "" : (stryCov_9fa48("106229"), 'object')))))) {
        if (stryMutAct_9fa48("106230")) {
          {}
        } else {
          stryCov_9fa48("106230");
          return null;
        }
      }
      return stryMutAct_9fa48("106233") ? (partition.table_id || partition.tableId) && null : stryMutAct_9fa48("106232") ? false : stryMutAct_9fa48("106231") ? true : (stryCov_9fa48("106231", "106232", "106233"), (stryMutAct_9fa48("106235") ? partition.table_id && partition.tableId : stryMutAct_9fa48("106234") ? false : (stryCov_9fa48("106234", "106235"), partition.table_id || partition.tableId)) || null);
    }
  }

  /**
   * Resolve partition sort start key for adjacency ordering.
   * @param {Object} partition - Partition descriptor.
   * @return {*} Start key.
   * @private
   */
  getPartitionStartKey(partition) {
    if (stryMutAct_9fa48("106236")) {
      {}
    } else {
      stryCov_9fa48("106236");
      if (stryMutAct_9fa48("106239") ? !partition && typeof partition !== 'object' : stryMutAct_9fa48("106238") ? false : stryMutAct_9fa48("106237") ? true : (stryCov_9fa48("106237", "106238", "106239"), (stryMutAct_9fa48("106240") ? partition : (stryCov_9fa48("106240"), !partition)) || (stryMutAct_9fa48("106242") ? typeof partition === 'object' : stryMutAct_9fa48("106241") ? false : (stryCov_9fa48("106241", "106242"), typeof partition !== (stryMutAct_9fa48("106243") ? "" : (stryCov_9fa48("106243"), 'object')))))) {
        if (stryMutAct_9fa48("106244")) {
          {}
        } else {
          stryCov_9fa48("106244");
          return null;
        }
      }
      return stryMutAct_9fa48("106245") ? (partition.partition_key_start ?? partition.partitionKeyStart) && null : (stryCov_9fa48("106245"), (stryMutAct_9fa48("106246") ? partition.partition_key_start && partition.partitionKeyStart : (stryCov_9fa48("106246"), partition.partition_key_start ?? partition.partitionKeyStart)) ?? null);
    }
  }

  /**
   * Resolve partition sort end key for adjacency ordering.
   * @param {Object} partition - Partition descriptor.
   * @return {*} End key.
   * @private
   */
  getPartitionEndKey(partition) {
    if (stryMutAct_9fa48("106247")) {
      {}
    } else {
      stryCov_9fa48("106247");
      if (stryMutAct_9fa48("106250") ? !partition && typeof partition !== 'object' : stryMutAct_9fa48("106249") ? false : stryMutAct_9fa48("106248") ? true : (stryCov_9fa48("106248", "106249", "106250"), (stryMutAct_9fa48("106251") ? partition : (stryCov_9fa48("106251"), !partition)) || (stryMutAct_9fa48("106253") ? typeof partition === 'object' : stryMutAct_9fa48("106252") ? false : (stryCov_9fa48("106252", "106253"), typeof partition !== (stryMutAct_9fa48("106254") ? "" : (stryCov_9fa48("106254"), 'object')))))) {
        if (stryMutAct_9fa48("106255")) {
          {}
        } else {
          stryCov_9fa48("106255");
          return null;
        }
      }
      return stryMutAct_9fa48("106256") ? (partition.partition_key_end ?? partition.partitionKeyEnd) && null : (stryCov_9fa48("106256"), (stryMutAct_9fa48("106257") ? partition.partition_key_end && partition.partitionKeyEnd : (stryCov_9fa48("106257"), partition.partition_key_end ?? partition.partitionKeyEnd)) ?? null);
    }
  }

  /**
   * Compare partition key values with NULL representing unbounded edges.
   * @param {*} left - Left key.
   * @param {*} right - Right key.
   * @return {number} Sort order.
   * @private
   */
  comparePartitionKeys(left, right) {
    if (stryMutAct_9fa48("106258")) {
      {}
    } else {
      stryCov_9fa48("106258");
      if (stryMutAct_9fa48("106261") ? left !== right : stryMutAct_9fa48("106260") ? false : stryMutAct_9fa48("106259") ? true : (stryCov_9fa48("106259", "106260", "106261"), left === right)) {
        if (stryMutAct_9fa48("106262")) {
          {}
        } else {
          stryCov_9fa48("106262");
          return NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("106265") ? left === null && left === undefined : stryMutAct_9fa48("106264") ? false : stryMutAct_9fa48("106263") ? true : (stryCov_9fa48("106263", "106264", "106265"), (stryMutAct_9fa48("106267") ? left !== null : stryMutAct_9fa48("106266") ? false : (stryCov_9fa48("106266", "106267"), left === null)) || (stryMutAct_9fa48("106269") ? left !== undefined : stryMutAct_9fa48("106268") ? false : (stryCov_9fa48("106268", "106269"), left === undefined)))) {
        if (stryMutAct_9fa48("106270")) {
          {}
        } else {
          stryCov_9fa48("106270");
          return NUM.NEGATIVE_ONE;
        }
      }
      if (stryMutAct_9fa48("106273") ? right === null && right === undefined : stryMutAct_9fa48("106272") ? false : stryMutAct_9fa48("106271") ? true : (stryCov_9fa48("106271", "106272", "106273"), (stryMutAct_9fa48("106275") ? right !== null : stryMutAct_9fa48("106274") ? false : (stryCov_9fa48("106274", "106275"), right === null)) || (stryMutAct_9fa48("106277") ? right !== undefined : stryMutAct_9fa48("106276") ? false : (stryCov_9fa48("106276", "106277"), right === undefined)))) {
        if (stryMutAct_9fa48("106278")) {
          {}
        } else {
          stryCov_9fa48("106278");
          return NUM.ONE;
        }
      }
      if (stryMutAct_9fa48("106282") ? left >= right : stryMutAct_9fa48("106281") ? left <= right : stryMutAct_9fa48("106280") ? false : stryMutAct_9fa48("106279") ? true : (stryCov_9fa48("106279", "106280", "106281", "106282"), left < right)) {
        if (stryMutAct_9fa48("106283")) {
          {}
        } else {
          stryCov_9fa48("106283");
          return NUM.NEGATIVE_ONE;
        }
      }
      if (stryMutAct_9fa48("106287") ? left <= right : stryMutAct_9fa48("106286") ? left >= right : stryMutAct_9fa48("106285") ? false : stryMutAct_9fa48("106284") ? true : (stryCov_9fa48("106284", "106285", "106286", "106287"), left > right)) {
        if (stryMutAct_9fa48("106288")) {
          {}
        } else {
          stryCov_9fa48("106288");
          return NUM.ONE;
        }
      }
      return NUM.ZERO;
    }
  }

  /**
   * Normalize a key range from either a KeyRange or a plain object.
   * Treat omitted bounds as unbounded edges.
   * @param {KeyRange|Object|null} range - Range descriptor.
   * @return {KeyRange|null} Normalized range.
   * @private
   */
  normalizeKeyRange(range) {
    if (stryMutAct_9fa48("106289")) {
      {}
    } else {
      stryCov_9fa48("106289");
      if (stryMutAct_9fa48("106292") ? !range && typeof range !== 'object' : stryMutAct_9fa48("106291") ? false : stryMutAct_9fa48("106290") ? true : (stryCov_9fa48("106290", "106291", "106292"), (stryMutAct_9fa48("106293") ? range : (stryCov_9fa48("106293"), !range)) || (stryMutAct_9fa48("106295") ? typeof range === 'object' : stryMutAct_9fa48("106294") ? false : (stryCov_9fa48("106294", "106295"), typeof range !== (stryMutAct_9fa48("106296") ? "" : (stryCov_9fa48("106296"), 'object')))))) {
        if (stryMutAct_9fa48("106297")) {
          {}
        } else {
          stryCov_9fa48("106297");
          return null;
        }
      }
      if (stryMutAct_9fa48("106299") ? false : stryMutAct_9fa48("106298") ? true : (stryCov_9fa48("106298", "106299"), range instanceof KeyRange)) {
        if (stryMutAct_9fa48("106300")) {
          {}
        } else {
          stryCov_9fa48("106300");
          return range.clone();
        }
      }
      return new KeyRange(stryMutAct_9fa48("106301") ? range.start && null : (stryCov_9fa48("106301"), range.start ?? null), stryMutAct_9fa48("106302") ? range.end && null : (stryCov_9fa48("106302"), range.end ?? null));
    }
  }

  /**
   * Sort partition rows for merge adjacency checks.
   * @param {Array} partitions - Partition descriptors.
   * @return {Array<Object>} Sorted partition rows.
   * @private
   */
  sortEvaluationPartitions(partitions) {
    if (stryMutAct_9fa48("106303")) {
      {}
    } else {
      stryCov_9fa48("106303");
      return stryMutAct_9fa48("106305") ? [...partitions].sort((left, right) => {
        const tableOrder = this.comparePartitionKeys(this.getPartitionTableId(left), this.getPartitionTableId(right));
        if (tableOrder !== NUM.ZERO) {
          return tableOrder;
        }
        return this.comparePartitionKeys(this.getPartitionStartKey(left), this.getPartitionStartKey(right));
      }) : stryMutAct_9fa48("106304") ? [...partitions].filter(partition => partition && typeof partition === 'object') : (stryCov_9fa48("106304", "106305"), (stryMutAct_9fa48("106306") ? [] : (stryCov_9fa48("106306"), [...partitions])).filter(stryMutAct_9fa48("106307") ? () => undefined : (stryCov_9fa48("106307"), partition => stryMutAct_9fa48("106310") ? partition || typeof partition === 'object' : stryMutAct_9fa48("106309") ? false : stryMutAct_9fa48("106308") ? true : (stryCov_9fa48("106308", "106309", "106310"), partition && (stryMutAct_9fa48("106312") ? typeof partition !== 'object' : stryMutAct_9fa48("106311") ? true : (stryCov_9fa48("106311", "106312"), typeof partition === (stryMutAct_9fa48("106313") ? "" : (stryCov_9fa48("106313"), 'object'))))))).sort((left, right) => {
        if (stryMutAct_9fa48("106314")) {
          {}
        } else {
          stryCov_9fa48("106314");
          const tableOrder = this.comparePartitionKeys(this.getPartitionTableId(left), this.getPartitionTableId(right));
          if (stryMutAct_9fa48("106317") ? tableOrder === NUM.ZERO : stryMutAct_9fa48("106316") ? false : stryMutAct_9fa48("106315") ? true : (stryCov_9fa48("106315", "106316", "106317"), tableOrder !== NUM.ZERO)) {
            if (stryMutAct_9fa48("106318")) {
              {}
            } else {
              stryCov_9fa48("106318");
              return tableOrder;
            }
          }
          return this.comparePartitionKeys(this.getPartitionStartKey(left), this.getPartitionStartKey(right));
        }
      }));
    }
  }

  /**
   * Load metrics for a partition ID or row object.
   * @param {string|Object} partition - Partition descriptor.
   * @return {Promise<Object>} Metrics payload.
   * @private
   */
  async resolvePartitionMetrics(partition) {
    if (stryMutAct_9fa48("106319")) {
      {}
    } else {
      stryCov_9fa48("106319");
      const partitionId = this.getPartitionId(partition);
      const rawMetrics = partitionId ? await this.getPartitionMetrics(partitionId, partition) : {};
      const metrics = (stryMutAct_9fa48("106322") ? rawMetrics || typeof rawMetrics === 'object' : stryMutAct_9fa48("106321") ? false : stryMutAct_9fa48("106320") ? true : (stryCov_9fa48("106320", "106321", "106322"), rawMetrics && (stryMutAct_9fa48("106324") ? typeof rawMetrics !== 'object' : stryMutAct_9fa48("106323") ? true : (stryCov_9fa48("106323", "106324"), typeof rawMetrics === (stryMutAct_9fa48("106325") ? "" : (stryCov_9fa48("106325"), 'object')))))) ? stryMutAct_9fa48("106326") ? {} : (stryCov_9fa48("106326"), {
        ...rawMetrics
      }) : {};
      if (stryMutAct_9fa48("106329") ? (metrics.sizeBytes === undefined || metrics.sizeBytes === null) && partition || typeof partition === 'object' : stryMutAct_9fa48("106328") ? false : stryMutAct_9fa48("106327") ? true : (stryCov_9fa48("106327", "106328", "106329"), (stryMutAct_9fa48("106331") ? metrics.sizeBytes === undefined || metrics.sizeBytes === null || partition : stryMutAct_9fa48("106330") ? true : (stryCov_9fa48("106330", "106331"), (stryMutAct_9fa48("106333") ? metrics.sizeBytes === undefined && metrics.sizeBytes === null : stryMutAct_9fa48("106332") ? true : (stryCov_9fa48("106332", "106333"), (stryMutAct_9fa48("106335") ? metrics.sizeBytes !== undefined : stryMutAct_9fa48("106334") ? false : (stryCov_9fa48("106334", "106335"), metrics.sizeBytes === undefined)) || (stryMutAct_9fa48("106337") ? metrics.sizeBytes !== null : stryMutAct_9fa48("106336") ? false : (stryCov_9fa48("106336", "106337"), metrics.sizeBytes === null)))) && partition)) && (stryMutAct_9fa48("106339") ? typeof partition !== 'object' : stryMutAct_9fa48("106338") ? true : (stryCov_9fa48("106338", "106339"), typeof partition === (stryMutAct_9fa48("106340") ? "" : (stryCov_9fa48("106340"), 'object')))))) {
        if (stryMutAct_9fa48("106341")) {
          {}
        } else {
          stryCov_9fa48("106341");
          const sizeBytes = Number(stryMutAct_9fa48("106342") ? (partition.size_bytes ?? partition.sizeBytes) && NUM.ZERO : (stryCov_9fa48("106342"), (stryMutAct_9fa48("106343") ? partition.size_bytes && partition.sizeBytes : (stryCov_9fa48("106343"), partition.size_bytes ?? partition.sizeBytes)) ?? NUM.ZERO));
          metrics.sizeBytes = Number.isFinite(sizeBytes) ? sizeBytes : NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("106346") ? metrics.queriesPerMinute === undefined && metrics.queriesPerMinute === null : stryMutAct_9fa48("106345") ? false : stryMutAct_9fa48("106344") ? true : (stryCov_9fa48("106344", "106345", "106346"), (stryMutAct_9fa48("106348") ? metrics.queriesPerMinute !== undefined : stryMutAct_9fa48("106347") ? false : (stryCov_9fa48("106347", "106348"), metrics.queriesPerMinute === undefined)) || (stryMutAct_9fa48("106350") ? metrics.queriesPerMinute !== null : stryMutAct_9fa48("106349") ? false : (stryCov_9fa48("106349", "106350"), metrics.queriesPerMinute === null)))) {
        if (stryMutAct_9fa48("106351")) {
          {}
        } else {
          stryCov_9fa48("106351");
          metrics.queriesPerMinute = NUM.ZERO;
        }
      }
      return metrics;
    }
  }

  /**
   * Execute one split candidate when a runtime owner is provided.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Object|null>} Execution result.
   * @private
   */
  async executeManagedSplitCandidate(partitionId) {
    if (stryMutAct_9fa48("106352")) {
      {}
    } else {
      stryCov_9fa48("106352");
      if (stryMutAct_9fa48("106355") ? (!partitionId || !this.autoExecuteCandidates) && typeof this.executeSplitCandidate !== 'function' : stryMutAct_9fa48("106354") ? false : stryMutAct_9fa48("106353") ? true : (stryCov_9fa48("106353", "106354", "106355"), (stryMutAct_9fa48("106357") ? !partitionId && !this.autoExecuteCandidates : stryMutAct_9fa48("106356") ? false : (stryCov_9fa48("106356", "106357"), (stryMutAct_9fa48("106358") ? partitionId : (stryCov_9fa48("106358"), !partitionId)) || (stryMutAct_9fa48("106359") ? this.autoExecuteCandidates : (stryCov_9fa48("106359"), !this.autoExecuteCandidates)))) || (stryMutAct_9fa48("106361") ? typeof this.executeSplitCandidate === 'function' : stryMutAct_9fa48("106360") ? false : (stryCov_9fa48("106360", "106361"), typeof this.executeSplitCandidate !== (stryMutAct_9fa48("106362") ? "" : (stryCov_9fa48("106362"), 'function')))))) {
        if (stryMutAct_9fa48("106363")) {
          {}
        } else {
          stryCov_9fa48("106363");
          return null;
        }
      }
      const pressureDecision = this.evaluateSplitPressure();
      if (stryMutAct_9fa48("106366") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("106365") ? false : stryMutAct_9fa48("106364") ? true : (stryCov_9fa48("106364", "106365", "106366"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER)) {
        if (stryMutAct_9fa48("106367")) {
          {}
        } else {
          stryCov_9fa48("106367");
          return this.buildPressureDeferredExecution(partitionId, pressureDecision);
        }
      }
      this.allowManagedSplitDuringEvaluation = stryMutAct_9fa48("106368") ? false : (stryCov_9fa48("106368"), true);
      try {
        if (stryMutAct_9fa48("106369")) {
          {}
        } else {
          stryCov_9fa48("106369");
          return await this.executeSplitCandidate(partitionId);
        }
      } finally {
        if (stryMutAct_9fa48("106370")) {
          {}
        } else {
          stryCov_9fa48("106370");
          this.allowManagedSplitDuringEvaluation = stryMutAct_9fa48("106371") ? true : (stryCov_9fa48("106371"), false);
        }
      }
    }
  }

  /**
   * Determine how one managed split execution should be classified.
   * @param {Object|null} execution - Managed split execution result.
   * @return {string} Outcome bucket: executed, deferred, or error.
   * @private
   */
  classifyManagedSplitExecution(execution) {
    if (stryMutAct_9fa48("106372")) {
      {}
    } else {
      stryCov_9fa48("106372");
      if (stryMutAct_9fa48("106375") ? !execution && execution.success === true : stryMutAct_9fa48("106374") ? false : stryMutAct_9fa48("106373") ? true : (stryCov_9fa48("106373", "106374", "106375"), (stryMutAct_9fa48("106376") ? execution : (stryCov_9fa48("106376"), !execution)) || (stryMutAct_9fa48("106378") ? execution.success !== true : stryMutAct_9fa48("106377") ? false : (stryCov_9fa48("106377", "106378"), execution.success === (stryMutAct_9fa48("106379") ? false : (stryCov_9fa48("106379"), true)))))) {
        if (stryMutAct_9fa48("106380")) {
          {}
        } else {
          stryCov_9fa48("106380");
          return stryMutAct_9fa48("106381") ? "" : (stryCov_9fa48("106381"), 'executed');
        }
      }
      const state = stryMutAct_9fa48("106382") ? String(execution.state || '').toUpperCase() : (stryCov_9fa48("106382"), String(stryMutAct_9fa48("106385") ? execution.state && '' : stryMutAct_9fa48("106384") ? false : stryMutAct_9fa48("106383") ? true : (stryCov_9fa48("106383", "106384", "106385"), execution.state || (stryMutAct_9fa48("106386") ? "Stryker was here!" : (stryCov_9fa48("106386"), '')))).toLowerCase());
      if (stryMutAct_9fa48("106389") ? state === PARTITION_TRANSITION_STATE.BLOCKED && state === PARTITION_TRANSITION_STATE.DEFERRED : stryMutAct_9fa48("106388") ? false : stryMutAct_9fa48("106387") ? true : (stryCov_9fa48("106387", "106388", "106389"), (stryMutAct_9fa48("106391") ? state !== PARTITION_TRANSITION_STATE.BLOCKED : stryMutAct_9fa48("106390") ? false : (stryCov_9fa48("106390", "106391"), state === PARTITION_TRANSITION_STATE.BLOCKED)) || (stryMutAct_9fa48("106393") ? state !== PARTITION_TRANSITION_STATE.DEFERRED : stryMutAct_9fa48("106392") ? false : (stryCov_9fa48("106392", "106393"), state === PARTITION_TRANSITION_STATE.DEFERRED)))) {
        if (stryMutAct_9fa48("106394")) {
          {}
        } else {
          stryCov_9fa48("106394");
          return stryMutAct_9fa48("106395") ? "" : (stryCov_9fa48("106395"), 'deferred');
        }
      }
      return stryMutAct_9fa48("106396") ? "" : (stryCov_9fa48("106396"), 'error');
    }
  }

  /**
   * Resolve a stable error message for a managed split execution.
   * @param {Object} execution - Managed split execution result.
   * @return {string} Error message.
   * @private
   */
  resolveManagedSplitExecutionError(execution) {
    if (stryMutAct_9fa48("106397")) {
      {}
    } else {
      stryCov_9fa48("106397");
      if (stryMutAct_9fa48("106400") ? typeof execution?.error === 'string' || execution.error.length > 0 : stryMutAct_9fa48("106399") ? false : stryMutAct_9fa48("106398") ? true : (stryCov_9fa48("106398", "106399", "106400"), (stryMutAct_9fa48("106402") ? typeof execution?.error !== 'string' : stryMutAct_9fa48("106401") ? true : (stryCov_9fa48("106401", "106402"), typeof (stryMutAct_9fa48("106403") ? execution.error : (stryCov_9fa48("106403"), execution?.error)) === (stryMutAct_9fa48("106404") ? "" : (stryCov_9fa48("106404"), 'string')))) && (stryMutAct_9fa48("106407") ? execution.error.length <= 0 : stryMutAct_9fa48("106406") ? execution.error.length >= 0 : stryMutAct_9fa48("106405") ? true : (stryCov_9fa48("106405", "106406", "106407"), execution.error.length > 0)))) {
        if (stryMutAct_9fa48("106408")) {
          {}
        } else {
          stryCov_9fa48("106408");
          return execution.error;
        }
      }
      return SPLIT_MERGE_ERROR_MSG.MANAGED_SPLIT_EXECUTION_FAILED;
    }
  }

  /**
   * Resolve one deferred managed-split retry timestamp from execution output.
   * @param {Object} execution - Managed split execution result.
   * @return {number|null} Epoch milliseconds for next retry, or null.
   * @private
   */
  resolveManagedSplitExecutionRetryDueAtMs(execution) {
    if (stryMutAct_9fa48("106409")) {
      {}
    } else {
      stryCov_9fa48("106409");
      const nextAttemptAt = String(stryMutAct_9fa48("106412") ? (execution?.retry?.nextAttemptAt || execution?.nextAttemptAt) && '' : stryMutAct_9fa48("106411") ? false : stryMutAct_9fa48("106410") ? true : (stryCov_9fa48("106410", "106411", "106412"), (stryMutAct_9fa48("106414") ? execution?.retry?.nextAttemptAt && execution?.nextAttemptAt : stryMutAct_9fa48("106413") ? false : (stryCov_9fa48("106413", "106414"), (stryMutAct_9fa48("106416") ? execution.retry?.nextAttemptAt : stryMutAct_9fa48("106415") ? execution?.retry.nextAttemptAt : (stryCov_9fa48("106415", "106416"), execution?.retry?.nextAttemptAt)) || (stryMutAct_9fa48("106417") ? execution.nextAttemptAt : (stryCov_9fa48("106417"), execution?.nextAttemptAt)))) || (stryMutAct_9fa48("106418") ? "Stryker was here!" : (stryCov_9fa48("106418"), ''))));
      if (stryMutAct_9fa48("106421") ? false : stryMutAct_9fa48("106420") ? true : stryMutAct_9fa48("106419") ? nextAttemptAt : (stryCov_9fa48("106419", "106420", "106421"), !nextAttemptAt)) {
        if (stryMutAct_9fa48("106422")) {
          {}
        } else {
          stryCov_9fa48("106422");
          return null;
        }
      }
      const retryDueAtMs = Date.parse(nextAttemptAt);
      return Number.isFinite(retryDueAtMs) ? retryDueAtMs : null;
    }
  }

  /**
   * Resolve a stable deferred-reason code for one managed split execution.
   * @param {Object} execution
   * @return {string}
   * @private
   */
  resolveManagedSplitExecutionDeferredReason(execution) {
    if (stryMutAct_9fa48("106423")) {
      {}
    } else {
      stryCov_9fa48("106423");
      if (stryMutAct_9fa48("106426") ? execution?.error !== SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE : stryMutAct_9fa48("106425") ? false : stryMutAct_9fa48("106424") ? true : (stryCov_9fa48("106424", "106425", "106426"), (stryMutAct_9fa48("106427") ? execution.error : (stryCov_9fa48("106427"), execution?.error)) === SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE)) {
        if (stryMutAct_9fa48("106428")) {
          {}
        } else {
          stryCov_9fa48("106428");
          return SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE;
        }
      }
      return stryMutAct_9fa48("106431") ? execution?.state && PARTITION_TRANSITION_STATE.DEFERRED : stryMutAct_9fa48("106430") ? false : stryMutAct_9fa48("106429") ? true : (stryCov_9fa48("106429", "106430", "106431"), (stryMutAct_9fa48("106432") ? execution.state : (stryCov_9fa48("106432"), execution?.state)) || PARTITION_TRANSITION_STATE.DEFERRED);
    }
  }

  /**
   * Flush deferred managed-split retry scheduling state and trigger
   * one reactive evaluation request.
   * @return {void}
   * @private
   */
  flushDeferredRetryEvaluation() {
    if (stryMutAct_9fa48("106433")) {
      {}
    } else {
      stryCov_9fa48("106433");
      const request = this.deferredRetryEvaluation;
      this.deferredRetryEvaluation = null;
      this.deferredRetryEvaluationDueAtMs = null;
      this.deferredRetryEvaluationTimer = null;
      this.requestEvaluation(stryMutAct_9fa48("106436") ? request && {
        reasonCode: SPLIT_MERGE_REASON.MANAGED_SPLIT_RETRY_DUE
      } : stryMutAct_9fa48("106435") ? false : stryMutAct_9fa48("106434") ? true : (stryCov_9fa48("106434", "106435", "106436"), request || (stryMutAct_9fa48("106437") ? {} : (stryCov_9fa48("106437"), {
        reasonCode: SPLIT_MERGE_REASON.MANAGED_SPLIT_RETRY_DUE
      }))));
    }
  }

  /**
   * Schedule a reactive evaluation when a deferred managed split becomes due.
   * @param {string} partitionId - Candidate partition ID.
   * @param {Object} execution - Managed split execution result.
   * @return {void}
   * @private
   */
  scheduleDeferredManagedSplitRetry(partitionId, execution) {
    if (stryMutAct_9fa48("106438")) {
      {}
    } else {
      stryCov_9fa48("106438");
      if (stryMutAct_9fa48("106440") ? false : stryMutAct_9fa48("106439") ? true : (stryCov_9fa48("106439", "106440"), this.isShutdown)) {
        if (stryMutAct_9fa48("106441")) {
          {}
        } else {
          stryCov_9fa48("106441");
          return;
        }
      }
      const retryDueAtMs = this.resolveManagedSplitExecutionRetryDueAtMs(execution);
      if (stryMutAct_9fa48("106444") ? false : stryMutAct_9fa48("106443") ? true : stryMutAct_9fa48("106442") ? Number.isFinite(retryDueAtMs) : (stryCov_9fa48("106442", "106443", "106444"), !Number.isFinite(retryDueAtMs))) {
        if (stryMutAct_9fa48("106445")) {
          {}
        } else {
          stryCov_9fa48("106445");
          return;
        }
      }
      const nowMs = Date.now();
      const normalizedDueAtMs = stryMutAct_9fa48("106446") ? Math.min(nowMs, retryDueAtMs) : (stryCov_9fa48("106446"), Math.max(nowMs, retryDueAtMs));
      this.deferredRetryEvaluation = this.mergeRequestedEvaluationContext(this.deferredRetryEvaluation, stryMutAct_9fa48("106447") ? {} : (stryCov_9fa48("106447"), {
        reasonCode: SPLIT_MERGE_REASON.MANAGED_SPLIT_RETRY_DUE,
        partitionId
      }));
      if (stryMutAct_9fa48("106450") ? this.deferredRetryEvaluationTimer && Number.isFinite(this.deferredRetryEvaluationDueAtMs) || this.deferredRetryEvaluationDueAtMs <= normalizedDueAtMs : stryMutAct_9fa48("106449") ? false : stryMutAct_9fa48("106448") ? true : (stryCov_9fa48("106448", "106449", "106450"), (stryMutAct_9fa48("106452") ? this.deferredRetryEvaluationTimer || Number.isFinite(this.deferredRetryEvaluationDueAtMs) : stryMutAct_9fa48("106451") ? true : (stryCov_9fa48("106451", "106452"), this.deferredRetryEvaluationTimer && Number.isFinite(this.deferredRetryEvaluationDueAtMs))) && (stryMutAct_9fa48("106455") ? this.deferredRetryEvaluationDueAtMs > normalizedDueAtMs : stryMutAct_9fa48("106454") ? this.deferredRetryEvaluationDueAtMs < normalizedDueAtMs : stryMutAct_9fa48("106453") ? true : (stryCov_9fa48("106453", "106454", "106455"), this.deferredRetryEvaluationDueAtMs <= normalizedDueAtMs)))) {
        if (stryMutAct_9fa48("106456")) {
          {}
        } else {
          stryCov_9fa48("106456");
          return;
        }
      }
      if (stryMutAct_9fa48("106458") ? false : stryMutAct_9fa48("106457") ? true : (stryCov_9fa48("106457", "106458"), this.deferredRetryEvaluationTimer)) {
        if (stryMutAct_9fa48("106459")) {
          {}
        } else {
          stryCov_9fa48("106459");
          clearTimeout(this.deferredRetryEvaluationTimer);
          this.deferredRetryEvaluationTimer = null;
        }
      }
      this.deferredRetryEvaluationDueAtMs = normalizedDueAtMs;
      const retryDelayMs = stryMutAct_9fa48("106460") ? Math.min(NUM.ZERO, normalizedDueAtMs - nowMs) : (stryCov_9fa48("106460"), Math.max(NUM.ZERO, stryMutAct_9fa48("106461") ? normalizedDueAtMs + nowMs : (stryCov_9fa48("106461"), normalizedDueAtMs - nowMs)));
      this.deferredRetryEvaluationTimer = setTimeout(() => {
        if (stryMutAct_9fa48("106462")) {
          {}
        } else {
          stryCov_9fa48("106462");
          this.flushDeferredRetryEvaluation();
        }
      }, retryDelayMs);
      stryMutAct_9fa48("106463") ? this.deferredRetryEvaluationTimer.unref() : (stryCov_9fa48("106463"), this.deferredRetryEvaluationTimer.unref?.());
    }
  }

  /**
   * Record one managed split execution in the canonical outcome bucket.
   * @param {Object} results - Evaluation results accumulator.
   * @param {string} partitionId - Candidate partition ID.
   * @param {Object|null} execution - Managed split execution result.
   * @private
   */
  recordManagedSplitExecutionOutcome(results, partitionId, execution) {
    if (stryMutAct_9fa48("106464")) {
      {}
    } else {
      stryCov_9fa48("106464");
      if (stryMutAct_9fa48("106467") ? false : stryMutAct_9fa48("106466") ? true : stryMutAct_9fa48("106465") ? execution : (stryCov_9fa48("106465", "106466", "106467"), !execution)) {
        if (stryMutAct_9fa48("106468")) {
          {}
        } else {
          stryCov_9fa48("106468");
          return;
        }
      }
      const outcome = this.classifyManagedSplitExecution(execution);
      if (stryMutAct_9fa48("106471") ? outcome !== 'executed' : stryMutAct_9fa48("106470") ? false : stryMutAct_9fa48("106469") ? true : (stryCov_9fa48("106469", "106470", "106471"), outcome === (stryMutAct_9fa48("106472") ? "" : (stryCov_9fa48("106472"), 'executed')))) {
        if (stryMutAct_9fa48("106473")) {
          {}
        } else {
          stryCov_9fa48("106473");
          results.executedSplits.push(execution);
          return;
        }
      }
      if (stryMutAct_9fa48("106476") ? outcome !== 'deferred' : stryMutAct_9fa48("106475") ? false : stryMutAct_9fa48("106474") ? true : (stryCov_9fa48("106474", "106475", "106476"), outcome === (stryMutAct_9fa48("106477") ? "" : (stryCov_9fa48("106477"), 'deferred')))) {
        if (stryMutAct_9fa48("106478")) {
          {}
        } else {
          stryCov_9fa48("106478");
          const deferredReason = this.resolveManagedSplitExecutionDeferredReason(execution);
          this.logger.warn(SPLIT_MERGE_LOG_MSG.SPLIT_EXECUTION_DEFERRED, stryMutAct_9fa48("106479") ? {} : (stryCov_9fa48("106479"), {
            partitionId,
            state: stryMutAct_9fa48("106482") ? execution.state && null : stryMutAct_9fa48("106481") ? false : stryMutAct_9fa48("106480") ? true : (stryCov_9fa48("106480", "106481", "106482"), execution.state || null),
            workflowId: stryMutAct_9fa48("106485") ? execution.workflowId && null : stryMutAct_9fa48("106484") ? false : stryMutAct_9fa48("106483") ? true : (stryCov_9fa48("106483", "106484", "106485"), execution.workflowId || null),
            error: stryMutAct_9fa48("106488") ? execution.error && null : stryMutAct_9fa48("106487") ? false : stryMutAct_9fa48("106486") ? true : (stryCov_9fa48("106486", "106487", "106488"), execution.error || null),
            retryScheduled: stryMutAct_9fa48("106491") ? execution.retryScheduled !== true : stryMutAct_9fa48("106490") ? false : stryMutAct_9fa48("106489") ? true : (stryCov_9fa48("106489", "106490", "106491"), execution.retryScheduled === (stryMutAct_9fa48("106492") ? false : (stryCov_9fa48("106492"), true))),
            nextAttemptAt: stryMutAct_9fa48("106495") ? (execution?.retry?.nextAttemptAt || execution?.nextAttemptAt) && null : stryMutAct_9fa48("106494") ? false : stryMutAct_9fa48("106493") ? true : (stryCov_9fa48("106493", "106494", "106495"), (stryMutAct_9fa48("106497") ? execution?.retry?.nextAttemptAt && execution?.nextAttemptAt : stryMutAct_9fa48("106496") ? false : (stryCov_9fa48("106496", "106497"), (stryMutAct_9fa48("106499") ? execution.retry?.nextAttemptAt : stryMutAct_9fa48("106498") ? execution?.retry.nextAttemptAt : (stryCov_9fa48("106498", "106499"), execution?.retry?.nextAttemptAt)) || (stryMutAct_9fa48("106500") ? execution.nextAttemptAt : (stryCov_9fa48("106500"), execution?.nextAttemptAt)))) || null),
            admissionDecisionType: stryMutAct_9fa48("106503") ? execution?.admission?.decisionType && null : stryMutAct_9fa48("106502") ? false : stryMutAct_9fa48("106501") ? true : (stryCov_9fa48("106501", "106502", "106503"), (stryMutAct_9fa48("106505") ? execution.admission?.decisionType : stryMutAct_9fa48("106504") ? execution?.admission.decisionType : (stryCov_9fa48("106504", "106505"), execution?.admission?.decisionType)) || null),
            admissionBlockingReasons: Array.isArray(stryMutAct_9fa48("106507") ? execution.admission?.blockingReasons : stryMutAct_9fa48("106506") ? execution?.admission.blockingReasons : (stryCov_9fa48("106506", "106507"), execution?.admission?.blockingReasons)) ? execution.admission.blockingReasons : stryMutAct_9fa48("106508") ? ["Stryker was here"] : (stryCov_9fa48("106508"), [])
          }));
          results.splitDeferred.push(stryMutAct_9fa48("106509") ? {} : (stryCov_9fa48("106509"), {
            partitionId,
            reason: deferredReason,
            execution
          }));
          this.scheduleDeferredManagedSplitRetry(partitionId, execution);
          this.emit(SPLIT_MERGE_EVENT.SPLIT_DEFERRED, stryMutAct_9fa48("106510") ? {} : (stryCov_9fa48("106510"), {
            partitionId,
            reason: deferredReason
          }));
          return;
        }
      }
      const error = this.resolveManagedSplitExecutionError(execution);
      this.logger.error(SPLIT_MERGE_LOG_MSG.SPLIT_EXECUTION_FAILED, stryMutAct_9fa48("106511") ? {} : (stryCov_9fa48("106511"), {
        partitionId,
        error,
        state: stryMutAct_9fa48("106514") ? execution.state && null : stryMutAct_9fa48("106513") ? false : stryMutAct_9fa48("106512") ? true : (stryCov_9fa48("106512", "106513", "106514"), execution.state || null),
        workflowId: stryMutAct_9fa48("106517") ? execution.workflowId && null : stryMutAct_9fa48("106516") ? false : stryMutAct_9fa48("106515") ? true : (stryCov_9fa48("106515", "106516", "106517"), execution.workflowId || null)
      }));
      results.splitErrors.push(stryMutAct_9fa48("106518") ? {} : (stryCov_9fa48("106518"), {
        partitionId,
        error,
        state: stryMutAct_9fa48("106521") ? execution.state && null : stryMutAct_9fa48("106520") ? false : stryMutAct_9fa48("106519") ? true : (stryCov_9fa48("106519", "106520", "106521"), execution.state || null),
        workflowId: stryMutAct_9fa48("106524") ? execution.workflowId && null : stryMutAct_9fa48("106523") ? false : stryMutAct_9fa48("106522") ? true : (stryCov_9fa48("106522", "106523", "106524"), execution.workflowId || null)
      }));
    }
  }

  /**
   * Run capacity preflight for a split-derived replica creation.
   *
   * Estimates the bytes needed for the split (including write-
   * amplification reservation) and delegates to the admission
   * service. Returns a structured result with decision, reason,
   * and projected utilization.
   *
   * Requirements: 7.1, 7.2, 7.4, 7.5
   *
   * @param {string} partitionId - Partition being split.
   * @param {Object} metrics - Partition metrics with sizeBytes.
   * @param {string} targetNodeId - Node that would host the
   *   split-derived replica.
   * @return {Promise<Object>} Preflight result with
   *   {feasible, reason, admissionResult}.
   */
  async checkSplitCapacityPreflight(partitionId, metrics, targetNodeId) {
    if (stryMutAct_9fa48("106525")) {
      {}
    } else {
      stryCov_9fa48("106525");
      if (stryMutAct_9fa48("106528") ? !this.storageAdmissionService && !this.storageAccountingService : stryMutAct_9fa48("106527") ? false : stryMutAct_9fa48("106526") ? true : (stryCov_9fa48("106526", "106527", "106528"), (stryMutAct_9fa48("106529") ? this.storageAdmissionService : (stryCov_9fa48("106529"), !this.storageAdmissionService)) || (stryMutAct_9fa48("106530") ? this.storageAccountingService : (stryCov_9fa48("106530"), !this.storageAccountingService)))) {
        if (stryMutAct_9fa48("106531")) {
          {}
        } else {
          stryCov_9fa48("106531");
          throw new Error(SPLIT_MERGE_ERROR_MSG.SPLIT_PREFLIGHT_OWNER_REQUIRED);
        }
      }
      const sizeBytes = stryMutAct_9fa48("106534") ? metrics.sizeBytes && NUM.ZERO : stryMutAct_9fa48("106533") ? false : stryMutAct_9fa48("106532") ? true : (stryCov_9fa48("106532", "106533", "106534"), metrics.sizeBytes || NUM.ZERO);
      const estimatedBytes = this.storageAccountingService.estimateReplicaBytes(stryMutAct_9fa48("106535") ? {} : (stryCov_9fa48("106535"), {
        entityType: SERVICE_TYPE.PARTITION,
        sizeBytes,
        amplificationFactor: this.splitAmplificationFactor
      }));
      const admissionResult = await this.storageAdmissionService.checkSplit(stryMutAct_9fa48("106536") ? {} : (stryCov_9fa48("106536"), {
        targetNodeId,
        estimatedBytes
      }));
      const feasible = stryMutAct_9fa48("106539") ? admissionResult.decision !== ADMISSION_DECISION.ALLOW : stryMutAct_9fa48("106538") ? false : stryMutAct_9fa48("106537") ? true : (stryCov_9fa48("106537", "106538", "106539"), admissionResult.decision === ADMISSION_DECISION.ALLOW);
      this.logger.info(SPLIT_MERGE_LOG_MSG.SPLIT_CAPACITY_PREFLIGHT, stryMutAct_9fa48("106540") ? {} : (stryCov_9fa48("106540"), {
        partitionId,
        targetNodeId,
        sizeBytes,
        estimatedBytes,
        amplificationFactor: this.splitAmplificationFactor,
        decision: admissionResult.decision,
        reason: admissionResult.reason
      }));
      return stryMutAct_9fa48("106541") ? {} : (stryCov_9fa48("106541"), {
        feasible,
        reason: feasible ? SPLIT_MERGE_REASON.CAPACITY_AVAILABLE : SPLIT_MERGE_REASON.INSUFFICIENT_CAPACITY,
        admissionResult
      });
    }
  }

  /**
   * Calculate the median PRIMARY KEY value for a partition.
   * @param {string} partitionId - Partition ID.
   * @param {Object} partitionService - PartitionService instance.
   * @param {string} tableName - Table name.
   * @param {string} primaryKeyColumn - PRIMARY KEY column name.
   * @return {Promise<*>} Median key value.
   */
  async calculateMedianKey(partitionId, partitionService, tableName, primaryKeyColumn) {
    if (stryMutAct_9fa48("106542")) {
      {}
    } else {
      stryCov_9fa48("106542");
      if (stryMutAct_9fa48("106545") ? (!partitionService || !tableName) && !primaryKeyColumn : stryMutAct_9fa48("106544") ? false : stryMutAct_9fa48("106543") ? true : (stryCov_9fa48("106543", "106544", "106545"), (stryMutAct_9fa48("106547") ? !partitionService && !tableName : stryMutAct_9fa48("106546") ? false : (stryCov_9fa48("106546", "106547"), (stryMutAct_9fa48("106548") ? partitionService : (stryCov_9fa48("106548"), !partitionService)) || (stryMutAct_9fa48("106549") ? tableName : (stryCov_9fa48("106549"), !tableName)))) || (stryMutAct_9fa48("106550") ? primaryKeyColumn : (stryCov_9fa48("106550"), !primaryKeyColumn)))) {
        if (stryMutAct_9fa48("106551")) {
          {}
        } else {
          stryCov_9fa48("106551");
          throw new Error(SPLIT_MERGE_LOG_MSG.MISSING_MEDIAN_PARAMS);
        }
      }
      this.logger.debug(SPLIT_MERGE_LOG_MSG.CALCULATING_MEDIAN_KEY, stryMutAct_9fa48("106552") ? {} : (stryCov_9fa48("106552"), {
        partitionId,
        tableName,
        primaryKeyColumn
      }));

      // Get total count
      const countResult = await partitionService.executeQuery(SPLIT_MERGE_SQL.countRows(tableName));
      const totalRows = stryMutAct_9fa48("106555") ? countResult.rows[NUM.ZERO]?.total && NUM.ZERO : stryMutAct_9fa48("106554") ? false : stryMutAct_9fa48("106553") ? true : (stryCov_9fa48("106553", "106554", "106555"), (stryMutAct_9fa48("106556") ? countResult.rows[NUM.ZERO].total : (stryCov_9fa48("106556"), countResult.rows[NUM.ZERO]?.total)) || NUM.ZERO);
      if (stryMutAct_9fa48("106560") ? totalRows >= NUM.TWO : stryMutAct_9fa48("106559") ? totalRows <= NUM.TWO : stryMutAct_9fa48("106558") ? false : stryMutAct_9fa48("106557") ? true : (stryCov_9fa48("106557", "106558", "106559", "106560"), totalRows < NUM.TWO)) {
        if (stryMutAct_9fa48("106561")) {
          {}
        } else {
          stryCov_9fa48("106561");
          throw new Error(SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT);
        }
      }
      const medianOffset = Math.floor(stryMutAct_9fa48("106562") ? totalRows * NUM.TWO : (stryCov_9fa48("106562"), totalRows / NUM.TWO));

      // Get median value using OFFSET
      const medianResult = await partitionService.executeQuery(SPLIT_MERGE_SQL.selectMedian(primaryKeyColumn, tableName), stryMutAct_9fa48("106563") ? [] : (stryCov_9fa48("106563"), [medianOffset]));
      if (stryMutAct_9fa48("106566") ? !medianResult.rows && medianResult.rows.length === NUM.ZERO : stryMutAct_9fa48("106565") ? false : stryMutAct_9fa48("106564") ? true : (stryCov_9fa48("106564", "106565", "106566"), (stryMutAct_9fa48("106567") ? medianResult.rows : (stryCov_9fa48("106567"), !medianResult.rows)) || (stryMutAct_9fa48("106569") ? medianResult.rows.length !== NUM.ZERO : stryMutAct_9fa48("106568") ? false : (stryCov_9fa48("106568", "106569"), medianResult.rows.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("106570")) {
          {}
        } else {
          stryCov_9fa48("106570");
          throw new Error(SPLIT_MERGE_LOG_MSG.FAILED_MEDIAN_CALC);
        }
      }
      const medianKey = medianResult.rows[NUM.ZERO][primaryKeyColumn];
      this.logger.debug(SPLIT_MERGE_LOG_MSG.CALCULATED_MEDIAN_KEY, stryMutAct_9fa48("106571") ? {} : (stryCov_9fa48("106571"), {
        partitionId,
        medianKey,
        totalRows,
        medianOffset
      }));
      return medianKey;
    }
  }

  /**
   * Evaluate if a partition should be split.
   * Split criteria: storage >= threshold OR traffic >= threshold
   * @param {string} partitionId - Partition ID.
   * @param {Object} metrics - Partition metrics {sizeBytes, queriesPerMinute}.
   * @param {Object} policy - Table policy with optional custom thresholds.
   * @return {boolean} True if partition should be split.
   */
  evaluateSplitCriteria(partitionId, metrics, policy = {}) {
    if (stryMutAct_9fa48("106572")) {
      {}
    } else {
      stryCov_9fa48("106572");
      const storageThreshold = stryMutAct_9fa48("106575") ? policy.splitStorageThreshold && this.splitStorageThreshold : stryMutAct_9fa48("106574") ? false : stryMutAct_9fa48("106573") ? true : (stryCov_9fa48("106573", "106574", "106575"), policy.splitStorageThreshold || this.splitStorageThreshold);
      const trafficThreshold = stryMutAct_9fa48("106578") ? policy.splitTrafficThreshold && this.splitTrafficThreshold : stryMutAct_9fa48("106577") ? false : stryMutAct_9fa48("106576") ? true : (stryCov_9fa48("106576", "106577", "106578"), policy.splitTrafficThreshold || this.splitTrafficThreshold);
      const sizeBytes = stryMutAct_9fa48("106581") ? metrics.sizeBytes && NUM.ZERO : stryMutAct_9fa48("106580") ? false : stryMutAct_9fa48("106579") ? true : (stryCov_9fa48("106579", "106580", "106581"), metrics.sizeBytes || NUM.ZERO);
      const queriesPerMinute = stryMutAct_9fa48("106584") ? metrics.queriesPerMinute && NUM.ZERO : stryMutAct_9fa48("106583") ? false : stryMutAct_9fa48("106582") ? true : (stryCov_9fa48("106582", "106583", "106584"), metrics.queriesPerMinute || NUM.ZERO);

      // Split if EITHER threshold is exceeded
      const shouldSplit = stryMutAct_9fa48("106587") ? sizeBytes >= storageThreshold && queriesPerMinute >= trafficThreshold : stryMutAct_9fa48("106586") ? false : stryMutAct_9fa48("106585") ? true : (stryCov_9fa48("106585", "106586", "106587"), (stryMutAct_9fa48("106590") ? sizeBytes < storageThreshold : stryMutAct_9fa48("106589") ? sizeBytes > storageThreshold : stryMutAct_9fa48("106588") ? false : (stryCov_9fa48("106588", "106589", "106590"), sizeBytes >= storageThreshold)) || (stryMutAct_9fa48("106593") ? queriesPerMinute < trafficThreshold : stryMutAct_9fa48("106592") ? queriesPerMinute > trafficThreshold : stryMutAct_9fa48("106591") ? false : (stryCov_9fa48("106591", "106592", "106593"), queriesPerMinute >= trafficThreshold)));
      this.logger.debug(SPLIT_MERGE_LOG_MSG.EVALUATED_SPLIT_CRITERIA, stryMutAct_9fa48("106594") ? {} : (stryCov_9fa48("106594"), {
        partitionId,
        sizeBytes,
        queriesPerMinute,
        storageThreshold,
        trafficThreshold,
        shouldSplit
      }));
      return shouldSplit;
    }
  }

  /**
   * Evaluate if two adjacent partitions should be merged.
   * Merge criteria: combined storage <= threshold AND combined traffic <= threshold
   * @param {string} leftPartitionId - Left partition ID.
   * @param {string} rightPartitionId - Right partition ID.
   * @param {Object} leftMetrics - Left partition metrics.
   * @param {Object} rightMetrics - Right partition metrics.
   * @param {Object} policy - Table policy with optional custom thresholds.
   * @return {boolean} True if partitions should be merged.
   */
  evaluateMergeCriteria(leftPartitionId, rightPartitionId, leftMetrics, rightMetrics, policy = {}) {
    if (stryMutAct_9fa48("106595")) {
      {}
    } else {
      stryCov_9fa48("106595");
      const storageThreshold = stryMutAct_9fa48("106598") ? policy.mergeStorageThreshold && this.mergeStorageThreshold : stryMutAct_9fa48("106597") ? false : stryMutAct_9fa48("106596") ? true : (stryCov_9fa48("106596", "106597", "106598"), policy.mergeStorageThreshold || this.mergeStorageThreshold);
      const trafficThreshold = stryMutAct_9fa48("106601") ? policy.mergeTrafficThreshold && this.mergeTrafficThreshold : stryMutAct_9fa48("106600") ? false : stryMutAct_9fa48("106599") ? true : (stryCov_9fa48("106599", "106600", "106601"), policy.mergeTrafficThreshold || this.mergeTrafficThreshold);
      const combinedStorage = stryMutAct_9fa48("106602") ? (leftMetrics.sizeBytes || NUM.ZERO) - (rightMetrics.sizeBytes || NUM.ZERO) : (stryCov_9fa48("106602"), (stryMutAct_9fa48("106605") ? leftMetrics.sizeBytes && NUM.ZERO : stryMutAct_9fa48("106604") ? false : stryMutAct_9fa48("106603") ? true : (stryCov_9fa48("106603", "106604", "106605"), leftMetrics.sizeBytes || NUM.ZERO)) + (stryMutAct_9fa48("106608") ? rightMetrics.sizeBytes && NUM.ZERO : stryMutAct_9fa48("106607") ? false : stryMutAct_9fa48("106606") ? true : (stryCov_9fa48("106606", "106607", "106608"), rightMetrics.sizeBytes || NUM.ZERO)));
      const combinedTraffic = stryMutAct_9fa48("106609") ? (leftMetrics.queriesPerMinute || NUM.ZERO) - (rightMetrics.queriesPerMinute || NUM.ZERO) : (stryCov_9fa48("106609"), (stryMutAct_9fa48("106612") ? leftMetrics.queriesPerMinute && NUM.ZERO : stryMutAct_9fa48("106611") ? false : stryMutAct_9fa48("106610") ? true : (stryCov_9fa48("106610", "106611", "106612"), leftMetrics.queriesPerMinute || NUM.ZERO)) + (stryMutAct_9fa48("106615") ? rightMetrics.queriesPerMinute && NUM.ZERO : stryMutAct_9fa48("106614") ? false : stryMutAct_9fa48("106613") ? true : (stryCov_9fa48("106613", "106614", "106615"), rightMetrics.queriesPerMinute || NUM.ZERO)));

      // Merge if BOTH thresholds are satisfied
      const shouldMerge = stryMutAct_9fa48("106618") ? combinedStorage <= storageThreshold || combinedTraffic <= trafficThreshold : stryMutAct_9fa48("106617") ? false : stryMutAct_9fa48("106616") ? true : (stryCov_9fa48("106616", "106617", "106618"), (stryMutAct_9fa48("106621") ? combinedStorage > storageThreshold : stryMutAct_9fa48("106620") ? combinedStorage < storageThreshold : stryMutAct_9fa48("106619") ? true : (stryCov_9fa48("106619", "106620", "106621"), combinedStorage <= storageThreshold)) && (stryMutAct_9fa48("106624") ? combinedTraffic > trafficThreshold : stryMutAct_9fa48("106623") ? combinedTraffic < trafficThreshold : stryMutAct_9fa48("106622") ? true : (stryCov_9fa48("106622", "106623", "106624"), combinedTraffic <= trafficThreshold)));
      this.logger.debug(SPLIT_MERGE_LOG_MSG.EVALUATED_MERGE_CRITERIA, stryMutAct_9fa48("106625") ? {} : (stryCov_9fa48("106625"), {
        leftPartitionId,
        rightPartitionId,
        combinedStorage,
        combinedTraffic,
        storageThreshold,
        trafficThreshold,
        shouldMerge
      }));
      return shouldMerge;
    }
  }

  /**
   * Split a partition at the median PRIMARY KEY value.
   * Creates two adjacent partitions from one.
   * @param {Object} options - Split options.
   * @param {string} options.partitionId - Partition to split.
   * @param {Object} options.partitionService - PartitionService instance.
   * @param {string} options.tableName - Table name.
   * @param {string} options.tableId - Table ID.
   * @param {string} options.primaryKeyColumn - PRIMARY KEY column name.
   * @return {Promise<Object>} Split result with left and right partition info.
   */
  async splitPartition(options) {
    if (stryMutAct_9fa48("106626")) {
      {}
    } else {
      stryCov_9fa48("106626");
      const {
        partitionId,
        partitionService,
        tableName,
        tableId,
        primaryKeyColumn
      } = options;
      const allowDuringEvaluation = stryMutAct_9fa48("106629") ? this.state === OperationState.EVALUATING || this.allowManagedSplitDuringEvaluation : stryMutAct_9fa48("106628") ? false : stryMutAct_9fa48("106627") ? true : (stryCov_9fa48("106627", "106628", "106629"), (stryMutAct_9fa48("106631") ? this.state !== OperationState.EVALUATING : stryMutAct_9fa48("106630") ? true : (stryCov_9fa48("106630", "106631"), this.state === OperationState.EVALUATING)) && this.allowManagedSplitDuringEvaluation);
      if (stryMutAct_9fa48("106634") ? this.state !== OperationState.IDLE || !allowDuringEvaluation : stryMutAct_9fa48("106633") ? false : stryMutAct_9fa48("106632") ? true : (stryCov_9fa48("106632", "106633", "106634"), (stryMutAct_9fa48("106636") ? this.state === OperationState.IDLE : stryMutAct_9fa48("106635") ? true : (stryCov_9fa48("106635", "106636"), this.state !== OperationState.IDLE)) && (stryMutAct_9fa48("106637") ? allowDuringEvaluation : (stryCov_9fa48("106637"), !allowDuringEvaluation)))) {
        if (stryMutAct_9fa48("106638")) {
          {}
        } else {
          stryCov_9fa48("106638");
          throw new Error(SPLIT_MERGE_ERROR_MSG.managerBusy(this.state));
        }
      }
      const restoreState = allowDuringEvaluation ? OperationState.EVALUATING : OperationState.IDLE;
      this.state = OperationState.SPLITTING;
      this.emit(SPLIT_MERGE_EVENT.SPLIT_STARTED, stryMutAct_9fa48("106639") ? {} : (stryCov_9fa48("106639"), {
        partitionId
      }));
      try {
        if (stryMutAct_9fa48("106640")) {
          {}
        } else {
          stryCov_9fa48("106640");
          this.logger.info(SPLIT_MERGE_LOG_MSG.STARTING_SPLIT, stryMutAct_9fa48("106641") ? {} : (stryCov_9fa48("106641"), {
            partitionId,
            tableName,
            primaryKeyColumn
          }));

          // Calculate median key
          const medianKey = await this.calculateMedianKey(partitionId, partitionService, tableName, primaryKeyColumn);

          // Get current key range
          const currentRange = this.normalizeKeyRange(this.keyRangeManager ? this.keyRangeManager.getRange(partitionId) : partitionService.getKeyRange());
          if (stryMutAct_9fa48("106644") ? false : stryMutAct_9fa48("106643") ? true : stryMutAct_9fa48("106642") ? currentRange : (stryCov_9fa48("106642", "106643", "106644"), !currentRange)) {
            if (stryMutAct_9fa48("106645")) {
              {}
            } else {
              stryCov_9fa48("106645");
              throw new Error(SPLIT_MERGE_ERROR_MSG.partitionRangeMissing(partitionId));
            }
          }

          // Generate new partition IDs
          const leftPartitionId = (stryMutAct_9fa48("106646") ? `` : (stryCov_9fa48("106646"), `${tableId}${SPLIT_MERGE_ID.PARTITION_SEPARATOR}`)) + (stryMutAct_9fa48("106647") ? `` : (stryCov_9fa48("106647"), `${stryMutAct_9fa48("106648") ? uuidv4() : (stryCov_9fa48("106648"), uuidv4().substring(NUM.ZERO, NUM.EIGHT))}${SPLIT_MERGE_ID.LEFT_SUFFIX}`));
          const rightPartitionId = (stryMutAct_9fa48("106649") ? `` : (stryCov_9fa48("106649"), `${tableId}${SPLIT_MERGE_ID.PARTITION_SEPARATOR}`)) + (stryMutAct_9fa48("106650") ? `` : (stryCov_9fa48("106650"), `${stryMutAct_9fa48("106651") ? uuidv4() : (stryCov_9fa48("106651"), uuidv4().substring(NUM.ZERO, NUM.EIGHT))}${SPLIT_MERGE_ID.RIGHT_SUFFIX}`));

          // Create new key ranges
          const leftRange = new KeyRange(currentRange.start, medianKey);
          const rightRange = new KeyRange(medianKey, currentRange.end);

          // Validate ranges
          this.validateRangeIntegrity(leftRange, rightRange, currentRange);

          // Update key range manager if available
          if (stryMutAct_9fa48("106653") ? false : stryMutAct_9fa48("106652") ? true : (stryCov_9fa48("106652", "106653"), this.keyRangeManager)) {
            if (stryMutAct_9fa48("106654")) {
              {}
            } else {
              stryCov_9fa48("106654");
              this.keyRangeManager.splitPartition(partitionId, medianKey, leftPartitionId, rightPartitionId);
            }
          }
          const result = stryMutAct_9fa48("106655") ? {} : (stryCov_9fa48("106655"), {
            success: stryMutAct_9fa48("106656") ? false : (stryCov_9fa48("106656"), true),
            originalPartitionId: partitionId,
            medianKey,
            leftPartition: stryMutAct_9fa48("106657") ? {} : (stryCov_9fa48("106657"), {
              partitionId: leftPartitionId,
              keyRange: leftRange.toObject()
            }),
            rightPartition: stryMutAct_9fa48("106658") ? {} : (stryCov_9fa48("106658"), {
              partitionId: rightPartitionId,
              keyRange: rightRange.toObject()
            }),
            timestamp: Date.now()
          });
          this.logger.info(SPLIT_MERGE_LOG_MSG.SPLIT_PLAN_COMPLETED, stryMutAct_9fa48("106659") ? {} : (stryCov_9fa48("106659"), {
            partitionId,
            leftPartitionId,
            rightPartitionId,
            medianKey,
            phase: stryMutAct_9fa48("106660") ? "" : (stryCov_9fa48("106660"), 'split_plan')
          }));
          this.emit(SPLIT_MERGE_EVENT.SPLIT_COMPLETED, result);
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("106661")) {
          {}
        } else {
          stryCov_9fa48("106661");
          this.logger.error(SPLIT_MERGE_LOG_MSG.SPLIT_PLAN_FAILED, stryMutAct_9fa48("106662") ? {} : (stryCov_9fa48("106662"), {
            partitionId,
            error: error.message,
            phase: stryMutAct_9fa48("106663") ? "" : (stryCov_9fa48("106663"), 'split_plan')
          }));
          this.emit(SPLIT_MERGE_EVENT.SPLIT_FAILED, stryMutAct_9fa48("106664") ? {} : (stryCov_9fa48("106664"), {
            partitionId,
            error: error.message
          }));
          throw error;
        }
      } finally {
        if (stryMutAct_9fa48("106665")) {
          {}
        } else {
          stryCov_9fa48("106665");
          this.state = restoreState;
        }
      }
    }
  }

  /**
   * Merge two adjacent partitions into one.
   * Only merges partitions where left.end === right.start.
   * @param {Object} options - Merge options.
   * @param {string} options.leftPartitionId - Left partition ID.
   * @param {string} options.rightPartitionId - Right partition ID.
   * @param {string} options.tableId - Table ID.
   * @return {Promise<Object>} Merge result with merged partition info.
   */
  async mergePartitions(options) {
    if (stryMutAct_9fa48("106666")) {
      {}
    } else {
      stryCov_9fa48("106666");
      const {
        leftPartitionId,
        rightPartitionId,
        tableId
      } = options;
      if (stryMutAct_9fa48("106669") ? this.state === OperationState.IDLE : stryMutAct_9fa48("106668") ? false : stryMutAct_9fa48("106667") ? true : (stryCov_9fa48("106667", "106668", "106669"), this.state !== OperationState.IDLE)) {
        if (stryMutAct_9fa48("106670")) {
          {}
        } else {
          stryCov_9fa48("106670");
          throw new Error(SPLIT_MERGE_ERROR_MSG.mergeManagerBusy(this.state));
        }
      }
      this.state = OperationState.MERGING;
      this.emit(SPLIT_MERGE_EVENT.MERGE_STARTED, stryMutAct_9fa48("106671") ? {} : (stryCov_9fa48("106671"), {
        leftPartitionId,
        rightPartitionId
      }));
      try {
        if (stryMutAct_9fa48("106672")) {
          {}
        } else {
          stryCov_9fa48("106672");
          this.logger.info(SPLIT_MERGE_LOG_MSG.STARTING_MERGE, stryMutAct_9fa48("106673") ? {} : (stryCov_9fa48("106673"), {
            leftPartitionId,
            rightPartitionId
          }));

          // Get current key ranges
          if (stryMutAct_9fa48("106676") ? false : stryMutAct_9fa48("106675") ? true : stryMutAct_9fa48("106674") ? this.keyRangeManager : (stryCov_9fa48("106674", "106675", "106676"), !this.keyRangeManager)) {
            if (stryMutAct_9fa48("106677")) {
              {}
            } else {
              stryCov_9fa48("106677");
              throw new Error(SPLIT_MERGE_ERROR_MSG.KEY_RANGE_MANAGER_REQUIRED);
            }
          }
          const leftRange = this.keyRangeManager.getRange(leftPartitionId);
          const rightRange = this.keyRangeManager.getRange(rightPartitionId);
          if (stryMutAct_9fa48("106680") ? false : stryMutAct_9fa48("106679") ? true : stryMutAct_9fa48("106678") ? leftRange : (stryCov_9fa48("106678", "106679", "106680"), !leftRange)) {
            if (stryMutAct_9fa48("106681")) {
              {}
            } else {
              stryCov_9fa48("106681");
              throw new Error(SPLIT_MERGE_ERROR_MSG.leftPartitionMissing(leftPartitionId));
            }
          }
          if (stryMutAct_9fa48("106684") ? false : stryMutAct_9fa48("106683") ? true : stryMutAct_9fa48("106682") ? rightRange : (stryCov_9fa48("106682", "106683", "106684"), !rightRange)) {
            if (stryMutAct_9fa48("106685")) {
              {}
            } else {
              stryCov_9fa48("106685");
              throw new Error(SPLIT_MERGE_ERROR_MSG.rightPartitionMissing(rightPartitionId));
            }
          }

          // Verify adjacency: left.end must equal right.start
          if (stryMutAct_9fa48("106688") ? false : stryMutAct_9fa48("106687") ? true : stryMutAct_9fa48("106686") ? leftRange.isAdjacentTo(rightRange) : (stryCov_9fa48("106686", "106687", "106688"), !leftRange.isAdjacentTo(rightRange))) {
            if (stryMutAct_9fa48("106689")) {
              {}
            } else {
              stryCov_9fa48("106689");
              throw new Error(SPLIT_MERGE_ERROR_MSG.partitionsNotAdjacent(leftPartitionId, leftRange.end, rightPartitionId, rightRange.start));
            }
          }

          // Generate merged partition ID
          const mergedPartitionId = (stryMutAct_9fa48("106690") ? `` : (stryCov_9fa48("106690"), `${tableId}${SPLIT_MERGE_ID.PARTITION_SEPARATOR}`)) + (stryMutAct_9fa48("106691") ? `` : (stryCov_9fa48("106691"), `${stryMutAct_9fa48("106692") ? uuidv4() : (stryCov_9fa48("106692"), uuidv4().substring(NUM.ZERO, NUM.EIGHT))}${SPLIT_MERGE_ID.MERGED_SUFFIX}`));

          // Create merged key range
          const mergedRange = new KeyRange(leftRange.start, rightRange.end);

          // Validate range integrity
          this.validateMergedRangeIntegrity(leftRange, rightRange, mergedRange);

          // Update key range manager
          this.keyRangeManager.mergePartitions(leftPartitionId, rightPartitionId, mergedPartitionId);
          const result = stryMutAct_9fa48("106693") ? {} : (stryCov_9fa48("106693"), {
            success: stryMutAct_9fa48("106694") ? false : (stryCov_9fa48("106694"), true),
            leftPartitionId,
            rightPartitionId,
            mergedPartition: stryMutAct_9fa48("106695") ? {} : (stryCov_9fa48("106695"), {
              partitionId: mergedPartitionId,
              keyRange: mergedRange.toObject()
            }),
            timestamp: Date.now()
          });
          this.logger.info(SPLIT_MERGE_LOG_MSG.MERGE_COMPLETED, stryMutAct_9fa48("106696") ? {} : (stryCov_9fa48("106696"), {
            leftPartitionId,
            rightPartitionId,
            mergedPartitionId
          }));
          this.emit(SPLIT_MERGE_EVENT.MERGE_COMPLETED, result);
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("106697")) {
          {}
        } else {
          stryCov_9fa48("106697");
          this.logger.error(SPLIT_MERGE_LOG_MSG.MERGE_FAILED, stryMutAct_9fa48("106698") ? {} : (stryCov_9fa48("106698"), {
            leftPartitionId,
            rightPartitionId,
            error: error.message
          }));
          this.emit(SPLIT_MERGE_EVENT.MERGE_FAILED, stryMutAct_9fa48("106699") ? {} : (stryCov_9fa48("106699"), {
            leftPartitionId,
            rightPartitionId,
            error: error.message
          }));
          throw error;
        }
      } finally {
        if (stryMutAct_9fa48("106700")) {
          {}
        } else {
          stryCov_9fa48("106700");
          this.state = OperationState.IDLE;
        }
      }
    }
  }

  /**
   * Validate range integrity after split.
   * Ensures left and right ranges are contiguous and cover original range.
   * @param {KeyRange} leftRange - Left partition range.
   * @param {KeyRange} rightRange - Right partition range.
   * @param {KeyRange} originalRange - Original partition range.
   * @throws {Error} If range integrity is violated.
   */
  validateRangeIntegrity(leftRange, rightRange, originalRange) {
    if (stryMutAct_9fa48("106701")) {
      {}
    } else {
      stryCov_9fa48("106701");
      // Left range must start where original started
      if (stryMutAct_9fa48("106704") ? leftRange.start === originalRange.start : stryMutAct_9fa48("106703") ? false : stryMutAct_9fa48("106702") ? true : (stryCov_9fa48("106702", "106703", "106704"), leftRange.start !== originalRange.start)) {
        if (stryMutAct_9fa48("106705")) {
          {}
        } else {
          stryCov_9fa48("106705");
          throw new Error(SPLIT_MERGE_ERROR_MSG.rangeIntegrityLeftStart(leftRange.start, originalRange.start));
        }
      }

      // Right range must end where original ended
      if (stryMutAct_9fa48("106708") ? rightRange.end === originalRange.end : stryMutAct_9fa48("106707") ? false : stryMutAct_9fa48("106706") ? true : (stryCov_9fa48("106706", "106707", "106708"), rightRange.end !== originalRange.end)) {
        if (stryMutAct_9fa48("106709")) {
          {}
        } else {
          stryCov_9fa48("106709");
          throw new Error(SPLIT_MERGE_ERROR_MSG.rangeIntegrityRightEnd(rightRange.end, originalRange.end));
        }
      }

      // Left end must equal right start (contiguous)
      if (stryMutAct_9fa48("106712") ? false : stryMutAct_9fa48("106711") ? true : stryMutAct_9fa48("106710") ? leftRange.isAdjacentTo(rightRange) : (stryCov_9fa48("106710", "106711", "106712"), !leftRange.isAdjacentTo(rightRange))) {
        if (stryMutAct_9fa48("106713")) {
          {}
        } else {
          stryCov_9fa48("106713");
          throw new Error(SPLIT_MERGE_ERROR_MSG.rangeIntegrityNotContiguous(leftRange.end, rightRange.start));
        }
      }

      // Ranges must not overlap
      if (stryMutAct_9fa48("106715") ? false : stryMutAct_9fa48("106714") ? true : (stryCov_9fa48("106714", "106715"), leftRange.overlaps(rightRange))) {
        if (stryMutAct_9fa48("106716")) {
          {}
        } else {
          stryCov_9fa48("106716");
          throw new Error(SPLIT_MERGE_LOG_MSG.RANGE_INTEGRITY_OVERLAP);
        }
      }
      this.logger.debug(SPLIT_MERGE_LOG_MSG.RANGE_VALID_AFTER_SPLIT, stryMutAct_9fa48("106717") ? {} : (stryCov_9fa48("106717"), {
        leftStart: leftRange.start,
        leftEnd: leftRange.end,
        rightStart: rightRange.start,
        rightEnd: rightRange.end
      }));
    }
  }

  /**
   * Validate range integrity after merge.
   * Ensures merged range covers both original ranges.
   * @param {KeyRange} leftRange - Left partition range.
   * @param {KeyRange} rightRange - Right partition range.
   * @param {KeyRange} mergedRange - Merged partition range.
   * @throws {Error} If range integrity is violated.
   */
  validateMergedRangeIntegrity(leftRange, rightRange, mergedRange) {
    if (stryMutAct_9fa48("106718")) {
      {}
    } else {
      stryCov_9fa48("106718");
      // Merged range must start where left started
      if (stryMutAct_9fa48("106721") ? mergedRange.start === leftRange.start : stryMutAct_9fa48("106720") ? false : stryMutAct_9fa48("106719") ? true : (stryCov_9fa48("106719", "106720", "106721"), mergedRange.start !== leftRange.start)) {
        if (stryMutAct_9fa48("106722")) {
          {}
        } else {
          stryCov_9fa48("106722");
          throw new Error(SPLIT_MERGE_ERROR_MSG.rangeIntegrityMergedStart(mergedRange.start, leftRange.start));
        }
      }

      // Merged range must end where right ended
      if (stryMutAct_9fa48("106725") ? mergedRange.end === rightRange.end : stryMutAct_9fa48("106724") ? false : stryMutAct_9fa48("106723") ? true : (stryCov_9fa48("106723", "106724", "106725"), mergedRange.end !== rightRange.end)) {
        if (stryMutAct_9fa48("106726")) {
          {}
        } else {
          stryCov_9fa48("106726");
          throw new Error(SPLIT_MERGE_ERROR_MSG.rangeIntegrityMergedEnd(mergedRange.end, rightRange.end));
        }
      }
      this.logger.debug(SPLIT_MERGE_LOG_MSG.RANGE_VALID_AFTER_MERGE, stryMutAct_9fa48("106727") ? {} : (stryCov_9fa48("106727"), {
        mergedStart: mergedRange.start,
        mergedEnd: mergedRange.end
      }));
    }
  }

  /**
   * Start periodic evaluation of split/merge criteria.
   * Evaluates every 5 minutes by default.
   */
  startPeriodicEvaluation() {
    if (stryMutAct_9fa48("106728")) {
      {}
    } else {
      stryCov_9fa48("106728");
      if (stryMutAct_9fa48("106730") ? false : stryMutAct_9fa48("106729") ? true : (stryCov_9fa48("106729", "106730"), this.evaluationTimer)) {
        if (stryMutAct_9fa48("106731")) {
          {}
        } else {
          stryCov_9fa48("106731");
          return;
        }
      }
      this.logger.info(SPLIT_MERGE_LOG_MSG.STARTING_PERIODIC_EVAL, stryMutAct_9fa48("106732") ? {} : (stryCov_9fa48("106732"), {
        intervalMs: this.evaluationIntervalMs
      }));
      this.evaluationTimer = setInterval(() => {
        if (stryMutAct_9fa48("106733")) {
          {}
        } else {
          stryCov_9fa48("106733");
          this.evaluateAllPartitions(stryMutAct_9fa48("106734") ? {} : (stryCov_9fa48("106734"), {
            triggerReason: PERIODIC_EVALUATION_TRIGGER
          })).catch(error => {
            if (stryMutAct_9fa48("106735")) {
              {}
            } else {
              stryCov_9fa48("106735");
              this.logger.error(SPLIT_MERGE_LOG_MSG.PERIODIC_EVAL_FAILED, stryMutAct_9fa48("106736") ? {} : (stryCov_9fa48("106736"), {
                error: error.message
              }));
            }
          });
        }
      }, this.evaluationIntervalMs);
      this.evaluationTimer.unref();
    }
  }

  /**
   * Stop periodic evaluation.
   */
  stopPeriodicEvaluation() {
    if (stryMutAct_9fa48("106737")) {
      {}
    } else {
      stryCov_9fa48("106737");
      if (stryMutAct_9fa48("106739") ? false : stryMutAct_9fa48("106738") ? true : (stryCov_9fa48("106738", "106739"), this.evaluationTimer)) {
        if (stryMutAct_9fa48("106740")) {
          {}
        } else {
          stryCov_9fa48("106740");
          clearInterval(this.evaluationTimer);
          this.evaluationTimer = null;
          this.logger.info(SPLIT_MERGE_LOG_MSG.STOPPED_PERIODIC_EVAL);
        }
      }
    }
  }

  /**
   * Request one coalesced split/merge evaluation outside the periodic timer.
   * Reuses the canonical evaluateAllPartitions path and collapses bursts of
   * cache-driven triggers into one follow-up evaluation.
   * @param {Object} [context]
   * @return {void}
   */
  requestEvaluation(context = {}) {
    if (stryMutAct_9fa48("106741")) {
      {}
    } else {
      stryCov_9fa48("106741");
      if (stryMutAct_9fa48("106743") ? false : stryMutAct_9fa48("106742") ? true : (stryCov_9fa48("106742", "106743"), this.isShutdown)) {
        if (stryMutAct_9fa48("106744")) {
          {}
        } else {
          stryCov_9fa48("106744");
          return;
        }
      }
      this.requestedEvaluation = this.mergeRequestedEvaluationContext(this.requestedEvaluation, context);
      this.setRequestedEvaluationDiagnostics(this.requestedEvaluation);
      const pressureDecision = this.evaluateSplitPressure();
      const pressureDeferred = stryMutAct_9fa48("106747") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("106746") ? false : stryMutAct_9fa48("106745") ? true : (stryCov_9fa48("106745", "106746", "106747"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER);
      const delayMs = stryMutAct_9fa48("106748") ? Math.min(this.reactiveEvaluationDebounceMs, pressureDeferred ? pressureDecision.retryAfterMs : NUM.ZERO) : (stryCov_9fa48("106748"), Math.max(this.reactiveEvaluationDebounceMs, pressureDeferred ? pressureDecision.retryAfterMs : NUM.ZERO));
      const dueAtMs = stryMutAct_9fa48("106749") ? Date.now() - delayMs : (stryCov_9fa48("106749"), Date.now() + delayMs);
      if (stryMutAct_9fa48("106752") ? this.requestedEvaluationTimer || Number.isFinite(this.requestedEvaluationDueAtMs) : stryMutAct_9fa48("106751") ? false : stryMutAct_9fa48("106750") ? true : (stryCov_9fa48("106750", "106751", "106752"), this.requestedEvaluationTimer && Number.isFinite(this.requestedEvaluationDueAtMs))) {
        if (stryMutAct_9fa48("106753")) {
          {}
        } else {
          stryCov_9fa48("106753");
          if (stryMutAct_9fa48("106756") ? pressureDeferred || this.requestedEvaluationDueAtMs < dueAtMs : stryMutAct_9fa48("106755") ? false : stryMutAct_9fa48("106754") ? true : (stryCov_9fa48("106754", "106755", "106756"), pressureDeferred && (stryMutAct_9fa48("106759") ? this.requestedEvaluationDueAtMs >= dueAtMs : stryMutAct_9fa48("106758") ? this.requestedEvaluationDueAtMs <= dueAtMs : stryMutAct_9fa48("106757") ? true : (stryCov_9fa48("106757", "106758", "106759"), this.requestedEvaluationDueAtMs < dueAtMs)))) {
            if (stryMutAct_9fa48("106760")) {
              {}
            } else {
              stryCov_9fa48("106760");
              clearTimeout(this.requestedEvaluationTimer);
              this.requestedEvaluationTimer = null;
            }
          } else if (stryMutAct_9fa48("106763") ? !pressureDeferred || this.requestedEvaluationDueAtMs <= dueAtMs : stryMutAct_9fa48("106762") ? false : stryMutAct_9fa48("106761") ? true : (stryCov_9fa48("106761", "106762", "106763"), (stryMutAct_9fa48("106764") ? pressureDeferred : (stryCov_9fa48("106764"), !pressureDeferred)) && (stryMutAct_9fa48("106767") ? this.requestedEvaluationDueAtMs > dueAtMs : stryMutAct_9fa48("106766") ? this.requestedEvaluationDueAtMs < dueAtMs : stryMutAct_9fa48("106765") ? true : (stryCov_9fa48("106765", "106766", "106767"), this.requestedEvaluationDueAtMs <= dueAtMs)))) {
            if (stryMutAct_9fa48("106768")) {
              {}
            } else {
              stryCov_9fa48("106768");
              return;
            }
          } else if (stryMutAct_9fa48("106771") ? this.requestedEvaluationDueAtMs !== dueAtMs : stryMutAct_9fa48("106770") ? false : stryMutAct_9fa48("106769") ? true : (stryCov_9fa48("106769", "106770", "106771"), this.requestedEvaluationDueAtMs === dueAtMs)) {
            if (stryMutAct_9fa48("106772")) {
              {}
            } else {
              stryCov_9fa48("106772");
              return;
            }
          } else {
            if (stryMutAct_9fa48("106773")) {
              {}
            } else {
              stryCov_9fa48("106773");
              clearTimeout(this.requestedEvaluationTimer);
              this.requestedEvaluationTimer = null;
            }
          }
        }
      } else if (stryMutAct_9fa48("106775") ? false : stryMutAct_9fa48("106774") ? true : (stryCov_9fa48("106774", "106775"), this.requestedEvaluationTimer)) {
        if (stryMutAct_9fa48("106776")) {
          {}
        } else {
          stryCov_9fa48("106776");
          clearTimeout(this.requestedEvaluationTimer);
          this.requestedEvaluationTimer = null;
        }
      }
      this.requestedEvaluationDueAtMs = dueAtMs;
      this.requestedEvaluationTimer = setTimeout(() => {
        if (stryMutAct_9fa48("106777")) {
          {}
        } else {
          stryCov_9fa48("106777");
          this.requestedEvaluationTimer = null;
          this.requestedEvaluationDueAtMs = null;
          void this.flushRequestedEvaluation();
        }
      }, delayMs);
      stryMutAct_9fa48("106778") ? this.requestedEvaluationTimer.unref() : (stryCov_9fa48("106778"), this.requestedEvaluationTimer.unref?.());
    }
  }

  /**
   * Merge multiple evaluation requests into one stable context object.
   * @param {Object|null} existing
   * @param {Object|null} next
   * @return {Object}
   * @private
   */
  mergeRequestedEvaluationContext(existing, next) {
    if (stryMutAct_9fa48("106779")) {
      {}
    } else {
      stryCov_9fa48("106779");
      const merged = stryMutAct_9fa48("106780") ? {} : (stryCov_9fa48("106780"), {
        reasonCodes: stryMutAct_9fa48("106781") ? ["Stryker was here"] : (stryCov_9fa48("106781"), []),
        partitionIds: stryMutAct_9fa48("106782") ? ["Stryker was here"] : (stryCov_9fa48("106782"), [])
      });
      const appendValues = (target, values) => {
        if (stryMutAct_9fa48("106783")) {
          {}
        } else {
          stryCov_9fa48("106783");
          if (stryMutAct_9fa48("106786") ? false : stryMutAct_9fa48("106785") ? true : stryMutAct_9fa48("106784") ? Array.isArray(values) : (stryCov_9fa48("106784", "106785", "106786"), !Array.isArray(values))) {
            if (stryMutAct_9fa48("106787")) {
              {}
            } else {
              stryCov_9fa48("106787");
              return;
            }
          }
          for (const value of values) {
            if (stryMutAct_9fa48("106788")) {
              {}
            } else {
              stryCov_9fa48("106788");
              const normalizedValue = String(stryMutAct_9fa48("106791") ? value && '' : stryMutAct_9fa48("106790") ? false : stryMutAct_9fa48("106789") ? true : (stryCov_9fa48("106789", "106790", "106791"), value || (stryMutAct_9fa48("106792") ? "Stryker was here!" : (stryCov_9fa48("106792"), ''))));
              if (stryMutAct_9fa48("106795") ? !normalizedValue && target.includes(normalizedValue) : stryMutAct_9fa48("106794") ? false : stryMutAct_9fa48("106793") ? true : (stryCov_9fa48("106793", "106794", "106795"), (stryMutAct_9fa48("106796") ? normalizedValue : (stryCov_9fa48("106796"), !normalizedValue)) || target.includes(normalizedValue))) {
                if (stryMutAct_9fa48("106797")) {
                  {}
                } else {
                  stryCov_9fa48("106797");
                  continue;
                }
              }
              target.push(normalizedValue);
            }
          }
        }
      };
      const appendContext = context => {
        if (stryMutAct_9fa48("106798")) {
          {}
        } else {
          stryCov_9fa48("106798");
          if (stryMutAct_9fa48("106801") ? !context && typeof context !== 'object' : stryMutAct_9fa48("106800") ? false : stryMutAct_9fa48("106799") ? true : (stryCov_9fa48("106799", "106800", "106801"), (stryMutAct_9fa48("106802") ? context : (stryCov_9fa48("106802"), !context)) || (stryMutAct_9fa48("106804") ? typeof context === 'object' : stryMutAct_9fa48("106803") ? false : (stryCov_9fa48("106803", "106804"), typeof context !== (stryMutAct_9fa48("106805") ? "" : (stryCov_9fa48("106805"), 'object')))))) {
            if (stryMutAct_9fa48("106806")) {
              {}
            } else {
              stryCov_9fa48("106806");
              return;
            }
          }
          appendValues(merged.reasonCodes, Array.isArray(context.reasonCodes) ? context.reasonCodes : stryMutAct_9fa48("106807") ? [] : (stryCov_9fa48("106807"), [context.reasonCode, context.reason]));
          appendValues(merged.partitionIds, Array.isArray(context.partitionIds) ? context.partitionIds : stryMutAct_9fa48("106808") ? [] : (stryCov_9fa48("106808"), [context.partitionId]));
        }
      };
      appendContext(existing);
      appendContext(next);
      return merged;
    }
  }

  /**
   * Resolve one stable trigger label for evaluation diagnostics.
   * @param {Object} preflightOptions
   * @return {string}
   * @private
   */
  resolveEvaluationTrigger(preflightOptions = {}) {
    if (stryMutAct_9fa48("106809")) {
      {}
    } else {
      stryCov_9fa48("106809");
      const trigger = String(stryMutAct_9fa48("106812") ? (preflightOptions?.triggerReason || preflightOptions?.reasonCode || preflightOptions?.reason) && DEFAULT_EVALUATION_TRIGGER : stryMutAct_9fa48("106811") ? false : stryMutAct_9fa48("106810") ? true : (stryCov_9fa48("106810", "106811", "106812"), (stryMutAct_9fa48("106814") ? (preflightOptions?.triggerReason || preflightOptions?.reasonCode) && preflightOptions?.reason : stryMutAct_9fa48("106813") ? false : (stryCov_9fa48("106813", "106814"), (stryMutAct_9fa48("106816") ? preflightOptions?.triggerReason && preflightOptions?.reasonCode : stryMutAct_9fa48("106815") ? false : (stryCov_9fa48("106815", "106816"), (stryMutAct_9fa48("106817") ? preflightOptions.triggerReason : (stryCov_9fa48("106817"), preflightOptions?.triggerReason)) || (stryMutAct_9fa48("106818") ? preflightOptions.reasonCode : (stryCov_9fa48("106818"), preflightOptions?.reasonCode)))) || (stryMutAct_9fa48("106819") ? preflightOptions.reason : (stryCov_9fa48("106819"), preflightOptions?.reason)))) || DEFAULT_EVALUATION_TRIGGER));
      return (stryMutAct_9fa48("106823") ? trigger.length <= NUM.ZERO : stryMutAct_9fa48("106822") ? trigger.length >= NUM.ZERO : stryMutAct_9fa48("106821") ? false : stryMutAct_9fa48("106820") ? true : (stryCov_9fa48("106820", "106821", "106822", "106823"), trigger.length > NUM.ZERO)) ? trigger : DEFAULT_EVALUATION_TRIGGER;
    }
  }

  /**
   * Capture pending reactive-request diagnostics.
   * @param {Object|null} request
   * @return {void}
   * @private
   */
  setRequestedEvaluationDiagnostics(request) {
    if (stryMutAct_9fa48("106824")) {
      {}
    } else {
      stryCov_9fa48("106824");
      const normalizedRequest = (stryMutAct_9fa48("106827") ? request || typeof request === 'object' : stryMutAct_9fa48("106826") ? false : stryMutAct_9fa48("106825") ? true : (stryCov_9fa48("106825", "106826", "106827"), request && (stryMutAct_9fa48("106829") ? typeof request !== 'object' : stryMutAct_9fa48("106828") ? true : (stryCov_9fa48("106828", "106829"), typeof request === (stryMutAct_9fa48("106830") ? "" : (stryCov_9fa48("106830"), 'object')))))) ? request : null;
      this.lastEvaluationRequestedAtMs = Date.now();
      this.lastEvaluationReasonCodes = cloneStringArray(stryMutAct_9fa48("106831") ? normalizedRequest.reasonCodes : (stryCov_9fa48("106831"), normalizedRequest?.reasonCodes));
      this.lastEvaluationPartitionIds = cloneStringArray(stryMutAct_9fa48("106832") ? normalizedRequest.partitionIds : (stryCov_9fa48("106832"), normalizedRequest?.partitionIds));
    }
  }

  /**
   * Clear pending reactive-request diagnostics after dispatch.
   * @return {void}
   * @private
   */
  clearRequestedEvaluationDiagnostics() {
    if (stryMutAct_9fa48("106833")) {
      {}
    } else {
      stryCov_9fa48("106833");
      this.lastEvaluationRequestedAtMs = null;
      this.lastEvaluationReasonCodes = stryMutAct_9fa48("106834") ? ["Stryker was here"] : (stryCov_9fa48("106834"), []);
      this.lastEvaluationPartitionIds = stryMutAct_9fa48("106835") ? ["Stryker was here"] : (stryCov_9fa48("106835"), []);
    }
  }

  /**
   * Record evaluation-start diagnostics.
   * @param {Object} preflightOptions
   * @return {number}
   * @private
   */
  recordEvaluationStart(preflightOptions = {}) {
    if (stryMutAct_9fa48("106836")) {
      {}
    } else {
      stryCov_9fa48("106836");
      const startedAtMs = Date.now();
      this.lastEvaluationTrigger = this.resolveEvaluationTrigger(preflightOptions);
      this.lastEvaluationStartedAtMs = startedAtMs;
      this.lastEvaluationError = null;
      return startedAtMs;
    }
  }

  /**
   * Record evaluation success diagnostics.
   * @param {Object} results
   * @param {number} startedAtMs
   * @return {void}
   * @private
   */
  recordEvaluationSuccess(results, startedAtMs) {
    if (stryMutAct_9fa48("106837")) {
      {}
    } else {
      stryCov_9fa48("106837");
      const completedAtMs = Date.now();
      this.lastEvaluationCompletedAtMs = completedAtMs;
      this.lastEvaluationDurationMs = Number.isFinite(startedAtMs) ? stryMutAct_9fa48("106838") ? Math.min(NUM.ZERO, completedAtMs - startedAtMs) : (stryCov_9fa48("106838"), Math.max(NUM.ZERO, stryMutAct_9fa48("106839") ? completedAtMs + startedAtMs : (stryCov_9fa48("106839"), completedAtMs - startedAtMs))) : null;
      const normalized = (stryMutAct_9fa48("106842") ? results || typeof results === 'object' : stryMutAct_9fa48("106841") ? false : stryMutAct_9fa48("106840") ? true : (stryCov_9fa48("106840", "106841", "106842"), results && (stryMutAct_9fa48("106844") ? typeof results !== 'object' : stryMutAct_9fa48("106843") ? true : (stryCov_9fa48("106843", "106844"), typeof results === (stryMutAct_9fa48("106845") ? "" : (stryCov_9fa48("106845"), 'object')))))) ? results : {};
      this.lastEvaluationSummary = stryMutAct_9fa48("106846") ? {} : (stryCov_9fa48("106846"), {
        evaluated: stryMutAct_9fa48("106849") ? normalized.evaluated !== true : stryMutAct_9fa48("106848") ? false : stryMutAct_9fa48("106847") ? true : (stryCov_9fa48("106847", "106848", "106849"), normalized.evaluated === (stryMutAct_9fa48("106850") ? false : (stryCov_9fa48("106850"), true))),
        partitionsEvaluated: Number(stryMutAct_9fa48("106853") ? normalized.partitionsEvaluated && NUM.ZERO : stryMutAct_9fa48("106852") ? false : stryMutAct_9fa48("106851") ? true : (stryCov_9fa48("106851", "106852", "106853"), normalized.partitionsEvaluated || NUM.ZERO)),
        splitCandidateCount: Array.isArray(normalized.splitCandidates) ? normalized.splitCandidates.length : NUM.ZERO,
        executedSplitCount: Array.isArray(normalized.executedSplits) ? normalized.executedSplits.length : NUM.ZERO,
        splitDeferredCount: Array.isArray(normalized.splitDeferred) ? normalized.splitDeferred.length : NUM.ZERO,
        splitErrorCount: Array.isArray(normalized.splitErrors) ? normalized.splitErrors.length : NUM.ZERO,
        mergeCandidateCount: Array.isArray(normalized.mergeCandidates) ? normalized.mergeCandidates.length : NUM.ZERO
      });
      this.lastEvaluationError = null;
    }
  }

  /**
   * Record evaluation failure diagnostics.
   * @param {Error|*} error
   * @param {number} startedAtMs
   * @return {void}
   * @private
   */
  recordEvaluationFailure(error, startedAtMs) {
    if (stryMutAct_9fa48("106854")) {
      {}
    } else {
      stryCov_9fa48("106854");
      const completedAtMs = Date.now();
      this.lastEvaluationCompletedAtMs = completedAtMs;
      this.lastEvaluationDurationMs = Number.isFinite(startedAtMs) ? stryMutAct_9fa48("106855") ? Math.min(NUM.ZERO, completedAtMs - startedAtMs) : (stryCov_9fa48("106855"), Math.max(NUM.ZERO, stryMutAct_9fa48("106856") ? completedAtMs + startedAtMs : (stryCov_9fa48("106856"), completedAtMs - startedAtMs))) : null;
      this.lastEvaluationError = String(stryMutAct_9fa48("106859") ? (error?.message || error) && '' : stryMutAct_9fa48("106858") ? false : stryMutAct_9fa48("106857") ? true : (stryCov_9fa48("106857", "106858", "106859"), (stryMutAct_9fa48("106861") ? error?.message && error : stryMutAct_9fa48("106860") ? false : (stryCov_9fa48("106860", "106861"), (stryMutAct_9fa48("106862") ? error.message : (stryCov_9fa48("106862"), error?.message)) || error)) || (stryMutAct_9fa48("106863") ? "Stryker was here!" : (stryCov_9fa48("106863"), ''))));
    }
  }

  /**
   * Drain one pending evaluation request once the manager is idle.
   * @return {Promise<void>}
   * @private
   */
  async flushRequestedEvaluation() {
    if (stryMutAct_9fa48("106864")) {
      {}
    } else {
      stryCov_9fa48("106864");
      const request = this.requestedEvaluation;
      this.requestedEvaluation = null;
      this.clearRequestedEvaluationDiagnostics();
      if (stryMutAct_9fa48("106867") ? false : stryMutAct_9fa48("106866") ? true : stryMutAct_9fa48("106865") ? request : (stryCov_9fa48("106865", "106866", "106867"), !request)) {
        if (stryMutAct_9fa48("106868")) {
          {}
        } else {
          stryCov_9fa48("106868");
          return;
        }
      }
      if (stryMutAct_9fa48("106871") ? this.state === OperationState.IDLE : stryMutAct_9fa48("106870") ? false : stryMutAct_9fa48("106869") ? true : (stryCov_9fa48("106869", "106870", "106871"), this.state !== OperationState.IDLE)) {
        if (stryMutAct_9fa48("106872")) {
          {}
        } else {
          stryCov_9fa48("106872");
          this.requestEvaluation(request);
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("106873")) {
          {}
        } else {
          stryCov_9fa48("106873");
          await this.evaluateAllPartitions(stryMutAct_9fa48("106874") ? {} : (stryCov_9fa48("106874"), {
            ...request,
            triggerReason: REACTIVE_EVALUATION_TRIGGER
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("106875")) {
          {}
        } else {
          stryCov_9fa48("106875");
          this.logger.error(SPLIT_MERGE_LOG_MSG.REQUESTED_EVAL_FAILED, stryMutAct_9fa48("106876") ? {} : (stryCov_9fa48("106876"), {
            error: error.message,
            reasonCodes: request.reasonCodes,
            partitionIds: request.partitionIds
          }));
        }
      }
    }
  }

  /**
   * Evaluate all partitions for split/merge operations.
   * @return {Promise<Object>} Evaluation results.
   */
  /**
     * Evaluate all partitions for split/merge operations.
     *
     * Split candidates that fail capacity preflight are moved to
     * splitDeferred with reason codes (Req 7.2, 7.4). Merge
     * candidates are never blocked by capacity pressure (Req 7.3).
     *
     * @param {Object} [preflightOptions] - Optional preflight config.
     * @param {string} [preflightOptions.targetNodeId] - Node to check
     *   capacity against for split preflight.
     * @return {Promise<Object>} Evaluation results.
     */
  async evaluateAllPartitions(preflightOptions = {}) {
    if (stryMutAct_9fa48("106877")) {
      {}
    } else {
      stryCov_9fa48("106877");
      if (stryMutAct_9fa48("106880") ? this.state === OperationState.IDLE : stryMutAct_9fa48("106879") ? false : stryMutAct_9fa48("106878") ? true : (stryCov_9fa48("106878", "106879", "106880"), this.state !== OperationState.IDLE)) {
        if (stryMutAct_9fa48("106881")) {
          {}
        } else {
          stryCov_9fa48("106881");
          this.logger.debug(SPLIT_MERGE_LOG_MSG.SKIPPING_EVAL_BUSY, stryMutAct_9fa48("106882") ? {} : (stryCov_9fa48("106882"), {
            state: this.state
          }));
          return stryMutAct_9fa48("106883") ? {} : (stryCov_9fa48("106883"), {
            evaluated: stryMutAct_9fa48("106884") ? true : (stryCov_9fa48("106884"), false),
            reason: SPLIT_MERGE_REASON.BUSY
          });
        }
      }
      const evaluationStartedAtMs = this.recordEvaluationStart(preflightOptions);
      const pressureDecision = this.evaluateSplitPressure();
      if (stryMutAct_9fa48("106887") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("106886") ? false : stryMutAct_9fa48("106885") ? true : (stryCov_9fa48("106885", "106886", "106887"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER)) {
        if (stryMutAct_9fa48("106888")) {
          {}
        } else {
          stryCov_9fa48("106888");
          this.requestEvaluation(stryMutAct_9fa48("106889") ? {} : (stryCov_9fa48("106889"), {
            reasonCode: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE,
            partitionIds: preflightOptions.partitionIds
          }));
          const results = stryMutAct_9fa48("106890") ? {} : (stryCov_9fa48("106890"), {
            evaluated: stryMutAct_9fa48("106891") ? true : (stryCov_9fa48("106891"), false),
            reason: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE,
            retryAfterMs: pressureDecision.retryAfterMs,
            pressureSummary: stryMutAct_9fa48("106894") ? pressureDecision.summary && null : stryMutAct_9fa48("106893") ? false : stryMutAct_9fa48("106892") ? true : (stryCov_9fa48("106892", "106893", "106894"), pressureDecision.summary || null),
            partitionsEvaluated: NUM.ZERO,
            splitCandidates: stryMutAct_9fa48("106895") ? ["Stryker was here"] : (stryCov_9fa48("106895"), []),
            executedSplits: stryMutAct_9fa48("106896") ? ["Stryker was here"] : (stryCov_9fa48("106896"), []),
            splitErrors: stryMutAct_9fa48("106897") ? ["Stryker was here"] : (stryCov_9fa48("106897"), []),
            splitDeferred: stryMutAct_9fa48("106898") ? ["Stryker was here"] : (stryCov_9fa48("106898"), []),
            mergeCandidates: stryMutAct_9fa48("106899") ? ["Stryker was here"] : (stryCov_9fa48("106899"), [])
          });
          this.recordEvaluationSuccess(results, evaluationStartedAtMs);
          return results;
        }
      }
      this.state = OperationState.EVALUATING;
      try {
        if (stryMutAct_9fa48("106900")) {
          {}
        } else {
          stryCov_9fa48("106900");
          const results = stryMutAct_9fa48("106901") ? {} : (stryCov_9fa48("106901"), {
            evaluated: stryMutAct_9fa48("106902") ? false : (stryCov_9fa48("106902"), true),
            partitionsEvaluated: NUM.ZERO,
            splitCandidates: stryMutAct_9fa48("106903") ? ["Stryker was here"] : (stryCov_9fa48("106903"), []),
            executedSplits: stryMutAct_9fa48("106904") ? ["Stryker was here"] : (stryCov_9fa48("106904"), []),
            splitErrors: stryMutAct_9fa48("106905") ? ["Stryker was here"] : (stryCov_9fa48("106905"), []),
            splitDeferred: stryMutAct_9fa48("106906") ? ["Stryker was here"] : (stryCov_9fa48("106906"), []),
            mergeCandidates: stryMutAct_9fa48("106907") ? ["Stryker was here"] : (stryCov_9fa48("106907"), [])
          });
          const partitions = await this.loadEvaluationPartitions();
          if (stryMutAct_9fa48("106910") ? partitions.length !== NUM.ZERO : stryMutAct_9fa48("106909") ? false : stryMutAct_9fa48("106908") ? true : (stryCov_9fa48("106908", "106909", "106910"), partitions.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("106911")) {
              {}
            } else {
              stryCov_9fa48("106911");
              this.recordEvaluationSuccess(results, evaluationStartedAtMs);
              return results;
            }
          }
          results.partitionsEvaluated = partitions.length;
          const targetNodeId = stryMutAct_9fa48("106914") ? preflightOptions.targetNodeId && null : stryMutAct_9fa48("106913") ? false : stryMutAct_9fa48("106912") ? true : (stryCov_9fa48("106912", "106913", "106914"), preflightOptions.targetNodeId || null);
          for (const partition of partitions) {
            if (stryMutAct_9fa48("106915")) {
              {}
            } else {
              stryCov_9fa48("106915");
              const partitionId = this.getPartitionId(partition);
              if (stryMutAct_9fa48("106918") ? false : stryMutAct_9fa48("106917") ? true : stryMutAct_9fa48("106916") ? partitionId : (stryCov_9fa48("106916", "106917", "106918"), !partitionId)) {
                if (stryMutAct_9fa48("106919")) {
                  {}
                } else {
                  stryCov_9fa48("106919");
                  continue;
                }
              }
              const metrics = await this.resolvePartitionMetrics(partition);
              const policy = await this.getTablePolicy(partitionId);
              if (stryMutAct_9fa48("106922") ? false : stryMutAct_9fa48("106921") ? true : stryMutAct_9fa48("106920") ? this.evaluateSplitCriteria(partitionId, metrics, policy) : (stryCov_9fa48("106920", "106921", "106922"), !this.evaluateSplitCriteria(partitionId, metrics, policy))) {
                if (stryMutAct_9fa48("106923")) {
                  {}
                } else {
                  stryCov_9fa48("106923");
                  continue;
                }
              }

              // Capacity preflight for split candidates
              if (stryMutAct_9fa48("106925") ? false : stryMutAct_9fa48("106924") ? true : (stryCov_9fa48("106924", "106925"), targetNodeId)) {
                if (stryMutAct_9fa48("106926")) {
                  {}
                } else {
                  stryCov_9fa48("106926");
                  const preflight = await this.checkSplitCapacityPreflight(partitionId, metrics, targetNodeId);
                  if (stryMutAct_9fa48("106928") ? false : stryMutAct_9fa48("106927") ? true : (stryCov_9fa48("106927", "106928"), preflight.feasible)) {
                    if (stryMutAct_9fa48("106929")) {
                      {}
                    } else {
                      stryCov_9fa48("106929");
                      this.logger.debug(SPLIT_MERGE_LOG_MSG.SPLIT_CAPACITY_ALLOWED, stryMutAct_9fa48("106930") ? {} : (stryCov_9fa48("106930"), {
                        partitionId,
                        targetNodeId
                      }));
                      results.splitCandidates.push(partitionId);
                    }
                  } else {
                    if (stryMutAct_9fa48("106931")) {
                      {}
                    } else {
                      stryCov_9fa48("106931");
                      this.logger.warn(SPLIT_MERGE_LOG_MSG.SPLIT_DEFERRED_CAPACITY, stryMutAct_9fa48("106932") ? {} : (stryCov_9fa48("106932"), {
                        partitionId,
                        targetNodeId,
                        reason: preflight.reason
                      }));
                      results.splitDeferred.push(stryMutAct_9fa48("106933") ? {} : (stryCov_9fa48("106933"), {
                        partitionId,
                        reason: preflight.reason,
                        admissionResult: preflight.admissionResult
                      }));
                      this.emit(SPLIT_MERGE_EVENT.SPLIT_DEFERRED, stryMutAct_9fa48("106934") ? {} : (stryCov_9fa48("106934"), {
                        partitionId,
                        reason: preflight.reason
                      }));
                    }
                  }
                }
              } else {
                if (stryMutAct_9fa48("106935")) {
                  {}
                } else {
                  stryCov_9fa48("106935");
                  results.splitCandidates.push(partitionId);
                }
              }
            }
          }
          let splitExecutionAttempts = NUM.ZERO;
          for (const partitionId of results.splitCandidates) {
            if (stryMutAct_9fa48("106936")) {
              {}
            } else {
              stryCov_9fa48("106936");
              if (stryMutAct_9fa48("106940") ? splitExecutionAttempts < this.maxAutoExecuteSplitsPerEvaluation : stryMutAct_9fa48("106939") ? splitExecutionAttempts > this.maxAutoExecuteSplitsPerEvaluation : stryMutAct_9fa48("106938") ? false : stryMutAct_9fa48("106937") ? true : (stryCov_9fa48("106937", "106938", "106939", "106940"), splitExecutionAttempts >= this.maxAutoExecuteSplitsPerEvaluation)) {
                if (stryMutAct_9fa48("106941")) {
                  {}
                } else {
                  stryCov_9fa48("106941");
                  this.logger.warn(SPLIT_MERGE_LOG_MSG.SPLIT_DEFERRED_BACKPRESSURE, stryMutAct_9fa48("106942") ? {} : (stryCov_9fa48("106942"), {
                    partitionId,
                    reason: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE,
                    maxAutoExecuteSplitsPerEvaluation: this.maxAutoExecuteSplitsPerEvaluation
                  }));
                  results.splitDeferred.push(stryMutAct_9fa48("106943") ? {} : (stryCov_9fa48("106943"), {
                    partitionId,
                    reason: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE
                  }));
                  this.emit(SPLIT_MERGE_EVENT.SPLIT_DEFERRED, stryMutAct_9fa48("106944") ? {} : (stryCov_9fa48("106944"), {
                    partitionId,
                    reason: SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE
                  }));
                  continue;
                }
              }
              stryMutAct_9fa48("106945") ? splitExecutionAttempts -= NUM.ONE : (stryCov_9fa48("106945"), splitExecutionAttempts += NUM.ONE);
              try {
                if (stryMutAct_9fa48("106946")) {
                  {}
                } else {
                  stryCov_9fa48("106946");
                  const execution = await this.executeManagedSplitCandidate(partitionId);
                  this.recordManagedSplitExecutionOutcome(results, partitionId, execution);
                }
              } catch (error) {
                if (stryMutAct_9fa48("106947")) {
                  {}
                } else {
                  stryCov_9fa48("106947");
                  this.logger.error(SPLIT_MERGE_LOG_MSG.SPLIT_EXECUTION_FAILED, stryMutAct_9fa48("106948") ? {} : (stryCov_9fa48("106948"), {
                    partitionId,
                    error: error.message,
                    phase: stryMutAct_9fa48("106949") ? "" : (stryCov_9fa48("106949"), 'workflow_execution')
                  }));
                  results.splitErrors.push(stryMutAct_9fa48("106950") ? {} : (stryCov_9fa48("106950"), {
                    partitionId,
                    error: error.message
                  }));
                }
              }
            }
          }

          // Merge eligibility is never blocked by capacity pressure
          // (Req 7.3). Merges reduce storage usage and remain
          // eligible even under hard/exhausted pressure.
          const sortedPartitions = this.keyRangeManager ? this.keyRangeManager.getSortedPartitions() : this.sortEvaluationPartitions(partitions);
          for (let i = NUM.ZERO; stryMutAct_9fa48("106953") ? i >= sortedPartitions.length - NUM.ONE : stryMutAct_9fa48("106952") ? i <= sortedPartitions.length - NUM.ONE : stryMutAct_9fa48("106951") ? false : (stryCov_9fa48("106951", "106952", "106953"), i < (stryMutAct_9fa48("106954") ? sortedPartitions.length + NUM.ONE : (stryCov_9fa48("106954"), sortedPartitions.length - NUM.ONE))); stryMutAct_9fa48("106955") ? i-- : (stryCov_9fa48("106955"), i++)) {
            if (stryMutAct_9fa48("106956")) {
              {}
            } else {
              stryCov_9fa48("106956");
              const leftPartition = sortedPartitions[i];
              const rightPartition = sortedPartitions[stryMutAct_9fa48("106957") ? i - NUM.ONE : (stryCov_9fa48("106957"), i + NUM.ONE)];
              const leftId = this.keyRangeManager ? leftPartition.partitionId : this.getPartitionId(leftPartition);
              const rightId = this.keyRangeManager ? rightPartition.partitionId : this.getPartitionId(rightPartition);
              if (stryMutAct_9fa48("106960") ? !leftId && !rightId : stryMutAct_9fa48("106959") ? false : stryMutAct_9fa48("106958") ? true : (stryCov_9fa48("106958", "106959", "106960"), (stryMutAct_9fa48("106961") ? leftId : (stryCov_9fa48("106961"), !leftId)) || (stryMutAct_9fa48("106962") ? rightId : (stryCov_9fa48("106962"), !rightId)))) {
                if (stryMutAct_9fa48("106963")) {
                  {}
                } else {
                  stryCov_9fa48("106963");
                  continue;
                }
              }
              if (stryMutAct_9fa48("106966") ? !this.keyRangeManager || this.getPartitionTableId(leftPartition) !== this.getPartitionTableId(rightPartition) : stryMutAct_9fa48("106965") ? false : stryMutAct_9fa48("106964") ? true : (stryCov_9fa48("106964", "106965", "106966"), (stryMutAct_9fa48("106967") ? this.keyRangeManager : (stryCov_9fa48("106967"), !this.keyRangeManager)) && (stryMutAct_9fa48("106969") ? this.getPartitionTableId(leftPartition) === this.getPartitionTableId(rightPartition) : stryMutAct_9fa48("106968") ? true : (stryCov_9fa48("106968", "106969"), this.getPartitionTableId(leftPartition) !== this.getPartitionTableId(rightPartition))))) {
                if (stryMutAct_9fa48("106970")) {
                  {}
                } else {
                  stryCov_9fa48("106970");
                  continue;
                }
              }
              if (stryMutAct_9fa48("106973") ? !this.keyRangeManager || this.comparePartitionKeys(this.getPartitionEndKey(leftPartition), this.getPartitionStartKey(rightPartition)) !== NUM.ZERO : stryMutAct_9fa48("106972") ? false : stryMutAct_9fa48("106971") ? true : (stryCov_9fa48("106971", "106972", "106973"), (stryMutAct_9fa48("106974") ? this.keyRangeManager : (stryCov_9fa48("106974"), !this.keyRangeManager)) && (stryMutAct_9fa48("106976") ? this.comparePartitionKeys(this.getPartitionEndKey(leftPartition), this.getPartitionStartKey(rightPartition)) === NUM.ZERO : stryMutAct_9fa48("106975") ? true : (stryCov_9fa48("106975", "106976"), this.comparePartitionKeys(this.getPartitionEndKey(leftPartition), this.getPartitionStartKey(rightPartition)) !== NUM.ZERO)))) {
                if (stryMutAct_9fa48("106977")) {
                  {}
                } else {
                  stryCov_9fa48("106977");
                  continue;
                }
              }
              const leftMetrics = await this.resolvePartitionMetrics(leftPartition);
              const rightMetrics = await this.resolvePartitionMetrics(rightPartition);
              const policy = await this.getTablePolicy(leftId);
              if (stryMutAct_9fa48("106979") ? false : stryMutAct_9fa48("106978") ? true : (stryCov_9fa48("106978", "106979"), this.evaluateMergeCriteria(leftId, rightId, leftMetrics, rightMetrics, policy))) {
                if (stryMutAct_9fa48("106980")) {
                  {}
                } else {
                  stryCov_9fa48("106980");
                  results.mergeCandidates.push(stryMutAct_9fa48("106981") ? {} : (stryCov_9fa48("106981"), {
                    leftId,
                    rightId
                  }));
                  this.logger.debug(SPLIT_MERGE_LOG_MSG.MERGE_ELIGIBLE_UNDER_PRESSURE, stryMutAct_9fa48("106982") ? {} : (stryCov_9fa48("106982"), {
                    leftId,
                    rightId
                  }));
                }
              }
            }
          }
          this.logger.debug(SPLIT_MERGE_LOG_MSG.PARTITION_EVAL_COMPLETED, stryMutAct_9fa48("106983") ? {} : (stryCov_9fa48("106983"), {
            partitionsEvaluated: results.partitionsEvaluated,
            splitCandidates: results.splitCandidates.length,
            splitDeferred: results.splitDeferred.length,
            mergeCandidates: results.mergeCandidates.length
          }));
          this.emit(SPLIT_MERGE_EVENT.EVALUATION_COMPLETED, results);
          this.recordEvaluationSuccess(results, evaluationStartedAtMs);
          return results;
        }
      } catch (error) {
        if (stryMutAct_9fa48("106984")) {
          {}
        } else {
          stryCov_9fa48("106984");
          this.recordEvaluationFailure(error, evaluationStartedAtMs);
          throw error;
        }
      } finally {
        if (stryMutAct_9fa48("106985")) {
          {}
        } else {
          stryCov_9fa48("106985");
          this.state = OperationState.IDLE;
        }
      }
    }
  }

  /**
   * Get the current operation state.
   * @return {string} Current state.
   */
  getState() {
    if (stryMutAct_9fa48("106986")) {
      {}
    } else {
      stryCov_9fa48("106986");
      return this.state;
    }
  }

  /**
   * Get the configured thresholds.
   * @return {Object} Threshold configuration.
   */
  getThresholds() {
    if (stryMutAct_9fa48("106987")) {
      {}
    } else {
      stryCov_9fa48("106987");
      return stryMutAct_9fa48("106988") ? {} : (stryCov_9fa48("106988"), {
        splitStorageThreshold: this.splitStorageThreshold,
        splitTrafficThreshold: this.splitTrafficThreshold,
        mergeStorageThreshold: this.mergeStorageThreshold,
        mergeTrafficThreshold: this.mergeTrafficThreshold,
        evaluationIntervalMs: this.evaluationIntervalMs,
        maxAutoExecuteSplitsPerEvaluation: this.maxAutoExecuteSplitsPerEvaluation
      });
    }
  }

  /**
   * Get split/merge evaluation diagnostics for control-plane snapshots.
   * @return {Object}
   */
  getEvaluationDiagnostics() {
    if (stryMutAct_9fa48("106989")) {
      {}
    } else {
      stryCov_9fa48("106989");
      return stryMutAct_9fa48("106990") ? {} : (stryCov_9fa48("106990"), {
        state: this.state,
        evaluationIntervalMs: this.evaluationIntervalMs,
        reactiveEvaluationDebounceMs: this.reactiveEvaluationDebounceMs,
        inFlight: stryMutAct_9fa48("106993") ? this.state !== OperationState.EVALUATING : stryMutAct_9fa48("106992") ? false : stryMutAct_9fa48("106991") ? true : (stryCov_9fa48("106991", "106992", "106993"), this.state === OperationState.EVALUATING),
        deferredRetryEvaluationPending: stryMutAct_9fa48("106996") ? this.deferredRetryEvaluation === null : stryMutAct_9fa48("106995") ? false : stryMutAct_9fa48("106994") ? true : (stryCov_9fa48("106994", "106995", "106996"), this.deferredRetryEvaluation !== null),
        deferredRetryEvaluationDueAtMs: this.deferredRetryEvaluationDueAtMs,
        requestedEvaluationPending: stryMutAct_9fa48("106999") ? this.requestedEvaluation === null : stryMutAct_9fa48("106998") ? false : stryMutAct_9fa48("106997") ? true : (stryCov_9fa48("106997", "106998", "106999"), this.requestedEvaluation !== null),
        requestedAtMs: this.lastEvaluationRequestedAtMs,
        requestedReasonCodes: stryMutAct_9fa48("107000") ? [] : (stryCov_9fa48("107000"), [...this.lastEvaluationReasonCodes]),
        requestedPartitionIds: stryMutAct_9fa48("107001") ? [] : (stryCov_9fa48("107001"), [...this.lastEvaluationPartitionIds]),
        lastTrigger: this.lastEvaluationTrigger,
        lastStartedAtMs: this.lastEvaluationStartedAtMs,
        lastCompletedAtMs: this.lastEvaluationCompletedAtMs,
        lastDurationMs: this.lastEvaluationDurationMs,
        lastError: this.lastEvaluationError,
        lastSummary: (stryMutAct_9fa48("107004") ? this.lastEvaluationSummary || typeof this.lastEvaluationSummary === 'object' : stryMutAct_9fa48("107003") ? false : stryMutAct_9fa48("107002") ? true : (stryCov_9fa48("107002", "107003", "107004"), this.lastEvaluationSummary && (stryMutAct_9fa48("107006") ? typeof this.lastEvaluationSummary !== 'object' : stryMutAct_9fa48("107005") ? true : (stryCov_9fa48("107005", "107006"), typeof this.lastEvaluationSummary === (stryMutAct_9fa48("107007") ? "" : (stryCov_9fa48("107007"), 'object')))))) ? stryMutAct_9fa48("107008") ? {} : (stryCov_9fa48("107008"), {
          ...this.lastEvaluationSummary
        }) : null
      });
    }
  }

  /**
   * Update thresholds dynamically.
   * @param {Object} thresholds - New threshold values.
   */
  setThresholds(thresholds) {
    if (stryMutAct_9fa48("107009")) {
      {}
    } else {
      stryCov_9fa48("107009");
      if (stryMutAct_9fa48("107012") ? thresholds.splitStorageThreshold === undefined : stryMutAct_9fa48("107011") ? false : stryMutAct_9fa48("107010") ? true : (stryCov_9fa48("107010", "107011", "107012"), thresholds.splitStorageThreshold !== undefined)) {
        if (stryMutAct_9fa48("107013")) {
          {}
        } else {
          stryCov_9fa48("107013");
          this.splitStorageThreshold = thresholds.splitStorageThreshold;
        }
      }
      if (stryMutAct_9fa48("107016") ? thresholds.splitTrafficThreshold === undefined : stryMutAct_9fa48("107015") ? false : stryMutAct_9fa48("107014") ? true : (stryCov_9fa48("107014", "107015", "107016"), thresholds.splitTrafficThreshold !== undefined)) {
        if (stryMutAct_9fa48("107017")) {
          {}
        } else {
          stryCov_9fa48("107017");
          this.splitTrafficThreshold = thresholds.splitTrafficThreshold;
        }
      }
      if (stryMutAct_9fa48("107020") ? thresholds.mergeStorageThreshold === undefined : stryMutAct_9fa48("107019") ? false : stryMutAct_9fa48("107018") ? true : (stryCov_9fa48("107018", "107019", "107020"), thresholds.mergeStorageThreshold !== undefined)) {
        if (stryMutAct_9fa48("107021")) {
          {}
        } else {
          stryCov_9fa48("107021");
          this.mergeStorageThreshold = thresholds.mergeStorageThreshold;
        }
      }
      if (stryMutAct_9fa48("107024") ? thresholds.mergeTrafficThreshold === undefined : stryMutAct_9fa48("107023") ? false : stryMutAct_9fa48("107022") ? true : (stryCov_9fa48("107022", "107023", "107024"), thresholds.mergeTrafficThreshold !== undefined)) {
        if (stryMutAct_9fa48("107025")) {
          {}
        } else {
          stryCov_9fa48("107025");
          this.mergeTrafficThreshold = thresholds.mergeTrafficThreshold;
        }
      }
      if (stryMutAct_9fa48("107028") ? thresholds.evaluationIntervalMs === undefined : stryMutAct_9fa48("107027") ? false : stryMutAct_9fa48("107026") ? true : (stryCov_9fa48("107026", "107027", "107028"), thresholds.evaluationIntervalMs !== undefined)) {
        if (stryMutAct_9fa48("107029")) {
          {}
        } else {
          stryCov_9fa48("107029");
          this.evaluationIntervalMs = thresholds.evaluationIntervalMs;
        }
      }
      if (stryMutAct_9fa48("107032") ? thresholds.maxAutoExecuteSplitsPerEvaluation === undefined : stryMutAct_9fa48("107031") ? false : stryMutAct_9fa48("107030") ? true : (stryCov_9fa48("107030", "107031", "107032"), thresholds.maxAutoExecuteSplitsPerEvaluation !== undefined)) {
        if (stryMutAct_9fa48("107033")) {
          {}
        } else {
          stryCov_9fa48("107033");
          this.maxAutoExecuteSplitsPerEvaluation = thresholds.maxAutoExecuteSplitsPerEvaluation;
        }
      }
      this.logger.info(SPLIT_MERGE_LOG_MSG.THRESHOLDS_UPDATED, this.getThresholds());
    }
  }

  /**
   * Shutdown the manager.
   */
  shutdown() {
    if (stryMutAct_9fa48("107034")) {
      {}
    } else {
      stryCov_9fa48("107034");
      this.isShutdown = stryMutAct_9fa48("107035") ? false : (stryCov_9fa48("107035"), true);
      this.stopPeriodicEvaluation();
      if (stryMutAct_9fa48("107037") ? false : stryMutAct_9fa48("107036") ? true : (stryCov_9fa48("107036", "107037"), this.requestedEvaluationTimer)) {
        if (stryMutAct_9fa48("107038")) {
          {}
        } else {
          stryCov_9fa48("107038");
          clearTimeout(this.requestedEvaluationTimer);
          this.requestedEvaluationTimer = null;
        }
      }
      this.requestedEvaluationDueAtMs = null;
      if (stryMutAct_9fa48("107040") ? false : stryMutAct_9fa48("107039") ? true : (stryCov_9fa48("107039", "107040"), this.deferredRetryEvaluationTimer)) {
        if (stryMutAct_9fa48("107041")) {
          {}
        } else {
          stryCov_9fa48("107041");
          clearTimeout(this.deferredRetryEvaluationTimer);
          this.deferredRetryEvaluationTimer = null;
        }
      }
      this.deferredRetryEvaluation = null;
      this.deferredRetryEvaluationDueAtMs = null;
      this.requestedEvaluation = null;
      this.clearRequestedEvaluationDiagnostics();
      this.removeAllListeners();
      this.logger.info(SPLIT_MERGE_LOG_MSG.MANAGER_SHUTDOWN);
    }
  }
}
export { PartitionSplitMergeManager, OperationState, DEFAULT_SPLIT_STORAGE_THRESHOLD, DEFAULT_SPLIT_TRAFFIC_THRESHOLD, DEFAULT_MERGE_STORAGE_THRESHOLD, DEFAULT_MERGE_TRAFFIC_THRESHOLD, DEFAULT_EVALUATION_INTERVAL_MS, DEFAULT_MAX_AUTO_EXECUTE_SPLITS_PER_EVALUATION };