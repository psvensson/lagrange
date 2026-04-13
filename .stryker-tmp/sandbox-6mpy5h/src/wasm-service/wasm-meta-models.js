/**
 * Row models for WASM meta-service tables.
 *
 * Serializers, deserializers, and validators for:
 * - package_registry_mappings
 * - package_registry_overrides
 * - module_dependency_locks
 * - wasm_operations
 *
 * Requirements: 3.2, 5.2, 10.4
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
import { NUM, STRING, TYPEOF, WASM_OPERATION_STATE } from '../constants/index.js';
import { REGISTRY_MAPPING_COL as RM_COL, REGISTRY_MAPPING_FIELD as RM, REGISTRY_OVERRIDE_COL as RO_COL, REGISTRY_OVERRIDE_FIELD as RO, DEPENDENCY_LOCK_COL as DL_COL, DEPENDENCY_LOCK_FIELD as DL, WASM_OPERATION_COL as WO_COL, WASM_OPERATION_FIELD as WO, REGISTRY_MAPPING_ERROR_MSG as RM_ERR, REGISTRY_OVERRIDE_ERROR_MSG as RO_ERR, DEPENDENCY_LOCK_ERROR_MSG as DL_ERR, WASM_OPERATION_ERROR_MSG as WO_ERR, NAMESPACE_PATTERN, PACKAGE_NAME_PATTERN } from './wasm-meta-models-constants.js';
const VALID_OP_STATES = new Set(Object.values(WASM_OPERATION_STATE));

// ---- Registry Mapping ----

/**
 * Validate a registry mapping object.
 * @param {Object} mapping - Registry mapping to validate.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateRegistryMapping(mapping) {
  if (stryMutAct_9fa48("163603")) {
    {}
  } else {
    stryCov_9fa48("163603");
    const errors = stryMutAct_9fa48("163604") ? ["Stryker was here"] : (stryCov_9fa48("163604"), []);
    if (stryMutAct_9fa48("163607") ? false : stryMutAct_9fa48("163606") ? true : stryMutAct_9fa48("163605") ? mapping[RM.NAMESPACE] : (stryCov_9fa48("163605", "163606", "163607"), !mapping[RM.NAMESPACE])) {
      if (stryMutAct_9fa48("163608")) {
        {}
      } else {
        stryCov_9fa48("163608");
        errors.push(RM_ERR.NAMESPACE_REQUIRED);
      }
    } else if (stryMutAct_9fa48("163611") ? false : stryMutAct_9fa48("163610") ? true : stryMutAct_9fa48("163609") ? NAMESPACE_PATTERN.test(mapping[RM.NAMESPACE]) : (stryCov_9fa48("163609", "163610", "163611"), !NAMESPACE_PATTERN.test(mapping[RM.NAMESPACE]))) {
      if (stryMutAct_9fa48("163612")) {
        {}
      } else {
        stryCov_9fa48("163612");
        errors.push(RM_ERR.NAMESPACE_INVALID_FORMAT);
      }
    }
    if (stryMutAct_9fa48("163615") ? false : stryMutAct_9fa48("163614") ? true : stryMutAct_9fa48("163613") ? mapping[RM.REGISTRY_URL] : (stryCov_9fa48("163613", "163614", "163615"), !mapping[RM.REGISTRY_URL])) {
      if (stryMutAct_9fa48("163616")) {
        {}
      } else {
        stryCov_9fa48("163616");
        errors.push(RM_ERR.REGISTRY_URL_REQUIRED);
      }
    }
    return stryMutAct_9fa48("163617") ? {} : (stryCov_9fa48("163617"), {
      valid: stryMutAct_9fa48("163620") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("163619") ? false : stryMutAct_9fa48("163618") ? true : (stryCov_9fa48("163618", "163619", "163620"), errors.length === NUM.ZERO),
      errors
    });
  }
}

/**
 * Serialize a registry mapping to a table row.
 * @param {Object} mapping - Registry mapping object.
 * @return {Object} Table row with snake_case keys.
 */
