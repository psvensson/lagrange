/**
 * Guard tests for the merge workflow owner's cutover and dissolution
 * coordination: the durable epoch cutover fires only after BOTH sources
 * report catch-up readiness, the cutover mutation promotes the pending
 * partition version to active (collapsing the source ranges out of the
 * routable epoch), post-merge routing accepts only the merged target's
 * epoch, and source dissolution dispatches the reused replica-removal
 * teardown plus descriptor deletion only after both mirrors are removed.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
  MANAGED_MERGE_ERROR_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  MERGE_ACK_STATUS,
  buildMergeSourceParticipantKey,
} from '../../src/partition/merge-ack-constants.js';
import {
  buildPartitionDescriptorEpochDecision,
  isPartitionDescriptorEpochAccepted,
} from '../../src/partition/partition-descriptor-epoch-contract.js';
import {
  PARTICIPANT_ACK_FIELD,
} from '../../src/workflow/workflow-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
} from '../../src/rebalancer/replica-operation-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  createSQLQueryEngineTableRoutingMethods,
} from '../../src/query/sql-query-engine-table-routing-methods.js';
import {
  FIXTURE_LEFT_PARTITION_ID,
  FIXTURE_RIGHT_PARTITION_ID,
  FIXTURE_SIBLING_PARTITION_ID,
  buildMergeWorkflow,
  createRecordingCdcIntegrationService,
  createThreePartitionInfos,
} from './managed-merge-workflow-test-helpers.js';

// The factory returns property descriptors (mixin form).
const routingMethods = Object.defineProperties(
  {},
  createSQLQueryEngineTableRoutingMethods(),
);

/**
 * Production routing visibility predicate, exactly as the SQL query
 * engine applies it when resolving routable partitions for a table.
 * @param {Object} partitionRow
 * @param {number} activeVersion
 * @return {boolean}
 */
function isRoutable(partitionRow, activeVersion) {
  return routingMethods.isPartitionVisibleForRouting.call(
    {},
    partitionRow,
    activeVersion,
  );
}

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

