#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'code-navigability-budget-check';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const BUDGET_TEST = 'test/scripts/code-navigability-budget.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['budget-rows-measure-the-real-tree-within-caps', BUDGET_TEST,
    '^the real tree measures every row and every cap row is within its cap$',
    'the budget script run with --json on this checkout reports every sealed ' +
    'row in order, every cap row at or below its cap, every zero and census ' +
    'row as a count or null and met only at 0, and the unmet count as the ' +
    'last stdout line and the exit status'],
  ['fixture-tree-measures-every-row', BUDGET_TEST,
    '^every budget row is measured from the fixture tree it is given$',
    'a fixture tree meeting every row and one offending every row (each cap ' +
    'exceeded by one, the census present but incomplete) measure the exact ' +
    'value restated for every row, met and unmet respectively'],
  ['changed-path-guideline-checkers-pass', BUDGET_TEST,
    '^the budget script and the detector module pass the changed-path ' +
    'guideline checkers$',
    'the literals, ambient-intrinsics and decision-boundaries checkers find ' +
    'no raw violation in each scripts/checks/code-navigability-*.js file, ' +
    'and eslint passes on them'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
