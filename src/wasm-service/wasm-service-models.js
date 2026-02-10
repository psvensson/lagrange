import {NUM, STRING} from '../constants/index.js';
import {
  TIMER_STATUS,
  DEFAULT_RESOURCE_BUDGET,
  WASM_SERVICE_DEFAULT,
  WASM_SERVICE_DEFINITION_STATUS,
} from './wasm-service-constants.js';

/**
 * Column name constants for service_definitions table.
 * @enum {string}
 */
const SD_COL = Object.freeze({
  SERVICE_ID: 'service_id',
  SERVICE_NAME: 'service_name',
  HANDLER_FUNCTION_ID: 'handler_function_id',
  READ_CONSISTENCY: 'read_consistency',
  WRITE_CONSISTENCY: 'write_consistency',
  REPLICA_COUNT: 'replica_count',
  PROTOCOL: 'protocol',
  RESOURCE_BUDGET: 'resource_budget',
  SAFETY_INTERVAL_MS: 'safety_interval_ms',
  STATUS: 'status',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
});

/**
 * Field name constants for ResourceBudget objects.
 * @enum {string}
 */
const RB_FIELD = Object.freeze({
  CPU_TIME_LIMIT_MS: 'cpuTimeLimitMs',
  MEMORY_LIMIT_BYTES: 'memoryLimitBytes',
  SESSION_SIZE_LIMIT_BYTES: 'sessionSizeLimitBytes',
  SERVICE_SIZE_LIMIT_BYTES: 'serviceSizeLimitBytes',
});

/**
 * Field name constants for TimerEntry objects.
 * @enum {string}
 */
const TE_FIELD = Object.freeze({
  TIMER_ID: 'timerId',
  SERVICE_ID: 'serviceId',
  DELAY_MS: 'delayMs',
  FIRE_AT: 'fireAt',
  PAYLOAD: 'payload',
  STATUS: 'status',
  CREATED_AT: 'createdAt',
});

/**
 * Serialize a ResourceBudget object to a JSON string.
 * @param {Object} budget - ResourceBudget object.
 * @return {string} JSON string representation.
 */
function serializeResourceBudget(budget) {
  const obj = {
    [RB_FIELD.CPU_TIME_LIMIT_MS]:
      budget[RB_FIELD.CPU_TIME_LIMIT_MS] ??
      DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS,
    [RB_FIELD.MEMORY_LIMIT_BYTES]:
      budget[RB_FIELD.MEMORY_LIMIT_BYTES] ??
      DEFAULT_RESOURCE_BUDGET.MEMORY_LIMIT_BYTES,
    [RB_FIELD.SESSION_SIZE_LIMIT_BYTES]:
      budget[RB_FIELD.SESSION_SIZE_LIMIT_BYTES] ??
      DEFAULT_RESOURCE_BUDGET.SESSION_SIZE_LIMIT_BYTES,
    [RB_FIELD.SERVICE_SIZE_LIMIT_BYTES]:
      budget[RB_FIELD.SERVICE_SIZE_LIMIT_BYTES] ??
      DEFAULT_RESOURCE_BUDGET.SERVICE_SIZE_LIMIT_BYTES,
  };
  return JSON.stringify(obj);
}

/**
 * Deserialize a JSON string to a ResourceBudget object.
 * @param {string} json - JSON string representation.
 * @return {Object} ResourceBudget object.
 */
function deserializeResourceBudget(json) {
  const parsed = JSON.parse(json);
  return {
    [RB_FIELD.CPU_TIME_LIMIT_MS]:
      parsed[RB_FIELD.CPU_TIME_LIMIT_MS] ??
      DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS,
    [RB_FIELD.MEMORY_LIMIT_BYTES]:
      parsed[RB_FIELD.MEMORY_LIMIT_BYTES] ??
      DEFAULT_RESOURCE_BUDGET.MEMORY_LIMIT_BYTES,
    [RB_FIELD.SESSION_SIZE_LIMIT_BYTES]:
      parsed[RB_FIELD.SESSION_SIZE_LIMIT_BYTES] ??
      DEFAULT_RESOURCE_BUDGET.SESSION_SIZE_LIMIT_BYTES,
    [RB_FIELD.SERVICE_SIZE_LIMIT_BYTES]:
      parsed[RB_FIELD.SERVICE_SIZE_LIMIT_BYTES] ??
      DEFAULT_RESOURCE_BUDGET.SERVICE_SIZE_LIMIT_BYTES,
  };
}

/**
 * Serialize a ServiceDefinition object to a table row object.
 * The resource_budget field is JSON-encoded.
 * @param {Object} definition - ServiceDefinition object.
 * @return {Object} Table row with snake_case keys.
 */
