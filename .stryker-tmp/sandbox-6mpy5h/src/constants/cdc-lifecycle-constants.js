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
import { NUM } from './numbers.js';
import { TIME_MS } from './time.js';
import { TYPEOF } from './types.js';

// ---------------------------------------------------------------------------
// CDC Lifecycle Constants
// ---------------------------------------------------------------------------
//
// Constants for awaitable CDC confirmation, CDC event buffering,
// pipeline readiness gates, cluster readiness signals, and CDC
// pipeline observability metrics.
// ---------------------------------------------------------------------------

// --- Timeouts and capacities ---

const CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS = stryMutAct_9fa48("54379") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("54379"), TIME_MS.SECOND * NUM.FIVE);
const CDC_EVENT_BUFFER_CAPACITY = NUM.THOUSAND;
const CDC_EVENT_SLIDING_WINDOW_CAPACITY = NUM.TWO_HUNDRED_FIFTY_SIX;
const CDC_PIPELINE_READINESS_POLL_INTERVAL_MS = NUM.HUNDRED;
const CDC_PIPELINE_READINESS_TIMEOUT_MS = stryMutAct_9fa48("54380") ? TIME_MS.SECOND / NUM.THIRTY : (stryCov_9fa48("54380"), TIME_MS.SECOND * NUM.THIRTY);
const CLUSTER_READINESS_TIMEOUT_MS = stryMutAct_9fa48("54381") ? TIME_MS.SECOND / NUM.THIRTY : (stryCov_9fa48("54381"), TIME_MS.SECOND * NUM.THIRTY);

// --- Error type names ---

const CDC_CONFIRMATION_ERROR_TYPE = Object.freeze(stryMutAct_9fa48("54382") ? {} : (stryCov_9fa48("54382"), {
  TIMEOUT: stryMutAct_9fa48("54383") ? "" : (stryCov_9fa48("54383"), 'CDCConfirmationTimeoutError'),
  SHUTDOWN: stryMutAct_9fa48("54384") ? "" : (stryCov_9fa48("54384"), 'CDCConfirmationShutdownError'),
  GENERAL: stryMutAct_9fa48("54385") ? "" : (stryCov_9fa48("54385"), 'CDCConfirmationError')
}));

// --- Log messages ---

const CDC_LIFECYCLE_LOG_MSG = Object.freeze(stryMutAct_9fa48("54386") ? {} : (stryCov_9fa48("54386"), {
  EVENT_BUFFERED: stryMutAct_9fa48("54387") ? "" : (stryCov_9fa48("54387"), 'CDC event buffered while no subscribers registered'),
  EVENT_DROPPED_OVERFLOW: stryMutAct_9fa48("54388") ? "" : (stryCov_9fa48("54388"), 'CDC event dropped due to buffer overflow'),
  BUFFER_REPLAY_STARTED: stryMutAct_9fa48("54389") ? "" : (stryCov_9fa48("54389"), 'Replaying buffered CDC events to subscriber'),
  BUFFER_REPLAY_COMPLETE: stryMutAct_9fa48("54390") ? "" : (stryCov_9fa48("54390"), 'Buffered CDC event replay complete'),
  CONFIRMATION_TIMEOUT: stryMutAct_9fa48("54391") ? "" : (stryCov_9fa48("54391"), 'CDC confirmation timed out'),
  CONFIRMATION_SHUTDOWN: stryMutAct_9fa48("54392") ? "" : (stryCov_9fa48("54392"), 'CDC confirmation rejected due to shutdown'),
  PIPELINE_NOT_READY: stryMutAct_9fa48("54393") ? "" : (stryCov_9fa48("54393"), 'CDC pipeline readiness conditions not met'),
  PIPELINE_READY: stryMutAct_9fa48("54394") ? "" : (stryCov_9fa48("54394"), 'CDC pipeline readiness confirmed'),
  PIPELINE_READINESS_TIMEOUT: stryMutAct_9fa48("54395") ? "" : (stryCov_9fa48("54395"), 'CDC pipeline readiness gate timed out'),
  PIPELINE_CACHE_PROBE_FAILED: stryMutAct_9fa48("54396") ? "" : (stryCov_9fa48("54396"), 'CDC pipeline cache hydration probe failed'),
  CLUSTER_NOT_READY: stryMutAct_9fa48("54397") ? "" : (stryCov_9fa48("54397"), 'Cluster readiness conditions not met'),
  CLUSTER_READY: stryMutAct_9fa48("54398") ? "" : (stryCov_9fa48("54398"), 'Cluster readiness confirmed'),
  CLUSTER_READINESS_TIMEOUT: stryMutAct_9fa48("54399") ? "" : (stryCov_9fa48("54399"), 'Cluster readiness timed out, proceeding with available state'),
  NO_SUBSCRIBERS_NO_BUFFER: stryMutAct_9fa48("54400") ? "" : (stryCov_9fa48("54400"), 'CDC event generated with no subscribers and buffer full'),
  MESSAGE_GROUP_RESOLUTION_NULL: stryMutAct_9fa48("54401") ? "" : (stryCov_9fa48("54401"), 'CDC propagation message group resolved to null'),
  PROPAGATION_DELIVERY_FAILED: stryMutAct_9fa48("54402") ? "" : (stryCov_9fa48("54402"), 'CDC event delivery failed')
}));

// --- Metrics counter names ---

