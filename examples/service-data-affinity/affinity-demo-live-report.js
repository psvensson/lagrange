import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const REPORT_DIR = 'test-output/reports';
const LIVE_SCENARIO = 'movielens-lagrange-service-affinity-live';

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
        current: {passed, verdict: passed ? 'PASS' : 'FAIL'},
        detail: {
          result,
          preloadAdmission:
            result?.preloadAdmission ||
            phaseEvidence?.preloadAdmission ||
            error?.preloadAdmission ||
            {admitted: false, state: 'not_observed'},
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
