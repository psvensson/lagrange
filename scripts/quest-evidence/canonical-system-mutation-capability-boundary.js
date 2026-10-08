#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'canonical-system-mutation-capability-boundary';
const TEST_FILE =
  'test/partition/canonical-system-mutation-capability-boundary.test.js';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: `solve/quests/${QUEST_ID}/evidence/receipt.json`,
  receipts: Object.freeze([Object.freeze({
    id: 'outer-partition-object-graph-has-no-raw-authority',
    testFile: TEST_FILE,
    command: `npm run test:file -- ${TEST_FILE} 1>&2`,
    detail: 'A real initialized production PartitionService must expose no raw ' +
      'DB, proposal, apply, queue, transport, CDC, or split-snapshot authority.',
  })]),
});
