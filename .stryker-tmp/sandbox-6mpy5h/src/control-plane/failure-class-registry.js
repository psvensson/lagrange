/**
 * Failure-class registry for harness-discovered failures.
 *
 * Maps each harness-discovered failure class to a deterministic test
 * ID, enforcing the closure policy from Requirement 8: a failure
 * class SHALL NOT be considered closed until a deterministic
 * reproduction exists below full harness scale.
 *
 * Each entry tracks:
 * - failureClassId: unique identifier for the failure class
 * - invariantId: optional link to an invariant in the catalog
 * - deterministicTestId: optional link to a deterministic repro test
 * - status: open | reproduced | closed
 * - description: human-readable description of the failure class
 *
 * Requirements: 8.1
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
import { CLOSURE_VALIDATION_REASON, FAILURE_CLASS_STATUS } from './failure-class-constants.js';

/**
 * @type {Map<string, Object>}
 */
const registry = new Map();

/**
 * Creates a frozen failure class entry from the given options.
 * @param {Object} options
 * @return {Object}
 */
function buildEntry(options) {
  if (stryMutAct_9fa48("64689")) {
    {}
  } else {
    stryCov_9fa48("64689");
    const failureClassId = (stryMutAct_9fa48("64692") ? typeof options.failureClassId === 'string' || options.failureClassId.length > 0 : stryMutAct_9fa48("64691") ? false : stryMutAct_9fa48("64690") ? true : (stryCov_9fa48("64690", "64691", "64692"), (stryMutAct_9fa48("64694") ? typeof options.failureClassId !== 'string' : stryMutAct_9fa48("64693") ? true : (stryCov_9fa48("64693", "64694"), typeof options.failureClassId === (stryMutAct_9fa48("64695") ? "" : (stryCov_9fa48("64695"), 'string')))) && (stryMutAct_9fa48("64698") ? options.failureClassId.length <= 0 : stryMutAct_9fa48("64697") ? options.failureClassId.length >= 0 : stryMutAct_9fa48("64696") ? true : (stryCov_9fa48("64696", "64697", "64698"), options.failureClassId.length > 0)))) ? options.failureClassId : null;
    if (stryMutAct_9fa48("64701") ? false : stryMutAct_9fa48("64700") ? true : stryMutAct_9fa48("64699") ? failureClassId : (stryCov_9fa48("64699", "64700", "64701"), !failureClassId)) {
      if (stryMutAct_9fa48("64702")) {
        {}
      } else {
        stryCov_9fa48("64702");
        throw new Error(stryMutAct_9fa48("64703") ? "" : (stryCov_9fa48("64703"), 'failureClassId is required and must be a non-empty string'));
      }
    }
    const invariantId = (stryMutAct_9fa48("64706") ? typeof options.invariantId === 'string' || options.invariantId.length > 0 : stryMutAct_9fa48("64705") ? false : stryMutAct_9fa48("64704") ? true : (stryCov_9fa48("64704", "64705", "64706"), (stryMutAct_9fa48("64708") ? typeof options.invariantId !== 'string' : stryMutAct_9fa48("64707") ? true : (stryCov_9fa48("64707", "64708"), typeof options.invariantId === (stryMutAct_9fa48("64709") ? "" : (stryCov_9fa48("64709"), 'string')))) && (stryMutAct_9fa48("64712") ? options.invariantId.length <= 0 : stryMutAct_9fa48("64711") ? options.invariantId.length >= 0 : stryMutAct_9fa48("64710") ? true : (stryCov_9fa48("64710", "64711", "64712"), options.invariantId.length > 0)))) ? options.invariantId : null;
    const deterministicTestId = (stryMutAct_9fa48("64715") ? typeof options.deterministicTestId === 'string' || options.deterministicTestId.length > 0 : stryMutAct_9fa48("64714") ? false : stryMutAct_9fa48("64713") ? true : (stryCov_9fa48("64713", "64714", "64715"), (stryMutAct_9fa48("64717") ? typeof options.deterministicTestId !== 'string' : stryMutAct_9fa48("64716") ? true : (stryCov_9fa48("64716", "64717"), typeof options.deterministicTestId === (stryMutAct_9fa48("64718") ? "" : (stryCov_9fa48("64718"), 'string')))) && (stryMutAct_9fa48("64721") ? options.deterministicTestId.length <= 0 : stryMutAct_9fa48("64720") ? options.deterministicTestId.length >= 0 : stryMutAct_9fa48("64719") ? true : (stryCov_9fa48("64719", "64720", "64721"), options.deterministicTestId.length > 0)))) ? options.deterministicTestId : null;
    const description = (stryMutAct_9fa48("64724") ? typeof options.description === 'string' || options.description.length > 0 : stryMutAct_9fa48("64723") ? false : stryMutAct_9fa48("64722") ? true : (stryCov_9fa48("64722", "64723", "64724"), (stryMutAct_9fa48("64726") ? typeof options.description !== 'string' : stryMutAct_9fa48("64725") ? true : (stryCov_9fa48("64725", "64726"), typeof options.description === (stryMutAct_9fa48("64727") ? "" : (stryCov_9fa48("64727"), 'string')))) && (stryMutAct_9fa48("64730") ? options.description.length <= 0 : stryMutAct_9fa48("64729") ? options.description.length >= 0 : stryMutAct_9fa48("64728") ? true : (stryCov_9fa48("64728", "64729", "64730"), options.description.length > 0)))) ? options.description : null;
    const status = deterministicTestId ? FAILURE_CLASS_STATUS.REPRODUCED : FAILURE_CLASS_STATUS.OPEN;
    return Object.freeze(stryMutAct_9fa48("64731") ? {} : (stryCov_9fa48("64731"), {
      failureClassId,
      invariantId,
      deterministicTestId,
      status,
      description
    }));
  }
}

