import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildAffinityDemoReportError} from './affinity-demo-report-error.js';

const REPORT_DIR = 'test-output/reports';
const LIVE_SCENARIO = 'movielens-lagrange-service-affinity-live';
// A formation-only run (cluster formation and schema admission, nothing
// after) reports under its own scenario so the Solver's consecutive-run
// reading of the full certification scenario never mixes the two.
const FORMATION_ONLY_SCENARIO = 'movielens-lagrange-formation-only-live';
const NOT_OBSERVED_ADMISSION = Object.freeze({
  admitted: false,
  state: 'not_observed',
});

function firstObservedValue(...values) {
  return values.find((value) => value) || null;
}

function buildReportDetail(result, error, phaseEvidence, hostScheduling) {
  return {
    formation: phaseEvidence.formation || null,
    formationVerdict: phaseEvidence.formationVerdict || null,
    result: firstObservedValue(result, phaseEvidence.result),
    schemaAdmission: firstObservedValue(
      result?.schemaAdmission,
      phaseEvidence.schemaAdmission,
      error?.schemaAdmission,
      NOT_OBSERVED_ADMISSION,
    ),
    preloadAdmission: firstObservedValue(
      result?.preloadAdmission,
      phaseEvidence.preloadAdmission,
      error?.preloadAdmission,
      NOT_OBSERVED_ADMISSION,
    ),
    hostScheduling,
    ...buildAffinityDemoReportError(error),
  };
}

function buildReportOutcome(result, error, hostScheduling) {
  const passed = Boolean(result?.converged) && !error;
  const hostInvalid = hostScheduling?.exceeded === true && !passed;
  const current = {passed, verdict: passed ? 'PASS' : 'FAIL'};
  if (hostInvalid) {
    current.verdictReason = 'host_scheduling_gap_budget_exceeded';
  }
  return {current, passed};
}

function buildReportSummary(passed) {
  return {
    total: 1,
    passed: passed ? 1 : 0,
    failed: passed ? 0 : 1,
  };
}

/**
 * Build the live report without discarding evidence from phases that completed
 * before a later phase failed.
 *
 * @param {Object} options
 * @param {string} [options.timestamp]
 * @param {Object|null} [options.result]
 * @param {Error|null} [options.error]
 * @param {Object} [options.phaseEvidence]
 * @return {Object}
 */
function buildAffinityDemoLiveReport({
  timestamp = new Date().toISOString(),
  result = null,
  error = null,
  phaseEvidence = {},
} = {}) {
  // A FAILED run the host froze past the gap budget is non-measuring, not
  // red: stamp the shared verdict reason so the Solver invalidates the sample
  // instead of scoring it. A PASSED run is never invalidated by the budget -
  // mirroring the thermal rule (a green run counts even when the machine ends
  // hot): converging despite adverse scheduling is stronger evidence, not
  // weaker, and the harvested numbers stay in detail for attribution.
  const hostScheduling = phaseEvidence?.hostScheduling || null;
  const scenario = phaseEvidence?.formationOnly ?
    FORMATION_ONLY_SCENARIO : LIVE_SCENARIO;
  const {current, passed} = buildReportOutcome(
    result,
    error,
    hostScheduling,
  );
  return {
    timestamp,
    scenario,
    producer: 'service-data-affinity-demo',
    fidelity: 'live',
    summary: buildReportSummary(passed),
    optimizationSummary: {totalPriorityItems: passed ? 0 : 1},
    formationVerdict: phaseEvidence?.formationVerdict || null,
    standardSummary: {
      scenarios: [{
        scenario,
        passed,
        current,
        detail: buildReportDetail(
          result,
          error,
          phaseEvidence,
          hostScheduling,
        ),
      }],
    },
  };
}

/**
 * Persist one live report.
 * @param {Object|null} result
 * @param {Error|null} error
 * @param {Object} phaseEvidence
 * @return {Promise<string>}
 */
async function writeAffinityDemoLiveReport(
  result,
  error,
  phaseEvidence = {},
) {
  const report = buildAffinityDemoLiveReport({result, error, phaseEvidence});
  await mkdir(REPORT_DIR, {recursive: true});
  const fileStamp = report.timestamp.replace(/[:.]/g, '-');
  const reportPath = resolve(
    REPORT_DIR,
    `${report.scenario}-${fileStamp}.report.json`,
  );
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Live demo report: ${reportPath}`);
  return reportPath;
}

export {
  FORMATION_ONLY_SCENARIO,
  LIVE_SCENARIO,
  buildAffinityDemoLiveReport,
  writeAffinityDemoLiveReport,
};
