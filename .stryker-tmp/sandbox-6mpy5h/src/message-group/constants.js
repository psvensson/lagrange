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
import { COLUMN, NUM, TABLES, TIME_MS } from '../constants/index.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { LATENCY_TOPOLOGY_MESSAGE_TYPE } from '../topology/latency-topology-constants.js';
const MESSAGE_STATUS = Object.freeze(stryMutAct_9fa48("85350") ? {} : (stryCov_9fa48("85350"), {
  PENDING: stryMutAct_9fa48("85351") ? "" : (stryCov_9fa48("85351"), 'pending'),
  DELIVERED: stryMutAct_9fa48("85352") ? "" : (stryCov_9fa48("85352"), 'delivered'),
  ACKNOWLEDGED: stryMutAct_9fa48("85353") ? "" : (stryCov_9fa48("85353"), 'acknowledged'),
  FAILED: stryMutAct_9fa48("85354") ? "" : (stryCov_9fa48("85354"), 'failed')
}));
const MESSAGE_GROUP_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("85355") ? {} : (stryCov_9fa48("85355"), {
  NAME: stryMutAct_9fa48("85356") ? "" : (stryCov_9fa48("85356"), 'message-group')
}));
const MESSAGE_GROUP_METADATA_TABLE = Object.freeze(stryMutAct_9fa48("85357") ? {} : (stryCov_9fa48("85357"), {
  PARTITIONS: TABLES.PARTITIONS,
  SERVICES: TABLES.SERVICES,
  NODES: TABLES.NODES
}));
const MESSAGE_GROUP_METADATA_SQL = Object.freeze(stryMutAct_9fa48("85358") ? {} : (stryCov_9fa48("85358"), {
  SELECT_PARTITION_BY_ID: stryMutAct_9fa48("85359") ? `` : (stryCov_9fa48("85359"), `SELECT * FROM ${TABLES.PARTITIONS} WHERE ${COLUMN.PARTITION_ID} = ?`),
  SELECT_SERVICE_BY_ID: stryMutAct_9fa48("85360") ? `` : (stryCov_9fa48("85360"), `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.SERVICE_ID} = ?`),
  SELECT_NODE_BY_ID: stryMutAct_9fa48("85361") ? `` : (stryCov_9fa48("85361"), `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`)
}));
const MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("85362") ? {} : (stryCov_9fa48("85362"), {
  LATENCY_CDC_PROPAGATION: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION,
  LATENCY_CDC_PROPAGATION_BATCH: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH
}));
const MESSAGE_GROUP_APPLICATION_STATUS = Object.freeze(stryMutAct_9fa48("85363") ? {} : (stryCov_9fa48("85363"), {
  DUPLICATE: stryMutAct_9fa48("85364") ? "" : (stryCov_9fa48("85364"), 'duplicate'),
  RECEIVED: stryMutAct_9fa48("85365") ? "" : (stryCov_9fa48("85365"), 'received'),
  LATENCY_CDC_PROPAGATED: stryMutAct_9fa48("85366") ? "" : (stryCov_9fa48("85366"), 'latency_cdc_propagated'),
  LATENCY_CDC_BATCH_PROPAGATED: stryMutAct_9fa48("85367") ? "" : (stryCov_9fa48("85367"), 'latency_cdc_batch_propagated')
}));
const MESSAGE_GROUP_APPLICATION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("85368") ? {} : (stryCov_9fa48("85368"), {
  INVALID_LATENCY_CDC_PAYLOAD: stryMutAct_9fa48("85369") ? "" : (stryCov_9fa48("85369"), 'Invalid latency CDC propagation payload'),
  INVALID_LATENCY_CDC_BATCH_PAYLOAD: stryMutAct_9fa48("85370") ? "" : (stryCov_9fa48("85370"), 'Invalid latency CDC batch propagation payload')
}));
const MESSAGE_GROUP_CDC_ERROR_MSG = Object.freeze(stryMutAct_9fa48("85371") ? {} : (stryCov_9fa48("85371"), {
  FORWARD_LEADER_UNKNOWN: stryMutAct_9fa48("85372") ? "" : (stryCov_9fa48("85372"), 'Cannot forward CDC event because message-group leader is unknown'),
  FORWARD_LEADER_ADDRESS_UNRESOLVED: stryMutAct_9fa48("85373") ? "" : (stryCov_9fa48("85373"), 'Cannot forward CDC event because message-group leader address is unavailable'),
  FORWARD_DELIVERY_REJECTED: stryMutAct_9fa48("85374") ? "" : (stryCov_9fa48("85374"), 'CDC forward to message-group leader was not acknowledged'),
  FORWARD_RETRY_EXHAUSTED: stryMutAct_9fa48("85375") ? "" : (stryCov_9fa48("85375"), 'CDC forward retry budget exhausted'),
  RAFT_PROPOSE_FAILED: stryMutAct_9fa48("85376") ? "" : (stryCov_9fa48("85376"), 'Raft CDC replication failed')
}));
const MESSAGE_GROUP_SERVICE_DEFAULT = Object.freeze(stryMutAct_9fa48("85377") ? {} : (stryCov_9fa48("85377"), {
  DELIVERY_TIMEOUT_MS: stryMutAct_9fa48("85378") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("85378"), TIME_MS.SECOND * NUM.FIVE),
  RETRY_MAX_ATTEMPTS: NUM.THREE,
  RETRY_INITIAL_DELAY_MS: NUM.HUNDRED,
  RETRY_BACKOFF_MULTIPLIER: NUM.TWO,
  RETRY_MAX_DELAY_MS: NUM.TEN_THOUSAND,
  RETRY_JITTER_FACTOR: stryMutAct_9fa48("85379") ? NUM.ONE * NUM.TEN : (stryCov_9fa48("85379"), NUM.ONE / NUM.TEN)
}));
const MESSAGE_GROUP_SERVICE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("85380") ? {} : (stryCov_9fa48("85380"), {
  MISSING_GROUP_ID: stryMutAct_9fa48("85381") ? "" : (stryCov_9fa48("85381"), 'MessageGroupService requires groupId'),
  MISSING_REPLICA_ID: stryMutAct_9fa48("85382") ? "" : (stryCov_9fa48("85382"), 'MessageGroupService requires replicaId'),
  MISSING_TRANSPORT: stryMutAct_9fa48("85383") ? "" : (stryCov_9fa48("85383"), 'MessageGroupService requires transport - WebSocket transport is mandatory'),
  INVALID_TRANSPORT: stryMutAct_9fa48("85384") ? "" : (stryCov_9fa48("85384"), 'MessageGroupService requires WebSocket-based transport (MessageRouter)'),
  MISSING_REBALANCER_SET_COORDINATOR: stryMutAct_9fa48("85385") ? "" : (stryCov_9fa48("85385"), 'MessageGroupService rebalancer must implement setRebalanceCoordinator')
}));
const MESSAGE_GROUP_SERVICE_LOG_MSG = Object.freeze(stryMutAct_9fa48("85386") ? {} : (stryCov_9fa48("85386"), {
  CDC_RESUBSCRIBE_ON_LEADER: stryMutAct_9fa48("85387") ? "" : (stryCov_9fa48("85387"), 'Re-subscribing to CDC tables on leadership gain'),
  CDC_RESUBSCRIBE_ON_LEADER_COMPLETE: stryMutAct_9fa48("85388") ? "" : (stryCov_9fa48("85388"), 'CDC re-subscription on leadership gain complete')
}));
const MESSAGE_GROUP_OPERATION_LEDGER = Object.freeze(stryMutAct_9fa48("85389") ? {} : (stryCov_9fa48("85389"), {
  DEFAULT_OPTIONS: Object.freeze({}),
  DEFAULT_VOTED_FOR: null,
  DEFAULT_MAX_ENTRIES: 512
}));
const MESSAGE_GROUP_OPERATION_LEDGER_NOW = stryMutAct_9fa48("85390") ? () => undefined : (stryCov_9fa48("85390"), (() => {
  const MESSAGE_GROUP_OPERATION_LEDGER_NOW = () => Date.now();
  return MESSAGE_GROUP_OPERATION_LEDGER_NOW;
})());
export { MESSAGE_GROUP_APPLICATION_ERROR_MSG, MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE, MESSAGE_GROUP_APPLICATION_STATUS, MESSAGE_GROUP_CDC_ERROR_MSG, MESSAGE_GROUP_OPERATION_LEDGER, MESSAGE_GROUP_OPERATION_LEDGER_NOW, MESSAGE_GROUP_SERVICE_DEFAULT, MESSAGE_GROUP_SERVICE_ERROR_MSG, MESSAGE_GROUP_SERVICE_LOG_MSG, MESSAGE_GROUP_SUBSYSTEM, MESSAGE_STATUS, MESSAGE_GROUP_METADATA_TABLE, MESSAGE_GROUP_METADATA_SQL, RAFT_ROLE };