function buildSourceAck(partitionId, status) {
  return {
    [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
      buildMergeSourceParticipantKey(partitionId),
    [PARTICIPANT_ACK_FIELD.STATUS]: status,
    [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 2000,
  };
}

async function startMergedFixture(t, options = {}) {
  const fixture = buildMergeWorkflow(options);
  const result = await fixture.workflow.execute({
    leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
    rightPartitionId: FIXTURE_RIGHT_PARTITION_ID,
  });
  t.equal(result.success, true);
  return {...fixture, result};
}

test('merge cutover - first catch-up ack alone does not cut over',
  async (t) => {
    const fixture = await startMergedFixture(t);
    const ackResult = await fixture.workflow
      .acknowledgeMergeSourceParticipant(
        fixture.result.workflowId,
        buildSourceAck(
          FIXTURE_LEFT_PARTITION_ID,
          MERGE_ACK_STATUS.CATCHUP_READY,
        ),
      );

    t.equal(ackResult.mergeCutoverApplied, false);
    t.equal(
      fixture.durableTableRow.partition_transition_state,
      PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
    );
    t.equal(fixture.durableTableRow.active_partition_version, 1);
  });

test('merge cutover - second catch-up ack applies the durable epoch ' +
    'cutover through MERGE_CATCHUP', async (t) => {
  const fixture = await startMergedFixture(t);
  await fixture.workflow.acknowledgeMergeSourceParticipant(
    fixture.result.workflowId,
    buildSourceAck(
      FIXTURE_LEFT_PARTITION_ID,
      MERGE_ACK_STATUS.CATCHUP_READY,
    ),
  );
  const secondAckResult = await fixture.workflow
    .acknowledgeMergeSourceParticipant(
      fixture.result.workflowId,
      buildSourceAck(
        FIXTURE_RIGHT_PARTITION_ID,
        MERGE_ACK_STATUS.CATCHUP_READY,
      ),
    );

  t.equal(secondAckResult.mergeCutoverApplied, true);

  const transitionStates = fixture.updateCalls
    .filter((call) => call.tableName === TABLES.TABLES)
    .map((call) => call.data.partition_transition_state);
  const catchupIndex = transitionStates.indexOf(
    PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
  );
  const cutoverIndex = transitionStates.indexOf(
    PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
  );
  t.ok(catchupIndex >= 0);
  t.ok(cutoverIndex > catchupIndex);

  // The cutover mutation itself promotes the epoch: active version = the
  // merge target version, pending cleared, partition count collapsed.
  const cutoverCall = fixture.updateCalls.find(
    (call) =>
      call.tableName === TABLES.TABLES &&
      call.data.partition_transition_state ===
        PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
  );
  t.equal(cutoverCall.data.active_partition_version, 2);
  t.equal(cutoverCall.data.pending_partition_version, null);
  t.equal(cutoverCall.data.partition_count, 1);
  t.equal(fixture.durableTableRow.active_partition_version, 2);
  const persistedMetadata = JSON.parse(
    fixture.durableTableRow.partition_transition_metadata,
  );
  t.ok(
    persistedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.CUTOVER_APPLIED_AT
    ],
  );
});

test('merge cutover - post-merge routing accepts only the merged ' +
    'target epoch', async (t) => {
  const fixture = await startMergedFixture(t);
  for (const partitionId of [
    FIXTURE_LEFT_PARTITION_ID,
    FIXTURE_RIGHT_PARTITION_ID,
  ]) {
    await fixture.workflow.acknowledgeMergeSourceParticipant(
      fixture.result.workflowId,
      buildSourceAck(partitionId, MERGE_ACK_STATUS.CATCHUP_READY),
    );
  }
  t.equal(fixture.durableTableRow.active_partition_version, 2);

  // Key lookups for BOTH retired ranges resolve to the merged target: the
  // merged descriptor covers [null, null) at the active epoch and is
  // accepted, while the retired source descriptors (old epoch) are stale
  // routes.
  const mergedDescriptor = {
    partition_id: fixture.result.targetPartitionId,
    partition_version: 2,
  };
  const mergedRouteDecision = buildPartitionDescriptorEpochDecision({
    tableDescriptor: fixture.durableTableRow,
    partitionDescriptor: mergedDescriptor,
    requirePartitionDescriptor: true,
  });
  t.equal(isPartitionDescriptorEpochAccepted(mergedRouteDecision), true);

  for (const retiredDescriptor of [
    {partition_id: FIXTURE_LEFT_PARTITION_ID, partition_version: 1},
    {partition_id: FIXTURE_RIGHT_PARTITION_ID, partition_version: 1},
  ]) {
    const staleRouteDecision = buildPartitionDescriptorEpochDecision({
      tableDescriptor: fixture.durableTableRow,
      partitionDescriptor: retiredDescriptor,
      requirePartitionDescriptor: true,
    });
    t.equal(
      isPartitionDescriptorEpochAccepted(staleRouteDecision),
      false,
    );
  }
});

test('merge dissolution - waits for both mirrors, then dispatches the ' +
    'reused replica teardown and deletes source descriptors', async (t) => {
  const fixture = await startMergedFixture(t);
  for (const partitionId of [
    FIXTURE_LEFT_PARTITION_ID,
    FIXTURE_RIGHT_PARTITION_ID,
  ]) {
    await fixture.workflow.acknowledgeMergeSourceParticipant(
      fixture.result.workflowId,
      buildSourceAck(partitionId, MERGE_ACK_STATUS.CATCHUP_READY),
    );
  }

  await fixture.workflow.acknowledgeMergeSourceParticipant(
    fixture.result.workflowId,
    buildSourceAck(
      FIXTURE_LEFT_PARTITION_ID,
      MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
    ),
  );
  t.equal(fixture.replicaRemovalCalls.length, 0);
  t.equal(fixture.deleteCalls.length, 0);

  await fixture.workflow.acknowledgeMergeSourceParticipant(
    fixture.result.workflowId,
    buildSourceAck(
      FIXTURE_RIGHT_PARTITION_ID,
      MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
    ),
  );

  // One REMOVE_REPLICA dispatch per authoritative source replica row.
  t.equal(fixture.replicaRemovalCalls.length, 2);
  for (const removalCall of fixture.replicaRemovalCalls) {
    t.equal(
      removalCall.message[ReplicaOperationField.TYPE],
      ReplicaOperationMessageType.REMOVE_REPLICA,
    );
  }
  t.same(
    fixture.replicaRemovalCalls
      .map((call) => call.message[ReplicaOperationField.PARTITION_ID])
      .sort(),
    [FIXTURE_LEFT_PARTITION_ID, FIXTURE_RIGHT_PARTITION_ID],
  );

  // Authoritative descriptor rows of both retired sources deleted.
  const deletedPartitionIds = fixture.deleteCalls
    .filter((call) => call.tableName === TABLES.PARTITIONS)
    .map((call) => call.whereClause.partition_id)
    .sort();
  t.same(deletedPartitionIds, [
    FIXTURE_LEFT_PARTITION_ID,
    FIXTURE_RIGHT_PARTITION_ID,
  ]);

  // Both sources durably acknowledged as dissolved: read the LAST tables
  // mutation that still carried transition metadata (the terminal clear
  // afterwards nulls the columns).
  const metadataUpdates = fixture.updateCalls.filter(
    (call) =>
      call.tableName === TABLES.TABLES &&
      call.data.partition_transition_metadata,
  );
  const persistedMetadata = JSON.parse(
    metadataUpdates[metadataUpdates.length - 1]
      .data.partition_transition_metadata,
  );
  const participants = persistedMetadata[
    PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS
  ];
  for (const partitionId of [
    FIXTURE_LEFT_PARTITION_ID,
    FIXTURE_RIGHT_PARTITION_ID,
  ]) {
    t.equal(
      participants[buildMergeSourceParticipantKey(partitionId)].status,
      MERGE_ACK_STATUS.SOURCE_DISSOLVED,
    );
  }

  // Terminal transition clear: the table is admissible again.
  t.equal(fixture.durableTableRow.partition_transition_state, null);
  t.equal(fixture.durableTableRow.partition_transition_metadata, null);
  t.equal(fixture.durableTableRow.pending_partition_version, null);
});

test('merge dissolution - failed replica removal records a dissolution ' +
    'failure, never a fake success', async (t) => {
  const fixture = await startMergedFixture(t, {
    deliverReplicaRemoval: async () => ({status: 'error', error: 'boom'}),
  });
  for (const partitionId of [
    FIXTURE_LEFT_PARTITION_ID,
    FIXTURE_RIGHT_PARTITION_ID,
  ]) {
    await fixture.workflow.acknowledgeMergeSourceParticipant(
      fixture.result.workflowId,
      buildSourceAck(partitionId, MERGE_ACK_STATUS.CATCHUP_READY),
    );
    await fixture.workflow.acknowledgeMergeSourceParticipant(
      fixture.result.workflowId,
      buildSourceAck(partitionId, MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED),
    );
  }

  const persistedMetadata = JSON.parse(
    fixture.durableTableRow.partition_transition_metadata,
  );
  const participants = persistedMetadata[
    PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS
  ];
  for (const partitionId of [
    FIXTURE_LEFT_PARTITION_ID,
    FIXTURE_RIGHT_PARTITION_ID,
  ]) {
    t.equal(
      participants[buildMergeSourceParticipantKey(partitionId)].status,
      MERGE_ACK_STATUS.DISSOLUTION_FAILED,
    );
  }
  t.equal(fixture.deleteCalls.length, 0);
});

test('merge cutover - acks recover the workflow from the durable ' +
    'transition row after owner memory is cleared', async (t) => {
  const fixture = await startMergedFixture(t);
  // execute() removes the in-memory workflow in its finally block; the
  // acks above already exercise recovery. Assert the durable row is the
  // recovery source: it carries the workflowId the acks used.
  const persistedMetadata = JSON.parse(
    fixture.durableTableRow.partition_transition_metadata,
  );
  t.equal(
    persistedMetadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID],
    fixture.result.workflowId,
  );
  const ackResult = await fixture.workflow
    .acknowledgeMergeSourceParticipant(
      fixture.result.workflowId,
      buildSourceAck(
        FIXTURE_LEFT_PARTITION_ID,
        MERGE_ACK_STATUS.SNAPSHOT_STARTED,
      ),
    );
  t.ok(ackResult);
  t.equal(ackResult.mergeCutoverApplied, false);
});

