#!/usr/bin/env node
/**
 * Receipt harness for proof-authority-integrity. Each receipt is one
 * adversarial falsifier class in test/scripts/proof-authority-falsifiers.test.js:
 * a defect is planted in an observed surface (or product source, or only in
 * the working tree) and the gate's verdict is proved red (or, for the working
 * tree, proved blind). The budget row falsifier_classes_unproven reads this
 * receipt: a class without a passing receipt here is unproven.
 */

import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'proof-authority-integrity';
// The receipt is not quest evidence: the sealed doneWhen is a budget-row
// script probe, so a closed quest keeps only its record and log (R20), while
// the row must still read a receipt bound to the witness bytes. It lives with
// the other gate manifests, like the import-graph seal.
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'test', 'manifests', 'proof-authority-falsifiers.receipt.json']);
const FALSIFIER_TEST = 'test/scripts/proof-authority-falsifiers.test.js';
const HOOK_TEST = 'test/scripts/pre-push-hook-control-flow.test.js';
const PATH_JOINER = '/';

const RECEIPT = Object.freeze([
  ['observed-file',
    '^observed-file: a defect in a fixture a test reads through fs is detected$',
    'a changed fixture file selects the test that reads it through fs and ' +
    'that test goes red'],
  ['observed-directory',
    '^observed-directory: a defect in a directory a test lists is detected$',
    'a file added under a directory a test lists selects that test and it ' +
    'goes red'],
  ['spawned-script',
    '^spawned-script: a defect in a script a test spawns by name is detected$',
    'a changed script a test names as a string literal selects that test ' +
    'and it goes red'],
  ['behavioural-source',
    '^behavioural-source: a defect in product source is detected$',
    'a mutated product module selects its subsystem witness and it goes red'],
  ['working-tree-not-proof',
    '^working-tree-not-proof: a defect that exists only in the working tree ' +
    'is invisible to the gate, and a committed one is not$',
    'the gate materialises the pushed sha: an uncommitted red is invisible, ' +
    'a committed red fails'],
  ['hook-materialises-pushed-sha',
    '^the hook hands the pushed commit to the materializer and runs no ' +
    'content stage itself$',
    'the real hook, with its stages stubbed, materialises exactly the pushed ' +
    'commit (peeled from a tag), forwards the ref lines, propagates the ' +
    'inner status, and inside a checkout refuses a HEAD that is not the push',
    HOOK_TEST],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testNamePattern, detail, file]) =>
    Object.freeze({
      id, testFile: file || FALSIFIER_TEST, testNamePattern, detail}))),
});
