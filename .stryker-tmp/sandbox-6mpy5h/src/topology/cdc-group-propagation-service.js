/**
 * CDCGroupPropagationService - single owner for topology-aware CDC fanout.
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
import { ConfigurationManager } from '../config/configuration-manager.js';
import { LoggingService } from '../logging/logging-service.js';
import { assertCritical } from '../utils/assert.js';
import { getSystemCachePrimaryKeyFieldOrFallback } from '../cache/system-cache-key-descriptor.js';
import { isTableInternalCachePropagationEnabled } from '../cache/cdc-table-policy.js';
import { COLUMN, NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES, TYPEOF } from '../constants/index.js';
import { PRESSURE_WORK_CLASS, PressureGovernor } from '../control-plane/pressure-governor.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { LATENCY_GROUP_STATE, LATENCY_PROPAGATION_MODE, LATENCY_TOPOLOGY_CONFIG_KEY, LATENCY_TOPOLOGY_MESSAGE_TYPE } from './latency-topology-constants.js';
import { CDC_GROUP_PUBLICATION_MODE, CDC_GROUP_PROPAGATION_ERROR_MSG, CDC_GROUP_PROPAGATION_EVENT, CDC_GROUP_PROPAGATION_LOG_MSG, CDC_GROUP_PROPAGATION_REASON, CDC_GROUP_PROPAGATION_RETRY, CDC_GROUP_PROPAGATION_STATE, CDC_GROUP_PROPAGATION_STRATEGY, CDC_GROUP_PROPAGATION_STATUS, CDC_GROUP_PROPAGATION_SUBSYSTEM } from './cdc-group-propagation-constants.js';
const CDC_GROUP_PROPAGATION_SERVICE_LITERAL = Object.freeze(stryMutAct_9fa48("152637") ? {} : (stryCov_9fa48("152637"), {
  BATCH: stryMutAct_9fa48("152638") ? "" : (stryCov_9fa48("152638"), 'batch'),
  VALUE: stryMutAct_9fa48("152639") ? "" : (stryCov_9fa48("152639"), ','),
  VALUE_2: stryMutAct_9fa48("152640") ? "" : (stryCov_9fa48("152640"), '|'),
  CDC_RETRY: stryMutAct_9fa48("152641") ? "" : (stryCov_9fa48("152641"), 'cdc:retry')
}));
const CDC_GROUP_PROPAGATION_MESSAGE = Object.freeze(stryMutAct_9fa48("152642") ? {} : (stryCov_9fa48("152642"), {
  STATUS_DELIVERED: stryMutAct_9fa48("152643") ? "" : (stryCov_9fa48("152643"), 'delivered')
}));
const MESSAGE_GROUP_REPLICA_SUFFIX = stryMutAct_9fa48("152644") ? "" : (stryCov_9fa48("152644"), '-r');
const DELIVERY_ERROR_UNKNOWN = stryMutAct_9fa48("152645") ? "" : (stryCov_9fa48("152645"), 'unknown delivery error');
const PUBLICATION_TRANSITION_HISTORY_LIMIT = 10;
const BACKGROUND_RETRY_PENDING_ERROR = stryMutAct_9fa48("152646") ? "" : (stryCov_9fa48("152646"), 'background_retry_pending');
const IMMEDIATE_BATCH_DELAY_MS = NUM.TEN;
const IMMEDIATE_BATCH_MAX_EVENTS = NUM.SIXTY_FOUR;
function sortObjectKeys(value) {
  if (stryMutAct_9fa48("152647")) {
    {}
  } else {
    stryCov_9fa48("152647");
    if (stryMutAct_9fa48("152649") ? false : stryMutAct_9fa48("152648") ? true : (stryCov_9fa48("152648", "152649"), Array.isArray(value))) {
      if (stryMutAct_9fa48("152650")) {
        {}
      } else {
        stryCov_9fa48("152650");
        return value.map(stryMutAct_9fa48("152651") ? () => undefined : (stryCov_9fa48("152651"), entry => sortObjectKeys(entry)));
      }
    }
    if (stryMutAct_9fa48("152654") ? !value && typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("152653") ? false : stryMutAct_9fa48("152652") ? true : (stryCov_9fa48("152652", "152653", "152654"), (stryMutAct_9fa48("152655") ? value : (stryCov_9fa48("152655"), !value)) || (stryMutAct_9fa48("152657") ? typeof value === TYPEOF.OBJECT : stryMutAct_9fa48("152656") ? false : (stryCov_9fa48("152656", "152657"), typeof value !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("152658")) {
        {}
      } else {
        stryCov_9fa48("152658");
        return value;
      }
    }
    return stryMutAct_9fa48("152659") ? Object.keys(value).reduce((accumulator, key) => {
      accumulator[key] = sortObjectKeys(value[key]);
      return accumulator;
    }, {}) : (stryCov_9fa48("152659"), Object.keys(value).sort().reduce((accumulator, key) => {
      if (stryMutAct_9fa48("152660")) {
        {}
      } else {
        stryCov_9fa48("152660");
        accumulator[key] = sortObjectKeys(value[key]);
        return accumulator;
      }
    }, {}));
  }
}
function stableSerialize(value) {
  if (stryMutAct_9fa48("152661")) {
    {}
  } else {
    stryCov_9fa48("152661");
    return JSON.stringify(sortObjectKeys(value));
  }
}
class CDCGroupPropagationService extends EventEmitter {
  /**
  * @param {Object} options
  * @param {string} options.nodeId
  * @param {Object} options.systemTableCache
  * @param {Object} options.messageRouter
  * @param {Object} options.latencyTreeService
  * @param {Function} options.nowFn
  */
  constructor(options = {}) {
    if (stryMutAct_9fa48("152662")) {
      {}
    } else {
      stryCov_9fa48("152662");
      super();
      this.nodeId = stryMutAct_9fa48("152665") ? options.nodeId && null : stryMutAct_9fa48("152664") ? false : stryMutAct_9fa48("152663") ? true : (stryCov_9fa48("152663", "152664", "152665"), options.nodeId || null);
      this.systemTableCache = stryMutAct_9fa48("152668") ? options.systemTableCache && null : stryMutAct_9fa48("152667") ? false : stryMutAct_9fa48("152666") ? true : (stryCov_9fa48("152666", "152667", "152668"), options.systemTableCache || null);
      this.messageRouter = stryMutAct_9fa48("152671") ? options.messageRouter && null : stryMutAct_9fa48("152670") ? false : stryMutAct_9fa48("152669") ? true : (stryCov_9fa48("152669", "152670", "152671"), options.messageRouter || null);
      this.latencyTreeService = stryMutAct_9fa48("152674") ? options.latencyTreeService && null : stryMutAct_9fa48("152673") ? false : stryMutAct_9fa48("152672") ? true : (stryCov_9fa48("152672", "152673", "152674"), options.latencyTreeService || null);
      this.nowFn = stryMutAct_9fa48("152677") ? options.nowFn && Date.now : stryMutAct_9fa48("152676") ? false : stryMutAct_9fa48("152675") ? true : (stryCov_9fa48("152675", "152676", "152677"), options.nowFn || Date.now);
      this.config = ConfigurationManager.getInstance();
      this.propagationMode = (stryMutAct_9fa48("152680") ? this.config.get(LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE) !== LATENCY_PROPAGATION_MODE.GROUPED : stryMutAct_9fa48("152679") ? false : stryMutAct_9fa48("152678") ? true : (stryCov_9fa48("152678", "152679", "152680"), this.config.get(LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE) === LATENCY_PROPAGATION_MODE.GROUPED)) ? LATENCY_PROPAGATION_MODE.GROUPED : LATENCY_PROPAGATION_MODE.SAFE;
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(CDC_GROUP_PROPAGATION_SUBSYSTEM) : console;
      this.state = CDC_GROUP_PROPAGATION_STATE.CREATED;
      this.stats = stryMutAct_9fa48("152681") ? {} : (stryCov_9fa48("152681"), {
        groupedCount: NUM.ZERO,
        safeCount: NUM.ZERO,
        fallbackCount: NUM.ZERO,
        groupedDeliveryFailureCount: NUM.ZERO,
        lastStrategy: null,
        lastMode: null,
        lastFallbackReason: null,
        lastPropagationAt: null,
        lastTargetGroupCount: NUM.ZERO
      });
      this.deliveryRetryMaxAttempts = this.resolvePositiveInteger(options.deliveryRetryMaxAttempts, CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS);
      this.backgroundRetryMaxAttempts = this.resolvePositiveInteger(options.backgroundRetryMaxAttempts, CDC_GROUP_PROPAGATION_RETRY.BACKGROUND_MAX_ATTEMPTS);
      this.deliveryRetryDelayMs = this.resolvePositiveInteger(options.deliveryRetryDelayMs, CDC_GROUP_PROPAGATION_RETRY.INITIAL_DELAY_MS);
      this.deliveryRetryBackoffMultiplier = this.resolvePositiveNumber(options.deliveryRetryBackoffMultiplier, CDC_GROUP_PROPAGATION_RETRY.BACKOFF_MULTIPLIER);
      this.deliveryRetryMaxDelayMs = this.resolvePositiveInteger(options.deliveryRetryMaxDelayMs, CDC_GROUP_PROPAGATION_RETRY.MAX_DELAY_MS);
      this.backgroundRetryTimers = new Set();
      this.backgroundRetryEntriesByKey = new Map();
      this.immediateBatchTimers = new Set();
      this.immediateBatchEntriesByKey = new Map();
      this.immediateBatchDelayMs = this.resolvePositiveInteger(options.immediateBatchDelayMs, IMMEDIATE_BATCH_DELAY_MS);
      this.immediateBatchMaxEvents = this.resolvePositiveInteger(options.immediateBatchMaxEvents, IMMEDIATE_BATCH_MAX_EVENTS);
      this.publicationModeDiagnostics = this.freezePublicationModeDiagnostics(stryMutAct_9fa48("152682") ? {} : (stryCov_9fa48("152682"), {
        currentMode: (stryMutAct_9fa48("152685") ? this.propagationMode !== LATENCY_PROPAGATION_MODE.GROUPED : stryMutAct_9fa48("152684") ? false : stryMutAct_9fa48("152683") ? true : (stryCov_9fa48("152683", "152684", "152685"), this.propagationMode === LATENCY_PROPAGATION_MODE.GROUPED)) ? CDC_GROUP_PUBLICATION_MODE.GROUPED : CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY,
        reasonCode: (stryMutAct_9fa48("152688") ? this.propagationMode !== LATENCY_PROPAGATION_MODE.GROUPED : stryMutAct_9fa48("152687") ? false : stryMutAct_9fa48("152686") ? true : (stryCov_9fa48("152686", "152687", "152688"), this.propagationMode === LATENCY_PROPAGATION_MODE.GROUPED)) ? null : CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE,
        enteredAt: this.toIsoTimestamp(this.now()),
        recentTransitions: stryMutAct_9fa48("152689") ? ["Stryker was here"] : (stryCov_9fa48("152689"), [])
      }));
    }
  } /**
    * Initialize dependencies.
    * @param {Object} options
    */
  initialize(options = {}) {
    if (stryMutAct_9fa48("152690")) {
      {}
    } else {
      stryCov_9fa48("152690");
      if (stryMutAct_9fa48("152692") ? false : stryMutAct_9fa48("152691") ? true : (stryCov_9fa48("152691", "152692"), options.nodeId)) {
        if (stryMutAct_9fa48("152693")) {
          {}
        } else {
          stryCov_9fa48("152693");
          this.nodeId = options.nodeId;
        }
      }
      if (stryMutAct_9fa48("152695") ? false : stryMutAct_9fa48("152694") ? true : (stryCov_9fa48("152694", "152695"), options.systemTableCache)) {
        if (stryMutAct_9fa48("152696")) {
          {}
        } else {
          stryCov_9fa48("152696");
          this.systemTableCache = options.systemTableCache;
        }
      }
      if (stryMutAct_9fa48("152698") ? false : stryMutAct_9fa48("152697") ? true : (stryCov_9fa48("152697", "152698"), options.messageRouter)) {
        if (stryMutAct_9fa48("152699")) {
          {}
        } else {
          stryCov_9fa48("152699");
          this.messageRouter = options.messageRouter;
        }
      }
      if (stryMutAct_9fa48("152701") ? false : stryMutAct_9fa48("152700") ? true : (stryCov_9fa48("152700", "152701"), options.latencyTreeService)) {
        if (stryMutAct_9fa48("152702")) {
          {}
        } else {
          stryCov_9fa48("152702");
          this.latencyTreeService = options.latencyTreeService;
        }
      }
      if (stryMutAct_9fa48("152704") ? false : stryMutAct_9fa48("152703") ? true : (stryCov_9fa48("152703", "152704"), options.nowFn)) {
        if (stryMutAct_9fa48("152705")) {
          {}
        } else {
          stryCov_9fa48("152705");
          this.nowFn = options.nowFn;
        }
      }
      this.nodeId = assertCritical(this.nodeId, CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_NODE_ID);
      this.systemTableCache = assertCritical(this.systemTableCache, CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CACHE);
      this.latencyTreeService = assertCritical(this.latencyTreeService, CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_TREE_SERVICE);
      this.refreshConfig();
      this.state = CDC_GROUP_PROPAGATION_STATE.INITIALIZED;
      this.logger.info(CDC_GROUP_PROPAGATION_LOG_MSG.INITIALIZED, stryMutAct_9fa48("152706") ? {} : (stryCov_9fa48("152706"), {
        nodeId: this.nodeId,
        propagationMode: this.propagationMode
      }));
    }
  } /**
    * Start propagation lifecycle.
    */
  start() {
    if (stryMutAct_9fa48("152707")) {
      {}
    } else {
      stryCov_9fa48("152707");
      this.ensureInitialized();
      this.refreshConfig();
      this.state = CDC_GROUP_PROPAGATION_STATE.RUNNING;
      this.logger.info(CDC_GROUP_PROPAGATION_LOG_MSG.STARTED, stryMutAct_9fa48("152708") ? {} : (stryCov_9fa48("152708"), {
        nodeId: this.nodeId,
        propagationMode: this.propagationMode
      }));
    }
  } /**
    * Stop propagation lifecycle.
    */
  stop() {
    if (stryMutAct_9fa48("152709")) {
      {}
    } else {
      stryCov_9fa48("152709");
      this.state = CDC_GROUP_PROPAGATION_STATE.STOPPED;
      this.clearBackgroundRetryTimers();
      this.clearImmediateBatchTimers();
      this.logger.info(CDC_GROUP_PROPAGATION_LOG_MSG.STOPPED, stryMutAct_9fa48("152710") ? {} : (stryCov_9fa48("152710"), {
        nodeId: this.nodeId
      }));
    }
  } /**
    * Propagate one CDC event through grouped mode or safe mode.
    * @param {Object} options
    * @param {string} options.tableName
    * @param {string} options.operation
    * @param {Object} options.data
    * @param {Object} options.sourceMessageGroupService
    * @return {Promise<Object>}
    */
  async propagateCDCEvent(options = {}) {
    if (stryMutAct_9fa48("152711")) {
      {}
    } else {
      stryCov_9fa48("152711");
      this.ensureInitialized();
      const tableName = options.tableName;
      const operation = options.operation;
      const data = options.data;
      const sourceMessageGroupService = options.sourceMessageGroupService;
      assertCritical(stryMutAct_9fa48("152714") ? sourceMessageGroupService || typeof sourceMessageGroupService.applyCDCEvent === TYPEOF.FUNCTION : stryMutAct_9fa48("152713") ? false : stryMutAct_9fa48("152712") ? true : (stryCov_9fa48("152712", "152713", "152714"), sourceMessageGroupService && (stryMutAct_9fa48("152716") ? typeof sourceMessageGroupService.applyCDCEvent !== TYPEOF.FUNCTION : stryMutAct_9fa48("152715") ? true : (stryCov_9fa48("152715", "152716"), typeof sourceMessageGroupService.applyCDCEvent === TYPEOF.FUNCTION))), CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_MESSAGE_GROUP_SERVICE);
      assertCritical(stryMutAct_9fa48("152719") ? tableName && operation || data : stryMutAct_9fa48("152718") ? false : stryMutAct_9fa48("152717") ? true : (stryCov_9fa48("152717", "152718", "152719"), (stryMutAct_9fa48("152721") ? tableName || operation : stryMutAct_9fa48("152720") ? true : (stryCov_9fa48("152720", "152721"), tableName && operation)) && data), CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CDC_PAYLOAD);
      this.refreshConfig();
      if (stryMutAct_9fa48("152724") ? this.propagationMode === LATENCY_PROPAGATION_MODE.GROUPED : stryMutAct_9fa48("152723") ? false : stryMutAct_9fa48("152722") ? true : (stryCov_9fa48("152722", "152723", "152724"), this.propagationMode !== LATENCY_PROPAGATION_MODE.GROUPED)) {
        if (stryMutAct_9fa48("152725")) {
          {}
        } else {
          stryCov_9fa48("152725");
          this.setPublicationMode(CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY, CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE);
          return this.propagateSafe(stryMutAct_9fa48("152726") ? {} : (stryCov_9fa48("152726"), {
            tableName,
            operation,
            data,
            sourceMessageGroupService,
            fallbackReason: CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE
          }));
        }
      }
      const groupedContext = this.buildGroupedContext();
      if (stryMutAct_9fa48("152728") ? false : stryMutAct_9fa48("152727") ? true : (stryCov_9fa48("152727", "152728"), groupedContext.fallbackReason)) {
        if (stryMutAct_9fa48("152729")) {
          {}
        } else {
          stryCov_9fa48("152729");
          this.setPublicationMode(CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT, groupedContext.fallbackReason);
          return this.propagateSafe(stryMutAct_9fa48("152730") ? {} : (stryCov_9fa48("152730"), {
            tableName,
            operation,
            data,
            sourceMessageGroupService,
            fallbackReason: groupedContext.fallbackReason
          }));
        }
      }
      await sourceMessageGroupService.applyCDCEvent(tableName, operation, data);
      const groupedDeliveryFailures = await this.deliverToTargetsWithRetry(stryMutAct_9fa48("152731") ? {} : (stryCov_9fa48("152731"), {
        tableName,
        operation,
        data,
        sourceGroupId: groupedContext.sourceGroupId,
        targets: groupedContext.targets
      }));
      const groupedFailureCount = groupedDeliveryFailures.length;
      const fallbackRecovery = (stryMutAct_9fa48("152735") ? groupedFailureCount <= NUM.ZERO : stryMutAct_9fa48("152734") ? groupedFailureCount >= NUM.ZERO : stryMutAct_9fa48("152733") ? false : stryMutAct_9fa48("152732") ? true : (stryCov_9fa48("152732", "152733", "152734", "152735"), groupedFailureCount > NUM.ZERO)) ? await this.recoverGroupedDeliveryFailuresWithSafeFanout(stryMutAct_9fa48("152736") ? {} : (stryCov_9fa48("152736"), {
        tableName,
        operation,
        data,
        sourceGroupId: groupedContext.sourceGroupId,
        deliveryFailures: groupedDeliveryFailures
      })) : stryMutAct_9fa48("152737") ? {} : (stryCov_9fa48("152737"), {
        deliveryFailures: groupedDeliveryFailures,
        fallbackUsed: stryMutAct_9fa48("152738") ? true : (stryCov_9fa48("152738"), false)
      });
      const deliveryFailures = fallbackRecovery.deliveryFailures;
      const fallbackUsed = stryMutAct_9fa48("152741") ? fallbackRecovery.fallbackUsed !== true : stryMutAct_9fa48("152740") ? false : stryMutAct_9fa48("152739") ? true : (stryCov_9fa48("152739", "152740", "152741"), fallbackRecovery.fallbackUsed === (stryMutAct_9fa48("152742") ? false : (stryCov_9fa48("152742"), true)));
      const timestamp = this.now();
      stryMutAct_9fa48("152743") ? this.stats.groupedCount -= NUM.ONE : (stryCov_9fa48("152743"), this.stats.groupedCount += NUM.ONE);
      this.stats.lastStrategy = CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR;
      this.stats.lastMode = CDC_GROUP_PROPAGATION_STATUS.GROUPED;
      this.stats.lastFallbackReason = fallbackUsed ? CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE : null;
      this.stats.lastPropagationAt = timestamp;
      this.stats.lastTargetGroupCount = groupedContext.targets.length;
      if (stryMutAct_9fa48("152747") ? groupedFailureCount <= NUM.ZERO : stryMutAct_9fa48("152746") ? groupedFailureCount >= NUM.ZERO : stryMutAct_9fa48("152745") ? false : stryMutAct_9fa48("152744") ? true : (stryCov_9fa48("152744", "152745", "152746", "152747"), groupedFailureCount > NUM.ZERO)) {
        if (stryMutAct_9fa48("152748")) {
          {}
        } else {
          stryCov_9fa48("152748");
          stryMutAct_9fa48("152749") ? this.stats.groupedDeliveryFailureCount -= groupedFailureCount : (stryCov_9fa48("152749"), this.stats.groupedDeliveryFailureCount += groupedFailureCount);
          this.setPublicationMode(CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT, CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE);
          this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.GROUPED_DELIVERY_FAILED, stryMutAct_9fa48("152750") ? {} : (stryCov_9fa48("152750"), {
            nodeId: this.nodeId,
            tableName,
            operation,
            failureCount: groupedFailureCount,
            recoveredCount: stryMutAct_9fa48("152751") ? groupedFailureCount + deliveryFailures.length : (stryCov_9fa48("152751"), groupedFailureCount - deliveryFailures.length),
            unresolvedCount: deliveryFailures.length
          }));
        }
      } else {
        if (stryMutAct_9fa48("152752")) {
          {}
        } else {
          stryCov_9fa48("152752");
          this.setPublicationMode(CDC_GROUP_PUBLICATION_MODE.GROUPED, CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_RECOVERED);
        }
      }
      const result = stryMutAct_9fa48("152753") ? {} : (stryCov_9fa48("152753"), {
        success: stryMutAct_9fa48("152756") ? deliveryFailures.length !== NUM.ZERO : stryMutAct_9fa48("152755") ? false : stryMutAct_9fa48("152754") ? true : (stryCov_9fa48("152754", "152755", "152756"), deliveryFailures.length === NUM.ZERO),
        strategy: CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR,
        mode: CDC_GROUP_PROPAGATION_STATUS.GROUPED,
        status: CDC_GROUP_PROPAGATION_MESSAGE.STATUS_DELIVERED,
        sourceGroupId: groupedContext.sourceGroupId,
        targetGroupCount: groupedContext.targets.length,
        deliveryFailures,
        fallbackReason: fallbackUsed ? CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE : null,
        fallbackStrategy: fallbackUsed ? CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT : null,
        timestamp
      });
      this.emit(CDC_GROUP_PROPAGATION_EVENT.PROPAGATED, result);
      this.logger.debug(CDC_GROUP_PROPAGATION_LOG_MSG.PROPAGATED_GROUPED, stryMutAct_9fa48("152757") ? {} : (stryCov_9fa48("152757"), {
        nodeId: this.nodeId,
        tableName,
        operation,
        strategy: CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR,
        sourceGroupId: groupedContext.sourceGroupId,
        targetGroupCount: groupedContext.targets.length,
        deliveryFailureCount: deliveryFailures.length
      }));
      return result;
    }
  } /**
    * Apply canonical safe propagation path.
    * @param {Object} options
    * @return {Promise<Object>}
    * @private
    */
  async propagateSafe(options) {
    if (stryMutAct_9fa48("152758")) {
      {}
    } else {
      stryCov_9fa48("152758");
      await options.sourceMessageGroupService.applyCDCEvent(options.tableName, options.operation, options.data);
      const sourceGroupId = this.resolveSourceMessageGroupId(options.sourceMessageGroupService);
      const safeTargets = this.buildSafeTargets(sourceGroupId);
      const deliveryFailures = await this.deliverToTargetsWithRetry(stryMutAct_9fa48("152759") ? {} : (stryCov_9fa48("152759"), {
        tableName: options.tableName,
        operation: options.operation,
        data: options.data,
        sourceGroupId,
        targets: safeTargets
      }));
      const timestamp = this.now();
      stryMutAct_9fa48("152760") ? this.stats.safeCount -= NUM.ONE : (stryCov_9fa48("152760"), this.stats.safeCount += NUM.ONE);
      this.stats.lastStrategy = CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT;
      this.stats.lastMode = CDC_GROUP_PROPAGATION_STATUS.SAFE;
      this.stats.lastFallbackReason = stryMutAct_9fa48("152763") ? options.fallbackReason && null : stryMutAct_9fa48("152762") ? false : stryMutAct_9fa48("152761") ? true : (stryCov_9fa48("152761", "152762", "152763"), options.fallbackReason || null);
      this.stats.lastPropagationAt = timestamp;
      this.stats.lastTargetGroupCount = safeTargets.length;
      if (stryMutAct_9fa48("152765") ? false : stryMutAct_9fa48("152764") ? true : (stryCov_9fa48("152764", "152765"), options.fallbackReason)) {
        if (stryMutAct_9fa48("152766")) {
          {}
        } else {
          stryCov_9fa48("152766");
          this.recordSafeFallback(options.fallbackReason, stryMutAct_9fa48("152767") ? {} : (stryCov_9fa48("152767"), {
            tableName: options.tableName,
            operation: options.operation
          }));
        }
      }
      this.logger.debug(CDC_GROUP_PROPAGATION_LOG_MSG.PROPAGATED_SAFE, stryMutAct_9fa48("152768") ? {} : (stryCov_9fa48("152768"), {
        nodeId: this.nodeId,
        tableName: options.tableName,
        operation: options.operation,
        strategy: CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT
      }));
      return stryMutAct_9fa48("152769") ? {} : (stryCov_9fa48("152769"), {
        success: stryMutAct_9fa48("152772") ? deliveryFailures.length !== NUM.ZERO : stryMutAct_9fa48("152771") ? false : stryMutAct_9fa48("152770") ? true : (stryCov_9fa48("152770", "152771", "152772"), deliveryFailures.length === NUM.ZERO),
        strategy: CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT,
        mode: CDC_GROUP_PROPAGATION_STATUS.SAFE,
        status: CDC_GROUP_PROPAGATION_MESSAGE.STATUS_DELIVERED,
        sourceGroupId,
        targetGroupCount: safeTargets.length,
        deliveryFailures,
        fallbackReason: stryMutAct_9fa48("152775") ? options.fallbackReason && null : stryMutAct_9fa48("152774") ? false : stryMutAct_9fa48("152773") ? true : (stryCov_9fa48("152773", "152774", "152775"), options.fallbackReason || null),
        timestamp
      });
    }
  } /**
    * Deliver CDC payload to targets with bounded retry on failed destinations.
    * @param {Object} options
    * @return {Promise<Array<Object>>}
    * @private
    */
  async deliverToTargetsWithRetry(options) {
    if (stryMutAct_9fa48("152776")) {
      {}
    } else {
      stryCov_9fa48("152776");
      const events = this.normalizeDeliveryEvents(options);
      const deliveryLabel = this.describeDeliveryEvents(events);
      const retryKey = (stryMutAct_9fa48("152777") ? options?.events : (stryCov_9fa48("152777"), !(stryMutAct_9fa48("152778") ? options.events : (stryCov_9fa48("152778"), options?.events)))) ? this.buildBackgroundRetryKey(options) : null;
      const allowDeferToExistingRetry = stryMutAct_9fa48("152781") ? options?.allowDeferToExistingRetry === false : stryMutAct_9fa48("152780") ? false : stryMutAct_9fa48("152779") ? true : (stryCov_9fa48("152779", "152780", "152781"), (stryMutAct_9fa48("152782") ? options.allowDeferToExistingRetry : (stryCov_9fa48("152782"), options?.allowDeferToExistingRetry)) !== (stryMutAct_9fa48("152783") ? true : (stryCov_9fa48("152783"), false)));
      if (stryMutAct_9fa48("152786") ? allowDeferToExistingRetry && retryKey || this.backgroundRetryEntriesByKey.has(retryKey) : stryMutAct_9fa48("152785") ? false : stryMutAct_9fa48("152784") ? true : (stryCov_9fa48("152784", "152785", "152786"), (stryMutAct_9fa48("152788") ? allowDeferToExistingRetry || retryKey : stryMutAct_9fa48("152787") ? true : (stryCov_9fa48("152787", "152788"), allowDeferToExistingRetry && retryKey)) && this.backgroundRetryEntriesByKey.has(retryKey))) {
        if (stryMutAct_9fa48("152789")) {
          {}
        } else {
          stryCov_9fa48("152789");
          this.scheduleDeferredDeliveryEvents(events, options, NUM.ONE);
          return this.buildDeferredFailures(options.targets);
        }
      }
      if (stryMutAct_9fa48("152791") ? false : stryMutAct_9fa48("152790") ? true : (stryCov_9fa48("152790", "152791"), this.shouldBatchImmediateDelivery(options))) {
        if (stryMutAct_9fa48("152792")) {
          {}
        } else {
          stryCov_9fa48("152792");
          return this.enqueueImmediateBatch(options);
        }
      }
      if (stryMutAct_9fa48("152794") ? false : stryMutAct_9fa48("152793") ? true : (stryCov_9fa48("152793", "152794"), this.isLocalRouterBackpressured())) {
        if (stryMutAct_9fa48("152795")) {
          {}
        } else {
          stryCov_9fa48("152795");
          this.scheduleDeferredDeliveryEvents(events, options, NUM.ONE);
          return this.buildDeferredFailures(options.targets);
        }
      }
      let pendingTargets = Array.isArray(options.targets) ? stryMutAct_9fa48("152796") ? [] : (stryCov_9fa48("152796"), [...options.targets]) : stryMutAct_9fa48("152797") ? ["Stryker was here"] : (stryCov_9fa48("152797"), []);
      let deliveryFailures = stryMutAct_9fa48("152798") ? ["Stryker was here"] : (stryCov_9fa48("152798"), []);
      let attempt = NUM.ONE;
      const maxAttempts = stryMutAct_9fa48("152799") ? Math.min(NUM.ONE, this.deliveryRetryMaxAttempts) : (stryCov_9fa48("152799"), Math.max(NUM.ONE, this.deliveryRetryMaxAttempts));
      while (stryMutAct_9fa48("152801") ? pendingTargets.length > NUM.ZERO || attempt <= maxAttempts : stryMutAct_9fa48("152800") ? false : (stryCov_9fa48("152800", "152801"), (stryMutAct_9fa48("152804") ? pendingTargets.length <= NUM.ZERO : stryMutAct_9fa48("152803") ? pendingTargets.length >= NUM.ZERO : stryMutAct_9fa48("152802") ? true : (stryCov_9fa48("152802", "152803", "152804"), pendingTargets.length > NUM.ZERO)) && (stryMutAct_9fa48("152807") ? attempt > maxAttempts : stryMutAct_9fa48("152806") ? attempt < maxAttempts : stryMutAct_9fa48("152805") ? true : (stryCov_9fa48("152805", "152806", "152807"), attempt <= maxAttempts)))) {
        if (stryMutAct_9fa48("152808")) {
          {}
        } else {
          stryCov_9fa48("152808");
          deliveryFailures = await this.deliverToTargets(stryMutAct_9fa48("152809") ? {} : (stryCov_9fa48("152809"), {
            ...options,
            targets: pendingTargets
          }));
          if (stryMutAct_9fa48("152812") ? deliveryFailures.length !== NUM.ZERO : stryMutAct_9fa48("152811") ? false : stryMutAct_9fa48("152810") ? true : (stryCov_9fa48("152810", "152811", "152812"), deliveryFailures.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("152813")) {
              {}
            } else {
              stryCov_9fa48("152813");
              return stryMutAct_9fa48("152814") ? ["Stryker was here"] : (stryCov_9fa48("152814"), []);
            }
          }
          if (stryMutAct_9fa48("152818") ? attempt < maxAttempts : stryMutAct_9fa48("152817") ? attempt > maxAttempts : stryMutAct_9fa48("152816") ? false : stryMutAct_9fa48("152815") ? true : (stryCov_9fa48("152815", "152816", "152817", "152818"), attempt >= maxAttempts)) {
            if (stryMutAct_9fa48("152819")) {
              {}
            } else {
              stryCov_9fa48("152819");
              break;
            }
          }
          const retryDelayMs = this.computeRetryDelayMs(attempt);
          this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.RETRYING_DELIVERY_FAILURES, stryMutAct_9fa48("152820") ? {} : (stryCov_9fa48("152820"), {
            nodeId: this.nodeId,
            tableName: deliveryLabel.tableName,
            operation: deliveryLabel.operation,
            eventCount: deliveryLabel.eventCount,
            attempt,
            retryDelayMs,
            failureCount: deliveryFailures.length
          }));
          await this.sleep(retryDelayMs);
          pendingTargets = this.convertFailuresToRetryTargets(deliveryFailures);
          stryMutAct_9fa48("152821") ? attempt -= NUM.ONE : (stryCov_9fa48("152821"), attempt += NUM.ONE);
        }
      }
      if (stryMutAct_9fa48("152825") ? deliveryFailures.length <= NUM.ZERO : stryMutAct_9fa48("152824") ? deliveryFailures.length >= NUM.ZERO : stryMutAct_9fa48("152823") ? false : stryMutAct_9fa48("152822") ? true : (stryCov_9fa48("152822", "152823", "152824", "152825"), deliveryFailures.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("152826")) {
          {}
        } else {
          stryCov_9fa48("152826");
          this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED, stryMutAct_9fa48("152827") ? {} : (stryCov_9fa48("152827"), {
            nodeId: this.nodeId,
            tableName: deliveryLabel.tableName,
            operation: deliveryLabel.operation,
            eventCount: deliveryLabel.eventCount,
            attempts: maxAttempts,
            failureCount: deliveryFailures.length
          }));
          const retryTargets = this.convertFailuresToRetryTargets(deliveryFailures);
          this.scheduleDeferredDeliveryEvents(events, stryMutAct_9fa48("152828") ? {} : (stryCov_9fa48("152828"), {
            ...options,
            targets: retryTargets
          }), stryMutAct_9fa48("152829") ? maxAttempts - NUM.ONE : (stryCov_9fa48("152829"), maxAttempts + NUM.ONE));
        }
      }
      return deliveryFailures;
    }
  } /**
    * Describe one delivery wave for diagnostics.
    * @param {Array<Object>} events
    * @return {{tableName:string|null, operation:string|null, eventCount:number}}
    * @private
    */
  describeDeliveryEvents(events) {
    if (stryMutAct_9fa48("152830")) {
      {}
    } else {
      stryCov_9fa48("152830");
      const normalizedEvents = Array.isArray(events) ? events : stryMutAct_9fa48("152831") ? ["Stryker was here"] : (stryCov_9fa48("152831"), []);
      if (stryMutAct_9fa48("152834") ? normalizedEvents.length !== NUM.ZERO : stryMutAct_9fa48("152833") ? false : stryMutAct_9fa48("152832") ? true : (stryCov_9fa48("152832", "152833", "152834"), normalizedEvents.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("152835")) {
          {}
        } else {
          stryCov_9fa48("152835");
          return stryMutAct_9fa48("152836") ? {} : (stryCov_9fa48("152836"), {
            tableName: null,
            operation: null,
            eventCount: NUM.ZERO
          });
        }
      }
      if (stryMutAct_9fa48("152839") ? normalizedEvents.length !== NUM.ONE : stryMutAct_9fa48("152838") ? false : stryMutAct_9fa48("152837") ? true : (stryCov_9fa48("152837", "152838", "152839"), normalizedEvents.length === NUM.ONE)) {
        if (stryMutAct_9fa48("152840")) {
          {}
        } else {
          stryCov_9fa48("152840");
          return stryMutAct_9fa48("152841") ? {} : (stryCov_9fa48("152841"), {
            tableName: stryMutAct_9fa48("152844") ? normalizedEvents[NUM.ZERO].tableName && null : stryMutAct_9fa48("152843") ? false : stryMutAct_9fa48("152842") ? true : (stryCov_9fa48("152842", "152843", "152844"), normalizedEvents[NUM.ZERO].tableName || null),
            operation: stryMutAct_9fa48("152847") ? normalizedEvents[NUM.ZERO].operation && null : stryMutAct_9fa48("152846") ? false : stryMutAct_9fa48("152845") ? true : (stryCov_9fa48("152845", "152846", "152847"), normalizedEvents[NUM.ZERO].operation || null),
            eventCount: NUM.ONE
          });
        }
      }
      return stryMutAct_9fa48("152848") ? {} : (stryCov_9fa48("152848"), {
        tableName: CDC_GROUP_PROPAGATION_SERVICE_LITERAL.BATCH,
        operation: CDC_GROUP_PROPAGATION_SERVICE_LITERAL.BATCH,
        eventCount: normalizedEvents.length
      });
    }
  } /**
    * Schedule one or more failed delivery events onto the background retry owner.
    * @param {Array<Object>} events
    * @param {Object} options
    * @param {number} attempt
    * @private
    */
  scheduleDeferredDeliveryEvents(events, options, attempt) {
    if (stryMutAct_9fa48("152849")) {
      {}
    } else {
      stryCov_9fa48("152849");
      for (const event of events) {
        if (stryMutAct_9fa48("152850")) {
          {}
        } else {
          stryCov_9fa48("152850");
          this.scheduleBackgroundRetry(stryMutAct_9fa48("152851") ? {} : (stryCov_9fa48("152851"), {
            tableName: event.tableName,
            operation: event.operation,
            data: event.data,
            sourceGroupId: options.sourceGroupId,
            targets: options.targets,
            attempt
          }));
        }
      }
    }
  } /**
    * Return true when one propagation wave should use immediate batching.
    * @param {Object} options
    * @return {boolean}
    * @private
    */
  shouldBatchImmediateDelivery(options) {
    if (stryMutAct_9fa48("152852")) {
      {}
    } else {
      stryCov_9fa48("152852");
      if (stryMutAct_9fa48("152855") ? options?.allowBatching === false && options?.events : stryMutAct_9fa48("152854") ? false : stryMutAct_9fa48("152853") ? true : (stryCov_9fa48("152853", "152854", "152855"), (stryMutAct_9fa48("152857") ? options?.allowBatching !== false : stryMutAct_9fa48("152856") ? false : (stryCov_9fa48("152856", "152857"), (stryMutAct_9fa48("152858") ? options.allowBatching : (stryCov_9fa48("152858"), options?.allowBatching)) === (stryMutAct_9fa48("152859") ? true : (stryCov_9fa48("152859"), false)))) || (stryMutAct_9fa48("152860") ? options.events : (stryCov_9fa48("152860"), options?.events)))) {
        if (stryMutAct_9fa48("152861")) {
          {}
        } else {
          stryCov_9fa48("152861");
          return stryMutAct_9fa48("152862") ? true : (stryCov_9fa48("152862"), false);
        }
      }
      if (stryMutAct_9fa48("152865") ? typeof options?.tableName !== TYPEOF.STRING && options.tableName.length === NUM.ZERO : stryMutAct_9fa48("152864") ? false : stryMutAct_9fa48("152863") ? true : (stryCov_9fa48("152863", "152864", "152865"), (stryMutAct_9fa48("152867") ? typeof options?.tableName === TYPEOF.STRING : stryMutAct_9fa48("152866") ? false : (stryCov_9fa48("152866", "152867"), typeof (stryMutAct_9fa48("152868") ? options.tableName : (stryCov_9fa48("152868"), options?.tableName)) !== TYPEOF.STRING)) || (stryMutAct_9fa48("152870") ? options.tableName.length !== NUM.ZERO : stryMutAct_9fa48("152869") ? false : (stryCov_9fa48("152869", "152870"), options.tableName.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("152871")) {
          {}
        } else {
          stryCov_9fa48("152871");
          return stryMutAct_9fa48("152872") ? true : (stryCov_9fa48("152872"), false);
        }
      }
      if (stryMutAct_9fa48("152875") ? false : stryMutAct_9fa48("152874") ? true : stryMutAct_9fa48("152873") ? isTableInternalCachePropagationEnabled(options.tableName) : (stryCov_9fa48("152873", "152874", "152875"), !isTableInternalCachePropagationEnabled(options.tableName))) {
        if (stryMutAct_9fa48("152876")) {
          {}
        } else {
          stryCov_9fa48("152876");
          return stryMutAct_9fa48("152877") ? true : (stryCov_9fa48("152877"), false);
        }
      }
      return stryMutAct_9fa48("152880") ? Array.isArray(options.targets) || options.targets.length > NUM.ZERO : stryMutAct_9fa48("152879") ? false : stryMutAct_9fa48("152878") ? true : (stryCov_9fa48("152878", "152879", "152880"), Array.isArray(options.targets) && (stryMutAct_9fa48("152883") ? options.targets.length <= NUM.ZERO : stryMutAct_9fa48("152882") ? options.targets.length >= NUM.ZERO : stryMutAct_9fa48("152881") ? true : (stryCov_9fa48("152881", "152882", "152883"), options.targets.length > NUM.ZERO)));
    }
  } /**
    * Queue one immediate propagation wave into the canonical batch owner.
    * Repeated row updates for the same target wave collapse to the latest state.
    * @param {Object} options
    * @return {Promise<Array<Object>>}
    * @private
    */
  enqueueImmediateBatch(options) {
    if (stryMutAct_9fa48("152884")) {
      {}
    } else {
      stryCov_9fa48("152884");
      const batchKey = this.buildImmediateBatchKey(options);
      if (stryMutAct_9fa48("152887") ? false : stryMutAct_9fa48("152886") ? true : stryMutAct_9fa48("152885") ? batchKey : (stryCov_9fa48("152885", "152886", "152887"), !batchKey)) {
        if (stryMutAct_9fa48("152888")) {
          {}
        } else {
          stryCov_9fa48("152888");
          return this.deliverToTargetsWithRetry(stryMutAct_9fa48("152889") ? {} : (stryCov_9fa48("152889"), {
            ...options,
            allowBatching: stryMutAct_9fa48("152890") ? true : (stryCov_9fa48("152890"), false)
          }));
        }
      }
      let entry = this.immediateBatchEntriesByKey.get(batchKey);
      if (stryMutAct_9fa48("152893") ? false : stryMutAct_9fa48("152892") ? true : stryMutAct_9fa48("152891") ? entry : (stryCov_9fa48("152891", "152892", "152893"), !entry)) {
        if (stryMutAct_9fa48("152894")) {
          {}
        } else {
          stryCov_9fa48("152894");
          entry = stryMutAct_9fa48("152895") ? {} : (stryCov_9fa48("152895"), {
            pendingEventsByKey: new Map(),
            resolvers: stryMutAct_9fa48("152896") ? ["Stryker was here"] : (stryCov_9fa48("152896"), []),
            sourceGroupId: stryMutAct_9fa48("152899") ? options.sourceGroupId && null : stryMutAct_9fa48("152898") ? false : stryMutAct_9fa48("152897") ? true : (stryCov_9fa48("152897", "152898", "152899"), options.sourceGroupId || null),
            targets: Array.isArray(options.targets) ? stryMutAct_9fa48("152900") ? [] : (stryCov_9fa48("152900"), [...options.targets]) : stryMutAct_9fa48("152901") ? ["Stryker was here"] : (stryCov_9fa48("152901"), []),
            timer: null
          });
          this.immediateBatchEntriesByKey.set(batchKey, entry);
          this.armImmediateBatchEntry(batchKey, entry);
        }
      }
      const eventKey = this.buildBackgroundRetryEventKey(options);
      entry.pendingEventsByKey.set(eventKey, stryMutAct_9fa48("152902") ? {} : (stryCov_9fa48("152902"), {
        eventKey,
        tableName: options.tableName,
        operation: options.operation,
        data: options.data
      }));
      if (stryMutAct_9fa48("152905") ? entry.pendingEventsByKey.size >= this.immediateBatchMaxEvents || entry.timer : stryMutAct_9fa48("152904") ? false : stryMutAct_9fa48("152903") ? true : (stryCov_9fa48("152903", "152904", "152905"), (stryMutAct_9fa48("152908") ? entry.pendingEventsByKey.size < this.immediateBatchMaxEvents : stryMutAct_9fa48("152907") ? entry.pendingEventsByKey.size > this.immediateBatchMaxEvents : stryMutAct_9fa48("152906") ? true : (stryCov_9fa48("152906", "152907", "152908"), entry.pendingEventsByKey.size >= this.immediateBatchMaxEvents)) && entry.timer)) {
        if (stryMutAct_9fa48("152909")) {
          {}
        } else {
          stryCov_9fa48("152909");
          clearTimeout(entry.timer);
          this.immediateBatchTimers.delete(entry.timer);
          entry.timer = null;
          void this.runImmediateBatchEntry(batchKey, entry);
        }
      }
      return new Promise(resolve => {
        if (stryMutAct_9fa48("152910")) {
          {}
        } else {
          stryCov_9fa48("152910");
          entry.resolvers.push(resolve);
        }
      });
    }
  } /**
    * Build a canonical key for one immediate publication batch.
    * @param {Object} options
    * @return {string|null}
    * @private
    */
  buildImmediateBatchKey(options) {
    if (stryMutAct_9fa48("152911")) {
      {}
    } else {
      stryCov_9fa48("152911");
      const targetGroupIds = Array.isArray(stryMutAct_9fa48("152912") ? options.targets : (stryCov_9fa48("152912"), options?.targets)) ? stryMutAct_9fa48("152913") ? [...new Set(options.targets.map(target => target?.groupId).filter(groupId => typeof groupId === TYPEOF.STRING && groupId.length > NUM.ZERO))] : (stryCov_9fa48("152913"), (stryMutAct_9fa48("152914") ? [] : (stryCov_9fa48("152914"), [...new Set(stryMutAct_9fa48("152915") ? options.targets.map(target => target?.groupId) : (stryCov_9fa48("152915"), options.targets.map(stryMutAct_9fa48("152916") ? () => undefined : (stryCov_9fa48("152916"), target => stryMutAct_9fa48("152917") ? target.groupId : (stryCov_9fa48("152917"), target?.groupId))).filter(stryMutAct_9fa48("152918") ? () => undefined : (stryCov_9fa48("152918"), groupId => stryMutAct_9fa48("152921") ? typeof groupId === TYPEOF.STRING || groupId.length > NUM.ZERO : stryMutAct_9fa48("152920") ? false : stryMutAct_9fa48("152919") ? true : (stryCov_9fa48("152919", "152920", "152921"), (stryMutAct_9fa48("152923") ? typeof groupId !== TYPEOF.STRING : stryMutAct_9fa48("152922") ? true : (stryCov_9fa48("152922", "152923"), typeof groupId === TYPEOF.STRING)) && (stryMutAct_9fa48("152926") ? groupId.length <= NUM.ZERO : stryMutAct_9fa48("152925") ? groupId.length >= NUM.ZERO : stryMutAct_9fa48("152924") ? true : (stryCov_9fa48("152924", "152925", "152926"), groupId.length > NUM.ZERO)))))))])).sort()) : stryMutAct_9fa48("152927") ? ["Stryker was here"] : (stryCov_9fa48("152927"), []);
      if (stryMutAct_9fa48("152930") ? targetGroupIds.length !== NUM.ZERO : stryMutAct_9fa48("152929") ? false : stryMutAct_9fa48("152928") ? true : (stryCov_9fa48("152928", "152929", "152930"), targetGroupIds.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("152931")) {
          {}
        } else {
          stryCov_9fa48("152931");
          return null;
        }
      }
      const sourceGroupId = (stryMutAct_9fa48("152934") ? typeof options?.sourceGroupId !== TYPEOF.STRING : stryMutAct_9fa48("152933") ? false : stryMutAct_9fa48("152932") ? true : (stryCov_9fa48("152932", "152933", "152934"), typeof (stryMutAct_9fa48("152935") ? options.sourceGroupId : (stryCov_9fa48("152935"), options?.sourceGroupId)) === TYPEOF.STRING)) ? options.sourceGroupId : stryMutAct_9fa48("152936") ? "Stryker was here!" : (stryCov_9fa48("152936"), '');
      return (stryMutAct_9fa48("152937") ? [] : (stryCov_9fa48("152937"), [sourceGroupId, targetGroupIds.join(CDC_GROUP_PROPAGATION_SERVICE_LITERAL.VALUE)])).join(CDC_GROUP_PROPAGATION_SERVICE_LITERAL.VALUE_2);
    }
  } /**
    * Arm the timer for one immediate publication batch.
    * @param {string} batchKey
    * @param {Object} entry
    * @private
    */
  armImmediateBatchEntry(batchKey, entry) {
    if (stryMutAct_9fa48("152938")) {
      {}
    } else {
      stryCov_9fa48("152938");
      if (stryMutAct_9fa48("152941") ? entry.timer : stryMutAct_9fa48("152940") ? false : stryMutAct_9fa48("152939") ? true : (stryCov_9fa48("152939", "152940", "152941"), entry?.timer)) {
        if (stryMutAct_9fa48("152942")) {
          {}
        } else {
          stryCov_9fa48("152942");
          return;
        }
      }
      const timer = setTimeout(async () => {
        if (stryMutAct_9fa48("152943")) {
          {}
        } else {
          stryCov_9fa48("152943");
          await this.runImmediateBatchEntry(batchKey, entry);
        }
      }, this.immediateBatchDelayMs);
      entry.timer = timer;
      this.immediateBatchTimers.add(timer);
    }
  } /**
    * Drain one immediate publication batch.
    * @param {string} batchKey
    * @param {Object} entry
    * @return {Promise<void>}
    * @private
    */
  async runImmediateBatchEntry(batchKey, entry) {
    if (stryMutAct_9fa48("152944")) {
      {}
    } else {
      stryCov_9fa48("152944");
      if (stryMutAct_9fa48("152947") ? entry.timer : stryMutAct_9fa48("152946") ? false : stryMutAct_9fa48("152945") ? true : (stryCov_9fa48("152945", "152946", "152947"), entry?.timer)) {
        if (stryMutAct_9fa48("152948")) {
          {}
        } else {
          stryCov_9fa48("152948");
          this.immediateBatchTimers.delete(entry.timer);
          entry.timer = null;
        }
      }
      if (stryMutAct_9fa48("152951") ? this.immediateBatchEntriesByKey.get(batchKey) !== entry : stryMutAct_9fa48("152950") ? false : stryMutAct_9fa48("152949") ? true : (stryCov_9fa48("152949", "152950", "152951"), this.immediateBatchEntriesByKey.get(batchKey) === entry)) {
        if (stryMutAct_9fa48("152952")) {
          {}
        } else {
          stryCov_9fa48("152952");
          this.immediateBatchEntriesByKey.delete(batchKey);
        }
      }
      const events = stryMutAct_9fa48("152953") ? [] : (stryCov_9fa48("152953"), [...entry.pendingEventsByKey.values()]);
      entry.pendingEventsByKey.clear();
      if (stryMutAct_9fa48("152956") ? events.length !== NUM.ZERO : stryMutAct_9fa48("152955") ? false : stryMutAct_9fa48("152954") ? true : (stryCov_9fa48("152954", "152955", "152956"), events.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("152957")) {
          {}
        } else {
          stryCov_9fa48("152957");
          this.resolveImmediateBatch(entry, stryMutAct_9fa48("152958") ? ["Stryker was here"] : (stryCov_9fa48("152958"), []));
          return;
        }
      }
      if (stryMutAct_9fa48("152960") ? false : stryMutAct_9fa48("152959") ? true : (stryCov_9fa48("152959", "152960"), this.isLocalRouterBackpressured())) {
        if (stryMutAct_9fa48("152961")) {
          {}
        } else {
          stryCov_9fa48("152961");
          for (const event of events) {
            if (stryMutAct_9fa48("152962")) {
              {}
            } else {
              stryCov_9fa48("152962");
              this.scheduleBackgroundRetry(stryMutAct_9fa48("152963") ? {} : (stryCov_9fa48("152963"), {
                tableName: event.tableName,
                operation: event.operation,
                data: event.data,
                sourceGroupId: entry.sourceGroupId,
                targets: entry.targets,
                attempt: NUM.ONE
              }));
            }
          }
          this.resolveImmediateBatch(entry, this.buildDeferredFailures(entry.targets));
          return;
        }
      }
      const deliveryFailures = await this.deliverToTargetsWithRetry(stryMutAct_9fa48("152964") ? {} : (stryCov_9fa48("152964"), {
        events,
        sourceGroupId: entry.sourceGroupId,
        targets: entry.targets,
        allowBatching: stryMutAct_9fa48("152965") ? true : (stryCov_9fa48("152965"), false)
      }));
      this.resolveImmediateBatch(entry, deliveryFailures);
    }
  } /**
    * Resolve all waiters attached to one immediate batch entry.
    * @param {Object} entry
    * @param {Array<Object>} deliveryFailures
    * @private
    */
  resolveImmediateBatch(entry, deliveryFailures) {
    if (stryMutAct_9fa48("152966")) {
      {}
    } else {
      stryCov_9fa48("152966");
      const resolvers = Array.isArray(stryMutAct_9fa48("152967") ? entry.resolvers : (stryCov_9fa48("152967"), entry?.resolvers)) ? entry.resolvers : stryMutAct_9fa48("152968") ? ["Stryker was here"] : (stryCov_9fa48("152968"), []);
      entry.resolvers = stryMutAct_9fa48("152969") ? ["Stryker was here"] : (stryCov_9fa48("152969"), []);
      for (const resolve of resolvers) {
        if (stryMutAct_9fa48("152970")) {
          {}
        } else {
          stryCov_9fa48("152970");
          resolve(stryMutAct_9fa48("152971") ? [] : (stryCov_9fa48("152971"), [...deliveryFailures]));
        }
      }
    }
  } /**
    * Continue delivery retries in background after bounded synchronous retries.
    * @param {Object} options
    * @param {string} options.tableName
    * @param {string} options.operation
    * @param {Object} options.data
    * @param {string|null} options.sourceGroupId
    * @param {Array<Object>} options.targets
    * @param {number} options.attempt
    * @private
    */
  scheduleBackgroundRetry(options) {
    if (stryMutAct_9fa48("152972")) {
      {}
    } else {
      stryCov_9fa48("152972");
      if (stryMutAct_9fa48("152975") ? this.state === CDC_GROUP_PROPAGATION_STATE.RUNNING : stryMutAct_9fa48("152974") ? false : stryMutAct_9fa48("152973") ? true : (stryCov_9fa48("152973", "152974", "152975"), this.state !== CDC_GROUP_PROPAGATION_STATE.RUNNING)) {
        if (stryMutAct_9fa48("152976")) {
          {}
        } else {
          stryCov_9fa48("152976");
          return;
        }
      }
      if (stryMutAct_9fa48("152979") ? !Array.isArray(options.targets) && options.targets.length === NUM.ZERO : stryMutAct_9fa48("152978") ? false : stryMutAct_9fa48("152977") ? true : (stryCov_9fa48("152977", "152978", "152979"), (stryMutAct_9fa48("152980") ? Array.isArray(options.targets) : (stryCov_9fa48("152980"), !Array.isArray(options.targets))) || (stryMutAct_9fa48("152982") ? options.targets.length !== NUM.ZERO : stryMutAct_9fa48("152981") ? false : (stryCov_9fa48("152981", "152982"), options.targets.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("152983")) {
          {}
        } else {
          stryCov_9fa48("152983");
          return;
        }
      }
      const {
        tableName,
        operation,
        data,
        sourceGroupId,
        targets
      } = options;
      const retryKey = this.buildBackgroundRetryKey(stryMutAct_9fa48("152984") ? {} : (stryCov_9fa48("152984"), {
        tableName,
        operation,
        sourceGroupId,
        targets
      }));
      const eventKey = this.buildBackgroundRetryEventKey(stryMutAct_9fa48("152985") ? {} : (stryCov_9fa48("152985"), {
        tableName,
        operation,
        data
      }));
      const existingEntry = retryKey ? this.backgroundRetryEntriesByKey.get(retryKey) : null;
      if (stryMutAct_9fa48("152987") ? false : stryMutAct_9fa48("152986") ? true : (stryCov_9fa48("152986", "152987"), existingEntry)) {
        if (stryMutAct_9fa48("152988")) {
          {}
        } else {
          stryCov_9fa48("152988");
          this.recordBackgroundRetryEvent(existingEntry, eventKey, data);
          if (stryMutAct_9fa48("152991") ? false : stryMutAct_9fa48("152990") ? true : stryMutAct_9fa48("152989") ? existingEntry.timer : (stryCov_9fa48("152989", "152990", "152991"), !existingEntry.timer)) {
            if (stryMutAct_9fa48("152992")) {
              {}
            } else {
              stryCov_9fa48("152992");
              this.armBackgroundRetryEntry(retryKey, existingEntry);
            }
          }
          return;
        }
      }
      const attempt = (stryMutAct_9fa48("152995") ? Number.isFinite(options.attempt) || options.attempt > NUM.ZERO : stryMutAct_9fa48("152994") ? false : stryMutAct_9fa48("152993") ? true : (stryCov_9fa48("152993", "152994", "152995"), Number.isFinite(options.attempt) && (stryMutAct_9fa48("152998") ? options.attempt <= NUM.ZERO : stryMutAct_9fa48("152997") ? options.attempt >= NUM.ZERO : stryMutAct_9fa48("152996") ? true : (stryCov_9fa48("152996", "152997", "152998"), options.attempt > NUM.ZERO)))) ? Math.floor(options.attempt) : NUM.ONE;
      options = null;
      const maxTotalAttempts = stryMutAct_9fa48("152999") ? this.deliveryRetryMaxAttempts - this.backgroundRetryMaxAttempts : (stryCov_9fa48("152999"), this.deliveryRetryMaxAttempts + this.backgroundRetryMaxAttempts);
      if (stryMutAct_9fa48("153003") ? attempt < maxTotalAttempts : stryMutAct_9fa48("153002") ? attempt > maxTotalAttempts : stryMutAct_9fa48("153001") ? false : stryMutAct_9fa48("153000") ? true : (stryCov_9fa48("153000", "153001", "153002", "153003"), attempt >= maxTotalAttempts)) {
        if (stryMutAct_9fa48("153004")) {
          {}
        } else {
          stryCov_9fa48("153004");
          this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED, stryMutAct_9fa48("153005") ? {} : (stryCov_9fa48("153005"), {
            nodeId: this.nodeId,
            tableName,
            operation,
            attempt,
            maxTotalAttempts,
            failureCount: targets.length,
            background: stryMutAct_9fa48("153006") ? false : (stryCov_9fa48("153006"), true)
          }));
          return;
        }
      }
      const retryDelayMs = this.computeRetryDelayMs(attempt);
      const entry = stryMutAct_9fa48("153007") ? {} : (stryCov_9fa48("153007"), {
        attempt,
        operation,
        pendingEventsByKey: new Map(),
        sourceGroupId,
        tableName,
        targets: Array.isArray(targets) ? stryMutAct_9fa48("153008") ? [] : (stryCov_9fa48("153008"), [...targets]) : stryMutAct_9fa48("153009") ? ["Stryker was here"] : (stryCov_9fa48("153009"), []),
        timer: null
      });
      this.recordBackgroundRetryEvent(entry, eventKey, data);
      this.armBackgroundRetryEntry(retryKey, entry);
    }
  } /**
    * Arm the retry timer for one background entry.
    * @param {string|null} retryKey
    * @param {Object} entry
    * @private
    */
  armBackgroundRetryEntry(retryKey, entry) {
    if (stryMutAct_9fa48("153010")) {
      {}
    } else {
      stryCov_9fa48("153010");
      if (stryMutAct_9fa48("153013") ? entry.timer : stryMutAct_9fa48("153012") ? false : stryMutAct_9fa48("153011") ? true : (stryCov_9fa48("153011", "153012", "153013"), entry?.timer)) {
        if (stryMutAct_9fa48("153014")) {
          {}
        } else {
          stryCov_9fa48("153014");
          return;
        }
      }
      const attempt = (stryMutAct_9fa48("153017") ? Number.isFinite(entry?.attempt) || entry.attempt > NUM.ZERO : stryMutAct_9fa48("153016") ? false : stryMutAct_9fa48("153015") ? true : (stryCov_9fa48("153015", "153016", "153017"), Number.isFinite(stryMutAct_9fa48("153018") ? entry.attempt : (stryCov_9fa48("153018"), entry?.attempt)) && (stryMutAct_9fa48("153021") ? entry.attempt <= NUM.ZERO : stryMutAct_9fa48("153020") ? entry.attempt >= NUM.ZERO : stryMutAct_9fa48("153019") ? true : (stryCov_9fa48("153019", "153020", "153021"), entry.attempt > NUM.ZERO)))) ? Math.floor(entry.attempt) : NUM.ONE;
      const maxTotalAttempts = stryMutAct_9fa48("153022") ? this.deliveryRetryMaxAttempts - this.backgroundRetryMaxAttempts : (stryCov_9fa48("153022"), this.deliveryRetryMaxAttempts + this.backgroundRetryMaxAttempts);
      if (stryMutAct_9fa48("153026") ? attempt < maxTotalAttempts : stryMutAct_9fa48("153025") ? attempt > maxTotalAttempts : stryMutAct_9fa48("153024") ? false : stryMutAct_9fa48("153023") ? true : (stryCov_9fa48("153023", "153024", "153025", "153026"), attempt >= maxTotalAttempts)) {
        if (stryMutAct_9fa48("153027")) {
          {}
        } else {
          stryCov_9fa48("153027");
          this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED, stryMutAct_9fa48("153028") ? {} : (stryCov_9fa48("153028"), {
            nodeId: this.nodeId,
            tableName: stryMutAct_9fa48("153029") ? entry.tableName : (stryCov_9fa48("153029"), entry?.tableName),
            operation: stryMutAct_9fa48("153030") ? entry.operation : (stryCov_9fa48("153030"), entry?.operation),
            attempt,
            maxTotalAttempts,
            failureCount: stryMutAct_9fa48("153033") ? entry?.pendingEventsByKey?.size && NUM.ZERO : stryMutAct_9fa48("153032") ? false : stryMutAct_9fa48("153031") ? true : (stryCov_9fa48("153031", "153032", "153033"), (stryMutAct_9fa48("153035") ? entry.pendingEventsByKey?.size : stryMutAct_9fa48("153034") ? entry?.pendingEventsByKey.size : (stryCov_9fa48("153034", "153035"), entry?.pendingEventsByKey?.size)) || NUM.ZERO),
            background: stryMutAct_9fa48("153036") ? false : (stryCov_9fa48("153036"), true)
          }));
          if (stryMutAct_9fa48("153038") ? false : stryMutAct_9fa48("153037") ? true : (stryCov_9fa48("153037", "153038"), retryKey)) {
            if (stryMutAct_9fa48("153039")) {
              {}
            } else {
              stryCov_9fa48("153039");
              this.backgroundRetryEntriesByKey.delete(retryKey);
            }
          }
          return;
        }
      }
      const retryDelayMs = this.computeRetryDelayMs(attempt);
      this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.RETRYING_DELIVERY_FAILURES, stryMutAct_9fa48("153040") ? {} : (stryCov_9fa48("153040"), {
        nodeId: this.nodeId,
        tableName: entry.tableName,
        operation: entry.operation,
        attempt,
        retryDelayMs,
        failureCount: entry.pendingEventsByKey.size,
        background: stryMutAct_9fa48("153041") ? false : (stryCov_9fa48("153041"), true)
      }));
      const retryTimer = setTimeout(async () => {
        if (stryMutAct_9fa48("153042")) {
          {}
        } else {
          stryCov_9fa48("153042");
          await this.runBackgroundRetryEntry(retryKey, retryTimer, entry);
        }
      }, retryDelayMs);
      entry.timer = retryTimer;
      this.backgroundRetryTimers.add(retryTimer);
      if (stryMutAct_9fa48("153044") ? false : stryMutAct_9fa48("153043") ? true : (stryCov_9fa48("153043", "153044"), retryKey)) {
        if (stryMutAct_9fa48("153045")) {
          {}
        } else {
          stryCov_9fa48("153045");
          this.backgroundRetryEntriesByKey.set(retryKey, entry);
        }
      }
    }
  } /**
    * Clear all pending background retry timers.
    * @private
    */
  clearBackgroundRetryTimers() {
    if (stryMutAct_9fa48("153046")) {
      {}
    } else {
      stryCov_9fa48("153046");
      for (const retryTimer of this.backgroundRetryTimers) {
        if (stryMutAct_9fa48("153047")) {
          {}
        } else {
          stryCov_9fa48("153047");
          clearTimeout(retryTimer);
        }
      }
      this.backgroundRetryTimers.clear();
      this.backgroundRetryEntriesByKey.clear();
    }
  } /**
    * Clear all pending immediate publication batch timers.
    * @private
    */
  clearImmediateBatchTimers() {
    if (stryMutAct_9fa48("153048")) {
      {}
    } else {
      stryCov_9fa48("153048");
      for (const timer of this.immediateBatchTimers) {
        if (stryMutAct_9fa48("153049")) {
          {}
        } else {
          stryCov_9fa48("153049");
          clearTimeout(timer);
        }
      }
      this.immediateBatchTimers.clear();
      this.immediateBatchEntriesByKey.clear();
    }
  } /**
    * Build a canonical key for one background retry wave.
    * @param {Object} options
    * @return {string|null}
    * @private
    */
  buildBackgroundRetryKey(options) {
    if (stryMutAct_9fa48("153050")) {
      {}
    } else {
      stryCov_9fa48("153050");
      const targetGroupIds = Array.isArray(options.targets) ? stryMutAct_9fa48("153051") ? [...new Set(options.targets.map(target => target?.groupId).filter(groupId => typeof groupId === TYPEOF.STRING && groupId.length > NUM.ZERO))] : (stryCov_9fa48("153051"), (stryMutAct_9fa48("153052") ? [] : (stryCov_9fa48("153052"), [...new Set(stryMutAct_9fa48("153053") ? options.targets.map(target => target?.groupId) : (stryCov_9fa48("153053"), options.targets.map(stryMutAct_9fa48("153054") ? () => undefined : (stryCov_9fa48("153054"), target => stryMutAct_9fa48("153055") ? target.groupId : (stryCov_9fa48("153055"), target?.groupId))).filter(stryMutAct_9fa48("153056") ? () => undefined : (stryCov_9fa48("153056"), groupId => stryMutAct_9fa48("153059") ? typeof groupId === TYPEOF.STRING || groupId.length > NUM.ZERO : stryMutAct_9fa48("153058") ? false : stryMutAct_9fa48("153057") ? true : (stryCov_9fa48("153057", "153058", "153059"), (stryMutAct_9fa48("153061") ? typeof groupId !== TYPEOF.STRING : stryMutAct_9fa48("153060") ? true : (stryCov_9fa48("153060", "153061"), typeof groupId === TYPEOF.STRING)) && (stryMutAct_9fa48("153064") ? groupId.length <= NUM.ZERO : stryMutAct_9fa48("153063") ? groupId.length >= NUM.ZERO : stryMutAct_9fa48("153062") ? true : (stryCov_9fa48("153062", "153063", "153064"), groupId.length > NUM.ZERO)))))))])).sort()) : stryMutAct_9fa48("153065") ? ["Stryker was here"] : (stryCov_9fa48("153065"), []);
      if (stryMutAct_9fa48("153068") ? targetGroupIds.length !== NUM.ZERO : stryMutAct_9fa48("153067") ? false : stryMutAct_9fa48("153066") ? true : (stryCov_9fa48("153066", "153067", "153068"), targetGroupIds.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("153069")) {
          {}
        } else {
          stryCov_9fa48("153069");
          return null;
        }
      }
      const tableName = (stryMutAct_9fa48("153072") ? typeof options.tableName !== TYPEOF.STRING : stryMutAct_9fa48("153071") ? false : stryMutAct_9fa48("153070") ? true : (stryCov_9fa48("153070", "153071", "153072"), typeof options.tableName === TYPEOF.STRING)) ? options.tableName : stryMutAct_9fa48("153073") ? "Stryker was here!" : (stryCov_9fa48("153073"), '');
      const operation = (stryMutAct_9fa48("153076") ? typeof options.operation !== TYPEOF.STRING : stryMutAct_9fa48("153075") ? false : stryMutAct_9fa48("153074") ? true : (stryCov_9fa48("153074", "153075", "153076"), typeof options.operation === TYPEOF.STRING)) ? options.operation : stryMutAct_9fa48("153077") ? "Stryker was here!" : (stryCov_9fa48("153077"), '');
      const sourceGroupId = (stryMutAct_9fa48("153080") ? typeof options.sourceGroupId !== TYPEOF.STRING : stryMutAct_9fa48("153079") ? false : stryMutAct_9fa48("153078") ? true : (stryCov_9fa48("153078", "153079", "153080"), typeof options.sourceGroupId === TYPEOF.STRING)) ? options.sourceGroupId : stryMutAct_9fa48("153081") ? "Stryker was here!" : (stryCov_9fa48("153081"), '');
      return (stryMutAct_9fa48("153082") ? [] : (stryCov_9fa48("153082"), [tableName, operation, sourceGroupId, targetGroupIds.join(CDC_GROUP_PROPAGATION_SERVICE_LITERAL.VALUE)])).join(CDC_GROUP_PROPAGATION_SERVICE_LITERAL.VALUE_2);
    }
  } /**
    * Build a canonical event key for one deferred propagation payload.
    * Uses table primary key when available so repeated row updates collapse
    * to the latest state while preserving distinct rows under one retry wave.
    * @param {Object} options
    * @return {string}
    * @private
    */
  buildBackgroundRetryEventKey(options) {
    if (stryMutAct_9fa48("153083")) {
      {}
    } else {
      stryCov_9fa48("153083");
      const tableName = (stryMutAct_9fa48("153086") ? typeof options?.tableName !== TYPEOF.STRING : stryMutAct_9fa48("153085") ? false : stryMutAct_9fa48("153084") ? true : (stryCov_9fa48("153084", "153085", "153086"), typeof (stryMutAct_9fa48("153087") ? options.tableName : (stryCov_9fa48("153087"), options?.tableName)) === TYPEOF.STRING)) ? options.tableName : stryMutAct_9fa48("153088") ? "Stryker was here!" : (stryCov_9fa48("153088"), '');
      const operation = (stryMutAct_9fa48("153091") ? typeof options?.operation !== TYPEOF.STRING : stryMutAct_9fa48("153090") ? false : stryMutAct_9fa48("153089") ? true : (stryCov_9fa48("153089", "153090", "153091"), typeof (stryMutAct_9fa48("153092") ? options.operation : (stryCov_9fa48("153092"), options?.operation)) === TYPEOF.STRING)) ? options.operation : stryMutAct_9fa48("153093") ? "Stryker was here!" : (stryCov_9fa48("153093"), '');
      const data = (stryMutAct_9fa48("153096") ? options?.data || typeof options.data === TYPEOF.OBJECT : stryMutAct_9fa48("153095") ? false : stryMutAct_9fa48("153094") ? true : (stryCov_9fa48("153094", "153095", "153096"), (stryMutAct_9fa48("153097") ? options.data : (stryCov_9fa48("153097"), options?.data)) && (stryMutAct_9fa48("153099") ? typeof options.data !== TYPEOF.OBJECT : stryMutAct_9fa48("153098") ? true : (stryCov_9fa48("153098", "153099"), typeof options.data === TYPEOF.OBJECT)))) ? options.data : null;
      const pkField = getSystemCachePrimaryKeyFieldOrFallback(tableName, stryMutAct_9fa48("153100") ? "" : (stryCov_9fa48("153100"), 'id'));
      const pkValue = stryMutAct_9fa48("153101") ? (data?.[pkField] ?? data?.id) && null : (stryCov_9fa48("153101"), (stryMutAct_9fa48("153102") ? data?.[pkField] && data?.id : (stryCov_9fa48("153102"), (stryMutAct_9fa48("153103") ? data[pkField] : (stryCov_9fa48("153103"), data?.[pkField])) ?? (stryMutAct_9fa48("153104") ? data.id : (stryCov_9fa48("153104"), data?.id)))) ?? null);
      if (stryMutAct_9fa48("153107") ? pkValue !== null || pkValue !== undefined : stryMutAct_9fa48("153106") ? false : stryMutAct_9fa48("153105") ? true : (stryCov_9fa48("153105", "153106", "153107"), (stryMutAct_9fa48("153109") ? pkValue === null : stryMutAct_9fa48("153108") ? true : (stryCov_9fa48("153108", "153109"), pkValue !== null)) && (stryMutAct_9fa48("153111") ? pkValue === undefined : stryMutAct_9fa48("153110") ? true : (stryCov_9fa48("153110", "153111"), pkValue !== undefined)))) {
        if (stryMutAct_9fa48("153112")) {
          {}
        } else {
          stryCov_9fa48("153112");
          return stryMutAct_9fa48("153113") ? `` : (stryCov_9fa48("153113"), `${tableName}|${operation}|${String(pkValue)}`);
        }
      }
      return stryMutAct_9fa48("153114") ? `` : (stryCov_9fa48("153114"), `${tableName}|${operation}|${stableSerialize(data)}`);
    }
  } /**
    * Record or replace the latest deferred payload for one retry entry.
    * @param {Object} entry
    * @param {string} eventKey
    * @param {Object} data
    * @private
    */
  recordBackgroundRetryEvent(entry, eventKey, data) {
    if (stryMutAct_9fa48("153115")) {
      {}
    } else {
      stryCov_9fa48("153115");
      if (stryMutAct_9fa48("153118") ? !entry && !eventKey : stryMutAct_9fa48("153117") ? false : stryMutAct_9fa48("153116") ? true : (stryCov_9fa48("153116", "153117", "153118"), (stryMutAct_9fa48("153119") ? entry : (stryCov_9fa48("153119"), !entry)) || (stryMutAct_9fa48("153120") ? eventKey : (stryCov_9fa48("153120"), !eventKey)))) {
        if (stryMutAct_9fa48("153121")) {
          {}
        } else {
          stryCov_9fa48("153121");
          return;
        }
      }
      entry.pendingEventsByKey.set(eventKey, stryMutAct_9fa48("153122") ? {} : (stryCov_9fa48("153122"), {
        data,
        eventKey
      }));
    }
  } /**
    * Execute one background retry entry, draining all queued row events and
    * rescheduling only the remaining misses.
    * @param {string|null} retryKey
    * @param {Object} retryTimer
    * @param {Object} entry
    * @return {Promise<void>}
    * @private
    */
  async runBackgroundRetryEntry(retryKey, retryTimer, entry) {
    if (stryMutAct_9fa48("153123")) {
      {}
    } else {
      stryCov_9fa48("153123");
      this.backgroundRetryTimers.delete(retryTimer);
      if (stryMutAct_9fa48("153125") ? false : stryMutAct_9fa48("153124") ? true : (stryCov_9fa48("153124", "153125"), retryKey)) {
        if (stryMutAct_9fa48("153126")) {
          {}
        } else {
          stryCov_9fa48("153126");
          const activeEntry = this.backgroundRetryEntriesByKey.get(retryKey);
          if (stryMutAct_9fa48("153129") ? activeEntry !== entry : stryMutAct_9fa48("153128") ? false : stryMutAct_9fa48("153127") ? true : (stryCov_9fa48("153127", "153128", "153129"), activeEntry === entry)) {
            if (stryMutAct_9fa48("153130")) {
              {}
            } else {
              stryCov_9fa48("153130");
              activeEntry.timer = null;
            }
          }
        }
      }
      if (stryMutAct_9fa48("153133") ? this.state === CDC_GROUP_PROPAGATION_STATE.RUNNING : stryMutAct_9fa48("153132") ? false : stryMutAct_9fa48("153131") ? true : (stryCov_9fa48("153131", "153132", "153133"), this.state !== CDC_GROUP_PROPAGATION_STATE.RUNNING)) {
        if (stryMutAct_9fa48("153134")) {
          {}
        } else {
          stryCov_9fa48("153134");
          return;
        }
      }
      if (stryMutAct_9fa48("153136") ? false : stryMutAct_9fa48("153135") ? true : (stryCov_9fa48("153135", "153136"), this.isLocalRouterBackpressured())) {
        if (stryMutAct_9fa48("153137")) {
          {}
        } else {
          stryCov_9fa48("153137");
          this.rescheduleBackgroundRetryEntry(retryKey, entry);
          return;
        }
      }
      const pendingEvents = stryMutAct_9fa48("153138") ? [] : (stryCov_9fa48("153138"), [...entry.pendingEventsByKey.values()]);
      entry.pendingEventsByKey.clear();
      if (stryMutAct_9fa48("153141") ? pendingEvents.length !== NUM.ZERO : stryMutAct_9fa48("153140") ? false : stryMutAct_9fa48("153139") ? true : (stryCov_9fa48("153139", "153140", "153141"), pendingEvents.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("153142")) {
          {}
        } else {
          stryCov_9fa48("153142");
          if (stryMutAct_9fa48("153144") ? false : stryMutAct_9fa48("153143") ? true : (stryCov_9fa48("153143", "153144"), retryKey)) {
            if (stryMutAct_9fa48("153145")) {
              {}
            } else {
              stryCov_9fa48("153145");
              this.backgroundRetryEntriesByKey.delete(retryKey);
            }
          }
          return;
        }
      }
      const deliveryFailures = await this.deliverToTargets(stryMutAct_9fa48("153146") ? {} : (stryCov_9fa48("153146"), {
        events: pendingEvents.map(stryMutAct_9fa48("153147") ? () => undefined : (stryCov_9fa48("153147"), pendingEvent => stryMutAct_9fa48("153148") ? {} : (stryCov_9fa48("153148"), {
          tableName: entry.tableName,
          operation: entry.operation,
          data: pendingEvent.data
        }))),
        sourceGroupId: entry.sourceGroupId,
        targets: entry.targets
      }));
      if (stryMutAct_9fa48("153152") ? deliveryFailures.length <= NUM.ZERO : stryMutAct_9fa48("153151") ? deliveryFailures.length >= NUM.ZERO : stryMutAct_9fa48("153150") ? false : stryMutAct_9fa48("153149") ? true : (stryCov_9fa48("153149", "153150", "153151", "153152"), deliveryFailures.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("153153")) {
          {}
        } else {
          stryCov_9fa48("153153");
          for (const pendingEvent of pendingEvents) {
            if (stryMutAct_9fa48("153154")) {
              {}
            } else {
              stryCov_9fa48("153154");
              this.recordBackgroundRetryEvent(entry, pendingEvent.eventKey, pendingEvent.data);
            }
          }
        }
      }
      if (stryMutAct_9fa48("153157") ? entry.pendingEventsByKey.size !== NUM.ZERO : stryMutAct_9fa48("153156") ? false : stryMutAct_9fa48("153155") ? true : (stryCov_9fa48("153155", "153156", "153157"), entry.pendingEventsByKey.size === NUM.ZERO)) {
        if (stryMutAct_9fa48("153158")) {
          {}
        } else {
          stryCov_9fa48("153158");
          if (stryMutAct_9fa48("153160") ? false : stryMutAct_9fa48("153159") ? true : (stryCov_9fa48("153159", "153160"), retryKey)) {
            if (stryMutAct_9fa48("153161")) {
              {}
            } else {
              stryCov_9fa48("153161");
              this.backgroundRetryEntriesByKey.delete(retryKey);
            }
          }
          return;
        }
      }
      stryMutAct_9fa48("153162") ? entry.attempt -= NUM.ONE : (stryCov_9fa48("153162"), entry.attempt += NUM.ONE);
      this.rescheduleBackgroundRetryEntry(retryKey, entry);
    }
  } /**
    * Reschedule one existing retry entry if budget remains.
    * @param {string|null} retryKey
    * @param {Object} entry
    * @private
    */
  rescheduleBackgroundRetryEntry(retryKey, entry) {
    if (stryMutAct_9fa48("153163")) {
      {}
    } else {
      stryCov_9fa48("153163");
      const maxTotalAttempts = stryMutAct_9fa48("153164") ? this.deliveryRetryMaxAttempts - this.backgroundRetryMaxAttempts : (stryCov_9fa48("153164"), this.deliveryRetryMaxAttempts + this.backgroundRetryMaxAttempts);
      if (stryMutAct_9fa48("153168") ? entry.attempt < maxTotalAttempts : stryMutAct_9fa48("153167") ? entry.attempt > maxTotalAttempts : stryMutAct_9fa48("153166") ? false : stryMutAct_9fa48("153165") ? true : (stryCov_9fa48("153165", "153166", "153167", "153168"), entry.attempt >= maxTotalAttempts)) {
        if (stryMutAct_9fa48("153169")) {
          {}
        } else {
          stryCov_9fa48("153169");
          this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED, stryMutAct_9fa48("153170") ? {} : (stryCov_9fa48("153170"), {
            nodeId: this.nodeId,
            tableName: entry.tableName,
            operation: entry.operation,
            attempt: entry.attempt,
            maxTotalAttempts,
            failureCount: entry.pendingEventsByKey.size,
            background: stryMutAct_9fa48("153171") ? false : (stryCov_9fa48("153171"), true)
          }));
          if (stryMutAct_9fa48("153173") ? false : stryMutAct_9fa48("153172") ? true : (stryCov_9fa48("153172", "153173"), retryKey)) {
            if (stryMutAct_9fa48("153174")) {
              {}
            } else {
              stryCov_9fa48("153174");
              this.backgroundRetryEntriesByKey.delete(retryKey);
            }
          }
          return;
        }
      }
      this.armBackgroundRetryEntry(retryKey, entry);
    }
  } /**
    * Determine whether the local router is currently backpressured.
    * @return {boolean}
    * @private
    */
  isLocalRouterBackpressured() {
    if (stryMutAct_9fa48("153175")) {
      {}
    } else {
      stryCov_9fa48("153175");
      return PressureGovernor.getShared(stryMutAct_9fa48("153176") ? {} : (stryCov_9fa48("153176"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter
      })).isBackpressured(stryMutAct_9fa48("153177") ? {} : (stryCov_9fa48("153177"), {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        resourceKeys: stryMutAct_9fa48("153178") ? [] : (stryCov_9fa48("153178"), [CDC_GROUP_PROPAGATION_SERVICE_LITERAL.CDC_RETRY])
      }));
    }
  } /**
    * Build immediate deferred failures for a queued retry wave.
    * @param {Array<Object>} targets
    * @return {Array<Object>}
    * @private
    */
  buildDeferredFailures(targets) {
    if (stryMutAct_9fa48("153179")) {
      {}
    } else {
      stryCov_9fa48("153179");
      return (Array.isArray(targets) ? targets : stryMutAct_9fa48("153180") ? ["Stryker was here"] : (stryCov_9fa48("153180"), [])).map(stryMutAct_9fa48("153181") ? () => undefined : (stryCov_9fa48("153181"), target => stryMutAct_9fa48("153182") ? {} : (stryCov_9fa48("153182"), {
        targetGroupId: stryMutAct_9fa48("153185") ? target?.groupId && null : stryMutAct_9fa48("153184") ? false : stryMutAct_9fa48("153183") ? true : (stryCov_9fa48("153183", "153184", "153185"), (stryMutAct_9fa48("153186") ? target.groupId : (stryCov_9fa48("153186"), target?.groupId)) || null),
        coordinatorNodeId: stryMutAct_9fa48("153189") ? target?.coordinatorNodeId && null : stryMutAct_9fa48("153188") ? false : stryMutAct_9fa48("153187") ? true : (stryCov_9fa48("153187", "153188", "153189"), (stryMutAct_9fa48("153190") ? target.coordinatorNodeId : (stryCov_9fa48("153190"), target?.coordinatorNodeId)) || null),
        address: stryMutAct_9fa48("153193") ? target?.address && null : stryMutAct_9fa48("153192") ? false : stryMutAct_9fa48("153191") ? true : (stryCov_9fa48("153191", "153192", "153193"), (stryMutAct_9fa48("153194") ? target.address : (stryCov_9fa48("153194"), target?.address)) || null),
        error: BACKGROUND_RETRY_PENDING_ERROR
      })));
    }
  } /**
    * Convert delivery failures into retry targets.
    * @param {Array<Object>} deliveryFailures
    * @return {Array<Object>}
    * @private
    */
  convertFailuresToRetryTargets(deliveryFailures) {
    if (stryMutAct_9fa48("153195")) {
      {}
    } else {
      stryCov_9fa48("153195");
      const targetsByGroupId = new Map();
      for (const failure of deliveryFailures) {
        if (stryMutAct_9fa48("153196")) {
          {}
        } else {
          stryCov_9fa48("153196");
          const groupId = stryMutAct_9fa48("153197") ? failure.targetGroupId : (stryCov_9fa48("153197"), failure?.targetGroupId);
          if (stryMutAct_9fa48("153200") ? typeof groupId !== TYPEOF.STRING && groupId.length === NUM.ZERO : stryMutAct_9fa48("153199") ? false : stryMutAct_9fa48("153198") ? true : (stryCov_9fa48("153198", "153199", "153200"), (stryMutAct_9fa48("153202") ? typeof groupId === TYPEOF.STRING : stryMutAct_9fa48("153201") ? false : (stryCov_9fa48("153201", "153202"), typeof groupId !== TYPEOF.STRING)) || (stryMutAct_9fa48("153204") ? groupId.length !== NUM.ZERO : stryMutAct_9fa48("153203") ? false : (stryCov_9fa48("153203", "153204"), groupId.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("153205")) {
              {}
            } else {
              stryCov_9fa48("153205");
              continue;
            }
          }
          targetsByGroupId.set(groupId, stryMutAct_9fa48("153206") ? {} : (stryCov_9fa48("153206"), {
            groupId,
            coordinatorNodeId: stryMutAct_9fa48("153209") ? failure?.coordinatorNodeId && null : stryMutAct_9fa48("153208") ? false : stryMutAct_9fa48("153207") ? true : (stryCov_9fa48("153207", "153208", "153209"), (stryMutAct_9fa48("153210") ? failure.coordinatorNodeId : (stryCov_9fa48("153210"), failure?.coordinatorNodeId)) || null),
            address: stryMutAct_9fa48("153213") ? failure?.address && null : stryMutAct_9fa48("153212") ? false : stryMutAct_9fa48("153211") ? true : (stryCov_9fa48("153211", "153212", "153213"), (stryMutAct_9fa48("153214") ? failure.address : (stryCov_9fa48("153214"), failure?.address)) || null)
          }));
        }
      }
      return stryMutAct_9fa48("153215") ? [] : (stryCov_9fa48("153215"), [...targetsByGroupId.values()]);
    }
  } /**
    * Re-drive grouped delivery misses through the conservative direct-fanout
    * path so control-plane metadata converges under coordinator instability.
    * @param {Object} options
    * @return {Promise<{deliveryFailures:Array<Object>, fallbackUsed:boolean}>}
    * @private
    */
  async recoverGroupedDeliveryFailuresWithSafeFanout(options) {
    if (stryMutAct_9fa48("153216")) {
      {}
    } else {
      stryCov_9fa48("153216");
      const originalFailures = Array.isArray(options.deliveryFailures) ? options.deliveryFailures : stryMutAct_9fa48("153217") ? ["Stryker was here"] : (stryCov_9fa48("153217"), []);
      let deliveryFailures = originalFailures;
      let fallbackUsed = stryMutAct_9fa48("153218") ? true : (stryCov_9fa48("153218"), false);
      if (stryMutAct_9fa48("153222") ? originalFailures.length <= NUM.ZERO : stryMutAct_9fa48("153221") ? originalFailures.length >= NUM.ZERO : stryMutAct_9fa48("153220") ? false : stryMutAct_9fa48("153219") ? true : (stryCov_9fa48("153219", "153220", "153221", "153222"), originalFailures.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("153223")) {
          {}
        } else {
          stryCov_9fa48("153223");
          const failedGroupIds = new Set();
          const unresolvedFailures = stryMutAct_9fa48("153224") ? ["Stryker was here"] : (stryCov_9fa48("153224"), []);
          for (const failure of originalFailures) {
            if (stryMutAct_9fa48("153225")) {
              {}
            } else {
              stryCov_9fa48("153225");
              const groupId = stryMutAct_9fa48("153226") ? failure.targetGroupId : (stryCov_9fa48("153226"), failure?.targetGroupId);
              if (stryMutAct_9fa48("153229") ? typeof groupId === TYPEOF.STRING || groupId.length > NUM.ZERO : stryMutAct_9fa48("153228") ? false : stryMutAct_9fa48("153227") ? true : (stryCov_9fa48("153227", "153228", "153229"), (stryMutAct_9fa48("153231") ? typeof groupId !== TYPEOF.STRING : stryMutAct_9fa48("153230") ? true : (stryCov_9fa48("153230", "153231"), typeof groupId === TYPEOF.STRING)) && (stryMutAct_9fa48("153234") ? groupId.length <= NUM.ZERO : stryMutAct_9fa48("153233") ? groupId.length >= NUM.ZERO : stryMutAct_9fa48("153232") ? true : (stryCov_9fa48("153232", "153233", "153234"), groupId.length > NUM.ZERO)))) {
                if (stryMutAct_9fa48("153235")) {
                  {}
                } else {
                  stryCov_9fa48("153235");
                  failedGroupIds.add(groupId);
                  continue;
                }
              }
              unresolvedFailures.push(failure);
            }
          }
          if (stryMutAct_9fa48("153239") ? failedGroupIds.size <= NUM.ZERO : stryMutAct_9fa48("153238") ? failedGroupIds.size >= NUM.ZERO : stryMutAct_9fa48("153237") ? false : stryMutAct_9fa48("153236") ? true : (stryCov_9fa48("153236", "153237", "153238", "153239"), failedGroupIds.size > NUM.ZERO)) {
            if (stryMutAct_9fa48("153240")) {
              {}
            } else {
              stryCov_9fa48("153240");
              const safeTargets = stryMutAct_9fa48("153241") ? this.buildSafeTargets(options.sourceGroupId) : (stryCov_9fa48("153241"), this.buildSafeTargets(options.sourceGroupId).filter(stryMutAct_9fa48("153242") ? () => undefined : (stryCov_9fa48("153242"), target => failedGroupIds.has(target.groupId))));
              if (stryMutAct_9fa48("153246") ? safeTargets.length <= NUM.ZERO : stryMutAct_9fa48("153245") ? safeTargets.length >= NUM.ZERO : stryMutAct_9fa48("153244") ? false : stryMutAct_9fa48("153243") ? true : (stryCov_9fa48("153243", "153244", "153245", "153246"), safeTargets.length > NUM.ZERO)) {
                if (stryMutAct_9fa48("153247")) {
                  {}
                } else {
                  stryCov_9fa48("153247");
                  this.recordSafeFallback(CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE, stryMutAct_9fa48("153248") ? {} : (stryCov_9fa48("153248"), {
                    tableName: options.tableName,
                    operation: options.operation,
                    failedGroupCount: failedGroupIds.size
                  }));
                  const recoveredFailures = await this.deliverToTargetsWithRetry(stryMutAct_9fa48("153249") ? {} : (stryCov_9fa48("153249"), {
                    tableName: options.tableName,
                    operation: options.operation,
                    data: options.data,
                    sourceGroupId: options.sourceGroupId,
                    targets: safeTargets,
                    allowDeferToExistingRetry: stryMutAct_9fa48("153250") ? true : (stryCov_9fa48("153250"), false)
                  }));
                  const failuresByKey = new Map();
                  let unkeyedCounter = NUM.ZERO;
                  const targetedGroupIds = new Set(safeTargets.map(stryMutAct_9fa48("153251") ? () => undefined : (stryCov_9fa48("153251"), target => target.groupId)));
                  for (const failure of unresolvedFailures) {
                    if (stryMutAct_9fa48("153252")) {
                      {}
                    } else {
                      stryCov_9fa48("153252");
                      failuresByKey.set(stryMutAct_9fa48("153253") ? `` : (stryCov_9fa48("153253"), `unkeyed-${stryMutAct_9fa48("153254") ? unkeyedCounter-- : (stryCov_9fa48("153254"), unkeyedCounter++)}`), failure);
                    }
                  }
                  for (const failure of originalFailures) {
                    if (stryMutAct_9fa48("153255")) {
                      {}
                    } else {
                      stryCov_9fa48("153255");
                      const groupId = stryMutAct_9fa48("153256") ? failure.targetGroupId : (stryCov_9fa48("153256"), failure?.targetGroupId);
                      if (stryMutAct_9fa48("153259") ? typeof groupId === TYPEOF.STRING && groupId.length > NUM.ZERO || !targetedGroupIds.has(groupId) : stryMutAct_9fa48("153258") ? false : stryMutAct_9fa48("153257") ? true : (stryCov_9fa48("153257", "153258", "153259"), (stryMutAct_9fa48("153261") ? typeof groupId === TYPEOF.STRING || groupId.length > NUM.ZERO : stryMutAct_9fa48("153260") ? true : (stryCov_9fa48("153260", "153261"), (stryMutAct_9fa48("153263") ? typeof groupId !== TYPEOF.STRING : stryMutAct_9fa48("153262") ? true : (stryCov_9fa48("153262", "153263"), typeof groupId === TYPEOF.STRING)) && (stryMutAct_9fa48("153266") ? groupId.length <= NUM.ZERO : stryMutAct_9fa48("153265") ? groupId.length >= NUM.ZERO : stryMutAct_9fa48("153264") ? true : (stryCov_9fa48("153264", "153265", "153266"), groupId.length > NUM.ZERO)))) && (stryMutAct_9fa48("153267") ? targetedGroupIds.has(groupId) : (stryCov_9fa48("153267"), !targetedGroupIds.has(groupId))))) {
                        if (stryMutAct_9fa48("153268")) {
                          {}
                        } else {
                          stryCov_9fa48("153268");
                          failuresByKey.set(groupId, failure);
                        }
                      }
                    }
                  }
                  for (const failure of recoveredFailures) {
                    if (stryMutAct_9fa48("153269")) {
                      {}
                    } else {
                      stryCov_9fa48("153269");
                      const groupId = stryMutAct_9fa48("153270") ? failure.targetGroupId : (stryCov_9fa48("153270"), failure?.targetGroupId);
                      if (stryMutAct_9fa48("153273") ? typeof groupId === TYPEOF.STRING || groupId.length > NUM.ZERO : stryMutAct_9fa48("153272") ? false : stryMutAct_9fa48("153271") ? true : (stryCov_9fa48("153271", "153272", "153273"), (stryMutAct_9fa48("153275") ? typeof groupId !== TYPEOF.STRING : stryMutAct_9fa48("153274") ? true : (stryCov_9fa48("153274", "153275"), typeof groupId === TYPEOF.STRING)) && (stryMutAct_9fa48("153278") ? groupId.length <= NUM.ZERO : stryMutAct_9fa48("153277") ? groupId.length >= NUM.ZERO : stryMutAct_9fa48("153276") ? true : (stryCov_9fa48("153276", "153277", "153278"), groupId.length > NUM.ZERO)))) {
                        if (stryMutAct_9fa48("153279")) {
                          {}
                        } else {
                          stryCov_9fa48("153279");
                          failuresByKey.set(groupId, failure);
                        }
                      } else {
                        if (stryMutAct_9fa48("153280")) {
                          {}
                        } else {
                          stryCov_9fa48("153280");
                          failuresByKey.set(stryMutAct_9fa48("153281") ? `` : (stryCov_9fa48("153281"), `recovered-unkeyed-${stryMutAct_9fa48("153282") ? unkeyedCounter-- : (stryCov_9fa48("153282"), unkeyedCounter++)}`), failure);
                        }
                      }
                    }
                  }
                  deliveryFailures = stryMutAct_9fa48("153283") ? [] : (stryCov_9fa48("153283"), [...failuresByKey.values()]);
                  fallbackUsed = stryMutAct_9fa48("153284") ? false : (stryCov_9fa48("153284"), true);
                }
              }
            }
          }
        }
      }
      return this.buildGroupedDeliveryRecoveryResult(deliveryFailures, fallbackUsed);
    }
  }
  buildGroupedDeliveryRecoveryResult(deliveryFailures, fallbackUsed) {
    if (stryMutAct_9fa48("153285")) {
      {}
    } else {
      stryCov_9fa48("153285");
      return stryMutAct_9fa48("153286") ? {} : (stryCov_9fa48("153286"), {
        deliveryFailures,
        fallbackUsed
      });
    }
  } /**
    * Emit diagnostics for one direct-fanout fallback decision.
    * @param {string} reason
    * @param {Object} context
    * @private
    */
  recordSafeFallback(reason, context = {}) {
    if (stryMutAct_9fa48("153287")) {
      {}
    } else {
      stryCov_9fa48("153287");
      stryMutAct_9fa48("153288") ? this.stats.fallbackCount -= NUM.ONE : (stryCov_9fa48("153288"), this.stats.fallbackCount += NUM.ONE);
      this.emit(CDC_GROUP_PROPAGATION_EVENT.SAFE_FALLBACK, stryMutAct_9fa48("153289") ? {} : (stryCov_9fa48("153289"), {
        reason,
        tableName: context.tableName,
        operation: context.operation
      }));
      const fallbackLogContext = stryMutAct_9fa48("153290") ? {} : (stryCov_9fa48("153290"), {
        nodeId: this.nodeId,
        tableName: context.tableName,
        operation: context.operation,
        strategy: CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT,
        reason
      });
      if (stryMutAct_9fa48("153293") ? Number.isInteger(context.failedGroupCount) || context.failedGroupCount > NUM.ZERO : stryMutAct_9fa48("153292") ? false : stryMutAct_9fa48("153291") ? true : (stryCov_9fa48("153291", "153292", "153293"), Number.isInteger(context.failedGroupCount) && (stryMutAct_9fa48("153296") ? context.failedGroupCount <= NUM.ZERO : stryMutAct_9fa48("153295") ? context.failedGroupCount >= NUM.ZERO : stryMutAct_9fa48("153294") ? true : (stryCov_9fa48("153294", "153295", "153296"), context.failedGroupCount > NUM.ZERO)))) {
        if (stryMutAct_9fa48("153297")) {
          {}
        } else {
          stryCov_9fa48("153297");
          fallbackLogContext.failedGroupCount = context.failedGroupCount;
        }
      }
      if (stryMutAct_9fa48("153300") ? reason !== CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE : stryMutAct_9fa48("153299") ? false : stryMutAct_9fa48("153298") ? true : (stryCov_9fa48("153298", "153299", "153300"), reason === CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE)) {
        if (stryMutAct_9fa48("153301")) {
          {}
        } else {
          stryCov_9fa48("153301");
          this.logger.debug(CDC_GROUP_PROPAGATION_LOG_MSG.SAFE_FALLBACK, fallbackLogContext);
          return;
        }
      }
      this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.SAFE_FALLBACK, fallbackLogContext);
    }
  }

  /**
   * Compute exponential backoff retry delay.
   * @param {number} attempt
   * @return {number}
   * @private
   */
  computeRetryDelayMs(attempt) {
    if (stryMutAct_9fa48("153302")) {
      {}
    } else {
      stryCov_9fa48("153302");
      const safeAttempt = (stryMutAct_9fa48("153305") ? Number.isFinite(attempt) || attempt > NUM.ZERO : stryMutAct_9fa48("153304") ? false : stryMutAct_9fa48("153303") ? true : (stryCov_9fa48("153303", "153304", "153305"), Number.isFinite(attempt) && (stryMutAct_9fa48("153308") ? attempt <= NUM.ZERO : stryMutAct_9fa48("153307") ? attempt >= NUM.ZERO : stryMutAct_9fa48("153306") ? true : (stryCov_9fa48("153306", "153307", "153308"), attempt > NUM.ZERO)))) ? attempt : NUM.ONE;
      const exponentialFactor = Math.pow(this.deliveryRetryBackoffMultiplier, stryMutAct_9fa48("153309") ? safeAttempt + NUM.ONE : (stryCov_9fa48("153309"), safeAttempt - NUM.ONE));
      const delayMs = stryMutAct_9fa48("153310") ? this.deliveryRetryDelayMs / exponentialFactor : (stryCov_9fa48("153310"), this.deliveryRetryDelayMs * exponentialFactor);
      return stryMutAct_9fa48("153311") ? Math.max(this.deliveryRetryMaxDelayMs, Math.max(NUM.ONE, Math.floor(delayMs))) : (stryCov_9fa48("153311"), Math.min(this.deliveryRetryMaxDelayMs, stryMutAct_9fa48("153312") ? Math.min(NUM.ONE, Math.floor(delayMs)) : (stryCov_9fa48("153312"), Math.max(NUM.ONE, Math.floor(delayMs)))));
    }
  }

  /**
   * Sleep helper for retry delay.
   * @param {number} delayMs
   * @return {Promise<void>}
   * @private
   */
  async sleep(delayMs) {
    if (stryMutAct_9fa48("153313")) {
      {}
    } else {
      stryCov_9fa48("153313");
      return new Promise(stryMutAct_9fa48("153314") ? () => undefined : (stryCov_9fa48("153314"), resolve => setTimeout(resolve, delayMs)));
    }
  }

  /**
   * Build grouped propagation routing context.
   * @return {Object}
   * @private
   */
  buildGroupedContext() {
    if (stryMutAct_9fa48("153315")) {
      {}
    } else {
      stryCov_9fa48("153315");
      const localNode = this.systemTableCache.get(TABLES.NODES, this.nodeId);
      const sourceGroupId = stryMutAct_9fa48("153318") ? localNode?.[COLUMN.LATENCY_GROUP_ID] && null : stryMutAct_9fa48("153317") ? false : stryMutAct_9fa48("153316") ? true : (stryCov_9fa48("153316", "153317", "153318"), (stryMutAct_9fa48("153319") ? localNode[COLUMN.LATENCY_GROUP_ID] : (stryCov_9fa48("153319"), localNode?.[COLUMN.LATENCY_GROUP_ID])) || null);
      if (stryMutAct_9fa48("153322") ? false : stryMutAct_9fa48("153321") ? true : stryMutAct_9fa48("153320") ? sourceGroupId : (stryCov_9fa48("153320", "153321", "153322"), !sourceGroupId)) {
        if (stryMutAct_9fa48("153323")) {
          {}
        } else {
          stryCov_9fa48("153323");
          return this.buildGroupedContextResult(sourceGroupId, stryMutAct_9fa48("153324") ? ["Stryker was here"] : (stryCov_9fa48("153324"), []), CDC_GROUP_PROPAGATION_REASON.MISSING_LOCAL_GROUP);
        }
      }
      const activeGroups = stryMutAct_9fa48("153325") ? this.systemTableCache.getAll(TABLES.LATENCY_GROUPS) : (stryCov_9fa48("153325"), this.systemTableCache.getAll(TABLES.LATENCY_GROUPS).filter(groupRow => {
        if (stryMutAct_9fa48("153326")) {
          {}
        } else {
          stryCov_9fa48("153326");
          const groupId = stryMutAct_9fa48("153327") ? groupRow[COLUMN.GROUP_ID] : (stryCov_9fa48("153327"), groupRow?.[COLUMN.GROUP_ID]);
          const state = stryMutAct_9fa48("153328") ? groupRow[COLUMN.STATE] : (stryCov_9fa48("153328"), groupRow?.[COLUMN.STATE]);
          if (stryMutAct_9fa48("153331") ? false : stryMutAct_9fa48("153330") ? true : stryMutAct_9fa48("153329") ? groupId : (stryCov_9fa48("153329", "153330", "153331"), !groupId)) {
            if (stryMutAct_9fa48("153332")) {
              {}
            } else {
              stryCov_9fa48("153332");
              return stryMutAct_9fa48("153333") ? true : (stryCov_9fa48("153333"), false);
            }
          }
          return stryMutAct_9fa48("153336") ? !state && state === LATENCY_GROUP_STATE.ACTIVE : stryMutAct_9fa48("153335") ? false : stryMutAct_9fa48("153334") ? true : (stryCov_9fa48("153334", "153335", "153336"), (stryMutAct_9fa48("153337") ? state : (stryCov_9fa48("153337"), !state)) || (stryMutAct_9fa48("153339") ? state !== LATENCY_GROUP_STATE.ACTIVE : stryMutAct_9fa48("153338") ? false : (stryCov_9fa48("153338", "153339"), state === LATENCY_GROUP_STATE.ACTIVE)));
        }
      }));
      if (stryMutAct_9fa48("153342") ? activeGroups.length !== NUM.ZERO : stryMutAct_9fa48("153341") ? false : stryMutAct_9fa48("153340") ? true : (stryCov_9fa48("153340", "153341", "153342"), activeGroups.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("153343")) {
          {}
        } else {
          stryCov_9fa48("153343");
          return this.buildGroupedContextResult(sourceGroupId, stryMutAct_9fa48("153344") ? ["Stryker was here"] : (stryCov_9fa48("153344"), []), CDC_GROUP_PROPAGATION_REASON.MISSING_ACTIVE_GROUPS);
        }
      }
      const targetOrder = this.latencyTreeService.getRoutingOrder(sourceGroupId);
      const groupById = new Map(activeGroups.map(stryMutAct_9fa48("153345") ? () => undefined : (stryCov_9fa48("153345"), groupRow => stryMutAct_9fa48("153346") ? [] : (stryCov_9fa48("153346"), [groupRow[COLUMN.GROUP_ID], groupRow]))));
      const orderedTargetIds = stryMutAct_9fa48("153347") ? targetOrder : (stryCov_9fa48("153347"), targetOrder.filter(stryMutAct_9fa48("153348") ? () => undefined : (stryCov_9fa48("153348"), groupId => stryMutAct_9fa48("153351") ? groupId === sourceGroupId : stryMutAct_9fa48("153350") ? false : stryMutAct_9fa48("153349") ? true : (stryCov_9fa48("153349", "153350", "153351"), groupId !== sourceGroupId))));
      const targets = stryMutAct_9fa48("153352") ? ["Stryker was here"] : (stryCov_9fa48("153352"), []);
      for (const groupId of orderedTargetIds) {
        if (stryMutAct_9fa48("153353")) {
          {}
        } else {
          stryCov_9fa48("153353");
          const groupRow = groupById.get(groupId);
          if (stryMutAct_9fa48("153356") ? false : stryMutAct_9fa48("153355") ? true : stryMutAct_9fa48("153354") ? groupRow : (stryCov_9fa48("153354", "153355", "153356"), !groupRow)) {
            if (stryMutAct_9fa48("153357")) {
              {}
            } else {
              stryCov_9fa48("153357");
              continue;
            }
          }
          const coordinatorNodeId = stryMutAct_9fa48("153358") ? groupRow[COLUMN.COORDINATOR_NODE_ID] : (stryCov_9fa48("153358"), groupRow?.[COLUMN.COORDINATOR_NODE_ID]);
          if (stryMutAct_9fa48("153361") ? false : stryMutAct_9fa48("153360") ? true : stryMutAct_9fa48("153359") ? coordinatorNodeId : (stryCov_9fa48("153359", "153360", "153361"), !coordinatorNodeId)) {
            if (stryMutAct_9fa48("153362")) {
              {}
            } else {
              stryCov_9fa48("153362");
              return this.buildGroupedContextResult(sourceGroupId, stryMutAct_9fa48("153363") ? ["Stryker was here"] : (stryCov_9fa48("153363"), []), CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_NODE);
            }
          }
          const address = this.resolveCoordinatorAddress(coordinatorNodeId);
          if (stryMutAct_9fa48("153366") ? false : stryMutAct_9fa48("153365") ? true : stryMutAct_9fa48("153364") ? address : (stryCov_9fa48("153364", "153365", "153366"), !address)) {
            if (stryMutAct_9fa48("153367")) {
              {}
            } else {
              stryCov_9fa48("153367");
              return this.buildGroupedContextResult(sourceGroupId, stryMutAct_9fa48("153368") ? ["Stryker was here"] : (stryCov_9fa48("153368"), []), CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS);
            }
          }
          targets.push(stryMutAct_9fa48("153369") ? {} : (stryCov_9fa48("153369"), {
            groupId,
            coordinatorNodeId,
            address
          }));
        }
      }
      if (stryMutAct_9fa48("153372") ? targets.length > NUM.ZERO || !this.messageRouter || typeof this.messageRouter.deliver !== TYPEOF.FUNCTION : stryMutAct_9fa48("153371") ? false : stryMutAct_9fa48("153370") ? true : (stryCov_9fa48("153370", "153371", "153372"), (stryMutAct_9fa48("153375") ? targets.length <= NUM.ZERO : stryMutAct_9fa48("153374") ? targets.length >= NUM.ZERO : stryMutAct_9fa48("153373") ? true : (stryCov_9fa48("153373", "153374", "153375"), targets.length > NUM.ZERO)) && (stryMutAct_9fa48("153377") ? !this.messageRouter && typeof this.messageRouter.deliver !== TYPEOF.FUNCTION : stryMutAct_9fa48("153376") ? true : (stryCov_9fa48("153376", "153377"), (stryMutAct_9fa48("153378") ? this.messageRouter : (stryCov_9fa48("153378"), !this.messageRouter)) || (stryMutAct_9fa48("153380") ? typeof this.messageRouter.deliver === TYPEOF.FUNCTION : stryMutAct_9fa48("153379") ? false : (stryCov_9fa48("153379", "153380"), typeof this.messageRouter.deliver !== TYPEOF.FUNCTION)))))) {
        if (stryMutAct_9fa48("153381")) {
          {}
        } else {
          stryCov_9fa48("153381");
          return this.buildGroupedContextResult(sourceGroupId, stryMutAct_9fa48("153382") ? ["Stryker was here"] : (stryCov_9fa48("153382"), []), CDC_GROUP_PROPAGATION_REASON.MESSAGE_ROUTER_UNAVAILABLE);
        }
      }
      return this.buildGroupedContextResult(sourceGroupId, targets, null);
    }
  }
  buildGroupedContextResult(sourceGroupId, targets, fallbackReason) {
    if (stryMutAct_9fa48("153383")) {
      {}
    } else {
      stryCov_9fa48("153383");
      return stryMutAct_9fa48("153384") ? {} : (stryCov_9fa48("153384"), {
        sourceGroupId,
        targets,
        fallbackReason
      });
    }
  }

  /**
   * Resolve one coordinator message-group address for a node.
   * @param {string} coordinatorNodeId
   * @return {string|null}
   * @private
   */
  resolveCoordinatorAddress(coordinatorNodeId) {
    if (stryMutAct_9fa48("153385")) {
      {}
    } else {
      stryCov_9fa48("153385");
      const services = this.resolveActiveMessageGroupServices(serviceRow => {
        if (stryMutAct_9fa48("153386")) {
          {}
        } else {
          stryCov_9fa48("153386");
          return stryMutAct_9fa48("153389") ? serviceRow?.[COLUMN.NODE_ID] !== coordinatorNodeId : stryMutAct_9fa48("153388") ? false : stryMutAct_9fa48("153387") ? true : (stryCov_9fa48("153387", "153388", "153389"), (stryMutAct_9fa48("153390") ? serviceRow[COLUMN.NODE_ID] : (stryCov_9fa48("153390"), serviceRow?.[COLUMN.NODE_ID])) === coordinatorNodeId);
        }
      });
      if (stryMutAct_9fa48("153393") ? services.length !== NUM.ZERO : stryMutAct_9fa48("153392") ? false : stryMutAct_9fa48("153391") ? true : (stryCov_9fa48("153391", "153392", "153393"), services.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("153394")) {
          {}
        } else {
          stryCov_9fa48("153394");
          return null;
        }
      }
      const sorted = this.sortCoordinatorCandidates(services);
      return stryMutAct_9fa48("153397") ? sorted[NUM.ZERO]?.[COLUMN.ADDRESS] && null : stryMutAct_9fa48("153396") ? false : stryMutAct_9fa48("153395") ? true : (stryCov_9fa48("153395", "153396", "153397"), (stryMutAct_9fa48("153398") ? sorted[NUM.ZERO][COLUMN.ADDRESS] : (stryCov_9fa48("153398"), sorted[NUM.ZERO]?.[COLUMN.ADDRESS])) || null);
    }
  }

  /**
   * Resolve source message-group id from message-group service owner.
   * @param {Object} sourceMessageGroupService
   * @return {string|null}
   * @private
   */
  resolveSourceMessageGroupId(sourceMessageGroupService) {
    if (stryMutAct_9fa48("153399")) {
      {}
    } else {
      stryCov_9fa48("153399");
      const groupId = stryMutAct_9fa48("153400") ? sourceMessageGroupService.groupId : (stryCov_9fa48("153400"), sourceMessageGroupService?.groupId);
      if (stryMutAct_9fa48("153403") ? typeof groupId !== TYPEOF.STRING && groupId.length === NUM.ZERO : stryMutAct_9fa48("153402") ? false : stryMutAct_9fa48("153401") ? true : (stryCov_9fa48("153401", "153402", "153403"), (stryMutAct_9fa48("153405") ? typeof groupId === TYPEOF.STRING : stryMutAct_9fa48("153404") ? false : (stryCov_9fa48("153404", "153405"), typeof groupId !== TYPEOF.STRING)) || (stryMutAct_9fa48("153407") ? groupId.length !== NUM.ZERO : stryMutAct_9fa48("153406") ? false : (stryCov_9fa48("153406", "153407"), groupId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("153408")) {
          {}
        } else {
          stryCov_9fa48("153408");
          return null;
        }
      }
      return groupId;
    }
  }

  /**
   * Resolve active message-group service rows from cache.
   * @param {Function|null} predicate
   * @return {Array<Object>}
   * @private
   */
  resolveActiveMessageGroupServices(predicate = null) {
    if (stryMutAct_9fa48("153409")) {
      {}
    } else {
      stryCov_9fa48("153409");
      const rowPredicate = (stryMutAct_9fa48("153412") ? typeof predicate !== TYPEOF.FUNCTION : stryMutAct_9fa48("153411") ? false : stryMutAct_9fa48("153410") ? true : (stryCov_9fa48("153410", "153411", "153412"), typeof predicate === TYPEOF.FUNCTION)) ? predicate : null;
      return stryMutAct_9fa48("153413") ? this.systemTableCache : (stryCov_9fa48("153413"), this.systemTableCache.filter(TABLES.SERVICES, serviceRow => {
        if (stryMutAct_9fa48("153414")) {
          {}
        } else {
          stryCov_9fa48("153414");
          const isMessageGroup = stryMutAct_9fa48("153417") ? serviceRow?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("153416") ? false : stryMutAct_9fa48("153415") ? true : (stryCov_9fa48("153415", "153416", "153417"), (stryMutAct_9fa48("153418") ? serviceRow[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("153418"), serviceRow?.[COLUMN.SERVICE_TYPE])) === SERVICE_TYPE.MESSAGE_GROUP);
          const isActive = stryMutAct_9fa48("153421") ? serviceRow?.[COLUMN.STATUS] !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("153420") ? false : stryMutAct_9fa48("153419") ? true : (stryCov_9fa48("153419", "153420", "153421"), (stryMutAct_9fa48("153422") ? serviceRow[COLUMN.STATUS] : (stryCov_9fa48("153422"), serviceRow?.[COLUMN.STATUS])) === SERVICE_STATUS.ACTIVE);
          const hasAddress = stryMutAct_9fa48("153425") ? typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING || serviceRow[COLUMN.ADDRESS].length > NUM.ZERO : stryMutAct_9fa48("153424") ? false : stryMutAct_9fa48("153423") ? true : (stryCov_9fa48("153423", "153424", "153425"), (stryMutAct_9fa48("153427") ? typeof serviceRow?.[COLUMN.ADDRESS] !== TYPEOF.STRING : stryMutAct_9fa48("153426") ? true : (stryCov_9fa48("153426", "153427"), typeof (stryMutAct_9fa48("153428") ? serviceRow[COLUMN.ADDRESS] : (stryCov_9fa48("153428"), serviceRow?.[COLUMN.ADDRESS])) === TYPEOF.STRING)) && (stryMutAct_9fa48("153431") ? serviceRow[COLUMN.ADDRESS].length <= NUM.ZERO : stryMutAct_9fa48("153430") ? serviceRow[COLUMN.ADDRESS].length >= NUM.ZERO : stryMutAct_9fa48("153429") ? true : (stryCov_9fa48("153429", "153430", "153431"), serviceRow[COLUMN.ADDRESS].length > NUM.ZERO)));
          if (stryMutAct_9fa48("153434") ? (!isMessageGroup || !isActive) && !hasAddress : stryMutAct_9fa48("153433") ? false : stryMutAct_9fa48("153432") ? true : (stryCov_9fa48("153432", "153433", "153434"), (stryMutAct_9fa48("153436") ? !isMessageGroup && !isActive : stryMutAct_9fa48("153435") ? false : (stryCov_9fa48("153435", "153436"), (stryMutAct_9fa48("153437") ? isMessageGroup : (stryCov_9fa48("153437"), !isMessageGroup)) || (stryMutAct_9fa48("153438") ? isActive : (stryCov_9fa48("153438"), !isActive)))) || (stryMutAct_9fa48("153439") ? hasAddress : (stryCov_9fa48("153439"), !hasAddress)))) {
            if (stryMutAct_9fa48("153440")) {
              {}
            } else {
              stryCov_9fa48("153440");
              return stryMutAct_9fa48("153441") ? true : (stryCov_9fa48("153441"), false);
            }
          }
          if (stryMutAct_9fa48("153444") ? false : stryMutAct_9fa48("153443") ? true : stryMutAct_9fa48("153442") ? rowPredicate : (stryCov_9fa48("153442", "153443", "153444"), !rowPredicate)) {
            if (stryMutAct_9fa48("153445")) {
              {}
            } else {
              stryCov_9fa48("153445");
              return stryMutAct_9fa48("153446") ? false : (stryCov_9fa48("153446"), true);
            }
          }
          return stryMutAct_9fa48("153449") ? rowPredicate(serviceRow) !== true : stryMutAct_9fa48("153448") ? false : stryMutAct_9fa48("153447") ? true : (stryCov_9fa48("153447", "153448", "153449"), rowPredicate(serviceRow) === (stryMutAct_9fa48("153450") ? false : (stryCov_9fa48("153450"), true)));
        }
      }));
    }
  }

  /**
   * Deterministically sort coordinator candidates.
   * Prefers leaders then lexical service id.
   * @param {Array<Object>} services
   * @return {Array<Object>}
   * @private
   */
  sortCoordinatorCandidates(services) {
    if (stryMutAct_9fa48("153451")) {
      {}
    } else {
      stryCov_9fa48("153451");
      return stryMutAct_9fa48("153452") ? [...services] : (stryCov_9fa48("153452"), (stryMutAct_9fa48("153453") ? [] : (stryCov_9fa48("153453"), [...services])).sort((left, right) => {
        if (stryMutAct_9fa48("153454")) {
          {}
        } else {
          stryCov_9fa48("153454");
          const leftLeader = stryMutAct_9fa48("153457") ? left?.[COLUMN.RAFT_ROLE] !== RAFT_ROLE.LEADER : stryMutAct_9fa48("153456") ? false : stryMutAct_9fa48("153455") ? true : (stryCov_9fa48("153455", "153456", "153457"), (stryMutAct_9fa48("153458") ? left[COLUMN.RAFT_ROLE] : (stryCov_9fa48("153458"), left?.[COLUMN.RAFT_ROLE])) === RAFT_ROLE.LEADER);
          const rightLeader = stryMutAct_9fa48("153461") ? right?.[COLUMN.RAFT_ROLE] !== RAFT_ROLE.LEADER : stryMutAct_9fa48("153460") ? false : stryMutAct_9fa48("153459") ? true : (stryCov_9fa48("153459", "153460", "153461"), (stryMutAct_9fa48("153462") ? right[COLUMN.RAFT_ROLE] : (stryCov_9fa48("153462"), right?.[COLUMN.RAFT_ROLE])) === RAFT_ROLE.LEADER);
          if (stryMutAct_9fa48("153465") ? leftLeader || !rightLeader : stryMutAct_9fa48("153464") ? false : stryMutAct_9fa48("153463") ? true : (stryCov_9fa48("153463", "153464", "153465"), leftLeader && (stryMutAct_9fa48("153466") ? rightLeader : (stryCov_9fa48("153466"), !rightLeader)))) {
            if (stryMutAct_9fa48("153467")) {
              {}
            } else {
              stryCov_9fa48("153467");
              return NUM.NEGATIVE_ONE;
            }
          }
          if (stryMutAct_9fa48("153470") ? !leftLeader || rightLeader : stryMutAct_9fa48("153469") ? false : stryMutAct_9fa48("153468") ? true : (stryCov_9fa48("153468", "153469", "153470"), (stryMutAct_9fa48("153471") ? leftLeader : (stryCov_9fa48("153471"), !leftLeader)) && rightLeader)) {
            if (stryMutAct_9fa48("153472")) {
              {}
            } else {
              stryCov_9fa48("153472");
              return NUM.ONE;
            }
          }
          const leftServiceId = stryMutAct_9fa48("153475") ? left?.[COLUMN.SERVICE_ID] && '' : stryMutAct_9fa48("153474") ? false : stryMutAct_9fa48("153473") ? true : (stryCov_9fa48("153473", "153474", "153475"), (stryMutAct_9fa48("153476") ? left[COLUMN.SERVICE_ID] : (stryCov_9fa48("153476"), left?.[COLUMN.SERVICE_ID])) || (stryMutAct_9fa48("153477") ? "Stryker was here!" : (stryCov_9fa48("153477"), '')));
          const rightServiceId = stryMutAct_9fa48("153480") ? right?.[COLUMN.SERVICE_ID] && '' : stryMutAct_9fa48("153479") ? false : stryMutAct_9fa48("153478") ? true : (stryCov_9fa48("153478", "153479", "153480"), (stryMutAct_9fa48("153481") ? right[COLUMN.SERVICE_ID] : (stryCov_9fa48("153481"), right?.[COLUMN.SERVICE_ID])) || (stryMutAct_9fa48("153482") ? "Stryker was here!" : (stryCov_9fa48("153482"), '')));
          if (stryMutAct_9fa48("153486") ? leftServiceId >= rightServiceId : stryMutAct_9fa48("153485") ? leftServiceId <= rightServiceId : stryMutAct_9fa48("153484") ? false : stryMutAct_9fa48("153483") ? true : (stryCov_9fa48("153483", "153484", "153485", "153486"), leftServiceId < rightServiceId)) {
            if (stryMutAct_9fa48("153487")) {
              {}
            } else {
              stryCov_9fa48("153487");
              return NUM.NEGATIVE_ONE;
            }
          }
          if (stryMutAct_9fa48("153491") ? leftServiceId <= rightServiceId : stryMutAct_9fa48("153490") ? leftServiceId >= rightServiceId : stryMutAct_9fa48("153489") ? false : stryMutAct_9fa48("153488") ? true : (stryCov_9fa48("153488", "153489", "153490", "153491"), leftServiceId > rightServiceId)) {
            if (stryMutAct_9fa48("153492")) {
              {}
            } else {
              stryCov_9fa48("153492");
              return NUM.ONE;
            }
          }
          return NUM.ZERO;
        }
      }));
    }
  }

  /**
   * Resolve message-group id from services row.
   * @param {Object} serviceRow
   * @return {string|null}
   * @private
   */
  resolveMessageGroupId(serviceRow) {
    if (stryMutAct_9fa48("153493")) {
      {}
    } else {
      stryCov_9fa48("153493");
      const explicitGroupId = stryMutAct_9fa48("153494") ? serviceRow[COLUMN.GROUP_ID] : (stryCov_9fa48("153494"), serviceRow?.[COLUMN.GROUP_ID]);
      if (stryMutAct_9fa48("153497") ? typeof explicitGroupId === TYPEOF.STRING || explicitGroupId.length > NUM.ZERO : stryMutAct_9fa48("153496") ? false : stryMutAct_9fa48("153495") ? true : (stryCov_9fa48("153495", "153496", "153497"), (stryMutAct_9fa48("153499") ? typeof explicitGroupId !== TYPEOF.STRING : stryMutAct_9fa48("153498") ? true : (stryCov_9fa48("153498", "153499"), typeof explicitGroupId === TYPEOF.STRING)) && (stryMutAct_9fa48("153502") ? explicitGroupId.length <= NUM.ZERO : stryMutAct_9fa48("153501") ? explicitGroupId.length >= NUM.ZERO : stryMutAct_9fa48("153500") ? true : (stryCov_9fa48("153500", "153501", "153502"), explicitGroupId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("153503")) {
          {}
        } else {
          stryCov_9fa48("153503");
          return explicitGroupId;
        }
      }
      const serviceId = stryMutAct_9fa48("153504") ? serviceRow[COLUMN.SERVICE_ID] : (stryCov_9fa48("153504"), serviceRow?.[COLUMN.SERVICE_ID]);
      if (stryMutAct_9fa48("153507") ? typeof serviceId !== TYPEOF.STRING && serviceId.length === NUM.ZERO : stryMutAct_9fa48("153506") ? false : stryMutAct_9fa48("153505") ? true : (stryCov_9fa48("153505", "153506", "153507"), (stryMutAct_9fa48("153509") ? typeof serviceId === TYPEOF.STRING : stryMutAct_9fa48("153508") ? false : (stryCov_9fa48("153508", "153509"), typeof serviceId !== TYPEOF.STRING)) || (stryMutAct_9fa48("153511") ? serviceId.length !== NUM.ZERO : stryMutAct_9fa48("153510") ? false : (stryCov_9fa48("153510", "153511"), serviceId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("153512")) {
          {}
        } else {
          stryCov_9fa48("153512");
          return null;
        }
      }
      const replicaSuffixIndex = serviceId.lastIndexOf(MESSAGE_GROUP_REPLICA_SUFFIX);
      if (stryMutAct_9fa48("153516") ? replicaSuffixIndex > NUM.ZERO : stryMutAct_9fa48("153515") ? replicaSuffixIndex < NUM.ZERO : stryMutAct_9fa48("153514") ? false : stryMutAct_9fa48("153513") ? true : (stryCov_9fa48("153513", "153514", "153515", "153516"), replicaSuffixIndex <= NUM.ZERO)) {
        if (stryMutAct_9fa48("153517")) {
          {}
        } else {
          stryCov_9fa48("153517");
          return null;
        }
      }
      return stryMutAct_9fa48("153518") ? serviceId : (stryCov_9fa48("153518"), serviceId.slice(NUM.ZERO, replicaSuffixIndex));
    }
  }

  /**
   * Build safe propagation targets from active message-group leaders.
   * @param {string|null} sourceGroupId
   * @return {Array<Object>}
   * @private
   */
  buildSafeTargets(sourceGroupId) {
    if (stryMutAct_9fa48("153519")) {
      {}
    } else {
      stryCov_9fa48("153519");
      const services = this.resolveActiveMessageGroupServices();
      const servicesByGroupId = new Map();
      for (const serviceRow of services) {
        if (stryMutAct_9fa48("153520")) {
          {}
        } else {
          stryCov_9fa48("153520");
          const groupId = this.resolveMessageGroupId(serviceRow);
          if (stryMutAct_9fa48("153523") ? false : stryMutAct_9fa48("153522") ? true : stryMutAct_9fa48("153521") ? groupId : (stryCov_9fa48("153521", "153522", "153523"), !groupId)) {
            if (stryMutAct_9fa48("153524")) {
              {}
            } else {
              stryCov_9fa48("153524");
              continue;
            }
          }
          if (stryMutAct_9fa48("153527") ? false : stryMutAct_9fa48("153526") ? true : stryMutAct_9fa48("153525") ? servicesByGroupId.has(groupId) : (stryCov_9fa48("153525", "153526", "153527"), !servicesByGroupId.has(groupId))) {
            if (stryMutAct_9fa48("153528")) {
              {}
            } else {
              stryCov_9fa48("153528");
              servicesByGroupId.set(groupId, stryMutAct_9fa48("153529") ? ["Stryker was here"] : (stryCov_9fa48("153529"), []));
            }
          }
          servicesByGroupId.get(groupId).push(serviceRow);
        }
      }
      const orderedGroupIds = stryMutAct_9fa48("153530") ? [...servicesByGroupId.keys()] : (stryCov_9fa48("153530"), (stryMutAct_9fa48("153531") ? [] : (stryCov_9fa48("153531"), [...servicesByGroupId.keys()])).sort(stryMutAct_9fa48("153532") ? () => undefined : (stryCov_9fa48("153532"), (left, right) => left.localeCompare(right))));
      const targets = stryMutAct_9fa48("153533") ? ["Stryker was here"] : (stryCov_9fa48("153533"), []);
      for (const groupId of orderedGroupIds) {
        if (stryMutAct_9fa48("153534")) {
          {}
        } else {
          stryCov_9fa48("153534");
          if (stryMutAct_9fa48("153537") ? sourceGroupId || groupId === sourceGroupId : stryMutAct_9fa48("153536") ? false : stryMutAct_9fa48("153535") ? true : (stryCov_9fa48("153535", "153536", "153537"), sourceGroupId && (stryMutAct_9fa48("153539") ? groupId !== sourceGroupId : stryMutAct_9fa48("153538") ? true : (stryCov_9fa48("153538", "153539"), groupId === sourceGroupId)))) {
            if (stryMutAct_9fa48("153540")) {
              {}
            } else {
              stryCov_9fa48("153540");
              continue;
            }
          }
          const selectedService = this.sortCoordinatorCandidates(servicesByGroupId.get(groupId))[NUM.ZERO];
          if (stryMutAct_9fa48("153543") ? false : stryMutAct_9fa48("153542") ? true : stryMutAct_9fa48("153541") ? selectedService : (stryCov_9fa48("153541", "153542", "153543"), !selectedService)) {
            if (stryMutAct_9fa48("153544")) {
              {}
            } else {
              stryCov_9fa48("153544");
              continue;
            }
          }
          targets.push(stryMutAct_9fa48("153545") ? {} : (stryCov_9fa48("153545"), {
            groupId,
            coordinatorNodeId: stryMutAct_9fa48("153548") ? selectedService[COLUMN.NODE_ID] && null : stryMutAct_9fa48("153547") ? false : stryMutAct_9fa48("153546") ? true : (stryCov_9fa48("153546", "153547", "153548"), selectedService[COLUMN.NODE_ID] || null),
            address: selectedService[COLUMN.ADDRESS]
          }));
        }
      }
      return targets;
    }
  }

  /**
   * Deliver CDC payload to target coordinators.
   * @param {Object} options
   * @return {Promise<Array<Object>>}
   * @private
   */
  async deliverToTargets(options) {
    if (stryMutAct_9fa48("153549")) {
      {}
    } else {
      stryCov_9fa48("153549");
      const events = this.normalizeDeliveryEvents(options);
      const deliveryFailures = stryMutAct_9fa48("153550") ? ["Stryker was here"] : (stryCov_9fa48("153550"), []);
      for (const target of options.targets) {
        if (stryMutAct_9fa48("153551")) {
          {}
        } else {
          stryCov_9fa48("153551");
          if (stryMutAct_9fa48("153554") ? !this.messageRouter && typeof this.messageRouter.deliver !== TYPEOF.FUNCTION : stryMutAct_9fa48("153553") ? false : stryMutAct_9fa48("153552") ? true : (stryCov_9fa48("153552", "153553", "153554"), (stryMutAct_9fa48("153555") ? this.messageRouter : (stryCov_9fa48("153555"), !this.messageRouter)) || (stryMutAct_9fa48("153557") ? typeof this.messageRouter.deliver === TYPEOF.FUNCTION : stryMutAct_9fa48("153556") ? false : (stryCov_9fa48("153556", "153557"), typeof this.messageRouter.deliver !== TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("153558")) {
              {}
            } else {
              stryCov_9fa48("153558");
              deliveryFailures.push(stryMutAct_9fa48("153559") ? {} : (stryCov_9fa48("153559"), {
                targetGroupId: target.groupId,
                coordinatorNodeId: target.coordinatorNodeId,
                address: target.address,
                error: CDC_GROUP_PROPAGATION_REASON.MESSAGE_ROUTER_UNAVAILABLE
              }));
              continue;
            }
          }
          const payload = (stryMutAct_9fa48("153563") ? events.length <= NUM.ONE : stryMutAct_9fa48("153562") ? events.length >= NUM.ONE : stryMutAct_9fa48("153561") ? false : stryMutAct_9fa48("153560") ? true : (stryCov_9fa48("153560", "153561", "153562", "153563"), events.length > NUM.ONE)) ? stryMutAct_9fa48("153564") ? {} : (stryCov_9fa48("153564"), {
            type: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH,
            events,
            sourceNodeId: this.nodeId,
            sourceGroupId: options.sourceGroupId,
            targetGroupId: target.groupId
          }) : stryMutAct_9fa48("153565") ? {} : (stryCov_9fa48("153565"), {
            type: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION,
            tableName: events[0].tableName,
            operation: events[0].operation,
            data: events[0].data,
            sourceNodeId: this.nodeId,
            sourceGroupId: options.sourceGroupId,
            targetGroupId: target.groupId
          });
          let result = null;
          try {
            if (stryMutAct_9fa48("153566")) {
              {}
            } else {
              stryCov_9fa48("153566");
              result = await this.messageRouter.deliver(target.address, payload, stryMutAct_9fa48("153567") ? {} : (stryCov_9fa48("153567"), {
                targetNodeId: target.coordinatorNodeId
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("153568")) {
              {}
            } else {
              stryCov_9fa48("153568");
              deliveryFailures.push(stryMutAct_9fa48("153569") ? {} : (stryCov_9fa48("153569"), {
                targetGroupId: target.groupId,
                coordinatorNodeId: target.coordinatorNodeId,
                address: target.address,
                error: String(stryMutAct_9fa48("153572") ? (error?.message || error) && DELIVERY_ERROR_UNKNOWN : stryMutAct_9fa48("153571") ? false : stryMutAct_9fa48("153570") ? true : (stryCov_9fa48("153570", "153571", "153572"), (stryMutAct_9fa48("153574") ? error?.message && error : stryMutAct_9fa48("153573") ? false : (stryCov_9fa48("153573", "153574"), (stryMutAct_9fa48("153575") ? error.message : (stryCov_9fa48("153575"), error?.message)) || error)) || DELIVERY_ERROR_UNKNOWN))
              }));
              continue;
            }
          }
          if (stryMutAct_9fa48("153578") ? false : stryMutAct_9fa48("153577") ? true : stryMutAct_9fa48("153576") ? result?.acknowledged : (stryCov_9fa48("153576", "153577", "153578"), !(stryMutAct_9fa48("153579") ? result.acknowledged : (stryCov_9fa48("153579"), result?.acknowledged)))) {
            if (stryMutAct_9fa48("153580")) {
              {}
            } else {
              stryCov_9fa48("153580");
              deliveryFailures.push(stryMutAct_9fa48("153581") ? {} : (stryCov_9fa48("153581"), {
                targetGroupId: target.groupId,
                coordinatorNodeId: target.coordinatorNodeId,
                address: target.address,
                error: stryMutAct_9fa48("153584") ? result?.error && null : stryMutAct_9fa48("153583") ? false : stryMutAct_9fa48("153582") ? true : (stryCov_9fa48("153582", "153583", "153584"), (stryMutAct_9fa48("153585") ? result.error : (stryCov_9fa48("153585"), result?.error)) || null)
              }));
            }
          }
        }
      }
      return deliveryFailures;
    }
  }

  /**
   * Normalize one delivery request into a batch-safe event array.
   * @param {Object} options
   * @return {Array<Object>}
   * @private
   */
  normalizeDeliveryEvents(options) {
    if (stryMutAct_9fa48("153586")) {
      {}
    } else {
      stryCov_9fa48("153586");
      const explicitEvents = Array.isArray(stryMutAct_9fa48("153587") ? options.events : (stryCov_9fa48("153587"), options?.events)) ? stryMutAct_9fa48("153588") ? options.events.map(event => ({
        tableName: event.tableName,
        operation: event.operation,
        data: event.data
      })) : (stryCov_9fa48("153588"), options.events.filter(stryMutAct_9fa48("153589") ? () => undefined : (stryCov_9fa48("153589"), event => stryMutAct_9fa48("153592") ? event?.tableName && event?.operation || event?.data : stryMutAct_9fa48("153591") ? false : stryMutAct_9fa48("153590") ? true : (stryCov_9fa48("153590", "153591", "153592"), (stryMutAct_9fa48("153594") ? event?.tableName || event?.operation : stryMutAct_9fa48("153593") ? true : (stryCov_9fa48("153593", "153594"), (stryMutAct_9fa48("153595") ? event.tableName : (stryCov_9fa48("153595"), event?.tableName)) && (stryMutAct_9fa48("153596") ? event.operation : (stryCov_9fa48("153596"), event?.operation)))) && (stryMutAct_9fa48("153597") ? event.data : (stryCov_9fa48("153597"), event?.data))))).map(stryMutAct_9fa48("153598") ? () => undefined : (stryCov_9fa48("153598"), event => stryMutAct_9fa48("153599") ? {} : (stryCov_9fa48("153599"), {
        tableName: event.tableName,
        operation: event.operation,
        data: event.data
      })))) : stryMutAct_9fa48("153600") ? ["Stryker was here"] : (stryCov_9fa48("153600"), []);
      if (stryMutAct_9fa48("153604") ? explicitEvents.length <= NUM.ZERO : stryMutAct_9fa48("153603") ? explicitEvents.length >= NUM.ZERO : stryMutAct_9fa48("153602") ? false : stryMutAct_9fa48("153601") ? true : (stryCov_9fa48("153601", "153602", "153603", "153604"), explicitEvents.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("153605")) {
          {}
        } else {
          stryCov_9fa48("153605");
          return explicitEvents;
        }
      }
      return stryMutAct_9fa48("153606") ? [] : (stryCov_9fa48("153606"), [stryMutAct_9fa48("153607") ? {} : (stryCov_9fa48("153607"), {
        tableName: options.tableName,
        operation: options.operation,
        data: options.data
      })]);
    }
  }

  /**
   * Refresh propagation mode from centralized config.
   */
  refreshConfig() {
    if (stryMutAct_9fa48("153608")) {
      {}
    } else {
      stryCov_9fa48("153608");
      const value = this.config.get(LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE);
      if (stryMutAct_9fa48("153611") ? value !== LATENCY_PROPAGATION_MODE.GROUPED : stryMutAct_9fa48("153610") ? false : stryMutAct_9fa48("153609") ? true : (stryCov_9fa48("153609", "153610", "153611"), value === LATENCY_PROPAGATION_MODE.GROUPED)) {
        if (stryMutAct_9fa48("153612")) {
          {}
        } else {
          stryCov_9fa48("153612");
          const previousPropagationMode = this.propagationMode;
          this.propagationMode = LATENCY_PROPAGATION_MODE.GROUPED;
          if (stryMutAct_9fa48("153615") ? previousPropagationMode !== LATENCY_PROPAGATION_MODE.GROUPED && !this.publicationModeDiagnostics : stryMutAct_9fa48("153614") ? false : stryMutAct_9fa48("153613") ? true : (stryCov_9fa48("153613", "153614", "153615"), (stryMutAct_9fa48("153617") ? previousPropagationMode === LATENCY_PROPAGATION_MODE.GROUPED : stryMutAct_9fa48("153616") ? false : (stryCov_9fa48("153616", "153617"), previousPropagationMode !== LATENCY_PROPAGATION_MODE.GROUPED)) || (stryMutAct_9fa48("153618") ? this.publicationModeDiagnostics : (stryCov_9fa48("153618"), !this.publicationModeDiagnostics)))) {
            if (stryMutAct_9fa48("153619")) {
              {}
            } else {
              stryCov_9fa48("153619");
              this.setPublicationMode(CDC_GROUP_PUBLICATION_MODE.GROUPED, CDC_GROUP_PROPAGATION_REASON.CONFIG_GROUPED_MODE);
            }
          }
          return;
        }
      }
      this.propagationMode = LATENCY_PROPAGATION_MODE.SAFE;
      this.setPublicationMode(CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY, CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE);
    }
  }

  /**
   * Get the canonical publication-mode diagnostics snapshot.
   * @return {Object}
   */
  getPublicationModeDiagnostics() {
    if (stryMutAct_9fa48("153620")) {
      {}
    } else {
      stryCov_9fa48("153620");
      return this.freezePublicationModeDiagnostics(stryMutAct_9fa48("153621") ? {} : (stryCov_9fa48("153621"), {
        ...this.publicationModeDiagnostics,
        recentTransitions: Array.isArray(stryMutAct_9fa48("153622") ? this.publicationModeDiagnostics.recentTransitions : (stryCov_9fa48("153622"), this.publicationModeDiagnostics?.recentTransitions)) ? this.publicationModeDiagnostics.recentTransitions : stryMutAct_9fa48("153623") ? ["Stryker was here"] : (stryCov_9fa48("153623"), [])
      }));
    }
  }

  /**
   * Get current diagnostics counters.
   * @return {Object}
   */
  getStats() {
    if (stryMutAct_9fa48("153624")) {
      {}
    } else {
      stryCov_9fa48("153624");
      return stryMutAct_9fa48("153625") ? {} : (stryCov_9fa48("153625"), {
        ...this.stats,
        nodeId: this.nodeId,
        state: this.state,
        propagationMode: this.propagationMode,
        deliveryRetryMaxAttempts: this.deliveryRetryMaxAttempts,
        deliveryRetryDelayMs: this.deliveryRetryDelayMs,
        deliveryRetryBackoffMultiplier: this.deliveryRetryBackoffMultiplier,
        deliveryRetryMaxDelayMs: this.deliveryRetryMaxDelayMs,
        publicationModeDiagnostics: this.getPublicationModeDiagnostics()
      });
    }
  }

  /**
   * Update the canonical publication-mode diagnostics.
   * @param {string} nextMode
   * @param {string|null} reasonCode
   * @private
   */
  setPublicationMode(nextMode, reasonCode) {
    if (stryMutAct_9fa48("153626")) {
      {}
    } else {
      stryCov_9fa48("153626");
      const current = this.publicationModeDiagnostics;
      if (stryMutAct_9fa48("153629") ? false : stryMutAct_9fa48("153628") ? true : stryMutAct_9fa48("153627") ? nextMode : (stryCov_9fa48("153627", "153628", "153629"), !nextMode)) {
        if (stryMutAct_9fa48("153630")) {
          {}
        } else {
          stryCov_9fa48("153630");
          return;
        }
      }
      if (stryMutAct_9fa48("153633") ? !current && current.currentMode !== nextMode : stryMutAct_9fa48("153632") ? false : stryMutAct_9fa48("153631") ? true : (stryCov_9fa48("153631", "153632", "153633"), (stryMutAct_9fa48("153634") ? current : (stryCov_9fa48("153634"), !current)) || (stryMutAct_9fa48("153636") ? current.currentMode === nextMode : stryMutAct_9fa48("153635") ? false : (stryCov_9fa48("153635", "153636"), current.currentMode !== nextMode)))) {
        if (stryMutAct_9fa48("153637")) {
          {}
        } else {
          stryCov_9fa48("153637");
          const changedAt = this.toIsoTimestamp(this.now());
          const recentTransitions = Array.isArray(stryMutAct_9fa48("153638") ? current.recentTransitions : (stryCov_9fa48("153638"), current?.recentTransitions)) ? stryMutAct_9fa48("153639") ? [] : (stryCov_9fa48("153639"), [...current.recentTransitions]) : stryMutAct_9fa48("153640") ? ["Stryker was here"] : (stryCov_9fa48("153640"), []);
          if (stryMutAct_9fa48("153643") ? current.currentMode : stryMutAct_9fa48("153642") ? false : stryMutAct_9fa48("153641") ? true : (stryCov_9fa48("153641", "153642", "153643"), current?.currentMode)) {
            if (stryMutAct_9fa48("153644")) {
              {}
            } else {
              stryCov_9fa48("153644");
              recentTransitions.push(Object.freeze(stryMutAct_9fa48("153645") ? {} : (stryCov_9fa48("153645"), {
                from: current.currentMode,
                to: nextMode,
                reasonCode: stryMutAct_9fa48("153648") ? reasonCode && null : stryMutAct_9fa48("153647") ? false : stryMutAct_9fa48("153646") ? true : (stryCov_9fa48("153646", "153647", "153648"), reasonCode || null),
                changedAt
              })));
            }
          }
          this.publicationModeDiagnostics = this.freezePublicationModeDiagnostics(stryMutAct_9fa48("153649") ? {} : (stryCov_9fa48("153649"), {
            currentMode: nextMode,
            reasonCode: stryMutAct_9fa48("153652") ? reasonCode && null : stryMutAct_9fa48("153651") ? false : stryMutAct_9fa48("153650") ? true : (stryCov_9fa48("153650", "153651", "153652"), reasonCode || null),
            enteredAt: changedAt,
            recentTransitions: stryMutAct_9fa48("153653") ? recentTransitions : (stryCov_9fa48("153653"), recentTransitions.slice(stryMutAct_9fa48("153654") ? +PUBLICATION_TRANSITION_HISTORY_LIMIT : (stryCov_9fa48("153654"), -PUBLICATION_TRANSITION_HISTORY_LIMIT)))
          }));
          return;
        }
      }
      if (stryMutAct_9fa48("153657") ? reasonCode || current.reasonCode !== reasonCode : stryMutAct_9fa48("153656") ? false : stryMutAct_9fa48("153655") ? true : (stryCov_9fa48("153655", "153656", "153657"), reasonCode && (stryMutAct_9fa48("153659") ? current.reasonCode === reasonCode : stryMutAct_9fa48("153658") ? true : (stryCov_9fa48("153658", "153659"), current.reasonCode !== reasonCode)))) {
        if (stryMutAct_9fa48("153660")) {
          {}
        } else {
          stryCov_9fa48("153660");
          this.publicationModeDiagnostics = this.freezePublicationModeDiagnostics(stryMutAct_9fa48("153661") ? {} : (stryCov_9fa48("153661"), {
            ...current,
            reasonCode
          }));
        }
      }
    }
  }

  /**
   * Create a read-only publication diagnostics snapshot.
   * @param {Object} diagnostics
   * @return {Object}
   * @private
   */
  freezePublicationModeDiagnostics(diagnostics) {
    if (stryMutAct_9fa48("153662")) {
      {}
    } else {
      stryCov_9fa48("153662");
      const transitions = Array.isArray(stryMutAct_9fa48("153663") ? diagnostics.recentTransitions : (stryCov_9fa48("153663"), diagnostics?.recentTransitions)) ? diagnostics.recentTransitions.map(stryMutAct_9fa48("153664") ? () => undefined : (stryCov_9fa48("153664"), entry => Object.freeze(stryMutAct_9fa48("153665") ? {} : (stryCov_9fa48("153665"), {
        ...entry
      })))) : stryMutAct_9fa48("153666") ? ["Stryker was here"] : (stryCov_9fa48("153666"), []);
      return Object.freeze(stryMutAct_9fa48("153667") ? {} : (stryCov_9fa48("153667"), {
        currentMode: stryMutAct_9fa48("153670") ? diagnostics?.currentMode && null : stryMutAct_9fa48("153669") ? false : stryMutAct_9fa48("153668") ? true : (stryCov_9fa48("153668", "153669", "153670"), (stryMutAct_9fa48("153671") ? diagnostics.currentMode : (stryCov_9fa48("153671"), diagnostics?.currentMode)) || null),
        reasonCode: stryMutAct_9fa48("153674") ? diagnostics?.reasonCode && null : stryMutAct_9fa48("153673") ? false : stryMutAct_9fa48("153672") ? true : (stryCov_9fa48("153672", "153673", "153674"), (stryMutAct_9fa48("153675") ? diagnostics.reasonCode : (stryCov_9fa48("153675"), diagnostics?.reasonCode)) || null),
        enteredAt: stryMutAct_9fa48("153678") ? diagnostics?.enteredAt && null : stryMutAct_9fa48("153677") ? false : stryMutAct_9fa48("153676") ? true : (stryCov_9fa48("153676", "153677", "153678"), (stryMutAct_9fa48("153679") ? diagnostics.enteredAt : (stryCov_9fa48("153679"), diagnostics?.enteredAt)) || null),
        recentTransitions: Object.freeze(transitions)
      }));
    }
  }

  /**
   * Ensure lifecycle initialization has happened.
   * @private
   */
  ensureInitialized() {
    if (stryMutAct_9fa48("153680")) {
      {}
    } else {
      stryCov_9fa48("153680");
      assertCritical(stryMutAct_9fa48("153683") ? this.state === CDC_GROUP_PROPAGATION_STATE.CREATED : stryMutAct_9fa48("153682") ? false : stryMutAct_9fa48("153681") ? true : (stryCov_9fa48("153681", "153682", "153683"), this.state !== CDC_GROUP_PROPAGATION_STATE.CREATED), CDC_GROUP_PROPAGATION_ERROR_MSG.NOT_INITIALIZED);
    }
  }

  /**
   * Current wall-clock time.
   * @return {number}
   * @private
   */
  now() {
    if (stryMutAct_9fa48("153684")) {
      {}
    } else {
      stryCov_9fa48("153684");
      return this.nowFn();
    }
  }

  /**
   * Convert the current clock value to an ISO-8601 timestamp.
   * @param {number} value
   * @return {string}
   * @private
   */
  toIsoTimestamp(value) {
    if (stryMutAct_9fa48("153685")) {
      {}
    } else {
      stryCov_9fa48("153685");
      return new Date(value).toISOString();
    }
  }

  /**
   * Resolve positive integer option with fallback.
   * @param {*} value
   * @param {number} fallback
   * @return {number}
   * @private
   */
  resolvePositiveInteger(value, fallback) {
    if (stryMutAct_9fa48("153686")) {
      {}
    } else {
      stryCov_9fa48("153686");
      if (stryMutAct_9fa48("153689") ? false : stryMutAct_9fa48("153688") ? true : stryMutAct_9fa48("153687") ? Number.isFinite(value) : (stryCov_9fa48("153687", "153688", "153689"), !Number.isFinite(value))) {
        if (stryMutAct_9fa48("153690")) {
          {}
        } else {
          stryCov_9fa48("153690");
          return fallback;
        }
      }
      const normalized = Math.floor(value);
      if (stryMutAct_9fa48("153694") ? normalized >= NUM.ONE : stryMutAct_9fa48("153693") ? normalized <= NUM.ONE : stryMutAct_9fa48("153692") ? false : stryMutAct_9fa48("153691") ? true : (stryCov_9fa48("153691", "153692", "153693", "153694"), normalized < NUM.ONE)) {
        if (stryMutAct_9fa48("153695")) {
          {}
        } else {
          stryCov_9fa48("153695");
          return fallback;
        }
      }
      return normalized;
    }
  }

  /**
   * Resolve positive numeric option with fallback.
   * @param {*} value
   * @param {number} fallback
   * @return {number}
   * @private
   */
  resolvePositiveNumber(value, fallback) {
    if (stryMutAct_9fa48("153696")) {
      {}
    } else {
      stryCov_9fa48("153696");
      if (stryMutAct_9fa48("153699") ? false : stryMutAct_9fa48("153698") ? true : stryMutAct_9fa48("153697") ? Number.isFinite(value) : (stryCov_9fa48("153697", "153698", "153699"), !Number.isFinite(value))) {
        if (stryMutAct_9fa48("153700")) {
          {}
        } else {
          stryCov_9fa48("153700");
          return fallback;
        }
      }
      if (stryMutAct_9fa48("153704") ? value > NUM.ZERO : stryMutAct_9fa48("153703") ? value < NUM.ZERO : stryMutAct_9fa48("153702") ? false : stryMutAct_9fa48("153701") ? true : (stryCov_9fa48("153701", "153702", "153703", "153704"), value <= NUM.ZERO)) {
        if (stryMutAct_9fa48("153705")) {
          {}
        } else {
          stryCov_9fa48("153705");
          return fallback;
        }
      }
      return value;
    }
  }
}
export { CDCGroupPropagationService };