import {COLUMN, NUM, TABLES, TIME_MS} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {LATENCY_TOPOLOGY_MESSAGE_TYPE} from '../topology/latency-topology-constants.js';

const MESSAGE_STATUS = Object.freeze({
  PENDING: 'pending',
  DELIVERED: 'delivered',
  ACKNOWLEDGED: 'acknowledged',
  FAILED: 'failed',
});

const MESSAGE_GROUP_SUBSYSTEM = Object.freeze({
  NAME: 'message-group',
});

const MESSAGE_GROUP_METADATA_TABLE = Object.freeze({
  PARTITIONS: TABLES.PARTITIONS,
  SERVICES: TABLES.SERVICES,
  NODES: TABLES.NODES,
});

const MESSAGE_GROUP_METADATA_SQL = Object.freeze({
  SELECT_PARTITION_BY_ID:
    `SELECT * FROM ${TABLES.PARTITIONS} WHERE ${COLUMN.PARTITION_ID} = ?`,
  SELECT_SERVICE_BY_ID:
    `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.SERVICE_ID} = ?`,
  SELECT_NODE_BY_ID:
    `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`,
});

const MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE = Object.freeze({
  LATENCY_CDC_PROPAGATION: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION,
  LATENCY_CDC_PROPAGATION_BATCH:
    LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH,
});

const MESSAGE_GROUP_APPLICATION_STATUS = Object.freeze({
  DUPLICATE: 'duplicate',
  RECEIVED: 'received',
  LATENCY_CDC_PROPAGATED: 'latency_cdc_propagated',
  LATENCY_CDC_BATCH_PROPAGATED: 'latency_cdc_batch_propagated',
});

const MESSAGE_GROUP_APPLICATION_ERROR_MSG = Object.freeze({
  INVALID_LATENCY_CDC_PAYLOAD: 'Invalid latency CDC propagation payload',
  INVALID_LATENCY_CDC_BATCH_PAYLOAD:
    'Invalid latency CDC batch propagation payload',
});

const MESSAGE_GROUP_CDC_ERROR_MSG = Object.freeze({
  FORWARD_LEADER_UNKNOWN:
    'Cannot forward CDC event because message-group leader is unknown',
  FORWARD_LEADER_ADDRESS_UNRESOLVED:
    'Cannot forward CDC event because message-group leader address is unavailable',
  FORWARD_DELIVERY_REJECTED:
    'CDC forward to message-group leader was not acknowledged',
  FORWARD_RETRY_EXHAUSTED:
    'CDC forward retry budget exhausted',
  RAFT_PROPOSE_FAILED: 'Raft CDC replication failed',
});

const MESSAGE_GROUP_SERVICE_DEFAULT = Object.freeze({
  DELIVERY_TIMEOUT_MS: TIME_MS.SECOND * NUM.FIVE,
  RETRY_MAX_ATTEMPTS: NUM.THREE,
  RETRY_INITIAL_DELAY_MS: NUM.HUNDRED,
  RETRY_BACKOFF_MULTIPLIER: 2,
  RETRY_MAX_DELAY_MS: NUM.TEN_THOUSAND,
  RETRY_JITTER_FACTOR: 1 / NUM.TEN,
});

const MESSAGE_GROUP_SERVICE_ERROR_MSG = Object.freeze({
  MISSING_GROUP_ID: 'MessageGroupService requires groupId',
  MISSING_REPLICA_ID: 'MessageGroupService requires replicaId',
  MISSING_TRANSPORT:
    'MessageGroupService requires transport - WebSocket transport is mandatory',
  INVALID_TRANSPORT:
    'MessageGroupService requires WebSocket-based transport (MessageRouter)',
  SINGLE_REPLICA_RAFT_OWNER_REQUIRED:
    'MessageGroupService single-replica leadership requires raft.change(...)',
  MISSING_REBALANCER_SET_COORDINATOR:
    'MessageGroupService rebalancer must implement setRebalanceCoordinator',
});

const MESSAGE_GROUP_SERVICE_LOG_MSG = Object.freeze({
  CDC_RESUBSCRIBE_ON_LEADER:
    'Re-subscribing to CDC tables on leadership gain',
  CDC_RESUBSCRIBE_ON_LEADER_COMPLETE:
    'CDC re-subscription on leadership gain complete',
});

const MESSAGE_GROUP_OPERATION_LEDGER = Object.freeze({
  DEFAULT_OPTIONS: Object.freeze({}),
  DEFAULT_VOTED_FOR: null,
  DEFAULT_MAX_ENTRIES: 512,
});

const MESSAGE_GROUP_OPERATION_LEDGER_NOW = () => Date.now();

export {
  MESSAGE_GROUP_APPLICATION_ERROR_MSG,
  MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
  MESSAGE_GROUP_APPLICATION_STATUS,
  MESSAGE_GROUP_CDC_ERROR_MSG,
  MESSAGE_GROUP_OPERATION_LEDGER,
  MESSAGE_GROUP_OPERATION_LEDGER_NOW,
  MESSAGE_GROUP_SERVICE_DEFAULT,
  MESSAGE_GROUP_SERVICE_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_LOG_MSG,
  MESSAGE_GROUP_SUBSYSTEM,
  MESSAGE_STATUS,
  MESSAGE_GROUP_METADATA_TABLE,
  MESSAGE_GROUP_METADATA_SQL,
  RAFT_ROLE,
};
