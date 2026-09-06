#!/usr/bin/env node
/**
 * Receipt harness for closed-quest-shape-amendment. Each receipt runs one
 * named falsifier of the minimal-terminal-proof shape over a fixture
 * repository, so a green receipt means that scenario exits zero.
 */

import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'closed-quest-shape-amendment';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const WITNESS_TEST = 'test/scripts/closed-quest-shape.test.js';
const PATH_JOINER = '/';

const RECEIPT_ID = Object.freeze({
  ORDINARY: 'ordinary-closed-quest-holds-only-record-and-log',
  RECEIPT: 'sealed-receipt-survives-closure',
  ORACLE: 'sealed-oracle-survives-closure',
  UNRELATED: 'unrelated-file-in-a-closed-quest-is-rejected',
  UNREFERENCED: 'unreferenced-proof-shaped-file-is-rejected',
  DELETED: 'deleting-a-required-artifact-invalidates-closure',
  MODIFIED: 'modifying-a-required-artifact-invalidates-closure',
  PROSE: 'prose-cannot-legalize-an-artifact',
});
const SCENARIO = Object.freeze({
  ORDINARY: '^an ordinary closed quest holds only its record and log$',
  RECEIPT: '^a sealed receipt survives closure$',
  ORACLE: '^a sealed oracle survives closure$',
  UNRELATED: '^an unrelated file in a closed quest is rejected$',
  UNREFERENCED: '^an unreferenced proof-shaped file is rejected$',
  DELETED: '^deleting a required artifact invalidates closure$',
  MODIFIED: '^modifying a required artifact after closure invalidates closure$',
  PROSE: '^prose naming an artifact cannot legalize it$',
});
const DETAIL = Object.freeze({
  ORDINARY: 'a quest whose sealed claim needs no artifact keeps exactly its ' +
    'record and its log',
  RECEIPT: 'a sealed test-receipt claim keeps the receipt it cites, so the ' +
    'terminal proof stays reproducible after closure',
  ORACLE: 'a sealed oracle claim keeps the oracle it cites, for the same reason',
  UNRELATED: 'an incidental file is rejected: closure is not a licence to ' +
    'accumulate',
  UNREFERENCED: 'a file that merely looks like proof, but that no sealed ' +
    'claim requires, is rejected',
  DELETED: 'removing the artifact the terminal claim rests on breaks the ' +
    'closure rather than tidying it',
  MODIFIED: 'rewriting retained proof breaks the closure too, so the ' +
    'amendment cannot make deletion illegal while leaving mutation free',
  PROSE: 'naming a filename in the log or the record grants it nothing: the ' +
    'requirement is derived structurally from the sealed doneWhen by the ' +
    'probe owner',
});

function scenarioReceipt(id, testNamePattern, detail) {
  return Object.freeze({id, testFile: WITNESS_TEST, testNamePattern, detail});
}

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze([
    scenarioReceipt(RECEIPT_ID.ORDINARY, SCENARIO.ORDINARY, DETAIL.ORDINARY),
    scenarioReceipt(RECEIPT_ID.RECEIPT, SCENARIO.RECEIPT, DETAIL.RECEIPT),
    scenarioReceipt(RECEIPT_ID.ORACLE, SCENARIO.ORACLE, DETAIL.ORACLE),
    scenarioReceipt(RECEIPT_ID.UNRELATED, SCENARIO.UNRELATED, DETAIL.UNRELATED),
    scenarioReceipt(RECEIPT_ID.UNREFERENCED, SCENARIO.UNREFERENCED,
      DETAIL.UNREFERENCED),
    scenarioReceipt(RECEIPT_ID.DELETED, SCENARIO.DELETED, DETAIL.DELETED),
    scenarioReceipt(RECEIPT_ID.MODIFIED, SCENARIO.MODIFIED, DETAIL.MODIFIED),
    scenarioReceipt(RECEIPT_ID.PROSE, SCENARIO.PROSE, DETAIL.PROSE),
  ]),
});
