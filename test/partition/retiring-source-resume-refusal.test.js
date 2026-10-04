// A source partition whose group is ending never resumes its replication
// worker (owner decision 2026-10-04: a group retired by a durable cutover
// exits as a unit). Once the durable record shows the source participant
// finished mirroring (CLEANUP_COMPLETED / DISSOLUTION_FAILED /
// SOURCE_DISSOLVED for a split, SOURCE_MIRROR_REMOVED and after for a
// merge), the group's dissolution is under way: a survivor that becomes
// leader before its own REMOVE arrives must not re-run the snapshot,
// backfill and catch-up into children that are already authoritative - the
// orphaned-leader re-drive of formation run 3 (stale_fence, "Partition split
// transition metadata is required"). A source still mirroring resumes as
// before (the control).
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  MERGE_ACK_STATUS,
  buildMergeSourceParticipantKey,
} from '../../src/partition/merge-ack-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {restartOverCommittedCommands} from
  './partition-rs-raft-restart-fixture.js';

const PARTITION_ID = 'users-p1';
const FIELD = PARTITION_TRANSITION_METADATA_FIELD;

function transitionRow(state, metadata) {
  return {
    partition_transition_state: state,
    partition_transition_metadata: JSON.stringify({
      [FIELD.WORKFLOW_ID]: 'wf-1',
      [FIELD.WORKFLOW_FENCE_TOKEN]: 1,
      [FIELD.PRIMARY_KEY_COLUMN]: 'id',
      [FIELD.TARGET_PARTITION_VERSION]: 2,
      ...metadata,
    }),
  };
}

function resumeContext(row, base = {}) {
  const workerRuns = [];
  const context = Object.assign(base, {
    partitionId: PARTITION_ID,
    role: RAFT_ROLE.LEADER,
    splitReplication: null,
    mergeReplication: null,
    logger: {info() {}, warn() {}, error() {}, debug() {}},
    systemTableCache: {getAll: (table) => table === 'tables' ? [row] : []},
    runSplitReplicationWorkflow() {
      workerRuns.push('split');
      return Promise.resolve();
    },
    runMergeReplicationWorkflow() {
      workerRuns.push('merge');
      return Promise.resolve();
    },
  });
  return {context, workerRuns};
}

const splitRow = (status) => transitionRow(
  PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE, {
    [FIELD.SOURCE_PARTITION_ID]: PARTITION_ID,
    [FIELD.TARGET_PARTITION_IDS]: ['users-p1-a', 'users-p1-b'],
    [FIELD.PARTICIPANTS]: {
      [SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION]: {status}},
  });

for (const status of [
  SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
  SPLIT_ACK_STATUS.DISSOLUTION_FAILED,
  SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
]) {
  test(`a split source whose participant reads ${status} never resumes`,
    async () => {
      const proto = PartitionService.prototype;
      const {context, workerRuns} = resumeContext(splitRow(status), {
        normalizeSplitTransitionMetadata:
          proto.normalizeSplitTransitionMetadata,
      });
      const resumed = await proto.startOrResumeSplitReplicationFromDurable
        .call(context);
      assert.equal(resumed, false, 'no worker is resumed');
      assert.equal(context.splitReplication, null, 'nothing reconstructed');
      assert.deepEqual(workerRuns, [], 'the replication worker never runs');
    });
}

test('control: a split source still mirroring at the cutover resumes',
  async () => {
    const source = await restartOverCommittedCommands({
      partitionId: PARTITION_ID, tableId: 'users', tableName: 'users',
      schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
    }, []);
    try {
      const {context, workerRuns} = resumeContext(
        splitRow(SPLIT_ACK_STATUS.CUTOVER_APPLIED),
        Object.create(source.restarted));
      const resumed = await PartitionService.prototype
        .startOrResumeSplitReplicationFromDurable.call(context);
      assert.equal(resumed, true, 'the worker resumes');
      assert.deepEqual(workerRuns, ['split']);
    } finally {
      await source.dispose();
    }
  });

for (const status of [
  MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
  MERGE_ACK_STATUS.DISSOLUTION_FAILED,
]) {
  test(`a merge source whose participant reads ${status} never resumes`,
    async () => {
      const proto = PartitionService.prototype;
      const row = transitionRow(PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
        {
          [FIELD.SOURCE_PARTITION_IDS]: [PARTITION_ID, 'users-p2'],
          [FIELD.TARGET_PARTITION_IDS]: ['users-merged'],
          [FIELD.PARTICIPANTS]: {
            [buildMergeSourceParticipantKey(PARTITION_ID)]: {status}},
        });
      const {context, workerRuns} = resumeContext(row, {
        normalizeMergeTransitionMetadata:
          proto.normalizeMergeTransitionMetadata,
      });
      const resumed = await proto.startOrResumeMergeReplicationFromDurable
        .call(context);
      assert.equal(resumed, false, 'no worker is resumed');
      assert.equal(context.mergeReplication, null, 'nothing reconstructed');
      assert.deepEqual(workerRuns, [], 'the replication worker never runs');
    });
}
