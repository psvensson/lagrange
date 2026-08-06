// Deterministic evidence harness for the workflow-fencing-wiring quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'coordinator-claim-wiring',
    testFile: 'test/partition/workflow-fencing-wiring.test.js',
    detail: 'the split coordinator claims durable ownership through the ' +
      'existing claimDurableWorkflow machinery: claimWorkflow mints a ' +
      'fence epoch + owner identity, and the claim triple (fence, ' +
      'owner, lease expiry) is persisted into the tables transition ' +
      'row metadata so a recovering node observes who owns the ' +
      'workflow (no longer process-local)',
  }),
  Object.freeze({
    id: 'fenced-source-ack',
    testFile: 'test/partition/split-source-participant-ack.test.js',
    detail: 'PartitionService.emitSplitSourceAck stamps every source ' +
      'acknowledgement with the workflow fence token read from the ' +
      'normalized transition metadata; the owner advances the ' +
      'participant record to the acknowledged fence epoch',
  }),
  Object.freeze({
    id: 'stale-fence-ack-rejected',
    testFile: 'test/partition/workflow-fencing-wiring.test.js',
    detail: 'a source ack stamped with a superseded owner epoch is ' +
      'rejected with the typed STALE_FENCE outcome and never drives a ' +
      'cutover/abort reaction (fence validation is no longer opt-in)',
  }),
  Object.freeze({
    id: 'participant-transition-graph',
    testFile: 'test/partition/workflow-fencing-wiring.test.js',
    detail: 'an out-of-graph source ack transition is rejected with ' +
      'the typed INVALID_TRANSITION outcome and never mutates the ' +
      'participant status; the explicit graph is enforced by the ' +
      'coordinator via isParticipantTransitionAllowed',
  }),
]);

const QUEST_ID = 'workflow-fencing-wiring';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'workflow-fencing-wiring.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
