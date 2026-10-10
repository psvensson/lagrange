#!/usr/bin/env node
// TX1 (PR100 Leg A) receipts, design revision 4 (design-leg-a-v4-2026-10-10.md
// section 10.2). The eight sealed receipt ids are unchanged; the CDC receipt
// recovery-and-cdc-survive-deadline-and-crash stays deliberately absent (no CDC
// cursor/retention owner exists, and a receipt bound only to the deadline and
// restart witnesses would go green without it), so the probe cannot close
// without that owner or a seal supersession.
//
// Every receipt names its witnesses in the live witness file
// test/partition/partition-transaction-replicated-apply-v3.test.js with an
// exact expected count, so a renamed or dropped witness cannot pass as a
// subset. Receipts 2, 3 and 4 need the real three-replica rs-raft witnesses
// (PR100 A1-A5) as well as the controllable-port subset: they are shell
// receipts that run the subset with the same exact-count rule and then the
// real-backend file, which does not exist yet, so they stay red until it does.
// Receipts whose witnesses live in the query lane (seam S1-S8) stay red until
// that lane lands.
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'replicated-transaction-decision-and-apply';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const APPLY_TEST = 'test/partition/partition-transaction-replicated-apply-v3.test.js';
const THREE_REPLICA_TEST =
  'test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js';
const PATH_JOINER = '/';
const witnesses = (names) => `^TX1 v3 (${names.join('|')}): .*$`;
// The TAP summary lines a passing exact-count subset prints (the same rule
// as the harness's subtest receipts: exactly N selected, none failed,
// skipped or todo).
const SHELL_AND = ' && ';
const tapSummary = (count) => [`# tests ${count}`, '# fail 0', '# skipped 0', '# todo 0'];
function subsetCommand(names) {
  const run = `out=$(env -u NODE_TEST_CONTEXT ${process.execPath} --test-reporter=tap ` +
    `--test-name-pattern='${witnesses(names)}' ${APPLY_TEST} 2>&1)`;
  const checks = tapSummary(names.length)
    .map((line) => `printf '%s\\n' "$out" | grep -qx '${line}'`);
  return [run, ...checks].join(SHELL_AND);
}
const realBackendCommand = `npm run -s test:file -- ${THREE_REPLICA_TEST}`;
const RECEIPT = Object.freeze([
  ['no-speculative-visibility-before-consensus', ['W1a', 'W5a', 'W5b'], false,
    'no staged row is readable before the decision applies; no SQLite transaction is open ' +
    'during ACTIVE and reads replay over current committed state; a request without a ' +
    'transactionId is never absorbed into a session'],
  ['replicated-prepare-committed-and-applied-on-every-replica',
    ['W1a', 'W1b', 'W12c', 'W11a', 'W11b', 'W11c', 'W11d', 'W11e', 'W15'], true,
    'PREPARE is acknowledged only after its committed command applies on every replica, ' +
    'carries the BEGIN-time base, survives restart as a durable row, and answers UNKNOWN ' +
    'whenever it may still commit; plus the real three-replica A1-A3'],
  ['commit-applies-operations-outcome-and-applied-index-atomically',
    ['W1b', 'W2a', 'W2b', 'W3a', 'W3b', 'W3c', 'W4', 'W6', 'W6n', 'W13', 'W14'], true,
    'the decision applies operations, per-operation outcomes, the state transition and the ' +
    'applied index in one application transaction (observed at the applied-state write); ' +
    'refusals, including nondeterministic operations, are identical on every replica; the ' +
    'conflict base is the BEGIN-time write generation, immune to compaction; plus the real ' +
    'three-replica A5 crash boundaries'],
  ['duplicate-and-conflicting-decisions-idempotent-or-refused',
    ['W9', 'W12a', 'W12e', 'W10a', 'W10b', 'W10c', 'seam S5'], true,
    'unbound or foreign-digest terminals are refused, a late PREPARE after a tombstone is ' +
    'refused terminal, entry keys and random insert-once transaction identities never ' +
    'collide and travel on every request; plus the real three-replica A4'],
  ['exact-participant-outcome-no-transaction-is-not-committed',
    ['W12b', 'W1b', 'W11f', 'seam S2'], false,
    'an outcome read answers UNKNOWN from absence or PREPARED and a terminal state only from ' +
    'its durable row; a command that may still commit is answered UNKNOWN; a NO_TRANSACTION ' +
    'commit miss is resolved by an outcome read'],
  ['immutable-coordinator-decision-before-fanout',
    ['seam S1', 'seam S4b', 'seam S6', 'seam S7', 'seam S8'], false,
    'the decision is inserted once before fanout from retained PREPARE answers, transaction ' +
    'state is never silently unpersisted, single-participant transactions prepare first, ' +
    'concurrent recovery converges on one decision (query lane)'],
  ['no-rollback-after-commit-decision-and-no-prepared-erasure',
    ['W9', 'W12d', 'seam S1', 'seam S3', 'seam S4a'], false,
    'a bound ROLLBACK after COMMITTED cannot reverse it; the hold sweep keeps PREPARED; no ' +
    'timeout or commit failure selects rollback or FAILED after the decision, and recovery ' +
    'completes a decided transaction'],
]);
function receiptOf([id, names, needsRealBackend, detail]) {
  return Object.freeze(needsRealBackend ?
    {id, testFile: APPLY_TEST, detail,
      command: [subsetCommand(names), realBackendCommand].join(SHELL_AND)} :
    {id, testFile: APPLY_TEST, testNamePattern: witnesses(names),
      expectedTests: names.length, detail});
}
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(receiptOf)),
});
