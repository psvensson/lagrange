#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'canary-proof-reuse';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const DECISION_TEST = 'test/scripts/canary-corpus-needed.test.js';
const GATE_TEST = 'test/scripts/push-gate-change-proof.test.js';
const WORKFLOW_TEST = 'test/config/full-corpus-canary-workflow.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['receipt-skips-the-corpus', DECISION_TEST,
    '^a durable receipt for this sha skips the corpus when no scope exists$',
    'a whole-corpus receipt for the sha answers the canary even with no ' +
    'gate scope artifact'],
  ['recorded-receipt-reads-back', DECISION_TEST,
    '^a recorded whole-corpus receipt is what the canary reads back$',
    'a receipt the authority really recorded flips the decision, and only ' +
    'for its own commit'],
  ['unproved-stays-owed', DECISION_TEST,
    '^the corpus stays owed without a proof, and when the lookup cannot answer$',
    'no proof, a throwing lookup or a non-boolean answer leaves the corpus owed'],
  ['gate-records-through-the-authority', GATE_TEST,
    '^a green whole-corpus run records a receipt through the authority CLI$',
    'the gate records the authority-owned contract for the proved sha'],
  ['recording-is-best-effort', GATE_TEST,
    '^recording is best effort: the gate never fails on bookkeeping$',
    'a refused or impossible recording never changes the gate verdict'],
  ['no-sibling-lends-a-corpus-receipt', DECISION_TEST,
    '^a whole-corpus receipt never answers for a sibling commit$',
    'a changelog-only commit does not inherit its parent receipt: the ' +
    'contract is exact-sha and publishes no identity ref'],
  ['no-identity-rung-for-the-corpus', DECISION_TEST,
    '^the corpus lookup never probes release-content identity$',
    'the exactness is per contract: the corpus asks only its own ref, the ' +
    'release contract still reaches for identity'],
  ['hand-dispatch-reproves', DECISION_TEST,
    '^a hand dispatch re-proves the corpus whatever the proofs say$',
    'an operator dispatching the canary is never answered with a receipt'],
  ['only-a-green-corpus-records', GATE_TEST,
    '^only a green whole-corpus run records, never a cone and never a red run$',
    'the recording seam itself is witnessed: a cone proof and a red corpus ' +
    'record nothing'],
  ['tree-must-be-the-commit', GATE_TEST,
    '^only a tree that is the commit may mint its receipt$',
    'a modified tree, another checkout or an unavailable git records nothing'],
  ['workflow-asks-the-owner', WORKFLOW_TEST,
    '^the canary asks the decision owner and runs the corpus only when it is owed$',
    'the workflow calls the witnessed owner and gates the corpus job on it'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
