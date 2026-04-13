/**
 * Constants for LatencyMeasurementService.
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
import { NUM } from '../constants/index.js';
const LATENCY_MEASUREMENT_SUBSYSTEM = stryMutAct_9fa48("154376") ? "" : (stryCov_9fa48("154376"), 'latency-measurement');
const LATENCY_MEASUREMENT_STATE = Object.freeze(stryMutAct_9fa48("154377") ? {} : (stryCov_9fa48("154377"), {
  CREATED: stryMutAct_9fa48("154378") ? "" : (stryCov_9fa48("154378"), 'created'),
  INITIALIZED: stryMutAct_9fa48("154379") ? "" : (stryCov_9fa48("154379"), 'initialized'),
  RUNNING: stryMutAct_9fa48("154380") ? "" : (stryCov_9fa48("154380"), 'running'),
  STOPPED: stryMutAct_9fa48("154381") ? "" : (stryCov_9fa48("154381"), 'stopped')
}));
const LATENCY_MEASUREMENT_EVENT = Object.freeze(stryMutAct_9fa48("154382") ? {} : (stryCov_9fa48("154382"), {
  SAMPLE_RECORDED: stryMutAct_9fa48("154383") ? "" : (stryCov_9fa48("154383"), 'sampleRecorded'),
  SAMPLE_IGNORED: stryMutAct_9fa48("154384") ? "" : (stryCov_9fa48("154384"), 'sampleIgnored'),
  MEASUREMENT_FAILED: stryMutAct_9fa48("154385") ? "" : (stryCov_9fa48("154385"), 'measurementFailed')
}));
const LATENCY_MEASUREMENT_SAMPLE_QUALITY = Object.freeze(stryMutAct_9fa48("154386") ? {} : (stryCov_9fa48("154386"), {
  GOOD: stryMutAct_9fa48("154387") ? "" : (stryCov_9fa48("154387"), 'good'),
  RETRY: stryMutAct_9fa48("154388") ? "" : (stryCov_9fa48("154388"), 'retry')
}));
const LATENCY_MEASUREMENT_DEFAULT = Object.freeze(stryMutAct_9fa48("154389") ? {} : (stryCov_9fa48("154389"), {
  STALE_SAMPLE_AGE_MULTIPLIER: NUM.TWO,
  MIN_RTT_MS: NUM.ONE,
  MIN_SAMPLE_COUNT: NUM.ONE,
  EDGE_ID_SEPARATOR: stryMutAct_9fa48("154390") ? "" : (stryCov_9fa48("154390"), '->')
}));
const LATENCY_MEASUREMENT_LOG_MSG = Object.freeze(stryMutAct_9fa48("154391") ? {} : (stryCov_9fa48("154391"), {
  INITIALIZED: stryMutAct_9fa48("154392") ? "" : (stryCov_9fa48("154392"), 'LatencyMeasurementService initialized'),
  STARTED: stryMutAct_9fa48("154393") ? "" : (stryCov_9fa48("154393"), 'LatencyMeasurementService started'),
  STOPPED: stryMutAct_9fa48("154394") ? "" : (stryCov_9fa48("154394"), 'LatencyMeasurementService stopped'),
  SAMPLE_RECORDED: stryMutAct_9fa48("154395") ? "" : (stryCov_9fa48("154395"), 'Inter-group latency sample recorded'),
  SAMPLE_IGNORED: stryMutAct_9fa48("154396") ? "" : (stryCov_9fa48("154396"), 'Ignored inter-group latency sample'),
  MEASUREMENT_FAILED: stryMutAct_9fa48("154397") ? "" : (stryCov_9fa48("154397"), 'Latency measurement failed')
}));
const LATENCY_MEASUREMENT_ERROR_MSG = Object.freeze(stryMutAct_9fa48("154398") ? {} : (stryCov_9fa48("154398"), {
  MISSING_NODE_ID: stryMutAct_9fa48("154399") ? "" : (stryCov_9fa48("154399"), 'LatencyMeasurementService requires nodeId'),
  MISSING_MESSAGE_ROUTER: stryMutAct_9fa48("154400") ? "" : (stryCov_9fa48("154400"), 'LatencyMeasurementService requires messageRouter'),
  MISSING_CDC: stryMutAct_9fa48("154401") ? "" : (stryCov_9fa48("154401"), 'LatencyMeasurementService requires cdcIntegrationService'),
  NOT_INITIALIZED: stryMutAct_9fa48("154402") ? "" : (stryCov_9fa48("154402"), 'LatencyMeasurementService must be initialized first'),
  MISSING_SOURCE_GROUP_ID: stryMutAct_9fa48("154403") ? "" : (stryCov_9fa48("154403"), 'Latency sample requires sourceGroupId'),
  MISSING_TARGET_GROUP_ID: stryMutAct_9fa48("154404") ? "" : (stryCov_9fa48("154404"), 'Latency sample requires targetGroupId'),
  MISSING_TARGET_NODE_ID: stryMutAct_9fa48("154405") ? "" : (stryCov_9fa48("154405"), 'Latency measurement requires targetRepresentativeNodeId')
}));
const LATENCY_MEASUREMENT_REASON = Object.freeze(stryMutAct_9fa48("154406") ? {} : (stryCov_9fa48("154406"), {
  INVALID_SHAPE: stryMutAct_9fa48("154407") ? "" : (stryCov_9fa48("154407"), 'invalid_shape'),
  INVALID_RTT: stryMutAct_9fa48("154408") ? "" : (stryCov_9fa48("154408"), 'invalid_rtt'),
  STALE_SAMPLE: stryMutAct_9fa48("154409") ? "" : (stryCov_9fa48("154409"), 'stale_sample')
}));
export { LATENCY_MEASUREMENT_DEFAULT, LATENCY_MEASUREMENT_ERROR_MSG, LATENCY_MEASUREMENT_EVENT, LATENCY_MEASUREMENT_LOG_MSG, LATENCY_MEASUREMENT_REASON, LATENCY_MEASUREMENT_SAMPLE_QUALITY, LATENCY_MEASUREMENT_STATE, LATENCY_MEASUREMENT_SUBSYSTEM };