test('merge cutover - 3-partition table: the non-participating sibling ' +
    'is carried into the target epoch and stays routable (D1 guard)',
async (t) => {
  const fixture = await startMergedFixture(t, {
    partitionInfos: createThreePartitionInfos(),
  });
  for (const partitionId of [
    FIXTURE_LEFT_PARTITION_ID,
    FIXTURE_RIGHT_PARTITION_ID,
  ]) {
    await fixture.workflow.acknowledgeMergeSourceParticipant(
      fixture.result.workflowId,
      buildSourceAck(partitionId, MERGE_ACK_STATUS.CATCHUP_READY),
    );
  }

  const activeVersion =
    Number(fixture.durableTableRow.active_partition_version);
  t.equal(activeVersion, 2);

  // The sibling descriptor was promoted into the target epoch BEFORE the
  // epoch cutover applied.
  const siblingRow = fixture.partitionInfos[FIXTURE_SIBLING_PARTITION_ID];
  t.equal(siblingRow.partition_version, 2);

  // Production routing predicate: merged target AND sibling routable;
  // the retired sources are stale routes.
  const mergedRow = fixture.partitionInfos[fixture.result.targetPartitionId];
  t.equal(isRoutable(mergedRow, activeVersion), true);
  t.equal(isRoutable(siblingRow, activeVersion), true);
  t.equal(
    isRoutable(
      fixture.partitionInfos[FIXTURE_LEFT_PARTITION_ID], activeVersion,
    ),
    false,
  );
  t.equal(
    isRoutable(
      fixture.partitionInfos[FIXTURE_RIGHT_PARTITION_ID], activeVersion,
    ),
    false,
  );

  // The cutover mutation counts the merged target plus the carried
  // sibling as the new epoch's partition set.
  const cutoverCall = fixture.updateCalls.find(
    (call) =>
      call.tableName === TABLES.TABLES &&
      call.data.partition_transition_state ===
        PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
  );
  t.equal(cutoverCall.data.partition_count, 2);

  // The sibling set is durably recorded in the transition metadata.
  const persistedMetadata = JSON.parse(
    cutoverCall.data.partition_transition_metadata,
  );
  t.same(
    persistedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.SIBLING_PARTITION_IDS
    ],
    [FIXTURE_SIBLING_PARTITION_ID],
  );
});

