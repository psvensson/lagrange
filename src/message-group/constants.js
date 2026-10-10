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
  COMPLETION_HANDLER_ALREADY_REGISTERED:
    'Message-group application completion handler already registered',
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
  PROPOSE_TIMEOUT: 'Message-group consensus proposal timed out',
  PROPOSE_REFUSED: 'Message-group consensus refused the proposal',
});

// The committed command types of a message group's consensus log (design R3
// section 1.1): every proposer asks the committed-command admission owner
// first, and the committed apply dispatches on exactly these.
const MESSAGE_GROUP_COMMAND_TYPE = Object.freeze({
  MESSAGE: 'MESSAGE',
  CDC: 'CDC',
  CDC_BATCH: 'CDC_BATCH',
  ACK: 'ACK',
});

// Why the committed-command admission owner refused a command before it was
// proposed: a refused command reaches no log.
const MESSAGE_GROUP_COMMAND_REFUSAL = Object.freeze({
  UNKNOWN_TYPE: 'message_group_command_type_unknown',
});

// How one attempt of a leader-routed proposal reached the group (design R3
// section 1.7): proposed through this replica's own port as the leader, or
// forwarded to the leader over the application forward.
const MESSAGE_GROUP_PROPOSAL_ROUTE = Object.freeze({
  PROPOSE: 'propose',
  FORWARD: 'forward',
});

const MESSAGE_GROUP_CONSENSUS_STARTUP_OUTCOME = Object.freeze({
  // The replica's consensus port refused it at initialization (it opened its
  // group held, or a lone replica's campaign was refused), so initialization
  // fails closed with this outcome after releasing what it acquired.
  CONSENSUS_INIT_REFUSED: 'message_group_consensus_init_refused',
});

const MESSAGE_GROUP_SERVICE_DEFAULT = Object.freeze({
  // A replica's consensus state is durable; an in-memory database would
  // lose its term, vote and configuration on restart, so it is refused.
  MEMORY_DB_PATH: ':memory:',
  // ends-on: n/a clamp (the ceiling the per-attempt CDC propose timeout is derived from)
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
  MISSING_DB_PATH:
    'MessageGroupService requires dbPath - its consensus state is durable',
  IN_MEMORY_DB_PATH_REFUSED:
    'MessageGroupService refuses an in-memory dbPath - its consensus state ' +
    'must survive a restart',
  CONSENSUS_INIT_REFUSED:
    'MessageGroupService consensus refused to initialize',
  UNKNOWN_COMMITTED_COMMAND:
    'MessageGroupService cannot apply a committed command of unknown type',
  COMMAND_TYPE_REFUSED:
    'MessageGroupService refuses to propose a command of unknown type',
  MISSING_REBALANCER_SET_COORDINATOR:
    'MessageGroupService rebalancer must implement setRebalanceCoordinator',
});

const MESSAGE_GROUP_SERVICE_LOG_MSG = Object.freeze({
  CDC_RESUBSCRIBE_ON_LEADER:
    'Re-subscribing to CDC tables on leadership gain',
  CDC_RESUBSCRIBE_ON_LEADER_COMPLETE:
    'CDC re-subscription on leadership gain complete',
  COMMITTED_PREFIX_DIVERGENCE:
    'Message-group consensus observed a committed-prefix divergence',
  PROPOSAL_REFUSED: 'Message-group consensus refused a proposal',
  COMMITTED_ENTRY_EFFECT_FAILED:
    'Message-group committed-entry effect failed',
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
  MESSAGE_GROUP_COMMAND_REFUSAL,
  MESSAGE_GROUP_COMMAND_TYPE,
  MESSAGE_GROUP_CONSENSUS_STARTUP_OUTCOME,
  MESSAGE_GROUP_OPERATION_LEDGER,
  MESSAGE_GROUP_OPERATION_LEDGER_NOW,
  MESSAGE_GROUP_PROPOSAL_ROUTE,
  MESSAGE_GROUP_SERVICE_DEFAULT,
  MESSAGE_GROUP_SERVICE_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_LOG_MSG,
  MESSAGE_GROUP_SUBSYSTEM,
  MESSAGE_STATUS,
  MESSAGE_GROUP_METADATA_TABLE,
  MESSAGE_GROUP_METADATA_SQL,
  RAFT_ROLE,
};
