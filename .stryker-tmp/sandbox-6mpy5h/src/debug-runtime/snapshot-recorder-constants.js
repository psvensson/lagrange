/**
 * Constants for deterministic snapshot capture and serialization.
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
const SNAPSHOT_RECORDER_DEFAULT = Object.freeze(stryMutAct_9fa48("78108") ? {} : (stryCov_9fa48("78108"), {
  FORMAT_MAGIC: stryMutAct_9fa48("78109") ? "" : (stryCov_9fa48("78109"), 'DSNP'),
  FORMAT_VERSION: 1,
  MAX_BYTES_PER_SNAPSHOT: 1048576,
  MAX_FRAMES_PER_SESSION: 512,
  MAX_HOST_CALLS_PER_SESSION: 1024,
  CAPTURE_TIMEOUT_MS: 250,
  HEADER_SIZE_BYTES: 13
}));
const SNAPSHOT_RECORDER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("78110") ? {} : (stryCov_9fa48("78110"), {
  REQUEST_REQUIRED: stryMutAct_9fa48("78111") ? "" : (stryCov_9fa48("78111"), 'Snapshot request is required'),
  SESSION_ID_REQUIRED: stryMutAct_9fa48("78112") ? "" : (stryCov_9fa48("78112"), 'Snapshot request requires non-empty sessionId'),
  MODULE_REF_REQUIRED: stryMutAct_9fa48("78113") ? "" : (stryCov_9fa48("78113"), 'Snapshot request requires non-empty moduleRef'),
  MODULE_DIGEST_REQUIRED: stryMutAct_9fa48("78114") ? "" : (stryCov_9fa48("78114"), 'Snapshot request requires non-empty moduleDigest'),
  FRAME_REQUIRED: stryMutAct_9fa48("78115") ? "" : (stryCov_9fa48("78115"), 'Snapshot capture requires frame object'),
  HOST_CALL_REQUIRED: stryMutAct_9fa48("78116") ? "" : (stryCov_9fa48("78116"), 'Snapshot capture requires hostCall object'),
  MEMORY_LABEL_REQUIRED: stryMutAct_9fa48("78117") ? "" : (stryCov_9fa48("78117"), 'Snapshot capture requires non-empty memory boundary label'),
  MEMORY_BYTES_REQUIRED: stryMutAct_9fa48("78118") ? "" : (stryCov_9fa48("78118"), 'Snapshot capture requires memory bytes as Buffer, Uint8Array, or ArrayBuffer'),
  SNAPSHOT_NOT_FOUND: stryMutAct_9fa48("78119") ? "" : (stryCov_9fa48("78119"), 'Snapshot capture session not found'),
  SNAPSHOT_ALREADY_EXISTS: stryMutAct_9fa48("78120") ? "" : (stryCov_9fa48("78120"), 'Snapshot capture session already exists'),
  SNAPSHOT_BYTES_LIMIT_EXCEEDED: stryMutAct_9fa48("78121") ? "" : (stryCov_9fa48("78121"), 'Snapshot bytes exceed max bytes per snapshot'),
  SNAPSHOT_FRAME_LIMIT_EXCEEDED: stryMutAct_9fa48("78122") ? "" : (stryCov_9fa48("78122"), 'Snapshot frame count exceeds max frames per session'),
  SNAPSHOT_HOST_CALL_LIMIT_EXCEEDED: stryMutAct_9fa48("78123") ? "" : (stryCov_9fa48("78123"), 'Snapshot host call count exceeds max host calls per session'),
  SNAPSHOT_CAPTURE_TIMEOUT: stryMutAct_9fa48("78124") ? "" : (stryCov_9fa48("78124"), 'Snapshot capture operation timed out'),
  SNAPSHOT_BUFFER_REQUIRED: stryMutAct_9fa48("78125") ? "" : (stryCov_9fa48("78125"), 'Snapshot deserialize requires Buffer or Uint8Array'),
  SNAPSHOT_FORMAT_MAGIC_INVALID: stryMutAct_9fa48("78126") ? "" : (stryCov_9fa48("78126"), 'Snapshot envelope magic is invalid'),
  SNAPSHOT_FORMAT_VERSION_UNSUPPORTED: stryMutAct_9fa48("78127") ? "" : (stryCov_9fa48("78127"), 'Snapshot envelope version is unsupported'),
  SNAPSHOT_BUFFER_TRUNCATED: stryMutAct_9fa48("78128") ? "" : (stryCov_9fa48("78128"), 'Snapshot envelope is truncated'),
  SNAPSHOT_MANIFEST_INVALID: stryMutAct_9fa48("78129") ? "" : (stryCov_9fa48("78129"), 'Snapshot manifest payload is invalid'),
  SNAPSHOT_PAYLOAD_INVALID: stryMutAct_9fa48("78130") ? "" : (stryCov_9fa48("78130"), 'Snapshot payload is invalid')
}));
export { SNAPSHOT_RECORDER_DEFAULT, SNAPSHOT_RECORDER_ERROR_MSG };