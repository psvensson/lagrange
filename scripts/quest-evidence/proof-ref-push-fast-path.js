#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'proof-ref-push-fast-path';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const HOOK_TEST = 'test/scripts/pre-push-hook-control-flow.test.js';
const GATE_TEST = 'test/scripts/push-gate-change-proof.test.js';
const PUBLISH_TEST = 'test/scripts/publish-head-workspace-links.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['receipt-push-skips-the-gate', HOOK_TEST,
    '^a proof-receipt push of a commit already on main skips the gate entirely$',
    'a receipt ref for a commit already on origin/main materializes no tree ' +
    'and runs no content stage, so recording cannot re-enter the gate'],
  ['unproven-commit-still-gates', HOOK_TEST,
    '^a receipt for a commit that is NOT on main still gates$',
    'the exemption is the ancestor test, not the ref name'],
  ['receipt-cannot-exempt-a-branch', HOOK_TEST,
    '^a receipt pushed alongside a branch gates on the branch$',
    'one receipt among the ref lines cannot carry a source push past the gate'],
  ['gate-defers-an-unpublished-commit', GATE_TEST,
    '^an unpublished commit defers its receipt to the publisher$',
    'inside the gate the sha is not on origin/main yet, so the gate defers ' +
    'instead of pushing a receipt that would re-enter the gate'],
  ['publisher-records-what-the-gate-proved', PUBLISH_TEST,
    '^the publisher records the corpus receipt the gate proved$',
    'after the verified push the publisher records the gate run\'s own ' +
    'whole-corpus scope, bounded, and never for a cone or another sha'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
