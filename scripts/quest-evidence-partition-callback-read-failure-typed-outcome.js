// Deterministic evidence harness for the
// partition-callback-read-failure-typed-outcome quest: receipt
// declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the probe artifact.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'failed-partition-reads-surface-typed-outcomes',
    testFile:
      'test/query/partition-callback-integration.test.js',
    detail: 'a partition_callback whose every partition read fails ' +
      'returns a non-success typed owner outcome (error + errorCode + ' +
      'typed failedPartitions entries carrying partitionId/error/' +
      'errorCode/participantNodeId/retryAfterMs/backpressured) with ' +
      'hostResult recording "3 partitions, 3 failed" instead of the ' +
      'pre-fix success:true/batches:[]/totalPartitions 0; a partial ' +
      'read failure stays a typed partial outcome (successful batches ' +
      'plus failedPartitions folded into hostResult counts and ' +
      'failedPartitionReads), so empty-because-failed is ' +
      'distinguishable from succeeded-with-zero-rows (ARCH-0139; ' +
      'red-on-revert: the pre-fix dispatcher filter converts total ' +
      'read failure to success:true and the assertions fail on ' +
      'success/totalPartitions)',
  }),
  Object.freeze({
    id: 'callback-reads-ride-routed-delivery-priority',
    testFile:
      'test/query/partition-callback-dispatcher.test.js',
    detail: 'PartitionCallbackDispatcher passes executionOptions ' +
      '{tableName, deliveryPriority: resolveRoutedDeliveryPriority(' +
      'tableName)} to executeOnPartition, so callback reads of system ' +
      'tables ride the same critical delivery lane and carry the same ' +
      'failedTable attribution as executeSelect (red-on-revert: the ' +
      'pre-fix call passes no executionOptions and the ' +
      'tableName/deliveryPriority assertions fail on undefined)',
  }),
]);

const QUEST_ID = 'partition-callback-read-failure-typed-outcome';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'partition-callback-read-failure-typed-outcome.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