/**
 * Registers a failure class in the registry.
 * If a class with the same ID already exists, it is replaced.
 *
 * @param {Object} options
 * @param {string} options.failureClassId - unique failure class id
 * @param {string} [options.invariantId] - optional invariant catalog id
 * @param {string} [options.deterministicTestId] - optional test id
 * @param {string} [options.description] - human-readable description
 * @return {Object} the frozen registered entry
 */
function registerFailureClass(options) {
  if (stryMutAct_9fa48("64732")) {
    {}
  } else {
    stryCov_9fa48("64732");
    const entry = buildEntry(options);
    registry.set(entry.failureClassId, entry);
    return entry;
  }
}

/**
 * Retrieves a failure class entry by ID.
 *
 * @param {string} failureClassId
 * @return {Object|null} the frozen entry or null if not found
 */
function getFailureClass(failureClassId) {
  if (stryMutAct_9fa48("64733")) {
    {}
  } else {
    stryCov_9fa48("64733");
    if (stryMutAct_9fa48("64736") ? typeof failureClassId !== 'string' && failureClassId.length === 0 : stryMutAct_9fa48("64735") ? false : stryMutAct_9fa48("64734") ? true : (stryCov_9fa48("64734", "64735", "64736"), (stryMutAct_9fa48("64738") ? typeof failureClassId === 'string' : stryMutAct_9fa48("64737") ? false : (stryCov_9fa48("64737", "64738"), typeof failureClassId !== (stryMutAct_9fa48("64739") ? "" : (stryCov_9fa48("64739"), 'string')))) || (stryMutAct_9fa48("64741") ? failureClassId.length !== 0 : stryMutAct_9fa48("64740") ? false : (stryCov_9fa48("64740", "64741"), failureClassId.length === 0)))) {
      if (stryMutAct_9fa48("64742")) {
        {}
      } else {
        stryCov_9fa48("64742");
        return null;
      }
    }
    return stryMutAct_9fa48("64745") ? registry.get(failureClassId) && null : stryMutAct_9fa48("64744") ? false : stryMutAct_9fa48("64743") ? true : (stryCov_9fa48("64743", "64744", "64745"), registry.get(failureClassId) || null);
  }
}

/**
 * Returns all failure classes with status 'open'.
 * Per Requirement 8, classes without a deterministic test ID
 * remain open.
 *
 * @return {Object[]} array of frozen open entries
 */
function getOpenFailureClasses() {
  if (stryMutAct_9fa48("64746")) {
    {}
  } else {
    stryCov_9fa48("64746");
    const result = stryMutAct_9fa48("64747") ? ["Stryker was here"] : (stryCov_9fa48("64747"), []);
    for (const entry of registry.values()) {
      if (stryMutAct_9fa48("64748")) {
        {}
      } else {
        stryCov_9fa48("64748");
        if (stryMutAct_9fa48("64751") ? entry.status !== FAILURE_CLASS_STATUS.OPEN : stryMutAct_9fa48("64750") ? false : stryMutAct_9fa48("64749") ? true : (stryCov_9fa48("64749", "64750", "64751"), entry.status === FAILURE_CLASS_STATUS.OPEN)) {
          if (stryMutAct_9fa48("64752")) {
            {}
          } else {
            stryCov_9fa48("64752");
            result.push(entry);
          }
        }
      }
    }
    return Object.freeze(result);
  }
}

