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
import { NUM, STRING, SERVICE_PROFILE } from '../constants/index.js';
import { RUNTIME_FIELD } from '../constants/runtime.js';
import { TIMER_STATUS, DEFAULT_RESOURCE_BUDGET, WASM_SERVICE_DEFAULT, WASM_SERVICE_DEFINITION_STATUS } from './wasm-service-constants.js';
import { applyRuntimeDefaults, applyLegacyDefaults } from './runtime-legacy-mapping.js';

/**
 * Column name constants for service_definitions table.
 * @enum {string}
 */
const SD_COL = Object.freeze(stryMutAct_9fa48("163985") ? {} : (stryCov_9fa48("163985"), {
  SERVICE_ID: stryMutAct_9fa48("163986") ? "" : (stryCov_9fa48("163986"), 'service_id'),
  SERVICE_NAME: stryMutAct_9fa48("163987") ? "" : (stryCov_9fa48("163987"), 'service_name'),
  SERVICE_PROFILE: stryMutAct_9fa48("163988") ? "" : (stryCov_9fa48("163988"), 'service_profile'),
  HANDLER_FUNCTION_ID: stryMutAct_9fa48("163989") ? "" : (stryCov_9fa48("163989"), 'handler_function_id'),
  READ_CONSISTENCY: stryMutAct_9fa48("163990") ? "" : (stryCov_9fa48("163990"), 'read_consistency'),
  WRITE_CONSISTENCY: stryMutAct_9fa48("163991") ? "" : (stryCov_9fa48("163991"), 'write_consistency'),
  REPLICA_COUNT: stryMutAct_9fa48("163992") ? "" : (stryCov_9fa48("163992"), 'replica_count'),
  PROTOCOL: stryMutAct_9fa48("163993") ? "" : (stryCov_9fa48("163993"), 'protocol'),
  RESOURCE_BUDGET: stryMutAct_9fa48("163994") ? "" : (stryCov_9fa48("163994"), 'resource_budget'),
  SAFETY_INTERVAL_MS: stryMutAct_9fa48("163995") ? "" : (stryCov_9fa48("163995"), 'safety_interval_ms'),
  RUNTIME_KIND: RUNTIME_FIELD.RUNTIME_KIND,
  RUNTIME_REF: RUNTIME_FIELD.RUNTIME_REF,
  RUNTIME_CONFIG: RUNTIME_FIELD.RUNTIME_CONFIG,
  STATUS: stryMutAct_9fa48("163996") ? "" : (stryCov_9fa48("163996"), 'status'),
  CREATED_AT: stryMutAct_9fa48("163997") ? "" : (stryCov_9fa48("163997"), 'created_at'),
  UPDATED_AT: stryMutAct_9fa48("163998") ? "" : (stryCov_9fa48("163998"), 'updated_at')
}));

/**
 * Canonical column order for service_definitions rows.
 * This list is the single source of truth for row serialization
 * and SQL INSERT projection in meta command handlers.
 * @type {ReadonlyArray<string>}
 */
const SERVICE_DEFINITION_COLUMN_LIST = Object.freeze(stryMutAct_9fa48("163999") ? [] : (stryCov_9fa48("163999"), [SD_COL.SERVICE_ID, SD_COL.SERVICE_NAME, SD_COL.SERVICE_PROFILE, SD_COL.HANDLER_FUNCTION_ID, SD_COL.READ_CONSISTENCY, SD_COL.WRITE_CONSISTENCY, SD_COL.REPLICA_COUNT, SD_COL.PROTOCOL, SD_COL.RESOURCE_BUDGET, SD_COL.SAFETY_INTERVAL_MS, SD_COL.RUNTIME_KIND, SD_COL.RUNTIME_REF, SD_COL.RUNTIME_CONFIG, SD_COL.STATUS, SD_COL.CREATED_AT, SD_COL.UPDATED_AT]));

/**
 * Field name constants for ResourceBudget objects.
 * @enum {string}
 */
