import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'raft-rs-single-path-partition-cutover';
const OUTPUT_FILE =
  'solve/quests/raft-rs-single-path-partition-cutover/evidence/receipt.json';
const CUTOVER_TEST =
  'test/raft/raft-rs-backend/single-path-partition-cutover.test.js';

const receipts = Object.freeze([
  ['seed-bootstraps-and-serves-a-write-on-rs-raft-by-default', CUTOVER_TEST,
    '^seed bootstraps and serves a write on rs-raft by default$'],
  ['omitted-selection-cannot-reach-the-legacy-backend', CUTOVER_TEST,
    '^omitted selection cannot reach the legacy backend$'],
  ['explicit-legacy-selection-is-a-typed-refusal', CUTOVER_TEST,
    '^explicit legacy selection is a typed refusal$'],
  ['the-write-path-has-one-durable-log', CUTOVER_TEST,
    '^the write path has one durable log$'],
  ['legacy-durable-consensus-state-fails-closed', CUTOVER_TEST,
    '^legacy durable consensus state fails closed$'],
  ['restart-serves-writes-from-the-rs-raft-store', CUTOVER_TEST,
    '^restart serves writes from the rs-raft store$'],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts: receipts.map(([id, testFile, testNamePattern]) => ({
    id,
    testFile,
    testNamePattern,
    detail: `Measured by ${testNamePattern}`,
  })),
});
