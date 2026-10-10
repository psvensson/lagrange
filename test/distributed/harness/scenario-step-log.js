/**
 * A scenario's step log and gate records, written through the harness's
 * existing playback event stream (events.ndjson) - no new file format.
 *
 * Each named step records `scenario.step` with status `started`, then
 * `completed` or `failed` (with its duration and error). A failing step
 * also stamps the thrown error with `scenarioStep`, so the failure
 * bundle and triage summary can name the step instead of "unknown".
 * Every gate records `scenario.gate` with the facts it decided on.
 */

import {PLAYBACK_EVENT_TYPE} from './constants.js';
import {recordCertificationGate} from './scenario-certification.js';

const SCENARIO_STEP_STATUS = Object.freeze({
  COMPLETED: 'completed',
  FAILED: 'failed',
  STARTED: 'started',
});

function recordScenarioEvent(cluster, type, entityId, details) {
  if (typeof cluster?.recordScenarioEvent !== 'function') {
    return false;
  }
  return cluster.recordScenarioEvent(type, entityId, details) === true;
}

/**
 * Record one gate's structured record (pass or fail), in the playback
 * stream and on the run's certification ledger.
 * @param {Object} cluster
 * @param {Object} record From scenario-ground-truth buildGateRecord.
 * @return {boolean} Whether the cluster accepted the event.
 */
function recordScenarioGate(cluster, record) {
  recordCertificationGate(cluster, record);
  return recordScenarioEvent(
    cluster, PLAYBACK_EVENT_TYPE.SCENARIO_GATE, record.gate, record);
}

function stampFailedStep(error, scenarioName, step) {
  if (error && typeof error === 'object' && !error.scenarioStep) {
    try {
      error.scenarioStep = {scenarioName, step};
    } catch (_frozen) {
      // A frozen error keeps its own identity; the event still names it.
    }
  }
}

/**
 * Bind a step runner to one scenario run.
 * @param {Object} cluster
 * @param {string} scenarioName
 * @param {Function} [now] Clock seam (defaults to Date.now).
 * @return {Function} async (step, fn) => fn's result.
 */
function createScenarioStepRunner(cluster, scenarioName, now = Date.now) {
  return async function runScenarioStep(step, fn) {
    const startedAtMs = now();
    recordScenarioEvent(cluster, PLAYBACK_EVENT_TYPE.SCENARIO_STEP, step, {
      scenarioName,
      startedAtMs,
      status: SCENARIO_STEP_STATUS.STARTED,
      step,
    });
    try {
      const result = await fn();
      recordScenarioEvent(cluster, PLAYBACK_EVENT_TYPE.SCENARIO_STEP, step, {
        durationMs: now() - startedAtMs,
        scenarioName,
        startedAtMs,
        status: SCENARIO_STEP_STATUS.COMPLETED,
        step,
      });
      return result;
    } catch (error) {
      recordScenarioEvent(cluster, PLAYBACK_EVENT_TYPE.SCENARIO_STEP, step, {
        durationMs: now() - startedAtMs,
        error: String(error?.message || error),
        scenarioName,
        startedAtMs,
        status: SCENARIO_STEP_STATUS.FAILED,
        step,
      });
      stampFailedStep(error, scenarioName, step);
      throw error;
    }
  };
}

export {
  createScenarioStepRunner,
  recordScenarioGate,
};
