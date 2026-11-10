#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'priority-recovery-owner-read-snapshot-await';
const OUTPUT_FILE =
  `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const TEST_FILE_COMMAND = 'npm run test:file --';
const testCommand = (...files) => `${TEST_FILE_COMMAND} ${files.join(' ')}`;

const SETTLED_SNAPSHOT =
  'test/rebalancer/priority-recovery-owner-read-settled-snapshot.test.js';
const ALIAS_COLLAPSED =
  'test/rebalancer/priority-recovery-planning-best-effort-alias-collapsed.test.js';

const receipts = Object.freeze([
  Object.freeze({
    id: 'owner-read-deferral-reads-a-settled-snapshot',
    testFile: SETTLED_SNAPSHOT,
    command: testCommand(SETTLED_SNAPSHOT),
    detail: 'With the real readiness service, the repository owner read ' +
      'answers the settled planning answer; the sync pressure helper and the ' +
      'three async owner reads defer while it says priority recovery is ' +
      'active (ESTABLISHING) and not when it is PUBLISHED.',
  }),
  Object.freeze({
    id: 'best-effort-alias-family-collapsed',
    testFile: ALIAS_COLLAPSED,
    command: testCommand(ALIAS_COLLAPSED),
    detail: 'No planning BestEffort alias is defined or called under src/, ' +
      'and the readiness service carries only the one planning answer.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
