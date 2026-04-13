/**
 * Constants for WASM meta-service row models.
 *
 * Column names and field names for registry mappings,
 * registry overrides, dependency locks, and wasm operations.
 *
 * Requirements: 3.2, 5.2, 10.4
 */
// @ts-nocheck


// --- Registry mapping columns (package_registry_mappings) ---
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
const REGISTRY_MAPPING_COL = Object.freeze(stryMutAct_9fa48("163517") ? {} : (stryCov_9fa48("163517"), {
  NAMESPACE: stryMutAct_9fa48("163518") ? "" : (stryCov_9fa48("163518"), 'namespace'),
  REGISTRY_URL: stryMutAct_9fa48("163519") ? "" : (stryCov_9fa48("163519"), 'registry_url'),
  POLICY_METADATA: stryMutAct_9fa48("163520") ? "" : (stryCov_9fa48("163520"), 'policy_metadata'),
  CREATED_AT: stryMutAct_9fa48("163521") ? "" : (stryCov_9fa48("163521"), 'created_at'),
  UPDATED_AT: stryMutAct_9fa48("163522") ? "" : (stryCov_9fa48("163522"), 'updated_at')
}));
const REGISTRY_MAPPING_FIELD = Object.freeze(stryMutAct_9fa48("163523") ? {} : (stryCov_9fa48("163523"), {
  NAMESPACE: stryMutAct_9fa48("163524") ? "" : (stryCov_9fa48("163524"), 'namespace'),
  REGISTRY_URL: stryMutAct_9fa48("163525") ? "" : (stryCov_9fa48("163525"), 'registryUrl'),
  POLICY_METADATA: stryMutAct_9fa48("163526") ? "" : (stryCov_9fa48("163526"), 'policyMetadata')
}));

// --- Registry override columns (package_registry_overrides) ---

const REGISTRY_OVERRIDE_COL = Object.freeze(stryMutAct_9fa48("163527") ? {} : (stryCov_9fa48("163527"), {
  NAMESPACE: stryMutAct_9fa48("163528") ? "" : (stryCov_9fa48("163528"), 'namespace'),
  NAME: stryMutAct_9fa48("163529") ? "" : (stryCov_9fa48("163529"), 'name'),
  REGISTRY_URL: stryMutAct_9fa48("163530") ? "" : (stryCov_9fa48("163530"), 'registry_url'),
  POLICY_METADATA: stryMutAct_9fa48("163531") ? "" : (stryCov_9fa48("163531"), 'policy_metadata'),
  CREATED_AT: stryMutAct_9fa48("163532") ? "" : (stryCov_9fa48("163532"), 'created_at'),
  UPDATED_AT: stryMutAct_9fa48("163533") ? "" : (stryCov_9fa48("163533"), 'updated_at')
}));
const REGISTRY_OVERRIDE_FIELD = Object.freeze(stryMutAct_9fa48("163534") ? {} : (stryCov_9fa48("163534"), {
  NAMESPACE: stryMutAct_9fa48("163535") ? "" : (stryCov_9fa48("163535"), 'namespace'),
  NAME: stryMutAct_9fa48("163536") ? "" : (stryCov_9fa48("163536"), 'name'),
  REGISTRY_URL: stryMutAct_9fa48("163537") ? "" : (stryCov_9fa48("163537"), 'registryUrl'),
  POLICY_METADATA: stryMutAct_9fa48("163538") ? "" : (stryCov_9fa48("163538"), 'policyMetadata')
}));

// --- Dependency lock columns (module_dependency_locks) ---

const DEPENDENCY_LOCK_COL = Object.freeze(stryMutAct_9fa48("163539") ? {} : (stryCov_9fa48("163539"), {
  LOCK_ID: stryMutAct_9fa48("163540") ? "" : (stryCov_9fa48("163540"), 'lock_id'),
  TARGET_MODULE_NAMESPACE: stryMutAct_9fa48("163541") ? "" : (stryCov_9fa48("163541"), 'target_module_namespace'),
  TARGET_MODULE_NAME: stryMutAct_9fa48("163542") ? "" : (stryCov_9fa48("163542"), 'target_module_name'),
  TARGET_MODULE_VERSION: stryMutAct_9fa48("163543") ? "" : (stryCov_9fa48("163543"), 'target_module_version'),
  TARGET_SERVICE_ID: stryMutAct_9fa48("163544") ? "" : (stryCov_9fa48("163544"), 'target_service_id'),
  RESOLVED_DEPENDENCIES: stryMutAct_9fa48("163545") ? "" : (stryCov_9fa48("163545"), 'resolved_dependencies'),
  CREATED_AT: stryMutAct_9fa48("163546") ? "" : (stryCov_9fa48("163546"), 'created_at')
}));
const DEPENDENCY_LOCK_FIELD = Object.freeze(stryMutAct_9fa48("163547") ? {} : (stryCov_9fa48("163547"), {
  LOCK_ID: stryMutAct_9fa48("163548") ? "" : (stryCov_9fa48("163548"), 'lockId'),
  TARGET_MODULE_NAMESPACE: stryMutAct_9fa48("163549") ? "" : (stryCov_9fa48("163549"), 'targetModuleNamespace'),
  TARGET_MODULE_NAME: stryMutAct_9fa48("163550") ? "" : (stryCov_9fa48("163550"), 'targetModuleName'),
  TARGET_MODULE_VERSION: stryMutAct_9fa48("163551") ? "" : (stryCov_9fa48("163551"), 'targetModuleVersion'),
  TARGET_SERVICE_ID: stryMutAct_9fa48("163552") ? "" : (stryCov_9fa48("163552"), 'targetServiceId'),
  RESOLVED_DEPENDENCIES: stryMutAct_9fa48("163553") ? "" : (stryCov_9fa48("163553"), 'resolvedDependencies')
}));