const RB_FIELD = Object.freeze(stryMutAct_9fa48("164000") ? {} : (stryCov_9fa48("164000"), {
  CPU_TIME_LIMIT_MS: stryMutAct_9fa48("164001") ? "" : (stryCov_9fa48("164001"), 'cpuTimeLimitMs'),
  MEMORY_LIMIT_BYTES: stryMutAct_9fa48("164002") ? "" : (stryCov_9fa48("164002"), 'memoryLimitBytes'),
  SESSION_SIZE_LIMIT_BYTES: stryMutAct_9fa48("164003") ? "" : (stryCov_9fa48("164003"), 'sessionSizeLimitBytes'),
  SERVICE_SIZE_LIMIT_BYTES: stryMutAct_9fa48("164004") ? "" : (stryCov_9fa48("164004"), 'serviceSizeLimitBytes')
}));

/**
 * Field name constants for TimerEntry objects.
 * @enum {string}
 */
const TE_FIELD = Object.freeze(stryMutAct_9fa48("164005") ? {} : (stryCov_9fa48("164005"), {
  TIMER_ID: stryMutAct_9fa48("164006") ? "" : (stryCov_9fa48("164006"), 'timerId'),
  SERVICE_ID: stryMutAct_9fa48("164007") ? "" : (stryCov_9fa48("164007"), 'serviceId'),
  DELAY_MS: stryMutAct_9fa48("164008") ? "" : (stryCov_9fa48("164008"), 'delayMs'),
  FIRE_AT: stryMutAct_9fa48("164009") ? "" : (stryCov_9fa48("164009"), 'fireAt'),
  PAYLOAD: stryMutAct_9fa48("164010") ? "" : (stryCov_9fa48("164010"), 'payload'),
  STATUS: stryMutAct_9fa48("164011") ? "" : (stryCov_9fa48("164011"), 'status'),
  CREATED_AT: stryMutAct_9fa48("164012") ? "" : (stryCov_9fa48("164012"), 'createdAt')
}));

/**
 * Serialize a ResourceBudget object to a JSON string.
 * @param {Object} budget - ResourceBudget object.
 * @return {string} JSON string representation.
 */
function serializeResourceBudget(budget) {
  if (stryMutAct_9fa48("164013")) {
    {}
  } else {
    stryCov_9fa48("164013");
    const obj = stryMutAct_9fa48("164014") ? {} : (stryCov_9fa48("164014"), {
      [RB_FIELD.CPU_TIME_LIMIT_MS]: stryMutAct_9fa48("164015") ? budget[RB_FIELD.CPU_TIME_LIMIT_MS] && DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS : (stryCov_9fa48("164015"), budget[RB_FIELD.CPU_TIME_LIMIT_MS] ?? DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS),
      [RB_FIELD.MEMORY_LIMIT_BYTES]: stryMutAct_9fa48("164016") ? budget[RB_FIELD.MEMORY_LIMIT_BYTES] && DEFAULT_RESOURCE_BUDGET.MEMORY_LIMIT_BYTES : (stryCov_9fa48("164016"), budget[RB_FIELD.MEMORY_LIMIT_BYTES] ?? DEFAULT_RESOURCE_BUDGET.MEMORY_LIMIT_BYTES),
      [RB_FIELD.SESSION_SIZE_LIMIT_BYTES]: stryMutAct_9fa48("164017") ? budget[RB_FIELD.SESSION_SIZE_LIMIT_BYTES] && DEFAULT_RESOURCE_BUDGET.SESSION_SIZE_LIMIT_BYTES : (stryCov_9fa48("164017"), budget[RB_FIELD.SESSION_SIZE_LIMIT_BYTES] ?? DEFAULT_RESOURCE_BUDGET.SESSION_SIZE_LIMIT_BYTES),
      [RB_FIELD.SERVICE_SIZE_LIMIT_BYTES]: stryMutAct_9fa48("164018") ? budget[RB_FIELD.SERVICE_SIZE_LIMIT_BYTES] && DEFAULT_RESOURCE_BUDGET.SERVICE_SIZE_LIMIT_BYTES : (stryCov_9fa48("164018"), budget[RB_FIELD.SERVICE_SIZE_LIMIT_BYTES] ?? DEFAULT_RESOURCE_BUDGET.SERVICE_SIZE_LIMIT_BYTES)
    });
    return JSON.stringify(obj);
  }
}

