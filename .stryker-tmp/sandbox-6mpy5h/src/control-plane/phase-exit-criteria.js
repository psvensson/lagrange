/**
 * Phase exit criteria evaluation for control-plane migration.
 *
 * Evaluates measurable exit gates per migration phase and produces
 * typed results with rollback notes. Each phase has a set of gates
 * that must all pass for the phase to be considered complete.
 *
 * Requirements: 10.1, 10.2 (Requirement 10)
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
import { MIGRATION_PHASE_ORDER, PHASE_EXIT_GATES, PHASE_ROLLBACK_NOTES, PHASE_STATUS } from './phase-exit-constants.js';

/**
 * Build a frozen gate result from evaluation inputs.
 *
 * @param {Object} options
 * @param {string} options.gateId - One of EXIT_GATE values.
 * @param {boolean} options.passed - Whether the gate is satisfied.
 * @param {string} [options.detail] - Optional diagnostic detail.
 * @return {Object} Frozen gate result.
 */
function buildGateResult(options) {
  if (stryMutAct_9fa48("69976")) {
    {}
  } else {
    stryCov_9fa48("69976");
    return Object.freeze(stryMutAct_9fa48("69977") ? {} : (stryCov_9fa48("69977"), {
      gateId: options.gateId,
      passed: stryMutAct_9fa48("69980") ? options.passed !== true : stryMutAct_9fa48("69979") ? false : stryMutAct_9fa48("69978") ? true : (stryCov_9fa48("69978", "69979", "69980"), options.passed === (stryMutAct_9fa48("69981") ? false : (stryCov_9fa48("69981"), true))),
      detail: (stryMutAct_9fa48("69984") ? typeof options.detail !== 'string' : stryMutAct_9fa48("69983") ? false : stryMutAct_9fa48("69982") ? true : (stryCov_9fa48("69982", "69983", "69984"), typeof options.detail === (stryMutAct_9fa48("69985") ? "" : (stryCov_9fa48("69985"), 'string')))) ? options.detail : null
    }));
  }
}

/**
 * Evaluate exit gates for a single migration phase.
 *
 * The gateResults map provides the pass/fail status for each gate
 * ID. Gates not present in the map are treated as not satisfied.
 *
 * @param {string} phaseId - One of MIGRATION_PHASE values.
 * @param {Map<string, {passed: boolean, detail?: string}>} gateResults
 *   Map from gate ID to evaluation result.
 * @return {Object} Frozen phase evaluation result with shape:
 *   {phaseId, status, gates, rollbackNotes}
 */
function evaluatePhase(phaseId, gateResults) {
  if (stryMutAct_9fa48("69986")) {
    {}
  } else {
    stryCov_9fa48("69986");
    const gates = PHASE_EXIT_GATES[phaseId];
    if (stryMutAct_9fa48("69989") ? false : stryMutAct_9fa48("69988") ? true : stryMutAct_9fa48("69987") ? gates : (stryCov_9fa48("69987", "69988", "69989"), !gates)) {
      if (stryMutAct_9fa48("69990")) {
        {}
      } else {
        stryCov_9fa48("69990");
        return Object.freeze(stryMutAct_9fa48("69991") ? {} : (stryCov_9fa48("69991"), {
          phaseId: String(phaseId),
          status: PHASE_STATUS.UNKNOWN_PHASE,
          gates: Object.freeze(stryMutAct_9fa48("69992") ? ["Stryker was here"] : (stryCov_9fa48("69992"), [])),
          rollbackNotes: null
        }));
      }
    }
    const resultMap = gateResults instanceof Map ? gateResults : new Map();
    const evaluatedGates = stryMutAct_9fa48("69993") ? ["Stryker was here"] : (stryCov_9fa48("69993"), []);
    let allPassed = stryMutAct_9fa48("69994") ? false : (stryCov_9fa48("69994"), true);
    for (const gateDef of gates) {
      if (stryMutAct_9fa48("69995")) {
        {}
      } else {
        stryCov_9fa48("69995");
        const result = resultMap.get(gateDef.gateId);
        const passed = stryMutAct_9fa48("69998") ? result?.passed !== true : stryMutAct_9fa48("69997") ? false : stryMutAct_9fa48("69996") ? true : (stryCov_9fa48("69996", "69997", "69998"), (stryMutAct_9fa48("69999") ? result.passed : (stryCov_9fa48("69999"), result?.passed)) === (stryMutAct_9fa48("70000") ? false : (stryCov_9fa48("70000"), true)));
        if (stryMutAct_9fa48("70003") ? false : stryMutAct_9fa48("70002") ? true : stryMutAct_9fa48("70001") ? passed : (stryCov_9fa48("70001", "70002", "70003"), !passed)) {
          if (stryMutAct_9fa48("70004")) {
            {}
          } else {
            stryCov_9fa48("70004");
            allPassed = stryMutAct_9fa48("70005") ? true : (stryCov_9fa48("70005"), false);
          }
        }
        evaluatedGates.push(buildGateResult(stryMutAct_9fa48("70006") ? {} : (stryCov_9fa48("70006"), {
          gateId: gateDef.gateId,
          passed,
          detail: stryMutAct_9fa48("70007") ? result.detail : (stryCov_9fa48("70007"), result?.detail)
        })));
      }
    }
    const rollback = stryMutAct_9fa48("70010") ? PHASE_ROLLBACK_NOTES[phaseId] && null : stryMutAct_9fa48("70009") ? false : stryMutAct_9fa48("70008") ? true : (stryCov_9fa48("70008", "70009", "70010"), PHASE_ROLLBACK_NOTES[phaseId] || null);
    return Object.freeze(stryMutAct_9fa48("70011") ? {} : (stryCov_9fa48("70011"), {
      phaseId,
      status: allPassed ? PHASE_STATUS.PASSED : PHASE_STATUS.FAILED,
      gates: Object.freeze(evaluatedGates),
      rollbackNotes: rollback
    }));
  }
}

