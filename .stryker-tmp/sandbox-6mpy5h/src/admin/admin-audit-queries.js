/**
 * SQL query builders for auditing source mapping decisions
 * and dependency lock state.
 *
 * Requirements: 4.5, 5.5
 * @module admin/admin-audit-queries
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
import { SQL, TABLES } from '../constants/index.js';
import { REGISTRY_MAPPING_COL, REGISTRY_OVERRIDE_COL, DEPENDENCY_LOCK_COL } from '../wasm-service/wasm-meta-models-constants.js';
import { NUM } from '../constants/numbers.js';
const SELECT_ALL_FROM = stryMutAct_9fa48("256") ? `` : (stryCov_9fa48("256"), `${SQL.SELECT} * FROM`);

/**
 * Build SQL to query registry mappings for audit.
 * @param {string} [namespace] - Optional namespace filter.
 * @return {{sql: string, params: Array}} Query and params.
 */
function buildMappingAuditQuery(namespace) {
  if (stryMutAct_9fa48("257")) {
    {}
  } else {
    stryCov_9fa48("257");
    let sql = stryMutAct_9fa48("258") ? `` : (stryCov_9fa48("258"), `${SELECT_ALL_FROM} ${TABLES.PACKAGE_REGISTRY_MAPPINGS}`);
    const params = stryMutAct_9fa48("259") ? ["Stryker was here"] : (stryCov_9fa48("259"), []);
    if (stryMutAct_9fa48("261") ? false : stryMutAct_9fa48("260") ? true : (stryCov_9fa48("260", "261"), namespace)) {
      if (stryMutAct_9fa48("262")) {
        {}
      } else {
        stryCov_9fa48("262");
        params.push(namespace);
        stryMutAct_9fa48("263") ? sql -= ` ${SQL.WHERE} ${REGISTRY_MAPPING_COL.NAMESPACE}` + ` = $${params.length}` : (stryCov_9fa48("263"), sql += (stryMutAct_9fa48("264") ? `` : (stryCov_9fa48("264"), ` ${SQL.WHERE} ${REGISTRY_MAPPING_COL.NAMESPACE}`)) + (stryMutAct_9fa48("265") ? `` : (stryCov_9fa48("265"), ` = $${params.length}`)));
      }
    }
    return stryMutAct_9fa48("266") ? {} : (stryCov_9fa48("266"), {
      sql,
      params
    });
  }
}

/**
 * Build SQL to query registry overrides with optional filters.
 * @param {string} [namespace] - Optional namespace filter.
 * @param {string} [name] - Optional package name filter.
 * @return {{sql: string, params: Array}} Query and params.
 */
function buildOverrideAuditQuery(namespace, name) {
  if (stryMutAct_9fa48("267")) {
    {}
  } else {
    stryCov_9fa48("267");
    let sql = stryMutAct_9fa48("268") ? `` : (stryCov_9fa48("268"), `${SELECT_ALL_FROM} ${TABLES.PACKAGE_REGISTRY_OVERRIDES}`);
    const conditions = stryMutAct_9fa48("269") ? ["Stryker was here"] : (stryCov_9fa48("269"), []);
    const params = stryMutAct_9fa48("270") ? ["Stryker was here"] : (stryCov_9fa48("270"), []);
    if (stryMutAct_9fa48("272") ? false : stryMutAct_9fa48("271") ? true : (stryCov_9fa48("271", "272"), namespace)) {
      if (stryMutAct_9fa48("273")) {
        {}
      } else {
        stryCov_9fa48("273");
        params.push(namespace);
        conditions.push(stryMutAct_9fa48("274") ? `` : (stryCov_9fa48("274"), `${REGISTRY_OVERRIDE_COL.NAMESPACE} = $${params.length}`));
      }
    }
    if (stryMutAct_9fa48("276") ? false : stryMutAct_9fa48("275") ? true : (stryCov_9fa48("275", "276"), name)) {
      if (stryMutAct_9fa48("277")) {
        {}
      } else {
        stryCov_9fa48("277");
        params.push(name);
        conditions.push(stryMutAct_9fa48("278") ? `` : (stryCov_9fa48("278"), `${REGISTRY_OVERRIDE_COL.NAME} = $${params.length}`));
      }
    }
    if (stryMutAct_9fa48("282") ? conditions.length <= NUM.ZERO : stryMutAct_9fa48("281") ? conditions.length >= NUM.ZERO : stryMutAct_9fa48("280") ? false : stryMutAct_9fa48("279") ? true : (stryCov_9fa48("279", "280", "281", "282"), conditions.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("283")) {
        {}
      } else {
        stryCov_9fa48("283");
        sql += stryMutAct_9fa48("284") ? `` : (stryCov_9fa48("284"), ` ${SQL.WHERE} ${conditions.join(stryMutAct_9fa48("285") ? `` : (stryCov_9fa48("285"), ` ${SQL.AND} `))}`);
      }
    }
    return stryMutAct_9fa48("286") ? {} : (stryCov_9fa48("286"), {
      sql,
      params
    });
  }
}