function serializeRegistryMapping(mapping) {
  if (stryMutAct_9fa48("163621")) {
    {}
  } else {
    stryCov_9fa48("163621");
    const now = Date.now();
    return stryMutAct_9fa48("163622") ? {} : (stryCov_9fa48("163622"), {
      [RM_COL.NAMESPACE]: mapping[RM.NAMESPACE],
      [RM_COL.REGISTRY_URL]: mapping[RM.REGISTRY_URL],
      [RM_COL.POLICY_METADATA]: JSON.stringify(stryMutAct_9fa48("163625") ? mapping[RM.POLICY_METADATA] && {} : stryMutAct_9fa48("163624") ? false : stryMutAct_9fa48("163623") ? true : (stryCov_9fa48("163623", "163624", "163625"), mapping[RM.POLICY_METADATA] || {})),
      [RM_COL.CREATED_AT]: stryMutAct_9fa48("163626") ? mapping.createdAt && now : (stryCov_9fa48("163626"), mapping.createdAt ?? now),
      [RM_COL.UPDATED_AT]: stryMutAct_9fa48("163627") ? mapping.updatedAt && now : (stryCov_9fa48("163627"), mapping.updatedAt ?? now)
    });
  }
}

/**
 * Deserialize a table row to a registry mapping object.
 * @param {Object} row - Table row with snake_case keys.
 * @return {Object} Registry mapping with camelCase keys.
 */
function deserializeRegistryMapping(row) {
  if (stryMutAct_9fa48("163628")) {
    {}
  } else {
    stryCov_9fa48("163628");
    return stryMutAct_9fa48("163629") ? {} : (stryCov_9fa48("163629"), {
      [RM.NAMESPACE]: row[RM_COL.NAMESPACE],
      [RM.REGISTRY_URL]: row[RM_COL.REGISTRY_URL],
      [RM.POLICY_METADATA]: JSON.parse(stryMutAct_9fa48("163632") ? row[RM_COL.POLICY_METADATA] && STRING.EMPTY_JSON_OBJECT : stryMutAct_9fa48("163631") ? false : stryMutAct_9fa48("163630") ? true : (stryCov_9fa48("163630", "163631", "163632"), row[RM_COL.POLICY_METADATA] || STRING.EMPTY_JSON_OBJECT)),
      createdAt: stryMutAct_9fa48("163633") ? row[RM_COL.CREATED_AT] && NUM.ZERO : (stryCov_9fa48("163633"), row[RM_COL.CREATED_AT] ?? NUM.ZERO),
      updatedAt: stryMutAct_9fa48("163634") ? row[RM_COL.UPDATED_AT] && NUM.ZERO : (stryCov_9fa48("163634"), row[RM_COL.UPDATED_AT] ?? NUM.ZERO)
    });
  }
}

// ---- Registry Override ----

