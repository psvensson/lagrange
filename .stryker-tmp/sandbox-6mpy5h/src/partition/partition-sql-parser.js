/**
 * SQL parsing helpers for CDC event generation.
 * Extracted from PartitionService — pure parsing logic that operates
 * on SQL strings, a logger, and an optional DB handle.
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
import { NUM, STRING } from '../constants/index.js';
import { PARTITION_SERVICE_ERROR_MSG, PARTITION_SERVICE_LOG_MSG, PARTITION_SERVICE_OPERATION, PARTITION_SERVICE_SQL_FRAGMENT, PARTITION_SERVICE_VALUE } from './partition-service-constants.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
const CDC_ROW_FETCH_LOG_SUPPRESSED_TABLES = new Set(stryMutAct_9fa48("107042") ? [] : (stryCov_9fa48("107042"), [SYSTEM_TABLE_NAME.LOGS, SYSTEM_TABLE_NAME.NODES, SYSTEM_TABLE_NAME.NODE_ENDPOINTS]));

/**
 * Extract column names from a simple conjunctive WHERE clause.
 * Supports nested wrapping parentheses around equality predicates.
 * @param {string} whereContent - WHERE clause content without the WHERE keyword.
 * @return {Array<string>} Extracted column names.
 */
export function extractConjunctiveWhereColumns(whereContent) {
  if (stryMutAct_9fa48("107043")) {
    {}
  } else {
    stryCov_9fa48("107043");
    if (stryMutAct_9fa48("107046") ? false : stryMutAct_9fa48("107045") ? true : stryMutAct_9fa48("107044") ? whereContent : (stryCov_9fa48("107044", "107045", "107046"), !whereContent)) {
      if (stryMutAct_9fa48("107047")) {
        {}
      } else {
        stryCov_9fa48("107047");
        return stryMutAct_9fa48("107048") ? ["Stryker was here"] : (stryCov_9fa48("107048"), []);
      }
    }
    return stryMutAct_9fa48("107050") ? whereContent.split(/\s+AND\s+/i).map(part => {
      const cleanPart = part.trim().replace(/^\(+|\)+$/g, STRING.EMPTY);
      const match = cleanPart.match(/^(\w+)\s*=/);
      return match ? match[NUM.ONE] : null;
    }).filter(Boolean) : stryMutAct_9fa48("107049") ? whereContent.trim().split(/\s+AND\s+/i).map(part => {
      const cleanPart = part.trim().replace(/^\(+|\)+$/g, STRING.EMPTY);
      const match = cleanPart.match(/^(\w+)\s*=/);
      return match ? match[NUM.ONE] : null;
    }) : (stryCov_9fa48("107049", "107050"), whereContent.trim().split(stryMutAct_9fa48("107054") ? /\s+AND\S+/i : stryMutAct_9fa48("107053") ? /\s+AND\s/i : stryMutAct_9fa48("107052") ? /\S+AND\s+/i : stryMutAct_9fa48("107051") ? /\sAND\s+/i : (stryCov_9fa48("107051", "107052", "107053", "107054"), /\s+AND\s+/i)).map(part => {
      if (stryMutAct_9fa48("107055")) {
        {}
      } else {
        stryCov_9fa48("107055");
        const cleanPart = stryMutAct_9fa48("107056") ? part.replace(/^\(+|\)+$/g, STRING.EMPTY) : (stryCov_9fa48("107056"), part.trim().replace(stryMutAct_9fa48("107060") ? /^\(+|\)$/g : stryMutAct_9fa48("107059") ? /^\(+|\)+/g : stryMutAct_9fa48("107058") ? /^\(|\)+$/g : stryMutAct_9fa48("107057") ? /\(+|\)+$/g : (stryCov_9fa48("107057", "107058", "107059", "107060"), /^\(+|\)+$/g), STRING.EMPTY));
        const match = cleanPart.match(stryMutAct_9fa48("107065") ? /^(\w+)\S*=/ : stryMutAct_9fa48("107064") ? /^(\w+)\s=/ : stryMutAct_9fa48("107063") ? /^(\W+)\s*=/ : stryMutAct_9fa48("107062") ? /^(\w)\s*=/ : stryMutAct_9fa48("107061") ? /(\w+)\s*=/ : (stryCov_9fa48("107061", "107062", "107063", "107064", "107065"), /^(\w+)\s*=/));
        return match ? match[NUM.ONE] : null;
      }
    }).filter(Boolean));
  }
}

/**
 * Whether to emit info-level logs for CDC row fetches on a given table.
 * @param {string} tableName - Table name.
 * @return {boolean}
 */
function shouldEmitCdcRowFetchInfoLog(tableName) {
  if (stryMutAct_9fa48("107066")) {
    {}
  } else {
    stryCov_9fa48("107066");
    return stryMutAct_9fa48("107067") ? CDC_ROW_FETCH_LOG_SUPPRESSED_TABLES.has(tableName) : (stryCov_9fa48("107067"), !CDC_ROW_FETCH_LOG_SUPPRESSED_TABLES.has(tableName));
  }
}

/**
 * Parse a single value token from a SQL VALUES clause.
 * @param {string} val - Value string.
 * @return {*} Parsed value.
 */
