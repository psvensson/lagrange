/**
 * Join Schema Version Resolver — pure helpers for schema-version
 * comparison, extraction, and resolution during node join.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * Every function is stateless; instance context (bootstrap snapshots,
 * cache handles) is passed in explicitly.
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
import { NUM, TABLES, TYPEOF } from '../constants/index.js';
import { JOIN_READINESS_SCHEMA_FIELDS } from './node-joining-constants.js';
const HLC_DELIMITER = stryMutAct_9fa48("15058") ? "" : (stryCov_9fa48("15058"), ':');

/**
 * Parse HLC-like schema version.
 * @param {string} value
 * @return {{physical: number, logical: number, nodeId: string}|null}
 */
export function tryParseJoinSchemaHlc(value) {
  if (stryMutAct_9fa48("15059")) {
    {}
  } else {
    stryCov_9fa48("15059");
    const parts = String(stryMutAct_9fa48("15062") ? value && '' : stryMutAct_9fa48("15061") ? false : stryMutAct_9fa48("15060") ? true : (stryCov_9fa48("15060", "15061", "15062"), value || (stryMutAct_9fa48("15063") ? "Stryker was here!" : (stryCov_9fa48("15063"), '')))).split(HLC_DELIMITER);
    if (stryMutAct_9fa48("15067") ? parts.length >= NUM.THREE : stryMutAct_9fa48("15066") ? parts.length <= NUM.THREE : stryMutAct_9fa48("15065") ? false : stryMutAct_9fa48("15064") ? true : (stryCov_9fa48("15064", "15065", "15066", "15067"), parts.length < NUM.THREE)) {
      if (stryMutAct_9fa48("15068")) {
        {}
      } else {
        stryCov_9fa48("15068");
        return null;
      }
    }
    const physical = Number.parseInt(parts[NUM.ZERO], 10);
    const logical = Number.parseInt(parts[NUM.ONE], 10);
    if (stryMutAct_9fa48("15071") ? !Number.isFinite(physical) && !Number.isFinite(logical) : stryMutAct_9fa48("15070") ? false : stryMutAct_9fa48("15069") ? true : (stryCov_9fa48("15069", "15070", "15071"), (stryMutAct_9fa48("15072") ? Number.isFinite(physical) : (stryCov_9fa48("15072"), !Number.isFinite(physical))) || (stryMutAct_9fa48("15073") ? Number.isFinite(logical) : (stryCov_9fa48("15073"), !Number.isFinite(logical))))) {
      if (stryMutAct_9fa48("15074")) {
        {}
      } else {
        stryCov_9fa48("15074");
        return null;
      }
    }
    return stryMutAct_9fa48("15075") ? {} : (stryCov_9fa48("15075"), {
      physical,
      logical,
      nodeId: stryMutAct_9fa48("15076") ? parts.join(HLC_DELIMITER) : (stryCov_9fa48("15076"), parts.slice(NUM.TWO).join(HLC_DELIMITER))
    });
  }
}

/**
 * Compare schema versions supporting HLC and numeric fallback.
 * @param {string} left
 * @param {string} right
 * @return {number}
 */
