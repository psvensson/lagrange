/**
 * CDC SQL Builder - Builds SQL queries for CDC operations.
 *
 * This module provides SQL building logic extracted from CDCIntegrationService.
 * It handles building INSERT, UPDATE, DELETE, and UPSERT SQL statements.
 *
 * Requirements: 1.4, 1.8
 *
 * @module cdc/cdc-sql-builder
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
import { getSchemaByTableName } from '../bootstrap/system-table-schemas-constants.js';
import { CDC_ERROR_MSG, CDC_SQL } from './cdc-constants.js';
const DEFAULT_VALUE_NORMALIZATION_STATE = Object.freeze(stryMutAct_9fa48("39308") ? {} : (stryCov_9fa48("39308"), {
  NULL: stryMutAct_9fa48("39309") ? "" : (stryCov_9fa48("39309"), 'null'),
  UNDEFINED: stryMutAct_9fa48("39310") ? "" : (stryCov_9fa48("39310"), 'undefined'),
  VALUE: stryMutAct_9fa48("39311") ? "" : (stryCov_9fa48("39311"), 'value')
}));
const TABLE_NAME_EXTRACTION_STATE = Object.freeze(stryMutAct_9fa48("39312") ? {} : (stryCov_9fa48("39312"), {
  FOUND: stryMutAct_9fa48("39313") ? "" : (stryCov_9fa48("39313"), 'found'),
  INVALID_INPUT: stryMutAct_9fa48("39314") ? "" : (stryCov_9fa48("39314"), 'invalid_input'),
  NOT_FOUND: stryMutAct_9fa48("39315") ? "" : (stryCov_9fa48("39315"), 'not_found')
}));
function materializeNormalizedDefaultValue(result) {
  if (stryMutAct_9fa48("39316")) {
    {}
  } else {
    stryCov_9fa48("39316");
    if (stryMutAct_9fa48("39319") ? result.state !== DEFAULT_VALUE_NORMALIZATION_STATE.VALUE : stryMutAct_9fa48("39318") ? false : stryMutAct_9fa48("39317") ? true : (stryCov_9fa48("39317", "39318", "39319"), result.state === DEFAULT_VALUE_NORMALIZATION_STATE.VALUE)) {
      if (stryMutAct_9fa48("39320")) {
        {}
      } else {
        stryCov_9fa48("39320");
        return result.value;
      }
    }
    if (stryMutAct_9fa48("39323") ? result.state !== DEFAULT_VALUE_NORMALIZATION_STATE.NULL : stryMutAct_9fa48("39322") ? false : stryMutAct_9fa48("39321") ? true : (stryCov_9fa48("39321", "39322", "39323"), result.state === DEFAULT_VALUE_NORMALIZATION_STATE.NULL)) {
      if (stryMutAct_9fa48("39324")) {
        {}
      } else {
        stryCov_9fa48("39324");
        return null;
      }
    }
    return undefined;
  }
}

/**
 * CDCSqlBuilder provides SQL building utilities for CDC operations.
 *
 * This class is responsible for:
 * - Building INSERT column lists and value placeholders
 * - Building UPDATE SET clauses
 * - Building WHERE clauses
 * - Filtering data to valid table columns
 * - Normalizing default values from schema
 *
 * @interface
 *
 * @description
 * CDCSqlBuilder provides SQL building logic that was previously embedded
 * in CDCIntegrationService. It is stateless and can be used as a utility.
 *
 * Requirements: 1.4, 1.8
 *
 * @example
 * const builder = new CDCSqlBuilder();
 * const {columns, placeholders, values} = builder.buildInsertParts(data);
 * const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`;
 */
