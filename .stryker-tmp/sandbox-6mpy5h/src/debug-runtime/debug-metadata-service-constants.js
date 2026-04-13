/**
 * Constants for SQL-backed debug metadata service.
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
const DEBUG_METADATA_ACTION = Object.freeze(stryMutAct_9fa48("76638") ? {} : (stryCov_9fa48("76638"), {
  CREATE_SESSION: stryMutAct_9fa48("76639") ? "" : (stryCov_9fa48("76639"), 'debug.createSession'),
  ATTACH_SESSION: stryMutAct_9fa48("76640") ? "" : (stryCov_9fa48("76640"), 'debug.attachSession'),
  UPDATE_SESSION: stryMutAct_9fa48("76641") ? "" : (stryCov_9fa48("76641"), 'debug.updateSession'),
  DETACH_SESSION: stryMutAct_9fa48("76642") ? "" : (stryCov_9fa48("76642"), 'debug.detachSession'),
  LIST_SESSIONS: stryMutAct_9fa48("76643") ? "" : (stryCov_9fa48("76643"), 'debug.listSessions'),
  WRITE_BREAKPOINTS: stryMutAct_9fa48("76644") ? "" : (stryCov_9fa48("76644"), 'debug.writeBreakpoints'),
  READ_BREAKPOINTS: stryMutAct_9fa48("76645") ? "" : (stryCov_9fa48("76645"), 'debug.readBreakpoints'),
  WRITE_SNAPSHOT: stryMutAct_9fa48("76646") ? "" : (stryCov_9fa48("76646"), 'debug.writeSnapshot'),
  READ_SNAPSHOT: stryMutAct_9fa48("76647") ? "" : (stryCov_9fa48("76647"), 'debug.readSnapshot'),
  LIST_SNAPSHOTS: stryMutAct_9fa48("76648") ? "" : (stryCov_9fa48("76648"), 'debug.listSnapshots')
}));
const DEBUG_METADATA_ROLE = Object.freeze(stryMutAct_9fa48("76649") ? {} : (stryCov_9fa48("76649"), {
  ADMIN: stryMutAct_9fa48("76650") ? "" : (stryCov_9fa48("76650"), 'debug_admin'),
  ATTACH: stryMutAct_9fa48("76651") ? "" : (stryCov_9fa48("76651"), 'debug_attach'),
  READ: stryMutAct_9fa48("76652") ? "" : (stryCov_9fa48("76652"), 'debug_read'),
  WRITE: stryMutAct_9fa48("76653") ? "" : (stryCov_9fa48("76653"), 'debug_write')
}));
const DEBUG_METADATA_DEFAULT = Object.freeze(stryMutAct_9fa48("76654") ? {} : (stryCov_9fa48("76654"), {
  SESSION_ID_PREFIX: stryMutAct_9fa48("76655") ? "" : (stryCov_9fa48("76655"), 'debug-meta'),
  COLUMN_NUMBER: 0,
  RESOLVED_FALSE: 0,
  RESOLVED_TRUE: 1,
  MAX_LIMIT: 100
}));
const DEBUG_METADATA_ERROR_CODE = Object.freeze(stryMutAct_9fa48("76656") ? {} : (stryCov_9fa48("76656"), {
  ENGINE_REQUIRED: stryMutAct_9fa48("76657") ? "" : (stryCov_9fa48("76657"), 'ENGINE_REQUIRED'),
  INVALID_REQUEST: stryMutAct_9fa48("76658") ? "" : (stryCov_9fa48("76658"), 'INVALID_REQUEST'),
  SESSION_NOT_FOUND: stryMutAct_9fa48("76659") ? "" : (stryCov_9fa48("76659"), 'SESSION_NOT_FOUND'),
  SNAPSHOT_NOT_FOUND: stryMutAct_9fa48("76660") ? "" : (stryCov_9fa48("76660"), 'SNAPSHOT_NOT_FOUND'),
  BREAKPOINTS_REQUIRED: stryMutAct_9fa48("76661") ? "" : (stryCov_9fa48("76661"), 'BREAKPOINTS_REQUIRED'),
  UNAUTHORIZED: stryMutAct_9fa48("76662") ? "" : (stryCov_9fa48("76662"), 'UNAUTHORIZED'),
  INVALID_CONTEXT: stryMutAct_9fa48("76663") ? "" : (stryCov_9fa48("76663"), 'INVALID_CONTEXT')
}));
const DEBUG_METADATA_ERROR_MSG = Object.freeze(stryMutAct_9fa48("76664") ? {} : (stryCov_9fa48("76664"), {
  ENGINE_REQUIRED: stryMutAct_9fa48("76665") ? "" : (stryCov_9fa48("76665"), 'SQL query engine is required'),
  REQUEST_REQUIRED: stryMutAct_9fa48("76666") ? "" : (stryCov_9fa48("76666"), 'Debug metadata request is required'),
  SESSION_ID_REQUIRED: stryMutAct_9fa48("76667") ? "" : (stryCov_9fa48("76667"), 'sessionId is required'),
  SERVICE_NAME_REQUIRED: stryMutAct_9fa48("76668") ? "" : (stryCov_9fa48("76668"), 'serviceName is required'),
  BREAKPOINTS_REQUIRED: stryMutAct_9fa48("76669") ? "" : (stryCov_9fa48("76669"), 'breakpoints array is required'),
  SNAPSHOT_REQUIRED: stryMutAct_9fa48("76670") ? "" : (stryCov_9fa48("76670"), 'snapshot artifact is required'),
  SESSION_NOT_FOUND: stryMutAct_9fa48("76671") ? "" : (stryCov_9fa48("76671"), 'Debug session not found'),
  SNAPSHOT_NOT_FOUND: stryMutAct_9fa48("76672") ? "" : (stryCov_9fa48("76672"), 'Debug snapshot not found'),
  SECURITY_CONTEXT_REQUIRED: stryMutAct_9fa48("76673") ? "" : (stryCov_9fa48("76673"), 'securityContext is required'),
  AUTHORIZATION_FAILED: stryMutAct_9fa48("76674") ? "" : (stryCov_9fa48("76674"), 'Debug metadata authorization failed')
}));
const DEBUG_METADATA_SQL = Object.freeze(stryMutAct_9fa48("76675") ? {} : (stryCov_9fa48("76675"), {
  INSERT_OR_REPLACE_INTO: stryMutAct_9fa48("76676") ? "" : (stryCov_9fa48("76676"), 'INSERT OR REPLACE INTO'),
  ORDER_BY_CREATED_ASC: stryMutAct_9fa48("76677") ? "" : (stryCov_9fa48("76677"), ' ORDER BY created_at ASC'),
  ORDER_BY_CAPTURED_DESC: stryMutAct_9fa48("76678") ? "" : (stryCov_9fa48("76678"), ' ORDER BY captured_at DESC'),
  LIMIT: stryMutAct_9fa48("76679") ? "" : (stryCov_9fa48("76679"), ' LIMIT ')
}));
const DEBUG_METADATA_ROW_LIMIT = Object.freeze(stryMutAct_9fa48("76680") ? {} : (stryCov_9fa48("76680"), {
  SESSIONS: 50,
  BREAKPOINTS: 200,
  SNAPSHOTS: 50
}));
export { DEBUG_METADATA_ACTION, DEBUG_METADATA_ROLE, DEBUG_METADATA_DEFAULT, DEBUG_METADATA_ERROR_CODE, DEBUG_METADATA_ERROR_MSG, DEBUG_METADATA_SQL, DEBUG_METADATA_ROW_LIMIT };