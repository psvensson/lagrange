#!/usr/bin/env node
// TX1 (PR100 Leg A) receipts, design revision 6 (design-leg-a-v6-2026-10-10.md
// section 10.2). The eight sealed receipt ids are unchanged; the CDC receipt
// recovery-and-cdc-survive-deadline-and-crash stays deliberately absent (no CDC
// cursor/retention owner exists, and a receipt bound only to the deadline and
// restart witnesses would go green without it), so the probe cannot close
// without that owner or a seal supersession.
//
// Every receipt names its witnesses with an exact expected count per file, so
// a renamed or dropped witness cannot pass as a subset:
// - the participant witnesses (controllable port);
// - the query-lane seam falsifiers;
// - the real three-replica rs-raft witnesses PR100 A1-A5, named now in a file
//   that does not exist yet, so receipts 2, 3 and 4 stay red until it does. The
//   names and exact counts bind which tests run; what A1-A5 actually prove rests
//   on independent verification (a file holding the five names with trivial
//   bodies would pass the real halves).
// A receipt drawing on one file is a subtest receipt (the harness's exact-count
// rule); a receipt drawing on several files is a shell receipt that applies the
// same rule (exactly N selected, none failed, skipped or todo) to each file.
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'replicated-transaction-decision-and-apply';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const PATH_JOINER = '/';
const PARTICIPANT = Object.freeze({file:
  'test/partition/partition-transaction-replicated-apply-v3.test.js', prefix: 'TX1 v3'});
const SEAM = Object.freeze({file: 'test/query/partition-transaction-seam-falsifiers.test.js',
  prefix: 'TX1 seam'});
const REAL = Object.freeze({file:
  'test/raft/raft-rs-backend/transaction-leg-a-three-replica.test.js', prefix: 'TX1'});
const pattern = (source, names) => `^${source.prefix} (${names.join('|')}): .*$`;
const SHELL_AND = ' && ';
const tapSummary = (count) => [`# tests ${count}`, '# fail 0', '# skipped 0', '# todo 0'];
function subsetCommand([source, names]) {
  const run = `out=$(env -u NODE_TEST_CONTEXT ${process.execPath} --test-reporter=tap ` +
    `--test-name-pattern='${pattern(source, names)}' ${source.file} 2>&1)`;
  const checks = tapSummary(names.length)
    .map((line) => `printf '%s\\n' "$out" | grep -qx '${line}'`);
  return [run, ...checks].join(SHELL_AND);
}
const RECEIPT = Object.freeze([
  ['no-speculative-visibility-before-consensus', [[PARTICIPANT, ['W1a', 'W5a', 'W5b']]],
    'no staged row is readable before the decision applies; no SQLite transaction is open ' +
    'during ACTIVE and reads replay over current committed state; a request without a ' +
    'transactionId is never absorbed into a session'],
  ['replicated-prepare-committed-and-applied-on-every-replica', [
    [PARTICIPANT, ['W1a', 'W1b', 'W12c', 'W11a', 'W11b', 'W11c', 'W11d', 'W11e', 'W15']],
    [REAL, ['A1', 'A2', 'A3']]],
  'PREPARE is acknowledged only after its committed command applies on every replica, ' +
    'carries the BEGIN-time base, survives restart as a durable row, and answers UNKNOWN ' +
    'whenever it may still commit; plus the real three-replica A1-A3'],
  ['commit-applies-operations-outcome-and-applied-index-atomically', [
    [PARTICIPANT, ['W1b', 'W2a', 'W2b', 'W2c', 'W3a', 'W3b', 'W3c', 'W4', 'W6', 'W6n', 'W6s',
      'W13', 'W14', 'W17', 'W18', 'W19']],
    [REAL, ['A5']]],
  'the decision applies operations, per-operation outcomes, the state transition, the write ' +
    'generation and the applied index in one application transaction; committed PREPAREs ' +
    'apply as carried; the staging classifier admits only allow-listed programs over the ' +
    'partition table and proves itself at leader start; control rows, a reserved schema ' +
    'change and a zero-operation decision never move the generation; plus the real A5 ' +
    'crash boundaries'],
  ['duplicate-and-conflicting-decisions-idempotent-or-refused', [
    [PARTICIPANT, ['W9', 'W12a', 'W12e', 'W10b']],
    [SEAM, ['W10a', 'W10c', 'S5']],
    [REAL, ['A4']]],
  'unbound or foreign-digest terminals are refused, a late PREPARE after a tombstone is ' +
    'refused terminal, entry keys and random insert-once transaction identities never ' +
    'collide and travel on every request; plus the real A4'],
  ['exact-participant-outcome-no-transaction-is-not-committed', [
    [PARTICIPANT, ['W12b', 'W1b', 'W11f', 'W11e-ord', 'W11f-ord']],
    [SEAM, ['S2']]],
  'an outcome read answers UNKNOWN from absence or PREPARED and a terminal state only from ' +
    'its durable row; a write that may still commit is answered UNKNOWN by the write kernel; ' +
    'a NO_TRANSACTION commit miss is resolved by an outcome read'],
  ['immutable-coordinator-decision-before-fanout', [[SEAM, ['S1', 'S4b', 'S4c', 'S6', 'S7',
    'S8']]],
  'the decision is inserted once before fanout from retained PREPARE answers, transaction ' +
    'state is never silently unpersisted (the migration cutover included), single-participant transactions prepare first, ' +
    'concurrent recovery converges on one decision (query lane)'],
  ['no-rollback-after-commit-decision-and-no-prepared-erasure', [
    [PARTICIPANT, ['W9', 'W12d', 'W17']],
    [SEAM, ['S1', 'S3', 'S4a']]],
  'a bound ROLLBACK after COMMITTED cannot reverse it; the hold sweep keeps PREPARED; foreign ' +
    'control rows never refuse a decided COMMIT; no timeout or commit failure selects ' +
    'rollback or FAILED after the decision, and recovery completes a decided transaction'],
]);
function receiptOf([id, parts, detail]) {
  if (parts.length === 1) {
    const [[source, names]] = parts;
    return Object.freeze({id, testFile: source.file, testNamePattern: pattern(source, names),
      expectedTests: names.length, detail});
  }
  return Object.freeze({id, testFile: parts[0][0].file, detail,
    command: parts.map(subsetCommand).join(SHELL_AND)});
}
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(receiptOf)),
});
