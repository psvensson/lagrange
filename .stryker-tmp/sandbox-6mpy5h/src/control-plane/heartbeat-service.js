/**
 * HeartbeatService - Periodic heartbeat updates and consecutive
 * failure tracking. Extracted from ControlPlaneService.
 * Requirements: 8.2, 8.6
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
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { COLUMN, ENDPOINT_STATUS, NUM, SERVICE_STATUS, STATE, STRING, TRANSPORT_TYPE, TYPEOF } from '../constants/index.js';
import { TRANSPORT_CONFIG_KEY, TRANSPORT_DEFAULT } from '../constants/transport.js';
import { assertCritical } from '../utils/assert.js';
import { AuthoritativeControlPlaneView } from './authoritative-control-plane-view.js';
import { createControlPlaneRuntimeBundle } from './control-plane-runtime-bundle.js';
import { CONTROL_PLANE_MUTATION_MERGE_POLICY } from './control-plane-system-table-gateway.js';
import { HEARTBEAT_CONFIG_KEY, HEARTBEAT_DEFAULT, HEARTBEAT_ERROR_MSG, HEARTBEAT_EVENT, HEARTBEAT_FAILURE_WARN_THRESHOLD, HEARTBEAT_LOG_MSG, HEARTBEAT_MEMORY_TREND, HEARTBEAT_QUIET_MODE_BYPASS_REASON, HEARTBEAT_STATE, HEARTBEAT_SUBSYSTEM } from './heartbeat-service-constants.js';
import { PRESSURE_WORK_CLASS } from './pressure-governor.js';
const HEARTBEAT_SERVICE_LITERAL = Object.freeze(stryMutAct_9fa48("64847") ? {} : (stryCov_9fa48("64847"), {
  VALUE_2: 2,
  NODE_STATE_REPORTER_TIMEOUT: stryMutAct_9fa48("64848") ? "" : (stryCov_9fa48("64848"), 'node_state_reporter_timeout'),
  HEARTBEAT: stryMutAct_9fa48("64849") ? "" : (stryCov_9fa48("64849"), 'heartbeat'),
  NODE_ROW_MISSING: stryMutAct_9fa48("64850") ? "" : (stryCov_9fa48("64850"), 'NODE_ROW_MISSING'),
  NODE_STATE_REPORTER: stryMutAct_9fa48("64851") ? "" : (stryCov_9fa48("64851"), 'node_state_reporter'),
  NODE_ROW_MISSING_FROM_CACHE: stryMutAct_9fa48("64852") ? "" : (stryCov_9fa48("64852"), 'node_row_missing_from_cache'),
  NODE_SHUTDOWN_REPORTER_UNVERIFIED: stryMutAct_9fa48("64853") ? "" : (stryCov_9fa48("64853"), 'node_shutdown_reporter_unverified'),
  NODE_ROW_MISSING_FROM_STORAGE: stryMutAct_9fa48("64854") ? "" : (stryCov_9fa48("64854"), 'node_row_missing_from_storage'),
  NODE_SHUTDOWN_CDC_UPDATE: stryMutAct_9fa48("64855") ? "" : (stryCov_9fa48("64855"), 'node_shutdown_cdc_update'),
  ATTEMPT_TIMEOUT: stryMutAct_9fa48("64856") ? "" : (stryCov_9fa48("64856"), 'attempt_timeout'),
  NO_PREVIOUS_WRITE: stryMutAct_9fa48("64857") ? "" : (stryCov_9fa48("64857"), 'no_previous_write'),
  MAX_STALENESS: stryMutAct_9fa48("64858") ? "" : (stryCov_9fa48("64858"), 'max_staleness'),
  STRUCTURAL_CHANGED: stryMutAct_9fa48("64859") ? "" : (stryCov_9fa48("64859"), 'structural_changed'),
  NODEHEARTBEATWRITES: stryMutAct_9fa48("64860") ? "" : (stryCov_9fa48("64860"), 'nodeHeartbeatWrites'),
  ENDPOINTUPSERTS: stryMutAct_9fa48("64861") ? "" : (stryCov_9fa48("64861"), 'endpointUpserts'),
  CDC_UPDATE: stryMutAct_9fa48("64862") ? "" : (stryCov_9fa48("64862"), 'cdc_update'),
  HEARTBEATSERVICE_REQUIRES_CONTROLPLANESYSTEMTABLEGATEWAY: stryMutAct_9fa48("64863") ? "" : (stryCov_9fa48("64863"), 'HeartbeatService requires controlPlaneSystemTableGateway'),
  BACKGROUND: stryMutAct_9fa48("64864") ? "" : (stryCov_9fa48("64864"), 'background'),
  COALESCED_MIN_INTERVAL: stryMutAct_9fa48("64865") ? "" : (stryCov_9fa48("64865"), 'coalesced_min_interval'),
  UTILIZATION_CHANGED: stryMutAct_9fa48("64866") ? "" : (stryCov_9fa48("64866"), 'utilization_changed'),
  COALESCED_UNCHANGED: stryMutAct_9fa48("64867") ? "" : (stryCov_9fa48("64867"), 'coalesced_unchanged'),
  BOOLEAN: stryMutAct_9fa48("64868") ? "" : (stryCov_9fa48("64868"), 'boolean')
}));
const ZERO = 0;
const ONE = 1;
const MS_PER_MINUTE = 60000;
const MIN_REGRESSION_SAMPLE_COUNT = 2;
const REPORTER_VISIBILITY_QUERY_TIMEOUT_MS = 1000;
const ENDPOINT_ID_PREFIX = stryMutAct_9fa48("64869") ? "" : (stryCov_9fa48("64869"), 'ep-');
const ENDPOINT_ID_SUFFIX = stryMutAct_9fa48("64870") ? "" : (stryCov_9fa48("64870"), '-ws');
function buildNodeHeartbeatWriteDecision(shouldWrite, reason) {
  if (stryMutAct_9fa48("64871")) {
    {}
  } else {
    stryCov_9fa48("64871");
    return stryMutAct_9fa48("64872") ? {} : (stryCov_9fa48("64872"), {
      shouldWrite,
      reason
    });
  }
}
function normalizeHeartbeatPublicationTimestamp(value) {
  if (stryMutAct_9fa48("64873")) {
    {}
  } else {
    stryCov_9fa48("64873");
    if (stryMutAct_9fa48("64876") ? typeof value === TYPEOF.STRING || value.length > ZERO : stryMutAct_9fa48("64875") ? false : stryMutAct_9fa48("64874") ? true : (stryCov_9fa48("64874", "64875", "64876"), (stryMutAct_9fa48("64878") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("64877") ? true : (stryCov_9fa48("64877", "64878"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("64881") ? value.length <= ZERO : stryMutAct_9fa48("64880") ? value.length >= ZERO : stryMutAct_9fa48("64879") ? true : (stryCov_9fa48("64879", "64880", "64881"), value.length > ZERO)))) {
      if (stryMutAct_9fa48("64882")) {
        {}
      } else {
        stryCov_9fa48("64882");
        return value;
      }
    }
    const timestampMs = Number(value);
    if (stryMutAct_9fa48("64885") ? false : stryMutAct_9fa48("64884") ? true : stryMutAct_9fa48("64883") ? Number.isFinite(timestampMs) : (stryCov_9fa48("64883", "64884", "64885"), !Number.isFinite(timestampMs))) {
      if (stryMutAct_9fa48("64886")) {
        {}
      } else {
        stryCov_9fa48("64886");
        return null;
      }
    }
    return new Date(timestampMs).toISOString();
  }
}
function normalizeHeartbeatPublicationDiagnostics(source, fallbackPath = null) {
  if (stryMutAct_9fa48("64887")) {
    {}
  } else {
    stryCov_9fa48("64887");
    const value = (stryMutAct_9fa48("64890") ? source || typeof source === TYPEOF.OBJECT : stryMutAct_9fa48("64889") ? false : stryMutAct_9fa48("64888") ? true : (stryCov_9fa48("64888", "64889", "64890"), source && (stryMutAct_9fa48("64892") ? typeof source !== TYPEOF.OBJECT : stryMutAct_9fa48("64891") ? true : (stryCov_9fa48("64891", "64892"), typeof source === TYPEOF.OBJECT)))) ? source : {};
    const targetAddress = (stryMutAct_9fa48("64895") ? typeof value.targetAddress === TYPEOF.STRING || value.targetAddress.length > ZERO : stryMutAct_9fa48("64894") ? false : stryMutAct_9fa48("64893") ? true : (stryCov_9fa48("64893", "64894", "64895"), (stryMutAct_9fa48("64897") ? typeof value.targetAddress !== TYPEOF.STRING : stryMutAct_9fa48("64896") ? true : (stryCov_9fa48("64896", "64897"), typeof value.targetAddress === TYPEOF.STRING)) && (stryMutAct_9fa48("64900") ? value.targetAddress.length <= ZERO : stryMutAct_9fa48("64899") ? value.targetAddress.length >= ZERO : stryMutAct_9fa48("64898") ? true : (stryCov_9fa48("64898", "64899", "64900"), value.targetAddress.length > ZERO)))) ? value.targetAddress : null;
    const addressParts = targetAddress ? targetAddress.split(stryMutAct_9fa48("64901") ? "" : (stryCov_9fa48("64901"), '/')) : stryMutAct_9fa48("64902") ? ["Stryker was here"] : (stryCov_9fa48("64902"), []);
    const targetNodeId = (stryMutAct_9fa48("64905") ? typeof value.targetNodeId === TYPEOF.STRING || value.targetNodeId.length > ZERO : stryMutAct_9fa48("64904") ? false : stryMutAct_9fa48("64903") ? true : (stryCov_9fa48("64903", "64904", "64905"), (stryMutAct_9fa48("64907") ? typeof value.targetNodeId !== TYPEOF.STRING : stryMutAct_9fa48("64906") ? true : (stryCov_9fa48("64906", "64907"), typeof value.targetNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("64910") ? value.targetNodeId.length <= ZERO : stryMutAct_9fa48("64909") ? value.targetNodeId.length >= ZERO : stryMutAct_9fa48("64908") ? true : (stryCov_9fa48("64908", "64909", "64910"), value.targetNodeId.length > ZERO)))) ? value.targetNodeId : stryMutAct_9fa48("64913") ? addressParts[ZERO] && null : stryMutAct_9fa48("64912") ? false : stryMutAct_9fa48("64911") ? true : (stryCov_9fa48("64911", "64912", "64913"), addressParts[ZERO] || null);
    const targetServiceType = (stryMutAct_9fa48("64916") ? typeof value.targetServiceType === TYPEOF.STRING || value.targetServiceType.length > ZERO : stryMutAct_9fa48("64915") ? false : stryMutAct_9fa48("64914") ? true : (stryCov_9fa48("64914", "64915", "64916"), (stryMutAct_9fa48("64918") ? typeof value.targetServiceType !== TYPEOF.STRING : stryMutAct_9fa48("64917") ? true : (stryCov_9fa48("64917", "64918"), typeof value.targetServiceType === TYPEOF.STRING)) && (stryMutAct_9fa48("64921") ? value.targetServiceType.length <= ZERO : stryMutAct_9fa48("64920") ? value.targetServiceType.length >= ZERO : stryMutAct_9fa48("64919") ? true : (stryCov_9fa48("64919", "64920", "64921"), value.targetServiceType.length > ZERO)))) ? value.targetServiceType : stryMutAct_9fa48("64924") ? addressParts[ONE] && null : stryMutAct_9fa48("64923") ? false : stryMutAct_9fa48("64922") ? true : (stryCov_9fa48("64922", "64923", "64924"), addressParts[ONE] || null);
    const targetServiceId = (stryMutAct_9fa48("64927") ? typeof value.targetServiceId === TYPEOF.STRING || value.targetServiceId.length > ZERO : stryMutAct_9fa48("64926") ? false : stryMutAct_9fa48("64925") ? true : (stryCov_9fa48("64925", "64926", "64927"), (stryMutAct_9fa48("64929") ? typeof value.targetServiceId !== TYPEOF.STRING : stryMutAct_9fa48("64928") ? true : (stryCov_9fa48("64928", "64929"), typeof value.targetServiceId === TYPEOF.STRING)) && (stryMutAct_9fa48("64932") ? value.targetServiceId.length <= ZERO : stryMutAct_9fa48("64931") ? value.targetServiceId.length >= ZERO : stryMutAct_9fa48("64930") ? true : (stryCov_9fa48("64930", "64931", "64932"), value.targetServiceId.length > ZERO)))) ? value.targetServiceId : stryMutAct_9fa48("64935") ? addressParts.slice(2).join('/') && null : stryMutAct_9fa48("64934") ? false : stryMutAct_9fa48("64933") ? true : (stryCov_9fa48("64933", "64934", "64935"), (stryMutAct_9fa48("64936") ? addressParts.join('/') : (stryCov_9fa48("64936"), addressParts.slice(2).join(stryMutAct_9fa48("64937") ? "" : (stryCov_9fa48("64937"), '/')))) || null);
    const publicationPath = (stryMutAct_9fa48("64940") ? typeof value.publicationPath === TYPEOF.STRING || value.publicationPath.length > ZERO : stryMutAct_9fa48("64939") ? false : stryMutAct_9fa48("64938") ? true : (stryCov_9fa48("64938", "64939", "64940"), (stryMutAct_9fa48("64942") ? typeof value.publicationPath !== TYPEOF.STRING : stryMutAct_9fa48("64941") ? true : (stryCov_9fa48("64941", "64942"), typeof value.publicationPath === TYPEOF.STRING)) && (stryMutAct_9fa48("64945") ? value.publicationPath.length <= ZERO : stryMutAct_9fa48("64944") ? value.publicationPath.length >= ZERO : stryMutAct_9fa48("64943") ? true : (stryCov_9fa48("64943", "64944", "64945"), value.publicationPath.length > ZERO)))) ? value.publicationPath : fallbackPath;
    return stryMutAct_9fa48("64946") ? {} : (stryCov_9fa48("64946"), {
      publicationPath,
      targetAddress,
      targetNodeId,
      targetServiceType,
      targetServiceId
    });
  }
} /**
  * Estimate usage-percent slope (percent per minute) with linear regression.
  * @param {Array<{timestamp: number, usagePercent: number}>} samples
  * @return {number}
  */
