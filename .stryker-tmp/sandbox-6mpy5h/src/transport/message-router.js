/**
 * MessageRouter - Unified message routing for local and cross-node communication.
 * Routes messages through local handlers or WebSocket connections.
 * Requirements: 4.21, 4.22, 11.6, 11.7, 11.8, 11.9
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
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import WebSocket, { WebSocketServer } from 'ws';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { LoggingService } from '../logging/logging-service.js';
import { CONNECTION_STATE, OUTBOUND_DELIVERY_PRIORITY, ROUTER_ADDRESS, ROUTER_ERROR_MSG, ROUTER_LOG_MSG, ROUTER_MESSAGE_TYPE, ROUTER_VALID_ENTITY_TYPES, TRANSPORT_CONFIG_KEY, TRANSPORT_DEFAULT, TRANSPORT_ERROR_MSG, TRANSPORT_EVENT, TRANSPORT_FORMAT, TRANSPORT_METRIC, TRANSPORT_METRIC_TRIGGER, TRANSPORT_NUM, TRANSPORT_SUBSYSTEM, TRANSPORT_TYPEOF, normalizeToWebSocketAddress } from '../constants/transport.js';
import { HOST, METRICS_LOG_TAG } from '../constants/index.js';
import { isRaftPacket } from '../raft/raft-packet-utils.js';

// queueMicrotask is a global in Node.js, but ESLint doesn't know about it
const MESSAGE_ROUTER_LITERAL = Object.freeze(stryMutAct_9fa48("155225") ? {} : (stryCov_9fa48("155225"), {
  STRING_UNKNOWN: stryMutAct_9fa48("155226") ? "" : (stryCov_9fa48("155226"), "unknown"),
  STRING_SELECT: stryMutAct_9fa48("155227") ? "" : (stryCov_9fa48("155227"), "select"),
  STRING_INSERT: stryMutAct_9fa48("155228") ? "" : (stryCov_9fa48("155228"), "insert"),
  STRING_UPDATE: stryMutAct_9fa48("155229") ? "" : (stryCov_9fa48("155229"), "update"),
  STRING_DELETE: stryMutAct_9fa48("155230") ? "" : (stryCov_9fa48("155230"), "delete"),
  STRING_RAFT_APPEND_UNKNOWN: stryMutAct_9fa48("155231") ? "" : (stryCov_9fa48("155231"), "raft:append:unknown"),
  STRING_CDC: stryMutAct_9fa48("155232") ? "" : (stryCov_9fa48("155232"), "cdc"),
  STRING_CDC_BATCH: stryMutAct_9fa48("155233") ? "" : (stryCov_9fa48("155233"), "cdc_batch"),
  STRING_RAFT_APPEND_CDC_BATCH_UNKNOWN: stryMutAct_9fa48("155234") ? "" : (stryCov_9fa48("155234"), "raft:append:cdc_batch:unknown"),
  STRING_MESSAGE: stryMutAct_9fa48("155235") ? "" : (stryCov_9fa48("155235"), "message"),
  STRING_ACK: stryMutAct_9fa48("155236") ? "" : (stryCov_9fa48("155236"), "ack"),
  STRING_RAFT_APPEND_ACK: stryMutAct_9fa48("155237") ? "" : (stryCov_9fa48("155237"), "raft:append:ack"),
  STRING_APPEND: stryMutAct_9fa48("155238") ? "" : (stryCov_9fa48("155238"), "append"),
  STRING_RAFT_APPEND_HEARTBEAT: stryMutAct_9fa48("155239") ? "" : (stryCov_9fa48("155239"), "raft:append:heartbeat"),
  STRING_LATE_AFTER_TIMEOUT: stryMutAct_9fa48("155240") ? "" : (stryCov_9fa48("155240"), "late_after_timeout"),
  STRING_LATE_AFTER_NODE_FAILURE: stryMutAct_9fa48("155241") ? "" : (stryCov_9fa48("155241"), "late_after_node_failure"),
  STRING_LATE_AFTER_DEFERRED_DELIVERY: stryMutAct_9fa48("155242") ? "" : (stryCov_9fa48("155242"), "late_after_deferred_delivery"),
  STRING_LATE_AFTER_ACK_REJECTED: stryMutAct_9fa48("155243") ? "" : (stryCov_9fa48("155243"), "late_after_ack_rejected"),
  STRING_LATE_AFTER_INLINE_ACK: stryMutAct_9fa48("155244") ? "" : (stryCov_9fa48("155244"), "late_after_inline_ack"),
  STRING_LATE_AFTER_CANCELLED: stryMutAct_9fa48("155245") ? "" : (stryCov_9fa48("155245"), "late_after_cancelled"),
  STRING_LATE_AFTER_RETIRED_WAITER: stryMutAct_9fa48("155246") ? "" : (stryCov_9fa48("155246"), "late_after_retired_waiter"),
  STRING_RESULT: stryMutAct_9fa48("155247") ? "" : (stryCov_9fa48("155247"), "result"),
  STRING_QUEUEWAITMS: stryMutAct_9fa48("155248") ? "" : (stryCov_9fa48("155248"), "queueWaitMs"),
  STRING_FUNCTION: stryMutAct_9fa48("155249") ? "" : (stryCov_9fa48("155249"), "function"),
  STRING_INVALID_WSPORT_FOR_IN_PROCESS_SERVER: stryMutAct_9fa48("155250") ? "" : (stryCov_9fa48("155250"), "Invalid wsPort for in-process server"),
  STRING_EADDRINUSE: stryMutAct_9fa48("155251") ? "" : (stryCov_9fa48("155251"), "EADDRINUSE"),
  STRING_VALUE: stryMutAct_9fa48("155252") ? "" : (stryCov_9fa48("155252"), ":"),
  STRING_WEBSOCKET_CONNECTION_CLOSED_BEFORE_OPEN_FOR_NODE: stryMutAct_9fa48("155253") ? "" : (stryCov_9fa48("155253"), "WebSocket connection closed before open for node "),
  STRING_ECONNREFUSED: stryMutAct_9fa48("155254") ? "" : (stryCov_9fa48("155254"), "ECONNREFUSED"),
  STRING_REJECTING_INCOMING_CONNECTION_WHILE_EXTERNAL_ADMISSION_IS_CLOSED: stryMutAct_9fa48("155255") ? "" : (stryCov_9fa48("155255"), "Rejecting incoming connection while external admission is closed"),
  STRING_EXISTING_CONNECTION_PREFERRED: stryMutAct_9fa48("155256") ? "" : (stryCov_9fa48("155256"), "existing_connection_preferred"),
  STRING_ORPHANED: stryMutAct_9fa48("155257") ? "" : (stryCov_9fa48("155257"), "orphaned"),
  STRING_RESPONSETYPE: stryMutAct_9fa48("155258") ? "" : (stryCov_9fa48("155258"), "responseType"),
  STRING_IGNORING_STALE_CONNECTION_CLOSE_EVENT: stryMutAct_9fa48("155259") ? "" : (stryCov_9fa48("155259"), "Ignoring stale connection close event"),
  STRING_ROUTER_QUERY_TRANSPORT_NOT_READY: stryMutAct_9fa48("155260") ? "" : (stryCov_9fa48("155260"), "ROUTER_QUERY_TRANSPORT_NOT_READY"),
  STRING_OUTBOUND_QUEUE_SATURATED_FOR_NODE_DELIVERY: stryMutAct_9fa48("155261") ? "" : (stryCov_9fa48("155261"), "Outbound queue saturated for node delivery"),
  STRING_FAILED_TO_RESOLVE_NODE_CONNECTION_ADDRESS_FOR_DELIVERY_RECOVERY: stryMutAct_9fa48("155262") ? "" : (stryCov_9fa48("155262"), "Failed to resolve node connection address for delivery recovery"),
  STRING_ENOTFOUND: stryMutAct_9fa48("155263") ? "" : (stryCov_9fa48("155263"), "ENOTFOUND"),
  STRING_EAI_AGAIN: stryMutAct_9fa48("155264") ? "" : (stryCov_9fa48("155264"), "EAI_AGAIN"),
  STRING_OBSERVED_ACK_TIMEOUT_BELOW_QUARANTINE_THRESHOLD: stryMutAct_9fa48("155265") ? "" : (stryCov_9fa48("155265"), "Observed ACK timeout below quarantine threshold"),
  STRING_QUARANTINING_TARGET_CONNECTION_AFTER_ACK_TIMEOUT: stryMutAct_9fa48("155266") ? "" : (stryCov_9fa48("155266"), "Quarantining target connection after ACK timeout"),
  NUMBER_5: 5
}));
const queueMicrotaskFn = globalThis.queueMicrotask;
const ConnectionState = CONNECTION_STATE;
const RouterMessageType = ROUTER_MESSAGE_TYPE;
const IPV6_ANY_HOST = stryMutAct_9fa48("155267") ? "" : (stryCov_9fa48("155267"), '::');
const IPV6_HOST_PREFIX = stryMutAct_9fa48("155268") ? "" : (stryCov_9fa48("155268"), '[');
const IPV6_HOST_SUFFIX = stryMutAct_9fa48("155269") ? "" : (stryCov_9fa48("155269"), ']');
const WEBSOCKET_CONNECT_TIMEOUT_CONFIG_KEY = stryMutAct_9fa48("155270") ? "" : (stryCov_9fa48("155270"), 'timeout.websocketConnectMs');
const WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE = stryMutAct_9fa48("155271") ? "" : (stryCov_9fa48("155271"), 'WS_CONNECT_TIMEOUT');
const RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS = 5000;
const UNMATCHED_SERVICE_RESPONSE_WARN_INTERVAL_MS = 30000;
const RETIRED_PENDING_RESPONSE_REASON = Object.freeze(stryMutAct_9fa48("155272") ? {} : (stryCov_9fa48("155272"), {
  TIMEOUT: stryMutAct_9fa48("155273") ? "" : (stryCov_9fa48("155273"), 'timeout'),
  CANCELLED: stryMutAct_9fa48("155274") ? "" : (stryCov_9fa48("155274"), 'cancelled'),
  NODE_FAILURE: stryMutAct_9fa48("155275") ? "" : (stryCov_9fa48("155275"), 'node_failure'),
  DEFERRED_DELIVERY: stryMutAct_9fa48("155276") ? "" : (stryCov_9fa48("155276"), 'deferred_delivery'),
  ACK_REJECTED: stryMutAct_9fa48("155277") ? "" : (stryCov_9fa48("155277"), 'ack_rejected'),
  INLINE_ACK: stryMutAct_9fa48("155278") ? "" : (stryCov_9fa48("155278"), 'inline_ack_payload'),
  UNKNOWN: stryMutAct_9fa48("155279") ? "" : (stryCov_9fa48("155279"), 'unknown')
}));
const SERVICE_RESPONSE_DISPOSITION_KIND = Object.freeze(stryMutAct_9fa48("155280") ? {} : (stryCov_9fa48("155280"), {
  SETTLED: stryMutAct_9fa48("155281") ? "" : (stryCov_9fa48("155281"), 'settled'),
  ABSORBED: stryMutAct_9fa48("155282") ? "" : (stryCov_9fa48("155282"), 'absorbed_late'),
  ORPHANED: stryMutAct_9fa48("155283") ? "" : (stryCov_9fa48("155283"), 'orphaned')
}));
const ROUTER_NO_CONNECTION_ERROR_CODE = stryMutAct_9fa48("155284") ? "" : (stryCov_9fa48("155284"), 'ROUTER_NO_CONNECTION');
const ROUTER_CONNECTION_CLOSED_ERROR_CODE = stryMutAct_9fa48("155285") ? "" : (stryCov_9fa48("155285"), 'ROUTER_CONNECTION_CLOSED');
const ROUTER_MESSAGE_TIMEOUT_ERROR_CODE = stryMutAct_9fa48("155286") ? "" : (stryCov_9fa48("155286"), 'ROUTER_MESSAGE_TIMEOUT');
const QUEUE_WAIT_BUCKETS = Object.freeze(stryMutAct_9fa48("155287") ? [] : (stryCov_9fa48("155287"), [stryMutAct_9fa48("155288") ? {} : (stryCov_9fa48("155288"), {
  upperBoundMs: 1,
  label: stryMutAct_9fa48("155289") ? "" : (stryCov_9fa48("155289"), 'le_1ms')
}), stryMutAct_9fa48("155290") ? {} : (stryCov_9fa48("155290"), {
  upperBoundMs: 5,
  label: stryMutAct_9fa48("155291") ? "" : (stryCov_9fa48("155291"), 'le_5ms')
}), stryMutAct_9fa48("155292") ? {} : (stryCov_9fa48("155292"), {
  upperBoundMs: 10,
  label: stryMutAct_9fa48("155293") ? "" : (stryCov_9fa48("155293"), 'le_10ms')
}), stryMutAct_9fa48("155294") ? {} : (stryCov_9fa48("155294"), {
  upperBoundMs: 25,
  label: stryMutAct_9fa48("155295") ? "" : (stryCov_9fa48("155295"), 'le_25ms')
}), stryMutAct_9fa48("155296") ? {} : (stryCov_9fa48("155296"), {
  upperBoundMs: 50,
  label: stryMutAct_9fa48("155297") ? "" : (stryCov_9fa48("155297"), 'le_50ms')
}), stryMutAct_9fa48("155298") ? {} : (stryCov_9fa48("155298"), {
  upperBoundMs: 100,
  label: stryMutAct_9fa48("155299") ? "" : (stryCov_9fa48("155299"), 'le_100ms')
}), stryMutAct_9fa48("155300") ? {} : (stryCov_9fa48("155300"), {
  upperBoundMs: 500,
  label: stryMutAct_9fa48("155301") ? "" : (stryCov_9fa48("155301"), 'le_500ms')
}), stryMutAct_9fa48("155302") ? {} : (stryCov_9fa48("155302"), {
  upperBoundMs: 1000,
  label: stryMutAct_9fa48("155303") ? "" : (stryCov_9fa48("155303"), 'le_1000ms')
})]));
const QUEUE_WAIT_BUCKET_OVERFLOW = stryMutAct_9fa48("155304") ? "" : (stryCov_9fa48("155304"), 'gt_1000ms');
const QUERY_DATA_PLANE_MESSAGE_TYPE = stryMutAct_9fa48("155305") ? "" : (stryCov_9fa48("155305"), 'QUERY');
const OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE = stryMutAct_9fa48("155306") ? "" : (stryCov_9fa48("155306"), 'ROUTER_OUTBOUND_QUEUE_BACKPRESSURED');
const OutboundDeliveryPriority = OUTBOUND_DELIVERY_PRIORITY;
const CONNECTION_CLOSE_DISPOSITION = Object.freeze(stryMutAct_9fa48("155307") ? {} : (stryCov_9fa48("155307"), {
  SHUTDOWN: stryMutAct_9fa48("155308") ? "" : (stryCov_9fa48("155308"), 'shutdown'),
  RETIRED: stryMutAct_9fa48("155309") ? "" : (stryCov_9fa48("155309"), 'retired'),
  SELF_DISCONNECT: stryMutAct_9fa48("155310") ? "" : (stryCov_9fa48("155310"), 'self_disconnect'),
  RECONNECT: stryMutAct_9fa48("155311") ? "" : (stryCov_9fa48("155311"), 'reconnect'),
  NO_ACTION: stryMutAct_9fa48("155312") ? "" : (stryCov_9fa48("155312"), 'no_action')
}));
const RECONNECT_DISPOSITION = Object.freeze(stryMutAct_9fa48("155313") ? {} : (stryCov_9fa48("155313"), {
  RETIRE: stryMutAct_9fa48("155314") ? "" : (stryCov_9fa48("155314"), 'retire'),
  PENDING: stryMutAct_9fa48("155315") ? "" : (stryCov_9fa48("155315"), 'pending'),
  MAX_ATTEMPTS_REACHED: stryMutAct_9fa48("155316") ? "" : (stryCov_9fa48("155316"), 'max_attempts_reached'),
  SCHEDULE: stryMutAct_9fa48("155317") ? "" : (stryCov_9fa48("155317"), 'schedule')
}));
const QUERY_TRANSPORT_SELECTION = Object.freeze(stryMutAct_9fa48("155318") ? {} : (stryCov_9fa48("155318"), {
  UNAVAILABLE: stryMutAct_9fa48("155319") ? "" : (stryCov_9fa48("155319"), 'unavailable'),
  DIRECT_SERVICE: stryMutAct_9fa48("155320") ? "" : (stryCov_9fa48("155320"), 'direct_service'),
  SELECTION_SERVICE: stryMutAct_9fa48("155321") ? "" : (stryCov_9fa48("155321"), 'selection_service')
}));
const EMPTY_ROUTER_REASON = stryMutAct_9fa48("155322") ? "Stryker was here!" : (stryCov_9fa48("155322"), '');

// In-process transport for test environments. This is only enabled when explicitly
// requested via options.inProcess to avoid hidden behavior in production.
const INPROC = stryMutAct_9fa48("155323") ? globalThis.__DDB_INPROC_MESSAGE_ROUTER__ &&= {
  serversByPort: new Map() // port -> {router, nodeId}
} : (stryCov_9fa48("155323"), globalThis.__DDB_INPROC_MESSAGE_ROUTER__ ||= stryMutAct_9fa48("155324") ? {} : (stryCov_9fa48("155324"), {
  serversByPort: new Map() // port -> {router, nodeId}
}));
class InProcWebSocket extends EventEmitter {
  constructor() {
    if (stryMutAct_9fa48("155325")) {
      {}
    } else {
      stryCov_9fa48("155325");
      super();
      this.readyState = WebSocket.CONNECTING;
      this._peer = null;
    }
  }
  _setPeer(peer) {
    if (stryMutAct_9fa48("155326")) {
      {}
    } else {
      stryCov_9fa48("155326");
      this._peer = peer;
    }
  }
  _open() {
    if (stryMutAct_9fa48("155327")) {
      {}
    } else {
      stryCov_9fa48("155327");
      this.readyState = WebSocket.OPEN;
      queueMicrotaskFn(stryMutAct_9fa48("155328") ? () => undefined : (stryCov_9fa48("155328"), () => this.emit(TRANSPORT_EVENT.OPEN)));
    }
  }
  send(data) {
    if (stryMutAct_9fa48("155329")) {
      {}
    } else {
      stryCov_9fa48("155329");
      if (stryMutAct_9fa48("155332") ? this.readyState !== WebSocket.OPEN && !this._peer : stryMutAct_9fa48("155331") ? false : stryMutAct_9fa48("155330") ? true : (stryCov_9fa48("155330", "155331", "155332"), (stryMutAct_9fa48("155334") ? this.readyState === WebSocket.OPEN : stryMutAct_9fa48("155333") ? false : (stryCov_9fa48("155333", "155334"), this.readyState !== WebSocket.OPEN)) || (stryMutAct_9fa48("155335") ? this._peer : (stryCov_9fa48("155335"), !this._peer)))) {
        if (stryMutAct_9fa48("155336")) {
          {}
        } else {
          stryCov_9fa48("155336");
          return;
        }
      }
      // Deliver asynchronously to preserve ordering without recursion.
      queueMicrotaskFn(() => {
        if (stryMutAct_9fa48("155337")) {
          {}
        } else {
          stryCov_9fa48("155337");
          if (stryMutAct_9fa48("155340") ? this._peer.readyState !== WebSocket.OPEN : stryMutAct_9fa48("155339") ? false : stryMutAct_9fa48("155338") ? true : (stryCov_9fa48("155338", "155339", "155340"), this._peer.readyState === WebSocket.OPEN)) {
            if (stryMutAct_9fa48("155341")) {
              {}
            } else {
              stryCov_9fa48("155341");
              this._peer.emit(TRANSPORT_EVENT.MESSAGE, data);
            }
          }
        }
      });
    }
  }
  close() {
    if (stryMutAct_9fa48("155342")) {
      {}
    } else {
      stryCov_9fa48("155342");
      this.terminate();
    }
  }
  terminate() {
    if (stryMutAct_9fa48("155343")) {
      {}
    } else {
      stryCov_9fa48("155343");
      if (stryMutAct_9fa48("155346") ? this.readyState !== WebSocket.CLOSED : stryMutAct_9fa48("155345") ? false : stryMutAct_9fa48("155344") ? true : (stryCov_9fa48("155344", "155345", "155346"), this.readyState === WebSocket.CLOSED)) {
        if (stryMutAct_9fa48("155347")) {
          {}
        } else {
          stryCov_9fa48("155347");
          return;
        }
      }
      this.readyState = WebSocket.CLOSED;
      queueMicrotaskFn(stryMutAct_9fa48("155348") ? () => undefined : (stryCov_9fa48("155348"), () => this.emit(TRANSPORT_EVENT.CLOSE)));
      if (stryMutAct_9fa48("155351") ? this._peer || this._peer.readyState !== WebSocket.CLOSED : stryMutAct_9fa48("155350") ? false : stryMutAct_9fa48("155349") ? true : (stryCov_9fa48("155349", "155350", "155351"), this._peer && (stryMutAct_9fa48("155353") ? this._peer.readyState === WebSocket.CLOSED : stryMutAct_9fa48("155352") ? true : (stryCov_9fa48("155352", "155353"), this._peer.readyState !== WebSocket.CLOSED)))) {
        if (stryMutAct_9fa48("155354")) {
          {}
        } else {
          stryCov_9fa48("155354");
          this._peer.readyState = WebSocket.CLOSED;
          queueMicrotaskFn(stryMutAct_9fa48("155355") ? () => undefined : (stryCov_9fa48("155355"), () => this._peer.emit(TRANSPORT_EVENT.CLOSE)));
        }
      }
    }
  }
}
function createInProcWebSocketPair() {
  if (stryMutAct_9fa48("155356")) {
    {}
  } else {
    stryCov_9fa48("155356");
    const a = new InProcWebSocket();
    const b = new InProcWebSocket();
    a._setPeer(b);
    b._setPeer(a);
    a._open();
    b._open();
    return stryMutAct_9fa48("155357") ? {} : (stryCov_9fa48("155357"), {
      a,
      b
    });
  }
}
function normalizeIdentifier(value) {
  if (stryMutAct_9fa48("155358")) {
    {}
  } else {
    stryCov_9fa48("155358");
    if (stryMutAct_9fa48("155361") ? value === null && value === undefined : stryMutAct_9fa48("155360") ? false : stryMutAct_9fa48("155359") ? true : (stryCov_9fa48("155359", "155360", "155361"), (stryMutAct_9fa48("155363") ? value !== null : stryMutAct_9fa48("155362") ? false : (stryCov_9fa48("155362", "155363"), value === null)) || (stryMutAct_9fa48("155365") ? value !== undefined : stryMutAct_9fa48("155364") ? false : (stryCov_9fa48("155364", "155365"), value === undefined)))) {
      if (stryMutAct_9fa48("155366")) {
        {}
      } else {
        stryCov_9fa48("155366");
        return null;
      }
    }
    const normalized = stryMutAct_9fa48("155367") ? String(value) : (stryCov_9fa48("155367"), String(value).trim());
    return (stryMutAct_9fa48("155371") ? normalized.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155370") ? normalized.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155369") ? false : stryMutAct_9fa48("155368") ? true : (stryCov_9fa48("155368", "155369", "155370", "155371"), normalized.length > TRANSPORT_NUM.ZERO)) ? normalized : null;
  }
}
function createQueueWaitHistogram() {
  if (stryMutAct_9fa48("155372")) {
    {}
  } else {
    stryCov_9fa48("155372");
    const histogram = {};
    for (const bucket of QUEUE_WAIT_BUCKETS) {
      if (stryMutAct_9fa48("155373")) {
        {}
      } else {
        stryCov_9fa48("155373");
        histogram[bucket.label] = TRANSPORT_NUM.ZERO;
      }
    }
    histogram[QUEUE_WAIT_BUCKET_OVERFLOW] = TRANSPORT_NUM.ZERO;
    return histogram;
  }
}
function resolveQueueWaitBucket(durationMs) {
  if (stryMutAct_9fa48("155374")) {
    {}
  } else {
    stryCov_9fa48("155374");
    const normalized = Number.isFinite(durationMs) ? stryMutAct_9fa48("155375") ? Math.min(TRANSPORT_NUM.ZERO, Math.floor(durationMs)) : (stryCov_9fa48("155375"), Math.max(TRANSPORT_NUM.ZERO, Math.floor(durationMs))) : TRANSPORT_NUM.ZERO;
    for (const bucket of QUEUE_WAIT_BUCKETS) {
      if (stryMutAct_9fa48("155376")) {
        {}
      } else {
        stryCov_9fa48("155376");
        if (stryMutAct_9fa48("155380") ? normalized > bucket.upperBoundMs : stryMutAct_9fa48("155379") ? normalized < bucket.upperBoundMs : stryMutAct_9fa48("155378") ? false : stryMutAct_9fa48("155377") ? true : (stryCov_9fa48("155377", "155378", "155379", "155380"), normalized <= bucket.upperBoundMs)) {
          if (stryMutAct_9fa48("155381")) {
            {}
          } else {
            stryCov_9fa48("155381");
            return bucket.label;
          }
        }
      }
    }
    return QUEUE_WAIT_BUCKET_OVERFLOW;
  }
}
function recordQueueWaitDuration(queue, durationMs) {
  if (stryMutAct_9fa48("155382")) {
    {}
  } else {
    stryCov_9fa48("155382");
    if (stryMutAct_9fa48("155385") ? false : stryMutAct_9fa48("155384") ? true : stryMutAct_9fa48("155383") ? queue : (stryCov_9fa48("155383", "155384", "155385"), !queue)) {
      if (stryMutAct_9fa48("155386")) {
        {}
      } else {
        stryCov_9fa48("155386");
        return;
      }
    }
    const normalized = Number.isFinite(durationMs) ? stryMutAct_9fa48("155387") ? Math.min(TRANSPORT_NUM.ZERO, Math.floor(durationMs)) : (stryCov_9fa48("155387"), Math.max(TRANSPORT_NUM.ZERO, Math.floor(durationMs))) : TRANSPORT_NUM.ZERO;
    queue.queueWaitSampleCount = stryMutAct_9fa48("155388") ? (queue.queueWaitSampleCount || TRANSPORT_NUM.ZERO) - TRANSPORT_NUM.ONE : (stryCov_9fa48("155388"), (stryMutAct_9fa48("155391") ? queue.queueWaitSampleCount && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155390") ? false : stryMutAct_9fa48("155389") ? true : (stryCov_9fa48("155389", "155390", "155391"), queue.queueWaitSampleCount || TRANSPORT_NUM.ZERO)) + TRANSPORT_NUM.ONE);
    queue.queueWaitTotalMs = stryMutAct_9fa48("155392") ? (queue.queueWaitTotalMs || TRANSPORT_NUM.ZERO) - normalized : (stryCov_9fa48("155392"), (stryMutAct_9fa48("155395") ? queue.queueWaitTotalMs && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155394") ? false : stryMutAct_9fa48("155393") ? true : (stryCov_9fa48("155393", "155394", "155395"), queue.queueWaitTotalMs || TRANSPORT_NUM.ZERO)) + normalized);
    queue.queueWaitMaxMs = stryMutAct_9fa48("155396") ? Math.min(queue.queueWaitMaxMs || TRANSPORT_NUM.ZERO, normalized) : (stryCov_9fa48("155396"), Math.max(stryMutAct_9fa48("155399") ? queue.queueWaitMaxMs && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155398") ? false : stryMutAct_9fa48("155397") ? true : (stryCov_9fa48("155397", "155398", "155399"), queue.queueWaitMaxMs || TRANSPORT_NUM.ZERO), normalized));
    if (stryMutAct_9fa48("155402") ? false : stryMutAct_9fa48("155401") ? true : stryMutAct_9fa48("155400") ? queue.queueWaitHistogram : (stryCov_9fa48("155400", "155401", "155402"), !queue.queueWaitHistogram)) {
      if (stryMutAct_9fa48("155403")) {
        {}
      } else {
        stryCov_9fa48("155403");
        queue.queueWaitHistogram = createQueueWaitHistogram();
      }
    }
    const bucket = resolveQueueWaitBucket(normalized);
    queue.queueWaitHistogram[bucket] = stryMutAct_9fa48("155404") ? (queue.queueWaitHistogram[bucket] || TRANSPORT_NUM.ZERO) - TRANSPORT_NUM.ONE : (stryCov_9fa48("155404"), (stryMutAct_9fa48("155407") ? queue.queueWaitHistogram[bucket] && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155406") ? false : stryMutAct_9fa48("155405") ? true : (stryCov_9fa48("155405", "155406", "155407"), queue.queueWaitHistogram[bucket] || TRANSPORT_NUM.ZERO)) + TRANSPORT_NUM.ONE);
  }
}
function buildQueueWaitSummary(queue) {
  if (stryMutAct_9fa48("155408")) {
    {}
  } else {
    stryCov_9fa48("155408");
    const sampleCount = stryMutAct_9fa48("155411") ? queue?.queueWaitSampleCount && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155410") ? false : stryMutAct_9fa48("155409") ? true : (stryCov_9fa48("155409", "155410", "155411"), (stryMutAct_9fa48("155412") ? queue.queueWaitSampleCount : (stryCov_9fa48("155412"), queue?.queueWaitSampleCount)) || TRANSPORT_NUM.ZERO);
    const totalMs = stryMutAct_9fa48("155415") ? queue?.queueWaitTotalMs && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155414") ? false : stryMutAct_9fa48("155413") ? true : (stryCov_9fa48("155413", "155414", "155415"), (stryMutAct_9fa48("155416") ? queue.queueWaitTotalMs : (stryCov_9fa48("155416"), queue?.queueWaitTotalMs)) || TRANSPORT_NUM.ZERO);
    return stryMutAct_9fa48("155417") ? {} : (stryCov_9fa48("155417"), {
      sampleCount,
      avgMs: (stryMutAct_9fa48("155421") ? sampleCount <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155420") ? sampleCount >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155419") ? false : stryMutAct_9fa48("155418") ? true : (stryCov_9fa48("155418", "155419", "155420", "155421"), sampleCount > TRANSPORT_NUM.ZERO)) ? Math.round(stryMutAct_9fa48("155422") ? totalMs * sampleCount : (stryCov_9fa48("155422"), totalMs / sampleCount)) : TRANSPORT_NUM.ZERO,
      maxMs: stryMutAct_9fa48("155425") ? queue?.queueWaitMaxMs && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155424") ? false : stryMutAct_9fa48("155423") ? true : (stryCov_9fa48("155423", "155424", "155425"), (stryMutAct_9fa48("155426") ? queue.queueWaitMaxMs : (stryCov_9fa48("155426"), queue?.queueWaitMaxMs)) || TRANSPORT_NUM.ZERO),
      histogram: stryMutAct_9fa48("155427") ? {} : (stryCov_9fa48("155427"), {
        ...(stryMutAct_9fa48("155430") ? queue?.queueWaitHistogram && createQueueWaitHistogram() : stryMutAct_9fa48("155429") ? false : stryMutAct_9fa48("155428") ? true : (stryCov_9fa48("155428", "155429", "155430"), (stryMutAct_9fa48("155431") ? queue.queueWaitHistogram : (stryCov_9fa48("155431"), queue?.queueWaitHistogram)) || createQueueWaitHistogram()))
      })
    });
  }
}
function resolveRequestIdFromMessage(message) {
  if (stryMutAct_9fa48("155432")) {
    {}
  } else {
    stryCov_9fa48("155432");
    return normalizeIdentifier(stryMutAct_9fa48("155435") ? (message?.requestId || message?.request_id || message?.payload?.requestId) && message?.payload?.request_id : stryMutAct_9fa48("155434") ? false : stryMutAct_9fa48("155433") ? true : (stryCov_9fa48("155433", "155434", "155435"), (stryMutAct_9fa48("155437") ? (message?.requestId || message?.request_id) && message?.payload?.requestId : stryMutAct_9fa48("155436") ? false : (stryCov_9fa48("155436", "155437"), (stryMutAct_9fa48("155439") ? message?.requestId && message?.request_id : stryMutAct_9fa48("155438") ? false : (stryCov_9fa48("155438", "155439"), (stryMutAct_9fa48("155440") ? message.requestId : (stryCov_9fa48("155440"), message?.requestId)) || (stryMutAct_9fa48("155441") ? message.request_id : (stryCov_9fa48("155441"), message?.request_id)))) || (stryMutAct_9fa48("155443") ? message.payload?.requestId : stryMutAct_9fa48("155442") ? message?.payload.requestId : (stryCov_9fa48("155442", "155443"), message?.payload?.requestId)))) || (stryMutAct_9fa48("155445") ? message.payload?.request_id : stryMutAct_9fa48("155444") ? message?.payload.request_id : (stryCov_9fa48("155444", "155445"), message?.payload?.request_id))));
  }
}
function resolveOperationIdFromMessage(message) {
  if (stryMutAct_9fa48("155446")) {
    {}
  } else {
    stryCov_9fa48("155446");
    return normalizeIdentifier(stryMutAct_9fa48("155449") ? (message?.operationId || message?.operation_id || message?.id || message?.payload?.operationId) && message?.payload?.operation_id : stryMutAct_9fa48("155448") ? false : stryMutAct_9fa48("155447") ? true : (stryCov_9fa48("155447", "155448", "155449"), (stryMutAct_9fa48("155451") ? (message?.operationId || message?.operation_id || message?.id) && message?.payload?.operationId : stryMutAct_9fa48("155450") ? false : (stryCov_9fa48("155450", "155451"), (stryMutAct_9fa48("155453") ? (message?.operationId || message?.operation_id) && message?.id : stryMutAct_9fa48("155452") ? false : (stryCov_9fa48("155452", "155453"), (stryMutAct_9fa48("155455") ? message?.operationId && message?.operation_id : stryMutAct_9fa48("155454") ? false : (stryCov_9fa48("155454", "155455"), (stryMutAct_9fa48("155456") ? message.operationId : (stryCov_9fa48("155456"), message?.operationId)) || (stryMutAct_9fa48("155457") ? message.operation_id : (stryCov_9fa48("155457"), message?.operation_id)))) || (stryMutAct_9fa48("155458") ? message.id : (stryCov_9fa48("155458"), message?.id)))) || (stryMutAct_9fa48("155460") ? message.payload?.operationId : stryMutAct_9fa48("155459") ? message?.payload.operationId : (stryCov_9fa48("155459", "155460"), message?.payload?.operationId)))) || (stryMutAct_9fa48("155462") ? message.payload?.operation_id : stryMutAct_9fa48("155461") ? message?.payload.operation_id : (stryCov_9fa48("155461", "155462"), message?.payload?.operation_id))));
  }
}
function extractSqlOperationKind(sql) {
  if (stryMutAct_9fa48("155463")) {
    {}
  } else {
    stryCov_9fa48("155463");
    if (stryMutAct_9fa48("155466") ? typeof sql === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("155465") ? false : stryMutAct_9fa48("155464") ? true : (stryCov_9fa48("155464", "155465", "155466"), typeof sql !== TRANSPORT_TYPEOF.STRING)) {
      if (stryMutAct_9fa48("155467")) {
        {}
      } else {
        stryCov_9fa48("155467");
        return MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN;
      }
    }
    const normalized = stryMutAct_9fa48("155469") ? sql.toLowerCase() : stryMutAct_9fa48("155468") ? sql.trim().toUpperCase() : (stryCov_9fa48("155468", "155469"), sql.trim().toLowerCase());
    if (stryMutAct_9fa48("155472") ? normalized.endsWith(MESSAGE_ROUTER_LITERAL.STRING_SELECT) : stryMutAct_9fa48("155471") ? false : stryMutAct_9fa48("155470") ? true : (stryCov_9fa48("155470", "155471", "155472"), normalized.startsWith(MESSAGE_ROUTER_LITERAL.STRING_SELECT))) {
      if (stryMutAct_9fa48("155473")) {
        {}
      } else {
        stryCov_9fa48("155473");
        return MESSAGE_ROUTER_LITERAL.STRING_SELECT;
      }
    }
    if (stryMutAct_9fa48("155476") ? normalized.endsWith(MESSAGE_ROUTER_LITERAL.STRING_INSERT) : stryMutAct_9fa48("155475") ? false : stryMutAct_9fa48("155474") ? true : (stryCov_9fa48("155474", "155475", "155476"), normalized.startsWith(MESSAGE_ROUTER_LITERAL.STRING_INSERT))) {
      if (stryMutAct_9fa48("155477")) {
        {}
      } else {
        stryCov_9fa48("155477");
        return MESSAGE_ROUTER_LITERAL.STRING_INSERT;
      }
    }
    if (stryMutAct_9fa48("155480") ? normalized.endsWith(MESSAGE_ROUTER_LITERAL.STRING_UPDATE) : stryMutAct_9fa48("155479") ? false : stryMutAct_9fa48("155478") ? true : (stryCov_9fa48("155478", "155479", "155480"), normalized.startsWith(MESSAGE_ROUTER_LITERAL.STRING_UPDATE))) {
      if (stryMutAct_9fa48("155481")) {
        {}
      } else {
        stryCov_9fa48("155481");
        return MESSAGE_ROUTER_LITERAL.STRING_UPDATE;
      }
    }
    if (stryMutAct_9fa48("155484") ? normalized.endsWith(MESSAGE_ROUTER_LITERAL.STRING_DELETE) : stryMutAct_9fa48("155483") ? false : stryMutAct_9fa48("155482") ? true : (stryCov_9fa48("155482", "155483", "155484"), normalized.startsWith(MESSAGE_ROUTER_LITERAL.STRING_DELETE))) {
      if (stryMutAct_9fa48("155485")) {
        {}
      } else {
        stryCov_9fa48("155485");
        return MESSAGE_ROUTER_LITERAL.STRING_DELETE;
      }
    }
    return MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN;
  }
}
function extractSqlTableName(sql) {
  if (stryMutAct_9fa48("155486")) {
    {}
  } else {
    stryCov_9fa48("155486");
    if (stryMutAct_9fa48("155489") ? typeof sql !== TRANSPORT_TYPEOF.STRING && sql.trim().length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155488") ? false : stryMutAct_9fa48("155487") ? true : (stryCov_9fa48("155487", "155488", "155489"), (stryMutAct_9fa48("155491") ? typeof sql === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("155490") ? false : (stryCov_9fa48("155490", "155491"), typeof sql !== TRANSPORT_TYPEOF.STRING)) || (stryMutAct_9fa48("155493") ? sql.trim().length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155492") ? false : (stryCov_9fa48("155492", "155493"), (stryMutAct_9fa48("155494") ? sql.length : (stryCov_9fa48("155494"), sql.trim().length)) === TRANSPORT_NUM.ZERO)))) {
      if (stryMutAct_9fa48("155495")) {
        {}
      } else {
        stryCov_9fa48("155495");
        return null;
      }
    }
    const normalizedSql = stryMutAct_9fa48("155496") ? sql : (stryCov_9fa48("155496"), sql.trim());
    for (const matcher of stryMutAct_9fa48("155497") ? [] : (stryCov_9fa48("155497"), [stryMutAct_9fa48("155510") ? /^\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\W]*)/i : stryMutAct_9fa48("155509") ? /^\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][^\w]*)/i : stryMutAct_9fa48("155508") ? /^\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w])/i : stryMutAct_9fa48("155507") ? /^\s*select\b[\s\S]*?\bfrom\s+([^a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155506") ? /^\s*select\b[\s\S]*?\bfrom\S+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155505") ? /^\s*select\b[\s\S]*?\bfrom\s([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155504") ? /^\s*select\b[\s\s]*?\bfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155503") ? /^\s*select\b[\S\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155502") ? /^\s*select\b[^\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155501") ? /^\s*select\b[\s\S]\bfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155500") ? /^\S*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155499") ? /^\sselect\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155498") ? /\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i : (stryCov_9fa48("155498", "155499", "155500", "155501", "155502", "155503", "155504", "155505", "155506", "155507", "155508", "155509", "155510"), /^\s*select\b[\s\S]*?\bfrom\s+([a-zA-Z_][\w]*)/i), stryMutAct_9fa48("155526") ? /^\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\W]*)/i : stryMutAct_9fa48("155525") ? /^\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][^\w]*)/i : stryMutAct_9fa48("155524") ? /^\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w])/i : stryMutAct_9fa48("155523") ? /^\s*insert(?:\s+or\s+replace)?\s+into\s+([^a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155522") ? /^\s*insert(?:\s+or\s+replace)?\s+into\S+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155521") ? /^\s*insert(?:\s+or\s+replace)?\s+into\s([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155520") ? /^\s*insert(?:\s+or\s+replace)?\S+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155519") ? /^\s*insert(?:\s+or\s+replace)?\sinto\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155518") ? /^\s*insert(?:\s+or\S+replace)?\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155517") ? /^\s*insert(?:\s+or\sreplace)?\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155516") ? /^\s*insert(?:\S+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155515") ? /^\s*insert(?:\sor\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155514") ? /^\s*insert(?:\s+or\s+replace)\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155513") ? /^\S*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155512") ? /^\sinsert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155511") ? /\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i : (stryCov_9fa48("155511", "155512", "155513", "155514", "155515", "155516", "155517", "155518", "155519", "155520", "155521", "155522", "155523", "155524", "155525", "155526"), /^\s*insert(?:\s+or\s+replace)?\s+into\s+([a-zA-Z_][\w]*)/i), stryMutAct_9fa48("155535") ? /^\s*update\s+([a-zA-Z_][\W]*)/i : stryMutAct_9fa48("155534") ? /^\s*update\s+([a-zA-Z_][^\w]*)/i : stryMutAct_9fa48("155533") ? /^\s*update\s+([a-zA-Z_][\w])/i : stryMutAct_9fa48("155532") ? /^\s*update\s+([^a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155531") ? /^\s*update\S+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155530") ? /^\s*update\s([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155529") ? /^\S*update\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155528") ? /^\supdate\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155527") ? /\s*update\s+([a-zA-Z_][\w]*)/i : (stryCov_9fa48("155527", "155528", "155529", "155530", "155531", "155532", "155533", "155534", "155535"), /^\s*update\s+([a-zA-Z_][\w]*)/i), stryMutAct_9fa48("155546") ? /^\s*delete\s+from\s+([a-zA-Z_][\W]*)/i : stryMutAct_9fa48("155545") ? /^\s*delete\s+from\s+([a-zA-Z_][^\w]*)/i : stryMutAct_9fa48("155544") ? /^\s*delete\s+from\s+([a-zA-Z_][\w])/i : stryMutAct_9fa48("155543") ? /^\s*delete\s+from\s+([^a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155542") ? /^\s*delete\s+from\S+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155541") ? /^\s*delete\s+from\s([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155540") ? /^\s*delete\S+from\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155539") ? /^\s*delete\sfrom\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155538") ? /^\S*delete\s+from\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155537") ? /^\sdelete\s+from\s+([a-zA-Z_][\w]*)/i : stryMutAct_9fa48("155536") ? /\s*delete\s+from\s+([a-zA-Z_][\w]*)/i : (stryCov_9fa48("155536", "155537", "155538", "155539", "155540", "155541", "155542", "155543", "155544", "155545", "155546"), /^\s*delete\s+from\s+([a-zA-Z_][\w]*)/i)])) {
      if (stryMutAct_9fa48("155547")) {
        {}
      } else {
        stryCov_9fa48("155547");
        const match = normalizedSql.match(matcher);
        if (stryMutAct_9fa48("155550") ? match[TRANSPORT_NUM.ONE] : stryMutAct_9fa48("155549") ? false : stryMutAct_9fa48("155548") ? true : (stryCov_9fa48("155548", "155549", "155550"), match?.[TRANSPORT_NUM.ONE])) {
          if (stryMutAct_9fa48("155551")) {
            {}
          } else {
            stryCov_9fa48("155551");
            return stryMutAct_9fa48("155552") ? match[TRANSPORT_NUM.ONE].toUpperCase() : (stryCov_9fa48("155552"), match[TRANSPORT_NUM.ONE].toLowerCase());
          }
        }
      }
    }
    return null;
  }
}
function summarizeRaftAppendCommand(command) {
  if (stryMutAct_9fa48("155553")) {
    {}
  } else {
    stryCov_9fa48("155553");
    const commandType = stryMutAct_9fa48("155555") ? normalizeIdentifier(command?.type).toLowerCase() : stryMutAct_9fa48("155554") ? normalizeIdentifier(command?.type)?.toUpperCase() : (stryCov_9fa48("155554", "155555"), normalizeIdentifier(stryMutAct_9fa48("155556") ? command.type : (stryCov_9fa48("155556"), command?.type))?.toLowerCase());
    if (stryMutAct_9fa48("155559") ? false : stryMutAct_9fa48("155558") ? true : stryMutAct_9fa48("155557") ? commandType : (stryCov_9fa48("155557", "155558", "155559"), !commandType)) {
      if (stryMutAct_9fa48("155560")) {
        {}
      } else {
        stryCov_9fa48("155560");
        return MESSAGE_ROUTER_LITERAL.STRING_RAFT_APPEND_UNKNOWN;
      }
    }
    if (stryMutAct_9fa48("155563") ? commandType !== MESSAGE_ROUTER_LITERAL.STRING_CDC : stryMutAct_9fa48("155562") ? false : stryMutAct_9fa48("155561") ? true : (stryCov_9fa48("155561", "155562", "155563"), commandType === MESSAGE_ROUTER_LITERAL.STRING_CDC)) {
      if (stryMutAct_9fa48("155564")) {
        {}
      } else {
        stryCov_9fa48("155564");
        const tableName = stryMutAct_9fa48("155566") ? normalizeIdentifier(command?.tableName).toLowerCase() : stryMutAct_9fa48("155565") ? normalizeIdentifier(command?.tableName)?.toUpperCase() : (stryCov_9fa48("155565", "155566"), normalizeIdentifier(stryMutAct_9fa48("155567") ? command.tableName : (stryCov_9fa48("155567"), command?.tableName))?.toLowerCase());
        return stryMutAct_9fa48("155568") ? `` : (stryCov_9fa48("155568"), `raft:append:cdc:${stryMutAct_9fa48("155571") ? tableName && MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN : stryMutAct_9fa48("155570") ? false : stryMutAct_9fa48("155569") ? true : (stryCov_9fa48("155569", "155570", "155571"), tableName || MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN)}`);
      }
    }
    if (stryMutAct_9fa48("155574") ? commandType !== MESSAGE_ROUTER_LITERAL.STRING_CDC_BATCH : stryMutAct_9fa48("155573") ? false : stryMutAct_9fa48("155572") ? true : (stryCov_9fa48("155572", "155573", "155574"), commandType === MESSAGE_ROUTER_LITERAL.STRING_CDC_BATCH)) {
      if (stryMutAct_9fa48("155575")) {
        {}
      } else {
        stryCov_9fa48("155575");
        const events = Array.isArray(stryMutAct_9fa48("155576") ? command.events : (stryCov_9fa48("155576"), command?.events)) ? command.events : stryMutAct_9fa48("155577") ? ["Stryker was here"] : (stryCov_9fa48("155577"), []);
        const eventCount = events.length;
        const distinctTableNames = stryMutAct_9fa48("155578") ? [] : (stryCov_9fa48("155578"), [...new Set(stryMutAct_9fa48("155579") ? events.map(event => normalizeIdentifier(event?.tableName)?.toLowerCase()) : (stryCov_9fa48("155579"), events.map(stryMutAct_9fa48("155580") ? () => undefined : (stryCov_9fa48("155580"), event => stryMutAct_9fa48("155582") ? normalizeIdentifier(event?.tableName).toLowerCase() : stryMutAct_9fa48("155581") ? normalizeIdentifier(event?.tableName)?.toUpperCase() : (stryCov_9fa48("155581", "155582"), normalizeIdentifier(stryMutAct_9fa48("155583") ? event.tableName : (stryCov_9fa48("155583"), event?.tableName))?.toLowerCase()))).filter(Boolean)))]);
        if (stryMutAct_9fa48("155586") ? distinctTableNames.length !== TRANSPORT_NUM.ONE : stryMutAct_9fa48("155585") ? false : stryMutAct_9fa48("155584") ? true : (stryCov_9fa48("155584", "155585", "155586"), distinctTableNames.length === TRANSPORT_NUM.ONE)) {
          if (stryMutAct_9fa48("155587")) {
            {}
          } else {
            stryCov_9fa48("155587");
            return stryMutAct_9fa48("155588") ? `` : (stryCov_9fa48("155588"), `raft:append:cdc_batch:${distinctTableNames[TRANSPORT_NUM.ZERO]}:${eventCount}`);
          }
        }
        if (stryMutAct_9fa48("155592") ? distinctTableNames.length <= TRANSPORT_NUM.ONE : stryMutAct_9fa48("155591") ? distinctTableNames.length >= TRANSPORT_NUM.ONE : stryMutAct_9fa48("155590") ? false : stryMutAct_9fa48("155589") ? true : (stryCov_9fa48("155589", "155590", "155591", "155592"), distinctTableNames.length > TRANSPORT_NUM.ONE)) {
          if (stryMutAct_9fa48("155593")) {
            {}
          } else {
            stryCov_9fa48("155593");
            return stryMutAct_9fa48("155594") ? `` : (stryCov_9fa48("155594"), `raft:append:cdc_batch:mixed:${eventCount}`);
          }
        }
        return MESSAGE_ROUTER_LITERAL.STRING_RAFT_APPEND_CDC_BATCH_UNKNOWN;
      }
    }
    if (stryMutAct_9fa48("155597") ? commandType !== MESSAGE_ROUTER_LITERAL.STRING_MESSAGE : stryMutAct_9fa48("155596") ? false : stryMutAct_9fa48("155595") ? true : (stryCov_9fa48("155595", "155596", "155597"), commandType === MESSAGE_ROUTER_LITERAL.STRING_MESSAGE)) {
      if (stryMutAct_9fa48("155598")) {
        {}
      } else {
        stryCov_9fa48("155598");
        const payloadType = stryMutAct_9fa48("155600") ? normalizeIdentifier(command?.message?.payload?.type).toLowerCase() : stryMutAct_9fa48("155599") ? normalizeIdentifier(command?.message?.payload?.type)?.toUpperCase() : (stryCov_9fa48("155599", "155600"), normalizeIdentifier(stryMutAct_9fa48("155603") ? command.message?.payload?.type : stryMutAct_9fa48("155602") ? command?.message.payload?.type : stryMutAct_9fa48("155601") ? command?.message?.payload.type : (stryCov_9fa48("155601", "155602", "155603"), command?.message?.payload?.type))?.toLowerCase());
        return stryMutAct_9fa48("155604") ? `` : (stryCov_9fa48("155604"), `raft:append:message:${stryMutAct_9fa48("155607") ? payloadType && MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN : stryMutAct_9fa48("155606") ? false : stryMutAct_9fa48("155605") ? true : (stryCov_9fa48("155605", "155606", "155607"), payloadType || MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN)}`);
      }
    }
    if (stryMutAct_9fa48("155610") ? commandType !== MESSAGE_ROUTER_LITERAL.STRING_ACK : stryMutAct_9fa48("155609") ? false : stryMutAct_9fa48("155608") ? true : (stryCov_9fa48("155608", "155609", "155610"), commandType === MESSAGE_ROUTER_LITERAL.STRING_ACK)) {
      if (stryMutAct_9fa48("155611")) {
        {}
      } else {
        stryCov_9fa48("155611");
        return MESSAGE_ROUTER_LITERAL.STRING_RAFT_APPEND_ACK;
      }
    }
    return stryMutAct_9fa48("155612") ? `` : (stryCov_9fa48("155612"), `raft:append:${commandType}`);
  }
}
function isSupersedableRaftHeartbeatAppend(message) {
  if (stryMutAct_9fa48("155613")) {
    {}
  } else {
    stryCov_9fa48("155613");
    const messageType = stryMutAct_9fa48("155615") ? normalizeIdentifier(message?.type).toLowerCase() : stryMutAct_9fa48("155614") ? normalizeIdentifier(message?.type)?.toUpperCase() : (stryCov_9fa48("155614", "155615"), normalizeIdentifier(stryMutAct_9fa48("155616") ? message.type : (stryCov_9fa48("155616"), message?.type))?.toLowerCase());
    if (stryMutAct_9fa48("155619") ? messageType === MESSAGE_ROUTER_LITERAL.STRING_APPEND : stryMutAct_9fa48("155618") ? false : stryMutAct_9fa48("155617") ? true : (stryCov_9fa48("155617", "155618", "155619"), messageType !== MESSAGE_ROUTER_LITERAL.STRING_APPEND)) {
      if (stryMutAct_9fa48("155620")) {
        {}
      } else {
        stryCov_9fa48("155620");
        return stryMutAct_9fa48("155621") ? true : (stryCov_9fa48("155621"), false);
      }
    }
    return stryMutAct_9fa48("155624") ? !Array.isArray(message?.data) && message.data.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155623") ? false : stryMutAct_9fa48("155622") ? true : (stryCov_9fa48("155622", "155623", "155624"), (stryMutAct_9fa48("155625") ? Array.isArray(message?.data) : (stryCov_9fa48("155625"), !Array.isArray(stryMutAct_9fa48("155626") ? message.data : (stryCov_9fa48("155626"), message?.data)))) || (stryMutAct_9fa48("155628") ? message.data.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155627") ? false : (stryCov_9fa48("155627", "155628"), message.data.length === TRANSPORT_NUM.ZERO)));
  }
}
function resolvePendingReplacementKey(targetAddress, message, options = {}) {
  if (stryMutAct_9fa48("155629")) {
    {}
  } else {
    stryCov_9fa48("155629");
    const explicitKey = normalizeIdentifier(stryMutAct_9fa48("155630") ? options.replacePendingKey : (stryCov_9fa48("155630"), options?.replacePendingKey));
    if (stryMutAct_9fa48("155632") ? false : stryMutAct_9fa48("155631") ? true : (stryCov_9fa48("155631", "155632"), explicitKey)) {
      if (stryMutAct_9fa48("155633")) {
        {}
      } else {
        stryCov_9fa48("155633");
        return explicitKey;
      }
    }
    if (stryMutAct_9fa48("155636") ? false : stryMutAct_9fa48("155635") ? true : stryMutAct_9fa48("155634") ? isSupersedableRaftHeartbeatAppend(message) : (stryCov_9fa48("155634", "155635", "155636"), !isSupersedableRaftHeartbeatAppend(message))) {
      if (stryMutAct_9fa48("155637")) {
        {}
      } else {
        stryCov_9fa48("155637");
        return null;
      }
    }
    const normalizedTargetAddress = normalizeIdentifier(targetAddress);
    if (stryMutAct_9fa48("155640") ? false : stryMutAct_9fa48("155639") ? true : stryMutAct_9fa48("155638") ? normalizedTargetAddress : (stryCov_9fa48("155638", "155639", "155640"), !normalizedTargetAddress)) {
      if (stryMutAct_9fa48("155641")) {
        {}
      } else {
        stryCov_9fa48("155641");
        return MESSAGE_ROUTER_LITERAL.STRING_RAFT_APPEND_HEARTBEAT;
      }
    }
    return stryMutAct_9fa48("155642") ? `` : (stryCov_9fa48("155642"), `raft:append:heartbeat:${normalizedTargetAddress}`);
  }
}
function buildDerivedDeliverySource(targetAddress, message) {
  if (stryMutAct_9fa48("155643")) {
    {}
  } else {
    stryCov_9fa48("155643");
    const messageType = stryMutAct_9fa48("155645") ? normalizeIdentifier(message?.type).toLowerCase() : stryMutAct_9fa48("155644") ? normalizeIdentifier(message?.type)?.toUpperCase() : (stryCov_9fa48("155644", "155645"), normalizeIdentifier(stryMutAct_9fa48("155646") ? message.type : (stryCov_9fa48("155646"), message?.type))?.toLowerCase());
    if (stryMutAct_9fa48("155649") ? messageType !== MESSAGE_ROUTER_LITERAL.STRING_APPEND : stryMutAct_9fa48("155648") ? false : stryMutAct_9fa48("155647") ? true : (stryCov_9fa48("155647", "155648", "155649"), messageType === MESSAGE_ROUTER_LITERAL.STRING_APPEND)) {
      if (stryMutAct_9fa48("155650")) {
        {}
      } else {
        stryCov_9fa48("155650");
        if (stryMutAct_9fa48("155652") ? false : stryMutAct_9fa48("155651") ? true : (stryCov_9fa48("155651", "155652"), isSupersedableRaftHeartbeatAppend(message))) {
          if (stryMutAct_9fa48("155653")) {
            {}
          } else {
            stryCov_9fa48("155653");
            return MESSAGE_ROUTER_LITERAL.STRING_RAFT_APPEND_HEARTBEAT;
          }
        }
        const entry = Array.isArray(stryMutAct_9fa48("155654") ? message.data : (stryCov_9fa48("155654"), message?.data)) ? message.data[0] : null;
        return summarizeRaftAppendCommand(stryMutAct_9fa48("155655") ? entry.command : (stryCov_9fa48("155655"), entry?.command));
      }
    }
    if (stryMutAct_9fa48("155658") ? messageType !== QUERY_DATA_PLANE_MESSAGE_TYPE.toLowerCase() : stryMutAct_9fa48("155657") ? false : stryMutAct_9fa48("155656") ? true : (stryCov_9fa48("155656", "155657", "155658"), messageType === (stryMutAct_9fa48("155659") ? QUERY_DATA_PLANE_MESSAGE_TYPE.toUpperCase() : (stryCov_9fa48("155659"), QUERY_DATA_PLANE_MESSAGE_TYPE.toLowerCase())))) {
      if (stryMutAct_9fa48("155660")) {
        {}
      } else {
        stryCov_9fa48("155660");
        const tableName = extractSqlTableName(stryMutAct_9fa48("155661") ? message.sql : (stryCov_9fa48("155661"), message?.sql));
        const operationKind = extractSqlOperationKind(stryMutAct_9fa48("155662") ? message.sql : (stryCov_9fa48("155662"), message?.sql));
        return stryMutAct_9fa48("155663") ? `` : (stryCov_9fa48("155663"), `query:${operationKind}:${stryMutAct_9fa48("155666") ? tableName && MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN : stryMutAct_9fa48("155665") ? false : stryMutAct_9fa48("155664") ? true : (stryCov_9fa48("155664", "155665", "155666"), tableName || MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN)}`);
      }
    }
    if (stryMutAct_9fa48("155668") ? false : stryMutAct_9fa48("155667") ? true : (stryCov_9fa48("155667", "155668"), messageType)) {
      if (stryMutAct_9fa48("155669")) {
        {}
      } else {
        stryCov_9fa48("155669");
        return stryMutAct_9fa48("155670") ? `` : (stryCov_9fa48("155670"), `message:${messageType}`);
      }
    }
    const normalizedTarget = normalizeIdentifier(targetAddress);
    if (stryMutAct_9fa48("155672") ? false : stryMutAct_9fa48("155671") ? true : (stryCov_9fa48("155671", "155672"), normalizedTarget)) {
      if (stryMutAct_9fa48("155673")) {
        {}
      } else {
        stryCov_9fa48("155673");
        return stryMutAct_9fa48("155674") ? `` : (stryCov_9fa48("155674"), `target:${normalizedTarget}`);
      }
    }
    return MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN;
  }
}
function buildRetiredPendingClassification(reason) {
  if (stryMutAct_9fa48("155675")) {
    {}
  } else {
    stryCov_9fa48("155675");
    switch (reason) {
      case RETIRED_PENDING_RESPONSE_REASON.TIMEOUT:
        if (stryMutAct_9fa48("155676")) {} else {
          stryCov_9fa48("155676");
          return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_TIMEOUT;
        }
      case RETIRED_PENDING_RESPONSE_REASON.NODE_FAILURE:
        if (stryMutAct_9fa48("155677")) {} else {
          stryCov_9fa48("155677");
          return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_NODE_FAILURE;
        }
      case RETIRED_PENDING_RESPONSE_REASON.DEFERRED_DELIVERY:
        if (stryMutAct_9fa48("155678")) {} else {
          stryCov_9fa48("155678");
          return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_DEFERRED_DELIVERY;
        }
      case RETIRED_PENDING_RESPONSE_REASON.ACK_REJECTED:
        if (stryMutAct_9fa48("155679")) {} else {
          stryCov_9fa48("155679");
          return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_ACK_REJECTED;
        }
      case RETIRED_PENDING_RESPONSE_REASON.INLINE_ACK:
        if (stryMutAct_9fa48("155680")) {} else {
          stryCov_9fa48("155680");
          return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_INLINE_ACK;
        }
      case RETIRED_PENDING_RESPONSE_REASON.CANCELLED:
        if (stryMutAct_9fa48("155681")) {} else {
          stryCov_9fa48("155681");
          return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_CANCELLED;
        }
      default:
        if (stryMutAct_9fa48("155682")) {} else {
          stryCov_9fa48("155682");
          return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_RETIRED_WAITER;
        }
    }
  }
}
function buildServiceResponseDisposition(options = {}) {
  if (stryMutAct_9fa48("155683")) {
    {}
  } else {
    stryCov_9fa48("155683");
    return Object.freeze(stryMutAct_9fa48("155684") ? {} : (stryCov_9fa48("155684"), {
      messageId: stryMutAct_9fa48("155687") ? normalizeIdentifier(options?.messageId) && null : stryMutAct_9fa48("155686") ? false : stryMutAct_9fa48("155685") ? true : (stryCov_9fa48("155685", "155686", "155687"), normalizeIdentifier(stryMutAct_9fa48("155688") ? options.messageId : (stryCov_9fa48("155688"), options?.messageId)) || null),
      kind: stryMutAct_9fa48("155691") ? normalizeIdentifier(options?.kind) && SERVICE_RESPONSE_DISPOSITION_KIND.ORPHANED : stryMutAct_9fa48("155690") ? false : stryMutAct_9fa48("155689") ? true : (stryCov_9fa48("155689", "155690", "155691"), normalizeIdentifier(stryMutAct_9fa48("155692") ? options.kind : (stryCov_9fa48("155692"), options?.kind)) || SERVICE_RESPONSE_DISPOSITION_KIND.ORPHANED),
      classification: stryMutAct_9fa48("155695") ? normalizeIdentifier(options?.classification) && SERVICE_RESPONSE_DISPOSITION_KIND.ORPHANED : stryMutAct_9fa48("155694") ? false : stryMutAct_9fa48("155693") ? true : (stryCov_9fa48("155693", "155694", "155695"), normalizeIdentifier(stryMutAct_9fa48("155696") ? options.classification : (stryCov_9fa48("155696"), options?.classification)) || SERVICE_RESPONSE_DISPOSITION_KIND.ORPHANED),
      absorbed: stryMutAct_9fa48("155699") ? options?.absorbed !== true : stryMutAct_9fa48("155698") ? false : stryMutAct_9fa48("155697") ? true : (stryCov_9fa48("155697", "155698", "155699"), (stryMutAct_9fa48("155700") ? options.absorbed : (stryCov_9fa48("155700"), options?.absorbed)) === (stryMutAct_9fa48("155701") ? false : (stryCov_9fa48("155701"), true))),
      retiredReason: stryMutAct_9fa48("155704") ? normalizeIdentifier(options?.retiredReason) && null : stryMutAct_9fa48("155703") ? false : stryMutAct_9fa48("155702") ? true : (stryCov_9fa48("155702", "155703", "155704"), normalizeIdentifier(stryMutAct_9fa48("155705") ? options.retiredReason : (stryCov_9fa48("155705"), options?.retiredReason)) || null),
      deliverySource: stryMutAct_9fa48("155708") ? normalizeIdentifier(options?.deliverySource) && null : stryMutAct_9fa48("155707") ? false : stryMutAct_9fa48("155706") ? true : (stryCov_9fa48("155706", "155707", "155708"), normalizeIdentifier(stryMutAct_9fa48("155709") ? options.deliverySource : (stryCov_9fa48("155709"), options?.deliverySource)) || null),
      targetNodeId: stryMutAct_9fa48("155712") ? normalizeIdentifier(options?.targetNodeId) && null : stryMutAct_9fa48("155711") ? false : stryMutAct_9fa48("155710") ? true : (stryCov_9fa48("155710", "155711", "155712"), normalizeIdentifier(stryMutAct_9fa48("155713") ? options.targetNodeId : (stryCov_9fa48("155713"), options?.targetNodeId)) || null)
    }));
  }
}
function resolveDeliverySource(targetAddress, message, options = {}) {
  if (stryMutAct_9fa48("155714")) {
    {}
  } else {
    stryCov_9fa48("155714");
    const explicitSource = normalizeIdentifier(stryMutAct_9fa48("155715") ? options.deliverySource : (stryCov_9fa48("155715"), options?.deliverySource));
    if (stryMutAct_9fa48("155717") ? false : stryMutAct_9fa48("155716") ? true : (stryCov_9fa48("155716", "155717"), explicitSource)) {
      if (stryMutAct_9fa48("155718")) {
        {}
      } else {
        stryCov_9fa48("155718");
        return explicitSource;
      }
    }
    return buildDerivedDeliverySource(targetAddress, message);
  }
}
function buildPendingSourceSummary(queue, limit = MESSAGE_ROUTER_LITERAL.NUMBER_5) {
  if (stryMutAct_9fa48("155719")) {
    {}
  } else {
    stryCov_9fa48("155719");
    if (stryMutAct_9fa48("155722") ? (!queue || !Array.isArray(queue.pending)) && queue.pending.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155721") ? false : stryMutAct_9fa48("155720") ? true : (stryCov_9fa48("155720", "155721", "155722"), (stryMutAct_9fa48("155724") ? !queue && !Array.isArray(queue.pending) : stryMutAct_9fa48("155723") ? false : (stryCov_9fa48("155723", "155724"), (stryMutAct_9fa48("155725") ? queue : (stryCov_9fa48("155725"), !queue)) || (stryMutAct_9fa48("155726") ? Array.isArray(queue.pending) : (stryCov_9fa48("155726"), !Array.isArray(queue.pending))))) || (stryMutAct_9fa48("155728") ? queue.pending.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155727") ? false : (stryCov_9fa48("155727", "155728"), queue.pending.length === TRANSPORT_NUM.ZERO)))) {
      if (stryMutAct_9fa48("155729")) {
        {}
      } else {
        stryCov_9fa48("155729");
        return stryMutAct_9fa48("155730") ? ["Stryker was here"] : (stryCov_9fa48("155730"), []);
      }
    }
    const countsBySource = new Map();
    for (const item of queue.pending) {
      if (stryMutAct_9fa48("155731")) {
        {}
      } else {
        stryCov_9fa48("155731");
        const source = stryMutAct_9fa48("155734") ? normalizeIdentifier(item?.deliverySource) && 'unknown' : stryMutAct_9fa48("155733") ? false : stryMutAct_9fa48("155732") ? true : (stryCov_9fa48("155732", "155733", "155734"), normalizeIdentifier(stryMutAct_9fa48("155735") ? item.deliverySource : (stryCov_9fa48("155735"), item?.deliverySource)) || (stryMutAct_9fa48("155736") ? "" : (stryCov_9fa48("155736"), 'unknown')));
        countsBySource.set(source, stryMutAct_9fa48("155737") ? (countsBySource.get(source) || TRANSPORT_NUM.ZERO) - TRANSPORT_NUM.ONE : (stryCov_9fa48("155737"), (stryMutAct_9fa48("155740") ? countsBySource.get(source) && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155739") ? false : stryMutAct_9fa48("155738") ? true : (stryCov_9fa48("155738", "155739", "155740"), countsBySource.get(source) || TRANSPORT_NUM.ZERO)) + TRANSPORT_NUM.ONE));
      }
    }
    return stryMutAct_9fa48("155742") ? [...countsBySource.entries()].slice(TRANSPORT_NUM.ZERO, limit).map(([source, count]) => ({
      source,
      count
    })) : stryMutAct_9fa48("155741") ? [...countsBySource.entries()].sort((left, right) => right[TRANSPORT_NUM.ONE] - left[TRANSPORT_NUM.ONE] || left[TRANSPORT_NUM.ZERO].localeCompare(right[TRANSPORT_NUM.ZERO])).map(([source, count]) => ({
      source,
      count
    })) : (stryCov_9fa48("155741", "155742"), (stryMutAct_9fa48("155743") ? [] : (stryCov_9fa48("155743"), [...countsBySource.entries()])).sort(stryMutAct_9fa48("155744") ? () => undefined : (stryCov_9fa48("155744"), (left, right) => stryMutAct_9fa48("155747") ? right[TRANSPORT_NUM.ONE] - left[TRANSPORT_NUM.ONE] && left[TRANSPORT_NUM.ZERO].localeCompare(right[TRANSPORT_NUM.ZERO]) : stryMutAct_9fa48("155746") ? false : stryMutAct_9fa48("155745") ? true : (stryCov_9fa48("155745", "155746", "155747"), (stryMutAct_9fa48("155748") ? right[TRANSPORT_NUM.ONE] + left[TRANSPORT_NUM.ONE] : (stryCov_9fa48("155748"), right[TRANSPORT_NUM.ONE] - left[TRANSPORT_NUM.ONE])) || left[TRANSPORT_NUM.ZERO].localeCompare(right[TRANSPORT_NUM.ZERO])))).slice(TRANSPORT_NUM.ZERO, limit).map(stryMutAct_9fa48("155749") ? () => undefined : (stryCov_9fa48("155749"), ([source, count]) => stryMutAct_9fa48("155750") ? {} : (stryCov_9fa48("155750"), {
      source,
      count
    }))));
  }
}
function normalizeDeliveryOutcome(outcome) {
  if (stryMutAct_9fa48("155751")) {
    {}
  } else {
    stryCov_9fa48("155751");
    if (stryMutAct_9fa48("155754") ? outcome && typeof outcome === TRANSPORT_TYPEOF.OBJECT && Object.prototype.hasOwnProperty.call(outcome, MESSAGE_ROUTER_LITERAL.STRING_RESULT) || Object.prototype.hasOwnProperty.call(outcome, MESSAGE_ROUTER_LITERAL.STRING_QUEUEWAITMS) : stryMutAct_9fa48("155753") ? false : stryMutAct_9fa48("155752") ? true : (stryCov_9fa48("155752", "155753", "155754"), (stryMutAct_9fa48("155756") ? outcome && typeof outcome === TRANSPORT_TYPEOF.OBJECT || Object.prototype.hasOwnProperty.call(outcome, MESSAGE_ROUTER_LITERAL.STRING_RESULT) : stryMutAct_9fa48("155755") ? true : (stryCov_9fa48("155755", "155756"), (stryMutAct_9fa48("155758") ? outcome || typeof outcome === TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("155757") ? true : (stryCov_9fa48("155757", "155758"), outcome && (stryMutAct_9fa48("155760") ? typeof outcome !== TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("155759") ? true : (stryCov_9fa48("155759", "155760"), typeof outcome === TRANSPORT_TYPEOF.OBJECT)))) && Object.prototype.hasOwnProperty.call(outcome, MESSAGE_ROUTER_LITERAL.STRING_RESULT))) && Object.prototype.hasOwnProperty.call(outcome, MESSAGE_ROUTER_LITERAL.STRING_QUEUEWAITMS))) {
      if (stryMutAct_9fa48("155761")) {
        {}
      } else {
        stryCov_9fa48("155761");
        return stryMutAct_9fa48("155762") ? {} : (stryCov_9fa48("155762"), {
          result: outcome.result,
          queueWaitMs: Number.isFinite(outcome.queueWaitMs) ? stryMutAct_9fa48("155763") ? Math.min(TRANSPORT_NUM.ZERO, Math.floor(outcome.queueWaitMs)) : (stryCov_9fa48("155763"), Math.max(TRANSPORT_NUM.ZERO, Math.floor(outcome.queueWaitMs))) : TRANSPORT_NUM.ZERO
        });
      }
    }
    return stryMutAct_9fa48("155764") ? {} : (stryCov_9fa48("155764"), {
      result: outcome,
      queueWaitMs: TRANSPORT_NUM.ZERO
    });
  }
}
function normalizeRetryAfterMs(value, fallback) {
  if (stryMutAct_9fa48("155765")) {
    {}
  } else {
    stryCov_9fa48("155765");
    if (stryMutAct_9fa48("155768") ? Number.isFinite(value) || value > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155767") ? false : stryMutAct_9fa48("155766") ? true : (stryCov_9fa48("155766", "155767", "155768"), Number.isFinite(value) && (stryMutAct_9fa48("155771") ? value <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155770") ? value >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155769") ? true : (stryCov_9fa48("155769", "155770", "155771"), value > TRANSPORT_NUM.ZERO)))) {
      if (stryMutAct_9fa48("155772")) {
        {}
      } else {
        stryCov_9fa48("155772");
        return Math.floor(value);
      }
    }
    if (stryMutAct_9fa48("155775") ? Number.isFinite(fallback) || fallback > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155774") ? false : stryMutAct_9fa48("155773") ? true : (stryCov_9fa48("155773", "155774", "155775"), Number.isFinite(fallback) && (stryMutAct_9fa48("155778") ? fallback <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155777") ? fallback >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155776") ? true : (stryCov_9fa48("155776", "155777", "155778"), fallback > TRANSPORT_NUM.ZERO)))) {
      if (stryMutAct_9fa48("155779")) {
        {}
      } else {
        stryCov_9fa48("155779");
        return Math.floor(fallback);
      }
    }
    return TRANSPORT_NUM.ZERO;
  }
}
function buildSupersededPendingResult(replacedItem) {
  if (stryMutAct_9fa48("155780")) {
    {}
  } else {
    stryCov_9fa48("155780");
    return stryMutAct_9fa48("155781") ? {} : (stryCov_9fa48("155781"), {
      result: stryMutAct_9fa48("155782") ? {} : (stryCov_9fa48("155782"), {
        acknowledged: stryMutAct_9fa48("155783") ? false : (stryCov_9fa48("155783"), true),
        coalesced: stryMutAct_9fa48("155784") ? false : (stryCov_9fa48("155784"), true),
        replacedPending: stryMutAct_9fa48("155785") ? false : (stryCov_9fa48("155785"), true),
        deliverySource: stryMutAct_9fa48("155788") ? replacedItem?.deliverySource && null : stryMutAct_9fa48("155787") ? false : stryMutAct_9fa48("155786") ? true : (stryCov_9fa48("155786", "155787", "155788"), (stryMutAct_9fa48("155789") ? replacedItem.deliverySource : (stryCov_9fa48("155789"), replacedItem?.deliverySource)) || null)
      }),
      queueWaitMs: TRANSPORT_NUM.ZERO
    });
  }
}
function normalizeOutboundDeliveryPriority(priority) {
  if (stryMutAct_9fa48("155790")) {
    {}
  } else {
    stryCov_9fa48("155790");
    return (stryMutAct_9fa48("155793") ? priority !== OutboundDeliveryPriority.CRITICAL : stryMutAct_9fa48("155792") ? false : stryMutAct_9fa48("155791") ? true : (stryCov_9fa48("155791", "155792", "155793"), priority === OutboundDeliveryPriority.CRITICAL)) ? OutboundDeliveryPriority.CRITICAL : OutboundDeliveryPriority.BACKGROUND;
  }
}
function countPendingByPriority(queue, priority) {
  if (stryMutAct_9fa48("155794")) {
    {}
  } else {
    stryCov_9fa48("155794");
    if (stryMutAct_9fa48("155797") ? !queue && !Array.isArray(queue.pending) : stryMutAct_9fa48("155796") ? false : stryMutAct_9fa48("155795") ? true : (stryCov_9fa48("155795", "155796", "155797"), (stryMutAct_9fa48("155798") ? queue : (stryCov_9fa48("155798"), !queue)) || (stryMutAct_9fa48("155799") ? Array.isArray(queue.pending) : (stryCov_9fa48("155799"), !Array.isArray(queue.pending))))) {
      if (stryMutAct_9fa48("155800")) {
        {}
      } else {
        stryCov_9fa48("155800");
        return TRANSPORT_NUM.ZERO;
      }
    }
    return queue.pending.reduce((count, item) => {
      if (stryMutAct_9fa48("155801")) {
        {}
      } else {
        stryCov_9fa48("155801");
        return (stryMutAct_9fa48("155804") ? item?.priority !== priority : stryMutAct_9fa48("155803") ? false : stryMutAct_9fa48("155802") ? true : (stryCov_9fa48("155802", "155803", "155804"), (stryMutAct_9fa48("155805") ? item.priority : (stryCov_9fa48("155805"), item?.priority)) === priority)) ? stryMutAct_9fa48("155806") ? count - TRANSPORT_NUM.ONE : (stryCov_9fa48("155806"), count + TRANSPORT_NUM.ONE) : count;
      }
    }, TRANSPORT_NUM.ZERO);
  }
}
function resolveBackgroundPendingLimit(queue) {
  if (stryMutAct_9fa48("155807")) {
    {}
  } else {
    stryCov_9fa48("155807");
    if (stryMutAct_9fa48("155810") ? false : stryMutAct_9fa48("155809") ? true : stryMutAct_9fa48("155808") ? queue : (stryCov_9fa48("155808", "155809", "155810"), !queue)) {
      if (stryMutAct_9fa48("155811")) {
        {}
      } else {
        stryCov_9fa48("155811");
        return TRANSPORT_NUM.ZERO;
      }
    }
    const criticalReserve = (stryMutAct_9fa48("155814") ? Number.isFinite(queue.criticalReserve) || queue.criticalReserve > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155813") ? false : stryMutAct_9fa48("155812") ? true : (stryCov_9fa48("155812", "155813", "155814"), Number.isFinite(queue.criticalReserve) && (stryMutAct_9fa48("155817") ? queue.criticalReserve <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155816") ? queue.criticalReserve >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155815") ? true : (stryCov_9fa48("155815", "155816", "155817"), queue.criticalReserve > TRANSPORT_NUM.ZERO)))) ? queue.criticalReserve : TRANSPORT_NUM.ZERO;
    return stryMutAct_9fa48("155818") ? Math.min(TRANSPORT_NUM.ZERO, queue.maxPending - criticalReserve) : (stryCov_9fa48("155818"), Math.max(TRANSPORT_NUM.ZERO, stryMutAct_9fa48("155819") ? queue.maxPending + criticalReserve : (stryCov_9fa48("155819"), queue.maxPending - criticalReserve)));
  }
}
function dequeueNextPendingItem(queue) {
  if (stryMutAct_9fa48("155820")) {
    {}
  } else {
    stryCov_9fa48("155820");
    if (stryMutAct_9fa48("155823") ? (!queue || !Array.isArray(queue.pending)) && queue.pending.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155822") ? false : stryMutAct_9fa48("155821") ? true : (stryCov_9fa48("155821", "155822", "155823"), (stryMutAct_9fa48("155825") ? !queue && !Array.isArray(queue.pending) : stryMutAct_9fa48("155824") ? false : (stryCov_9fa48("155824", "155825"), (stryMutAct_9fa48("155826") ? queue : (stryCov_9fa48("155826"), !queue)) || (stryMutAct_9fa48("155827") ? Array.isArray(queue.pending) : (stryCov_9fa48("155827"), !Array.isArray(queue.pending))))) || (stryMutAct_9fa48("155829") ? queue.pending.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155828") ? false : (stryCov_9fa48("155828", "155829"), queue.pending.length === TRANSPORT_NUM.ZERO)))) {
      if (stryMutAct_9fa48("155830")) {
        {}
      } else {
        stryCov_9fa48("155830");
        return null;
      }
    }
    const criticalIndex = queue.pending.findIndex(item => {
      if (stryMutAct_9fa48("155831")) {
        {}
      } else {
        stryCov_9fa48("155831");
        return stryMutAct_9fa48("155834") ? item?.priority !== OutboundDeliveryPriority.CRITICAL : stryMutAct_9fa48("155833") ? false : stryMutAct_9fa48("155832") ? true : (stryCov_9fa48("155832", "155833", "155834"), (stryMutAct_9fa48("155835") ? item.priority : (stryCov_9fa48("155835"), item?.priority)) === OutboundDeliveryPriority.CRITICAL);
      }
    });
    if (stryMutAct_9fa48("155839") ? criticalIndex < TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155838") ? criticalIndex > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155837") ? false : stryMutAct_9fa48("155836") ? true : (stryCov_9fa48("155836", "155837", "155838", "155839"), criticalIndex >= TRANSPORT_NUM.ZERO)) {
      if (stryMutAct_9fa48("155840")) {
        {}
      } else {
        stryCov_9fa48("155840");
        return queue.pending.splice(criticalIndex, TRANSPORT_NUM.ONE)[TRANSPORT_NUM.ZERO];
      }
    }
    return queue.pending.shift();
  }
}

/**
 * MessageRouter provides unified message routing for both local and remote services.
 * - Local messages are delivered directly to registered handlers
 * - Remote messages are sent via WebSocket connections to other nodes
 */
class MessageRouter extends EventEmitter {
  /**
   * Create a new MessageRouter.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {string} options.nodeAddress - Local node address (for WebSocket server).
   * @param {number} options.wsPort - WebSocket server port.
   * @param {string} options.wsHost - Optional WebSocket bind host.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("155841")) {
      {}
    } else {
      stryCov_9fa48("155841");
      super();
      const nodeWsPort = stryMutAct_9fa48("155844") ? options.wsPort && TRANSPORT_DEFAULT.WS_PORT : stryMutAct_9fa48("155843") ? false : stryMutAct_9fa48("155842") ? true : (stryCov_9fa48("155842", "155843", "155844"), options.wsPort || TRANSPORT_DEFAULT.WS_PORT);
      this.nodeId = stryMutAct_9fa48("155847") ? options.nodeId && uuidv4() : stryMutAct_9fa48("155846") ? false : stryMutAct_9fa48("155845") ? true : (stryCov_9fa48("155845", "155846", "155847"), options.nodeId || uuidv4());
      this.nodeAddress = stryMutAct_9fa48("155850") ? options.nodeAddress && TRANSPORT_FORMAT.buildDefaultNodeAddress(nodeWsPort) : stryMutAct_9fa48("155849") ? false : stryMutAct_9fa48("155848") ? true : (stryCov_9fa48("155848", "155849", "155850"), options.nodeAddress || TRANSPORT_FORMAT.buildDefaultNodeAddress(nodeWsPort));
      this.advertisedAddress = stryMutAct_9fa48("155853") ? (options.advertisedAddress || normalizeToWebSocketAddress(this.nodeAddress)) && this.nodeAddress : stryMutAct_9fa48("155852") ? false : stryMutAct_9fa48("155851") ? true : (stryCov_9fa48("155851", "155852", "155853"), (stryMutAct_9fa48("155855") ? options.advertisedAddress && normalizeToWebSocketAddress(this.nodeAddress) : stryMutAct_9fa48("155854") ? false : (stryCov_9fa48("155854", "155855"), options.advertisedAddress || normalizeToWebSocketAddress(this.nodeAddress))) || this.nodeAddress);
      this.wsPort = stryMutAct_9fa48("155858") ? options.wsPort && null : stryMutAct_9fa48("155857") ? false : stryMutAct_9fa48("155856") ? true : (stryCov_9fa48("155856", "155857", "155858"), options.wsPort || null);
      this.routerId = uuidv4();
      this.identifyPayload = stryMutAct_9fa48("155861") ? options.identifyPayload && null : stryMutAct_9fa48("155860") ? false : stryMutAct_9fa48("155859") ? true : (stryCov_9fa48("155859", "155860", "155861"), options.identifyPayload || null);

      // Registered handlers (address -> handler function)
      // Handlers are invoked when messages arrive via WebSocket
      this.handlers = new Map();
      this.inProcess = stryMutAct_9fa48("155864") ? options.inProcess !== true : stryMutAct_9fa48("155863") ? false : stryMutAct_9fa48("155862") ? true : (stryCov_9fa48("155862", "155863", "155864"), options.inProcess === (stryMutAct_9fa48("155865") ? false : (stryCov_9fa48("155865"), true)));

      // Node connections (nodeId -> connection info)
      // Includes self-connection for local routing
      this.nodeConnections = new Map();

      // Pending messages awaiting acknowledgment
      this.pendingMessages = new Map();
      // Pending SERVICE_RESPONSE payloads awaiting handler completion.
      this.pendingResponses = new Map();
      // Recently retired response waiters kept briefly so one late response can
      // be absorbed without being misclassified as an orphaned transport fault.
      this.retiredPendingResponses = new Map();
      this.pendingPings = new Map();

      // Configuration
      const config = ConfigurationManager.getInstance();
      const configuredWsHost = config.get(TRANSPORT_CONFIG_KEY.WS_HOST);
      // Bind to localhost by default so tests (and local dev) don't require
      // listening on all interfaces (0.0.0.0), which can be disallowed in some
      // sandboxed environments. Production deployments can override via
      // `transport.wsHost` (e.g. 0.0.0.0).
      this.wsHost = stryMutAct_9fa48("155868") ? options.wsHost && (typeof configuredWsHost === TRANSPORT_TYPEOF.STRING && configuredWsHost.length > TRANSPORT_NUM.ZERO ? configuredWsHost : TRANSPORT_DEFAULT.WS_HOST) : stryMutAct_9fa48("155867") ? false : stryMutAct_9fa48("155866") ? true : (stryCov_9fa48("155866", "155867", "155868"), options.wsHost || ((stryMutAct_9fa48("155871") ? typeof configuredWsHost === TRANSPORT_TYPEOF.STRING || configuredWsHost.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155870") ? false : stryMutAct_9fa48("155869") ? true : (stryCov_9fa48("155869", "155870", "155871"), (stryMutAct_9fa48("155873") ? typeof configuredWsHost !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("155872") ? true : (stryCov_9fa48("155872", "155873"), typeof configuredWsHost === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("155876") ? configuredWsHost.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155875") ? configuredWsHost.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155874") ? true : (stryCov_9fa48("155874", "155875", "155876"), configuredWsHost.length > TRANSPORT_NUM.ZERO)))) ? configuredWsHost : TRANSPORT_DEFAULT.WS_HOST));
      this.messageTimeoutMs = stryMutAct_9fa48("155879") ? config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS) && TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS : stryMutAct_9fa48("155878") ? false : stryMutAct_9fa48("155877") ? true : (stryCov_9fa48("155877", "155878", "155879"), config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS) || TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS);
      this.ackTimeoutQuarantineThreshold = (stryMutAct_9fa48("155882") ? Number.isFinite(options.ackTimeoutQuarantineThreshold) || options.ackTimeoutQuarantineThreshold >= TRANSPORT_NUM.ONE : stryMutAct_9fa48("155881") ? false : stryMutAct_9fa48("155880") ? true : (stryCov_9fa48("155880", "155881", "155882"), Number.isFinite(options.ackTimeoutQuarantineThreshold) && (stryMutAct_9fa48("155885") ? options.ackTimeoutQuarantineThreshold < TRANSPORT_NUM.ONE : stryMutAct_9fa48("155884") ? options.ackTimeoutQuarantineThreshold > TRANSPORT_NUM.ONE : stryMutAct_9fa48("155883") ? true : (stryCov_9fa48("155883", "155884", "155885"), options.ackTimeoutQuarantineThreshold >= TRANSPORT_NUM.ONE)))) ? Math.floor(options.ackTimeoutQuarantineThreshold) : (stryMutAct_9fa48("155888") ? Number.isFinite(config.get(TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_THRESHOLD)) || config.get(TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_THRESHOLD) >= TRANSPORT_NUM.ONE : stryMutAct_9fa48("155887") ? false : stryMutAct_9fa48("155886") ? true : (stryCov_9fa48("155886", "155887", "155888"), Number.isFinite(config.get(TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_THRESHOLD)) && (stryMutAct_9fa48("155891") ? config.get(TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_THRESHOLD) < TRANSPORT_NUM.ONE : stryMutAct_9fa48("155890") ? config.get(TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_THRESHOLD) > TRANSPORT_NUM.ONE : stryMutAct_9fa48("155889") ? true : (stryCov_9fa48("155889", "155890", "155891"), config.get(TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_THRESHOLD) >= TRANSPORT_NUM.ONE)))) ? Math.floor(config.get(TRANSPORT_CONFIG_KEY.ACK_TIMEOUT_QUARANTINE_THRESHOLD)) : TRANSPORT_DEFAULT.ACK_TIMEOUT_QUARANTINE_THRESHOLD;
      const configuredConnectTimeoutMs = config.get(WEBSOCKET_CONNECT_TIMEOUT_CONFIG_KEY);
      this.connectTimeoutMs = (stryMutAct_9fa48("155894") ? Number.isFinite(options.connectTimeoutMs) || options.connectTimeoutMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155893") ? false : stryMutAct_9fa48("155892") ? true : (stryCov_9fa48("155892", "155893", "155894"), Number.isFinite(options.connectTimeoutMs) && (stryMutAct_9fa48("155897") ? options.connectTimeoutMs <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155896") ? options.connectTimeoutMs >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155895") ? true : (stryCov_9fa48("155895", "155896", "155897"), options.connectTimeoutMs > TRANSPORT_NUM.ZERO)))) ? Math.floor(options.connectTimeoutMs) : (stryMutAct_9fa48("155900") ? Number.isFinite(configuredConnectTimeoutMs) || configuredConnectTimeoutMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155899") ? false : stryMutAct_9fa48("155898") ? true : (stryCov_9fa48("155898", "155899", "155900"), Number.isFinite(configuredConnectTimeoutMs) && (stryMutAct_9fa48("155903") ? configuredConnectTimeoutMs <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155902") ? configuredConnectTimeoutMs >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155901") ? true : (stryCov_9fa48("155901", "155902", "155903"), configuredConnectTimeoutMs > TRANSPORT_NUM.ZERO)))) ? Math.floor(configuredConnectTimeoutMs) : this.messageTimeoutMs;
      this.pingTimeoutMs = stryMutAct_9fa48("155906") ? config.get(TRANSPORT_CONFIG_KEY.PING_TIMEOUT_MS) && TRANSPORT_DEFAULT.PING_TIMEOUT_MS : stryMutAct_9fa48("155905") ? false : stryMutAct_9fa48("155904") ? true : (stryCov_9fa48("155904", "155905", "155906"), config.get(TRANSPORT_CONFIG_KEY.PING_TIMEOUT_MS) || TRANSPORT_DEFAULT.PING_TIMEOUT_MS);
      this.reconnectIntervalMs = stryMutAct_9fa48("155909") ? config.get(TRANSPORT_CONFIG_KEY.RECONNECT_INTERVAL_MS) && TRANSPORT_DEFAULT.RECONNECT_INTERVAL_MS : stryMutAct_9fa48("155908") ? false : stryMutAct_9fa48("155907") ? true : (stryCov_9fa48("155907", "155908", "155909"), config.get(TRANSPORT_CONFIG_KEY.RECONNECT_INTERVAL_MS) || TRANSPORT_DEFAULT.RECONNECT_INTERVAL_MS);
      this.reconnectMaxAttempts = stryMutAct_9fa48("155912") ? config.get(TRANSPORT_CONFIG_KEY.RECONNECT_MAX_ATTEMPTS) && TRANSPORT_DEFAULT.RECONNECT_MAX_ATTEMPTS : stryMutAct_9fa48("155911") ? false : stryMutAct_9fa48("155910") ? true : (stryCov_9fa48("155910", "155911", "155912"), config.get(TRANSPORT_CONFIG_KEY.RECONNECT_MAX_ATTEMPTS) || TRANSPORT_DEFAULT.RECONNECT_MAX_ATTEMPTS);
      this.pingIntervalMs = stryMutAct_9fa48("155915") ? config.get(TRANSPORT_CONFIG_KEY.PING_INTERVAL_MS) && TRANSPORT_DEFAULT.PING_INTERVAL_MS : stryMutAct_9fa48("155914") ? false : stryMutAct_9fa48("155913") ? true : (stryCov_9fa48("155913", "155914", "155915"), config.get(TRANSPORT_CONFIG_KEY.PING_INTERVAL_MS) || TRANSPORT_DEFAULT.PING_INTERVAL_MS);
      this.reconnectBackoffMultiplier = stryMutAct_9fa48("155918") ? config.get(TRANSPORT_CONFIG_KEY.RECONNECT_BACKOFF_MULTIPLIER) && TRANSPORT_DEFAULT.RECONNECT_BACKOFF_MULTIPLIER : stryMutAct_9fa48("155917") ? false : stryMutAct_9fa48("155916") ? true : (stryCov_9fa48("155916", "155917", "155918"), config.get(TRANSPORT_CONFIG_KEY.RECONNECT_BACKOFF_MULTIPLIER) || TRANSPORT_DEFAULT.RECONNECT_BACKOFF_MULTIPLIER);
      const configuredMaxConcurrent = (stryMutAct_9fa48("155921") ? Number.isFinite(options.outboundQueueMaxConcurrent) || options.outboundQueueMaxConcurrent > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155920") ? false : stryMutAct_9fa48("155919") ? true : (stryCov_9fa48("155919", "155920", "155921"), Number.isFinite(options.outboundQueueMaxConcurrent) && (stryMutAct_9fa48("155924") ? options.outboundQueueMaxConcurrent <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155923") ? options.outboundQueueMaxConcurrent >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155922") ? true : (stryCov_9fa48("155922", "155923", "155924"), options.outboundQueueMaxConcurrent > TRANSPORT_NUM.ZERO)))) ? options.outboundQueueMaxConcurrent : config.get(TRANSPORT_CONFIG_KEY.OUTBOUND_QUEUE_MAX_CONCURRENT);
      this.outboundQueueMaxConcurrent = (stryMutAct_9fa48("155927") ? Number.isFinite(configuredMaxConcurrent) || configuredMaxConcurrent > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155926") ? false : stryMutAct_9fa48("155925") ? true : (stryCov_9fa48("155925", "155926", "155927"), Number.isFinite(configuredMaxConcurrent) && (stryMutAct_9fa48("155930") ? configuredMaxConcurrent <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155929") ? configuredMaxConcurrent >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155928") ? true : (stryCov_9fa48("155928", "155929", "155930"), configuredMaxConcurrent > TRANSPORT_NUM.ZERO)))) ? Math.floor(configuredMaxConcurrent) : TRANSPORT_DEFAULT.OUTBOUND_QUEUE_CONCURRENCY;
      const configuredMaxPending = (stryMutAct_9fa48("155933") ? Number.isFinite(options.outboundQueueMaxPending) || options.outboundQueueMaxPending >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155932") ? false : stryMutAct_9fa48("155931") ? true : (stryCov_9fa48("155931", "155932", "155933"), Number.isFinite(options.outboundQueueMaxPending) && (stryMutAct_9fa48("155936") ? options.outboundQueueMaxPending < TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155935") ? options.outboundQueueMaxPending > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155934") ? true : (stryCov_9fa48("155934", "155935", "155936"), options.outboundQueueMaxPending >= TRANSPORT_NUM.ZERO)))) ? options.outboundQueueMaxPending : config.get(TRANSPORT_CONFIG_KEY.OUTBOUND_QUEUE_MAX_PENDING);
      this.outboundQueueMaxPending = (stryMutAct_9fa48("155939") ? Number.isFinite(configuredMaxPending) || configuredMaxPending >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155938") ? false : stryMutAct_9fa48("155937") ? true : (stryCov_9fa48("155937", "155938", "155939"), Number.isFinite(configuredMaxPending) && (stryMutAct_9fa48("155942") ? configuredMaxPending < TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155941") ? configuredMaxPending > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155940") ? true : (stryCov_9fa48("155940", "155941", "155942"), configuredMaxPending >= TRANSPORT_NUM.ZERO)))) ? Math.floor(configuredMaxPending) : TRANSPORT_DEFAULT.OUTBOUND_QUEUE_MAX_PENDING;
      const configuredCriticalReserve = (stryMutAct_9fa48("155945") ? Number.isFinite(options.outboundQueueCriticalReserve) || options.outboundQueueCriticalReserve >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155944") ? false : stryMutAct_9fa48("155943") ? true : (stryCov_9fa48("155943", "155944", "155945"), Number.isFinite(options.outboundQueueCriticalReserve) && (stryMutAct_9fa48("155948") ? options.outboundQueueCriticalReserve < TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155947") ? options.outboundQueueCriticalReserve > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155946") ? true : (stryCov_9fa48("155946", "155947", "155948"), options.outboundQueueCriticalReserve >= TRANSPORT_NUM.ZERO)))) ? options.outboundQueueCriticalReserve : config.get(TRANSPORT_CONFIG_KEY.OUTBOUND_QUEUE_CRITICAL_RESERVE);
      const maxCriticalReserve = stryMutAct_9fa48("155949") ? Math.min(TRANSPORT_NUM.ZERO, this.outboundQueueMaxPending - TRANSPORT_NUM.ONE) : (stryCov_9fa48("155949"), Math.max(TRANSPORT_NUM.ZERO, stryMutAct_9fa48("155950") ? this.outboundQueueMaxPending + TRANSPORT_NUM.ONE : (stryCov_9fa48("155950"), this.outboundQueueMaxPending - TRANSPORT_NUM.ONE)));
      this.outboundQueueCriticalReserve = (stryMutAct_9fa48("155953") ? Number.isFinite(configuredCriticalReserve) || configuredCriticalReserve >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155952") ? false : stryMutAct_9fa48("155951") ? true : (stryCov_9fa48("155951", "155952", "155953"), Number.isFinite(configuredCriticalReserve) && (stryMutAct_9fa48("155956") ? configuredCriticalReserve < TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155955") ? configuredCriticalReserve > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155954") ? true : (stryCov_9fa48("155954", "155955", "155956"), configuredCriticalReserve >= TRANSPORT_NUM.ZERO)))) ? stryMutAct_9fa48("155957") ? Math.max(Math.floor(configuredCriticalReserve), maxCriticalReserve) : (stryCov_9fa48("155957"), Math.min(Math.floor(configuredCriticalReserve), maxCriticalReserve)) : stryMutAct_9fa48("155958") ? Math.max(TRANSPORT_DEFAULT.OUTBOUND_QUEUE_CRITICAL_RESERVE, maxCriticalReserve) : (stryCov_9fa48("155958"), Math.min(TRANSPORT_DEFAULT.OUTBOUND_QUEUE_CRITICAL_RESERVE, maxCriticalReserve));

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(TRANSPORT_SUBSYSTEM.ROUTER) : console;
      this.nowFn = (stryMutAct_9fa48("155961") ? typeof options.nowFn !== MESSAGE_ROUTER_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("155960") ? false : stryMutAct_9fa48("155959") ? true : (stryCov_9fa48("155959", "155960", "155961"), typeof options.nowFn === MESSAGE_ROUTER_LITERAL.STRING_FUNCTION)) ? options.nowFn : Date.now;
      this.unmatchedServiceResponseWarnIntervalMs = (stryMutAct_9fa48("155964") ? Number.isFinite(options.unmatchedServiceResponseWarnIntervalMs) || options.unmatchedServiceResponseWarnIntervalMs >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155963") ? false : stryMutAct_9fa48("155962") ? true : (stryCov_9fa48("155962", "155963", "155964"), Number.isFinite(options.unmatchedServiceResponseWarnIntervalMs) && (stryMutAct_9fa48("155967") ? options.unmatchedServiceResponseWarnIntervalMs < TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155966") ? options.unmatchedServiceResponseWarnIntervalMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155965") ? true : (stryCov_9fa48("155965", "155966", "155967"), options.unmatchedServiceResponseWarnIntervalMs >= TRANSPORT_NUM.ZERO)))) ? Math.floor(options.unmatchedServiceResponseWarnIntervalMs) : UNMATCHED_SERVICE_RESPONSE_WARN_INTERVAL_MS;
      this.lastUnmatchedServiceResponseWarnAtMs = null;
      this.unmatchedServiceResponseWarnSuppressedCount = TRANSPORT_NUM.ZERO;
      this.serviceResponseDispositionCounts = new Map();

      // State
      this.initialized = stryMutAct_9fa48("155968") ? true : (stryCov_9fa48("155968"), false);
      this.server = null;
      this.messageCount = TRANSPORT_NUM.ZERO;
      this.isShuttingDown = stryMutAct_9fa48("155969") ? true : (stryCov_9fa48("155969"), false);
      this.inProcessTransport = stryMutAct_9fa48("155970") ? true : (stryCov_9fa48("155970"), false);
      this.externalAdmissionEnabled = stryMutAct_9fa48("155973") ? options.externalAdmissionEnabled === false : stryMutAct_9fa48("155972") ? false : stryMutAct_9fa48("155971") ? true : (stryCov_9fa48("155971", "155972", "155973"), options.externalAdmissionEnabled !== (stryMutAct_9fa48("155974") ? true : (stryCov_9fa48("155974"), false)));

      // Per-node outbound delivery queues
      this.outboundQueues = new Map();

      // Metric sampling state for high-volume transport delivery logging.
      this.deliverMetricSampleByTarget = new Map();
      this.deliverMetricFaultSampleByTarget = new Map();
      this.deliverMetricQueueDepthByTarget = new Map();

      // Function to resolve service address to node ID
      this.resolveServiceNode = stryMutAct_9fa48("155977") ? options.resolveServiceNode && null : stryMutAct_9fa48("155976") ? false : stryMutAct_9fa48("155975") ? true : (stryCov_9fa48("155975", "155976", "155977"), options.resolveServiceNode || null);
      this.resolveNodeAddress = stryMutAct_9fa48("155980") ? options.resolveNodeAddress && null : stryMutAct_9fa48("155979") ? false : stryMutAct_9fa48("155978") ? true : (stryCov_9fa48("155978", "155979", "155980"), options.resolveNodeAddress || null);
      this.resolveQueryMessageGroupService = stryMutAct_9fa48("155983") ? options.resolveQueryMessageGroupService && null : stryMutAct_9fa48("155982") ? false : stryMutAct_9fa48("155981") ? true : (stryCov_9fa48("155981", "155982", "155983"), options.resolveQueryMessageGroupService || null);
      this.pendingNodeConnections = new Map();
      this.reconnectAddressSuppressionMs = (stryMutAct_9fa48("155986") ? Number.isFinite(options.reconnectAddressSuppressionMs) || options.reconnectAddressSuppressionMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155985") ? false : stryMutAct_9fa48("155984") ? true : (stryCov_9fa48("155984", "155985", "155986"), Number.isFinite(options.reconnectAddressSuppressionMs) && (stryMutAct_9fa48("155989") ? options.reconnectAddressSuppressionMs <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155988") ? options.reconnectAddressSuppressionMs >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("155987") ? true : (stryCov_9fa48("155987", "155988", "155989"), options.reconnectAddressSuppressionMs > TRANSPORT_NUM.ZERO)))) ? Math.floor(options.reconnectAddressSuppressionMs) : RECONNECT_ADDRESS_SUPPRESSION_DEFAULT_MS;
      this.suppressedReconnectAddresses = new Map();
    }
  }

  /**
   * Set optional payload to include with IDENTIFY messages.
   * @param {Object|null} payload - Additional identify payload.
   */
  setIdentificationPayload(payload) {
    if (stryMutAct_9fa48("155990")) {
      {}
    } else {
      stryCov_9fa48("155990");
      this.identifyPayload = stryMutAct_9fa48("155993") ? payload && null : stryMutAct_9fa48("155992") ? false : stryMutAct_9fa48("155991") ? true : (stryCov_9fa48("155991", "155992", "155993"), payload || null);
    }
  }

  /**
   * Toggle whether remote incoming node connections are admitted.
   * Self-connection remains allowed so local routing can initialize
   * before bootstrap/join ownership opens external transport.
   * @param {boolean} enabled
   * @return {void}
   */
  setExternalAdmissionEnabled(enabled) {
    if (stryMutAct_9fa48("155994")) {
      {}
    } else {
      stryCov_9fa48("155994");
      this.externalAdmissionEnabled = stryMutAct_9fa48("155997") ? enabled === false : stryMutAct_9fa48("155996") ? false : stryMutAct_9fa48("155995") ? true : (stryCov_9fa48("155995", "155996", "155997"), enabled !== (stryMutAct_9fa48("155998") ? true : (stryCov_9fa48("155998"), false)));
    }
  }

  /**
   * Return whether remote incoming node connections are currently admitted.
   * @return {boolean}
   */
  isExternalAdmissionEnabled() {
    if (stryMutAct_9fa48("155999")) {
      {}
    } else {
      stryCov_9fa48("155999");
      return stryMutAct_9fa48("156002") ? this.externalAdmissionEnabled !== true : stryMutAct_9fa48("156001") ? false : stryMutAct_9fa48("156000") ? true : (stryCov_9fa48("156000", "156001", "156002"), this.externalAdmissionEnabled === (stryMutAct_9fa48("156003") ? false : (stryCov_9fa48("156003"), true)));
    }
  }

  /**
   * Initialize the message router.
   * Starts WebSocket server and establishes self-connection for uniform routing.
   * Requirements: 2.2, 8.2
   * @param {Object} options - Initialization options.
   * @param {boolean} options.startServer - Whether to start WebSocket server.
   * @return {Promise<void>}
   */
  async initialize(options = {}) {
    if (stryMutAct_9fa48("156004")) {
      {}
    } else {
      stryCov_9fa48("156004");
      const shouldStartServer = stryMutAct_9fa48("156007") ? options.startServer === true || this.wsPort : stryMutAct_9fa48("156006") ? false : stryMutAct_9fa48("156005") ? true : (stryCov_9fa48("156005", "156006", "156007"), (stryMutAct_9fa48("156009") ? options.startServer !== true : stryMutAct_9fa48("156008") ? true : (stryCov_9fa48("156008", "156009"), options.startServer === (stryMutAct_9fa48("156010") ? false : (stryCov_9fa48("156010"), true)))) && this.wsPort);
      if (stryMutAct_9fa48("156012") ? false : stryMutAct_9fa48("156011") ? true : (stryCov_9fa48("156011", "156012"), this.initialized)) {
        if (stryMutAct_9fa48("156013")) {
          {}
        } else {
          stryCov_9fa48("156013");
          let startedServerNow = stryMutAct_9fa48("156014") ? true : (stryCov_9fa48("156014"), false);
          if (stryMutAct_9fa48("156017") ? shouldStartServer || !this.server : stryMutAct_9fa48("156016") ? false : stryMutAct_9fa48("156015") ? true : (stryCov_9fa48("156015", "156016", "156017"), shouldStartServer && (stryMutAct_9fa48("156018") ? this.server : (stryCov_9fa48("156018"), !this.server)))) {
            if (stryMutAct_9fa48("156019")) {
              {}
            } else {
              stryCov_9fa48("156019");
              await this.startServer();
              startedServerNow = stryMutAct_9fa48("156020") ? false : (stryCov_9fa48("156020"), true);
            }
          }
          if (stryMutAct_9fa48("156023") ? shouldStartServer || !this.hasSelfConnection() : stryMutAct_9fa48("156022") ? false : stryMutAct_9fa48("156021") ? true : (stryCov_9fa48("156021", "156022", "156023"), shouldStartServer && (stryMutAct_9fa48("156024") ? this.hasSelfConnection() : (stryCov_9fa48("156024"), !this.hasSelfConnection())))) {
            if (stryMutAct_9fa48("156025")) {
              {}
            } else {
              stryCov_9fa48("156025");
              try {
                if (stryMutAct_9fa48("156026")) {
                  {}
                } else {
                  stryCov_9fa48("156026");
                  await this.connectToSelf();
                }
              } catch (error) {
                if (stryMutAct_9fa48("156027")) {
                  {}
                } else {
                  stryCov_9fa48("156027");
                  if (stryMutAct_9fa48("156030") ? startedServerNow || this.server : stryMutAct_9fa48("156029") ? false : stryMutAct_9fa48("156028") ? true : (stryCov_9fa48("156028", "156029", "156030"), startedServerNow && this.server)) {
                    if (stryMutAct_9fa48("156031")) {
                      {}
                    } else {
                      stryCov_9fa48("156031");
                      await new Promise(stryMutAct_9fa48("156032") ? () => undefined : (stryCov_9fa48("156032"), resolve => this.server.close(resolve)));
                      this.server = null;
                    }
                  }
                  throw new Error(ROUTER_ERROR_MSG.selfConnectionFailed(error.message));
                }
              }
            }
          }
          return;
        }
      }
      this.isShuttingDown = stryMutAct_9fa48("156033") ? true : (stryCov_9fa48("156033"), false);
      this.logger.info(ROUTER_LOG_MSG.INITIALIZING, stryMutAct_9fa48("156034") ? {} : (stryCov_9fa48("156034"), {
        routerId: this.routerId,
        nodeId: this.nodeId,
        wsPort: this.wsPort,
        wsHost: this.wsHost
      }));

      // Start WebSocket server if port specified
      if (stryMutAct_9fa48("156036") ? false : stryMutAct_9fa48("156035") ? true : (stryCov_9fa48("156035", "156036"), shouldStartServer)) {
        if (stryMutAct_9fa48("156037")) {
          {}
        } else {
          stryCov_9fa48("156037");
          await this.startServer();

          // Establish self-connection for uniform message routing
          // All messages (local and remote) go through WebSocket
          try {
            if (stryMutAct_9fa48("156038")) {
              {}
            } else {
              stryCov_9fa48("156038");
              await this.connectToSelf();
            }
          } catch (error) {
            if (stryMutAct_9fa48("156039")) {
              {}
            } else {
              stryCov_9fa48("156039");
              this.logger.error(ROUTER_LOG_MSG.SELF_CONNECTION_FAILED, stryMutAct_9fa48("156040") ? {} : (stryCov_9fa48("156040"), {
                error: error.message,
                nodeId: this.nodeId
              }));
              // Clean up server if self-connection fails
              if (stryMutAct_9fa48("156042") ? false : stryMutAct_9fa48("156041") ? true : (stryCov_9fa48("156041", "156042"), this.server)) {
                if (stryMutAct_9fa48("156043")) {
                  {}
                } else {
                  stryCov_9fa48("156043");
                  await new Promise(stryMutAct_9fa48("156044") ? () => undefined : (stryCov_9fa48("156044"), resolve => this.server.close(resolve)));
                  this.server = null;
                }
              }
              throw new Error(ROUTER_ERROR_MSG.selfConnectionFailed(error.message));
            }
          }
        }
      }
      this.initialized = stryMutAct_9fa48("156045") ? false : (stryCov_9fa48("156045"), true);
      this.emit(TRANSPORT_EVENT.INITIALIZED, stryMutAct_9fa48("156046") ? {} : (stryCov_9fa48("156046"), {
        routerId: this.routerId,
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Start WebSocket server to accept incoming connections.
   * @return {Promise<void>}
   */
  async startServer() {
    if (stryMutAct_9fa48("156047")) {
      {}
    } else {
      stryCov_9fa48("156047");
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("156048")) {
          {}
        } else {
          stryCov_9fa48("156048");
          let settled = stryMutAct_9fa48("156049") ? true : (stryCov_9fa48("156049"), false);
          const resolveOnce = () => {
            if (stryMutAct_9fa48("156050")) {
              {}
            } else {
              stryCov_9fa48("156050");
              if (stryMutAct_9fa48("156053") ? false : stryMutAct_9fa48("156052") ? true : stryMutAct_9fa48("156051") ? settled : (stryCov_9fa48("156051", "156052", "156053"), !settled)) {
                if (stryMutAct_9fa48("156054")) {
                  {}
                } else {
                  stryCov_9fa48("156054");
                  settled = stryMutAct_9fa48("156055") ? false : (stryCov_9fa48("156055"), true);
                  resolve();
                }
              }
            }
          };
          const rejectOnce = error => {
            if (stryMutAct_9fa48("156056")) {
              {}
            } else {
              stryCov_9fa48("156056");
              if (stryMutAct_9fa48("156059") ? false : stryMutAct_9fa48("156058") ? true : stryMutAct_9fa48("156057") ? settled : (stryCov_9fa48("156057", "156058", "156059"), !settled)) {
                if (stryMutAct_9fa48("156060")) {
                  {}
                } else {
                  stryCov_9fa48("156060");
                  settled = stryMutAct_9fa48("156061") ? false : (stryCov_9fa48("156061"), true);
                  reject(error);
                }
              }
            }
          };
          try {
            if (stryMutAct_9fa48("156062")) {
              {}
            } else {
              stryCov_9fa48("156062");
              if (stryMutAct_9fa48("156064") ? false : stryMutAct_9fa48("156063") ? true : (stryCov_9fa48("156063", "156064"), this.inProcess)) {
                if (stryMutAct_9fa48("156065")) {
                  {}
                } else {
                  stryCov_9fa48("156065");
                  this.startInProcessServer();
                  resolveOnce();
                  return;
                }
              }
              const serverOptions = stryMutAct_9fa48("156066") ? {} : (stryCov_9fa48("156066"), {
                port: this.wsPort
              });
              if (stryMutAct_9fa48("156068") ? false : stryMutAct_9fa48("156067") ? true : (stryCov_9fa48("156067", "156068"), this.wsHost)) {
                if (stryMutAct_9fa48("156069")) {
                  {}
                } else {
                  stryCov_9fa48("156069");
                  serverOptions.host = this.wsHost;
                }
              }
              const wsServer = new WebSocketServer(serverOptions);
              this.server = wsServer;
              wsServer.on(TRANSPORT_EVENT.CONNECTION, (ws, req) => {
                if (stryMutAct_9fa48("156070")) {
                  {}
                } else {
                  stryCov_9fa48("156070");
                  this.handleIncomingConnection(ws, req);
                }
              });
              wsServer.on(TRANSPORT_EVENT.LISTENING, () => {
                if (stryMutAct_9fa48("156071")) {
                  {}
                } else {
                  stryCov_9fa48("156071");
                  this.logger.info(ROUTER_LOG_MSG.WS_SERVER_LISTENING, stryMutAct_9fa48("156072") ? {} : (stryCov_9fa48("156072"), {
                    port: this.wsPort,
                    routerId: this.routerId
                  }));
                  resolveOnce();
                }
              });
              wsServer.on(TRANSPORT_EVENT.ERROR, error => {
                if (stryMutAct_9fa48("156073")) {
                  {}
                } else {
                  stryCov_9fa48("156073");
                  this.logger.error(ROUTER_LOG_MSG.WS_SERVER_ERROR, stryMutAct_9fa48("156074") ? {} : (stryCov_9fa48("156074"), {
                    error: error.message,
                    routerId: this.routerId
                  }));
                  rejectOnce(error);
                }
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("156075")) {
              {}
            } else {
              stryCov_9fa48("156075");
              rejectOnce(error);
            }
          }
        }
      });
    }
  }

  /**
   * Start an in-process "server" registered by port for test-only transport.
   * @private
   */
  startInProcessServer() {
    if (stryMutAct_9fa48("156076")) {
      {}
    } else {
      stryCov_9fa48("156076");
      const portKey = Number(this.wsPort);
      if (stryMutAct_9fa48("156079") ? false : stryMutAct_9fa48("156078") ? true : stryMutAct_9fa48("156077") ? Number.isFinite(portKey) : (stryCov_9fa48("156077", "156078", "156079"), !Number.isFinite(portKey))) {
        if (stryMutAct_9fa48("156080")) {
          {}
        } else {
          stryCov_9fa48("156080");
          throw new Error(MESSAGE_ROUTER_LITERAL.STRING_INVALID_WSPORT_FOR_IN_PROCESS_SERVER);
        }
      }
      if (stryMutAct_9fa48("156082") ? false : stryMutAct_9fa48("156081") ? true : (stryCov_9fa48("156081", "156082"), INPROC.serversByPort.has(portKey))) {
        if (stryMutAct_9fa48("156083")) {
          {}
        } else {
          stryCov_9fa48("156083");
          const err = new Error(stryMutAct_9fa48("156084") ? `` : (stryCov_9fa48("156084"), `listen EADDRINUSE: address already in use 127.0.0.1:${portKey}`));
          err.code = MESSAGE_ROUTER_LITERAL.STRING_EADDRINUSE;
          throw err;
        }
      }
      this.inProcessTransport = stryMutAct_9fa48("156085") ? false : (stryCov_9fa48("156085"), true);
      INPROC.serversByPort.set(portKey, stryMutAct_9fa48("156086") ? {} : (stryCov_9fa48("156086"), {
        router: this,
        nodeId: this.nodeId
      }));

      // Minimal server-like object for diagnostics; shutdown() handles in-process servers separately.
      this.server = stryMutAct_9fa48("156087") ? {} : (stryCov_9fa48("156087"), {
        clients: new Set(),
        close: cb => {
          if (stryMutAct_9fa48("156088")) {
            {}
          } else {
            stryCov_9fa48("156088");
            INPROC.serversByPort.delete(portKey);
            stryMutAct_9fa48("156089") ? cb() : (stryCov_9fa48("156089"), cb?.());
          }
        }
      });
      this.logger.info(ROUTER_LOG_MSG.WS_SERVER_LISTENING, stryMutAct_9fa48("156090") ? {} : (stryCov_9fa48("156090"), {
        port: this.wsPort,
        routerId: this.routerId
      }));
    }
  }

  /**
   * Handle incoming WebSocket connection from another node.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} _req - HTTP request.
   * @private
   */
  handleIncomingConnection(ws, _req) {
    if (stryMutAct_9fa48("156091")) {
      {}
    } else {
      stryCov_9fa48("156091");
      const connectionId = uuidv4();
      const connectionInfo = stryMutAct_9fa48("156092") ? {} : (stryCov_9fa48("156092"), {
        connectionId,
        ws,
        state: ConnectionState.CONNECTED,
        nodeId: null,
        isIncoming: stryMutAct_9fa48("156093") ? false : (stryCov_9fa48("156093"), true),
        retired: stryMutAct_9fa48("156094") ? true : (stryCov_9fa48("156094"), false),
        createdAt: Date.now()
      });
      this.logger.debug(ROUTER_LOG_MSG.INCOMING_CONNECTION, stryMutAct_9fa48("156095") ? {} : (stryCov_9fa48("156095"), {
        connectionId,
        routerId: this.routerId
      }));

      // Set up message handler
      ws.on(TRANSPORT_EVENT.MESSAGE, data => {
        if (stryMutAct_9fa48("156096")) {
          {}
        } else {
          stryCov_9fa48("156096");
          this.handleMessage(stryMutAct_9fa48("156099") ? connectionInfo.nodeId && connectionId : stryMutAct_9fa48("156098") ? false : stryMutAct_9fa48("156097") ? true : (stryCov_9fa48("156097", "156098", "156099"), connectionInfo.nodeId || connectionId), ws, data);
        }
      });
      ws.on(TRANSPORT_EVENT.CLOSE, () => {
        if (stryMutAct_9fa48("156100")) {
          {}
        } else {
          stryCov_9fa48("156100");
          this.handleConnectionClose(stryMutAct_9fa48("156103") ? connectionInfo.nodeId && connectionId : stryMutAct_9fa48("156102") ? false : stryMutAct_9fa48("156101") ? true : (stryCov_9fa48("156101", "156102", "156103"), connectionInfo.nodeId || connectionId), connectionInfo.connectionId);
        }
      });
      ws.on(TRANSPORT_EVENT.ERROR, error => {
        if (stryMutAct_9fa48("156104")) {
          {}
        } else {
          stryCov_9fa48("156104");
          this.logger.error(ROUTER_LOG_MSG.WS_CONNECTION_ERROR, stryMutAct_9fa48("156105") ? {} : (stryCov_9fa48("156105"), {
            connectionId,
            error: error.message
          }));
        }
      });

      // Store connection temporarily until we know the peer node ID
      this.nodeConnections.set(connectionId, connectionInfo);
      this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, stryMutAct_9fa48("156106") ? {} : (stryCov_9fa48("156106"), {
        connectionId,
        incoming: stryMutAct_9fa48("156107") ? false : (stryCov_9fa48("156107"), true)
      }));
    }
  }

  /**
   * Connect to self via loopback.
   * This enables uniform routing for all messages - local and remote use the same path.
   * Requirements: 2.1, 2.4
   * @return {Promise<void>}
   */
  async connectToSelf() {
    if (stryMutAct_9fa48("156108")) {
      {}
    } else {
      stryCov_9fa48("156108");
      const selfAddress = this.buildSelfConnectionAddress();
      this.logger.debug(ROUTER_LOG_MSG.SELF_CONNECTION_START, stryMutAct_9fa48("156109") ? {} : (stryCov_9fa48("156109"), {
        nodeId: this.nodeId,
        address: selfAddress
      }));
      await this.connectToNode(this.nodeId, selfAddress, stryMutAct_9fa48("156110") ? {} : (stryCov_9fa48("156110"), {
        isSelfConnection: stryMutAct_9fa48("156111") ? false : (stryCov_9fa48("156111"), true)
      }));
    }
  }

  /**
   * Build WebSocket address for self-connection.
   * Uses bound server address when available to avoid localhost DNS family mismatch.
   * @return {string}
   * @private
   */
  buildSelfConnectionAddress() {
    if (stryMutAct_9fa48("156112")) {
      {}
    } else {
      stryCov_9fa48("156112");
      const host = this.resolveSelfConnectionHost();
      const normalizedHost = this.normalizeWebSocketHost(host);
      return TRANSPORT_FORMAT.buildWebSocketAddress(normalizedHost, this.wsPort);
    }
  }

  /**
   * Resolve host used for self-connection.
   * @return {string}
   * @private
   */
  resolveSelfConnectionHost() {
    if (stryMutAct_9fa48("156113")) {
      {}
    } else {
      stryCov_9fa48("156113");
      const configuredHost = stryMutAct_9fa48("156116") ? this.wsHost && TRANSPORT_DEFAULT.WS_HOST : stryMutAct_9fa48("156115") ? false : stryMutAct_9fa48("156114") ? true : (stryCov_9fa48("156114", "156115", "156116"), this.wsHost || TRANSPORT_DEFAULT.WS_HOST);
      const defaultHost = (stryMutAct_9fa48("156119") ? configuredHost === HOST.ANY && configuredHost === IPV6_ANY_HOST : stryMutAct_9fa48("156118") ? false : stryMutAct_9fa48("156117") ? true : (stryCov_9fa48("156117", "156118", "156119"), (stryMutAct_9fa48("156121") ? configuredHost !== HOST.ANY : stryMutAct_9fa48("156120") ? false : (stryCov_9fa48("156120", "156121"), configuredHost === HOST.ANY)) || (stryMutAct_9fa48("156123") ? configuredHost !== IPV6_ANY_HOST : stryMutAct_9fa48("156122") ? false : (stryCov_9fa48("156122", "156123"), configuredHost === IPV6_ANY_HOST)))) ? HOST.LOCALHOST : configuredHost;
      if (stryMutAct_9fa48("156126") ? !this.server && typeof this.server.address !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("156125") ? false : stryMutAct_9fa48("156124") ? true : (stryCov_9fa48("156124", "156125", "156126"), (stryMutAct_9fa48("156127") ? this.server : (stryCov_9fa48("156127"), !this.server)) || (stryMutAct_9fa48("156129") ? typeof this.server.address === TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("156128") ? false : (stryCov_9fa48("156128", "156129"), typeof this.server.address !== TRANSPORT_TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("156130")) {
          {}
        } else {
          stryCov_9fa48("156130");
          return defaultHost;
        }
      }
      const serverAddress = this.server.address();
      if (stryMutAct_9fa48("156133") ? !serverAddress && typeof serverAddress !== TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("156132") ? false : stryMutAct_9fa48("156131") ? true : (stryCov_9fa48("156131", "156132", "156133"), (stryMutAct_9fa48("156134") ? serverAddress : (stryCov_9fa48("156134"), !serverAddress)) || (stryMutAct_9fa48("156136") ? typeof serverAddress === TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("156135") ? false : (stryCov_9fa48("156135", "156136"), typeof serverAddress !== TRANSPORT_TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("156137")) {
          {}
        } else {
          stryCov_9fa48("156137");
          return defaultHost;
        }
      }
      const boundHost = serverAddress.address;
      if (stryMutAct_9fa48("156140") ? typeof boundHost !== TRANSPORT_TYPEOF.STRING && boundHost.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156139") ? false : stryMutAct_9fa48("156138") ? true : (stryCov_9fa48("156138", "156139", "156140"), (stryMutAct_9fa48("156142") ? typeof boundHost === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("156141") ? false : (stryCov_9fa48("156141", "156142"), typeof boundHost !== TRANSPORT_TYPEOF.STRING)) || (stryMutAct_9fa48("156144") ? boundHost.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156143") ? false : (stryCov_9fa48("156143", "156144"), boundHost.length === TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("156145")) {
          {}
        } else {
          stryCov_9fa48("156145");
          return defaultHost;
        }
      }
      if (stryMutAct_9fa48("156148") ? boundHost === HOST.ANY && boundHost === IPV6_ANY_HOST : stryMutAct_9fa48("156147") ? false : stryMutAct_9fa48("156146") ? true : (stryCov_9fa48("156146", "156147", "156148"), (stryMutAct_9fa48("156150") ? boundHost !== HOST.ANY : stryMutAct_9fa48("156149") ? false : (stryCov_9fa48("156149", "156150"), boundHost === HOST.ANY)) || (stryMutAct_9fa48("156152") ? boundHost !== IPV6_ANY_HOST : stryMutAct_9fa48("156151") ? false : (stryCov_9fa48("156151", "156152"), boundHost === IPV6_ANY_HOST)))) {
        if (stryMutAct_9fa48("156153")) {
          {}
        } else {
          stryCov_9fa48("156153");
          return defaultHost;
        }
      }
      return boundHost;
    }
  }

  /**
   * Normalize host for URL usage.
   * @param {string} host - Hostname or IP.
   * @return {string}
   * @private
   */
  normalizeWebSocketHost(host) {
    if (stryMutAct_9fa48("156154")) {
      {}
    } else {
      stryCov_9fa48("156154");
      if (stryMutAct_9fa48("156157") ? false : stryMutAct_9fa48("156156") ? true : stryMutAct_9fa48("156155") ? host.includes(MESSAGE_ROUTER_LITERAL.STRING_VALUE) : (stryCov_9fa48("156155", "156156", "156157"), !host.includes(MESSAGE_ROUTER_LITERAL.STRING_VALUE))) {
        if (stryMutAct_9fa48("156158")) {
          {}
        } else {
          stryCov_9fa48("156158");
          return host;
        }
      }
      if (stryMutAct_9fa48("156161") ? host.startsWith(IPV6_HOST_PREFIX) || host.endsWith(IPV6_HOST_SUFFIX) : stryMutAct_9fa48("156160") ? false : stryMutAct_9fa48("156159") ? true : (stryCov_9fa48("156159", "156160", "156161"), (stryMutAct_9fa48("156162") ? host.endsWith(IPV6_HOST_PREFIX) : (stryCov_9fa48("156162"), host.startsWith(IPV6_HOST_PREFIX))) && (stryMutAct_9fa48("156163") ? host.startsWith(IPV6_HOST_SUFFIX) : (stryCov_9fa48("156163"), host.endsWith(IPV6_HOST_SUFFIX))))) {
        if (stryMutAct_9fa48("156164")) {
          {}
        } else {
          stryCov_9fa48("156164");
          return host;
        }
      }
      return stryMutAct_9fa48("156165") ? `` : (stryCov_9fa48("156165"), `${IPV6_HOST_PREFIX}${host}${IPV6_HOST_SUFFIX}`);
    }
  }

  /**
   * Extract one websocket port from an address.
   * @param {string|null} address
   * @return {number|null}
   * @private
   */
  extractWebSocketPort(address) {
    if (stryMutAct_9fa48("156166")) {
      {}
    } else {
      stryCov_9fa48("156166");
      if (stryMutAct_9fa48("156169") ? typeof address !== TRANSPORT_TYPEOF.STRING && address.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156168") ? false : stryMutAct_9fa48("156167") ? true : (stryCov_9fa48("156167", "156168", "156169"), (stryMutAct_9fa48("156171") ? typeof address === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("156170") ? false : (stryCov_9fa48("156170", "156171"), typeof address !== TRANSPORT_TYPEOF.STRING)) || (stryMutAct_9fa48("156173") ? address.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156172") ? false : (stryCov_9fa48("156172", "156173"), address.length === TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("156174")) {
          {}
        } else {
          stryCov_9fa48("156174");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("156175")) {
          {}
        } else {
          stryCov_9fa48("156175");
          const parsed = new URL(address);
          const port = Number(parsed.port);
          return (stryMutAct_9fa48("156178") ? Number.isFinite(port) || port > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156177") ? false : stryMutAct_9fa48("156176") ? true : (stryCov_9fa48("156176", "156177", "156178"), Number.isFinite(port) && (stryMutAct_9fa48("156181") ? port <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156180") ? port >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156179") ? true : (stryCov_9fa48("156179", "156180", "156181"), port > TRANSPORT_NUM.ZERO)))) ? port : null;
        }
      } catch {
        if (stryMutAct_9fa48("156182")) {
          {}
        } else {
          stryCov_9fa48("156182");
          return null;
        }
      }
    }
  }

  /**
   * Build a directly-routable websocket address from an observed socket IP.
   * @param {WebSocket|null} ws
   * @param {string|null} candidateAddress
   * @return {string|null}
   * @private
   */
  buildObservedReconnectAddress(ws, candidateAddress = null) {
    if (stryMutAct_9fa48("156183")) {
      {}
    } else {
      stryCov_9fa48("156183");
      const observedHost = stryMutAct_9fa48("156185") ? ws._socket?.remoteAddress : stryMutAct_9fa48("156184") ? ws?._socket.remoteAddress : (stryCov_9fa48("156184", "156185"), ws?._socket?.remoteAddress);
      if (stryMutAct_9fa48("156188") ? typeof observedHost !== TRANSPORT_TYPEOF.STRING && observedHost.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156187") ? false : stryMutAct_9fa48("156186") ? true : (stryCov_9fa48("156186", "156187", "156188"), (stryMutAct_9fa48("156190") ? typeof observedHost === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("156189") ? false : (stryCov_9fa48("156189", "156190"), typeof observedHost !== TRANSPORT_TYPEOF.STRING)) || (stryMutAct_9fa48("156192") ? observedHost.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156191") ? false : (stryCov_9fa48("156191", "156192"), observedHost.length === TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("156193")) {
          {}
        } else {
          stryCov_9fa48("156193");
          return null;
        }
      }
      const port = stryMutAct_9fa48("156196") ? (this.extractWebSocketPort(candidateAddress) || Number(ws?._socket?.remotePort)) && null : stryMutAct_9fa48("156195") ? false : stryMutAct_9fa48("156194") ? true : (stryCov_9fa48("156194", "156195", "156196"), (stryMutAct_9fa48("156198") ? this.extractWebSocketPort(candidateAddress) && Number(ws?._socket?.remotePort) : stryMutAct_9fa48("156197") ? false : (stryCov_9fa48("156197", "156198"), this.extractWebSocketPort(candidateAddress) || Number(stryMutAct_9fa48("156200") ? ws._socket?.remotePort : stryMutAct_9fa48("156199") ? ws?._socket.remotePort : (stryCov_9fa48("156199", "156200"), ws?._socket?.remotePort)))) || null);
      if (stryMutAct_9fa48("156203") ? !Number.isFinite(port) && port <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156202") ? false : stryMutAct_9fa48("156201") ? true : (stryCov_9fa48("156201", "156202", "156203"), (stryMutAct_9fa48("156204") ? Number.isFinite(port) : (stryCov_9fa48("156204"), !Number.isFinite(port))) || (stryMutAct_9fa48("156207") ? port > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156206") ? port < TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156205") ? false : (stryCov_9fa48("156205", "156206", "156207"), port <= TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("156208")) {
          {}
        } else {
          stryCov_9fa48("156208");
          return null;
        }
      }
      return TRANSPORT_FORMAT.buildWebSocketAddress(this.normalizeWebSocketHost(observedHost), port);
    }
  }

  /**
   * Remember the most directly-routable reconnect address observed for one
   * connection while retaining the configured resolver address as fallback.
   * @param {Object|null} connectionInfo
   * @param {WebSocket|null} ws
   * @param {string|null} candidateAddress
   * @return {void}
   * @private
   */
  rememberReconnectAddress(connectionInfo, ws, candidateAddress = null) {
    if (stryMutAct_9fa48("156209")) {
      {}
    } else {
      stryCov_9fa48("156209");
      if (stryMutAct_9fa48("156212") ? !connectionInfo && typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("156211") ? false : stryMutAct_9fa48("156210") ? true : (stryCov_9fa48("156210", "156211", "156212"), (stryMutAct_9fa48("156213") ? connectionInfo : (stryCov_9fa48("156213"), !connectionInfo)) || (stryMutAct_9fa48("156215") ? typeof connectionInfo === TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("156214") ? false : (stryCov_9fa48("156214", "156215"), typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("156216")) {
          {}
        } else {
          stryCov_9fa48("156216");
          return;
        }
      }
      const normalizedCandidateAddress = stryMutAct_9fa48("156219") ? normalizeToWebSocketAddress(candidateAddress) && candidateAddress : stryMutAct_9fa48("156218") ? false : stryMutAct_9fa48("156217") ? true : (stryCov_9fa48("156217", "156218", "156219"), normalizeToWebSocketAddress(candidateAddress) || candidateAddress);
      if (stryMutAct_9fa48("156222") ? typeof candidateAddress === TRANSPORT_TYPEOF.STRING && candidateAddress.length > TRANSPORT_NUM.ZERO || !connectionInfo.configuredAddress || connectionInfo.configuredAddress.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156221") ? false : stryMutAct_9fa48("156220") ? true : (stryCov_9fa48("156220", "156221", "156222"), (stryMutAct_9fa48("156224") ? typeof candidateAddress === TRANSPORT_TYPEOF.STRING || candidateAddress.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156223") ? true : (stryCov_9fa48("156223", "156224"), (stryMutAct_9fa48("156226") ? typeof candidateAddress !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("156225") ? true : (stryCov_9fa48("156225", "156226"), typeof candidateAddress === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("156229") ? candidateAddress.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156228") ? candidateAddress.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156227") ? true : (stryCov_9fa48("156227", "156228", "156229"), candidateAddress.length > TRANSPORT_NUM.ZERO)))) && (stryMutAct_9fa48("156231") ? !connectionInfo.configuredAddress && connectionInfo.configuredAddress.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156230") ? true : (stryCov_9fa48("156230", "156231"), (stryMutAct_9fa48("156232") ? connectionInfo.configuredAddress : (stryCov_9fa48("156232"), !connectionInfo.configuredAddress)) || (stryMutAct_9fa48("156234") ? connectionInfo.configuredAddress.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156233") ? false : (stryCov_9fa48("156233", "156234"), connectionInfo.configuredAddress.length === TRANSPORT_NUM.ZERO)))))) {
        if (stryMutAct_9fa48("156235")) {
          {}
        } else {
          stryCov_9fa48("156235");
          connectionInfo.configuredAddress = normalizedCandidateAddress;
        }
      }
      const observedAddress = this.buildObservedReconnectAddress(ws, normalizedCandidateAddress);
      if (stryMutAct_9fa48("156238") ? typeof observedAddress === TRANSPORT_TYPEOF.STRING || observedAddress.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156237") ? false : stryMutAct_9fa48("156236") ? true : (stryCov_9fa48("156236", "156237", "156238"), (stryMutAct_9fa48("156240") ? typeof observedAddress !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("156239") ? true : (stryCov_9fa48("156239", "156240"), typeof observedAddress === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("156243") ? observedAddress.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156242") ? observedAddress.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156241") ? true : (stryCov_9fa48("156241", "156242", "156243"), observedAddress.length > TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("156244")) {
          {}
        } else {
          stryCov_9fa48("156244");
          connectionInfo.observedAddress = observedAddress;
          connectionInfo.address = observedAddress;
          return;
        }
      }
      if (stryMutAct_9fa48("156247") ? typeof normalizedCandidateAddress === TRANSPORT_TYPEOF.STRING || normalizedCandidateAddress.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156246") ? false : stryMutAct_9fa48("156245") ? true : (stryCov_9fa48("156245", "156246", "156247"), (stryMutAct_9fa48("156249") ? typeof normalizedCandidateAddress !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("156248") ? true : (stryCov_9fa48("156248", "156249"), typeof normalizedCandidateAddress === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("156252") ? normalizedCandidateAddress.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156251") ? normalizedCandidateAddress.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156250") ? true : (stryCov_9fa48("156250", "156251", "156252"), normalizedCandidateAddress.length > TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("156253")) {
          {}
        } else {
          stryCov_9fa48("156253");
          connectionInfo.address = normalizedCandidateAddress;
        }
      }
    }
  }

  /**
   * Clear an armed reconnect timer for one connection.
   * @param {Object|null} connectionInfo
   * @return {void}
   * @private
   */
  clearReconnectTimeout(connectionInfo) {
    if (stryMutAct_9fa48("156254")) {
      {}
    } else {
      stryCov_9fa48("156254");
      if (stryMutAct_9fa48("156257") ? false : stryMutAct_9fa48("156256") ? true : stryMutAct_9fa48("156255") ? connectionInfo?.reconnectTimeout : (stryCov_9fa48("156255", "156256", "156257"), !(stryMutAct_9fa48("156258") ? connectionInfo.reconnectTimeout : (stryCov_9fa48("156258"), connectionInfo?.reconnectTimeout)))) {
        if (stryMutAct_9fa48("156259")) {
          {}
        } else {
          stryCov_9fa48("156259");
          if (stryMutAct_9fa48("156261") ? false : stryMutAct_9fa48("156260") ? true : (stryCov_9fa48("156260", "156261"), connectionInfo)) {
            if (stryMutAct_9fa48("156262")) {
              {}
            } else {
              stryCov_9fa48("156262");
              connectionInfo.reconnectDueAt = null;
            }
          }
          return;
        }
      }
      clearTimeout(connectionInfo.reconnectTimeout);
      connectionInfo.reconnectTimeout = null;
      connectionInfo.reconnectDueAt = null;
    }
  }

  /**
   * Clear one heartbeat interval.
   * @param {Object|null} connectionInfo
   * @return {void}
   * @private
   */
  clearPingInterval(connectionInfo) {
    if (stryMutAct_9fa48("156263")) {
      {}
    } else {
      stryCov_9fa48("156263");
      if (stryMutAct_9fa48("156266") ? false : stryMutAct_9fa48("156265") ? true : stryMutAct_9fa48("156264") ? connectionInfo?.pingInterval : (stryCov_9fa48("156264", "156265", "156266"), !(stryMutAct_9fa48("156267") ? connectionInfo.pingInterval : (stryCov_9fa48("156267"), connectionInfo?.pingInterval)))) {
        if (stryMutAct_9fa48("156268")) {
          {}
        } else {
          stryCov_9fa48("156268");
          return;
        }
      }
      clearInterval(connectionInfo.pingInterval);
      connectionInfo.pingInterval = null;
    }
  }

  /**
   * Retire a superseded connection object so it stops reconnecting.
   * @param {Object|null} connectionInfo
   * @return {void}
   * @private
   */
  retireConnection(connectionInfo) {
    if (stryMutAct_9fa48("156269")) {
      {}
    } else {
      stryCov_9fa48("156269");
      if (stryMutAct_9fa48("156272") ? !connectionInfo && typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("156271") ? false : stryMutAct_9fa48("156270") ? true : (stryCov_9fa48("156270", "156271", "156272"), (stryMutAct_9fa48("156273") ? connectionInfo : (stryCov_9fa48("156273"), !connectionInfo)) || (stryMutAct_9fa48("156275") ? typeof connectionInfo === TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("156274") ? false : (stryCov_9fa48("156274", "156275"), typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("156276")) {
          {}
        } else {
          stryCov_9fa48("156276");
          return;
        }
      }
      connectionInfo.retired = stryMutAct_9fa48("156277") ? false : (stryCov_9fa48("156277"), true);
      this.clearReconnectTimeout(connectionInfo);
      this.clearPingInterval(connectionInfo);
    }
  }

  /**
   * Return whether a connection object is still the active entry for its peer.
   * @param {Object|null} connectionInfo
   * @return {boolean}
   * @private
   */
  isCurrentConnection(connectionInfo) {
    if (stryMutAct_9fa48("156278")) {
      {}
    } else {
      stryCov_9fa48("156278");
      if (stryMutAct_9fa48("156281") ? !connectionInfo && typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("156280") ? false : stryMutAct_9fa48("156279") ? true : (stryCov_9fa48("156279", "156280", "156281"), (stryMutAct_9fa48("156282") ? connectionInfo : (stryCov_9fa48("156282"), !connectionInfo)) || (stryMutAct_9fa48("156284") ? typeof connectionInfo === TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("156283") ? false : (stryCov_9fa48("156283", "156284"), typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("156285")) {
          {}
        } else {
          stryCov_9fa48("156285");
          return stryMutAct_9fa48("156286") ? true : (stryCov_9fa48("156286"), false);
        }
      }
      return stryMutAct_9fa48("156289") ? this.nodeConnections.get(connectionInfo.nodeId) !== connectionInfo : stryMutAct_9fa48("156288") ? false : stryMutAct_9fa48("156287") ? true : (stryCov_9fa48("156287", "156288", "156289"), this.nodeConnections.get(connectionInfo.nodeId) === connectionInfo);
    }
  }

  /**
   * Connect to a remote node via WebSocket.
   * @param {string} nodeId - Remote node ID.
   * @param {string} address - Remote node WebSocket address.
   * @param {Object} options - Connection options.
   * @param {boolean} options.isSelfConnection - Whether this is a self-connection.
   * @return {Promise<void>}
   */
  async connectToNode(nodeId, address, options = {}) {
    if (stryMutAct_9fa48("156290")) {
      {}
    } else {
      stryCov_9fa48("156290");
      // Check if already connected
      if (stryMutAct_9fa48("156292") ? false : stryMutAct_9fa48("156291") ? true : (stryCov_9fa48("156291", "156292"), this.nodeConnections.has(nodeId))) {
        if (stryMutAct_9fa48("156293")) {
          {}
        } else {
          stryCov_9fa48("156293");
          const existing = this.nodeConnections.get(nodeId);
          if (stryMutAct_9fa48("156296") ? existing.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("156295") ? false : stryMutAct_9fa48("156294") ? true : (stryCov_9fa48("156294", "156295", "156296"), existing.state === ConnectionState.CONNECTED)) {
            if (stryMutAct_9fa48("156297")) {
              {}
            } else {
              stryCov_9fa48("156297");
              this.logger.debug(ROUTER_LOG_MSG.ALREADY_CONNECTED, stryMutAct_9fa48("156298") ? {} : (stryCov_9fa48("156298"), {
                nodeId
              }));
              return;
            }
          }
        }
      }
      this.logger.debug(ROUTER_LOG_MSG.CONNECTING, stryMutAct_9fa48("156299") ? {} : (stryCov_9fa48("156299"), {
        nodeId,
        address,
        routerId: this.routerId
      }));
      const normalizedAddress = stryMutAct_9fa48("156302") ? normalizeToWebSocketAddress(address) && address : stryMutAct_9fa48("156301") ? false : stryMutAct_9fa48("156300") ? true : (stryCov_9fa48("156300", "156301", "156302"), normalizeToWebSocketAddress(address) || address);
      const existing = stryMutAct_9fa48("156305") ? this.nodeConnections.get(nodeId) && null : stryMutAct_9fa48("156304") ? false : stryMutAct_9fa48("156303") ? true : (stryCov_9fa48("156303", "156304", "156305"), this.nodeConnections.get(nodeId) || null);
      if (stryMutAct_9fa48("156307") ? false : stryMutAct_9fa48("156306") ? true : (stryCov_9fa48("156306", "156307"), existing)) {
        if (stryMutAct_9fa48("156308")) {
          {}
        } else {
          stryCov_9fa48("156308");
          this.refreshReconnectAuthority(existing, normalizedAddress);
          this.retireConnection(existing);
        }
      }
      const configuredAddress = stryMutAct_9fa48("156311") ? this.resolveCanonicalReconnectAddress(nodeId, normalizedAddress) && normalizedAddress : stryMutAct_9fa48("156310") ? false : stryMutAct_9fa48("156309") ? true : (stryCov_9fa48("156309", "156310", "156311"), this.resolveCanonicalReconnectAddress(nodeId, normalizedAddress) || normalizedAddress);
      const connectionInfo = stryMutAct_9fa48("156312") ? {} : (stryCov_9fa48("156312"), {
        connectionId: uuidv4(),
        nodeId,
        address: normalizedAddress,
        configuredAddress,
        observedAddress: stryMutAct_9fa48("156315") ? existing?.observedAddress && null : stryMutAct_9fa48("156314") ? false : stryMutAct_9fa48("156313") ? true : (stryCov_9fa48("156313", "156314", "156315"), (stryMutAct_9fa48("156316") ? existing.observedAddress : (stryCov_9fa48("156316"), existing?.observedAddress)) || null),
        ws: null,
        state: ConnectionState.CONNECTING,
        reconnectAttempts: TRANSPORT_NUM.ZERO,
        reconnectTimeout: null,
        reconnectDueAt: null,
        isIncoming: stryMutAct_9fa48("156317") ? true : (stryCov_9fa48("156317"), false),
        isSelfConnection: stryMutAct_9fa48("156320") ? options.isSelfConnection && false : stryMutAct_9fa48("156319") ? false : stryMutAct_9fa48("156318") ? true : (stryCov_9fa48("156318", "156319", "156320"), options.isSelfConnection || (stryMutAct_9fa48("156321") ? true : (stryCov_9fa48("156321"), false))),
        ackTimeoutStreak: TRANSPORT_NUM.ZERO,
        lastAckAt: null,
        lastAckTimeoutAt: null,
        retired: stryMutAct_9fa48("156322") ? true : (stryCov_9fa48("156322"), false),
        createdAt: Date.now()
      });
      this.nodeConnections.set(nodeId, connectionInfo);
      await this.establishConnection(connectionInfo);
    }
  }

  /**
   * Establish WebSocket connection to a remote node.
   * @param {Object} connectionInfo - Connection information.
   * @return {Promise<void>}
   * @private
   */
  async establishConnection(connectionInfo) {
    if (stryMutAct_9fa48("156323")) {
      {}
    } else {
      stryCov_9fa48("156323");
      if (stryMutAct_9fa48("156325") ? false : stryMutAct_9fa48("156324") ? true : (stryCov_9fa48("156324", "156325"), this.inProcessTransport)) {
        if (stryMutAct_9fa48("156326")) {
          {}
        } else {
          stryCov_9fa48("156326");
          return this.establishInProcessConnection(connectionInfo);
        }
      }
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("156327")) {
          {}
        } else {
          stryCov_9fa48("156327");
          let settled = stryMutAct_9fa48("156328") ? true : (stryCov_9fa48("156328"), false);
          try {
            if (stryMutAct_9fa48("156329")) {
              {}
            } else {
              stryCov_9fa48("156329");
              const ws = new WebSocket(connectionInfo.address);
              let connectionEstablished = stryMutAct_9fa48("156330") ? true : (stryCov_9fa48("156330"), false);
              const clearConnectTimeout = () => {
                if (stryMutAct_9fa48("156331")) {
                  {}
                } else {
                  stryCov_9fa48("156331");
                  if (stryMutAct_9fa48("156333") ? false : stryMutAct_9fa48("156332") ? true : (stryCov_9fa48("156332", "156333"), connectTimeout)) {
                    if (stryMutAct_9fa48("156334")) {
                      {}
                    } else {
                      stryCov_9fa48("156334");
                      clearTimeout(connectTimeout);
                      connectTimeout = null;
                    }
                  }
                }
              };
              const rejectPendingConnection = error => {
                if (stryMutAct_9fa48("156335")) {
                  {}
                } else {
                  stryCov_9fa48("156335");
                  if (stryMutAct_9fa48("156337") ? false : stryMutAct_9fa48("156336") ? true : (stryCov_9fa48("156336", "156337"), settled)) {
                    if (stryMutAct_9fa48("156338")) {
                      {}
                    } else {
                      stryCov_9fa48("156338");
                      return;
                    }
                  }
                  settled = stryMutAct_9fa48("156339") ? false : (stryCov_9fa48("156339"), true);
                  clearConnectTimeout();
                  connectionInfo.state = ConnectionState.DISCONNECTED;
                  connectionInfo.ws = null;
                  reject(error);
                }
              };
              let connectTimeout = setTimeout(() => {
                if (stryMutAct_9fa48("156340")) {
                  {}
                } else {
                  stryCov_9fa48("156340");
                  const error = new Error(stryMutAct_9fa48("156341") ? `` : (stryCov_9fa48("156341"), `WebSocket connection timeout after ${this.connectTimeoutMs}ms`));
                  error.code = WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE;
                  rejectPendingConnection(error);
                  try {
                    if (stryMutAct_9fa48("156342")) {
                      {}
                    } else {
                      stryCov_9fa48("156342");
                      ws.terminate();
                    }
                  } catch {
                    // Best-effort cleanup for stalled handshakes.
                  }
                }
              }, this.connectTimeoutMs);
              if (stryMutAct_9fa48("156345") ? typeof connectTimeout?.unref !== MESSAGE_ROUTER_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("156344") ? false : stryMutAct_9fa48("156343") ? true : (stryCov_9fa48("156343", "156344", "156345"), typeof (stryMutAct_9fa48("156346") ? connectTimeout.unref : (stryCov_9fa48("156346"), connectTimeout?.unref)) === MESSAGE_ROUTER_LITERAL.STRING_FUNCTION)) {
                if (stryMutAct_9fa48("156347")) {
                  {}
                } else {
                  stryCov_9fa48("156347");
                  connectTimeout.unref();
                }
              }
              ws.on(TRANSPORT_EVENT.OPEN, () => {
                if (stryMutAct_9fa48("156348")) {
                  {}
                } else {
                  stryCov_9fa48("156348");
                  if (stryMutAct_9fa48("156350") ? false : stryMutAct_9fa48("156349") ? true : (stryCov_9fa48("156349", "156350"), settled)) {
                    if (stryMutAct_9fa48("156351")) {
                      {}
                    } else {
                      stryCov_9fa48("156351");
                      return;
                    }
                  }
                  if (stryMutAct_9fa48("156354") ? !connectionInfo.isSelfConnection || !this.isCurrentConnection(connectionInfo) : stryMutAct_9fa48("156353") ? false : stryMutAct_9fa48("156352") ? true : (stryCov_9fa48("156352", "156353", "156354"), (stryMutAct_9fa48("156355") ? connectionInfo.isSelfConnection : (stryCov_9fa48("156355"), !connectionInfo.isSelfConnection)) && (stryMutAct_9fa48("156356") ? this.isCurrentConnection(connectionInfo) : (stryCov_9fa48("156356"), !this.isCurrentConnection(connectionInfo))))) {
                    if (stryMutAct_9fa48("156357")) {
                      {}
                    } else {
                      stryCov_9fa48("156357");
                      settled = stryMutAct_9fa48("156358") ? false : (stryCov_9fa48("156358"), true);
                      clearConnectTimeout();
                      connectionInfo.state = ConnectionState.CLOSED;
                      connectionInfo.ws = null;
                      try {
                        if (stryMutAct_9fa48("156359")) {
                          {}
                        } else {
                          stryCov_9fa48("156359");
                          ws.terminate();
                        }
                      } catch {
                        // Best-effort cleanup for a superseded handshake.
                      }
                      resolve();
                      return;
                    }
                  }
                  settled = stryMutAct_9fa48("156360") ? false : (stryCov_9fa48("156360"), true);
                  connectionEstablished = stryMutAct_9fa48("156361") ? false : (stryCov_9fa48("156361"), true);
                  clearConnectTimeout();
                  connectionInfo.ws = ws;
                  connectionInfo.state = ConnectionState.CONNECTED;
                  connectionInfo.reconnectAttempts = TRANSPORT_NUM.ZERO;
                  connectionInfo.reconnectDueAt = null;
                  connectionInfo.ackTimeoutStreak = TRANSPORT_NUM.ZERO;
                  connectionInfo.lastAckTimeoutAt = null;
                  this.rememberReconnectAddress(connectionInfo, ws, connectionInfo.address);
                  this.logger.info(ROUTER_LOG_MSG.CONNECTED, stryMutAct_9fa48("156362") ? {} : (stryCov_9fa48("156362"), {
                    nodeId: connectionInfo.nodeId,
                    address: connectionInfo.address
                  }));

                  // Send identification message
                  this.sendIdentification(connectionInfo);

                  // Start ping interval
                  this.startPingInterval(connectionInfo);
                  this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, stryMutAct_9fa48("156363") ? {} : (stryCov_9fa48("156363"), {
                    nodeId: connectionInfo.nodeId,
                    connectionId: connectionInfo.connectionId
                  }));
                  resolve();
                }
              });
              ws.on(TRANSPORT_EVENT.MESSAGE, data => {
                if (stryMutAct_9fa48("156364")) {
                  {}
                } else {
                  stryCov_9fa48("156364");
                  this.handleMessage(connectionInfo.nodeId, ws, data);
                }
              });
              ws.on(TRANSPORT_EVENT.CLOSE, () => {
                if (stryMutAct_9fa48("156365")) {
                  {}
                } else {
                  stryCov_9fa48("156365");
                  if (stryMutAct_9fa48("156368") ? false : stryMutAct_9fa48("156367") ? true : stryMutAct_9fa48("156366") ? connectionEstablished : (stryCov_9fa48("156366", "156367", "156368"), !connectionEstablished)) {
                    if (stryMutAct_9fa48("156369")) {
                      {}
                    } else {
                      stryCov_9fa48("156369");
                      if (stryMutAct_9fa48("156372") ? false : stryMutAct_9fa48("156371") ? true : stryMutAct_9fa48("156370") ? settled : (stryCov_9fa48("156370", "156371", "156372"), !settled)) {
                        if (stryMutAct_9fa48("156373")) {
                          {}
                        } else {
                          stryCov_9fa48("156373");
                          rejectPendingConnection(new Error(stryMutAct_9fa48("156374") ? MESSAGE_ROUTER_LITERAL.STRING_WEBSOCKET_CONNECTION_CLOSED_BEFORE_OPEN_FOR_NODE - connectionInfo.nodeId : (stryCov_9fa48("156374"), MESSAGE_ROUTER_LITERAL.STRING_WEBSOCKET_CONNECTION_CLOSED_BEFORE_OPEN_FOR_NODE + connectionInfo.nodeId)));
                        }
                      }
                      return;
                    }
                  }
                  this.handleConnectionClose(connectionInfo.nodeId, connectionInfo.connectionId);
                }
              });
              ws.on(TRANSPORT_EVENT.ERROR, error => {
                if (stryMutAct_9fa48("156375")) {
                  {}
                } else {
                  stryCov_9fa48("156375");
                  this.logger.error(ROUTER_LOG_MSG.WS_ERROR, stryMutAct_9fa48("156376") ? {} : (stryCov_9fa48("156376"), {
                    nodeId: connectionInfo.nodeId,
                    error: error.message
                  }));
                  if (stryMutAct_9fa48("156379") ? !connectionEstablished || connectionInfo.state === ConnectionState.CONNECTING : stryMutAct_9fa48("156378") ? false : stryMutAct_9fa48("156377") ? true : (stryCov_9fa48("156377", "156378", "156379"), (stryMutAct_9fa48("156380") ? connectionEstablished : (stryCov_9fa48("156380"), !connectionEstablished)) && (stryMutAct_9fa48("156382") ? connectionInfo.state !== ConnectionState.CONNECTING : stryMutAct_9fa48("156381") ? true : (stryCov_9fa48("156381", "156382"), connectionInfo.state === ConnectionState.CONNECTING)))) {
                    if (stryMutAct_9fa48("156383")) {
                      {}
                    } else {
                      stryCov_9fa48("156383");
                      rejectPendingConnection(error);
                    }
                  }
                }
              });
            }
          } catch (error) {
            if (stryMutAct_9fa48("156384")) {
              {}
            } else {
              stryCov_9fa48("156384");
              connectionInfo.state = ConnectionState.DISCONNECTED;
              reject(error);
            }
          }
        }
      });
    }
  }

  /**
   * Establish a duplex in-process connection to a router registered on the target port.
   * @param {Object} connectionInfo - Connection information.
   * @return {Promise<void>}
   * @private
   */
  async establishInProcessConnection(connectionInfo) {
    if (stryMutAct_9fa48("156385")) {
      {}
    } else {
      stryCov_9fa48("156385");
      const url = new URL(connectionInfo.address);
      const portKey = Number(url.port);
      const target = INPROC.serversByPort.get(portKey);
      if (stryMutAct_9fa48("156388") ? false : stryMutAct_9fa48("156387") ? true : stryMutAct_9fa48("156386") ? target?.router : (stryCov_9fa48("156386", "156387", "156388"), !(stryMutAct_9fa48("156389") ? target.router : (stryCov_9fa48("156389"), target?.router)))) {
        if (stryMutAct_9fa48("156390")) {
          {}
        } else {
          stryCov_9fa48("156390");
          const err = new Error(stryMutAct_9fa48("156391") ? `` : (stryCov_9fa48("156391"), `connect ECONNREFUSED ${connectionInfo.address}`));
          err.code = MESSAGE_ROUTER_LITERAL.STRING_ECONNREFUSED;
          throw err;
        }
      }
      const {
        a: clientWs,
        b: serverWs
      } = createInProcWebSocketPair();

      // Track the server-side ws so shutdown() can terminate it if needed.
      if (stryMutAct_9fa48("156394") ? this.server.clients : stryMutAct_9fa48("156393") ? false : stryMutAct_9fa48("156392") ? true : (stryCov_9fa48("156392", "156393", "156394"), this.server?.clients)) {
        if (stryMutAct_9fa48("156395")) {
          {}
        } else {
          stryCov_9fa48("156395");
          this.server.clients.add(serverWs);
        }
      }

      // Simulate server accepting incoming connection.
      target.router.handleIncomingConnection(serverWs, null);

      // Simulate the client-side "open" behavior from establishConnection().
      // Wire up client-side handlers so ACKs, pings, and service messages can flow back.
      clientWs.on(TRANSPORT_EVENT.MESSAGE, data => {
        if (stryMutAct_9fa48("156396")) {
          {}
        } else {
          stryCov_9fa48("156396");
          this.handleMessage(connectionInfo.nodeId, clientWs, data);
        }
      });
      clientWs.on(TRANSPORT_EVENT.CLOSE, () => {
        if (stryMutAct_9fa48("156397")) {
          {}
        } else {
          stryCov_9fa48("156397");
          this.handleConnectionClose(connectionInfo.nodeId, connectionInfo.connectionId);
        }
      });
      clientWs.on(TRANSPORT_EVENT.ERROR, error => {
        if (stryMutAct_9fa48("156398")) {
          {}
        } else {
          stryCov_9fa48("156398");
          this.logger.error(ROUTER_LOG_MSG.WS_ERROR, stryMutAct_9fa48("156399") ? {} : (stryCov_9fa48("156399"), {
            nodeId: connectionInfo.nodeId,
            error: stryMutAct_9fa48("156402") ? error?.message && String(error) : stryMutAct_9fa48("156401") ? false : stryMutAct_9fa48("156400") ? true : (stryCov_9fa48("156400", "156401", "156402"), (stryMutAct_9fa48("156403") ? error.message : (stryCov_9fa48("156403"), error?.message)) || String(error))
          }));
        }
      });
      if (stryMutAct_9fa48("156406") ? !connectionInfo.isSelfConnection || !this.isCurrentConnection(connectionInfo) : stryMutAct_9fa48("156405") ? false : stryMutAct_9fa48("156404") ? true : (stryCov_9fa48("156404", "156405", "156406"), (stryMutAct_9fa48("156407") ? connectionInfo.isSelfConnection : (stryCov_9fa48("156407"), !connectionInfo.isSelfConnection)) && (stryMutAct_9fa48("156408") ? this.isCurrentConnection(connectionInfo) : (stryCov_9fa48("156408"), !this.isCurrentConnection(connectionInfo))))) {
        if (stryMutAct_9fa48("156409")) {
          {}
        } else {
          stryCov_9fa48("156409");
          connectionInfo.state = ConnectionState.CLOSED;
          clientWs.terminate();
          return;
        }
      }
      connectionInfo.ws = clientWs;
      connectionInfo.state = ConnectionState.CONNECTED;
      connectionInfo.reconnectAttempts = TRANSPORT_NUM.ZERO;
      connectionInfo.reconnectDueAt = null;
      connectionInfo.ackTimeoutStreak = TRANSPORT_NUM.ZERO;
      connectionInfo.lastAckTimeoutAt = null;
      this.rememberReconnectAddress(connectionInfo, clientWs, connectionInfo.address);
      this.logger.info(ROUTER_LOG_MSG.CONNECTED, stryMutAct_9fa48("156410") ? {} : (stryCov_9fa48("156410"), {
        nodeId: connectionInfo.nodeId,
        address: connectionInfo.address
      }));
      this.sendIdentification(connectionInfo);
      this.startPingInterval(connectionInfo);
      this.emit(TRANSPORT_EVENT.CONNECTION_ESTABLISHED, stryMutAct_9fa48("156411") ? {} : (stryCov_9fa48("156411"), {
        nodeId: connectionInfo.nodeId,
        connectionId: connectionInfo.connectionId
      }));
    }
  }

  /**
   * Send identification message to remote node.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  sendIdentification(connectionInfo) {
    if (stryMutAct_9fa48("156412")) {
      {}
    } else {
      stryCov_9fa48("156412");
      const message = stryMutAct_9fa48("156413") ? {} : (stryCov_9fa48("156413"), {
        type: RouterMessageType.IDENTIFY,
        nodeId: this.nodeId,
        nodeAddress: this.advertisedAddress,
        address: this.advertisedAddress,
        timestamp: Date.now()
      });
      if (stryMutAct_9fa48("156416") ? this.identifyPayload || !connectionInfo.isSelfConnection : stryMutAct_9fa48("156415") ? false : stryMutAct_9fa48("156414") ? true : (stryCov_9fa48("156414", "156415", "156416"), this.identifyPayload && (stryMutAct_9fa48("156417") ? connectionInfo.isSelfConnection : (stryCov_9fa48("156417"), !connectionInfo.isSelfConnection)))) {
        if (stryMutAct_9fa48("156418")) {
          {}
        } else {
          stryCov_9fa48("156418");
          message.bootstrap = this.identifyPayload;
        }
      }
      this.sendRaw(connectionInfo.ws, message);
    }
  }

  /**
   * Handle incoming message from WebSocket.
   * @param {string} connectionId - Connection or node ID.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Buffer|string} data - Message data.
   * @private
   */
  handleMessage(connectionId, ws, data) {
    if (stryMutAct_9fa48("156419")) {
      {}
    } else {
      stryCov_9fa48("156419");
      try {
        if (stryMutAct_9fa48("156420")) {
          {}
        } else {
          stryCov_9fa48("156420");
          const message = JSON.parse(data.toString());
          this.logger.debug(ROUTER_LOG_MSG.MESSAGE_RECEIVED, stryMutAct_9fa48("156421") ? {} : (stryCov_9fa48("156421"), {
            connectionId,
            type: message.type,
            messageId: message.messageId
          }));

          // Handle identification
          if (stryMutAct_9fa48("156424") ? message.type !== RouterMessageType.IDENTIFY : stryMutAct_9fa48("156423") ? false : stryMutAct_9fa48("156422") ? true : (stryCov_9fa48("156422", "156423", "156424"), message.type === RouterMessageType.IDENTIFY)) {
            if (stryMutAct_9fa48("156425")) {
              {}
            } else {
              stryCov_9fa48("156425");
              this.handleIdentification(connectionId, ws, message);
              return;
            }
          }

          // Handle ping/pong
          if (stryMutAct_9fa48("156428") ? message.type !== RouterMessageType.PING : stryMutAct_9fa48("156427") ? false : stryMutAct_9fa48("156426") ? true : (stryCov_9fa48("156426", "156427", "156428"), message.type === RouterMessageType.PING)) {
            if (stryMutAct_9fa48("156429")) {
              {}
            } else {
              stryCov_9fa48("156429");
              this.sendRaw(ws, stryMutAct_9fa48("156430") ? {} : (stryCov_9fa48("156430"), {
                type: RouterMessageType.PONG,
                pingId: stryMutAct_9fa48("156433") ? message.pingId && null : stryMutAct_9fa48("156432") ? false : stryMutAct_9fa48("156431") ? true : (stryCov_9fa48("156431", "156432", "156433"), message.pingId || null),
                timestamp: Date.now()
              }));
              return;
            }
          }
          if (stryMutAct_9fa48("156436") ? message.type !== RouterMessageType.PONG : stryMutAct_9fa48("156435") ? false : stryMutAct_9fa48("156434") ? true : (stryCov_9fa48("156434", "156435", "156436"), message.type === RouterMessageType.PONG)) {
            if (stryMutAct_9fa48("156437")) {
              {}
            } else {
              stryCov_9fa48("156437");
              if (stryMutAct_9fa48("156440") ? message.pingId || this.pendingPings.has(message.pingId) : stryMutAct_9fa48("156439") ? false : stryMutAct_9fa48("156438") ? true : (stryCov_9fa48("156438", "156439", "156440"), message.pingId && this.pendingPings.has(message.pingId))) {
                if (stryMutAct_9fa48("156441")) {
                  {}
                } else {
                  stryCov_9fa48("156441");
                  const pending = this.pendingPings.get(message.pingId);
                  clearTimeout(pending.timeout);
                  this.pendingPings.delete(message.pingId);
                  pending.resolve(stryMutAct_9fa48("156442") ? false : (stryCov_9fa48("156442"), true));
                }
              }
              return;
            }
          }

          // Handle acknowledgment
          if (stryMutAct_9fa48("156445") ? message.type !== RouterMessageType.ACK : stryMutAct_9fa48("156444") ? false : stryMutAct_9fa48("156443") ? true : (stryCov_9fa48("156443", "156444", "156445"), message.type === RouterMessageType.ACK)) {
            if (stryMutAct_9fa48("156446")) {
              {}
            } else {
              stryCov_9fa48("156446");
              this.handleAcknowledgment(message);
              return;
            }
          }
          if (stryMutAct_9fa48("156449") ? message.type !== RouterMessageType.SERVICE_RESPONSE : stryMutAct_9fa48("156448") ? false : stryMutAct_9fa48("156447") ? true : (stryCov_9fa48("156447", "156448", "156449"), message.type === RouterMessageType.SERVICE_RESPONSE)) {
            if (stryMutAct_9fa48("156450")) {
              {}
            } else {
              stryCov_9fa48("156450");
              this.handleServiceResponse(message);
              return;
            }
          }

          // Handle service message
          if (stryMutAct_9fa48("156453") ? message.type !== RouterMessageType.SERVICE_MESSAGE : stryMutAct_9fa48("156452") ? false : stryMutAct_9fa48("156451") ? true : (stryCov_9fa48("156451", "156452", "156453"), message.type === RouterMessageType.SERVICE_MESSAGE)) {
            if (stryMutAct_9fa48("156454")) {
              {}
            } else {
              stryCov_9fa48("156454");
              this.handleServiceMessage(ws, message);
              return;
            }
          }

          // Unknown message type
          this.logger.warn(ROUTER_LOG_MSG.MESSAGE_UNKNOWN, stryMutAct_9fa48("156455") ? {} : (stryCov_9fa48("156455"), {
            type: message.type,
            connectionId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("156456")) {
          {}
        } else {
          stryCov_9fa48("156456");
          this.logger.error(ROUTER_LOG_MSG.MESSAGE_PARSE_FAILED, stryMutAct_9fa48("156457") ? {} : (stryCov_9fa48("156457"), {
            connectionId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Handle identification message from remote node.
   * @param {string} connectionId - Connection ID.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Identification message.
   * @private
   */
  handleIdentification(connectionId, ws, message) {
    if (stryMutAct_9fa48("156458")) {
      {}
    } else {
      stryCov_9fa48("156458");
      const nodeId = stryMutAct_9fa48("156459") ? message.nodeId : (stryCov_9fa48("156459"), message?.nodeId);
      const nodeAddress = stryMutAct_9fa48("156462") ? message?.nodeAddress && message?.address : stryMutAct_9fa48("156461") ? false : stryMutAct_9fa48("156460") ? true : (stryCov_9fa48("156460", "156461", "156462"), (stryMutAct_9fa48("156463") ? message.nodeAddress : (stryCov_9fa48("156463"), message?.nodeAddress)) || (stryMutAct_9fa48("156464") ? message.address : (stryCov_9fa48("156464"), message?.address)));
      if (stryMutAct_9fa48("156467") ? !nodeId && !nodeAddress : stryMutAct_9fa48("156466") ? false : stryMutAct_9fa48("156465") ? true : (stryCov_9fa48("156465", "156466", "156467"), (stryMutAct_9fa48("156468") ? nodeId : (stryCov_9fa48("156468"), !nodeId)) || (stryMutAct_9fa48("156469") ? nodeAddress : (stryCov_9fa48("156469"), !nodeAddress)))) {
        if (stryMutAct_9fa48("156470")) {
          {}
        } else {
          stryCov_9fa48("156470");
          this.logger.warn(ROUTER_LOG_MSG.IDENTIFICATION_MISSING_FIELDS, stryMutAct_9fa48("156471") ? {} : (stryCov_9fa48("156471"), {
            connectionId,
            hasNodeId: stryMutAct_9fa48("156472") ? !nodeId : (stryCov_9fa48("156472"), !(stryMutAct_9fa48("156473") ? nodeId : (stryCov_9fa48("156473"), !nodeId))),
            hasNodeAddress: stryMutAct_9fa48("156474") ? !nodeAddress : (stryCov_9fa48("156474"), !(stryMutAct_9fa48("156475") ? nodeAddress : (stryCov_9fa48("156475"), !nodeAddress)))
          }));
          try {
            if (stryMutAct_9fa48("156476")) {
              {}
            } else {
              stryCov_9fa48("156476");
              ws.close();
            }
          } catch (error) {
            if (stryMutAct_9fa48("156477")) {
              {}
            } else {
              stryCov_9fa48("156477");
              this.logger.warn(ROUTER_LOG_MSG.FAILED_CLOSE_UNIDENTIFIED, stryMutAct_9fa48("156478") ? {} : (stryCov_9fa48("156478"), {
                connectionId,
                error: error.message
              }));
              throw error;
            }
          }
          return;
        }
      }
      this.logger.info(ROUTER_LOG_MSG.IDENTIFICATION_RECEIVED, stryMutAct_9fa48("156479") ? {} : (stryCov_9fa48("156479"), {
        connectionId,
        remoteNodeId: nodeId,
        remoteNodeAddress: nodeAddress,
        localNodeId: this.nodeId,
        existingConnectionForNode: this.nodeConnections.has(nodeId)
      }));

      // Update connection with node ID
      const connection = this.nodeConnections.get(connectionId);
      if (stryMutAct_9fa48("156482") ? connection || connection.isIncoming : stryMutAct_9fa48("156481") ? false : stryMutAct_9fa48("156480") ? true : (stryCov_9fa48("156480", "156481", "156482"), connection && connection.isIncoming)) {
        if (stryMutAct_9fa48("156483")) {
          {}
        } else {
          stryCov_9fa48("156483");
          if (stryMutAct_9fa48("156486") ? !this.externalAdmissionEnabled || nodeId !== this.nodeId : stryMutAct_9fa48("156485") ? false : stryMutAct_9fa48("156484") ? true : (stryCov_9fa48("156484", "156485", "156486"), (stryMutAct_9fa48("156487") ? this.externalAdmissionEnabled : (stryCov_9fa48("156487"), !this.externalAdmissionEnabled)) && (stryMutAct_9fa48("156489") ? nodeId === this.nodeId : stryMutAct_9fa48("156488") ? true : (stryCov_9fa48("156488", "156489"), nodeId !== this.nodeId)))) {
            if (stryMutAct_9fa48("156490")) {
              {}
            } else {
              stryCov_9fa48("156490");
              connection.state = ConnectionState.CLOSED;
              this.retireConnection(connection);
              this.nodeConnections.delete(connectionId);
              this.logger.info(MESSAGE_ROUTER_LITERAL.STRING_REJECTING_INCOMING_CONNECTION_WHILE_EXTERNAL_ADMISSION_IS_CLOSED, stryMutAct_9fa48("156491") ? {} : (stryCov_9fa48("156491"), {
                connectionId,
                remoteNodeId: nodeId,
                localNodeId: this.nodeId
              }));
              try {
                if (stryMutAct_9fa48("156492")) {
                  {}
                } else {
                  stryCov_9fa48("156492");
                  ws.close();
                }
              } catch (error) {
                if (stryMutAct_9fa48("156493")) {
                  {}
                } else {
                  stryCov_9fa48("156493");
                  this.logger.warn(ROUTER_LOG_MSG.FAILED_CLOSE_UNIDENTIFIED, stryMutAct_9fa48("156494") ? {} : (stryCov_9fa48("156494"), {
                    connectionId,
                    error: error.message
                  }));
                }
              }
              return;
            }
          }
          const normalizedAddress = stryMutAct_9fa48("156497") ? normalizeToWebSocketAddress(nodeAddress) && nodeAddress : stryMutAct_9fa48("156496") ? false : stryMutAct_9fa48("156495") ? true : (stryCov_9fa48("156495", "156496", "156497"), normalizeToWebSocketAddress(nodeAddress) || nodeAddress);
          connection.nodeId = nodeId;
          connection.nodeAddress = normalizedAddress;
          connection.configuredAddress = normalizedAddress;
          this.rememberReconnectAddress(connection, ws, normalizedAddress);
          const existing = this.nodeConnections.get(nodeId);
          const isSelfConnection = stryMutAct_9fa48("156500") ? existing?.isSelfConnection || nodeId === this.nodeId : stryMutAct_9fa48("156499") ? false : stryMutAct_9fa48("156498") ? true : (stryCov_9fa48("156498", "156499", "156500"), (stryMutAct_9fa48("156501") ? existing.isSelfConnection : (stryCov_9fa48("156501"), existing?.isSelfConnection)) && (stryMutAct_9fa48("156503") ? nodeId !== this.nodeId : stryMutAct_9fa48("156502") ? true : (stryCov_9fa48("156502", "156503"), nodeId === this.nodeId)));
          const existingConnected = stryMutAct_9fa48("156506") ? Boolean(existing) || existing.state === ConnectionState.CONNECTED : stryMutAct_9fa48("156505") ? false : stryMutAct_9fa48("156504") ? true : (stryCov_9fa48("156504", "156505", "156506"), Boolean(existing) && (stryMutAct_9fa48("156508") ? existing.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("156507") ? true : (stryCov_9fa48("156507", "156508"), existing.state === ConnectionState.CONNECTED)));
          const preferIncomingConnection = stryMutAct_9fa48("156512") ? this.nodeId.localeCompare(nodeId) <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156511") ? this.nodeId.localeCompare(nodeId) >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156510") ? false : stryMutAct_9fa48("156509") ? true : (stryCov_9fa48("156509", "156510", "156511", "156512"), this.nodeId.localeCompare(nodeId) > TRANSPORT_NUM.ZERO);
          const existingPreferredIncomingConnection = stryMutAct_9fa48("156515") ? existingConnected && preferIncomingConnection || existing?.isIncoming === true : stryMutAct_9fa48("156514") ? false : stryMutAct_9fa48("156513") ? true : (stryCov_9fa48("156513", "156514", "156515"), (stryMutAct_9fa48("156517") ? existingConnected || preferIncomingConnection : stryMutAct_9fa48("156516") ? true : (stryCov_9fa48("156516", "156517"), existingConnected && preferIncomingConnection)) && (stryMutAct_9fa48("156519") ? existing?.isIncoming !== true : stryMutAct_9fa48("156518") ? true : (stryCov_9fa48("156518", "156519"), (stryMutAct_9fa48("156520") ? existing.isIncoming : (stryCov_9fa48("156520"), existing?.isIncoming)) === (stryMutAct_9fa48("156521") ? false : (stryCov_9fa48("156521"), true)))));
          const shouldAdoptIncomingConnection = stryMutAct_9fa48("156524") ? !existing && !isSelfConnection && (!existingConnected || preferIncomingConnection && !existingPreferredIncomingConnection) : stryMutAct_9fa48("156523") ? false : stryMutAct_9fa48("156522") ? true : (stryCov_9fa48("156522", "156523", "156524"), (stryMutAct_9fa48("156525") ? existing : (stryCov_9fa48("156525"), !existing)) || (stryMutAct_9fa48("156527") ? !isSelfConnection || !existingConnected || preferIncomingConnection && !existingPreferredIncomingConnection : stryMutAct_9fa48("156526") ? false : (stryCov_9fa48("156526", "156527"), (stryMutAct_9fa48("156528") ? isSelfConnection : (stryCov_9fa48("156528"), !isSelfConnection)) && (stryMutAct_9fa48("156530") ? !existingConnected && preferIncomingConnection && !existingPreferredIncomingConnection : stryMutAct_9fa48("156529") ? true : (stryCov_9fa48("156529", "156530"), (stryMutAct_9fa48("156531") ? existingConnected : (stryCov_9fa48("156531"), !existingConnected)) || (stryMutAct_9fa48("156533") ? preferIncomingConnection || !existingPreferredIncomingConnection : stryMutAct_9fa48("156532") ? false : (stryCov_9fa48("156532", "156533"), preferIncomingConnection && (stryMutAct_9fa48("156534") ? existingPreferredIncomingConnection : (stryCov_9fa48("156534"), !existingPreferredIncomingConnection)))))))));
          if (stryMutAct_9fa48("156536") ? false : stryMutAct_9fa48("156535") ? true : (stryCov_9fa48("156535", "156536"), isSelfConnection)) {
            if (stryMutAct_9fa48("156537")) {
              {}
            } else {
              stryCov_9fa48("156537");
              this.logger.debug(ROUTER_LOG_MSG.KEEP_ORIGINAL_CONNECTION, stryMutAct_9fa48("156538") ? {} : (stryCov_9fa48("156538"), {
                connectionId,
                nodeId,
                reason: ROUTER_LOG_MSG.SELF_CONNECTION_ALREADY_REGISTERED
              }));
            }
          } else if (stryMutAct_9fa48("156540") ? false : stryMutAct_9fa48("156539") ? true : (stryCov_9fa48("156539", "156540"), shouldAdoptIncomingConnection)) {
            if (stryMutAct_9fa48("156541")) {
              {}
            } else {
              stryCov_9fa48("156541");
              if (stryMutAct_9fa48("156544") ? existing && existing.ws || existing.connectionId !== connectionId : stryMutAct_9fa48("156543") ? false : stryMutAct_9fa48("156542") ? true : (stryCov_9fa48("156542", "156543", "156544"), (stryMutAct_9fa48("156546") ? existing || existing.ws : stryMutAct_9fa48("156545") ? true : (stryCov_9fa48("156545", "156546"), existing && existing.ws)) && (stryMutAct_9fa48("156548") ? existing.connectionId === connectionId : stryMutAct_9fa48("156547") ? true : (stryCov_9fa48("156547", "156548"), existing.connectionId !== connectionId)))) {
                if (stryMutAct_9fa48("156549")) {
                  {}
                } else {
                  stryCov_9fa48("156549");
                  this.retireConnection(existing);
                  try {
                    if (stryMutAct_9fa48("156550")) {
                      {}
                    } else {
                      stryCov_9fa48("156550");
                      existing.ws.terminate();
                    }
                  } catch (error) {
                    if (stryMutAct_9fa48("156551")) {
                      {}
                    } else {
                      stryCov_9fa48("156551");
                      this.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, stryMutAct_9fa48("156552") ? {} : (stryCov_9fa48("156552"), {
                        nodeId,
                        error: error.message
                      }));
                    }
                  }
                }
              }
              if (stryMutAct_9fa48("156555") ? existing || this.nodeConnections.get(nodeId) === existing : stryMutAct_9fa48("156554") ? false : stryMutAct_9fa48("156553") ? true : (stryCov_9fa48("156553", "156554", "156555"), existing && (stryMutAct_9fa48("156557") ? this.nodeConnections.get(nodeId) !== existing : stryMutAct_9fa48("156556") ? true : (stryCov_9fa48("156556", "156557"), this.nodeConnections.get(nodeId) === existing)))) {
                if (stryMutAct_9fa48("156558")) {
                  {}
                } else {
                  stryCov_9fa48("156558");
                  this.nodeConnections.delete(nodeId);
                }
              }
              this.nodeConnections.delete(connectionId);
              this.nodeConnections.set(nodeId, connection);
              this.logger.info(ROUTER_LOG_MSG.REKEYED_CONNECTION, stryMutAct_9fa48("156559") ? {} : (stryCov_9fa48("156559"), {
                oldKey: connectionId,
                newKey: nodeId,
                localNodeId: this.nodeId
              }));
            }
          } else {
            if (stryMutAct_9fa48("156560")) {
              {}
            } else {
              stryCov_9fa48("156560");
              this.logger.debug(ROUTER_LOG_MSG.KEEP_ORIGINAL_CONNECTION, stryMutAct_9fa48("156561") ? {} : (stryCov_9fa48("156561"), {
                connectionId,
                nodeId,
                reason: MESSAGE_ROUTER_LITERAL.STRING_EXISTING_CONNECTION_PREFERRED
              }));
              this.retireConnection(connection);
              this.nodeConnections.delete(connectionId);
              try {
                if (stryMutAct_9fa48("156562")) {
                  {}
                } else {
                  stryCov_9fa48("156562");
                  ws.terminate();
                }
              } catch (error) {
                if (stryMutAct_9fa48("156563")) {
                  {}
                } else {
                  stryCov_9fa48("156563");
                  this.logger.warn(ROUTER_LOG_MSG.FAILED_TERMINATE_EXISTING, stryMutAct_9fa48("156564") ? {} : (stryCov_9fa48("156564"), {
                    nodeId,
                    error: error.message
                  }));
                }
              }
            }
          }
        }
      }
      this.emit(TRANSPORT_EVENT.NODE_CONNECTED, stryMutAct_9fa48("156565") ? {} : (stryCov_9fa48("156565"), {
        nodeId,
        nodeAddress,
        connectionId
      }));
      this.emit(TRANSPORT_EVENT.NODE_IDENTIFIED, stryMutAct_9fa48("156566") ? {} : (stryCov_9fa48("156566"), {
        nodeId,
        nodeAddress,
        connectionId
      }));
    }
  }

  /**
   * Handle service message from remote node.
   * Sends ACK immediately to release sender-side queue pressure, then
   * resolves the handler asynchronously via SERVICE_RESPONSE.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Service message.
   * @private
   */
  handleServiceMessage(ws, message) {
    if (stryMutAct_9fa48("156567")) {
      {}
    } else {
      stryCov_9fa48("156567");
      const {
        targetAddress,
        messageId,
        payload
      } = message;
      this.logger.debug(ROUTER_LOG_MSG.SERVICE_MESSAGE_HANDLING, stryMutAct_9fa48("156568") ? {} : (stryCov_9fa48("156568"), {
        messageId,
        targetAddress,
        sourceNodeId: message.sourceNodeId,
        registeredHandlers: Array.from(this.handlers.keys()),
        hasHandler: this.handlers.has(targetAddress)
      }));

      // Always ACK immediately so the sender can release outbound queue slots.
      this.sendRaw(ws, stryMutAct_9fa48("156569") ? {} : (stryCov_9fa48("156569"), {
        type: RouterMessageType.ACK,
        messageId,
        acknowledged: stryMutAct_9fa48("156570") ? false : (stryCov_9fa48("156570"), true)
      }));

      // Find handler for target address
      const handler = this.handlers.get(targetAddress);
      if (stryMutAct_9fa48("156573") ? false : stryMutAct_9fa48("156572") ? true : stryMutAct_9fa48("156571") ? handler : (stryCov_9fa48("156571", "156572", "156573"), !handler)) {
        if (stryMutAct_9fa48("156574")) {
          {}
        } else {
          stryCov_9fa48("156574");
          this.emit(TRANSPORT_EVENT.MESSAGE, stryMutAct_9fa48("156575") ? {} : (stryCov_9fa48("156575"), {
            messageId,
            targetAddress,
            payload,
            sourceAddress: message.sourceAddress,
            sourceNodeId: message.sourceNodeId
          }));
          this.sendRaw(ws, stryMutAct_9fa48("156576") ? {} : (stryCov_9fa48("156576"), {
            type: RouterMessageType.SERVICE_RESPONSE,
            messageId,
            sourceAddress: message.sourceAddress,
            result: stryMutAct_9fa48("156577") ? {} : (stryCov_9fa48("156577"), {
              noHandler: stryMutAct_9fa48("156578") ? false : (stryCov_9fa48("156578"), true),
              error: ROUTER_ERROR_MSG.noHandlerForAddress(targetAddress)
            })
          }));
          return;
        }
      }
      const envelope = stryMutAct_9fa48("156579") ? {} : (stryCov_9fa48("156579"), {
        messageId,
        sourceAddress: message.sourceAddress,
        sourceNodeId: message.sourceNodeId,
        targetAddress,
        payload,
        timestamp: message.timestamp
      });
      Promise.resolve().then(stryMutAct_9fa48("156580") ? () => undefined : (stryCov_9fa48("156580"), () => handler(envelope))).then(result => {
        if (stryMutAct_9fa48("156581")) {
          {}
        } else {
          stryCov_9fa48("156581");
          this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_SENT, stryMutAct_9fa48("156582") ? {} : (stryCov_9fa48("156582"), {
            messageId,
            targetAddress
          }));
          this.sendRaw(ws, stryMutAct_9fa48("156583") ? {} : (stryCov_9fa48("156583"), {
            type: RouterMessageType.SERVICE_RESPONSE,
            messageId,
            sourceAddress: message.sourceAddress,
            result
          }));
        }
      }).catch(error => {
        if (stryMutAct_9fa48("156584")) {
          {}
        } else {
          stryCov_9fa48("156584");
          this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_ERROR, stryMutAct_9fa48("156585") ? {} : (stryCov_9fa48("156585"), {
            messageId,
            targetAddress,
            error: error.message
          }));
          this.sendRaw(ws, stryMutAct_9fa48("156586") ? {} : (stryCov_9fa48("156586"), {
            type: RouterMessageType.SERVICE_RESPONSE,
            messageId,
            sourceAddress: message.sourceAddress,
            error: error.message
          }));
        }
      });
    }
  }

  /**
   * Handle SERVICE_RESPONSE message and settle pending response waiters.
   * @param {Object} message - Service response message.
   * @private
   */
  handleServiceResponse(message) {
    if (stryMutAct_9fa48("156587")) {
      {}
    } else {
      stryCov_9fa48("156587");
      const {
        messageId,
        result,
        error
      } = message;
      this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_RECEIVED, stryMutAct_9fa48("156588") ? {} : (stryCov_9fa48("156588"), {
        messageId,
        hasError: Boolean(error)
      }));
      const disposition = this.resolveServiceResponseDisposition(messageId, stryMutAct_9fa48("156589") ? {} : (stryCov_9fa48("156589"), {
        result,
        error
      }));
      this.recordServiceResponseDisposition(disposition);
      if (stryMutAct_9fa48("156592") ? disposition.kind !== SERVICE_RESPONSE_DISPOSITION_KIND.SETTLED : stryMutAct_9fa48("156591") ? false : stryMutAct_9fa48("156590") ? true : (stryCov_9fa48("156590", "156591", "156592"), disposition.kind === SERVICE_RESPONSE_DISPOSITION_KIND.SETTLED)) {
        if (stryMutAct_9fa48("156593")) {
          {}
        } else {
          stryCov_9fa48("156593");
          return;
        }
      }
      if (stryMutAct_9fa48("156596") ? disposition.absorbed !== true : stryMutAct_9fa48("156595") ? false : stryMutAct_9fa48("156594") ? true : (stryCov_9fa48("156594", "156595", "156596"), disposition.absorbed === (stryMutAct_9fa48("156597") ? false : (stryCov_9fa48("156597"), true)))) {
        if (stryMutAct_9fa48("156598")) {
          {}
        } else {
          stryCov_9fa48("156598");
          this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_NO_PENDING, stryMutAct_9fa48("156599") ? {} : (stryCov_9fa48("156599"), {
            messageId,
            ignoredRetiredPending: stryMutAct_9fa48("156600") ? false : (stryCov_9fa48("156600"), true),
            unmatchedClassification: disposition.classification,
            retiredReason: disposition.retiredReason,
            deliverySource: disposition.deliverySource,
            targetNodeId: disposition.targetNodeId
          }));
          return;
        }
      }
      this.logUnmatchedServiceResponse(disposition);
    }
  }

  /**
   * Rate-limit unmatched service-response warnings so response storms do not
   * bury the underlying transport/control-plane failure that caused them.
   * @param {Object} unmatchedResponseClassification
   * @return {void}
   * @private
   */
  logUnmatchedServiceResponse(unmatchedResponseClassification) {
    if (stryMutAct_9fa48("156601")) {
      {}
    } else {
      stryCov_9fa48("156601");
      const messageId = stryMutAct_9fa48("156604") ? unmatchedResponseClassification?.messageId && null : stryMutAct_9fa48("156603") ? false : stryMutAct_9fa48("156602") ? true : (stryCov_9fa48("156602", "156603", "156604"), (stryMutAct_9fa48("156605") ? unmatchedResponseClassification.messageId : (stryCov_9fa48("156605"), unmatchedResponseClassification?.messageId)) || null);
      const nowMs = Number(this.nowFn());
      const warnIntervalMs = this.unmatchedServiceResponseWarnIntervalMs;
      const lastWarnAtMs = this.lastUnmatchedServiceResponseWarnAtMs;
      const shouldWarnNow = stryMutAct_9fa48("156608") ? (!Number.isFinite(lastWarnAtMs) || warnIntervalMs <= TRANSPORT_NUM.ZERO || !Number.isFinite(nowMs)) && nowMs - lastWarnAtMs >= warnIntervalMs : stryMutAct_9fa48("156607") ? false : stryMutAct_9fa48("156606") ? true : (stryCov_9fa48("156606", "156607", "156608"), (stryMutAct_9fa48("156610") ? (!Number.isFinite(lastWarnAtMs) || warnIntervalMs <= TRANSPORT_NUM.ZERO) && !Number.isFinite(nowMs) : stryMutAct_9fa48("156609") ? false : (stryCov_9fa48("156609", "156610"), (stryMutAct_9fa48("156612") ? !Number.isFinite(lastWarnAtMs) && warnIntervalMs <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156611") ? false : (stryCov_9fa48("156611", "156612"), (stryMutAct_9fa48("156613") ? Number.isFinite(lastWarnAtMs) : (stryCov_9fa48("156613"), !Number.isFinite(lastWarnAtMs))) || (stryMutAct_9fa48("156616") ? warnIntervalMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156615") ? warnIntervalMs < TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156614") ? false : (stryCov_9fa48("156614", "156615", "156616"), warnIntervalMs <= TRANSPORT_NUM.ZERO)))) || (stryMutAct_9fa48("156617") ? Number.isFinite(nowMs) : (stryCov_9fa48("156617"), !Number.isFinite(nowMs))))) || (stryMutAct_9fa48("156620") ? nowMs - lastWarnAtMs < warnIntervalMs : stryMutAct_9fa48("156619") ? nowMs - lastWarnAtMs > warnIntervalMs : stryMutAct_9fa48("156618") ? false : (stryCov_9fa48("156618", "156619", "156620"), (stryMutAct_9fa48("156621") ? nowMs + lastWarnAtMs : (stryCov_9fa48("156621"), nowMs - lastWarnAtMs)) >= warnIntervalMs)));
      if (stryMutAct_9fa48("156624") ? false : stryMutAct_9fa48("156623") ? true : stryMutAct_9fa48("156622") ? shouldWarnNow : (stryCov_9fa48("156622", "156623", "156624"), !shouldWarnNow)) {
        if (stryMutAct_9fa48("156625")) {
          {}
        } else {
          stryCov_9fa48("156625");
          stryMutAct_9fa48("156626") ? this.unmatchedServiceResponseWarnSuppressedCount -= TRANSPORT_NUM.ONE : (stryCov_9fa48("156626"), this.unmatchedServiceResponseWarnSuppressedCount += TRANSPORT_NUM.ONE);
          this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_NO_PENDING, stryMutAct_9fa48("156627") ? {} : (stryCov_9fa48("156627"), {
            messageId,
            suppressedByRateLimit: stryMutAct_9fa48("156628") ? false : (stryCov_9fa48("156628"), true),
            unmatchedClassification: stryMutAct_9fa48("156631") ? unmatchedResponseClassification?.classification && MESSAGE_ROUTER_LITERAL.STRING_ORPHANED : stryMutAct_9fa48("156630") ? false : stryMutAct_9fa48("156629") ? true : (stryCov_9fa48("156629", "156630", "156631"), (stryMutAct_9fa48("156632") ? unmatchedResponseClassification.classification : (stryCov_9fa48("156632"), unmatchedResponseClassification?.classification)) || MESSAGE_ROUTER_LITERAL.STRING_ORPHANED)
          }));
          return;
        }
      }
      const suppressedSinceLastWarn = this.unmatchedServiceResponseWarnSuppressedCount;
      this.unmatchedServiceResponseWarnSuppressedCount = TRANSPORT_NUM.ZERO;
      this.lastUnmatchedServiceResponseWarnAtMs = Number.isFinite(nowMs) ? nowMs : null;
      const context = stryMutAct_9fa48("156633") ? {} : (stryCov_9fa48("156633"), {
        messageId,
        unmatchedClassification: stryMutAct_9fa48("156636") ? unmatchedResponseClassification?.classification && 'orphaned' : stryMutAct_9fa48("156635") ? false : stryMutAct_9fa48("156634") ? true : (stryCov_9fa48("156634", "156635", "156636"), (stryMutAct_9fa48("156637") ? unmatchedResponseClassification.classification : (stryCov_9fa48("156637"), unmatchedResponseClassification?.classification)) || (stryMutAct_9fa48("156638") ? "" : (stryCov_9fa48("156638"), 'orphaned')))
      });
      if (stryMutAct_9fa48("156641") ? typeof unmatchedResponseClassification?.retiredReason === TRANSPORT_TYPEOF.STRING || unmatchedResponseClassification.retiredReason.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156640") ? false : stryMutAct_9fa48("156639") ? true : (stryCov_9fa48("156639", "156640", "156641"), (stryMutAct_9fa48("156643") ? typeof unmatchedResponseClassification?.retiredReason !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("156642") ? true : (stryCov_9fa48("156642", "156643"), typeof (stryMutAct_9fa48("156644") ? unmatchedResponseClassification.retiredReason : (stryCov_9fa48("156644"), unmatchedResponseClassification?.retiredReason)) === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("156647") ? unmatchedResponseClassification.retiredReason.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156646") ? unmatchedResponseClassification.retiredReason.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156645") ? true : (stryCov_9fa48("156645", "156646", "156647"), unmatchedResponseClassification.retiredReason.length > TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("156648")) {
          {}
        } else {
          stryCov_9fa48("156648");
          context.retiredReason = unmatchedResponseClassification.retiredReason;
        }
      }
      if (stryMutAct_9fa48("156651") ? typeof unmatchedResponseClassification?.deliverySource === TRANSPORT_TYPEOF.STRING || unmatchedResponseClassification.deliverySource.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156650") ? false : stryMutAct_9fa48("156649") ? true : (stryCov_9fa48("156649", "156650", "156651"), (stryMutAct_9fa48("156653") ? typeof unmatchedResponseClassification?.deliverySource !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("156652") ? true : (stryCov_9fa48("156652", "156653"), typeof (stryMutAct_9fa48("156654") ? unmatchedResponseClassification.deliverySource : (stryCov_9fa48("156654"), unmatchedResponseClassification?.deliverySource)) === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("156657") ? unmatchedResponseClassification.deliverySource.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156656") ? unmatchedResponseClassification.deliverySource.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156655") ? true : (stryCov_9fa48("156655", "156656", "156657"), unmatchedResponseClassification.deliverySource.length > TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("156658")) {
          {}
        } else {
          stryCov_9fa48("156658");
          context.deliverySource = unmatchedResponseClassification.deliverySource;
        }
      }
      if (stryMutAct_9fa48("156661") ? typeof unmatchedResponseClassification?.targetNodeId === TRANSPORT_TYPEOF.STRING || unmatchedResponseClassification.targetNodeId.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156660") ? false : stryMutAct_9fa48("156659") ? true : (stryCov_9fa48("156659", "156660", "156661"), (stryMutAct_9fa48("156663") ? typeof unmatchedResponseClassification?.targetNodeId !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("156662") ? true : (stryCov_9fa48("156662", "156663"), typeof (stryMutAct_9fa48("156664") ? unmatchedResponseClassification.targetNodeId : (stryCov_9fa48("156664"), unmatchedResponseClassification?.targetNodeId)) === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("156667") ? unmatchedResponseClassification.targetNodeId.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156666") ? unmatchedResponseClassification.targetNodeId.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156665") ? true : (stryCov_9fa48("156665", "156666", "156667"), unmatchedResponseClassification.targetNodeId.length > TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("156668")) {
          {}
        } else {
          stryCov_9fa48("156668");
          context.targetNodeId = unmatchedResponseClassification.targetNodeId;
        }
      }
      if (stryMutAct_9fa48("156672") ? suppressedSinceLastWarn <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156671") ? suppressedSinceLastWarn >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156670") ? false : stryMutAct_9fa48("156669") ? true : (stryCov_9fa48("156669", "156670", "156671", "156672"), suppressedSinceLastWarn > TRANSPORT_NUM.ZERO)) {
        if (stryMutAct_9fa48("156673")) {
          {}
        } else {
          stryCov_9fa48("156673");
          context.suppressedSinceLastWarn = suppressedSinceLastWarn;
        }
      }
      this.logger.warn(ROUTER_LOG_MSG.SERVICE_RESPONSE_NO_PENDING, context);
    }
  }

  /**
   * @param {Object} disposition
   * @return {void}
   * @private
   */
  recordServiceResponseDisposition(disposition) {
    if (stryMutAct_9fa48("156674")) {
      {}
    } else {
      stryCov_9fa48("156674");
      const classification = stryMutAct_9fa48("156677") ? normalizeIdentifier(disposition?.classification) && 'orphaned' : stryMutAct_9fa48("156676") ? false : stryMutAct_9fa48("156675") ? true : (stryCov_9fa48("156675", "156676", "156677"), normalizeIdentifier(stryMutAct_9fa48("156678") ? disposition.classification : (stryCov_9fa48("156678"), disposition?.classification)) || (stryMutAct_9fa48("156679") ? "" : (stryCov_9fa48("156679"), 'orphaned')));
      this.serviceResponseDispositionCounts.set(classification, stryMutAct_9fa48("156680") ? (this.serviceResponseDispositionCounts.get(classification) || TRANSPORT_NUM.ZERO) - TRANSPORT_NUM.ONE : (stryCov_9fa48("156680"), (stryMutAct_9fa48("156683") ? this.serviceResponseDispositionCounts.get(classification) && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156682") ? false : stryMutAct_9fa48("156681") ? true : (stryCov_9fa48("156681", "156682", "156683"), this.serviceResponseDispositionCounts.get(classification) || TRANSPORT_NUM.ZERO)) + TRANSPORT_NUM.ONE));
    }
  }

  /**
   * @return {Object}
   */
  getServiceResponseDispositionCounts() {
    if (stryMutAct_9fa48("156684")) {
      {}
    } else {
      stryCov_9fa48("156684");
      return Object.freeze(Object.fromEntries(stryMutAct_9fa48("156685") ? [...this.serviceResponseDispositionCounts.entries()] : (stryCov_9fa48("156685"), (stryMutAct_9fa48("156686") ? [] : (stryCov_9fa48("156686"), [...this.serviceResponseDispositionCounts.entries()])).sort(stryMutAct_9fa48("156687") ? () => undefined : (stryCov_9fa48("156687"), (left, right) => left[TRANSPORT_NUM.ZERO].localeCompare(right[TRANSPORT_NUM.ZERO]))))));
    }
  }

  /**
   * Settle one SERVICE_RESPONSE if possible, otherwise classify its late
   * disposition under the retired-waiter model.
   *
   * @param {string} messageId
   * @param {Object} payload
   * @return {Object}
   * @private
   */
  resolveServiceResponseDisposition(messageId, payload = {}) {
    if (stryMutAct_9fa48("156688")) {
      {}
    } else {
      stryCov_9fa48("156688");
      const settled = this.settlePendingResponse(messageId, payload);
      if (stryMutAct_9fa48("156690") ? false : stryMutAct_9fa48("156689") ? true : (stryCov_9fa48("156689", "156690"), settled)) {
        if (stryMutAct_9fa48("156691")) {
          {}
        } else {
          stryCov_9fa48("156691");
          return buildServiceResponseDisposition(stryMutAct_9fa48("156692") ? {} : (stryCov_9fa48("156692"), {
            messageId,
            kind: SERVICE_RESPONSE_DISPOSITION_KIND.SETTLED,
            classification: SERVICE_RESPONSE_DISPOSITION_KIND.SETTLED
          }));
        }
      }
      return this.classifyUnmatchedServiceResponse(messageId);
    }
  }

  /**
   * Classify one SERVICE_RESPONSE that no longer has a live waiter.
   * @param {string} messageId
   * @return {Object}
   * @private
   */
  classifyUnmatchedServiceResponse(messageId) {
    if (stryMutAct_9fa48("156693")) {
      {}
    } else {
      stryCov_9fa48("156693");
      const retiredPendingResponse = this.consumeRetiredPendingResponse(messageId);
      if (stryMutAct_9fa48("156695") ? false : stryMutAct_9fa48("156694") ? true : (stryCov_9fa48("156694", "156695"), retiredPendingResponse)) {
        if (stryMutAct_9fa48("156696")) {
          {}
        } else {
          stryCov_9fa48("156696");
          return buildServiceResponseDisposition(stryMutAct_9fa48("156697") ? {} : (stryCov_9fa48("156697"), {
            messageId,
            kind: SERVICE_RESPONSE_DISPOSITION_KIND.ABSORBED,
            classification: buildRetiredPendingClassification(retiredPendingResponse.reason),
            absorbed: stryMutAct_9fa48("156698") ? false : (stryCov_9fa48("156698"), true),
            retiredReason: stryMutAct_9fa48("156701") ? retiredPendingResponse.reason && RETIRED_PENDING_RESPONSE_REASON.UNKNOWN : stryMutAct_9fa48("156700") ? false : stryMutAct_9fa48("156699") ? true : (stryCov_9fa48("156699", "156700", "156701"), retiredPendingResponse.reason || RETIRED_PENDING_RESPONSE_REASON.UNKNOWN),
            deliverySource: stryMutAct_9fa48("156704") ? retiredPendingResponse.deliverySource && null : stryMutAct_9fa48("156703") ? false : stryMutAct_9fa48("156702") ? true : (stryCov_9fa48("156702", "156703", "156704"), retiredPendingResponse.deliverySource || null),
            targetNodeId: stryMutAct_9fa48("156707") ? retiredPendingResponse.targetNodeId && null : stryMutAct_9fa48("156706") ? false : stryMutAct_9fa48("156705") ? true : (stryCov_9fa48("156705", "156706", "156707"), retiredPendingResponse.targetNodeId || null)
          }));
        }
      }
      return buildServiceResponseDisposition(stryMutAct_9fa48("156708") ? {} : (stryCov_9fa48("156708"), {
        messageId,
        kind: SERVICE_RESPONSE_DISPOSITION_KIND.ORPHANED,
        classification: MESSAGE_ROUTER_LITERAL.STRING_ORPHANED
      }));
    }
  }

  /**
   * Resolve the grace window for one retired SERVICE_RESPONSE waiter.
   * Mirrors retired-socket termination so one late response can still be
   * absorbed after timeout/defer/disconnect without persisting forever.
   * @return {number}
   * @private
   */
  getRetiredPendingResponseGraceMs() {
    if (stryMutAct_9fa48("156709")) {
      {}
    } else {
      stryCov_9fa48("156709");
      return stryMutAct_9fa48("156710") ? Math.min(this.reconnectIntervalMs, this.messageTimeoutMs) : (stryCov_9fa48("156710"), Math.max(this.reconnectIntervalMs, this.messageTimeoutMs));
    }
  }

  /**
   * Prune expired retired SERVICE_RESPONSE waiters.
   * @param {number|null} [nowMs]
   * @return {void}
   * @private
   */
  pruneRetiredPendingResponses(nowMs = null) {
    if (stryMutAct_9fa48("156711")) {
      {}
    } else {
      stryCov_9fa48("156711");
      const effectiveNowMs = Number.isFinite(nowMs) ? nowMs : Number(this.nowFn());
      for (const [messageId, entry] of this.retiredPendingResponses.entries()) {
        if (stryMutAct_9fa48("156712")) {
          {}
        } else {
          stryCov_9fa48("156712");
          if (stryMutAct_9fa48("156715") ? (!entry || !Number.isFinite(entry.expiresAtMs) || !Number.isFinite(effectiveNowMs)) && entry.expiresAtMs <= effectiveNowMs : stryMutAct_9fa48("156714") ? false : stryMutAct_9fa48("156713") ? true : (stryCov_9fa48("156713", "156714", "156715"), (stryMutAct_9fa48("156717") ? (!entry || !Number.isFinite(entry.expiresAtMs)) && !Number.isFinite(effectiveNowMs) : stryMutAct_9fa48("156716") ? false : (stryCov_9fa48("156716", "156717"), (stryMutAct_9fa48("156719") ? !entry && !Number.isFinite(entry.expiresAtMs) : stryMutAct_9fa48("156718") ? false : (stryCov_9fa48("156718", "156719"), (stryMutAct_9fa48("156720") ? entry : (stryCov_9fa48("156720"), !entry)) || (stryMutAct_9fa48("156721") ? Number.isFinite(entry.expiresAtMs) : (stryCov_9fa48("156721"), !Number.isFinite(entry.expiresAtMs))))) || (stryMutAct_9fa48("156722") ? Number.isFinite(effectiveNowMs) : (stryCov_9fa48("156722"), !Number.isFinite(effectiveNowMs))))) || (stryMutAct_9fa48("156725") ? entry.expiresAtMs > effectiveNowMs : stryMutAct_9fa48("156724") ? entry.expiresAtMs < effectiveNowMs : stryMutAct_9fa48("156723") ? false : (stryCov_9fa48("156723", "156724", "156725"), entry.expiresAtMs <= effectiveNowMs)))) {
            if (stryMutAct_9fa48("156726")) {
              {}
            } else {
              stryCov_9fa48("156726");
              this.retiredPendingResponses.delete(messageId);
            }
          }
        }
      }
    }
  }

  /**
   * Remember one response waiter that was intentionally retired before the
   * peer finished the round-trip.
   * @param {string} messageId
   * @return {void}
   * @private
   */
  rememberRetiredPendingResponse(messageId, pending = null, reason = RETIRED_PENDING_RESPONSE_REASON.UNKNOWN) {
    if (stryMutAct_9fa48("156727")) {
      {}
    } else {
      stryCov_9fa48("156727");
      const normalizedMessageId = normalizeIdentifier(messageId);
      if (stryMutAct_9fa48("156730") ? false : stryMutAct_9fa48("156729") ? true : stryMutAct_9fa48("156728") ? normalizedMessageId : (stryCov_9fa48("156728", "156729", "156730"), !normalizedMessageId)) {
        if (stryMutAct_9fa48("156731")) {
          {}
        } else {
          stryCov_9fa48("156731");
          return;
        }
      }
      const nowMs = Number(this.nowFn());
      const effectiveNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
      this.pruneRetiredPendingResponses(effectiveNowMs);
      this.retiredPendingResponses.set(normalizedMessageId, stryMutAct_9fa48("156732") ? {} : (stryCov_9fa48("156732"), {
        reason: (stryMutAct_9fa48("156735") ? typeof reason === TRANSPORT_TYPEOF.STRING || reason.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156734") ? false : stryMutAct_9fa48("156733") ? true : (stryCov_9fa48("156733", "156734", "156735"), (stryMutAct_9fa48("156737") ? typeof reason !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("156736") ? true : (stryCov_9fa48("156736", "156737"), typeof reason === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("156740") ? reason.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156739") ? reason.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156738") ? true : (stryCov_9fa48("156738", "156739", "156740"), reason.length > TRANSPORT_NUM.ZERO)))) ? reason : RETIRED_PENDING_RESPONSE_REASON.UNKNOWN,
        deliverySource: stryMutAct_9fa48("156743") ? normalizeIdentifier(pending?.deliverySource) && null : stryMutAct_9fa48("156742") ? false : stryMutAct_9fa48("156741") ? true : (stryCov_9fa48("156741", "156742", "156743"), normalizeIdentifier(stryMutAct_9fa48("156744") ? pending.deliverySource : (stryCov_9fa48("156744"), pending?.deliverySource)) || null),
        targetNodeId: stryMutAct_9fa48("156747") ? normalizeIdentifier(pending?.targetNodeId) && null : stryMutAct_9fa48("156746") ? false : stryMutAct_9fa48("156745") ? true : (stryCov_9fa48("156745", "156746", "156747"), normalizeIdentifier(stryMutAct_9fa48("156748") ? pending.targetNodeId : (stryCov_9fa48("156748"), pending?.targetNodeId)) || null),
        expiresAtMs: stryMutAct_9fa48("156749") ? effectiveNowMs - this.getRetiredPendingResponseGraceMs() : (stryCov_9fa48("156749"), effectiveNowMs + this.getRetiredPendingResponseGraceMs())
      }));
    }
  }

  /**
   * Consume one retired waiter marker when a late response finally arrives.
   * @param {string} messageId
   * @return {Object|null}
   * @private
   */
  consumeRetiredPendingResponse(messageId) {
    if (stryMutAct_9fa48("156750")) {
      {}
    } else {
      stryCov_9fa48("156750");
      const normalizedMessageId = normalizeIdentifier(messageId);
      if (stryMutAct_9fa48("156753") ? false : stryMutAct_9fa48("156752") ? true : stryMutAct_9fa48("156751") ? normalizedMessageId : (stryCov_9fa48("156751", "156752", "156753"), !normalizedMessageId)) {
        if (stryMutAct_9fa48("156754")) {
          {}
        } else {
          stryCov_9fa48("156754");
          return null;
        }
      }
      const nowMs = Number(this.nowFn());
      this.pruneRetiredPendingResponses(nowMs);
      const retiredEntry = this.retiredPendingResponses.get(normalizedMessageId);
      if (stryMutAct_9fa48("156757") ? false : stryMutAct_9fa48("156756") ? true : stryMutAct_9fa48("156755") ? retiredEntry : (stryCov_9fa48("156755", "156756", "156757"), !retiredEntry)) {
        if (stryMutAct_9fa48("156758")) {
          {}
        } else {
          stryCov_9fa48("156758");
          return null;
        }
      }
      this.retiredPendingResponses.delete(normalizedMessageId);
      return retiredEntry;
    }
  }

  /**
   * Register a pending SERVICE_RESPONSE waiter.
   * @param {string} messageId - Correlated message ID.
   * @param {string|null} targetNodeId - Target node ID.
   * @return {Promise<*>} Resolves with handler result.
   * @private
   */
  registerPendingResponse(messageId, targetNodeId = null, options = {}) {
    if (stryMutAct_9fa48("156759")) {
      {}
    } else {
      stryCov_9fa48("156759");
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("156760")) {
          {}
        } else {
          stryCov_9fa48("156760");
          this.pendingResponses.set(messageId, stryMutAct_9fa48("156761") ? {} : (stryCov_9fa48("156761"), {
            resolve,
            reject,
            timeoutId: null,
            targetNodeId,
            deliverySource: stryMutAct_9fa48("156764") ? normalizeIdentifier(options?.deliverySource) && null : stryMutAct_9fa48("156763") ? false : stryMutAct_9fa48("156762") ? true : (stryCov_9fa48("156762", "156763", "156764"), normalizeIdentifier(stryMutAct_9fa48("156765") ? options.deliverySource : (stryCov_9fa48("156765"), options?.deliverySource)) || null)
          }));
        }
      });
    }
  }

  /**
   * Arm timeout for a pending SERVICE_RESPONSE waiter.
   * Timeout is started after ACK to avoid premature rejection while still
   * waiting for sender-side ACK.
   * @param {string} messageId - Correlated message ID.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @return {boolean} True when timeout was armed.
   * @private
   */
  armPendingResponseTimeout(messageId, timeoutMs) {
    if (stryMutAct_9fa48("156766")) {
      {}
    } else {
      stryCov_9fa48("156766");
      const pending = this.pendingResponses.get(messageId);
      if (stryMutAct_9fa48("156769") ? !pending && pending.timeoutId : stryMutAct_9fa48("156768") ? false : stryMutAct_9fa48("156767") ? true : (stryCov_9fa48("156767", "156768", "156769"), (stryMutAct_9fa48("156770") ? pending : (stryCov_9fa48("156770"), !pending)) || pending.timeoutId)) {
        if (stryMutAct_9fa48("156771")) {
          {}
        } else {
          stryCov_9fa48("156771");
          return stryMutAct_9fa48("156772") ? true : (stryCov_9fa48("156772"), false);
        }
      }
      const timeoutId = setTimeout(() => {
        if (stryMutAct_9fa48("156773")) {
          {}
        } else {
          stryCov_9fa48("156773");
          this.pendingResponses.delete(messageId);
          this.rememberRetiredPendingResponse(messageId, pending, RETIRED_PENDING_RESPONSE_REASON.TIMEOUT);
          pending.reject(new Error(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT));
        }
      }, timeoutMs);
      if (stryMutAct_9fa48("156776") ? typeof timeoutId.unref !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("156775") ? false : stryMutAct_9fa48("156774") ? true : (stryCov_9fa48("156774", "156775", "156776"), typeof timeoutId.unref === TRANSPORT_TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("156777")) {
          {}
        } else {
          stryCov_9fa48("156777");
          timeoutId.unref();
        }
      }
      pending.timeoutId = timeoutId;
      return stryMutAct_9fa48("156778") ? false : (stryCov_9fa48("156778"), true);
    }
  }

  /**
   * Settle pending SERVICE_RESPONSE waiter.
   * @param {string} messageId - Correlated message ID.
   * @param {Object} payload - Service response payload.
   * @param {*} payload.result - Handler result.
   * @param {string} payload.error - Handler error.
   * @return {boolean} True when pending waiter was found.
   * @private
   */
  settlePendingResponse(messageId, {
    result,
    error
  }) {
    if (stryMutAct_9fa48("156779")) {
      {}
    } else {
      stryCov_9fa48("156779");
      const pending = this.pendingResponses.get(messageId);
      if (stryMutAct_9fa48("156782") ? false : stryMutAct_9fa48("156781") ? true : stryMutAct_9fa48("156780") ? pending : (stryCov_9fa48("156780", "156781", "156782"), !pending)) {
        if (stryMutAct_9fa48("156783")) {
          {}
        } else {
          stryCov_9fa48("156783");
          return stryMutAct_9fa48("156784") ? true : (stryCov_9fa48("156784"), false);
        }
      }
      if (stryMutAct_9fa48("156786") ? false : stryMutAct_9fa48("156785") ? true : (stryCov_9fa48("156785", "156786"), pending.timeoutId)) {
        if (stryMutAct_9fa48("156787")) {
          {}
        } else {
          stryCov_9fa48("156787");
          clearTimeout(pending.timeoutId);
        }
      }
      this.pendingResponses.delete(messageId);
      if (stryMutAct_9fa48("156789") ? false : stryMutAct_9fa48("156788") ? true : (stryCov_9fa48("156788", "156789"), error)) {
        if (stryMutAct_9fa48("156790")) {
          {}
        } else {
          stryCov_9fa48("156790");
          pending.reject(new Error(error));
        }
      } else {
        if (stryMutAct_9fa48("156791")) {
          {}
        } else {
          stryCov_9fa48("156791");
          pending.resolve(result);
        }
      }
      return stryMutAct_9fa48("156792") ? false : (stryCov_9fa48("156792"), true);
    }
  }

  /**
   * Remove pending SERVICE_RESPONSE waiter without settling it.
   * @param {string} messageId - Correlated message ID.
   * @return {boolean} True when a waiter was removed.
   * @private
   */
  cancelPendingResponse(messageId, options = {}) {
    if (stryMutAct_9fa48("156793")) {
      {}
    } else {
      stryCov_9fa48("156793");
      const pending = this.pendingResponses.get(messageId);
      if (stryMutAct_9fa48("156796") ? false : stryMutAct_9fa48("156795") ? true : stryMutAct_9fa48("156794") ? pending : (stryCov_9fa48("156794", "156795", "156796"), !pending)) {
        if (stryMutAct_9fa48("156797")) {
          {}
        } else {
          stryCov_9fa48("156797");
          return stryMutAct_9fa48("156798") ? true : (stryCov_9fa48("156798"), false);
        }
      }
      if (stryMutAct_9fa48("156800") ? false : stryMutAct_9fa48("156799") ? true : (stryCov_9fa48("156799", "156800"), pending.timeoutId)) {
        if (stryMutAct_9fa48("156801")) {
          {}
        } else {
          stryCov_9fa48("156801");
          clearTimeout(pending.timeoutId);
        }
      }
      this.pendingResponses.delete(messageId);
      if (stryMutAct_9fa48("156804") ? options?.ignoreLateResponse !== true : stryMutAct_9fa48("156803") ? false : stryMutAct_9fa48("156802") ? true : (stryCov_9fa48("156802", "156803", "156804"), (stryMutAct_9fa48("156805") ? options.ignoreLateResponse : (stryCov_9fa48("156805"), options?.ignoreLateResponse)) === (stryMutAct_9fa48("156806") ? false : (stryCov_9fa48("156806"), true)))) {
        if (stryMutAct_9fa48("156807")) {
          {}
        } else {
          stryCov_9fa48("156807");
          this.rememberRetiredPendingResponse(messageId, pending, stryMutAct_9fa48("156810") ? options?.retiredReason && RETIRED_PENDING_RESPONSE_REASON.CANCELLED : stryMutAct_9fa48("156809") ? false : stryMutAct_9fa48("156808") ? true : (stryCov_9fa48("156808", "156809", "156810"), (stryMutAct_9fa48("156811") ? options.retiredReason : (stryCov_9fa48("156811"), options?.retiredReason)) || RETIRED_PENDING_RESPONSE_REASON.CANCELLED));
        }
      }
      return stryMutAct_9fa48("156812") ? false : (stryCov_9fa48("156812"), true);
    }
  }

  /**
   * Fail pending SERVICE_RESPONSE waiters for a target node.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Failure reason.
   * @private
   */
  failPendingResponsesForNode(nodeId, error) {
    if (stryMutAct_9fa48("156813")) {
      {}
    } else {
      stryCov_9fa48("156813");
      for (const [messageId, pending] of this.pendingResponses) {
        if (stryMutAct_9fa48("156814")) {
          {}
        } else {
          stryCov_9fa48("156814");
          if (stryMutAct_9fa48("156817") ? pending.targetNodeId !== nodeId : stryMutAct_9fa48("156816") ? false : stryMutAct_9fa48("156815") ? true : (stryCov_9fa48("156815", "156816", "156817"), pending.targetNodeId === nodeId)) {
            if (stryMutAct_9fa48("156818")) {
              {}
            } else {
              stryCov_9fa48("156818");
              if (stryMutAct_9fa48("156820") ? false : stryMutAct_9fa48("156819") ? true : (stryCov_9fa48("156819", "156820"), pending.timeoutId)) {
                if (stryMutAct_9fa48("156821")) {
                  {}
                } else {
                  stryCov_9fa48("156821");
                  clearTimeout(pending.timeoutId);
                }
              }
              this.pendingResponses.delete(messageId);
              this.rememberRetiredPendingResponse(messageId, pending, RETIRED_PENDING_RESPONSE_REASON.NODE_FAILURE);
              pending.reject(error);
            }
          }
        }
      }
    }
  }

  /**
   * Check whether an ACK includes legacy inline handler payload.
   * @param {Object} ackResult - ACK result.
   * @return {boolean} True when ACK carries handler payload.
   * @private
   */
  hasInlineAckPayload(ackResult) {
    if (stryMutAct_9fa48("156822")) {
      {}
    } else {
      stryCov_9fa48("156822");
      if (stryMutAct_9fa48("156825") ? (!ackResult || typeof ackResult !== TRANSPORT_TYPEOF.OBJECT) && ackResult.acknowledged !== true : stryMutAct_9fa48("156824") ? false : stryMutAct_9fa48("156823") ? true : (stryCov_9fa48("156823", "156824", "156825"), (stryMutAct_9fa48("156827") ? !ackResult && typeof ackResult !== TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("156826") ? false : (stryCov_9fa48("156826", "156827"), (stryMutAct_9fa48("156828") ? ackResult : (stryCov_9fa48("156828"), !ackResult)) || (stryMutAct_9fa48("156830") ? typeof ackResult === TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("156829") ? false : (stryCov_9fa48("156829", "156830"), typeof ackResult !== TRANSPORT_TYPEOF.OBJECT)))) || (stryMutAct_9fa48("156832") ? ackResult.acknowledged === true : stryMutAct_9fa48("156831") ? false : (stryCov_9fa48("156831", "156832"), ackResult.acknowledged !== (stryMutAct_9fa48("156833") ? false : (stryCov_9fa48("156833"), true)))))) {
        if (stryMutAct_9fa48("156834")) {
          {}
        } else {
          stryCov_9fa48("156834");
          return stryMutAct_9fa48("156835") ? true : (stryCov_9fa48("156835"), false);
        }
      }
      const passthroughKeys = new Set(stryMutAct_9fa48("156836") ? [] : (stryCov_9fa48("156836"), [stryMutAct_9fa48("156837") ? "" : (stryCov_9fa48("156837"), 'messageId'), stryMutAct_9fa48("156838") ? "" : (stryCov_9fa48("156838"), 'acknowledged'), stryMutAct_9fa48("156839") ? "" : (stryCov_9fa48("156839"), 'correlationId')]));
      return stryMutAct_9fa48("156840") ? Object.keys(ackResult).every(key => !passthroughKeys.has(key)) : (stryCov_9fa48("156840"), Object.keys(ackResult).some(stryMutAct_9fa48("156841") ? () => undefined : (stryCov_9fa48("156841"), key => stryMutAct_9fa48("156842") ? passthroughKeys.has(key) : (stryCov_9fa48("156842"), !passthroughKeys.has(key)))));
    }
  }

  /**
   * Normalize SERVICE_RESPONSE payload to transport delivery shape.
   * @param {*} result - Handler result payload.
   * @return {Object} Normalized payload fields.
   * @private
   */
  normalizeServiceResponseResult(result) {
    if (stryMutAct_9fa48("156843")) {
      {}
    } else {
      stryCov_9fa48("156843");
      if (stryMutAct_9fa48("156846") ? !result && typeof result !== TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("156845") ? false : stryMutAct_9fa48("156844") ? true : (stryCov_9fa48("156844", "156845", "156846"), (stryMutAct_9fa48("156847") ? result : (stryCov_9fa48("156847"), !result)) || (stryMutAct_9fa48("156849") ? typeof result === TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("156848") ? false : (stryCov_9fa48("156848", "156849"), typeof result !== TRANSPORT_TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("156850")) {
          {}
        } else {
          stryCov_9fa48("156850");
          return {};
        }
      }
      const {
        acknowledged: _ack,
        type: handlerType,
        ...rest
      } = result;
      if (stryMutAct_9fa48("156853") ? handlerType || !Object.prototype.hasOwnProperty.call(rest, MESSAGE_ROUTER_LITERAL.STRING_RESPONSETYPE) : stryMutAct_9fa48("156852") ? false : stryMutAct_9fa48("156851") ? true : (stryCov_9fa48("156851", "156852", "156853"), handlerType && (stryMutAct_9fa48("156854") ? Object.prototype.hasOwnProperty.call(rest, MESSAGE_ROUTER_LITERAL.STRING_RESPONSETYPE) : (stryCov_9fa48("156854"), !Object.prototype.hasOwnProperty.call(rest, MESSAGE_ROUTER_LITERAL.STRING_RESPONSETYPE))))) {
        if (stryMutAct_9fa48("156855")) {
          {}
        } else {
          stryCov_9fa48("156855");
          rest.responseType = handlerType;
        }
      }
      return rest;
    }
  }

  /**
   * Handle acknowledgment message.
   * Passes through flat ACK structure without additional nesting.
   * @param {Object} message - Acknowledgment message.
   * @private
   */
  handleAcknowledgment(message) {
    if (stryMutAct_9fa48("156856")) {
      {}
    } else {
      stryCov_9fa48("156856");
      const {
        messageId,
        acknowledged,
        error,
        type: _type,
        ...rest
      } = message;
      const pending = this.pendingMessages.get(messageId);
      if (stryMutAct_9fa48("156858") ? false : stryMutAct_9fa48("156857") ? true : (stryCov_9fa48("156857", "156858"), pending)) {
        if (stryMutAct_9fa48("156859")) {
          {}
        } else {
          stryCov_9fa48("156859");
          clearTimeout(pending.timeout);
          this.pendingMessages.delete(messageId);
          if (stryMutAct_9fa48("156861") ? false : stryMutAct_9fa48("156860") ? true : (stryCov_9fa48("156860", "156861"), acknowledged)) {
            if (stryMutAct_9fa48("156862")) {
              {}
            } else {
              stryCov_9fa48("156862");
              const connection = this.nodeConnections.get(pending.targetNodeId);
              if (stryMutAct_9fa48("156865") ? connection && connection.isIncoming !== true || connection.isSelfConnection !== true : stryMutAct_9fa48("156864") ? false : stryMutAct_9fa48("156863") ? true : (stryCov_9fa48("156863", "156864", "156865"), (stryMutAct_9fa48("156867") ? connection || connection.isIncoming !== true : stryMutAct_9fa48("156866") ? true : (stryCov_9fa48("156866", "156867"), connection && (stryMutAct_9fa48("156869") ? connection.isIncoming === true : stryMutAct_9fa48("156868") ? true : (stryCov_9fa48("156868", "156869"), connection.isIncoming !== (stryMutAct_9fa48("156870") ? false : (stryCov_9fa48("156870"), true)))))) && (stryMutAct_9fa48("156872") ? connection.isSelfConnection === true : stryMutAct_9fa48("156871") ? true : (stryCov_9fa48("156871", "156872"), connection.isSelfConnection !== (stryMutAct_9fa48("156873") ? false : (stryCov_9fa48("156873"), true)))))) {
                if (stryMutAct_9fa48("156874")) {
                  {}
                } else {
                  stryCov_9fa48("156874");
                  connection.ackTimeoutStreak = TRANSPORT_NUM.ZERO;
                  connection.lastAckAt = Date.now();
                  connection.lastAckTimeoutAt = null;
                }
              }
              const resolved = stryMutAct_9fa48("156875") ? {} : (stryCov_9fa48("156875"), {
                messageId,
                acknowledged: stryMutAct_9fa48("156876") ? false : (stryCov_9fa48("156876"), true),
                ...rest
              });
              if (stryMutAct_9fa48("156879") ? error === undefined : stryMutAct_9fa48("156878") ? false : stryMutAct_9fa48("156877") ? true : (stryCov_9fa48("156877", "156878", "156879"), error !== undefined)) {
                if (stryMutAct_9fa48("156880")) {
                  {}
                } else {
                  stryCov_9fa48("156880");
                  resolved.error = error;
                }
              }
              // Pass through flat structure - spread all fields from ACK
              pending.resolve(resolved);
            }
          } else {
            if (stryMutAct_9fa48("156881")) {
              {}
            } else {
              stryCov_9fa48("156881");
              pending.reject(new Error(stryMutAct_9fa48("156884") ? error && TRANSPORT_ERROR_MSG.MESSAGE_NOT_ACKNOWLEDGED : stryMutAct_9fa48("156883") ? false : stryMutAct_9fa48("156882") ? true : (stryCov_9fa48("156882", "156883", "156884"), error || TRANSPORT_ERROR_MSG.MESSAGE_NOT_ACKNOWLEDGED)));
            }
          }
        }
      }
    }
  }

  /**
   * Handle connection close.
   * Self-disconnection is treated as a fatal error (no reconnection).
   * Requirements: 2.1
   * @param {string} nodeId - Node ID.
   * @param {string|null} expectedConnectionId - Optional stale-close fence.
   * @private
   */
  handleConnectionClose(nodeId, expectedConnectionId = null) {
    if (stryMutAct_9fa48("156885")) {
      {}
    } else {
      stryCov_9fa48("156885");
      const connection = this.nodeConnections.get(nodeId);
      if (stryMutAct_9fa48("156888") ? expectedConnectionId && connection || connection.connectionId !== expectedConnectionId : stryMutAct_9fa48("156887") ? false : stryMutAct_9fa48("156886") ? true : (stryCov_9fa48("156886", "156887", "156888"), (stryMutAct_9fa48("156890") ? expectedConnectionId || connection : stryMutAct_9fa48("156889") ? true : (stryCov_9fa48("156889", "156890"), expectedConnectionId && connection)) && (stryMutAct_9fa48("156892") ? connection.connectionId === expectedConnectionId : stryMutAct_9fa48("156891") ? true : (stryCov_9fa48("156891", "156892"), connection.connectionId !== expectedConnectionId)))) {
        if (stryMutAct_9fa48("156893")) {
          {}
        } else {
          stryCov_9fa48("156893");
          this.logger.debug(MESSAGE_ROUTER_LITERAL.STRING_IGNORING_STALE_CONNECTION_CLOSE_EVENT, stryMutAct_9fa48("156894") ? {} : (stryCov_9fa48("156894"), {
            nodeId,
            expectedConnectionId,
            actualConnectionId: connection.connectionId
          }));
          return;
        }
      }
      if (stryMutAct_9fa48("156896") ? false : stryMutAct_9fa48("156895") ? true : (stryCov_9fa48("156895", "156896"), connection)) {
        if (stryMutAct_9fa48("156897")) {
          {}
        } else {
          stryCov_9fa48("156897");
          this.logger.info(ROUTER_LOG_MSG.CONNECTION_CLOSED, stryMutAct_9fa48("156898") ? {} : (stryCov_9fa48("156898"), {
            nodeId,
            connectionId: connection.connectionId,
            isSelfConnection: connection.isSelfConnection
          }));
          connection.ws = null;

          // Stop ping interval
          this.clearPingInterval(connection);
          const disconnectError = new Error(ROUTER_ERROR_MSG.connectionClosed(nodeId));
          this.failOutboundQueue(nodeId, disconnectError);
          this.failPendingMessagesForNode(nodeId, disconnectError);
          this.failPendingResponsesForNode(nodeId, disconnectError);
          this.emit(TRANSPORT_EVENT.CONNECTION_CLOSED, stryMutAct_9fa48("156899") ? {} : (stryCov_9fa48("156899"), {
            nodeId
          }));
          const closeDisposition = this.resolveConnectionCloseDisposition(connection);
          connection.state = closeDisposition.state;
          if (stryMutAct_9fa48("156902") ? closeDisposition.kind !== CONNECTION_CLOSE_DISPOSITION.SHUTDOWN : stryMutAct_9fa48("156901") ? false : stryMutAct_9fa48("156900") ? true : (stryCov_9fa48("156900", "156901", "156902"), closeDisposition.kind === CONNECTION_CLOSE_DISPOSITION.SHUTDOWN)) {
            if (stryMutAct_9fa48("156903")) {
              {}
            } else {
              stryCov_9fa48("156903");
              return;
            }
          }
          if (stryMutAct_9fa48("156906") ? closeDisposition.kind !== CONNECTION_CLOSE_DISPOSITION.RETIRED : stryMutAct_9fa48("156905") ? false : stryMutAct_9fa48("156904") ? true : (stryCov_9fa48("156904", "156905", "156906"), closeDisposition.kind === CONNECTION_CLOSE_DISPOSITION.RETIRED)) {
            if (stryMutAct_9fa48("156907")) {
              {}
            } else {
              stryCov_9fa48("156907");
              return;
            }
          }
          if (stryMutAct_9fa48("156910") ? closeDisposition.kind !== CONNECTION_CLOSE_DISPOSITION.SELF_DISCONNECT : stryMutAct_9fa48("156909") ? false : stryMutAct_9fa48("156908") ? true : (stryCov_9fa48("156908", "156909", "156910"), closeDisposition.kind === CONNECTION_CLOSE_DISPOSITION.SELF_DISCONNECT)) {
            if (stryMutAct_9fa48("156911")) {
              {}
            } else {
              stryCov_9fa48("156911");
              this.logger.error(ROUTER_LOG_MSG.SELF_CONNECTION_LOST, stryMutAct_9fa48("156912") ? {} : (stryCov_9fa48("156912"), {
                nodeId,
                connectionId: connection.connectionId
              }));
              this.emit(TRANSPORT_EVENT.SELF_DISCONNECT, stryMutAct_9fa48("156913") ? {} : (stryCov_9fa48("156913"), {
                nodeId
              }));
              return;
            }
          }
          if (stryMutAct_9fa48("156916") ? closeDisposition.kind !== CONNECTION_CLOSE_DISPOSITION.RECONNECT : stryMutAct_9fa48("156915") ? false : stryMutAct_9fa48("156914") ? true : (stryCov_9fa48("156914", "156915", "156916"), closeDisposition.kind === CONNECTION_CLOSE_DISPOSITION.RECONNECT)) {
            if (stryMutAct_9fa48("156917")) {
              {}
            } else {
              stryCov_9fa48("156917");
              this.scheduleReconnect(connection);
            }
          }
        }
      }
    }
  }
  resolveConnectionCloseDisposition(connection) {
    if (stryMutAct_9fa48("156918")) {
      {}
    } else {
      stryCov_9fa48("156918");
      let kind = CONNECTION_CLOSE_DISPOSITION.NO_ACTION;
      let state = ConnectionState.DISCONNECTED;
      if (stryMutAct_9fa48("156920") ? false : stryMutAct_9fa48("156919") ? true : (stryCov_9fa48("156919", "156920"), this.isShuttingDown)) {
        if (stryMutAct_9fa48("156921")) {
          {}
        } else {
          stryCov_9fa48("156921");
          kind = CONNECTION_CLOSE_DISPOSITION.SHUTDOWN;
        }
      } else if (stryMutAct_9fa48("156923") ? false : stryMutAct_9fa48("156922") ? true : (stryCov_9fa48("156922", "156923"), connection.retired)) {
        if (stryMutAct_9fa48("156924")) {
          {}
        } else {
          stryCov_9fa48("156924");
          kind = CONNECTION_CLOSE_DISPOSITION.RETIRED;
          state = ConnectionState.CLOSED;
        }
      } else if (stryMutAct_9fa48("156926") ? false : stryMutAct_9fa48("156925") ? true : (stryCov_9fa48("156925", "156926"), connection.isSelfConnection)) {
        if (stryMutAct_9fa48("156927")) {
          {}
        } else {
          stryCov_9fa48("156927");
          kind = CONNECTION_CLOSE_DISPOSITION.SELF_DISCONNECT;
        }
      } else if (stryMutAct_9fa48("156930") ? !connection.isIncoming || connection.address : stryMutAct_9fa48("156929") ? false : stryMutAct_9fa48("156928") ? true : (stryCov_9fa48("156928", "156929", "156930"), (stryMutAct_9fa48("156931") ? connection.isIncoming : (stryCov_9fa48("156931"), !connection.isIncoming)) && connection.address)) {
        if (stryMutAct_9fa48("156932")) {
          {}
        } else {
          stryCov_9fa48("156932");
          kind = CONNECTION_CLOSE_DISPOSITION.RECONNECT;
        }
      }
      return stryMutAct_9fa48("156933") ? {} : (stryCov_9fa48("156933"), {
        kind,
        state
      });
    }
  }

  /**
   * Schedule reconnection attempt.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  scheduleReconnect(connectionInfo) {
    if (stryMutAct_9fa48("156934")) {
      {}
    } else {
      stryCov_9fa48("156934");
      if (stryMutAct_9fa48("156936") ? false : stryMutAct_9fa48("156935") ? true : (stryCov_9fa48("156935", "156936"), this.isShuttingDown)) {
        if (stryMutAct_9fa48("156937")) {
          {}
        } else {
          stryCov_9fa48("156937");
          return;
        }
      }
      const reconnectDisposition = this.resolveReconnectDisposition(connectionInfo);
      if (stryMutAct_9fa48("156939") ? false : stryMutAct_9fa48("156938") ? true : (stryCov_9fa48("156938", "156939"), reconnectDisposition.state)) {
        if (stryMutAct_9fa48("156940")) {
          {}
        } else {
          stryCov_9fa48("156940");
          connectionInfo.state = reconnectDisposition.state;
        }
      }
      if (stryMutAct_9fa48("156943") ? reconnectDisposition.kind !== RECONNECT_DISPOSITION.RETIRE : stryMutAct_9fa48("156942") ? false : stryMutAct_9fa48("156941") ? true : (stryCov_9fa48("156941", "156942", "156943"), reconnectDisposition.kind === RECONNECT_DISPOSITION.RETIRE)) {
        if (stryMutAct_9fa48("156944")) {
          {}
        } else {
          stryCov_9fa48("156944");
          this.retireConnection(connectionInfo);
          return;
        }
      }
      if (stryMutAct_9fa48("156947") ? reconnectDisposition.kind !== RECONNECT_DISPOSITION.PENDING : stryMutAct_9fa48("156946") ? false : stryMutAct_9fa48("156945") ? true : (stryCov_9fa48("156945", "156946", "156947"), reconnectDisposition.kind === RECONNECT_DISPOSITION.PENDING)) {
        if (stryMutAct_9fa48("156948")) {
          {}
        } else {
          stryCov_9fa48("156948");
          return;
        }
      }
      if (stryMutAct_9fa48("156951") ? reconnectDisposition.kind !== RECONNECT_DISPOSITION.MAX_ATTEMPTS_REACHED : stryMutAct_9fa48("156950") ? false : stryMutAct_9fa48("156949") ? true : (stryCov_9fa48("156949", "156950", "156951"), reconnectDisposition.kind === RECONNECT_DISPOSITION.MAX_ATTEMPTS_REACHED)) {
        if (stryMutAct_9fa48("156952")) {
          {}
        } else {
          stryCov_9fa48("156952");
          this.logger.error(ROUTER_LOG_MSG.MAX_RECONNECTS_REACHED, stryMutAct_9fa48("156953") ? {} : (stryCov_9fa48("156953"), {
            nodeId: connectionInfo.nodeId,
            attempts: connectionInfo.reconnectAttempts
          }));
          return;
        }
      }
      stryMutAct_9fa48("156954") ? connectionInfo.reconnectAttempts -= TRANSPORT_NUM.ONE : (stryCov_9fa48("156954"), connectionInfo.reconnectAttempts += TRANSPORT_NUM.ONE);
      const delay = stryMutAct_9fa48("156955") ? this.reconnectIntervalMs / Math.pow(this.reconnectBackoffMultiplier, connectionInfo.reconnectAttempts - TRANSPORT_NUM.ONE) : (stryCov_9fa48("156955"), this.reconnectIntervalMs * Math.pow(this.reconnectBackoffMultiplier, stryMutAct_9fa48("156956") ? connectionInfo.reconnectAttempts + TRANSPORT_NUM.ONE : (stryCov_9fa48("156956"), connectionInfo.reconnectAttempts - TRANSPORT_NUM.ONE)));
      connectionInfo.reconnectDueAt = stryMutAct_9fa48("156957") ? Date.now() - delay : (stryCov_9fa48("156957"), Date.now() + delay);
      this.logger.debug(ROUTER_LOG_MSG.SCHEDULING_RECONNECT, stryMutAct_9fa48("156958") ? {} : (stryCov_9fa48("156958"), {
        nodeId: connectionInfo.nodeId,
        attempt: connectionInfo.reconnectAttempts,
        delayMs: delay
      }));
      connectionInfo.reconnectTimeout = setTimeout(async () => {
        if (stryMutAct_9fa48("156959")) {
          {}
        } else {
          stryCov_9fa48("156959");
          connectionInfo.reconnectTimeout = null;
          connectionInfo.reconnectDueAt = null;
          if (stryMutAct_9fa48("156962") ? connectionInfo.retired && !this.isCurrentConnection(connectionInfo) : stryMutAct_9fa48("156961") ? false : stryMutAct_9fa48("156960") ? true : (stryCov_9fa48("156960", "156961", "156962"), connectionInfo.retired || (stryMutAct_9fa48("156963") ? this.isCurrentConnection(connectionInfo) : (stryCov_9fa48("156963"), !this.isCurrentConnection(connectionInfo))))) {
            if (stryMutAct_9fa48("156964")) {
              {}
            } else {
              stryCov_9fa48("156964");
              this.retireConnection(connectionInfo);
              connectionInfo.state = ConnectionState.CLOSED;
              return;
            }
          }
          try {
            if (stryMutAct_9fa48("156965")) {
              {}
            } else {
              stryCov_9fa48("156965");
              this.refreshReconnectAuthority(connectionInfo, stryMutAct_9fa48("156968") ? connectionInfo.address && connectionInfo.configuredAddress : stryMutAct_9fa48("156967") ? false : stryMutAct_9fa48("156966") ? true : (stryCov_9fa48("156966", "156967", "156968"), connectionInfo.address || connectionInfo.configuredAddress));
              if (stryMutAct_9fa48("156971") ? (!connectionInfo.address || connectionInfo.address.length === TRANSPORT_NUM.ZERO) && typeof connectionInfo.configuredAddress === TRANSPORT_TYPEOF.STRING || connectionInfo.configuredAddress.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156970") ? false : stryMutAct_9fa48("156969") ? true : (stryCov_9fa48("156969", "156970", "156971"), (stryMutAct_9fa48("156973") ? !connectionInfo.address || connectionInfo.address.length === TRANSPORT_NUM.ZERO || typeof connectionInfo.configuredAddress === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("156972") ? true : (stryCov_9fa48("156972", "156973"), (stryMutAct_9fa48("156975") ? !connectionInfo.address && connectionInfo.address.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156974") ? true : (stryCov_9fa48("156974", "156975"), (stryMutAct_9fa48("156976") ? connectionInfo.address : (stryCov_9fa48("156976"), !connectionInfo.address)) || (stryMutAct_9fa48("156978") ? connectionInfo.address.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156977") ? false : (stryCov_9fa48("156977", "156978"), connectionInfo.address.length === TRANSPORT_NUM.ZERO)))) && (stryMutAct_9fa48("156980") ? typeof connectionInfo.configuredAddress !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("156979") ? true : (stryCov_9fa48("156979", "156980"), typeof connectionInfo.configuredAddress === TRANSPORT_TYPEOF.STRING)))) && (stryMutAct_9fa48("156983") ? connectionInfo.configuredAddress.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156982") ? connectionInfo.configuredAddress.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("156981") ? true : (stryCov_9fa48("156981", "156982", "156983"), connectionInfo.configuredAddress.length > TRANSPORT_NUM.ZERO)))) {
                if (stryMutAct_9fa48("156984")) {
                  {}
                } else {
                  stryCov_9fa48("156984");
                  connectionInfo.address = connectionInfo.configuredAddress;
                }
              }
              await this.establishConnection(connectionInfo);
            }
          } catch (error) {
            if (stryMutAct_9fa48("156985")) {
              {}
            } else {
              stryCov_9fa48("156985");
              this.logger.error(ROUTER_LOG_MSG.RECONNECT_FAILED, stryMutAct_9fa48("156986") ? {} : (stryCov_9fa48("156986"), {
                nodeId: connectionInfo.nodeId,
                error: error.message
              }));
              if (stryMutAct_9fa48("156988") ? false : stryMutAct_9fa48("156987") ? true : (stryCov_9fa48("156987", "156988"), this.isShuttingDown)) {
                if (stryMutAct_9fa48("156989")) {
                  {}
                } else {
                  stryCov_9fa48("156989");
                  return;
                }
              }
              this.scheduleReconnect(connectionInfo);
            }
          }
        }
      }, delay);
      if (stryMutAct_9fa48("156992") ? typeof connectionInfo.reconnectTimeout?.unref !== MESSAGE_ROUTER_LITERAL.STRING_FUNCTION : stryMutAct_9fa48("156991") ? false : stryMutAct_9fa48("156990") ? true : (stryCov_9fa48("156990", "156991", "156992"), typeof (stryMutAct_9fa48("156993") ? connectionInfo.reconnectTimeout.unref : (stryCov_9fa48("156993"), connectionInfo.reconnectTimeout?.unref)) === MESSAGE_ROUTER_LITERAL.STRING_FUNCTION)) {
        if (stryMutAct_9fa48("156994")) {
          {}
        } else {
          stryCov_9fa48("156994");
          connectionInfo.reconnectTimeout.unref();
        }
      }
    }
  }
  resolveReconnectDisposition(connectionInfo) {
    if (stryMutAct_9fa48("156995")) {
      {}
    } else {
      stryCov_9fa48("156995");
      let kind = RECONNECT_DISPOSITION.SCHEDULE;
      let state = ConnectionState.RECONNECTING;
      if (stryMutAct_9fa48("156998") ? connectionInfo.retired && !this.isCurrentConnection(connectionInfo) : stryMutAct_9fa48("156997") ? false : stryMutAct_9fa48("156996") ? true : (stryCov_9fa48("156996", "156997", "156998"), connectionInfo.retired || (stryMutAct_9fa48("156999") ? this.isCurrentConnection(connectionInfo) : (stryCov_9fa48("156999"), !this.isCurrentConnection(connectionInfo))))) {
        if (stryMutAct_9fa48("157000")) {
          {}
        } else {
          stryCov_9fa48("157000");
          kind = RECONNECT_DISPOSITION.RETIRE;
          state = ConnectionState.CLOSED;
        }
      } else if (stryMutAct_9fa48("157002") ? false : stryMutAct_9fa48("157001") ? true : (stryCov_9fa48("157001", "157002"), connectionInfo.reconnectTimeout)) {
        if (stryMutAct_9fa48("157003")) {
          {}
        } else {
          stryCov_9fa48("157003");
          kind = RECONNECT_DISPOSITION.PENDING;
          state = null;
        }
      } else if (stryMutAct_9fa48("157007") ? connectionInfo.reconnectAttempts < this.reconnectMaxAttempts : stryMutAct_9fa48("157006") ? connectionInfo.reconnectAttempts > this.reconnectMaxAttempts : stryMutAct_9fa48("157005") ? false : stryMutAct_9fa48("157004") ? true : (stryCov_9fa48("157004", "157005", "157006", "157007"), connectionInfo.reconnectAttempts >= this.reconnectMaxAttempts)) {
        if (stryMutAct_9fa48("157008")) {
          {}
        } else {
          stryCov_9fa48("157008");
          kind = RECONNECT_DISPOSITION.MAX_ATTEMPTS_REACHED;
          state = ConnectionState.CLOSED;
        }
      }
      return stryMutAct_9fa48("157009") ? {} : (stryCov_9fa48("157009"), {
        kind,
        state
      });
    }
  }

  /**
   * Start ping interval for connection.
   * @param {Object} connectionInfo - Connection information.
   * @private
   */
  startPingInterval(connectionInfo) {
    if (stryMutAct_9fa48("157010")) {
      {}
    } else {
      stryCov_9fa48("157010");
      connectionInfo.pingInterval = setInterval(() => {
        if (stryMutAct_9fa48("157011")) {
          {}
        } else {
          stryCov_9fa48("157011");
          if (stryMutAct_9fa48("157014") ? connectionInfo.ws || connectionInfo.ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("157013") ? false : stryMutAct_9fa48("157012") ? true : (stryCov_9fa48("157012", "157013", "157014"), connectionInfo.ws && (stryMutAct_9fa48("157016") ? connectionInfo.ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("157015") ? true : (stryCov_9fa48("157015", "157016"), connectionInfo.ws.readyState === WebSocket.OPEN)))) {
            if (stryMutAct_9fa48("157017")) {
              {}
            } else {
              stryCov_9fa48("157017");
              this.sendRaw(connectionInfo.ws, stryMutAct_9fa48("157018") ? {} : (stryCov_9fa48("157018"), {
                type: RouterMessageType.PING,
                timestamp: Date.now()
              }));
            }
          }
        }
      }, this.pingIntervalMs);
      // Unref to allow process exit when this is the only timer
      connectionInfo.pingInterval.unref();
    }
  }

  /**
   * Register a service handler.
   * The handler will be invoked when messages arrive for this address.
   * Requirements: 5.1
   * @param {string} address - Service address in unified format (nodeId/entityType/entityId).
   * @param {Function} handler - Message handler function.
   */
  register(address, handler, _options = {}) {
    if (stryMutAct_9fa48("157019")) {
      {}
    } else {
      stryCov_9fa48("157019");
      if (stryMutAct_9fa48("157022") ? typeof handler === TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("157021") ? false : stryMutAct_9fa48("157020") ? true : (stryCov_9fa48("157020", "157021", "157022"), typeof handler !== TRANSPORT_TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("157023")) {
          {}
        } else {
          stryCov_9fa48("157023");
          throw new Error(TRANSPORT_ERROR_MSG.HANDLER_MUST_BE_FUNCTION);
        }
      }

      // Validate address format
      if (stryMutAct_9fa48("157026") ? false : stryMutAct_9fa48("157025") ? true : stryMutAct_9fa48("157024") ? this.isValidAddress(address) : (stryCov_9fa48("157024", "157025", "157026"), !this.isValidAddress(address))) {
        if (stryMutAct_9fa48("157027")) {
          {}
        } else {
          stryCov_9fa48("157027");
          throw new Error(ROUTER_ERROR_MSG.invalidAddressFormat(address));
        }
      }
      this.handlers.set(address, handler);
      this.logger.debug(ROUTER_LOG_MSG.HANDLER_REGISTERED, stryMutAct_9fa48("157028") ? {} : (stryCov_9fa48("157028"), {
        address,
        routerId: this.routerId,
        totalHandlers: this.handlers.size
      }));
    }
  }

  /**
   * Register a worker delivery handler.
   * Alias for register() used by ReplicaWorkerManager.
   * @param {string} address - Worker unified address.
   * @param {Function} deliverFn - Worker delivery function.
   */
  registerWorkerHandler(address, deliverFn) {
    if (stryMutAct_9fa48("157029")) {
      {}
    } else {
      stryCov_9fa48("157029");
      this.register(address, deliverFn);
    }
  }

  /**
   * Parse a unified address into its components.
   * Address format: ${nodeId}/${entityType}/${entityId}
   * Requirements: 1.2, 9.1
   * @param {string} address - Address to parse.
   * @return {Object} Parsed address with nodeId, entityType, entityId.
   *                  Returns null values for malformed addresses.
   */
  parseAddress(address) {
    if (stryMutAct_9fa48("157030")) {
      {}
    } else {
      stryCov_9fa48("157030");
      if (stryMutAct_9fa48("157033") ? !address && typeof address !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157032") ? false : stryMutAct_9fa48("157031") ? true : (stryCov_9fa48("157031", "157032", "157033"), (stryMutAct_9fa48("157034") ? address : (stryCov_9fa48("157034"), !address)) || (stryMutAct_9fa48("157036") ? typeof address === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157035") ? false : (stryCov_9fa48("157035", "157036"), typeof address !== TRANSPORT_TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("157037")) {
          {}
        } else {
          stryCov_9fa48("157037");
          return stryMutAct_9fa48("157038") ? {} : (stryCov_9fa48("157038"), {
            nodeId: null,
            entityType: null,
            entityId: null
          });
        }
      }
      const parts = address.split(ROUTER_ADDRESS.SEPARATOR);
      if (stryMutAct_9fa48("157041") ? parts.length === TRANSPORT_NUM.THREE : stryMutAct_9fa48("157040") ? false : stryMutAct_9fa48("157039") ? true : (stryCov_9fa48("157039", "157040", "157041"), parts.length !== TRANSPORT_NUM.THREE)) {
        if (stryMutAct_9fa48("157042")) {
          {}
        } else {
          stryCov_9fa48("157042");
          return stryMutAct_9fa48("157043") ? {} : (stryCov_9fa48("157043"), {
            nodeId: null,
            entityType: null,
            entityId: null
          });
        }
      }
      return stryMutAct_9fa48("157044") ? {} : (stryCov_9fa48("157044"), {
        nodeId: stryMutAct_9fa48("157047") ? parts[TRANSPORT_NUM.ZERO] && null : stryMutAct_9fa48("157046") ? false : stryMutAct_9fa48("157045") ? true : (stryCov_9fa48("157045", "157046", "157047"), parts[TRANSPORT_NUM.ZERO] || null),
        entityType: stryMutAct_9fa48("157050") ? parts[TRANSPORT_NUM.ONE] && null : stryMutAct_9fa48("157049") ? false : stryMutAct_9fa48("157048") ? true : (stryCov_9fa48("157048", "157049", "157050"), parts[TRANSPORT_NUM.ONE] || null),
        entityId: stryMutAct_9fa48("157053") ? parts[TRANSPORT_NUM.TWO] && null : stryMutAct_9fa48("157052") ? false : stryMutAct_9fa48("157051") ? true : (stryCov_9fa48("157051", "157052", "157053"), parts[TRANSPORT_NUM.TWO] || null)
      });
    }
  }

  /**
   * Validate that an address follows the unified format.
   * Format: ${nodeId}/${entityType}/${entityId}
   * Valid entityTypes: message-group, partition, lifecycle, service
   * Requirements: 1.1, 1.3
   * @param {string} address - Address to validate.
   * @return {boolean} True if address is valid.
   */
  isValidAddress(address) {
    if (stryMutAct_9fa48("157054")) {
      {}
    } else {
      stryCov_9fa48("157054");
      if (stryMutAct_9fa48("157057") ? !address && typeof address !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157056") ? false : stryMutAct_9fa48("157055") ? true : (stryCov_9fa48("157055", "157056", "157057"), (stryMutAct_9fa48("157058") ? address : (stryCov_9fa48("157058"), !address)) || (stryMutAct_9fa48("157060") ? typeof address === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157059") ? false : (stryCov_9fa48("157059", "157060"), typeof address !== TRANSPORT_TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("157061")) {
          {}
        } else {
          stryCov_9fa48("157061");
          return stryMutAct_9fa48("157062") ? true : (stryCov_9fa48("157062"), false);
        }
      }
      const parts = address.split(ROUTER_ADDRESS.SEPARATOR);
      if (stryMutAct_9fa48("157065") ? parts.length === TRANSPORT_NUM.THREE : stryMutAct_9fa48("157064") ? false : stryMutAct_9fa48("157063") ? true : (stryCov_9fa48("157063", "157064", "157065"), parts.length !== TRANSPORT_NUM.THREE)) {
        if (stryMutAct_9fa48("157066")) {
          {}
        } else {
          stryCov_9fa48("157066");
          return stryMutAct_9fa48("157067") ? true : (stryCov_9fa48("157067"), false);
        }
      }
      const [nodeId, entityType, entityId] = parts;

      // All parts must be non-empty
      if (stryMutAct_9fa48("157070") ? (!nodeId || !entityType) && !entityId : stryMutAct_9fa48("157069") ? false : stryMutAct_9fa48("157068") ? true : (stryCov_9fa48("157068", "157069", "157070"), (stryMutAct_9fa48("157072") ? !nodeId && !entityType : stryMutAct_9fa48("157071") ? false : (stryCov_9fa48("157071", "157072"), (stryMutAct_9fa48("157073") ? nodeId : (stryCov_9fa48("157073"), !nodeId)) || (stryMutAct_9fa48("157074") ? entityType : (stryCov_9fa48("157074"), !entityType)))) || (stryMutAct_9fa48("157075") ? entityId : (stryCov_9fa48("157075"), !entityId)))) {
        if (stryMutAct_9fa48("157076")) {
          {}
        } else {
          stryCov_9fa48("157076");
          return stryMutAct_9fa48("157077") ? true : (stryCov_9fa48("157077"), false);
        }
      }

      // entityType must be one of the valid types
      return ROUTER_VALID_ENTITY_TYPES.includes(entityType);
    }
  }

  /**
   * Unregister a service handler.
   * @param {string} address - Service address.
   */
  unregister(address) {
    if (stryMutAct_9fa48("157078")) {
      {}
    } else {
      stryCov_9fa48("157078");
      this.handlers.delete(address);
      this.logger.debug(ROUTER_LOG_MSG.HANDLER_UNREGISTERED, stryMutAct_9fa48("157079") ? {} : (stryCov_9fa48("157079"), {
        address,
        routerId: this.routerId,
        totalHandlers: this.handlers.size
      }));
    }
  }

  /**
   * Unregister a worker delivery handler.
   * Alias for unregister() used by ReplicaWorkerManager.
   * @param {string} address - Worker unified address.
   */
  unregisterWorkerHandler(address) {
    if (stryMutAct_9fa48("157080")) {
      {}
    } else {
      stryCov_9fa48("157080");
      this.unregister(address);
    }
  }

  /**
   * Check whether a worker handler is registered.
   * @param {string} address - Worker unified address.
   * @return {boolean} True if registered.
   */
  hasWorkerHandler(address) {
    if (stryMutAct_9fa48("157081")) {
      {}
    } else {
      stryCov_9fa48("157081");
      return this.handlers.has(address);
    }
  }

  /**
   * Set the function to resolve service address to node ID.
   * @param {Function} resolver - Function(address) => nodeId or null.
   */
  setServiceNodeResolver(resolver) {
    if (stryMutAct_9fa48("157082")) {
      {}
    } else {
      stryCov_9fa48("157082");
      this.resolveServiceNode = resolver;
    }
  }

  /**
   * Set the function to resolve node ID to a WebSocket address.
   * @param {Function|null} resolver - Function(nodeId) => wsAddress or null.
   */
  setNodeAddressResolver(resolver) {
    if (stryMutAct_9fa48("157083")) {
      {}
    } else {
      stryCov_9fa48("157083");
      this.resolveNodeAddress = stryMutAct_9fa48("157086") ? resolver && null : stryMutAct_9fa48("157085") ? false : stryMutAct_9fa48("157084") ? true : (stryCov_9fa48("157084", "157085", "157086"), resolver || null);
    }
  }

  /**
   * Set resolver for query/data-plane message-group transport.
   * Resolver must return a local MessageGroupService with sendMessage().
   * @param {Function|null} resolver - Resolver function.
   */
  setQueryMessageGroupServiceResolver(resolver) {
    if (stryMutAct_9fa48("157087")) {
      {}
    } else {
      stryCov_9fa48("157087");
      this.resolveQueryMessageGroupService = stryMutAct_9fa48("157090") ? resolver && null : stryMutAct_9fa48("157089") ? false : stryMutAct_9fa48("157088") ? true : (stryCov_9fa48("157088", "157089", "157090"), resolver || null);
    }
  }

  /**
   * Return the canonical local query/data-plane transport readiness snapshot.
   * Reuses the existing query transport selection owner instead of duplicating
   * resolver logic in callers.
   * @return {{ready:boolean,reason:string|null,retryAfterMs:number}}
   */
  getQueryDataPlaneTransportReadiness() {
    if (stryMutAct_9fa48("157091")) {
      {}
    } else {
      stryCov_9fa48("157091");
      const selection = this.resolveQueryDataPlaneTransportSelection();
      return stryMutAct_9fa48("157092") ? {} : (stryCov_9fa48("157092"), {
        ready: Boolean(stryMutAct_9fa48("157093") ? selection.service : (stryCov_9fa48("157093"), selection?.service)),
        reason: (stryMutAct_9fa48("157094") ? selection.service : (stryCov_9fa48("157094"), selection?.service)) ? null : (stryMutAct_9fa48("157097") ? typeof selection?.reason === TRANSPORT_TYPEOF.STRING || selection.reason.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157096") ? false : stryMutAct_9fa48("157095") ? true : (stryCov_9fa48("157095", "157096", "157097"), (stryMutAct_9fa48("157099") ? typeof selection?.reason !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157098") ? true : (stryCov_9fa48("157098", "157099"), typeof (stryMutAct_9fa48("157100") ? selection.reason : (stryCov_9fa48("157100"), selection?.reason)) === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("157103") ? selection.reason.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157102") ? selection.reason.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157101") ? true : (stryCov_9fa48("157101", "157102", "157103"), selection.reason.length > TRANSPORT_NUM.ZERO)))) ? selection.reason : ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
        retryAfterMs: (stryMutAct_9fa48("157106") ? Number.isFinite(selection?.retryAfterMs) || selection.retryAfterMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157105") ? false : stryMutAct_9fa48("157104") ? true : (stryCov_9fa48("157104", "157105", "157106"), Number.isFinite(stryMutAct_9fa48("157107") ? selection.retryAfterMs : (stryCov_9fa48("157107"), selection?.retryAfterMs)) && (stryMutAct_9fa48("157110") ? selection.retryAfterMs <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157109") ? selection.retryAfterMs >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157108") ? true : (stryCov_9fa48("157108", "157109", "157110"), selection.retryAfterMs > TRANSPORT_NUM.ZERO)))) ? Math.floor(selection.retryAfterMs) : TRANSPORT_NUM.ZERO
      });
    }
  }

  /**
   * Check whether a payload is a query/data-plane message.
   * @param {Object} message - Delivery payload.
   * @return {boolean} True for query/data-plane payloads.
   * @private
   */
  isQueryDataPlaneMessage(message) {
    if (stryMutAct_9fa48("157111")) {
      {}
    } else {
      stryCov_9fa48("157111");
      return Boolean(stryMutAct_9fa48("157114") ? message && typeof message === TRANSPORT_TYPEOF.OBJECT || message.type === QUERY_DATA_PLANE_MESSAGE_TYPE : stryMutAct_9fa48("157113") ? false : stryMutAct_9fa48("157112") ? true : (stryCov_9fa48("157112", "157113", "157114"), (stryMutAct_9fa48("157116") ? message || typeof message === TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("157115") ? true : (stryCov_9fa48("157115", "157116"), message && (stryMutAct_9fa48("157118") ? typeof message !== TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("157117") ? true : (stryCov_9fa48("157117", "157118"), typeof message === TRANSPORT_TYPEOF.OBJECT)))) && (stryMutAct_9fa48("157120") ? message.type !== QUERY_DATA_PLANE_MESSAGE_TYPE : stryMutAct_9fa48("157119") ? true : (stryCov_9fa48("157119", "157120"), message.type === QUERY_DATA_PLANE_MESSAGE_TYPE))));
    }
  }

  /**
   * Resolve the query/data-plane transport selection.
   * Resolver may return a service directly or a typed selection object.
   * @return {{service:Object|null, reason:string, retryAfterMs:number}}
   * @private
   */
  resolveQueryDataPlaneTransportSelection() {
    if (stryMutAct_9fa48("157121")) {
      {}
    } else {
      stryCov_9fa48("157121");
      let selectionResult;
      if (stryMutAct_9fa48("157124") ? typeof this.resolveQueryMessageGroupService === TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("157123") ? false : stryMutAct_9fa48("157122") ? true : (stryCov_9fa48("157122", "157123", "157124"), typeof this.resolveQueryMessageGroupService !== TRANSPORT_TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("157125")) {
          {}
        } else {
          stryCov_9fa48("157125");
          selectionResult = this.buildQueryTransportSelectionResult(QUERY_TRANSPORT_SELECTION.UNAVAILABLE);
        }
      } else {
        if (stryMutAct_9fa48("157126")) {
          {}
        } else {
          stryCov_9fa48("157126");
          const selection = this.resolveQueryMessageGroupService();
          if (stryMutAct_9fa48("157129") ? selection || typeof selection.sendMessage === TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("157128") ? false : stryMutAct_9fa48("157127") ? true : (stryCov_9fa48("157127", "157128", "157129"), selection && (stryMutAct_9fa48("157131") ? typeof selection.sendMessage !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("157130") ? true : (stryCov_9fa48("157130", "157131"), typeof selection.sendMessage === TRANSPORT_TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("157132")) {
              {}
            } else {
              stryCov_9fa48("157132");
              selectionResult = this.buildQueryTransportSelectionResult(QUERY_TRANSPORT_SELECTION.DIRECT_SERVICE, stryMutAct_9fa48("157133") ? {} : (stryCov_9fa48("157133"), {
                service: selection
              }));
            }
          } else if (stryMutAct_9fa48("157136") ? selection?.service || typeof selection.service.sendMessage === TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("157135") ? false : stryMutAct_9fa48("157134") ? true : (stryCov_9fa48("157134", "157135", "157136"), (stryMutAct_9fa48("157137") ? selection.service : (stryCov_9fa48("157137"), selection?.service)) && (stryMutAct_9fa48("157139") ? typeof selection.service.sendMessage !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("157138") ? true : (stryCov_9fa48("157138", "157139"), typeof selection.service.sendMessage === TRANSPORT_TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("157140")) {
              {}
            } else {
              stryCov_9fa48("157140");
              selectionResult = this.buildQueryTransportSelectionResult(QUERY_TRANSPORT_SELECTION.SELECTION_SERVICE, selection);
            }
          } else {
            if (stryMutAct_9fa48("157141")) {
              {}
            } else {
              stryCov_9fa48("157141");
              selectionResult = this.buildQueryTransportSelectionResult(QUERY_TRANSPORT_SELECTION.UNAVAILABLE, selection);
            }
          }
        }
      }
      return selectionResult;
    }
  }
  buildQueryTransportSelectionResult(kind, selection = {}) {
    if (stryMutAct_9fa48("157142")) {
      {}
    } else {
      stryCov_9fa48("157142");
      if (stryMutAct_9fa48("157145") ? kind !== QUERY_TRANSPORT_SELECTION.DIRECT_SERVICE : stryMutAct_9fa48("157144") ? false : stryMutAct_9fa48("157143") ? true : (stryCov_9fa48("157143", "157144", "157145"), kind === QUERY_TRANSPORT_SELECTION.DIRECT_SERVICE)) {
        if (stryMutAct_9fa48("157146")) {
          {}
        } else {
          stryCov_9fa48("157146");
          return stryMutAct_9fa48("157147") ? {} : (stryCov_9fa48("157147"), {
            service: selection.service,
            reason: EMPTY_ROUTER_REASON,
            retryAfterMs: TRANSPORT_NUM.ZERO
          });
        }
      } else if (stryMutAct_9fa48("157150") ? kind !== QUERY_TRANSPORT_SELECTION.SELECTION_SERVICE : stryMutAct_9fa48("157149") ? false : stryMutAct_9fa48("157148") ? true : (stryCov_9fa48("157148", "157149", "157150"), kind === QUERY_TRANSPORT_SELECTION.SELECTION_SERVICE)) {
        if (stryMutAct_9fa48("157151")) {
          {}
        } else {
          stryCov_9fa48("157151");
          return stryMutAct_9fa48("157152") ? {} : (stryCov_9fa48("157152"), {
            service: selection.service,
            reason: EMPTY_ROUTER_REASON,
            retryAfterMs: (stryMutAct_9fa48("157155") ? Number.isFinite(selection.retryAfterMs) || selection.retryAfterMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157154") ? false : stryMutAct_9fa48("157153") ? true : (stryCov_9fa48("157153", "157154", "157155"), Number.isFinite(selection.retryAfterMs) && (stryMutAct_9fa48("157158") ? selection.retryAfterMs <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157157") ? selection.retryAfterMs >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157156") ? true : (stryCov_9fa48("157156", "157157", "157158"), selection.retryAfterMs > TRANSPORT_NUM.ZERO)))) ? Math.floor(selection.retryAfterMs) : TRANSPORT_NUM.ZERO
          });
        }
      }
      return stryMutAct_9fa48("157159") ? {} : (stryCov_9fa48("157159"), {
        service: null,
        reason: (stryMutAct_9fa48("157162") ? typeof selection?.reason === TRANSPORT_TYPEOF.STRING || selection.reason.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157161") ? false : stryMutAct_9fa48("157160") ? true : (stryCov_9fa48("157160", "157161", "157162"), (stryMutAct_9fa48("157164") ? typeof selection?.reason !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157163") ? true : (stryCov_9fa48("157163", "157164"), typeof (stryMutAct_9fa48("157165") ? selection.reason : (stryCov_9fa48("157165"), selection?.reason)) === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("157168") ? selection.reason.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157167") ? selection.reason.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157166") ? true : (stryCov_9fa48("157166", "157167", "157168"), selection.reason.length > TRANSPORT_NUM.ZERO)))) ? selection.reason : ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
        retryAfterMs: (stryMutAct_9fa48("157171") ? Number.isFinite(selection?.retryAfterMs) || selection.retryAfterMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157170") ? false : stryMutAct_9fa48("157169") ? true : (stryCov_9fa48("157169", "157170", "157171"), Number.isFinite(stryMutAct_9fa48("157172") ? selection.retryAfterMs : (stryCov_9fa48("157172"), selection?.retryAfterMs)) && (stryMutAct_9fa48("157175") ? selection.retryAfterMs <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157174") ? selection.retryAfterMs >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157173") ? true : (stryCov_9fa48("157173", "157174", "157175"), selection.retryAfterMs > TRANSPORT_NUM.ZERO)))) ? Math.floor(selection.retryAfterMs) : this.reconnectIntervalMs
      });
    }
  }

  /**
   * Build a typed deferred outcome for query/data-plane transport misses.
   * @param {{reason:string,retryAfterMs:number}} selection
   * @return {Object}
   * @private
   */
  buildDeferredQueryTransportOutcome(selection = {}) {
    if (stryMutAct_9fa48("157176")) {
      {}
    } else {
      stryCov_9fa48("157176");
      const retryAfterMs = (stryMutAct_9fa48("157179") ? Number.isFinite(selection.retryAfterMs) || selection.retryAfterMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157178") ? false : stryMutAct_9fa48("157177") ? true : (stryCov_9fa48("157177", "157178", "157179"), Number.isFinite(selection.retryAfterMs) && (stryMutAct_9fa48("157182") ? selection.retryAfterMs <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157181") ? selection.retryAfterMs >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157180") ? true : (stryCov_9fa48("157180", "157181", "157182"), selection.retryAfterMs > TRANSPORT_NUM.ZERO)))) ? Math.floor(selection.retryAfterMs) : this.reconnectIntervalMs;
      return stryMutAct_9fa48("157183") ? {} : (stryCov_9fa48("157183"), {
        acknowledged: stryMutAct_9fa48("157184") ? true : (stryCov_9fa48("157184"), false),
        error: stryMutAct_9fa48("157187") ? selection.reason && ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED : stryMutAct_9fa48("157186") ? false : stryMutAct_9fa48("157185") ? true : (stryCov_9fa48("157185", "157186", "157187"), selection.reason || ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED),
        errorCode: MESSAGE_ROUTER_LITERAL.STRING_ROUTER_QUERY_TRANSPORT_NOT_READY,
        deferRetry: stryMutAct_9fa48("157188") ? false : (stryCov_9fa48("157188"), true),
        retryAfterMs
      });
    }
  }
  buildDeliveryOutcomeResult(result) {
    if (stryMutAct_9fa48("157189")) {
      {}
    } else {
      stryCov_9fa48("157189");
      return stryMutAct_9fa48("157190") ? {} : (stryCov_9fa48("157190"), {
        result,
        queueWaitMs: TRANSPORT_NUM.ZERO
      });
    }
  }
  async resolveDeliveryOutcome(targetAddress, message, messageId, targetNodeId, correlationId, options) {
    if (stryMutAct_9fa48("157191")) {
      {}
    } else {
      stryCov_9fa48("157191");
      if (stryMutAct_9fa48("157193") ? false : stryMutAct_9fa48("157192") ? true : (stryCov_9fa48("157192", "157193"), this.isQueryDataPlaneMessage(message))) {
        if (stryMutAct_9fa48("157194")) {
          {}
        } else {
          stryCov_9fa48("157194");
          const queryTransportSelection = this.resolveQueryDataPlaneTransportSelection();
          const queryTransport = queryTransportSelection.service;
          const queryResult = queryTransport ? await queryTransport.sendMessage(targetAddress, message) : this.buildDeferredQueryTransportOutcome(queryTransportSelection);
          return this.buildDeliveryOutcomeResult(queryResult);
        }
      }
      if (stryMutAct_9fa48("157197") ? targetNodeId !== this.nodeId : stryMutAct_9fa48("157196") ? false : stryMutAct_9fa48("157195") ? true : (stryCov_9fa48("157195", "157196", "157197"), targetNodeId === this.nodeId)) {
        if (stryMutAct_9fa48("157198")) {
          {}
        } else {
          stryCov_9fa48("157198");
          return this.deliverLocal(targetAddress, messageId, message, correlationId);
        }
      }
      return this.deliverRemote(targetAddress, messageId, message, targetNodeId, correlationId, options);
    }
  }

  /**
   * Get or create outbound queue for a node.
   * @param {string} nodeId - Target node ID.
   * @return {Object} Queue state.
   * @private
   */
  getOutboundQueue(nodeId) {
    if (stryMutAct_9fa48("157199")) {
      {}
    } else {
      stryCov_9fa48("157199");
      if (stryMutAct_9fa48("157202") ? false : stryMutAct_9fa48("157201") ? true : stryMutAct_9fa48("157200") ? this.outboundQueues.has(nodeId) : (stryCov_9fa48("157200", "157201", "157202"), !this.outboundQueues.has(nodeId))) {
        if (stryMutAct_9fa48("157203")) {
          {}
        } else {
          stryCov_9fa48("157203");
          this.outboundQueues.set(nodeId, stryMutAct_9fa48("157204") ? {} : (stryCov_9fa48("157204"), {
            nodeId,
            inFlight: TRANSPORT_NUM.ZERO,
            pending: stryMutAct_9fa48("157205") ? ["Stryker was here"] : (stryCov_9fa48("157205"), []),
            maxConcurrent: this.outboundQueueMaxConcurrent,
            maxPending: this.outboundQueueMaxPending,
            criticalReserve: this.outboundQueueCriticalReserve,
            queueWaitSampleCount: TRANSPORT_NUM.ZERO,
            queueWaitTotalMs: TRANSPORT_NUM.ZERO,
            queueWaitMaxMs: TRANSPORT_NUM.ZERO,
            queueWaitHistogram: createQueueWaitHistogram()
          }));
        }
      }
      return this.outboundQueues.get(nodeId);
    }
  }

  /**
   * Check if the outbound queue has immediate capacity for a node.
   * @param {string} nodeId - Target node ID.
   * @return {boolean} True if capacity is available.
   */
  isOutboundQueueAvailable(nodeId) {
    if (stryMutAct_9fa48("157206")) {
      {}
    } else {
      stryCov_9fa48("157206");
      const queue = this.outboundQueues.get(nodeId);
      if (stryMutAct_9fa48("157209") ? false : stryMutAct_9fa48("157208") ? true : stryMutAct_9fa48("157207") ? queue : (stryCov_9fa48("157207", "157208", "157209"), !queue)) {
        if (stryMutAct_9fa48("157210")) {
          {}
        } else {
          stryCov_9fa48("157210");
          return stryMutAct_9fa48("157211") ? false : (stryCov_9fa48("157211"), true);
        }
      }
      return stryMutAct_9fa48("157215") ? queue.inFlight >= queue.maxConcurrent : stryMutAct_9fa48("157214") ? queue.inFlight <= queue.maxConcurrent : stryMutAct_9fa48("157213") ? false : stryMutAct_9fa48("157212") ? true : (stryCov_9fa48("157212", "157213", "157214", "157215"), queue.inFlight < queue.maxConcurrent);
    }
  }

  /**
   * Enqueue a delivery for a node with per-node concurrency limits.
   * @param {string} nodeId - Target node ID.
   * @param {Function} deliverFn - Function that returns a Promise result.
   * @return {Promise<Object>} Delivery result.
   * @private
   */
  enqueueOutbound(nodeId, deliverFn, options = {}) {
    if (stryMutAct_9fa48("157216")) {
      {}
    } else {
      stryCov_9fa48("157216");
      const queue = this.getOutboundQueue(nodeId);
      const deliveryPriority = normalizeOutboundDeliveryPriority(options.deliveryPriority);
      const deliverySource = resolveDeliverySource(options.targetAddress, options.message, options);
      const replacePendingKey = resolvePendingReplacementKey(options.targetAddress, options.message, options);
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("157217")) {
          {}
        } else {
          stryCov_9fa48("157217");
          if (stryMutAct_9fa48("157219") ? false : stryMutAct_9fa48("157218") ? true : (stryCov_9fa48("157218", "157219"), replacePendingKey)) {
            if (stryMutAct_9fa48("157220")) {
              {}
            } else {
              stryCov_9fa48("157220");
              const existingPendingIndex = queue.pending.findIndex(stryMutAct_9fa48("157221") ? () => undefined : (stryCov_9fa48("157221"), item => stryMutAct_9fa48("157224") ? item?.replacePendingKey !== replacePendingKey : stryMutAct_9fa48("157223") ? false : stryMutAct_9fa48("157222") ? true : (stryCov_9fa48("157222", "157223", "157224"), (stryMutAct_9fa48("157225") ? item.replacePendingKey : (stryCov_9fa48("157225"), item?.replacePendingKey)) === replacePendingKey)));
              if (stryMutAct_9fa48("157229") ? existingPendingIndex < TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157228") ? existingPendingIndex > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157227") ? false : stryMutAct_9fa48("157226") ? true : (stryCov_9fa48("157226", "157227", "157228", "157229"), existingPendingIndex >= TRANSPORT_NUM.ZERO)) {
                if (stryMutAct_9fa48("157230")) {
                  {}
                } else {
                  stryCov_9fa48("157230");
                  const existingPendingItem = queue.pending[existingPendingIndex];
                  existingPendingItem.resolve(buildSupersededPendingResult(existingPendingItem));
                  queue.pending[existingPendingIndex] = stryMutAct_9fa48("157231") ? {} : (stryCov_9fa48("157231"), {
                    deliverFn,
                    resolve,
                    reject,
                    queuedAt: Date.now(),
                    priority: deliveryPriority,
                    deliverySource,
                    replacePendingKey
                  });
                  return;
                }
              }
            }
          }
          const pendingBackground = countPendingByPriority(queue, OutboundDeliveryPriority.BACKGROUND);
          const backgroundPendingLimit = resolveBackgroundPendingLimit(queue);
          const isBackpressured = (stryMutAct_9fa48("157234") ? deliveryPriority !== OutboundDeliveryPriority.CRITICAL : stryMutAct_9fa48("157233") ? false : stryMutAct_9fa48("157232") ? true : (stryCov_9fa48("157232", "157233", "157234"), deliveryPriority === OutboundDeliveryPriority.CRITICAL)) ? stryMutAct_9fa48("157238") ? queue.pending.length < queue.maxPending : stryMutAct_9fa48("157237") ? queue.pending.length > queue.maxPending : stryMutAct_9fa48("157236") ? false : stryMutAct_9fa48("157235") ? true : (stryCov_9fa48("157235", "157236", "157237", "157238"), queue.pending.length >= queue.maxPending) : stryMutAct_9fa48("157242") ? pendingBackground < backgroundPendingLimit : stryMutAct_9fa48("157241") ? pendingBackground > backgroundPendingLimit : stryMutAct_9fa48("157240") ? false : stryMutAct_9fa48("157239") ? true : (stryCov_9fa48("157239", "157240", "157241", "157242"), pendingBackground >= backgroundPendingLimit);
          if (stryMutAct_9fa48("157244") ? false : stryMutAct_9fa48("157243") ? true : (stryCov_9fa48("157243", "157244"), isBackpressured)) {
            if (stryMutAct_9fa48("157245")) {
              {}
            } else {
              stryCov_9fa48("157245");
              const error = new Error(ROUTER_ERROR_MSG.outboundQueueBackpressured(nodeId, queue.maxPending));
              error.code = OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE;
              this.logger.warn(MESSAGE_ROUTER_LITERAL.STRING_OUTBOUND_QUEUE_SATURATED_FOR_NODE_DELIVERY, stryMutAct_9fa48("157246") ? {} : (stryCov_9fa48("157246"), {
                localNodeId: this.nodeId,
                targetNodeId: nodeId,
                deliveryPriority,
                attemptedDeliverySource: deliverySource,
                attemptedTargetAddress: normalizeIdentifier(options.targetAddress),
                pending: queue.pending.length,
                pendingCritical: countPendingByPriority(queue, OutboundDeliveryPriority.CRITICAL),
                pendingBackground,
                backgroundPendingLimit,
                criticalReserve: queue.criticalReserve,
                maxPending: queue.maxPending,
                inFlight: queue.inFlight,
                pendingSourceSummary: buildPendingSourceSummary(queue)
              }));
              reject(error);
              return;
            }
          }
          queue.pending.push(stryMutAct_9fa48("157247") ? {} : (stryCov_9fa48("157247"), {
            deliverFn,
            resolve,
            reject,
            queuedAt: Date.now(),
            priority: deliveryPriority,
            deliverySource,
            replacePendingKey
          }));
          this.processOutboundQueue(nodeId);
        }
      });
    }
  }

  /**
   * Process queued outbound deliveries for a node.
   * @param {string} nodeId - Target node ID.
   * @private
   */
  processOutboundQueue(nodeId) {
    if (stryMutAct_9fa48("157248")) {
      {}
    } else {
      stryCov_9fa48("157248");
      const queue = this.outboundQueues.get(nodeId);
      if (stryMutAct_9fa48("157251") ? false : stryMutAct_9fa48("157250") ? true : stryMutAct_9fa48("157249") ? queue : (stryCov_9fa48("157249", "157250", "157251"), !queue)) {
        if (stryMutAct_9fa48("157252")) {
          {}
        } else {
          stryCov_9fa48("157252");
          return;
        }
      }
      while (stryMutAct_9fa48("157254") ? queue.inFlight < queue.maxConcurrent || queue.pending.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157253") ? false : (stryCov_9fa48("157253", "157254"), (stryMutAct_9fa48("157257") ? queue.inFlight >= queue.maxConcurrent : stryMutAct_9fa48("157256") ? queue.inFlight <= queue.maxConcurrent : stryMutAct_9fa48("157255") ? true : (stryCov_9fa48("157255", "157256", "157257"), queue.inFlight < queue.maxConcurrent)) && (stryMutAct_9fa48("157260") ? queue.pending.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157259") ? queue.pending.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157258") ? true : (stryCov_9fa48("157258", "157259", "157260"), queue.pending.length > TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("157261")) {
          {}
        } else {
          stryCov_9fa48("157261");
          const item = dequeueNextPendingItem(queue);
          stryMutAct_9fa48("157262") ? queue.inFlight -= TRANSPORT_NUM.ONE : (stryCov_9fa48("157262"), queue.inFlight += TRANSPORT_NUM.ONE);
          const queueWaitMs = stryMutAct_9fa48("157263") ? Math.min(TRANSPORT_NUM.ZERO, Date.now() - (item?.queuedAt || Date.now())) : (stryCov_9fa48("157263"), Math.max(TRANSPORT_NUM.ZERO, stryMutAct_9fa48("157264") ? Date.now() + (item?.queuedAt || Date.now()) : (stryCov_9fa48("157264"), Date.now() - (stryMutAct_9fa48("157267") ? item?.queuedAt && Date.now() : stryMutAct_9fa48("157266") ? false : stryMutAct_9fa48("157265") ? true : (stryCov_9fa48("157265", "157266", "157267"), (stryMutAct_9fa48("157268") ? item.queuedAt : (stryCov_9fa48("157268"), item?.queuedAt)) || Date.now())))));
          recordQueueWaitDuration(queue, queueWaitMs);
          Promise.resolve().then(stryMutAct_9fa48("157269") ? () => undefined : (stryCov_9fa48("157269"), () => item.deliverFn())).then(result => {
            if (stryMutAct_9fa48("157270")) {
              {}
            } else {
              stryCov_9fa48("157270");
              stryMutAct_9fa48("157271") ? queue.inFlight += TRANSPORT_NUM.ONE : (stryCov_9fa48("157271"), queue.inFlight -= TRANSPORT_NUM.ONE);
              item.resolve(stryMutAct_9fa48("157272") ? {} : (stryCov_9fa48("157272"), {
                result,
                queueWaitMs
              }));
              this.processOutboundQueue(nodeId);
            }
          }).catch(error => {
            if (stryMutAct_9fa48("157273")) {
              {}
            } else {
              stryCov_9fa48("157273");
              stryMutAct_9fa48("157274") ? queue.inFlight += TRANSPORT_NUM.ONE : (stryCov_9fa48("157274"), queue.inFlight -= TRANSPORT_NUM.ONE);
              item.reject(error);
              this.processOutboundQueue(nodeId);
            }
          });
        }
      }
    }
  }

  /**
   * Fail queued outbound deliveries for a node.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Error to reject with.
   * @private
   */
  failOutboundQueue(nodeId, error) {
    if (stryMutAct_9fa48("157275")) {
      {}
    } else {
      stryCov_9fa48("157275");
      const queue = this.outboundQueues.get(nodeId);
      if (stryMutAct_9fa48("157278") ? false : stryMutAct_9fa48("157277") ? true : stryMutAct_9fa48("157276") ? queue : (stryCov_9fa48("157276", "157277", "157278"), !queue)) {
        if (stryMutAct_9fa48("157279")) {
          {}
        } else {
          stryCov_9fa48("157279");
          return;
        }
      }
      while (stryMutAct_9fa48("157282") ? queue.pending.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157281") ? queue.pending.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157280") ? false : (stryCov_9fa48("157280", "157281", "157282"), queue.pending.length > TRANSPORT_NUM.ZERO)) {
        if (stryMutAct_9fa48("157283")) {
          {}
        } else {
          stryCov_9fa48("157283");
          const item = dequeueNextPendingItem(queue);
          item.reject(error);
        }
      }
    }
  }

  /**
   * Gracefully fail queued outbound deliveries (no rejection).
   * Used during shutdown to avoid unhandled rejections from fire-and-forget tasks.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Error to return as a failed delivery.
   * @private
   */
  failOutboundQueueGracefully(nodeId, error) {
    if (stryMutAct_9fa48("157284")) {
      {}
    } else {
      stryCov_9fa48("157284");
      const queue = this.outboundQueues.get(nodeId);
      if (stryMutAct_9fa48("157287") ? false : stryMutAct_9fa48("157286") ? true : stryMutAct_9fa48("157285") ? queue : (stryCov_9fa48("157285", "157286", "157287"), !queue)) {
        if (stryMutAct_9fa48("157288")) {
          {}
        } else {
          stryCov_9fa48("157288");
          return;
        }
      }
      const errorMessage = stryMutAct_9fa48("157291") ? error?.message && ROUTER_ERROR_MSG.SHUTDOWN : stryMutAct_9fa48("157290") ? false : stryMutAct_9fa48("157289") ? true : (stryCov_9fa48("157289", "157290", "157291"), (stryMutAct_9fa48("157292") ? error.message : (stryCov_9fa48("157292"), error?.message)) || ROUTER_ERROR_MSG.SHUTDOWN);
      while (stryMutAct_9fa48("157295") ? queue.pending.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157294") ? queue.pending.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157293") ? false : (stryCov_9fa48("157293", "157294", "157295"), queue.pending.length > TRANSPORT_NUM.ZERO)) {
        if (stryMutAct_9fa48("157296")) {
          {}
        } else {
          stryCov_9fa48("157296");
          const item = dequeueNextPendingItem(queue);
          item.resolve(stryMutAct_9fa48("157297") ? {} : (stryCov_9fa48("157297"), {
            acknowledged: stryMutAct_9fa48("157298") ? true : (stryCov_9fa48("157298"), false),
            error: errorMessage,
            shutdown: stryMutAct_9fa48("157299") ? false : (stryCov_9fa48("157299"), true)
          }));
        }
      }
    }
  }

  /**
   * Fail pending in-flight messages for a node.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Error to reject with.
   * @private
   */
  failPendingMessagesForNode(nodeId, error) {
    if (stryMutAct_9fa48("157300")) {
      {}
    } else {
      stryCov_9fa48("157300");
      for (const [messageId, pending] of this.pendingMessages) {
        if (stryMutAct_9fa48("157301")) {
          {}
        } else {
          stryCov_9fa48("157301");
          if (stryMutAct_9fa48("157304") ? pending.targetNodeId !== nodeId : stryMutAct_9fa48("157303") ? false : stryMutAct_9fa48("157302") ? true : (stryCov_9fa48("157302", "157303", "157304"), pending.targetNodeId === nodeId)) {
            if (stryMutAct_9fa48("157305")) {
              {}
            } else {
              stryCov_9fa48("157305");
              clearTimeout(pending.timeout);
              this.pendingMessages.delete(messageId);
              pending.reject(error);
            }
          }
        }
      }
    }
  }

  /**
   * Decide whether a transport-deliver metric should be emitted.
   * Emits immediately for faults, slow deliveries, and meaningful
   * queue-depth transitions; samples steady-state successful traffic.
   * @param {string} targetNodeId - Target node ID.
   * @param {number} durationMs - Delivery duration in milliseconds.
   * @param {number} queueDepth - Pending outbound queue depth.
   * @param {boolean} acknowledged - Whether delivery was acknowledged.
   * @return {string|null} Trigger code when metric should be emitted.
   * @private
   */
  getDeliverMetricTrigger(targetNodeId, durationMs, queueDepth, acknowledged) {
    if (stryMutAct_9fa48("157306")) {
      {}
    } else {
      stryCov_9fa48("157306");
      if (stryMutAct_9fa48("157309") ? false : stryMutAct_9fa48("157308") ? true : stryMutAct_9fa48("157307") ? acknowledged : (stryCov_9fa48("157307", "157308", "157309"), !acknowledged)) {
        if (stryMutAct_9fa48("157310")) {
          {}
        } else {
          stryCov_9fa48("157310");
          const faultSampleCount = stryMutAct_9fa48("157311") ? (this.deliverMetricFaultSampleByTarget.get(targetNodeId) || TRANSPORT_NUM.ZERO) - TRANSPORT_NUM.ONE : (stryCov_9fa48("157311"), (stryMutAct_9fa48("157314") ? this.deliverMetricFaultSampleByTarget.get(targetNodeId) && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157313") ? false : stryMutAct_9fa48("157312") ? true : (stryCov_9fa48("157312", "157313", "157314"), this.deliverMetricFaultSampleByTarget.get(targetNodeId) || TRANSPORT_NUM.ZERO)) + TRANSPORT_NUM.ONE);
          this.deliverMetricFaultSampleByTarget.set(targetNodeId, faultSampleCount);
          if (stryMutAct_9fa48("157317") ? faultSampleCount === TRANSPORT_NUM.ONE && faultSampleCount % TRANSPORT_METRIC.DELIVER_FAULT_SAMPLE_EVERY === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157316") ? false : stryMutAct_9fa48("157315") ? true : (stryCov_9fa48("157315", "157316", "157317"), (stryMutAct_9fa48("157319") ? faultSampleCount !== TRANSPORT_NUM.ONE : stryMutAct_9fa48("157318") ? false : (stryCov_9fa48("157318", "157319"), faultSampleCount === TRANSPORT_NUM.ONE)) || (stryMutAct_9fa48("157321") ? faultSampleCount % TRANSPORT_METRIC.DELIVER_FAULT_SAMPLE_EVERY !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157320") ? false : (stryCov_9fa48("157320", "157321"), (stryMutAct_9fa48("157322") ? faultSampleCount * TRANSPORT_METRIC.DELIVER_FAULT_SAMPLE_EVERY : (stryCov_9fa48("157322"), faultSampleCount % TRANSPORT_METRIC.DELIVER_FAULT_SAMPLE_EVERY)) === TRANSPORT_NUM.ZERO)))) {
            if (stryMutAct_9fa48("157323")) {
              {}
            } else {
              stryCov_9fa48("157323");
              return TRANSPORT_METRIC_TRIGGER.FAULT;
            }
          }
          return null;
        }
      }
      this.deliverMetricFaultSampleByTarget.set(targetNodeId, TRANSPORT_NUM.ZERO);
      if (stryMutAct_9fa48("157327") ? durationMs < TRANSPORT_METRIC.DELIVER_SLOW_THRESHOLD_MS : stryMutAct_9fa48("157326") ? durationMs > TRANSPORT_METRIC.DELIVER_SLOW_THRESHOLD_MS : stryMutAct_9fa48("157325") ? false : stryMutAct_9fa48("157324") ? true : (stryCov_9fa48("157324", "157325", "157326", "157327"), durationMs >= TRANSPORT_METRIC.DELIVER_SLOW_THRESHOLD_MS)) {
        if (stryMutAct_9fa48("157328")) {
          {}
        } else {
          stryCov_9fa48("157328");
          return TRANSPORT_METRIC_TRIGGER.SLOW;
        }
      }
      const previousQueueDepth = stryMutAct_9fa48("157331") ? this.deliverMetricQueueDepthByTarget.get(targetNodeId) && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157330") ? false : stryMutAct_9fa48("157329") ? true : (stryCov_9fa48("157329", "157330", "157331"), this.deliverMetricQueueDepthByTarget.get(targetNodeId) || TRANSPORT_NUM.ZERO);
      if (stryMutAct_9fa48("157335") ? queueDepth < TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD : stryMutAct_9fa48("157334") ? queueDepth > TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD : stryMutAct_9fa48("157333") ? false : stryMutAct_9fa48("157332") ? true : (stryCov_9fa48("157332", "157333", "157334", "157335"), queueDepth >= TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD)) {
        if (stryMutAct_9fa48("157336")) {
          {}
        } else {
          stryCov_9fa48("157336");
          const queueDepthDelta = Math.abs(stryMutAct_9fa48("157337") ? queueDepth + previousQueueDepth : (stryCov_9fa48("157337"), queueDepth - previousQueueDepth));
          if (stryMutAct_9fa48("157340") ? previousQueueDepth < TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD && queueDepthDelta >= TRANSPORT_METRIC.DELIVER_QUEUE_CHANGE_THRESHOLD : stryMutAct_9fa48("157339") ? false : stryMutAct_9fa48("157338") ? true : (stryCov_9fa48("157338", "157339", "157340"), (stryMutAct_9fa48("157343") ? previousQueueDepth >= TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD : stryMutAct_9fa48("157342") ? previousQueueDepth <= TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD : stryMutAct_9fa48("157341") ? false : (stryCov_9fa48("157341", "157342", "157343"), previousQueueDepth < TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD)) || (stryMutAct_9fa48("157346") ? queueDepthDelta < TRANSPORT_METRIC.DELIVER_QUEUE_CHANGE_THRESHOLD : stryMutAct_9fa48("157345") ? queueDepthDelta > TRANSPORT_METRIC.DELIVER_QUEUE_CHANGE_THRESHOLD : stryMutAct_9fa48("157344") ? false : (stryCov_9fa48("157344", "157345", "157346"), queueDepthDelta >= TRANSPORT_METRIC.DELIVER_QUEUE_CHANGE_THRESHOLD)))) {
            if (stryMutAct_9fa48("157347")) {
              {}
            } else {
              stryCov_9fa48("157347");
              return TRANSPORT_METRIC_TRIGGER.BACKPRESSURE;
            }
          }
        }
      } else if (stryMutAct_9fa48("157351") ? previousQueueDepth < TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD : stryMutAct_9fa48("157350") ? previousQueueDepth > TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD : stryMutAct_9fa48("157349") ? false : stryMutAct_9fa48("157348") ? true : (stryCov_9fa48("157348", "157349", "157350", "157351"), previousQueueDepth >= TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD)) {
        if (stryMutAct_9fa48("157352")) {
          {}
        } else {
          stryCov_9fa48("157352");
          return TRANSPORT_METRIC_TRIGGER.QUEUE_DRAINED;
        }
      }
      const sampleCount = stryMutAct_9fa48("157353") ? (this.deliverMetricSampleByTarget.get(targetNodeId) || TRANSPORT_NUM.ZERO) - TRANSPORT_NUM.ONE : (stryCov_9fa48("157353"), (stryMutAct_9fa48("157356") ? this.deliverMetricSampleByTarget.get(targetNodeId) && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157355") ? false : stryMutAct_9fa48("157354") ? true : (stryCov_9fa48("157354", "157355", "157356"), this.deliverMetricSampleByTarget.get(targetNodeId) || TRANSPORT_NUM.ZERO)) + TRANSPORT_NUM.ONE);
      this.deliverMetricSampleByTarget.set(targetNodeId, sampleCount);
      if (stryMutAct_9fa48("157360") ? sampleCount < TRANSPORT_METRIC.DELIVER_SUCCESS_SAMPLE_EVERY : stryMutAct_9fa48("157359") ? sampleCount > TRANSPORT_METRIC.DELIVER_SUCCESS_SAMPLE_EVERY : stryMutAct_9fa48("157358") ? false : stryMutAct_9fa48("157357") ? true : (stryCov_9fa48("157357", "157358", "157359", "157360"), sampleCount >= TRANSPORT_METRIC.DELIVER_SUCCESS_SAMPLE_EVERY)) {
        if (stryMutAct_9fa48("157361")) {
          {}
        } else {
          stryCov_9fa48("157361");
          this.deliverMetricSampleByTarget.set(targetNodeId, TRANSPORT_NUM.ZERO);
          return TRANSPORT_METRIC_TRIGGER.SAMPLE;
        }
      }
      return null;
    }
  }

  /**
   * Deliver message locally by invoking the registered handler directly,
   * bypassing WebSocket serialization. Falls back to deliverRemote when
   * no handler is registered (e.g. join request/complete special handlers).
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @param {string} correlationId - Correlation ID.
   * @return {Promise<Object>} Delivery outcome with result and queueWaitMs.
   * @private
   */
  async deliverLocal(targetAddress, messageId, payload, correlationId) {
    if (stryMutAct_9fa48("157362")) {
      {}
    } else {
      stryCov_9fa48("157362");
      const handler = this.handlers.get(targetAddress);
      if (stryMutAct_9fa48("157365") ? false : stryMutAct_9fa48("157364") ? true : stryMutAct_9fa48("157363") ? handler : (stryCov_9fa48("157363", "157364", "157365"), !handler)) {
        if (stryMutAct_9fa48("157366")) {
          {}
        } else {
          stryCov_9fa48("157366");
          // Fall back to remote path for special handlers (join request, etc.)
          return this.deliverRemote(targetAddress, messageId, payload, this.nodeId, correlationId);
        }
      }
      const envelope = stryMutAct_9fa48("157367") ? {} : (stryCov_9fa48("157367"), {
        messageId,
        sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
        sourceNodeId: this.nodeId,
        targetAddress,
        payload,
        timestamp: Date.now()
      });
      try {
        if (stryMutAct_9fa48("157368")) {
          {}
        } else {
          stryCov_9fa48("157368");
          const result = await Promise.resolve(handler(envelope));
          return stryMutAct_9fa48("157369") ? {} : (stryCov_9fa48("157369"), {
            result: stryMutAct_9fa48("157370") ? {} : (stryCov_9fa48("157370"), {
              messageId,
              correlationId,
              acknowledged: stryMutAct_9fa48("157371") ? false : (stryCov_9fa48("157371"), true),
              ...((stryMutAct_9fa48("157374") ? result || typeof result === TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("157373") ? false : stryMutAct_9fa48("157372") ? true : (stryCov_9fa48("157372", "157373", "157374"), result && (stryMutAct_9fa48("157376") ? typeof result !== TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("157375") ? true : (stryCov_9fa48("157375", "157376"), typeof result === TRANSPORT_TYPEOF.OBJECT)))) ? (() => {
                if (stryMutAct_9fa48("157377")) {
                  {}
                } else {
                  stryCov_9fa48("157377");
                  const {
                    acknowledged: _ack,
                    type: handlerType,
                    ...rest
                  } = result;
                  const merged = stryMutAct_9fa48("157378") ? {} : (stryCov_9fa48("157378"), {
                    ...rest
                  });
                  if (stryMutAct_9fa48("157380") ? false : stryMutAct_9fa48("157379") ? true : (stryCov_9fa48("157379", "157380"), handlerType)) merged.responseType = handlerType;
                  return merged;
                }
              })() : {})
            }),
            queueWaitMs: TRANSPORT_NUM.ZERO
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("157381")) {
          {}
        } else {
          stryCov_9fa48("157381");
          return stryMutAct_9fa48("157382") ? {} : (stryCov_9fa48("157382"), {
            result: stryMutAct_9fa48("157383") ? {} : (stryCov_9fa48("157383"), {
              messageId,
              correlationId,
              acknowledged: stryMutAct_9fa48("157384") ? true : (stryCov_9fa48("157384"), false),
              error: error.message
            }),
            queueWaitMs: TRANSPORT_NUM.ZERO
          });
        }
      }
    }
  }

  /**
   * Deliver a message to a target service via WebSocket connections.
   * @param {string} targetAddress - Target service address.
   * @param {Object} message - Message to deliver.
   * @param {Object} options - Delivery options.
   * @param {string} options.targetNodeId - Target node ID (if known).
   * @return {Promise<Object>} Delivery result with transportUsed field when using registry.
   */
  async deliver(targetAddress, message, options = {}) {
    if (stryMutAct_9fa48("157385")) {
      {}
    } else {
      stryCov_9fa48("157385");
      const deliverStartMs = Date.now();
      if (stryMutAct_9fa48("157388") ? false : stryMutAct_9fa48("157387") ? true : stryMutAct_9fa48("157386") ? this.initialized : (stryCov_9fa48("157386", "157387", "157388"), !this.initialized)) {
        if (stryMutAct_9fa48("157389")) {
          {}
        } else {
          stryCov_9fa48("157389");
          await this.initialize();
        }
      }
      const deliveryTimeoutMs = (stryMutAct_9fa48("157392") ? Number.isFinite(options.timeoutMs) || options.timeoutMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157391") ? false : stryMutAct_9fa48("157390") ? true : (stryCov_9fa48("157390", "157391", "157392"), Number.isFinite(options.timeoutMs) && (stryMutAct_9fa48("157395") ? options.timeoutMs <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157394") ? options.timeoutMs >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157393") ? true : (stryCov_9fa48("157393", "157394", "157395"), options.timeoutMs > TRANSPORT_NUM.ZERO)))) ? Math.floor(options.timeoutMs) : this.messageTimeoutMs;
      const messageId = stryMutAct_9fa48("157398") ? message.messageId && uuidv4() : stryMutAct_9fa48("157397") ? false : stryMutAct_9fa48("157396") ? true : (stryCov_9fa48("157396", "157397", "157398"), message.messageId || uuidv4());
      const correlationId = stryMutAct_9fa48("157401") ? message.correlationId && messageId : stryMutAct_9fa48("157400") ? false : stryMutAct_9fa48("157399") ? true : (stryCov_9fa48("157399", "157400", "157401"), message.correlationId || messageId);
      const requestId = resolveRequestIdFromMessage(message);
      const operationId = resolveOperationIdFromMessage(message);
      const deliverySource = resolveDeliverySource(targetAddress, message, options);
      stryMutAct_9fa48("157402") ? this.messageCount -= TRANSPORT_NUM.ONE : (stryCov_9fa48("157402"), this.messageCount += TRANSPORT_NUM.ONE);

      // Determine target node
      let targetNodeId = options.targetNodeId;

      // If no targetNodeId provided, try to extract from address or use resolver
      if (stryMutAct_9fa48("157405") ? false : stryMutAct_9fa48("157404") ? true : stryMutAct_9fa48("157403") ? targetNodeId : (stryCov_9fa48("157403", "157404", "157405"), !targetNodeId)) {
        if (stryMutAct_9fa48("157406")) {
          {}
        } else {
          stryCov_9fa48("157406");
          // Try to parse nodeId from unified address format (nodeId/entityType/entityId)
          const parsed = this.parseAddress(targetAddress);
          if (stryMutAct_9fa48("157408") ? false : stryMutAct_9fa48("157407") ? true : (stryCov_9fa48("157407", "157408"), parsed.nodeId)) {
            if (stryMutAct_9fa48("157409")) {
              {}
            } else {
              stryCov_9fa48("157409");
              targetNodeId = parsed.nodeId;
            }
          }
        }
      }
      if (stryMutAct_9fa48("157412") ? !targetNodeId || this.resolveServiceNode : stryMutAct_9fa48("157411") ? false : stryMutAct_9fa48("157410") ? true : (stryCov_9fa48("157410", "157411", "157412"), (stryMutAct_9fa48("157413") ? targetNodeId : (stryCov_9fa48("157413"), !targetNodeId)) && this.resolveServiceNode)) {
        if (stryMutAct_9fa48("157414")) {
          {}
        } else {
          stryCov_9fa48("157414");
          targetNodeId = this.resolveServiceNode(targetAddress);
        }
      }
      if (stryMutAct_9fa48("157417") ? false : stryMutAct_9fa48("157416") ? true : stryMutAct_9fa48("157415") ? targetNodeId : (stryCov_9fa48("157415", "157416", "157417"), !targetNodeId)) {
        if (stryMutAct_9fa48("157418")) {
          {}
        } else {
          stryCov_9fa48("157418");
          throw new Error(ROUTER_ERROR_MSG.invalidAddressFormat(targetAddress));
        }
      }
      const deliveryOutcome = await this.resolveDeliveryOutcome(targetAddress, message, messageId, targetNodeId, correlationId, stryMutAct_9fa48("157419") ? {} : (stryCov_9fa48("157419"), {
        ...options,
        deliverySource,
        timeoutMs: deliveryTimeoutMs
      }));
      const normalizedOutcome = normalizeDeliveryOutcome(deliveryOutcome);
      const result = normalizedOutcome.result;
      const queueWaitMs = normalizedOutcome.queueWaitMs;
      try {
        if (stryMutAct_9fa48("157420")) {
          {}
        } else {
          stryCov_9fa48("157420");
          const queue = this.outboundQueues.get(targetNodeId);
          const queueDepth = queue ? queue.pending.length : TRANSPORT_NUM.ZERO;
          const queueWaitSummary = buildQueueWaitSummary(queue);
          const durationMs = stryMutAct_9fa48("157421") ? Date.now() + deliverStartMs : (stryCov_9fa48("157421"), Date.now() - deliverStartMs);
          const acknowledged = stryMutAct_9fa48("157424") ? result?.acknowledged !== true : stryMutAct_9fa48("157423") ? false : stryMutAct_9fa48("157422") ? true : (stryCov_9fa48("157422", "157423", "157424"), (stryMutAct_9fa48("157425") ? result.acknowledged : (stryCov_9fa48("157425"), result?.acknowledged)) === (stryMutAct_9fa48("157426") ? false : (stryCov_9fa48("157426"), true)));
          const trigger = this.getDeliverMetricTrigger(targetNodeId, durationMs, queueDepth, acknowledged);
          if (stryMutAct_9fa48("157428") ? false : stryMutAct_9fa48("157427") ? true : (stryCov_9fa48("157427", "157428"), trigger)) {
            if (stryMutAct_9fa48("157429")) {
              {}
            } else {
              stryCov_9fa48("157429");
              this.deliverMetricQueueDepthByTarget.set(targetNodeId, queueDepth);
              if (stryMutAct_9fa48("157432") ? trigger === TRANSPORT_METRIC_TRIGGER.SAMPLE : stryMutAct_9fa48("157431") ? false : stryMutAct_9fa48("157430") ? true : (stryCov_9fa48("157430", "157431", "157432"), trigger !== TRANSPORT_METRIC_TRIGGER.SAMPLE)) {
                if (stryMutAct_9fa48("157433")) {
                  {}
                } else {
                  stryCov_9fa48("157433");
                  this.deliverMetricSampleByTarget.set(targetNodeId, TRANSPORT_NUM.ZERO);
                }
              }
              this.logger.info(METRICS_LOG_TAG.TRANSPORT_DELIVER, stryMutAct_9fa48("157434") ? {} : (stryCov_9fa48("157434"), {
                targetNodeId,
                messageId,
                correlationId,
                requestId,
                operationId,
                durationMs,
                messageCount: this.messageCount,
                queueDepth,
                queueWaitMs,
                queueWaitSummary,
                acknowledged,
                trigger,
                error: acknowledged ? null : stryMutAct_9fa48("157437") ? result?.error && null : stryMutAct_9fa48("157436") ? false : stryMutAct_9fa48("157435") ? true : (stryCov_9fa48("157435", "157436", "157437"), (stryMutAct_9fa48("157438") ? result.error : (stryCov_9fa48("157438"), result?.error)) || null)
              }));
            }
          }
        }
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }
      return result;
    }
  }

  /**
   * Deliver a native Raft packet on an already-open socket so consensus
   * traffic does not contend with the general outbound queue.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @param {string} targetNodeId - Target node ID.
   * @return {Object|null} Direct delivery result when sent, else null.
   * @private
   */
  tryDeliverRaftDirect(targetAddress, messageId, payload, targetNodeId) {
    if (stryMutAct_9fa48("157439")) {
      {}
    } else {
      stryCov_9fa48("157439");
      if (stryMutAct_9fa48("157442") ? false : stryMutAct_9fa48("157441") ? true : stryMutAct_9fa48("157440") ? isRaftPacket(payload) : (stryCov_9fa48("157440", "157441", "157442"), !isRaftPacket(payload))) {
        if (stryMutAct_9fa48("157443")) {
          {}
        } else {
          stryCov_9fa48("157443");
          return null;
        }
      }
      const connection = this.nodeConnections.get(targetNodeId);
      if (stryMutAct_9fa48("157446") ? (!connection || connection.state !== ConnectionState.CONNECTED || !connection.ws) && connection.ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("157445") ? false : stryMutAct_9fa48("157444") ? true : (stryCov_9fa48("157444", "157445", "157446"), (stryMutAct_9fa48("157448") ? (!connection || connection.state !== ConnectionState.CONNECTED) && !connection.ws : stryMutAct_9fa48("157447") ? false : (stryCov_9fa48("157447", "157448"), (stryMutAct_9fa48("157450") ? !connection && connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("157449") ? false : (stryCov_9fa48("157449", "157450"), (stryMutAct_9fa48("157451") ? connection : (stryCov_9fa48("157451"), !connection)) || (stryMutAct_9fa48("157453") ? connection.state === ConnectionState.CONNECTED : stryMutAct_9fa48("157452") ? false : (stryCov_9fa48("157452", "157453"), connection.state !== ConnectionState.CONNECTED)))) || (stryMutAct_9fa48("157454") ? connection.ws : (stryCov_9fa48("157454"), !connection.ws)))) || (stryMutAct_9fa48("157456") ? connection.ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("157455") ? false : (stryCov_9fa48("157455", "157456"), connection.ws.readyState !== WebSocket.OPEN)))) {
        if (stryMutAct_9fa48("157457")) {
          {}
        } else {
          stryCov_9fa48("157457");
          return null;
        }
      }
      const message = stryMutAct_9fa48("157458") ? {} : (stryCov_9fa48("157458"), {
        type: RouterMessageType.SERVICE_MESSAGE,
        messageId,
        targetAddress,
        sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
        sourceNodeId: this.nodeId,
        payload,
        timestamp: Date.now()
      });
      this.logger.debug(ROUTER_LOG_MSG.RAFT_DIRECT_DELIVERY, stryMutAct_9fa48("157459") ? {} : (stryCov_9fa48("157459"), {
        messageId,
        targetAddress,
        targetNodeId
      }));
      try {
        if (stryMutAct_9fa48("157460")) {
          {}
        } else {
          stryCov_9fa48("157460");
          connection.ws.send(JSON.stringify(message));
          return stryMutAct_9fa48("157461") ? {} : (stryCov_9fa48("157461"), {
            messageId,
            acknowledged: stryMutAct_9fa48("157462") ? false : (stryCov_9fa48("157462"), true),
            direct: stryMutAct_9fa48("157463") ? false : (stryCov_9fa48("157463"), true)
          });
        }
      } catch (_sendError) {
        if (stryMutAct_9fa48("157464")) {
          {}
        } else {
          stryCov_9fa48("157464");
          return null;
        }
      }
    }
  }

  /**
   * Deliver message to node via WebSocket.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @param {string} targetNodeId - Target node ID.
   * @return {Promise<Object>} Delivery result.
   * @private
   */
  async deliverRemote(targetAddress, messageId, payload, targetNodeId, correlationId, options = {}) {
    if (stryMutAct_9fa48("157465")) {
      {}
    } else {
      stryCov_9fa48("157465");
      const directRaftDelivery = this.tryDeliverRaftDirect(targetAddress, messageId, payload, targetNodeId);
      if (stryMutAct_9fa48("157467") ? false : stryMutAct_9fa48("157466") ? true : (stryCov_9fa48("157466", "157467"), directRaftDelivery)) {
        if (stryMutAct_9fa48("157468")) {
          {}
        } else {
          stryCov_9fa48("157468");
          return directRaftDelivery;
        }
      }
      const deliveryTimeoutMs = (stryMutAct_9fa48("157471") ? Number.isFinite(options.timeoutMs) || options.timeoutMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157470") ? false : stryMutAct_9fa48("157469") ? true : (stryCov_9fa48("157469", "157470", "157471"), Number.isFinite(options.timeoutMs) && (stryMutAct_9fa48("157474") ? options.timeoutMs <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157473") ? options.timeoutMs >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157472") ? true : (stryCov_9fa48("157472", "157473", "157474"), options.timeoutMs > TRANSPORT_NUM.ZERO)))) ? Math.floor(options.timeoutMs) : this.messageTimeoutMs;
      // Register pending response before send to avoid races where the
      // SERVICE_RESPONSE arrives immediately after ACK.
      const responsePromise = this.registerPendingResponse(messageId, targetNodeId, stryMutAct_9fa48("157475") ? {} : (stryCov_9fa48("157475"), {
        deliverySource: resolveDeliverySource(targetAddress, payload, options)
      }));
      let earlyResponseError = null;
      responsePromise.catch(error => {
        if (stryMutAct_9fa48("157476")) {
          {}
        } else {
          stryCov_9fa48("157476");
          earlyResponseError = error;
        }
      });
      let ackResult;
      let queueWaitMs = TRANSPORT_NUM.ZERO;
      try {
        if (stryMutAct_9fa48("157477")) {
          {}
        } else {
          stryCov_9fa48("157477");
          const ackOutcome = await this.enqueueOutbound(targetNodeId, () => {
            if (stryMutAct_9fa48("157478")) {
              {}
            } else {
              stryCov_9fa48("157478");
              const connection = this.nodeConnections.get(targetNodeId);
              const reconnectInProgress = this.buildReconnectInProgressFailure(targetNodeId, messageId, correlationId);
              if (stryMutAct_9fa48("157480") ? false : stryMutAct_9fa48("157479") ? true : (stryCov_9fa48("157479", "157480"), reconnectInProgress)) {
                if (stryMutAct_9fa48("157481")) {
                  {}
                } else {
                  stryCov_9fa48("157481");
                  return reconnectInProgress;
                }
              }
              if (stryMutAct_9fa48("157484") ? !connection || connection.state !== ConnectionState.CONNECTED || !this.isShuttingDown : stryMutAct_9fa48("157483") ? false : stryMutAct_9fa48("157482") ? true : (stryCov_9fa48("157482", "157483", "157484"), (stryMutAct_9fa48("157486") ? !connection && connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("157485") ? true : (stryCov_9fa48("157485", "157486"), (stryMutAct_9fa48("157487") ? connection : (stryCov_9fa48("157487"), !connection)) || (stryMutAct_9fa48("157489") ? connection.state === ConnectionState.CONNECTED : stryMutAct_9fa48("157488") ? false : (stryCov_9fa48("157488", "157489"), connection.state !== ConnectionState.CONNECTED)))) && (stryMutAct_9fa48("157490") ? this.isShuttingDown : (stryCov_9fa48("157490"), !this.isShuttingDown)))) {
                if (stryMutAct_9fa48("157491")) {
                  {}
                } else {
                  stryCov_9fa48("157491");
                  const reconnectAddress = stryMutAct_9fa48("157494") ? this.resolveReconnectAddresses(targetNodeId)[TRANSPORT_NUM.ZERO] && null : stryMutAct_9fa48("157493") ? false : stryMutAct_9fa48("157492") ? true : (stryCov_9fa48("157492", "157493", "157494"), this.resolveReconnectAddresses(targetNodeId)[TRANSPORT_NUM.ZERO] || null);
                  if (stryMutAct_9fa48("157496") ? false : stryMutAct_9fa48("157495") ? true : (stryCov_9fa48("157495", "157496"), reconnectAddress)) {
                    if (stryMutAct_9fa48("157497")) {
                      {}
                    } else {
                      stryCov_9fa48("157497");
                      return this.tryDeliverAfterReconnect(reconnectAddress, targetAddress, messageId, payload, targetNodeId, correlationId, deliveryTimeoutMs);
                    }
                  }
                }
              }
              if (stryMutAct_9fa48("157500") ? !connection && connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("157499") ? false : stryMutAct_9fa48("157498") ? true : (stryCov_9fa48("157498", "157499", "157500"), (stryMutAct_9fa48("157501") ? connection : (stryCov_9fa48("157501"), !connection)) || (stryMutAct_9fa48("157503") ? connection.state === ConnectionState.CONNECTED : stryMutAct_9fa48("157502") ? false : (stryCov_9fa48("157502", "157503"), connection.state !== ConnectionState.CONNECTED)))) {
                if (stryMutAct_9fa48("157504")) {
                  {}
                } else {
                  stryCov_9fa48("157504");
                  this.logger.warn(ROUTER_LOG_MSG.NO_TARGET_CONNECTION, stryMutAct_9fa48("157505") ? {} : (stryCov_9fa48("157505"), {
                    messageId,
                    targetAddress,
                    targetNodeId,
                    localNodeId: this.nodeId,
                    connectionExists: stryMutAct_9fa48("157506") ? !connection : (stryCov_9fa48("157506"), !(stryMutAct_9fa48("157507") ? connection : (stryCov_9fa48("157507"), !connection))),
                    connectionState: stryMutAct_9fa48("157508") ? connection.state : (stryCov_9fa48("157508"), connection?.state),
                    availableConnections: Array.from(this.nodeConnections.keys())
                  }));
                  return this.buildDeferredDeliveryFailure(messageId, correlationId, ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId), stryMutAct_9fa48("157509") ? {} : (stryCov_9fa48("157509"), {
                    errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
                    retryAfterMs: this.reconnectIntervalMs
                  }));
                }
              }
              return this.sendMessage(connection, targetAddress, messageId, payload, targetNodeId, correlationId, deliveryTimeoutMs);
            }
          }, stryMutAct_9fa48("157510") ? {} : (stryCov_9fa48("157510"), {
            deliveryPriority: options.deliveryPriority,
            deliverySource: options.deliverySource,
            targetAddress,
            message: payload
          }));
          const normalizedAckOutcome = normalizeDeliveryOutcome(ackOutcome);
          ackResult = normalizedAckOutcome.result;
          queueWaitMs = normalizedAckOutcome.queueWaitMs;
        }
      } catch (error) {
        if (stryMutAct_9fa48("157511")) {
          {}
        } else {
          stryCov_9fa48("157511");
          const deferredFailure = await this.resolveRecoverableDeliveryError(stryMutAct_9fa48("157512") ? {} : (stryCov_9fa48("157512"), {
            error,
            targetNodeId,
            targetAddress,
            messageId,
            payload,
            correlationId
          }));
          if (stryMutAct_9fa48("157514") ? false : stryMutAct_9fa48("157513") ? true : (stryCov_9fa48("157513", "157514"), deferredFailure)) {
            if (stryMutAct_9fa48("157515")) {
              {}
            } else {
              stryCov_9fa48("157515");
              this.cancelPendingResponse(messageId, stryMutAct_9fa48("157516") ? {} : (stryCov_9fa48("157516"), {
                ignoreLateResponse: stryMutAct_9fa48("157517") ? false : (stryCov_9fa48("157517"), true),
                retiredReason: RETIRED_PENDING_RESPONSE_REASON.DEFERRED_DELIVERY
              }));
              return stryMutAct_9fa48("157518") ? {} : (stryCov_9fa48("157518"), {
                result: deferredFailure,
                queueWaitMs: TRANSPORT_NUM.ZERO
              });
            }
          }
          this.cancelPendingResponse(messageId, stryMutAct_9fa48("157519") ? {} : (stryCov_9fa48("157519"), {
            ignoreLateResponse: stryMutAct_9fa48("157520") ? false : (stryCov_9fa48("157520"), true),
            retiredReason: RETIRED_PENDING_RESPONSE_REASON.CANCELLED
          }));
          if (stryMutAct_9fa48("157523") ? error?.code !== OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE : stryMutAct_9fa48("157522") ? false : stryMutAct_9fa48("157521") ? true : (stryCov_9fa48("157521", "157522", "157523"), (stryMutAct_9fa48("157524") ? error.code : (stryCov_9fa48("157524"), error?.code)) === OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE)) {
            if (stryMutAct_9fa48("157525")) {
              {}
            } else {
              stryCov_9fa48("157525");
              return stryMutAct_9fa48("157526") ? {} : (stryCov_9fa48("157526"), {
                result: this.buildDeferredDeliveryFailure(messageId, correlationId, error.message, stryMutAct_9fa48("157527") ? {} : (stryCov_9fa48("157527"), {
                  errorCode: error.code,
                  retryAfterMs: this.reconnectIntervalMs
                })),
                queueWaitMs: TRANSPORT_NUM.ZERO
              });
            }
          }
          throw error;
        }
      }
      if (stryMutAct_9fa48("157530") ? false : stryMutAct_9fa48("157529") ? true : stryMutAct_9fa48("157528") ? ackResult?.acknowledged : (stryCov_9fa48("157528", "157529", "157530"), !(stryMutAct_9fa48("157531") ? ackResult.acknowledged : (stryCov_9fa48("157531"), ackResult?.acknowledged)))) {
        if (stryMutAct_9fa48("157532")) {
          {}
        } else {
          stryCov_9fa48("157532");
          this.cancelPendingResponse(messageId, stryMutAct_9fa48("157533") ? {} : (stryCov_9fa48("157533"), {
            ignoreLateResponse: stryMutAct_9fa48("157534") ? false : (stryCov_9fa48("157534"), true),
            retiredReason: RETIRED_PENDING_RESPONSE_REASON.ACK_REJECTED
          }));
          return stryMutAct_9fa48("157535") ? {} : (stryCov_9fa48("157535"), {
            result: ackResult,
            queueWaitMs
          });
        }
      }

      // Compatibility: tolerate legacy ACKs that still include handler payload.
      if (stryMutAct_9fa48("157537") ? false : stryMutAct_9fa48("157536") ? true : (stryCov_9fa48("157536", "157537"), this.hasInlineAckPayload(ackResult))) {
        if (stryMutAct_9fa48("157538")) {
          {}
        } else {
          stryCov_9fa48("157538");
          this.cancelPendingResponse(messageId, stryMutAct_9fa48("157539") ? {} : (stryCov_9fa48("157539"), {
            ignoreLateResponse: stryMutAct_9fa48("157540") ? false : (stryCov_9fa48("157540"), true),
            retiredReason: RETIRED_PENDING_RESPONSE_REASON.INLINE_ACK
          }));
          return stryMutAct_9fa48("157541") ? {} : (stryCov_9fa48("157541"), {
            result: ackResult,
            queueWaitMs
          });
        }
      }

      // Start response timeout only after ACK succeeded.
      this.armPendingResponseTimeout(messageId, deliveryTimeoutMs);
      try {
        if (stryMutAct_9fa48("157542")) {
          {}
        } else {
          stryCov_9fa48("157542");
          if (stryMutAct_9fa48("157544") ? false : stryMutAct_9fa48("157543") ? true : (stryCov_9fa48("157543", "157544"), earlyResponseError)) {
            if (stryMutAct_9fa48("157545")) {
              {}
            } else {
              stryCov_9fa48("157545");
              throw earlyResponseError;
            }
          }
          const serviceResult = await responsePromise;
          return stryMutAct_9fa48("157546") ? {} : (stryCov_9fa48("157546"), {
            result: stryMutAct_9fa48("157547") ? {} : (stryCov_9fa48("157547"), {
              messageId,
              correlationId,
              acknowledged: stryMutAct_9fa48("157548") ? false : (stryCov_9fa48("157548"), true),
              ...this.normalizeServiceResponseResult(serviceResult)
            }),
            queueWaitMs
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("157549")) {
          {}
        } else {
          stryCov_9fa48("157549");
          return stryMutAct_9fa48("157550") ? {} : (stryCov_9fa48("157550"), {
            result: stryMutAct_9fa48("157551") ? {} : (stryCov_9fa48("157551"), {
              messageId,
              correlationId,
              acknowledged: stryMutAct_9fa48("157552") ? false : (stryCov_9fa48("157552"), true),
              error: error.message
            }),
            queueWaitMs
          });
        }
      }
    }
  }

  /**
   * Resolve a WebSocket address for one target node when delivery needs an
   * on-demand connection recovery.
   * @param {string} targetNodeId
   * @return {string|null}
   * @private
   */
  resolveNodeAddressForDelivery(targetNodeId) {
    if (stryMutAct_9fa48("157553")) {
      {}
    } else {
      stryCov_9fa48("157553");
      if (stryMutAct_9fa48("157556") ? typeof this.resolveNodeAddress === TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("157555") ? false : stryMutAct_9fa48("157554") ? true : (stryCov_9fa48("157554", "157555", "157556"), typeof this.resolveNodeAddress !== TRANSPORT_TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("157557")) {
          {}
        } else {
          stryCov_9fa48("157557");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("157558")) {
          {}
        } else {
          stryCov_9fa48("157558");
          const resolved = this.resolveNodeAddress(targetNodeId);
          return (stryMutAct_9fa48("157561") ? typeof resolved === TRANSPORT_TYPEOF.STRING || resolved.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157560") ? false : stryMutAct_9fa48("157559") ? true : (stryCov_9fa48("157559", "157560", "157561"), (stryMutAct_9fa48("157563") ? typeof resolved !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157562") ? true : (stryCov_9fa48("157562", "157563"), typeof resolved === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("157566") ? resolved.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157565") ? resolved.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157564") ? true : (stryCov_9fa48("157564", "157565", "157566"), resolved.length > TRANSPORT_NUM.ZERO)))) ? resolved : null;
        }
      } catch (error) {
        if (stryMutAct_9fa48("157567")) {
          {}
        } else {
          stryCov_9fa48("157567");
          this.logger.warn(MESSAGE_ROUTER_LITERAL.STRING_FAILED_TO_RESOLVE_NODE_CONNECTION_ADDRESS_FOR_DELIVERY_RECOVERY, stryMutAct_9fa48("157568") ? {} : (stryCov_9fa48("157568"), {
            targetNodeId,
            localNodeId: this.nodeId,
            error: stryMutAct_9fa48("157571") ? error?.message && String(error) : stryMutAct_9fa48("157570") ? false : stryMutAct_9fa48("157569") ? true : (stryCov_9fa48("157569", "157570", "157571"), (stryMutAct_9fa48("157572") ? error.message : (stryCov_9fa48("157572"), error?.message)) || String(error))
          }));
          return null;
        }
      }
    }
  }

  /**
   * Resolve the current canonical reconnect address for one peer.
   * Authoritative endpoint/cache data wins over historical connection memory.
   * @param {string} targetNodeId
   * @param {string|null} fallbackAddress
   * @return {string|null}
   * @private
   */
  resolveCanonicalReconnectAddress(targetNodeId, fallbackAddress = null) {
    if (stryMutAct_9fa48("157573")) {
      {}
    } else {
      stryCov_9fa48("157573");
      const resolvedAddress = this.resolveNodeAddressForDelivery(targetNodeId);
      if (stryMutAct_9fa48("157576") ? typeof resolvedAddress === TRANSPORT_TYPEOF.STRING || resolvedAddress.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157575") ? false : stryMutAct_9fa48("157574") ? true : (stryCov_9fa48("157574", "157575", "157576"), (stryMutAct_9fa48("157578") ? typeof resolvedAddress !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157577") ? true : (stryCov_9fa48("157577", "157578"), typeof resolvedAddress === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("157581") ? resolvedAddress.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157580") ? resolvedAddress.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157579") ? true : (stryCov_9fa48("157579", "157580", "157581"), resolvedAddress.length > TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("157582")) {
          {}
        } else {
          stryCov_9fa48("157582");
          return stryMutAct_9fa48("157585") ? normalizeToWebSocketAddress(resolvedAddress) && resolvedAddress : stryMutAct_9fa48("157584") ? false : stryMutAct_9fa48("157583") ? true : (stryCov_9fa48("157583", "157584", "157585"), normalizeToWebSocketAddress(resolvedAddress) || resolvedAddress);
        }
      }
      const normalizedFallback = stryMutAct_9fa48("157588") ? normalizeToWebSocketAddress(fallbackAddress) && fallbackAddress : stryMutAct_9fa48("157587") ? false : stryMutAct_9fa48("157586") ? true : (stryCov_9fa48("157586", "157587", "157588"), normalizeToWebSocketAddress(fallbackAddress) || fallbackAddress);
      return (stryMutAct_9fa48("157591") ? typeof normalizedFallback === TRANSPORT_TYPEOF.STRING || normalizedFallback.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157590") ? false : stryMutAct_9fa48("157589") ? true : (stryCov_9fa48("157589", "157590", "157591"), (stryMutAct_9fa48("157593") ? typeof normalizedFallback !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157592") ? true : (stryCov_9fa48("157592", "157593"), typeof normalizedFallback === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("157596") ? normalizedFallback.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157595") ? normalizedFallback.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157594") ? true : (stryCov_9fa48("157594", "157595", "157596"), normalizedFallback.length > TRANSPORT_NUM.ZERO)))) ? normalizedFallback : null;
    }
  }

  /**
   * Refresh reconnect ownership to the latest canonical address for a peer.
   * This prevents scheduled reconnects from carrying stale hostnames forward
   * after authoritative endpoint data has changed.
   * @param {Object|null} connectionInfo
   * @param {string|null} fallbackAddress
   * @return {string|null}
   * @private
   */
  refreshReconnectAuthority(connectionInfo, fallbackAddress = null) {
    if (stryMutAct_9fa48("157597")) {
      {}
    } else {
      stryCov_9fa48("157597");
      if (stryMutAct_9fa48("157600") ? !connectionInfo && typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("157599") ? false : stryMutAct_9fa48("157598") ? true : (stryCov_9fa48("157598", "157599", "157600"), (stryMutAct_9fa48("157601") ? connectionInfo : (stryCov_9fa48("157601"), !connectionInfo)) || (stryMutAct_9fa48("157603") ? typeof connectionInfo === TRANSPORT_TYPEOF.OBJECT : stryMutAct_9fa48("157602") ? false : (stryCov_9fa48("157602", "157603"), typeof connectionInfo !== TRANSPORT_TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("157604")) {
          {}
        } else {
          stryCov_9fa48("157604");
          return null;
        }
      }
      const previousConfigured = stryMutAct_9fa48("157607") ? (normalizeToWebSocketAddress(connectionInfo.configuredAddress) || connectionInfo.configuredAddress) && null : stryMutAct_9fa48("157606") ? false : stryMutAct_9fa48("157605") ? true : (stryCov_9fa48("157605", "157606", "157607"), (stryMutAct_9fa48("157609") ? normalizeToWebSocketAddress(connectionInfo.configuredAddress) && connectionInfo.configuredAddress : stryMutAct_9fa48("157608") ? false : (stryCov_9fa48("157608", "157609"), normalizeToWebSocketAddress(connectionInfo.configuredAddress) || connectionInfo.configuredAddress)) || null);
      const canonicalAddress = this.resolveCanonicalReconnectAddress(connectionInfo.nodeId, fallbackAddress);
      if (stryMutAct_9fa48("157612") ? false : stryMutAct_9fa48("157611") ? true : stryMutAct_9fa48("157610") ? canonicalAddress : (stryCov_9fa48("157610", "157611", "157612"), !canonicalAddress)) {
        if (stryMutAct_9fa48("157613")) {
          {}
        } else {
          stryCov_9fa48("157613");
          return null;
        }
      }
      connectionInfo.configuredAddress = canonicalAddress;
      const currentAddress = stryMutAct_9fa48("157616") ? (normalizeToWebSocketAddress(connectionInfo.address) || connectionInfo.address) && null : stryMutAct_9fa48("157615") ? false : stryMutAct_9fa48("157614") ? true : (stryCov_9fa48("157614", "157615", "157616"), (stryMutAct_9fa48("157618") ? normalizeToWebSocketAddress(connectionInfo.address) && connectionInfo.address : stryMutAct_9fa48("157617") ? false : (stryCov_9fa48("157617", "157618"), normalizeToWebSocketAddress(connectionInfo.address) || connectionInfo.address)) || null);
      const hasObservedAddress = stryMutAct_9fa48("157621") ? typeof connectionInfo.observedAddress === TRANSPORT_TYPEOF.STRING || connectionInfo.observedAddress.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157620") ? false : stryMutAct_9fa48("157619") ? true : (stryCov_9fa48("157619", "157620", "157621"), (stryMutAct_9fa48("157623") ? typeof connectionInfo.observedAddress !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157622") ? true : (stryCov_9fa48("157622", "157623"), typeof connectionInfo.observedAddress === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("157626") ? connectionInfo.observedAddress.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157625") ? connectionInfo.observedAddress.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157624") ? true : (stryCov_9fa48("157624", "157625", "157626"), connectionInfo.observedAddress.length > TRANSPORT_NUM.ZERO)));
      if (stryMutAct_9fa48("157629") ? (!hasObservedAddress || !currentAddress || connectionInfo.state !== ConnectionState.CONNECTED) && currentAddress === previousConfigured : stryMutAct_9fa48("157628") ? false : stryMutAct_9fa48("157627") ? true : (stryCov_9fa48("157627", "157628", "157629"), (stryMutAct_9fa48("157631") ? (!hasObservedAddress || !currentAddress) && connectionInfo.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("157630") ? false : (stryCov_9fa48("157630", "157631"), (stryMutAct_9fa48("157633") ? !hasObservedAddress && !currentAddress : stryMutAct_9fa48("157632") ? false : (stryCov_9fa48("157632", "157633"), (stryMutAct_9fa48("157634") ? hasObservedAddress : (stryCov_9fa48("157634"), !hasObservedAddress)) || (stryMutAct_9fa48("157635") ? currentAddress : (stryCov_9fa48("157635"), !currentAddress)))) || (stryMutAct_9fa48("157637") ? connectionInfo.state === ConnectionState.CONNECTED : stryMutAct_9fa48("157636") ? false : (stryCov_9fa48("157636", "157637"), connectionInfo.state !== ConnectionState.CONNECTED)))) || (stryMutAct_9fa48("157639") ? currentAddress !== previousConfigured : stryMutAct_9fa48("157638") ? false : (stryCov_9fa48("157638", "157639"), currentAddress === previousConfigured)))) {
        if (stryMutAct_9fa48("157640")) {
          {}
        } else {
          stryCov_9fa48("157640");
          connectionInfo.address = canonicalAddress;
        }
      }
      return canonicalAddress;
    }
  }

  /**
   * Return true when one peer already owns a reconnect timer.
   * @param {Object|null} connectionInfo
   * @return {boolean}
   * @private
   */
  hasScheduledReconnect(connectionInfo) {
    if (stryMutAct_9fa48("157641")) {
      {}
    } else {
      stryCov_9fa48("157641");
      return Boolean(stryMutAct_9fa48("157644") ? connectionInfo && connectionInfo.state === ConnectionState.RECONNECTING || connectionInfo.reconnectTimeout : stryMutAct_9fa48("157643") ? false : stryMutAct_9fa48("157642") ? true : (stryCov_9fa48("157642", "157643", "157644"), (stryMutAct_9fa48("157646") ? connectionInfo || connectionInfo.state === ConnectionState.RECONNECTING : stryMutAct_9fa48("157645") ? true : (stryCov_9fa48("157645", "157646"), connectionInfo && (stryMutAct_9fa48("157648") ? connectionInfo.state !== ConnectionState.RECONNECTING : stryMutAct_9fa48("157647") ? true : (stryCov_9fa48("157647", "157648"), connectionInfo.state === ConnectionState.RECONNECTING)))) && connectionInfo.reconnectTimeout));
    }
  }

  /**
   * Compute one bounded retry-after hint for an armed reconnect.
   * @param {Object|null} connectionInfo
   * @return {number}
   * @private
   */
  resolveReconnectRetryAfterMs(connectionInfo) {
    if (stryMutAct_9fa48("157649")) {
      {}
    } else {
      stryCov_9fa48("157649");
      const dueAt = stryMutAct_9fa48("157650") ? connectionInfo.reconnectDueAt : (stryCov_9fa48("157650"), connectionInfo?.reconnectDueAt);
      if (stryMutAct_9fa48("157653") ? false : stryMutAct_9fa48("157652") ? true : stryMutAct_9fa48("157651") ? Number.isFinite(dueAt) : (stryCov_9fa48("157651", "157652", "157653"), !Number.isFinite(dueAt))) {
        if (stryMutAct_9fa48("157654")) {
          {}
        } else {
          stryCov_9fa48("157654");
          return this.reconnectIntervalMs;
        }
      }
      return stryMutAct_9fa48("157655") ? Math.min(TRANSPORT_NUM.ZERO, Math.ceil(dueAt - Date.now())) : (stryCov_9fa48("157655"), Math.max(TRANSPORT_NUM.ZERO, Math.ceil(stryMutAct_9fa48("157656") ? dueAt + Date.now() : (stryCov_9fa48("157656"), dueAt - Date.now()))));
    }
  }

  /**
   * Build one closed-connection error with recovery metadata.
   * @param {string} targetNodeId
   * @param {Object} [options]
   * @param {boolean} [options.beforeSend=false]
   * @param {number} [options.retryAfterMs]
   * @return {Error}
   * @private
   */
  buildConnectionClosedError(targetNodeId, options = {}) {
    if (stryMutAct_9fa48("157657")) {
      {}
    } else {
      stryCov_9fa48("157657");
      const error = new Error(ROUTER_ERROR_MSG.connectionClosed(targetNodeId));
      error.code = ROUTER_CONNECTION_CLOSED_ERROR_CODE;
      error.deferRetry = stryMutAct_9fa48("157658") ? false : (stryCov_9fa48("157658"), true);
      error.retryAfterMs = normalizeRetryAfterMs(options.retryAfterMs, this.reconnectIntervalMs);
      error.recoverableBeforeSend = stryMutAct_9fa48("157661") ? options.beforeSend !== true : stryMutAct_9fa48("157660") ? false : stryMutAct_9fa48("157659") ? true : (stryCov_9fa48("157659", "157660", "157661"), options.beforeSend === (stryMutAct_9fa48("157662") ? false : (stryCov_9fa48("157662"), true)));
      return error;
    }
  }

  /**
   * Return one deferred outcome when a reconnect timer already owns recovery.
   * @param {string} targetNodeId
   * @param {string} messageId
   * @param {string} correlationId
   * @return {Object|null}
   * @private
   */
  buildReconnectInProgressFailure(targetNodeId, messageId, correlationId) {
    if (stryMutAct_9fa48("157663")) {
      {}
    } else {
      stryCov_9fa48("157663");
      const connection = stryMutAct_9fa48("157666") ? this.nodeConnections.get(targetNodeId) && null : stryMutAct_9fa48("157665") ? false : stryMutAct_9fa48("157664") ? true : (stryCov_9fa48("157664", "157665", "157666"), this.nodeConnections.get(targetNodeId) || null);
      if (stryMutAct_9fa48("157669") ? false : stryMutAct_9fa48("157668") ? true : stryMutAct_9fa48("157667") ? this.hasScheduledReconnect(connection) : (stryCov_9fa48("157667", "157668", "157669"), !this.hasScheduledReconnect(connection))) {
        if (stryMutAct_9fa48("157670")) {
          {}
        } else {
          stryCov_9fa48("157670");
          return null;
        }
      }
      return this.buildDeferredDeliveryFailure(messageId, correlationId, ROUTER_ERROR_MSG.connectionClosed(targetNodeId), stryMutAct_9fa48("157671") ? {} : (stryCov_9fa48("157671"), {
        errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE,
        retryAfterMs: this.resolveReconnectRetryAfterMs(connection)
      }));
    }
  }

  /**
   * Convert one recoverable transport send failure into a deferred delivery.
   * @param {Object} options
   * @param {Error} options.error
   * @param {string} options.targetNodeId
   * @param {string} options.targetAddress
   * @param {string} options.messageId
   * @param {Object} options.payload
   * @param {string} options.correlationId
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveRecoverableDeliveryError({
    error,
    targetNodeId,
    targetAddress,
    messageId,
    payload,
    correlationId
  }) {
    if (stryMutAct_9fa48("157672")) {
      {}
    } else {
      stryCov_9fa48("157672");
      if (stryMutAct_9fa48("157675") ? !error && this.isShuttingDown : stryMutAct_9fa48("157674") ? false : stryMutAct_9fa48("157673") ? true : (stryCov_9fa48("157673", "157674", "157675"), (stryMutAct_9fa48("157676") ? error : (stryCov_9fa48("157676"), !error)) || this.isShuttingDown)) {
        if (stryMutAct_9fa48("157677")) {
          {}
        } else {
          stryCov_9fa48("157677");
          return null;
        }
      }
      const retryAfterMs = Number.isFinite(stryMutAct_9fa48("157678") ? error.retryAfterMs : (stryCov_9fa48("157678"), error?.retryAfterMs)) ? stryMutAct_9fa48("157679") ? Math.min(TRANSPORT_NUM.ZERO, Math.floor(error.retryAfterMs)) : (stryCov_9fa48("157679"), Math.max(TRANSPORT_NUM.ZERO, Math.floor(error.retryAfterMs))) : this.resolveReconnectRetryAfterMs(stryMutAct_9fa48("157682") ? this.nodeConnections.get(targetNodeId) && null : stryMutAct_9fa48("157681") ? false : stryMutAct_9fa48("157680") ? true : (stryCov_9fa48("157680", "157681", "157682"), this.nodeConnections.get(targetNodeId) || null));
      if (stryMutAct_9fa48("157685") ? error.code === ROUTER_CONNECTION_CLOSED_ERROR_CODE || error.recoverableBeforeSend === true : stryMutAct_9fa48("157684") ? false : stryMutAct_9fa48("157683") ? true : (stryCov_9fa48("157683", "157684", "157685"), (stryMutAct_9fa48("157687") ? error.code !== ROUTER_CONNECTION_CLOSED_ERROR_CODE : stryMutAct_9fa48("157686") ? true : (stryCov_9fa48("157686", "157687"), error.code === ROUTER_CONNECTION_CLOSED_ERROR_CODE)) && (stryMutAct_9fa48("157689") ? error.recoverableBeforeSend !== true : stryMutAct_9fa48("157688") ? true : (stryCov_9fa48("157688", "157689"), error.recoverableBeforeSend === (stryMutAct_9fa48("157690") ? false : (stryCov_9fa48("157690"), true)))))) {
        if (stryMutAct_9fa48("157691")) {
          {}
        } else {
          stryCov_9fa48("157691");
          const reconnectInProgress = this.buildReconnectInProgressFailure(targetNodeId, messageId, correlationId);
          if (stryMutAct_9fa48("157693") ? false : stryMutAct_9fa48("157692") ? true : (stryCov_9fa48("157692", "157693"), reconnectInProgress)) {
            if (stryMutAct_9fa48("157694")) {
              {}
            } else {
              stryCov_9fa48("157694");
              return reconnectInProgress;
            }
          }
          const reconnectAddress = stryMutAct_9fa48("157697") ? this.resolveReconnectAddresses(targetNodeId)[TRANSPORT_NUM.ZERO] && null : stryMutAct_9fa48("157696") ? false : stryMutAct_9fa48("157695") ? true : (stryCov_9fa48("157695", "157696", "157697"), this.resolveReconnectAddresses(targetNodeId)[TRANSPORT_NUM.ZERO] || null);
          if (stryMutAct_9fa48("157699") ? false : stryMutAct_9fa48("157698") ? true : (stryCov_9fa48("157698", "157699"), reconnectAddress)) {
            if (stryMutAct_9fa48("157700")) {
              {}
            } else {
              stryCov_9fa48("157700");
              try {
                if (stryMutAct_9fa48("157701")) {
                  {}
                } else {
                  stryCov_9fa48("157701");
                  return await this.tryDeliverAfterReconnect(reconnectAddress, targetAddress, messageId, payload, targetNodeId, correlationId);
                }
              } catch (reconnectError) {
                if (stryMutAct_9fa48("157702")) {
                  {}
                } else {
                  stryCov_9fa48("157702");
                  return this.buildDeferredDeliveryFailure(messageId, correlationId, stryMutAct_9fa48("157705") ? reconnectError?.message && ROUTER_ERROR_MSG.connectionClosed(targetNodeId) : stryMutAct_9fa48("157704") ? false : stryMutAct_9fa48("157703") ? true : (stryCov_9fa48("157703", "157704", "157705"), (stryMutAct_9fa48("157706") ? reconnectError.message : (stryCov_9fa48("157706"), reconnectError?.message)) || ROUTER_ERROR_MSG.connectionClosed(targetNodeId)), stryMutAct_9fa48("157707") ? {} : (stryCov_9fa48("157707"), {
                    errorCode: stryMutAct_9fa48("157710") ? reconnectError?.code && ROUTER_CONNECTION_CLOSED_ERROR_CODE : stryMutAct_9fa48("157709") ? false : stryMutAct_9fa48("157708") ? true : (stryCov_9fa48("157708", "157709", "157710"), (stryMutAct_9fa48("157711") ? reconnectError.code : (stryCov_9fa48("157711"), reconnectError?.code)) || ROUTER_CONNECTION_CLOSED_ERROR_CODE),
                    retryAfterMs: Number.isFinite(stryMutAct_9fa48("157712") ? reconnectError.retryAfterMs : (stryCov_9fa48("157712"), reconnectError?.retryAfterMs)) ? reconnectError.retryAfterMs : retryAfterMs
                  }));
                }
              }
            }
          }
        }
      }
      if (stryMutAct_9fa48("157715") ? error.code === ROUTER_CONNECTION_CLOSED_ERROR_CODE && error.message === ROUTER_ERROR_MSG.connectionClosed(targetNodeId) : stryMutAct_9fa48("157714") ? false : stryMutAct_9fa48("157713") ? true : (stryCov_9fa48("157713", "157714", "157715"), (stryMutAct_9fa48("157717") ? error.code !== ROUTER_CONNECTION_CLOSED_ERROR_CODE : stryMutAct_9fa48("157716") ? false : (stryCov_9fa48("157716", "157717"), error.code === ROUTER_CONNECTION_CLOSED_ERROR_CODE)) || (stryMutAct_9fa48("157719") ? error.message !== ROUTER_ERROR_MSG.connectionClosed(targetNodeId) : stryMutAct_9fa48("157718") ? false : (stryCov_9fa48("157718", "157719"), error.message === ROUTER_ERROR_MSG.connectionClosed(targetNodeId))))) {
        if (stryMutAct_9fa48("157720")) {
          {}
        } else {
          stryCov_9fa48("157720");
          return this.buildDeferredDeliveryFailure(messageId, correlationId, error.message, stryMutAct_9fa48("157721") ? {} : (stryCov_9fa48("157721"), {
            errorCode: stryMutAct_9fa48("157724") ? error.code && ROUTER_CONNECTION_CLOSED_ERROR_CODE : stryMutAct_9fa48("157723") ? false : stryMutAct_9fa48("157722") ? true : (stryCov_9fa48("157722", "157723", "157724"), error.code || ROUTER_CONNECTION_CLOSED_ERROR_CODE),
            retryAfterMs
          }));
        }
      }
      return null;
    }
  }

  /**
   * Build one suppression key for a reconnect address.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {string|null}
   * @private
   */
  getReconnectAddressSuppressionKey(targetNodeId, address) {
    if (stryMutAct_9fa48("157725")) {
      {}
    } else {
      stryCov_9fa48("157725");
      if (stryMutAct_9fa48("157728") ? (typeof targetNodeId !== TRANSPORT_TYPEOF.STRING || targetNodeId.length === TRANSPORT_NUM.ZERO || typeof address !== TRANSPORT_TYPEOF.STRING) && address.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157727") ? false : stryMutAct_9fa48("157726") ? true : (stryCov_9fa48("157726", "157727", "157728"), (stryMutAct_9fa48("157730") ? (typeof targetNodeId !== TRANSPORT_TYPEOF.STRING || targetNodeId.length === TRANSPORT_NUM.ZERO) && typeof address !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157729") ? false : (stryCov_9fa48("157729", "157730"), (stryMutAct_9fa48("157732") ? typeof targetNodeId !== TRANSPORT_TYPEOF.STRING && targetNodeId.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157731") ? false : (stryCov_9fa48("157731", "157732"), (stryMutAct_9fa48("157734") ? typeof targetNodeId === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157733") ? false : (stryCov_9fa48("157733", "157734"), typeof targetNodeId !== TRANSPORT_TYPEOF.STRING)) || (stryMutAct_9fa48("157736") ? targetNodeId.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157735") ? false : (stryCov_9fa48("157735", "157736"), targetNodeId.length === TRANSPORT_NUM.ZERO)))) || (stryMutAct_9fa48("157738") ? typeof address === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157737") ? false : (stryCov_9fa48("157737", "157738"), typeof address !== TRANSPORT_TYPEOF.STRING)))) || (stryMutAct_9fa48("157740") ? address.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157739") ? false : (stryCov_9fa48("157739", "157740"), address.length === TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("157741")) {
          {}
        } else {
          stryCov_9fa48("157741");
          return null;
        }
      }
      return stryMutAct_9fa48("157742") ? `` : (stryCov_9fa48("157742"), `${targetNodeId}::${address}`);
    }
  }

  /**
   * Remove expired reconnect-address suppressions.
   * @param {number} [nowMs]
   * @return {void}
   * @private
   */
  pruneReconnectAddressSuppressions(nowMs = Date.now()) {
    if (stryMutAct_9fa48("157743")) {
      {}
    } else {
      stryCov_9fa48("157743");
      for (const [key, expiresAt] of this.suppressedReconnectAddresses.entries()) {
        if (stryMutAct_9fa48("157744")) {
          {}
        } else {
          stryCov_9fa48("157744");
          if (stryMutAct_9fa48("157747") ? !Number.isFinite(expiresAt) && expiresAt <= nowMs : stryMutAct_9fa48("157746") ? false : stryMutAct_9fa48("157745") ? true : (stryCov_9fa48("157745", "157746", "157747"), (stryMutAct_9fa48("157748") ? Number.isFinite(expiresAt) : (stryCov_9fa48("157748"), !Number.isFinite(expiresAt))) || (stryMutAct_9fa48("157751") ? expiresAt > nowMs : stryMutAct_9fa48("157750") ? expiresAt < nowMs : stryMutAct_9fa48("157749") ? false : (stryCov_9fa48("157749", "157750", "157751"), expiresAt <= nowMs)))) {
            if (stryMutAct_9fa48("157752")) {
              {}
            } else {
              stryCov_9fa48("157752");
              this.suppressedReconnectAddresses.delete(key);
            }
          }
        }
      }
    }
  }

  /**
   * Return whether one reconnect address is temporarily suppressed.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {boolean}
   * @private
   */
  isReconnectAddressSuppressed(targetNodeId, address) {
    if (stryMutAct_9fa48("157753")) {
      {}
    } else {
      stryCov_9fa48("157753");
      const key = this.getReconnectAddressSuppressionKey(targetNodeId, address);
      if (stryMutAct_9fa48("157756") ? false : stryMutAct_9fa48("157755") ? true : stryMutAct_9fa48("157754") ? key : (stryCov_9fa48("157754", "157755", "157756"), !key)) {
        if (stryMutAct_9fa48("157757")) {
          {}
        } else {
          stryCov_9fa48("157757");
          return stryMutAct_9fa48("157758") ? true : (stryCov_9fa48("157758"), false);
        }
      }
      this.pruneReconnectAddressSuppressions();
      const expiresAt = this.suppressedReconnectAddresses.get(key);
      return stryMutAct_9fa48("157761") ? Number.isFinite(expiresAt) || expiresAt > Date.now() : stryMutAct_9fa48("157760") ? false : stryMutAct_9fa48("157759") ? true : (stryCov_9fa48("157759", "157760", "157761"), Number.isFinite(expiresAt) && (stryMutAct_9fa48("157764") ? expiresAt <= Date.now() : stryMutAct_9fa48("157763") ? expiresAt >= Date.now() : stryMutAct_9fa48("157762") ? true : (stryCov_9fa48("157762", "157763", "157764"), expiresAt > Date.now())));
    }
  }

  /**
   * Temporarily suppress one reconnect address after a fatal DNS failure.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {void}
   * @private
   */
  suppressReconnectAddress(targetNodeId, address) {
    if (stryMutAct_9fa48("157765")) {
      {}
    } else {
      stryCov_9fa48("157765");
      const key = this.getReconnectAddressSuppressionKey(targetNodeId, address);
      if (stryMutAct_9fa48("157768") ? false : stryMutAct_9fa48("157767") ? true : stryMutAct_9fa48("157766") ? key : (stryCov_9fa48("157766", "157767", "157768"), !key)) {
        if (stryMutAct_9fa48("157769")) {
          {}
        } else {
          stryCov_9fa48("157769");
          return;
        }
      }
      const suppressionMs = (stryMutAct_9fa48("157772") ? Number.isFinite(this.reconnectAddressSuppressionMs) || this.reconnectAddressSuppressionMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157771") ? false : stryMutAct_9fa48("157770") ? true : (stryCov_9fa48("157770", "157771", "157772"), Number.isFinite(this.reconnectAddressSuppressionMs) && (stryMutAct_9fa48("157775") ? this.reconnectAddressSuppressionMs <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157774") ? this.reconnectAddressSuppressionMs >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157773") ? true : (stryCov_9fa48("157773", "157774", "157775"), this.reconnectAddressSuppressionMs > TRANSPORT_NUM.ZERO)))) ? this.reconnectAddressSuppressionMs : TRANSPORT_NUM.ZERO;
      if (stryMutAct_9fa48("157779") ? suppressionMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157778") ? suppressionMs < TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157777") ? false : stryMutAct_9fa48("157776") ? true : (stryCov_9fa48("157776", "157777", "157778", "157779"), suppressionMs <= TRANSPORT_NUM.ZERO)) {
        if (stryMutAct_9fa48("157780")) {
          {}
        } else {
          stryCov_9fa48("157780");
          return;
        }
      }
      this.suppressedReconnectAddresses.set(key, stryMutAct_9fa48("157781") ? Date.now() - suppressionMs : (stryCov_9fa48("157781"), Date.now() + suppressionMs));
    }
  }

  /**
   * Clear suppression for one reconnect address after a successful dial.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {void}
   * @private
   */
  clearReconnectAddressSuppression(targetNodeId, address) {
    if (stryMutAct_9fa48("157782")) {
      {}
    } else {
      stryCov_9fa48("157782");
      const key = this.getReconnectAddressSuppressionKey(targetNodeId, address);
      if (stryMutAct_9fa48("157785") ? false : stryMutAct_9fa48("157784") ? true : stryMutAct_9fa48("157783") ? key : (stryCov_9fa48("157783", "157784", "157785"), !key)) {
        if (stryMutAct_9fa48("157786")) {
          {}
        } else {
          stryCov_9fa48("157786");
          return;
        }
      }
      this.suppressedReconnectAddresses.delete(key);
    }
  }

  /**
   * Return whether one reconnect error indicates a stale DNS-owned address.
   * @param {Error|null} error
   * @return {boolean}
   * @private
   */
  shouldSuppressReconnectAddress(error) {
    if (stryMutAct_9fa48("157787")) {
      {}
    } else {
      stryCov_9fa48("157787");
      const errorMessage = stryMutAct_9fa48("157790") ? error?.message && null : stryMutAct_9fa48("157789") ? false : stryMutAct_9fa48("157788") ? true : (stryCov_9fa48("157788", "157789", "157790"), (stryMutAct_9fa48("157791") ? error.message : (stryCov_9fa48("157791"), error?.message)) || null);
      if (stryMutAct_9fa48("157794") ? typeof errorMessage !== TRANSPORT_TYPEOF.STRING && errorMessage.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157793") ? false : stryMutAct_9fa48("157792") ? true : (stryCov_9fa48("157792", "157793", "157794"), (stryMutAct_9fa48("157796") ? typeof errorMessage === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157795") ? false : (stryCov_9fa48("157795", "157796"), typeof errorMessage !== TRANSPORT_TYPEOF.STRING)) || (stryMutAct_9fa48("157798") ? errorMessage.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157797") ? false : (stryCov_9fa48("157797", "157798"), errorMessage.length === TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("157799")) {
          {}
        } else {
          stryCov_9fa48("157799");
          return stryMutAct_9fa48("157800") ? true : (stryCov_9fa48("157800"), false);
        }
      }
      return stryMutAct_9fa48("157803") ? errorMessage.includes(MESSAGE_ROUTER_LITERAL.STRING_ENOTFOUND) && errorMessage.includes(MESSAGE_ROUTER_LITERAL.STRING_EAI_AGAIN) : stryMutAct_9fa48("157802") ? false : stryMutAct_9fa48("157801") ? true : (stryCov_9fa48("157801", "157802", "157803"), errorMessage.includes(MESSAGE_ROUTER_LITERAL.STRING_ENOTFOUND) || errorMessage.includes(MESSAGE_ROUTER_LITERAL.STRING_EAI_AGAIN));
    }
  }

  /**
   * Resolve ordered reconnect addresses for one target node.
   * Prefer the last directly-observed transport address, then the originally
   * configured address, then the resolver-provided fallback.
   * @param {string} targetNodeId
   * @param {string|null} preferredAddress
   * @return {Array<string>}
   * @private
   */
  resolveReconnectAddresses(targetNodeId, preferredAddress = null) {
    if (stryMutAct_9fa48("157804")) {
      {}
    } else {
      stryCov_9fa48("157804");
      const addresses = stryMutAct_9fa48("157805") ? ["Stryker was here"] : (stryCov_9fa48("157805"), []);
      const pushUniqueAddress = candidate => {
        if (stryMutAct_9fa48("157806")) {
          {}
        } else {
          stryCov_9fa48("157806");
          if (stryMutAct_9fa48("157809") ? (typeof candidate !== TRANSPORT_TYPEOF.STRING || candidate.length === TRANSPORT_NUM.ZERO || this.isReconnectAddressSuppressed(targetNodeId, candidate)) && addresses.includes(candidate) : stryMutAct_9fa48("157808") ? false : stryMutAct_9fa48("157807") ? true : (stryCov_9fa48("157807", "157808", "157809"), (stryMutAct_9fa48("157811") ? (typeof candidate !== TRANSPORT_TYPEOF.STRING || candidate.length === TRANSPORT_NUM.ZERO) && this.isReconnectAddressSuppressed(targetNodeId, candidate) : stryMutAct_9fa48("157810") ? false : (stryCov_9fa48("157810", "157811"), (stryMutAct_9fa48("157813") ? typeof candidate !== TRANSPORT_TYPEOF.STRING && candidate.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157812") ? false : (stryCov_9fa48("157812", "157813"), (stryMutAct_9fa48("157815") ? typeof candidate === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157814") ? false : (stryCov_9fa48("157814", "157815"), typeof candidate !== TRANSPORT_TYPEOF.STRING)) || (stryMutAct_9fa48("157817") ? candidate.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157816") ? false : (stryCov_9fa48("157816", "157817"), candidate.length === TRANSPORT_NUM.ZERO)))) || this.isReconnectAddressSuppressed(targetNodeId, candidate))) || addresses.includes(candidate))) {
            if (stryMutAct_9fa48("157818")) {
              {}
            } else {
              stryCov_9fa48("157818");
              return;
            }
          }
          addresses.push(candidate);
        }
      };
      const existing = stryMutAct_9fa48("157821") ? this.nodeConnections.get(targetNodeId) && null : stryMutAct_9fa48("157820") ? false : stryMutAct_9fa48("157819") ? true : (stryCov_9fa48("157819", "157820", "157821"), this.nodeConnections.get(targetNodeId) || null);
      const canonicalAddress = existing ? this.refreshReconnectAuthority(existing, preferredAddress) : this.resolveCanonicalReconnectAddress(targetNodeId, preferredAddress);
      pushUniqueAddress(stryMutAct_9fa48("157824") ? normalizeToWebSocketAddress(preferredAddress) && preferredAddress : stryMutAct_9fa48("157823") ? false : stryMutAct_9fa48("157822") ? true : (stryCov_9fa48("157822", "157823", "157824"), normalizeToWebSocketAddress(preferredAddress) || preferredAddress));
      pushUniqueAddress(stryMutAct_9fa48("157827") ? normalizeToWebSocketAddress(existing?.observedAddress) && existing?.observedAddress : stryMutAct_9fa48("157826") ? false : stryMutAct_9fa48("157825") ? true : (stryCov_9fa48("157825", "157826", "157827"), normalizeToWebSocketAddress(stryMutAct_9fa48("157828") ? existing.observedAddress : (stryCov_9fa48("157828"), existing?.observedAddress)) || (stryMutAct_9fa48("157829") ? existing.observedAddress : (stryCov_9fa48("157829"), existing?.observedAddress))));
      pushUniqueAddress(stryMutAct_9fa48("157832") ? normalizeToWebSocketAddress(existing?.address) && existing?.address : stryMutAct_9fa48("157831") ? false : stryMutAct_9fa48("157830") ? true : (stryCov_9fa48("157830", "157831", "157832"), normalizeToWebSocketAddress(stryMutAct_9fa48("157833") ? existing.address : (stryCov_9fa48("157833"), existing?.address)) || (stryMutAct_9fa48("157834") ? existing.address : (stryCov_9fa48("157834"), existing?.address))));
      pushUniqueAddress(stryMutAct_9fa48("157837") ? normalizeToWebSocketAddress(existing?.configuredAddress) && existing?.configuredAddress : stryMutAct_9fa48("157836") ? false : stryMutAct_9fa48("157835") ? true : (stryCov_9fa48("157835", "157836", "157837"), normalizeToWebSocketAddress(stryMutAct_9fa48("157838") ? existing.configuredAddress : (stryCov_9fa48("157838"), existing?.configuredAddress)) || (stryMutAct_9fa48("157839") ? existing.configuredAddress : (stryCov_9fa48("157839"), existing?.configuredAddress))));
      pushUniqueAddress(canonicalAddress);
      return addresses;
    }
  }

  /**
   * Ensure one reconnect owner record exists even when the first cold dial
   * fails before a durable socket was established.
   * @param {string} targetNodeId
   * @param {string|null} preferredAddress
   * @return {Object|null}
   * @private
   */
  ensureReconnectOwnerConnection(targetNodeId, preferredAddress = null) {
    if (stryMutAct_9fa48("157840")) {
      {}
    } else {
      stryCov_9fa48("157840");
      const existing = stryMutAct_9fa48("157843") ? this.nodeConnections.get(targetNodeId) && null : stryMutAct_9fa48("157842") ? false : stryMutAct_9fa48("157841") ? true : (stryCov_9fa48("157841", "157842", "157843"), this.nodeConnections.get(targetNodeId) || null);
      if (stryMutAct_9fa48("157845") ? false : stryMutAct_9fa48("157844") ? true : (stryCov_9fa48("157844", "157845"), existing)) {
        if (stryMutAct_9fa48("157846")) {
          {}
        } else {
          stryCov_9fa48("157846");
          this.refreshReconnectAuthority(existing, preferredAddress);
          if (stryMutAct_9fa48("157849") ? typeof preferredAddress === TRANSPORT_TYPEOF.STRING || preferredAddress.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157848") ? false : stryMutAct_9fa48("157847") ? true : (stryCov_9fa48("157847", "157848", "157849"), (stryMutAct_9fa48("157851") ? typeof preferredAddress !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157850") ? true : (stryCov_9fa48("157850", "157851"), typeof preferredAddress === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("157854") ? preferredAddress.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157853") ? preferredAddress.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157852") ? true : (stryCov_9fa48("157852", "157853", "157854"), preferredAddress.length > TRANSPORT_NUM.ZERO)))) {
            if (stryMutAct_9fa48("157855")) {
              {}
            } else {
              stryCov_9fa48("157855");
              if (stryMutAct_9fa48("157858") ? typeof existing.configuredAddress !== TRANSPORT_TYPEOF.STRING && existing.configuredAddress.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157857") ? false : stryMutAct_9fa48("157856") ? true : (stryCov_9fa48("157856", "157857", "157858"), (stryMutAct_9fa48("157860") ? typeof existing.configuredAddress === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157859") ? false : (stryCov_9fa48("157859", "157860"), typeof existing.configuredAddress !== TRANSPORT_TYPEOF.STRING)) || (stryMutAct_9fa48("157862") ? existing.configuredAddress.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157861") ? false : (stryCov_9fa48("157861", "157862"), existing.configuredAddress.length === TRANSPORT_NUM.ZERO)))) {
                if (stryMutAct_9fa48("157863")) {
                  {}
                } else {
                  stryCov_9fa48("157863");
                  existing.configuredAddress = preferredAddress;
                }
              }
              if (stryMutAct_9fa48("157866") ? typeof existing.address !== TRANSPORT_TYPEOF.STRING && existing.address.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157865") ? false : stryMutAct_9fa48("157864") ? true : (stryCov_9fa48("157864", "157865", "157866"), (stryMutAct_9fa48("157868") ? typeof existing.address === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157867") ? false : (stryCov_9fa48("157867", "157868"), typeof existing.address !== TRANSPORT_TYPEOF.STRING)) || (stryMutAct_9fa48("157870") ? existing.address.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157869") ? false : (stryCov_9fa48("157869", "157870"), existing.address.length === TRANSPORT_NUM.ZERO)))) {
                if (stryMutAct_9fa48("157871")) {
                  {}
                } else {
                  stryCov_9fa48("157871");
                  existing.address = preferredAddress;
                }
              }
            }
          }
          return existing;
        }
      }
      if (stryMutAct_9fa48("157874") ? typeof preferredAddress !== TRANSPORT_TYPEOF.STRING && preferredAddress.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157873") ? false : stryMutAct_9fa48("157872") ? true : (stryCov_9fa48("157872", "157873", "157874"), (stryMutAct_9fa48("157876") ? typeof preferredAddress === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157875") ? false : (stryCov_9fa48("157875", "157876"), typeof preferredAddress !== TRANSPORT_TYPEOF.STRING)) || (stryMutAct_9fa48("157878") ? preferredAddress.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157877") ? false : (stryCov_9fa48("157877", "157878"), preferredAddress.length === TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("157879")) {
          {}
        } else {
          stryCov_9fa48("157879");
          return null;
        }
      }
      const canonicalPreferredAddress = stryMutAct_9fa48("157882") ? this.resolveCanonicalReconnectAddress(targetNodeId, preferredAddress) && preferredAddress : stryMutAct_9fa48("157881") ? false : stryMutAct_9fa48("157880") ? true : (stryCov_9fa48("157880", "157881", "157882"), this.resolveCanonicalReconnectAddress(targetNodeId, preferredAddress) || preferredAddress);
      const connectionInfo = stryMutAct_9fa48("157883") ? {} : (stryCov_9fa48("157883"), {
        connectionId: uuidv4(),
        nodeId: targetNodeId,
        address: canonicalPreferredAddress,
        configuredAddress: canonicalPreferredAddress,
        observedAddress: null,
        ws: null,
        state: ConnectionState.DISCONNECTED,
        reconnectAttempts: TRANSPORT_NUM.ZERO,
        reconnectTimeout: null,
        reconnectDueAt: null,
        pingInterval: null,
        isIncoming: stryMutAct_9fa48("157884") ? true : (stryCov_9fa48("157884"), false),
        isSelfConnection: stryMutAct_9fa48("157885") ? true : (stryCov_9fa48("157885"), false),
        ackTimeoutStreak: TRANSPORT_NUM.ZERO,
        lastAckAt: null,
        lastAckTimeoutAt: null,
        retired: stryMutAct_9fa48("157886") ? true : (stryCov_9fa48("157886"), false),
        createdAt: Date.now()
      });
      this.nodeConnections.set(targetNodeId, connectionInfo);
      return connectionInfo;
    }
  }

  /**
   * Arm one reconnect owner after a failed cold dial so subsequent deliveries
   * defer behind the same cooldown instead of redialing immediately.
   * @param {string} targetNodeId
   * @param {string|null} preferredAddress
   * @return {Object|null}
   * @private
   */
  armReconnectAfterConnectFailure(targetNodeId, preferredAddress = null) {
    if (stryMutAct_9fa48("157887")) {
      {}
    } else {
      stryCov_9fa48("157887");
      const connection = this.ensureReconnectOwnerConnection(targetNodeId, preferredAddress);
      if (stryMutAct_9fa48("157890") ? (!connection || connection.isIncoming === true || connection.isSelfConnection === true || connection.state === ConnectionState.CONNECTED) && this.hasScheduledReconnect(connection) : stryMutAct_9fa48("157889") ? false : stryMutAct_9fa48("157888") ? true : (stryCov_9fa48("157888", "157889", "157890"), (stryMutAct_9fa48("157892") ? (!connection || connection.isIncoming === true || connection.isSelfConnection === true) && connection.state === ConnectionState.CONNECTED : stryMutAct_9fa48("157891") ? false : (stryCov_9fa48("157891", "157892"), (stryMutAct_9fa48("157894") ? (!connection || connection.isIncoming === true) && connection.isSelfConnection === true : stryMutAct_9fa48("157893") ? false : (stryCov_9fa48("157893", "157894"), (stryMutAct_9fa48("157896") ? !connection && connection.isIncoming === true : stryMutAct_9fa48("157895") ? false : (stryCov_9fa48("157895", "157896"), (stryMutAct_9fa48("157897") ? connection : (stryCov_9fa48("157897"), !connection)) || (stryMutAct_9fa48("157899") ? connection.isIncoming !== true : stryMutAct_9fa48("157898") ? false : (stryCov_9fa48("157898", "157899"), connection.isIncoming === (stryMutAct_9fa48("157900") ? false : (stryCov_9fa48("157900"), true)))))) || (stryMutAct_9fa48("157902") ? connection.isSelfConnection !== true : stryMutAct_9fa48("157901") ? false : (stryCov_9fa48("157901", "157902"), connection.isSelfConnection === (stryMutAct_9fa48("157903") ? false : (stryCov_9fa48("157903"), true)))))) || (stryMutAct_9fa48("157905") ? connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("157904") ? false : (stryCov_9fa48("157904", "157905"), connection.state === ConnectionState.CONNECTED)))) || this.hasScheduledReconnect(connection))) {
        if (stryMutAct_9fa48("157906")) {
          {}
        } else {
          stryCov_9fa48("157906");
          return connection;
        }
      }
      if (stryMutAct_9fa48("157909") ? typeof connection.address !== TRANSPORT_TYPEOF.STRING && connection.address.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157908") ? false : stryMutAct_9fa48("157907") ? true : (stryCov_9fa48("157907", "157908", "157909"), (stryMutAct_9fa48("157911") ? typeof connection.address === TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("157910") ? false : (stryCov_9fa48("157910", "157911"), typeof connection.address !== TRANSPORT_TYPEOF.STRING)) || (stryMutAct_9fa48("157913") ? connection.address.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157912") ? false : (stryCov_9fa48("157912", "157913"), connection.address.length === TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("157914")) {
          {}
        } else {
          stryCov_9fa48("157914");
          return connection;
        }
      }
      connection.state = ConnectionState.DISCONNECTED;
      this.scheduleReconnect(connection);
      return connection;
    }
  }

  /**
   * Ensure a remote node connection exists for delivery recovery.
   * @param {string} targetNodeId
   * @param {string} address
   * @return {Promise<Object|null>}
   * @private
   */
  async ensureNodeConnection(targetNodeId, address) {
    if (stryMutAct_9fa48("157915")) {
      {}
    } else {
      stryCov_9fa48("157915");
      const existing = this.nodeConnections.get(targetNodeId);
      if (stryMutAct_9fa48("157918") ? existing || existing.state === ConnectionState.CONNECTED : stryMutAct_9fa48("157917") ? false : stryMutAct_9fa48("157916") ? true : (stryCov_9fa48("157916", "157917", "157918"), existing && (stryMutAct_9fa48("157920") ? existing.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("157919") ? true : (stryCov_9fa48("157919", "157920"), existing.state === ConnectionState.CONNECTED)))) {
        if (stryMutAct_9fa48("157921")) {
          {}
        } else {
          stryCov_9fa48("157921");
          return existing;
        }
      }
      if (stryMutAct_9fa48("157923") ? false : stryMutAct_9fa48("157922") ? true : (stryCov_9fa48("157922", "157923"), this.hasScheduledReconnect(existing))) {
        if (stryMutAct_9fa48("157924")) {
          {}
        } else {
          stryCov_9fa48("157924");
          return null;
        }
      }
      if (stryMutAct_9fa48("157926") ? false : stryMutAct_9fa48("157925") ? true : (stryCov_9fa48("157925", "157926"), this.pendingNodeConnections.has(targetNodeId))) {
        if (stryMutAct_9fa48("157927")) {
          {}
        } else {
          stryCov_9fa48("157927");
          return this.pendingNodeConnections.get(targetNodeId);
        }
      }
      const connectionPromise = (async () => {
        if (stryMutAct_9fa48("157928")) {
          {}
        } else {
          stryCov_9fa48("157928");
          const reconnectAddresses = this.resolveReconnectAddresses(targetNodeId, address);
          let lastError = null;
          try {
            if (stryMutAct_9fa48("157929")) {
              {}
            } else {
              stryCov_9fa48("157929");
              for (const reconnectAddress of reconnectAddresses) {
                if (stryMutAct_9fa48("157930")) {
                  {}
                } else {
                  stryCov_9fa48("157930");
                  try {
                    if (stryMutAct_9fa48("157931")) {
                      {}
                    } else {
                      stryCov_9fa48("157931");
                      await this.connectToNode(targetNodeId, reconnectAddress);
                      this.clearReconnectAddressSuppression(targetNodeId, reconnectAddress);
                      lastError = null;
                      break;
                    }
                  } catch (error) {
                    if (stryMutAct_9fa48("157932")) {
                      {}
                    } else {
                      stryCov_9fa48("157932");
                      lastError = error;
                      if (stryMutAct_9fa48("157934") ? false : stryMutAct_9fa48("157933") ? true : (stryCov_9fa48("157933", "157934"), this.shouldSuppressReconnectAddress(error))) {
                        if (stryMutAct_9fa48("157935")) {
                          {}
                        } else {
                          stryCov_9fa48("157935");
                          this.suppressReconnectAddress(targetNodeId, reconnectAddress);
                        }
                      }
                      this.logger.warn(stryMutAct_9fa48("157936") ? "" : (stryCov_9fa48("157936"), 'Failed to reconnect target node before delivery'), stryMutAct_9fa48("157937") ? {} : (stryCov_9fa48("157937"), {
                        targetNodeId,
                        address: reconnectAddress,
                        localNodeId: this.nodeId,
                        error: stryMutAct_9fa48("157940") ? error?.message && String(error) : stryMutAct_9fa48("157939") ? false : stryMutAct_9fa48("157938") ? true : (stryCov_9fa48("157938", "157939", "157940"), (stryMutAct_9fa48("157941") ? error.message : (stryCov_9fa48("157941"), error?.message)) || String(error))
                      }));
                    }
                  }
                }
              }
            }
          } finally {
            if (stryMutAct_9fa48("157942")) {
              {}
            } else {
              stryCov_9fa48("157942");
              this.pendingNodeConnections.delete(targetNodeId);
            }
          }
          this.armReconnectAfterConnectFailure(targetNodeId, stryMutAct_9fa48("157945") ? reconnectAddresses[reconnectAddresses.length - TRANSPORT_NUM.ONE] && address : stryMutAct_9fa48("157944") ? false : stryMutAct_9fa48("157943") ? true : (stryCov_9fa48("157943", "157944", "157945"), reconnectAddresses[stryMutAct_9fa48("157946") ? reconnectAddresses.length + TRANSPORT_NUM.ONE : (stryCov_9fa48("157946"), reconnectAddresses.length - TRANSPORT_NUM.ONE)] || address));
          const connection = stryMutAct_9fa48("157949") ? this.nodeConnections.get(targetNodeId) && null : stryMutAct_9fa48("157948") ? false : stryMutAct_9fa48("157947") ? true : (stryCov_9fa48("157947", "157948", "157949"), this.nodeConnections.get(targetNodeId) || null);
          if (stryMutAct_9fa48("157952") ? !connection && connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("157951") ? false : stryMutAct_9fa48("157950") ? true : (stryCov_9fa48("157950", "157951", "157952"), (stryMutAct_9fa48("157953") ? connection : (stryCov_9fa48("157953"), !connection)) || (stryMutAct_9fa48("157955") ? connection.state === ConnectionState.CONNECTED : stryMutAct_9fa48("157954") ? false : (stryCov_9fa48("157954", "157955"), connection.state !== ConnectionState.CONNECTED)))) {
            if (stryMutAct_9fa48("157956")) {
              {}
            } else {
              stryCov_9fa48("157956");
              if (stryMutAct_9fa48("157959") ? lastError || reconnectAddresses.length === TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157958") ? false : stryMutAct_9fa48("157957") ? true : (stryCov_9fa48("157957", "157958", "157959"), lastError && (stryMutAct_9fa48("157961") ? reconnectAddresses.length !== TRANSPORT_NUM.ZERO : stryMutAct_9fa48("157960") ? true : (stryCov_9fa48("157960", "157961"), reconnectAddresses.length === TRANSPORT_NUM.ZERO)))) {
                if (stryMutAct_9fa48("157962")) {
                  {}
                } else {
                  stryCov_9fa48("157962");
                  this.logger.warn(stryMutAct_9fa48("157963") ? "" : (stryCov_9fa48("157963"), 'Failed to reconnect target node before delivery'), stryMutAct_9fa48("157964") ? {} : (stryCov_9fa48("157964"), {
                    targetNodeId,
                    address: null,
                    localNodeId: this.nodeId,
                    error: stryMutAct_9fa48("157967") ? lastError?.message && String(lastError) : stryMutAct_9fa48("157966") ? false : stryMutAct_9fa48("157965") ? true : (stryCov_9fa48("157965", "157966", "157967"), (stryMutAct_9fa48("157968") ? lastError.message : (stryCov_9fa48("157968"), lastError?.message)) || String(lastError))
                  }));
                }
              }
            }
          }
          return (stryMutAct_9fa48("157971") ? connection || connection.state === ConnectionState.CONNECTED : stryMutAct_9fa48("157970") ? false : stryMutAct_9fa48("157969") ? true : (stryCov_9fa48("157969", "157970", "157971"), connection && (stryMutAct_9fa48("157973") ? connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("157972") ? true : (stryCov_9fa48("157972", "157973"), connection.state === ConnectionState.CONNECTED)))) ? connection : null;
        }
      })();
      this.pendingNodeConnections.set(targetNodeId, connectionPromise);
      return connectionPromise;
    }
  }

  /**
   * Reconnect to one node and retry the send once.
   * @param {string} reconnectAddress
   * @param {string} targetAddress
   * @param {string} messageId
   * @param {Object} payload
   * @param {string} targetNodeId
   * @param {string} correlationId
   * @return {Promise<Object>}
   * @private
   */
  async tryDeliverAfterReconnect(reconnectAddress, targetAddress, messageId, payload, targetNodeId, correlationId, timeoutMs = null) {
    if (stryMutAct_9fa48("157974")) {
      {}
    } else {
      stryCov_9fa48("157974");
      const connection = await this.ensureNodeConnection(targetNodeId, reconnectAddress);
      if (stryMutAct_9fa48("157977") ? !connection && connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("157976") ? false : stryMutAct_9fa48("157975") ? true : (stryCov_9fa48("157975", "157976", "157977"), (stryMutAct_9fa48("157978") ? connection : (stryCov_9fa48("157978"), !connection)) || (stryMutAct_9fa48("157980") ? connection.state === ConnectionState.CONNECTED : stryMutAct_9fa48("157979") ? false : (stryCov_9fa48("157979", "157980"), connection.state !== ConnectionState.CONNECTED)))) {
        if (stryMutAct_9fa48("157981")) {
          {}
        } else {
          stryCov_9fa48("157981");
          const reconnectInProgress = this.buildReconnectInProgressFailure(targetNodeId, messageId, correlationId);
          if (stryMutAct_9fa48("157983") ? false : stryMutAct_9fa48("157982") ? true : (stryCov_9fa48("157982", "157983"), reconnectInProgress)) {
            if (stryMutAct_9fa48("157984")) {
              {}
            } else {
              stryCov_9fa48("157984");
              return reconnectInProgress;
            }
          }
          this.logger.warn(ROUTER_LOG_MSG.NO_TARGET_CONNECTION, stryMutAct_9fa48("157985") ? {} : (stryCov_9fa48("157985"), {
            messageId,
            targetAddress,
            targetNodeId,
            localNodeId: this.nodeId,
            connectionExists: stryMutAct_9fa48("157986") ? !connection : (stryCov_9fa48("157986"), !(stryMutAct_9fa48("157987") ? connection : (stryCov_9fa48("157987"), !connection))),
            connectionState: stryMutAct_9fa48("157988") ? connection.state : (stryCov_9fa48("157988"), connection?.state),
            availableConnections: Array.from(this.nodeConnections.keys()),
            reconnectAddress,
            recoveredViaResolver: stryMutAct_9fa48("157989") ? false : (stryCov_9fa48("157989"), true)
          }));
          return this.buildDeferredDeliveryFailure(messageId, correlationId, ROUTER_ERROR_MSG.noConnectionToNode(targetNodeId), stryMutAct_9fa48("157990") ? {} : (stryCov_9fa48("157990"), {
            errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
            retryAfterMs: this.reconnectIntervalMs
          }));
        }
      }
      return this.sendMessage(connection, targetAddress, messageId, payload, targetNodeId, correlationId, timeoutMs);
    }
  }

  /**
   * Retire one superseded socket after a bounded grace window.
   * Keeps late ACK / SERVICE_RESPONSE frames from being cut off immediately
   * while still ensuring stale sockets cannot accumulate indefinitely.
   * @param {WebSocket|null} staleWs
   * @return {void}
   * @private
   */
  scheduleRetiredSocketTermination(staleWs) {
    if (stryMutAct_9fa48("157991")) {
      {}
    } else {
      stryCov_9fa48("157991");
      if (stryMutAct_9fa48("157994") ? !staleWs && typeof staleWs.terminate !== TRANSPORT_TYPEOF.FUNCTION && typeof staleWs.close !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("157993") ? false : stryMutAct_9fa48("157992") ? true : (stryCov_9fa48("157992", "157993", "157994"), (stryMutAct_9fa48("157995") ? staleWs : (stryCov_9fa48("157995"), !staleWs)) || (stryMutAct_9fa48("157997") ? typeof staleWs.terminate !== TRANSPORT_TYPEOF.FUNCTION || typeof staleWs.close !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("157996") ? false : (stryCov_9fa48("157996", "157997"), (stryMutAct_9fa48("157999") ? typeof staleWs.terminate === TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("157998") ? true : (stryCov_9fa48("157998", "157999"), typeof staleWs.terminate !== TRANSPORT_TYPEOF.FUNCTION)) && (stryMutAct_9fa48("158001") ? typeof staleWs.close === TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("158000") ? true : (stryCov_9fa48("158000", "158001"), typeof staleWs.close !== TRANSPORT_TYPEOF.FUNCTION)))))) {
        if (stryMutAct_9fa48("158002")) {
          {}
        } else {
          stryCov_9fa48("158002");
          return;
        }
      }
      const graceMs = stryMutAct_9fa48("158003") ? Math.min(this.reconnectIntervalMs, this.messageTimeoutMs) : (stryCov_9fa48("158003"), Math.max(this.reconnectIntervalMs, this.messageTimeoutMs));
      const timeout = setTimeout(() => {
        if (stryMutAct_9fa48("158004")) {
          {}
        } else {
          stryCov_9fa48("158004");
          try {
            if (stryMutAct_9fa48("158005")) {
              {}
            } else {
              stryCov_9fa48("158005");
              if (stryMutAct_9fa48("158008") ? typeof staleWs.terminate !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("158007") ? false : stryMutAct_9fa48("158006") ? true : (stryCov_9fa48("158006", "158007", "158008"), typeof staleWs.terminate === TRANSPORT_TYPEOF.FUNCTION)) {
                if (stryMutAct_9fa48("158009")) {
                  {}
                } else {
                  stryCov_9fa48("158009");
                  staleWs.terminate();
                }
              } else if (stryMutAct_9fa48("158012") ? typeof staleWs.close !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("158011") ? false : stryMutAct_9fa48("158010") ? true : (stryCov_9fa48("158010", "158011", "158012"), typeof staleWs.close === TRANSPORT_TYPEOF.FUNCTION)) {
                if (stryMutAct_9fa48("158013")) {
                  {}
                } else {
                  stryCov_9fa48("158013");
                  staleWs.close();
                }
              }
            }
          } catch (_closeErr) {
            // Best-effort stale socket retirement after bounded grace.
          }
        }
      }, graceMs);
      if (stryMutAct_9fa48("158016") ? typeof timeout?.unref !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("158015") ? false : stryMutAct_9fa48("158014") ? true : (stryCov_9fa48("158014", "158015", "158016"), typeof (stryMutAct_9fa48("158017") ? timeout.unref : (stryCov_9fa48("158017"), timeout?.unref)) === TRANSPORT_TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("158018")) {
          {}
        } else {
          stryCov_9fa48("158018");
          timeout.unref();
        }
      }
    }
  }

  /**
   * Quarantine one remote connection after an ACK timeout so recovery is
   * owned by a single reconnect state machine instead of cascading socket
   * resets across all callers.
   * @param {string} targetNodeId
   * @param {Object|null} connection
   * @param {string} messageId
   * @param {string} targetAddress
   * @return {Object|null}
   * @private
   */
  quarantineConnectionAfterAckTimeout(targetNodeId, connection, messageId, targetAddress) {
    if (stryMutAct_9fa48("158019")) {
      {}
    } else {
      stryCov_9fa48("158019");
      if (stryMutAct_9fa48("158022") ? (!connection || connection.isIncoming === true) && connection.isSelfConnection === true : stryMutAct_9fa48("158021") ? false : stryMutAct_9fa48("158020") ? true : (stryCov_9fa48("158020", "158021", "158022"), (stryMutAct_9fa48("158024") ? !connection && connection.isIncoming === true : stryMutAct_9fa48("158023") ? false : (stryCov_9fa48("158023", "158024"), (stryMutAct_9fa48("158025") ? connection : (stryCov_9fa48("158025"), !connection)) || (stryMutAct_9fa48("158027") ? connection.isIncoming !== true : stryMutAct_9fa48("158026") ? false : (stryCov_9fa48("158026", "158027"), connection.isIncoming === (stryMutAct_9fa48("158028") ? false : (stryCov_9fa48("158028"), true)))))) || (stryMutAct_9fa48("158030") ? connection.isSelfConnection !== true : stryMutAct_9fa48("158029") ? false : (stryCov_9fa48("158029", "158030"), connection.isSelfConnection === (stryMutAct_9fa48("158031") ? false : (stryCov_9fa48("158031"), true)))))) {
        if (stryMutAct_9fa48("158032")) {
          {}
        } else {
          stryCov_9fa48("158032");
          return;
        }
      }
      const activeConnection = this.nodeConnections.get(targetNodeId);
      if (stryMutAct_9fa48("158035") ? (!activeConnection || activeConnection.connectionId !== connection.connectionId) && activeConnection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("158034") ? false : stryMutAct_9fa48("158033") ? true : (stryCov_9fa48("158033", "158034", "158035"), (stryMutAct_9fa48("158037") ? !activeConnection && activeConnection.connectionId !== connection.connectionId : stryMutAct_9fa48("158036") ? false : (stryCov_9fa48("158036", "158037"), (stryMutAct_9fa48("158038") ? activeConnection : (stryCov_9fa48("158038"), !activeConnection)) || (stryMutAct_9fa48("158040") ? activeConnection.connectionId === connection.connectionId : stryMutAct_9fa48("158039") ? false : (stryCov_9fa48("158039", "158040"), activeConnection.connectionId !== connection.connectionId)))) || (stryMutAct_9fa48("158042") ? activeConnection.state === ConnectionState.CONNECTED : stryMutAct_9fa48("158041") ? false : (stryCov_9fa48("158041", "158042"), activeConnection.state !== ConnectionState.CONNECTED)))) {
        if (stryMutAct_9fa48("158043")) {
          {}
        } else {
          stryCov_9fa48("158043");
          return stryMutAct_9fa48("158046") ? activeConnection && null : stryMutAct_9fa48("158045") ? false : stryMutAct_9fa48("158044") ? true : (stryCov_9fa48("158044", "158045", "158046"), activeConnection || null);
        }
      }
      activeConnection.ackTimeoutStreak = stryMutAct_9fa48("158047") ? (activeConnection.ackTimeoutStreak || TRANSPORT_NUM.ZERO) - TRANSPORT_NUM.ONE : (stryCov_9fa48("158047"), (stryMutAct_9fa48("158050") ? activeConnection.ackTimeoutStreak && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158049") ? false : stryMutAct_9fa48("158048") ? true : (stryCov_9fa48("158048", "158049", "158050"), activeConnection.ackTimeoutStreak || TRANSPORT_NUM.ZERO)) + TRANSPORT_NUM.ONE);
      activeConnection.lastAckTimeoutAt = Date.now();
      if (stryMutAct_9fa48("158054") ? activeConnection.ackTimeoutStreak >= this.ackTimeoutQuarantineThreshold : stryMutAct_9fa48("158053") ? activeConnection.ackTimeoutStreak <= this.ackTimeoutQuarantineThreshold : stryMutAct_9fa48("158052") ? false : stryMutAct_9fa48("158051") ? true : (stryCov_9fa48("158051", "158052", "158053", "158054"), activeConnection.ackTimeoutStreak < this.ackTimeoutQuarantineThreshold)) {
        if (stryMutAct_9fa48("158055")) {
          {}
        } else {
          stryCov_9fa48("158055");
          this.logger.debug(MESSAGE_ROUTER_LITERAL.STRING_OBSERVED_ACK_TIMEOUT_BELOW_QUARANTINE_THRESHOLD, stryMutAct_9fa48("158056") ? {} : (stryCov_9fa48("158056"), {
            messageId,
            targetAddress,
            targetNodeId,
            localNodeId: this.nodeId,
            connectionId: activeConnection.connectionId,
            ackTimeoutStreak: activeConnection.ackTimeoutStreak,
            ackTimeoutQuarantineThreshold: this.ackTimeoutQuarantineThreshold
          }));
          return activeConnection;
        }
      }
      this.logger.warn(MESSAGE_ROUTER_LITERAL.STRING_QUARANTINING_TARGET_CONNECTION_AFTER_ACK_TIMEOUT, stryMutAct_9fa48("158057") ? {} : (stryCov_9fa48("158057"), {
        messageId,
        targetAddress,
        targetNodeId,
        localNodeId: this.nodeId,
        connectionId: activeConnection.connectionId,
        ackTimeoutStreak: activeConnection.ackTimeoutStreak,
        ackTimeoutQuarantineThreshold: this.ackTimeoutQuarantineThreshold
      }));
      const staleWs = stryMutAct_9fa48("158060") ? activeConnection.ws && null : stryMutAct_9fa48("158059") ? false : stryMutAct_9fa48("158058") ? true : (stryCov_9fa48("158058", "158059", "158060"), activeConnection.ws || null);
      const reconnectOwner = stryMutAct_9fa48("158061") ? {} : (stryCov_9fa48("158061"), {
        connectionId: uuidv4(),
        nodeId: activeConnection.nodeId,
        nodeAddress: activeConnection.nodeAddress,
        address: activeConnection.address,
        configuredAddress: stryMutAct_9fa48("158064") ? activeConnection.configuredAddress && activeConnection.address : stryMutAct_9fa48("158063") ? false : stryMutAct_9fa48("158062") ? true : (stryCov_9fa48("158062", "158063", "158064"), activeConnection.configuredAddress || activeConnection.address),
        observedAddress: stryMutAct_9fa48("158067") ? activeConnection.observedAddress && null : stryMutAct_9fa48("158066") ? false : stryMutAct_9fa48("158065") ? true : (stryCov_9fa48("158065", "158066", "158067"), activeConnection.observedAddress || null),
        ws: null,
        state: ConnectionState.DISCONNECTED,
        reconnectAttempts: activeConnection.reconnectAttempts,
        reconnectTimeout: null,
        reconnectDueAt: null,
        pingInterval: null,
        isIncoming: stryMutAct_9fa48("158068") ? true : (stryCov_9fa48("158068"), false),
        isSelfConnection: stryMutAct_9fa48("158069") ? true : (stryCov_9fa48("158069"), false),
        ackTimeoutStreak: TRANSPORT_NUM.ZERO,
        lastAckAt: stryMutAct_9fa48("158072") ? activeConnection.lastAckAt && null : stryMutAct_9fa48("158071") ? false : stryMutAct_9fa48("158070") ? true : (stryCov_9fa48("158070", "158071", "158072"), activeConnection.lastAckAt || null),
        lastAckTimeoutAt: stryMutAct_9fa48("158075") ? activeConnection.lastAckTimeoutAt && null : stryMutAct_9fa48("158074") ? false : stryMutAct_9fa48("158073") ? true : (stryCov_9fa48("158073", "158074", "158075"), activeConnection.lastAckTimeoutAt || null),
        retired: stryMutAct_9fa48("158076") ? true : (stryCov_9fa48("158076"), false),
        createdAt: Date.now()
      });
      this.retireConnection(activeConnection);
      activeConnection.state = ConnectionState.CLOSED;
      this.nodeConnections.set(targetNodeId, reconnectOwner);
      this.scheduleReconnect(reconnectOwner);
      this.scheduleRetiredSocketTermination(staleWs);
      return reconnectOwner;
    }
  }

  /**
   * Build one failed-delivery result that asks upstream owners to defer
   * immediate retries instead of multiplying pressure on the same target.
   * @param {string} messageId
   * @param {string} correlationId
   * @param {string} error
   * @param {Object} options
   * @param {string|null} [options.errorCode]
   * @param {number} [options.retryAfterMs]
   * @return {Object}
   * @private
   */
  buildDeferredDeliveryFailure(messageId, correlationId, error, options = {}) {
    if (stryMutAct_9fa48("158077")) {
      {}
    } else {
      stryCov_9fa48("158077");
      const result = stryMutAct_9fa48("158078") ? {} : (stryCov_9fa48("158078"), {
        messageId,
        correlationId,
        acknowledged: stryMutAct_9fa48("158079") ? true : (stryCov_9fa48("158079"), false),
        error,
        deferRetry: stryMutAct_9fa48("158080") ? false : (stryCov_9fa48("158080"), true),
        retryAfterMs: normalizeRetryAfterMs(options.retryAfterMs, this.reconnectIntervalMs)
      });
      if (stryMutAct_9fa48("158083") ? typeof options.errorCode === TRANSPORT_TYPEOF.STRING || options.errorCode.length > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158082") ? false : stryMutAct_9fa48("158081") ? true : (stryCov_9fa48("158081", "158082", "158083"), (stryMutAct_9fa48("158085") ? typeof options.errorCode !== TRANSPORT_TYPEOF.STRING : stryMutAct_9fa48("158084") ? true : (stryCov_9fa48("158084", "158085"), typeof options.errorCode === TRANSPORT_TYPEOF.STRING)) && (stryMutAct_9fa48("158088") ? options.errorCode.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158087") ? options.errorCode.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158086") ? true : (stryCov_9fa48("158086", "158087", "158088"), options.errorCode.length > TRANSPORT_NUM.ZERO)))) {
        if (stryMutAct_9fa48("158089")) {
          {}
        } else {
          stryCov_9fa48("158089");
          result.errorCode = options.errorCode;
        }
      }
      return result;
    }
  }

  /**
   * Send message through WebSocket connection.
   * @param {Object} connection - Connection info.
   * @param {string} targetAddress - Target address.
   * @param {string} messageId - Message ID.
   * @param {Object} payload - Message payload.
   * @return {Promise<Object>} Send result.
   * @private
   */
  sendMessage(connection, targetAddress, messageId, payload, targetNodeId, correlationId, timeoutMs = null) {
    if (stryMutAct_9fa48("158090")) {
      {}
    } else {
      stryCov_9fa48("158090");
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("158091")) {
          {}
        } else {
          stryCov_9fa48("158091");
          const message = stryMutAct_9fa48("158092") ? {} : (stryCov_9fa48("158092"), {
            type: RouterMessageType.SERVICE_MESSAGE,
            messageId,
            targetAddress,
            sourceAddress: ROUTER_ADDRESS.buildSourceAddress(this.nodeId),
            sourceNodeId: this.nodeId,
            payload,
            timestamp: Date.now()
          });
          const deliveryTimeoutMs = (stryMutAct_9fa48("158095") ? Number.isFinite(timeoutMs) || timeoutMs > TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158094") ? false : stryMutAct_9fa48("158093") ? true : (stryCov_9fa48("158093", "158094", "158095"), Number.isFinite(timeoutMs) && (stryMutAct_9fa48("158098") ? timeoutMs <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158097") ? timeoutMs >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158096") ? true : (stryCov_9fa48("158096", "158097", "158098"), timeoutMs > TRANSPORT_NUM.ZERO)))) ? Math.floor(timeoutMs) : this.messageTimeoutMs;
          const failBeforeSend = () => {
            if (stryMutAct_9fa48("158099")) {
              {}
            } else {
              stryCov_9fa48("158099");
              const activeConnection = stryMutAct_9fa48("158102") ? this.nodeConnections.get(targetNodeId) && connection : stryMutAct_9fa48("158101") ? false : stryMutAct_9fa48("158100") ? true : (stryCov_9fa48("158100", "158101", "158102"), this.nodeConnections.get(targetNodeId) || connection);
              const retryAfterMs = this.resolveReconnectRetryAfterMs(activeConnection);
              if (stryMutAct_9fa48("158105") ? activeConnection && activeConnection.isIncoming !== true || activeConnection.isSelfConnection !== true : stryMutAct_9fa48("158104") ? false : stryMutAct_9fa48("158103") ? true : (stryCov_9fa48("158103", "158104", "158105"), (stryMutAct_9fa48("158107") ? activeConnection || activeConnection.isIncoming !== true : stryMutAct_9fa48("158106") ? true : (stryCov_9fa48("158106", "158107"), activeConnection && (stryMutAct_9fa48("158109") ? activeConnection.isIncoming === true : stryMutAct_9fa48("158108") ? true : (stryCov_9fa48("158108", "158109"), activeConnection.isIncoming !== (stryMutAct_9fa48("158110") ? false : (stryCov_9fa48("158110"), true)))))) && (stryMutAct_9fa48("158112") ? activeConnection.isSelfConnection === true : stryMutAct_9fa48("158111") ? true : (stryCov_9fa48("158111", "158112"), activeConnection.isSelfConnection !== (stryMutAct_9fa48("158113") ? false : (stryCov_9fa48("158113"), true)))))) {
                if (stryMutAct_9fa48("158114")) {
                  {}
                } else {
                  stryCov_9fa48("158114");
                  const staleWs = activeConnection.ws;
                  this.handleConnectionClose(targetNodeId, activeConnection.connectionId);
                  try {
                    if (stryMutAct_9fa48("158115")) {
                      {}
                    } else {
                      stryCov_9fa48("158115");
                      if (stryMutAct_9fa48("158118") ? typeof staleWs?.terminate !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("158117") ? false : stryMutAct_9fa48("158116") ? true : (stryCov_9fa48("158116", "158117", "158118"), typeof (stryMutAct_9fa48("158119") ? staleWs.terminate : (stryCov_9fa48("158119"), staleWs?.terminate)) === TRANSPORT_TYPEOF.FUNCTION)) {
                        if (stryMutAct_9fa48("158120")) {
                          {}
                        } else {
                          stryCov_9fa48("158120");
                          staleWs.terminate();
                        }
                      } else if (stryMutAct_9fa48("158123") ? typeof staleWs?.close !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("158122") ? false : stryMutAct_9fa48("158121") ? true : (stryCov_9fa48("158121", "158122", "158123"), typeof (stryMutAct_9fa48("158124") ? staleWs.close : (stryCov_9fa48("158124"), staleWs?.close)) === TRANSPORT_TYPEOF.FUNCTION)) {
                        if (stryMutAct_9fa48("158125")) {
                          {}
                        } else {
                          stryCov_9fa48("158125");
                          staleWs.close();
                        }
                      }
                    }
                  } catch (_closeErr) {
                    // Best-effort stale connection reset before recovery.
                  }
                }
              }
              reject(this.buildConnectionClosedError(targetNodeId, stryMutAct_9fa48("158126") ? {} : (stryCov_9fa48("158126"), {
                beforeSend: stryMutAct_9fa48("158127") ? false : (stryCov_9fa48("158127"), true),
                retryAfterMs
              })));
            }
          };
          if (stryMutAct_9fa48("158130") ? !connection?.ws && connection.ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("158129") ? false : stryMutAct_9fa48("158128") ? true : (stryCov_9fa48("158128", "158129", "158130"), (stryMutAct_9fa48("158131") ? connection?.ws : (stryCov_9fa48("158131"), !(stryMutAct_9fa48("158132") ? connection.ws : (stryCov_9fa48("158132"), connection?.ws)))) || (stryMutAct_9fa48("158134") ? connection.ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("158133") ? false : (stryCov_9fa48("158133", "158134"), connection.ws.readyState !== WebSocket.OPEN)))) {
            if (stryMutAct_9fa48("158135")) {
              {}
            } else {
              stryCov_9fa48("158135");
              failBeforeSend();
              return;
            }
          }

          // Set up timeout
          const timeout = setTimeout(() => {
            if (stryMutAct_9fa48("158136")) {
              {}
            } else {
              stryCov_9fa48("158136");
              this.pendingMessages.delete(messageId);
              const recoveryOwner = this.quarantineConnectionAfterAckTimeout(targetNodeId, connection, messageId, targetAddress);
              resolve(this.buildDeferredDeliveryFailure(messageId, correlationId, TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT, stryMutAct_9fa48("158137") ? {} : (stryCov_9fa48("158137"), {
                errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
                retryAfterMs: this.resolveReconnectRetryAfterMs(stryMutAct_9fa48("158140") ? recoveryOwner && connection : stryMutAct_9fa48("158139") ? false : stryMutAct_9fa48("158138") ? true : (stryCov_9fa48("158138", "158139", "158140"), recoveryOwner || connection))
              })));
            }
          }, deliveryTimeoutMs);

          // Track pending message
          this.pendingMessages.set(messageId, stryMutAct_9fa48("158141") ? {} : (stryCov_9fa48("158141"), {
            messageId,
            resolve,
            reject,
            timeout,
            sentAt: Date.now(),
            targetNodeId
          }));
          try {
            if (stryMutAct_9fa48("158142")) {
              {}
            } else {
              stryCov_9fa48("158142");
              connection.ws.send(JSON.stringify(message));
            }
          } catch (_sendError) {
            if (stryMutAct_9fa48("158143")) {
              {}
            } else {
              stryCov_9fa48("158143");
              clearTimeout(timeout);
              this.pendingMessages.delete(messageId);
              failBeforeSend();
            }
          }
        }
      });
    }
  }

  /**
   * Send raw message through WebSocket.
   * @param {WebSocket} ws - WebSocket connection.
   * @param {Object} message - Message to send.
   * @private
   */
  sendRaw(ws, message) {
    if (stryMutAct_9fa48("158144")) {
      {}
    } else {
      stryCov_9fa48("158144");
      if (stryMutAct_9fa48("158147") ? ws || ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("158146") ? false : stryMutAct_9fa48("158145") ? true : (stryCov_9fa48("158145", "158146", "158147"), ws && (stryMutAct_9fa48("158149") ? ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("158148") ? true : (stryCov_9fa48("158148", "158149"), ws.readyState === WebSocket.OPEN)))) {
        if (stryMutAct_9fa48("158150")) {
          {}
        } else {
          stryCov_9fa48("158150");
          ws.send(JSON.stringify(message));
        }
      }
    }
  }

  /**
   * Check if a service is registered.
   * @param {string} address - Service address.
   * @return {boolean} True if registered.
   */
  isRegistered(address) {
    if (stryMutAct_9fa48("158151")) {
      {}
    } else {
      stryCov_9fa48("158151");
      return this.handlers.has(address);
    }
  }

  /**
   * Get all registered service addresses.
   * @return {Array<string>} Service addresses.
   */
  getRegisteredAddresses() {
    if (stryMutAct_9fa48("158152")) {
      {}
    } else {
      stryCov_9fa48("158152");
      return Array.from(this.handlers.keys());
    }
  }

  /**
   * Get connection state for a node.
   * @param {string} nodeId - Node ID.
   * @return {string|null} Connection state.
   */
  getConnectionState(nodeId) {
    if (stryMutAct_9fa48("158153")) {
      {}
    } else {
      stryCov_9fa48("158153");
      const connection = this.nodeConnections.get(nodeId);
      return connection ? connection.state : null;
    }
  }

  /**
   * Ping a node to verify it responds within a timeout.
   * @param {string} nodeId - Node ID to ping.
   * @param {number} timeoutMs - Optional timeout override.
   * @return {Promise<boolean>} True if pong received before timeout.
   */
  async pingNode(nodeId, timeoutMs = null) {
    if (stryMutAct_9fa48("158154")) {
      {}
    } else {
      stryCov_9fa48("158154");
      const connection = this.nodeConnections.get(nodeId);
      if (stryMutAct_9fa48("158157") ? (!connection || connection.state !== ConnectionState.CONNECTED) && !connection.ws : stryMutAct_9fa48("158156") ? false : stryMutAct_9fa48("158155") ? true : (stryCov_9fa48("158155", "158156", "158157"), (stryMutAct_9fa48("158159") ? !connection && connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("158158") ? false : (stryCov_9fa48("158158", "158159"), (stryMutAct_9fa48("158160") ? connection : (stryCov_9fa48("158160"), !connection)) || (stryMutAct_9fa48("158162") ? connection.state === ConnectionState.CONNECTED : stryMutAct_9fa48("158161") ? false : (stryCov_9fa48("158161", "158162"), connection.state !== ConnectionState.CONNECTED)))) || (stryMutAct_9fa48("158163") ? connection.ws : (stryCov_9fa48("158163"), !connection.ws)))) {
        if (stryMutAct_9fa48("158164")) {
          {}
        } else {
          stryCov_9fa48("158164");
          return stryMutAct_9fa48("158165") ? true : (stryCov_9fa48("158165"), false);
        }
      }
      const pingId = uuidv4();
      const timeout = stryMutAct_9fa48("158166") ? timeoutMs && this.pingTimeoutMs : (stryCov_9fa48("158166"), timeoutMs ?? this.pingTimeoutMs);
      return new Promise(resolve => {
        if (stryMutAct_9fa48("158167")) {
          {}
        } else {
          stryCov_9fa48("158167");
          const timer = setTimeout(() => {
            if (stryMutAct_9fa48("158168")) {
              {}
            } else {
              stryCov_9fa48("158168");
              this.pendingPings.delete(pingId);
              resolve(stryMutAct_9fa48("158169") ? true : (stryCov_9fa48("158169"), false));
            }
          }, timeout);
          this.pendingPings.set(pingId, stryMutAct_9fa48("158170") ? {} : (stryCov_9fa48("158170"), {
            resolve,
            timeout: timer
          }));
          this.sendRaw(connection.ws, stryMutAct_9fa48("158171") ? {} : (stryCov_9fa48("158171"), {
            type: RouterMessageType.PING,
            pingId,
            timestamp: Date.now()
          }));
        }
      });
    }
  }

  /**
   * Get all connected node IDs.
   * @return {Array<string>} Connected node IDs.
   */
  getConnectedNodes() {
    if (stryMutAct_9fa48("158172")) {
      {}
    } else {
      stryCov_9fa48("158172");
      const connected = stryMutAct_9fa48("158173") ? ["Stryker was here"] : (stryCov_9fa48("158173"), []);
      for (const [_nodeId, connection] of this.nodeConnections) {
        if (stryMutAct_9fa48("158174")) {
          {}
        } else {
          stryCov_9fa48("158174");
          if (stryMutAct_9fa48("158177") ? connection.state === ConnectionState.CONNECTED || connection.nodeId : stryMutAct_9fa48("158176") ? false : stryMutAct_9fa48("158175") ? true : (stryCov_9fa48("158175", "158176", "158177"), (stryMutAct_9fa48("158179") ? connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("158178") ? true : (stryCov_9fa48("158178", "158179"), connection.state === ConnectionState.CONNECTED)) && connection.nodeId)) {
            if (stryMutAct_9fa48("158180")) {
              {}
            } else {
              stryCov_9fa48("158180");
              connected.push(connection.nodeId);
            }
          }
        }
      }
      return connected;
    }
  }

  /**
   * Check if self-connection is established.
   * @return {boolean} True if self-connection exists and is connected.
   */
  hasSelfConnection() {
    if (stryMutAct_9fa48("158181")) {
      {}
    } else {
      stryCov_9fa48("158181");
      const connection = this.nodeConnections.get(this.nodeId);
      return stryMutAct_9fa48("158184") ? connection && connection.isSelfConnection || connection.state === ConnectionState.CONNECTED : stryMutAct_9fa48("158183") ? false : stryMutAct_9fa48("158182") ? true : (stryCov_9fa48("158182", "158183", "158184"), (stryMutAct_9fa48("158186") ? connection || connection.isSelfConnection : stryMutAct_9fa48("158185") ? true : (stryCov_9fa48("158185", "158186"), connection && connection.isSelfConnection)) && (stryMutAct_9fa48("158188") ? connection.state !== ConnectionState.CONNECTED : stryMutAct_9fa48("158187") ? true : (stryCov_9fa48("158187", "158188"), connection.state === ConnectionState.CONNECTED)));
    }
  }

  /**
   * Get router statistics.
   * @return {Object} Router stats.
   */
  getStats() {
    if (stryMutAct_9fa48("158189")) {
      {}
    } else {
      stryCov_9fa48("158189");
      const connectionStats = {};
      for (const [nodeId, connection] of this.nodeConnections) {
        if (stryMutAct_9fa48("158190")) {
          {}
        } else {
          stryCov_9fa48("158190");
          connectionStats[nodeId] = stryMutAct_9fa48("158191") ? {} : (stryCov_9fa48("158191"), {
            state: connection.state,
            isIncoming: connection.isIncoming,
            reconnectAttempts: connection.reconnectAttempts,
            ackTimeoutStreak: stryMutAct_9fa48("158194") ? connection.ackTimeoutStreak && TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158193") ? false : stryMutAct_9fa48("158192") ? true : (stryCov_9fa48("158192", "158193", "158194"), connection.ackTimeoutStreak || TRANSPORT_NUM.ZERO)
          });
        }
      }
      const outboundQueueStats = {};
      for (const [nodeId, queue] of this.outboundQueues) {
        if (stryMutAct_9fa48("158195")) {
          {}
        } else {
          stryCov_9fa48("158195");
          outboundQueueStats[nodeId] = stryMutAct_9fa48("158196") ? {} : (stryCov_9fa48("158196"), {
            inFlight: queue.inFlight,
            pending: queue.pending.length,
            pendingCritical: countPendingByPriority(queue, OutboundDeliveryPriority.CRITICAL),
            pendingBackground: countPendingByPriority(queue, OutboundDeliveryPriority.BACKGROUND),
            criticalReserve: queue.criticalReserve,
            backgroundPendingLimit: resolveBackgroundPendingLimit(queue),
            maxConcurrent: queue.maxConcurrent,
            maxPending: queue.maxPending,
            queueWait: buildQueueWaitSummary(queue)
          });
        }
      }
      return stryMutAct_9fa48("158197") ? {} : (stryCov_9fa48("158197"), {
        routerId: this.routerId,
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        advertisedAddress: this.advertisedAddress,
        initialized: this.initialized,
        messageCount: this.messageCount,
        pendingMessages: this.pendingMessages.size,
        pendingResponses: this.pendingResponses.size,
        serviceResponseDispositions: this.getServiceResponseDispositionCounts(),
        handlers: this.handlers.size,
        connections: connectionStats,
        connectedNodes: this.getConnectedNodes().length,
        outboundQueues: outboundQueueStats
      });
    }
  }

  /**
   * Summarize current outbound queue pressure across all peer queues.
   * @return {Object} Pressure summary.
   */
  getOutboundPressureSummary() {
    if (stryMutAct_9fa48("158198")) {
      {}
    } else {
      stryCov_9fa48("158198");
      let saturatedNodeCount = TRANSPORT_NUM.ZERO;
      let totalPending = TRANSPORT_NUM.ZERO;
      let maxPendingUtilization = TRANSPORT_NUM.ZERO;
      for (const queue of this.outboundQueues.values()) {
        if (stryMutAct_9fa48("158199")) {
          {}
        } else {
          stryCov_9fa48("158199");
          const pending = queue.pending.length;
          const pendingBackground = countPendingByPriority(queue, OutboundDeliveryPriority.BACKGROUND);
          const backgroundPendingLimit = resolveBackgroundPendingLimit(queue);
          const backpressured = stryMutAct_9fa48("158202") ? pending >= queue.maxPending && pending > TRANSPORT_NUM.ZERO && pendingBackground >= backgroundPendingLimit : stryMutAct_9fa48("158201") ? false : stryMutAct_9fa48("158200") ? true : (stryCov_9fa48("158200", "158201", "158202"), (stryMutAct_9fa48("158205") ? pending < queue.maxPending : stryMutAct_9fa48("158204") ? pending > queue.maxPending : stryMutAct_9fa48("158203") ? false : (stryCov_9fa48("158203", "158204", "158205"), pending >= queue.maxPending)) || (stryMutAct_9fa48("158207") ? pending > TRANSPORT_NUM.ZERO || pendingBackground >= backgroundPendingLimit : stryMutAct_9fa48("158206") ? false : (stryCov_9fa48("158206", "158207"), (stryMutAct_9fa48("158210") ? pending <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158209") ? pending >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158208") ? true : (stryCov_9fa48("158208", "158209", "158210"), pending > TRANSPORT_NUM.ZERO)) && (stryMutAct_9fa48("158213") ? pendingBackground < backgroundPendingLimit : stryMutAct_9fa48("158212") ? pendingBackground > backgroundPendingLimit : stryMutAct_9fa48("158211") ? true : (stryCov_9fa48("158211", "158212", "158213"), pendingBackground >= backgroundPendingLimit)))));
          if (stryMutAct_9fa48("158215") ? false : stryMutAct_9fa48("158214") ? true : (stryCov_9fa48("158214", "158215"), backpressured)) {
            if (stryMutAct_9fa48("158216")) {
              {}
            } else {
              stryCov_9fa48("158216");
              stryMutAct_9fa48("158217") ? saturatedNodeCount -= TRANSPORT_NUM.ONE : (stryCov_9fa48("158217"), saturatedNodeCount += TRANSPORT_NUM.ONE);
            }
          }
          stryMutAct_9fa48("158218") ? totalPending -= pending : (stryCov_9fa48("158218"), totalPending += pending);
          if (stryMutAct_9fa48("158222") ? queue.maxPending <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158221") ? queue.maxPending >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158220") ? false : stryMutAct_9fa48("158219") ? true : (stryCov_9fa48("158219", "158220", "158221", "158222"), queue.maxPending > TRANSPORT_NUM.ZERO)) {
            if (stryMutAct_9fa48("158223")) {
              {}
            } else {
              stryCov_9fa48("158223");
              maxPendingUtilization = stryMutAct_9fa48("158224") ? Math.min(maxPendingUtilization, pending / queue.maxPending) : (stryCov_9fa48("158224"), Math.max(maxPendingUtilization, stryMutAct_9fa48("158225") ? pending * queue.maxPending : (stryCov_9fa48("158225"), pending / queue.maxPending)));
            }
          }
        }
      }
      return Object.freeze(stryMutAct_9fa48("158226") ? {} : (stryCov_9fa48("158226"), {
        backpressured: stryMutAct_9fa48("158230") ? saturatedNodeCount <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158229") ? saturatedNodeCount >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158228") ? false : stryMutAct_9fa48("158227") ? true : (stryCov_9fa48("158227", "158228", "158229", "158230"), saturatedNodeCount > TRANSPORT_NUM.ZERO),
        saturatedNodeCount,
        totalPending,
        maxPendingUtilization
      }));
    }
  }

  /**
   * Shutdown the message router.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("158231")) {
      {}
    } else {
      stryCov_9fa48("158231");
      this.logger.debug(ROUTER_LOG_MSG.SHUTTING_DOWN, stryMutAct_9fa48("158232") ? {} : (stryCov_9fa48("158232"), {
        routerId: this.routerId
      }));
      this.isShuttingDown = stryMutAct_9fa48("158233") ? false : (stryCov_9fa48("158233"), true);

      // Clear pending messages first to avoid timeout callbacks
      for (const [, pending] of this.pendingMessages) {
        if (stryMutAct_9fa48("158234")) {
          {}
        } else {
          stryCov_9fa48("158234");
          clearTimeout(pending.timeout);
          pending.resolve(stryMutAct_9fa48("158235") ? {} : (stryCov_9fa48("158235"), {
            messageId: pending.messageId,
            acknowledged: stryMutAct_9fa48("158236") ? true : (stryCov_9fa48("158236"), false),
            error: ROUTER_ERROR_MSG.SHUTDOWN,
            shutdown: stryMutAct_9fa48("158237") ? false : (stryCov_9fa48("158237"), true)
          }));
        }
      }
      this.pendingMessages.clear();
      const shutdownError = new Error(ROUTER_ERROR_MSG.SHUTDOWN);
      for (const [, pending] of this.pendingResponses) {
        if (stryMutAct_9fa48("158238")) {
          {}
        } else {
          stryCov_9fa48("158238");
          clearTimeout(pending.timeoutId);
          pending.reject(shutdownError);
        }
      }
      this.pendingResponses.clear();
      this.retiredPendingResponses.clear();
      this.serviceResponseDispositionCounts.clear();
      for (const [, pending] of this.pendingPings) {
        if (stryMutAct_9fa48("158239")) {
          {}
        } else {
          stryCov_9fa48("158239");
          clearTimeout(pending.timeout);
          pending.resolve(stryMutAct_9fa48("158240") ? true : (stryCov_9fa48("158240"), false));
        }
      }
      this.pendingPings.clear();
      for (const [nodeId] of this.outboundQueues) {
        if (stryMutAct_9fa48("158241")) {
          {}
        } else {
          stryCov_9fa48("158241");
          this.failOutboundQueueGracefully(nodeId, shutdownError);
        }
      }
      this.outboundQueues.clear();

      // Close all connections and wait for them to close
      const closePromises = stryMutAct_9fa48("158242") ? ["Stryker was here"] : (stryCov_9fa48("158242"), []);
      for (const [, connection] of this.nodeConnections) {
        if (stryMutAct_9fa48("158243")) {
          {}
        } else {
          stryCov_9fa48("158243");
          if (stryMutAct_9fa48("158245") ? false : stryMutAct_9fa48("158244") ? true : (stryCov_9fa48("158244", "158245"), connection.pingInterval)) {
            if (stryMutAct_9fa48("158246")) {
              {}
            } else {
              stryCov_9fa48("158246");
              clearInterval(connection.pingInterval);
              connection.pingInterval = null;
            }
          }
          if (stryMutAct_9fa48("158248") ? false : stryMutAct_9fa48("158247") ? true : (stryCov_9fa48("158247", "158248"), connection.reconnectTimeout)) {
            if (stryMutAct_9fa48("158249")) {
              {}
            } else {
              stryCov_9fa48("158249");
              clearTimeout(connection.reconnectTimeout);
              connection.reconnectTimeout = null;
            }
          }
          if (stryMutAct_9fa48("158251") ? false : stryMutAct_9fa48("158250") ? true : (stryCov_9fa48("158250", "158251"), connection.ws)) {
            if (stryMutAct_9fa48("158252")) {
              {}
            } else {
              stryCov_9fa48("158252");
              const ws = connection.ws;
              if (stryMutAct_9fa48("158255") ? ws.readyState === WebSocket.OPEN && ws.readyState === WebSocket.CONNECTING : stryMutAct_9fa48("158254") ? false : stryMutAct_9fa48("158253") ? true : (stryCov_9fa48("158253", "158254", "158255"), (stryMutAct_9fa48("158257") ? ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("158256") ? false : (stryCov_9fa48("158256", "158257"), ws.readyState === WebSocket.OPEN)) || (stryMutAct_9fa48("158259") ? ws.readyState !== WebSocket.CONNECTING : stryMutAct_9fa48("158258") ? false : (stryCov_9fa48("158258", "158259"), ws.readyState === WebSocket.CONNECTING)))) {
                if (stryMutAct_9fa48("158260")) {
                  {}
                } else {
                  stryCov_9fa48("158260");
                  closePromises.push(new Promise(resolve => {
                    if (stryMutAct_9fa48("158261")) {
                      {}
                    } else {
                      stryCov_9fa48("158261");
                      ws.once(TRANSPORT_EVENT.CLOSE, resolve);
                      ws.terminate(); // Force close instead of graceful close
                    }
                  }));
                }
              }
            }
          }
        }
      }

      // Wait for all connections to close (with timeout that gets cleared)
      if (stryMutAct_9fa48("158265") ? closePromises.length <= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158264") ? closePromises.length >= TRANSPORT_NUM.ZERO : stryMutAct_9fa48("158263") ? false : stryMutAct_9fa48("158262") ? true : (stryCov_9fa48("158262", "158263", "158264", "158265"), closePromises.length > TRANSPORT_NUM.ZERO)) {
        if (stryMutAct_9fa48("158266")) {
          {}
        } else {
          stryCov_9fa48("158266");
          let timeoutId;
          await Promise.race(stryMutAct_9fa48("158267") ? [] : (stryCov_9fa48("158267"), [Promise.all(closePromises), new Promise(resolve => {
            if (stryMutAct_9fa48("158268")) {
              {}
            } else {
              stryCov_9fa48("158268");
              timeoutId = setTimeout(resolve, TRANSPORT_DEFAULT.SHUTDOWN_WAIT_MS);
            }
          })])).finally(() => {
            if (stryMutAct_9fa48("158269")) {
              {}
            } else {
              stryCov_9fa48("158269");
              clearTimeout(timeoutId);
            }
          });
        }
      }

      // Close server and all its client connections
      if (stryMutAct_9fa48("158271") ? false : stryMutAct_9fa48("158270") ? true : (stryCov_9fa48("158270", "158271"), this.server)) {
        if (stryMutAct_9fa48("158272")) {
          {}
        } else {
          stryCov_9fa48("158272");
          // In-process server: just terminate tracked clients and unregister.
          if (stryMutAct_9fa48("158274") ? false : stryMutAct_9fa48("158273") ? true : (stryCov_9fa48("158273", "158274"), this.inProcessTransport)) {
            if (stryMutAct_9fa48("158275")) {
              {}
            } else {
              stryCov_9fa48("158275");
              for (const client of stryMutAct_9fa48("158278") ? this.server.clients && [] : stryMutAct_9fa48("158277") ? false : stryMutAct_9fa48("158276") ? true : (stryCov_9fa48("158276", "158277", "158278"), this.server.clients || (stryMutAct_9fa48("158279") ? ["Stryker was here"] : (stryCov_9fa48("158279"), [])))) {
                if (stryMutAct_9fa48("158280")) {
                  {}
                } else {
                  stryCov_9fa48("158280");
                  client.terminate();
                }
              }
              await new Promise(stryMutAct_9fa48("158281") ? () => undefined : (stryCov_9fa48("158281"), resolve => this.server.close(resolve)));
              this.server = null;
              this.inProcessTransport = stryMutAct_9fa48("158282") ? true : (stryCov_9fa48("158282"), false);
            }
          } else {
            if (stryMutAct_9fa48("158283")) {
              {}
            } else {
              stryCov_9fa48("158283");
              const wsServer = this.server;
              const httpServer = stryMutAct_9fa48("158286") ? wsServer._server && null : stryMutAct_9fa48("158285") ? false : stryMutAct_9fa48("158284") ? true : (stryCov_9fa48("158284", "158285", "158286"), wsServer._server || null);

              // Terminate all clients connected to the server
              for (const client of wsServer.clients) {
                if (stryMutAct_9fa48("158287")) {
                  {}
                } else {
                  stryCov_9fa48("158287");
                  client.terminate();
                }
              }
              await new Promise(resolve => {
                if (stryMutAct_9fa48("158288")) {
                  {}
                } else {
                  stryCov_9fa48("158288");
                  wsServer.close(stryMutAct_9fa48("158289") ? () => undefined : (stryCov_9fa48("158289"), () => resolve()));
                }
              });
              if (stryMutAct_9fa48("158291") ? false : stryMutAct_9fa48("158290") ? true : (stryCov_9fa48("158290", "158291"), httpServer)) {
                if (stryMutAct_9fa48("158292")) {
                  {}
                } else {
                  stryCov_9fa48("158292");
                  if (stryMutAct_9fa48("158295") ? typeof httpServer.closeAllConnections !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("158294") ? false : stryMutAct_9fa48("158293") ? true : (stryCov_9fa48("158293", "158294", "158295"), typeof httpServer.closeAllConnections === TRANSPORT_TYPEOF.FUNCTION)) {
                    if (stryMutAct_9fa48("158296")) {
                      {}
                    } else {
                      stryCov_9fa48("158296");
                      httpServer.closeAllConnections();
                    }
                  }
                  await new Promise(resolve => {
                    if (stryMutAct_9fa48("158297")) {
                      {}
                    } else {
                      stryCov_9fa48("158297");
                      httpServer.close(stryMutAct_9fa48("158298") ? () => undefined : (stryCov_9fa48("158298"), () => resolve()));
                    }
                  });
                  if (stryMutAct_9fa48("158301") ? typeof httpServer.unref !== TRANSPORT_TYPEOF.FUNCTION : stryMutAct_9fa48("158300") ? false : stryMutAct_9fa48("158299") ? true : (stryCov_9fa48("158299", "158300", "158301"), typeof httpServer.unref === TRANSPORT_TYPEOF.FUNCTION)) {
                    if (stryMutAct_9fa48("158302")) {
                      {}
                    } else {
                      stryCov_9fa48("158302");
                      httpServer.unref();
                    }
                  }
                }
              }
              this.server = null;
            }
          }
        }
      }
      this.nodeConnections.clear();
      this.handlers.clear();
      this.initialized = stryMutAct_9fa48("158303") ? true : (stryCov_9fa48("158303"), false);
      this.emit(TRANSPORT_EVENT.SHUTDOWN, stryMutAct_9fa48("158304") ? {} : (stryCov_9fa48("158304"), {
        routerId: this.routerId
      }));
    }
  }
}
export { MessageRouter, ConnectionState, RouterMessageType };