/**
 * Constants for WASM meta-service management.
 *
 * Covers package identity parsing, async operation states,
 * command/action names, and service identifiers for
 * sys-wasm-meta and sys-admin-meta.
 *
 * Requirements: 2.1, 3.1, 8.1
 */
// @ts-nocheck


// --- Package identity (namespace:name@version) ---
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
const PACKAGE_ID_SEPARATOR = stryMutAct_9fa48("55302") ? "" : (stryCov_9fa48("55302"), ':');
const PACKAGE_VERSION_SEPARATOR = stryMutAct_9fa48("55303") ? "" : (stryCov_9fa48("55303"), '@');
const PACKAGE_ID_MAX_LENGTH = Object.freeze(stryMutAct_9fa48("55304") ? {} : (stryCov_9fa48("55304"), {
  NAMESPACE: 128,
  NAME: 128,
  VERSION: 64
}));

/**
 * Regex for canonical package identity: namespace:name@version
 *
 * namespace — lowercase alphanumeric + hyphens, 1-128 chars
 * name      — lowercase alphanumeric + hyphens, 1-128 chars
 * version   — semver-like (digits, dots, hyphens, plus), 1-64 chars
 */
const PACKAGE_ID_PATTERN = stryMutAct_9fa48("55315") ? /^([a-z][a-z0-9-]{0,127}):([a-z][a-z0-9-]{0,127})@([0-9][^0-9a-zA-Z.+-]{0,63})$/ : stryMutAct_9fa48("55314") ? /^([a-z][a-z0-9-]{0,127}):([a-z][a-z0-9-]{0,127})@([0-9][0-9a-zA-Z.+-])$/ : stryMutAct_9fa48("55313") ? /^([a-z][a-z0-9-]{0,127}):([a-z][a-z0-9-]{0,127})@([^0-9][0-9a-zA-Z.+-]{0,63})$/ : stryMutAct_9fa48("55312") ? /^([a-z][a-z0-9-]{0,127}):([a-z][^a-z0-9-]{0,127})@([0-9][0-9a-zA-Z.+-]{0,63})$/ : stryMutAct_9fa48("55311") ? /^([a-z][a-z0-9-]{0,127}):([a-z][a-z0-9-])@([0-9][0-9a-zA-Z.+-]{0,63})$/ : stryMutAct_9fa48("55310") ? /^([a-z][a-z0-9-]{0,127}):([^a-z][a-z0-9-]{0,127})@([0-9][0-9a-zA-Z.+-]{0,63})$/ : stryMutAct_9fa48("55309") ? /^([a-z][^a-z0-9-]{0,127}):([a-z][a-z0-9-]{0,127})@([0-9][0-9a-zA-Z.+-]{0,63})$/ : stryMutAct_9fa48("55308") ? /^([a-z][a-z0-9-]):([a-z][a-z0-9-]{0,127})@([0-9][0-9a-zA-Z.+-]{0,63})$/ : stryMutAct_9fa48("55307") ? /^([^a-z][a-z0-9-]{0,127}):([a-z][a-z0-9-]{0,127})@([0-9][0-9a-zA-Z.+-]{0,63})$/ : stryMutAct_9fa48("55306") ? /^([a-z][a-z0-9-]{0,127}):([a-z][a-z0-9-]{0,127})@([0-9][0-9a-zA-Z.+-]{0,63})/ : stryMutAct_9fa48("55305") ? /([a-z][a-z0-9-]{0,127}):([a-z][a-z0-9-]{0,127})@([0-9][0-9a-zA-Z.+-]{0,63})$/ : (stryCov_9fa48("55305", "55306", "55307", "55308", "55309", "55310", "55311", "55312", "55313", "55314", "55315"), /^([a-z][a-z0-9-]{0,127}):([a-z][a-z0-9-]{0,127})@([0-9][0-9a-zA-Z.+-]{0,63})$/);

// --- Async operation states (wasm_operations table) ---

