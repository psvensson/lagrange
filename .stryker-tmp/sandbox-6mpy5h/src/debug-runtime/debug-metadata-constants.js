/**
 * Constants for debug metadata table names and row fields.
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
import { TABLES } from '../constants/index.js';
const DEBUG_METADATA_TABLE = Object.freeze(stryMutAct_9fa48("76597") ? {} : (stryCov_9fa48("76597"), {
  SESSIONS: TABLES.DEBUG_SESSIONS,
  BREAKPOINTS: TABLES.DEBUG_BREAKPOINTS,
  SNAPSHOTS: TABLES.DEBUG_SNAPSHOTS
}));
const DEBUG_SESSION_FIELD = Object.freeze(stryMutAct_9fa48("76598") ? {} : (stryCov_9fa48("76598"), {
  SESSION_ID: stryMutAct_9fa48("76599") ? "" : (stryCov_9fa48("76599"), 'session_id'),
  TENANT_ID: stryMutAct_9fa48("76600") ? "" : (stryCov_9fa48("76600"), 'tenant_id'),
  SERVICE_NAME: stryMutAct_9fa48("76601") ? "" : (stryCov_9fa48("76601"), 'service_name'),
  LINEAGE_ID: stryMutAct_9fa48("76602") ? "" : (stryCov_9fa48("76602"), 'lineage_id'),
  STAGE_ID: stryMutAct_9fa48("76603") ? "" : (stryCov_9fa48("76603"), 'stage_id'),
  NODE_ID: stryMutAct_9fa48("76604") ? "" : (stryCov_9fa48("76604"), 'node_id'),
  ENDPOINT: stryMutAct_9fa48("76605") ? "" : (stryCov_9fa48("76605"), 'endpoint'),
  STATUS: stryMutAct_9fa48("76606") ? "" : (stryCov_9fa48("76606"), 'status'),
  UPDATED_AT: stryMutAct_9fa48("76607") ? "" : (stryCov_9fa48("76607"), 'updated_at'),
  CREATED_AT: stryMutAct_9fa48("76608") ? "" : (stryCov_9fa48("76608"), 'created_at')
}));
const DEBUG_BREAKPOINT_FIELD = Object.freeze(stryMutAct_9fa48("76609") ? {} : (stryCov_9fa48("76609"), {
  BREAKPOINT_ID: stryMutAct_9fa48("76610") ? "" : (stryCov_9fa48("76610"), 'breakpoint_id'),
  SESSION_ID: stryMutAct_9fa48("76611") ? "" : (stryCov_9fa48("76611"), 'session_id'),
  MODULE_REF: stryMutAct_9fa48("76612") ? "" : (stryCov_9fa48("76612"), 'module_ref'),
  SOURCE_FILE_URL: stryMutAct_9fa48("76613") ? "" : (stryCov_9fa48("76613"), 'source_file_url'),
  LINE_NUMBER: stryMutAct_9fa48("76614") ? "" : (stryCov_9fa48("76614"), 'line_number'),
  COLUMN_NUMBER: stryMutAct_9fa48("76615") ? "" : (stryCov_9fa48("76615"), 'column_number'),
  CONDITION: stryMutAct_9fa48("76616") ? "" : (stryCov_9fa48("76616"), 'condition'),
  RESOLVED: stryMutAct_9fa48("76617") ? "" : (stryCov_9fa48("76617"), 'resolved'),
  UPDATED_AT: stryMutAct_9fa48("76618") ? "" : (stryCov_9fa48("76618"), 'updated_at'),
  CREATED_AT: stryMutAct_9fa48("76619") ? "" : (stryCov_9fa48("76619"), 'created_at')
}));
const DEBUG_SNAPSHOT_FIELD = Object.freeze(stryMutAct_9fa48("76620") ? {} : (stryCov_9fa48("76620"), {
  SNAPSHOT_ID: stryMutAct_9fa48("76621") ? "" : (stryCov_9fa48("76621"), 'snapshot_id'),
  SESSION_ID: stryMutAct_9fa48("76622") ? "" : (stryCov_9fa48("76622"), 'session_id'),
  MODULE_REF: stryMutAct_9fa48("76623") ? "" : (stryCov_9fa48("76623"), 'module_ref'),
  MODULE_DIGEST: stryMutAct_9fa48("76624") ? "" : (stryCov_9fa48("76624"), 'module_digest'),
  CAPTURED_AT: stryMutAct_9fa48("76625") ? "" : (stryCov_9fa48("76625"), 'captured_at'),
  FORMAT_VERSION: stryMutAct_9fa48("76626") ? "" : (stryCov_9fa48("76626"), 'format_version'),
  SNAPSHOT_BYTES_BASE64: stryMutAct_9fa48("76627") ? "" : (stryCov_9fa48("76627"), 'snapshot_bytes_base64'),
  MANIFEST_JSON: stryMutAct_9fa48("76628") ? "" : (stryCov_9fa48("76628"), 'manifest_json'),
  TOTAL_BYTES: stryMutAct_9fa48("76629") ? "" : (stryCov_9fa48("76629"), 'total_bytes'),
  FRAME_COUNT: stryMutAct_9fa48("76630") ? "" : (stryCov_9fa48("76630"), 'frame_count'),
  HOST_CALL_COUNT: stryMutAct_9fa48("76631") ? "" : (stryCov_9fa48("76631"), 'host_call_count'),
  UPDATED_AT: stryMutAct_9fa48("76632") ? "" : (stryCov_9fa48("76632"), 'updated_at'),
  CREATED_AT: stryMutAct_9fa48("76633") ? "" : (stryCov_9fa48("76633"), 'created_at')
}));
const DEBUG_SESSION_STATUS = Object.freeze(stryMutAct_9fa48("76634") ? {} : (stryCov_9fa48("76634"), {
  ACTIVE: stryMutAct_9fa48("76635") ? "" : (stryCov_9fa48("76635"), 'active'),
  DETACHED: stryMutAct_9fa48("76636") ? "" : (stryCov_9fa48("76636"), 'detached'),
  STOPPED: stryMutAct_9fa48("76637") ? "" : (stryCov_9fa48("76637"), 'stopped')
}));
export { DEBUG_METADATA_TABLE, DEBUG_SESSION_FIELD, DEBUG_BREAKPOINT_FIELD, DEBUG_SNAPSHOT_FIELD, DEBUG_SESSION_STATUS };