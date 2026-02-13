import {NUM} from '../constants/index.js';

const WASM_SERVICE_SUBSYSTEM = Object.freeze({
  REPLICA: 'wasm-service-replica',
  EXECUTOR: 'wasm-service-executor',
  MODULE_MIRROR: 'wasm-service-module-mirror',
  PORT_ALLOCATOR: 'wasm-service-port-allocator',
  TIMER_MANAGER: 'wasm-service-timer-manager',
  SAFETY_INTERVAL: 'wasm-service-safety-interval',
  KV_STORE: 'wasm-service-kv-store',
  VALIDATOR: 'wasm-service-validator',
  LIFECYCLE: 'wasm-service-lifecycle',
  ENDPOINT_BUILDER: 'wasm-service-endpoint-builder',
});

const READ_CONSISTENCY_MODE = Object.freeze({
  LEADER_ONLY: 'leader_only',
  STRONG: 'strong',
  EVENTUAL: 'eventual',
});

const WRITE_CONSISTENCY_MODE = Object.freeze({
  STRONG: 'strong',
  ASYNC: 'async',
});

const TIMER_STATUS = Object.freeze({
  ACTIVE: 'active',
  FIRED: 'fired',
  CANCELLED: 'cancelled',
});

const RESERVED_KV_PREFIX = Object.freeze({
  TIMERS: '_timers/',
});

const DEFAULT_SAFETY_INTERVAL_MS = 500;

const DEFAULT_RESOURCE_BUDGET = Object.freeze({
  CPU_TIME_LIMIT_MS: 5000,
  MEMORY_LIMIT_BYTES: 67108864,
  SESSION_SIZE_LIMIT_BYTES: NUM.BYTES_PER_MIB,
  SERVICE_SIZE_LIMIT_BYTES: 104857600,
});

const WASM_SERVICE_ERROR_MSG = Object.freeze({
  HANDLER_FUNCTION_NOT_FOUND: 'Handler function not found in code table',
  ODD_REPLICA_COUNT_REQUIRED:
    'Replica count must be an odd number >= 3',
  INVALID_CONSISTENCY_MODE: 'Invalid consistency mode',
  CPU_TIME_LIMIT_EXCEEDED: 'CPU time limit exceeded',
  MEMORY_LIMIT_EXCEEDED: 'Memory limit exceeded',
  SESSION_SIZE_LIMIT_EXCEEDED: 'Session context size limit exceeded',
  SERVICE_SIZE_LIMIT_EXCEEDED: 'Service total context size limit exceeded',
  SERVICE_NOT_READY: 'WASM service group is not ready',
  MODULE_NOT_AVAILABLE: 'WASM module not available on any node',
  RUN_EXPORT_NOT_FOUND:
    'run_export function not found in module exports',
  RUN_EXPORT_NOT_CALLABLE:
    'run_export must be a callable function',
  HANDLER_INVOCATION_FAILED: 'Handler invocation failed',
  RUN_EXPORT_SIGNATURE_MISMATCH:
    'run_export signature does not match required runtime' +
    ' contract (2-3 params)',
  PORT_EXHAUSTED: 'No ports available for allocation',
});

const WASM_SERVICE_LOG_MSG = Object.freeze({
  REPLICA_CREATED: 'WASM service replica created',
  REPLICA_STARTED: 'WASM service replica started',
  REPLICA_STOPPED: 'WASM service replica stopped',
  BECAME_LEADER: 'WASM service replica became leader',
  LOST_LEADERSHIP: 'WASM service replica lost leadership',
  TIMER_CREATED: 'Timer created',
  TIMER_CANCELLED: 'Timer cancelled',
  TIMER_FIRED: 'Timer fired',
  TIMER_RECONSTRUCTED: 'Active timers reconstructed on leader election',
  TIMER_SKIPPED_NON_ACTIVE: 'Skipped non-active timer during reconstruction',
  SAFETY_INTERVAL_BROADCAST: 'Safety interval state broadcast',
  SAFETY_INTERVAL_UPDATED: 'Safety interval leader state updated',
  READ_FORWARDED_TO_LEADER: 'Read forwarded to leader',
  READ_SERVED_LOCALLY: 'Read served from local replica',
  KV_WRITE_APPLIED: 'KV store write applied',
  KV_DELETE_APPLIED: 'KV store delete applied',
  SESSION_DELETED: 'Session context deleted',
  MODULE_PULLED: 'WASM module pulled from peer',
  MODULE_CACHED: 'WASM module cached locally',
  MODULE_VERSION_UPDATED: 'WASM module version updated',
  PORT_ALLOCATED: 'Communication port allocated',
  PORT_RELEASED: 'Communication port released',
  ENDPOINT_REGISTERED: 'Service endpoint registered',
  ENDPOINT_REMOVED: 'Service endpoint removed',
  HANDLER_EXECUTED: 'Handler function executed',
  HANDLER_EXECUTION_FAILED: 'Handler function execution failed',
  DEFINITION_VALIDATED: 'Service definition validated',
  DEFINITION_REJECTED: 'Service definition rejected',
  ENTRY_COMMITTED: 'Raft entry committed and applied',
  WRITE_REJECTED_SIZE_LIMIT: 'Write rejected due to size limit',
});

const WASM_SERVICE_EXECUTOR_TYPE = 'wasm_service';

const SQL_ENGINE_PROFILE = Object.freeze({
  SUBSYSTEM: 'sql-engine-profile',
  DEFAULT_READ_CONSISTENCY: 'leader_only',
  DEFAULT_WRITE_CONSISTENCY: 'strong',
});

const WASM_SERVICE_PROTOCOL = Object.freeze({
  WEBSOCKET: 'websocket',
});

const WASM_SERVICE_HEALTH_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
});

const WASM_SERVICE_DEFINITION_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

const DEFAULT_PORT_RANGE_START = 30000;
const DEFAULT_PORT_RANGE_END = 39999;

const WASM_SERVICE_DEFAULT = Object.freeze({
  REPLICA_COUNT: NUM.THREE,
  SAFETY_INTERVAL_MS: DEFAULT_SAFETY_INTERVAL_MS,
  READ_CONSISTENCY: READ_CONSISTENCY_MODE.STRONG,
  WRITE_CONSISTENCY: WRITE_CONSISTENCY_MODE.STRONG,
  PROTOCOL: WASM_SERVICE_PROTOCOL.WEBSOCKET,
  PORT_RANGE_START: DEFAULT_PORT_RANGE_START,
  PORT_RANGE_END: DEFAULT_PORT_RANGE_END,
});

export {
  WASM_SERVICE_SUBSYSTEM,
  READ_CONSISTENCY_MODE,
  WRITE_CONSISTENCY_MODE,
  TIMER_STATUS,
  RESERVED_KV_PREFIX,
  DEFAULT_SAFETY_INTERVAL_MS,
  DEFAULT_RESOURCE_BUDGET,
  WASM_SERVICE_ERROR_MSG,
  WASM_SERVICE_LOG_MSG,
  WASM_SERVICE_EXECUTOR_TYPE,
  SQL_ENGINE_PROFILE,
  WASM_SERVICE_PROTOCOL,
  WASM_SERVICE_HEALTH_STATUS,
  WASM_SERVICE_DEFINITION_STATUS,
  WASM_SERVICE_DEFAULT,
};