/**
 * Deserialize a JSON string to a ResourceBudget object.
 * @param {string} json - JSON string representation.
 * @return {Object} ResourceBudget object.
 */
function deserializeResourceBudget(json) {
  if (stryMutAct_9fa48("164019")) {
    {}
  } else {
    stryCov_9fa48("164019");
    const parsed = JSON.parse(json);
    return stryMutAct_9fa48("164020") ? {} : (stryCov_9fa48("164020"), {
      [RB_FIELD.CPU_TIME_LIMIT_MS]: stryMutAct_9fa48("164021") ? parsed[RB_FIELD.CPU_TIME_LIMIT_MS] && DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS : (stryCov_9fa48("164021"), parsed[RB_FIELD.CPU_TIME_LIMIT_MS] ?? DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS),
      [RB_FIELD.MEMORY_LIMIT_BYTES]: stryMutAct_9fa48("164022") ? parsed[RB_FIELD.MEMORY_LIMIT_BYTES] && DEFAULT_RESOURCE_BUDGET.MEMORY_LIMIT_BYTES : (stryCov_9fa48("164022"), parsed[RB_FIELD.MEMORY_LIMIT_BYTES] ?? DEFAULT_RESOURCE_BUDGET.MEMORY_LIMIT_BYTES),
      [RB_FIELD.SESSION_SIZE_LIMIT_BYTES]: stryMutAct_9fa48("164023") ? parsed[RB_FIELD.SESSION_SIZE_LIMIT_BYTES] && DEFAULT_RESOURCE_BUDGET.SESSION_SIZE_LIMIT_BYTES : (stryCov_9fa48("164023"), parsed[RB_FIELD.SESSION_SIZE_LIMIT_BYTES] ?? DEFAULT_RESOURCE_BUDGET.SESSION_SIZE_LIMIT_BYTES),
      [RB_FIELD.SERVICE_SIZE_LIMIT_BYTES]: stryMutAct_9fa48("164024") ? parsed[RB_FIELD.SERVICE_SIZE_LIMIT_BYTES] && DEFAULT_RESOURCE_BUDGET.SERVICE_SIZE_LIMIT_BYTES : (stryCov_9fa48("164024"), parsed[RB_FIELD.SERVICE_SIZE_LIMIT_BYTES] ?? DEFAULT_RESOURCE_BUDGET.SERVICE_SIZE_LIMIT_BYTES)
    });
  }
}

/**
 * Serialize a ServiceDefinition object to a table row object.
 * The resource_budget field is JSON-encoded.
 * @param {Object} definition - ServiceDefinition object.
 * @return {Object} Table row with snake_case keys.
 */
