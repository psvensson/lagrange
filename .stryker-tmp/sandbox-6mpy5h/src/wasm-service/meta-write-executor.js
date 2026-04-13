/**
 * Write executor for sys-wasm-meta commands.
 * Ensures all writes flow through SQL/CDC paths.
 * No direct partition writes or fallback paths.
 *
 * Requirements: 12.1, 12.2
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
const META_WRITE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("161512") ? {} : (stryCov_9fa48("161512"), {
  ENGINE_REQUIRED: stryMutAct_9fa48("161513") ? "" : (stryCov_9fa48("161513"), 'SQL query engine is required'),
  COMMAND_FAILED: stryMutAct_9fa48("161514") ? "" : (stryCov_9fa48("161514"), 'Command validation failed'),
  EXECUTION_FAILED: stryMutAct_9fa48("161515") ? "" : (stryCov_9fa48("161515"), 'SQL execution failed')
}));

/**
 * Execute a write command through the SQL query engine.
 * @param {Object} sqlQueryEngine - SQL query engine instance.
 * @param {Object} commandResult - Result from a command handler.
 * @return {Promise<Object>} Execution result.
 */
async function executeMetaWrite(sqlQueryEngine, commandResult) {
  if (stryMutAct_9fa48("161516")) {
    {}
  } else {
    stryCov_9fa48("161516");
    if (stryMutAct_9fa48("161519") ? false : stryMutAct_9fa48("161518") ? true : stryMutAct_9fa48("161517") ? sqlQueryEngine : (stryCov_9fa48("161517", "161518", "161519"), !sqlQueryEngine)) {
      if (stryMutAct_9fa48("161520")) {
        {}
      } else {
        stryCov_9fa48("161520");
        throw new Error(META_WRITE_ERROR_MSG.ENGINE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("161523") ? false : stryMutAct_9fa48("161522") ? true : stryMutAct_9fa48("161521") ? commandResult.success : (stryCov_9fa48("161521", "161522", "161523"), !commandResult.success)) {
      if (stryMutAct_9fa48("161524")) {
        {}
      } else {
        stryCov_9fa48("161524");
        return stryMutAct_9fa48("161525") ? {} : (stryCov_9fa48("161525"), {
          success: stryMutAct_9fa48("161526") ? true : (stryCov_9fa48("161526"), false),
          errors: commandResult.errors
        });
      }
    }
    try {
      if (stryMutAct_9fa48("161527")) {
        {}
      } else {
        stryCov_9fa48("161527");
        const result = await sqlQueryEngine.executeQuery(commandResult.sql, commandResult.params);
        const {
          sql: _sql,
          params: _params,
          ...rest
        } = commandResult;
        return stryMutAct_9fa48("161528") ? {} : (stryCov_9fa48("161528"), {
          success: stryMutAct_9fa48("161529") ? false : (stryCov_9fa48("161529"), true),
          result,
          ...rest
        });
      }
    } catch (err) {
      if (stryMutAct_9fa48("161530")) {
        {}
      } else {
        stryCov_9fa48("161530");
        return stryMutAct_9fa48("161531") ? {} : (stryCov_9fa48("161531"), {
          success: stryMutAct_9fa48("161532") ? true : (stryCov_9fa48("161532"), false),
          error: stryMutAct_9fa48("161533") ? `` : (stryCov_9fa48("161533"), `${META_WRITE_ERROR_MSG.EXECUTION_FAILED}: ${err.message}`)
        });
      }
    }
  }
}

/**
 * Execute a read command through the SQL query engine.
 * @param {Object} sqlQueryEngine - SQL query engine instance.
 * @param {Object} commandResult - Result from a command handler.
 * @return {Promise<Object>} Execution result with rows.
 */
async function executeMetaRead(sqlQueryEngine, commandResult) {
  if (stryMutAct_9fa48("161534")) {
    {}
  } else {
    stryCov_9fa48("161534");
    if (stryMutAct_9fa48("161537") ? false : stryMutAct_9fa48("161536") ? true : stryMutAct_9fa48("161535") ? sqlQueryEngine : (stryCov_9fa48("161535", "161536", "161537"), !sqlQueryEngine)) {
      if (stryMutAct_9fa48("161538")) {
        {}
      } else {
        stryCov_9fa48("161538");
        throw new Error(META_WRITE_ERROR_MSG.ENGINE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("161541") ? false : stryMutAct_9fa48("161540") ? true : stryMutAct_9fa48("161539") ? commandResult.success : (stryCov_9fa48("161539", "161540", "161541"), !commandResult.success)) {
      if (stryMutAct_9fa48("161542")) {
        {}
      } else {
        stryCov_9fa48("161542");
        return stryMutAct_9fa48("161543") ? {} : (stryCov_9fa48("161543"), {
          success: stryMutAct_9fa48("161544") ? true : (stryCov_9fa48("161544"), false),
          errors: commandResult.errors
        });
      }
    }
    try {
      if (stryMutAct_9fa48("161545")) {
        {}
      } else {
        stryCov_9fa48("161545");
        const result = await sqlQueryEngine.executeQuery(commandResult.sql, commandResult.params);
        return stryMutAct_9fa48("161546") ? {} : (stryCov_9fa48("161546"), {
          success: stryMutAct_9fa48("161547") ? false : (stryCov_9fa48("161547"), true),
          rows: stryMutAct_9fa48("161550") ? result.rows && [] : stryMutAct_9fa48("161549") ? false : stryMutAct_9fa48("161548") ? true : (stryCov_9fa48("161548", "161549", "161550"), result.rows || (stryMutAct_9fa48("161551") ? ["Stryker was here"] : (stryCov_9fa48("161551"), [])))
        });
      }
    } catch (err) {
      if (stryMutAct_9fa48("161552")) {
        {}
      } else {
        stryCov_9fa48("161552");
        return stryMutAct_9fa48("161553") ? {} : (stryCov_9fa48("161553"), {
          success: stryMutAct_9fa48("161554") ? true : (stryCov_9fa48("161554"), false),
          error: stryMutAct_9fa48("161555") ? `` : (stryCov_9fa48("161555"), `${META_WRITE_ERROR_MSG.EXECUTION_FAILED}: ${err.message}`)
        });
      }
    }
  }
}
export { META_WRITE_ERROR_MSG, executeMetaWrite, executeMetaRead };