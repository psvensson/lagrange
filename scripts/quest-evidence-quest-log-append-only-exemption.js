#!/usr/bin/env node
/**
 * Receipt harness for quest-log-append-only-exemption.
 *
 * The live-surface guards exempt a quest's log because it is immutable
 * history. That premise had no owner: a committed log could be rewritten and
 * nothing noticed. Each receipt runs one named witness scenario, so a green
 * receipt means that scenario exits zero and a red one means it does not.
 * The scenarios that matter most are the ones proving the invariant survives
 * a commit: a log created after the publication base and then rewritten in a
 * later commit of the same unpublished stack must still be refused.
 */

import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'quest-log-append-only-exemption';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const APPEND_ONLY_TEST = 'test/scripts/check-quest-log-append-only.test.js';
const EXEMPTION_TEST = 'test/scripts/historical-record-exemptions.test.js';
const STATIC_GATE_COMMAND =
  'node -e "const p=require(\'./package.json\');' +
  'process.exit(p.scripts[\'test:static\'].includes(\'audit:quest-log-append-only\')?0:1)"';
const PATH_JOINER = '/';

const RECEIPT_ID = Object.freeze({
  REWRITE: 'append-only-checker-refuses-an-in-place-rewrite',
  DELETION: 'append-only-checker-refuses-a-deleted-log',
  APPEND: 'append-only-checker-admits-an-append-and-a-new-log',
  STATIC_GATE: 'append-only-checker-runs-in-the-static-gate',
  EXEMPTION: 'exemption-is-the-canonical-quest-log-only',
  COMMITTED_REWRITE: 'append-only-checker-refuses-a-rewrite-committed-after-creation',
  RENAME: 'append-only-checker-refuses-a-renamed-log',
  APPEND_STACK: 'append-only-checker-admits-a-stack-of-append-commits',
});
const SCENARIO = Object.freeze({
  REWRITE: '^a rewritten committed log is refused$',
  DELETION: '^a deleted committed log is refused$',
  APPEND: '^appending and adding a log are admitted$',
  COMMITTED_REWRITE: '^a rewrite committed after creation is refused$',
  RENAME: '^a renamed log is refused as a deletion$',
  APPEND_STACK: '^a stack of append commits is admitted$',
});
const DETAIL = Object.freeze({
  REWRITE: 'editing a committed quest log in place is reported, so the ' +
    'guards\' historical-record exemption cannot become a writable channel',
  DELETION: 'quest history may not vanish',
  APPEND: 'the normal solver lifecycle only appends, so the invariant costs ' +
    'nothing in ordinary use',
  STATIC_GATE: 'test:static runs audit:quest-log-append-only, so the push ' +
    'gate enforces the invariant the exemption rests on',
  EXEMPTION: 'both guards exempt the canonical quest log and nothing else: ' +
    'not the authored record, not evidence, not a deleted v1 directory, and ' +
    'not live steering, scripts or docs that name the same strings',
  COMMITTED_REWRITE: 'the case a snapshot comparison cannot see: a log ' +
    'introduced after the publication base and rewritten in a later commit ' +
    'of the same unpublished stack is refused at that transition, even ' +
    'though the working tree then matches HEAD',
  RENAME: 'relocating a committed log is losing the committed path, and is ' +
    'refused as the deletion it is',
  APPEND_STACK: 'several append commits in one unpublished stack stay ' +
    'admitted, so the invariant does not obstruct ordinary landing',
});

function scenarioReceipt(id, testNamePattern, detail, testFile = APPEND_ONLY_TEST) {
  return Object.freeze({id, testFile, testNamePattern, detail});
}

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze([
    scenarioReceipt(RECEIPT_ID.REWRITE, SCENARIO.REWRITE, DETAIL.REWRITE),
    scenarioReceipt(RECEIPT_ID.DELETION, SCENARIO.DELETION, DETAIL.DELETION),
    scenarioReceipt(RECEIPT_ID.APPEND, SCENARIO.APPEND, DETAIL.APPEND),
    scenarioReceipt(RECEIPT_ID.COMMITTED_REWRITE, SCENARIO.COMMITTED_REWRITE,
      DETAIL.COMMITTED_REWRITE),
    scenarioReceipt(RECEIPT_ID.RENAME, SCENARIO.RENAME, DETAIL.RENAME),
    scenarioReceipt(RECEIPT_ID.APPEND_STACK, SCENARIO.APPEND_STACK,
      DETAIL.APPEND_STACK),
    Object.freeze({
      id: RECEIPT_ID.STATIC_GATE,
      command: STATIC_GATE_COMMAND,
      detail: DETAIL.STATIC_GATE,
    }),
    Object.freeze({
      id: RECEIPT_ID.EXEMPTION,
      testFile: EXEMPTION_TEST,
      detail: DETAIL.EXEMPTION,
    }),
  ]),
});