/**
 * Evaluate exit gates for all migration phases in order.
 *
 * @param {Map<string, {passed: boolean, detail?: string}>} gateResults
 *   Map from gate ID to evaluation result covering all phases.
 * @return {Object} Frozen summary with shape:
 *   {phases, totalPhases, passedPhases, failedPhases}
 */
function evaluateAllPhases(gateResults) {
  if (stryMutAct_9fa48("70012")) {
    {}
  } else {
    stryCov_9fa48("70012");
    const resultMap = gateResults instanceof Map ? gateResults : new Map();
    const phases = stryMutAct_9fa48("70013") ? ["Stryker was here"] : (stryCov_9fa48("70013"), []);
    let passedPhases = 0;
    let failedPhases = 0;
    for (const phaseId of MIGRATION_PHASE_ORDER) {
      if (stryMutAct_9fa48("70014")) {
        {}
      } else {
        stryCov_9fa48("70014");
        const result = evaluatePhase(phaseId, resultMap);
        phases.push(result);
        if (stryMutAct_9fa48("70017") ? result.status !== PHASE_STATUS.PASSED : stryMutAct_9fa48("70016") ? false : stryMutAct_9fa48("70015") ? true : (stryCov_9fa48("70015", "70016", "70017"), result.status === PHASE_STATUS.PASSED)) {
          if (stryMutAct_9fa48("70018")) {
            {}
          } else {
            stryCov_9fa48("70018");
            stryMutAct_9fa48("70019") ? passedPhases-- : (stryCov_9fa48("70019"), passedPhases++);
          }
        } else {
          if (stryMutAct_9fa48("70020")) {
            {}
          } else {
            stryCov_9fa48("70020");
            stryMutAct_9fa48("70021") ? failedPhases-- : (stryCov_9fa48("70021"), failedPhases++);
          }
        }
      }
    }
    return Object.freeze(stryMutAct_9fa48("70022") ? {} : (stryCov_9fa48("70022"), {
      phases: Object.freeze(phases),
      totalPhases: MIGRATION_PHASE_ORDER.length,
      passedPhases,
      failedPhases
    }));
  }
}

/**
 * Get the exit gate definitions for a specific phase.
 *
 * @param {string} phaseId - One of MIGRATION_PHASE values.
 * @return {ReadonlyArray<Object>|null} Gate definitions or null.
 */
function getPhaseGates(phaseId) {
  if (stryMutAct_9fa48("70023")) {
    {}
  } else {
    stryCov_9fa48("70023");
    return stryMutAct_9fa48("70026") ? PHASE_EXIT_GATES[phaseId] && null : stryMutAct_9fa48("70025") ? false : stryMutAct_9fa48("70024") ? true : (stryCov_9fa48("70024", "70025", "70026"), PHASE_EXIT_GATES[phaseId] || null);
  }
}

/**
 * Get the rollback notes for a specific phase.
 *
 * @param {string} phaseId - One of MIGRATION_PHASE values.
 * @return {Object|null} Rollback notes or null.
 */
function getPhaseRollbackNotes(phaseId) {
  if (stryMutAct_9fa48("70027")) {
    {}
  } else {
    stryCov_9fa48("70027");
    return stryMutAct_9fa48("70030") ? PHASE_ROLLBACK_NOTES[phaseId] && null : stryMutAct_9fa48("70029") ? false : stryMutAct_9fa48("70028") ? true : (stryCov_9fa48("70028", "70029", "70030"), PHASE_ROLLBACK_NOTES[phaseId] || null);
  }
}

/**
 * Get the ordered list of all migration phase IDs.
 *
 * @return {ReadonlyArray<string>} Phase IDs in migration order.
 */
function getMigrationPhaseOrder() {
  if (stryMutAct_9fa48("70031")) {
    {}
  } else {
    stryCov_9fa48("70031");
    return MIGRATION_PHASE_ORDER;
  }
}
export { buildGateResult, evaluateAllPhases, evaluatePhase, getMigrationPhaseOrder, getPhaseGates, getPhaseRollbackNotes };