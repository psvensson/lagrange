// Deterministic evidence harness for the node-shutdown-cell-worker-teardown
// quest: receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'cell-runtime-stop-all-terminates-workers',
    testFile: 'test/runtime/node-shutdown-cell-worker-teardown.test.js',
    detail: 'WasiComponentCellRuntime.shutdown terminates every live ' +
      'cell worker (red-on-revert: the subtests fail without the ' +
      'stop-all)',
  }),
  Object.freeze({
    id: 'wasm-driver-stop-all-clears-bookkeeping',
    testFile: 'test/runtime/node-shutdown-cell-worker-teardown.test.js',
    detail: 'WasmComponentDriver.shutdown stops the runtime and clears ' +
      'running/request-cell/replica-context bookkeeping',
  }),
  Object.freeze({
    id: 'lifecycle-shutdown-dispatches-exhaustively',
    testFile: 'test/runtime/node-shutdown-cell-worker-teardown.test.js',
    detail: 'ServiceRuntimeLifecycle.shutdown dispatches to drivers by ' +
      'capability and one failing driver does not block the rest',
  }),
  Object.freeze({
    id: 'seed-cleanup-wires-driver-teardown',
    testFile: 'test/runtime/node-shutdown-cell-worker-teardown.test.js',
    detail: 'seed cleanup shuts runtime drivers down before clearing ' +
      'the runtime service handler and tolerates a missing lifecycle',
  }),
  Object.freeze({
    id: 'join-cleanup-wires-driver-teardown',
    testFile: 'test/runtime/node-shutdown-cell-worker-teardown.test.js',
    detail: 'join cleanup shuts runtime drivers down ahead of the rpc ' +
      'and service-map teardown',
  }),
  Object.freeze({
    id: 'account-summary-runner-exits-naturally',
    command: 'node ' +
      'examples/call-binding-account-summary/run-call-binding-account-summary.js',
    timeoutMs: 240_000,
    detail: 'the account-summary example runner (forced managed split ' +
      'plus deployed request/call cells) exits naturally after ' +
      'graceful shutdown with the SHUTDOWN_BOUND_MS race and the ' +
      'explicit process.exit deleted',
  }),
]);

const QUEST_ID = 'node-shutdown-cell-worker-teardown';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'node-shutdown-cell-worker-teardown.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