/**
 * Marks a failure class as reproduced by attaching a deterministic
 * test ID. The class must exist and be in 'open' status.
 *
 * @param {string} failureClassId
 * @param {string} deterministicTestId
 * @return {Object} the updated frozen entry
 */
function markReproduced(failureClassId, deterministicTestId) {
  if (stryMutAct_9fa48("64753")) {
    {}
  } else {
    stryCov_9fa48("64753");
    const existing = registry.get(failureClassId);
    if (stryMutAct_9fa48("64756") ? false : stryMutAct_9fa48("64755") ? true : stryMutAct_9fa48("64754") ? existing : (stryCov_9fa48("64754", "64755", "64756"), !existing)) {
      if (stryMutAct_9fa48("64757")) {
        {}
      } else {
        stryCov_9fa48("64757");
        throw new Error(stryMutAct_9fa48("64758") ? `` : (stryCov_9fa48("64758"), `Failure class not found: ${String(failureClassId)}`));
      }
    }
    if (stryMutAct_9fa48("64761") ? typeof deterministicTestId !== 'string' && deterministicTestId.length === 0 : stryMutAct_9fa48("64760") ? false : stryMutAct_9fa48("64759") ? true : (stryCov_9fa48("64759", "64760", "64761"), (stryMutAct_9fa48("64763") ? typeof deterministicTestId === 'string' : stryMutAct_9fa48("64762") ? false : (stryCov_9fa48("64762", "64763"), typeof deterministicTestId !== (stryMutAct_9fa48("64764") ? "" : (stryCov_9fa48("64764"), 'string')))) || (stryMutAct_9fa48("64766") ? deterministicTestId.length !== 0 : stryMutAct_9fa48("64765") ? false : (stryCov_9fa48("64765", "64766"), deterministicTestId.length === 0)))) {
      if (stryMutAct_9fa48("64767")) {
        {}
      } else {
        stryCov_9fa48("64767");
        throw new Error(stryMutAct_9fa48("64768") ? "" : (stryCov_9fa48("64768"), 'deterministicTestId is required and must be a non-empty string'));
      }
    }
    const updated = Object.freeze(stryMutAct_9fa48("64769") ? {} : (stryCov_9fa48("64769"), {
      ...existing,
      deterministicTestId,
      status: FAILURE_CLASS_STATUS.REPRODUCED
    }));
    registry.set(failureClassId, updated);
    return updated;
  }
}

/**
 * Marks a failure class as closed. The class must exist and be in
 * 'reproduced' status (a deterministic test ID must be present).
 *
 * @param {string} failureClassId
 * @return {Object} the updated frozen entry
 */
function markClosed(failureClassId) {
  if (stryMutAct_9fa48("64770")) {
    {}
  } else {
    stryCov_9fa48("64770");
    const existing = registry.get(failureClassId);
    if (stryMutAct_9fa48("64773") ? false : stryMutAct_9fa48("64772") ? true : stryMutAct_9fa48("64771") ? existing : (stryCov_9fa48("64771", "64772", "64773"), !existing)) {
      if (stryMutAct_9fa48("64774")) {
        {}
      } else {
        stryCov_9fa48("64774");
        throw new Error(stryMutAct_9fa48("64775") ? `` : (stryCov_9fa48("64775"), `Failure class not found: ${String(failureClassId)}`));
      }
    }
    if (stryMutAct_9fa48("64778") ? existing.status === FAILURE_CLASS_STATUS.REPRODUCED : stryMutAct_9fa48("64777") ? false : stryMutAct_9fa48("64776") ? true : (stryCov_9fa48("64776", "64777", "64778"), existing.status !== FAILURE_CLASS_STATUS.REPRODUCED)) {
      if (stryMutAct_9fa48("64779")) {
        {}
      } else {
        stryCov_9fa48("64779");
        throw new Error(stryMutAct_9fa48("64780") ? "" : (stryCov_9fa48("64780"), 'Cannot close a failure class that is not in reproduced status'));
      }
    }
    const updated = Object.freeze(stryMutAct_9fa48("64781") ? {} : (stryCov_9fa48("64781"), {
      ...existing,
      status: FAILURE_CLASS_STATUS.CLOSED
    }));
    registry.set(failureClassId, updated);
    return updated;
  }
}