export function parseValue(val) {
  if (stryMutAct_9fa48("107068")) {
    {}
  } else {
    stryCov_9fa48("107068");
    if (stryMutAct_9fa48("107071") ? val.toUpperCase() !== PARTITION_SERVICE_SQL_FRAGMENT.NULL_VALUE : stryMutAct_9fa48("107070") ? false : stryMutAct_9fa48("107069") ? true : (stryCov_9fa48("107069", "107070", "107071"), (stryMutAct_9fa48("107072") ? val.toLowerCase() : (stryCov_9fa48("107072"), val.toUpperCase())) === PARTITION_SERVICE_SQL_FRAGMENT.NULL_VALUE)) {
      if (stryMutAct_9fa48("107073")) {
        {}
      } else {
        stryCov_9fa48("107073");
        return null;
      }
    }
    // Remove quotes
    if (stryMutAct_9fa48("107076") ? val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) && val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) && val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) && val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) : stryMutAct_9fa48("107075") ? false : stryMutAct_9fa48("107074") ? true : (stryCov_9fa48("107074", "107075", "107076"), (stryMutAct_9fa48("107078") ? val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) || val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) : stryMutAct_9fa48("107077") ? false : (stryCov_9fa48("107077", "107078"), (stryMutAct_9fa48("107079") ? val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) : (stryCov_9fa48("107079"), val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE))) && (stryMutAct_9fa48("107080") ? val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) : (stryCov_9fa48("107080"), val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE))))) || (stryMutAct_9fa48("107082") ? val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) || val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) : stryMutAct_9fa48("107081") ? false : (stryCov_9fa48("107081", "107082"), (stryMutAct_9fa48("107083") ? val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) : (stryCov_9fa48("107083"), val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE))) && (stryMutAct_9fa48("107084") ? val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) : (stryCov_9fa48("107084"), val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE))))))) {
      if (stryMutAct_9fa48("107085")) {
        {}
      } else {
        stryCov_9fa48("107085");
        return stryMutAct_9fa48("107086") ? val : (stryCov_9fa48("107086"), val.slice(NUM.ONE, stryMutAct_9fa48("107087") ? +NUM.ONE : (stryCov_9fa48("107087"), -NUM.ONE)));
      }
    }
    // Try to parse as number
    const num = Number(val);
    if (stryMutAct_9fa48("107090") ? false : stryMutAct_9fa48("107089") ? true : stryMutAct_9fa48("107088") ? isNaN(num) : (stryCov_9fa48("107088", "107089", "107090"), !isNaN(num))) {
      if (stryMutAct_9fa48("107091")) {
        {}
      } else {
        stryCov_9fa48("107091");
        return num;
      }
    }
    return val;
  }
}

/**
 * Parse values from a SQL VALUES clause string.
 * Handles quoted strings, escaped quotes, numbers, and NULL.
 * @param {string} valuesStr - Values string like "'val1', 123, NULL".
 * @return {Array} Parsed values.
 */
export function parseValuesFromSQL(valuesStr) {
  if (stryMutAct_9fa48("107092")) {
    {}
  } else {
    stryCov_9fa48("107092");
    const values = stryMutAct_9fa48("107093") ? ["Stryker was here"] : (stryCov_9fa48("107093"), []);
    let current = STRING.EMPTY;
    let inQuote = stryMutAct_9fa48("107094") ? true : (stryCov_9fa48("107094"), false);
    let quoteChar = null;
    for (let i = NUM.ZERO; stryMutAct_9fa48("107097") ? i >= valuesStr.length : stryMutAct_9fa48("107096") ? i <= valuesStr.length : stryMutAct_9fa48("107095") ? false : (stryCov_9fa48("107095", "107096", "107097"), i < valuesStr.length); stryMutAct_9fa48("107098") ? i-- : (stryCov_9fa48("107098"), i++)) {
      if (stryMutAct_9fa48("107099")) {
        {}
      } else {
        stryCov_9fa48("107099");
        const char = valuesStr[i];
        if (stryMutAct_9fa48("107102") ? !inQuote || char === PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE || char === PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE : stryMutAct_9fa48("107101") ? false : stryMutAct_9fa48("107100") ? true : (stryCov_9fa48("107100", "107101", "107102"), (stryMutAct_9fa48("107103") ? inQuote : (stryCov_9fa48("107103"), !inQuote)) && (stryMutAct_9fa48("107105") ? char === PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE && char === PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE : stryMutAct_9fa48("107104") ? true : (stryCov_9fa48("107104", "107105"), (stryMutAct_9fa48("107107") ? char !== PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE : stryMutAct_9fa48("107106") ? false : (stryCov_9fa48("107106", "107107"), char === PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE)) || (stryMutAct_9fa48("107109") ? char !== PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE : stryMutAct_9fa48("107108") ? false : (stryCov_9fa48("107108", "107109"), char === PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE)))))) {
          if (stryMutAct_9fa48("107110")) {
            {}
          } else {
            stryCov_9fa48("107110");
            inQuote = stryMutAct_9fa48("107111") ? false : (stryCov_9fa48("107111"), true);
            quoteChar = char;
          }
        } else if (stryMutAct_9fa48("107114") ? inQuote || char === quoteChar : stryMutAct_9fa48("107113") ? false : stryMutAct_9fa48("107112") ? true : (stryCov_9fa48("107112", "107113", "107114"), inQuote && (stryMutAct_9fa48("107116") ? char !== quoteChar : stryMutAct_9fa48("107115") ? true : (stryCov_9fa48("107115", "107116"), char === quoteChar)))) {
          if (stryMutAct_9fa48("107117")) {
            {}
          } else {
            stryCov_9fa48("107117");
            // Check for escaped quote
            if (stryMutAct_9fa48("107120") ? i + NUM.ONE < valuesStr.length || valuesStr[i + NUM.ONE] === quoteChar : stryMutAct_9fa48("107119") ? false : stryMutAct_9fa48("107118") ? true : (stryCov_9fa48("107118", "107119", "107120"), (stryMutAct_9fa48("107123") ? i + NUM.ONE >= valuesStr.length : stryMutAct_9fa48("107122") ? i + NUM.ONE <= valuesStr.length : stryMutAct_9fa48("107121") ? true : (stryCov_9fa48("107121", "107122", "107123"), (stryMutAct_9fa48("107124") ? i - NUM.ONE : (stryCov_9fa48("107124"), i + NUM.ONE)) < valuesStr.length)) && (stryMutAct_9fa48("107126") ? valuesStr[i + NUM.ONE] !== quoteChar : stryMutAct_9fa48("107125") ? true : (stryCov_9fa48("107125", "107126"), valuesStr[stryMutAct_9fa48("107127") ? i - NUM.ONE : (stryCov_9fa48("107127"), i + NUM.ONE)] === quoteChar)))) {
              if (stryMutAct_9fa48("107128")) {
                {}
              } else {
                stryCov_9fa48("107128");
                stryMutAct_9fa48("107129") ? current -= char : (stryCov_9fa48("107129"), current += char);
                stryMutAct_9fa48("107130") ? i -= NUM.ONE : (stryCov_9fa48("107130"), i += NUM.ONE); // Skip next quote
              }
            } else {
              if (stryMutAct_9fa48("107131")) {
                {}
              } else {
                stryCov_9fa48("107131");
                inQuote = stryMutAct_9fa48("107132") ? true : (stryCov_9fa48("107132"), false);
                quoteChar = null;
              }
            }
          }
        } else if (stryMutAct_9fa48("107135") ? !inQuote || char === PARTITION_SERVICE_SQL_FRAGMENT.COMMA : stryMutAct_9fa48("107134") ? false : stryMutAct_9fa48("107133") ? true : (stryCov_9fa48("107133", "107134", "107135"), (stryMutAct_9fa48("107136") ? inQuote : (stryCov_9fa48("107136"), !inQuote)) && (stryMutAct_9fa48("107138") ? char !== PARTITION_SERVICE_SQL_FRAGMENT.COMMA : stryMutAct_9fa48("107137") ? true : (stryCov_9fa48("107137", "107138"), char === PARTITION_SERVICE_SQL_FRAGMENT.COMMA)))) {
          if (stryMutAct_9fa48("107139")) {
            {}
          } else {
            stryCov_9fa48("107139");
            values.push(parseValue(stryMutAct_9fa48("107140") ? current : (stryCov_9fa48("107140"), current.trim())));
            current = STRING.EMPTY;
          }
        } else {
          if (stryMutAct_9fa48("107141")) {
            {}
          } else {
            stryCov_9fa48("107141");
            stryMutAct_9fa48("107142") ? current -= char : (stryCov_9fa48("107142"), current += char);
          }
        }
      }
    }

    // Don't forget the last value
    if (stryMutAct_9fa48("107145") ? current : stryMutAct_9fa48("107144") ? false : stryMutAct_9fa48("107143") ? true : (stryCov_9fa48("107143", "107144", "107145"), current.trim())) {
      if (stryMutAct_9fa48("107146")) {
        {}
      } else {
        stryCov_9fa48("107146");
        values.push(parseValue(stryMutAct_9fa48("107147") ? current : (stryCov_9fa48("107147"), current.trim())));
      }
    }
    return values;
  }
}