export function compareJoinSchemaVersions(left, right) {
  if (stryMutAct_9fa48("15077")) {
    {}
  } else {
    stryCov_9fa48("15077");
    if (stryMutAct_9fa48("15080") ? left !== right : stryMutAct_9fa48("15079") ? false : stryMutAct_9fa48("15078") ? true : (stryCov_9fa48("15078", "15079", "15080"), left === right)) {
      if (stryMutAct_9fa48("15081")) {
        {}
      } else {
        stryCov_9fa48("15081");
        return NUM.ZERO;
      }
    }
    const leftHlc = tryParseJoinSchemaHlc(left);
    const rightHlc = tryParseJoinSchemaHlc(right);
    if (stryMutAct_9fa48("15084") ? leftHlc || rightHlc : stryMutAct_9fa48("15083") ? false : stryMutAct_9fa48("15082") ? true : (stryCov_9fa48("15082", "15083", "15084"), leftHlc && rightHlc)) {
      if (stryMutAct_9fa48("15085")) {
        {}
      } else {
        stryCov_9fa48("15085");
        if (stryMutAct_9fa48("15088") ? leftHlc.physical === rightHlc.physical : stryMutAct_9fa48("15087") ? false : stryMutAct_9fa48("15086") ? true : (stryCov_9fa48("15086", "15087", "15088"), leftHlc.physical !== rightHlc.physical)) {
          if (stryMutAct_9fa48("15089")) {
            {}
          } else {
            stryCov_9fa48("15089");
            return stryMutAct_9fa48("15090") ? leftHlc.physical + rightHlc.physical : (stryCov_9fa48("15090"), leftHlc.physical - rightHlc.physical);
          }
        }
        if (stryMutAct_9fa48("15093") ? leftHlc.logical === rightHlc.logical : stryMutAct_9fa48("15092") ? false : stryMutAct_9fa48("15091") ? true : (stryCov_9fa48("15091", "15092", "15093"), leftHlc.logical !== rightHlc.logical)) {
          if (stryMutAct_9fa48("15094")) {
            {}
          } else {
            stryCov_9fa48("15094");
            return stryMutAct_9fa48("15095") ? leftHlc.logical + rightHlc.logical : (stryCov_9fa48("15095"), leftHlc.logical - rightHlc.logical);
          }
        }
        return leftHlc.nodeId.localeCompare(rightHlc.nodeId);
      }
    }
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (stryMutAct_9fa48("15098") ? Number.isFinite(leftNumber) || Number.isFinite(rightNumber) : stryMutAct_9fa48("15097") ? false : stryMutAct_9fa48("15096") ? true : (stryCov_9fa48("15096", "15097", "15098"), Number.isFinite(leftNumber) && Number.isFinite(rightNumber))) {
      if (stryMutAct_9fa48("15099")) {
        {}
      } else {
        stryCov_9fa48("15099");
        return stryMutAct_9fa48("15100") ? leftNumber + rightNumber : (stryCov_9fa48("15100"), leftNumber - rightNumber);
      }
    }
    return String(left).localeCompare(String(right));
  }
}

/**
 * Normalize a schema-version value to canonical string representation.
 * @param {*} value
 * @return {string|null}
 */
export function normalizeJoinSchemaVersion(value) {
  if (stryMutAct_9fa48("15101")) {
    {}
  } else {
    stryCov_9fa48("15101");
    if (stryMutAct_9fa48("15104") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("15103") ? false : stryMutAct_9fa48("15102") ? true : (stryCov_9fa48("15102", "15103", "15104"), typeof value === TYPEOF.STRING)) {
      if (stryMutAct_9fa48("15105")) {
        {}
      } else {
        stryCov_9fa48("15105");
        const normalized = stryMutAct_9fa48("15106") ? value : (stryCov_9fa48("15106"), value.trim());
        return (stryMutAct_9fa48("15110") ? normalized.length <= NUM.ZERO : stryMutAct_9fa48("15109") ? normalized.length >= NUM.ZERO : stryMutAct_9fa48("15108") ? false : stryMutAct_9fa48("15107") ? true : (stryCov_9fa48("15107", "15108", "15109", "15110"), normalized.length > NUM.ZERO)) ? normalized : null;
      }
    }
    if (stryMutAct_9fa48("15113") ? typeof value === TYPEOF.NUMBER || Number.isFinite(value) : stryMutAct_9fa48("15112") ? false : stryMutAct_9fa48("15111") ? true : (stryCov_9fa48("15111", "15112", "15113"), (stryMutAct_9fa48("15115") ? typeof value !== TYPEOF.NUMBER : stryMutAct_9fa48("15114") ? true : (stryCov_9fa48("15114", "15115"), typeof value === TYPEOF.NUMBER)) && Number.isFinite(value))) {
      if (stryMutAct_9fa48("15116")) {
        {}
      } else {
        stryCov_9fa48("15116");
        return String(value);
      }
    }
    if (stryMutAct_9fa48("15119") ? typeof value !== TYPEOF.BIGINT : stryMutAct_9fa48("15118") ? false : stryMutAct_9fa48("15117") ? true : (stryCov_9fa48("15117", "15118", "15119"), typeof value === TYPEOF.BIGINT)) {
      if (stryMutAct_9fa48("15120")) {
        {}
      } else {
        stryCov_9fa48("15120");
        return String(value);
      }
    }
    return null;
  }
}

