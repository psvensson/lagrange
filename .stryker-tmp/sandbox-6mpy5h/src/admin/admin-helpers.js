/**
 * Shared helper functions for admin WebSocket API modules.
 *
 * These pure utility functions are used by multiple extracted admin modules
 * (service-discovery, preflight, control-snapshot) and the residual
 * admin-websocket-api.js. Single-use helpers live in their consuming module.
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
import { NUM, TYPEOF } from '../constants/index.js';
const EMPTY_STRING = stryMutAct_9fa48("3914") ? "Stryker was here!" : (stryCov_9fa48("3914"), '');
const SINGLE_SPACE = stryMutAct_9fa48("3915") ? "" : (stryCov_9fa48("3915"), ' ');
const SQL_NORMALIZE_WHITESPACE_PATTERN = stryMutAct_9fa48("3917") ? /\S+/g : stryMutAct_9fa48("3916") ? /\s/g : (stryCov_9fa48("3916", "3917"), /\s+/g);
const SQL_TRAILING_SEMICOLON_PATTERN = stryMutAct_9fa48("3920") ? /;\S*$/ : stryMutAct_9fa48("3919") ? /;\s$/ : stryMutAct_9fa48("3918") ? /;\s*/ : (stryCov_9fa48("3918", "3919", "3920"), /;\s*$/);
const IDENTIFIER_PATTERN = stryMutAct_9fa48("3925") ? /^[A-Za-z_][^A-Za-z0-9_]*$/ : stryMutAct_9fa48("3924") ? /^[A-Za-z_][A-Za-z0-9_]$/ : stryMutAct_9fa48("3923") ? /^[^A-Za-z_][A-Za-z0-9_]*$/ : stryMutAct_9fa48("3922") ? /^[A-Za-z_][A-Za-z0-9_]*/ : stryMutAct_9fa48("3921") ? /[A-Za-z_][A-Za-z0-9_]*$/ : (stryCov_9fa48("3921", "3922", "3923", "3924", "3925"), /^[A-Za-z_][A-Za-z0-9_]*$/);
const SERVICE_DISCOVERY_TABLE_ID_PATTERN = stryMutAct_9fa48("3929") ? /^[^A-Za-z0-9_-]+$/ : stryMutAct_9fa48("3928") ? /^[A-Za-z0-9_-]$/ : stryMutAct_9fa48("3927") ? /^[A-Za-z0-9_-]+/ : stryMutAct_9fa48("3926") ? /[A-Za-z0-9_-]+$/ : (stryCov_9fa48("3926", "3927", "3928", "3929"), /^[A-Za-z0-9_-]+$/);
const DEFAULT_PARTITION_VERSION = NUM.ONE;
const ACTIVE_PARTITION_STATE = stryMutAct_9fa48("3930") ? "" : (stryCov_9fa48("3930"), 'NORMAL');

/**
 * Normalize SQL string for comparison.
 * @param {string} sql
 * @return {string}
 */
function normalizeSql(sql) {
  if (stryMutAct_9fa48("3931")) {
    {}
  } else {
    stryCov_9fa48("3931");
    return stryMutAct_9fa48("3933") ? String(sql || EMPTY_STRING).replace(SQL_TRAILING_SEMICOLON_PATTERN, EMPTY_STRING).replace(SQL_NORMALIZE_WHITESPACE_PATTERN, SINGLE_SPACE).toLowerCase() : stryMutAct_9fa48("3932") ? String(sql || EMPTY_STRING).trim().replace(SQL_TRAILING_SEMICOLON_PATTERN, EMPTY_STRING).replace(SQL_NORMALIZE_WHITESPACE_PATTERN, SINGLE_SPACE).toUpperCase() : (stryCov_9fa48("3932", "3933"), String(stryMutAct_9fa48("3936") ? sql && EMPTY_STRING : stryMutAct_9fa48("3935") ? false : stryMutAct_9fa48("3934") ? true : (stryCov_9fa48("3934", "3935", "3936"), sql || EMPTY_STRING)).trim().replace(SQL_TRAILING_SEMICOLON_PATTERN, EMPTY_STRING).replace(SQL_NORMALIZE_WHITESPACE_PATTERN, SINGLE_SPACE).toLowerCase());
  }
}