/**
 * Validate a registry override object.
 * @param {Object} override - Registry override to validate.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateRegistryOverride(override) {
  if (stryMutAct_9fa48("163635")) {
    {}
  } else {
    stryCov_9fa48("163635");
    const errors = stryMutAct_9fa48("163636") ? ["Stryker was here"] : (stryCov_9fa48("163636"), []);
    if (stryMutAct_9fa48("163639") ? false : stryMutAct_9fa48("163638") ? true : stryMutAct_9fa48("163637") ? override[RO.NAMESPACE] : (stryCov_9fa48("163637", "163638", "163639"), !override[RO.NAMESPACE])) {
      if (stryMutAct_9fa48("163640")) {
        {}
      } else {
        stryCov_9fa48("163640");
        errors.push(RO_ERR.NAMESPACE_REQUIRED);
      }
    } else if (stryMutAct_9fa48("163643") ? false : stryMutAct_9fa48("163642") ? true : stryMutAct_9fa48("163641") ? NAMESPACE_PATTERN.test(override[RO.NAMESPACE]) : (stryCov_9fa48("163641", "163642", "163643"), !NAMESPACE_PATTERN.test(override[RO.NAMESPACE]))) {
      if (stryMutAct_9fa48("163644")) {
        {}
      } else {
        stryCov_9fa48("163644");
        errors.push(RO_ERR.NAMESPACE_INVALID_FORMAT);
      }
    }
    if (stryMutAct_9fa48("163647") ? false : stryMutAct_9fa48("163646") ? true : stryMutAct_9fa48("163645") ? override[RO.NAME] : (stryCov_9fa48("163645", "163646", "163647"), !override[RO.NAME])) {
      if (stryMutAct_9fa48("163648")) {
        {}
      } else {
        stryCov_9fa48("163648");
        errors.push(RO_ERR.NAME_REQUIRED);
      }
    } else if (stryMutAct_9fa48("163651") ? false : stryMutAct_9fa48("163650") ? true : stryMutAct_9fa48("163649") ? PACKAGE_NAME_PATTERN.test(override[RO.NAME]) : (stryCov_9fa48("163649", "163650", "163651"), !PACKAGE_NAME_PATTERN.test(override[RO.NAME]))) {
      if (stryMutAct_9fa48("163652")) {
        {}
      } else {
        stryCov_9fa48("163652");
        errors.push(RO_ERR.NAME_INVALID_FORMAT);
      }
    }
    if (stryMutAct_9fa48("163655") ? false : stryMutAct_9fa48("163654") ? true : stryMutAct_9fa48("163653") ? override[RO.REGISTRY_URL] : (stryCov_9fa48("163653", "163654", "163655"), !override[RO.REGISTRY_URL])) {
      if (stryMutAct_9fa48("163656")) {
        {}
      } else {
        stryCov_9fa48("163656");
        errors.push(RO_ERR.REGISTRY_URL_REQUIRED);
      }
    }
    return stryMutAct_9fa48("163657") ? {} : (stryCov_9fa48("163657"), {
      valid: stryMutAct_9fa48("163660") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("163659") ? false : stryMutAct_9fa48("163658") ? true : (stryCov_9fa48("163658", "163659", "163660"), errors.length === NUM.ZERO),
      errors
    });
  }
}

/**
 * Serialize a registry override to a table row.
 * @param {Object} override - Registry override object.
 * @return {Object} Table row with snake_case keys.
 */
function serializeRegistryOverride(override) {
  if (stryMutAct_9fa48("163661")) {
    {}
  } else {
    stryCov_9fa48("163661");
    const now = Date.now();
    return stryMutAct_9fa48("163662") ? {} : (stryCov_9fa48("163662"), {
      [RO_COL.NAMESPACE]: override[RO.NAMESPACE],
      [RO_COL.NAME]: override[RO.NAME],
      [RO_COL.REGISTRY_URL]: override[RO.REGISTRY_URL],
      [RO_COL.POLICY_METADATA]: JSON.stringify(stryMutAct_9fa48("163665") ? override[RO.POLICY_METADATA] && {} : stryMutAct_9fa48("163664") ? false : stryMutAct_9fa48("163663") ? true : (stryCov_9fa48("163663", "163664", "163665"), override[RO.POLICY_METADATA] || {})),
      [RO_COL.CREATED_AT]: stryMutAct_9fa48("163666") ? override.createdAt && now : (stryCov_9fa48("163666"), override.createdAt ?? now),
      [RO_COL.UPDATED_AT]: stryMutAct_9fa48("163667") ? override.updatedAt && now : (stryCov_9fa48("163667"), override.updatedAt ?? now)
    });
  }
}

/**
 * Deserialize a table row to a registry override object.
 * @param {Object} row - Table row with snake_case keys.
 * @return {Object} Registry override with camelCase keys.
 */