test('merge abort - a pre-cutover source failure ack aborts fail-safe: ' +
    'sources stay authoritative, target torn down, no late cutover ' +
    '(D2 guard)', async (t) => {
  const fixture = await startMergedFixture(t, {
    // Give every partition (including the merged target) one replica row
    // so the aborted-target teardown dispatch is observable.
    listPartitionServiceRows: (partitionId) => [{
      partition_id: partitionId,
      replica_id: `${partitionId}-r1`,
      node_id: 'node-a',
    }],
  });

  // Source p1 reports a mirror failure BEFORE any cutover. The abort is
  // fire-and-forget on the FIFO owner lane; settle the lane before
  // asserting its durable effects.
  await fixture.workflow.acknowledgeMergeSourceParticipant(
    fixture.result.workflowId,
    buildSourceAck(
      FIXTURE_LEFT_PARTITION_ID,
      MERGE_ACK_STATUS.BACKFILL_FAILED,
    ),
  );
  await fixture.workflow.settleMergeOwnerLaneForWorkflow(
    fixture.result.workflowId,
  );

  // Abort persisted: FAILED transition, pending epoch withdrawn, active
  // epoch untouched -> the source partitions remain authoritative.
  t.equal(
    fixture.durableTableRow.partition_transition_state,
    PARTITION_TRANSITION_STATE.FAILED,
  );
  t.equal(fixture.durableTableRow.pending_partition_version, null);
  t.equal(fixture.durableTableRow.active_partition_version, 1);
  t.equal(
    isRoutable(fixture.partitionInfos[FIXTURE_LEFT_PARTITION_ID], 1),
    true,
  );
  t.equal(
    isRoutable(fixture.partitionInfos[FIXTURE_RIGHT_PARTITION_ID], 1),
    true,
  );

  // The provisioned target was torn down: descriptor deleted and its
  // replica removal dispatched.
  const deletedPartitionIds = fixture.deleteCalls
    .filter((call) => call.tableName === TABLES.PARTITIONS)
    .map((call) => call.whereClause.partition_id);
  t.same(deletedPartitionIds, [fixture.result.targetPartitionId]);
  t.same(
    fixture.replicaRemovalCalls.map(
      (call) => call.message[ReplicaOperationField.PARTITION_ID],
    ),
    [fixture.result.targetPartitionId],
  );

  // A late (stale) CATCHUP_READY from the healthy source must NOT cut
  // over the aborted merge.
  const lateAckResult = await fixture.workflow
    .acknowledgeMergeSourceParticipant(
      fixture.result.workflowId,
      buildSourceAck(
        FIXTURE_RIGHT_PARTITION_ID,
        MERGE_ACK_STATUS.CATCHUP_READY,
      ),
    );
  t.equal(lateAckResult.mergeCutoverApplied, false);
  t.equal(fixture.durableTableRow.active_partition_version, 1);
  t.equal(
    fixture.durableTableRow.partition_transition_state,
    PARTITION_TRANSITION_STATE.FAILED,
  );
  const cutoverWrites = fixture.updateCalls.filter(
    (call) =>
      call.tableName === TABLES.TABLES &&
      call.data.partition_transition_state ===
        PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
  );
  t.equal(cutoverWrites.length, 0);
});

