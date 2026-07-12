/**
 * Guard tests for ManagedMergeWorkflow admission gating and lifecycle
 * start: admission refusals (non-adjacent, over-threshold, already in
 * transition, critical partition, missing leadership), and the durable
 * lifecycle progression ADMISSION_PENDING -> MERGE_PREPARING ->
 * MERGE_BACKFILLING with target provisioning and per-source replication
 * start.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
  MANAGED_MERGE_ERROR_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  SPLIT_MERGE_ID,
} from '../../src/partition/partition-constants.js';
import {
  MERGE_ACK_STATUS,
  MERGE_PARTICIPANT_PREFIX,
} from '../../src/partition/merge-ack-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
} from '../../src/rebalancer/storage-admission-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  createAdmissionResult,
} from './managed-split-workflow-test-helpers.js';
import {
  FIXTURE_LEFT_PARTITION_ID,
  FIXTURE_RIGHT_PARTITION_ID,
  FIXTURE_TABLE_ID,
  FIXTURE_TABLE_NAME,
  buildMergeWorkflow,
  createDefaultPartitionInfos,
} from './managed-merge-workflow-test-helpers.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function buildMergeCandidate() {
  return {
    leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
    rightPartitionId: FIXTURE_RIGHT_PARTITION_ID,
  };
}

function findTransitionStates(updateCalls) {
  return updateCalls
    .filter((call) => call.tableName === TABLES.TABLES)
    .map((call) => call.data.partition_transition_state)
    .filter(Boolean);
}

test('managed merge - successful start runs the durable lifecycle in ' +
    'order and starts both source mirrors', async (t) => {
  const fixture = buildMergeWorkflow();
  const result = await fixture.workflow.execute(buildMergeCandidate());

  t.equal(result.success, true);
  t.same(result.sourcePartitionIds, [
    FIXTURE_LEFT_PARTITION_ID,
    FIXTURE_RIGHT_PARTITION_ID,
  ]);
  t.equal(result.targetVersion, 2);
  t.ok(result.targetPartitionId.startsWith(
    `${FIXTURE_TABLE_ID}${SPLIT_MERGE_ID.PARTITION_SEPARATOR}`,
  ));
  t.ok(result.targetPartitionId.endsWith(SPLIT_MERGE_ID.MERGED_SUFFIX));

  const transitionStates = findTransitionStates(fixture.updateCalls);
  const preparingIndex = transitionStates.indexOf(
    PARTITION_TRANSITION_STATE.MERGE_PREPARING,
  );
  const backfillingIndex = transitionStates.indexOf(
    PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
  );
  t.equal(transitionStates[0],
    PARTITION_TRANSITION_STATE.ADMISSION_PENDING);
  t.ok(preparingIndex > 0);
  t.ok(backfillingIndex > preparingIndex);

  // Merged descriptor collapses the two source ranges at the next epoch.
  const partitionInsert = fixture.insertCalls.find(
    (call) => call.tableName === TABLES.PARTITIONS,
  );
  t.ok(partitionInsert);
  t.equal(partitionInsert.row.partition_id, result.targetPartitionId);
  t.equal(partitionInsert.row.partition_key_start, null);
  t.equal(partitionInsert.row.partition_key_end, null);
  t.equal(partitionInsert.row.partition_version, 2);

  // Target raft group provisioned before source replication starts.
  t.equal(fixture.provisionCalls.length, 1);
  t.equal(
    fixture.provisionCalls[0].partitionId,
    result.targetPartitionId,
  );

  // Both sources received the merge replication start with fan-in
  // metadata pointing at the single merged target.
  t.equal(fixture.startMergeCalls.length, 2);
  t.same(
    fixture.startMergeCalls.map((call) => call.partitionId).sort(),
    [FIXTURE_LEFT_PARTITION_ID, FIXTURE_RIGHT_PARTITION_ID],
  );
  for (const startCall of fixture.startMergeCalls) {
    t.same(
      startCall.transitionMetadata[
        PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS
      ],
      [FIXTURE_LEFT_PARTITION_ID, FIXTURE_RIGHT_PARTITION_ID],
    );
    t.same(
      startCall.transitionMetadata[
        PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
      ],
      [result.targetPartitionId],
    );
  }

  // TARGET_PROVISIONED participant ack persisted durably.
  const persistedMetadata = JSON.parse(
    fixture.durableTableRow.partition_transition_metadata,
  );
  const participants = persistedMetadata[
    PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS
  ];
  t.equal(
    participants[MERGE_PARTICIPANT_PREFIX.MERGED_TARGET].status,
    MERGE_ACK_STATUS.TARGET_PROVISIONED,
  );
});

test('managed merge - refuses non-adjacent source partitions', async (t) => {
  const partitionInfos = createDefaultPartitionInfos();
  partitionInfos[FIXTURE_RIGHT_PARTITION_ID].partition_key_start = 'zzz';
  const fixture = buildMergeWorkflow({partitionInfos});

  await t.rejects(
    fixture.workflow.execute(buildMergeCandidate()),
    new Error(MANAGED_MERGE_ERROR_MSG.NOT_ADJACENT),
  );
  t.equal(fixture.startMergeCalls.length, 0);
});

test('managed merge - refuses identical or missing source ids', async (t) => {
  const fixture = buildMergeWorkflow();

  t.throws(
    () => fixture.workflow.execute({
      leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
      rightPartitionId: FIXTURE_LEFT_PARTITION_ID,
    }),
    new Error(MANAGED_MERGE_ERROR_MSG.SOURCE_PARTITIONS_REQUIRED),
  );
  t.throws(
    () => fixture.workflow.execute({
      leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
    }),
    new Error(MANAGED_MERGE_ERROR_MSG.SOURCE_PARTITIONS_REQUIRED),
  );
});

test('managed merge - refuses source partitions from different tables',
  async (t) => {
    const partitionInfos = createDefaultPartitionInfos();
    partitionInfos[FIXTURE_RIGHT_PARTITION_ID].table_id = 'tbl-other';
    const fixture = buildMergeWorkflow({partitionInfos});

    await t.rejects(
      fixture.workflow.execute(buildMergeCandidate()),
      new Error(MANAGED_MERGE_ERROR_MSG.TABLE_MISMATCH),
    );
  });

test('managed merge - refuses while another transition is in progress',
  async (t) => {
    const fixture = buildMergeWorkflow({
      parsePartitionTransition: () => ({
        state: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
        metadata: {},
      }),
    });

    await t.rejects(
      fixture.workflow.execute(buildMergeCandidate()),
      new Error(MANAGED_MERGE_ERROR_MSG.ALREADY_IN_PROGRESS),
    );
    t.equal(fixture.startMergeCalls.length, 0);
  });

test('managed merge - refuses when combined size exceeds the merge ' +
    'threshold', async (t) => {
  const fixture = buildMergeWorkflow({
    mergeStorageThresholdBytes: 100,
  });

  await t.rejects(
    fixture.workflow.execute(buildMergeCandidate()),
    new Error(MANAGED_MERGE_ERROR_MSG.OVER_THRESHOLD),
  );
  t.equal(fixture.updateCalls.length, 0);
});

test('managed merge - refuses critical system partitions', async (t) => {
  const fixture = buildMergeWorkflow({
    isCriticalSystemPartition: (partitionId) =>
      partitionId === FIXTURE_LEFT_PARTITION_ID,
  });

  await t.rejects(
    fixture.workflow.execute(buildMergeCandidate()),
    new Error(MANAGED_MERGE_ERROR_MSG.CRITICAL_PARTITION),
  );
});

test('managed merge - requires local leadership of the left source',
  async (t) => {
    const fixture = buildMergeWorkflow({
      isLocalManagedMergeLeader: () => false,
    });

    await t.rejects(
      fixture.workflow.execute(buildMergeCandidate()),
      new Error(MANAGED_MERGE_ERROR_MSG.LEADER_REQUIRED),
    );
  });

test('managed merge - denied capacity admission persists a retryable ' +
    'deferral instead of starting', async (t) => {
  const fixture = buildMergeWorkflow({
    storageAdmissionService: {
      async checkSplit() {
        return createAdmissionResult({
          allowed: false,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
          eligibleNodeIds: [],
          blockingReasons: ['capacity'],
        });
      },
    },
  });

  const result = await fixture.workflow.execute(buildMergeCandidate());
  t.equal(result.success, false);
  t.equal(result.state, PARTITION_TRANSITION_STATE.DEFERRED);
  t.ok(result.retry?.nextAttemptAt);
  t.equal(fixture.startMergeCalls.length, 0);
  t.equal(fixture.provisionCalls.length, 0);
  t.equal(
    fixture.durableTableRow.partition_transition_state,
    PARTITION_TRANSITION_STATE.DEFERRED,
  );
});

test('managed merge - candidate aliases {leftId, rightId} are accepted',
  async (t) => {
    const fixture = buildMergeWorkflow();
    const result = await fixture.workflow.execute({
      leftId: FIXTURE_LEFT_PARTITION_ID,
      rightId: FIXTURE_RIGHT_PARTITION_ID,
    });
    t.equal(result.success, true);
    t.equal(result.tableName, FIXTURE_TABLE_NAME);
  });
