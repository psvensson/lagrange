/**
 * Phase exit criteria evaluation for control-plane migration.
 *
 * Evaluates measurable exit gates per migration phase and produces
 * typed results with rollback notes. Each phase has a set of gates
 * that must all pass for the phase to be considered complete.
 *
 * Requirements: 10.1, 10.2 (Requirement 10)
 */

import {
  MIGRATION_PHASE_ORDER,
  PHASE_EXIT_GATES,
  PHASE_ROLLBACK_NOTES,
  PHASE_STATUS,
} from './phase-exit-constants.js';

const LOCAL_STR_STRING = 'string';

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
  return Object.freeze({
    gateId: options.gateId,
    passed: options.passed === true,
    detail: typeof options.detail === LOCAL_STR_STRING ?
      options.detail :
      null,
  });
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
  const gates = PHASE_EXIT_GATES[phaseId];
  if (!gates) {
    return Object.freeze({
      phaseId: String(phaseId),
      status: PHASE_STATUS.UNKNOWN_PHASE,
      gates: Object.freeze([]),
      rollbackNotes: null,
    });
  }

  const resultMap = gateResults instanceof Map ?
    gateResults :
    new Map();

  const evaluatedGates = [];
  let allPassed = true;

  for (const gateDef of gates) {
    const result = resultMap.get(gateDef.gateId);
    const passed = result?.passed === true;
    if (!passed) {
      allPassed = false;
    }
    evaluatedGates.push(buildGateResult({
      gateId: gateDef.gateId,
      passed,
      detail: result?.detail,
    }));
  }

  const rollback = PHASE_ROLLBACK_NOTES[phaseId] || null;

  return Object.freeze({
    phaseId,
    status: allPassed ? PHASE_STATUS.PASSED : PHASE_STATUS.FAILED,
    gates: Object.freeze(evaluatedGates),
    rollbackNotes: rollback,
  });
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
  const resultMap = gateResults instanceof Map ?
    gateResults :
    new Map();

  const phases = [];
  let passedPhases = 0;
  let failedPhases = 0;

  for (const phaseId of MIGRATION_PHASE_ORDER) {
    const result = evaluatePhase(phaseId, resultMap);
    phases.push(result);
    if (result.status === PHASE_STATUS.PASSED) {
      passedPhases++;
    } else {
      failedPhases++;
    }
  }

  return Object.freeze({
    phases: Object.freeze(phases),
    totalPhases: MIGRATION_PHASE_ORDER.length,
    passedPhases,
    failedPhases,
  });
}

/**
 * Get the exit gate definitions for a specific phase.
 *
 * @param {string} phaseId - One of MIGRATION_PHASE values.
 * @return {ReadonlyArray<Object>|null} Gate definitions or null.
 */
function getPhaseGates(phaseId) {
  return PHASE_EXIT_GATES[phaseId] || null;
}

/**
 * Get the rollback notes for a specific phase.
 *
 * @param {string} phaseId - One of MIGRATION_PHASE values.
 * @return {Object|null} Rollback notes or null.
 */
function getPhaseRollbackNotes(phaseId) {
  return PHASE_ROLLBACK_NOTES[phaseId] || null;
}

/**
 * Get the ordered list of all migration phase IDs.
 *
 * @return {ReadonlyArray<string>} Phase IDs in migration order.
 */
function getMigrationPhaseOrder() {
  return MIGRATION_PHASE_ORDER;
}

export {
  buildGateResult,
  evaluateAllPhases,
  evaluatePhase,
  getMigrationPhaseOrder,
  getPhaseGates,
  getPhaseRollbackNotes,
};