test('merge terminal - after full completion the transition clears and a ' +
    'second merge on the table is admissible (D3 guard)', async (t) => {
  const fixture = await startMergedFixture(t);
  const ladder = [
    MERGE_ACK_STATUS.CATCHUP_READY,
    MERGE_ACK_STATUS.CUTOVER_APPLIED,
    MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
  ];
  for (const status of ladder) {
    for (const partitionId of [
      FIXTURE_LEFT_PARTITION_ID,
      FIXTURE_RIGHT_PARTITION_ID,
    ]) {
      await fixture.workflow.acknowledgeMergeSourceParticipant(
        fixture.result.workflowId,
        buildSourceAck(partitionId, status),
      );
    }
  }

  t.equal(fixture.durableTableRow.partition_transition_state, null);
  t.equal(fixture.durableTableRow.partition_transition_metadata, null);
  t.equal(fixture.durableTableRow.active_partition_version, 2);

  // The table's next epoch has fresh adjacent under-threshold partitions
  // (the natural post-merge shape after later splits); a second merge on
  // the SAME table must be admissible.
  const secondLeftId = 'users-p4';
  const secondRightId = 'users-p5';
  fixture.partitionInfos[secondLeftId] = {
    partition_id: secondLeftId,
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key_start: null,
    partition_key_end: 'm',
    partition_version: 2,
    replica_count: 2,
    leader_node_id: 'node-a',
    size_bytes: 64,
    state: 'NORMAL',
  };
  fixture.partitionInfos[secondRightId] = {
    partition_id: secondRightId,
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key_start: 'm',
    partition_key_end: null,
    partition_version: 2,
    replica_count: 2,
    leader_node_id: 'node-a',
    size_bytes: 64,
    state: 'NORMAL',
  };

  const secondResult = await fixture.workflow.execute({
    leftPartitionId: secondLeftId,
    rightPartitionId: secondRightId,
  });
  t.equal(secondResult.success, true);
  t.equal(secondResult.targetVersion, 3);
});

