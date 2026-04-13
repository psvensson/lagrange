/**
 * CDC write-router strategies.
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
import { TYPEOF } from '../../constants/index.js';
const WRITE_ROUTER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("39494") ? {} : (stryCov_9fa48("39494"), {
  EXECUTE_REQUIRED: stryMutAct_9fa48("39495") ? "" : (stryCov_9fa48("39495"), 'Write router requires an execute function')
}));
const WRITE_ROUTER_MODE = Object.freeze(stryMutAct_9fa48("39496") ? {} : (stryCov_9fa48("39496"), {
  BOOTSTRAP_DIRECT: stryMutAct_9fa48("39497") ? "" : (stryCov_9fa48("39497"), 'bootstrap-direct'),
  SQL_ROUTED: stryMutAct_9fa48("39498") ? "" : (stryCov_9fa48("39498"), 'sql-routed')
}));
function assertExecuteFunction(execute) {
  if (stryMutAct_9fa48("39499")) {
    {}
  } else {
    stryCov_9fa48("39499");
    if (stryMutAct_9fa48("39502") ? typeof execute === TYPEOF.FUNCTION : stryMutAct_9fa48("39501") ? false : stryMutAct_9fa48("39500") ? true : (stryCov_9fa48("39500", "39501", "39502"), typeof execute !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("39503")) {
        {}
      } else {
        stryCov_9fa48("39503");
        throw new Error(WRITE_ROUTER_ERROR_MSG.EXECUTE_REQUIRED);
      }
    }
  }
}
class BootstrapDirectWriteRouter {
  constructor(options = {}) {
    if (stryMutAct_9fa48("39504")) {
      {}
    } else {
      stryCov_9fa48("39504");
      assertExecuteFunction(options.execute);
      this.executeFn = options.execute;
      this.mode = WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT;
    }
  }
  async execute(sql, params = stryMutAct_9fa48("39505") ? ["Stryker was here"] : (stryCov_9fa48("39505"), []), options = {}) {
    if (stryMutAct_9fa48("39506")) {
      {}
    } else {
      stryCov_9fa48("39506");
      return this.executeFn(sql, params, options);
    }
  }
}
class SqlWriteRouter {
  constructor(options = {}) {
    if (stryMutAct_9fa48("39507")) {
      {}
    } else {
      stryCov_9fa48("39507");
      assertExecuteFunction(options.execute);
      this.executeFn = options.execute;
      this.mode = WRITE_ROUTER_MODE.SQL_ROUTED;
    }
  }
  async execute(sql, params = stryMutAct_9fa48("39508") ? ["Stryker was here"] : (stryCov_9fa48("39508"), []), options = {}) {
    if (stryMutAct_9fa48("39509")) {
      {}
    } else {
      stryCov_9fa48("39509");
      return this.executeFn(sql, params, options);
    }
  }
}
function createBootstrapDirectWriteRouter(options = {}) {
  if (stryMutAct_9fa48("39510")) {
    {}
  } else {
    stryCov_9fa48("39510");
    return new BootstrapDirectWriteRouter(options);
  }
}
function createSqlWriteRouter(options = {}) {
  if (stryMutAct_9fa48("39511")) {
    {}
  } else {
    stryCov_9fa48("39511");
    return new SqlWriteRouter(options);
  }
}
export { WRITE_ROUTER_ERROR_MSG, WRITE_ROUTER_MODE, BootstrapDirectWriteRouter, SqlWriteRouter, createBootstrapDirectWriteRouter, createSqlWriteRouter };