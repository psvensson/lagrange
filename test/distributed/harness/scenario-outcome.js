/**
 * The terminal outcome of one distributed scenario, and of a run.
 *
 * Three outcomes, never collapsed into two:
 * - passed: the scenario ran and every gate held;
 * - failed: the scenario ran (or tried to) and did not hold;
 * - refused: the scenario was NOT RUN because the config's declared host
 *   topology cannot carry its claim (scenario-host-topology.js). Owner
 *   ruling 2026-10-04: "Insufficient topology is REFUSED/NOT-RUN, never
 *   PASS and never certification evidence."
 *
 * A refused result keeps `passed: false` so every reader that only knows
 * pass/fail treats it as not passed (fail closed), and carries
 * `outcome: 'refused'` plus the named `refusal` so every reader that knows
 * outcomes shows it as distinct from a failure. The runner's exit status
 * is FAILURE when anything failed, else REFUSED (a distinct non-zero code)
 * when anything was refused, else SUCCESS - a refused run never exits 0.
 */

import {EXIT_CODES} from './constants.js';

const SCENARIO_OUTCOME = Object.freeze({
  FAILED: 'failed',
  PASSED: 'passed',
  REFUSED: 'refused',
});

const SCENARIO_RESULT_LABEL = Object.freeze({
  [SCENARIO_OUTCOME.FAILED]: '✗ FAIL',
  [SCENARIO_OUTCOME.PASSED]: '✓ PASS',
  [SCENARIO_OUTCOME.REFUSED]: '⊘ REFUSED (not run)',
});

/**
 * The human-readable refusal line.
 * @param {Object} refusal From evaluateScenarioTopologyRequirement.
 * @return {string}
 */
function describeScenarioRefusal(refusal) {
  const available = refusal.available === null ?
    `unknown (${(refusal.missingReasons || []).join(', ') || 'no topology'})` :
    String(refusal.available);
  return `${refusal.reason}: requires >= ${refusal.required} distinct ` +
    `host(s), config provides ${available}`;
}

/**
 * The result a refused scenario reports: not run, not passed, named.
 * @param {Object} refusal From evaluateScenarioTopologyRequirement.
 * @param {string} startedAt ISO time the runner considered it.
 * @return {Object}
 */
function buildRefusedScenarioResult(refusal, startedAt) {
  return {
    duration: 0,
    error: describeScenarioRefusal(refusal),
    outcome: SCENARIO_OUTCOME.REFUSED,
    passed: false,
    refusal: {...refusal},
    startedAt,
  };
}

/**
 * The outcome of one scenario result or report entry. An explicit
 * `outcome` wins; a legacy entry is passed only when `passed === true`.
 * @param {Object} entry
 * @return {string} One of SCENARIO_OUTCOME.
 */
function scenarioOutcomeOf(entry) {
  if (entry?.outcome === SCENARIO_OUTCOME.REFUSED ||
      (entry?.refusal && typeof entry.refusal === 'object')) {
    return SCENARIO_OUTCOME.REFUSED;
  }
  return entry?.passed === true ?
    SCENARIO_OUTCOME.PASSED :
    SCENARIO_OUTCOME.FAILED;
}

/**
 * The runner's exit status.
 * @param {{hasFailures: boolean, hasRefusals: boolean}} run
 * @return {number}
 */
function resolveRunExitCode({hasFailures, hasRefusals}) {
  if (hasFailures) {
    return EXIT_CODES.FAILURE;
  }
  return hasRefusals ? EXIT_CODES.REFUSED : EXIT_CODES.SUCCESS;
}

/**
 * The outcome a parent process reads from the runner's exit status (the
 * distributed matrix, the lab harness): 0 passed, REFUSED refused,
 * anything else - a signal, a crash, a failure - failed.
 * @param {number|null|undefined} exitCode
 * @return {string} One of SCENARIO_OUTCOME.
 */
function outcomeOfRunnerExit(exitCode) {
  if (exitCode === EXIT_CODES.SUCCESS) {
    return SCENARIO_OUTCOME.PASSED;
  }
  return exitCode === EXIT_CODES.REFUSED ?
    SCENARIO_OUTCOME.REFUSED :
    SCENARIO_OUTCOME.FAILED;
}

export {
  SCENARIO_OUTCOME,
  SCENARIO_RESULT_LABEL,
  buildRefusedScenarioResult,
  describeScenarioRefusal,
  outcomeOfRunnerExit,
  resolveRunExitCode,
  scenarioOutcomeOf,
};
