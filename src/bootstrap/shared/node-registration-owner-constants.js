import {
  CONTROL_PLANE_PHASE_SCOPE,
} from '../../control-plane/control-plane-system-table-gateway.js';
import {
  NUM,
  STATE,
  TIME_MS,
} from '../../constants/index.js';
import {META_SERVICE_ID} from '../../constants/wasm-meta.js';

const LOCAL_STR_RNTKK = 'Registering node in cluster';
const LOCAL_STR_1PE7K = 'Node registered in cluster';
const LOCAL_STR_VWYJO = 'Failed to register node in cluster';
const LOCAL_STR_1YR7Z = 'Failed to refresh durable rejoin membership: ';
const LOCAL_STR_1S6CG = 'node_state_reporter';
const LOCAL_STR_V0KZD = 'retryable join admission write failure';
const LOCAL_STR_UPSERT = 'UPSERT';

const LOG_CLUSTER_INCARNATION_FENCE_UNAVAILABLE =
  'Cluster incarnation fence unavailable; durable rejoin stays blocked';
const LOG_META_ENDPOINT_REGISTER_FAILED =
  'Failed to register built-in meta service endpoints';
const LOG_NODE_REGISTER_ERROR_PREFIX =
  'Failed to register node: ';
const LOG_JOIN_ADMISSION_WRITE_RETRY =
  'Retrying join admission system-table write after retryable failure';
const LOG_REUSING_DURABLE_REJOIN_MEMBERSHIP =
  'Reusing existing canonical membership for durable rejoin';
const LOG_RESUMING_JOIN_ADMISSION_PROGRESS =
  'Resuming join admission from canonical membership progress';
const JOIN_ADMISSION_DELIVERY_PRIORITY = 'critical';
const JOIN_ADMISSION_WRITE_RETRY_TIMEOUT_MS = TIME_MS.SECOND * NUM.THIRTY;
const JOIN_ADMISSION_PUBLICATION = Object.freeze({
  META_SERVICE_ENDPOINT:
    'built-in meta service endpoint publication',
  NODE_ENDPOINT: 'node websocket endpoint publication',
  NODE_MEMBERSHIP: 'node membership publication',
  NODE_MEMBERSHIP_REFRESH: 'durable rejoin membership refresh',
});
const NODE_REGISTRATION_ERROR = Object.freeze({
  JOIN_ADMISSION_GATEWAY_REQUIRED:
    'Join admission control-plane gateway required for join service registration',
  UNSUPPORTED_PUBLICATION_TABLE:
    'Unsupported join publication table for node registration',
});
const JOIN_ADMISSION_RESOLUTION_SOURCE = Object.freeze({
  DURABLE_REJOIN_EXISTING_MEMBERSHIP:
    'durable_rejoin_existing_membership',
  EXISTING_PROGRESS:
    'existing_join_admission_progress',
});
const DURABLE_REJOIN_REQUIRED_SERVICE_IDS = Object.freeze([
  META_SERVICE_ID.POSTGRES_WIRE,
]);
const REUSABLE_JOIN_ADMISSION_CONNECTION_STATES = Object.freeze([
  STATE.CONNECTED,
  STATE.READY,
]);
const JOIN_ADMISSION_PHASE_SCOPE = CONTROL_PLANE_PHASE_SCOPE.JOIN;

const hasFunction = (value) => typeof value === 'function';
const normalizeString = (value) =>
  typeof value === 'string' ? value.trim() : '';

export {
  DURABLE_REJOIN_REQUIRED_SERVICE_IDS,
  JOIN_ADMISSION_DELIVERY_PRIORITY,
  JOIN_ADMISSION_PHASE_SCOPE,
  JOIN_ADMISSION_PUBLICATION,
  JOIN_ADMISSION_RESOLUTION_SOURCE,
  JOIN_ADMISSION_WRITE_RETRY_TIMEOUT_MS,
  LOCAL_STR_1PE7K,
  LOCAL_STR_1S6CG,
  LOCAL_STR_1YR7Z,
  LOCAL_STR_RNTKK,
  LOCAL_STR_UPSERT,
  LOCAL_STR_V0KZD,
  LOCAL_STR_VWYJO,
  LOG_CLUSTER_INCARNATION_FENCE_UNAVAILABLE,
  LOG_JOIN_ADMISSION_WRITE_RETRY,
  LOG_META_ENDPOINT_REGISTER_FAILED,
  LOG_NODE_REGISTER_ERROR_PREFIX,
  LOG_RESUMING_JOIN_ADMISSION_PROGRESS,
  LOG_REUSING_DURABLE_REJOIN_MEMBERSHIP,
  NODE_REGISTRATION_ERROR,
  REUSABLE_JOIN_ADMISSION_CONNECTION_STATES,
  hasFunction,
  normalizeString,
};
