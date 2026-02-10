/**
 * WASM service module — replicated WASM service groups as a
 * third Raft group type alongside partitions and message groups.
 *
 * Exports all public components for the wasm-service subsystem.
 */

// Constants
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
  WASM_SERVICE_PROTOCOL,
  WASM_SERVICE_HEALTH_STATUS,
  WASM_SERVICE_DEFINITION_STATUS,
  WASM_SERVICE_DEFAULT,
} from './wasm-service-constants.js';

// Data models and serialization
export {
  SD_COL,
  RB_FIELD,
  TE_FIELD,
  serializeResourceBudget,
  deserializeResourceBudget,
  serializeServiceDefinition,
  deserializeServiceDefinition,
  serializeTimerEntry,
  deserializeTimerEntry,
} from './wasm-service-models.js';

// Service definition validation
export {ServiceDefinitionValidator} from './service-definition-validator.js';

// Session KV store
export {SessionKVStore} from './session-kv-store.js';

// Safety interval (closed-timestamp reads)
export {SafetyInterval} from './safety-interval.js';

// Read routing
export {routeRead, ROUTING_DECISION} from './read-router.js';

// Timer management
export {TimerManager} from './timer-manager.js';

// Port allocation
export {PortAllocator} from './port-allocator.js';

// Module mirroring
export {ModuleMirror} from './module-mirror.js';

// WASM execution
export {WasmExecutor} from './wasm-executor.js';

// Service endpoint building
export {
  EP_COL,
  EP_META,
  buildEndpointRecord,
} from './service-endpoint-builder.js';

// WASM service replica (Raft group member)
export {
  WasmServiceReplica,
  ENTRY_TYPE,
  MESSAGE_OP,
} from './wasm-service-replica.js';

// WASM service lifecycle management
export {
  WasmServiceLifecycle,
  REPLICA_LIFECYCLE_STATE,
} from './wasm-service-lifecycle.js';