// --- Wasm operation columns (wasm_operations) ---

const WASM_OPERATION_COL = Object.freeze(stryMutAct_9fa48("163554") ? {} : (stryCov_9fa48("163554"), {
  OPERATION_ID: stryMutAct_9fa48("163555") ? "" : (stryCov_9fa48("163555"), 'operation_id'),
  TENANT_ID: stryMutAct_9fa48("163556") ? "" : (stryCov_9fa48("163556"), 'tenant_id'),
  COMMAND: stryMutAct_9fa48("163557") ? "" : (stryCov_9fa48("163557"), 'command'),
  IDEMPOTENCY_KEY: stryMutAct_9fa48("163558") ? "" : (stryCov_9fa48("163558"), 'idempotency_key'),
  STATE: stryMutAct_9fa48("163559") ? "" : (stryCov_9fa48("163559"), 'state'),
  RESULT: stryMutAct_9fa48("163560") ? "" : (stryCov_9fa48("163560"), 'result'),
  ERROR: stryMutAct_9fa48("163561") ? "" : (stryCov_9fa48("163561"), 'error'),
  CREATED_AT: stryMutAct_9fa48("163562") ? "" : (stryCov_9fa48("163562"), 'created_at'),
  UPDATED_AT: stryMutAct_9fa48("163563") ? "" : (stryCov_9fa48("163563"), 'updated_at')
}));
const WASM_OPERATION_FIELD = Object.freeze(stryMutAct_9fa48("163564") ? {} : (stryCov_9fa48("163564"), {
  OPERATION_ID: stryMutAct_9fa48("163565") ? "" : (stryCov_9fa48("163565"), 'operationId'),
  TENANT_ID: stryMutAct_9fa48("163566") ? "" : (stryCov_9fa48("163566"), 'tenantId'),
  COMMAND: stryMutAct_9fa48("163567") ? "" : (stryCov_9fa48("163567"), 'command'),
  IDEMPOTENCY_KEY: stryMutAct_9fa48("163568") ? "" : (stryCov_9fa48("163568"), 'idempotencyKey'),
  STATE: stryMutAct_9fa48("163569") ? "" : (stryCov_9fa48("163569"), 'state'),
  RESULT: stryMutAct_9fa48("163570") ? "" : (stryCov_9fa48("163570"), 'result'),
  ERROR: stryMutAct_9fa48("163571") ? "" : (stryCov_9fa48("163571"), 'error')
}));

// --- Validation error messages ---

