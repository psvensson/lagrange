/**
 * ResultsPanel - Display panel for SQL query results
 *
 * Displays query results in tabular format with support for
 * scrolling, metadata display, and error handling.
 *
 * Requirements: 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12
 */
// @ts-nocheck


/**
 * Result types
 */function stryNS_9fa48() {
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
export const RESULT_TYPE = stryMutAct_9fa48("47190") ? {} : (stryCov_9fa48("47190"), {
  SELECT: stryMutAct_9fa48("47191") ? "" : (stryCov_9fa48("47191"), 'select'),
  INSERT: stryMutAct_9fa48("47192") ? "" : (stryCov_9fa48("47192"), 'insert'),
  UPDATE: stryMutAct_9fa48("47193") ? "" : (stryCov_9fa48("47193"), 'update'),
  DELETE: stryMutAct_9fa48("47194") ? "" : (stryCov_9fa48("47194"), 'delete'),
  ERROR: stryMutAct_9fa48("47195") ? "" : (stryCov_9fa48("47195"), 'error'),
  EMPTY: stryMutAct_9fa48("47196") ? "" : (stryCov_9fa48("47196"), 'empty')
});

/**
 * ResultsPanel class for displaying query results
 */
export class ResultsPanel {
  /**
   * Creates a new ResultsPanel
   * @param {Object} options - Panel options
   * @param {Object} [options.screen] - Blessed screen instance
   * @param {import('../core/event-bus.js').EventBus} [options.eventBus] - Event bus
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("47197")) {
      {}
    } else {
      stryCov_9fa48("47197");
      this.screen = stryMutAct_9fa48("47200") ? options.screen && null : stryMutAct_9fa48("47199") ? false : stryMutAct_9fa48("47198") ? true : (stryCov_9fa48("47198", "47199", "47200"), options.screen || null);
      this.eventBus = stryMutAct_9fa48("47203") ? options.eventBus && null : stryMutAct_9fa48("47202") ? false : stryMutAct_9fa48("47201") ? true : (stryCov_9fa48("47201", "47202", "47203"), options.eventBus || null);

      // Current result state
      this.currentResult = null;
      this.resultType = null;
      this.executionTime = null;
      this.rowCount = null;
      this.affectedRows = null;
      this.partitions = stryMutAct_9fa48("47204") ? ["Stryker was here"] : (stryCov_9fa48("47204"), []);
      this.error = null;

      // Scrolling state
      this.scrollPosition = 0;
      this.selectedRow = 0;

      // Widget reference
      this.widget = null;
    }
  }

  /**
   * Display a SELECT query result
   * Requirements: 7.6, 7.7, 7.8, 7.9, 7.12
   * @param {Object} result - Query result
   * @param {Array<Object>} result.rows - Result rows
   * @param {Array<string>} [result.columns] - Column names
   * @param {number} [result.count] - Row count
   * @param {Array<string>} [result.partitions] - Involved partitions
   * @param {string} [result.tableName] - Table name
   * @param {number} executionTime - Execution time in ms
   */
  displaySelectResult(result, executionTime) {
    if (stryMutAct_9fa48("47205")) {
      {}
    } else {
      stryCov_9fa48("47205");
      this.resultType = RESULT_TYPE.SELECT;
      this.executionTime = executionTime;
      this.error = null;
      this.scrollPosition = 0;
      this.selectedRow = 0;
      const rows = stryMutAct_9fa48("47208") ? (result.rows || result.results) && [] : stryMutAct_9fa48("47207") ? false : stryMutAct_9fa48("47206") ? true : (stryCov_9fa48("47206", "47207", "47208"), (stryMutAct_9fa48("47210") ? result.rows && result.results : stryMutAct_9fa48("47209") ? false : (stryCov_9fa48("47209", "47210"), result.rows || result.results)) || (stryMutAct_9fa48("47211") ? ["Stryker was here"] : (stryCov_9fa48("47211"), [])));
      this.rowCount = stryMutAct_9fa48("47212") ? result.count && rows.length : (stryCov_9fa48("47212"), result.count ?? rows.length);
      this.partitions = stryMutAct_9fa48("47215") ? result.partitions && [] : stryMutAct_9fa48("47214") ? false : stryMutAct_9fa48("47213") ? true : (stryCov_9fa48("47213", "47214", "47215"), result.partitions || (stryMutAct_9fa48("47216") ? ["Stryker was here"] : (stryCov_9fa48("47216"), [])));
      if (stryMutAct_9fa48("47219") ? rows.length !== 0 : stryMutAct_9fa48("47218") ? false : stryMutAct_9fa48("47217") ? true : (stryCov_9fa48("47217", "47218", "47219"), rows.length === 0)) {
        if (stryMutAct_9fa48("47220")) {
          {}
        } else {
          stryCov_9fa48("47220");
          this.resultType = RESULT_TYPE.EMPTY;
          this.currentResult = stryMutAct_9fa48("47221") ? {} : (stryCov_9fa48("47221"), {
            tableName: result.tableName,
            columns: stryMutAct_9fa48("47224") ? result.columns && [] : stryMutAct_9fa48("47223") ? false : stryMutAct_9fa48("47222") ? true : (stryCov_9fa48("47222", "47223", "47224"), result.columns || (stryMutAct_9fa48("47225") ? ["Stryker was here"] : (stryCov_9fa48("47225"), []))),
            rows: stryMutAct_9fa48("47226") ? ["Stryker was here"] : (stryCov_9fa48("47226"), [])
          });
        }
      } else {
        if (stryMutAct_9fa48("47227")) {
          {}
        } else {
          stryCov_9fa48("47227");
          // Extract columns from first row if not provided
          const columns = stryMutAct_9fa48("47230") ? result.columns && Object.keys(rows[0]) : stryMutAct_9fa48("47229") ? false : stryMutAct_9fa48("47228") ? true : (stryCov_9fa48("47228", "47229", "47230"), result.columns || Object.keys(rows[0]));
          this.currentResult = stryMutAct_9fa48("47231") ? {} : (stryCov_9fa48("47231"), {
            tableName: result.tableName,
            columns,
            rows
          });
        }
      }
      this.render();
      this.emitUpdate();
    }
  }

  /**
   * Display a write operation result (INSERT/UPDATE/DELETE)
   * Requirements: 7.10
   * @param {Object} result - Operation result
   * @param {string} result.operation - Operation type
   * @param {number} result.affectedRows - Affected row count
   * @param {Array<string>} [result.partitions] - Involved partitions
   * @param {number} executionTime - Execution time in ms
   */
  displayWriteResult(result, executionTime) {
    if (stryMutAct_9fa48("47232")) {
      {}
    } else {
      stryCov_9fa48("47232");
      const operation = stryMutAct_9fa48("47233") ? (result.operation || 'WRITE').toLowerCase() : (stryCov_9fa48("47233"), (stryMutAct_9fa48("47236") ? result.operation && 'WRITE' : stryMutAct_9fa48("47235") ? false : stryMutAct_9fa48("47234") ? true : (stryCov_9fa48("47234", "47235", "47236"), result.operation || (stryMutAct_9fa48("47237") ? "" : (stryCov_9fa48("47237"), 'WRITE')))).toUpperCase());
      switch (operation) {
        case stryMutAct_9fa48("47239") ? "" : (stryCov_9fa48("47239"), 'INSERT'):
          if (stryMutAct_9fa48("47238")) {} else {
            stryCov_9fa48("47238");
            this.resultType = RESULT_TYPE.INSERT;
            break;
          }
        case stryMutAct_9fa48("47241") ? "" : (stryCov_9fa48("47241"), 'UPDATE'):
          if (stryMutAct_9fa48("47240")) {} else {
            stryCov_9fa48("47240");
            this.resultType = RESULT_TYPE.UPDATE;
            break;
          }
        case stryMutAct_9fa48("47243") ? "" : (stryCov_9fa48("47243"), 'DELETE'):
          if (stryMutAct_9fa48("47242")) {} else {
            stryCov_9fa48("47242");
            this.resultType = RESULT_TYPE.DELETE;
            break;
          }
        default:
          if (stryMutAct_9fa48("47244")) {} else {
            stryCov_9fa48("47244");
            this.resultType = RESULT_TYPE.UPDATE;
          }
      }
      this.executionTime = executionTime;
      this.affectedRows = stryMutAct_9fa48("47245") ? result.affectedRows && 0 : (stryCov_9fa48("47245"), result.affectedRows ?? 0);
      this.partitions = stryMutAct_9fa48("47248") ? result.partitions && [] : stryMutAct_9fa48("47247") ? false : stryMutAct_9fa48("47246") ? true : (stryCov_9fa48("47246", "47247", "47248"), result.partitions || (stryMutAct_9fa48("47249") ? ["Stryker was here"] : (stryCov_9fa48("47249"), [])));
      this.error = null;
      this.currentResult = result;
      this.render();
      this.emitUpdate();
    }
  }

  /**
   * Display an error result
   * Requirements: 7.11
   * @param {Object} error - Error object
   * @param {string} error.message - Error message
   * @param {string} [error.code] - Error code
   * @param {string} [error.detail] - Error detail
   */
  displayError(error) {
    if (stryMutAct_9fa48("47250")) {
      {}
    } else {
      stryCov_9fa48("47250");
      this.resultType = RESULT_TYPE.ERROR;
      this.error = stryMutAct_9fa48("47251") ? {} : (stryCov_9fa48("47251"), {
        message: stryMutAct_9fa48("47254") ? error.message && 'Unknown error' : stryMutAct_9fa48("47253") ? false : stryMutAct_9fa48("47252") ? true : (stryCov_9fa48("47252", "47253", "47254"), error.message || (stryMutAct_9fa48("47255") ? "" : (stryCov_9fa48("47255"), 'Unknown error'))),
        code: error.code,
        detail: error.detail
      });
      this.currentResult = null;
      this.executionTime = null;
      this.rowCount = null;
      this.affectedRows = null;
      this.partitions = stryMutAct_9fa48("47256") ? ["Stryker was here"] : (stryCov_9fa48("47256"), []);
      this.render();
      this.emitUpdate();
    }
  }

  /**
   * Clear the results panel
   */
  clear() {
    if (stryMutAct_9fa48("47257")) {
      {}
    } else {
      stryCov_9fa48("47257");
      this.currentResult = null;
      this.resultType = null;
      this.executionTime = null;
      this.rowCount = null;
      this.affectedRows = null;
      this.partitions = stryMutAct_9fa48("47258") ? ["Stryker was here"] : (stryCov_9fa48("47258"), []);
      this.error = null;
      this.scrollPosition = 0;
      this.selectedRow = 0;
      this.render();
    }
  }

  /**
   * Get formatted table data for display
   * @return {Object} Table data with headers and rows
   */
  getTableData() {
    if (stryMutAct_9fa48("47259")) {
      {}
    } else {
      stryCov_9fa48("47259");
      if (stryMutAct_9fa48("47262") ? !this.currentResult && this.resultType === RESULT_TYPE.ERROR : stryMutAct_9fa48("47261") ? false : stryMutAct_9fa48("47260") ? true : (stryCov_9fa48("47260", "47261", "47262"), (stryMutAct_9fa48("47263") ? this.currentResult : (stryCov_9fa48("47263"), !this.currentResult)) || (stryMutAct_9fa48("47265") ? this.resultType !== RESULT_TYPE.ERROR : stryMutAct_9fa48("47264") ? false : (stryCov_9fa48("47264", "47265"), this.resultType === RESULT_TYPE.ERROR)))) {
        if (stryMutAct_9fa48("47266")) {
          {}
        } else {
          stryCov_9fa48("47266");
          return stryMutAct_9fa48("47267") ? {} : (stryCov_9fa48("47267"), {
            headers: stryMutAct_9fa48("47268") ? ["Stryker was here"] : (stryCov_9fa48("47268"), []),
            rows: stryMutAct_9fa48("47269") ? ["Stryker was here"] : (stryCov_9fa48("47269"), [])
          });
        }
      }
      const {
        columns,
        rows
      } = this.currentResult;
      const formattedRows = rows.map(stryMutAct_9fa48("47270") ? () => undefined : (stryCov_9fa48("47270"), row => columns.map(stryMutAct_9fa48("47271") ? () => undefined : (stryCov_9fa48("47271"), col => this.formatCell(row[col])))));
      return stryMutAct_9fa48("47272") ? {} : (stryCov_9fa48("47272"), {
        headers: columns,
        rows: formattedRows
      });
    }
  }

  /**
   * Format a cell value for display
   * @param {*} value - Cell value
   * @return {string} Formatted value
   */
  formatCell(value) {
    if (stryMutAct_9fa48("47273")) {
      {}
    } else {
      stryCov_9fa48("47273");
      if (stryMutAct_9fa48("47276") ? value !== null : stryMutAct_9fa48("47275") ? false : stryMutAct_9fa48("47274") ? true : (stryCov_9fa48("47274", "47275", "47276"), value === null)) {
        if (stryMutAct_9fa48("47277")) {
          {}
        } else {
          stryCov_9fa48("47277");
          return stryMutAct_9fa48("47278") ? "" : (stryCov_9fa48("47278"), '{gray-fg}NULL{/}');
        }
      }
      if (stryMutAct_9fa48("47281") ? value !== undefined : stryMutAct_9fa48("47280") ? false : stryMutAct_9fa48("47279") ? true : (stryCov_9fa48("47279", "47280", "47281"), value === undefined)) {
        if (stryMutAct_9fa48("47282")) {
          {}
        } else {
          stryCov_9fa48("47282");
          return stryMutAct_9fa48("47283") ? "Stryker was here!" : (stryCov_9fa48("47283"), '');
        }
      }
      if (stryMutAct_9fa48("47286") ? typeof value !== 'object' : stryMutAct_9fa48("47285") ? false : stryMutAct_9fa48("47284") ? true : (stryCov_9fa48("47284", "47285", "47286"), typeof value === (stryMutAct_9fa48("47287") ? "" : (stryCov_9fa48("47287"), 'object')))) {
        if (stryMutAct_9fa48("47288")) {
          {}
        } else {
          stryCov_9fa48("47288");
          try {
            if (stryMutAct_9fa48("47289")) {
              {}
            } else {
              stryCov_9fa48("47289");
              const json = JSON.stringify(value);
              return (stryMutAct_9fa48("47293") ? json.length <= 50 : stryMutAct_9fa48("47292") ? json.length >= 50 : stryMutAct_9fa48("47291") ? false : stryMutAct_9fa48("47290") ? true : (stryCov_9fa48("47290", "47291", "47292", "47293"), json.length > 50)) ? (stryMutAct_9fa48("47294") ? json : (stryCov_9fa48("47294"), json.slice(0, 47))) + (stryMutAct_9fa48("47295") ? "" : (stryCov_9fa48("47295"), '...')) : json;
            }
          } catch (_e) {
            if (stryMutAct_9fa48("47296")) {
              {}
            } else {
              stryCov_9fa48("47296");
              return stryMutAct_9fa48("47297") ? "" : (stryCov_9fa48("47297"), '[Object]');
            }
          }
        }
      }
      if (stryMutAct_9fa48("47300") ? typeof value !== 'boolean' : stryMutAct_9fa48("47299") ? false : stryMutAct_9fa48("47298") ? true : (stryCov_9fa48("47298", "47299", "47300"), typeof value === (stryMutAct_9fa48("47301") ? "" : (stryCov_9fa48("47301"), 'boolean')))) {
        if (stryMutAct_9fa48("47302")) {
          {}
        } else {
          stryCov_9fa48("47302");
          return value ? stryMutAct_9fa48("47303") ? "" : (stryCov_9fa48("47303"), 'true') : stryMutAct_9fa48("47304") ? "" : (stryCov_9fa48("47304"), 'false');
        }
      }
      return String(value);
    }
  }

  /**
   * Get the status line content
   * Requirements: 7.9, 7.10, 7.12
   * @return {string} Status line text
   */
  getStatusLine() {
    if (stryMutAct_9fa48("47305")) {
      {}
    } else {
      stryCov_9fa48("47305");
      const parts = stryMutAct_9fa48("47306") ? ["Stryker was here"] : (stryCov_9fa48("47306"), []);
      switch (this.resultType) {
        case RESULT_TYPE.SELECT:
          if (stryMutAct_9fa48("47307")) {} else {
            stryCov_9fa48("47307");
            parts.push(stryMutAct_9fa48("47308") ? `` : (stryCov_9fa48("47308"), `${this.rowCount} row${(stryMutAct_9fa48("47311") ? this.rowCount === 1 : stryMutAct_9fa48("47310") ? false : stryMutAct_9fa48("47309") ? true : (stryCov_9fa48("47309", "47310", "47311"), this.rowCount !== 1)) ? stryMutAct_9fa48("47312") ? "" : (stryCov_9fa48("47312"), 's') : stryMutAct_9fa48("47313") ? "Stryker was here!" : (stryCov_9fa48("47313"), '')}`));
            break;
          }
        case RESULT_TYPE.INSERT:
          if (stryMutAct_9fa48("47314")) {} else {
            stryCov_9fa48("47314");
            parts.push(stryMutAct_9fa48("47315") ? `` : (stryCov_9fa48("47315"), `INSERT: ${this.affectedRows} row${(stryMutAct_9fa48("47318") ? this.affectedRows === 1 : stryMutAct_9fa48("47317") ? false : stryMutAct_9fa48("47316") ? true : (stryCov_9fa48("47316", "47317", "47318"), this.affectedRows !== 1)) ? stryMutAct_9fa48("47319") ? "" : (stryCov_9fa48("47319"), 's') : stryMutAct_9fa48("47320") ? "Stryker was here!" : (stryCov_9fa48("47320"), '')} affected`));
            break;
          }
        case RESULT_TYPE.UPDATE:
          if (stryMutAct_9fa48("47321")) {} else {
            stryCov_9fa48("47321");
            parts.push(stryMutAct_9fa48("47322") ? `` : (stryCov_9fa48("47322"), `UPDATE: ${this.affectedRows} row${(stryMutAct_9fa48("47325") ? this.affectedRows === 1 : stryMutAct_9fa48("47324") ? false : stryMutAct_9fa48("47323") ? true : (stryCov_9fa48("47323", "47324", "47325"), this.affectedRows !== 1)) ? stryMutAct_9fa48("47326") ? "" : (stryCov_9fa48("47326"), 's') : stryMutAct_9fa48("47327") ? "Stryker was here!" : (stryCov_9fa48("47327"), '')} affected`));
            break;
          }
        case RESULT_TYPE.DELETE:
          if (stryMutAct_9fa48("47328")) {} else {
            stryCov_9fa48("47328");
            parts.push(stryMutAct_9fa48("47329") ? `` : (stryCov_9fa48("47329"), `DELETE: ${this.affectedRows} row${(stryMutAct_9fa48("47332") ? this.affectedRows === 1 : stryMutAct_9fa48("47331") ? false : stryMutAct_9fa48("47330") ? true : (stryCov_9fa48("47330", "47331", "47332"), this.affectedRows !== 1)) ? stryMutAct_9fa48("47333") ? "" : (stryCov_9fa48("47333"), 's') : stryMutAct_9fa48("47334") ? "Stryker was here!" : (stryCov_9fa48("47334"), '')} affected`));
            break;
          }
        case RESULT_TYPE.EMPTY:
          if (stryMutAct_9fa48("47335")) {} else {
            stryCov_9fa48("47335");
            // For empty SELECT results, still show row count (0 rows)
            parts.push(stryMutAct_9fa48("47336") ? `` : (stryCov_9fa48("47336"), `${stryMutAct_9fa48("47337") ? this.rowCount && 0 : (stryCov_9fa48("47337"), this.rowCount ?? 0)} row${(stryMutAct_9fa48("47340") ? this.rowCount === 1 : stryMutAct_9fa48("47339") ? false : stryMutAct_9fa48("47338") ? true : (stryCov_9fa48("47338", "47339", "47340"), this.rowCount !== 1)) ? stryMutAct_9fa48("47341") ? "" : (stryCov_9fa48("47341"), 's') : stryMutAct_9fa48("47342") ? "Stryker was here!" : (stryCov_9fa48("47342"), '')}`));
            break;
          }
        case RESULT_TYPE.ERROR:
          if (stryMutAct_9fa48("47343")) {} else {
            stryCov_9fa48("47343");
            return stryMutAct_9fa48("47344") ? `` : (stryCov_9fa48("47344"), `{red-fg}Error: ${stryMutAct_9fa48("47347") ? this.error?.message && 'Unknown error' : stryMutAct_9fa48("47346") ? false : stryMutAct_9fa48("47345") ? true : (stryCov_9fa48("47345", "47346", "47347"), (stryMutAct_9fa48("47348") ? this.error.message : (stryCov_9fa48("47348"), this.error?.message)) || (stryMutAct_9fa48("47349") ? "" : (stryCov_9fa48("47349"), 'Unknown error')))}{/}`);
          }
        default:
          if (stryMutAct_9fa48("47350")) {} else {
            stryCov_9fa48("47350");
            return stryMutAct_9fa48("47351") ? "Stryker was here!" : (stryCov_9fa48("47351"), '');
          }
      }
      if (stryMutAct_9fa48("47354") ? this.executionTime === null : stryMutAct_9fa48("47353") ? false : stryMutAct_9fa48("47352") ? true : (stryCov_9fa48("47352", "47353", "47354"), this.executionTime !== null)) {
        if (stryMutAct_9fa48("47355")) {
          {}
        } else {
          stryCov_9fa48("47355");
          parts.push(stryMutAct_9fa48("47356") ? `` : (stryCov_9fa48("47356"), `${this.executionTime}ms`));
        }
      }
      if (stryMutAct_9fa48("47360") ? this.partitions.length <= 0 : stryMutAct_9fa48("47359") ? this.partitions.length >= 0 : stryMutAct_9fa48("47358") ? false : stryMutAct_9fa48("47357") ? true : (stryCov_9fa48("47357", "47358", "47359", "47360"), this.partitions.length > 0)) {
        if (stryMutAct_9fa48("47361")) {
          {}
        } else {
          stryCov_9fa48("47361");
          const partitionStr = (stryMutAct_9fa48("47365") ? this.partitions.length > 3 : stryMutAct_9fa48("47364") ? this.partitions.length < 3 : stryMutAct_9fa48("47363") ? false : stryMutAct_9fa48("47362") ? true : (stryCov_9fa48("47362", "47363", "47364", "47365"), this.partitions.length <= 3)) ? this.partitions.join(stryMutAct_9fa48("47366") ? "" : (stryCov_9fa48("47366"), ', ')) : stryMutAct_9fa48("47367") ? `` : (stryCov_9fa48("47367"), `${stryMutAct_9fa48("47368") ? this.partitions.join(', ') : (stryCov_9fa48("47368"), this.partitions.slice(0, 3).join(stryMutAct_9fa48("47369") ? "" : (stryCov_9fa48("47369"), ', ')))}... (${this.partitions.length} total)`);
          parts.push(stryMutAct_9fa48("47370") ? `` : (stryCov_9fa48("47370"), `Partitions: ${partitionStr}`));
        }
      }
      return parts.join(stryMutAct_9fa48("47371") ? "" : (stryCov_9fa48("47371"), ' | '));
    }
  }

  /**
   * Get the message content for non-table results
   * @return {string} Message content
   */
  getMessageContent() {
    if (stryMutAct_9fa48("47372")) {
      {}
    } else {
      stryCov_9fa48("47372");
      switch (this.resultType) {
        case RESULT_TYPE.INSERT:
        case RESULT_TYPE.UPDATE:
        case RESULT_TYPE.DELETE:
          if (stryMutAct_9fa48("47373")) {} else {
            stryCov_9fa48("47373");
            return this.getWriteResultMessage();
          }
        case RESULT_TYPE.EMPTY:
          if (stryMutAct_9fa48("47374")) {} else {
            stryCov_9fa48("47374");
            return this.getEmptyResultMessage();
          }
        case RESULT_TYPE.ERROR:
          if (stryMutAct_9fa48("47375")) {} else {
            stryCov_9fa48("47375");
            return this.getErrorMessage();
          }
        default:
          if (stryMutAct_9fa48("47376")) {} else {
            stryCov_9fa48("47376");
            return stryMutAct_9fa48("47377") ? "Stryker was here!" : (stryCov_9fa48("47377"), '');
          }
      }
    }
  }

  /**
   * Get write result message
   * @return {string} Message
   */
  getWriteResultMessage() {
    if (stryMutAct_9fa48("47378")) {
      {}
    } else {
      stryCov_9fa48("47378");
      const operation = stryMutAct_9fa48("47379") ? this.resultType.toLowerCase() : (stryCov_9fa48("47379"), this.resultType.toUpperCase());
      const rows = stryMutAct_9fa48("47380") ? this.affectedRows && 0 : (stryCov_9fa48("47380"), this.affectedRows ?? 0);
      const time = stryMutAct_9fa48("47381") ? this.executionTime && 0 : (stryCov_9fa48("47381"), this.executionTime ?? 0);
      const partitions = (stryMutAct_9fa48("47385") ? this.partitions.length <= 0 : stryMutAct_9fa48("47384") ? this.partitions.length >= 0 : stryMutAct_9fa48("47383") ? false : stryMutAct_9fa48("47382") ? true : (stryCov_9fa48("47382", "47383", "47384", "47385"), this.partitions.length > 0)) ? this.partitions.join(stryMutAct_9fa48("47386") ? "" : (stryCov_9fa48("47386"), ', ')) : stryMutAct_9fa48("47387") ? "" : (stryCov_9fa48("47387"), 'N/A');
      return (stryMutAct_9fa48("47388") ? `` : (stryCov_9fa48("47388"), `{green-fg}✓{/} ${operation} completed\n\n`)) + (stryMutAct_9fa48("47389") ? `` : (stryCov_9fa48("47389"), `Affected rows: ${rows}\n`)) + (stryMutAct_9fa48("47390") ? `` : (stryCov_9fa48("47390"), `Execution time: ${time}ms\n`)) + (stryMutAct_9fa48("47391") ? `` : (stryCov_9fa48("47391"), `Partitions: ${partitions}`));
    }
  }

  /**
   * Get empty result message
   * @return {string} Message
   */
  getEmptyResultMessage() {
    if (stryMutAct_9fa48("47392")) {
      {}
    } else {
      stryCov_9fa48("47392");
      const tableName = stryMutAct_9fa48("47395") ? this.currentResult?.tableName && 'query' : stryMutAct_9fa48("47394") ? false : stryMutAct_9fa48("47393") ? true : (stryCov_9fa48("47393", "47394", "47395"), (stryMutAct_9fa48("47396") ? this.currentResult.tableName : (stryCov_9fa48("47396"), this.currentResult?.tableName)) || (stryMutAct_9fa48("47397") ? "" : (stryCov_9fa48("47397"), 'query')));
      const time = stryMutAct_9fa48("47398") ? this.executionTime && 0 : (stryCov_9fa48("47398"), this.executionTime ?? 0);
      return (stryMutAct_9fa48("47399") ? "" : (stryCov_9fa48("47399"), '{yellow-fg}No results{/}\n\n')) + (stryMutAct_9fa48("47400") ? `` : (stryCov_9fa48("47400"), `Table: ${tableName}\n`)) + (stryMutAct_9fa48("47401") ? `` : (stryCov_9fa48("47401"), `Execution time: ${time}ms`));
    }
  }

  /**
   * Get error message
   * Requirements: 7.11
   * @return {string} Message
   */
  getErrorMessage() {
    if (stryMutAct_9fa48("47402")) {
      {}
    } else {
      stryCov_9fa48("47402");
      if (stryMutAct_9fa48("47405") ? false : stryMutAct_9fa48("47404") ? true : stryMutAct_9fa48("47403") ? this.error : (stryCov_9fa48("47403", "47404", "47405"), !this.error)) {
        if (stryMutAct_9fa48("47406")) {
          {}
        } else {
          stryCov_9fa48("47406");
          return stryMutAct_9fa48("47407") ? "" : (stryCov_9fa48("47407"), '{red-fg}✗ Query failed{/}\n\nUnknown error');
        }
      }
      let message = stryMutAct_9fa48("47408") ? "" : (stryCov_9fa48("47408"), '{red-fg}✗ Query failed{/}\n\n');
      message += stryMutAct_9fa48("47409") ? `` : (stryCov_9fa48("47409"), `Error: ${this.error.message}`);
      if (stryMutAct_9fa48("47411") ? false : stryMutAct_9fa48("47410") ? true : (stryCov_9fa48("47410", "47411"), this.error.code)) {
        if (stryMutAct_9fa48("47412")) {
          {}
        } else {
          stryCov_9fa48("47412");
          message += stryMutAct_9fa48("47413") ? `` : (stryCov_9fa48("47413"), `\nCode: ${this.error.code}`);
        }
      }
      if (stryMutAct_9fa48("47415") ? false : stryMutAct_9fa48("47414") ? true : (stryCov_9fa48("47414", "47415"), this.error.detail)) {
        if (stryMutAct_9fa48("47416")) {
          {}
        } else {
          stryCov_9fa48("47416");
          message += stryMutAct_9fa48("47417") ? `` : (stryCov_9fa48("47417"), `\nDetail: ${this.error.detail}`);
        }
      }
      return message;
    }
  }

  /**
   * Scroll up
   * Requirements: 7.8
   * @param {number} [lines=1] - Lines to scroll
   */
  scrollUp(lines = 1) {
    if (stryMutAct_9fa48("47418")) {
      {}
    } else {
      stryCov_9fa48("47418");
      this.scrollPosition = stryMutAct_9fa48("47419") ? Math.min(0, this.scrollPosition - lines) : (stryCov_9fa48("47419"), Math.max(0, stryMutAct_9fa48("47420") ? this.scrollPosition + lines : (stryCov_9fa48("47420"), this.scrollPosition - lines)));
      this.render();
    }
  }

  /**
   * Scroll down
   * Requirements: 7.8
   * @param {number} [lines=1] - Lines to scroll
   */
  scrollDown(lines = 1) {
    if (stryMutAct_9fa48("47421")) {
      {}
    } else {
      stryCov_9fa48("47421");
      const maxScroll = this.getMaxScroll();
      this.scrollPosition = stryMutAct_9fa48("47422") ? Math.max(maxScroll, this.scrollPosition + lines) : (stryCov_9fa48("47422"), Math.min(maxScroll, stryMutAct_9fa48("47423") ? this.scrollPosition - lines : (stryCov_9fa48("47423"), this.scrollPosition + lines)));
      this.render();
    }
  }

  /**
   * Get maximum scroll position
   * @return {number} Max scroll
   */
  getMaxScroll() {
    if (stryMutAct_9fa48("47424")) {
      {}
    } else {
      stryCov_9fa48("47424");
      if (stryMutAct_9fa48("47427") ? !this.currentResult && !this.currentResult.rows : stryMutAct_9fa48("47426") ? false : stryMutAct_9fa48("47425") ? true : (stryCov_9fa48("47425", "47426", "47427"), (stryMutAct_9fa48("47428") ? this.currentResult : (stryCov_9fa48("47428"), !this.currentResult)) || (stryMutAct_9fa48("47429") ? this.currentResult.rows : (stryCov_9fa48("47429"), !this.currentResult.rows)))) {
        if (stryMutAct_9fa48("47430")) {
          {}
        } else {
          stryCov_9fa48("47430");
          return 0;
        }
      }
      return stryMutAct_9fa48("47431") ? Math.min(0, this.currentResult.rows.length - 1) : (stryCov_9fa48("47431"), Math.max(0, stryMutAct_9fa48("47432") ? this.currentResult.rows.length + 1 : (stryCov_9fa48("47432"), this.currentResult.rows.length - 1)));
    }
  }

  /**
   * Select previous row
   */
  selectPrevious() {
    if (stryMutAct_9fa48("47433")) {
      {}
    } else {
      stryCov_9fa48("47433");
      if (stryMutAct_9fa48("47437") ? this.selectedRow <= 0 : stryMutAct_9fa48("47436") ? this.selectedRow >= 0 : stryMutAct_9fa48("47435") ? false : stryMutAct_9fa48("47434") ? true : (stryCov_9fa48("47434", "47435", "47436", "47437"), this.selectedRow > 0)) {
        if (stryMutAct_9fa48("47438")) {
          {}
        } else {
          stryCov_9fa48("47438");
          stryMutAct_9fa48("47439") ? this.selectedRow++ : (stryCov_9fa48("47439"), this.selectedRow--);
          // Adjust scroll if needed
          if (stryMutAct_9fa48("47443") ? this.selectedRow >= this.scrollPosition : stryMutAct_9fa48("47442") ? this.selectedRow <= this.scrollPosition : stryMutAct_9fa48("47441") ? false : stryMutAct_9fa48("47440") ? true : (stryCov_9fa48("47440", "47441", "47442", "47443"), this.selectedRow < this.scrollPosition)) {
            if (stryMutAct_9fa48("47444")) {
              {}
            } else {
              stryCov_9fa48("47444");
              this.scrollPosition = this.selectedRow;
            }
          }
          this.render();
        }
      }
    }
  }

  /**
   * Select next row
   */
  selectNext() {
    if (stryMutAct_9fa48("47445")) {
      {}
    } else {
      stryCov_9fa48("47445");
      const maxRow = stryMutAct_9fa48("47448") ? this.currentResult?.rows?.length - 1 && 0 : stryMutAct_9fa48("47447") ? false : stryMutAct_9fa48("47446") ? true : (stryCov_9fa48("47446", "47447", "47448"), (stryMutAct_9fa48("47449") ? this.currentResult?.rows?.length + 1 : (stryCov_9fa48("47449"), (stryMutAct_9fa48("47451") ? this.currentResult.rows?.length : stryMutAct_9fa48("47450") ? this.currentResult?.rows.length : (stryCov_9fa48("47450", "47451"), this.currentResult?.rows?.length)) - 1)) || 0);
      if (stryMutAct_9fa48("47455") ? this.selectedRow >= maxRow : stryMutAct_9fa48("47454") ? this.selectedRow <= maxRow : stryMutAct_9fa48("47453") ? false : stryMutAct_9fa48("47452") ? true : (stryCov_9fa48("47452", "47453", "47454", "47455"), this.selectedRow < maxRow)) {
        if (stryMutAct_9fa48("47456")) {
          {}
        } else {
          stryCov_9fa48("47456");
          stryMutAct_9fa48("47457") ? this.selectedRow-- : (stryCov_9fa48("47457"), this.selectedRow++);
          this.render();
        }
      }
    }
  }

  /**
   * Get the currently selected row data
   * @return {Object|null} Selected row or null
   */
  getSelectedRow() {
    if (stryMutAct_9fa48("47458")) {
      {}
    } else {
      stryCov_9fa48("47458");
      if (stryMutAct_9fa48("47461") ? !this.currentResult && !this.currentResult.rows : stryMutAct_9fa48("47460") ? false : stryMutAct_9fa48("47459") ? true : (stryCov_9fa48("47459", "47460", "47461"), (stryMutAct_9fa48("47462") ? this.currentResult : (stryCov_9fa48("47462"), !this.currentResult)) || (stryMutAct_9fa48("47463") ? this.currentResult.rows : (stryCov_9fa48("47463"), !this.currentResult.rows)))) {
        if (stryMutAct_9fa48("47464")) {
          {}
        } else {
          stryCov_9fa48("47464");
          return null;
        }
      }
      return stryMutAct_9fa48("47467") ? this.currentResult.rows[this.selectedRow] && null : stryMutAct_9fa48("47466") ? false : stryMutAct_9fa48("47465") ? true : (stryCov_9fa48("47465", "47466", "47467"), this.currentResult.rows[this.selectedRow] || null);
    }
  }

  /**
   * Check if there are results to display
   * @return {boolean} True if has results
   */
  hasResults() {
    if (stryMutAct_9fa48("47468")) {
      {}
    } else {
      stryCov_9fa48("47468");
      return stryMutAct_9fa48("47471") ? this.resultType !== null || this.resultType !== RESULT_TYPE.ERROR : stryMutAct_9fa48("47470") ? false : stryMutAct_9fa48("47469") ? true : (stryCov_9fa48("47469", "47470", "47471"), (stryMutAct_9fa48("47473") ? this.resultType === null : stryMutAct_9fa48("47472") ? true : (stryCov_9fa48("47472", "47473"), this.resultType !== null)) && (stryMutAct_9fa48("47475") ? this.resultType === RESULT_TYPE.ERROR : stryMutAct_9fa48("47474") ? true : (stryCov_9fa48("47474", "47475"), this.resultType !== RESULT_TYPE.ERROR)));
    }
  }

  /**
   * Check if there was an error
   * @return {boolean} True if error
   */
  hasError() {
    if (stryMutAct_9fa48("47476")) {
      {}
    } else {
      stryCov_9fa48("47476");
      return stryMutAct_9fa48("47479") ? this.resultType !== RESULT_TYPE.ERROR : stryMutAct_9fa48("47478") ? false : stryMutAct_9fa48("47477") ? true : (stryCov_9fa48("47477", "47478", "47479"), this.resultType === RESULT_TYPE.ERROR);
    }
  }

  /**
   * Render the panel
   */
  render() {
    if (stryMutAct_9fa48("47480")) {
      {}
    } else {
      stryCov_9fa48("47480");
      if (stryMutAct_9fa48("47482") ? false : stryMutAct_9fa48("47481") ? true : (stryCov_9fa48("47481", "47482"), this.widget)) {
        if (stryMutAct_9fa48("47483")) {
          {}
        } else {
          stryCov_9fa48("47483");
          if (stryMutAct_9fa48("47486") ? this.resultType === RESULT_TYPE.SELECT || this.currentResult?.rows?.length > 0 : stryMutAct_9fa48("47485") ? false : stryMutAct_9fa48("47484") ? true : (stryCov_9fa48("47484", "47485", "47486"), (stryMutAct_9fa48("47488") ? this.resultType !== RESULT_TYPE.SELECT : stryMutAct_9fa48("47487") ? true : (stryCov_9fa48("47487", "47488"), this.resultType === RESULT_TYPE.SELECT)) && (stryMutAct_9fa48("47491") ? this.currentResult?.rows?.length <= 0 : stryMutAct_9fa48("47490") ? this.currentResult?.rows?.length >= 0 : stryMutAct_9fa48("47489") ? true : (stryCov_9fa48("47489", "47490", "47491"), (stryMutAct_9fa48("47493") ? this.currentResult.rows?.length : stryMutAct_9fa48("47492") ? this.currentResult?.rows.length : (stryCov_9fa48("47492", "47493"), this.currentResult?.rows?.length)) > 0)))) {
            if (stryMutAct_9fa48("47494")) {
              {}
            } else {
              stryCov_9fa48("47494");
              // Render table
              const tableData = this.getTableData();
              this.widget.setData(stryMutAct_9fa48("47495") ? {} : (stryCov_9fa48("47495"), {
                headers: tableData.headers,
                data: tableData.rows
              }));
            }
          } else {
            if (stryMutAct_9fa48("47496")) {
              {}
            } else {
              stryCov_9fa48("47496");
              // Render message
              this.widget.setContent(this.getMessageContent());
            }
          }
          if (stryMutAct_9fa48("47498") ? false : stryMutAct_9fa48("47497") ? true : (stryCov_9fa48("47497", "47498"), this.screen)) {
            if (stryMutAct_9fa48("47499")) {
              {}
            } else {
              stryCov_9fa48("47499");
              this.screen.render();
            }
          }
        }
      }
      if (stryMutAct_9fa48("47501") ? false : stryMutAct_9fa48("47500") ? true : (stryCov_9fa48("47500", "47501"), this.eventBus)) {
        if (stryMutAct_9fa48("47502")) {
          {}
        } else {
          stryCov_9fa48("47502");
          this.eventBus.emit(stryMutAct_9fa48("47503") ? "" : (stryCov_9fa48("47503"), 'resultspanel:render'), stryMutAct_9fa48("47504") ? {} : (stryCov_9fa48("47504"), {
            resultType: this.resultType,
            rowCount: this.rowCount,
            executionTime: this.executionTime
          }));
        }
      }
    }
  }

  /**
   * Emit update event
   */
  emitUpdate() {
    if (stryMutAct_9fa48("47505")) {
      {}
    } else {
      stryCov_9fa48("47505");
      if (stryMutAct_9fa48("47507") ? false : stryMutAct_9fa48("47506") ? true : (stryCov_9fa48("47506", "47507"), this.eventBus)) {
        if (stryMutAct_9fa48("47508")) {
          {}
        } else {
          stryCov_9fa48("47508");
          this.eventBus.emit(stryMutAct_9fa48("47509") ? "" : (stryCov_9fa48("47509"), 'resultspanel:update'), stryMutAct_9fa48("47510") ? {} : (stryCov_9fa48("47510"), {
            resultType: this.resultType,
            rowCount: this.rowCount,
            affectedRows: this.affectedRows,
            executionTime: this.executionTime,
            partitions: this.partitions,
            error: this.error
          }));
        }
      }
    }
  }

  /**
   * Set the widget reference
   * @param {Object} widget - Blessed widget
   */
  setWidget(widget) {
    if (stryMutAct_9fa48("47511")) {
      {}
    } else {
      stryCov_9fa48("47511");
      this.widget = widget;
    }
  }
}