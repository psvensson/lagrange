#!/usr/bin/env node
// TX1 (PR100 Leg A) receipts: each receipt re-runs the named revision-3
// witnesses of the participant transaction owner on the controllable consensus
// seam (test/partition/partition-transaction-replicated-apply-v3.test.js; the
// revision-2 file is superseded history). Every receipt names its exact
// expected test count, so a renamed or dropped witness cannot pass as a
// subset. The mapping is design-leg-a-v3-2026-10-10.md section 10.2. The
// receipt recovery-and-cdc-survive-deadline-and-crash is deliberately absent:
// no CDC cursor/retention witness exists, and a receipt bound only to the
// deadline/restart witnesses would go green without it. Receipts whose
// witnesses live in the query lane (S1, S2) stay red until that lane lands.
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'replicated-transaction-decision-and-apply';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const APPLY_TEST = 'test/partition/partition-transaction-replicated-apply-v3.test.js';
const PATH_JOINER = '/';
const witnesses = (names) => `^TX1 v3 (${names.join('|')}): .*$`;
const RECEIPT = Object.freeze([
  ['no-speculative-visibility-before-consensus', ['W1a', 'W5a', 'W5b'],
    'no staged row is readable before the decision applies; no SQLite transaction is open ' +
    'during ACTIVE; a request without a transactionId is never absorbed into a session'],
  ['replicated-prepare-committed-and-applied-on-every-replica',
    ['W1a', 'W1b', 'W12c', 'W11a', 'W11b', 'W11c'],
    'PREPARE is acknowledged only after its committed command applies on every replica, ' +
    'survives restart as a durable row, and answers UNKNOWN at the deadline or on leader loss'],
  ['commit-applies-operations-outcome-and-applied-index-atomically',
    ['W1b', 'W2a', 'W2b', 'W3a', 'W3b', 'W4', 'W6'],
    'the decision applies operations, outcome row, state and applied index in one ' +
    'application transaction; a planted failure inside it leaves nothing; refusals are ' +
    'identical on every replica; a single-replica storage failure records nothing'],
  ['duplicate-and-conflicting-decisions-idempotent-or-refused',
    ['W9', 'W12a', 'W12e', 'W10b'],
    'unbound or foreign-digest terminals are refused, a late PREPARE after a tombstone is ' +
    'refused terminal, entry keys and transaction identities never collide'],
  ['exact-participant-outcome-no-transaction-is-not-committed',
    ['W12b', 'W1b', 'seam S2'],
    'an outcome read answers UNKNOWN from absence or PREPARED and a terminal state only from ' +
    'its durable row; a NO_TRANSACTION commit miss is resolved by an outcome read'],
  ['immutable-coordinator-decision-before-fanout', ['seam S1'],
    'once COMMITTING, an exceeded budget never rolls a participant back (query lane)'],
  ['no-rollback-after-commit-decision-and-no-prepared-erasure',
    ['W9', 'W12d', 'seam S1'],
    'a bound ROLLBACK after COMMITTED cannot reverse it; the hold sweep keeps PREPARED; no ' +
    'timeout selects rollback after the decision'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, names, detail]) =>
    Object.freeze({id, testFile: APPLY_TEST, testNamePattern: witnesses(names),
      expectedTests: names.length, detail}))),
});