const REGISTRY_MAPPING_ERROR_MSG = Object.freeze(stryMutAct_9fa48("163572") ? {} : (stryCov_9fa48("163572"), {
  NAMESPACE_REQUIRED: stryMutAct_9fa48("163573") ? "" : (stryCov_9fa48("163573"), 'Registry mapping requires namespace'),
  NAMESPACE_INVALID_FORMAT: stryMutAct_9fa48("163574") ? "" : (stryCov_9fa48("163574"), 'Namespace must be lowercase alphanumeric with hyphens'),
  REGISTRY_URL_REQUIRED: stryMutAct_9fa48("163575") ? "" : (stryCov_9fa48("163575"), 'Registry mapping requires registry_url')
}));
const REGISTRY_OVERRIDE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("163576") ? {} : (stryCov_9fa48("163576"), {
  NAMESPACE_REQUIRED: stryMutAct_9fa48("163577") ? "" : (stryCov_9fa48("163577"), 'Registry override requires namespace'),
  NAMESPACE_INVALID_FORMAT: stryMutAct_9fa48("163578") ? "" : (stryCov_9fa48("163578"), 'Namespace must be lowercase alphanumeric with hyphens'),
  NAME_REQUIRED: stryMutAct_9fa48("163579") ? "" : (stryCov_9fa48("163579"), 'Registry override requires name'),
  NAME_INVALID_FORMAT: stryMutAct_9fa48("163580") ? "" : (stryCov_9fa48("163580"), 'Name must be lowercase alphanumeric with hyphens'),
  REGISTRY_URL_REQUIRED: stryMutAct_9fa48("163581") ? "" : (stryCov_9fa48("163581"), 'Registry override requires registry_url')
}));
const DEPENDENCY_LOCK_ERROR_MSG = Object.freeze(stryMutAct_9fa48("163582") ? {} : (stryCov_9fa48("163582"), {
  LOCK_ID_REQUIRED: stryMutAct_9fa48("163583") ? "" : (stryCov_9fa48("163583"), 'Dependency lock requires lock_id'),
  TARGET_NAMESPACE_REQUIRED: stryMutAct_9fa48("163584") ? "" : (stryCov_9fa48("163584"), 'Dependency lock requires target_module_namespace'),
  TARGET_NAME_REQUIRED: stryMutAct_9fa48("163585") ? "" : (stryCov_9fa48("163585"), 'Dependency lock requires target_module_name'),
  TARGET_VERSION_REQUIRED: stryMutAct_9fa48("163586") ? "" : (stryCov_9fa48("163586"), 'Dependency lock requires target_module_version'),
  RESOLVED_DEPS_NOT_ARRAY: stryMutAct_9fa48("163587") ? "" : (stryCov_9fa48("163587"), 'resolved_dependencies must be an array')
}));
const WASM_OPERATION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("163588") ? {} : (stryCov_9fa48("163588"), {
  OPERATION_ID_REQUIRED: stryMutAct_9fa48("163589") ? "" : (stryCov_9fa48("163589"), 'Wasm operation requires operation_id'),
  TENANT_ID_REQUIRED: stryMutAct_9fa48("163590") ? "" : (stryCov_9fa48("163590"), 'Wasm operation requires tenant_id'),
  COMMAND_REQUIRED: stryMutAct_9fa48("163591") ? "" : (stryCov_9fa48("163591"), 'Wasm operation requires command'),
  STATE_INVALID: stryMutAct_9fa48("163592") ? "" : (stryCov_9fa48("163592"), 'Wasm operation state must be a valid WASM_OPERATION_STATE')
}));

/**
 * Namespace format pattern: lowercase alpha start, then
 * lowercase alphanumeric + hyphens, 1-128 chars.
 * @type {RegExp}
 */
const NAMESPACE_PATTERN = stryMutAct_9fa48("163597") ? /^[a-z][^a-z0-9-]{0,127}$/ : stryMutAct_9fa48("163596") ? /^[a-z][a-z0-9-]$/ : stryMutAct_9fa48("163595") ? /^[^a-z][a-z0-9-]{0,127}$/ : stryMutAct_9fa48("163594") ? /^[a-z][a-z0-9-]{0,127}/ : stryMutAct_9fa48("163593") ? /[a-z][a-z0-9-]{0,127}$/ : (stryCov_9fa48("163593", "163594", "163595", "163596", "163597"), /^[a-z][a-z0-9-]{0,127}$/);

/**
 * Package name format pattern: lowercase alpha start, then
 * lowercase alphanumeric + hyphens, 1-128 chars.
 * @type {RegExp}
 */
const PACKAGE_NAME_PATTERN = stryMutAct_9fa48("163602") ? /^[a-z][^a-z0-9-]{0,127}$/ : stryMutAct_9fa48("163601") ? /^[a-z][a-z0-9-]$/ : stryMutAct_9fa48("163600") ? /^[^a-z][a-z0-9-]{0,127}$/ : stryMutAct_9fa48("163599") ? /^[a-z][a-z0-9-]{0,127}/ : stryMutAct_9fa48("163598") ? /[a-z][a-z0-9-]{0,127}$/ : (stryCov_9fa48("163598", "163599", "163600", "163601", "163602"), /^[a-z][a-z0-9-]{0,127}$/);
export { REGISTRY_MAPPING_COL, REGISTRY_MAPPING_FIELD, REGISTRY_OVERRIDE_COL, REGISTRY_OVERRIDE_FIELD, DEPENDENCY_LOCK_COL, DEPENDENCY_LOCK_FIELD, WASM_OPERATION_COL, WASM_OPERATION_FIELD, REGISTRY_MAPPING_ERROR_MSG, REGISTRY_OVERRIDE_ERROR_MSG, DEPENDENCY_LOCK_ERROR_MSG, WASM_OPERATION_ERROR_MSG, NAMESPACE_PATTERN, PACKAGE_NAME_PATTERN };