/**
 * Keep the newest schema-version watermark.
 * @param {string|null} current
 * @param {string|null} candidate
 * @return {string|null}
 */
export function selectNewestJoinSchemaVersion(current, candidate) {
  if (stryMutAct_9fa48("15121")) {
    {}
  } else {
    stryCov_9fa48("15121");
    if (stryMutAct_9fa48("15124") ? false : stryMutAct_9fa48("15123") ? true : stryMutAct_9fa48("15122") ? candidate : (stryCov_9fa48("15122", "15123", "15124"), !candidate)) {
      if (stryMutAct_9fa48("15125")) {
        {}
      } else {
        stryCov_9fa48("15125");
        return current;
      }
    }
    if (stryMutAct_9fa48("15128") ? false : stryMutAct_9fa48("15127") ? true : stryMutAct_9fa48("15126") ? current : (stryCov_9fa48("15126", "15127", "15128"), !current)) {
      if (stryMutAct_9fa48("15129")) {
        {}
      } else {
        stryCov_9fa48("15129");
        return candidate;
      }
    }
    return (stryMutAct_9fa48("15133") ? compareJoinSchemaVersions(candidate, current) < NUM.ZERO : stryMutAct_9fa48("15132") ? compareJoinSchemaVersions(candidate, current) > NUM.ZERO : stryMutAct_9fa48("15131") ? false : stryMutAct_9fa48("15130") ? true : (stryCov_9fa48("15130", "15131", "15132", "15133"), compareJoinSchemaVersions(candidate, current) >= NUM.ZERO)) ? candidate : current;
  }
}

/**
 * Extract one schema-version candidate from a record.
 * @param {Object} record
 * @return {string|null}
 */