function deserializeRegistryOverride(row) {
  if (stryMutAct_9fa48("163668")) {
    {}
  } else {
    stryCov_9fa48("163668");
    return stryMutAct_9fa48("163669") ? {} : (stryCov_9fa48("163669"), {
      [RO.NAMESPACE]: row[RO_COL.NAMESPACE],
      [RO.NAME]: row[RO_COL.NAME],
      [RO.REGISTRY_URL]: row[RO_COL.REGISTRY_URL],
      [RO.POLICY_METADATA]: JSON.parse(stryMutAct_9fa48("163672") ? row[RO_COL.POLICY_METADATA] && STRING.EMPTY_JSON_OBJECT : stryMutAct_9fa48("163671") ? false : stryMutAct_9fa48("163670") ? true : (stryCov_9fa48("163670", "163671", "163672"), row[RO_COL.POLICY_METADATA] || STRING.EMPTY_JSON_OBJECT)),
      createdAt: stryMutAct_9fa48("163673") ? row[RO_COL.CREATED_AT] && NUM.ZERO : (stryCov_9fa48("163673"), row[RO_COL.CREATED_AT] ?? NUM.ZERO),
      updatedAt: stryMutAct_9fa48("163674") ? row[RO_COL.UPDATED_AT] && NUM.ZERO : (stryCov_9fa48("163674"), row[RO_COL.UPDATED_AT] ?? NUM.ZERO)
    });
  }
}

// ---- Dependency Lock ----

/**
 * Validate a dependency lock object.
 * @param {Object} lock - Dependency lock to validate.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateDependencyLock(lock) {
  if (stryMutAct_9fa48("163675")) {
    {}
  } else {
    stryCov_9fa48("163675");
    const errors = stryMutAct_9fa48("163676") ? ["Stryker was here"] : (stryCov_9fa48("163676"), []);
    if (stryMutAct_9fa48("163679") ? false : stryMutAct_9fa48("163678") ? true : stryMutAct_9fa48("163677") ? lock[DL.LOCK_ID] : (stryCov_9fa48("163677", "163678", "163679"), !lock[DL.LOCK_ID])) {
      if (stryMutAct_9fa48("163680")) {
        {}
      } else {
        stryCov_9fa48("163680");
        errors.push(DL_ERR.LOCK_ID_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("163683") ? false : stryMutAct_9fa48("163682") ? true : stryMutAct_9fa48("163681") ? lock[DL.TARGET_MODULE_NAMESPACE] : (stryCov_9fa48("163681", "163682", "163683"), !lock[DL.TARGET_MODULE_NAMESPACE])) {
      if (stryMutAct_9fa48("163684")) {
        {}
      } else {
        stryCov_9fa48("163684");
        errors.push(DL_ERR.TARGET_NAMESPACE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("163687") ? false : stryMutAct_9fa48("163686") ? true : stryMutAct_9fa48("163685") ? lock[DL.TARGET_MODULE_NAME] : (stryCov_9fa48("163685", "163686", "163687"), !lock[DL.TARGET_MODULE_NAME])) {
      if (stryMutAct_9fa48("163688")) {
        {}
      } else {
        stryCov_9fa48("163688");
        errors.push(DL_ERR.TARGET_NAME_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("163691") ? false : stryMutAct_9fa48("163690") ? true : stryMutAct_9fa48("163689") ? lock[DL.TARGET_MODULE_VERSION] : (stryCov_9fa48("163689", "163690", "163691"), !lock[DL.TARGET_MODULE_VERSION])) {
      if (stryMutAct_9fa48("163692")) {
        {}
      } else {
        stryCov_9fa48("163692");
        errors.push(DL_ERR.TARGET_VERSION_REQUIRED);
      }
    }
    const deps = lock[DL.RESOLVED_DEPENDENCIES];
    if (stryMutAct_9fa48("163695") ? deps !== undefined && deps !== null || !Array.isArray(deps) : stryMutAct_9fa48("163694") ? false : stryMutAct_9fa48("163693") ? true : (stryCov_9fa48("163693", "163694", "163695"), (stryMutAct_9fa48("163697") ? deps !== undefined || deps !== null : stryMutAct_9fa48("163696") ? true : (stryCov_9fa48("163696", "163697"), (stryMutAct_9fa48("163699") ? deps === undefined : stryMutAct_9fa48("163698") ? true : (stryCov_9fa48("163698", "163699"), deps !== undefined)) && (stryMutAct_9fa48("163701") ? deps === null : stryMutAct_9fa48("163700") ? true : (stryCov_9fa48("163700", "163701"), deps !== null)))) && (stryMutAct_9fa48("163702") ? Array.isArray(deps) : (stryCov_9fa48("163702"), !Array.isArray(deps))))) {
      if (stryMutAct_9fa48("163703")) {
        {}
      } else {
        stryCov_9fa48("163703");
        errors.push(DL_ERR.RESOLVED_DEPS_NOT_ARRAY);
      }
    }
    return stryMutAct_9fa48("163704") ? {} : (stryCov_9fa48("163704"), {
      valid: stryMutAct_9fa48("163707") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("163706") ? false : stryMutAct_9fa48("163705") ? true : (stryCov_9fa48("163705", "163706", "163707"), errors.length === NUM.ZERO),
      errors
    });
  }
}

/**
 * Serialize a dependency lock to a table row.
 * @param {Object} lock - Dependency lock object.
 * @return {Object} Table row with snake_case keys.
 */
