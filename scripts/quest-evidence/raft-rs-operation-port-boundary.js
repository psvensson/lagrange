import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'raft-rs-operation-port-boundary';
const OUTPUT_FILE =
  'solve/quests/raft-rs-operation-port-boundary/evidence/receipt.json';
const BOUNDARY_TEST =
  'test/raft/raft-rs-backend/operation-port-boundary.test.js';
const LIFECYCLE_TEST =
  'test/raft/raft-rs-backend/operation-port-lifecycle.test.js';
const RECOVERY_TEST =
  'test/raft/raft-rs-backend/operation-port-ready-recovery.test.js';
const PROVENANCE_TEST =
  'test/raft/raft-rs-backend/operation-port-provenance.test.js';
const REGRESSION_TEST =
  'test/raft/raft-rs-backend/operation-port-regression.test.js';

const receipts = Object.freeze([
  ['partition-receives-frozen-operation-port-only', BOUNDARY_TEST,
    '^the partition receives only a frozen operation port and immutable snapshots$'],
  ['one-private-runtime-owner-controls-all-binding-entry', BOUNDARY_TEST,
    '^one private runtime owner is the only production binding importer$'],
  ['one-lifecycle-owner-controls-retirement-writes', BOUNDARY_TEST,
    '^retirement has one production writer and no provider control accessor$'],
  ['actual-core-entry-counter-catches-ungated-entry', LIFECYCLE_TEST,
    '^the core-entry instrument counts every binding call and catches an ungated mutant$'],
  ['retirement-is-terminal-before-core-entry-after-restart', LIFECYCLE_TEST,
    '^durable retirement refuses every active operation before core entry after restart$'],
  ['ready-host-failures-reconstruct-before-next-core-entry', RECOVERY_TEST,
    '^every Ready host failure reconstructs the group before another core operation$'],
  ['application-effects-and-applied-progress-are-atomic', RECOVERY_TEST,
    '^application effects and durable applied progress commit atomically$'],
  ['trap-and-temporary-unavailability-preserve-identity', RECOVERY_TEST,
    '^runtime traps and temporary host unavailability preserve logical identity$'],
  ['failure-origin-is-provenance-by-construction', PROVENANCE_TEST,
    '^core and host outcomes are separated by execution provenance$'],
  ['public-capability-inventory-decreases', BOUNDARY_TEST,
    '^the operation boundary removes public capability instead of renaming it$'],
  ['phases-one-through-five-remain-green-and-transport-stays-blocked',
    REGRESSION_TEST,
    '^the verified integration remains green while transport has no raft-rs node access$'],
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