/**
 * Build SQL to query dependency locks with optional filters.
 * @param {string} [targetNamespace] - Optional target namespace.
 * @param {string} [targetName] - Optional target name.
 * @param {string} [targetVersion] - Optional target version.
 * @return {{sql: string, params: Array}} Query and params.
 */
function buildLockAuditQuery(targetNamespace, targetName, targetVersion) {
  if (stryMutAct_9fa48("287")) {
    {}
  } else {
    stryCov_9fa48("287");
    let sql = stryMutAct_9fa48("288") ? `` : (stryCov_9fa48("288"), `${SELECT_ALL_FROM} ${TABLES.MODULE_DEPENDENCY_LOCKS}`);
    const conditions = stryMutAct_9fa48("289") ? ["Stryker was here"] : (stryCov_9fa48("289"), []);
    const params = stryMutAct_9fa48("290") ? ["Stryker was here"] : (stryCov_9fa48("290"), []);
    if (stryMutAct_9fa48("292") ? false : stryMutAct_9fa48("291") ? true : (stryCov_9fa48("291", "292"), targetNamespace)) {
      if (stryMutAct_9fa48("293")) {
        {}
      } else {
        stryCov_9fa48("293");
        params.push(targetNamespace);
        conditions.push((stryMutAct_9fa48("294") ? `` : (stryCov_9fa48("294"), `${DEPENDENCY_LOCK_COL.TARGET_MODULE_NAMESPACE}`)) + (stryMutAct_9fa48("295") ? `` : (stryCov_9fa48("295"), ` = $${params.length}`)));
      }
    }
    if (stryMutAct_9fa48("297") ? false : stryMutAct_9fa48("296") ? true : (stryCov_9fa48("296", "297"), targetName)) {
      if (stryMutAct_9fa48("298")) {
        {}
      } else {
        stryCov_9fa48("298");
        params.push(targetName);
        conditions.push((stryMutAct_9fa48("299") ? `` : (stryCov_9fa48("299"), `${DEPENDENCY_LOCK_COL.TARGET_MODULE_NAME}`)) + (stryMutAct_9fa48("300") ? `` : (stryCov_9fa48("300"), ` = $${params.length}`)));
      }
    }
    if (stryMutAct_9fa48("302") ? false : stryMutAct_9fa48("301") ? true : (stryCov_9fa48("301", "302"), targetVersion)) {
      if (stryMutAct_9fa48("303")) {
        {}
      } else {
        stryCov_9fa48("303");
        params.push(targetVersion);
        conditions.push((stryMutAct_9fa48("304") ? `` : (stryCov_9fa48("304"), `${DEPENDENCY_LOCK_COL.TARGET_MODULE_VERSION}`)) + (stryMutAct_9fa48("305") ? `` : (stryCov_9fa48("305"), ` = $${params.length}`)));
      }
    }
    if (stryMutAct_9fa48("309") ? conditions.length <= NUM.ZERO : stryMutAct_9fa48("308") ? conditions.length >= NUM.ZERO : stryMutAct_9fa48("307") ? false : stryMutAct_9fa48("306") ? true : (stryCov_9fa48("306", "307", "308", "309"), conditions.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("310")) {
        {}
      } else {
        stryCov_9fa48("310");
        sql += stryMutAct_9fa48("311") ? `` : (stryCov_9fa48("311"), ` ${SQL.WHERE} ${conditions.join(stryMutAct_9fa48("312") ? `` : (stryCov_9fa48("312"), ` ${SQL.AND} `))}`);
      }
    }
    return stryMutAct_9fa48("313") ? {} : (stryCov_9fa48("313"), {
      sql,
      params
    });
  }
}

/**
 * Build a combined resolution trace: override query then mapping
 * query. Caller executes both in order to trace the resolution
 * path for a given namespace/name.
 * @param {string} namespace - Namespace to trace.
 * @param {string} [name] - Optional package name.
 * @return {{overrideQuery: {sql: string, params: Array},
 *   mappingQuery: {sql: string, params: Array}}}
 */
function buildResolutionTraceQuery(namespace, name) {
  if (stryMutAct_9fa48("314")) {
    {}
  } else {
    stryCov_9fa48("314");
    const overrideQuery = buildOverrideAuditQuery(namespace, name);
    const mappingQuery = buildMappingAuditQuery(namespace);
    return stryMutAct_9fa48("315") ? {} : (stryCov_9fa48("315"), {
      overrideQuery,
      mappingQuery
    });
  }
}
export { buildMappingAuditQuery, buildOverrideAuditQuery, buildLockAuditQuery, buildResolutionTraceQuery };