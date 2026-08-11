import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePriorityPartitionSummary,
} from '../../src/control-plane/priority-recovery-observation-normalization.js';
import {
  buildPriorityRecoveryBlockedPartitions,
} from '../../src/control-plane/priority-recovery-planning-intent.js';
import {
  normalizePriorityPartitionSummaryForDiagnostics,
} from '../distributed/harness/priority-recovery-summary-normalization.js';

const PARTITION_ID = 'replica_operations-p1';
const VALID_EXPECTED_REPLICA_COUNT = 3;
const READY_REPLICA_COUNT = 1;
const ROW_ABSENT_COUNT = 2;

function buildSummary(expectedReplicaCount) {
  return {
    satisfied: false,
    blockedPartitions: [{
      partitionId: PARTITION_ID,
      expectedReplicaCount,
      readyReplicaCount: READY_REPLICA_COUNT,
      readyDistinctNodeCount: 1,
      requiredDistinctNodeCount: 3,
      spreadGap: 2,
      exclusionReasonCounts: {row_absent: ROW_ABSENT_COUNT},
      reasons: ['priority_spread_gap'],
    }],
  };
}

function assertDiagnosticFields(partition) {
  assert.equal(
    partition.expectedReplicaCount,
    VALID_EXPECTED_REPLICA_COUNT,
  );
  assert.equal(partition.readyReplicaCount, READY_REPLICA_COUNT);
  assert.deepEqual(
    partition.exclusionReasonCounts,
    {row_absent: ROW_ABSENT_COUNT},
  );
}

function assertExpectedReplicaCountOmitted(partition) {
  assert.equal(Object.hasOwn(partition, 'expectedReplicaCount'), false);
}

test('census diagnostics survive observation, planning, and harness projections',
  () => {
    const observation = normalizePriorityPartitionSummary(
      buildSummary(VALID_EXPECTED_REPLICA_COUNT),
    );
    const planner = buildPriorityRecoveryBlockedPartitions(observation)[0];
    const harness = normalizePriorityPartitionSummaryForDiagnostics(
      observation,
    );

    assertDiagnosticFields(observation.blockedPartitions[0]);
    assertDiagnosticFields(planner);
    assertDiagnosticFields(harness.blockedPartitions[0]);
    assert.equal(planner.ready, false);
    assert.deepEqual(planner.reasons, ['priority_spread_gap']);
    assert.equal(harness.totalSpreadGap, 2);
  });

test('legacy and invalid expected counts are omitted without changing decisions',
  () => {
    const invalidExpectedReplicaCounts = [
      undefined,
      null,
      0,
      -1,
      1.5,
      Number.POSITIVE_INFINITY,
      '3',
      Number.MAX_SAFE_INTEGER + 1,
    ];

    for (const expectedReplicaCount of invalidExpectedReplicaCounts) {
      const observation = normalizePriorityPartitionSummary(
        buildSummary(expectedReplicaCount),
      );
      const planner = buildPriorityRecoveryBlockedPartitions(observation)[0];
      const harness = normalizePriorityPartitionSummaryForDiagnostics(
        observation,
      );

      assertExpectedReplicaCountOmitted(observation.blockedPartitions[0]);
      assertExpectedReplicaCountOmitted(planner);
      assertExpectedReplicaCountOmitted(harness.blockedPartitions[0]);
      assert.equal(planner.ready, false);
      assert.deepEqual(planner.reasons, ['priority_spread_gap']);
    }
  });

test('inherited and accessor-backed expected counts are never authoritative',
  () => {
    const inheritedPartition = buildSummary(null).blockedPartitions[0];
    delete inheritedPartition.expectedReplicaCount;
    Object.setPrototypeOf(inheritedPartition, {expectedReplicaCount: 3});

    let getterReads = 0;
    const accessorPartition = buildSummary(null).blockedPartitions[0];
    Object.defineProperty(accessorPartition, 'expectedReplicaCount', {
      enumerable: true,
      get() {
        getterReads += 1;
        return 3;
      },
    });

    for (const blockedPartition of [inheritedPartition, accessorPartition]) {
      const rawSummary = {
        satisfied: false,
        blockedPartitions: [blockedPartition],
      };
      const observation = normalizePriorityPartitionSummary(rawSummary);
      const planner = buildPriorityRecoveryBlockedPartitions(rawSummary)[0];
      const harness = normalizePriorityPartitionSummaryForDiagnostics(
        rawSummary,
      );

      assertExpectedReplicaCountOmitted(observation.blockedPartitions[0]);
      assertExpectedReplicaCountOmitted(planner);
      assertExpectedReplicaCountOmitted(harness.blockedPartitions[0]);
      assert.equal(planner.ready, false);
      assert.deepEqual(planner.reasons, ['priority_spread_gap']);
    }
    assert.equal(getterReads, 0);
  });