function serializeDependencyLock(lock) {
  if (stryMutAct_9fa48("163708")) {
    {}
  } else {
    stryCov_9fa48("163708");
    const now = Date.now();
    return stryMutAct_9fa48("163709") ? {} : (stryCov_9fa48("163709"), {
      [DL_COL.LOCK_ID]: lock[DL.LOCK_ID],
      [DL_COL.TARGET_MODULE_NAMESPACE]: lock[DL.TARGET_MODULE_NAMESPACE],
      [DL_COL.TARGET_MODULE_NAME]: lock[DL.TARGET_MODULE_NAME],
      [DL_COL.TARGET_MODULE_VERSION]: lock[DL.TARGET_MODULE_VERSION],
      [DL_COL.TARGET_SERVICE_ID]: stryMutAct_9fa48("163710") ? lock[DL.TARGET_SERVICE_ID] && null : (stryCov_9fa48("163710"), lock[DL.TARGET_SERVICE_ID] ?? null),
      [DL_COL.RESOLVED_DEPENDENCIES]: JSON.stringify(stryMutAct_9fa48("163713") ? lock[DL.RESOLVED_DEPENDENCIES] && [] : stryMutAct_9fa48("163712") ? false : stryMutAct_9fa48("163711") ? true : (stryCov_9fa48("163711", "163712", "163713"), lock[DL.RESOLVED_DEPENDENCIES] || (stryMutAct_9fa48("163714") ? ["Stryker was here"] : (stryCov_9fa48("163714"), [])))),
      [DL_COL.CREATED_AT]: stryMutAct_9fa48("163715") ? lock.createdAt && now : (stryCov_9fa48("163715"), lock.createdAt ?? now)
    });
  }
}

/**
 * Deserialize a table row to a dependency lock object.
 * @param {Object} row - Table row with snake_case keys.
 * @return {Object} Dependency lock with camelCase keys.
 */
function deserializeDependencyLock(row) {
  if (stryMutAct_9fa48("163716")) {
    {}
  } else {
    stryCov_9fa48("163716");
    return stryMutAct_9fa48("163717") ? {} : (stryCov_9fa48("163717"), {
      [DL.LOCK_ID]: row[DL_COL.LOCK_ID],
      [DL.TARGET_MODULE_NAMESPACE]: row[DL_COL.TARGET_MODULE_NAMESPACE],
      [DL.TARGET_MODULE_NAME]: row[DL_COL.TARGET_MODULE_NAME],
      [DL.TARGET_MODULE_VERSION]: row[DL_COL.TARGET_MODULE_VERSION],
      [DL.TARGET_SERVICE_ID]: stryMutAct_9fa48("163718") ? row[DL_COL.TARGET_SERVICE_ID] && null : (stryCov_9fa48("163718"), row[DL_COL.TARGET_SERVICE_ID] ?? null),
      [DL.RESOLVED_DEPENDENCIES]: JSON.parse(stryMutAct_9fa48("163721") ? row[DL_COL.RESOLVED_DEPENDENCIES] && STRING.EMPTY_JSON_ARRAY : stryMutAct_9fa48("163720") ? false : stryMutAct_9fa48("163719") ? true : (stryCov_9fa48("163719", "163720", "163721"), row[DL_COL.RESOLVED_DEPENDENCIES] || STRING.EMPTY_JSON_ARRAY)),
      createdAt: stryMutAct_9fa48("163722") ? row[DL_COL.CREATED_AT] && NUM.ZERO : (stryCov_9fa48("163722"), row[DL_COL.CREATED_AT] ?? NUM.ZERO)
    });
  }
}

