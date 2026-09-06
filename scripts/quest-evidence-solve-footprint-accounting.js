#!/usr/bin/env node
/**
 * Receipt harness for solve-footprint-accounting. Each receipt runs one named
 * witness scenario over the real repository, so the reported byte counts are
 * the measured ones rather than fixtures.
 */

import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'solve-footprint-accounting';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const WITNESS_TEST = 'test/scripts/solve-footprint-accounting.test.js';
const PATH_JOINER = '/';

const RECEIPT_ID = Object.freeze({
  REPORTS: 'accounting-reports-total-history-and-active',
  OWNER: 'history-is-classified-by-the-quest-layout-owner',
  GATE: 'active-footprint-is-the-twenty-megabyte-gate',
  ADDS_UP: 'accounting-adds-up',
  NO_ESCAPE: 'only-canonical-quest-history-escapes-the-active-gate',
});
const SCENARIO = Object.freeze({
  REPORTS: '^the accounting reports total, append-only history and active bytes$',
  OWNER: '^history is whatever the quest-layout owner classifies, and only that$',
  GATE: '^the active footprint carries the 20 MB budget and meets it$',
  ADDS_UP: '^the accounting adds up$',
});
const DETAIL = Object.freeze({
  REPORTS: 'three byte counts are measured and reported, so the historical ' +
    'and live parts of solve/ are separately visible',
  OWNER: 'the size checker asks scripts/solve/store.js which paths are ' +
    'canonical append-only quest logs instead of restating the layout or ' +
    'subtracting a list of migrated files',
  GATE: 'the original 20 MB target is unchanged and now applies to the ' +
    'active footprint alone, which satisfies it',
  ADDS_UP: 'total equals active plus append-only history, proved by a ' +
    'residual row rather than asserted in prose',
  NO_ESCAPE: 'a file placed under a quest directory does not become history: ' +
    'only the canonical log escapes the active-footprint gate',
});

function scenarioReceipt(id, testNamePattern, detail) {
  return Object.freeze({id, testFile: WITNESS_TEST, testNamePattern, detail});
}

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze([
    scenarioReceipt(RECEIPT_ID.REPORTS, SCENARIO.REPORTS, DETAIL.REPORTS),
    scenarioReceipt(RECEIPT_ID.OWNER, SCENARIO.OWNER, DETAIL.OWNER),
    scenarioReceipt(RECEIPT_ID.GATE, SCENARIO.GATE, DETAIL.GATE),
    scenarioReceipt(RECEIPT_ID.ADDS_UP, SCENARIO.ADDS_UP, DETAIL.ADDS_UP),
    scenarioReceipt(RECEIPT_ID.NO_ESCAPE, SCENARIO.OWNER, DETAIL.NO_ESCAPE),
  ]),
});