export function extractJoinSchemaVersionFromRecord(record) {
  if (stryMutAct_9fa48("15134")) {
    {}
  } else {
    stryCov_9fa48("15134");
    if (stryMutAct_9fa48("15137") ? !record && typeof record !== TYPEOF.OBJECT : stryMutAct_9fa48("15136") ? false : stryMutAct_9fa48("15135") ? true : (stryCov_9fa48("15135", "15136", "15137"), (stryMutAct_9fa48("15138") ? record : (stryCov_9fa48("15138"), !record)) || (stryMutAct_9fa48("15140") ? typeof record === TYPEOF.OBJECT : stryMutAct_9fa48("15139") ? false : (stryCov_9fa48("15139", "15140"), typeof record !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("15141")) {
        {}
      } else {
        stryCov_9fa48("15141");
        return null;
      }
    }
    for (const fieldName of JOIN_READINESS_SCHEMA_FIELDS) {
      if (stryMutAct_9fa48("15142")) {
        {}
      } else {
        stryCov_9fa48("15142");
        const normalized = normalizeJoinSchemaVersion(record[fieldName]);
        if (stryMutAct_9fa48("15144") ? false : stryMutAct_9fa48("15143") ? true : (stryCov_9fa48("15143", "15144"), normalized)) {
          if (stryMutAct_9fa48("15145")) {
            {}
          } else {
            stryCov_9fa48("15145");
            return normalized;
          }
        }
      }
    }
    return null;
  }
}

/**
 * Extract schema version candidate from `tables` metadata row.
 * @param {Object|null} systemTableCache
 * @param {string} tableName
 * @return {string|null}
 */
export function extractCanonicalTableMetadataSchemaVersion(systemTableCache, tableName) {
  if (stryMutAct_9fa48("15146")) {
    {}
  } else {
    stryCov_9fa48("15146");
    if (stryMutAct_9fa48("15149") ? !systemTableCache && typeof systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("15148") ? false : stryMutAct_9fa48("15147") ? true : (stryCov_9fa48("15147", "15148", "15149"), (stryMutAct_9fa48("15150") ? systemTableCache : (stryCov_9fa48("15150"), !systemTableCache)) || (stryMutAct_9fa48("15152") ? typeof systemTableCache.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("15151") ? false : (stryCov_9fa48("15151", "15152"), typeof systemTableCache.filter !== TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("15153")) {
        {}
      } else {
        stryCov_9fa48("15153");
        return null;
      }
    }
    let version = null;
    const rows = stryMutAct_9fa48("15154") ? systemTableCache : (stryCov_9fa48("15154"), systemTableCache.filter(TABLES.TABLES, row => {
      if (stryMutAct_9fa48("15155")) {
        {}
      } else {
        stryCov_9fa48("15155");
        const rowTableName = stryMutAct_9fa48("15158") ? (row?.table_name || row?.tableName) && null : stryMutAct_9fa48("15157") ? false : stryMutAct_9fa48("15156") ? true : (stryCov_9fa48("15156", "15157", "15158"), (stryMutAct_9fa48("15160") ? row?.table_name && row?.tableName : stryMutAct_9fa48("15159") ? false : (stryCov_9fa48("15159", "15160"), (stryMutAct_9fa48("15161") ? row.table_name : (stryCov_9fa48("15161"), row?.table_name)) || (stryMutAct_9fa48("15162") ? row.tableName : (stryCov_9fa48("15162"), row?.tableName)))) || null);
        return stryMutAct_9fa48("15165") ? rowTableName !== tableName : stryMutAct_9fa48("15164") ? false : stryMutAct_9fa48("15163") ? true : (stryCov_9fa48("15163", "15164", "15165"), rowTableName === tableName);
      }
    }));
    for (const row of rows) {
      if (stryMutAct_9fa48("15166")) {
        {}
      } else {
        stryCov_9fa48("15166");
        version = selectNewestJoinSchemaVersion(version, extractJoinSchemaVersionFromRecord(row));
      }
    }
    return version;
  }
}

/**
 * Extract schema version candidate from local cache rows for one table.
 * @param {Object|null} systemTableCache
 * @param {string} tableName
 * @return {string|null}
 */
export function extractCanonicalCacheSchemaVersion(systemTableCache, tableName) {
  if (stryMutAct_9fa48("15167")) {
    {}
  } else {
    stryCov_9fa48("15167");
    if (stryMutAct_9fa48("15170") ? !systemTableCache && typeof systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("15169") ? false : stryMutAct_9fa48("15168") ? true : (stryCov_9fa48("15168", "15169", "15170"), (stryMutAct_9fa48("15171") ? systemTableCache : (stryCov_9fa48("15171"), !systemTableCache)) || (stryMutAct_9fa48("15173") ? typeof systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("15172") ? false : (stryCov_9fa48("15172", "15173"), typeof systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("15174")) {
        {}
      } else {
        stryCov_9fa48("15174");
        return null;
      }
    }
    let version = null;
    const tableRows = stryMutAct_9fa48("15177") ? systemTableCache.getAll(tableName) && [] : stryMutAct_9fa48("15176") ? false : stryMutAct_9fa48("15175") ? true : (stryCov_9fa48("15175", "15176", "15177"), systemTableCache.getAll(tableName) || (stryMutAct_9fa48("15178") ? ["Stryker was here"] : (stryCov_9fa48("15178"), [])));
    for (const row of tableRows) {
      if (stryMutAct_9fa48("15179")) {
        {}
      } else {
        stryCov_9fa48("15179");
        version = selectNewestJoinSchemaVersion(version, extractJoinSchemaVersionFromRecord(row));
      }
    }
    return version;
  }
}

/**
 * Extract required schema version candidate from bootstrap snapshot scope.
 * @param {Object|null} systemTableSnapshots - bootstrapResponse.systemTableSnapshots
 * @param {string} tableName
 * @return {string|null}
 */
export function extractCanonicalSnapshotSchemaVersion(systemTableSnapshots, tableName) {
  if (stryMutAct_9fa48("15180")) {
    {}
  } else {
    stryCov_9fa48("15180");
    if (stryMutAct_9fa48("15183") ? !systemTableSnapshots && typeof systemTableSnapshots !== TYPEOF.OBJECT : stryMutAct_9fa48("15182") ? false : stryMutAct_9fa48("15181") ? true : (stryCov_9fa48("15181", "15182", "15183"), (stryMutAct_9fa48("15184") ? systemTableSnapshots : (stryCov_9fa48("15184"), !systemTableSnapshots)) || (stryMutAct_9fa48("15186") ? typeof systemTableSnapshots === TYPEOF.OBJECT : stryMutAct_9fa48("15185") ? false : (stryCov_9fa48("15185", "15186"), typeof systemTableSnapshots !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("15187")) {
        {}
      } else {
        stryCov_9fa48("15187");
        return null;
      }
    }
    let version = null;
    const tableSnapshotRows = Array.isArray(systemTableSnapshots[tableName]) ? systemTableSnapshots[tableName] : stryMutAct_9fa48("15188") ? ["Stryker was here"] : (stryCov_9fa48("15188"), []);
    for (const row of tableSnapshotRows) {
      if (stryMutAct_9fa48("15189")) {
        {}
      } else {
        stryCov_9fa48("15189");
        version = selectNewestJoinSchemaVersion(version, extractJoinSchemaVersionFromRecord(row));
      }
    }
    const tableMetadataRows = Array.isArray(systemTableSnapshots[TABLES.TABLES]) ? systemTableSnapshots[TABLES.TABLES] : stryMutAct_9fa48("15190") ? ["Stryker was here"] : (stryCov_9fa48("15190"), []);
    for (const row of tableMetadataRows) {
      if (stryMutAct_9fa48("15191")) {
        {}
      } else {
        stryCov_9fa48("15191");
        const rowTableName = stryMutAct_9fa48("15194") ? (row?.table_name || row?.tableName) && null : stryMutAct_9fa48("15193") ? false : stryMutAct_9fa48("15192") ? true : (stryCov_9fa48("15192", "15193", "15194"), (stryMutAct_9fa48("15196") ? row?.table_name && row?.tableName : stryMutAct_9fa48("15195") ? false : (stryCov_9fa48("15195", "15196"), (stryMutAct_9fa48("15197") ? row.table_name : (stryCov_9fa48("15197"), row?.table_name)) || (stryMutAct_9fa48("15198") ? row.tableName : (stryCov_9fa48("15198"), row?.tableName)))) || null);
        if (stryMutAct_9fa48("15201") ? rowTableName === tableName : stryMutAct_9fa48("15200") ? false : stryMutAct_9fa48("15199") ? true : (stryCov_9fa48("15199", "15200", "15201"), rowTableName !== tableName)) {
          if (stryMutAct_9fa48("15202")) {
            {}
          } else {
            stryCov_9fa48("15202");
            continue;
          }
        }
        version = selectNewestJoinSchemaVersion(version, extractJoinSchemaVersionFromRecord(row));
      }
    }
    return version;
  }
}

/**
 * Resolve the canonical required schema version for join checks.
 * @param {string} tableName
 * @param {Object|null} systemTableCache
 * @param {Object|null} systemTableSnapshots - bootstrapResponse.systemTableSnapshots
 * @return {string|null}
 */
export function resolveCanonicalRequiredSchemaVersion(tableName, systemTableCache, systemTableSnapshots) {
  if (stryMutAct_9fa48("15203")) {
    {}
  } else {
    stryCov_9fa48("15203");
    let requiredSchemaVersion = null;
    requiredSchemaVersion = selectNewestJoinSchemaVersion(requiredSchemaVersion, extractCanonicalSnapshotSchemaVersion(systemTableSnapshots, tableName));
    requiredSchemaVersion = selectNewestJoinSchemaVersion(requiredSchemaVersion, extractCanonicalCacheSchemaVersion(systemTableCache, tableName));
    requiredSchemaVersion = selectNewestJoinSchemaVersion(requiredSchemaVersion, extractCanonicalTableMetadataSchemaVersion(systemTableCache, tableName));
    return requiredSchemaVersion;
  }
}

/**
 * Resolve the applied schema version for canonical join checks.
 * @param {string} tableName
 * @param {Object|null} systemTableCache
 * @return {string|null}
 */
export function resolveCanonicalAppliedSchemaVersion(tableName, systemTableCache) {
  if (stryMutAct_9fa48("15204")) {
    {}
  } else {
    stryCov_9fa48("15204");
    let appliedSchemaVersion = null;
    appliedSchemaVersion = selectNewestJoinSchemaVersion(appliedSchemaVersion, extractCanonicalCacheSchemaVersion(systemTableCache, tableName));
    appliedSchemaVersion = selectNewestJoinSchemaVersion(appliedSchemaVersion, extractCanonicalTableMetadataSchemaVersion(systemTableCache, tableName));
    return appliedSchemaVersion;
  }
}