class CDCSqlBuilder {
  /**
   * Build column list and value placeholders for INSERT.
   * @param {Object} data - Row data.
   * @return {Object} {columns, placeholders, values}
   */
  buildInsertParts(data) {
    if (stryMutAct_9fa48("39325")) {
      {}
    } else {
      stryCov_9fa48("39325");
      const columns = Object.keys(data);
      const placeholders = columns.map(stryMutAct_9fa48("39326") ? () => undefined : (stryCov_9fa48("39326"), () => CDC_SQL.PARAM_PLACEHOLDER)).join(CDC_SQL.COMMA_SPACE);
      const values = columns.map(col => {
        if (stryMutAct_9fa48("39327")) {
          {}
        } else {
          stryCov_9fa48("39327");
          const val = data[col];
          // Serialize objects/arrays to JSON
          if (stryMutAct_9fa48("39330") ? val !== null || typeof val === TYPEOF.OBJECT : stryMutAct_9fa48("39329") ? false : stryMutAct_9fa48("39328") ? true : (stryCov_9fa48("39328", "39329", "39330"), (stryMutAct_9fa48("39332") ? val === null : stryMutAct_9fa48("39331") ? true : (stryCov_9fa48("39331", "39332"), val !== null)) && (stryMutAct_9fa48("39334") ? typeof val !== TYPEOF.OBJECT : stryMutAct_9fa48("39333") ? true : (stryCov_9fa48("39333", "39334"), typeof val === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("39335")) {
              {}
            } else {
              stryCov_9fa48("39335");
              return JSON.stringify(val);
            }
          }
          return val;
        }
      });
      return stryMutAct_9fa48("39336") ? {} : (stryCov_9fa48("39336"), {
        columns: columns.join(CDC_SQL.COMMA_SPACE),
        placeholders,
        values
      });
    }
  }

  /**
   * Build SET clause for UPDATE.
   * @param {Object} data - Data to update.
   * @return {Object} {setClause, values}
   */
  buildUpdateParts(data) {
    if (stryMutAct_9fa48("39337")) {
      {}
    } else {
      stryCov_9fa48("39337");
      const columns = Object.keys(data);
      const setClause = columns.map(stryMutAct_9fa48("39338") ? () => undefined : (stryCov_9fa48("39338"), col => stryMutAct_9fa48("39339") ? `` : (stryCov_9fa48("39339"), `${col}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`))).join(CDC_SQL.COMMA_SPACE);
      const values = columns.map(col => {
        if (stryMutAct_9fa48("39340")) {
          {}
        } else {
          stryCov_9fa48("39340");
          const val = data[col];
          if (stryMutAct_9fa48("39343") ? val !== null || typeof val === TYPEOF.OBJECT : stryMutAct_9fa48("39342") ? false : stryMutAct_9fa48("39341") ? true : (stryCov_9fa48("39341", "39342", "39343"), (stryMutAct_9fa48("39345") ? val === null : stryMutAct_9fa48("39344") ? true : (stryCov_9fa48("39344", "39345"), val !== null)) && (stryMutAct_9fa48("39347") ? typeof val !== TYPEOF.OBJECT : stryMutAct_9fa48("39346") ? true : (stryCov_9fa48("39346", "39347"), typeof val === TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("39348")) {
              {}
            } else {
              stryCov_9fa48("39348");
              return JSON.stringify(val);
            }
          }
          return val;
        }
      });
      return stryMutAct_9fa48("39349") ? {} : (stryCov_9fa48("39349"), {
        setClause,
        values
      });
    }
  }

  /**
   * Build WHERE clause from conditions.
   * @param {Object} whereClause - WHERE conditions.
   * @return {Object} {whereStr, values}
   */
  buildWhereParts(whereClause) {
    if (stryMutAct_9fa48("39350")) {
      {}
    } else {
      stryCov_9fa48("39350");
      const conditions = Object.keys(whereClause);
      const whereStr = conditions.map(stryMutAct_9fa48("39351") ? () => undefined : (stryCov_9fa48("39351"), col => stryMutAct_9fa48("39352") ? `` : (stryCov_9fa48("39352"), `${col}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`))).join(CDC_SQL.WHERE_AND);
      const values = conditions.map(stryMutAct_9fa48("39353") ? () => undefined : (stryCov_9fa48("39353"), col => whereClause[col]));
      return stryMutAct_9fa48("39354") ? {} : (stryCov_9fa48("39354"), {
        whereStr,
        values
      });
    }
  }

  /**
   * Filter row data to known columns for the target system table.
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data.
   * @return {Object} Filtered row data.
   */
  filterDataForTable(tableName, data) {
    if (stryMutAct_9fa48("39355")) {
      {}
    } else {
      stryCov_9fa48("39355");
      const schema = getSchemaByTableName(tableName);
      if (stryMutAct_9fa48("39358") ? !schema && !schema.columns : stryMutAct_9fa48("39357") ? false : stryMutAct_9fa48("39356") ? true : (stryCov_9fa48("39356", "39357", "39358"), (stryMutAct_9fa48("39359") ? schema : (stryCov_9fa48("39359"), !schema)) || (stryMutAct_9fa48("39360") ? schema.columns : (stryCov_9fa48("39360"), !schema.columns)))) {
        if (stryMutAct_9fa48("39361")) {
          {}
        } else {
          stryCov_9fa48("39361");
          throw new Error(stryMutAct_9fa48("39362") ? `` : (stryCov_9fa48("39362"), `${CDC_ERROR_MSG.SCHEMA_MISSING_PREFIX}${tableName}`));
        }
      }
      const allowed = new Set(schema.columns.map(stryMutAct_9fa48("39363") ? () => undefined : (stryCov_9fa48("39363"), column => column.name)));
      const filtered = {};
      for (const [key, value] of Object.entries(data)) {
        if (stryMutAct_9fa48("39364")) {
          {}
        } else {
          stryCov_9fa48("39364");
          if (stryMutAct_9fa48("39366") ? false : stryMutAct_9fa48("39365") ? true : (stryCov_9fa48("39365", "39366"), allowed.has(key))) {
            if (stryMutAct_9fa48("39367")) {
              {}
            } else {
              stryCov_9fa48("39367");
              filtered[key] = value;
            }
          }
        }
      }
      return filtered;
    }
  }

  /**
   * Normalize one schema default into an explicit result contract.
   * @param {string|number|null} value - Default value.
   * @return {Object} Explicit normalization result.
   */
  normalizeDefaultValue(value) {
    if (stryMutAct_9fa48("39368")) {
      {}
    } else {
      stryCov_9fa48("39368");
      return this.normalizeDefaultValueResult(value);
    }
  }

  /**
   * Normalize one default value into an explicit result state.
   * @param {string|number|null} value
   * @return {Object}
   */
  normalizeDefaultValueResult(value) {
    if (stryMutAct_9fa48("39369")) {
      {}
    } else {
      stryCov_9fa48("39369");
      if (stryMutAct_9fa48("39372") ? value !== undefined : stryMutAct_9fa48("39371") ? false : stryMutAct_9fa48("39370") ? true : (stryCov_9fa48("39370", "39371", "39372"), value === undefined)) {
        if (stryMutAct_9fa48("39373")) {
          {}
        } else {
          stryCov_9fa48("39373");
          return Object.freeze(stryMutAct_9fa48("39374") ? {} : (stryCov_9fa48("39374"), {
            state: DEFAULT_VALUE_NORMALIZATION_STATE.UNDEFINED
          }));
        }
      }
      if (stryMutAct_9fa48("39377") ? value !== null : stryMutAct_9fa48("39376") ? false : stryMutAct_9fa48("39375") ? true : (stryCov_9fa48("39375", "39376", "39377"), value === null)) {
        if (stryMutAct_9fa48("39378")) {
          {}
        } else {
          stryCov_9fa48("39378");
          return Object.freeze(stryMutAct_9fa48("39379") ? {} : (stryCov_9fa48("39379"), {
            state: DEFAULT_VALUE_NORMALIZATION_STATE.NULL
          }));
        }
      }
      if (stryMutAct_9fa48("39382") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("39381") ? false : stryMutAct_9fa48("39380") ? true : (stryCov_9fa48("39380", "39381", "39382"), typeof value !== TYPEOF.STRING)) {
        if (stryMutAct_9fa48("39383")) {
          {}
        } else {
          stryCov_9fa48("39383");
          return Object.freeze(stryMutAct_9fa48("39384") ? {} : (stryCov_9fa48("39384"), {
            state: DEFAULT_VALUE_NORMALIZATION_STATE.VALUE,
            value
          }));
        }
      }
      const trimmed = stryMutAct_9fa48("39385") ? value : (stryCov_9fa48("39385"), value.trim());
      if (stryMutAct_9fa48("39388") ? trimmed.startsWith('\'') && trimmed.endsWith('\'') && trimmed.startsWith('"') && trimmed.endsWith('"') : stryMutAct_9fa48("39387") ? false : stryMutAct_9fa48("39386") ? true : (stryCov_9fa48("39386", "39387", "39388"), (stryMutAct_9fa48("39390") ? trimmed.startsWith('\'') || trimmed.endsWith('\'') : stryMutAct_9fa48("39389") ? false : (stryCov_9fa48("39389", "39390"), (stryMutAct_9fa48("39391") ? trimmed.endsWith('\'') : (stryCov_9fa48("39391"), trimmed.startsWith(stryMutAct_9fa48("39392") ? "" : (stryCov_9fa48("39392"), '\'')))) && (stryMutAct_9fa48("39393") ? trimmed.startsWith('\'') : (stryCov_9fa48("39393"), trimmed.endsWith(stryMutAct_9fa48("39394") ? "" : (stryCov_9fa48("39394"), '\'')))))) || (stryMutAct_9fa48("39396") ? trimmed.startsWith('"') || trimmed.endsWith('"') : stryMutAct_9fa48("39395") ? false : (stryCov_9fa48("39395", "39396"), (stryMutAct_9fa48("39397") ? trimmed.endsWith('"') : (stryCov_9fa48("39397"), trimmed.startsWith(stryMutAct_9fa48("39398") ? "" : (stryCov_9fa48("39398"), '"')))) && (stryMutAct_9fa48("39399") ? trimmed.startsWith('"') : (stryCov_9fa48("39399"), trimmed.endsWith(stryMutAct_9fa48("39400") ? "" : (stryCov_9fa48("39400"), '"')))))))) {
        if (stryMutAct_9fa48("39401")) {
          {}
        } else {
          stryCov_9fa48("39401");
          return Object.freeze(stryMutAct_9fa48("39402") ? {} : (stryCov_9fa48("39402"), {
            state: DEFAULT_VALUE_NORMALIZATION_STATE.VALUE,
            value: stryMutAct_9fa48("39403") ? trimmed : (stryCov_9fa48("39403"), trimmed.slice(NUM.ONE, NUM.NEGATIVE_ONE))
          }));
        }
      }
      if (stryMutAct_9fa48("39406") ? trimmed.toLowerCase() !== 'null' : stryMutAct_9fa48("39405") ? false : stryMutAct_9fa48("39404") ? true : (stryCov_9fa48("39404", "39405", "39406"), (stryMutAct_9fa48("39407") ? trimmed.toUpperCase() : (stryCov_9fa48("39407"), trimmed.toLowerCase())) === (stryMutAct_9fa48("39408") ? "" : (stryCov_9fa48("39408"), 'null')))) {
        if (stryMutAct_9fa48("39409")) {
          {}
        } else {
          stryCov_9fa48("39409");
          return Object.freeze(stryMutAct_9fa48("39410") ? {} : (stryCov_9fa48("39410"), {
            state: DEFAULT_VALUE_NORMALIZATION_STATE.NULL
          }));
        }
      }
      if (stryMutAct_9fa48("39412") ? false : stryMutAct_9fa48("39411") ? true : (stryCov_9fa48("39411", "39412"), (stryMutAct_9fa48("39420") ? /^-?\d+(\.\D+)?$/ : stryMutAct_9fa48("39419") ? /^-?\d+(\.\d)?$/ : stryMutAct_9fa48("39418") ? /^-?\d+(\.\d+)$/ : stryMutAct_9fa48("39417") ? /^-?\D+(\.\d+)?$/ : stryMutAct_9fa48("39416") ? /^-?\d(\.\d+)?$/ : stryMutAct_9fa48("39415") ? /^-\d+(\.\d+)?$/ : stryMutAct_9fa48("39414") ? /^-?\d+(\.\d+)?/ : stryMutAct_9fa48("39413") ? /-?\d+(\.\d+)?$/ : (stryCov_9fa48("39413", "39414", "39415", "39416", "39417", "39418", "39419", "39420"), /^-?\d+(\.\d+)?$/)).test(trimmed))) {
        if (stryMutAct_9fa48("39421")) {
          {}
        } else {
          stryCov_9fa48("39421");
          return Object.freeze(stryMutAct_9fa48("39422") ? {} : (stryCov_9fa48("39422"), {
            state: DEFAULT_VALUE_NORMALIZATION_STATE.VALUE,
            value: Number(trimmed)
          }));
        }
      }
      return Object.freeze(stryMutAct_9fa48("39423") ? {} : (stryCov_9fa48("39423"), {
        state: DEFAULT_VALUE_NORMALIZATION_STATE.VALUE,
        value: trimmed
      }));
    }
  }

  /**
   * Apply schema-defined defaults to missing fields.
   * @param {Object} schema - Table schema.
   * @param {Object} rowData - Row data to mutate.
   */
  applySchemaDefaults(schema, rowData) {
    if (stryMutAct_9fa48("39424")) {
      {}
    } else {
      stryCov_9fa48("39424");
      for (const column of schema.columns) {
        if (stryMutAct_9fa48("39425")) {
          {}
        } else {
          stryCov_9fa48("39425");
          if (stryMutAct_9fa48("39428") ? rowData[column.name] === undefined : stryMutAct_9fa48("39427") ? false : stryMutAct_9fa48("39426") ? true : (stryCov_9fa48("39426", "39427", "39428"), rowData[column.name] !== undefined)) {
            if (stryMutAct_9fa48("39429")) {
              {}
            } else {
              stryCov_9fa48("39429");
              continue;
            }
          }
          if (stryMutAct_9fa48("39432") ? column.defaultValue !== undefined : stryMutAct_9fa48("39431") ? false : stryMutAct_9fa48("39430") ? true : (stryCov_9fa48("39430", "39431", "39432"), column.defaultValue === undefined)) {
            if (stryMutAct_9fa48("39433")) {
              {}
            } else {
              stryCov_9fa48("39433");
              continue;
            }
          }
          const normalizedDefault = this.normalizeDefaultValueResult(column.defaultValue);
          if (stryMutAct_9fa48("39436") ? normalizedDefault.state !== DEFAULT_VALUE_NORMALIZATION_STATE.UNDEFINED : stryMutAct_9fa48("39435") ? false : stryMutAct_9fa48("39434") ? true : (stryCov_9fa48("39434", "39435", "39436"), normalizedDefault.state === DEFAULT_VALUE_NORMALIZATION_STATE.UNDEFINED)) {
            if (stryMutAct_9fa48("39437")) {
              {}
            } else {
              stryCov_9fa48("39437");
              continue;
            }
          }
          rowData[column.name] = materializeNormalizedDefaultValue(normalizedDefault);
        }
      }
    }
  }

  /**
   * Extract table name from SQL statement.
   * Supports INSERT INTO, UPDATE, DELETE FROM, and SQLite
   * INSERT OR <modifier> INTO statements.
   *
   * @param {string} sql - SQL query string.
   * @return {Object} Explicit table-name extraction result.
   */
  extractTableNameFromSQL(sql) {
    if (stryMutAct_9fa48("39438")) {
      {}
    } else {
      stryCov_9fa48("39438");
      return this.extractTableNameResult(sql);
    }
  }

  /**
   * Extract table name from SQL statement into an explicit result state.
   * @param {string} sql
   * @return {Object}
   */
  extractTableNameResult(sql) {
    if (stryMutAct_9fa48("39439")) {
      {}
    } else {
      stryCov_9fa48("39439");
      if (stryMutAct_9fa48("39442") ? !sql && typeof sql !== TYPEOF.STRING : stryMutAct_9fa48("39441") ? false : stryMutAct_9fa48("39440") ? true : (stryCov_9fa48("39440", "39441", "39442"), (stryMutAct_9fa48("39443") ? sql : (stryCov_9fa48("39443"), !sql)) || (stryMutAct_9fa48("39445") ? typeof sql === TYPEOF.STRING : stryMutAct_9fa48("39444") ? false : (stryCov_9fa48("39444", "39445"), typeof sql !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("39446")) {
          {}
        } else {
          stryCov_9fa48("39446");
          return Object.freeze(stryMutAct_9fa48("39447") ? {} : (stryCov_9fa48("39447"), {
            state: TABLE_NAME_EXTRACTION_STATE.INVALID_INPUT
          }));
        }
      }

      // INSERT INTO table_name or INSERT OR <modifier> INTO table_name
      let match = sql.match(stryMutAct_9fa48("39460") ? /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\W+)/i : stryMutAct_9fa48("39459") ? /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w)/i : stryMutAct_9fa48("39458") ? /INSERT\s+(?:OR\s+\w+\s+)?INTO\S+(\w+)/i : stryMutAct_9fa48("39457") ? /INSERT\s+(?:OR\s+\w+\s+)?INTO\s(\w+)/i : stryMutAct_9fa48("39456") ? /INSERT\s+(?:OR\s+\w+\S+)?INTO\s+(\w+)/i : stryMutAct_9fa48("39455") ? /INSERT\s+(?:OR\s+\w+\s)?INTO\s+(\w+)/i : stryMutAct_9fa48("39454") ? /INSERT\s+(?:OR\s+\W+\s+)?INTO\s+(\w+)/i : stryMutAct_9fa48("39453") ? /INSERT\s+(?:OR\s+\w\s+)?INTO\s+(\w+)/i : stryMutAct_9fa48("39452") ? /INSERT\s+(?:OR\S+\w+\s+)?INTO\s+(\w+)/i : stryMutAct_9fa48("39451") ? /INSERT\s+(?:OR\s\w+\s+)?INTO\s+(\w+)/i : stryMutAct_9fa48("39450") ? /INSERT\s+(?:OR\s+\w+\s+)INTO\s+(\w+)/i : stryMutAct_9fa48("39449") ? /INSERT\S+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i : stryMutAct_9fa48("39448") ? /INSERT\s(?:OR\s+\w+\s+)?INTO\s+(\w+)/i : (stryCov_9fa48("39448", "39449", "39450", "39451", "39452", "39453", "39454", "39455", "39456", "39457", "39458", "39459", "39460"), /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i));
      if (stryMutAct_9fa48("39462") ? false : stryMutAct_9fa48("39461") ? true : (stryCov_9fa48("39461", "39462"), match)) {
        if (stryMutAct_9fa48("39463")) {
          {}
        } else {
          stryCov_9fa48("39463");
          return Object.freeze(stryMutAct_9fa48("39464") ? {} : (stryCov_9fa48("39464"), {
            state: TABLE_NAME_EXTRACTION_STATE.FOUND,
            tableName: match[NUM.ONE]
          }));
        }
      }

      // UPDATE table_name SET
      match = sql.match(stryMutAct_9fa48("39470") ? /UPDATE\s+(\w+)\S+SET/i : stryMutAct_9fa48("39469") ? /UPDATE\s+(\w+)\sSET/i : stryMutAct_9fa48("39468") ? /UPDATE\s+(\W+)\s+SET/i : stryMutAct_9fa48("39467") ? /UPDATE\s+(\w)\s+SET/i : stryMutAct_9fa48("39466") ? /UPDATE\S+(\w+)\s+SET/i : stryMutAct_9fa48("39465") ? /UPDATE\s(\w+)\s+SET/i : (stryCov_9fa48("39465", "39466", "39467", "39468", "39469", "39470"), /UPDATE\s+(\w+)\s+SET/i));
      if (stryMutAct_9fa48("39472") ? false : stryMutAct_9fa48("39471") ? true : (stryCov_9fa48("39471", "39472"), match)) {
        if (stryMutAct_9fa48("39473")) {
          {}
        } else {
          stryCov_9fa48("39473");
          return Object.freeze(stryMutAct_9fa48("39474") ? {} : (stryCov_9fa48("39474"), {
            state: TABLE_NAME_EXTRACTION_STATE.FOUND,
            tableName: match[NUM.ONE]
          }));
        }
      }

      // DELETE FROM table_name
      match = sql.match(stryMutAct_9fa48("39480") ? /DELETE\s+FROM\s+(\W+)/i : stryMutAct_9fa48("39479") ? /DELETE\s+FROM\s+(\w)/i : stryMutAct_9fa48("39478") ? /DELETE\s+FROM\S+(\w+)/i : stryMutAct_9fa48("39477") ? /DELETE\s+FROM\s(\w+)/i : stryMutAct_9fa48("39476") ? /DELETE\S+FROM\s+(\w+)/i : stryMutAct_9fa48("39475") ? /DELETE\sFROM\s+(\w+)/i : (stryCov_9fa48("39475", "39476", "39477", "39478", "39479", "39480"), /DELETE\s+FROM\s+(\w+)/i));
      if (stryMutAct_9fa48("39482") ? false : stryMutAct_9fa48("39481") ? true : (stryCov_9fa48("39481", "39482"), match)) {
        if (stryMutAct_9fa48("39483")) {
          {}
        } else {
          stryCov_9fa48("39483");
          return Object.freeze(stryMutAct_9fa48("39484") ? {} : (stryCov_9fa48("39484"), {
            state: TABLE_NAME_EXTRACTION_STATE.FOUND,
            tableName: match[NUM.ONE]
          }));
        }
      }

      // SELECT FROM table_name (for completeness, though not used in bootstrap)
      match = sql.match(stryMutAct_9fa48("39488") ? /FROM\s+(\W+)/i : stryMutAct_9fa48("39487") ? /FROM\s+(\w)/i : stryMutAct_9fa48("39486") ? /FROM\S+(\w+)/i : stryMutAct_9fa48("39485") ? /FROM\s(\w+)/i : (stryCov_9fa48("39485", "39486", "39487", "39488"), /FROM\s+(\w+)/i));
      if (stryMutAct_9fa48("39490") ? false : stryMutAct_9fa48("39489") ? true : (stryCov_9fa48("39489", "39490"), match)) {
        if (stryMutAct_9fa48("39491")) {
          {}
        } else {
          stryCov_9fa48("39491");
          return Object.freeze(stryMutAct_9fa48("39492") ? {} : (stryCov_9fa48("39492"), {
            state: TABLE_NAME_EXTRACTION_STATE.FOUND,
            tableName: match[NUM.ONE]
          }));
        }
      }
      return Object.freeze(stryMutAct_9fa48("39493") ? {} : (stryCov_9fa48("39493"), {
        state: TABLE_NAME_EXTRACTION_STATE.NOT_FOUND
      }));
    }
  }
}

// Export singleton instance for convenience
const cdcSqlBuilder = new CDCSqlBuilder();
export { CDCSqlBuilder, cdcSqlBuilder };