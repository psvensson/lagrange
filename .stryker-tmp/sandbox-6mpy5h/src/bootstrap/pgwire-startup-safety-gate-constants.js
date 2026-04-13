/**
 * Constants for PgWireStartupSafetyGate.
 *
 * Defines log messages, error messages, and subsystem identifier
 * for the PG wire bootstrap/join safety gate.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
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
const PGWIRE_SAFETY_GATE_SUBSYSTEM = stryMutAct_9fa48("24353") ? "" : (stryCov_9fa48("24353"), 'pgwire-startup-safety-gate');
const PGWIRE_SAFETY_GATE_LOG_MSG = Object.freeze(stryMutAct_9fa48("24354") ? {} : (stryCov_9fa48("24354"), {
  GATE_BLOCKED: stryMutAct_9fa48("24355") ? "" : (stryCov_9fa48("24355"), 'PG wire startup blocked: control-plane prerequisites not met'),
  GATE_PASSED: stryMutAct_9fa48("24356") ? "" : (stryCov_9fa48("24356"), 'PG wire startup gate passed: control-plane ready'),
  SETUP_COMPLETED: stryMutAct_9fa48("24357") ? "" : (stryCov_9fa48("24357"), 'Runtime service handler setup completed for PG wire'),
  SETUP_FAILED_ISOLATED: stryMutAct_9fa48("24358") ? "" : (stryCov_9fa48("24358"), 'PG wire runtime service handler setup failed (isolated)')
}));
const PGWIRE_SAFETY_GATE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("24359") ? {} : (stryCov_9fa48("24359"), {
  LIFECYCLE_MANAGER_MISSING: stryMutAct_9fa48("24360") ? "" : (stryCov_9fa48("24360"), 'serviceLifecycleManager not available'),
  SYSTEM_CACHE_MISSING: stryMutAct_9fa48("24361") ? "" : (stryCov_9fa48("24361"), 'systemTableCache not available'),
  CONTROL_PLANE_NOT_READY: stryMutAct_9fa48("24362") ? "" : (stryCov_9fa48("24362"), 'heartbeatService not initialized (control plane not ready)')
}));
export { PGWIRE_SAFETY_GATE_ERROR_MSG, PGWIRE_SAFETY_GATE_LOG_MSG, PGWIRE_SAFETY_GATE_SUBSYSTEM };