function calculateUsageSlopePerMinute(samples) {
  if (stryMutAct_9fa48("64947")) {
    {}
  } else {
    stryCov_9fa48("64947");
    if (stryMutAct_9fa48("64950") ? !Array.isArray(samples) && samples.length < MIN_REGRESSION_SAMPLE_COUNT : stryMutAct_9fa48("64949") ? false : stryMutAct_9fa48("64948") ? true : (stryCov_9fa48("64948", "64949", "64950"), (stryMutAct_9fa48("64951") ? Array.isArray(samples) : (stryCov_9fa48("64951"), !Array.isArray(samples))) || (stryMutAct_9fa48("64954") ? samples.length >= MIN_REGRESSION_SAMPLE_COUNT : stryMutAct_9fa48("64953") ? samples.length <= MIN_REGRESSION_SAMPLE_COUNT : stryMutAct_9fa48("64952") ? false : (stryCov_9fa48("64952", "64953", "64954"), samples.length < MIN_REGRESSION_SAMPLE_COUNT)))) {
      if (stryMutAct_9fa48("64955")) {
        {}
      } else {
        stryCov_9fa48("64955");
        return ZERO;
      }
    }
    const origin = samples[ZERO].timestamp;
    let sumX = ZERO;
    let sumY = ZERO;
    let sumXY = ZERO;
    let sumX2 = ZERO;
    for (const sample of samples) {
      if (stryMutAct_9fa48("64956")) {
        {}
      } else {
        stryCov_9fa48("64956");
        const x = stryMutAct_9fa48("64957") ? sample.timestamp + origin : (stryCov_9fa48("64957"), sample.timestamp - origin);
        const y = sample.usagePercent;
        stryMutAct_9fa48("64958") ? sumX -= x : (stryCov_9fa48("64958"), sumX += x);
        stryMutAct_9fa48("64959") ? sumY -= y : (stryCov_9fa48("64959"), sumY += y);
        stryMutAct_9fa48("64960") ? sumXY -= x * y : (stryCov_9fa48("64960"), sumXY += stryMutAct_9fa48("64961") ? x / y : (stryCov_9fa48("64961"), x * y));
        stryMutAct_9fa48("64962") ? sumX2 -= x * x : (stryCov_9fa48("64962"), sumX2 += stryMutAct_9fa48("64963") ? x / x : (stryCov_9fa48("64963"), x * x));
      }
    }
    const count = samples.length;
    const denominator = stryMutAct_9fa48("64964") ? count * sumX2 + sumX * sumX : (stryCov_9fa48("64964"), (stryMutAct_9fa48("64965") ? count / sumX2 : (stryCov_9fa48("64965"), count * sumX2)) - (stryMutAct_9fa48("64966") ? sumX / sumX : (stryCov_9fa48("64966"), sumX * sumX)));
    if (stryMutAct_9fa48("64970") ? denominator > ZERO : stryMutAct_9fa48("64969") ? denominator < ZERO : stryMutAct_9fa48("64968") ? false : stryMutAct_9fa48("64967") ? true : (stryCov_9fa48("64967", "64968", "64969", "64970"), denominator <= ZERO)) {
      if (stryMutAct_9fa48("64971")) {
        {}
      } else {
        stryCov_9fa48("64971");
        return ZERO;
      }
    }
    const slopePerMs = stryMutAct_9fa48("64972") ? (count * sumXY - sumX * sumY) * denominator : (stryCov_9fa48("64972"), (stryMutAct_9fa48("64973") ? count * sumXY + sumX * sumY : (stryCov_9fa48("64973"), (stryMutAct_9fa48("64974") ? count / sumXY : (stryCov_9fa48("64974"), count * sumXY)) - (stryMutAct_9fa48("64975") ? sumX / sumY : (stryCov_9fa48("64975"), sumX * sumY)))) / denominator);
    return stryMutAct_9fa48("64976") ? slopePerMs / MS_PER_MINUTE : (stryCov_9fa48("64976"), slopePerMs * MS_PER_MINUTE);
  }
}
class HeartbeatService extends EventEmitter {
  /**
  * @param {Object} options - Configuration options.
  * @param {string} options.nodeId - Local node ID.
  * @param {string} options.nodeAddress - Local node address.
  * @param {Object} options.cdcIntegrationService - CDC service.
  * @param {Object} options.systemTableCache - System table cache.
  */
  constructor(options = {}) {
    if (stryMutAct_9fa48("64977")) {
      {}
    } else {
      stryCov_9fa48("64977");
      super();
      this.nodeId = stryMutAct_9fa48("64980") ? options.nodeId && null : stryMutAct_9fa48("64979") ? false : stryMutAct_9fa48("64978") ? true : (stryCov_9fa48("64978", "64979", "64980"), options.nodeId || null);
      this.nodeAddress = stryMutAct_9fa48("64983") ? options.nodeAddress && null : stryMutAct_9fa48("64982") ? false : stryMutAct_9fa48("64981") ? true : (stryCov_9fa48("64981", "64982", "64983"), options.nodeAddress || null);
      this.advertisedNodeWsAddress = stryMutAct_9fa48("64986") ? options.advertisedNodeWsAddress && null : stryMutAct_9fa48("64985") ? false : stryMutAct_9fa48("64984") ? true : (stryCov_9fa48("64984", "64985", "64986"), options.advertisedNodeWsAddress || null);
      this.cdcIntegrationService = stryMutAct_9fa48("64989") ? options.cdcIntegrationService && null : stryMutAct_9fa48("64988") ? false : stryMutAct_9fa48("64987") ? true : (stryCov_9fa48("64987", "64988", "64989"), options.cdcIntegrationService || null);
      this.systemTableCache = stryMutAct_9fa48("64992") ? options.systemTableCache && null : stryMutAct_9fa48("64991") ? false : stryMutAct_9fa48("64990") ? true : (stryCov_9fa48("64990", "64991", "64992"), options.systemTableCache || null);
      this.quietMode = stryMutAct_9fa48("64995") ? options.quietMode && null : stryMutAct_9fa48("64994") ? false : stryMutAct_9fa48("64993") ? true : (stryCov_9fa48("64993", "64994", "64995"), options.quietMode || null);
      this.nodeStateReporter = (stryMutAct_9fa48("64998") ? typeof options.nodeStateReporter !== TYPEOF.FUNCTION : stryMutAct_9fa48("64997") ? false : stryMutAct_9fa48("64996") ? true : (stryCov_9fa48("64996", "64997", "64998"), typeof options.nodeStateReporter === TYPEOF.FUNCTION)) ? options.nodeStateReporter : null;
      this.verifyReporterVisibilityOnSuccess = stryMutAct_9fa48("65001") ? options.verifyReporterVisibilityOnSuccess !== true : stryMutAct_9fa48("65000") ? false : stryMutAct_9fa48("64999") ? true : (stryCov_9fa48("64999", "65000", "65001"), options.verifyReporterVisibilityOnSuccess === (stryMutAct_9fa48("65002") ? false : (stryCov_9fa48("65002"), true)));
      this.now = (stryMutAct_9fa48("65005") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("65004") ? false : stryMutAct_9fa48("65003") ? true : (stryCov_9fa48("65003", "65004", "65005"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("65006") ? () => undefined : (stryCov_9fa48("65006"), () => Date.now());
      this.setIntervalFn = (stryMutAct_9fa48("65009") ? typeof options.setIntervalFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("65008") ? false : stryMutAct_9fa48("65007") ? true : (stryCov_9fa48("65007", "65008", "65009"), typeof options.setIntervalFn === TYPEOF.FUNCTION)) ? options.setIntervalFn : setInterval;
      this.clearIntervalFn = (stryMutAct_9fa48("65012") ? typeof options.clearIntervalFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("65011") ? false : stryMutAct_9fa48("65010") ? true : (stryCov_9fa48("65010", "65011", "65012"), typeof options.clearIntervalFn === TYPEOF.FUNCTION)) ? options.clearIntervalFn : clearInterval;
      this.setTimeoutFn = (stryMutAct_9fa48("65015") ? typeof options.setTimeoutFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("65014") ? false : stryMutAct_9fa48("65013") ? true : (stryCov_9fa48("65013", "65014", "65015"), typeof options.setTimeoutFn === TYPEOF.FUNCTION)) ? options.setTimeoutFn : setTimeout;
      this.clearTimeoutFn = (stryMutAct_9fa48("65018") ? typeof options.clearTimeoutFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("65017") ? false : stryMutAct_9fa48("65016") ? true : (stryCov_9fa48("65016", "65017", "65018"), typeof options.clearTimeoutFn === TYPEOF.FUNCTION)) ? options.clearTimeoutFn : clearTimeout;
      this.authoritativeControlPlaneView = stryMutAct_9fa48("65021") ? options.authoritativeControlPlaneView && null : stryMutAct_9fa48("65020") ? false : stryMutAct_9fa48("65019") ? true : (stryCov_9fa48("65019", "65020", "65021"), options.authoritativeControlPlaneView || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("65024") ? options.controlPlaneSystemTableGateway && (this.cdcIntegrationService || this.systemTableCache ? createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        systemTableCache: this.systemTableCache,
        messageRouter: options.messageRouter || null,
        now: options.now
      }).controlPlaneSystemTableGateway : null) : stryMutAct_9fa48("65023") ? false : stryMutAct_9fa48("65022") ? true : (stryCov_9fa48("65022", "65023", "65024"), options.controlPlaneSystemTableGateway || ((stryMutAct_9fa48("65027") ? this.cdcIntegrationService && this.systemTableCache : stryMutAct_9fa48("65026") ? false : stryMutAct_9fa48("65025") ? true : (stryCov_9fa48("65025", "65026", "65027"), this.cdcIntegrationService || this.systemTableCache)) ? createControlPlaneRuntimeBundle(stryMutAct_9fa48("65028") ? {} : (stryCov_9fa48("65028"), {
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        systemTableCache: this.systemTableCache,
        messageRouter: stryMutAct_9fa48("65031") ? options.messageRouter && null : stryMutAct_9fa48("65030") ? false : stryMutAct_9fa48("65029") ? true : (stryCov_9fa48("65029", "65030", "65031"), options.messageRouter || null),
        now: options.now
      })).controlPlaneSystemTableGateway : null));
      const config = ConfigurationManager.getInstance();
      this.heartbeatIntervalMs = stryMutAct_9fa48("65034") ? config.get(HEARTBEAT_CONFIG_KEY.INTERVAL_MS) && HEARTBEAT_DEFAULT.INTERVAL_MS : stryMutAct_9fa48("65033") ? false : stryMutAct_9fa48("65032") ? true : (stryCov_9fa48("65032", "65033", "65034"), config.get(HEARTBEAT_CONFIG_KEY.INTERVAL_MS) || HEARTBEAT_DEFAULT.INTERVAL_MS);
      this.readyLeaseMs = stryMutAct_9fa48("65037") ? config.get(HEARTBEAT_CONFIG_KEY.READY_LEASE_MS) && HEARTBEAT_DEFAULT.READY_LEASE_MS : stryMutAct_9fa48("65036") ? false : stryMutAct_9fa48("65035") ? true : (stryCov_9fa48("65035", "65036", "65037"), config.get(HEARTBEAT_CONFIG_KEY.READY_LEASE_MS) || HEARTBEAT_DEFAULT.READY_LEASE_MS);
      this.endpointRefreshIntervalMs = (stryMutAct_9fa48("65040") ? Number.isFinite(options.endpointRefreshIntervalMs) || options.endpointRefreshIntervalMs > ZERO : stryMutAct_9fa48("65039") ? false : stryMutAct_9fa48("65038") ? true : (stryCov_9fa48("65038", "65039", "65040"), Number.isFinite(options.endpointRefreshIntervalMs) && (stryMutAct_9fa48("65043") ? options.endpointRefreshIntervalMs <= ZERO : stryMutAct_9fa48("65042") ? options.endpointRefreshIntervalMs >= ZERO : stryMutAct_9fa48("65041") ? true : (stryCov_9fa48("65041", "65042", "65043"), options.endpointRefreshIntervalMs > ZERO)))) ? Math.floor(options.endpointRefreshIntervalMs) : HEARTBEAT_DEFAULT.ENDPOINT_REFRESH_INTERVAL_MS;
      this.nodeMetadataMinUpdateIntervalMs = (stryMutAct_9fa48("65046") ? Number.isFinite(options.nodeMetadataMinUpdateIntervalMs) || options.nodeMetadataMinUpdateIntervalMs >= ZERO : stryMutAct_9fa48("65045") ? false : stryMutAct_9fa48("65044") ? true : (stryCov_9fa48("65044", "65045", "65046"), Number.isFinite(options.nodeMetadataMinUpdateIntervalMs) && (stryMutAct_9fa48("65049") ? options.nodeMetadataMinUpdateIntervalMs < ZERO : stryMutAct_9fa48("65048") ? options.nodeMetadataMinUpdateIntervalMs > ZERO : stryMutAct_9fa48("65047") ? true : (stryCov_9fa48("65047", "65048", "65049"), options.nodeMetadataMinUpdateIntervalMs >= ZERO)))) ? Math.floor(options.nodeMetadataMinUpdateIntervalMs) : HEARTBEAT_DEFAULT.NODE_METADATA_MIN_UPDATE_INTERVAL_MS;
      this.nodeMetadataMaxStalenessMs = (stryMutAct_9fa48("65052") ? Number.isFinite(options.nodeMetadataMaxStalenessMs) || options.nodeMetadataMaxStalenessMs > ZERO : stryMutAct_9fa48("65051") ? false : stryMutAct_9fa48("65050") ? true : (stryCov_9fa48("65050", "65051", "65052"), Number.isFinite(options.nodeMetadataMaxStalenessMs) && (stryMutAct_9fa48("65055") ? options.nodeMetadataMaxStalenessMs <= ZERO : stryMutAct_9fa48("65054") ? options.nodeMetadataMaxStalenessMs >= ZERO : stryMutAct_9fa48("65053") ? true : (stryCov_9fa48("65053", "65054", "65055"), options.nodeMetadataMaxStalenessMs > ZERO)))) ? Math.floor(options.nodeMetadataMaxStalenessMs) : HEARTBEAT_DEFAULT.NODE_METADATA_MAX_STALENESS_MS;
      this.nodeMetadataUsagePercentBucketSize = (stryMutAct_9fa48("65058") ? Number.isFinite(options.nodeMetadataUsagePercentBucketSize) || options.nodeMetadataUsagePercentBucketSize > ZERO : stryMutAct_9fa48("65057") ? false : stryMutAct_9fa48("65056") ? true : (stryCov_9fa48("65056", "65057", "65058"), Number.isFinite(options.nodeMetadataUsagePercentBucketSize) && (stryMutAct_9fa48("65061") ? options.nodeMetadataUsagePercentBucketSize <= ZERO : stryMutAct_9fa48("65060") ? options.nodeMetadataUsagePercentBucketSize >= ZERO : stryMutAct_9fa48("65059") ? true : (stryCov_9fa48("65059", "65060", "65061"), options.nodeMetadataUsagePercentBucketSize > ZERO)))) ? Math.floor(options.nodeMetadataUsagePercentBucketSize) : HEARTBEAT_DEFAULT.NODE_METADATA_USAGE_PERCENT_BUCKET_SIZE;
      this.heartbeatAttemptTimeoutMs = this.resolveHeartbeatAttemptTimeoutMs(options.heartbeatAttemptTimeoutMs);
      this.reporterVisibilityQueryTimeoutMs = (stryMutAct_9fa48("65064") ? Number.isFinite(options.reporterVisibilityQueryTimeoutMs) || options.reporterVisibilityQueryTimeoutMs > ZERO : stryMutAct_9fa48("65063") ? false : stryMutAct_9fa48("65062") ? true : (stryCov_9fa48("65062", "65063", "65064"), Number.isFinite(options.reporterVisibilityQueryTimeoutMs) && (stryMutAct_9fa48("65067") ? options.reporterVisibilityQueryTimeoutMs <= ZERO : stryMutAct_9fa48("65066") ? options.reporterVisibilityQueryTimeoutMs >= ZERO : stryMutAct_9fa48("65065") ? true : (stryCov_9fa48("65065", "65066", "65067"), options.reporterVisibilityQueryTimeoutMs > ZERO)))) ? Math.floor(options.reporterVisibilityQueryTimeoutMs) : REPORTER_VISIBILITY_QUERY_TIMEOUT_MS;
      this.reporterVisibilitySuccessTtlMs = this.resolveReporterVisibilitySuccessTtlMs(options.reporterVisibilitySuccessTtlMs);
      this.reporterVisibilityRetryIntervalMs = this.resolveReporterVisibilityRetryIntervalMs(options.reporterVisibilityRetryIntervalMs);
      this.heartbeatTimer = null;
      this.heartbeatConsecutiveFailures = NUM.ZERO;
      this.heartbeatCount = NUM.ZERO;
      this.state = HEARTBEAT_STATE.CREATED;
      this.heartbeatInFlight = stryMutAct_9fa48("65068") ? true : (stryCov_9fa48("65068"), false);
      this.heartbeatAttemptSequence = ZERO;
      this.activeHeartbeatAttempt = null;
      this.lastNodeHeartbeatWriteAt = null;
      this.lastNodeHeartbeatWriteSignature = null;
      this.lastNodeHeartbeatUtilizationSignature = null;
      this.lastEndpointUpsertAt = null;
      this.lastEndpointUpsertSignature = null;
      this.heartbeatPublicationDiagnostics = stryMutAct_9fa48("65069") ? {} : (stryCov_9fa48("65069"), {
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastFailureStage: null,
        lastFailureReason: null,
        publicationPath: null,
        targetAddress: null,
        targetNodeId: null,
        targetServiceType: null,
        targetServiceId: null,
        consecutiveFailures: NUM.ZERO
      });
      this.lastReporterVisibilityVerifiedAt = null;
      this.lastReporterVisibilityTargetAddress = null;
      this.lastReporterVisibilityAttemptAt = null;
      this.lastReporterVisibilityAttemptTargetAddress = null;
      this.reporterVisibilityVerificationPromise = null;
      this.quietModeSuppressedCounts = stryMutAct_9fa48("65070") ? {} : (stryCov_9fa48("65070"), {
        nodeHeartbeatWrites: NUM.ZERO,
        endpointUpserts: NUM.ZERO
      });
      this.quietModeBypassReasonHistogram = {};
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.forSubsystem(HEARTBEAT_SUBSYSTEM);
      const memoryTrend = stryMutAct_9fa48("65073") ? options.memoryTrend && {} : stryMutAct_9fa48("65072") ? false : stryMutAct_9fa48("65071") ? true : (stryCov_9fa48("65071", "65072", "65073"), options.memoryTrend || {});
      this.memoryTrendWindowMs = (stryMutAct_9fa48("65076") ? Number.isFinite(memoryTrend.windowMs) || memoryTrend.windowMs > ZERO : stryMutAct_9fa48("65075") ? false : stryMutAct_9fa48("65074") ? true : (stryCov_9fa48("65074", "65075", "65076"), Number.isFinite(memoryTrend.windowMs) && (stryMutAct_9fa48("65079") ? memoryTrend.windowMs <= ZERO : stryMutAct_9fa48("65078") ? memoryTrend.windowMs >= ZERO : stryMutAct_9fa48("65077") ? true : (stryCov_9fa48("65077", "65078", "65079"), memoryTrend.windowMs > ZERO)))) ? memoryTrend.windowMs : HEARTBEAT_MEMORY_TREND.WINDOW_MS;
      this.memoryTrendMinSamples = (stryMutAct_9fa48("65082") ? Number.isFinite(memoryTrend.minSamples) || memoryTrend.minSamples >= MIN_REGRESSION_SAMPLE_COUNT : stryMutAct_9fa48("65081") ? false : stryMutAct_9fa48("65080") ? true : (stryCov_9fa48("65080", "65081", "65082"), Number.isFinite(memoryTrend.minSamples) && (stryMutAct_9fa48("65085") ? memoryTrend.minSamples < MIN_REGRESSION_SAMPLE_COUNT : stryMutAct_9fa48("65084") ? memoryTrend.minSamples > MIN_REGRESSION_SAMPLE_COUNT : stryMutAct_9fa48("65083") ? true : (stryCov_9fa48("65083", "65084", "65085"), memoryTrend.minSamples >= MIN_REGRESSION_SAMPLE_COUNT)))) ? Math.floor(memoryTrend.minSamples) : HEARTBEAT_MEMORY_TREND.MIN_SAMPLES;
      this.memoryTrendSlopePercentPerMinThreshold = Number.isFinite(memoryTrend.slopePercentPerMinThreshold) ? memoryTrend.slopePercentPerMinThreshold : HEARTBEAT_MEMORY_TREND.SLOPE_PERCENT_PER_MIN;
      this.memoryTrendWarningPercent = Number.isFinite(memoryTrend.warningPercent) ? memoryTrend.warningPercent : HEARTBEAT_MEMORY_TREND.WARNING_PERCENT;
      this.memoryTrendWarningCooldownMs = (stryMutAct_9fa48("65088") ? Number.isFinite(memoryTrend.warningCooldownMs) || memoryTrend.warningCooldownMs >= ZERO : stryMutAct_9fa48("65087") ? false : stryMutAct_9fa48("65086") ? true : (stryCov_9fa48("65086", "65087", "65088"), Number.isFinite(memoryTrend.warningCooldownMs) && (stryMutAct_9fa48("65091") ? memoryTrend.warningCooldownMs < ZERO : stryMutAct_9fa48("65090") ? memoryTrend.warningCooldownMs > ZERO : stryMutAct_9fa48("65089") ? true : (stryCov_9fa48("65089", "65090", "65091"), memoryTrend.warningCooldownMs >= ZERO)))) ? memoryTrend.warningCooldownMs : HEARTBEAT_MEMORY_TREND.WARNING_COOLDOWN_MS;
      this.memoryTrendSamples = stryMutAct_9fa48("65092") ? ["Stryker was here"] : (stryCov_9fa48("65092"), []);
      this.lastMemoryTrendWarningAt = ZERO;
    }
  } /**
    * Initialize the heartbeat service.
    * Transitions: CREATED → INITIALIZED
    */
  initialize() {
    if (stryMutAct_9fa48("65093")) {
      {}
    } else {
      stryCov_9fa48("65093");
      assertCritical(this.nodeId, HEARTBEAT_ERROR_MSG.MISSING_NODE_ID);
      assertCritical(this.nodeAddress, HEARTBEAT_ERROR_MSG.MISSING_NODE_ADDRESS);
      assertCritical(this.cdcIntegrationService, HEARTBEAT_ERROR_MSG.MISSING_CDC);
      assertCritical(this.systemTableCache, HEARTBEAT_ERROR_MSG.MISSING_CACHE);
      this.state = HEARTBEAT_STATE.INITIALIZED;
      this.logger.info(HEARTBEAT_LOG_MSG.INITIALIZED, stryMutAct_9fa48("65094") ? {} : (stryCov_9fa48("65094"), {
        nodeId: this.nodeId,
        heartbeatIntervalMs: this.heartbeatIntervalMs,
        heartbeatAttemptTimeoutMs: this.heartbeatAttemptTimeoutMs
      }));
    }
  } /**
    * Resolve per-attempt heartbeat timeout.
    * Keeps the timeout inside the ready-lease budget so one stalled
    * write cannot suppress all future lease refreshes.
    * @param {number|undefined} overrideMs
    * @return {number}
    * @private
    */
  resolveHeartbeatAttemptTimeoutMs(overrideMs) {
    if (stryMutAct_9fa48("65095")) {
      {}
    } else {
      stryCov_9fa48("65095");
      if (stryMutAct_9fa48("65098") ? Number.isFinite(overrideMs) || overrideMs > ZERO : stryMutAct_9fa48("65097") ? false : stryMutAct_9fa48("65096") ? true : (stryCov_9fa48("65096", "65097", "65098"), Number.isFinite(overrideMs) && (stryMutAct_9fa48("65101") ? overrideMs <= ZERO : stryMutAct_9fa48("65100") ? overrideMs >= ZERO : stryMutAct_9fa48("65099") ? true : (stryCov_9fa48("65099", "65100", "65101"), overrideMs > ZERO)))) {
        if (stryMutAct_9fa48("65102")) {
          {}
        } else {
          stryCov_9fa48("65102");
          return Math.floor(overrideMs);
        }
      }
      const config = ConfigurationManager.getInstance();
      const configuredTransportTimeoutMs = config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS);
      const transportMessageTimeoutMs = (stryMutAct_9fa48("65105") ? Number.isFinite(configuredTransportTimeoutMs) || configuredTransportTimeoutMs > ZERO : stryMutAct_9fa48("65104") ? false : stryMutAct_9fa48("65103") ? true : (stryCov_9fa48("65103", "65104", "65105"), Number.isFinite(configuredTransportTimeoutMs) && (stryMutAct_9fa48("65108") ? configuredTransportTimeoutMs <= ZERO : stryMutAct_9fa48("65107") ? configuredTransportTimeoutMs >= ZERO : stryMutAct_9fa48("65106") ? true : (stryCov_9fa48("65106", "65107", "65108"), configuredTransportTimeoutMs > ZERO)))) ? Math.floor(configuredTransportTimeoutMs) : TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS;
      const leaseSafetyWindowMs = stryMutAct_9fa48("65109") ? Math.min(ONE, Math.floor(this.readyLeaseMs / 3)) : (stryCov_9fa48("65109"), Math.max(ONE, Math.floor(stryMutAct_9fa48("65110") ? this.readyLeaseMs * 3 : (stryCov_9fa48("65110"), this.readyLeaseMs / 3))));
      const transportSafetyWindowMs = stryMutAct_9fa48("65111") ? transportMessageTimeoutMs - HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS : (stryCov_9fa48("65111"), transportMessageTimeoutMs + HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS);
      const defaultTimeoutMs = stryMutAct_9fa48("65112") ? Math.min(this.heartbeatIntervalMs, leaseSafetyWindowMs, transportSafetyWindowMs) : (stryCov_9fa48("65112"), Math.max(this.heartbeatIntervalMs, leaseSafetyWindowMs, transportSafetyWindowMs));
      const maxSafeTimeoutMs = stryMutAct_9fa48("65113") ? Math.min(ONE, this.readyLeaseMs - this.heartbeatIntervalMs) : (stryCov_9fa48("65113"), Math.max(ONE, stryMutAct_9fa48("65114") ? this.readyLeaseMs + this.heartbeatIntervalMs : (stryCov_9fa48("65114"), this.readyLeaseMs - this.heartbeatIntervalMs)));
      return stryMutAct_9fa48("65115") ? Math.min(ONE, Math.min(defaultTimeoutMs, maxSafeTimeoutMs)) : (stryCov_9fa48("65115"), Math.max(ONE, stryMutAct_9fa48("65116") ? Math.max(defaultTimeoutMs, maxSafeTimeoutMs) : (stryCov_9fa48("65116"), Math.min(defaultTimeoutMs, maxSafeTimeoutMs))));
    }
  } /**
    * Resolve one bounded query timeout for heartbeat write-side SQL.
    * Keeps write routing below the outer heartbeat-attempt watchdog so
    * failed writes do not continue consuming resources after the attempt
    * has already been marked as timed out.
    * @return {number}
    * @private
    */
  resolveHeartbeatWriteQueryTimeoutMs() {
    if (stryMutAct_9fa48("65117")) {
      {}
    } else {
      stryCov_9fa48("65117");
      return stryMutAct_9fa48("65118") ? Math.min(ONE, this.heartbeatAttemptTimeoutMs - HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS) : (stryCov_9fa48("65118"), Math.max(ONE, stryMutAct_9fa48("65119") ? this.heartbeatAttemptTimeoutMs + HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS : (stryCov_9fa48("65119"), this.heartbeatAttemptTimeoutMs - HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS)));
    }
  } /**
    * Bound how long one successful reporter visibility proof can be reused
    * before the next heartbeat forces another authoritative verification read.
    * @param {number|null|undefined} overrideMs
    * @return {number}
    * @private
    */
  resolveReporterVisibilitySuccessTtlMs(overrideMs) {
    if (stryMutAct_9fa48("65120")) {
      {}
    } else {
      stryCov_9fa48("65120");
      if (stryMutAct_9fa48("65123") ? Number.isFinite(overrideMs) || overrideMs > ZERO : stryMutAct_9fa48("65122") ? false : stryMutAct_9fa48("65121") ? true : (stryCov_9fa48("65121", "65122", "65123"), Number.isFinite(overrideMs) && (stryMutAct_9fa48("65126") ? overrideMs <= ZERO : stryMutAct_9fa48("65125") ? overrideMs >= ZERO : stryMutAct_9fa48("65124") ? true : (stryCov_9fa48("65124", "65125", "65126"), overrideMs > ZERO)))) {
        if (stryMutAct_9fa48("65127")) {
          {}
        } else {
          stryCov_9fa48("65127");
          return Math.floor(overrideMs);
        }
      }
      return stryMutAct_9fa48("65128") ? Math.min(this.heartbeatIntervalMs, Math.floor(this.readyLeaseMs / HEARTBEAT_SERVICE_LITERAL.VALUE_2)) : (stryCov_9fa48("65128"), Math.max(this.heartbeatIntervalMs, Math.floor(stryMutAct_9fa48("65129") ? this.readyLeaseMs * HEARTBEAT_SERVICE_LITERAL.VALUE_2 : (stryCov_9fa48("65129"), this.readyLeaseMs / HEARTBEAT_SERVICE_LITERAL.VALUE_2))));
    }
  } /**
    * Bound how often failed or unverified reporter visibility checks can
    * re-trigger authoritative readback while the hot heartbeat path is active.
    * @param {number|null|undefined} overrideMs
    * @return {number}
    * @private
    */
  resolveReporterVisibilityRetryIntervalMs(overrideMs) {
    if (stryMutAct_9fa48("65130")) {
      {}
    } else {
      stryCov_9fa48("65130");
      if (stryMutAct_9fa48("65133") ? Number.isFinite(overrideMs) || overrideMs > ZERO : stryMutAct_9fa48("65132") ? false : stryMutAct_9fa48("65131") ? true : (stryCov_9fa48("65131", "65132", "65133"), Number.isFinite(overrideMs) && (stryMutAct_9fa48("65136") ? overrideMs <= ZERO : stryMutAct_9fa48("65135") ? overrideMs >= ZERO : stryMutAct_9fa48("65134") ? true : (stryCov_9fa48("65134", "65135", "65136"), overrideMs > ZERO)))) {
        if (stryMutAct_9fa48("65137")) {
          {}
        } else {
          stryCov_9fa48("65137");
          return Math.floor(overrideMs);
        }
      }
      return stryMutAct_9fa48("65138") ? Math.min(HEARTBEAT_DEFAULT.REPORTER_VISIBILITY_RETRY_INTERVAL_MS, this.reporterVisibilitySuccessTtlMs) : (stryCov_9fa48("65138"), Math.max(HEARTBEAT_DEFAULT.REPORTER_VISIBILITY_RETRY_INTERVAL_MS, this.reporterVisibilitySuccessTtlMs));
    }
  } /**
    * Bound the reporter call inside the overall heartbeat write budget.
    * @param {number|null|undefined} heartbeatWriteQueryTimeoutMs
    * @return {number}
    * @private
    */
  resolveNodeStateReporterTimeoutMs(heartbeatWriteQueryTimeoutMs) {
    if (stryMutAct_9fa48("65139")) {
      {}
    } else {
      stryCov_9fa48("65139");
      const writeTimeoutMs = Number(heartbeatWriteQueryTimeoutMs);
      if (stryMutAct_9fa48("65142") ? !Number.isFinite(writeTimeoutMs) && writeTimeoutMs <= ZERO : stryMutAct_9fa48("65141") ? false : stryMutAct_9fa48("65140") ? true : (stryCov_9fa48("65140", "65141", "65142"), (stryMutAct_9fa48("65143") ? Number.isFinite(writeTimeoutMs) : (stryCov_9fa48("65143"), !Number.isFinite(writeTimeoutMs))) || (stryMutAct_9fa48("65146") ? writeTimeoutMs > ZERO : stryMutAct_9fa48("65145") ? writeTimeoutMs < ZERO : stryMutAct_9fa48("65144") ? false : (stryCov_9fa48("65144", "65145", "65146"), writeTimeoutMs <= ZERO)))) {
        if (stryMutAct_9fa48("65147")) {
          {}
        } else {
          stryCov_9fa48("65147");
          return ONE;
        }
      }
      const reporterSlackMs = stryMutAct_9fa48("65148") ? Math.max(HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS, Math.max(ONE, Math.floor(writeTimeoutMs / 5))) : (stryCov_9fa48("65148"), Math.min(HEARTBEAT_DEFAULT.ATTEMPT_TIMEOUT_SAFETY_MARGIN_MS, stryMutAct_9fa48("65149") ? Math.min(ONE, Math.floor(writeTimeoutMs / 5)) : (stryCov_9fa48("65149"), Math.max(ONE, Math.floor(stryMutAct_9fa48("65150") ? writeTimeoutMs * 5 : (stryCov_9fa48("65150"), writeTimeoutMs / 5))))));
      return stryMutAct_9fa48("65151") ? Math.min(ONE, writeTimeoutMs - reporterSlackMs) : (stryCov_9fa48("65151"), Math.max(ONE, stryMutAct_9fa48("65152") ? writeTimeoutMs + reporterSlackMs : (stryCov_9fa48("65152"), writeTimeoutMs - reporterSlackMs)));
    }
  } /**
    * Return true when one node-state reporter error was raised by the local
    * reporter timeout watchdog.
    * @param {Error|Object|null} error
    * @return {boolean}
    * @private
    */
  isNodeStateReporterTimeoutError(error) {
    if (stryMutAct_9fa48("65153")) {
      {}
    } else {
      stryCov_9fa48("65153");
      return stryMutAct_9fa48("65156") ? error?.code !== HEARTBEAT_SERVICE_LITERAL.NODE_STATE_REPORTER_TIMEOUT : stryMutAct_9fa48("65155") ? false : stryMutAct_9fa48("65154") ? true : (stryCov_9fa48("65154", "65155", "65156"), (stryMutAct_9fa48("65157") ? error.code : (stryCov_9fa48("65157"), error?.code)) === HEARTBEAT_SERVICE_LITERAL.NODE_STATE_REPORTER_TIMEOUT);
    }
  } /**
    * Build one typed missing-node-row error for steady-state heartbeats.
    * @param {string} operation
    * @return {Error}
    * @private
    */
  buildMissingNodeRowError(operation = HEARTBEAT_SERVICE_LITERAL.HEARTBEAT) {
    if (stryMutAct_9fa48("65158")) {
      {}
    } else {
      stryCov_9fa48("65158");
      const error = new Error(stryMutAct_9fa48("65159") ? `` : (stryCov_9fa48("65159"), `${HEARTBEAT_ERROR_MSG.NODE_ROW_MISSING}: ${this.nodeId}`));
      error.code = HEARTBEAT_SERVICE_LITERAL.NODE_ROW_MISSING;
      error.nodeId = this.nodeId;
      error.operation = operation;
      return error;
    }
  } /**
    * Execute node-state reporter with an explicit timeout budget.
    * @param {Object} payload
    * @param {number} timeoutMs
    * @return {Promise<Object>}
    * @private
    */
  async callNodeStateReporterWithTimeout(payload, timeoutMs) {
    if (stryMutAct_9fa48("65160")) {
      {}
    } else {
      stryCov_9fa48("65160");
      const boundedTimeoutMs = Number(timeoutMs);
      if (stryMutAct_9fa48("65163") ? !Number.isFinite(boundedTimeoutMs) && boundedTimeoutMs <= ZERO : stryMutAct_9fa48("65162") ? false : stryMutAct_9fa48("65161") ? true : (stryCov_9fa48("65161", "65162", "65163"), (stryMutAct_9fa48("65164") ? Number.isFinite(boundedTimeoutMs) : (stryCov_9fa48("65164"), !Number.isFinite(boundedTimeoutMs))) || (stryMutAct_9fa48("65167") ? boundedTimeoutMs > ZERO : stryMutAct_9fa48("65166") ? boundedTimeoutMs < ZERO : stryMutAct_9fa48("65165") ? false : (stryCov_9fa48("65165", "65166", "65167"), boundedTimeoutMs <= ZERO)))) {
        if (stryMutAct_9fa48("65168")) {
          {}
        } else {
          stryCov_9fa48("65168");
          return this.nodeStateReporter(payload);
        }
      }
      let timeoutHandle = null;
      let settled = stryMutAct_9fa48("65169") ? true : (stryCov_9fa48("65169"), false);
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("65170")) {
          {}
        } else {
          stryCov_9fa48("65170");
          const finalize = (callback, value) => {
            if (stryMutAct_9fa48("65171")) {
              {}
            } else {
              stryCov_9fa48("65171");
              if (stryMutAct_9fa48("65173") ? false : stryMutAct_9fa48("65172") ? true : (stryCov_9fa48("65172", "65173"), settled)) {
                if (stryMutAct_9fa48("65174")) {
                  {}
                } else {
                  stryCov_9fa48("65174");
                  return;
                }
              }
              settled = stryMutAct_9fa48("65175") ? false : (stryCov_9fa48("65175"), true);
              if (stryMutAct_9fa48("65177") ? false : stryMutAct_9fa48("65176") ? true : (stryCov_9fa48("65176", "65177"), timeoutHandle)) {
                if (stryMutAct_9fa48("65178")) {
                  {}
                } else {
                  stryCov_9fa48("65178");
                  this.clearTimeoutFn(timeoutHandle);
                  timeoutHandle = null;
                }
              }
              callback(value);
            }
          };
          timeoutHandle = this.setTimeoutFn(() => {
            if (stryMutAct_9fa48("65179")) {
              {}
            } else {
              stryCov_9fa48("65179");
              const timeoutError = new Error(stryMutAct_9fa48("65180") ? `` : (stryCov_9fa48("65180"), `Node-state reporter timed out after ${boundedTimeoutMs}ms`));
              timeoutError.code = HEARTBEAT_SERVICE_LITERAL.NODE_STATE_REPORTER_TIMEOUT;
              timeoutError.publicationDiagnostics = stryMutAct_9fa48("65181") ? {} : (stryCov_9fa48("65181"), {
                publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_STATE_REPORTER
              });
              finalize(reject, timeoutError);
            }
          }, boundedTimeoutMs);
          if (stryMutAct_9fa48("65184") ? typeof timeoutHandle?.unref !== TYPEOF.FUNCTION : stryMutAct_9fa48("65183") ? false : stryMutAct_9fa48("65182") ? true : (stryCov_9fa48("65182", "65183", "65184"), typeof (stryMutAct_9fa48("65185") ? timeoutHandle.unref : (stryCov_9fa48("65185"), timeoutHandle?.unref)) === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("65186")) {
              {}
            } else {
              stryCov_9fa48("65186");
              timeoutHandle.unref();
            }
          }
          Promise.resolve().then(stryMutAct_9fa48("65187") ? () => undefined : (stryCov_9fa48("65187"), () => this.nodeStateReporter(payload))).then(result => {
            if (stryMutAct_9fa48("65188")) {
              {}
            } else {
              stryCov_9fa48("65188");
              finalize(resolve, result);
            }
          }).catch(error => {
            if (stryMutAct_9fa48("65189")) {
              {}
            } else {
              stryCov_9fa48("65189");
              finalize(reject, error);
            }
          });
        }
      });
    }
  } /**
    * Set the node-state reporter used for control-plane mediated heartbeats.
    * @param {Function|null} reporter - Async reporter callback.
    */
  setNodeStateReporter(reporter) {
    if (stryMutAct_9fa48("65190")) {
      {}
    } else {
      stryCov_9fa48("65190");
      this.nodeStateReporter = (stryMutAct_9fa48("65193") ? typeof reporter !== TYPEOF.FUNCTION : stryMutAct_9fa48("65192") ? false : stryMutAct_9fa48("65191") ? true : (stryCov_9fa48("65191", "65192", "65193"), typeof reporter === TYPEOF.FUNCTION)) ? reporter : null;
    }
  } /**
    * Enable or disable reporter success visibility verification.
    * Join-time READY publication may opt into one proof, while steady-state
    * heartbeats should not keep re-querying the canonical nodes row.
    * @param {boolean} enabled
    */
  setVerifyReporterVisibilityOnSuccess(enabled) {
    if (stryMutAct_9fa48("65194")) {
      {}
    } else {
      stryCov_9fa48("65194");
      this.verifyReporterVisibilityOnSuccess = stryMutAct_9fa48("65197") ? enabled !== true : stryMutAct_9fa48("65196") ? false : stryMutAct_9fa48("65195") ? true : (stryCov_9fa48("65195", "65196", "65197"), enabled === (stryMutAct_9fa48("65198") ? false : (stryCov_9fa48("65198"), true)));
    }
  } /**
    * Start periodic heartbeats.
    * Transitions: INITIALIZED → RUNNING
    * @param {Object} [options] - Heartbeat options.
    * @param {Function} [options.getStats] - Async fn returning node stats.
    * @param {Object} [options.stats] - Static node stats snapshot.
    * @param {Array<string>} [options.capabilities] - Node capabilities.
    */
  start(options = {}) {
    if (stryMutAct_9fa48("65199")) {
      {}
    } else {
      stryCov_9fa48("65199");
      if (stryMutAct_9fa48("65202") ? this.state === HEARTBEAT_STATE.INITIALIZED : stryMutAct_9fa48("65201") ? false : stryMutAct_9fa48("65200") ? true : (stryCov_9fa48("65200", "65201", "65202"), this.state !== HEARTBEAT_STATE.INITIALIZED)) {
        if (stryMutAct_9fa48("65203")) {
          {}
        } else {
          stryCov_9fa48("65203");
          throw new Error(HEARTBEAT_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("65205") ? false : stryMutAct_9fa48("65204") ? true : (stryCov_9fa48("65204", "65205"), this.heartbeatTimer)) {
        if (stryMutAct_9fa48("65206")) {
          {}
        } else {
          stryCov_9fa48("65206");
          return;
        }
      }
      this.state = HEARTBEAT_STATE.RUNNING;
      const sendHeartbeat = async () => {
        if (stryMutAct_9fa48("65207")) {
          {}
        } else {
          stryCov_9fa48("65207");
          if (stryMutAct_9fa48("65210") ? this.state !== HEARTBEAT_STATE.RUNNING && this.heartbeatInFlight === true : stryMutAct_9fa48("65209") ? false : stryMutAct_9fa48("65208") ? true : (stryCov_9fa48("65208", "65209", "65210"), (stryMutAct_9fa48("65212") ? this.state === HEARTBEAT_STATE.RUNNING : stryMutAct_9fa48("65211") ? false : (stryCov_9fa48("65211", "65212"), this.state !== HEARTBEAT_STATE.RUNNING)) || (stryMutAct_9fa48("65214") ? this.heartbeatInFlight !== true : stryMutAct_9fa48("65213") ? false : (stryCov_9fa48("65213", "65214"), this.heartbeatInFlight === (stryMutAct_9fa48("65215") ? false : (stryCov_9fa48("65215"), true)))))) {
            if (stryMutAct_9fa48("65216")) {
              {}
            } else {
              stryCov_9fa48("65216");
              return;
            }
          }
          const attempt = this.beginHeartbeatAttempt();
          try {
            if (stryMutAct_9fa48("65217")) {
              {}
            } else {
              stryCov_9fa48("65217");
              let stats = options.stats;
              if (stryMutAct_9fa48("65219") ? false : stryMutAct_9fa48("65218") ? true : (stryCov_9fa48("65218", "65219"), options.getStats)) {
                if (stryMutAct_9fa48("65220")) {
                  {}
                } else {
                  stryCov_9fa48("65220");
                  try {
                    if (stryMutAct_9fa48("65221")) {
                      {}
                    } else {
                      stryCov_9fa48("65221");
                      stats = await options.getStats();
                    }
                  } catch (error) {
                    if (stryMutAct_9fa48("65222")) {
                      {}
                    } else {
                      stryCov_9fa48("65222");
                      if (stryMutAct_9fa48("65225") ? false : stryMutAct_9fa48("65224") ? true : stryMutAct_9fa48("65223") ? attempt.timedOut : (stryCov_9fa48("65223", "65224", "65225"), !attempt.timedOut)) {
                        if (stryMutAct_9fa48("65226")) {
                          {}
                        } else {
                          stryCov_9fa48("65226");
                          this.recordFailure(stryMutAct_9fa48("65227") ? "" : (stryCov_9fa48("65227"), 'stats'), error.message);
                        }
                      }
                      return;
                    }
                  }
                }
              }
              if (stryMutAct_9fa48("65229") ? false : stryMutAct_9fa48("65228") ? true : (stryCov_9fa48("65228", "65229"), attempt.timedOut)) {
                if (stryMutAct_9fa48("65230")) {
                  {}
                } else {
                  stryCov_9fa48("65230");
                  return;
                }
              }
              try {
                if (stryMutAct_9fa48("65231")) {
                  {}
                } else {
                  stryCov_9fa48("65231");
                  await this.sendHeartbeat(stats, options.capabilities);
                }
              } catch (error) {
                if (stryMutAct_9fa48("65232")) {
                  {}
                } else {
                  stryCov_9fa48("65232");
                  if (stryMutAct_9fa48("65235") ? false : stryMutAct_9fa48("65234") ? true : stryMutAct_9fa48("65233") ? attempt.timedOut : (stryCov_9fa48("65233", "65234", "65235"), !attempt.timedOut)) {
                    if (stryMutAct_9fa48("65236")) {
                      {}
                    } else {
                      stryCov_9fa48("65236");
                      this.recordFailure(stryMutAct_9fa48("65237") ? "" : (stryCov_9fa48("65237"), 'register'), error.message);
                    }
                  }
                  return;
                }
              }
              if (stryMutAct_9fa48("65239") ? false : stryMutAct_9fa48("65238") ? true : (stryCov_9fa48("65238", "65239"), attempt.timedOut)) {
                if (stryMutAct_9fa48("65240")) {
                  {}
                } else {
                  stryCov_9fa48("65240");
                  return;
                }
              }
              stryMutAct_9fa48("65241") ? this.heartbeatCount-- : (stryCov_9fa48("65241"), this.heartbeatCount++);
              if (stryMutAct_9fa48("65245") ? this.heartbeatConsecutiveFailures <= NUM.ZERO : stryMutAct_9fa48("65244") ? this.heartbeatConsecutiveFailures >= NUM.ZERO : stryMutAct_9fa48("65243") ? false : stryMutAct_9fa48("65242") ? true : (stryCov_9fa48("65242", "65243", "65244", "65245"), this.heartbeatConsecutiveFailures > NUM.ZERO)) {
                if (stryMutAct_9fa48("65246")) {
                  {}
                } else {
                  stryCov_9fa48("65246");
                  this.logger.info(HEARTBEAT_LOG_MSG.HEARTBEAT_RECOVERED, stryMutAct_9fa48("65247") ? {} : (stryCov_9fa48("65247"), {
                    nodeId: this.nodeId,
                    previousFailures: this.heartbeatConsecutiveFailures
                  }));
                  this.heartbeatConsecutiveFailures = NUM.ZERO;
                  this.heartbeatPublicationDiagnostics.consecutiveFailures = NUM.ZERO;
                }
              }
              this.emit(HEARTBEAT_EVENT.HEARTBEAT_SENT, stryMutAct_9fa48("65248") ? {} : (stryCov_9fa48("65248"), {
                nodeId: this.nodeId,
                count: this.heartbeatCount
              }));
            }
          } finally {
            if (stryMutAct_9fa48("65249")) {
              {}
            } else {
              stryCov_9fa48("65249");
              this.completeHeartbeatAttempt(attempt);
            }
          }
        }
      };
      this.heartbeatTimer = this.setIntervalFn(sendHeartbeat, this.heartbeatIntervalMs);
      if (stryMutAct_9fa48("65252") ? typeof this.heartbeatTimer?.unref !== TYPEOF.FUNCTION : stryMutAct_9fa48("65251") ? false : stryMutAct_9fa48("65250") ? true : (stryCov_9fa48("65250", "65251", "65252"), typeof (stryMutAct_9fa48("65253") ? this.heartbeatTimer.unref : (stryCov_9fa48("65253"), this.heartbeatTimer?.unref)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("65254")) {
          {}
        } else {
          stryCov_9fa48("65254");
          this.heartbeatTimer.unref();
        }
      }
      sendHeartbeat();
      this.logger.info(HEARTBEAT_LOG_MSG.STARTED, stryMutAct_9fa48("65255") ? {} : (stryCov_9fa48("65255"), {
        nodeId: this.nodeId
      }));
    }
  } /**
    * Stop periodic heartbeats.
    * Transitions: RUNNING → STOPPED
    */
  stop() {
    if (stryMutAct_9fa48("65256")) {
      {}
    } else {
      stryCov_9fa48("65256");
      if (stryMutAct_9fa48("65258") ? false : stryMutAct_9fa48("65257") ? true : (stryCov_9fa48("65257", "65258"), this.heartbeatTimer)) {
        if (stryMutAct_9fa48("65259")) {
          {}
        } else {
          stryCov_9fa48("65259");
          this.clearIntervalFn(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
      }
      if (stryMutAct_9fa48("65262") ? this.activeHeartbeatAttempt.timeoutHandle : stryMutAct_9fa48("65261") ? false : stryMutAct_9fa48("65260") ? true : (stryCov_9fa48("65260", "65261", "65262"), this.activeHeartbeatAttempt?.timeoutHandle)) {
        if (stryMutAct_9fa48("65263")) {
          {}
        } else {
          stryCov_9fa48("65263");
          this.clearTimeoutFn(this.activeHeartbeatAttempt.timeoutHandle);
          this.activeHeartbeatAttempt.timeoutHandle = null;
        }
      }
      this.activeHeartbeatAttempt = null;
      this.heartbeatInFlight = stryMutAct_9fa48("65264") ? true : (stryCov_9fa48("65264"), false);
      this.state = HEARTBEAT_STATE.STOPPED;
      this.logger.info(HEARTBEAT_LOG_MSG.STOPPED, stryMutAct_9fa48("65265") ? {} : (stryCov_9fa48("65265"), {
        nodeId: this.nodeId
      }));
    }
  } /**
    * Publish one terminal node row before graceful shutdown tears down the
    * control-plane path. This lets immediate rejoin reuse the same node ID
    * without waiting for ready-lease expiry.
    * @return {Promise<boolean>} True when a shutdown row was published.
    */
  async reportNodeShutdown() {
    if (stryMutAct_9fa48("65266")) {
      {}
    } else {
      stryCov_9fa48("65266");
      const now = this.now();
      const existing = stryMutAct_9fa48("65269") ? this.systemTableCache?.get(SYSTEM_TABLE_NAME.NODES, this.nodeId) && null : stryMutAct_9fa48("65268") ? false : stryMutAct_9fa48("65267") ? true : (stryCov_9fa48("65267", "65268", "65269"), (stryMutAct_9fa48("65270") ? this.systemTableCache.get(SYSTEM_TABLE_NAME.NODES, this.nodeId) : (stryCov_9fa48("65270"), this.systemTableCache?.get(SYSTEM_TABLE_NAME.NODES, this.nodeId))) || null);
      if (stryMutAct_9fa48("65273") ? false : stryMutAct_9fa48("65272") ? true : stryMutAct_9fa48("65271") ? existing : (stryCov_9fa48("65271", "65272", "65273"), !existing)) {
        if (stryMutAct_9fa48("65274")) {
          {}
        } else {
          stryCov_9fa48("65274");
          this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_SKIPPED, stryMutAct_9fa48("65275") ? {} : (stryCov_9fa48("65275"), {
            nodeId: this.nodeId,
            reason: HEARTBEAT_SERVICE_LITERAL.NODE_ROW_MISSING_FROM_CACHE
          }));
          return stryMutAct_9fa48("65276") ? true : (stryCov_9fa48("65276"), false);
        }
      }
      const shutdownRow = stryMutAct_9fa48("65277") ? {} : (stryCov_9fa48("65277"), {
        node_address: stryMutAct_9fa48("65280") ? (this.nodeAddress || existing?.node_address) && STRING.UNKNOWN : stryMutAct_9fa48("65279") ? false : stryMutAct_9fa48("65278") ? true : (stryCov_9fa48("65278", "65279", "65280"), (stryMutAct_9fa48("65282") ? this.nodeAddress && existing?.node_address : stryMutAct_9fa48("65281") ? false : (stryCov_9fa48("65281", "65282"), this.nodeAddress || (stryMutAct_9fa48("65283") ? existing.node_address : (stryCov_9fa48("65283"), existing?.node_address)))) || STRING.UNKNOWN),
        cpu_cores: Number.isFinite(stryMutAct_9fa48("65284") ? existing.cpu_cores : (stryCov_9fa48("65284"), existing?.cpu_cores)) ? existing.cpu_cores : NUM.ZERO,
        memory_mb: Number.isFinite(stryMutAct_9fa48("65285") ? existing.memory_mb : (stryCov_9fa48("65285"), existing?.memory_mb)) ? existing.memory_mb : NUM.ZERO,
        disk_gb: Number.isFinite(stryMutAct_9fa48("65286") ? existing.disk_gb : (stryCov_9fa48("65286"), existing?.disk_gb)) ? existing.disk_gb : NUM.ZERO,
        cpu_usage_percent: Number.isFinite(stryMutAct_9fa48("65287") ? existing.cpu_usage_percent : (stryCov_9fa48("65287"), existing?.cpu_usage_percent)) ? existing.cpu_usage_percent : NUM.ZERO,
        memory_usage_percent: Number.isFinite(stryMutAct_9fa48("65288") ? existing.memory_usage_percent : (stryCov_9fa48("65288"), existing?.memory_usage_percent)) ? existing.memory_usage_percent : NUM.ZERO,
        disk_usage_percent: Number.isFinite(stryMutAct_9fa48("65289") ? existing.disk_usage_percent : (stryCov_9fa48("65289"), existing?.disk_usage_percent)) ? existing.disk_usage_percent : NUM.ZERO,
        status: SERVICE_STATUS.STOPPED,
        connection_state: STATE.DISCONNECTED,
        capabilities: stryMutAct_9fa48("65292") ? existing?.capabilities && STRING.EMPTY_JSON_ARRAY : stryMutAct_9fa48("65291") ? false : stryMutAct_9fa48("65290") ? true : (stryCov_9fa48("65290", "65291", "65292"), (stryMutAct_9fa48("65293") ? existing.capabilities : (stryCov_9fa48("65293"), existing?.capabilities)) || STRING.EMPTY_JSON_ARRAY),
        last_heartbeat: now,
        ready_lease_expires_at: null
      });
      const shutdownNodeRow = stryMutAct_9fa48("65294") ? {} : (stryCov_9fa48("65294"), {
        ...existing,
        node_id: this.nodeId,
        ...shutdownRow
      });
      const queryTimeoutMs = this.resolveHeartbeatWriteQueryTimeoutMs();
      const reporterTimeoutMs = this.resolveNodeStateReporterTimeoutMs(queryTimeoutMs);
      this.recordHeartbeatPublicationAttempt(now);
      if (stryMutAct_9fa48("65297") ? typeof this.nodeStateReporter !== TYPEOF.FUNCTION : stryMutAct_9fa48("65296") ? false : stryMutAct_9fa48("65295") ? true : (stryCov_9fa48("65295", "65296", "65297"), typeof this.nodeStateReporter === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("65298")) {
          {}
        } else {
          stryCov_9fa48("65298");
          try {
            if (stryMutAct_9fa48("65299")) {
              {}
            } else {
              stryCov_9fa48("65299");
              const reporterResult = await this.callNodeStateReporterWithTimeout(stryMutAct_9fa48("65300") ? {} : (stryCov_9fa48("65300"), {
                nodeId: this.nodeId,
                nodeAddress: shutdownRow.node_address,
                state: shutdownRow.connection_state,
                capabilities: shutdownRow.capabilities,
                heartbeatAt: now,
                readyLeaseExpiresAt: null,
                nodeRow: shutdownNodeRow
              }), reporterTimeoutMs);
              const reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(reporterResult, stryMutAct_9fa48("65301") ? "" : (stryCov_9fa48("65301"), 'node_shutdown_reporter'));
              const reporterVisible = await this.verifyReporterHeartbeatVisibility(now, stryMutAct_9fa48("65302") ? {} : (stryCov_9fa48("65302"), {
                expectedStatus: SERVICE_STATUS.STOPPED,
                expectedConnectionState: STATE.DISCONNECTED,
                expectedReadyLeaseCleared: stryMutAct_9fa48("65303") ? false : (stryCov_9fa48("65303"), true)
              }));
              if (stryMutAct_9fa48("65306") ? false : stryMutAct_9fa48("65305") ? true : stryMutAct_9fa48("65304") ? reporterVisible : (stryCov_9fa48("65304", "65305", "65306"), !reporterVisible)) {
                if (stryMutAct_9fa48("65307")) {
                  {}
                } else {
                  stryCov_9fa48("65307");
                  this.recordHeartbeatPublicationSuccess(stryMutAct_9fa48("65308") ? {} : (stryCov_9fa48("65308"), {
                    ...reporterDiagnostics,
                    publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_SHUTDOWN_REPORTER_UNVERIFIED
                  }), now);
                  this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_PUBLISHED, stryMutAct_9fa48("65309") ? {} : (stryCov_9fa48("65309"), {
                    nodeId: this.nodeId,
                    publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_SHUTDOWN_REPORTER_UNVERIFIED
                  }));
                  return stryMutAct_9fa48("65310") ? false : (stryCov_9fa48("65310"), true);
                }
              }
              this.recordHeartbeatPublicationSuccess(reporterDiagnostics, now);
              this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_PUBLISHED, stryMutAct_9fa48("65311") ? {} : (stryCov_9fa48("65311"), {
                nodeId: this.nodeId,
                publicationPath: reporterDiagnostics.publicationPath
              }));
              return stryMutAct_9fa48("65312") ? false : (stryCov_9fa48("65312"), true);
            }
          } catch (error) {
            if (stryMutAct_9fa48("65313")) {
              {}
            } else {
              stryCov_9fa48("65313");
              const reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(stryMutAct_9fa48("65316") ? error?.publicationDiagnostics && error : stryMutAct_9fa48("65315") ? false : stryMutAct_9fa48("65314") ? true : (stryCov_9fa48("65314", "65315", "65316"), (stryMutAct_9fa48("65317") ? error.publicationDiagnostics : (stryCov_9fa48("65317"), error?.publicationDiagnostics)) || error), stryMutAct_9fa48("65318") ? "" : (stryCov_9fa48("65318"), 'node_shutdown_reporter'));
              this.recordHeartbeatPublicationTarget(reporterDiagnostics);
              error.publicationDiagnostics = reporterDiagnostics;
              throw error;
            }
          }
        }
      }
      const updateResult = await this.getControlPlaneSystemTableGateway().updateSystemTableRow(SYSTEM_TABLE_NAME.NODES, stryMutAct_9fa48("65319") ? {} : (stryCov_9fa48("65319"), {
        node_id: this.nodeId
      }), shutdownRow, stryMutAct_9fa48("65320") ? {} : (stryCov_9fa48("65320"), {
        skipCacheWait: stryMutAct_9fa48("65321") ? false : (stryCov_9fa48("65321"), true),
        queryTimeoutMs
      }));
      const affectedRows = Number(stryMutAct_9fa48("65323") ? updateResult.partitionResult?.affectedRows : stryMutAct_9fa48("65322") ? updateResult?.partitionResult.affectedRows : (stryCov_9fa48("65322", "65323"), updateResult?.partitionResult?.affectedRows));
      if (stryMutAct_9fa48("65326") ? affectedRows !== NUM.ZERO : stryMutAct_9fa48("65325") ? false : stryMutAct_9fa48("65324") ? true : (stryCov_9fa48("65324", "65325", "65326"), affectedRows === NUM.ZERO)) {
        if (stryMutAct_9fa48("65327")) {
          {}
        } else {
          stryCov_9fa48("65327");
          this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_SKIPPED, stryMutAct_9fa48("65328") ? {} : (stryCov_9fa48("65328"), {
            nodeId: this.nodeId,
            reason: HEARTBEAT_SERVICE_LITERAL.NODE_ROW_MISSING_FROM_STORAGE
          }));
          return stryMutAct_9fa48("65329") ? true : (stryCov_9fa48("65329"), false);
        }
      }
      this.recordHeartbeatPublicationSuccess(stryMutAct_9fa48("65330") ? {} : (stryCov_9fa48("65330"), {
        publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_SHUTDOWN_CDC_UPDATE
      }), now);
      this.logger.info(HEARTBEAT_LOG_MSG.SHUTDOWN_STATUS_PUBLISHED, stryMutAct_9fa48("65331") ? {} : (stryCov_9fa48("65331"), {
        nodeId: this.nodeId,
        publicationPath: HEARTBEAT_SERVICE_LITERAL.NODE_SHUTDOWN_CDC_UPDATE
      }));
      return stryMutAct_9fa48("65332") ? false : (stryCov_9fa48("65332"), true);
    }
  } /**
    * Begin one guarded heartbeat attempt with a timeout watchdog.
    * @return {{id: number, timedOut: boolean, timeoutHandle: Object|null}}
    * @private
    */
  beginHeartbeatAttempt() {
    if (stryMutAct_9fa48("65333")) {
      {}
    } else {
      stryCov_9fa48("65333");
      const attempt = stryMutAct_9fa48("65334") ? {} : (stryCov_9fa48("65334"), {
        id: stryMutAct_9fa48("65335") ? this.heartbeatAttemptSequence - ONE : (stryCov_9fa48("65335"), this.heartbeatAttemptSequence + ONE),
        timedOut: stryMutAct_9fa48("65336") ? true : (stryCov_9fa48("65336"), false),
        timeoutHandle: null,
        startedAtMs: this.now()
      });
      this.heartbeatAttemptSequence = attempt.id;
      this.activeHeartbeatAttempt = attempt;
      this.heartbeatInFlight = stryMutAct_9fa48("65337") ? false : (stryCov_9fa48("65337"), true);
      this.recordHeartbeatPublicationAttempt(attempt.startedAtMs);
      attempt.timeoutHandle = this.setTimeoutFn(() => {
        if (stryMutAct_9fa48("65338")) {
          {}
        } else {
          stryCov_9fa48("65338");
          if (stryMutAct_9fa48("65340") ? false : stryMutAct_9fa48("65339") ? true : (stryCov_9fa48("65339", "65340"), attempt.timedOut)) {
            if (stryMutAct_9fa48("65341")) {
              {}
            } else {
              stryCov_9fa48("65341");
              return;
            }
          }
          attempt.timedOut = stryMutAct_9fa48("65342") ? false : (stryCov_9fa48("65342"), true);
          this.recordFailure(HEARTBEAT_SERVICE_LITERAL.ATTEMPT_TIMEOUT, stryMutAct_9fa48("65343") ? `` : (stryCov_9fa48("65343"), `Heartbeat attempt timed out after ${this.heartbeatAttemptTimeoutMs}ms`));
          if (stryMutAct_9fa48("65346") ? this.activeHeartbeatAttempt?.id !== attempt.id : stryMutAct_9fa48("65345") ? false : stryMutAct_9fa48("65344") ? true : (stryCov_9fa48("65344", "65345", "65346"), (stryMutAct_9fa48("65347") ? this.activeHeartbeatAttempt.id : (stryCov_9fa48("65347"), this.activeHeartbeatAttempt?.id)) === attempt.id)) {
            if (stryMutAct_9fa48("65348")) {
              {}
            } else {
              stryCov_9fa48("65348");
              this.activeHeartbeatAttempt = null;
              this.heartbeatInFlight = stryMutAct_9fa48("65349") ? true : (stryCov_9fa48("65349"), false);
            }
          }
        }
      }, this.heartbeatAttemptTimeoutMs);
      if (stryMutAct_9fa48("65352") ? typeof attempt.timeoutHandle?.unref !== TYPEOF.FUNCTION : stryMutAct_9fa48("65351") ? false : stryMutAct_9fa48("65350") ? true : (stryCov_9fa48("65350", "65351", "65352"), typeof (stryMutAct_9fa48("65353") ? attempt.timeoutHandle.unref : (stryCov_9fa48("65353"), attempt.timeoutHandle?.unref)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("65354")) {
          {}
        } else {
          stryCov_9fa48("65354");
          attempt.timeoutHandle.unref();
        }
      }
      return attempt;
    }
  } /**
    * Complete one heartbeat attempt and release ownership if still current.
    * @param {{id: number, timeoutHandle: Object|null}|null} attempt
    * @private
    */
  completeHeartbeatAttempt(attempt) {
    if (stryMutAct_9fa48("65355")) {
      {}
    } else {
      stryCov_9fa48("65355");
      if (stryMutAct_9fa48("65358") ? false : stryMutAct_9fa48("65357") ? true : stryMutAct_9fa48("65356") ? attempt : (stryCov_9fa48("65356", "65357", "65358"), !attempt)) {
        if (stryMutAct_9fa48("65359")) {
          {}
        } else {
          stryCov_9fa48("65359");
          return;
        }
      }
      if (stryMutAct_9fa48("65361") ? false : stryMutAct_9fa48("65360") ? true : (stryCov_9fa48("65360", "65361"), attempt.timeoutHandle)) {
        if (stryMutAct_9fa48("65362")) {
          {}
        } else {
          stryCov_9fa48("65362");
          this.clearTimeoutFn(attempt.timeoutHandle);
          attempt.timeoutHandle = null;
        }
      }
      if (stryMutAct_9fa48("65365") ? this.activeHeartbeatAttempt?.id !== attempt.id : stryMutAct_9fa48("65364") ? false : stryMutAct_9fa48("65363") ? true : (stryCov_9fa48("65363", "65364", "65365"), (stryMutAct_9fa48("65366") ? this.activeHeartbeatAttempt.id : (stryCov_9fa48("65366"), this.activeHeartbeatAttempt?.id)) === attempt.id)) {
        if (stryMutAct_9fa48("65367")) {
          {}
        } else {
          stryCov_9fa48("65367");
          this.activeHeartbeatAttempt = null;
          this.heartbeatInFlight = stryMutAct_9fa48("65368") ? true : (stryCov_9fa48("65368"), false);
        }
      }
    }
  } /**
    * Send a single heartbeat update.
    * @param {Object} [stats] - Node stats.
    * @param {Array<string>} [capabilities] - Node capabilities.
    * @return {Promise<void>}
    * @private
    */
  async sendHeartbeat(stats, capabilities) {
    if (stryMutAct_9fa48("65369")) {
      {}
    } else {
      stryCov_9fa48("65369");
      const now = this.now();
      const memoryMb = Number.isFinite(stryMutAct_9fa48("65371") ? stats.memory?.totalBytes : stryMutAct_9fa48("65370") ? stats?.memory.totalBytes : (stryCov_9fa48("65370", "65371"), stats?.memory?.totalBytes)) ? Math.round(stryMutAct_9fa48("65372") ? stats.memory.totalBytes * NUM.BYTES_PER_MIB : (stryCov_9fa48("65372"), stats.memory.totalBytes / NUM.BYTES_PER_MIB)) : undefined;
      const cache = this.systemTableCache;
      const existing = stryMutAct_9fa48("65375") ? cache.get(SYSTEM_TABLE_NAME.NODES, this.nodeId) && null : stryMutAct_9fa48("65374") ? false : stryMutAct_9fa48("65373") ? true : (stryCov_9fa48("65373", "65374", "65375"), cache.get(SYSTEM_TABLE_NAME.NODES, this.nodeId) || null);
      const updateRow = stryMutAct_9fa48("65376") ? {} : (stryCov_9fa48("65376"), {
        node_address: stryMutAct_9fa48("65379") ? (this.nodeAddress || existing?.node_address) && STRING.UNKNOWN : stryMutAct_9fa48("65378") ? false : stryMutAct_9fa48("65377") ? true : (stryCov_9fa48("65377", "65378", "65379"), (stryMutAct_9fa48("65381") ? this.nodeAddress && existing?.node_address : stryMutAct_9fa48("65380") ? false : (stryCov_9fa48("65380", "65381"), this.nodeAddress || (stryMutAct_9fa48("65382") ? existing.node_address : (stryCov_9fa48("65382"), existing?.node_address)))) || STRING.UNKNOWN),
        cpu_cores: Number.isFinite(stryMutAct_9fa48("65384") ? stats.cpu?.count : stryMutAct_9fa48("65383") ? stats?.cpu.count : (stryCov_9fa48("65383", "65384"), stats?.cpu?.count)) ? stats.cpu.count : stryMutAct_9fa48("65387") ? existing?.cpu_cores && NUM.ZERO : stryMutAct_9fa48("65386") ? false : stryMutAct_9fa48("65385") ? true : (stryCov_9fa48("65385", "65386", "65387"), (stryMutAct_9fa48("65388") ? existing.cpu_cores : (stryCov_9fa48("65388"), existing?.cpu_cores)) || NUM.ZERO),
        memory_mb: Number.isFinite(memoryMb) ? memoryMb : stryMutAct_9fa48("65391") ? existing?.memory_mb && NUM.ZERO : stryMutAct_9fa48("65390") ? false : stryMutAct_9fa48("65389") ? true : (stryCov_9fa48("65389", "65390", "65391"), (stryMutAct_9fa48("65392") ? existing.memory_mb : (stryCov_9fa48("65392"), existing?.memory_mb)) || NUM.ZERO),
        disk_gb: Number.isFinite(stryMutAct_9fa48("65393") ? stats.diskGb : (stryCov_9fa48("65393"), stats?.diskGb)) ? stats.diskGb : stryMutAct_9fa48("65396") ? existing?.disk_gb && NUM.ZERO : stryMutAct_9fa48("65395") ? false : stryMutAct_9fa48("65394") ? true : (stryCov_9fa48("65394", "65395", "65396"), (stryMutAct_9fa48("65397") ? existing.disk_gb : (stryCov_9fa48("65397"), existing?.disk_gb)) || NUM.ZERO),
        cpu_usage_percent: Number.isFinite(stryMutAct_9fa48("65399") ? stats.cpu?.usagePercent : stryMutAct_9fa48("65398") ? stats?.cpu.usagePercent : (stryCov_9fa48("65398", "65399"), stats?.cpu?.usagePercent)) ? stats.cpu.usagePercent : stryMutAct_9fa48("65402") ? existing?.cpu_usage_percent && NUM.ZERO : stryMutAct_9fa48("65401") ? false : stryMutAct_9fa48("65400") ? true : (stryCov_9fa48("65400", "65401", "65402"), (stryMutAct_9fa48("65403") ? existing.cpu_usage_percent : (stryCov_9fa48("65403"), existing?.cpu_usage_percent)) || NUM.ZERO),
        memory_usage_percent: Number.isFinite(stryMutAct_9fa48("65405") ? stats.memory?.usagePercent : stryMutAct_9fa48("65404") ? stats?.memory.usagePercent : (stryCov_9fa48("65404", "65405"), stats?.memory?.usagePercent)) ? stats.memory.usagePercent : stryMutAct_9fa48("65408") ? existing?.memory_usage_percent && NUM.ZERO : stryMutAct_9fa48("65407") ? false : stryMutAct_9fa48("65406") ? true : (stryCov_9fa48("65406", "65407", "65408"), (stryMutAct_9fa48("65409") ? existing.memory_usage_percent : (stryCov_9fa48("65409"), existing?.memory_usage_percent)) || NUM.ZERO),
        disk_usage_percent: Number.isFinite(stryMutAct_9fa48("65410") ? stats.diskUsagePercent : (stryCov_9fa48("65410"), stats?.diskUsagePercent)) ? stats.diskUsagePercent : stryMutAct_9fa48("65413") ? existing?.disk_usage_percent && NUM.ZERO : stryMutAct_9fa48("65412") ? false : stryMutAct_9fa48("65411") ? true : (stryCov_9fa48("65411", "65412", "65413"), (stryMutAct_9fa48("65414") ? existing.disk_usage_percent : (stryCov_9fa48("65414"), existing?.disk_usage_percent)) || NUM.ZERO),
        status: SERVICE_STATUS.ACTIVE,
        connection_state: STATE.READY,
        capabilities: capabilities ? JSON.stringify(capabilities) : stryMutAct_9fa48("65417") ? existing?.capabilities && STRING.EMPTY_JSON_ARRAY : stryMutAct_9fa48("65416") ? false : stryMutAct_9fa48("65415") ? true : (stryCov_9fa48("65415", "65416", "65417"), (stryMutAct_9fa48("65418") ? existing.capabilities : (stryCov_9fa48("65418"), existing?.capabilities)) || STRING.EMPTY_JSON_ARRAY),
        last_heartbeat: now,
        ready_lease_expires_at: stryMutAct_9fa48("65419") ? now - this.readyLeaseMs : (stryCov_9fa48("65419"), now + this.readyLeaseMs),
        ...this.resolveHeartbeatBudgetFields(existing)
      });
      this.recordMemoryTrendSample(updateRow.memory_usage_percent, now);
      const heartbeatWriteQueryTimeoutMs = this.resolveHeartbeatWriteQueryTimeoutMs();
      const quietModeActive = this.isQuietModeActive();
      const nodeWriteDecision = this.resolveNodeHeartbeatWriteDecision(updateRow, now);
      let shouldWriteNodeHeartbeat = nodeWriteDecision.shouldWrite;
      if (stryMutAct_9fa48("65422") ? quietModeActive || shouldWriteNodeHeartbeat : stryMutAct_9fa48("65421") ? false : stryMutAct_9fa48("65420") ? true : (stryCov_9fa48("65420", "65421", "65422"), quietModeActive && shouldWriteNodeHeartbeat)) {
        if (stryMutAct_9fa48("65423")) {
          {}
        } else {
          stryCov_9fa48("65423");
          if (stryMutAct_9fa48("65426") ? nodeWriteDecision.reason !== HEARTBEAT_SERVICE_LITERAL.NO_PREVIOUS_WRITE : stryMutAct_9fa48("65425") ? false : stryMutAct_9fa48("65424") ? true : (stryCov_9fa48("65424", "65425", "65426"), nodeWriteDecision.reason === HEARTBEAT_SERVICE_LITERAL.NO_PREVIOUS_WRITE)) {
            if (stryMutAct_9fa48("65427")) {
              {}
            } else {
              stryCov_9fa48("65427");
              this.recordQuietModeBypassReason(HEARTBEAT_QUIET_MODE_BYPASS_REASON.NODE_HEARTBEAT_INITIAL_WRITE);
            }
          } else if (stryMutAct_9fa48("65430") ? nodeWriteDecision.reason !== HEARTBEAT_SERVICE_LITERAL.MAX_STALENESS : stryMutAct_9fa48("65429") ? false : stryMutAct_9fa48("65428") ? true : (stryCov_9fa48("65428", "65429", "65430"), nodeWriteDecision.reason === HEARTBEAT_SERVICE_LITERAL.MAX_STALENESS)) {
            if (stryMutAct_9fa48("65431")) {
              {}
            } else {
              stryCov_9fa48("65431");
              this.recordQuietModeBypassReason(HEARTBEAT_QUIET_MODE_BYPASS_REASON.NODE_HEARTBEAT_MAX_STALENESS);
            }
          } else if (stryMutAct_9fa48("65434") ? nodeWriteDecision.reason !== HEARTBEAT_SERVICE_LITERAL.STRUCTURAL_CHANGED : stryMutAct_9fa48("65433") ? false : stryMutAct_9fa48("65432") ? true : (stryCov_9fa48("65432", "65433", "65434"), nodeWriteDecision.reason === HEARTBEAT_SERVICE_LITERAL.STRUCTURAL_CHANGED)) {
            if (stryMutAct_9fa48("65435")) {
              {}
            } else {
              stryCov_9fa48("65435");
              this.recordQuietModeBypassReason(HEARTBEAT_QUIET_MODE_BYPASS_REASON.NODE_HEARTBEAT_STRUCTURAL_CHANGE);
            }
          } else {
            if (stryMutAct_9fa48("65436")) {
              {}
            } else {
              stryCov_9fa48("65436");
              shouldWriteNodeHeartbeat = stryMutAct_9fa48("65437") ? true : (stryCov_9fa48("65437"), false);
              this.recordQuietModeSuppressedWrite(HEARTBEAT_SERVICE_LITERAL.NODEHEARTBEATWRITES);
            }
          }
        }
      }
      if (stryMutAct_9fa48("65439") ? false : stryMutAct_9fa48("65438") ? true : (stryCov_9fa48("65438", "65439"), shouldWriteNodeHeartbeat)) {
        if (stryMutAct_9fa48("65440")) {
          {}
        } else {
          stryCov_9fa48("65440");
          await this.writeNodeHeartbeat(updateRow, capabilities, now, heartbeatWriteQueryTimeoutMs);
        }
      } // Register or refresh WebSocket endpoint, but avoid rewriting unchanged
      // endpoint rows on every heartbeat.
      const endpointId = stryMutAct_9fa48("65441") ? `` : (stryCov_9fa48("65441"), `${ENDPOINT_ID_PREFIX}${this.nodeId}${ENDPOINT_ID_SUFFIX}`);
      const existingEp = stryMutAct_9fa48("65444") ? cache.get(SYSTEM_TABLE_NAME.NODE_ENDPOINTS, endpointId) && null : stryMutAct_9fa48("65443") ? false : stryMutAct_9fa48("65442") ? true : (stryCov_9fa48("65442", "65443", "65444"), cache.get(SYSTEM_TABLE_NAME.NODE_ENDPOINTS, endpointId) || null);
      const endpointRow = this.buildEndpointRow(existingEp, now);
      if (stryMutAct_9fa48("65446") ? false : stryMutAct_9fa48("65445") ? true : (stryCov_9fa48("65445", "65446"), this.shouldUpsertEndpointRow(endpointRow, now))) {
        if (stryMutAct_9fa48("65447")) {
          {}
        } else {
          stryCov_9fa48("65447");
          if (stryMutAct_9fa48("65449") ? false : stryMutAct_9fa48("65448") ? true : (stryCov_9fa48("65448", "65449"), quietModeActive)) {
            if (stryMutAct_9fa48("65450")) {
              {}
            } else {
              stryCov_9fa48("65450");
              this.recordQuietModeSuppressedWrite(HEARTBEAT_SERVICE_LITERAL.ENDPOINTUPSERTS);
              return;
            }
          }
          await this.getControlPlaneSystemTableGateway().upsertSystemTableRow(SYSTEM_TABLE_NAME.NODE_ENDPOINTS, endpointRow, this.buildEndpointHeartbeatWriteOptions(endpointId, heartbeatWriteQueryTimeoutMs));
          this.lastEndpointUpsertAt = now;
          this.lastEndpointUpsertSignature = this.buildEndpointUpsertSignature(endpointRow);
        }
      }
    }
  } /**
    * Persist or report the current node heartbeat row.
    * Joiners can report through the control-plane message path to avoid
    * routed SQL liveness flaps during membership changes.
    * @param {Object} updateRow
    * @param {Array<string>|string|null} capabilities
    * @param {number} now
    * @param {number} [queryTimeoutMs]
    * @return {Promise<void>}
    * @private
    */
  async writeNodeHeartbeat(updateRow, capabilities, now, queryTimeoutMs = null) {
    if (stryMutAct_9fa48("65451")) {
      {}
    } else {
      stryCov_9fa48("65451");
      const heartbeatWriteQueryTimeoutMs = (stryMutAct_9fa48("65454") ? Number.isFinite(queryTimeoutMs) || queryTimeoutMs > ZERO : stryMutAct_9fa48("65453") ? false : stryMutAct_9fa48("65452") ? true : (stryCov_9fa48("65452", "65453", "65454"), Number.isFinite(queryTimeoutMs) && (stryMutAct_9fa48("65457") ? queryTimeoutMs <= ZERO : stryMutAct_9fa48("65456") ? queryTimeoutMs >= ZERO : stryMutAct_9fa48("65455") ? true : (stryCov_9fa48("65455", "65456", "65457"), queryTimeoutMs > ZERO)))) ? Math.floor(queryTimeoutMs) : this.resolveHeartbeatWriteQueryTimeoutMs();
      const reporterTimeoutMs = this.resolveNodeStateReporterTimeoutMs(heartbeatWriteQueryTimeoutMs);
      if (stryMutAct_9fa48("65460") ? typeof this.nodeStateReporter !== TYPEOF.FUNCTION : stryMutAct_9fa48("65459") ? false : stryMutAct_9fa48("65458") ? true : (stryCov_9fa48("65458", "65459", "65460"), typeof this.nodeStateReporter === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("65461")) {
          {}
        } else {
          stryCov_9fa48("65461");
          try {
            if (stryMutAct_9fa48("65462")) {
              {}
            } else {
              stryCov_9fa48("65462");
              const reporterResult = await this.callNodeStateReporterWithTimeout(stryMutAct_9fa48("65463") ? {} : (stryCov_9fa48("65463"), {
                nodeId: this.nodeId,
                nodeAddress: updateRow.node_address,
                state: updateRow.connection_state,
                capabilities: stryMutAct_9fa48("65464") ? capabilities && updateRow.capabilities : (stryCov_9fa48("65464"), capabilities ?? updateRow.capabilities),
                heartbeatAt: now,
                readyLeaseExpiresAt: updateRow.ready_lease_expires_at,
                heartbeatOnly: stryMutAct_9fa48("65465") ? false : (stryCov_9fa48("65465"), true),
                nodeRow: stryMutAct_9fa48("65466") ? {} : (stryCov_9fa48("65466"), {
                  ...updateRow
                })
              }), reporterTimeoutMs);
              const reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(reporterResult, stryMutAct_9fa48("65467") ? "" : (stryCov_9fa48("65467"), 'node_state_reporter'));
              if (stryMutAct_9fa48("65469") ? false : stryMutAct_9fa48("65468") ? true : (stryCov_9fa48("65468", "65469"), this.isReporterHeartbeatVisibilityConfirmed(reporterDiagnostics, now))) {
                if (stryMutAct_9fa48("65470")) {
                  {}
                } else {
                  stryCov_9fa48("65470");
                  this.recordHeartbeatPublicationSuccess(reporterDiagnostics, now);
                  this.recordConfirmedNodeHeartbeatWrite(updateRow, now);
                  return;
                }
              }
              if (stryMutAct_9fa48("65473") ? false : stryMutAct_9fa48("65472") ? true : stryMutAct_9fa48("65471") ? this.shouldVerifyReporterHeartbeatVisibility(reporterDiagnostics, now) : (stryCov_9fa48("65471", "65472", "65473"), !this.shouldVerifyReporterHeartbeatVisibility(reporterDiagnostics, now))) {
                if (stryMutAct_9fa48("65474")) {
                  {}
                } else {
                  stryCov_9fa48("65474");
                  return;
                }
              }
              this.scheduleReporterHeartbeatVisibilityVerification(now, reporterDiagnostics, stryMutAct_9fa48("65475") ? {} : (stryCov_9fa48("65475"), {
                onVisible: () => {
                  if (stryMutAct_9fa48("65476")) {
                    {}
                  } else {
                    stryCov_9fa48("65476");
                    this.recordHeartbeatPublicationSuccess(reporterDiagnostics, now);
                    this.recordConfirmedNodeHeartbeatWrite(updateRow, now);
                  }
                }
              }));
              this.lastReporterVisibilityTargetAddress = stryMutAct_9fa48("65479") ? reporterDiagnostics.targetAddress && null : stryMutAct_9fa48("65478") ? false : stryMutAct_9fa48("65477") ? true : (stryCov_9fa48("65477", "65478", "65479"), reporterDiagnostics.targetAddress || null);
              return;
            }
          } catch (error) {
            if (stryMutAct_9fa48("65480")) {
              {}
            } else {
              stryCov_9fa48("65480");
              const reporterDiagnostics = normalizeHeartbeatPublicationDiagnostics(stryMutAct_9fa48("65483") ? error?.publicationDiagnostics && error : stryMutAct_9fa48("65482") ? false : stryMutAct_9fa48("65481") ? true : (stryCov_9fa48("65481", "65482", "65483"), (stryMutAct_9fa48("65484") ? error.publicationDiagnostics : (stryCov_9fa48("65484"), error?.publicationDiagnostics)) || error), stryMutAct_9fa48("65485") ? "" : (stryCov_9fa48("65485"), 'node_state_reporter'));
              this.recordHeartbeatPublicationTarget(reporterDiagnostics);
              error.publicationDiagnostics = reporterDiagnostics;
              throw error;
            }
          }
        }
      }
      const updateResult = await this.getControlPlaneSystemTableGateway().updateSystemTableRow(SYSTEM_TABLE_NAME.NODES, stryMutAct_9fa48("65486") ? {} : (stryCov_9fa48("65486"), {
        node_id: this.nodeId
      }), updateRow, this.buildNodeHeartbeatWriteOptions(heartbeatWriteQueryTimeoutMs));
      const affectedRows = Number(stryMutAct_9fa48("65488") ? updateResult.partitionResult?.affectedRows : stryMutAct_9fa48("65487") ? updateResult?.partitionResult.affectedRows : (stryCov_9fa48("65487", "65488"), updateResult?.partitionResult?.affectedRows));
      if (stryMutAct_9fa48("65491") ? affectedRows !== NUM.ZERO : stryMutAct_9fa48("65490") ? false : stryMutAct_9fa48("65489") ? true : (stryCov_9fa48("65489", "65490", "65491"), affectedRows === NUM.ZERO)) {
        if (stryMutAct_9fa48("65492")) {
          {}
        } else {
          stryCov_9fa48("65492");
          throw this.buildMissingNodeRowError(HEARTBEAT_SERVICE_LITERAL.HEARTBEAT);
        }
      }
      this.recordHeartbeatPublicationSuccess(stryMutAct_9fa48("65493") ? {} : (stryCov_9fa48("65493"), {
        publicationPath: HEARTBEAT_SERVICE_LITERAL.CDC_UPDATE
      }), now);
      this.recordConfirmedNodeHeartbeatWrite(updateRow, now);
    }
  } /**
    * Reuse a recent successful reporter visibility proof for steady-state
    * heartbeats so repeated success acknowledgements do not force routed
    * verification reads on every interval.
    * @param {Object} reporterDiagnostics
    * @param {number} nowMs
    * @return {boolean}
    * @private
    */
  shouldVerifyReporterHeartbeatVisibility(reporterDiagnostics, nowMs) {
    if (stryMutAct_9fa48("65494")) {
      {}
    } else {
      stryCov_9fa48("65494");
      if (stryMutAct_9fa48("65497") ? this.verifyReporterVisibilityOnSuccess === true : stryMutAct_9fa48("65496") ? false : stryMutAct_9fa48("65495") ? true : (stryCov_9fa48("65495", "65496", "65497"), this.verifyReporterVisibilityOnSuccess !== (stryMutAct_9fa48("65498") ? false : (stryCov_9fa48("65498"), true)))) {
        if (stryMutAct_9fa48("65499")) {
          {}
        } else {
          stryCov_9fa48("65499");
          return stryMutAct_9fa48("65500") ? true : (stryCov_9fa48("65500"), false);
        }
      }
      if (stryMutAct_9fa48("65502") ? false : stryMutAct_9fa48("65501") ? true : (stryCov_9fa48("65501", "65502"), this.reporterVisibilityVerificationPromise)) {
        if (stryMutAct_9fa48("65503")) {
          {}
        } else {
          stryCov_9fa48("65503");
          return stryMutAct_9fa48("65504") ? true : (stryCov_9fa48("65504"), false);
        }
      }
      const targetAddress = stryMutAct_9fa48("65507") ? reporterDiagnostics?.targetAddress && null : stryMutAct_9fa48("65506") ? false : stryMutAct_9fa48("65505") ? true : (stryCov_9fa48("65505", "65506", "65507"), (stryMutAct_9fa48("65508") ? reporterDiagnostics.targetAddress : (stryCov_9fa48("65508"), reporterDiagnostics?.targetAddress)) || null);
      const hasVerifiedProof = stryMutAct_9fa48("65511") ? Number.isFinite(this.lastReporterVisibilityVerifiedAt) || this.lastReporterVisibilityVerifiedAt > ZERO : stryMutAct_9fa48("65510") ? false : stryMutAct_9fa48("65509") ? true : (stryCov_9fa48("65509", "65510", "65511"), Number.isFinite(this.lastReporterVisibilityVerifiedAt) && (stryMutAct_9fa48("65514") ? this.lastReporterVisibilityVerifiedAt <= ZERO : stryMutAct_9fa48("65513") ? this.lastReporterVisibilityVerifiedAt >= ZERO : stryMutAct_9fa48("65512") ? true : (stryCov_9fa48("65512", "65513", "65514"), this.lastReporterVisibilityVerifiedAt > ZERO)));
      if (stryMutAct_9fa48("65517") ? false : stryMutAct_9fa48("65516") ? true : stryMutAct_9fa48("65515") ? hasVerifiedProof : (stryCov_9fa48("65515", "65516", "65517"), !hasVerifiedProof)) {
        if (stryMutAct_9fa48("65518")) {
          {}
        } else {
          stryCov_9fa48("65518");
          const targetChangedSinceLastAttempt = stryMutAct_9fa48("65521") ? targetAddress || targetAddress !== this.lastReporterVisibilityAttemptTargetAddress : stryMutAct_9fa48("65520") ? false : stryMutAct_9fa48("65519") ? true : (stryCov_9fa48("65519", "65520", "65521"), targetAddress && (stryMutAct_9fa48("65523") ? targetAddress === this.lastReporterVisibilityAttemptTargetAddress : stryMutAct_9fa48("65522") ? true : (stryCov_9fa48("65522", "65523"), targetAddress !== this.lastReporterVisibilityAttemptTargetAddress)));
          if (stryMutAct_9fa48("65526") ? !targetChangedSinceLastAttempt && Number.isFinite(this.lastReporterVisibilityAttemptAt) && this.lastReporterVisibilityAttemptAt > ZERO || nowMs - this.lastReporterVisibilityAttemptAt < this.reporterVisibilityRetryIntervalMs : stryMutAct_9fa48("65525") ? false : stryMutAct_9fa48("65524") ? true : (stryCov_9fa48("65524", "65525", "65526"), (stryMutAct_9fa48("65528") ? !targetChangedSinceLastAttempt && Number.isFinite(this.lastReporterVisibilityAttemptAt) || this.lastReporterVisibilityAttemptAt > ZERO : stryMutAct_9fa48("65527") ? true : (stryCov_9fa48("65527", "65528"), (stryMutAct_9fa48("65530") ? !targetChangedSinceLastAttempt || Number.isFinite(this.lastReporterVisibilityAttemptAt) : stryMutAct_9fa48("65529") ? true : (stryCov_9fa48("65529", "65530"), (stryMutAct_9fa48("65531") ? targetChangedSinceLastAttempt : (stryCov_9fa48("65531"), !targetChangedSinceLastAttempt)) && Number.isFinite(this.lastReporterVisibilityAttemptAt))) && (stryMutAct_9fa48("65534") ? this.lastReporterVisibilityAttemptAt <= ZERO : stryMutAct_9fa48("65533") ? this.lastReporterVisibilityAttemptAt >= ZERO : stryMutAct_9fa48("65532") ? true : (stryCov_9fa48("65532", "65533", "65534"), this.lastReporterVisibilityAttemptAt > ZERO)))) && (stryMutAct_9fa48("65537") ? nowMs - this.lastReporterVisibilityAttemptAt >= this.reporterVisibilityRetryIntervalMs : stryMutAct_9fa48("65536") ? nowMs - this.lastReporterVisibilityAttemptAt <= this.reporterVisibilityRetryIntervalMs : stryMutAct_9fa48("65535") ? true : (stryCov_9fa48("65535", "65536", "65537"), (stryMutAct_9fa48("65538") ? nowMs + this.lastReporterVisibilityAttemptAt : (stryCov_9fa48("65538"), nowMs - this.lastReporterVisibilityAttemptAt)) < this.reporterVisibilityRetryIntervalMs)))) {
            if (stryMutAct_9fa48("65539")) {
              {}
            } else {
              stryCov_9fa48("65539");
              return stryMutAct_9fa48("65540") ? true : (stryCov_9fa48("65540"), false);
            }
          }
          return stryMutAct_9fa48("65541") ? false : (stryCov_9fa48("65541"), true);
        }
      }
      if (stryMutAct_9fa48("65544") ? targetAddress || targetAddress !== this.lastReporterVisibilityTargetAddress : stryMutAct_9fa48("65543") ? false : stryMutAct_9fa48("65542") ? true : (stryCov_9fa48("65542", "65543", "65544"), targetAddress && (stryMutAct_9fa48("65546") ? targetAddress === this.lastReporterVisibilityTargetAddress : stryMutAct_9fa48("65545") ? true : (stryCov_9fa48("65545", "65546"), targetAddress !== this.lastReporterVisibilityTargetAddress)))) {
        if (stryMutAct_9fa48("65547")) {
          {}
        } else {
          stryCov_9fa48("65547");
          return stryMutAct_9fa48("65548") ? false : (stryCov_9fa48("65548"), true);
        }
      }
      return stryMutAct_9fa48("65552") ? nowMs - this.lastReporterVisibilityVerifiedAt < this.reporterVisibilitySuccessTtlMs : stryMutAct_9fa48("65551") ? nowMs - this.lastReporterVisibilityVerifiedAt > this.reporterVisibilitySuccessTtlMs : stryMutAct_9fa48("65550") ? false : stryMutAct_9fa48("65549") ? true : (stryCov_9fa48("65549", "65550", "65551", "65552"), (stryMutAct_9fa48("65553") ? nowMs + this.lastReporterVisibilityVerifiedAt : (stryCov_9fa48("65553"), nowMs - this.lastReporterVisibilityVerifiedAt)) >= this.reporterVisibilitySuccessTtlMs);
    }
  }
  isReporterHeartbeatVisibilityConfirmed(reporterDiagnostics, nowMs) {
    if (stryMutAct_9fa48("65554")) {
      {}
    } else {
      stryCov_9fa48("65554");
      if (stryMutAct_9fa48("65557") ? this.verifyReporterVisibilityOnSuccess === true : stryMutAct_9fa48("65556") ? false : stryMutAct_9fa48("65555") ? true : (stryCov_9fa48("65555", "65556", "65557"), this.verifyReporterVisibilityOnSuccess !== (stryMutAct_9fa48("65558") ? false : (stryCov_9fa48("65558"), true)))) {
        if (stryMutAct_9fa48("65559")) {
          {}
        } else {
          stryCov_9fa48("65559");
          return stryMutAct_9fa48("65560") ? false : (stryCov_9fa48("65560"), true);
        }
      }
      if (stryMutAct_9fa48("65562") ? false : stryMutAct_9fa48("65561") ? true : (stryCov_9fa48("65561", "65562"), this.reporterVisibilityVerificationPromise)) {
        if (stryMutAct_9fa48("65563")) {
          {}
        } else {
          stryCov_9fa48("65563");
          return stryMutAct_9fa48("65564") ? true : (stryCov_9fa48("65564"), false);
        }
      }
      if (stryMutAct_9fa48("65567") ? !Number.isFinite(this.lastReporterVisibilityVerifiedAt) && this.lastReporterVisibilityVerifiedAt <= ZERO : stryMutAct_9fa48("65566") ? false : stryMutAct_9fa48("65565") ? true : (stryCov_9fa48("65565", "65566", "65567"), (stryMutAct_9fa48("65568") ? Number.isFinite(this.lastReporterVisibilityVerifiedAt) : (stryCov_9fa48("65568"), !Number.isFinite(this.lastReporterVisibilityVerifiedAt))) || (stryMutAct_9fa48("65571") ? this.lastReporterVisibilityVerifiedAt > ZERO : stryMutAct_9fa48("65570") ? this.lastReporterVisibilityVerifiedAt < ZERO : stryMutAct_9fa48("65569") ? false : (stryCov_9fa48("65569", "65570", "65571"), this.lastReporterVisibilityVerifiedAt <= ZERO)))) {
        if (stryMutAct_9fa48("65572")) {
          {}
        } else {
          stryCov_9fa48("65572");
          return stryMutAct_9fa48("65573") ? true : (stryCov_9fa48("65573"), false);
        }
      }
      const targetAddress = stryMutAct_9fa48("65576") ? reporterDiagnostics?.targetAddress && null : stryMutAct_9fa48("65575") ? false : stryMutAct_9fa48("65574") ? true : (stryCov_9fa48("65574", "65575", "65576"), (stryMutAct_9fa48("65577") ? reporterDiagnostics.targetAddress : (stryCov_9fa48("65577"), reporterDiagnostics?.targetAddress)) || null);
      if (stryMutAct_9fa48("65580") ? targetAddress || targetAddress !== this.lastReporterVisibilityTargetAddress : stryMutAct_9fa48("65579") ? false : stryMutAct_9fa48("65578") ? true : (stryCov_9fa48("65578", "65579", "65580"), targetAddress && (stryMutAct_9fa48("65582") ? targetAddress === this.lastReporterVisibilityTargetAddress : stryMutAct_9fa48("65581") ? true : (stryCov_9fa48("65581", "65582"), targetAddress !== this.lastReporterVisibilityTargetAddress)))) {
        if (stryMutAct_9fa48("65583")) {
          {}
        } else {
          stryCov_9fa48("65583");
          return stryMutAct_9fa48("65584") ? true : (stryCov_9fa48("65584"), false);
        }
      }
      return stryMutAct_9fa48("65588") ? nowMs - this.lastReporterVisibilityVerifiedAt >= this.reporterVisibilitySuccessTtlMs : stryMutAct_9fa48("65587") ? nowMs - this.lastReporterVisibilityVerifiedAt <= this.reporterVisibilitySuccessTtlMs : stryMutAct_9fa48("65586") ? false : stryMutAct_9fa48("65585") ? true : (stryCov_9fa48("65585", "65586", "65587", "65588"), (stryMutAct_9fa48("65589") ? nowMs + this.lastReporterVisibilityVerifiedAt : (stryCov_9fa48("65589"), nowMs - this.lastReporterVisibilityVerifiedAt)) < this.reporterVisibilitySuccessTtlMs);
    }
  } /**
    * Schedule one bounded canonical visibility proof outside the hot heartbeat
    * path. Reporter acknowledgement remains the owner-path success signal; this
    * readback is only a throttled diagnostic proof.
    * @param {number} expectedHeartbeatAt
    * @param {Object|null} reporterDiagnostics
    * @param {Object} [options]
    * @param {Function} [options.onVisible]
    * @return {Promise<void>|null}
    * @private
    */
  scheduleReporterHeartbeatVisibilityVerification(expectedHeartbeatAt, reporterDiagnostics, options = {}) {
    if (stryMutAct_9fa48("65590")) {
      {}
    } else {
      stryCov_9fa48("65590");
      const normalizedDiagnostics = normalizeHeartbeatPublicationDiagnostics(reporterDiagnostics, stryMutAct_9fa48("65591") ? "" : (stryCov_9fa48("65591"), 'node_state_reporter'));
      const nowMs = this.now();
      if (stryMutAct_9fa48("65594") ? false : stryMutAct_9fa48("65593") ? true : stryMutAct_9fa48("65592") ? this.shouldVerifyReporterHeartbeatVisibility(normalizedDiagnostics, nowMs) : (stryCov_9fa48("65592", "65593", "65594"), !this.shouldVerifyReporterHeartbeatVisibility(normalizedDiagnostics, nowMs))) {
        if (stryMutAct_9fa48("65595")) {
          {}
        } else {
          stryCov_9fa48("65595");
          return null;
        }
      }
      this.lastReporterVisibilityAttemptAt = nowMs;
      this.lastReporterVisibilityAttemptTargetAddress = stryMutAct_9fa48("65598") ? normalizedDiagnostics.targetAddress && null : stryMutAct_9fa48("65597") ? false : stryMutAct_9fa48("65596") ? true : (stryCov_9fa48("65596", "65597", "65598"), normalizedDiagnostics.targetAddress || null);
      const verificationToken = {};
      const verificationPromise = new Promise(resolve => {
        if (stryMutAct_9fa48("65599")) {
          {}
        } else {
          stryCov_9fa48("65599");
          const timeoutHandle = this.setTimeoutFn(async () => {
            if (stryMutAct_9fa48("65600")) {
              {}
            } else {
              stryCov_9fa48("65600");
              try {
                if (stryMutAct_9fa48("65601")) {
                  {}
                } else {
                  stryCov_9fa48("65601");
                  if (stryMutAct_9fa48("65604") ? typeof this.nodeStateReporter !== TYPEOF.FUNCTION && this.verifyReporterVisibilityOnSuccess !== true : stryMutAct_9fa48("65603") ? false : stryMutAct_9fa48("65602") ? true : (stryCov_9fa48("65602", "65603", "65604"), (stryMutAct_9fa48("65606") ? typeof this.nodeStateReporter === TYPEOF.FUNCTION : stryMutAct_9fa48("65605") ? false : (stryCov_9fa48("65605", "65606"), typeof this.nodeStateReporter !== TYPEOF.FUNCTION)) || (stryMutAct_9fa48("65608") ? this.verifyReporterVisibilityOnSuccess === true : stryMutAct_9fa48("65607") ? false : (stryCov_9fa48("65607", "65608"), this.verifyReporterVisibilityOnSuccess !== (stryMutAct_9fa48("65609") ? false : (stryCov_9fa48("65609"), true)))))) {
                    if (stryMutAct_9fa48("65610")) {
                      {}
                    } else {
                      stryCov_9fa48("65610");
                      return;
                    }
                  }
                  const reporterVisible = await this.verifyReporterHeartbeatVisibility(expectedHeartbeatAt, options);
                  if (stryMutAct_9fa48("65612") ? false : stryMutAct_9fa48("65611") ? true : (stryCov_9fa48("65611", "65612"), reporterVisible)) {
                    if (stryMutAct_9fa48("65613")) {
                      {}
                    } else {
                      stryCov_9fa48("65613");
                      this.lastReporterVisibilityVerifiedAt = this.now();
                      this.lastReporterVisibilityTargetAddress = stryMutAct_9fa48("65616") ? normalizedDiagnostics.targetAddress && null : stryMutAct_9fa48("65615") ? false : stryMutAct_9fa48("65614") ? true : (stryCov_9fa48("65614", "65615", "65616"), normalizedDiagnostics.targetAddress || null);
                      if (stryMutAct_9fa48("65619") ? typeof options.onVisible !== TYPEOF.FUNCTION : stryMutAct_9fa48("65618") ? false : stryMutAct_9fa48("65617") ? true : (stryCov_9fa48("65617", "65618", "65619"), typeof options.onVisible === TYPEOF.FUNCTION)) {
                        if (stryMutAct_9fa48("65620")) {
                          {}
                        } else {
                          stryCov_9fa48("65620");
                          options.onVisible();
                        }
                      }
                      return;
                    }
                  }
                  this.recordHeartbeatPublicationTarget(stryMutAct_9fa48("65621") ? {} : (stryCov_9fa48("65621"), {
                    ...normalizedDiagnostics,
                    publicationPath: stryMutAct_9fa48("65622") ? "" : (stryCov_9fa48("65622"), 'node_state_reporter_unverified')
                  }));
                }
              } catch (error) {
                if (stryMutAct_9fa48("65623")) {
                  {}
                } else {
                  stryCov_9fa48("65623");
                  this.recordHeartbeatPublicationTarget(stryMutAct_9fa48("65624") ? {} : (stryCov_9fa48("65624"), {
                    ...normalizedDiagnostics,
                    publicationPath: stryMutAct_9fa48("65625") ? "" : (stryCov_9fa48("65625"), 'node_state_reporter_unverified')
                  }));
                  this.logger.debug(stryMutAct_9fa48("65626") ? "" : (stryCov_9fa48("65626"), 'Reporter heartbeat visibility verification failed'), stryMutAct_9fa48("65627") ? {} : (stryCov_9fa48("65627"), {
                    nodeId: this.nodeId,
                    error: stryMutAct_9fa48("65630") ? error?.message && String(error) : stryMutAct_9fa48("65629") ? false : stryMutAct_9fa48("65628") ? true : (stryCov_9fa48("65628", "65629", "65630"), (stryMutAct_9fa48("65631") ? error.message : (stryCov_9fa48("65631"), error?.message)) || String(error)),
                    targetAddress: stryMutAct_9fa48("65634") ? normalizedDiagnostics.targetAddress && null : stryMutAct_9fa48("65633") ? false : stryMutAct_9fa48("65632") ? true : (stryCov_9fa48("65632", "65633", "65634"), normalizedDiagnostics.targetAddress || null)
                  }));
                }
              } finally {
                if (stryMutAct_9fa48("65635")) {
                  {}
                } else {
                  stryCov_9fa48("65635");
                  if (stryMutAct_9fa48("65638") ? this.reporterVisibilityVerificationPromise !== verificationToken : stryMutAct_9fa48("65637") ? false : stryMutAct_9fa48("65636") ? true : (stryCov_9fa48("65636", "65637", "65638"), this.reporterVisibilityVerificationPromise === verificationToken)) {
                    if (stryMutAct_9fa48("65639")) {
                      {}
                    } else {
                      stryCov_9fa48("65639");
                      this.reporterVisibilityVerificationPromise = null;
                    }
                  }
                  resolve();
                }
              }
            }
          }, ZERO);
          if (stryMutAct_9fa48("65642") ? typeof timeoutHandle?.unref !== TYPEOF.FUNCTION : stryMutAct_9fa48("65641") ? false : stryMutAct_9fa48("65640") ? true : (stryCov_9fa48("65640", "65641", "65642"), typeof (stryMutAct_9fa48("65643") ? timeoutHandle.unref : (stryCov_9fa48("65643"), timeoutHandle?.unref)) === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("65644")) {
              {}
            } else {
              stryCov_9fa48("65644");
              timeoutHandle.unref();
            }
          }
        }
      });
      this.reporterVisibilityVerificationPromise = verificationToken;
      return verificationPromise;
    }
  }
  recordConfirmedNodeHeartbeatWrite(updateRow, now) {
    if (stryMutAct_9fa48("65645")) {
      {}
    } else {
      stryCov_9fa48("65645");
      this.lastNodeHeartbeatWriteAt = now;
      this.lastNodeHeartbeatWriteSignature = this.buildNodeHeartbeatStructuralSignature(updateRow);
      this.lastNodeHeartbeatUtilizationSignature = this.buildNodeHeartbeatUtilizationSignature(updateRow);
    }
  } /**
    * Verify that a successful node-state reporter heartbeat became visible in
    * the canonical nodes row before we treat delivery as sufficient.
    * @param {number} expectedHeartbeatAt
    * @param {Object} [options]
    * @param {string|null} [options.expectedStatus]
    * @param {string|null} [options.expectedConnectionState]
    * @param {boolean} [options.expectedReadyLeaseCleared]
    * @return {Promise<boolean>}
    * @private
    */
  async verifyReporterHeartbeatVisibility(expectedHeartbeatAt, options = {}) {
    if (stryMutAct_9fa48("65646")) {
      {}
    } else {
      stryCov_9fa48("65646");
      const authoritativeControlPlaneView = this.getAuthoritativeControlPlaneView();
      if (stryMutAct_9fa48("65649") ? (!authoritativeControlPlaneView || typeof authoritativeControlPlaneView.canRead !== TYPEOF.FUNCTION) && authoritativeControlPlaneView.canRead() !== true : stryMutAct_9fa48("65648") ? false : stryMutAct_9fa48("65647") ? true : (stryCov_9fa48("65647", "65648", "65649"), (stryMutAct_9fa48("65651") ? !authoritativeControlPlaneView && typeof authoritativeControlPlaneView.canRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("65650") ? false : (stryCov_9fa48("65650", "65651"), (stryMutAct_9fa48("65652") ? authoritativeControlPlaneView : (stryCov_9fa48("65652"), !authoritativeControlPlaneView)) || (stryMutAct_9fa48("65654") ? typeof authoritativeControlPlaneView.canRead === TYPEOF.FUNCTION : stryMutAct_9fa48("65653") ? false : (stryCov_9fa48("65653", "65654"), typeof authoritativeControlPlaneView.canRead !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("65656") ? authoritativeControlPlaneView.canRead() === true : stryMutAct_9fa48("65655") ? false : (stryCov_9fa48("65655", "65656"), authoritativeControlPlaneView.canRead() !== (stryMutAct_9fa48("65657") ? false : (stryCov_9fa48("65657"), true)))))) {
        if (stryMutAct_9fa48("65658")) {
          {}
        } else {
          stryCov_9fa48("65658");
          return stryMutAct_9fa48("65659") ? false : (stryCov_9fa48("65659"), true);
        }
      }
      try {
        if (stryMutAct_9fa48("65660")) {
          {}
        } else {
          stryCov_9fa48("65660");
          const result = await authoritativeControlPlaneView.readRows(SYSTEM_TABLE_NAME.NODES, stryMutAct_9fa48("65661") ? `` : (stryCov_9fa48("65661"), `SELECT * FROM ${SYSTEM_TABLE_NAME.NODES} WHERE node_id = ?`), stryMutAct_9fa48("65662") ? [] : (stryCov_9fa48("65662"), [this.nodeId]), stryMutAct_9fa48("65663") ? {} : (stryCov_9fa48("65663"), {
            readProfile: stryMutAct_9fa48("65664") ? "" : (stryCov_9fa48("65664"), 'diagnostics'),
            queryTimeoutMs: this.reporterVisibilityQueryTimeoutMs
          }));
          if (stryMutAct_9fa48("65667") ? false : stryMutAct_9fa48("65666") ? true : stryMutAct_9fa48("65665") ? result?.success : (stryCov_9fa48("65665", "65666", "65667"), !(stryMutAct_9fa48("65668") ? result.success : (stryCov_9fa48("65668"), result?.success)))) {
            if (stryMutAct_9fa48("65669")) {
              {}
            } else {
              stryCov_9fa48("65669");
              return stryMutAct_9fa48("65670") ? true : (stryCov_9fa48("65670"), false);
            }
          }
          const rows = Array.isArray(result.rows) ? result.rows : stryMutAct_9fa48("65671") ? ["Stryker was here"] : (stryCov_9fa48("65671"), []);
          const nodeRow = stryMutAct_9fa48("65674") ? (rows.find(row => {
            return row?.[COLUMN.NODE_ID] === this.nodeId || row?.node_id === this.nodeId;
          }) || rows[ZERO]) && null : stryMutAct_9fa48("65673") ? false : stryMutAct_9fa48("65672") ? true : (stryCov_9fa48("65672", "65673", "65674"), (stryMutAct_9fa48("65676") ? rows.find(row => {
            return row?.[COLUMN.NODE_ID] === this.nodeId || row?.node_id === this.nodeId;
          }) && rows[ZERO] : stryMutAct_9fa48("65675") ? false : (stryCov_9fa48("65675", "65676"), rows.find(row => {
            if (stryMutAct_9fa48("65677")) {
              {}
            } else {
              stryCov_9fa48("65677");
              return stryMutAct_9fa48("65680") ? row?.[COLUMN.NODE_ID] === this.nodeId && row?.node_id === this.nodeId : stryMutAct_9fa48("65679") ? false : stryMutAct_9fa48("65678") ? true : (stryCov_9fa48("65678", "65679", "65680"), (stryMutAct_9fa48("65682") ? row?.[COLUMN.NODE_ID] !== this.nodeId : stryMutAct_9fa48("65681") ? false : (stryCov_9fa48("65681", "65682"), (stryMutAct_9fa48("65683") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("65683"), row?.[COLUMN.NODE_ID])) === this.nodeId)) || (stryMutAct_9fa48("65685") ? row?.node_id !== this.nodeId : stryMutAct_9fa48("65684") ? false : (stryCov_9fa48("65684", "65685"), (stryMutAct_9fa48("65686") ? row.node_id : (stryCov_9fa48("65686"), row?.node_id)) === this.nodeId)));
            }
          }) || rows[ZERO])) || null);
          const lastHeartbeat = Number(stryMutAct_9fa48("65687") ? nodeRow?.[COLUMN.LAST_HEARTBEAT] && nodeRow?.last_heartbeat : (stryCov_9fa48("65687"), (stryMutAct_9fa48("65688") ? nodeRow[COLUMN.LAST_HEARTBEAT] : (stryCov_9fa48("65688"), nodeRow?.[COLUMN.LAST_HEARTBEAT])) ?? (stryMutAct_9fa48("65689") ? nodeRow.last_heartbeat : (stryCov_9fa48("65689"), nodeRow?.last_heartbeat))));
          if (stryMutAct_9fa48("65692") ? !Number.isFinite(lastHeartbeat) && lastHeartbeat < expectedHeartbeatAt : stryMutAct_9fa48("65691") ? false : stryMutAct_9fa48("65690") ? true : (stryCov_9fa48("65690", "65691", "65692"), (stryMutAct_9fa48("65693") ? Number.isFinite(lastHeartbeat) : (stryCov_9fa48("65693"), !Number.isFinite(lastHeartbeat))) || (stryMutAct_9fa48("65696") ? lastHeartbeat >= expectedHeartbeatAt : stryMutAct_9fa48("65695") ? lastHeartbeat <= expectedHeartbeatAt : stryMutAct_9fa48("65694") ? false : (stryCov_9fa48("65694", "65695", "65696"), lastHeartbeat < expectedHeartbeatAt)))) {
            if (stryMutAct_9fa48("65697")) {
              {}
            } else {
              stryCov_9fa48("65697");
              return stryMutAct_9fa48("65698") ? true : (stryCov_9fa48("65698"), false);
            }
          }
          if (stryMutAct_9fa48("65701") ? typeof options.expectedStatus === TYPEOF.STRING && nodeRow?.[COLUMN.STATUS] !== options.expectedStatus || nodeRow?.status !== options.expectedStatus : stryMutAct_9fa48("65700") ? false : stryMutAct_9fa48("65699") ? true : (stryCov_9fa48("65699", "65700", "65701"), (stryMutAct_9fa48("65703") ? typeof options.expectedStatus === TYPEOF.STRING || nodeRow?.[COLUMN.STATUS] !== options.expectedStatus : stryMutAct_9fa48("65702") ? true : (stryCov_9fa48("65702", "65703"), (stryMutAct_9fa48("65705") ? typeof options.expectedStatus !== TYPEOF.STRING : stryMutAct_9fa48("65704") ? true : (stryCov_9fa48("65704", "65705"), typeof options.expectedStatus === TYPEOF.STRING)) && (stryMutAct_9fa48("65707") ? nodeRow?.[COLUMN.STATUS] === options.expectedStatus : stryMutAct_9fa48("65706") ? true : (stryCov_9fa48("65706", "65707"), (stryMutAct_9fa48("65708") ? nodeRow[COLUMN.STATUS] : (stryCov_9fa48("65708"), nodeRow?.[COLUMN.STATUS])) !== options.expectedStatus)))) && (stryMutAct_9fa48("65710") ? nodeRow?.status === options.expectedStatus : stryMutAct_9fa48("65709") ? true : (stryCov_9fa48("65709", "65710"), (stryMutAct_9fa48("65711") ? nodeRow.status : (stryCov_9fa48("65711"), nodeRow?.status)) !== options.expectedStatus)))) {
            if (stryMutAct_9fa48("65712")) {
              {}
            } else {
              stryCov_9fa48("65712");
              return stryMutAct_9fa48("65713") ? true : (stryCov_9fa48("65713"), false);
            }
          }
          if (stryMutAct_9fa48("65716") ? typeof options.expectedConnectionState === TYPEOF.STRING && nodeRow?.[COLUMN.CONNECTION_STATE] !== options.expectedConnectionState || nodeRow?.connection_state !== options.expectedConnectionState : stryMutAct_9fa48("65715") ? false : stryMutAct_9fa48("65714") ? true : (stryCov_9fa48("65714", "65715", "65716"), (stryMutAct_9fa48("65718") ? typeof options.expectedConnectionState === TYPEOF.STRING || nodeRow?.[COLUMN.CONNECTION_STATE] !== options.expectedConnectionState : stryMutAct_9fa48("65717") ? true : (stryCov_9fa48("65717", "65718"), (stryMutAct_9fa48("65720") ? typeof options.expectedConnectionState !== TYPEOF.STRING : stryMutAct_9fa48("65719") ? true : (stryCov_9fa48("65719", "65720"), typeof options.expectedConnectionState === TYPEOF.STRING)) && (stryMutAct_9fa48("65722") ? nodeRow?.[COLUMN.CONNECTION_STATE] === options.expectedConnectionState : stryMutAct_9fa48("65721") ? true : (stryCov_9fa48("65721", "65722"), (stryMutAct_9fa48("65723") ? nodeRow[COLUMN.CONNECTION_STATE] : (stryCov_9fa48("65723"), nodeRow?.[COLUMN.CONNECTION_STATE])) !== options.expectedConnectionState)))) && (stryMutAct_9fa48("65725") ? nodeRow?.connection_state === options.expectedConnectionState : stryMutAct_9fa48("65724") ? true : (stryCov_9fa48("65724", "65725"), (stryMutAct_9fa48("65726") ? nodeRow.connection_state : (stryCov_9fa48("65726"), nodeRow?.connection_state)) !== options.expectedConnectionState)))) {
            if (stryMutAct_9fa48("65727")) {
              {}
            } else {
              stryCov_9fa48("65727");
              return stryMutAct_9fa48("65728") ? true : (stryCov_9fa48("65728"), false);
            }
          }
          if (stryMutAct_9fa48("65731") ? options.expectedReadyLeaseCleared !== true : stryMutAct_9fa48("65730") ? false : stryMutAct_9fa48("65729") ? true : (stryCov_9fa48("65729", "65730", "65731"), options.expectedReadyLeaseCleared === (stryMutAct_9fa48("65732") ? false : (stryCov_9fa48("65732"), true)))) {
            if (stryMutAct_9fa48("65733")) {
              {}
            } else {
              stryCov_9fa48("65733");
              const readyLeaseExpiresAt = stryMutAct_9fa48("65734") ? nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT] && nodeRow?.ready_lease_expires_at : (stryCov_9fa48("65734"), (stryMutAct_9fa48("65735") ? nodeRow[COLUMN.READY_LEASE_EXPIRES_AT] : (stryCov_9fa48("65735"), nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT])) ?? (stryMutAct_9fa48("65736") ? nodeRow.ready_lease_expires_at : (stryCov_9fa48("65736"), nodeRow?.ready_lease_expires_at)));
              if (stryMutAct_9fa48("65739") ? readyLeaseExpiresAt !== null || readyLeaseExpiresAt !== undefined : stryMutAct_9fa48("65738") ? false : stryMutAct_9fa48("65737") ? true : (stryCov_9fa48("65737", "65738", "65739"), (stryMutAct_9fa48("65741") ? readyLeaseExpiresAt === null : stryMutAct_9fa48("65740") ? true : (stryCov_9fa48("65740", "65741"), readyLeaseExpiresAt !== null)) && (stryMutAct_9fa48("65743") ? readyLeaseExpiresAt === undefined : stryMutAct_9fa48("65742") ? true : (stryCov_9fa48("65742", "65743"), readyLeaseExpiresAt !== undefined)))) {
                if (stryMutAct_9fa48("65744")) {
                  {}
                } else {
                  stryCov_9fa48("65744");
                  return stryMutAct_9fa48("65745") ? true : (stryCov_9fa48("65745"), false);
                }
              }
            }
          }
          return stryMutAct_9fa48("65746") ? false : (stryCov_9fa48("65746"), true);
        }
      } catch (_error) {
        if (stryMutAct_9fa48("65747")) {
          {}
        } else {
          stryCov_9fa48("65747");
          return stryMutAct_9fa48("65748") ? true : (stryCov_9fa48("65748"), false);
        }
      }
    }
  } /**
    * Resolve the shared authoritative control-plane view.
    * @return {AuthoritativeControlPlaneView|null}
    * @private
    */
  getAuthoritativeControlPlaneView() {
    if (stryMutAct_9fa48("65749")) {
      {}
    } else {
      stryCov_9fa48("65749");
      if (stryMutAct_9fa48("65751") ? false : stryMutAct_9fa48("65750") ? true : (stryCov_9fa48("65750", "65751"), this.authoritativeControlPlaneView)) {
        if (stryMutAct_9fa48("65752")) {
          {}
        } else {
          stryCov_9fa48("65752");
          return this.authoritativeControlPlaneView;
        }
      }
      if (stryMutAct_9fa48("65755") ? false : stryMutAct_9fa48("65754") ? true : stryMutAct_9fa48("65753") ? this.cdcIntegrationService : (stryCov_9fa48("65753", "65754", "65755"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("65756")) {
          {}
        } else {
          stryCov_9fa48("65756");
          return null;
        }
      }
      this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView(stryMutAct_9fa48("65757") ? {} : (stryCov_9fa48("65757"), {
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        messageRouter: stryMutAct_9fa48("65760") ? this.messageRouter && null : stryMutAct_9fa48("65759") ? false : stryMutAct_9fa48("65758") ? true : (stryCov_9fa48("65758", "65759", "65760"), this.messageRouter || null),
        now: this.now,
        queryTimeoutMs: this.reporterVisibilityQueryTimeoutMs
      }));
      return this.authoritativeControlPlaneView;
    }
  } /**
    * Resolve the canonical system-table gateway for heartbeat writes.
    * @return {Object}
    * @private
    */
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("65761")) {
      {}
    } else {
      stryCov_9fa48("65761");
      return assertCritical(this.controlPlaneSystemTableGateway, HEARTBEAT_SERVICE_LITERAL.HEARTBEATSERVICE_REQUIRES_CONTROLPLANESYSTEMTABLEGATEWAY);
    }
  } /**
    * Apply the canonical guarded disconnect for a node whose ready lease expired.
    * @param {Object} node - Observed node snapshot.
    * @param {number} now - Current timestamp.
    * @return {Promise<Object>} CDC mutation result.
    */
  async disconnectNodeDueToLeaseExpiry(node, now) {
    if (stryMutAct_9fa48("65762")) {
      {}
    } else {
      stryCov_9fa48("65762");
      const whereClause = stryMutAct_9fa48("65763") ? {} : (stryCov_9fa48("65763"), {
        node_id: node.node_id,
        ready_lease_expires_at: node.ready_lease_expires_at,
        last_heartbeat: stryMutAct_9fa48("65766") ? node.last_heartbeat && now : stryMutAct_9fa48("65765") ? false : stryMutAct_9fa48("65764") ? true : (stryCov_9fa48("65764", "65765", "65766"), node.last_heartbeat || now)
      });
      try {
        if (stryMutAct_9fa48("65767")) {
          {}
        } else {
          stryCov_9fa48("65767");
          return await this.getControlPlaneSystemTableGateway().updateSystemTableRow(SYSTEM_TABLE_NAME.NODES, whereClause, stryMutAct_9fa48("65768") ? {} : (stryCov_9fa48("65768"), {
            connection_state: STATE.DISCONNECTED,
            ready_lease_expires_at: null
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("65769")) {
          {}
        } else {
          stryCov_9fa48("65769");
          this.logger.error(HEARTBEAT_LOG_MSG.LEASE_EXPIRY_DISCONNECT_FAILED, stryMutAct_9fa48("65770") ? {} : (stryCov_9fa48("65770"), {
            nodeId: node.node_id,
            error: error.message
          }));
          throw error;
        }
      }
    }
  } /**
    * Build node endpoint row payload for node_endpoints upsert.
    * @param {Object|null} existingEp
    * @param {number} now
    * @return {Object}
    * @private
    */
  buildEndpointRow(existingEp, now) {
    if (stryMutAct_9fa48("65771")) {
      {}
    } else {
      stryCov_9fa48("65771");
      return stryMutAct_9fa48("65772") ? {} : (stryCov_9fa48("65772"), {
        [COLUMN.ENDPOINT_ID]: stryMutAct_9fa48("65773") ? `` : (stryCov_9fa48("65773"), `${ENDPOINT_ID_PREFIX}${this.nodeId}${ENDPOINT_ID_SUFFIX}`),
        [COLUMN.NODE_ID]: this.nodeId,
        [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
        [COLUMN.ADDRESS]: stryMutAct_9fa48("65776") ? this.advertisedNodeWsAddress && this.nodeAddress : stryMutAct_9fa48("65775") ? false : stryMutAct_9fa48("65774") ? true : (stryCov_9fa48("65774", "65775", "65776"), this.advertisedNodeWsAddress || this.nodeAddress),
        [COLUMN.PRIORITY]: NUM.ZERO,
        [COLUMN.METADATA]: stryMutAct_9fa48("65779") ? existingEp?.[COLUMN.METADATA] && JSON.stringify({}) : stryMutAct_9fa48("65778") ? false : stryMutAct_9fa48("65777") ? true : (stryCov_9fa48("65777", "65778", "65779"), (stryMutAct_9fa48("65780") ? existingEp[COLUMN.METADATA] : (stryCov_9fa48("65780"), existingEp?.[COLUMN.METADATA])) || JSON.stringify({})),
        [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
        [COLUMN.CREATED_AT]: stryMutAct_9fa48("65783") ? existingEp?.[COLUMN.CREATED_AT] && now : stryMutAct_9fa48("65782") ? false : stryMutAct_9fa48("65781") ? true : (stryCov_9fa48("65781", "65782", "65783"), (stryMutAct_9fa48("65784") ? existingEp[COLUMN.CREATED_AT] : (stryCov_9fa48("65784"), existingEp?.[COLUMN.CREATED_AT])) || now),
        [COLUMN.UPDATED_AT]: now
      });
    }
  } /**
    * Build signature used to detect materially-changed endpoint rows.
    * @param {Object} endpointRow
    * @return {string}
    * @private
    */
  buildEndpointUpsertSignature(endpointRow) {
    if (stryMutAct_9fa48("65785")) {
      {}
    } else {
      stryCov_9fa48("65785");
      return JSON.stringify(stryMutAct_9fa48("65786") ? {} : (stryCov_9fa48("65786"), {
        endpointId: endpointRow[COLUMN.ENDPOINT_ID],
        nodeId: endpointRow[COLUMN.NODE_ID],
        transportType: endpointRow[COLUMN.TRANSPORT_TYPE],
        address: endpointRow[COLUMN.ADDRESS],
        priority: endpointRow[COLUMN.PRIORITY],
        metadata: endpointRow[COLUMN.METADATA],
        status: endpointRow[COLUMN.STATUS]
      }));
    }
  }
  buildNodeHeartbeatWriteOptions(queryTimeoutMs) {
    if (stryMutAct_9fa48("65787")) {
      {}
    } else {
      stryCov_9fa48("65787");
      return stryMutAct_9fa48("65788") ? {} : (stryCov_9fa48("65788"), {
        ...this.buildSharedHeartbeatWriteOptions(queryTimeoutMs),
        coalescingKey: stryMutAct_9fa48("65789") ? `` : (stryCov_9fa48("65789"), `heartbeat:nodes:${this.nodeId}`),
        mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING
      });
    }
  }
  buildEndpointHeartbeatWriteOptions(endpointId, queryTimeoutMs) {
    if (stryMutAct_9fa48("65790")) {
      {}
    } else {
      stryCov_9fa48("65790");
      return stryMutAct_9fa48("65791") ? {} : (stryCov_9fa48("65791"), {
        ...this.buildSharedHeartbeatWriteOptions(queryTimeoutMs),
        coalescingKey: stryMutAct_9fa48("65792") ? `` : (stryCov_9fa48("65792"), `heartbeat:endpoint:${endpointId}`),
        mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING
      });
    }
  }
  buildSharedHeartbeatWriteOptions(queryTimeoutMs) {
    if (stryMutAct_9fa48("65793")) {
      {}
    } else {
      stryCov_9fa48("65793");
      return stryMutAct_9fa48("65794") ? {} : (stryCov_9fa48("65794"), {
        allowCoalescing: stryMutAct_9fa48("65795") ? false : (stryCov_9fa48("65795"), true),
        allowPressureDefer: stryMutAct_9fa48("65796") ? false : (stryCov_9fa48("65796"), true),
        deliveryPriority: HEARTBEAT_SERVICE_LITERAL.BACKGROUND,
        pressureRetryAfterMs: this.heartbeatIntervalMs,
        // Heartbeats are liveness signals and must not wait for local cache
        // convergence on the write path.
        queryTimeoutMs,
        skipCacheWait: stryMutAct_9fa48("65797") ? false : (stryCov_9fa48("65797"), true),
        workClass: PRESSURE_WORK_CLASS.BACKGROUND
      });
    }
  } /**
    * Build signature used to detect materially-changed node heartbeat payloads.
    * @param {Object} updateRow
    * @return {string}
    * @private
    */
  buildNodeHeartbeatStructuralSignature(updateRow) {
    if (stryMutAct_9fa48("65798")) {
      {}
    } else {
      stryCov_9fa48("65798");
      return JSON.stringify(stryMutAct_9fa48("65799") ? {} : (stryCov_9fa48("65799"), {
        nodeAddress: updateRow.node_address,
        cpuCores: updateRow.cpu_cores,
        memoryMb: updateRow.memory_mb,
        diskGb: updateRow.disk_gb,
        status: updateRow.status,
        connectionState: updateRow.connection_state,
        capabilities: updateRow.capabilities
      }));
    }
  } /**
    * Build a bucketed utilization signature so small usage jitter does not
    * force control-plane writes on every heartbeat.
    * @param {Object} updateRow
    * @return {string}
    * @private
    */
  buildNodeHeartbeatUtilizationSignature(updateRow) {
    if (stryMutAct_9fa48("65800")) {
      {}
    } else {
      stryCov_9fa48("65800");
      return JSON.stringify(stryMutAct_9fa48("65801") ? {} : (stryCov_9fa48("65801"), {
        cpuUsageBucket: this.bucketNodeHeartbeatUsagePercent(updateRow.cpu_usage_percent),
        memoryUsageBucket: this.bucketNodeHeartbeatUsagePercent(updateRow.memory_usage_percent),
        diskUsageBucket: this.bucketNodeHeartbeatUsagePercent(updateRow.disk_usage_percent)
      }));
    }
  } /**
    * Normalize one usage percent into a bounded bucket.
    * @param {*} value
    * @return {number|null}
    * @private
    */
  bucketNodeHeartbeatUsagePercent(value) {
    if (stryMutAct_9fa48("65802")) {
      {}
    } else {
      stryCov_9fa48("65802");
      const numeric = Number(value);
      if (stryMutAct_9fa48("65805") ? false : stryMutAct_9fa48("65804") ? true : stryMutAct_9fa48("65803") ? Number.isFinite(numeric) : (stryCov_9fa48("65803", "65804", "65805"), !Number.isFinite(numeric))) {
        if (stryMutAct_9fa48("65806")) {
          {}
        } else {
          stryCov_9fa48("65806");
          return null;
        }
      }
      const bucketSize = stryMutAct_9fa48("65807") ? Math.min(ONE, this.nodeMetadataUsagePercentBucketSize) : (stryCov_9fa48("65807"), Math.max(ONE, this.nodeMetadataUsagePercentBucketSize));
      return Math.floor(stryMutAct_9fa48("65808") ? numeric * bucketSize : (stryCov_9fa48("65808"), numeric / bucketSize));
    }
  } /**
    * Extract storage budget fields from a cached node row so heartbeat
    * writes and reporter payloads preserve budget across upsert paths.
    *
    * Uses the same guard pattern as
    * ReplicaDispatchService.resolveNodeStateUpdateBudgetFields to
    * include only valid, positive budget values.
    *
    * @param {Object|null} cachedRow
    * @return {Object}
    * @private
    */
  resolveHeartbeatBudgetFields(cachedRow) {
    if (stryMutAct_9fa48("65809")) {
      {}
    } else {
      stryCov_9fa48("65809");
      if (stryMutAct_9fa48("65812") ? !cachedRow && typeof cachedRow !== TYPEOF.OBJECT : stryMutAct_9fa48("65811") ? false : stryMutAct_9fa48("65810") ? true : (stryCov_9fa48("65810", "65811", "65812"), (stryMutAct_9fa48("65813") ? cachedRow : (stryCov_9fa48("65813"), !cachedRow)) || (stryMutAct_9fa48("65815") ? typeof cachedRow === TYPEOF.OBJECT : stryMutAct_9fa48("65814") ? false : (stryCov_9fa48("65814", "65815"), typeof cachedRow !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("65816")) {
          {}
        } else {
          stryCov_9fa48("65816");
          return {};
        }
      }
      const fields = {};
      const budgetBytes = Number(cachedRow[COLUMN.STORAGE_BUDGET_BYTES]);
      if (stryMutAct_9fa48("65819") ? Number.isFinite(budgetBytes) || budgetBytes > NUM.ZERO : stryMutAct_9fa48("65818") ? false : stryMutAct_9fa48("65817") ? true : (stryCov_9fa48("65817", "65818", "65819"), Number.isFinite(budgetBytes) && (stryMutAct_9fa48("65822") ? budgetBytes <= NUM.ZERO : stryMutAct_9fa48("65821") ? budgetBytes >= NUM.ZERO : stryMutAct_9fa48("65820") ? true : (stryCov_9fa48("65820", "65821", "65822"), budgetBytes > NUM.ZERO)))) {
        if (stryMutAct_9fa48("65823")) {
          {}
        } else {
          stryCov_9fa48("65823");
          fields[COLUMN.STORAGE_BUDGET_BYTES] = Math.floor(budgetBytes);
        }
      }
      const budgetSource = cachedRow[COLUMN.STORAGE_BUDGET_SOURCE];
      if (stryMutAct_9fa48("65826") ? typeof budgetSource === TYPEOF.STRING || budgetSource.length > NUM.ZERO : stryMutAct_9fa48("65825") ? false : stryMutAct_9fa48("65824") ? true : (stryCov_9fa48("65824", "65825", "65826"), (stryMutAct_9fa48("65828") ? typeof budgetSource !== TYPEOF.STRING : stryMutAct_9fa48("65827") ? true : (stryCov_9fa48("65827", "65828"), typeof budgetSource === TYPEOF.STRING)) && (stryMutAct_9fa48("65831") ? budgetSource.length <= NUM.ZERO : stryMutAct_9fa48("65830") ? budgetSource.length >= NUM.ZERO : stryMutAct_9fa48("65829") ? true : (stryCov_9fa48("65829", "65830", "65831"), budgetSource.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("65832")) {
          {}
        } else {
          stryCov_9fa48("65832");
          fields[COLUMN.STORAGE_BUDGET_SOURCE] = budgetSource;
        }
      }
      const budgetUpdatedAt = Number(cachedRow[COLUMN.STORAGE_BUDGET_UPDATED_AT]);
      if (stryMutAct_9fa48("65835") ? Number.isFinite(budgetUpdatedAt) || budgetUpdatedAt > NUM.ZERO : stryMutAct_9fa48("65834") ? false : stryMutAct_9fa48("65833") ? true : (stryCov_9fa48("65833", "65834", "65835"), Number.isFinite(budgetUpdatedAt) && (stryMutAct_9fa48("65838") ? budgetUpdatedAt <= NUM.ZERO : stryMutAct_9fa48("65837") ? budgetUpdatedAt >= NUM.ZERO : stryMutAct_9fa48("65836") ? true : (stryCov_9fa48("65836", "65837", "65838"), budgetUpdatedAt > NUM.ZERO)))) {
        if (stryMutAct_9fa48("65839")) {
          {}
        } else {
          stryCov_9fa48("65839");
          fields[COLUMN.STORAGE_BUDGET_UPDATED_AT] = Math.floor(budgetUpdatedAt);
        }
      }
      return fields;
    }
  } /**
    * Decide if nodes heartbeat row should be written on this tick.
    * @param {Object} updateRow
    * @param {number} now
    * @return {{shouldWrite: boolean, reason: string}}
    * @private
    */
  resolveNodeHeartbeatWriteDecision(updateRow, now) {
    if (stryMutAct_9fa48("65840")) {
      {}
    } else {
      stryCov_9fa48("65840");
      if (stryMutAct_9fa48("65843") ? false : stryMutAct_9fa48("65842") ? true : stryMutAct_9fa48("65841") ? Number.isFinite(this.lastNodeHeartbeatWriteAt) : (stryCov_9fa48("65841", "65842", "65843"), !Number.isFinite(this.lastNodeHeartbeatWriteAt))) {
        if (stryMutAct_9fa48("65844")) {
          {}
        } else {
          stryCov_9fa48("65844");
          return buildNodeHeartbeatWriteDecision(stryMutAct_9fa48("65845") ? false : (stryCov_9fa48("65845"), true), HEARTBEAT_SERVICE_LITERAL.NO_PREVIOUS_WRITE);
        }
      }
      const elapsedMs = stryMutAct_9fa48("65846") ? now + this.lastNodeHeartbeatWriteAt : (stryCov_9fa48("65846"), now - this.lastNodeHeartbeatWriteAt);
      if (stryMutAct_9fa48("65850") ? elapsedMs < this.nodeMetadataMaxStalenessMs : stryMutAct_9fa48("65849") ? elapsedMs > this.nodeMetadataMaxStalenessMs : stryMutAct_9fa48("65848") ? false : stryMutAct_9fa48("65847") ? true : (stryCov_9fa48("65847", "65848", "65849", "65850"), elapsedMs >= this.nodeMetadataMaxStalenessMs)) {
        if (stryMutAct_9fa48("65851")) {
          {}
        } else {
          stryCov_9fa48("65851");
          return buildNodeHeartbeatWriteDecision(stryMutAct_9fa48("65852") ? false : (stryCov_9fa48("65852"), true), HEARTBEAT_SERVICE_LITERAL.MAX_STALENESS);
        }
      }
      const structuralSignature = this.buildNodeHeartbeatStructuralSignature(updateRow);
      if (stryMutAct_9fa48("65855") ? this.lastNodeHeartbeatWriteSignature === structuralSignature : stryMutAct_9fa48("65854") ? false : stryMutAct_9fa48("65853") ? true : (stryCov_9fa48("65853", "65854", "65855"), this.lastNodeHeartbeatWriteSignature !== structuralSignature)) {
        if (stryMutAct_9fa48("65856")) {
          {}
        } else {
          stryCov_9fa48("65856");
          return buildNodeHeartbeatWriteDecision(stryMutAct_9fa48("65857") ? false : (stryCov_9fa48("65857"), true), HEARTBEAT_SERVICE_LITERAL.STRUCTURAL_CHANGED);
        }
      }
      if (stryMutAct_9fa48("65861") ? elapsedMs >= this.nodeMetadataMinUpdateIntervalMs : stryMutAct_9fa48("65860") ? elapsedMs <= this.nodeMetadataMinUpdateIntervalMs : stryMutAct_9fa48("65859") ? false : stryMutAct_9fa48("65858") ? true : (stryCov_9fa48("65858", "65859", "65860", "65861"), elapsedMs < this.nodeMetadataMinUpdateIntervalMs)) {
        if (stryMutAct_9fa48("65862")) {
          {}
        } else {
          stryCov_9fa48("65862");
          return buildNodeHeartbeatWriteDecision(stryMutAct_9fa48("65863") ? true : (stryCov_9fa48("65863"), false), HEARTBEAT_SERVICE_LITERAL.COALESCED_MIN_INTERVAL);
        }
      }
      const utilizationSignature = this.buildNodeHeartbeatUtilizationSignature(updateRow);
      if (stryMutAct_9fa48("65866") ? this.lastNodeHeartbeatUtilizationSignature === utilizationSignature : stryMutAct_9fa48("65865") ? false : stryMutAct_9fa48("65864") ? true : (stryCov_9fa48("65864", "65865", "65866"), this.lastNodeHeartbeatUtilizationSignature !== utilizationSignature)) {
        if (stryMutAct_9fa48("65867")) {
          {}
        } else {
          stryCov_9fa48("65867");
          return buildNodeHeartbeatWriteDecision(stryMutAct_9fa48("65868") ? false : (stryCov_9fa48("65868"), true), HEARTBEAT_SERVICE_LITERAL.UTILIZATION_CHANGED);
        }
      }
      return buildNodeHeartbeatWriteDecision(stryMutAct_9fa48("65869") ? true : (stryCov_9fa48("65869"), false), HEARTBEAT_SERVICE_LITERAL.COALESCED_UNCHANGED);
    }
  } /**
    * Determine if heartbeat quiet mode is currently active.
    * @return {boolean}
    * @private
    */
  isQuietModeActive() {
    if (stryMutAct_9fa48("65870")) {
      {}
    } else {
      stryCov_9fa48("65870");
      if (stryMutAct_9fa48("65873") ? false : stryMutAct_9fa48("65872") ? true : stryMutAct_9fa48("65871") ? this.quietMode : (stryCov_9fa48("65871", "65872", "65873"), !this.quietMode)) {
        if (stryMutAct_9fa48("65874")) {
          {}
        } else {
          stryCov_9fa48("65874");
          return stryMutAct_9fa48("65875") ? true : (stryCov_9fa48("65875"), false);
        }
      }
      if (stryMutAct_9fa48("65878") ? typeof this.quietMode !== HEARTBEAT_SERVICE_LITERAL.BOOLEAN : stryMutAct_9fa48("65877") ? false : stryMutAct_9fa48("65876") ? true : (stryCov_9fa48("65876", "65877", "65878"), typeof this.quietMode === HEARTBEAT_SERVICE_LITERAL.BOOLEAN)) {
        if (stryMutAct_9fa48("65879")) {
          {}
        } else {
          stryCov_9fa48("65879");
          return this.quietMode;
        }
      }
      if (stryMutAct_9fa48("65882") ? typeof this.quietMode?.isActive !== TYPEOF.FUNCTION : stryMutAct_9fa48("65881") ? false : stryMutAct_9fa48("65880") ? true : (stryCov_9fa48("65880", "65881", "65882"), typeof (stryMutAct_9fa48("65883") ? this.quietMode.isActive : (stryCov_9fa48("65883"), this.quietMode?.isActive)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("65884")) {
          {}
        } else {
          stryCov_9fa48("65884");
          return stryMutAct_9fa48("65887") ? this.quietMode.isActive() !== true : stryMutAct_9fa48("65886") ? false : stryMutAct_9fa48("65885") ? true : (stryCov_9fa48("65885", "65886", "65887"), this.quietMode.isActive() === (stryMutAct_9fa48("65888") ? false : (stryCov_9fa48("65888"), true)));
        }
      }
      if (stryMutAct_9fa48("65891") ? this.quietMode.enabled !== false : stryMutAct_9fa48("65890") ? false : stryMutAct_9fa48("65889") ? true : (stryCov_9fa48("65889", "65890", "65891"), this.quietMode.enabled === (stryMutAct_9fa48("65892") ? true : (stryCov_9fa48("65892"), false)))) {
        if (stryMutAct_9fa48("65893")) {
          {}
        } else {
          stryCov_9fa48("65893");
          return stryMutAct_9fa48("65894") ? true : (stryCov_9fa48("65894"), false);
        }
      }
      return stryMutAct_9fa48("65897") ? this.quietMode.active !== true : stryMutAct_9fa48("65896") ? false : stryMutAct_9fa48("65895") ? true : (stryCov_9fa48("65895", "65896", "65897"), this.quietMode.active === (stryMutAct_9fa48("65898") ? false : (stryCov_9fa48("65898"), true)));
    }
  } /**
    * Record a quiet-mode suppressed write.
    * @param {string} key
    * @private
    */
  recordQuietModeSuppressedWrite(key) {
    if (stryMutAct_9fa48("65899")) {
      {}
    } else {
      stryCov_9fa48("65899");
      if (stryMutAct_9fa48("65902") ? false : stryMutAct_9fa48("65901") ? true : stryMutAct_9fa48("65900") ? Object.prototype.hasOwnProperty.call(this.quietModeSuppressedCounts, key) : (stryCov_9fa48("65900", "65901", "65902"), !Object.prototype.hasOwnProperty.call(this.quietModeSuppressedCounts, key))) {
        if (stryMutAct_9fa48("65903")) {
          {}
        } else {
          stryCov_9fa48("65903");
          this.quietModeSuppressedCounts[key] = NUM.ZERO;
        }
      }
      stryMutAct_9fa48("65904") ? this.quietModeSuppressedCounts[key] -= ONE : (stryCov_9fa48("65904"), this.quietModeSuppressedCounts[key] += ONE);
    }
  } /**
    * Record a quiet-mode safety bypass reason.
    * @param {string} reason
    * @private
    */
  recordQuietModeBypassReason(reason) {
    if (stryMutAct_9fa48("65905")) {
      {}
    } else {
      stryCov_9fa48("65905");
      const normalizedReason = String(stryMutAct_9fa48("65908") ? reason && 'unknown' : stryMutAct_9fa48("65907") ? false : stryMutAct_9fa48("65906") ? true : (stryCov_9fa48("65906", "65907", "65908"), reason || (stryMutAct_9fa48("65909") ? "" : (stryCov_9fa48("65909"), 'unknown'))));
      if (stryMutAct_9fa48("65912") ? false : stryMutAct_9fa48("65911") ? true : stryMutAct_9fa48("65910") ? Object.prototype.hasOwnProperty.call(this.quietModeBypassReasonHistogram, normalizedReason) : (stryCov_9fa48("65910", "65911", "65912"), !Object.prototype.hasOwnProperty.call(this.quietModeBypassReasonHistogram, normalizedReason))) {
        if (stryMutAct_9fa48("65913")) {
          {}
        } else {
          stryCov_9fa48("65913");
          this.quietModeBypassReasonHistogram[normalizedReason] = NUM.ZERO;
        }
      }
      stryMutAct_9fa48("65914") ? this.quietModeBypassReasonHistogram[normalizedReason] -= ONE : (stryCov_9fa48("65914"), this.quietModeBypassReasonHistogram[normalizedReason] += ONE);
    }
  } /**
    * Get quiet-mode bypass reason histogram snapshot.
    * @return {Object}
    */
  getQuietModeBypassReasonHistogram() {
    if (stryMutAct_9fa48("65915")) {
      {}
    } else {
      stryCov_9fa48("65915");
      return stryMutAct_9fa48("65916") ? {} : (stryCov_9fa48("65916"), {
        ...this.quietModeBypassReasonHistogram
      });
    }
  } /**
    * Determine whether endpoint row should be upserted on this heartbeat.
    * @param {Object} endpointRow
    * @param {number} now
    * @return {boolean}
    * @private
    */
  shouldUpsertEndpointRow(endpointRow, now) {
    if (stryMutAct_9fa48("65917")) {
      {}
    } else {
      stryCov_9fa48("65917");
      const signature = this.buildEndpointUpsertSignature(endpointRow);
      if (stryMutAct_9fa48("65920") ? this.lastEndpointUpsertSignature === signature : stryMutAct_9fa48("65919") ? false : stryMutAct_9fa48("65918") ? true : (stryCov_9fa48("65918", "65919", "65920"), this.lastEndpointUpsertSignature !== signature)) {
        if (stryMutAct_9fa48("65921")) {
          {}
        } else {
          stryCov_9fa48("65921");
          return stryMutAct_9fa48("65922") ? false : (stryCov_9fa48("65922"), true);
        }
      } // Keep eventual consistency safety refresh for long-running processes.
      if (stryMutAct_9fa48("65925") ? false : stryMutAct_9fa48("65924") ? true : stryMutAct_9fa48("65923") ? Number.isFinite(this.lastEndpointUpsertAt) : (stryCov_9fa48("65923", "65924", "65925"), !Number.isFinite(this.lastEndpointUpsertAt))) {
        if (stryMutAct_9fa48("65926")) {
          {}
        } else {
          stryCov_9fa48("65926");
          return stryMutAct_9fa48("65927") ? false : (stryCov_9fa48("65927"), true);
        }
      }
      if (stryMutAct_9fa48("65931") ? now - this.lastEndpointUpsertAt < this.endpointRefreshIntervalMs : stryMutAct_9fa48("65930") ? now - this.lastEndpointUpsertAt > this.endpointRefreshIntervalMs : stryMutAct_9fa48("65929") ? false : stryMutAct_9fa48("65928") ? true : (stryCov_9fa48("65928", "65929", "65930", "65931"), (stryMutAct_9fa48("65932") ? now + this.lastEndpointUpsertAt : (stryCov_9fa48("65932"), now - this.lastEndpointUpsertAt)) >= this.endpointRefreshIntervalMs)) {
        if (stryMutAct_9fa48("65933")) {
          {}
        } else {
          stryCov_9fa48("65933");
          return stryMutAct_9fa48("65934") ? false : (stryCov_9fa48("65934"), true);
        }
      }
      return stryMutAct_9fa48("65935") ? true : (stryCov_9fa48("65935"), false);
    }
  } /**
    * Track memory usage trend and emit warning events on sustained growth.
    * @param {number} memoryUsagePercent
    * @param {number} timestamp
    */
  recordMemoryTrendSample(memoryUsagePercent, timestamp) {
    if (stryMutAct_9fa48("65936")) {
      {}
    } else {
      stryCov_9fa48("65936");
      if (stryMutAct_9fa48("65939") ? !Number.isFinite(memoryUsagePercent) && !Number.isFinite(timestamp) : stryMutAct_9fa48("65938") ? false : stryMutAct_9fa48("65937") ? true : (stryCov_9fa48("65937", "65938", "65939"), (stryMutAct_9fa48("65940") ? Number.isFinite(memoryUsagePercent) : (stryCov_9fa48("65940"), !Number.isFinite(memoryUsagePercent))) || (stryMutAct_9fa48("65941") ? Number.isFinite(timestamp) : (stryCov_9fa48("65941"), !Number.isFinite(timestamp))))) {
        if (stryMutAct_9fa48("65942")) {
          {}
        } else {
          stryCov_9fa48("65942");
          return;
        }
      }
      this.memoryTrendSamples.push(stryMutAct_9fa48("65943") ? {} : (stryCov_9fa48("65943"), {
        timestamp,
        usagePercent: Number(memoryUsagePercent)
      }));
      const cutoff = stryMutAct_9fa48("65944") ? timestamp + this.memoryTrendWindowMs : (stryCov_9fa48("65944"), timestamp - this.memoryTrendWindowMs);
      this.memoryTrendSamples = stryMutAct_9fa48("65945") ? this.memoryTrendSamples : (stryCov_9fa48("65945"), this.memoryTrendSamples.filter(stryMutAct_9fa48("65946") ? () => undefined : (stryCov_9fa48("65946"), sample => stryMutAct_9fa48("65950") ? sample.timestamp < cutoff : stryMutAct_9fa48("65949") ? sample.timestamp > cutoff : stryMutAct_9fa48("65948") ? false : stryMutAct_9fa48("65947") ? true : (stryCov_9fa48("65947", "65948", "65949", "65950"), sample.timestamp >= cutoff))));
      if (stryMutAct_9fa48("65954") ? this.memoryTrendSamples.length >= this.memoryTrendMinSamples : stryMutAct_9fa48("65953") ? this.memoryTrendSamples.length <= this.memoryTrendMinSamples : stryMutAct_9fa48("65952") ? false : stryMutAct_9fa48("65951") ? true : (stryCov_9fa48("65951", "65952", "65953", "65954"), this.memoryTrendSamples.length < this.memoryTrendMinSamples)) {
        if (stryMutAct_9fa48("65955")) {
          {}
        } else {
          stryCov_9fa48("65955");
          return;
        }
      }
      const slopePercentPerMin = calculateUsageSlopePerMinute(this.memoryTrendSamples);
      const currentUsagePercent = this.memoryTrendSamples[stryMutAct_9fa48("65956") ? this.memoryTrendSamples.length + ONE : (stryCov_9fa48("65956"), this.memoryTrendSamples.length - ONE)].usagePercent;
      if (stryMutAct_9fa48("65960") ? currentUsagePercent >= this.memoryTrendWarningPercent : stryMutAct_9fa48("65959") ? currentUsagePercent <= this.memoryTrendWarningPercent : stryMutAct_9fa48("65958") ? false : stryMutAct_9fa48("65957") ? true : (stryCov_9fa48("65957", "65958", "65959", "65960"), currentUsagePercent < this.memoryTrendWarningPercent)) {
        if (stryMutAct_9fa48("65961")) {
          {}
        } else {
          stryCov_9fa48("65961");
          return;
        }
      }
      if (stryMutAct_9fa48("65965") ? slopePercentPerMin >= this.memoryTrendSlopePercentPerMinThreshold : stryMutAct_9fa48("65964") ? slopePercentPerMin <= this.memoryTrendSlopePercentPerMinThreshold : stryMutAct_9fa48("65963") ? false : stryMutAct_9fa48("65962") ? true : (stryCov_9fa48("65962", "65963", "65964", "65965"), slopePercentPerMin < this.memoryTrendSlopePercentPerMinThreshold)) {
        if (stryMutAct_9fa48("65966")) {
          {}
        } else {
          stryCov_9fa48("65966");
          return;
        }
      }
      if (stryMutAct_9fa48("65969") ? this.lastMemoryTrendWarningAt > ZERO || timestamp - this.lastMemoryTrendWarningAt < this.memoryTrendWarningCooldownMs : stryMutAct_9fa48("65968") ? false : stryMutAct_9fa48("65967") ? true : (stryCov_9fa48("65967", "65968", "65969"), (stryMutAct_9fa48("65972") ? this.lastMemoryTrendWarningAt <= ZERO : stryMutAct_9fa48("65971") ? this.lastMemoryTrendWarningAt >= ZERO : stryMutAct_9fa48("65970") ? true : (stryCov_9fa48("65970", "65971", "65972"), this.lastMemoryTrendWarningAt > ZERO)) && (stryMutAct_9fa48("65975") ? timestamp - this.lastMemoryTrendWarningAt >= this.memoryTrendWarningCooldownMs : stryMutAct_9fa48("65974") ? timestamp - this.lastMemoryTrendWarningAt <= this.memoryTrendWarningCooldownMs : stryMutAct_9fa48("65973") ? true : (stryCov_9fa48("65973", "65974", "65975"), (stryMutAct_9fa48("65976") ? timestamp + this.lastMemoryTrendWarningAt : (stryCov_9fa48("65976"), timestamp - this.lastMemoryTrendWarningAt)) < this.memoryTrendWarningCooldownMs)))) {
        if (stryMutAct_9fa48("65977")) {
          {}
        } else {
          stryCov_9fa48("65977");
          return;
        }
      }
      this.lastMemoryTrendWarningAt = timestamp;
      const warning = stryMutAct_9fa48("65978") ? {} : (stryCov_9fa48("65978"), {
        nodeId: this.nodeId,
        memoryUsagePercent: currentUsagePercent,
        slopePercentPerMin,
        sampleCount: this.memoryTrendSamples.length,
        windowMs: this.memoryTrendWindowMs,
        thresholdSlopePercentPerMin: this.memoryTrendSlopePercentPerMinThreshold,
        thresholdUsagePercent: this.memoryTrendWarningPercent
      });
      this.logger.warn(HEARTBEAT_LOG_MSG.MEMORY_TREND_WARNING, warning);
      this.emit(HEARTBEAT_EVENT.MEMORY_TREND_WARNING, warning);
    }
  } /**
    * Record a heartbeat failure.
    * @param {string} stage - Failure stage.
    * @param {string} errorMessage - Error message.
    * @private
    */
  recordFailure(stage, errorMessage) {
    if (stryMutAct_9fa48("65979")) {
      {}
    } else {
      stryCov_9fa48("65979");
      stryMutAct_9fa48("65980") ? this.heartbeatConsecutiveFailures-- : (stryCov_9fa48("65980"), this.heartbeatConsecutiveFailures++);
      this.heartbeatPublicationDiagnostics.lastFailureAt = normalizeHeartbeatPublicationTimestamp(this.now());
      this.heartbeatPublicationDiagnostics.lastFailureStage = stage;
      this.heartbeatPublicationDiagnostics.lastFailureReason = errorMessage;
      this.heartbeatPublicationDiagnostics.consecutiveFailures = this.heartbeatConsecutiveFailures;
      const logData = stryMutAct_9fa48("65981") ? {} : (stryCov_9fa48("65981"), {
        nodeId: this.nodeId,
        stage,
        error: errorMessage,
        consecutiveFailures: this.heartbeatConsecutiveFailures
      });
      if (stryMutAct_9fa48("65985") ? this.heartbeatConsecutiveFailures < HEARTBEAT_FAILURE_WARN_THRESHOLD : stryMutAct_9fa48("65984") ? this.heartbeatConsecutiveFailures > HEARTBEAT_FAILURE_WARN_THRESHOLD : stryMutAct_9fa48("65983") ? false : stryMutAct_9fa48("65982") ? true : (stryCov_9fa48("65982", "65983", "65984", "65985"), this.heartbeatConsecutiveFailures >= HEARTBEAT_FAILURE_WARN_THRESHOLD)) {
        if (stryMutAct_9fa48("65986")) {
          {}
        } else {
          stryCov_9fa48("65986");
          this.logger.warn(HEARTBEAT_LOG_MSG.HEARTBEAT_CONSECUTIVE_FAILURES, logData);
        }
      } else {
        if (stryMutAct_9fa48("65987")) {
          {}
        } else {
          stryCov_9fa48("65987");
          this.logger.debug(HEARTBEAT_LOG_MSG.HEARTBEAT_FAILED, logData);
        }
      }
      this.emit(HEARTBEAT_EVENT.HEARTBEAT_FAILED, stryMutAct_9fa48("65988") ? {} : (stryCov_9fa48("65988"), {
        nodeId: this.nodeId,
        stage,
        error: errorMessage,
        consecutiveFailures: this.heartbeatConsecutiveFailures
      }));
    }
  } /**
    * Get the current heartbeat count.
    * @return {number} Number of successful heartbeats.
    */
  getHeartbeatCount() {
    if (stryMutAct_9fa48("65989")) {
      {}
    } else {
      stryCov_9fa48("65989");
      return this.heartbeatCount;
    }
  } /**
    * Get the current state.
    * @return {string} Current lifecycle state.
    */
  getState() {
    if (stryMutAct_9fa48("65990")) {
      {}
    } else {
      stryCov_9fa48("65990");
      return this.state;
    }
  } /**
    * Return the latest heartbeat publication diagnostics.
    * @return {Object}
    */
  getHeartbeatPublicationDiagnostics() {
    if (stryMutAct_9fa48("65991")) {
      {}
    } else {
      stryCov_9fa48("65991");
      return Object.freeze(stryMutAct_9fa48("65992") ? {} : (stryCov_9fa48("65992"), {
        ...this.heartbeatPublicationDiagnostics
      }));
    }
  } /**
    * Mark the beginning of one heartbeat publication attempt.
    * @param {number} startedAtMs
    * @private
    */
  recordHeartbeatPublicationAttempt(startedAtMs) {
    if (stryMutAct_9fa48("65993")) {
      {}
    } else {
      stryCov_9fa48("65993");
      this.heartbeatPublicationDiagnostics.lastAttemptAt = normalizeHeartbeatPublicationTimestamp(startedAtMs);
      this.heartbeatPublicationDiagnostics.consecutiveFailures = this.heartbeatConsecutiveFailures;
    }
  } /**
    * Update publication target details without changing attempt outcome.
    * @param {Object|null} diagnostics
    * @private
    */
  recordHeartbeatPublicationTarget(diagnostics) {
    if (stryMutAct_9fa48("65994")) {
      {}
    } else {
      stryCov_9fa48("65994");
      const normalized = normalizeHeartbeatPublicationDiagnostics(diagnostics);
      const resetTarget = stryMutAct_9fa48("65997") ? normalized.publicationPath === 'cdc_update' || !normalized.targetAddress : stryMutAct_9fa48("65996") ? false : stryMutAct_9fa48("65995") ? true : (stryCov_9fa48("65995", "65996", "65997"), (stryMutAct_9fa48("65999") ? normalized.publicationPath !== 'cdc_update' : stryMutAct_9fa48("65998") ? true : (stryCov_9fa48("65998", "65999"), normalized.publicationPath === (stryMutAct_9fa48("66000") ? "" : (stryCov_9fa48("66000"), 'cdc_update')))) && (stryMutAct_9fa48("66001") ? normalized.targetAddress : (stryCov_9fa48("66001"), !normalized.targetAddress)));
      if (stryMutAct_9fa48("66003") ? false : stryMutAct_9fa48("66002") ? true : (stryCov_9fa48("66002", "66003"), normalized.publicationPath)) {
        if (stryMutAct_9fa48("66004")) {
          {}
        } else {
          stryCov_9fa48("66004");
          this.heartbeatPublicationDiagnostics.publicationPath = normalized.publicationPath;
        }
      }
      if (stryMutAct_9fa48("66006") ? false : stryMutAct_9fa48("66005") ? true : (stryCov_9fa48("66005", "66006"), resetTarget)) {
        if (stryMutAct_9fa48("66007")) {
          {}
        } else {
          stryCov_9fa48("66007");
          this.heartbeatPublicationDiagnostics.targetAddress = null;
          this.heartbeatPublicationDiagnostics.targetNodeId = null;
          this.heartbeatPublicationDiagnostics.targetServiceType = null;
          this.heartbeatPublicationDiagnostics.targetServiceId = null;
          return;
        }
      }
      if (stryMutAct_9fa48("66009") ? false : stryMutAct_9fa48("66008") ? true : (stryCov_9fa48("66008", "66009"), normalized.targetAddress)) {
        if (stryMutAct_9fa48("66010")) {
          {}
        } else {
          stryCov_9fa48("66010");
          this.heartbeatPublicationDiagnostics.targetAddress = normalized.targetAddress;
        }
      }
      if (stryMutAct_9fa48("66012") ? false : stryMutAct_9fa48("66011") ? true : (stryCov_9fa48("66011", "66012"), normalized.targetNodeId)) {
        if (stryMutAct_9fa48("66013")) {
          {}
        } else {
          stryCov_9fa48("66013");
          this.heartbeatPublicationDiagnostics.targetNodeId = normalized.targetNodeId;
        }
      }
      if (stryMutAct_9fa48("66015") ? false : stryMutAct_9fa48("66014") ? true : (stryCov_9fa48("66014", "66015"), normalized.targetServiceType)) {
        if (stryMutAct_9fa48("66016")) {
          {}
        } else {
          stryCov_9fa48("66016");
          this.heartbeatPublicationDiagnostics.targetServiceType = normalized.targetServiceType;
        }
      }
      if (stryMutAct_9fa48("66018") ? false : stryMutAct_9fa48("66017") ? true : (stryCov_9fa48("66017", "66018"), normalized.targetServiceId)) {
        if (stryMutAct_9fa48("66019")) {
          {}
        } else {
          stryCov_9fa48("66019");
          this.heartbeatPublicationDiagnostics.targetServiceId = normalized.targetServiceId;
        }
      }
    }
  }

  /**
   * Record a successful heartbeat publication target and timestamp.
   * @param {Object|null} diagnostics
   * @param {number} now
   * @private
   */
  recordHeartbeatPublicationSuccess(diagnostics, now) {
    if (stryMutAct_9fa48("66020")) {
      {}
    } else {
      stryCov_9fa48("66020");
      this.recordHeartbeatPublicationTarget(diagnostics);
      this.heartbeatPublicationDiagnostics.lastSuccessAt = normalizeHeartbeatPublicationTimestamp(now);
      this.heartbeatPublicationDiagnostics.consecutiveFailures = this.heartbeatConsecutiveFailures;
    }
  }
}
export { HeartbeatService, calculateUsageSlopePerMinute };