import fs from 'node:fs';
import path from 'node:path';

const REPORT_DIRECTORY = 'test-output/reports';
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';

// Shared report emitter for quest deterministic-guard harnesses: the guard
// suite result is advisory (PASS/FAIL on the process exit), while the
// scenario verdict stays FAIL with live_gcp_proof_pending until the sealed
// live proof exists — a guard harness never self-certifies a live bar.
export function emitDeterministicGuardReport({
  root,
  scenario,
  producer,
  guards,
  modelProofs = null,
  deterministicPassed,
}) {
  const timestamp = new Date().toISOString();
  const passed = false;
  const report = {
    timestamp,
    scenario,
    producer,
    fidelity: 'deterministic-guard',
    summary: {total: 2, passed: deterministicPassed ? 1 : 0, failed: 1},
    optimizationSummary: {totalPriorityItems: 1},
    standardSummary: {
      scenarios: [{
        scenario,
        passed,
        current: {
          passed,
          verdict: VERDICT_FAIL,
          verdictReason: deterministicPassed ?
            'live_gcp_proof_pending' :
            'deterministic_guard_failed',
        },
        detail: {
          deterministicPassed,
          guards: guards.map((guard) => ({
            file: guard.file,
            passed: guard.ok === true,
            assertions: guard.assertions,
            elapsedMs: guard.elapsedMs,
            reasons: guard.reasons,
            tapOutput: guard.output,
            stderrOutput: guard.stderr,
          })),
          ...(modelProofs ? {modelProofs} : {}),
          liveProof: {passed: false, reason: 'live_gcp_proof_pending'},
        },
      }],
    },
  };
  const reportDir = path.join(root, REPORT_DIRECTORY);
  fs.mkdirSync(reportDir, {recursive: true});
  const stamp = timestamp.replace(/[:.]/g, '-');
  const reportPath = path.join(reportDir, `${scenario}-${stamp}.report.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${deterministicPassed ? VERDICT_PASS : VERDICT_FAIL} deterministic ` +
    'guard; live GCP proof pending\nreport: ' +
    `${path.relative(root, reportPath)}\n`,
  );
  process.exitCode = deterministicPassed ? 0 : 1;
}
