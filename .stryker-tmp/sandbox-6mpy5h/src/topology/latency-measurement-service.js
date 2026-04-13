/**
 * LatencyMeasurementService - single owner for RTT measurement and persistence.
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
import { COLUMN, NUM, TABLES, TYPEOF } from '../constants/index.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { LATENCY_TOPOLOGY_CONFIG_KEY, LATENCY_TOPOLOGY_DEFAULT } from './latency-topology-constants.js';
import { LATENCY_MEASUREMENT_DEFAULT, LATENCY_MEASUREMENT_ERROR_MSG, LATENCY_MEASUREMENT_EVENT, LATENCY_MEASUREMENT_LOG_MSG, LATENCY_MEASUREMENT_REASON, LATENCY_MEASUREMENT_SAMPLE_QUALITY, LATENCY_MEASUREMENT_STATE, LATENCY_MEASUREMENT_SUBSYSTEM } from './latency-measurement-constants.js';
const INTER_GROUP_LATENCY_SQL = Object.freeze(stryMutAct_9fa48("154410") ? {} : (stryCov_9fa48("154410"), {
  SELECT_BY_EDGE_ID: stryMutAct_9fa48("154411") ? "" : (stryCov_9fa48("154411"), 'SELECT * FROM inter_group_latencies WHERE latency_edge_id = ?')
}));
const LATENCY_MEASUREMENT_CONFIG_MIN = Object.freeze(stryMutAct_9fa48("154412") ? {} : (stryCov_9fa48("154412"), {
  PING_TIMEOUT_MS: NUM.ONE,
  RECALC_INTERVAL_MS: NUM.THOUSAND,
  SMOOTHING_ALPHA: 0.01
}));
class LatencyMeasurementService extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.messageRouter
   * @param {Object} options.systemTableCache
   * @param {Object} options.cdcIntegrationService
   * @param {Function} options.nowFn
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("154413")) {
      {}
    } else {
      stryCov_9fa48("154413");
      super();
      this.nodeId = stryMutAct_9fa48("154416") ? options.nodeId && null : stryMutAct_9fa48("154415") ? false : stryMutAct_9fa48("154414") ? true : (stryCov_9fa48("154414", "154415", "154416"), options.nodeId || null);
      this.messageRouter = stryMutAct_9fa48("154419") ? options.messageRouter && null : stryMutAct_9fa48("154418") ? false : stryMutAct_9fa48("154417") ? true : (stryCov_9fa48("154417", "154418", "154419"), options.messageRouter || null);
      this.systemTableCache = stryMutAct_9fa48("154422") ? options.systemTableCache && null : stryMutAct_9fa48("154421") ? false : stryMutAct_9fa48("154420") ? true : (stryCov_9fa48("154420", "154421", "154422"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("154425") ? options.cdcIntegrationService && null : stryMutAct_9fa48("154424") ? false : stryMutAct_9fa48("154423") ? true : (stryCov_9fa48("154423", "154424", "154425"), options.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("154428") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("154427") ? false : stryMutAct_9fa48("154426") ? true : (stryCov_9fa48("154426", "154427", "154428"), options.controlPlaneSystemTableGateway || null);
      this.nowFn = stryMutAct_9fa48("154431") ? options.nowFn && Date.now : stryMutAct_9fa48("154430") ? false : stryMutAct_9fa48("154429") ? true : (stryCov_9fa48("154429", "154430", "154431"), options.nowFn || Date.now);
      this.config = ConfigurationManager.getInstance();
      this.refreshConfig();
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(LATENCY_MEASUREMENT_SUBSYSTEM) : console;
      this.state = LATENCY_MEASUREMENT_STATE.CREATED;
      this.stats = stryMutAct_9fa48("154432") ? {} : (stryCov_9fa48("154432"), {
        measurementRequestCount: NUM.ZERO,
        measurementAttemptCount: NUM.ZERO,
        measurementSuccessCount: NUM.ZERO,
        measurementFailureCount: NUM.ZERO,
        sampleRecordedCount: NUM.ZERO,
        sampleIgnoredCount: NUM.ZERO,
        lastMeasurementAt: null,
        lastSampleRecordedAt: null
      });
    }
  }

  /**
   * Initialize dependencies and validate required owners.
   * @param {Object} options
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("154433")) {
      {}
    } else {
      stryCov_9fa48("154433");
      if (stryMutAct_9fa48("154435") ? false : stryMutAct_9fa48("154434") ? true : (stryCov_9fa48("154434", "154435"), options.nodeId)) {
        if (stryMutAct_9fa48("154436")) {
          {}
        } else {
          stryCov_9fa48("154436");
          this.nodeId = options.nodeId;
        }
      }
      if (stryMutAct_9fa48("154438") ? false : stryMutAct_9fa48("154437") ? true : (stryCov_9fa48("154437", "154438"), options.messageRouter)) {
        if (stryMutAct_9fa48("154439")) {
          {}
        } else {
          stryCov_9fa48("154439");
          this.messageRouter = options.messageRouter;
        }
      }
      if (stryMutAct_9fa48("154441") ? false : stryMutAct_9fa48("154440") ? true : (stryCov_9fa48("154440", "154441"), options.systemTableCache)) {
        if (stryMutAct_9fa48("154442")) {
          {}
        } else {
          stryCov_9fa48("154442");
          this.systemTableCache = options.systemTableCache;
        }
      }
      if (stryMutAct_9fa48("154444") ? false : stryMutAct_9fa48("154443") ? true : (stryCov_9fa48("154443", "154444"), options.cdcIntegrationService)) {
        if (stryMutAct_9fa48("154445")) {
          {}
        } else {
          stryCov_9fa48("154445");
          this.cdcIntegrationService = options.cdcIntegrationService;
        }
      }
      if (stryMutAct_9fa48("154447") ? false : stryMutAct_9fa48("154446") ? true : (stryCov_9fa48("154446", "154447"), options.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("154448")) {
          {}
        } else {
          stryCov_9fa48("154448");
          this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
        }
      }
      if (stryMutAct_9fa48("154450") ? false : stryMutAct_9fa48("154449") ? true : (stryCov_9fa48("154449", "154450"), options.nowFn)) {
        if (stryMutAct_9fa48("154451")) {
          {}
        } else {
          stryCov_9fa48("154451");
          this.nowFn = options.nowFn;
        }
      }
      this.nodeId = assertCritical(this.nodeId, LATENCY_MEASUREMENT_ERROR_MSG.MISSING_NODE_ID);
      this.messageRouter = assertCritical(this.messageRouter, LATENCY_MEASUREMENT_ERROR_MSG.MISSING_MESSAGE_ROUTER);
      this.cdcIntegrationService = assertCritical(this.cdcIntegrationService, LATENCY_MEASUREMENT_ERROR_MSG.MISSING_CDC);
      this.refreshConfig();
      this.state = LATENCY_MEASUREMENT_STATE.INITIALIZED;
      this.logger.info(LATENCY_MEASUREMENT_LOG_MSG.INITIALIZED, stryMutAct_9fa48("154452") ? {} : (stryCov_9fa48("154452"), {
        nodeId: this.nodeId,
        pingTimeoutMs: this.pingTimeoutMs,
        pingRetryCount: this.pingRetryCount,
        smoothingAlpha: this.smoothingAlpha
      }));
    }
  }

  /**
   * Start service lifecycle.
   */
  start() {
    if (stryMutAct_9fa48("154453")) {
      {}
    } else {
      stryCov_9fa48("154453");
      this.ensureInitialized();
      this.state = LATENCY_MEASUREMENT_STATE.RUNNING;
      this.logger.info(LATENCY_MEASUREMENT_LOG_MSG.STARTED, stryMutAct_9fa48("154454") ? {} : (stryCov_9fa48("154454"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Stop service lifecycle.
   */
  stop() {
    if (stryMutAct_9fa48("154455")) {
      {}
    } else {
      stryCov_9fa48("154455");
      this.state = LATENCY_MEASUREMENT_STATE.STOPPED;
      this.logger.info(LATENCY_MEASUREMENT_LOG_MSG.STOPPED, stryMutAct_9fa48("154456") ? {} : (stryCov_9fa48("154456"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Measure RTT to a target node using router ping/pong.
   * @param {string} targetNodeId
   * @param {Object} options
   * @return {Promise<Object|null>}
   */
  async measureNodeLatency(targetNodeId, options = {}) {
    if (stryMutAct_9fa48("154457")) {
      {}
    } else {
      stryCov_9fa48("154457");
      this.ensureInitialized();
      stryMutAct_9fa48("154458") ? this.stats.measurementRequestCount -= NUM.ONE : (stryCov_9fa48("154458"), this.stats.measurementRequestCount += NUM.ONE);
      if (stryMutAct_9fa48("154461") ? false : stryMutAct_9fa48("154460") ? true : stryMutAct_9fa48("154459") ? targetNodeId : (stryCov_9fa48("154459", "154460", "154461"), !targetNodeId)) {
        if (stryMutAct_9fa48("154462")) {
          {}
        } else {
          stryCov_9fa48("154462");
          return null;
        }
      }
      if (stryMutAct_9fa48("154465") ? targetNodeId !== this.nodeId : stryMutAct_9fa48("154464") ? false : stryMutAct_9fa48("154463") ? true : (stryCov_9fa48("154463", "154464", "154465"), targetNodeId === this.nodeId)) {
        if (stryMutAct_9fa48("154466")) {
          {}
        } else {
          stryCov_9fa48("154466");
          return stryMutAct_9fa48("154467") ? {} : (stryCov_9fa48("154467"), {
            rttMs: LATENCY_MEASUREMENT_DEFAULT.MIN_RTT_MS,
            attempt: NUM.ZERO
          });
        }
      }
      const timeoutMs = this.resolveTimeoutMs(options.timeoutMs);
      const retryCount = this.resolveRetryCount(options.retryCount);
      for (let attempt = NUM.ZERO; stryMutAct_9fa48("154470") ? attempt > retryCount : stryMutAct_9fa48("154469") ? attempt < retryCount : stryMutAct_9fa48("154468") ? false : (stryCov_9fa48("154468", "154469", "154470"), attempt <= retryCount); stryMutAct_9fa48("154471") ? attempt -= NUM.ONE : (stryCov_9fa48("154471"), attempt += NUM.ONE)) {
        if (stryMutAct_9fa48("154472")) {
          {}
        } else {
          stryCov_9fa48("154472");
          stryMutAct_9fa48("154473") ? this.stats.measurementAttemptCount -= NUM.ONE : (stryCov_9fa48("154473"), this.stats.measurementAttemptCount += NUM.ONE);
          const startedAt = this.now();
          this.stats.lastMeasurementAt = startedAt;
          try {
            if (stryMutAct_9fa48("154474")) {
              {}
            } else {
              stryCov_9fa48("154474");
              const acknowledged = await this.messageRouter.pingNode(targetNodeId, timeoutMs);
              const endedAt = this.now();
              const rttMs = stryMutAct_9fa48("154475") ? Math.min(LATENCY_MEASUREMENT_DEFAULT.MIN_RTT_MS, endedAt - startedAt) : (stryCov_9fa48("154475"), Math.max(LATENCY_MEASUREMENT_DEFAULT.MIN_RTT_MS, stryMutAct_9fa48("154476") ? endedAt + startedAt : (stryCov_9fa48("154476"), endedAt - startedAt)));
              if (stryMutAct_9fa48("154478") ? false : stryMutAct_9fa48("154477") ? true : (stryCov_9fa48("154477", "154478"), acknowledged)) {
                if (stryMutAct_9fa48("154479")) {
                  {}
                } else {
                  stryCov_9fa48("154479");
                  stryMutAct_9fa48("154480") ? this.stats.measurementSuccessCount -= NUM.ONE : (stryCov_9fa48("154480"), this.stats.measurementSuccessCount += NUM.ONE);
                  return stryMutAct_9fa48("154481") ? {} : (stryCov_9fa48("154481"), {
                    rttMs,
                    attempt
                  });
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("154482")) {
              {}
            } else {
              stryCov_9fa48("154482");
              this.logger.debug(LATENCY_MEASUREMENT_LOG_MSG.MEASUREMENT_FAILED, stryMutAct_9fa48("154483") ? {} : (stryCov_9fa48("154483"), {
                nodeId: this.nodeId,
                targetNodeId,
                attempt,
                error: error.message
              }));
            }
          }
        }
      }
      this.emit(LATENCY_MEASUREMENT_EVENT.MEASUREMENT_FAILED, stryMutAct_9fa48("154484") ? {} : (stryCov_9fa48("154484"), {
        sourceNodeId: this.nodeId,
        targetNodeId,
        timeoutMs,
        retryCount
      }));
      stryMutAct_9fa48("154485") ? this.stats.measurementFailureCount -= NUM.ONE : (stryCov_9fa48("154485"), this.stats.measurementFailureCount += NUM.ONE);
      return null;
    }
  }

  /**
   * Measure a single inter-group RTT sample.
   * @param {Object} options
   * @return {Promise<Object|null>}
   */
  async measureInterGroupLatency(options = {}) {
    if (stryMutAct_9fa48("154486")) {
      {}
    } else {
      stryCov_9fa48("154486");
      this.ensureInitialized();
      const sourceGroupId = options.sourceGroupId;
      const targetGroupId = options.targetGroupId;
      const targetRepresentativeNodeId = options.targetRepresentativeNodeId;
      const sourceNodeId = stryMutAct_9fa48("154489") ? options.sourceNodeId && this.nodeId : stryMutAct_9fa48("154488") ? false : stryMutAct_9fa48("154487") ? true : (stryCov_9fa48("154487", "154488", "154489"), options.sourceNodeId || this.nodeId);
      assertCritical(sourceGroupId, LATENCY_MEASUREMENT_ERROR_MSG.MISSING_SOURCE_GROUP_ID);
      assertCritical(targetGroupId, LATENCY_MEASUREMENT_ERROR_MSG.MISSING_TARGET_GROUP_ID);
      assertCritical(targetRepresentativeNodeId, LATENCY_MEASUREMENT_ERROR_MSG.MISSING_TARGET_NODE_ID);
      const measurement = await this.measureNodeLatency(targetRepresentativeNodeId, options);
      if (stryMutAct_9fa48("154492") ? false : stryMutAct_9fa48("154491") ? true : stryMutAct_9fa48("154490") ? measurement : (stryCov_9fa48("154490", "154491", "154492"), !measurement)) {
        if (stryMutAct_9fa48("154493")) {
          {}
        } else {
          stryCov_9fa48("154493");
          return null;
        }
      }
      const sample = stryMutAct_9fa48("154494") ? {} : (stryCov_9fa48("154494"), {
        sourceGroupId,
        targetGroupId,
        sourceNodeId,
        targetNodeId: targetRepresentativeNodeId,
        rttMs: measurement.rttMs,
        timestamp: this.now(),
        sampleQuality: (stryMutAct_9fa48("154497") ? measurement.attempt !== NUM.ZERO : stryMutAct_9fa48("154496") ? false : stryMutAct_9fa48("154495") ? true : (stryCov_9fa48("154495", "154496", "154497"), measurement.attempt === NUM.ZERO)) ? LATENCY_MEASUREMENT_SAMPLE_QUALITY.GOOD : LATENCY_MEASUREMENT_SAMPLE_QUALITY.RETRY
      });
      return this.isValidSample(sample) ? sample : null;
    }
  }

  /**
   * Measure and persist a single inter-group latency sample.
   * @param {Object} options
   * @return {Promise<Object>}
   */
  async measureAndRecordInterGroupLatency(options = {}) {
    if (stryMutAct_9fa48("154498")) {
      {}
    } else {
      stryCov_9fa48("154498");
      const sample = await this.measureInterGroupLatency(options);
      if (stryMutAct_9fa48("154501") ? false : stryMutAct_9fa48("154500") ? true : stryMutAct_9fa48("154499") ? sample : (stryCov_9fa48("154499", "154500", "154501"), !sample)) {
        if (stryMutAct_9fa48("154502")) {
          {}
        } else {
          stryCov_9fa48("154502");
          return stryMutAct_9fa48("154503") ? {} : (stryCov_9fa48("154503"), {
            success: stryMutAct_9fa48("154504") ? true : (stryCov_9fa48("154504"), false),
            sample: null
          });
        }
      }
      const persisted = await this.recordInterGroupSample(sample);
      return stryMutAct_9fa48("154505") ? {} : (stryCov_9fa48("154505"), {
        success: persisted.success,
        sample,
        row: persisted.row,
        result: persisted.result
      });
    }
  }

  /**
   * Persist validated sample through the canonical CDC write path.
   * @param {Object} sample
   * @return {Promise<Object>}
   */
  async recordInterGroupSample(sample) {
    if (stryMutAct_9fa48("154506")) {
      {}
    } else {
      stryCov_9fa48("154506");
      this.ensureInitialized();
      if (stryMutAct_9fa48("154509") ? false : stryMutAct_9fa48("154508") ? true : stryMutAct_9fa48("154507") ? this.isValidSample(sample) : (stryCov_9fa48("154507", "154508", "154509"), !this.isValidSample(sample))) {
        if (stryMutAct_9fa48("154510")) {
          {}
        } else {
          stryCov_9fa48("154510");
          return stryMutAct_9fa48("154511") ? {} : (stryCov_9fa48("154511"), {
            success: stryMutAct_9fa48("154512") ? true : (stryCov_9fa48("154512"), false),
            ignored: stryMutAct_9fa48("154513") ? false : (stryCov_9fa48("154513"), true)
          });
        }
      }
      const edgeId = this.buildLatencyEdgeId(sample.sourceGroupId, sample.targetGroupId);
      const existing = await this.getExistingEdgeRow(edgeId);
      const smoothedLatencyMs = this.smoothLatency(Number(stryMutAct_9fa48("154514") ? existing[COLUMN.LATENCY_MS] : (stryCov_9fa48("154514"), existing?.[COLUMN.LATENCY_MS])), sample.rttMs);
      const existingSampleCount = Number(stryMutAct_9fa48("154515") ? existing[COLUMN.SAMPLE_COUNT] : (stryCov_9fa48("154515"), existing?.[COLUMN.SAMPLE_COUNT]));
      const normalizedSampleCount = (stryMutAct_9fa48("154518") ? Number.isFinite(existingSampleCount) || existingSampleCount >= NUM.ONE : stryMutAct_9fa48("154517") ? false : stryMutAct_9fa48("154516") ? true : (stryCov_9fa48("154516", "154517", "154518"), Number.isFinite(existingSampleCount) && (stryMutAct_9fa48("154521") ? existingSampleCount < NUM.ONE : stryMutAct_9fa48("154520") ? existingSampleCount > NUM.ONE : stryMutAct_9fa48("154519") ? true : (stryCov_9fa48("154519", "154520", "154521"), existingSampleCount >= NUM.ONE)))) ? existingSampleCount : NUM.ZERO;
      const now = sample.timestamp;
      const row = stryMutAct_9fa48("154522") ? {} : (stryCov_9fa48("154522"), {
        [COLUMN.LATENCY_EDGE_ID]: edgeId,
        [COLUMN.SOURCE_GROUP_ID]: sample.sourceGroupId,
        [COLUMN.TARGET_GROUP_ID]: sample.targetGroupId,
        [COLUMN.LATENCY_MS]: smoothedLatencyMs,
        [COLUMN.SAMPLE_COUNT]: stryMutAct_9fa48("154523") ? normalizedSampleCount - LATENCY_MEASUREMENT_DEFAULT.MIN_SAMPLE_COUNT : (stryCov_9fa48("154523"), normalizedSampleCount + LATENCY_MEASUREMENT_DEFAULT.MIN_SAMPLE_COUNT),
        [COLUMN.SAMPLE_QUALITY]: sample.sampleQuality,
        [COLUMN.LAST_MEASURED_AT]: sample.timestamp,
        [COLUMN.CREATED_AT]: stryMutAct_9fa48("154526") ? existing?.[COLUMN.CREATED_AT] && now : stryMutAct_9fa48("154525") ? false : stryMutAct_9fa48("154524") ? true : (stryCov_9fa48("154524", "154525", "154526"), (stryMutAct_9fa48("154527") ? existing[COLUMN.CREATED_AT] : (stryCov_9fa48("154527"), existing?.[COLUMN.CREATED_AT])) || now),
        [COLUMN.UPDATED_AT]: now
      });
      const result = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("154528") ? {} : (stryCov_9fa48("154528"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName: TABLES.INTER_GROUP_LATENCIES,
        row
      }), stryMutAct_9fa48("154529") ? {} : (stryCov_9fa48("154529"), {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        deliveryPriority: stryMutAct_9fa48("154530") ? "" : (stryCov_9fa48("154530"), 'background'),
        allowPressureDefer: stryMutAct_9fa48("154531") ? false : (stryCov_9fa48("154531"), true),
        coalescingKey: stryMutAct_9fa48("154532") ? `` : (stryCov_9fa48("154532"), `latency-edge:${edgeId}`)
      }));
      this.logger.debug(LATENCY_MEASUREMENT_LOG_MSG.SAMPLE_RECORDED, stryMutAct_9fa48("154533") ? {} : (stryCov_9fa48("154533"), {
        nodeId: this.nodeId,
        edgeId,
        sampleCount: row[COLUMN.SAMPLE_COUNT],
        latencyMs: row[COLUMN.LATENCY_MS],
        sampleQuality: row[COLUMN.SAMPLE_QUALITY]
      }));
      this.emit(LATENCY_MEASUREMENT_EVENT.SAMPLE_RECORDED, stryMutAct_9fa48("154534") ? {} : (stryCov_9fa48("154534"), {
        edgeId,
        sample,
        row,
        result
      }));
      stryMutAct_9fa48("154535") ? this.stats.sampleRecordedCount -= NUM.ONE : (stryCov_9fa48("154535"), this.stats.sampleRecordedCount += NUM.ONE);
      this.stats.lastSampleRecordedAt = sample.timestamp;
      return stryMutAct_9fa48("154536") ? {} : (stryCov_9fa48("154536"), {
        success: stryMutAct_9fa48("154537") ? false : (stryCov_9fa48("154537"), true),
        row,
        result
      });
    }
  }

  /**
   * Determine whether sample can be accepted for persistence.
   * @param {Object} sample
   * @return {boolean}
   */
  isValidSample(sample) {
    if (stryMutAct_9fa48("154538")) {
      {}
    } else {
      stryCov_9fa48("154538");
      if (stryMutAct_9fa48("154541") ? !sample && typeof sample !== TYPEOF.OBJECT : stryMutAct_9fa48("154540") ? false : stryMutAct_9fa48("154539") ? true : (stryCov_9fa48("154539", "154540", "154541"), (stryMutAct_9fa48("154542") ? sample : (stryCov_9fa48("154542"), !sample)) || (stryMutAct_9fa48("154544") ? typeof sample === TYPEOF.OBJECT : stryMutAct_9fa48("154543") ? false : (stryCov_9fa48("154543", "154544"), typeof sample !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("154545")) {
          {}
        } else {
          stryCov_9fa48("154545");
          this.emitIgnoredSample(LATENCY_MEASUREMENT_REASON.INVALID_SHAPE, sample);
          return stryMutAct_9fa48("154546") ? true : (stryCov_9fa48("154546"), false);
        }
      }
      if (stryMutAct_9fa48("154549") ? (!sample.sourceGroupId || !sample.targetGroupId || !sample.sourceNodeId || !sample.targetNodeId) && !sample.sampleQuality : stryMutAct_9fa48("154548") ? false : stryMutAct_9fa48("154547") ? true : (stryCov_9fa48("154547", "154548", "154549"), (stryMutAct_9fa48("154551") ? (!sample.sourceGroupId || !sample.targetGroupId || !sample.sourceNodeId) && !sample.targetNodeId : stryMutAct_9fa48("154550") ? false : (stryCov_9fa48("154550", "154551"), (stryMutAct_9fa48("154553") ? (!sample.sourceGroupId || !sample.targetGroupId) && !sample.sourceNodeId : stryMutAct_9fa48("154552") ? false : (stryCov_9fa48("154552", "154553"), (stryMutAct_9fa48("154555") ? !sample.sourceGroupId && !sample.targetGroupId : stryMutAct_9fa48("154554") ? false : (stryCov_9fa48("154554", "154555"), (stryMutAct_9fa48("154556") ? sample.sourceGroupId : (stryCov_9fa48("154556"), !sample.sourceGroupId)) || (stryMutAct_9fa48("154557") ? sample.targetGroupId : (stryCov_9fa48("154557"), !sample.targetGroupId)))) || (stryMutAct_9fa48("154558") ? sample.sourceNodeId : (stryCov_9fa48("154558"), !sample.sourceNodeId)))) || (stryMutAct_9fa48("154559") ? sample.targetNodeId : (stryCov_9fa48("154559"), !sample.targetNodeId)))) || (stryMutAct_9fa48("154560") ? sample.sampleQuality : (stryCov_9fa48("154560"), !sample.sampleQuality)))) {
        if (stryMutAct_9fa48("154561")) {
          {}
        } else {
          stryCov_9fa48("154561");
          this.emitIgnoredSample(LATENCY_MEASUREMENT_REASON.INVALID_SHAPE, sample);
          return stryMutAct_9fa48("154562") ? true : (stryCov_9fa48("154562"), false);
        }
      }
      if (stryMutAct_9fa48("154565") ? !Number.isFinite(sample.rttMs) && sample.rttMs < LATENCY_MEASUREMENT_DEFAULT.MIN_RTT_MS : stryMutAct_9fa48("154564") ? false : stryMutAct_9fa48("154563") ? true : (stryCov_9fa48("154563", "154564", "154565"), (stryMutAct_9fa48("154566") ? Number.isFinite(sample.rttMs) : (stryCov_9fa48("154566"), !Number.isFinite(sample.rttMs))) || (stryMutAct_9fa48("154569") ? sample.rttMs >= LATENCY_MEASUREMENT_DEFAULT.MIN_RTT_MS : stryMutAct_9fa48("154568") ? sample.rttMs <= LATENCY_MEASUREMENT_DEFAULT.MIN_RTT_MS : stryMutAct_9fa48("154567") ? false : (stryCov_9fa48("154567", "154568", "154569"), sample.rttMs < LATENCY_MEASUREMENT_DEFAULT.MIN_RTT_MS)))) {
        if (stryMutAct_9fa48("154570")) {
          {}
        } else {
          stryCov_9fa48("154570");
          this.emitIgnoredSample(LATENCY_MEASUREMENT_REASON.INVALID_RTT, sample);
          return stryMutAct_9fa48("154571") ? true : (stryCov_9fa48("154571"), false);
        }
      }
      if (stryMutAct_9fa48("154573") ? false : stryMutAct_9fa48("154572") ? true : (stryCov_9fa48("154572", "154573"), this.isSampleStale(sample.timestamp))) {
        if (stryMutAct_9fa48("154574")) {
          {}
        } else {
          stryCov_9fa48("154574");
          this.emitIgnoredSample(LATENCY_MEASUREMENT_REASON.STALE_SAMPLE, sample);
          return stryMutAct_9fa48("154575") ? true : (stryCov_9fa48("154575"), false);
        }
      }
      return stryMutAct_9fa48("154576") ? false : (stryCov_9fa48("154576"), true);
    }
  }

  /**
   * Check if sample timestamp is stale.
   * @param {number} timestamp
   * @return {boolean}
   */
  isSampleStale(timestamp) {
    if (stryMutAct_9fa48("154577")) {
      {}
    } else {
      stryCov_9fa48("154577");
      if (stryMutAct_9fa48("154580") ? !Number.isFinite(timestamp) && timestamp <= NUM.ZERO : stryMutAct_9fa48("154579") ? false : stryMutAct_9fa48("154578") ? true : (stryCov_9fa48("154578", "154579", "154580"), (stryMutAct_9fa48("154581") ? Number.isFinite(timestamp) : (stryCov_9fa48("154581"), !Number.isFinite(timestamp))) || (stryMutAct_9fa48("154584") ? timestamp > NUM.ZERO : stryMutAct_9fa48("154583") ? timestamp < NUM.ZERO : stryMutAct_9fa48("154582") ? false : (stryCov_9fa48("154582", "154583", "154584"), timestamp <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("154585")) {
          {}
        } else {
          stryCov_9fa48("154585");
          return stryMutAct_9fa48("154586") ? false : (stryCov_9fa48("154586"), true);
        }
      }
      const ageMs = stryMutAct_9fa48("154587") ? this.now() + timestamp : (stryCov_9fa48("154587"), this.now() - timestamp);
      return stryMutAct_9fa48("154591") ? ageMs <= this.maxSampleAgeMs : stryMutAct_9fa48("154590") ? ageMs >= this.maxSampleAgeMs : stryMutAct_9fa48("154589") ? false : stryMutAct_9fa48("154588") ? true : (stryCov_9fa48("154588", "154589", "154590", "154591"), ageMs > this.maxSampleAgeMs);
    }
  }

  /**
   * Compute smoothed RTT.
   * @param {number} previousLatencyMs
   * @param {number} measuredLatencyMs
   * @return {number}
   */
  smoothLatency(previousLatencyMs, measuredLatencyMs) {
    if (stryMutAct_9fa48("154592")) {
      {}
    } else {
      stryCov_9fa48("154592");
      if (stryMutAct_9fa48("154595") ? !Number.isFinite(previousLatencyMs) && previousLatencyMs < NUM.ZERO : stryMutAct_9fa48("154594") ? false : stryMutAct_9fa48("154593") ? true : (stryCov_9fa48("154593", "154594", "154595"), (stryMutAct_9fa48("154596") ? Number.isFinite(previousLatencyMs) : (stryCov_9fa48("154596"), !Number.isFinite(previousLatencyMs))) || (stryMutAct_9fa48("154599") ? previousLatencyMs >= NUM.ZERO : stryMutAct_9fa48("154598") ? previousLatencyMs <= NUM.ZERO : stryMutAct_9fa48("154597") ? false : (stryCov_9fa48("154597", "154598", "154599"), previousLatencyMs < NUM.ZERO)))) {
        if (stryMutAct_9fa48("154600")) {
          {}
        } else {
          stryCov_9fa48("154600");
          return measuredLatencyMs;
        }
      }
      return stryMutAct_9fa48("154601") ? this.smoothingAlpha * measuredLatencyMs - (NUM.ONE - this.smoothingAlpha) * previousLatencyMs : (stryCov_9fa48("154601"), (stryMutAct_9fa48("154602") ? this.smoothingAlpha / measuredLatencyMs : (stryCov_9fa48("154602"), this.smoothingAlpha * measuredLatencyMs)) + (stryMutAct_9fa48("154603") ? (NUM.ONE - this.smoothingAlpha) / previousLatencyMs : (stryCov_9fa48("154603"), (stryMutAct_9fa48("154604") ? NUM.ONE + this.smoothingAlpha : (stryCov_9fa48("154604"), NUM.ONE - this.smoothingAlpha)) * previousLatencyMs)));
    }
  }

  /**
   * Build deterministic row key for inter-group edge.
   * @param {string} sourceGroupId
   * @param {string} targetGroupId
   * @return {string}
   */
  buildLatencyEdgeId(sourceGroupId, targetGroupId) {
    if (stryMutAct_9fa48("154605")) {
      {}
    } else {
      stryCov_9fa48("154605");
      return (stryMutAct_9fa48("154606") ? `` : (stryCov_9fa48("154606"), `${sourceGroupId}${LATENCY_MEASUREMENT_DEFAULT.EDGE_ID_SEPARATOR}`)) + (stryMutAct_9fa48("154607") ? `` : (stryCov_9fa48("154607"), `${targetGroupId}`));
    }
  }

  /**
   * Resolve existing aggregate row for smoothing/sample-count updates.
   * @param {string} edgeId
   * @return {Promise<Object|null>}
   * @private
   */
  async getExistingEdgeRow(edgeId) {
    if (stryMutAct_9fa48("154608")) {
      {}
    } else {
      stryCov_9fa48("154608");
      if (stryMutAct_9fa48("154611") ? this.systemTableCache || typeof this.systemTableCache.get === TYPEOF.FUNCTION : stryMutAct_9fa48("154610") ? false : stryMutAct_9fa48("154609") ? true : (stryCov_9fa48("154609", "154610", "154611"), this.systemTableCache && (stryMutAct_9fa48("154613") ? typeof this.systemTableCache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("154612") ? true : (stryCov_9fa48("154612", "154613"), typeof this.systemTableCache.get === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("154614")) {
          {}
        } else {
          stryCov_9fa48("154614");
          return this.systemTableCache.get(TABLES.INTER_GROUP_LATENCIES, edgeId);
        }
      }
      const executeQuery = stryMutAct_9fa48("154616") ? this.cdcIntegrationService.sqlQueryEngine?.executeQuery : stryMutAct_9fa48("154615") ? this.cdcIntegrationService?.sqlQueryEngine.executeQuery : (stryCov_9fa48("154615", "154616"), this.cdcIntegrationService?.sqlQueryEngine?.executeQuery);
      if (stryMutAct_9fa48("154619") ? typeof executeQuery === TYPEOF.FUNCTION : stryMutAct_9fa48("154618") ? false : stryMutAct_9fa48("154617") ? true : (stryCov_9fa48("154617", "154618", "154619"), typeof executeQuery !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("154620")) {
          {}
        } else {
          stryCov_9fa48("154620");
          return null;
        }
      }
      const result = await executeQuery(INTER_GROUP_LATENCY_SQL.SELECT_BY_EDGE_ID, stryMutAct_9fa48("154621") ? [] : (stryCov_9fa48("154621"), [edgeId]));
      return stryMutAct_9fa48("154624") ? result?.rows?.[NUM.ZERO] && null : stryMutAct_9fa48("154623") ? false : stryMutAct_9fa48("154622") ? true : (stryCov_9fa48("154622", "154623", "154624"), (stryMutAct_9fa48("154626") ? result.rows?.[NUM.ZERO] : stryMutAct_9fa48("154625") ? result?.rows[NUM.ZERO] : (stryCov_9fa48("154625", "154626"), result?.rows?.[NUM.ZERO])) || null);
    }
  }

  /**
   * Refresh runtime config values from ConfigurationManager.
   */
  refreshConfig() {
    if (stryMutAct_9fa48("154627")) {
      {}
    } else {
      stryCov_9fa48("154627");
      this.pingTimeoutMs = this.resolveNumericConfig(LATENCY_TOPOLOGY_CONFIG_KEY.PING_TIMEOUT_MS, LATENCY_TOPOLOGY_DEFAULT.PING_TIMEOUT_MS, LATENCY_MEASUREMENT_CONFIG_MIN.PING_TIMEOUT_MS);
      this.pingRetryCount = this.resolveIntegerConfig(LATENCY_TOPOLOGY_CONFIG_KEY.PING_RETRY_COUNT, LATENCY_TOPOLOGY_DEFAULT.PING_RETRY_COUNT, LATENCY_TOPOLOGY_DEFAULT.PING_RETRY_COUNT);
      this.smoothingAlpha = this.resolveNumericConfig(LATENCY_TOPOLOGY_CONFIG_KEY.SMOOTHING_ALPHA, LATENCY_TOPOLOGY_DEFAULT.SMOOTHING_ALPHA, LATENCY_MEASUREMENT_CONFIG_MIN.SMOOTHING_ALPHA);
      this.recalcIntervalMs = this.resolveNumericConfig(LATENCY_TOPOLOGY_CONFIG_KEY.RECALC_INTERVAL_MS, LATENCY_TOPOLOGY_DEFAULT.RECALC_INTERVAL_MS, LATENCY_MEASUREMENT_CONFIG_MIN.RECALC_INTERVAL_MS);
      this.maxSampleAgeMs = stryMutAct_9fa48("154628") ? this.recalcIntervalMs / LATENCY_MEASUREMENT_DEFAULT.STALE_SAMPLE_AGE_MULTIPLIER : (stryCov_9fa48("154628"), this.recalcIntervalMs * LATENCY_MEASUREMENT_DEFAULT.STALE_SAMPLE_AGE_MULTIPLIER);
    }
  }

  /**
   * Resolve numeric config with fallback and lower bound.
   * @param {string} key
   * @param {number} fallback
   * @param {number} minValue
   * @return {number}
   * @private
   */
  resolveNumericConfig(key, fallback, minValue) {
    if (stryMutAct_9fa48("154629")) {
      {}
    } else {
      stryCov_9fa48("154629");
      const value = this.config.get(key);
      if (stryMutAct_9fa48("154632") ? typeof value !== TYPEOF.NUMBER && !Number.isFinite(value) : stryMutAct_9fa48("154631") ? false : stryMutAct_9fa48("154630") ? true : (stryCov_9fa48("154630", "154631", "154632"), (stryMutAct_9fa48("154634") ? typeof value === TYPEOF.NUMBER : stryMutAct_9fa48("154633") ? false : (stryCov_9fa48("154633", "154634"), typeof value !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("154635") ? Number.isFinite(value) : (stryCov_9fa48("154635"), !Number.isFinite(value))))) {
        if (stryMutAct_9fa48("154636")) {
          {}
        } else {
          stryCov_9fa48("154636");
          return fallback;
        }
      }
      return stryMutAct_9fa48("154637") ? Math.min(minValue, value) : (stryCov_9fa48("154637"), Math.max(minValue, value));
    }
  }

  /**
   * Resolve integer config with fallback and lower bound.
   * @param {string} key
   * @param {number} fallback
   * @param {number} minValue
   * @return {number}
   * @private
   */
  resolveIntegerConfig(key, fallback, minValue) {
    if (stryMutAct_9fa48("154638")) {
      {}
    } else {
      stryCov_9fa48("154638");
      const value = this.config.get(key);
      if (stryMutAct_9fa48("154641") ? typeof value !== TYPEOF.NUMBER && !Number.isFinite(value) : stryMutAct_9fa48("154640") ? false : stryMutAct_9fa48("154639") ? true : (stryCov_9fa48("154639", "154640", "154641"), (stryMutAct_9fa48("154643") ? typeof value === TYPEOF.NUMBER : stryMutAct_9fa48("154642") ? false : (stryCov_9fa48("154642", "154643"), typeof value !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("154644") ? Number.isFinite(value) : (stryCov_9fa48("154644"), !Number.isFinite(value))))) {
        if (stryMutAct_9fa48("154645")) {
          {}
        } else {
          stryCov_9fa48("154645");
          return fallback;
        }
      }
      return stryMutAct_9fa48("154646") ? Math.min(minValue, Math.floor(value)) : (stryCov_9fa48("154646"), Math.max(minValue, Math.floor(value)));
    }
  }

  /**
   * Resolve timeout value.
   * @param {number|undefined} timeoutMs
   * @return {number}
   * @private
   */
  resolveTimeoutMs(timeoutMs) {
    if (stryMutAct_9fa48("154647")) {
      {}
    } else {
      stryCov_9fa48("154647");
      if (stryMutAct_9fa48("154650") ? typeof timeoutMs !== TYPEOF.NUMBER && !Number.isFinite(timeoutMs) : stryMutAct_9fa48("154649") ? false : stryMutAct_9fa48("154648") ? true : (stryCov_9fa48("154648", "154649", "154650"), (stryMutAct_9fa48("154652") ? typeof timeoutMs === TYPEOF.NUMBER : stryMutAct_9fa48("154651") ? false : (stryCov_9fa48("154651", "154652"), typeof timeoutMs !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("154653") ? Number.isFinite(timeoutMs) : (stryCov_9fa48("154653"), !Number.isFinite(timeoutMs))))) {
        if (stryMutAct_9fa48("154654")) {
          {}
        } else {
          stryCov_9fa48("154654");
          return this.pingTimeoutMs;
        }
      }
      return stryMutAct_9fa48("154655") ? Math.min(LATENCY_MEASUREMENT_DEFAULT.MIN_RTT_MS, timeoutMs) : (stryCov_9fa48("154655"), Math.max(LATENCY_MEASUREMENT_DEFAULT.MIN_RTT_MS, timeoutMs));
    }
  }

  /**
   * Resolve retry count value.
   * @param {number|undefined} retryCount
   * @return {number}
   * @private
   */
  resolveRetryCount(retryCount) {
    if (stryMutAct_9fa48("154656")) {
      {}
    } else {
      stryCov_9fa48("154656");
      if (stryMutAct_9fa48("154659") ? typeof retryCount !== TYPEOF.NUMBER && !Number.isFinite(retryCount) : stryMutAct_9fa48("154658") ? false : stryMutAct_9fa48("154657") ? true : (stryCov_9fa48("154657", "154658", "154659"), (stryMutAct_9fa48("154661") ? typeof retryCount === TYPEOF.NUMBER : stryMutAct_9fa48("154660") ? false : (stryCov_9fa48("154660", "154661"), typeof retryCount !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("154662") ? Number.isFinite(retryCount) : (stryCov_9fa48("154662"), !Number.isFinite(retryCount))))) {
        if (stryMutAct_9fa48("154663")) {
          {}
        } else {
          stryCov_9fa48("154663");
          return this.pingRetryCount;
        }
      }
      return stryMutAct_9fa48("154664") ? Math.min(NUM.ZERO, Math.floor(retryCount)) : (stryCov_9fa48("154664"), Math.max(NUM.ZERO, Math.floor(retryCount)));
    }
  }

  /**
   * Emit and log ignored sample reason.
   * @param {string} reason
   * @param {Object} sample
   * @private
   */
  emitIgnoredSample(reason, sample) {
    if (stryMutAct_9fa48("154665")) {
      {}
    } else {
      stryCov_9fa48("154665");
      this.logger.debug(LATENCY_MEASUREMENT_LOG_MSG.SAMPLE_IGNORED, stryMutAct_9fa48("154666") ? {} : (stryCov_9fa48("154666"), {
        nodeId: this.nodeId,
        reason,
        sample
      }));
      this.emit(LATENCY_MEASUREMENT_EVENT.SAMPLE_IGNORED, stryMutAct_9fa48("154667") ? {} : (stryCov_9fa48("154667"), {
        reason,
        sample
      }));
      stryMutAct_9fa48("154668") ? this.stats.sampleIgnoredCount -= NUM.ONE : (stryCov_9fa48("154668"), this.stats.sampleIgnoredCount += NUM.ONE);
    }
  }

  /**
   * Get diagnostics counters.
   * @return {Object}
   */
  getStats() {
    if (stryMutAct_9fa48("154669")) {
      {}
    } else {
      stryCov_9fa48("154669");
      return stryMutAct_9fa48("154670") ? {} : (stryCov_9fa48("154670"), {
        ...this.stats,
        nodeId: this.nodeId,
        state: this.state
      });
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("154671")) {
      {}
    } else {
      stryCov_9fa48("154671");
      if (stryMutAct_9fa48("154673") ? false : stryMutAct_9fa48("154672") ? true : (stryCov_9fa48("154672", "154673"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("154674")) {
          {}
        } else {
          stryCov_9fa48("154674");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("154675") ? {} : (stryCov_9fa48("154675"), {
        nodeId: this.nodeId,
        getCdcIntegrationService: stryMutAct_9fa48("154676") ? () => undefined : (stryCov_9fa48("154676"), () => this.cdcIntegrationService),
        getMessageRouter: stryMutAct_9fa48("154677") ? () => undefined : (stryCov_9fa48("154677"), () => this.messageRouter),
        getSystemTableCache: stryMutAct_9fa48("154678") ? () => undefined : (stryCov_9fa48("154678"), () => this.systemTableCache)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Ensure lifecycle initialization has happened.
   * @private
   */
  ensureInitialized() {
    if (stryMutAct_9fa48("154679")) {
      {}
    } else {
      stryCov_9fa48("154679");
      assertCritical(stryMutAct_9fa48("154682") ? this.state === LATENCY_MEASUREMENT_STATE.CREATED : stryMutAct_9fa48("154681") ? false : stryMutAct_9fa48("154680") ? true : (stryCov_9fa48("154680", "154681", "154682"), this.state !== LATENCY_MEASUREMENT_STATE.CREATED), LATENCY_MEASUREMENT_ERROR_MSG.NOT_INITIALIZED);
    }
  }

  /**
   * Current wall clock timestamp.
   * @return {number}
   * @private
   */
  now() {
    if (stryMutAct_9fa48("154683")) {
      {}
    } else {
      stryCov_9fa48("154683");
      return this.nowFn();
    }
  }
}
export { LatencyMeasurementService };