/**
 * Extract column/value data from an INSERT SQL statement.
 * Falls back to querying the DB for the full row when possible.
 * @param {string} sql - INSERT SQL statement.
 * @param {string} tableName - Table name.
 * @param {Object} db - better-sqlite3 database handle.
 * @param {Object} logger - Logger instance.
 * @return {Object} Extracted data or empty object.
 */
export function extractInsertDataFromSQL(sql, tableName, db, logger) {
  if (stryMutAct_9fa48("107148")) {
    {}
  } else {
    stryCov_9fa48("107148");
    // Parse INSERT INTO table (col1, col2) VALUES ('val1', 'val2')
    // or INSERT OR REPLACE/IGNORE INTO table (col1, col2) VALUES ('val1', 'val2')
    const columnsMatch = sql.match(stryMutAct_9fa48("107163") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([)]+)\)/i : stryMutAct_9fa48("107162") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)])\)/i : stryMutAct_9fa48("107161") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\S*\(([^)]+)\)/i : stryMutAct_9fa48("107160") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s\(([^)]+)\)/i : stryMutAct_9fa48("107159") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\W+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107158") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w\s*\(([^)]+)\)/i : stryMutAct_9fa48("107157") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\S+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107156") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107155") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\S+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107154") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107153") ? /INSERT\s+(?:OR\S+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107152") ? /INSERT\s+(?:OR\s(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107151") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107150") ? /INSERT\S+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107149") ? /INSERT\s(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : (stryCov_9fa48("107149", "107150", "107151", "107152", "107153", "107154", "107155", "107156", "107157", "107158", "107159", "107160", "107161", "107162", "107163"), /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i));
    const valuesMatch = sql.match(stryMutAct_9fa48("107167") ? /VALUES\s*\(([)]+)\)/i : stryMutAct_9fa48("107166") ? /VALUES\s*\(([^)])\)/i : stryMutAct_9fa48("107165") ? /VALUES\S*\(([^)]+)\)/i : stryMutAct_9fa48("107164") ? /VALUES\s\(([^)]+)\)/i : (stryCov_9fa48("107164", "107165", "107166", "107167"), /VALUES\s*\(([^)]+)\)/i));
    if (stryMutAct_9fa48("107170") ? !columnsMatch && !valuesMatch : stryMutAct_9fa48("107169") ? false : stryMutAct_9fa48("107168") ? true : (stryCov_9fa48("107168", "107169", "107170"), (stryMutAct_9fa48("107171") ? columnsMatch : (stryCov_9fa48("107171"), !columnsMatch)) || (stryMutAct_9fa48("107172") ? valuesMatch : (stryCov_9fa48("107172"), !valuesMatch)))) {
      if (stryMutAct_9fa48("107173")) {
        {}
      } else {
        stryCov_9fa48("107173");
        logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_INSERT_FAILED, stryMutAct_9fa48("107174") ? {} : (stryCov_9fa48("107174"), {
          sql: stryMutAct_9fa48("107175") ? sql : (stryCov_9fa48("107175"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT))
        }));
        return {};
      }
    }
    const columns = columnsMatch[NUM.ONE].split(PARTITION_SERVICE_SQL_FRAGMENT.COMMA).map(stryMutAct_9fa48("107176") ? () => undefined : (stryCov_9fa48("107176"), c => stryMutAct_9fa48("107177") ? c : (stryCov_9fa48("107177"), c.trim())));
    const valuesStr = valuesMatch[NUM.ONE];

    // Parse values - handle quoted strings and numbers
    const values = parseValuesFromSQL(valuesStr);
    if (stryMutAct_9fa48("107180") ? columns.length === values.length : stryMutAct_9fa48("107179") ? false : stryMutAct_9fa48("107178") ? true : (stryCov_9fa48("107178", "107179", "107180"), columns.length !== values.length)) {
      if (stryMutAct_9fa48("107181")) {
        {}
      } else {
        stryCov_9fa48("107181");
        logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_INSERT_MISMATCH, stryMutAct_9fa48("107182") ? {} : (stryCov_9fa48("107182"), {
          columns: columns.length,
          values: values.length
        }));
        return {};
      }
    }

    // Build data object
    const data = {};
    for (let i = NUM.ZERO; stryMutAct_9fa48("107185") ? i >= columns.length : stryMutAct_9fa48("107184") ? i <= columns.length : stryMutAct_9fa48("107183") ? false : (stryCov_9fa48("107183", "107184", "107185"), i < columns.length); stryMutAct_9fa48("107186") ? i-- : (stryCov_9fa48("107186"), i++)) {
      if (stryMutAct_9fa48("107187")) {
        {}
      } else {
        stryCov_9fa48("107187");
        data[columns[i]] = values[i];
      }
    }

    // Try to fetch the full row from DB to get any default values
    // Find the primary key column (usually first column or 'id')
    const pkColumn = columns[NUM.ZERO];
    const pkValue = values[NUM.ZERO];
    if (stryMutAct_9fa48("107190") ? pkValue !== null || pkValue !== undefined : stryMutAct_9fa48("107189") ? false : stryMutAct_9fa48("107188") ? true : (stryCov_9fa48("107188", "107189", "107190"), (stryMutAct_9fa48("107192") ? pkValue === null : stryMutAct_9fa48("107191") ? true : (stryCov_9fa48("107191", "107192"), pkValue !== null)) && (stryMutAct_9fa48("107194") ? pkValue === undefined : stryMutAct_9fa48("107193") ? true : (stryCov_9fa48("107193", "107194"), pkValue !== undefined)))) {
      if (stryMutAct_9fa48("107195")) {
        {}
      } else {
        stryCov_9fa48("107195");
        try {
          if (stryMutAct_9fa48("107196")) {
            {}
          } else {
            stryCov_9fa48("107196");
            const stmt = db.prepare(stryMutAct_9fa48("107197") ? `` : (stryCov_9fa48("107197"), `SELECT * FROM ${tableName} WHERE ${pkColumn} = ?`));
            const row = stmt.get(pkValue);
            if (stryMutAct_9fa48("107199") ? false : stryMutAct_9fa48("107198") ? true : (stryCov_9fa48("107198", "107199"), row)) {
              if (stryMutAct_9fa48("107200")) {
                {}
              } else {
                stryCov_9fa48("107200");
                if (stryMutAct_9fa48("107202") ? false : stryMutAct_9fa48("107201") ? true : (stryCov_9fa48("107201", "107202"), shouldEmitCdcRowFetchInfoLog(tableName))) {
                  if (stryMutAct_9fa48("107203")) {
                    {}
                  } else {
                    stryCov_9fa48("107203");
                    logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_INSERT_ROW, stryMutAct_9fa48("107204") ? {} : (stryCov_9fa48("107204"), {
                      tableName,
                      rowKeys: Object.keys(row)
                    }));
                  }
                }
                return row;
              }
            }
          }
        } catch (err) {
          if (stryMutAct_9fa48("107205")) {
            {}
          } else {
            stryCov_9fa48("107205");
            logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_INSERT_FAILED, stryMutAct_9fa48("107206") ? {} : (stryCov_9fa48("107206"), {
              tableName,
              error: err.message
            }));
            throw err;
          }
        }
      }
    }
    return data;
  }
}