const CDC_PIPELINE_METRIC = Object.freeze(stryMutAct_9fa48("54403") ? {} : (stryCov_9fa48("54403"), {
  EVENTS_GENERATED: stryMutAct_9fa48("54404") ? "" : (stryCov_9fa48("54404"), 'eventsGenerated'),
  EVENTS_DELIVERED: stryMutAct_9fa48("54405") ? "" : (stryCov_9fa48("54405"), 'eventsDelivered'),
  EVENTS_BUFFERED: stryMutAct_9fa48("54406") ? "" : (stryCov_9fa48("54406"), 'eventsBuffered'),
  EVENTS_DROPPED: stryMutAct_9fa48("54407") ? "" : (stryCov_9fa48("54407"), 'eventsDropped'),
  DELIVERY_FAILURES: stryMutAct_9fa48("54408") ? "" : (stryCov_9fa48("54408"), 'deliveryFailures')
}));

// --- Pipeline readiness condition names ---

const CDC_PIPELINE_READINESS_CONDITION = Object.freeze(stryMutAct_9fa48("54409") ? {} : (stryCov_9fa48("54409"), {
  SUBSCRIPTIONS_ACTIVE: stryMutAct_9fa48("54410") ? "" : (stryCov_9fa48("54410"), 'subscriptionsActive'),
  PROPAGATION_LEADER: stryMutAct_9fa48("54411") ? "" : (stryCov_9fa48("54411"), 'propagationLeader'),
  PIPELINE_PROVEN: stryMutAct_9fa48("54412") ? "" : (stryCov_9fa48("54412"), 'pipelineProven')
}));
const CDC_PIPELINE_READINESS_GATE = Object.freeze(stryMutAct_9fa48("54413") ? {} : (stryCov_9fa48("54413"), {
  DEFAULT_OPTIONS: Object.freeze({}),
  EMPTY_PROPAGATED_TABLES: Object.freeze(stryMutAct_9fa48("54414") ? ["Stryker was here"] : (stryCov_9fa48("54414"), [])),
  ENTITY_ID: stryMutAct_9fa48("54415") ? "" : (stryCov_9fa48("54415"), 'cdc-pipeline'),
  SUBSYSTEM: stryMutAct_9fa48("54416") ? "" : (stryCov_9fa48("54416"), 'cdc-pipeline-readiness'),
  TIMEOUT_KIND: Object.freeze(stryMutAct_9fa48("54417") ? {} : (stryCov_9fa48("54417"), {
    NO_PROGRESS: stryMutAct_9fa48("54418") ? "" : (stryCov_9fa48("54418"), 'no_progress'),
    ABSOLUTE_DEADLINE_EXHAUSTED: stryMutAct_9fa48("54419") ? "" : (stryCov_9fa48("54419"), 'absolute_deadline_exhausted')
  }))
}));
const CDC_PIPELINE_READINESS_NOW = stryMutAct_9fa48("54420") ? () => undefined : (stryCov_9fa48("54420"), (() => {
  const CDC_PIPELINE_READINESS_NOW = () => Date.now();
  return CDC_PIPELINE_READINESS_NOW;
})());
const CDC_PIPELINE_READINESS_SLEEP = stryMutAct_9fa48("54421") ? () => undefined : (stryCov_9fa48("54421"), (() => {
  const CDC_PIPELINE_READINESS_SLEEP = delayMs => (stryMutAct_9fa48("54424") ? typeof delayMs !== TYPEOF.NUMBER : stryMutAct_9fa48("54423") ? false : stryMutAct_9fa48("54422") ? true : (stryCov_9fa48("54422", "54423", "54424"), typeof delayMs === TYPEOF.NUMBER)) ? new Promise(stryMutAct_9fa48("54425") ? () => undefined : (stryCov_9fa48("54425"), resolve => setTimeout(resolve, delayMs))) : new Promise(stryMutAct_9fa48("54426") ? () => undefined : (stryCov_9fa48("54426"), resolve => setTimeout(resolve, NUM.ZERO)));
  return CDC_PIPELINE_READINESS_SLEEP;
})());

// --- Cluster readiness condition names ---

const CLUSTER_READINESS_CONDITION = Object.freeze(stryMutAct_9fa48("54427") ? {} : (stryCov_9fa48("54427"), {
  CDC_PIPELINE_READY: stryMutAct_9fa48("54428") ? "" : (stryCov_9fa48("54428"), 'cdcPipelineReady'),
  NODES_REGISTERED: stryMutAct_9fa48("54429") ? "" : (stryCov_9fa48("54429"), 'nodesRegistered'),
  CACHE_HYDRATED: stryMutAct_9fa48("54430") ? "" : (stryCov_9fa48("54430"), 'cacheHydrated')
}));
export { CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS, CDC_CONFIRMATION_ERROR_TYPE, CDC_EVENT_BUFFER_CAPACITY, CDC_EVENT_SLIDING_WINDOW_CAPACITY, CDC_LIFECYCLE_LOG_MSG, CDC_PIPELINE_METRIC, CDC_PIPELINE_READINESS_CONDITION, CDC_PIPELINE_READINESS_GATE, CDC_PIPELINE_READINESS_NOW, CDC_PIPELINE_READINESS_POLL_INTERVAL_MS, CDC_PIPELINE_READINESS_SLEEP, CDC_PIPELINE_READINESS_TIMEOUT_MS, CLUSTER_READINESS_CONDITION, CLUSTER_READINESS_TIMEOUT_MS };