// ---- Wasm Operation ----

/**
 * Validate a wasm operation object.
 * @param {Object} operation - Wasm operation to validate.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateWasmOperation(operation) {
  if (stryMutAct_9fa48("163723")) {
    {}
  } else {
    stryCov_9fa48("163723");
    const errors = stryMutAct_9fa48("163724") ? ["Stryker was here"] : (stryCov_9fa48("163724"), []);
    if (stryMutAct_9fa48("163727") ? false : stryMutAct_9fa48("163726") ? true : stryMutAct_9fa48("163725") ? operation[WO.OPERATION_ID] : (stryCov_9fa48("163725", "163726", "163727"), !operation[WO.OPERATION_ID])) {
      if (stryMutAct_9fa48("163728")) {
        {}
      } else {
        stryCov_9fa48("163728");
        errors.push(WO_ERR.OPERATION_ID_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("163731") ? false : stryMutAct_9fa48("163730") ? true : stryMutAct_9fa48("163729") ? operation[WO.TENANT_ID] : (stryCov_9fa48("163729", "163730", "163731"), !operation[WO.TENANT_ID])) {
      if (stryMutAct_9fa48("163732")) {
        {}
      } else {
        stryCov_9fa48("163732");
        errors.push(WO_ERR.TENANT_ID_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("163735") ? false : stryMutAct_9fa48("163734") ? true : stryMutAct_9fa48("163733") ? operation[WO.COMMAND] : (stryCov_9fa48("163733", "163734", "163735"), !operation[WO.COMMAND])) {
      if (stryMutAct_9fa48("163736")) {
        {}
      } else {
        stryCov_9fa48("163736");
        errors.push(WO_ERR.COMMAND_REQUIRED);
      }
    }
    const state = operation[WO.STATE];
    if (stryMutAct_9fa48("163739") ? state || !VALID_OP_STATES.has(state) : stryMutAct_9fa48("163738") ? false : stryMutAct_9fa48("163737") ? true : (stryCov_9fa48("163737", "163738", "163739"), state && (stryMutAct_9fa48("163740") ? VALID_OP_STATES.has(state) : (stryCov_9fa48("163740"), !VALID_OP_STATES.has(state))))) {
      if (stryMutAct_9fa48("163741")) {
        {}
      } else {
        stryCov_9fa48("163741");
        errors.push(WO_ERR.STATE_INVALID);
      }
    }
    return stryMutAct_9fa48("163742") ? {} : (stryCov_9fa48("163742"), {
      valid: stryMutAct_9fa48("163745") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("163744") ? false : stryMutAct_9fa48("163743") ? true : (stryCov_9fa48("163743", "163744", "163745"), errors.length === NUM.ZERO),
      errors
    });
  }
}

/**
 * Serialize a wasm operation to a table row.
 * @param {Object} operation - Wasm operation object.
 * @return {Object} Table row with snake_case keys.
 */
