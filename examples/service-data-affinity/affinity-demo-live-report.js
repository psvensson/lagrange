import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const REPORT_DIR = 'test-output/reports';
const LIVE_SCENARIO = 'movielens-lagrange-service-affinity-live';
const NOT_OBSERVED_ADMISSION = Object.freeze({
  admitted: false,
  state: 'not_observed',
});

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
  const passed = Boolean(result?.converged) && !error;
  // A FAILED run the host froze past the gap budget is non-measuring, not
  // red: stamp the shared verdict reason so the Solver invalidates the sample
  // instead of scoring it. A PASSED run is never invalidated by the budget —
  // mirroring the thermal rule (a green run counts even when the machine ends
  // hot): converging despite adverse scheduling is stronger evidence, not
  // weaker, and the harvested numbers stay in detail for attribution.
  const hostScheduling = phaseEvidence?.hostScheduling || null;
  const hostInvalid = hostScheduling?.exceeded === true && !passed;
  const current = {passed, verdict: passed ? 'PASS' : 'FAIL'};
  if (hostInvalid) {
    current.verdictReason = 'host_scheduling_gap_budget_exceeded';
  }
  return {
    timestamp,
    scenario: LIVE_SCENARIO,
    producer: 'service-data-affinity-demo',
    fidelity: 'live',
    summary: {
      total: 1,
      passed: passed ? 1 : 0,
      failed: passed ? 0 : 1,
    },
    optimizationSummary: {totalPriorityItems: passed ? 0 : 1},
    standardSummary: {
      scenarios: [{
        scenario: LIVE_SCENARIO,
        passed,
        current,
        detail: {
          result,
          schemaAdmission:
            result?.schemaAdmission ||
            phaseEvidence?.schemaAdmission ||
            error?.schemaAdmission ||
            NOT_OBSERVED_ADMISSION,
          preloadAdmission:
            result?.preloadAdmission ||
            phaseEvidence?.preloadAdmission ||
            error?.preloadAdmission ||
            NOT_OBSERVED_ADMISSION,
          hostScheduling,
          error: error?.message || null,
        },
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
    `${LIVE_SCENARIO}-${fileStamp}.report.json`,
  );
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Live demo report: ${reportPath}`);
  return reportPath;
}

export {
  LIVE_SCENARIO,
  buildAffinityDemoLiveReport,
  writeAffinityDemoLiveReport,
};
