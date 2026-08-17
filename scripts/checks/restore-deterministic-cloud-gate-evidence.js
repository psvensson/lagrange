#!/usr/bin/env node
// Evidence harness for the restore-deterministic-cloud-gate Quest.
//
// The Quest's sealed doneWhen is a test-receipt probe: its metric is the
// number of required receipts that are missing or not passing. This harness
// produces that receipt by RE-RUNNING each proof, so the receipt can never
// drift from what the tree actually does — a hand-authored receipt, or one
// whose commands no longer exist, is a fail-closed non-measuring sample.
//
// One receipt per failure observed on b8cd88bd5, so "the gate is green" can
// never be mistaken for "every failure was understood": each former failure
// has to re-prove itself individually.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const RECEIPT_SCHEMA = 'test-receipt/1';
const QUEST_ID = 'restore-deterministic-cloud-gate';
const RECEIPT_PATH = `solve/evidence/${QUEST_ID}/receipt.json`;
const RUNNER = 'scripts/run-test-files.js';
const SERIAL_JOBS = '--jobs=1';
const UTF8 = 'utf8';
const STATUS_PASS = 'pass';
const STATUS_FAIL = 'fail';
const HOSTED_RECEIPT_ID = 'hosted-gate-repeatability';
const HOSTED_CHECK = 'node scripts/checks/hosted-gate-repeatability.js';
const HOSTED_CHECK_SCRIPT = 'scripts/checks/hosted-gate-repeatability.js';
const MARK_PASS = 'ok  ';
const MARK_FAIL = 'FAIL';
const PASSING_SUFFIX = 'passing\n';
const HOSTED_DEFAULT_DETAIL =
  'three complete GitHub-hosted gate passes on the exact published SHA';

// Ambient-intrinsic hardening (system-guidelines): capture at module load.
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const stringTrim = Function.call.bind(String.prototype.trim);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Each entry: the receipt id, the test file that re-proves it, and the exact
// claim that file's passing is evidence FOR.
const TEST_RECEIPTS = Object.freeze([
  ['check-operation-dispatch-completion-owner-determinism',
    'test/scripts/check-operation-dispatch-completion-owner.test.js',
    'the shifting subtest identity was the tap cap expiring mid-file, not a race'],
  ['impact-proof-cone-consumers-determinism',
    'test/scripts/impact-proof-cone-consumers.test.js',
    'the live-census selector agrees with the classifier under repeated runs'],
  ['cdc-current-epoch-propagation',
    'test/cdc/current-epoch-propagation.integration.test.js',
    'the integration-classified cdc test passes in its serial lane'],
  ['cli-service-init-wasm-scaffold',
    'test/cli/service-init-wasm-scaffold.test.js',
    'the wizer missing-directory cascade is gone once the 300s declaration is honoured'],
  ['dt6-cpu-saturation-missed-budget-spike',
    'test/convergence/dt6-cpu-saturation-missed-budget-spike.test.js',
    'the heaviest dt6 scenario completes within its declared watchdog'],
  ['dt6-rebalancer-timeout-detection-network',
    'test/convergence/dt6-rebalancer-timeout-detection-network.test.js',
    'virtual-clock detection assertions hold with an honest wall-clock watchdog'],
  ['dt6-rebalancer-timeout-orchestration-network',
    'test/convergence/dt6-rebalancer-timeout-orchestration-network.test.js',
    'virtual-time backoff assertions hold with an honest wall-clock watchdog'],
  ['minimal-deployment-request-cell-runtime-readiness',
    'test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js',
    'happy-path invocation no longer races a 100ms shared wall budget, while ' +
    'wall exhaustion is still proved by controlled delay'],
  ['service-cell-bridge-roundtrip',
    'test/runtime/service-cell-bridge-roundtrip.test.js',
    'component startup succeeds inside the serial toolchain lane'],
  ['service-cell-worker-modes',
    'test/runtime/service-cell-worker-modes.test.js',
    'request and call mode cells start within the product startup timeout'],
  ['service-cell-world-abi',
    'test/wasm-service/service-cell-world-abi.test.js',
    'the world ABI suite completes under its own declared timeout'],
  ['service-compiler-editor-typings',
    'test/service/service-compiler-editor-typings.test.js',
    'the folded TOOLCHAIN_TIMEOUT_MS * 2 declaration is honoured'],
  ['service-compiler-module-shape-spike',
    'test/wasm-service/service-compiler-module-shape-spike.test.js',
    'the module-shape spike completes under its own declared timeout'],
]);

function runTestFile(testFile) {
  const result = spawnSync(
    process.execPath, [RUNNER, SERIAL_JOBS, testFile],
    {cwd: root, encoding: UTF8},
  );
  return result.status === 0;
}

function runHostedCheck() {
  const result = spawnSync(
    process.execPath, [HOSTED_CHECK_SCRIPT],
    {cwd: root, encoding: UTF8},
  );
  return {passed: result.status === 0, detail: stringTrim(result.stdout || '')};
}

function main() {
  const receipts = [];
  for (const [id, testFile, detail] of TEST_RECEIPTS) {
    const passed = runTestFile(testFile);
    process.stdout.write(`${passed ? MARK_PASS : MARK_FAIL} ${id}\n`);
    receipts.push({
      command: `node ${RUNNER} ${SERIAL_JOBS} ${testFile}`,
      detail,
      id,
      passed,
    });
  }
  const hosted = runHostedCheck();
  process.stdout.write(
    `${hosted.passed ? MARK_PASS : MARK_FAIL} ${HOSTED_RECEIPT_ID}\n`);
  receipts.push({
    command: HOSTED_CHECK,
    detail: hosted.detail || HOSTED_DEFAULT_DETAIL,
    id: HOSTED_RECEIPT_ID,
    passed: hosted.passed,
  });

  const status = arrayEvery(receipts, (receipt) => receipt.passed) ?
    STATUS_PASS : STATUS_FAIL;
  const absolute = path.join(root, RECEIPT_PATH);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    quest: QUEST_ID,
    receipts,
    schema: RECEIPT_SCHEMA,
    status,
  }, null, 2)}\n`, UTF8);
  process.stdout.write(
    `wrote ${RECEIPT_PATH} — status ${status}, ` +
    `${arrayFilter(receipts, (r) => r.passed).length}/${receipts.length} ` +
    PASSING_SUFFIX);
}

main();
