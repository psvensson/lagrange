/**
 * Constants for breakpoint management and step control.
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
const BREAKPOINT_MANAGER_DEFAULT = Object.freeze(stryMutAct_9fa48("75651") ? {} : (stryCov_9fa48("75651"), {
  COLUMN_NUMBER: 0
}));
const BREAKPOINT_STEP_ACTION = Object.freeze(stryMutAct_9fa48("75652") ? {} : (stryCov_9fa48("75652"), {
  CONTINUE: stryMutAct_9fa48("75653") ? "" : (stryCov_9fa48("75653"), 'continue'),
  NEXT: stryMutAct_9fa48("75654") ? "" : (stryCov_9fa48("75654"), 'next'),
  STEP_IN: stryMutAct_9fa48("75655") ? "" : (stryCov_9fa48("75655"), 'stepIn'),
  STEP_OUT: stryMutAct_9fa48("75656") ? "" : (stryCov_9fa48("75656"), 'stepOut')
}));
const BREAKPOINT_MANAGER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("75657") ? {} : (stryCov_9fa48("75657"), {
  REQUEST_REQUIRED: stryMutAct_9fa48("75658") ? "" : (stryCov_9fa48("75658"), 'Breakpoint request is required'),
  SESSION_ID_REQUIRED: stryMutAct_9fa48("75659") ? "" : (stryCov_9fa48("75659"), 'Breakpoint request requires non-empty sessionId'),
  MODULE_REF_REQUIRED: stryMutAct_9fa48("75660") ? "" : (stryCov_9fa48("75660"), 'Breakpoint request requires non-empty moduleRef'),
  INDEX_REQUIRED: stryMutAct_9fa48("75661") ? "" : (stryCov_9fa48("75661"), 'Breakpoint request requires index object'),
  SOURCE_FILE_URL_REQUIRED: stryMutAct_9fa48("75662") ? "" : (stryCov_9fa48("75662"), 'Breakpoint request requires non-empty sourceFileUrl'),
  BREAKPOINTS_REQUIRED: stryMutAct_9fa48("75663") ? "" : (stryCov_9fa48("75663"), 'Breakpoint request requires breakpoints array'),
  LINE_NUMBER_REQUIRED: stryMutAct_9fa48("75664") ? "" : (stryCov_9fa48("75664"), 'Breakpoint request requires non-negative integer lineNumber'),
  CODE_OFFSET_REQUIRED: stryMutAct_9fa48("75665") ? "" : (stryCov_9fa48("75665"), 'Breakpoint request requires non-negative integer codeOffset'),
  RUNTIME_ADAPTER_REQUIRED: stryMutAct_9fa48("75666") ? "" : (stryCov_9fa48("75666"), 'Breakpoint step control requires runtimeAdapter.resume function'),
  INSTANCE_HANDLE_REQUIRED: stryMutAct_9fa48("75667") ? "" : (stryCov_9fa48("75667"), 'Breakpoint step control requires instanceHandle')
}));
export { BREAKPOINT_MANAGER_DEFAULT, BREAKPOINT_STEP_ACTION, BREAKPOINT_MANAGER_ERROR_MSG };