/**
 * Validates whether a failure class has sufficient closure evidence.
 * A class has valid closure evidence when a deterministic test ID is
 * present and the status is REPRODUCED or CLOSED. Harness-only
 * evidence (no deterministic test ID) is explicitly disallowed.
 *
 * @param {string} failureClassId
 * @return {{valid: boolean, reason: string, failureClassId: string}}
 */
function validateClosureEvidence(failureClassId) {
  if (stryMutAct_9fa48("64782")) {
    {}
  } else {
    stryCov_9fa48("64782");
    const entry = getFailureClass(failureClassId);
    if (stryMutAct_9fa48("64785") ? false : stryMutAct_9fa48("64784") ? true : stryMutAct_9fa48("64783") ? entry : (stryCov_9fa48("64783", "64784", "64785"), !entry)) {
      if (stryMutAct_9fa48("64786")) {
        {}
      } else {
        stryCov_9fa48("64786");
        return Object.freeze(stryMutAct_9fa48("64787") ? {} : (stryCov_9fa48("64787"), {
          valid: stryMutAct_9fa48("64788") ? true : (stryCov_9fa48("64788"), false),
          reason: CLOSURE_VALIDATION_REASON.UNKNOWN_FAILURE_CLASS,
          failureClassId: String(failureClassId)
        }));
      }
    }
    if (stryMutAct_9fa48("64791") ? false : stryMutAct_9fa48("64790") ? true : stryMutAct_9fa48("64789") ? entry.deterministicTestId : (stryCov_9fa48("64789", "64790", "64791"), !entry.deterministicTestId)) {
      if (stryMutAct_9fa48("64792")) {
        {}
      } else {
        stryCov_9fa48("64792");
        const reason = (stryMutAct_9fa48("64795") ? entry.status !== FAILURE_CLASS_STATUS.OPEN : stryMutAct_9fa48("64794") ? false : stryMutAct_9fa48("64793") ? true : (stryCov_9fa48("64793", "64794", "64795"), entry.status === FAILURE_CLASS_STATUS.OPEN)) ? CLOSURE_VALIDATION_REASON.HARNESS_ONLY_EVIDENCE : CLOSURE_VALIDATION_REASON.MISSING_DETERMINISTIC_REPRO;
        return Object.freeze(stryMutAct_9fa48("64796") ? {} : (stryCov_9fa48("64796"), {
          valid: stryMutAct_9fa48("64797") ? true : (stryCov_9fa48("64797"), false),
          reason,
          failureClassId: entry.failureClassId
        }));
      }
    }
    if (stryMutAct_9fa48("64800") ? entry.status === FAILURE_CLASS_STATUS.REPRODUCED && entry.status === FAILURE_CLASS_STATUS.CLOSED : stryMutAct_9fa48("64799") ? false : stryMutAct_9fa48("64798") ? true : (stryCov_9fa48("64798", "64799", "64800"), (stryMutAct_9fa48("64802") ? entry.status !== FAILURE_CLASS_STATUS.REPRODUCED : stryMutAct_9fa48("64801") ? false : (stryCov_9fa48("64801", "64802"), entry.status === FAILURE_CLASS_STATUS.REPRODUCED)) || (stryMutAct_9fa48("64804") ? entry.status !== FAILURE_CLASS_STATUS.CLOSED : stryMutAct_9fa48("64803") ? false : (stryCov_9fa48("64803", "64804"), entry.status === FAILURE_CLASS_STATUS.CLOSED)))) {
      if (stryMutAct_9fa48("64805")) {
        {}
      } else {
        stryCov_9fa48("64805");
        return Object.freeze(stryMutAct_9fa48("64806") ? {} : (stryCov_9fa48("64806"), {
          valid: stryMutAct_9fa48("64807") ? false : (stryCov_9fa48("64807"), true),
          reason: CLOSURE_VALIDATION_REASON.VALID,
          failureClassId: entry.failureClassId
        }));
      }
    }
    return Object.freeze(stryMutAct_9fa48("64808") ? {} : (stryCov_9fa48("64808"), {
      valid: stryMutAct_9fa48("64809") ? true : (stryCov_9fa48("64809"), false),
      reason: CLOSURE_VALIDATION_REASON.MISSING_DETERMINISTIC_REPRO,
      failureClassId: entry.failureClassId
    }));
  }
}

/**
 * Clears all entries from the registry.
 * Intended for test isolation only.
 */
function clearRegistry() {
  if (stryMutAct_9fa48("64810")) {
    {}
  } else {
    stryCov_9fa48("64810");
    registry.clear();
  }
}
export { clearRegistry, getFailureClass, getOpenFailureClasses, markClosed, markReproduced, registerFailureClass, validateClosureEvidence };