function serializeServiceDefinition(definition) {
  if (stryMutAct_9fa48("164025")) {
    {}
  } else {
    stryCov_9fa48("164025");
    const runtimeAware = applyRuntimeDefaults(definition);
    const compat = applyLegacyDefaults(runtimeAware);
    const now = Date.now();
    return stryMutAct_9fa48("164026") ? {} : (stryCov_9fa48("164026"), {
      [SD_COL.SERVICE_ID]: compat.serviceId,
      [SD_COL.SERVICE_NAME]: compat.serviceName,
      [SD_COL.SERVICE_PROFILE]: stryMutAct_9fa48("164027") ? compat.serviceProfile && SERVICE_PROFILE.DEFAULT : (stryCov_9fa48("164027"), compat.serviceProfile ?? SERVICE_PROFILE.DEFAULT),
      [SD_COL.HANDLER_FUNCTION_ID]: compat.handlerFunctionId,
      [SD_COL.READ_CONSISTENCY]: stryMutAct_9fa48("164028") ? compat.readConsistency && WASM_SERVICE_DEFAULT.READ_CONSISTENCY : (stryCov_9fa48("164028"), compat.readConsistency ?? WASM_SERVICE_DEFAULT.READ_CONSISTENCY),
      [SD_COL.WRITE_CONSISTENCY]: stryMutAct_9fa48("164029") ? compat.writeConsistency && WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY : (stryCov_9fa48("164029"), compat.writeConsistency ?? WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY),
      [SD_COL.REPLICA_COUNT]: stryMutAct_9fa48("164030") ? compat.replicaCount && WASM_SERVICE_DEFAULT.REPLICA_COUNT : (stryCov_9fa48("164030"), compat.replicaCount ?? WASM_SERVICE_DEFAULT.REPLICA_COUNT),
      [SD_COL.PROTOCOL]: stryMutAct_9fa48("164031") ? compat.protocol && WASM_SERVICE_DEFAULT.PROTOCOL : (stryCov_9fa48("164031"), compat.protocol ?? WASM_SERVICE_DEFAULT.PROTOCOL),
      [SD_COL.RESOURCE_BUDGET]: serializeResourceBudget(stryMutAct_9fa48("164034") ? compat.resourceBudget && {} : stryMutAct_9fa48("164033") ? false : stryMutAct_9fa48("164032") ? true : (stryCov_9fa48("164032", "164033", "164034"), compat.resourceBudget || {})),
      [SD_COL.SAFETY_INTERVAL_MS]: stryMutAct_9fa48("164035") ? compat.safetyIntervalMs && WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS : (stryCov_9fa48("164035"), compat.safetyIntervalMs ?? WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS),
      [SD_COL.RUNTIME_KIND]: stryMutAct_9fa48("164036") ? compat.runtimeKind && null : (stryCov_9fa48("164036"), compat.runtimeKind ?? null),
      [SD_COL.RUNTIME_REF]: stryMutAct_9fa48("164037") ? compat.runtimeRef && null : (stryCov_9fa48("164037"), compat.runtimeRef ?? null),
      [SD_COL.RUNTIME_CONFIG]: stryMutAct_9fa48("164038") ? compat.runtimeConfig && null : (stryCov_9fa48("164038"), compat.runtimeConfig ?? null),
      [SD_COL.STATUS]: stryMutAct_9fa48("164039") ? compat.status && WASM_SERVICE_DEFINITION_STATUS.ACTIVE : (stryCov_9fa48("164039"), compat.status ?? WASM_SERVICE_DEFINITION_STATUS.ACTIVE),
      [SD_COL.CREATED_AT]: stryMutAct_9fa48("164040") ? compat.createdAt && now : (stryCov_9fa48("164040"), compat.createdAt ?? now),
      [SD_COL.UPDATED_AT]: stryMutAct_9fa48("164041") ? compat.updatedAt && now : (stryCov_9fa48("164041"), compat.updatedAt ?? now)
    });
  }
}

/**
 * Deserialize a table row to a ServiceDefinition object.
 * The resource_budget field is parsed from JSON.
 * @param {Object} row - Table row with snake_case keys.
 * @return {Object} ServiceDefinition object with camelCase keys.
 */
