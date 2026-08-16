#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTestFileSync} from './run-test-files.js';

const SCENARIO = 'readiness-planning-owner-boundary-atomic-closure';
const REPORT_DIRECTORY = 'test-output/reports';
const GUARD_FILES = Object.freeze([
  'test/diagnostics/event-loop-gap-watchdog.test.js',
  'test/workflow/owner-key-reconcile-queue.test.js',
  'test/workflow/owner-key-reconcile-queue-failure-atomicity.test.js',
  'test/control-plane/publication-readiness-churn-liveness.test.js',
  'test/control-plane/readiness-planning-publication-atomicity.test.js',
  'test/control-plane/control-plane-read-authority-token.test.js',
  'test/control-plane/control-plane-readiness-service-sync-and-priority-recovery.test.js',
  'test/control-plane/replica-dispatch-node-state-update-ready-node-retry-dispatch.test.js',
  'test/rebalancer/startup-authority-available-node-contract.test.js',
]);
const MODEL_REPORTS = Object.freeze([
  'versioned-readiness-planning-fixed.model.report.json',
  'versioned-readiness-planning-raw-event-mutant.model.report.json',
  'versioned-readiness-planning-recursion-mutant.model.report.json',
  'versioned-readiness-planning-stale-positive-mutant.model.report.json',
  'versioned-readiness-planning-undeclared-dependency-mutant.model.report.json',
  'versioned-readiness-planning-formation-priority-starvation-mutant.' +
    'model.report.json',
]);
const VERDICT_PASS = 'PASS';
const VERDICT_FAIL = 'FAIL';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readModelProofs() {
  return MODEL_REPORTS.map((file) => {
    const reportPath = path.join(root, REPORT_DIRECTORY, file);
    const report = fs.existsSync(reportPath) ?
      JSON.parse(fs.readFileSync(reportPath, 'utf8')) :
      null;
    return {
      file,
      expectationMet: report?.expectationMet === true,
      converged: report?.converged === true,
      expectedConverged: report?.expectConverged === true,
    };
  });
}

function main() {
  const guards = GUARD_FILES.map((file) => ({
    file,
    ...runTestFileSync(file, {print: false, timeoutMs: 300000}),
  }));
  const modelProofs = readModelProofs();
  const deterministicPassed =
    guards.every((guard) => guard.ok === true) &&
    modelProofs.every((proof) => proof.expectationMet === true);
  const timestamp = new Date().toISOString();
  const passed = false;
  const report = {
    timestamp,
    scenario: SCENARIO,
    producer: 'readiness-planning-owner-boundary-atomic-closure-proof',
    fidelity: 'deterministic-guard',
    summary: {total: 2, passed: deterministicPassed ? 1 : 0, failed: 1},
    optimizationSummary: {totalPriorityItems: 1},
    standardSummary: {
      scenarios: [{
        scenario: SCENARIO,
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
          modelProofs,
          liveProof: {passed: false, reason: 'live_gcp_proof_pending'},
        },
      }],
    },
  };
  const reportDir = path.join(root, REPORT_DIRECTORY);
  fs.mkdirSync(reportDir, {recursive: true});
  const stamp = timestamp.replace(/[:.]/g, '-');
  const reportPath = path.join(
    reportDir,
    `${SCENARIO}-${stamp}.report.json`,
  );
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${deterministicPassed ? VERDICT_PASS : VERDICT_FAIL} deterministic guard; ` +
    `live GCP proof pending\nreport: ${path.relative(root, reportPath)}\n`,
  );
  process.exitCode = deterministicPassed ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {main};