function serializeWasmOperation(operation) {
  if (stryMutAct_9fa48("163746")) {
    {}
  } else {
    stryCov_9fa48("163746");
    const now = Date.now();
    return stryMutAct_9fa48("163747") ? {} : (stryCov_9fa48("163747"), {
      [WO_COL.OPERATION_ID]: operation[WO.OPERATION_ID],
      [WO_COL.TENANT_ID]: operation[WO.TENANT_ID],
      [WO_COL.COMMAND]: operation[WO.COMMAND],
      [WO_COL.IDEMPOTENCY_KEY]: stryMutAct_9fa48("163748") ? operation[WO.IDEMPOTENCY_KEY] && null : (stryCov_9fa48("163748"), operation[WO.IDEMPOTENCY_KEY] ?? null),
      [WO_COL.STATE]: stryMutAct_9fa48("163749") ? operation[WO.STATE] && WASM_OPERATION_STATE.PENDING : (stryCov_9fa48("163749"), operation[WO.STATE] ?? WASM_OPERATION_STATE.PENDING),
      [WO_COL.RESULT]: JSON.stringify(stryMutAct_9fa48("163752") ? operation[WO.RESULT] && {} : stryMutAct_9fa48("163751") ? false : stryMutAct_9fa48("163750") ? true : (stryCov_9fa48("163750", "163751", "163752"), operation[WO.RESULT] || {})),
      [WO_COL.ERROR]: JSON.stringify(stryMutAct_9fa48("163755") ? operation[WO.ERROR] && {} : stryMutAct_9fa48("163754") ? false : stryMutAct_9fa48("163753") ? true : (stryCov_9fa48("163753", "163754", "163755"), operation[WO.ERROR] || {})),
      [WO_COL.CREATED_AT]: stryMutAct_9fa48("163756") ? operation.createdAt && now : (stryCov_9fa48("163756"), operation.createdAt ?? now),
      [WO_COL.UPDATED_AT]: stryMutAct_9fa48("163757") ? operation.updatedAt && now : (stryCov_9fa48("163757"), operation.updatedAt ?? now)
    });
  }
}

/**
 * Deserialize a table row to a wasm operation object.
 * @param {Object} row - Table row with snake_case keys.
 * @return {Object} Wasm operation with camelCase keys.
 */
function deserializeWasmOperation(row) {
  if (stryMutAct_9fa48("163758")) {
    {}
  } else {
    stryCov_9fa48("163758");
    return stryMutAct_9fa48("163759") ? {} : (stryCov_9fa48("163759"), {
      [WO.OPERATION_ID]: row[WO_COL.OPERATION_ID],
      [WO.TENANT_ID]: row[WO_COL.TENANT_ID],
      [WO.COMMAND]: row[WO_COL.COMMAND],
      [WO.IDEMPOTENCY_KEY]: stryMutAct_9fa48("163760") ? row[WO_COL.IDEMPOTENCY_KEY] && null : (stryCov_9fa48("163760"), row[WO_COL.IDEMPOTENCY_KEY] ?? null),
      [WO.STATE]: stryMutAct_9fa48("163761") ? row[WO_COL.STATE] && WASM_OPERATION_STATE.PENDING : (stryCov_9fa48("163761"), row[WO_COL.STATE] ?? WASM_OPERATION_STATE.PENDING),
      [WO.RESULT]: JSON.parse(stryMutAct_9fa48("163764") ? row[WO_COL.RESULT] && STRING.EMPTY_JSON_OBJECT : stryMutAct_9fa48("163763") ? false : stryMutAct_9fa48("163762") ? true : (stryCov_9fa48("163762", "163763", "163764"), row[WO_COL.RESULT] || STRING.EMPTY_JSON_OBJECT)),
      [WO.ERROR]: JSON.parse(stryMutAct_9fa48("163767") ? row[WO_COL.ERROR] && STRING.EMPTY_JSON_OBJECT : stryMutAct_9fa48("163766") ? false : stryMutAct_9fa48("163765") ? true : (stryCov_9fa48("163765", "163766", "163767"), row[WO_COL.ERROR] || STRING.EMPTY_JSON_OBJECT)),
      createdAt: stryMutAct_9fa48("163768") ? row[WO_COL.CREATED_AT] && NUM.ZERO : (stryCov_9fa48("163768"), row[WO_COL.CREATED_AT] ?? NUM.ZERO),
      updatedAt: stryMutAct_9fa48("163769") ? row[WO_COL.UPDATED_AT] && NUM.ZERO : (stryCov_9fa48("163769"), row[WO_COL.UPDATED_AT] ?? NUM.ZERO)
    });
  }
}
export { validateRegistryMapping, serializeRegistryMapping, deserializeRegistryMapping, validateRegistryOverride, serializeRegistryOverride, deserializeRegistryOverride, validateDependencyLock, serializeDependencyLock, deserializeDependencyLock, validateWasmOperation, serializeWasmOperation, deserializeWasmOperation };