function deserializeServiceDefinition(row) {
  if (stryMutAct_9fa48("164042")) {
    {}
  } else {
    stryCov_9fa48("164042");
    const budgetJson = stryMutAct_9fa48("164045") ? row[SD_COL.RESOURCE_BUDGET] && STRING.EMPTY_JSON_OBJECT : stryMutAct_9fa48("164044") ? false : stryMutAct_9fa48("164043") ? true : (stryCov_9fa48("164043", "164044", "164045"), row[SD_COL.RESOURCE_BUDGET] || STRING.EMPTY_JSON_OBJECT);
    const raw = stryMutAct_9fa48("164046") ? {} : (stryCov_9fa48("164046"), {
      serviceId: row[SD_COL.SERVICE_ID],
      serviceName: row[SD_COL.SERVICE_NAME],
      serviceProfile: stryMutAct_9fa48("164047") ? row[SD_COL.SERVICE_PROFILE] && SERVICE_PROFILE.DEFAULT : (stryCov_9fa48("164047"), row[SD_COL.SERVICE_PROFILE] ?? SERVICE_PROFILE.DEFAULT),
      handlerFunctionId: row[SD_COL.HANDLER_FUNCTION_ID],
      readConsistency: stryMutAct_9fa48("164048") ? row[SD_COL.READ_CONSISTENCY] && WASM_SERVICE_DEFAULT.READ_CONSISTENCY : (stryCov_9fa48("164048"), row[SD_COL.READ_CONSISTENCY] ?? WASM_SERVICE_DEFAULT.READ_CONSISTENCY),
      writeConsistency: stryMutAct_9fa48("164049") ? row[SD_COL.WRITE_CONSISTENCY] && WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY : (stryCov_9fa48("164049"), row[SD_COL.WRITE_CONSISTENCY] ?? WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY),
      replicaCount: stryMutAct_9fa48("164050") ? row[SD_COL.REPLICA_COUNT] && WASM_SERVICE_DEFAULT.REPLICA_COUNT : (stryCov_9fa48("164050"), row[SD_COL.REPLICA_COUNT] ?? WASM_SERVICE_DEFAULT.REPLICA_COUNT),
      protocol: stryMutAct_9fa48("164051") ? row[SD_COL.PROTOCOL] && WASM_SERVICE_DEFAULT.PROTOCOL : (stryCov_9fa48("164051"), row[SD_COL.PROTOCOL] ?? WASM_SERVICE_DEFAULT.PROTOCOL),
      resourceBudget: deserializeResourceBudget(budgetJson),
      safetyIntervalMs: stryMutAct_9fa48("164052") ? row[SD_COL.SAFETY_INTERVAL_MS] && WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS : (stryCov_9fa48("164052"), row[SD_COL.SAFETY_INTERVAL_MS] ?? WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS),
      runtimeKind: stryMutAct_9fa48("164053") ? row[SD_COL.RUNTIME_KIND] && null : (stryCov_9fa48("164053"), row[SD_COL.RUNTIME_KIND] ?? null),
      runtimeRef: stryMutAct_9fa48("164054") ? row[SD_COL.RUNTIME_REF] && null : (stryCov_9fa48("164054"), row[SD_COL.RUNTIME_REF] ?? null),
      runtimeConfig: stryMutAct_9fa48("164055") ? row[SD_COL.RUNTIME_CONFIG] && null : (stryCov_9fa48("164055"), row[SD_COL.RUNTIME_CONFIG] ?? null),
      status: stryMutAct_9fa48("164056") ? row[SD_COL.STATUS] && WASM_SERVICE_DEFINITION_STATUS.ACTIVE : (stryCov_9fa48("164056"), row[SD_COL.STATUS] ?? WASM_SERVICE_DEFINITION_STATUS.ACTIVE),
      createdAt: stryMutAct_9fa48("164057") ? row[SD_COL.CREATED_AT] && NUM.ZERO : (stryCov_9fa48("164057"), row[SD_COL.CREATED_AT] ?? NUM.ZERO),
      updatedAt: stryMutAct_9fa48("164058") ? row[SD_COL.UPDATED_AT] && NUM.ZERO : (stryCov_9fa48("164058"), row[SD_COL.UPDATED_AT] ?? NUM.ZERO)
    });
    return applyRuntimeDefaults(raw);
  }
}

/**
 * Serialize a TimerEntry object to a JSON string.
 * @param {Object} entry - TimerEntry object.
 * @return {string} JSON string for Raft log storage.
 */
