#!/usr/bin/env node
// Evidence harness for quest content-bound-review-and-interaction-proof.
//
// Verifies that:
// 1. Post-review source mutation is refused by land.
// 2. Changes to proof inputs after review are refused by land.
// 3. A matching reviewed candidate is accepted by land.
// 4. Append-only review recording does not create a digest loop.
// 5. One-sided changes select paired interaction witness tests.
// 6. Incomplete registration fails closed even on single-file change.
// 7. Reused evidence requires matching witness digest or valid applicability.
// 8. Independent verification binding the candidate content is present.

import {runQuestEvidenceHarness} from './harness-runtime.js';
import {questState, readLog, readQuest, verdictOf} from '../solve/store.js';
import * as solveCommands from '../solve/commands.js';
import {VERDICT} from '../solve/schema.js';

const QUEST_ID = 'content-bound-review-and-interaction-proof';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const WITNESS_TEST = 'test/scripts/content-bound-review-and-interaction-proof.test.js';
const CHECK_VERIFICATION_FLAG = '--check-verification';
const VERIFIER_PREFIX = 'subagent:';

function checkVerification() {
  const root = process.cwd();
  const quest = readQuest(root, QUEST_ID);
  const state = questState(readLog(root, QUEST_ID));
  const last = state.lastVerification;
  const compute = solveCommands.computeCandidateDigest;
  const currentDigest = typeof compute === 'function' ? compute(root, quest) : null;
  const approved = state.attempts.length > 0 && last !== null &&
    state.verificationIsCurrent &&
    verdictOf(last) === VERDICT.APPROVE &&
    String(last.verifier || '').startsWith(VERIFIER_PREFIX) &&
    Boolean(last.candidateDigest) &&
    Boolean(currentDigest) &&
    last.candidateDigest === currentDigest;

  process.stdout.write(`${JSON.stringify({
    approved,
    verifier: last?.verifier ?? null,
    candidateDigest: last?.candidateDigest ?? null,
    currentDigest,
    current: state.verificationIsCurrent,
    attempts: state.attempts.length,
  })}\n`);
  process.exit(approved ? 0 : 1);
}

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  checkVerification();
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'reviewed-content-mutation-refused',
    testFile: WITNESS_TEST,
    testNamePattern: '^mutating a reviewed src/ file after note --verification --verdict approve is refused by land$',
    detail: 'A post-review modification to src/ causes land to refuse with a content-binding digest mismatch.',
  }),
  Object.freeze({
    id: 'proof-input-mutation-refused',
    testFile: WITNESS_TEST,
    testNamePattern: '^mutating a witness test, fixture, contract registry, or proof script after note --verification --verdict approve is refused by land$',
    detail: 'A post-review modification to proof inputs causes land to refuse with a content-binding digest mismatch.',
  }),
  Object.freeze({
    id: 'matching-candidate-accepted',
    testFile: WITNESS_TEST,
    testNamePattern: '^an unmutated candidate whose digest matches the review binding is accepted by land$',
    detail: 'An unmutated candidate matching the reviewed candidate digest is accepted by land.',
  }),
  Object.freeze({
    id: 'append-only-review-binding-stable',
    testFile: WITNESS_TEST,
    testNamePattern: '^appending the verification entry to log.ndjson does not invalidate the candidate digest$',
    detail: 'Appending the verification entry to log.ndjson and writing receipt.json does not alter the candidate digest.',
  }),
  Object.freeze({
    id: 'one-sided-interaction-witness-selected',
    testFile: WITNESS_TEST,
    testNamePattern: '^changing only the producer OR only the consumer of a registered coupled pair selects the paired witnessTests$',
    detail: 'Modifying either the producer or the consumer of a coupled pair selects its witness tests in proof cone.',
  }),
  Object.freeze({
    id: 'missing-registration-refused',
    testFile: WITNESS_TEST,
    testNamePattern: '^touching an endpoint of a coupled pair with missing witnessTests or incomplete contract edges fails closed even on a single-file change$',
    detail: 'Touching an endpoint of a coupled pair with missing registration fails closed even on a single-file change.',
  }),
  Object.freeze({
    id: 'evidence-reuse-applicability',
    testFile: WITNESS_TEST,
    testNamePattern: '^reusing a receipt whose testFileDigests or applicability record does not match the current witness file is refused, while a valid applicability record / matching digest is accepted$',
    detail: 'Receipt reuse with diverged witness files is refused without a valid applicability record, and accepted with one.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification binding the reviewed candidate, verified through the solve store owner.',
  }),
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts: RECEIPTS,
});
