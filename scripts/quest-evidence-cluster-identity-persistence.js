// Deterministic evidence harness for the cluster-identity-persistence-seam
// quest. Runs the focused red-on-revert regression suites for each sealed
// receipt and writes the test-receipt probe artifact
// (solve/evidence/cluster-identity-persistence-seam.receipt.json). Every
// receipt names the command that produced it and this harness re-runs those
// commands — a receipt whose command fails flips the file to status "fail"
// and the quest's doneWhen cannot close on it.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RECEIPT_SCHEMA = 'test-receipt/1';
const QUEST_ID = 'cluster-identity-persistence-seam';
const OUTPUT_FILE = path.join(
  'solve', 'evidence', 'cluster-identity-persistence-seam.receipt.json');
const TEST_RUNNER = ['run', 'test:file', '--'];
const NPM_EXECUTABLE = 'npm';
const CHILD_STDIO_PIPE = 'pipe';
const UTF8_ENCODING = 'utf8';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'cluster-identity-minted-once-at-first-seed-bootstrap',
    testFile: 'test/bootstrap/cluster-identity-mint.test.js',
    detail: 'first seed bootstrap mints a randomUUID CONFIG-row singleton ' +
      'and never re-mints over an existing identity',
  }),
  Object.freeze({
    id: 'cluster-identity-carried-in-rejoin-hints',
    testFile: 'test/bootstrap/cluster-identity.test.js',
    detail: 'both hints builders carry the identity and the persisted ' +
      'value is readable pre-hydration on restart',
  }),
  Object.freeze({
    id: 'cluster-identity-persisted-as-config-row',
    testFile: 'test/bootstrap/cluster-identity-mint.test.js',
    detail: 'the identity is written through the replicated CONFIG-row ' +
      'system table writer (EPOCH_CONFIG_KEY precedent)',
  }),
  Object.freeze({
    id: 'cluster-identity-threaded-into-snapshot-catchup',
    testFile: 'test/raft/snapshot-catchup-cluster-identity.test.js',
    detail: 'the snapshot-checkpoint seam reads the durable CONFIG-row ' +
      'identity, falling back to the pre-identity default only while none ' +
      'is visible',
  }),
  Object.freeze({
    id: 'cluster-identity-mismatch-fails-closed',
    testFile: 'test/bootstrap/cluster-identity.test.js',
    detail: 'a hints/expected cluster-id mismatch resolves to the typed ' +
      'fail-closed CLUSTER_ID_MISMATCH startup decision',
  }),
]);

function runReceipt(receipt) {
  const command = `npm ${TEST_RUNNER.join(' ')} ${receipt.testFile}`;
  try {
    execFileSync(NPM_EXECUTABLE, [...TEST_RUNNER, receipt.testFile], {
      stdio: CHILD_STDIO_PIPE,
      encoding: UTF8_ENCODING,
    });
    return {id: receipt.id, passed: true, command, detail: receipt.detail};
  } catch (error) {
    return {
      id: receipt.id,
      passed: false,
      command,
      detail: receipt.detail,
      failure: String(error?.stderr || error?.message || error),
    };
  }
}

function main() {
  const receipts = RECEIPTS.map(runReceipt);
  const status = receipts.every((r) => r.passed) ? 'pass' : 'fail';
  const payload = {
    schema: RECEIPT_SCHEMA,
    quest: QUEST_ID,
    status,
    generatedAt: new Date().toISOString(),
    receipts,
  };
  fs.mkdirSync(path.dirname(OUTPUT_FILE), {recursive: true});
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  const failed = receipts.filter((r) => !r.passed);
  for (const receipt of failed) {
    process.stderr.write(
      `FAIL ${receipt.id} (${receipt.command})\n${receipt.failure}\n`);
  }
  process.stdout.write(
    `${OUTPUT_FILE}: ${status} (${receipts.length - failed.length}/` +
    `${receipts.length} receipts passing)\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
