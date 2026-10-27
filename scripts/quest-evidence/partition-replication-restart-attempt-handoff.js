#!/usr/bin/env node
import fs from 'node:fs';
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'partition-replication-restart-attempt-handoff';
const TEST_FILE =
  'test/partition/partition-replication-restart-attempt-handoff.test.js';
const RECEIPT_FILE =
  `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const RED_CONTROL_FILE =
  `solve/epics/raft-rs-full-cutover/quest-records/${QUEST_ID}/red-control.json`;
const SEALED_SOURCE_HEAD = '125bb12e761ef48e7f7b5387540e524a8c6c1c80';
const SEALED_HARNESS_SHA256 =
  'b769a5f241474223aafdf2822fbec4a92b9203ba1e3e9dc51ab7fb4627e6ab11';
const SEALED_RECEIPT_SHA256 =
  '6cbc7f04a5d8db7a779848860e298bc18bcc0c5ca32499254fe12bb10e3f740a';
const LOCAL_STR_FAIL = 'fail';
const RECEIPT_ID = 'restart-attempt-owner-contract';
const RECEIPT_DETAIL = 'the real split and merge worker paths prove durable ' +
  'START authorization, answer-loss continuation, stale-request inertness, ' +
  'crash recovery, transport handler processing, exact-redelivery ' +
  'single-flight, quiescent takeover, and both successor-family directions';

function preserveSealedRedControl() {
  if (!fs.existsSync(RECEIPT_FILE) || fs.existsSync(RED_CONTROL_FILE)) return;
  const receipt = JSON.parse(fs.readFileSync(RECEIPT_FILE, 'utf8'));
  if (receipt.status !== LOCAL_STR_FAIL) return;
  fs.writeFileSync(RED_CONTROL_FILE, `${JSON.stringify({...receipt,
    control: {
      sealedSourceHead: SEALED_SOURCE_HEAD,
      harnessSha256: SEALED_HARNESS_SHA256,
      receiptSha256: SEALED_RECEIPT_SHA256,
      witnessSha256: receipt.testFileDigests?.[TEST_FILE] || null,
    }}, null, 2)}\n`);
}

preserveSealedRedControl();

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: RECEIPT_FILE,
  receipts: Object.freeze([
    Object.freeze({
      id: RECEIPT_ID,
      testFile: TEST_FILE,
      command: `npm run test:file -- ${TEST_FILE} 1>&2`,
      detail: RECEIPT_DETAIL,
    }),
  ]),
});