function serializeServiceDefinition(definition) {
  const now = Date.now();
  return {
    [SD_COL.SERVICE_ID]: definition.serviceId,
    [SD_COL.SERVICE_NAME]: definition.serviceName,
    [SD_COL.HANDLER_FUNCTION_ID]: definition.handlerFunctionId,
    [SD_COL.READ_CONSISTENCY]:
      definition.readConsistency ??
      WASM_SERVICE_DEFAULT.READ_CONSISTENCY,
    [SD_COL.WRITE_CONSISTENCY]:
      definition.writeConsistency ??
      WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY,
    [SD_COL.REPLICA_COUNT]:
      definition.replicaCount ??
      WASM_SERVICE_DEFAULT.REPLICA_COUNT,
    [SD_COL.PROTOCOL]:
      definition.protocol ??
      WASM_SERVICE_DEFAULT.PROTOCOL,
    [SD_COL.RESOURCE_BUDGET]: serializeResourceBudget(
      definition.resourceBudget || {}
    ),
    [SD_COL.SAFETY_INTERVAL_MS]:
      definition.safetyIntervalMs ??
      WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
    [SD_COL.STATUS]:
      definition.status ??
      WASM_SERVICE_DEFINITION_STATUS.ACTIVE,
    [SD_COL.CREATED_AT]: definition.createdAt ?? now,
    [SD_COL.UPDATED_AT]: definition.updatedAt ?? now,
  };
}

/**
 * Deserialize a table row to a ServiceDefinition object.
 * The resource_budget field is parsed from JSON.
 * @param {Object} row - Table row with snake_case keys.
 * @return {Object} ServiceDefinition object with camelCase keys.
 */
function deserializeServiceDefinition(row) {
  const budgetJson = row[SD_COL.RESOURCE_BUDGET] ||
    STRING.EMPTY_JSON_OBJECT;
  return {
    serviceId: row[SD_COL.SERVICE_ID],
    serviceName: row[SD_COL.SERVICE_NAME],
    handlerFunctionId: row[SD_COL.HANDLER_FUNCTION_ID],
    readConsistency:
      row[SD_COL.READ_CONSISTENCY] ??
      WASM_SERVICE_DEFAULT.READ_CONSISTENCY,
    writeConsistency:
      row[SD_COL.WRITE_CONSISTENCY] ??
      WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY,
    replicaCount:
      row[SD_COL.REPLICA_COUNT] ??
      WASM_SERVICE_DEFAULT.REPLICA_COUNT,
    protocol:
      row[SD_COL.PROTOCOL] ??
      WASM_SERVICE_DEFAULT.PROTOCOL,
    resourceBudget: deserializeResourceBudget(budgetJson),
    safetyIntervalMs:
      row[SD_COL.SAFETY_INTERVAL_MS] ??
      WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
    status:
      row[SD_COL.STATUS] ??
      WASM_SERVICE_DEFINITION_STATUS.ACTIVE,
    createdAt: row[SD_COL.CREATED_AT] ?? NUM.ZERO,
    updatedAt: row[SD_COL.UPDATED_AT] ?? NUM.ZERO,
  };
}

/**
 * Serialize a TimerEntry object to a JSON string.
 * @param {Object} entry - TimerEntry object.
 * @return {string} JSON string for Raft log storage.
 */
function serializeTimerEntry(entry) {
  const obj = {
    [TE_FIELD.TIMER_ID]: entry[TE_FIELD.TIMER_ID],
    [TE_FIELD.SERVICE_ID]: entry[TE_FIELD.SERVICE_ID],
    [TE_FIELD.DELAY_MS]: entry[TE_FIELD.DELAY_MS] ?? NUM.ZERO,
    [TE_FIELD.FIRE_AT]: entry[TE_FIELD.FIRE_AT] ?? NUM.ZERO,
    [TE_FIELD.PAYLOAD]:
      entry[TE_FIELD.PAYLOAD] ?? {},
    [TE_FIELD.STATUS]:
      entry[TE_FIELD.STATUS] ?? TIMER_STATUS.ACTIVE,
    [TE_FIELD.CREATED_AT]:
      entry[TE_FIELD.CREATED_AT] ?? NUM.ZERO,
  };
  return JSON.stringify(obj);
}

/**
 * Deserialize a JSON string to a TimerEntry object.
 * @param {string} json - JSON string from Raft log.
 * @return {Object} TimerEntry object.
 */
function deserializeTimerEntry(json) {
  const parsed = JSON.parse(json);
  return {
    [TE_FIELD.TIMER_ID]: parsed[TE_FIELD.TIMER_ID],
    [TE_FIELD.SERVICE_ID]: parsed[TE_FIELD.SERVICE_ID],
    [TE_FIELD.DELAY_MS]:
      parsed[TE_FIELD.DELAY_MS] ?? NUM.ZERO,
    [TE_FIELD.FIRE_AT]:
      parsed[TE_FIELD.FIRE_AT] ?? NUM.ZERO,
    [TE_FIELD.PAYLOAD]:
      parsed[TE_FIELD.PAYLOAD] ?? {},
    [TE_FIELD.STATUS]:
      parsed[TE_FIELD.STATUS] ?? TIMER_STATUS.ACTIVE,
    [TE_FIELD.CREATED_AT]:
      parsed[TE_FIELD.CREATED_AT] ?? NUM.ZERO,
  };
}

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
};
