/**
 * The in-memory workflow is a PROJECTION of the durable record (owner
 * decision 2026-10-05, option A): it may be dropped at any time without
 * affecting any write. Witness: one healthy split and one healthy merge, each
 * driven twice through their production entries (execute, which releases its
 * in-memory workflow in `finally`, then the source acknowledgements up to
 * the terminal clear) over the real SQLite store - once keeping the
 * projection, once DROPPING it before every step (every acknowledgement then
 * recovers the workflow from the durable row, the production
 * release-then-recover shape). The two durable write sequences are
 * identical, and both reach the terminal clear (the table is writable: no
 * transition left on its row).
 */
import {test} from '../../src/test-helpers/tap.js';
import {PARTICIPANT_ACK_FIELD} from
  '../../src/workflow/workflow-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {
  MERGE_ACK_STATUS,
  buildMergeSourceParticipantKey,
} from '../../src/partition/merge-ack-constants.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';
import {
  FIXTURE_LEFT_PARTITION_ID,
  FIXTURE_RIGHT_PARTITION_ID,
  buildMergeWorkflow,
  createDefaultPartitionInfos,
} from './managed-merge-workflow-test-helpers.js';
import {
  openRecordStore,
  openView,
  parsePartitionTransition,
  readAuthoritativelyFrom,
  turns,
} from './workflow-record-sqlite-world.js';

const QUIET = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const NO_TIMERS = Object.freeze({setTimeout: () => null, clearTimeout() {}});
const SOURCE = 'users-p1';

function members(workflow) {
  workflow.readCommittedGroupMembers = async () => ['r1', 'r2', 'r3'];
  workflow.listPartitionServiceRows = (partitionId) => ['r1', 'r2', 'r3']
    .map((replicaId) => ({partition_id: partitionId, replica_id: replicaId,
      node_id: `n-${replicaId}`}));
  workflow.deliverReplicaRemoval = async () => ({status: 'completed'});
}

function common(store, view, clock) {
  return {cdcIntegrationService: store.cdcFor('A'),
    getTableInfo: () => view.row(), listTableInfos: () => view.list(),
    getPartitionInfo: (id) => store.partitionRow(id), logger: QUIET,
    now: () => clock.now, listTablePartitionRows: () => store.partitionIds()
      .map((id) => store.partitionRow(id)),
    groupRetirementScheduler: NO_TIMERS,
    groupRetirementLeaseScheduler: NO_TIMERS};
}

const FAMILY = {
  split: {
    store: () => openRecordStore({partitions: [{partition_id: SOURCE},
      {partition_id: 'users-p3'}]}),
    build: (store, view, clock) => buildWorkflow({
      ...common(store, view, clock), parsePartitionTransition,
      topologyAdapter: null}).workflow,
    start: (workflow) => workflow.execute(SOURCE),
    acks: [SPLIT_ACK_STATUS.SNAPSHOT_STARTED, SPLIT_ACK_STATUS.CATCHUP_READY,
      SPLIT_ACK_STATUS.CUTOVER_APPLIED, SPLIT_ACK_STATUS.CLEANUP_COMPLETED]
      .map((status) => ({status,
        key: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION})),
    acknowledge: (workflow, workflowId, ack) =>
      workflow.acknowledgeSourceParticipant(workflowId, ack),
  },
  merge: {
    store: () => openRecordStore({partitions: Object.values(
      createDefaultPartitionInfos()).map((row) => ({...row}))}),
    build: (store, view, clock) => buildMergeWorkflow(
      common(store, view, clock)).workflow,
    start: (workflow) => workflow.execute({
      leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
      rightPartitionId: FIXTURE_RIGHT_PARTITION_ID}),
    acks: [MERGE_ACK_STATUS.SNAPSHOT_STARTED, MERGE_ACK_STATUS.CATCHUP_READY,
      MERGE_ACK_STATUS.CUTOVER_APPLIED, MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED]
      .flatMap((status) => [FIXTURE_LEFT_PARTITION_ID,
        FIXTURE_RIGHT_PARTITION_ID].map((id) => ({status,
        key: buildMergeSourceParticipantKey(id)}))),
    acknowledge: (workflow, workflowId, ack) =>
      workflow.acknowledgeMergeSourceParticipant(workflowId, ack),
  },
};

// One healthy lifecycle; `drop` drops the projection before every step.
async function lifecycle(family, drop) {
  const spec = FAMILY[family];
  const store = spec.store();
  const view = openView(store);
  const clock = {now: 1000};
  const workflow = spec.build(store, view, clock);
  workflow.workflowOwnerId = 'owner-A';
  readAuthoritativelyFrom(workflow, store);
  members(workflow);
  const result = await spec.start(workflow);
  const workflowId = result.workflowId;
  const fence = store.metadata().workflowFenceToken;
  // A merge mints its target id per run: compared as one placeholder.
  const minted = family === 'merge' ? store.metadata().targetPartitionIds :
    [];
  let dropped = 0;
  for (const {status, key} of spec.acks) {
    if (drop && workflow.workflowCoordinator.removeWorkflow(workflowId)) {
      dropped += 1;
    }
    await spec.acknowledge(workflow, workflowId, {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]: key,
      [PARTICIPANT_ACK_FIELD.STATUS]: status,
      [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fence,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: clock.now});
    await turns(50);
  }
  return {
    dropped,
    final: store.tablesRow(),
    writes: store.writes.filter((write) => write.changes > 0)
      .map((write) => minted.reduce((text, id) => text.split(id)
        .join('MINTED-TARGET'), JSON.stringify([write.sql, write.params]))),
  };
}

for (const family of Object.keys(FAMILY)) {
  test(`${family}: dropping the in-memory projection before every step ` +
    'changes no write', async (t) => {
    const kept = await lifecycle(family, false);
    const dropped = await lifecycle(family, true);
    t.ok(dropped.dropped >= 1, `setup: the projection was dropped ${
      dropped.dropped} times while it was held`);
    t.equal(kept.final.partition_transition_state, null,
      'kept: the split reached its terminal clear');
    t.equal(dropped.final.partition_transition_state, null,
      'dropped: it reached its terminal clear too (the table is writable)');
    t.equal(dropped.writes.length, kept.writes.length,
      `the same number of durable writes (${kept.writes.length})`);
    t.same(dropped.writes, kept.writes,
      'the identical durable write sequence, byte for byte');
  });
}