function serializeTimerEntry(entry) {
  if (stryMutAct_9fa48("164059")) {
    {}
  } else {
    stryCov_9fa48("164059");
    const obj = stryMutAct_9fa48("164060") ? {} : (stryCov_9fa48("164060"), {
      [TE_FIELD.TIMER_ID]: entry[TE_FIELD.TIMER_ID],
      [TE_FIELD.SERVICE_ID]: entry[TE_FIELD.SERVICE_ID],
      [TE_FIELD.DELAY_MS]: stryMutAct_9fa48("164061") ? entry[TE_FIELD.DELAY_MS] && NUM.ZERO : (stryCov_9fa48("164061"), entry[TE_FIELD.DELAY_MS] ?? NUM.ZERO),
      [TE_FIELD.FIRE_AT]: stryMutAct_9fa48("164062") ? entry[TE_FIELD.FIRE_AT] && NUM.ZERO : (stryCov_9fa48("164062"), entry[TE_FIELD.FIRE_AT] ?? NUM.ZERO),
      [TE_FIELD.PAYLOAD]: stryMutAct_9fa48("164063") ? entry[TE_FIELD.PAYLOAD] && {} : (stryCov_9fa48("164063"), entry[TE_FIELD.PAYLOAD] ?? {}),
      [TE_FIELD.STATUS]: stryMutAct_9fa48("164064") ? entry[TE_FIELD.STATUS] && TIMER_STATUS.ACTIVE : (stryCov_9fa48("164064"), entry[TE_FIELD.STATUS] ?? TIMER_STATUS.ACTIVE),
      [TE_FIELD.CREATED_AT]: stryMutAct_9fa48("164065") ? entry[TE_FIELD.CREATED_AT] && NUM.ZERO : (stryCov_9fa48("164065"), entry[TE_FIELD.CREATED_AT] ?? NUM.ZERO)
    });
    return JSON.stringify(obj);
  }
}

/**
 * Deserialize a JSON string to a TimerEntry object.
 * @param {string} json - JSON string from Raft log.
 * @return {Object} TimerEntry object.
 */
function deserializeTimerEntry(json) {
  if (stryMutAct_9fa48("164066")) {
    {}
  } else {
    stryCov_9fa48("164066");
    const parsed = JSON.parse(json);
    return stryMutAct_9fa48("164067") ? {} : (stryCov_9fa48("164067"), {
      [TE_FIELD.TIMER_ID]: parsed[TE_FIELD.TIMER_ID],
      [TE_FIELD.SERVICE_ID]: parsed[TE_FIELD.SERVICE_ID],
      [TE_FIELD.DELAY_MS]: stryMutAct_9fa48("164068") ? parsed[TE_FIELD.DELAY_MS] && NUM.ZERO : (stryCov_9fa48("164068"), parsed[TE_FIELD.DELAY_MS] ?? NUM.ZERO),
      [TE_FIELD.FIRE_AT]: stryMutAct_9fa48("164069") ? parsed[TE_FIELD.FIRE_AT] && NUM.ZERO : (stryCov_9fa48("164069"), parsed[TE_FIELD.FIRE_AT] ?? NUM.ZERO),
      [TE_FIELD.PAYLOAD]: stryMutAct_9fa48("164070") ? parsed[TE_FIELD.PAYLOAD] && {} : (stryCov_9fa48("164070"), parsed[TE_FIELD.PAYLOAD] ?? {}),
      [TE_FIELD.STATUS]: stryMutAct_9fa48("164071") ? parsed[TE_FIELD.STATUS] && TIMER_STATUS.ACTIVE : (stryCov_9fa48("164071"), parsed[TE_FIELD.STATUS] ?? TIMER_STATUS.ACTIVE),
      [TE_FIELD.CREATED_AT]: stryMutAct_9fa48("164072") ? parsed[TE_FIELD.CREATED_AT] && NUM.ZERO : (stryCov_9fa48("164072"), parsed[TE_FIELD.CREATED_AT] ?? NUM.ZERO)
    });
  }
}
export { SD_COL, SERVICE_DEFINITION_COLUMN_LIST, RB_FIELD, TE_FIELD, serializeResourceBudget, deserializeResourceBudget, serializeServiceDefinition, deserializeServiceDefinition, serializeTimerEntry, deserializeTimerEntry };