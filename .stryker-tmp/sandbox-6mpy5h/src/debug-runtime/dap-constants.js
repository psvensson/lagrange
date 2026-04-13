/**
 * Debug Adapter Protocol constants for runtime debug server.
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
const DAP_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("75898") ? {} : (stryCov_9fa48("75898"), {
  REQUEST: stryMutAct_9fa48("75899") ? "" : (stryCov_9fa48("75899"), 'request'),
  RESPONSE: stryMutAct_9fa48("75900") ? "" : (stryCov_9fa48("75900"), 'response'),
  EVENT: stryMutAct_9fa48("75901") ? "" : (stryCov_9fa48("75901"), 'event')
}));
const DAP_COMMAND = Object.freeze(stryMutAct_9fa48("75902") ? {} : (stryCov_9fa48("75902"), {
  INITIALIZE: stryMutAct_9fa48("75903") ? "" : (stryCov_9fa48("75903"), 'initialize'),
  LAUNCH: stryMutAct_9fa48("75904") ? "" : (stryCov_9fa48("75904"), 'launch'),
  ATTACH: stryMutAct_9fa48("75905") ? "" : (stryCov_9fa48("75905"), 'attach'),
  SET_BREAKPOINTS: stryMutAct_9fa48("75906") ? "" : (stryCov_9fa48("75906"), 'setBreakpoints'),
  CONTINUE: stryMutAct_9fa48("75907") ? "" : (stryCov_9fa48("75907"), 'continue'),
  NEXT: stryMutAct_9fa48("75908") ? "" : (stryCov_9fa48("75908"), 'next'),
  STEP_IN: stryMutAct_9fa48("75909") ? "" : (stryCov_9fa48("75909"), 'stepIn'),
  STEP_OUT: stryMutAct_9fa48("75910") ? "" : (stryCov_9fa48("75910"), 'stepOut'),
  THREADS: stryMutAct_9fa48("75911") ? "" : (stryCov_9fa48("75911"), 'threads'),
  STACK_TRACE: stryMutAct_9fa48("75912") ? "" : (stryCov_9fa48("75912"), 'stackTrace'),
  SCOPES: stryMutAct_9fa48("75913") ? "" : (stryCov_9fa48("75913"), 'scopes'),
  VARIABLES: stryMutAct_9fa48("75914") ? "" : (stryCov_9fa48("75914"), 'variables')
}));
const DAP_EVENT = Object.freeze(stryMutAct_9fa48("75915") ? {} : (stryCov_9fa48("75915"), {
  INITIALIZED: stryMutAct_9fa48("75916") ? "" : (stryCov_9fa48("75916"), 'initialized'),
  STOPPED: stryMutAct_9fa48("75917") ? "" : (stryCov_9fa48("75917"), 'stopped'),
  CONTINUED: stryMutAct_9fa48("75918") ? "" : (stryCov_9fa48("75918"), 'continued')
}));
const DAP_DEFAULT = Object.freeze(stryMutAct_9fa48("75919") ? {} : (stryCov_9fa48("75919"), {
  THREAD_ID: 1,
  CONTENT_LENGTH_HEADER: stryMutAct_9fa48("75920") ? "" : (stryCov_9fa48("75920"), 'Content-Length'),
  HEADER_SEPARATOR: stryMutAct_9fa48("75921") ? "" : (stryCov_9fa48("75921"), '\r\n\r\n'),
  LINE_SEPARATOR: stryMutAct_9fa48("75922") ? "" : (stryCov_9fa48("75922"), '\r\n'),
  LOCAL_SCOPE_NAME: stryMutAct_9fa48("75923") ? "" : (stryCov_9fa48("75923"), 'Locals'),
  MAIN_THREAD_NAME: stryMutAct_9fa48("75924") ? "" : (stryCov_9fa48("75924"), 'main'),
  FRAME_NAME_PREFIX: stryMutAct_9fa48("75925") ? "" : (stryCov_9fa48("75925"), 'frame_')
}));
const DAP_ERROR_MSG = Object.freeze(stryMutAct_9fa48("75926") ? {} : (stryCov_9fa48("75926"), {
  REQUEST_REQUIRED: stryMutAct_9fa48("75927") ? "" : (stryCov_9fa48("75927"), 'DAP request is required'),
  MESSAGE_REQUIRED: stryMutAct_9fa48("75928") ? "" : (stryCov_9fa48("75928"), 'DAP message is required'),
  SEND_MESSAGE_REQUIRED: stryMutAct_9fa48("75929") ? "" : (stryCov_9fa48("75929"), 'DAP server requires sendMessage function'),
  BREAKPOINT_MANAGER_REQUIRED: stryMutAct_9fa48("75930") ? "" : (stryCov_9fa48("75930"), 'DAP server requires breakpointManager object'),
  RUNTIME_INTROSPECTOR_REQUIRED: stryMutAct_9fa48("75931") ? "" : (stryCov_9fa48("75931"), 'DAP server requires runtimeIntrospector object'),
  COMMAND_UNSUPPORTED: stryMutAct_9fa48("75932") ? "" : (stryCov_9fa48("75932"), 'DAP command is not supported'),
  INITIALIZE_REQUIRED: stryMutAct_9fa48("75933") ? "" : (stryCov_9fa48("75933"), 'DAP initialize must be completed before this command'),
  SESSION_NOT_READY: stryMutAct_9fa48("75934") ? "" : (stryCov_9fa48("75934"), 'DAP attach/launch must complete before this command'),
  SESSION_CONTEXT_REQUIRED: stryMutAct_9fa48("75935") ? "" : (stryCov_9fa48("75935"), 'DAP attach/launch requires sessionId, moduleRef, instanceHandle, and index'),
  FRAME_REQUIRED: stryMutAct_9fa48("75936") ? "" : (stryCov_9fa48("75936"), 'DAP scopes request requires frameId'),
  VARIABLES_REFERENCE_REQUIRED: stryMutAct_9fa48("75937") ? "" : (stryCov_9fa48("75937"), 'DAP variables request requires variablesReference'),
  VARIABLES_REFERENCE_UNKNOWN: stryMutAct_9fa48("75938") ? "" : (stryCov_9fa48("75938"), 'DAP variablesReference does not exist'),
  CONTENT_LENGTH_INVALID: stryMutAct_9fa48("75939") ? "" : (stryCov_9fa48("75939"), 'DAP protocol Content-Length header is missing or invalid'),
  PAYLOAD_INVALID: stryMutAct_9fa48("75940") ? "" : (stryCov_9fa48("75940"), 'DAP protocol payload is invalid JSON')
}));
export { DAP_MESSAGE_TYPE, DAP_COMMAND, DAP_EVENT, DAP_DEFAULT, DAP_ERROR_MSG };