/**
 * Deduplicate and sort an array of values.
 * @param {Array} values
 * @return {Array}
 */
function uniqueSorted(values) {
  if (stryMutAct_9fa48("3937")) {
    {}
  } else {
    stryCov_9fa48("3937");
    return stryMutAct_9fa48("3938") ? [...new Set(values)] : (stryCov_9fa48("3938"), (stryMutAct_9fa48("3939") ? [] : (stryCov_9fa48("3939"), [...new Set(values)])).sort());
  }
}

/**
 * Return the first non-empty string value found among the given keys.
 * @param {Object} record
 * @param {...string} keys
 * @return {string|null}
 */
function firstStringField(record, ...keys) {
  if (stryMutAct_9fa48("3940")) {
    {}
  } else {
    stryCov_9fa48("3940");
    for (const key of keys) {
      if (stryMutAct_9fa48("3941")) {
        {}
      } else {
        stryCov_9fa48("3941");
        const value = stryMutAct_9fa48("3942") ? record[key] : (stryCov_9fa48("3942"), record?.[key]);
        if (stryMutAct_9fa48("3945") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("3944") ? false : stryMutAct_9fa48("3943") ? true : (stryCov_9fa48("3943", "3944", "3945"), (stryMutAct_9fa48("3947") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("3946") ? true : (stryCov_9fa48("3946", "3947"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("3950") ? value.length <= NUM.ZERO : stryMutAct_9fa48("3949") ? value.length >= NUM.ZERO : stryMutAct_9fa48("3948") ? true : (stryCov_9fa48("3948", "3949", "3950"), value.length > NUM.ZERO)))) {
          if (stryMutAct_9fa48("3951")) {
            {}
          } else {
            stryCov_9fa48("3951");
            return value;
          }
        }
      }
    }
    return null;
  }
}

/**
 * Normalize a schema version value to a trimmed string or null.
 * @param {*} value
 * @return {string|null}
 */
function normalizeSchemaVersionValue(value) {
  if (stryMutAct_9fa48("3952")) {
    {}
  } else {
    stryCov_9fa48("3952");
    if (stryMutAct_9fa48("3955") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("3954") ? false : stryMutAct_9fa48("3953") ? true : (stryCov_9fa48("3953", "3954", "3955"), typeof value === TYPEOF.STRING)) {
      if (stryMutAct_9fa48("3956")) {
        {}
      } else {
        stryCov_9fa48("3956");
        const normalized = stryMutAct_9fa48("3957") ? value : (stryCov_9fa48("3957"), value.trim());
        return (stryMutAct_9fa48("3961") ? normalized.length <= NUM.ZERO : stryMutAct_9fa48("3960") ? normalized.length >= NUM.ZERO : stryMutAct_9fa48("3959") ? false : stryMutAct_9fa48("3958") ? true : (stryCov_9fa48("3958", "3959", "3960", "3961"), normalized.length > NUM.ZERO)) ? normalized : null;
      }
    }
    if (stryMutAct_9fa48("3964") ? typeof value === TYPEOF.NUMBER || Number.isFinite(value) : stryMutAct_9fa48("3963") ? false : stryMutAct_9fa48("3962") ? true : (stryCov_9fa48("3962", "3963", "3964"), (stryMutAct_9fa48("3966") ? typeof value !== TYPEOF.NUMBER : stryMutAct_9fa48("3965") ? true : (stryCov_9fa48("3965", "3966"), typeof value === TYPEOF.NUMBER)) && Number.isFinite(value))) {
      if (stryMutAct_9fa48("3967")) {
        {}
      } else {
        stryCov_9fa48("3967");
        return String(value);
      }
    }
    if (stryMutAct_9fa48("3970") ? typeof value !== TYPEOF.BIGINT : stryMutAct_9fa48("3969") ? false : stryMutAct_9fa48("3968") ? true : (stryCov_9fa48("3968", "3969", "3970"), typeof value === TYPEOF.BIGINT)) {
      if (stryMutAct_9fa48("3971")) {
        {}
      } else {
        stryCov_9fa48("3971");
        return String(value);
      }
    }
    return null;
  }
}

/**
 * Normalize identifier-like values used in discovery scope.
 * @param {*} value
 * @return {string|null}
 */
function normalizeIdentifier(value) {
  if (stryMutAct_9fa48("3972")) {
    {}
  } else {
    stryCov_9fa48("3972");
    if (stryMutAct_9fa48("3975") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("3974") ? false : stryMutAct_9fa48("3973") ? true : (stryCov_9fa48("3973", "3974", "3975"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("3976")) {
        {}
      } else {
        stryCov_9fa48("3976");
        return null;
      }
    }
    const trimmedValue = stryMutAct_9fa48("3977") ? value : (stryCov_9fa48("3977"), value.trim());
    if (stryMutAct_9fa48("3980") ? trimmedValue.length !== NUM.ZERO : stryMutAct_9fa48("3979") ? false : stryMutAct_9fa48("3978") ? true : (stryCov_9fa48("3978", "3979", "3980"), trimmedValue.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("3981")) {
        {}
      } else {
        stryCov_9fa48("3981");
        return null;
      }
    }
    if (stryMutAct_9fa48("3984") ? false : stryMutAct_9fa48("3983") ? true : stryMutAct_9fa48("3982") ? IDENTIFIER_PATTERN.test(trimmedValue) : (stryCov_9fa48("3982", "3983", "3984"), !IDENTIFIER_PATTERN.test(trimmedValue))) {
      if (stryMutAct_9fa48("3985")) {
        {}
      } else {
        stryCov_9fa48("3985");
        return null;
      }
    }
    return trimmedValue;
  }
}

/**
 * Normalize optional table-id discovery scope value.
 * @param {*} value
 * @return {string|null}
 */
function normalizeDiscoveryTableId(value) {
  if (stryMutAct_9fa48("3986")) {
    {}
  } else {
    stryCov_9fa48("3986");
    if (stryMutAct_9fa48("3989") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("3988") ? false : stryMutAct_9fa48("3987") ? true : (stryCov_9fa48("3987", "3988", "3989"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("3990")) {
        {}
      } else {
        stryCov_9fa48("3990");
        return null;
      }
    }
    const trimmedValue = stryMutAct_9fa48("3991") ? value : (stryCov_9fa48("3991"), value.trim());
    if (stryMutAct_9fa48("3994") ? trimmedValue.length !== NUM.ZERO : stryMutAct_9fa48("3993") ? false : stryMutAct_9fa48("3992") ? true : (stryCov_9fa48("3992", "3993", "3994"), trimmedValue.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("3995")) {
        {}
      } else {
        stryCov_9fa48("3995");
        return null;
      }
    }
    if (stryMutAct_9fa48("3998") ? false : stryMutAct_9fa48("3997") ? true : stryMutAct_9fa48("3996") ? SERVICE_DISCOVERY_TABLE_ID_PATTERN.test(trimmedValue) : (stryCov_9fa48("3996", "3997", "3998"), !SERVICE_DISCOVERY_TABLE_ID_PATTERN.test(trimmedValue))) {
      if (stryMutAct_9fa48("3999")) {
        {}
      } else {
        stryCov_9fa48("3999");
        return null;
      }
    }
    return trimmedValue;
  }
}

/**
 * Resolve a table row's active partition version.
 * Missing or invalid values default to version 1.
 * @param {Object|null} tableRow
 * @return {number}
 */
function resolveActivePartitionVersion(tableRow) {
  if (stryMutAct_9fa48("4000")) {
    {}
  } else {
    stryCov_9fa48("4000");
    const value = stryMutAct_9fa48("4001") ? tableRow?.active_partition_version && tableRow?.activePartitionVersion : (stryCov_9fa48("4001"), (stryMutAct_9fa48("4002") ? tableRow.active_partition_version : (stryCov_9fa48("4002"), tableRow?.active_partition_version)) ?? (stryMutAct_9fa48("4003") ? tableRow.activePartitionVersion : (stryCov_9fa48("4003"), tableRow?.activePartitionVersion)));
    const parsedValue = Number(value);
    if (stryMutAct_9fa48("4006") ? !Number.isInteger(parsedValue) && parsedValue < DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("4005") ? false : stryMutAct_9fa48("4004") ? true : (stryCov_9fa48("4004", "4005", "4006"), (stryMutAct_9fa48("4007") ? Number.isInteger(parsedValue) : (stryCov_9fa48("4007"), !Number.isInteger(parsedValue))) || (stryMutAct_9fa48("4010") ? parsedValue >= DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("4009") ? parsedValue <= DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("4008") ? false : (stryCov_9fa48("4008", "4009", "4010"), parsedValue < DEFAULT_PARTITION_VERSION)))) {
      if (stryMutAct_9fa48("4011")) {
        {}
      } else {
        stryCov_9fa48("4011");
        return DEFAULT_PARTITION_VERSION;
      }
    }
    return parsedValue;
  }
}

/**
 * Determine whether a partition row belongs to a table's active serving
 * partition set.
 * @param {Object|null} partitionRow
 * @param {number} activePartitionVersion
 * @return {boolean}
 */
function isPartitionVisibleForActiveTopology(partitionRow, activePartitionVersion) {
  if (stryMutAct_9fa48("4012")) {
    {}
  } else {
    stryCov_9fa48("4012");
    const partitionVersion = Number(stryMutAct_9fa48("4013") ? partitionRow?.partition_version && partitionRow?.partitionVersion : (stryCov_9fa48("4013"), (stryMutAct_9fa48("4014") ? partitionRow.partition_version : (stryCov_9fa48("4014"), partitionRow?.partition_version)) ?? (stryMutAct_9fa48("4015") ? partitionRow.partitionVersion : (stryCov_9fa48("4015"), partitionRow?.partitionVersion))));
    const normalizedPartitionVersion = (stryMutAct_9fa48("4018") ? Number.isInteger(partitionVersion) || partitionVersion >= DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("4017") ? false : stryMutAct_9fa48("4016") ? true : (stryCov_9fa48("4016", "4017", "4018"), Number.isInteger(partitionVersion) && (stryMutAct_9fa48("4021") ? partitionVersion < DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("4020") ? partitionVersion > DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("4019") ? true : (stryCov_9fa48("4019", "4020", "4021"), partitionVersion >= DEFAULT_PARTITION_VERSION)))) ? partitionVersion : DEFAULT_PARTITION_VERSION;
    if (stryMutAct_9fa48("4024") ? normalizedPartitionVersion === activePartitionVersion : stryMutAct_9fa48("4023") ? false : stryMutAct_9fa48("4022") ? true : (stryCov_9fa48("4022", "4023", "4024"), normalizedPartitionVersion !== activePartitionVersion)) {
      if (stryMutAct_9fa48("4025")) {
        {}
      } else {
        stryCov_9fa48("4025");
        return stryMutAct_9fa48("4026") ? true : (stryCov_9fa48("4026"), false);
      }
    }
    const state = stryMutAct_9fa48("4027") ? String(firstStringField(partitionRow, 'state', 'partition_state', 'partitionState') || ACTIVE_PARTITION_STATE).toLowerCase() : (stryCov_9fa48("4027"), String(stryMutAct_9fa48("4030") ? firstStringField(partitionRow, 'state', 'partition_state', 'partitionState') && ACTIVE_PARTITION_STATE : stryMutAct_9fa48("4029") ? false : stryMutAct_9fa48("4028") ? true : (stryCov_9fa48("4028", "4029", "4030"), firstStringField(partitionRow, stryMutAct_9fa48("4031") ? "" : (stryCov_9fa48("4031"), 'state'), stryMutAct_9fa48("4032") ? "" : (stryCov_9fa48("4032"), 'partition_state'), stryMutAct_9fa48("4033") ? "" : (stryCov_9fa48("4033"), 'partitionState')) || ACTIVE_PARTITION_STATE)).toUpperCase());
    return stryMutAct_9fa48("4036") ? state !== ACTIVE_PARTITION_STATE : stryMutAct_9fa48("4035") ? false : stryMutAct_9fa48("4034") ? true : (stryCov_9fa48("4034", "4035", "4036"), state === ACTIVE_PARTITION_STATE);
  }
}

/**
 * Filter partition rows down to the active serving topology for each table.
 * Table rows own active_partition_version. When a table row is missing,
 * version 1 remains the compatibility default.
 * @param {Array<Object>} partitionRows
 * @param {Array<Object>} tableRows
 * @return {Array<Object>}
 */
function filterActiveServingPartitionRows(partitionRows, tableRows) {
  if (stryMutAct_9fa48("4037")) {
    {}
  } else {
    stryCov_9fa48("4037");
    const normalizedPartitionRows = Array.isArray(partitionRows) ? partitionRows : stryMutAct_9fa48("4038") ? ["Stryker was here"] : (stryCov_9fa48("4038"), []);
    const normalizedTableRows = Array.isArray(tableRows) ? tableRows : stryMutAct_9fa48("4039") ? ["Stryker was here"] : (stryCov_9fa48("4039"), []);
    const activePartitionVersionByTableId = new Map();
    const activePartitionVersionByTableName = new Map();
    for (const tableRow of normalizedTableRows) {
      if (stryMutAct_9fa48("4040")) {
        {}
      } else {
        stryCov_9fa48("4040");
        const activePartitionVersion = resolveActivePartitionVersion(tableRow);
        const tableId = firstStringField(tableRow, stryMutAct_9fa48("4041") ? "" : (stryCov_9fa48("4041"), 'table_id'), stryMutAct_9fa48("4042") ? "" : (stryCov_9fa48("4042"), 'tableId'), stryMutAct_9fa48("4043") ? "" : (stryCov_9fa48("4043"), 'id'));
        if (stryMutAct_9fa48("4045") ? false : stryMutAct_9fa48("4044") ? true : (stryCov_9fa48("4044", "4045"), tableId)) {
          if (stryMutAct_9fa48("4046")) {
            {}
          } else {
            stryCov_9fa48("4046");
            activePartitionVersionByTableId.set(tableId, activePartitionVersion);
          }
        }
        const tableName = firstStringField(tableRow, stryMutAct_9fa48("4047") ? "" : (stryCov_9fa48("4047"), 'table_name'), stryMutAct_9fa48("4048") ? "" : (stryCov_9fa48("4048"), 'tableName'), stryMutAct_9fa48("4049") ? "" : (stryCov_9fa48("4049"), 'name'));
        if (stryMutAct_9fa48("4051") ? false : stryMutAct_9fa48("4050") ? true : (stryCov_9fa48("4050", "4051"), tableName)) {
          if (stryMutAct_9fa48("4052")) {
            {}
          } else {
            stryCov_9fa48("4052");
            activePartitionVersionByTableName.set(tableName, activePartitionVersion);
          }
        }
      }
    }
    return stryMutAct_9fa48("4053") ? normalizedPartitionRows : (stryCov_9fa48("4053"), normalizedPartitionRows.filter(partitionRow => {
      if (stryMutAct_9fa48("4054")) {
        {}
      } else {
        stryCov_9fa48("4054");
        const tableId = firstStringField(partitionRow, stryMutAct_9fa48("4055") ? "" : (stryCov_9fa48("4055"), 'table_id'), stryMutAct_9fa48("4056") ? "" : (stryCov_9fa48("4056"), 'tableId'));
        const tableName = firstStringField(partitionRow, stryMutAct_9fa48("4057") ? "" : (stryCov_9fa48("4057"), 'table_name'), stryMutAct_9fa48("4058") ? "" : (stryCov_9fa48("4058"), 'tableName'), stryMutAct_9fa48("4059") ? "" : (stryCov_9fa48("4059"), 'name'));
        const activePartitionVersion = (stryMutAct_9fa48("4062") ? tableId || activePartitionVersionByTableId.has(tableId) : stryMutAct_9fa48("4061") ? false : stryMutAct_9fa48("4060") ? true : (stryCov_9fa48("4060", "4061", "4062"), tableId && activePartitionVersionByTableId.has(tableId))) ? activePartitionVersionByTableId.get(tableId) : (stryMutAct_9fa48("4065") ? tableName || activePartitionVersionByTableName.has(tableName) : stryMutAct_9fa48("4064") ? false : stryMutAct_9fa48("4063") ? true : (stryCov_9fa48("4063", "4064", "4065"), tableName && activePartitionVersionByTableName.has(tableName))) ? activePartitionVersionByTableName.get(tableName) : DEFAULT_PARTITION_VERSION;
        return isPartitionVisibleForActiveTopology(partitionRow, activePartitionVersion);
      }
    }));
  }
}
export { filterActiveServingPartitionRows, firstStringField, isPartitionVisibleForActiveTopology, normalizeDiscoveryTableId, normalizeIdentifier, normalizeSchemaVersionValue, normalizeSql, resolveActivePartitionVersion, uniqueSorted };