test('merge abort/cutover interleave - a failure ack delivered while the ' +
    'cutover step is in flight wins: FAILED persists, the epoch is never ' +
    'promoted onto the torn-down target, siblings stay routable (R1 guard)',
async (t) => {
  const partitionInfos = createThreePartitionInfos();
  const durableTableRow = {
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key: 'id',
    active_partition_version: 1,
    partition_count: 3,
    partition_transition_state: null,
    partition_transition_metadata: null,
  };
  const updateCalls = [];
  const insertCalls = [];
  const deleteCalls = [];
  const recordingCdc = createRecordingCdcIntegrationService({
    updateCalls, insertCalls, deleteCalls, durableTableRow, partitionInfos,
  });
  // Hold the durable write that carries the first cutover step
  // (partition_transition_state = merge_catchup) until released.
  let holdCatchupWrite = false;
  let releaseHeldWrite = null;
  const cdcIntegrationService = {
    ...recordingCdc,
    async updateSystemTableRow(tableName, whereClause, data, updateOptions) {
      if (holdCatchupWrite &&
          tableName === TABLES.TABLES &&
          data.partition_transition_state ===
            PARTITION_TRANSITION_STATE.MERGE_CATCHUP) {
        await new Promise((resolve) => {
          releaseHeldWrite = resolve;
        });
      }
      return recordingCdc.updateSystemTableRow(
        tableName, whereClause, data, updateOptions,
      );
    },
  };
  const fixture = buildMergeWorkflow({
    partitionInfos,
    durableTableRow,
    updateCalls,
    insertCalls,
    deleteCalls,
    cdcIntegrationService,
  });
  const result = await fixture.workflow.execute({
    leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
    rightPartitionId: FIXTURE_RIGHT_PARTITION_ID,
  });
  t.equal(result.success, true);

  // A catches up cleanly; B's catch-up ack begins the cutover, whose
  // MERGE_CATCHUP durable write is held in flight.
  await fixture.workflow.acknowledgeMergeSourceParticipant(
    result.workflowId,
    buildSourceAck(FIXTURE_LEFT_PARTITION_ID, MERGE_ACK_STATUS.CATCHUP_READY),
  );
  holdCatchupWrite = true;
  const cutoverAckPromise = fixture.workflow.acknowledgeMergeSourceParticipant(
    result.workflowId,
    buildSourceAck(
      FIXTURE_RIGHT_PARTITION_ID, MERGE_ACK_STATUS.CATCHUP_READY,
    ),
  );
  while (!releaseHeldWrite) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  holdCatchupWrite = false;

  // A fails while B's cutover write is in flight; the abort enqueues
  // behind it on the FIFO owner lane.
  await fixture.workflow.acknowledgeMergeSourceParticipant(
    result.workflowId,
    buildSourceAck(
      FIXTURE_LEFT_PARTITION_ID, MERGE_ACK_STATUS.BACKFILL_FAILED,
    ),
  );

  releaseHeldWrite();
  const cutoverAckResult = await cutoverAckPromise;
  await fixture.workflow.settleMergeOwnerLaneForWorkflow(result.workflowId);

  // FAILED wins; the cutover is refused; the epoch is never promoted.
  t.equal(cutoverAckResult.mergeCutoverApplied, false);
  t.equal(
    fixture.durableTableRow.partition_transition_state,
    PARTITION_TRANSITION_STATE.FAILED,
  );
  t.equal(fixture.durableTableRow.active_partition_version, 1);
  t.equal(fixture.durableTableRow.pending_partition_version, null);
  const cutoverWrites = updateCalls.filter(
    (call) =>
      call.tableName === TABLES.TABLES &&
      call.data.partition_transition_state ===
        PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
  );
  t.equal(cutoverWrites.length, 0);

  // The torn-down target stays deleted; no descriptor exists at any epoch
  // it could have been promoted onto.
  t.ok(deleteCalls.some(
    (call) => call.tableName === TABLES.PARTITIONS &&
      call.whereClause.partition_id === result.targetPartitionId,
  ));
  t.equal(fixture.partitionInfos[result.targetPartitionId], undefined);

  // Sources and the non-participating sibling remain authoritative and
  // routable at the untouched active epoch.
  for (const partitionId of [
    FIXTURE_LEFT_PARTITION_ID,
    FIXTURE_RIGHT_PARTITION_ID,
    FIXTURE_SIBLING_PARTITION_ID,
  ]) {
    t.equal(fixture.partitionInfos[partitionId].partition_version, 1);
    t.equal(isRoutable(fixture.partitionInfos[partitionId], 1), true);
  }
});

test('merge dissolution - a failed dissolution is re-attemptable: a ' +
    're-delivered mirror-removed ack retries it and reaches the terminal ' +
    'clear', async (t) => {
  let failRemovals = true;
  const replicaRemovalCalls = [];
  const fixture = await startMergedFixture(t, {
    replicaRemovalCalls,
    deliverReplicaRemoval: async (request) => {
      if (failRemovals) {
        return {status: 'error', error: 'hosting node unreachable'};
      }
      replicaRemovalCalls.push(request);
      return {status: 'initiated'};
    },
  });
  const ladder = [
    MERGE_ACK_STATUS.CATCHUP_READY,
    MERGE_ACK_STATUS.CUTOVER_APPLIED,
    MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
  ];
  for (const status of ladder) {
    for (const partitionId of [
      FIXTURE_LEFT_PARTITION_ID,
      FIXTURE_RIGHT_PARTITION_ID,
    ]) {
      await fixture.workflow.acknowledgeMergeSourceParticipant(
        fixture.result.workflowId,
        buildSourceAck(partitionId, status),
      );
    }
  }

  // Dissolution failed: data-safe, transition NOT cleared, no deletes.
  t.equal(
    fixture.durableTableRow.partition_transition_state,
    PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
  );
  t.equal(fixture.deleteCalls.length, 0);

  // The hosting nodes recover; ONE re-delivered mirror-removed ack
  // re-attempts dissolution for the still-undissolved sources.
  failRemovals = false;
  await fixture.workflow.acknowledgeMergeSourceParticipant(
    fixture.result.workflowId,
    buildSourceAck(
      FIXTURE_LEFT_PARTITION_ID,
      MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
    ),
  );

  t.equal(replicaRemovalCalls.length, 2);
  const deletedPartitionIds = fixture.deleteCalls
    .filter((call) => call.tableName === TABLES.PARTITIONS)
    .map((call) => call.whereClause.partition_id)
    .sort();
  t.same(deletedPartitionIds, [
    FIXTURE_LEFT_PARTITION_ID,
    FIXTURE_RIGHT_PARTITION_ID,
  ]);
  t.equal(fixture.durableTableRow.partition_transition_state, null);
  t.equal(fixture.durableTableRow.partition_transition_metadata, null);
});