const WASM_OPERATION_STATE = Object.freeze(stryMutAct_9fa48("55316") ? {} : (stryCov_9fa48("55316"), {
  PENDING: stryMutAct_9fa48("55317") ? "" : (stryCov_9fa48("55317"), 'pending'),
  IN_PROGRESS: stryMutAct_9fa48("55318") ? "" : (stryCov_9fa48("55318"), 'in_progress'),
  COMPLETED: stryMutAct_9fa48("55319") ? "" : (stryCov_9fa48("55319"), 'completed'),
  FAILED: stryMutAct_9fa48("55320") ? "" : (stryCov_9fa48("55320"), 'failed'),
  CANCELLED: stryMutAct_9fa48("55321") ? "" : (stryCov_9fa48("55321"), 'cancelled')
}));

// --- sys-wasm-meta command / action names ---

const WASM_META_ACTION = Object.freeze(stryMutAct_9fa48("55322") ? {} : (stryCov_9fa48("55322"), {
  PUBLISH_MODULE: stryMutAct_9fa48("55323") ? "" : (stryCov_9fa48("55323"), 'publishModule'),
  GET_MODULE: stryMutAct_9fa48("55324") ? "" : (stryCov_9fa48("55324"), 'getModule'),
  LIST_MODULES: stryMutAct_9fa48("55325") ? "" : (stryCov_9fa48("55325"), 'listModules'),
  CREATE_SERVICE: stryMutAct_9fa48("55326") ? "" : (stryCov_9fa48("55326"), 'createService'),
  UPDATE_SERVICE: stryMutAct_9fa48("55327") ? "" : (stryCov_9fa48("55327"), 'updateService'),
  SCALE_SERVICE: stryMutAct_9fa48("55328") ? "" : (stryCov_9fa48("55328"), 'scaleService'),
  ROLLOUT_SERVICE: stryMutAct_9fa48("55329") ? "" : (stryCov_9fa48("55329"), 'rolloutService'),
  DELETE_SERVICE: stryMutAct_9fa48("55330") ? "" : (stryCov_9fa48("55330"), 'deleteService'),
  GET_OPERATION: stryMutAct_9fa48("55331") ? "" : (stryCov_9fa48("55331"), 'getOperation'),
  STREAM_OPERATIONS: stryMutAct_9fa48("55332") ? "" : (stryCov_9fa48("55332"), 'streamOperations')
}));

// --- Service identifiers ---

const META_SERVICE_ID = Object.freeze(stryMutAct_9fa48("55333") ? {} : (stryCov_9fa48("55333"), {
  WASM_META: stryMutAct_9fa48("55334") ? "" : (stryCov_9fa48("55334"), 'sys-wasm-meta'),
  ADMIN_META: stryMutAct_9fa48("55335") ? "" : (stryCov_9fa48("55335"), 'sys-admin-meta'),
  POSTGRES_WIRE: stryMutAct_9fa48("55336") ? "" : (stryCov_9fa48("55336"), 'sys-postgres-wire')
}));

// --- Runtime references for built-in meta services ---

const META_SERVICE_RUNTIME_REF = Object.freeze(stryMutAct_9fa48("55337") ? {} : (stryCov_9fa48("55337"), {
  ADMIN_META: stryMutAct_9fa48("55338") ? "" : (stryCov_9fa48("55338"), 'admin-meta-command-handlers'),
  WASM_META: stryMutAct_9fa48("55339") ? "" : (stryCov_9fa48("55339"), 'wasm-meta-command-handlers'),
  POSTGRES_WIRE: stryMutAct_9fa48("55340") ? "" : (stryCov_9fa48("55340"), 'postgres-wire-runtime')
}));
export { PACKAGE_ID_SEPARATOR, PACKAGE_VERSION_SEPARATOR, PACKAGE_ID_MAX_LENGTH, PACKAGE_ID_PATTERN, WASM_OPERATION_STATE, WASM_META_ACTION, META_SERVICE_ID, META_SERVICE_RUNTIME_REF };