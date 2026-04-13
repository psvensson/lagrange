/**
 * Canonical primary-key descriptor for system-table cache operations.
 *
 * This module is the single owner for resolving the primary-key field
 * used by cache implementations and CDC system-table helpers.
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
import { SYSTEM_TABLE_SCHEMAS } from '../bootstrap/system-table-schemas-constants.js';
const SYSTEM_CACHE_KEY_DESCRIPTOR_ERROR_MSG = Object.freeze(stryMutAct_9fa48("34638") ? {} : (stryCov_9fa48("34638"), {
  missingDescriptor: stryMutAct_9fa48("34639") ? () => undefined : (stryCov_9fa48("34639"), tableName => stryMutAct_9fa48("34640") ? `` : (stryCov_9fa48("34640"), `System cache key descriptor missing for table: ${tableName}`))
}));
const SYSTEM_CACHE_KEY_FALLBACK = stryMutAct_9fa48("34641") ? "" : (stryCov_9fa48("34641"), 'id');

/**
 * Resolve the canonical key field for a table schema.
 * Uses explicit composite primaryKey metadata first, then column-level flags.
 *
 * @param {Object} schema - System table schema descriptor.
 * @return {string|undefined} Canonical key field, if present.
 */
function resolveSchemaPrimaryKeyField(schema) {
  if (stryMutAct_9fa48("34642")) {
    {}
  } else {
    stryCov_9fa48("34642");
    if (stryMutAct_9fa48("34645") ? schema?.primaryKey && Array.isArray(schema.primaryKey) || schema.primaryKey.length > 0 : stryMutAct_9fa48("34644") ? false : stryMutAct_9fa48("34643") ? true : (stryCov_9fa48("34643", "34644", "34645"), (stryMutAct_9fa48("34647") ? schema?.primaryKey || Array.isArray(schema.primaryKey) : stryMutAct_9fa48("34646") ? true : (stryCov_9fa48("34646", "34647"), (stryMutAct_9fa48("34648") ? schema.primaryKey : (stryCov_9fa48("34648"), schema?.primaryKey)) && Array.isArray(schema.primaryKey))) && (stryMutAct_9fa48("34651") ? schema.primaryKey.length <= 0 : stryMutAct_9fa48("34650") ? schema.primaryKey.length >= 0 : stryMutAct_9fa48("34649") ? true : (stryCov_9fa48("34649", "34650", "34651"), schema.primaryKey.length > 0)))) {
      if (stryMutAct_9fa48("34652")) {
        {}
      } else {
        stryCov_9fa48("34652");
        return schema.primaryKey[0];
      }
    }
    if (stryMutAct_9fa48("34655") ? false : stryMutAct_9fa48("34654") ? true : stryMutAct_9fa48("34653") ? Array.isArray(schema?.columns) : (stryCov_9fa48("34653", "34654", "34655"), !Array.isArray(stryMutAct_9fa48("34656") ? schema.columns : (stryCov_9fa48("34656"), schema?.columns)))) {
      if (stryMutAct_9fa48("34657")) {
        {}
      } else {
        stryCov_9fa48("34657");
        return undefined;
      }
    }
    const keyColumn = schema.columns.find(stryMutAct_9fa48("34658") ? () => undefined : (stryCov_9fa48("34658"), column => stryMutAct_9fa48("34661") ? column.primaryKey !== true : stryMutAct_9fa48("34660") ? false : stryMutAct_9fa48("34659") ? true : (stryCov_9fa48("34659", "34660", "34661"), column.primaryKey === (stryMutAct_9fa48("34662") ? false : (stryCov_9fa48("34662"), true)))));
    return stryMutAct_9fa48("34663") ? keyColumn.name : (stryCov_9fa48("34663"), keyColumn?.name);
  }
}
const descriptor = {};
for (const schema of SYSTEM_TABLE_SCHEMAS) {
  if (stryMutAct_9fa48("34664")) {
    {}
  } else {
    stryCov_9fa48("34664");
    const keyField = resolveSchemaPrimaryKeyField(schema);
    if (stryMutAct_9fa48("34667") ? !schema?.tableName && !keyField : stryMutAct_9fa48("34666") ? false : stryMutAct_9fa48("34665") ? true : (stryCov_9fa48("34665", "34666", "34667"), (stryMutAct_9fa48("34668") ? schema?.tableName : (stryCov_9fa48("34668"), !(stryMutAct_9fa48("34669") ? schema.tableName : (stryCov_9fa48("34669"), schema?.tableName)))) || (stryMutAct_9fa48("34670") ? keyField : (stryCov_9fa48("34670"), !keyField)))) {
      if (stryMutAct_9fa48("34671")) {
        {}
      } else {
        stryCov_9fa48("34671");
        continue;
      }
    }
    descriptor[schema.tableName] = keyField;
  }
}
const SYSTEM_CACHE_KEY_DESCRIPTOR = Object.freeze(stryMutAct_9fa48("34672") ? {} : (stryCov_9fa48("34672"), {
  ...descriptor
}));

/**
 * Get canonical key field for a system table.
 * Fails fast when descriptor is missing.
 *
 * @param {string} tableName - System table name.
 * @return {string} Canonical key field.
 */
function getSystemCachePrimaryKeyField(tableName) {
  if (stryMutAct_9fa48("34673")) {
    {}
  } else {
    stryCov_9fa48("34673");
    const keyField = SYSTEM_CACHE_KEY_DESCRIPTOR[tableName];
    if (stryMutAct_9fa48("34676") ? false : stryMutAct_9fa48("34675") ? true : stryMutAct_9fa48("34674") ? keyField : (stryCov_9fa48("34674", "34675", "34676"), !keyField)) {
      if (stryMutAct_9fa48("34677")) {
        {}
      } else {
        stryCov_9fa48("34677");
        throw new Error(SYSTEM_CACHE_KEY_DESCRIPTOR_ERROR_MSG.missingDescriptor(tableName));
      }
    }
    return keyField;
  }
}

/**
 * Get canonical key field for a system table with fallback.
 *
 * @param {string} tableName - System table name.
 * @param {string} fallback - Fallback key field.
 * @return {string} Canonical key field or fallback.
 */
function getSystemCachePrimaryKeyFieldOrFallback(tableName, fallback = SYSTEM_CACHE_KEY_FALLBACK) {
  if (stryMutAct_9fa48("34678")) {
    {}
  } else {
    stryCov_9fa48("34678");
    const keyField = SYSTEM_CACHE_KEY_DESCRIPTOR[tableName];
    return stryMutAct_9fa48("34681") ? keyField && fallback : stryMutAct_9fa48("34680") ? false : stryMutAct_9fa48("34679") ? true : (stryCov_9fa48("34679", "34680", "34681"), keyField || fallback);
  }
}
export { SYSTEM_CACHE_KEY_DESCRIPTOR, SYSTEM_CACHE_KEY_DESCRIPTOR_ERROR_MSG, SYSTEM_CACHE_KEY_FALLBACK, getSystemCachePrimaryKeyField, getSystemCachePrimaryKeyFieldOrFallback };