test('merge abort - an abort racing a retry execute() still lands: the ' +
    'retry window is refused, durable FAILED persists (no wedge), and a ' +
    'settled retry is viable (R2 guard)', async (t) => {
  const fixture = await startMergedFixture(t);

  // Source failure: the abort is fire-and-forget on the FIFO owner lane.
  await fixture.workflow.acknowledgeMergeSourceParticipant(
    fixture.result.workflowId,
    buildSourceAck(
      FIXTURE_LEFT_PARTITION_ID,
      MERGE_ACK_STATUS.BACKFILL_FAILED,
    ),
  );

  // Immediate retry while the abort is in flight: the still-running
  // transition refuses it cleanly, and the retry's dedup-lane hold must
  // NOT swallow the queued abort step.
  await t.rejects(
    fixture.workflow.execute({
      leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
      rightPartitionId: FIXTURE_RIGHT_PARTITION_ID,
    }),
    new Error(MANAGED_MERGE_ERROR_MSG.ALREADY_IN_PROGRESS),
  );

  // The abort still lands: durable FAILED, pending withdrawn, target
  // torn down — never a merge_backfilling wedge.
  await fixture.workflow.settleMergeOwnerLaneForWorkflow(
    fixture.result.workflowId,
  );
  t.equal(
    fixture.durableTableRow.partition_transition_state,
    PARTITION_TRANSITION_STATE.FAILED,
  );
  t.equal(fixture.durableTableRow.pending_partition_version, null);
  t.equal(fixture.durableTableRow.active_partition_version, 1);
  t.ok(fixture.deleteCalls.some(
    (call) => call.tableName === TABLES.PARTITIONS &&
      call.whereClause.partition_id === fixture.result.targetPartitionId,
  ));

  // The aborted transition is retryable: a settled retry executes.
  const retryResult = await fixture.workflow.execute({
    leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
    rightPartitionId: FIXTURE_RIGHT_PARTITION_ID,
  });
  t.equal(retryResult.success, true);
  t.equal(retryResult.targetVersion, 2);
});

test('merge abort - concurrent failure acks from BOTH sources abort ' +
    'exactly once: one teardown, one descriptor delete', async (t) => {
  const fixture = await startMergedFixture(t, {
    listPartitionServiceRows: (partitionId) => [{
      partition_id: partitionId,
      replica_id: `${partitionId}-r1`,
      node_id: 'node-a',
    }],
  });

  await Promise.all([
    fixture.workflow.acknowledgeMergeSourceParticipant(
      fixture.result.workflowId,
      buildSourceAck(
        FIXTURE_LEFT_PARTITION_ID, MERGE_ACK_STATUS.BACKFILL_FAILED,
      ),
    ),
    fixture.workflow.acknowledgeMergeSourceParticipant(
      fixture.result.workflowId,
      buildSourceAck(
        FIXTURE_RIGHT_PARTITION_ID, MERGE_ACK_STATUS.BACKFILL_FAILED,
      ),
    ),
  ]);
  await fixture.workflow.settleMergeOwnerLaneForWorkflow(
    fixture.result.workflowId,
  );

  t.equal(
    fixture.durableTableRow.partition_transition_state,
    PARTITION_TRANSITION_STATE.FAILED,
  );
  const targetDeletes = fixture.deleteCalls.filter(
    (call) => call.tableName === TABLES.PARTITIONS &&
      call.whereClause.partition_id === fixture.result.targetPartitionId,
  );
  t.equal(targetDeletes.length, 1);
  const targetRemovals = fixture.replicaRemovalCalls.filter(
    (call) => call.message[ReplicaOperationField.PARTITION_ID] ===
      fixture.result.targetPartitionId,
  );
  t.equal(targetRemovals.length, 1);
});
