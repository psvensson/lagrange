#!/usr/bin/env node
/**
 * Receipt harness for consolidation-budget-check. Each claim is a named
 * scenario in test/scripts/apparatus-release-consolidation-budget.test.js.
 *
 * The quest adapts a script that is itself an epic's `doneWhen`, so the
 * receipts separate the two ways that can go wrong: the adaptation not
 * actually satisfying the checkers it was made for, the rows no longer
 * reading the tree, and a budget number moving while the other two look fine.
 */

import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'consolidation-budget-check';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const WITNESS_TEST =
  'test/scripts/apparatus-release-consolidation-budget.test.js';
const PATH_JOINER = '/';

const RECEIPT = Object.freeze([
  ['budget-script-passes-changed-path-guideline-checkers',
    '^the budget script passes the guideline checkers that scan it$',
    'the literal-owner audit, the ambient-intrinsic audit and eslint are run ' +
    'against this one path and report nothing, so the script is compliant ' +
    'on its own account rather than by inheriting a baseline'],
  ['fixture-tree-measures-every-budget-row',
    '^every budget row is measured from the tree it is given$',
    'the rows are measured against a tree that meets every budget and a tree ' +
    'that meets none; a row met in both would be reading a default instead ' +
    'of the tree, and is caught here rather than by the repository happening ' +
    'to be over budget'],
  ['budget-numbers-are-unchanged-by-the-adaptation',
    '^no budget number changed$',
    'each sealed threshold is restated independently of the script and ' +
    'compared by row name, so a number that drifts to meet the tree fails ' +
    'instead of passing quietly'],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testNamePattern, detail]) =>
    Object.freeze({id, testFile: WITNESS_TEST, testNamePattern, detail}))),
});