/**
 * Extract data from an UPDATE SQL statement by querying the updated row.
 * @param {string} sql - UPDATE SQL statement.
 * @param {string} tableName - Table name.
 * @param {Object} db - better-sqlite3 database handle.
 * @param {Object} logger - Logger instance.
 * @return {Object} Extracted data or empty object.
 */
export function extractUpdateDataFromSQL(sql, tableName, db, logger) {
  if (stryMutAct_9fa48("107207")) {
    {}
  } else {
    stryCov_9fa48("107207");
    // Match WHERE clause with optional parentheses: WHERE (col = 'val') or WHERE col = 'val'
    const whereMatch = sql.match(stryMutAct_9fa48("107218") ? /WHERE\s*\(?(\w+)\s*=\s*'([']+)'/i : stryMutAct_9fa48("107217") ? /WHERE\s*\(?(\w+)\s*=\s*'([^'])'/i : stryMutAct_9fa48("107216") ? /WHERE\s*\(?(\w+)\s*=\S*'([^']+)'/i : stryMutAct_9fa48("107215") ? /WHERE\s*\(?(\w+)\s*=\s'([^']+)'/i : stryMutAct_9fa48("107214") ? /WHERE\s*\(?(\w+)\S*=\s*'([^']+)'/i : stryMutAct_9fa48("107213") ? /WHERE\s*\(?(\w+)\s=\s*'([^']+)'/i : stryMutAct_9fa48("107212") ? /WHERE\s*\(?(\W+)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("107211") ? /WHERE\s*\(?(\w)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("107210") ? /WHERE\s*\((\w+)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("107209") ? /WHERE\S*\(?(\w+)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("107208") ? /WHERE\s\(?(\w+)\s*=\s*'([^']+)'/i : (stryCov_9fa48("107208", "107209", "107210", "107211", "107212", "107213", "107214", "107215", "107216", "107217", "107218"), /WHERE\s*\(?(\w+)\s*=\s*'([^']+)'/i));
    if (stryMutAct_9fa48("107220") ? false : stryMutAct_9fa48("107219") ? true : (stryCov_9fa48("107219", "107220"), whereMatch)) {
      if (stryMutAct_9fa48("107221")) {
        {}
      } else {
        stryCov_9fa48("107221");
        const keyColumn = whereMatch[NUM.ONE];
        const keyValue = whereMatch[NUM.TWO];
        if (stryMutAct_9fa48("107223") ? false : stryMutAct_9fa48("107222") ? true : (stryCov_9fa48("107222", "107223"), shouldEmitCdcRowFetchInfoLog(tableName))) {
          if (stryMutAct_9fa48("107224")) {
            {}
          } else {
            stryCov_9fa48("107224");
            logger.info(PARTITION_SERVICE_LOG_MSG.FETCHING_UPDATE_ROW, stryMutAct_9fa48("107225") ? {} : (stryCov_9fa48("107225"), {
              tableName,
              keyColumn,
              keyValue
            }));
          }
        }
        // Query the updated row to get full data for CDC
        try {
          if (stryMutAct_9fa48("107226")) {
            {}
          } else {
            stryCov_9fa48("107226");
            const stmt = db.prepare(stryMutAct_9fa48("107227") ? `` : (stryCov_9fa48("107227"), `SELECT * FROM ${tableName} WHERE ${keyColumn} = ?`));
            const row = stmt.get(keyValue);
            if (stryMutAct_9fa48("107229") ? false : stryMutAct_9fa48("107228") ? true : (stryCov_9fa48("107228", "107229"), row)) {
              if (stryMutAct_9fa48("107230")) {
                {}
              } else {
                stryCov_9fa48("107230");
                if (stryMutAct_9fa48("107232") ? false : stryMutAct_9fa48("107231") ? true : (stryCov_9fa48("107231", "107232"), shouldEmitCdcRowFetchInfoLog(tableName))) {
                  if (stryMutAct_9fa48("107233")) {
                    {}
                  } else {
                    stryCov_9fa48("107233");
                    logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_UPDATE_ROW, stryMutAct_9fa48("107234") ? {} : (stryCov_9fa48("107234"), {
                      tableName,
                      rowKeys: Object.keys(row)
                    }));
                  }
                }
                return row;
              }
            } else {
              if (stryMutAct_9fa48("107235")) {
                {}
              } else {
                stryCov_9fa48("107235");
                logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_NO_ROW_UPDATE, stryMutAct_9fa48("107236") ? {} : (stryCov_9fa48("107236"), {
                  tableName,
                  keyColumn,
                  keyValue
                }));
              }
            }
          }
        } catch (err) {
          if (stryMutAct_9fa48("107237")) {
            {}
          } else {
            stryCov_9fa48("107237");
            logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_UPDATE_FAILED, stryMutAct_9fa48("107238") ? {} : (stryCov_9fa48("107238"), {
              tableName,
              error: err.message
            }));
            throw err;
          }
        }
      }
    } else {
      if (stryMutAct_9fa48("107239")) {
        {}
      } else {
        stryCov_9fa48("107239");
        logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_UPDATE_WHERE_FAILED, stryMutAct_9fa48("107240") ? {} : (stryCov_9fa48("107240"), {
          sql: stryMutAct_9fa48("107241") ? sql : (stryCov_9fa48("107241"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT))
        }));
      }
    }
    return {};
  }
}

/**
 * Extract data from a DELETE SQL statement.
 * @param {string} sql - DELETE SQL statement.
 * @param {Object} logger - Logger instance.
 * @return {Object} Extracted data or empty object.
 */
export function extractDeleteDataFromSQL(sql, logger) {
  if (stryMutAct_9fa48("107242")) {
    {}
  } else {
    stryCov_9fa48("107242");
    // Match WHERE clause: WHERE col = 'val'
    const whereMatch = sql.match(stryMutAct_9fa48("107253") ? /WHERE\s*\(?(\w+)\s*=\s*'([']+)'/i : stryMutAct_9fa48("107252") ? /WHERE\s*\(?(\w+)\s*=\s*'([^'])'/i : stryMutAct_9fa48("107251") ? /WHERE\s*\(?(\w+)\s*=\S*'([^']+)'/i : stryMutAct_9fa48("107250") ? /WHERE\s*\(?(\w+)\s*=\s'([^']+)'/i : stryMutAct_9fa48("107249") ? /WHERE\s*\(?(\w+)\S*=\s*'([^']+)'/i : stryMutAct_9fa48("107248") ? /WHERE\s*\(?(\w+)\s=\s*'([^']+)'/i : stryMutAct_9fa48("107247") ? /WHERE\s*\(?(\W+)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("107246") ? /WHERE\s*\(?(\w)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("107245") ? /WHERE\s*\((\w+)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("107244") ? /WHERE\S*\(?(\w+)\s*=\s*'([^']+)'/i : stryMutAct_9fa48("107243") ? /WHERE\s\(?(\w+)\s*=\s*'([^']+)'/i : (stryCov_9fa48("107243", "107244", "107245", "107246", "107247", "107248", "107249", "107250", "107251", "107252", "107253"), /WHERE\s*\(?(\w+)\s*=\s*'([^']+)'/i));
    if (stryMutAct_9fa48("107255") ? false : stryMutAct_9fa48("107254") ? true : (stryCov_9fa48("107254", "107255"), whereMatch)) {
      if (stryMutAct_9fa48("107256")) {
        {}
      } else {
        stryCov_9fa48("107256");
        const keyColumn = whereMatch[NUM.ONE];
        const keyValue = whereMatch[NUM.TWO];
        return stryMutAct_9fa48("107257") ? {} : (stryCov_9fa48("107257"), {
          [keyColumn]: keyValue
        });
      }
    }
    logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_DELETE_WHERE_FAILED, stryMutAct_9fa48("107258") ? {} : (stryCov_9fa48("107258"), {
      sql: stryMutAct_9fa48("107259") ? sql : (stryCov_9fa48("107259"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT))
    }));
    return {};
  }
}

/**
 * Extract data from parameterized SQL (SQL with ? placeholders and params).
 * @param {string} sql - SQL statement with ? placeholders.
 * @param {Array} params - Parameter values.
 * @param {string} tableName - Table name.
 * @param {string} operationType - INSERT, UPDATE, or DELETE.
 * @param {Object} logger - Logger instance.
 * @return {Object} Extracted data or empty object.
 */
export function extractDataFromParameterizedSQL(sql, params, tableName, operationType, logger) {
  if (stryMutAct_9fa48("107260")) {
    {}
  } else {
    stryCov_9fa48("107260");
    if (stryMutAct_9fa48("107263") ? !params && params.length === NUM.ZERO : stryMutAct_9fa48("107262") ? false : stryMutAct_9fa48("107261") ? true : (stryCov_9fa48("107261", "107262", "107263"), (stryMutAct_9fa48("107264") ? params : (stryCov_9fa48("107264"), !params)) || (stryMutAct_9fa48("107266") ? params.length !== NUM.ZERO : stryMutAct_9fa48("107265") ? false : (stryCov_9fa48("107265", "107266"), params.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("107267")) {
        {}
      } else {
        stryCov_9fa48("107267");
        return {};
      }
    }
    if (stryMutAct_9fa48("107270") ? operationType === PARTITION_SERVICE_OPERATION.INSERT && operationType === PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("107269") ? false : stryMutAct_9fa48("107268") ? true : (stryCov_9fa48("107268", "107269", "107270"), (stryMutAct_9fa48("107272") ? operationType !== PARTITION_SERVICE_OPERATION.INSERT : stryMutAct_9fa48("107271") ? false : (stryCov_9fa48("107271", "107272"), operationType === PARTITION_SERVICE_OPERATION.INSERT)) || (stryMutAct_9fa48("107274") ? operationType !== PARTITION_SERVICE_OPERATION.UPSERT : stryMutAct_9fa48("107273") ? false : (stryCov_9fa48("107273", "107274"), operationType === PARTITION_SERVICE_OPERATION.UPSERT)))) {
      if (stryMutAct_9fa48("107275")) {
        {}
      } else {
        stryCov_9fa48("107275");
        // Parse INSERT INTO table (col1, col2, ...) VALUES (?, ?, ...)
        const columnsMatch = sql.match(stryMutAct_9fa48("107290") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([)]+)\)/i : stryMutAct_9fa48("107289") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)])\)/i : stryMutAct_9fa48("107288") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\S*\(([^)]+)\)/i : stryMutAct_9fa48("107287") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s\(([^)]+)\)/i : stryMutAct_9fa48("107286") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\W+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107285") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w\s*\(([^)]+)\)/i : stryMutAct_9fa48("107284") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\S+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107283") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107282") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\S+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107281") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107280") ? /INSERT\s+(?:OR\S+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107279") ? /INSERT\s+(?:OR\s(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107278") ? /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107277") ? /INSERT\S+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : stryMutAct_9fa48("107276") ? /INSERT\s(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i : (stryCov_9fa48("107276", "107277", "107278", "107279", "107280", "107281", "107282", "107283", "107284", "107285", "107286", "107287", "107288", "107289", "107290"), /INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO\s+\w+\s*\(([^)]+)\)/i));
        if (stryMutAct_9fa48("107293") ? false : stryMutAct_9fa48("107292") ? true : stryMutAct_9fa48("107291") ? columnsMatch : (stryCov_9fa48("107291", "107292", "107293"), !columnsMatch)) {
          if (stryMutAct_9fa48("107294")) {
            {}
          } else {
            stryCov_9fa48("107294");
            logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_INSERT_COLUMNS_FAILED, stryMutAct_9fa48("107295") ? {} : (stryCov_9fa48("107295"), {
              sql: stryMutAct_9fa48("107296") ? sql : (stryCov_9fa48("107296"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT))
            }));
            return {};
          }
        }
        const columns = columnsMatch[NUM.ONE].split(PARTITION_SERVICE_SQL_FRAGMENT.COMMA).map(stryMutAct_9fa48("107297") ? () => undefined : (stryCov_9fa48("107297"), c => stryMutAct_9fa48("107298") ? c : (stryCov_9fa48("107298"), c.trim())));
        if (stryMutAct_9fa48("107301") ? columns.length === params.length : stryMutAct_9fa48("107300") ? false : stryMutAct_9fa48("107299") ? true : (stryCov_9fa48("107299", "107300", "107301"), columns.length !== params.length)) {
          if (stryMutAct_9fa48("107302")) {
            {}
          } else {
            stryCov_9fa48("107302");
            logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, stryMutAct_9fa48("107303") ? {} : (stryCov_9fa48("107303"), {
              columns: columns.length,
              params: params.length
            }));
            return {};
          }
        }

        // Build data object from columns and params
        const data = {};
        for (let i = NUM.ZERO; stryMutAct_9fa48("107306") ? i >= columns.length : stryMutAct_9fa48("107305") ? i <= columns.length : stryMutAct_9fa48("107304") ? false : (stryCov_9fa48("107304", "107305", "107306"), i < columns.length); stryMutAct_9fa48("107307") ? i-- : (stryCov_9fa48("107307"), i++)) {
          if (stryMutAct_9fa48("107308")) {
            {}
          } else {
            stryCov_9fa48("107308");
            data[columns[i]] = params[i];
          }
        }
        logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_INSERT, stryMutAct_9fa48("107309") ? {} : (stryCov_9fa48("107309"), {
          tableName,
          dataKeys: Object.keys(data)
        }));
        return data;
      }
    }
    if (stryMutAct_9fa48("107312") ? operationType !== PARTITION_SERVICE_OPERATION.UPDATE : stryMutAct_9fa48("107311") ? false : stryMutAct_9fa48("107310") ? true : (stryCov_9fa48("107310", "107311", "107312"), operationType === PARTITION_SERVICE_OPERATION.UPDATE)) {
      if (stryMutAct_9fa48("107313")) {
        {}
      } else {
        stryCov_9fa48("107313");
        // Parse UPDATE table SET col1 = ?, col2 = ? WHERE pk = ?
        // Use [\s\S] so multiline SQL emitted by query builders stays parseable.
        const setMatch = sql.match(stryMutAct_9fa48("107321") ? /\bSET\s+([\s\S]+?)\S+\bWHERE\b/i : stryMutAct_9fa48("107320") ? /\bSET\s+([\s\S]+?)\s\bWHERE\b/i : stryMutAct_9fa48("107319") ? /\bSET\s+([\s\s]+?)\s+\bWHERE\b/i : stryMutAct_9fa48("107318") ? /\bSET\s+([\S\S]+?)\s+\bWHERE\b/i : stryMutAct_9fa48("107317") ? /\bSET\s+([^\s\S]+?)\s+\bWHERE\b/i : stryMutAct_9fa48("107316") ? /\bSET\s+([\s\S])\s+\bWHERE\b/i : stryMutAct_9fa48("107315") ? /\bSET\S+([\s\S]+?)\s+\bWHERE\b/i : stryMutAct_9fa48("107314") ? /\bSET\s([\s\S]+?)\s+\bWHERE\b/i : (stryCov_9fa48("107314", "107315", "107316", "107317", "107318", "107319", "107320", "107321"), /\bSET\s+([\s\S]+?)\s+\bWHERE\b/i));
        const whereMatch = sql.match(stryMutAct_9fa48("107328") ? /\bWHERE\s+([\s\s]+)$/i : stryMutAct_9fa48("107327") ? /\bWHERE\s+([\S\S]+)$/i : stryMutAct_9fa48("107326") ? /\bWHERE\s+([^\s\S]+)$/i : stryMutAct_9fa48("107325") ? /\bWHERE\s+([\s\S])$/i : stryMutAct_9fa48("107324") ? /\bWHERE\S+([\s\S]+)$/i : stryMutAct_9fa48("107323") ? /\bWHERE\s([\s\S]+)$/i : stryMutAct_9fa48("107322") ? /\bWHERE\s+([\s\S]+)/i : (stryCov_9fa48("107322", "107323", "107324", "107325", "107326", "107327", "107328"), /\bWHERE\s+([\s\S]+)$/i));
        if (stryMutAct_9fa48("107331") ? false : stryMutAct_9fa48("107330") ? true : stryMutAct_9fa48("107329") ? setMatch : (stryCov_9fa48("107329", "107330", "107331"), !setMatch)) {
          if (stryMutAct_9fa48("107332")) {
            {}
          } else {
            stryCov_9fa48("107332");
            logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_UPDATE_SET_FAILED, stryMutAct_9fa48("107333") ? {} : (stryCov_9fa48("107333"), {
              sql: stryMutAct_9fa48("107334") ? sql : (stryCov_9fa48("107334"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT))
            }));
            return {};
          }
        }

        // Extract column names from SET clause
        const setColumns = stryMutAct_9fa48("107335") ? setMatch[NUM.ONE].split(PARTITION_SERVICE_SQL_FRAGMENT.COMMA).map(part => {
          const match = part.trim().match(/^(\w+)\s*=/);
          return match ? match[NUM.ONE] : null;
        }) : (stryCov_9fa48("107335"), setMatch[NUM.ONE].split(PARTITION_SERVICE_SQL_FRAGMENT.COMMA).map(part => {
          if (stryMutAct_9fa48("107336")) {
            {}
          } else {
            stryCov_9fa48("107336");
            const match = stryMutAct_9fa48("107337") ? part.match(/^(\w+)\s*=/) : (stryCov_9fa48("107337"), part.trim().match(stryMutAct_9fa48("107342") ? /^(\w+)\S*=/ : stryMutAct_9fa48("107341") ? /^(\w+)\s=/ : stryMutAct_9fa48("107340") ? /^(\W+)\s*=/ : stryMutAct_9fa48("107339") ? /^(\w)\s*=/ : stryMutAct_9fa48("107338") ? /(\w+)\s*=/ : (stryCov_9fa48("107338", "107339", "107340", "107341", "107342"), /^(\w+)\s*=/)));
            return match ? match[NUM.ONE] : null;
          }
        }).filter(Boolean));

        // Extract column names from WHERE clause
        // Handle parentheses around the WHERE clause: WHERE (col = ?)
        const whereColumns = whereMatch ? extractConjunctiveWhereColumns(whereMatch[NUM.ONE]) : stryMutAct_9fa48("107343") ? ["Stryker was here"] : (stryCov_9fa48("107343"), []);
        const allColumns = stryMutAct_9fa48("107344") ? [] : (stryCov_9fa48("107344"), [...setColumns, ...whereColumns]);
        if (stryMutAct_9fa48("107347") ? allColumns.length === params.length : stryMutAct_9fa48("107346") ? false : stryMutAct_9fa48("107345") ? true : (stryCov_9fa48("107345", "107346", "107347"), allColumns.length !== params.length)) {
          if (stryMutAct_9fa48("107348")) {
            {}
          } else {
            stryCov_9fa48("107348");
            logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_UPDATE_MISMATCH, stryMutAct_9fa48("107349") ? {} : (stryCov_9fa48("107349"), {
              columns: allColumns.length,
              params: params.length
            }));
            return {};
          }
        }

        // Build data object while preserving UPDATE semantics:
        // SET-column values are authoritative; WHERE-only columns backfill keys.
        const data = {};
        let paramIndex = NUM.ZERO;
        for (const column of setColumns) {
          if (stryMutAct_9fa48("107350")) {
            {}
          } else {
            stryCov_9fa48("107350");
            data[column] = params[paramIndex];
            stryMutAct_9fa48("107351") ? paramIndex -= NUM.ONE : (stryCov_9fa48("107351"), paramIndex += NUM.ONE);
          }
        }
        for (const column of whereColumns) {
          if (stryMutAct_9fa48("107352")) {
            {}
          } else {
            stryCov_9fa48("107352");
            const value = params[paramIndex];
            stryMutAct_9fa48("107353") ? paramIndex -= NUM.ONE : (stryCov_9fa48("107353"), paramIndex += NUM.ONE);
            if (stryMutAct_9fa48("107356") ? false : stryMutAct_9fa48("107355") ? true : stryMutAct_9fa48("107354") ? Object.prototype.hasOwnProperty.call(data, column) : (stryCov_9fa48("107354", "107355", "107356"), !Object.prototype.hasOwnProperty.call(data, column))) {
              if (stryMutAct_9fa48("107357")) {
                {}
              } else {
                stryCov_9fa48("107357");
                data[column] = value;
              }
            }
          }
        }
        logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_UPDATE, stryMutAct_9fa48("107358") ? {} : (stryCov_9fa48("107358"), {
          tableName,
          dataKeys: Object.keys(data)
        }));
        return data;
      }
    }
    if (stryMutAct_9fa48("107361") ? operationType !== PARTITION_SERVICE_OPERATION.DELETE : stryMutAct_9fa48("107360") ? false : stryMutAct_9fa48("107359") ? true : (stryCov_9fa48("107359", "107360", "107361"), operationType === PARTITION_SERVICE_OPERATION.DELETE)) {
      if (stryMutAct_9fa48("107362")) {
        {}
      } else {
        stryCov_9fa48("107362");
        // Parse DELETE FROM table WHERE pk = ? or WHERE (pk = ?)
        // Use [\s\S] for multiline predicates.
        const whereMatch = sql.match(stryMutAct_9fa48("107369") ? /\bWHERE\s+([\s\s]+)$/i : stryMutAct_9fa48("107368") ? /\bWHERE\s+([\S\S]+)$/i : stryMutAct_9fa48("107367") ? /\bWHERE\s+([^\s\S]+)$/i : stryMutAct_9fa48("107366") ? /\bWHERE\s+([\s\S])$/i : stryMutAct_9fa48("107365") ? /\bWHERE\S+([\s\S]+)$/i : stryMutAct_9fa48("107364") ? /\bWHERE\s([\s\S]+)$/i : stryMutAct_9fa48("107363") ? /\bWHERE\s+([\s\S]+)/i : (stryCov_9fa48("107363", "107364", "107365", "107366", "107367", "107368", "107369"), /\bWHERE\s+([\s\S]+)$/i));
        if (stryMutAct_9fa48("107372") ? false : stryMutAct_9fa48("107371") ? true : stryMutAct_9fa48("107370") ? whereMatch : (stryCov_9fa48("107370", "107371", "107372"), !whereMatch)) {
          if (stryMutAct_9fa48("107373")) {
            {}
          } else {
            stryCov_9fa48("107373");
            logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_DELETE_WHERE_FAILED, stryMutAct_9fa48("107374") ? {} : (stryCov_9fa48("107374"), {
              sql: stryMutAct_9fa48("107375") ? sql : (stryCov_9fa48("107375"), sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT))
            }));
            return {};
          }
        }
        const whereContent = stryMutAct_9fa48("107376") ? whereMatch[NUM.ONE] : (stryCov_9fa48("107376"), whereMatch[NUM.ONE].trim());
        const whereColumns = extractConjunctiveWhereColumns(whereContent);
        if (stryMutAct_9fa48("107379") ? whereColumns.length === params.length : stryMutAct_9fa48("107378") ? false : stryMutAct_9fa48("107377") ? true : (stryCov_9fa48("107377", "107378", "107379"), whereColumns.length !== params.length)) {
          if (stryMutAct_9fa48("107380")) {
            {}
          } else {
            stryCov_9fa48("107380");
            logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_DELETE_MISMATCH, stryMutAct_9fa48("107381") ? {} : (stryCov_9fa48("107381"), {
              columns: whereColumns.length,
              params: params.length,
              whereContent
            }));
            return {};
          }
        }
        const data = {};
        for (let i = NUM.ZERO; stryMutAct_9fa48("107384") ? i >= whereColumns.length : stryMutAct_9fa48("107383") ? i <= whereColumns.length : stryMutAct_9fa48("107382") ? false : (stryCov_9fa48("107382", "107383", "107384"), i < whereColumns.length); stryMutAct_9fa48("107385") ? i-- : (stryCov_9fa48("107385"), i++)) {
          if (stryMutAct_9fa48("107386")) {
            {}
          } else {
            stryCov_9fa48("107386");
            data[whereColumns[i]] = params[i];
          }
        }
        logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_DELETE, stryMutAct_9fa48("107387") ? {} : (stryCov_9fa48("107387"), {
          tableName,
          dataKeys: Object.keys(data)
        }));
        return data;
      }
    }
    return {};
  }
}